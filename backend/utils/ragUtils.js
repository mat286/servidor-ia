import fs from "fs";
import path from "path";
import multer from "multer";
import { createHash } from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const wordExtractor = new WordExtractor();

export const uploadDocs = multer({
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

export function getDocsDir(dominio = "general") {
    const dir = path.join("rag", dominio, "docs");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

export function getGeneratedDir(dominio = "general") {
    const dir = path.join("rag", dominio, "generated");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

export function normalizeUploadName(fileName = "") {
    return String(fileName).trim().toLowerCase();
}

export function stripTimestampPrefix(fileName = "") {
    return String(fileName).replace(/^\d+-/, "");
}

export function getFileHash(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

export function validateDuplicateUpload(targetDir, file) {
    const originalName = normalizeUploadName(file.originalname);
    const files = fs.readdirSync(targetDir);

    for (const existingFile of files) {
        const fullPath = path.join(targetDir, existingFile);
        if (!fs.statSync(fullPath).isFile()) continue;
        if (normalizeUploadName(stripTimestampPrefix(existingFile)) === originalName) {
            return { duplicate: true, duplicateType: "name", existingFile };
        }
    }

    const incomingHash = getFileHash(file.buffer);

    for (const existingFile of files) {
        const fullPath = path.join(targetDir, existingFile);
        if (!fs.statSync(fullPath).isFile()) continue;
        const existingHash = getFileHash(fs.readFileSync(fullPath));
        if (existingHash === incomingHash) {
            return { duplicate: true, duplicateType: "content", existingFile };
        }
    }

    return { duplicate: false };
}

export function saveUploadedDocument(targetDir, file) {
    const storedFileName = `${Date.now()}-${file.originalname}`;
    const targetPath = path.join(targetDir, storedFileName);
    fs.writeFileSync(targetPath, file.buffer);
    return storedFileName;
}

export function sanitizeGeneratedBaseName(fileName = "resultado") {
    return stripTimestampPrefix(path.parse(fileName).name)
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "resultado";
}

export function buildFileDescriptor(dominio, fileName) {
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

export async function readDocumentTextForProcessing(filePath) {
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

export function formatConversationHistoryForEditor(history = []) {
    if (!Array.isArray(history)) return "";
    return history
        .filter(item => item && item.content && item.role !== "assistant")
        .slice(-10)
        .map(item => {
            const content = String(item.content).trim().slice(0, 1200);
            return `Usuario: ${content}`;
        })
        .join("\n");
}

export function cleanGeneratedDocumentText(text = "") {
    return String(text ?? "")
        .replace(/\r/g, "")
        .replace(/^\s*(PREVIEW|VISTA PREVIA|DOCUMENTO FINAL|BORRADOR)\s*$/gim, "")
        .replace(/^\s*(Arial|Calibri|Times New Roman)\s*$/gim, "")
        .replace(/^\s*\d+(?:[.,]\d+)?\s*pt\s*$/gim, "")
        .replace(/^\s*Sangr[ií]a.*$/gim, "")
        .replace(/^\s*Alineaci[oó]n:.*$/gim, "")
        .replace(/^\s*(CONVERSACI[ÓO]N RECIENTE|FORMATO DE SALIDA|ARCHIVO ACTIVO|DOCUMENTO ORIGINAL|DOCUMENTO FUENTE|BASE ACTUAL PARA EDITAR)\s*$/gim, "")
        .replace(/^\s*```(?:\w+)?\s*$/gim, "")
        .replace(/^\s*"{3}\s*$/gim, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function normalizeEditorAnswer(text = "") {
    return String(text || "")
        .replace(/^\s*(respuesta|answer)\s*:\s*/i, "")
        .trim();
}
