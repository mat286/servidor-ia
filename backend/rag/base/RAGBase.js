// RAG Base - Sistema de RAG con metadata y citas
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import axios from "axios";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import EmbeddingCache from "../../services/embeddingCache.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBEDDING_MODEL = process.env.MODELO_EMBEDDINGS || "nomic-embed-text";
const DEFAULT_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 700);
const DEFAULT_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 80);
const EMBEDDING_CACHE_MAX = Number(process.env.RAG_EMBEDDING_CACHE_MAX || 2000);
const EMBEDDING_CACHE_TTL_MS = Number(process.env.RAG_EMBEDDING_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
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
        this.embeddingCache = new EmbeddingCache(path.join(ragDir, "embedding_cache"));

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

    /**
     * Chunking sentence-aware: respeta límites de oraciones.
     * Evita cortar en medio de palabras o frases.
     */
    splitSentenceAware(text, metadata, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
        const normalized = String(text || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\t/g, " ")
            .trim();

        if (!normalized) return [];

        // Extraer oraciones respetando párrafos
        const sentences = [];
        const paragraphs = normalized.split(/\n{2,}/);

        for (const para of paragraphs) {
            const trimmed = para.trim();
            if (!trimmed) continue;

            // Dividir en oraciones en límites naturales (sin cortar abreviaciones comunes)
            const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ"'(0-9])/);
            for (const part of parts) {
                const s = part.replace(/\n/g, " ").trim();
                if (s.length >= 10) {
                    sentences.push(s);
                } else if (s.length > 0 && sentences.length > 0) {
                    sentences[sentences.length - 1] += " " + s;
                }
            }
        }

        // Si no hay oraciones detectadas, usar fallback char-based
        if (sentences.length === 0) {
            return this.splitCharBased(normalized, metadata, chunkSize, overlap);
        }

        // Agrupar oraciones en chunks respetando chunkSize
        const chunks = [];
        let chunkId = 0;
        let currentSentences = [];
        let currentLength = 0;

        const flushChunk = () => {
            const chunkText = currentSentences.join(" ").trim();
            if (chunkText.length >= 20) {
                chunks.push({
                    id: `${metadata.documentId}_chunk_${chunkId++}`,
                    text: chunkText,
                    document: metadata.documentName,
                    documentId: metadata.documentId,
                    page: metadata.page || null,
                    section: metadata.section || null,
                    timestamp: new Date().toISOString()
                });
            }
        };

        for (const sentence of sentences) {
            if (currentLength + sentence.length > chunkSize && currentSentences.length > 0) {
                flushChunk();

                // Overlap: llevar las últimas oraciones que quepan en el overlap
                let overlapChars = 0;
                const overlapSentences = [];
                for (let i = currentSentences.length - 1; i >= 0; i--) {
                    if (overlapChars + currentSentences[i].length <= overlap) {
                        overlapSentences.unshift(currentSentences[i]);
                        overlapChars += currentSentences[i].length;
                    } else {
                        break;
                    }
                }

                currentSentences = overlapSentences;
                currentLength = overlapChars;
            }

            currentSentences.push(sentence);
            currentLength += sentence.length;
        }

        if (currentSentences.length > 0) flushChunk();

        return chunks;
    }

    /**
     * Fallback para textos sin puntuación (tablas, listas densas, etc.)
     */
    splitCharBased(text, metadata, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
        const chunks = [];
        let chunkId = 0;
        for (let i = 0; i < text.length; i += chunkSize - overlap) {
            const chunkText = text.slice(i, Math.min(i + chunkSize, text.length)).trim();
            if (chunkText.length >= 20) {
                chunks.push({
                    id: `${metadata.documentId}_chunk_${chunkId++}`,
                    text: chunkText,
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

        // Buscar en cache (memoria + disco)
        const cachedEmbedding = this.embeddingCache.get(normalizedText);
        if (cachedEmbedding) return cachedEmbedding;

        try {
            const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
                model: EMBEDDING_MODEL,
                prompt: normalizedText
            });

            const embedding = res.data.embedding;
            // Guardar en cache (memoria + disco async)
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

    // ────────────────────────────────────────────────
    // INDEXING INCREMENTAL
    // ────────────────────────────────────────────────

    computeFileHash(filePath) {
        const buffer = fs.readFileSync(filePath);
        return createHash("sha256").update(buffer).digest("hex");
    }

    loadManifest() {
        const manifestFile = path.join(this.ragDir, "manifest.json");
        if (!fs.existsSync(manifestFile)) return { files: {} };
        try {
            return JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        } catch {
            return { files: {} };
        }
    }

    saveManifest(manifest) {
        const manifestFile = path.join(this.ragDir, "manifest.json");
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    }

    _writeAtomic(chunks, embeddings) {
        const tmpChunks = this.chunksFile + ".tmp";
        const tmpEmbeddings = this.embeddingsFile + ".tmp";
        fs.writeFileSync(tmpChunks, JSON.stringify(chunks, null, 2));
        fs.writeFileSync(tmpEmbeddings, JSON.stringify(embeddings, null, 2));
        fs.renameSync(tmpChunks, this.chunksFile);
        fs.renameSync(tmpEmbeddings, this.embeddingsFile);
    }

    async indexDocs(docsDir) {
        if (!fs.existsSync(docsDir)) {
            fs.mkdirSync(docsDir, { recursive: true });
            return { chunks: 0, message: "Directorio vacío" };
        }

        const SUPPORTED = new Set([".txt", ".md", ".pdf", ".docx", ".doc"]);
        const allFiles = fs.readdirSync(docsDir)
            .filter(f => fs.statSync(path.join(docsDir, f)).isFile())
            .filter(f => SUPPORTED.has(path.extname(f).toLowerCase()));

        if (allFiles.length === 0) {
            this.cachedChunks = [];
            this.cachedEmbeddings = [];
            this._writeAtomic([], []);
            this.saveManifest({ files: {} });
            return { chunks: 0, documents: 0, domain: this.domainName, message: "No hay documentos para indexar" };
        }

        // Calcular hashes de archivos actuales
        const currentHashes = {};
        for (const file of allFiles) {
            currentHashes[file] = this.computeFileHash(path.join(docsDir, file));
        }

        const manifest = this.loadManifest();
        const existingChunks = this.loadChunks() || [];
        const existingEmbeddings = this.loadEmbeddings() || [];

        // Detectar archivos nuevos o modificados
        const filesToProcess = allFiles.filter(f => manifest.files[f] !== currentHashes[f]);
        const filesUnchanged = allFiles.filter(f => manifest.files[f] === currentHashes[f]);

        // Detectar documentIds eliminados o modificados (para limpiar chunks viejos)
        const deletedOrChangedIds = new Set([
            ...Object.keys(manifest.files)
                .filter(f => !currentHashes[f])
                .map(f => path.basename(f, path.extname(f))),
            ...filesToProcess.map(f => path.basename(f, path.extname(f)))
        ]);

        // Short-circuit: nada cambió
        if (filesToProcess.length === 0 && deletedOrChangedIds.size === 0) {
            console.log(`✅ RAG [${this.domainName}] sin cambios. ${existingChunks.length} chunks.`);
            this.cachedChunks = existingChunks;
            this.cachedEmbeddings = existingEmbeddings;
            return {
                chunks: existingChunks.length,
                documents: allFiles.length,
                reindexed: 0,
                cached: filesUnchanged.length,
                domain: this.domainName
            };
        }

        // Filtrar chunks/embeddings de docs eliminados o modificados
        const keepIndices = existingChunks
            .map((c, i) => (deletedOrChangedIds.has(c.documentId) ? -1 : i))
            .filter(i => i !== -1);

        const baseChunks = keepIndices.map(i => existingChunks[i]);
        const baseEmbeddings = keepIndices.map(i => existingEmbeddings[i]);

        // Procesar archivos nuevos o modificados
        const newChunks = [...baseChunks];
        const newEmbeddings = [...baseEmbeddings];

        for (const file of filesToProcess) {
            const fullPath = path.join(docsDir, file);
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
                }

                if (!String(text || "").trim()) {
                    console.warn(`Sin texto utilizable: ${file}`);
                    continue;
                }

                if (pageInfo && pageInfo.length > 0) {
                    for (const page of pageInfo) {
                        const pageChunks = this.splitSentenceAware(page.text, {
                            documentId, documentName, page: page.page
                        });
                        for (const chunk of pageChunks) {
                            newChunks.push(chunk);
                            newEmbeddings.push(await this.embed(chunk.text));
                        }
                    }
                } else {
                    const docChunks = this.splitSentenceAware(text, {
                        documentId, documentName, page: null
                    });
                    for (const chunk of docChunks) {
                        newChunks.push(chunk);
                        newEmbeddings.push(await this.embed(chunk.text));
                    }
                }

                console.log(`✓ Indexado: ${file}`);
            } catch (error) {
                console.error(`Error procesando ${file}: ${error.message}`);
            }
        }

        this._writeAtomic(newChunks, newEmbeddings);
        this.saveManifest({ files: currentHashes });
        this.cachedChunks = newChunks;
        this.cachedEmbeddings = newEmbeddings;

        console.log(`\n✅ RAG [${this.domainName}]: ${newChunks.length} chunks (${filesToProcess.length} reindexados, ${filesUnchanged.length} sin cambios)`);

        return {
            chunks: newChunks.length,
            documents: allFiles.length,
            reindexed: filesToProcess.length,
            cached: filesUnchanged.length,
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

            // Score híbrido mejorado: balance entre vector y keyword
            // vectorScore: [0, 1] → peso 0.7
            // keywordScore: [0, 1] → peso 0.3
            const hybridScore = (vectorScore * 0.7) + (keywordScore * 0.3);

            return {
                chunk,
                score: hybridScore,
                vectorScore,
                keywordScore
            };
        });

        // Filtrar y ordenar: requiere vector score > 0.05 O keyword score > 0 para incluir
        const topResults = scores
            .filter(item => item.vectorScore > 0.05 || item.keywordScore > 0.1)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

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
        if (!fs.existsSync(this.chunksFile) || !fs.existsSync(this.embeddingsFile)) {
            return false;
        }
        try {
            const chunks = JSON.parse(fs.readFileSync(this.chunksFile, "utf8"));
            return Array.isArray(chunks) && chunks.length > 0;
        } catch {
            return false;
        }
    }
}
