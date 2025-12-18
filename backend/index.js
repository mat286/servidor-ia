import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";

/**
 * Endpoint básico de chat
 */
app.post("/chat", async (req, res) => {
    try {
        const { prompt } = req.body;

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: "llama3",
            prompt,
            stream: false // Importante para que axios no falle
        });

        res.json({ respuesta: response.data.response });
    } catch (error) {
        // Esto te ayudará a ver en la consola qué está fallando realmente
        console.error("Error en Ollama:", error.response?.data || error.message);
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
`,
            stream: false
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
