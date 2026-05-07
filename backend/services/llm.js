// Servicio LLM centralizado con Ollama
import axios from "axios";
import CircuitBreaker from "./circuitBreaker.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.MODELO_TEXTO || "qwen2.5:3b";
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "15m";
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 2048);
const OLLAMA_NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT || 512);
const OLLAMA_TEMPERATURE = Number(process.env.OLLAMA_TEMPERATURE || 0.2);
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 180000);
const OLLAMA_MAX_RETRIES = Number(process.env.OLLAMA_MAX_RETRIES || 2);

/**
 * Servicio para interactuar con Ollama con Circuit Breaker
 */
export class LLMService {
    constructor(model = DEFAULT_MODEL, options = {}) {
        this.model = model;
        this.numCtx = options.numCtx || OLLAMA_NUM_CTX;
        this.numPredict = options.numPredict || OLLAMA_NUM_PREDICT;
        this.temperature = options.temperature !== undefined ? options.temperature : OLLAMA_TEMPERATURE;
        const timeoutMs = options.timeout !== undefined ? options.timeout : OLLAMA_TIMEOUT_MS;
        this.http = axios.create({
            baseURL: OLLAMA_URL,
            timeout: timeoutMs
        });
        this.circuitBreaker = new CircuitBreaker({
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 30000
        });
    }

    isRetryableError(error) {
        const code = error?.code;
        return code === "ECONNABORTED" || code === "ECONNRESET" || code === "ETIMEDOUT";
    }

    async postGenerate(payload, config = {}) {
        return this.circuitBreaker.execute(async () => {
            let lastError = null;

            for (let attempt = 0; attempt <= OLLAMA_MAX_RETRIES; attempt++) {
                try {
                    return await this.http.post("/api/generate", payload, config);
                } catch (error) {
                    lastError = error;
                    if (!this.isRetryableError(error) || attempt === OLLAMA_MAX_RETRIES) {
                        break;
                    }
                }
            }

            throw lastError;
        });
    }

    buildContinuationPrompt(originalPrompt, partialResponse) {
        return `${originalPrompt}

=== RESPUESTA PARCIAL YA GENERADA ===
${partialResponse}

=== INSTRUCCIÓN ===
Continúa exactamente desde donde quedó la respuesta anterior, sin repetir lo ya dicho, y cerrá la idea de forma completa.`;
    }

    mergeResponses(firstPart = "", secondPart = "") {
        const left = String(firstPart || "").trimEnd();
        const right = String(secondPart || "").trimStart();

        if (!left) return right;
        if (!right) return left;

        const needsSpace = !/[\s\n]$/.test(left) && !/^[,.;:!?)]/.test(right);
        return `${left}${needsSpace ? " " : ""}${right}`.trim();
    }

    buildPayload(prompt, systemPrompt = null, stream = false) {
        return {
            model: this.model,
            prompt,
            system: systemPrompt || undefined,
            stream,
            keep_alive: OLLAMA_KEEP_ALIVE,
            options: {
                temperature: this.temperature,
                num_ctx: this.numCtx,
                num_predict: this.numPredict
            }
        };
    }

    /**
     * Genera respuesta sin streaming
     */
    async generate(prompt, systemPrompt = null, allowContinuation = true) {
        try {
            const response = await this.postGenerate(
                this.buildPayload(prompt, systemPrompt, false)
            );

            const partialResponse = response.data.response?.trim() || "";

            if (allowContinuation && response.data.done_reason === "length" && partialResponse) {
                const continuation = await this.generate(
                    this.buildContinuationPrompt(prompt, partialResponse),
                    systemPrompt,
                    false
                );

                return this.mergeResponses(partialResponse, continuation);
            }

            return partialResponse;
        } catch (error) {
            console.error("Error en LLM:", error.message);
            throw new Error(`Error generando respuesta: ${error.message}`);
        }
    }

    /**
     * Genera respuesta con streaming
     */
    async generateStream(prompt, systemPrompt = null, onChunk = null, allowContinuation = true) {
        try {
            const response = await this.postGenerate(
                this.buildPayload(prompt, systemPrompt, true),
                { responseType: "stream" }
            );

            return new Promise((resolve, reject) => {
                let fullResponse = "";
                let buffer = "";
                let doneReason = null;

                response.data.on("data", chunk => {
                    buffer += chunk.toString();
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (!line.trim()) continue;

                        try {
                            const parsed = JSON.parse(line);

                            if (parsed.response) {
                                fullResponse += parsed.response;
                                if (onChunk) {
                                    onChunk(parsed.response);
                                }
                            }

                            if (parsed.done) {
                                doneReason = parsed.done_reason || null;
                            }
                        } catch {
                            // Ignorar líneas inválidas
                        }
                    }
                });

                response.data.on("error", err => {
                    reject(err);
                });

                response.data.on("end", async () => {
                    try {
                        let finalResponse = fullResponse.trim();

                        if (allowContinuation && doneReason === "length" && finalResponse) {
                            const continuation = await this.generate(
                                this.buildContinuationPrompt(prompt, finalResponse),
                                systemPrompt,
                                false
                            );

                            if (continuation && onChunk) {
                                onChunk(finalResponse ? ` ${continuation}` : continuation);
                            }

                            finalResponse = this.mergeResponses(finalResponse, continuation);
                        }

                        resolve(finalResponse.trim());
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        } catch (error) {
            console.error("Error en LLM stream:", error.message);
            throw new Error(`Error generando respuesta: ${error.message}`);
        }
    }

    /**
     * Clasifica texto (útil para selector de agente)
     */
    async classify(text, categories) {
        const prompt = `Clasifica el siguiente texto en una de estas categorías: ${categories.join(", ")}\n\nTexto: "${text}"\n\nResponde SOLO con el nombre de la categoría más apropiada.`;

        try {
            const response = await this.generate(prompt);
            const category = response.trim().toLowerCase();

            return categories.find(cat => category.includes(cat.toLowerCase())) || categories[0];
        } catch (error) {
            console.error("Error en clasificación:", error.message);
            return categories[0];
        }
    }
}
