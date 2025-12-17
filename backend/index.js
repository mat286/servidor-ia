import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

/**
 * Endpoint básico de chat
 */
app.post("/chat", async (req, res) => {
    try {
        const { prompt } = req.body;

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: "llama3",
            prompt
        });

        res.json({ respuesta: response.data.response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Ejemplo de agente especializado reopened
 */
app.post("/agente/soporte", async (req, res) => {
    try {
        const { pregunta } = req.body;

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: "llama3",
            prompt: `
Sos un agente de soporte técnico.
Respondé claro, corto y útil.

Pregunta del usuario:
${pregunta}
`
        });

        res.json({ respuesta: response.data.response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/", (req, res) => {
    res.send("Servidor IA funcionando 🚀");
});

app.listen(3000, () => {
    console.log("Backend escuchando en puerto 3000");
});
