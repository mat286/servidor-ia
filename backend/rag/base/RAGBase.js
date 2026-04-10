// RAG Base - Sistema de RAG con metadata y citas
import fs from "fs";
import path from "path";
import axios from "axios";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBEDDING_MODEL = process.env.MODELO_EMBEDDINGS || "nomic-embed-text";
const DEFAULT_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 700);
const DEFAULT_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 80);
const wordExtractor = new WordExtractor();

/**
 * Clase base para RAG con metadata completa
 * Cada instancia maneja un dominio específico de documentos
 */
export class RAGBase {
    constructor(domainName, ragDir) {
        this.domainName = domainName;
        this.ragDir = ragDir;
        this.chunksFile = path.join(ragDir, "chunks.json");
        this.embeddingsFile = path.join(ragDir, "embeddings.json");
        this.cachedChunks = null;
        this.cachedEmbeddings = null;
        this.embeddingCache = new Map();

        if (!fs.existsSync(ragDir)) {
            fs.mkdirSync(ragDir, { recursive: true });
        }
    }

    readTxt(filePath) {
        return fs.readFileSync(filePath, "utf8");
    }

    async readPdf(filePath) {
        const buffer = fs.readFileSync(filePath);
        const data = await pdf(buffer);

        const pages = [];
        const textByPage = data.text.split(/\f/);

        for (let i = 0; i < textByPage.length; i++) {
            if (textByPage[i].trim()) {
                pages.push({
                    page: i + 1,
                    text: textByPage[i].trim()
                });
            }
        }

        return {
            text: data.text,
            pages,
            totalPages: data.numpages
        };
    }

    async readDocx(filePath) {
        const result = await mammoth.extractRawText({ path: filePath });
        return String(result.value || "").trim();
    }

    async readDoc(filePath) {
        const extracted = await wordExtractor.extract(filePath);
        return String(extracted?.getBody?.() || "").trim();
    }

    splitTextWithMetadata(text, metadata, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
        const chunks = [];
        let chunkId = 0;

        for (let i = 0; i < text.length; i += chunkSize - overlap) {
            const chunkText = text.slice(i, Math.min(i + chunkSize, text.length));

            if (chunkText.trim()) {
                chunks.push({
                    id: `${metadata.documentId}_chunk_${chunkId++}`,
                    text: chunkText.trim(),
                    document: metadata.documentName,
                    documentId: metadata.documentId,
                    page: metadata.page || null,
                    section: metadata.section || null,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return chunks;
    }

    async embed(text) {
        const normalizedText = text?.trim();
        if (!normalizedText) {
            return [];
        }

        if (this.embeddingCache.has(normalizedText)) {
            return this.embeddingCache.get(normalizedText);
        }

        try {
            const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
                model: EMBEDDING_MODEL,
                prompt: normalizedText
            });

            const embedding = res.data.embedding;
            this.embeddingCache.set(normalizedText, embedding);
            return embedding;
        } catch (error) {
            console.error(`Error generando embedding: ${error.message}`);
            throw error;
        }
    }

    cosineSimilarity(a, b) {
        if (a.length !== b.length) return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }

    normalizeText(text = "") {
        return String(text)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    extractKeywords(text = "") {
        const stopWords = new Set([
            "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "para", "con", "por",
            "que", "del", "como", "sobre", "segun", "desde", "hasta", "entre", "sin", "sus", "the"
        ]);

        return [...new Set(
            this.normalizeText(text)
                .split(/[^a-z0-9]+/)
                .filter(token => token.length > 2 && !stopWords.has(token))
        )];
    }

    calculateKeywordOverlap(query, chunkText) {
        const queryTerms = this.extractKeywords(query);
        if (queryTerms.length === 0) {
            return 0;
        }

        const normalizedChunk = this.normalizeText(chunkText);
        const matches = queryTerms.filter(term => normalizedChunk.includes(term)).length;
        return matches / queryTerms.length;
    }

    async indexDocs(docsDir) {
        if (!fs.existsSync(docsDir)) {
            console.warn(`Directorio ${docsDir} no existe. Creando...`);
            fs.mkdirSync(docsDir, { recursive: true });
            return { chunks: 0, message: "Directorio vacío" };
        }

        const chunks = [];
        const embeddings = [];
        const files = fs.readdirSync(docsDir);

        if (files.length === 0) {
            console.warn(`No hay archivos en ${docsDir}`);
            this.cachedChunks = [];
            this.cachedEmbeddings = [];
            fs.writeFileSync(this.chunksFile, JSON.stringify([], null, 2));
            fs.writeFileSync(this.embeddingsFile, JSON.stringify([], null, 2));
            return { chunks: 0, documents: 0, domain: this.domainName, message: "No hay documentos para indexar" };
        }

        for (const file of files) {
            const fullPath = path.join(docsDir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) continue;

            const ext = path.extname(file).toLowerCase();
            const documentId = path.basename(file, ext);
            const documentName = file;

            let text = "";
            let pageInfo = null;

            try {
                if (ext === ".txt" || ext === ".md") {
                    text = this.readTxt(fullPath);
                } else if (ext === ".pdf") {
                    const pdfData = await this.readPdf(fullPath);
                    text = pdfData.text;
                    pageInfo = pdfData.pages;
                } else if (ext === ".docx") {
                    text = await this.readDocx(fullPath);
                } else if (ext === ".doc") {
                    text = await this.readDoc(fullPath);
                } else {
                    console.warn(`Formato no soportado: ${file}`);
                    continue;
                }

                if (!String(text || "").trim()) {
                    console.warn(`Sin texto utilizable para indexar: ${file}`);
                    continue;
                }

                if (pageInfo && pageInfo.length > 0) {
                    for (const page of pageInfo) {
                        const pageChunks = this.splitTextWithMetadata(page.text, {
                            documentId,
                            documentName,
                            page: page.page
                        });

                        for (const chunk of pageChunks) {
                            chunks.push(chunk);
                            embeddings.push(await this.embed(chunk.text));
                        }
                    }
                } else {
                    const docChunks = this.splitTextWithMetadata(text, {
                        documentId,
                        documentName,
                        page: null
                    });

                    for (const chunk of docChunks) {
                        chunks.push(chunk);
                        embeddings.push(await this.embed(chunk.text));
                    }
                }

                console.log(`✓ Indexado: ${file} (${chunks.length} chunks totales)`);
            } catch (error) {
                console.error(`Error procesando ${file}: ${error.message}`);
            }
        }

        fs.writeFileSync(this.chunksFile, JSON.stringify(chunks, null, 2));
        fs.writeFileSync(this.embeddingsFile, JSON.stringify(embeddings, null, 2));

        this.cachedChunks = chunks;
        this.cachedEmbeddings = embeddings;

        console.log(`\n✅ RAG [${this.domainName}] indexado: ${chunks.length} chunks`);

        return {
            chunks: chunks.length,
            documents: files.length,
            domain: this.domainName
        };
    }

    async searchContext(query, topK = 5) {
        const chunks = this.loadChunks();
        const embeddings = this.loadEmbeddings();

        if (!chunks || chunks.length === 0) {
            return {
                chunks: [],
                message: "No hay documentos indexados en este dominio"
            };
        }

        if (chunks.length !== embeddings.length) {
            throw new Error("Chunks y embeddings no están alineados");
        }

        const queryEmbedding = await this.embed(query);

        const scores = chunks.map((chunk, i) => {
            const vectorScore = this.cosineSimilarity(queryEmbedding, embeddings[i]);
            const keywordScore = this.calculateKeywordOverlap(
                query,
                `${chunk.text || ""} ${chunk.document || ""} ${chunk.section || ""}`
            );

            return {
                chunk,
                score: vectorScore + (keywordScore * 0.2),
                vectorScore,
                keywordScore
            };
        });

        const topResults = scores
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .filter(item => item.vectorScore > 0.08 || item.keywordScore > 0);

        return {
            chunks: topResults.map(item => item.chunk),
            scores: topResults.map(item => item.score),
            query
        };
    }

    loadChunks() {
        if (this.cachedChunks) return this.cachedChunks;
        if (!fs.existsSync(this.chunksFile)) return null;
        this.cachedChunks = JSON.parse(fs.readFileSync(this.chunksFile, "utf8"));
        return this.cachedChunks;
    }

    loadEmbeddings() {
        if (this.cachedEmbeddings) return this.cachedEmbeddings;
        if (!fs.existsSync(this.embeddingsFile)) return null;
        this.cachedEmbeddings = JSON.parse(fs.readFileSync(this.embeddingsFile, "utf8"));
        return this.cachedEmbeddings;
    }

    isIndexed() {
        return fs.existsSync(this.chunksFile) && fs.existsSync(this.embeddingsFile);
    }
}
