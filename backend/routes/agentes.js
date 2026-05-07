import { Router } from "express";
import { agentes, getAgente, listAgentes } from "../agentes/index.js";
import { AgentSelector } from "../services/agentSelector.js";
import { AgentHandler } from "../services/agentHandler.js";

const router = Router();
const agentSelector = new AgentSelector(agentes);

router.post("/agente/conversacional", async (req, res) => {
    try {
        const agente = getAgente("conversacional");
        return await AgentHandler.handleAgentQuery(req, res, agente);
    } catch (error) {
        console.error("Error en /agente/conversacional:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.post("/agente", async (req, res) => {
    try {
        const agente = await agentSelector.selectAgent(req.body.prompt || "");
        return await AgentHandler.handleAgentQuery(req, res, agente);
    } catch (error) {
        console.error("Error en /agente:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.post("/agente/auto", async (req, res) => {
    try {
        const agente = await agentSelector.selectAgent(req.body.prompt || "");
        return await AgentHandler.handleAgentQuery(req, res, agente);
    } catch (error) {
        console.error("Error en /agente/auto:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.post("/agente/:nombre", async (req, res) => {
    try {
        const nombreAgente = req.params.nombre;
        const agente = getAgente(nombreAgente);

        if (!agente) {
            return res.status(404).json({
                error: `Agente '${nombreAgente}' no existe`,
                errorCode: "AGENT_NOT_FOUND"
            });
        }

        return await AgentHandler.handleAgentQuery(req, res, agente);
    } catch (error) {
        console.error("Error en /agente/:nombre:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.get("/agentes", (req, res) => {
    try {
        const lista = listAgentes();
        res.json({ total: lista.length, agentes: lista });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
