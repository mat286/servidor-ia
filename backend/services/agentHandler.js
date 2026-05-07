/**
 * Handler centralizado para procesamiento de consultas con agentes
 * Desacopla validación, ejecución, streaming y formateo de respuesta
 */
import { validateAgentRequest } from "./requestValidation.js";

export class AgentHandler {
    /**
     * Procesa una consulta de usuario de forma unificada (stream o no-stream)
     * @param {Object} req - Objeto request de Express
     * @param {Object} res - Objeto response de Express
     * @param {Object} agente - Instancia del agente a usar
     * @param {Object} options - Opciones adicionales {validation}
     */
    static async handleAgentQuery(req, res, agente, options = {}) {
        try {
            // 1. Validación y normalización del payload
            const validation = validateAgentRequest(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    error: "Payload inválido",
                    errorCode: "VALIDATION_ERROR",
                    details: validation.errors
                });
            }

            const { prompt, history = [], stream = false } = validation.data;

            if (!agente) {
                return res.status(404).json({ 
                    error: "Agente no disponible",
                    errorCode: "AGENT_NOT_FOUND"
                });
            }

            // 2. Ejecución con streaming
            if (stream) {
                return await this._handleStreamResponse(req, res, agente, prompt, history);
            }

            // 3. Ejecución sin streaming
            return await this._handleJsonResponse(res, agente, prompt, history);
        } catch (error) {
            console.error("Error en handleAgentQuery:", error.message);
            const statusCode = error.statusCode || 500;
            const errorCode = error.errorCode || "INTERNAL_ERROR";
            return res.status(statusCode).json({ 
                error: error.message || "Error procesando consulta",
                errorCode
            });
        }
    }

    /**
     * Maneja respuesta con streaming SSE
     * @private
     */
    static async _handleStreamResponse(req, res, agente, prompt, history) {
        let clientDisconnected = false;
        req.on("aborted", () => {
            clientDisconnected = true;
        });
        res.on("close", () => {
            if (!res.writableEnded) {
                clientDisconnected = true;
            }
        });

        // Configurar headers SSE
        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        });

        let heartbeatInterval = null;
        try {
            // Enviar metadata inicial
            res.write(`data: ${JSON.stringify({
                type: "meta",
                agente: agente.nombre,
                dominio: agente.ragDomain,
                timestamp: new Date().toISOString()
            })}\n\n`);

            // Heartbeat cada 15s para mantener conexión viva
            heartbeatInterval = setInterval(() => {
                if (!res.writableEnded && !clientDisconnected) {
                    res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`);
                }
            }, 15000);

            // Ejecutar agente con callback de chunk
            const resultado = await agente.procesarPregunta(prompt, {
                history,
                stream: true,
                onChunk: (chunk) => {
                    if (!res.writableEnded && !clientDisconnected) {
                        res.write(`data: ${JSON.stringify({ 
                            type: "chunk", 
                            content: chunk 
                        })}\n\n`);
                    }
                }
            });

            // Limpiar heartbeat
            if (heartbeatInterval) clearInterval(heartbeatInterval);

            // Enviar resultado final y cierre
            if (!res.writableEnded && !clientDisconnected) {
                res.write(`data: ${JSON.stringify({
                    type: "done",
                    agente: resultado.agente,
                    dominio: resultado.dominio,
                    citas: resultado.citas || [],
                    sinInformacion: resultado.sinInformacion || false,
                    metrics: resultado.metrics || null
                })}\n\n`);
                res.write("data: [DONE]\n\n");
            }

            return res.end();
        } catch (error) {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            
            if (!res.writableEnded && !clientDisconnected) {
                res.write(`data: ${JSON.stringify({
                    type: "error",
                    error: error.message || "Error durante la generación",
                    errorCode: error.errorCode || "STREAM_ERROR"
                })}\n\n`);
                res.write("data: [DONE]\n\n");
            }
            return res.end();
        }
    }

    /**
     * Maneja respuesta JSON (sin streaming)
     * @private
     */
    static async _handleJsonResponse(res, agente, prompt, history) {
        const resultado = await agente.procesarPregunta(prompt, { history });

        return res.json({
            respuesta: resultado.respuesta,
            agente: resultado.agente,
            dominio: resultado.dominio,
            citas: resultado.citas || [],
            sinInformacion: resultado.sinInformacion || false,
            metrics: resultado.metrics || null,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Valida que una instancia es un agente válido
     * @param {Object} agente - Objeto a validar
     * @returns {boolean}
     */
    static isValidAgent(agente) {
        return agente &&
            typeof agente.nombre === 'string' &&
            typeof agente.procesarPregunta === 'function' &&
            typeof agente.ragDomain === 'string';
    }
}
