// Clase base para agentes con RAG asociado
import { RAGBase } from "../../rag/base/RAGBase.js";
import { LLMService } from "../../services/llm.js";
import { 
    formatContextWithCitations, 
    generateCitations,
    getCitationInstructions 
} from "../../services/citations.js";
import path from "path";

/**
 * Clase base para agentes del sistema multi-agente
 * Cada agente tiene:
 * - Un nombre único
 * - Un system prompt (rol)
 * - Un RAG asociado (base documental)
 */
export class AgenteBase {
    constructor(config) {
        const {
            nombre,
            systemPrompt,
            ragDomain,
            ragDir,
            model = process.env.MODELO_TEXTO || "qwen2.5:3b"
        } = config;

        if (!nombre || !systemPrompt || !ragDomain) {
            throw new Error("Agente requiere: nombre, systemPrompt, ragDomain");
        }

        this.nombre = nombre;
        this.systemPrompt = systemPrompt;
        this.ragDomain = ragDomain;
        this.model = process.env.MODELO_TEXTO || model;

        // Inicializar RAG para este dominio
        const ragDirectory = ragDir || path.join(process.cwd(), "rag", ragDomain);
        this.rag = new RAGBase(ragDomain, ragDirectory);
        
        // Inicializar servicio LLM
        this.llm = new LLMService(this.model);

        // Prompt completo con instrucciones de citas
        this.fullSystemPrompt = this.systemPrompt;
    }

    /**
     * Procesa una pregunta usando el RAG del agente
     */
    async procesarPregunta(pregunta, options = {}) {
        const t0 = Date.now();
        const {
            topK = Number(process.env.RAG_TOP_K || 4),
            stream = false,
            onChunk = null,
            history = []
        } = options;

        const historialFormateado = this.formatConversationHistory(history);

        // 1. Verificar que el RAG esté indexado
        if (!this.rag.isIndexed()) {
            if (this.ragDomain === "conversacional") {
                const promptConHistorial = historialFormateado
                    ? `=== CONTEXTO DE LA CONVERSACIÓN RECIENTE ===\n${historialFormateado}\n\n=== NUEVO MENSAJE DEL USUARIO ===\n${pregunta}`
                    : pregunta;

                const respuestaDirecta = stream && onChunk
                    ? await this.llm.generateStream(promptConHistorial, this.systemPrompt, onChunk)
                    : await this.llm.generate(promptConHistorial, this.systemPrompt);

                const totalMs = Date.now() - t0;

                return {
                    respuesta: respuestaDirecta,
                    citas: [],
                    contexto: null,
                    agente: this.nombre,
                    dominio: this.ragDomain,
                    sinInformacion: false,
                    metrics: { totalMs, ragMs: 0, llmMs: totalMs }
                };
            }

            const respuestaSinDocumentos = `No hay documentos indexados para el dominio "${this.ragDomain}". Por favor, carga documentos primero.`;

            if (stream && onChunk) {
                onChunk(respuestaSinDocumentos);
            }

            return {
                respuesta: respuestaSinDocumentos,
                citas: [],
                contexto: null,
                agente: this.nombre,
                dominio: this.ragDomain,
                sinInformacion: true,
                error: "RAG_NO_INDEXADO"
            };
        }

        // 2. Buscar contexto relevante
        const ragStart = Date.now();
        const searchResult = await this.rag.searchContext(pregunta, topK);
        const ragMs = Date.now() - ragStart;
        
        if (!searchResult.chunks || searchResult.chunks.length === 0) {
            const respuestaSinContexto = `No hay información suficiente en la base documental del dominio "${this.ragDomain}" para responder esta pregunta.`;

            if (stream && onChunk) {
                onChunk(respuestaSinContexto);
            }

            return {
                respuesta: respuestaSinContexto,
                citas: [],
                contexto: null,
                agente: this.nombre,
                dominio: this.ragDomain,
                sinInformacion: true
            };
        }

        // 3. Formatear contexto con citas
        const contextoFormateado = formatContextWithCitations(searchResult.chunks);
        const citas = generateCitations(searchResult.chunks);

        // 4. Construir prompt final
        const promptFinal = `${historialFormateado ? `=== CONTEXTO DE LA CONVERSACIÓN RECIENTE ===\n${historialFormateado}\n\n` : ""}${contextoFormateado}\n\n=== PREGUNTA DEL USUARIO ===\n${pregunta}\n\n=== INSTRUCCIONES ===\nRespondé en español claro y útil. Basate ÚNICAMENTE en el contexto proporcionado. Si el historial reciente ayuda a interpretar la consulta, usalo solo como apoyo. Si el usuario pregunta cómo hacer algo, devolvé pasos numerados. Si la pregunta es conceptual, respondé definición y utilidad sin agregar pasos operativos innecesarios. No inventes menús, opciones, datos ni referencias. No agregues una sección manual de referencias: el sistema la incorpora automáticamente.`;

        // 5. Generar respuesta con LLM
        let respuesta;
        
        const llmStart = Date.now();
        if (stream && onChunk) {
            respuesta = await this.llm.generateStream(
                promptFinal,
                this.fullSystemPrompt,
                onChunk
            );
        } else {
            respuesta = await this.llm.generate(
                promptFinal,
                this.fullSystemPrompt
            );
        }
        const llmMs = Date.now() - llmStart;

        // 6. Asegurar que las citas estén en la respuesta
        const respuestaConCitas = this.agregarCitasFinales(this.limpiarReferenciasModelo(respuesta), citas);

        return {
            respuesta: respuestaConCitas,
            citas: citas,
            contexto: searchResult.chunks,
            agente: this.nombre,
            dominio: this.ragDomain,
            metrics: { totalMs: Date.now() - t0, ragMs, llmMs }
        };
    }

    formatConversationHistory(history = []) {
        if (!Array.isArray(history) || history.length === 0) {
            return "";
        }

        return history
            .filter(item => item && item.content)
            .slice(-6)
            .map(item => {
                const role = item.role === "assistant" ? "Asistente" : "Usuario";
                const content = String(item.content).trim().slice(0, 800);
                return `${role}: ${content}`;
            })
            .join("\n");
    }

    limpiarReferenciasModelo(respuesta = "") {
        return String(respuesta)
            .replace(/\n?\s*(---\s*)?(#{1,6}\s*)?\*{0,2}(Referencias|Fuentes)\*{0,2}:?[\s\S]*$/i, "")
            .trim();
    }

    /**
     * Agrega lista de referencias al final de la respuesta
     */
    agregarCitasFinales(respuesta, citas) {
        const respuestaBase = String(respuesta || "").trim();

        if (citas.length === 0) {
            return respuestaBase;
        }

        const referencias = citas.map((cita, idx) => `${idx + 1}. ${cita}`).join("\n");

        return `${respuestaBase}\n\n---\n**Referencias:**\n${referencias}`;
    }

    /**
     * Indexa documentos en el RAG del agente
     */
    async indexarDocumentos(docsDir) {
        return await this.rag.indexDocs(docsDir);
    }

    /**
     * Verifica si el agente tiene documentos indexados
     */
    tieneDocumentos() {
        return this.rag.isIndexed();
    }

    /**
     * Obtiene información del agente
     */
    getInfo() {
        return {
            nombre: this.nombre,
            dominio: this.ragDomain,
            tieneDocumentos: this.tieneDocumentos(),
            model: this.model
        };
    }
}
