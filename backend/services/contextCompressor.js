/**
 * Context Compressor — Reduce tamaño de contexto RAG
 * Sumariza bloques largos para maximizar espacio útil del LLM
 */

import axios from "axios";

export class ContextCompressor {
    constructor(llmService, options = {}) {
        this.llmService = llmService;
        this.maxContextTokens = options.maxContextTokens || 1024;
        this.chunkSize = options.chunkSize || 400;  // Tokens por chunk
        this.enabled = options.enabled !== false;
    }

    /**
     * Estima tokens (aproximado: 1 token ~ 4 caracteres)
     */
    estimateTokens(text) {
        return Math.ceil(String(text || "").length / 4);
    }

    /**
     * Divide contexto en chunks
     */
    chunkContext(context) {
        const chunks = [];
        const lines = context.split("\n");
        let currentChunk = "";

        for (const line of lines) {
            const testChunk = currentChunk ? `${currentChunk}\n${line}` : line;
            if (this.estimateTokens(testChunk) > this.chunkSize && currentChunk) {
                chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk = testChunk;
            }
        }

        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    /**
     * Sumariza un chunk de contexto
     */
    async compressChunk(chunk, maxLength = 150) {
        if (!this.enabled || !this.llmService) {
            return chunk.slice(0, maxLength * 2);  // Fallback: truncate
        }

        try {
            const prompt = `Resume el siguiente texto en máximo ${maxLength} caracteres, manteniendo la información clave:\n\n"${chunk}"`;
            const summary = await this.llmService.generate(prompt, "Resume en pocas palabras");
            return summary.slice(0, maxLength * 2);
        } catch (err) {
            console.warn(`⚠️ Context compression failed: ${err.message}`);
            return chunk.slice(0, maxLength * 2);
        }
    }

    /**
     * Comprime contexto RAG completo
     */
    async compress(context) {
        if (!this.enabled) return context;

        const contextTokens = this.estimateTokens(context);
        if (contextTokens <= this.maxContextTokens) {
            return context;  // No necesita compresión
        }

        console.log(`📦 Compressing context: ${contextTokens} → ~${this.maxContextTokens} tokens`);

        const chunks = this.chunkContext(context);
        const compressed = [];

        for (const chunk of chunks) {
            const summary = await this.compressChunk(chunk);
            compressed.push(summary);
        }

        const result = compressed.join("\n---\n");
        const finalTokens = this.estimateTokens(result);
        console.log(`✅ Context compressed: ${contextTokens} → ${finalTokens} tokens`);

        return result;
    }
}

export default ContextCompressor;
