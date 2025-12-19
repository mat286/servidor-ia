import express from "express";
import axios from "axios";
import multer from "multer";
import { createRequire } from "module";
import { indexDocs, searchContext } from "./rag/rag.js";
import { agentes } from "./agentes.js";
import path from "path";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const app = express();
/* 
borrar esto
*/
/* const cors = require('cors'); */
import cors from 'cors';

// 1. Configurar CORS (Poner ANTES de las rutas)
app.use(cors({
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    credentials: true
}));
/* 
borrar esto
*/


const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

// Configuración de límites (Suficiente con estas dos líneas)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";
const MODELO_TEXTO = "llama3";
const MODELO_VISION = "llava";
/**
 * ENDPOINT PARA IMÁGENES (Vision)
 */
app.post("/vision", uploadMemory.single("image"), async (req, res) => {
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
app.post("/analizar-pdf", uploadMemory.single("pdf"), async (req, res) => {
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
 * Agente con STREAMING real
 */
app.post("/agente/:nombre", async (req, res) => {
    const agente = agentes[req.params.nombre];
    if (!agente) return res.status(404).send("Agente no existe");

    const pregunta = req.body.prompt;
    const stream = req.body.stream === true;

    const contexto = await searchContext(pregunta);

    const promptFinal = `
${agente}

Información:
${contexto.join("\n")}

Pregunta:
${pregunta}
`;

    // 🔹 Headers SSE
    if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
    }

    // 🔹 Llamada a Ollama en modo stream
    const ollamaResponse = await axios.post(
        "http://ollama:11434/api/generate",
        {
            model: "llama3:latest",
            prompt: promptFinal,
            stream: true
        },
        {
            responseType: "stream"
        }
    );

    // 🔹 Leer el stream de Ollama
    ollamaResponse.data.on("data", chunk => {
        const lines = chunk.toString().split("\n").filter(Boolean);

        for (const line of lines) {
            const parsed = JSON.parse(line);

            if (parsed.response) {
                if (stream) {
                    res.write(`data: ${parsed.response}\n\n`);
                }
            }

            if (parsed.done) {
                if (stream) {
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
            }
        }
    });

    ollamaResponse.data.on("error", err => {
        console.error("Stream error:", err);
        res.end();
    });
});


// ==============================
// Configuración Multer
// ==============================
const storageDocs = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "docs/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const uploadDocs = multer({
    storage: storageDocs,
    fileFilter: (req, file, cb) => {
        const allowed = [".pdf", ".txt", ".md"];
        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowed.includes(ext)) {
            return cb(new Error("Formato no permitido"));
        }
        cb(null, true);
    }
});


// ==============================
// Endpoint de upload
// ==============================
app.post("/rag/upload", uploadDocs.single("file"), async (req, res) => {
    console.log("Solicitud recibida en /rag/upload");
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No se envió archivo" });
        }

        // Reindexar RAG
        await indexDocs("docs");

        res.json({
            message: "Archivo cargado e indexado correctamente",
            file: req.file.filename
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error indexando documentos" });
    }
});



app.get("/", (req, res) => {
    console.log("Solicitud recibida en /");
    res.send("Servidor IA funcionando 🚀");
});

app.listen(3000, () => {
    console.log("Backend escuchando en puerto 3000");
});
