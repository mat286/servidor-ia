// rag/rag.js
import fs from "fs";
import path from "path";
import axios from "axios";
import pdf from "pdf-parse";

const OLLAMA_URL = "http://ollama:11434";

// ==============================
// 1. Leer archivos
// ==============================
function readTxt(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

async function readPdf(filePath) {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    return data.text;
}

// ==============================
// 2. Split en chunks
// ==============================
function splitText(text, chunkSize = 500) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}

// ==============================
// 3. Embeddings con Ollama
// ==============================
async function embed(text) {
    const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
        model: "nomic-embed-text",
        prompt: text
    });
    return res.data.embedding;
}

// ==============================
// 4. Similaridad coseno
// ==============================
function cosineSimilarity(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

// ==============================
// 5. Guardar / cargar RAG
// ==============================
function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadJSON(file) {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

// ==============================
// 6. Indexar documentos
// ==============================
export async function indexDocs(docsDir = "docs") {
    const chunks = [];
    const embeddings = [];

    const files = fs.readdirSync(docsDir);

    for (const file of files) {
        const fullPath = path.join(docsDir, file);
        let text = "";

        if (file.endsWith(".txt") || file.endsWith(".md")) {
            text = readTxt(fullPath);
        } else if (file.endsWith(".pdf")) {
            text = await readPdf(fullPath);
        } else {
            continue;
        }

        const parts = splitText(text);

        for (const part of parts) {
            chunks.push(part);
            embeddings.push(await embed(part));
        }
    }

    saveJSON("rag/chunks.json", chunks);
    saveJSON("rag/embeddings.json", embeddings);

    console.log(`RAG indexado: ${chunks.length} chunks`);
}

// ==============================
// 7. Buscar contexto relevante
// ==============================
export async function searchContext(query, topK = 3) {
    const chunks = loadJSON("rag/chunks.json");
    const embeddings = loadJSON("rag/embeddings.json");

    if (!chunks || !embeddings) {
        throw new Error("RAG no indexado");
    }

    const queryEmbedding = await embed(query);

    const scores = embeddings.map((emb, i) => ({
        text: chunks[i],
        score: cosineSimilarity(queryEmbedding, emb)
    }));

    return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(s => s.text);
}
