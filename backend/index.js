import express from "express";
import axios from "axios";
import multer from "multer";
import { createRequire } from "module";


const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");



const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Configuración de límites (Suficiente con estas dos líneas)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";
const MODELO_TEXTO = "llama3";
const MODELO_VISION = "llava";
/**
 * ENDPOINT PARA IMÁGENES (Vision)
 */
app.post("/vision", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No se subió ninguna imagen" });

        const { prompt } = req.body;
        const imageBase64 = req.file.buffer.toString("base64");

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: MODELO_VISION,
            prompt: prompt || "¿Qué ves en esta imagen?",
            images: [imageBase64],
            stream: false
        });

        res.json({ respuesta: response.data.response });
    } catch (error) {
        console.error("Error Vision:", error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * ENDPOINT PARA PDF
 */
app.post("/analizar-pdf", upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No se subió ningún PDF" });

        const { pregunta } = req.body;
        const data = await pdfParse(req.file.buffer);
        const textoPdf = data.text;

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: MODELO_TEXTO,
            prompt: `Contexto del documento:\n${textoPdf}\n\nPregunta: ${pregunta}`,
            stream: false
        });

        res.json({ respuesta: response.data.response });
    } catch (error) {
        console.error("Error PDF:", error.message);
        res.status(500).json({ error: error.message });
    }
});


/**
 * Endpoint básico de chat
 */
app.post("/chat", async (req, res) => {
    try {
        const { prompt } = req.body;

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: MODELO_TEXTO,
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
            model: MODELO_TEXTO,
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
