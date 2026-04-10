// Selector inteligente de agente basado en la pregunta del usuario
import { LLMService } from "./llm.js";

const ENABLE_SEMANTIC_ROUTING = process.env.ENABLE_SEMANTIC_ROUTING === "true";

/**
 * Selector de agente usando reglas rápidas y clasificación opcional
 */
export class AgentSelector {
    constructor(agentes) {
        this.agentes = agentes;
        this.llm = ENABLE_SEMANTIC_ROUTING ? new LLMService() : null;
    }

    /**
     * Selecciona el agente más apropiado para una pregunta
     * Usa reglas simples primero y solo recurre al LLM si está habilitado
     */
    async selectAgent(pregunta) {
        const preguntaNormalizada = this.normalizeText(pregunta);
        const keywordRules = this.getKeywordRules();

        const priorityEditorKeywords = [
            "editar archivo", "editar documento", "modificar archivo", "modificar documento",
            "generar archivo", "generar documento", "descargar archivo", "nueva version",
            "nueva versión", "reescribir archivo", "corregir archivo", "trabajar sobre un archivo"
        ];

        if (
            this.agentes.editor &&
            priorityEditorKeywords.some(keyword => this.matchesKeyword(preguntaNormalizada, keyword))
        ) {
            return this.agentes.editor;
        }

        const priorityGeneralKeywords = [
            "resumir", "resumen", "redactar", "redaccion", "reescribir", "anonimizar",
            "confidencial", "sensible", "privado", "borrador", "minuta", "memo", "correo"
        ];

        if (
            this.agentes.general &&
            priorityGeneralKeywords.some(keyword => this.matchesKeyword(preguntaNormalizada, keyword))
        ) {
            return this.agentes.general;
        }

        for (const [agenteNombre, keywords] of Object.entries(keywordRules)) {
            if (
                this.agentes[agenteNombre] &&
                keywords.some(keyword => this.matchesKeyword(preguntaNormalizada, keyword))
            ) {
                return this.agentes[agenteNombre];
            }
        }

        const agentNames = Object.keys(this.agentes);

        if (agentNames.length === 0) {
            throw new Error("No hay agentes disponibles");
        }

        if (agentNames.length === 1) {
            return this.agentes[agentNames[0]];
        }

        if (!ENABLE_SEMANTIC_ROUTING || !this.llm) {
            return this.agentes.general || this.agentes.conversacional || this.agentes[agentNames[0]];
        }

        try {
            const selectedName = await this.llm.classify(pregunta, agentNames);
            return this.agentes[selectedName] || this.agentes[agentNames[0]];
        } catch (error) {
            console.error("Error en selección de agente:", error.message);
            return this.agentes.general || this.agentes.conversacional || this.agentes[agentNames[0]];
        }
    }

    normalizeText(text = "") {
        return String(text)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    matchesKeyword(normalizedText, keyword) {
        const normalizedKeyword = this.normalizeText(keyword).trim();

        if (!normalizedKeyword) {
            return false;
        }

        if (normalizedKeyword.length <= 3) {
            const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`(^|\\W)${escapedKeyword}(\\W|$)`, "i").test(normalizedText);
        }

        return normalizedText.includes(normalizedKeyword);
    }

    getKeywordRules() {
        return {
            soporteTecnico: [
                "error", "problema", "soporte", "ayuda técnica", "no funciona", "sistema",
                "login", "ingresar", "caído", "lentitud", "bug"
            ],
            documental: [
                "documento", "archivo", "informe", "pdf", "manual", "guía", "cita",
                "fuente", "resolución", "decreto", "disposición", "reglamento", "norma"
            ],
            bi: [
                "bi", "business intelligence", "inteligencia de negocios", "dashboard", "dashboards",
                "tablero", "tableros", "tablero de control", "power bi", "obiee", "kpi", "indicador", "indicadores",
                "métrica", "métricas", "reporte", "reportes", "análisis de datos", "datamart", "visualización"
            ],
            editor: [
                "editar archivo", "editar documento", "modificar archivo", "modificar documento",
                "generar archivo", "generar documento", "descargar archivo", "archivo final",
                "nueva versión", "corregir texto", "reescribir documento", "trabajar con un archivo"
            ],
            esidif: [
                "esidif", "e-sidif", "e sidif", "sidif", "comprobante", "comprobantes",
                "compromiso", "devengado", "pagado", "cupo", "cur", "orden de pago",
                "registro presupuestario", "registro contable", "ejecución financiera"
            ],
            general: [
                "resumir", "resumen", "redactar", "redaccion", "reescribir", "mejorar texto",
                "anonimizar", "anonimiza", "confidencial", "sensible", "privado", "privada",
                "borrador", "nota", "memo", "memorando", "minuta", "correo", "mail",
                "presupuesto", "crédito", "ejecución", "onp", "oficina nacional de presupuesto"
            ],
            conversacional: [
                "hola", "buenos días", "buenas tardes", "buenas noches", "cómo estás",
                "quien sos", "qué puedes hacer", "charlar", "conversar", "hablar"
            ]
        };
    }

    listAgents() {
        return Object.keys(this.agentes).map(nombre => ({
            nombre,
            info: this.agentes[nombre].getInfo()
        }));
    }
}
