import { Router } from "express";
import fs from "fs";
import path from "path";
import { agentes } from "../agentes/index.js";
import { enqueueIndexingTask } from "../services/indexingQueue.js";
import {
    uploadDocs,
    getDocsDir,
    getGeneratedDir,
    buildFileDescriptor,
    sanitizeGeneratedBaseName,
    validateDuplicateUpload,
    saveUploadedDocument
} from "../utils/ragUtils.js";

const router = Router();

router.post("/rag/upload/:dominio", uploadDocs.single("file"), async (req, res) => {
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
        const resultado = await enqueueIndexingTask(dominio, () => agente.indexarDocumentos(docsDir));

        res.json({
            message: "Archivo cargado e indexado correctamente",
            file: storedFileName,
            dominio,
            resultado
        });
    } catch (err) {
        console.error("Error en upload:", err);
        res.status(500).json({ error: err.message || "Error indexando documentos" });
    }
});

router.post("/rag/upload", uploadDocs.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No se envió archivo" });
        }

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
        const resultado = await enqueueIndexingTask(dominio, () => agente.indexarDocumentos(targetDir));

        res.json({
            message: "Archivo cargado e indexado correctamente",
            file: storedFileName,
            dominio,
            resultado
        });
    } catch (err) {
        console.error("Error en upload:", err);
        res.status(500).json({ error: err.message || "Error indexando documentos" });
    }
});

router.get("/rag/files/:dominio", (req, res) => {
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

router.delete("/rag/files/:dominio/:filename", async (req, res) => {
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
        const resultado = await enqueueIndexingTask(dominio, () => agente.indexarDocumentos(docsDir));

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

router.get("/rag/generated/:dominio/:filename", (req, res) => {
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

router.get("/rag/file/:dominio/:filename", (req, res) => {
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

export default router;
