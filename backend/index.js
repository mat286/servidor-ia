import express from "express";
import fs from "fs";
import { createHash } from "crypto";
import axios from "axios";
import multer from "multer";
import { createRequire } from "module";
import path from "path";
import cors from 'cors';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";

// Sistema multi-agente
import { agentes, getAgente, listAgentes } from "./agentes/index.js";
import { AgentSelector } from "./services/agentSelector.js";
import { LLMService } from "./services/llm.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const wordExtractor = new WordExtractor();

const app = express();

// Configuración CORS
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
}));

app.options("*", cors());

// Configuración de límites
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODELO_TEXTO = process.env.MODELO_TEXTO || "qwen2.5:3b";
const MODELO_VISION = process.env.MODELO_VISION || "llava:7b";

// Inicializar selector de agente
const agentSelector = new AgentSelector(agentes);
const editorLLM = new LLMService(MODELO_TEXTO);

// ==============================
// ENDPOINTS MULTI-AGENTE
// ==============================

app.post("/agente/conversacional", async (req, res) => {
    try {
        const { prompt, history = [], stream = false } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Se requiere 'prompt' en el body" });
        }

        const agente = getAgente("conversacional");
        if (!agente) {
            return res.status(404).json({ error: "El agente conversacional no está disponible" });
        }

        if (stream) {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            });

            res.write(`data: ${JSON.stringify({
                type: "meta",
                agente: agente.nombre,
                dominio: agente.ragDomain
            })}\n\n`);

            const resultado = await agente.procesarPregunta(prompt, {
                history,
                stream: true,
                onChunk: (chunk) => {
                    res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
                }
            });

            res.write(`data: ${JSON.stringify({
                type: "done",
                agente: resultado.agente,
                dominio: resultado.dominio,
                citas: resultado.citas || [],
                sinInformacion: resultado.sinInformacion || false
            })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
        }

        const resultado = await agente.procesarPregunta(prompt, { history });
        return res.json({
            respuesta: resultado.respuesta,
            agente: resultado.agente,
            dominio: resultado.dominio,
            citas: resultado.citas,
            sinInformacion: resultado.sinInformacion || false
        });
    } catch (error) {
        console.error("Error en /agente/conversacional:", error.message);
        return res.status(500).json({ error: error.message });
    }
});


app.post("/agente", async (req, res) => {
    try {
        const { prompt, history = [], stream = false } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Se requiere 'prompt' en el body" });
        }

        const agente = await agentSelector.selectAgent(prompt);

        if (stream) {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            });

            res.write(`data: ${JSON.stringify({
                type: "meta",
                agente: agente.nombre,
                dominio: agente.ragDomain
            })}\n\n`);

            const resultado = await agente.procesarPregunta(prompt, {
                history,
                stream: true,
                onChunk: (chunk) => {
                    res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
                }
            });

            res.write(`data: ${JSON.stringify({
                type: "done",
                agente: resultado.agente,
                dominio: resultado.dominio,
                citas: resultado.citas || [],
                sinInformacion: resultado.sinInformacion || false
            })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
        }

        const resultado = await agente.procesarPregunta(prompt, { history });
        return res.json({
            respuesta: resultado.respuesta,
            agente: resultado.agente,
            dominio: resultado.dominio,
            citas: resultado.citas,
            sinInformacion: resultado.sinInformacion || false
        });
    } catch (error) {
        console.error("Error en /agente:", error.message);
        res.status(500).json({ error: error.message });
    }
});



/**
 * Endpoint principal: pregunta con selección automática de agente
 * POST /agente/auto
 * Body: { prompt: string, stream?: boolean }
 */
app.post("/agente/auto", async (req, res) => {
    try {
        const { prompt, history = [], stream = false } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Se requiere 'prompt' en el body" });
        }

        // Seleccionar agente automáticamente
        const agente = await agentSelector.selectAgent(prompt);

        if (stream) {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            });

            res.write(`data: ${JSON.stringify({
                type: "meta",
                agente: agente.nombre,
                dominio: agente.ragDomain
            })}\n\n`);

            const resultado = await agente.procesarPregunta(prompt, {
                history,
                stream: true,
                onChunk: (chunk) => {
                    res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
                }
            });

            res.write(`data: ${JSON.stringify({
                type: "done",
                agente: resultado.agente,
                dominio: resultado.dominio,
                citas: resultado.citas || [],
                sinInformacion: resultado.sinInformacion || false
            })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            res.end();
        } else {
            const resultado = await agente.procesarPregunta(prompt, { history });
            res.json({
                respuesta: resultado.respuesta,
                agente: resultado.agente,
                dominio: resultado.dominio,
                citas: resultado.citas,
                sinInformacion: resultado.sinInformacion || false
            });
        }
    } catch (error) {
        console.error("Error en /agente/auto:", error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: pregunta a un agente específico
 * POST /agente/:nombre
 * Body: { prompt: string, stream?: boolean }
 */
app.post("/agente/:nombre", async (req, res) => {
    try {
        const nombreAgente = req.params.nombre;
        const { prompt, history = [], stream = false } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Se requiere 'prompt' en el body" });
        }

        const agente = getAgente(nombreAgente);
        if (!agente) {
            return res.status(404).json({
                error: `Agente '${nombreAgente}' no existe`,
                agentesDisponibles: Object.keys(agentes)
            });
        }

        if (stream) {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            });

            res.write(`data: ${JSON.stringify({
                type: "meta",
                agente: agente.nombre,
                dominio: agente.ragDomain
            })}\n\n`);

            const resultado = await agente.procesarPregunta(prompt, {
                history,
                stream: true,
                onChunk: (chunk) => {
                    res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
                }
            });

            res.write(`data: ${JSON.stringify({
                type: "done",
                agente: resultado.agente,
                dominio: resultado.dominio,
                citas: resultado.citas || [],
                sinInformacion: resultado.sinInformacion || false
            })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            res.end();
        } else {
            const resultado = await agente.procesarPregunta(prompt, { history });
            res.json({
                respuesta: resultado.respuesta,
                agente: resultado.agente,
                dominio: resultado.dominio,
                citas: resultado.citas,
                sinInformacion: resultado.sinInformacion || false
            });
        }
    } catch (error) {
        console.error(`Error en /agente/${req.params.nombre}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: listar agentes disponibles
 * GET /agentes
 */
app.get("/agentes", (req, res) => {
    try {
        const lista = listAgentes();
        res.json({
            total: lista.length,
            agentes: lista
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==============================
// ENDPOINTS DE UPLOAD POR DOMINIO
// ==============================

const uploadDocs = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [".pdf", ".txt", ".md", ".doc", ".docx"];
        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowed.includes(ext)) {
            return cb(new Error("Formato no permitido. Solo PDF, TXT, MD, DOC y DOCX"));
        }
        cb(null, true);
    }
});

function getDocsDir(dominio = "general") {
    const dir = path.join("rag", dominio, "docs");

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return dir;
}

function normalizeUploadName(fileName = "") {
    return String(fileName).trim().toLowerCase();
}

function stripTimestampPrefix(fileName = "") {
    return String(fileName).replace(/^\d+-/, "");
}

function getFileHash(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

function validateDuplicateUpload(targetDir, file) {
    const originalName = normalizeUploadName(file.originalname);
    const files = fs.readdirSync(targetDir);

    for (const existingFile of files) {
        const fullPath = path.join(targetDir, existingFile);
        if (!fs.statSync(fullPath).isFile()) continue;

        if (normalizeUploadName(stripTimestampPrefix(existingFile)) === originalName) {
            return {
                duplicate: true,
                duplicateType: "name",
                existingFile
            };
        }
    }

    const incomingHash = getFileHash(file.buffer);

    for (const existingFile of files) {
        const fullPath = path.join(targetDir, existingFile);
        if (!fs.statSync(fullPath).isFile()) continue;

        const existingHash = getFileHash(fs.readFileSync(fullPath));
        if (existingHash === incomingHash) {
            return {
                duplicate: true,
                duplicateType: "content",
                existingFile
            };
        }
    }

    return { duplicate: false };
}

function saveUploadedDocument(targetDir, file) {
    const storedFileName = `${Date.now()}-${file.originalname}`;
    const targetPath = path.join(targetDir, storedFileName);

    fs.writeFileSync(targetPath, file.buffer);

    return storedFileName;
}

function getGeneratedDir(dominio = "general") {
    const dir = path.join("rag", dominio, "generated");

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return dir;
}

function sanitizeGeneratedBaseName(fileName = "resultado") {
    return stripTimestampPrefix(path.parse(fileName).name)
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "resultado";
}

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function cmToTwip(value = 0) {
    return Math.round(Number(value || 0) * 567);
}

function ptToTwip(value = 0) {
    return Math.round(Number(value || 0) * 20);
}

function ptToHalfPoint(value = 12) {
    return Math.round(Number(value || 12) * 2);
}

function sanitizeDocText(text = "") {
    return String(text ?? "")
        .replace(/\r/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`(.*?)`/g, "$1");
}

function normalizeDocumentFormat(formatting = {}, outputType = "docx") {
    const safeFormatting = formatting && typeof formatting === "object" ? formatting : {};
    const safeMargins = safeFormatting.marginsCm && typeof safeFormatting.marginsCm === "object"
        ? safeFormatting.marginsCm
        : {};

    return {
        outputType: outputType === "txt" ? "txt" : outputType === "md" ? "md" : "docx",
        fontFamily: String(safeFormatting.fontFamily || "Arial").trim().slice(0, 60) || "Arial",
        fontSize: clampNumber(safeFormatting.fontSize, 8, 24, 12),
        lineSpacing: clampNumber(safeFormatting.lineSpacing, 1, 3, 1.15),
        firstLineIndentCm: clampNumber(safeFormatting.firstLineIndentCm, 0, 5, 1.25),
        alignment: ["left", "center", "right", "justify"].includes(String(safeFormatting.alignment || "").toLowerCase())
            ? String(safeFormatting.alignment).toLowerCase()
            : "justify",
        spaceAfterPt: clampNumber(safeFormatting.spaceAfterPt, 0, 24, 6),
        marginsCm: {
            top: clampNumber(safeMargins.top, 1, 5, 2.5),
            right: clampNumber(safeMargins.right, 1, 5, 2),
            bottom: clampNumber(safeMargins.bottom, 1, 5, 2.5),
            left: clampNumber(safeMargins.left, 1, 5, 3)
        }
    };
}

function parseDocxAlignment(alignment = "justify") {
    switch (String(alignment || "").toLowerCase()) {
        case "left":
            return AlignmentType.LEFT;
        case "center":
            return AlignmentType.CENTER;
        case "right":
            return AlignmentType.RIGHT;
        default:
            return AlignmentType.JUSTIFIED;
    }
}

function buildDocxParagraphs(content, formatting) {
    const paragraphs = [];
    const lines = sanitizeDocText(content).split("\n");
    let paragraphBuffer = [];

    const flushParagraphBuffer = () => {
        if (!paragraphBuffer.length) return;

        const paragraphText = paragraphBuffer.join(" ").trim();
        paragraphBuffer = [];

        if (!paragraphText) return;

        paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: paragraphText,
                font: formatting.fontFamily,
                size: ptToHalfPoint(formatting.fontSize)
            })],
            alignment: parseDocxAlignment(formatting.alignment),
            indent: { firstLine: cmToTwip(formatting.firstLineIndentCm) },
            spacing: {
                line: Math.round(formatting.lineSpacing * 240),
                after: ptToTwip(formatting.spaceAfterPt)
            }
        }));
    };

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraphBuffer();
            continue;
        }

        if (/^#{1,6}\s+/.test(trimmed)) {
            flushParagraphBuffer();
            const headingText = trimmed.replace(/^#{1,6}\s+/, "").trim();
            paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: headingText,
                    bold: true,
                    font: formatting.fontFamily,
                    size: ptToHalfPoint(formatting.fontSize + 2)
                })],
                alignment: parseDocxAlignment(formatting.alignment),
                spacing: { before: ptToTwip(6), after: ptToTwip(6) }
            }));
            continue;
        }

        if (/^[-•]\s+/.test(trimmed)) {
            flushParagraphBuffer();
            const bulletText = trimmed.replace(/^[-•]\s+/, "").trim();
            paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: bulletText,
                    font: formatting.fontFamily,
                    size: ptToHalfPoint(formatting.fontSize)
                })],
                bullet: { level: 0 },
                alignment: parseDocxAlignment(formatting.alignment),
                spacing: {
                    line: Math.round(formatting.lineSpacing * 240),
                    after: ptToTwip(4)
                }
            }));
            continue;
        }

        if (/^\d+[.)]\s+/.test(trimmed)) {
            flushParagraphBuffer();
            paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: trimmed,
                    font: formatting.fontFamily,
                    size: ptToHalfPoint(formatting.fontSize)
                })],
                alignment: parseDocxAlignment(formatting.alignment),
                indent: { left: cmToTwip(0.8) },
                spacing: {
                    line: Math.round(formatting.lineSpacing * 240),
                    after: ptToTwip(4)
                }
            }));
            continue;
        }

        paragraphBuffer.push(trimmed);
    }

    flushParagraphBuffer();

    if (!paragraphs.length) {
        paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: "",
                font: formatting.fontFamily,
                size: ptToHalfPoint(formatting.fontSize)
            })]
        }));
    }

    return paragraphs;
}

async function createDocxBuffer(content, formatting, metadata = {}) {
    const document = new Document({
        creator: "Servidor IA",
        title: metadata.title || "Documento generado",
        description: metadata.description || "Documento generado por el editor documental",
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: cmToTwip(formatting.marginsCm.top),
                        right: cmToTwip(formatting.marginsCm.right),
                        bottom: cmToTwip(formatting.marginsCm.bottom),
                        left: cmToTwip(formatting.marginsCm.left)
                    }
                }
            },
            children: buildDocxParagraphs(content, formatting)
        }]
    });

    return Packer.toBuffer(document);
}

function formatConversationHistoryForEditor(history = []) {
    if (!Array.isArray(history)) {
        return "";
    }

    return history
        .filter(item => item && item.content && item.role !== "assistant")
        .slice(-10)
        .map(item => {
            const content = String(item.content).trim().slice(0, 1200);
            return `Usuario: ${content}`;
        })
        .join("\n");
}

function cleanGeneratedDocumentText(text = "") {
    return String(text ?? "")
        .replace(/\r/g, "")
        .replace(/^\s*(PREVIEW|VISTA PREVIA|DOCUMENTO FINAL|BORRADOR)\s*$/gim, "")
        .replace(/^\s*(Arial|Calibri|Times New Roman)\s*$/gim, "")
        .replace(/^\s*\d+(?:[.,]\d+)?\s*pt\s*$/gim, "")
        .replace(/^\s*Sangr[ií]a.*$/gim, "")
        .replace(/^\s*Alineaci[oó]n:.*$/gim, "")
        .replace(/^\s*(CONVERSACI[ÓO]N RECIENTE|FORMATO DE SALIDA|ARCHIVO ACTIVO|DOCUMENTO ORIGINAL|DOCUMENTO FUENTE|BASE ACTUAL PARA EDITAR)\s*$/gim, "")
        .replace(/^\s*Usuario:\s*.*$/gim, "")
        .replace(/^\s*Asistente:\s*.*$/gim, "")
        .replace(/^\s*```(?:\w+)?\s*$/gim, "")
        .replace(/^\s*"{3}\s*$/gim, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

async function readDocumentTextForProcessing(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".txt" || ext === ".md") {
        return fs.readFileSync(filePath, "utf8");
    }

    if (ext === ".pdf") {
        const pdfData = await pdfParse(fs.readFileSync(filePath));
        return (pdfData.text || "").trim();
    }

    if (ext === ".docx") {
        const result = await mammoth.extractRawText({ path: filePath });
        return String(result.value || "").trim();
    }

    if (ext === ".doc") {
        const extracted = await wordExtractor.extract(filePath);
        return String(extracted?.getBody?.() || "").trim();
    }

    throw new Error("Formato no soportado para edición automática");
}

function buildFileDescriptor(dominio, fileName) {
    const fullPath = path.join(getDocsDir(dominio), fileName);
    const stat = fs.statSync(fullPath);

    return {
        filename: fileName,
        originalName: stripTimestampPrefix(fileName),
        size: stat.size,
        uploadedAt: stat.mtime.toISOString(),
        url: `/rag/file/${encodeURIComponent(dominio)}/${encodeURIComponent(fileName)}`
    };
}

/**
 * Endpoint: subir documento a un dominio específico
 * POST /rag/upload/:dominio
 * FormData: { file: File }
 */
app.post("/rag/upload/:dominio", uploadDocs.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No se envió archivo" });
        }

        const dominio = req.params.dominio;
        const agente = Object.values(agentes).find(a => a.ragDomain === dominio);

        if (!agente) {
            return res.status(404).json({
                error: `Dominio '${dominio}' no existe`,
                dominiosDisponibles: Object.values(agentes).map(a => a.ragDomain)
            });
        }

        const docsDir = getDocsDir(dominio);
        const duplicateCheck = validateDuplicateUpload(docsDir, req.file);

        if (duplicateCheck.duplicate) {
            const duplicateMessage = duplicateCheck.duplicateType === "name"
                ? `Ya existe un archivo con el nombre "${req.file.originalname}" en el dominio "${dominio}".`
                : `Ya existe un archivo con el mismo contenido en el dominio "${dominio}" (${duplicateCheck.existingFile}).`;

            return res.status(409).json({
                error: duplicateMessage,
                duplicateType: duplicateCheck.duplicateType,
                existingFile: duplicateCheck.existingFile,
                dominio
            });
        }

        const storedFileName = saveUploadedDocument(docsDir, req.file);

        // Indexar documentos del dominio
        const resultado = await agente.indexarDocumentos(docsDir);

        res.json({
            message: "Archivo cargado e indexado correctamente",
            file: storedFileName,
            dominio: dominio,
            resultado: resultado
        });
    } catch (err) {
        console.error("Error en upload:", err);
        res.status(500).json({ error: err.message || "Error indexando documentos" });
    }
});

/**
 * Endpoint: subir documento (compatibilidad con versión anterior)
 * POST /rag/upload
 * FormData: { file: File, dominio?: string }
 */
app.post("/rag/upload", uploadDocs.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No se envió archivo" });
        }

        // Si no se especifica dominio, usar "general"
        const dominio = req.body.dominio || "general";
        const agente = Object.values(agentes).find(a => a.ragDomain === dominio);

        if (!agente) {
            return res.status(404).json({
                error: `Dominio '${dominio}' no existe`,
                dominiosDisponibles: Object.values(agentes).map(a => a.ragDomain)
            });
        }

        const targetDir = getDocsDir(dominio);
        const duplicateCheck = validateDuplicateUpload(targetDir, req.file);

        if (duplicateCheck.duplicate) {
            const duplicateMessage = duplicateCheck.duplicateType === "name"
                ? `Ya existe un archivo con el nombre "${req.file.originalname}" en el dominio "${dominio}".`
                : `Ya existe un archivo con el mismo contenido en el dominio "${dominio}" (${duplicateCheck.existingFile}).`;

            return res.status(409).json({
                error: duplicateMessage,
                duplicateType: duplicateCheck.duplicateType,
                existingFile: duplicateCheck.existingFile,
                dominio
            });
        }

        const storedFileName = saveUploadedDocument(targetDir, req.file);

        // Indexar documentos del dominio
        const resultado = await agente.indexarDocumentos(targetDir);

        res.json({
            message: "Archivo cargado e indexado correctamente",
            file: storedFileName,
            dominio: dominio,
            resultado: resultado
        });
    } catch (err) {
        console.error("Error en upload:", err);
        res.status(500).json({ error: err.message || "Error indexando documentos" });
    }
});

app.get("/rag/files/:dominio", (req, res) => {
    try {
        const dominio = req.params.dominio || "general";
        const agente = Object.values(agentes).find(a => a.ragDomain === dominio);

        if (!agente) {
            return res.status(404).json({
                error: `Dominio '${dominio}' no existe`,
                dominiosDisponibles: Object.values(agentes).map(a => a.ragDomain)
            });
        }

        const docsDir = getDocsDir(dominio);
        const files = fs.readdirSync(docsDir)
            .filter(file => fs.statSync(path.join(docsDir, file)).isFile())
            .map(file => buildFileDescriptor(dominio, file))
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        return res.json({ dominio, total: files.length, files });
    } catch (error) {
        console.error("Error listando archivos RAG:", error.message);
        return res.status(500).json({ error: "No se pudieron listar los archivos" });
    }
});

app.delete("/rag/files/:dominio/:filename", async (req, res) => {
    try {
        const dominio = req.params.dominio || "general";
        const agente = Object.values(agentes).find(a => a.ragDomain === dominio);

        if (!agente) {
            return res.status(404).json({
                error: `Dominio '${dominio}' no existe`,
                dominiosDisponibles: Object.values(agentes).map(a => a.ragDomain)
            });
        }

        const docsDir = getDocsDir(dominio);
        const requestedFileName = decodeURIComponent(req.params.filename || "");
        const safeFileName = path.basename(requestedFileName);
        const filePath = path.join(docsDir, safeFileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Archivo no encontrado" });
        }

        fs.unlinkSync(filePath);
        const resultado = await agente.indexarDocumentos(docsDir);

        return res.json({
            message: "Archivo eliminado correctamente",
            file: safeFileName,
            dominio,
            resultado
        });
    } catch (error) {
        console.error("Error eliminando archivo RAG:", error.message);
        return res.status(500).json({ error: "No se pudo eliminar el archivo" });
    }
});

app.post("/editor/generar-documento", async (req, res) => {
    try {
        const {
            filename,
            instructions = "",
            outputType = "docx",
            formatting = {},
            conversationHistory = [],
            previewOnly = false,
            baseContent = ""
        } = req.body;
        const dominio = "editor";

        if (!filename) {
            return res.status(400).json({ error: "Se requiere 'filename'" });
        }

        const conversationText = formatConversationHistoryForEditor(conversationHistory);
        const safeInstructions = String(instructions || "").trim();
        const safeBaseContent = String(baseContent || "").trim();

        if (!safeInstructions && !conversationText && !safeBaseContent) {
            return res.status(400).json({
                error: "Se requiere una instrucción o una conversación previa para generar el documento"
            });
        }

        const safeFileName = path.basename(decodeURIComponent(filename));
        const sourcePath = path.join(getDocsDir(dominio), safeFileName);

        if (!fs.existsSync(sourcePath)) {
            return res.status(404).json({ error: "El archivo fuente no existe" });
        }

        const sourceText = await readDocumentTextForProcessing(sourcePath);
        if (!sourceText.trim()) {
            return res.status(400).json({ error: "No se pudo extraer contenido utilizable del archivo" });
        }

        const requestedOutputType = String(outputType || "docx").toLowerCase() === "txt"
            ? "txt"
            : String(outputType || "docx").toLowerCase() === "md"
                ? "md"
                : "docx";
        const normalizedFormatting = normalizeDocumentFormat(formatting, requestedOutputType);
        const effectiveInstructions = safeInstructions || "Aplicá al documento únicamente los cambios explícitos que surgen de la conversación reciente. Si la conversación fue solo exploratoria, devolvé un borrador claro y fiel al contenido original.";

        const currentEditableContent = (safeBaseContent || sourceText || "").trim();

        if (currentEditableContent.length < 40) {
            return res.status(400).json({
                error: "No se pudo extraer texto suficiente del archivo para editarlo. Probá con un PDF con texto seleccionable o con un archivo .docx."
            });
        }

        const systemPrompt = `Sos un editor documental privado. Tu tarea es modificar el contenido real del documento según lo pedido por el usuario. Si existe una última versión ya modificada, debés aplicar los nuevos cambios SOBRE esa última versión y no volver al original salvo que el usuario lo pida. No inventes información nueva que no esté respaldada en el texto base ni por el propio usuario. No repitas instrucciones, no describas acciones, no hagas comentarios meta y no copies etiquetas como PREVIEW, CONVERSACIÓN RECIENTE, Arial, 12 pt o Alineación. Debés devolver únicamente el contenido final del documento.`;

        const prompt = `Documento activo: ${safeFileName}

Texto base para editar:
"""
${currentEditableContent.slice(0, 24000)}
"""

Pedidos del usuario:
${effectiveInstructions}

Contexto adicional del chat:
${conversationText || "Sin contexto adicional"}

Instrucción final: entregá únicamente la nueva versión del documento ya modificada. No expliques qué hiciste y no repitas el pedido.`;

        const generatedContent = cleanGeneratedDocumentText(await editorLLM.generate(prompt, systemPrompt));

        if (previewOnly) {
            return res.json({
                message: "Vista previa generada correctamente",
                sourceFile: safeFileName,
                dominio,
                outputType: "preview",
                formatting: normalizedFormatting,
                preview: generatedContent.slice(0, 12000),
                workingContent: generatedContent
            });
        }

        const generatedDir = getGeneratedDir(dominio);
        const extension = requestedOutputType === "txt"
            ? ".txt"
            : requestedOutputType === "md"
                ? ".md"
                : ".docx";
        const generatedFile = `${Date.now()}-${sanitizeGeneratedBaseName(safeFileName)}-resultado${extension}`;
        const targetPath = path.join(generatedDir, generatedFile);

        if (requestedOutputType === "docx") {
            const docxBuffer = await createDocxBuffer(generatedContent, normalizedFormatting, {
                title: `Documento generado - ${safeFileName}`,
                description: `Versión generada a partir de ${safeFileName}`
            });
            fs.writeFileSync(targetPath, docxBuffer);
        } else {
            fs.writeFileSync(targetPath, generatedContent, "utf8");
        }

        return res.json({
            message: requestedOutputType === "docx"
                ? "Documento Word generado correctamente"
                : "Archivo generado correctamente",
            sourceFile: safeFileName,
            generatedFile,
            dominio,
            outputType: requestedOutputType,
            formatting: normalizedFormatting,
            downloadUrl: `/rag/generated/${encodeURIComponent(dominio)}/${encodeURIComponent(generatedFile)}`,
            preview: generatedContent.slice(0, 4000),
            workingContent: generatedContent
        });
    } catch (error) {
        console.error("Error generando documento desde archivo:", error.message);
        return res.status(500).json({ error: error.message || "No se pudo generar el archivo" });
    }
});

app.get("/rag/generated/:dominio/:filename", (req, res) => {
    try {
        const dominio = req.params.dominio || "editor";
        const requestedFileName = decodeURIComponent(req.params.filename || "");
        const safeFileName = path.basename(requestedFileName);
        const baseDir = path.resolve(getGeneratedDir(dominio));
        const filePath = path.resolve(path.join(baseDir, safeFileName));

        if (!filePath.startsWith(baseDir) || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Archivo generado no encontrado" });
        }

        res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
        return res.sendFile(filePath);
    } catch (error) {
        console.error("Error sirviendo archivo generado:", error.message);
        return res.status(500).json({ error: "No se pudo descargar el archivo generado" });
    }
});

app.get("/rag/file/:dominio/:filename", (req, res) => {
    try {
        const dominio = req.params.dominio || "general";
        const requestedFileName = decodeURIComponent(req.params.filename || "");
        const safeFileName = path.basename(requestedFileName);
        const baseDir = path.resolve(path.join("rag", dominio, "docs"));
        const filePath = path.resolve(path.join(baseDir, safeFileName));

        if (!filePath.startsWith(baseDir) || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Archivo no encontrado" });
        }

        res.setHeader("Content-Disposition", `inline; filename="${safeFileName}"`);
        return res.sendFile(filePath);
    } catch (error) {
        console.error("Error sirviendo archivo RAG:", error.message);
        return res.status(500).json({ error: "No se pudo abrir el archivo solicitado" });
    }
});

// ==============================
// ENDPOINTS LEGACY (mantener compatibilidad)
// ==============================

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
 * ENDPOINT PARA PDF (análisis directo sin RAG)
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
 * Endpoint básico de chat (sin RAG)
 */
app.post("/chat", async (req, res) => {
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

// ==============================
// HEALTH CHECK
// ==============================

app.get("/", (req, res) => {
    res.json({
        message: "Servidor IA Multi-Agente funcionando 🚀",
        version: "2.0.0",
        agentes: Object.keys(agentes).length,
        endpoints: {
            "POST /agente/auto": "Pregunta con selección automática de agente",
            "POST /agente/:nombre": "Pregunta a un agente específico",
            "GET /agentes": "Lista agentes disponibles",
            "POST /rag/upload/:dominio": "Subir documento a un dominio",
            "POST /rag/upload": "Subir documento (compatibilidad)"
        }
    });
});

app.listen(3000, () => {
    console.log("🚀 Backend Multi-Agente escuchando en puerto 3000");
    console.log(`📚 Agentes disponibles: ${Object.keys(agentes).join(", ")}`);
});
