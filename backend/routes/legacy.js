import { Router } from "express";
import axios from "axios";
import multer from "multer";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const router = Router();
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }
});

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODELO_TEXTO = process.env.MODELO_TEXTO || "qwen2.5:3b";
const MODELO_VISION = process.env.MODELO_VISION || "llava:7b";

router.post("/vision", uploadMemory.single("image"), async (req, res) => {
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

router.post("/analizar-pdf", uploadMemory.single("pdf"), async (req, res) => {
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

router.post("/chat", async (req, res) => {
    try {
        const { prompt } = req.body;

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: MODELO_TEXTO,
            prompt,
            stream: false
        });

        res.json({ respuesta: response.data.response });
    } catch (error) {
        console.error("Error en Ollama:", error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
