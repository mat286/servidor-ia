/**
 * Embedding Cache — Evita re-embeddings de documentos
 * Almacena embeddings en memoria + disco para reusar entre reinicios
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";

export class EmbeddingCache {
    constructor(cacheDir = "rag/cache") {
        this.cacheDir = cacheDir;
        this.memory = new Map();
        this.initializeDirectory();
    }

    initializeDirectory() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Genera hash SHA-256 del texto
     */
    computeHash(text) {
        return createHash("sha256").update(String(text || "")).digest("hex");
    }

    /**
     * Obtiene un embedding del cache (memoria primero, luego disco)
     */
    get(text) {
        const hash = this.computeHash(text);

        // Buscar en memoria
        if (this.memory.has(hash)) {
            return this.memory.get(hash);
        }

        // Buscar en disco
        const diskPath = path.join(this.cacheDir, `${hash}.json`);
        if (fs.existsSync(diskPath)) {
            try {
                const cached = JSON.parse(fs.readFileSync(diskPath, "utf8"));
                this.memory.set(hash, cached);
                return cached;
            } catch (err) {
                console.warn(`⚠️ Embedding cache corrupted: ${diskPath}`);
                return null;
            }
        }

        return null;
    }

    /**
     * Guarda un embedding en cache (memoria + disco)
     */
    set(text, embedding) {
        const hash = this.computeHash(text);

        // Guardar en memoria
        this.memory.set(hash, embedding);

        // Guardar en disco (async, no blocking)
        const diskPath = path.join(this.cacheDir, `${hash}.json`);
        fs.writeFile(diskPath, JSON.stringify(embedding), (err) => {
            if (err) console.warn(`⚠️ Failed to write embedding cache: ${err.message}`);
        });

        return embedding;
    }

    /**
     * Limpia cache de memoria (guardar espacio)
     */
    clearMemory() {
        const sizeBefore = this.memory.size;
        this.memory.clear();
        console.log(`🧹 Cleared ${sizeBefore} embeddings from memory cache`);
    }

    /**
     * Obtiene stats del cache
     */
    getStats() {
        const diskCount = fs.readdirSync(this.cacheDir).filter(f => f.endsWith(".json")).length;
        return {
            memoryCount: this.memory.size,
            diskCount,
            totalCount: diskCount,
            cacheDir: this.cacheDir
        };
    }

    /**
     * Limpia todo el cache (disco)
     */
    clear() {
        this.memory.clear();
        try {
            const files = fs.readdirSync(this.cacheDir);
            for (const file of files) {
                if (file.endsWith(".json")) {
                    fs.unlinkSync(path.join(this.cacheDir, file));
                }
            }
            console.log("🧹 Embedding cache cleared completely");
        } catch (err) {
            console.warn(`⚠️ Failed to clear embedding cache: ${err.message}`);
        }
    }
}

export default EmbeddingCache;
