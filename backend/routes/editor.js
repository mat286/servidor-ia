import { Router } from "express";
import fs from "fs";
import path from "path";
import { editorLLM, processEditorChat } from "../services/EditorService.js";
import {
    textToStructuredBlocks,
    applyDocumentOperations,
    structuredBlocksToText
} from "../services/documentStructure.js";
import {
    getDocsDir,
    getGeneratedDir,
    sanitizeGeneratedBaseName,
    cleanGeneratedDocumentText,
    formatConversationHistoryForEditor,
    normalizeEditorAnswer,
    readDocumentTextForProcessing
} from "../utils/ragUtils.js";
import { createDocxBuffer, normalizeDocumentFormat } from "../utils/docxUtils.js";

const router = Router();
const EDITOR_MAX_SOURCE_CHARS = Number(process.env.EDITOR_MAX_SOURCE_CHARS || 20000);

async function resolveEditorSource(filename, baseContent = "") {
    const dominio = "editor";
    let safeFileName = "";
    try {
        safeFileName = path.basename(decodeURIComponent(String(filename || "")));
    } catch {
        const err = new Error("Nombre de archivo inválido");
        err.statusCode = 400;
        throw err;
    }

    if (!safeFileName) {
        const err = new Error("Nombre de archivo inválido");
        err.statusCode = 400;
        throw err;
    }

    const sourcePath = path.join(getDocsDir(dominio), safeFileName);
    const fallbackContent = String(baseContent || "").trim();

    if (!fs.existsSync(sourcePath)) {
        if (fallbackContent.length >= 40) {
            return {
                dominio,
                safeFileName,
                sourceText: fallbackContent,
                currentEditableContent: fallbackContent
            };
        }
        const err = new Error("El archivo fuente no existe");
        err.statusCode = 404;
        throw err;
    }

    let sourceText = "";
    try {
        sourceText = await readDocumentTextForProcessing(sourcePath);
    } catch (readError) {
        if (fallbackContent.length >= 40) {
            sourceText = fallbackContent;
        } else {
            throw readError;
        }
    }

    if (!sourceText.trim()) {
        if (fallbackContent.length >= 40) {
            return {
                dominio,
                safeFileName,
                sourceText: fallbackContent,
                currentEditableContent: fallbackContent
            };
        }
        const err = new Error("No se pudo extraer contenido utilizable del archivo");
        err.statusCode = 400;
        throw err;
    }

    const currentEditableContent = (fallbackContent || sourceText || "").trim();
    if (currentEditableContent.length < 40) {
        const err = new Error("No se pudo extraer texto suficiente del archivo para editarlo. Probá con un PDF con texto seleccionable o con un archivo .docx.");
        err.statusCode = 400;
        throw err;
    }

    return { dominio, safeFileName, sourceText, currentEditableContent };
}

async function generateEditorDraft({
    filename,
    instructions = "",
    outputType = "docx",
    formatting = {},
    conversationHistory = [],
    baseContent = "",
    skipGeneration = false
}) {
    const conversationText = formatConversationHistoryForEditor(conversationHistory);
    const safeInstructions = String(instructions || "").trim();
    const safeBaseContent = String(baseContent || "").trim();

    if (!filename) throw new Error("Se requiere 'filename'");

    if (!safeInstructions && !conversationText && !safeBaseContent) {
        throw new Error("Se requiere una instrucción o una conversación previa para generar el documento");
    }

    const { dominio, safeFileName, currentEditableContent } = await resolveEditorSource(filename, safeBaseContent);

    const requestedOutputType = String(outputType || "docx").toLowerCase() === "txt"
        ? "txt"
        : String(outputType || "docx").toLowerCase() === "md"
            ? "md"
            : "docx";
    const normalizedFormatting = normalizeDocumentFormat(formatting, requestedOutputType);
    const effectiveInstructions = safeInstructions || "Aplicá al documento únicamente los cambios explícitos que surgen de la conversación reciente. Si la conversación fue solo exploratoria, devolvé un borrador claro y fiel al contenido original.";

    if (skipGeneration && safeBaseContent) {
        return { dominio, safeFileName, requestedOutputType, normalizedFormatting, generatedContent: safeBaseContent };
    }

    const systemPrompt = `Sos un editor documental privado. Tu tarea es modificar el contenido real del documento según lo pedido por el usuario. Si existe una última versión ya modificada, debés aplicar los nuevos cambios SOBRE esa última versión y no volver al original salvo que el usuario lo pida. No inventes información nueva que no esté respaldada en el texto base ni por el propio usuario. No repitas instrucciones, no describas acciones, no hagas comentarios meta y no copies etiquetas como PREVIEW, CONVERSACIÓN RECIENTE, Arial, 12 pt o Alineación. Debés devolver únicamente el contenido final del documento.`;

    const prompt = `Documento activo: ${safeFileName}

Texto base para editar:
"""
${currentEditableContent.slice(0, EDITOR_MAX_SOURCE_CHARS)}
"""

Pedidos del usuario:
${effectiveInstructions}

Contexto adicional del chat:
${conversationText || "Sin contexto adicional"}

Instrucción final: entregá únicamente la nueva versión del documento ya modificada. No expliques qué hiciste y no repitas el pedido.`;

    const generatedContent = cleanGeneratedDocumentText(await editorLLM.generate(prompt, systemPrompt));
    return { dominio, safeFileName, requestedOutputType, normalizedFormatting, generatedContent };
}

router.post("/editor/chat", async (req, res) => {
    try {
        const {
            prompt,
            filename,
            baseContent = "",
            conversationHistory = [],
            applyChanges = false
        } = req.body;

        if (!prompt) return res.status(400).json({ error: "Se requiere 'prompt' en el body" });
        if (!filename) return res.status(400).json({ error: "Se requiere 'filename' para editar" });

        const { safeFileName, currentEditableContent } = await resolveEditorSource(filename, baseContent);

        const result = await processEditorChat({
            prompt: String(prompt).trim(),
            safeFileName,
            currentEditableContent,
            conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
            applyChanges: Boolean(applyChanges)
        });

        if (result.modo === "proposal") {
            return res.json({
                respuesta: result.respuesta,
                agente: "editor",
                dominio: "editor",
                modo: "proposal",
                requiereConfirmacion: true,
                confirmacion: {
                    tipo: "editor_propuesta",
                    accion: "aplicar_cambios",
                    promptOriginal: String(prompt).trim()
                },
                citas: [],
                sinInformacion: false,
                archivo: {
                    sourceFile: safeFileName,
                    outputType: "preview",
                    originalContent: currentEditableContent.slice(0, 12000),
                    preview: currentEditableContent.slice(0, 12000),
                    workingContent: currentEditableContent,
                    modified: false
                }
            });
        }

        const editedContent = result.editedContent || currentEditableContent;
        return res.json({
            respuesta: result.respuesta || "Documento procesado.",
            agente: "editor",
            dominio: "editor",
            citas: [],
            sinInformacion: false,
            archivo: {
                sourceFile: safeFileName,
                outputType: "preview",
                originalContent: currentEditableContent.slice(0, 30000),
                preview: editedContent.slice(0, 30000),
                workingContent: editedContent,
                modified: result.modified || false,
                replacementApplied: result.replacementApplied || 0,
                operationsApplied: 0
            }
        });
    } catch (error) {
        console.error("Error en /editor/chat:", error.message);
        const statusCode = Number(error.statusCode) || 500;
        return res.status(statusCode).json({ error: error.message || "No se pudo procesar el chat del editor" });
    }
});

router.post("/editor/propuesta-stream", async (req, res) => {
    try {
        const { prompt, filename, baseContent = "" } = req.body;

        if (!prompt) return res.status(400).json({ error: "Se requiere 'prompt' en el body" });
        if (!filename) return res.status(400).json({ error: "Se requiere 'filename' para proponer cambios" });

        const { safeFileName, currentEditableContent } = await resolveEditorSource(filename, baseContent);

        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        });

        const proposalId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        res.write(`data: ${JSON.stringify({ type: "meta", agente: "editor", dominio: "editor", proposalId })}\n\n`);

        const proposalSystemPrompt = `Sos un editor documental. Explicá en español claro qué cambios aplicarías sobre el documento si el usuario confirma. No devuelvas JSON ni edites todavía el documento.`;
        const proposalPrompt = `Archivo: ${safeFileName}\n\nPedido del usuario:\n${String(prompt).trim()}\n\nResumen breve del documento actual:\n${currentEditableContent.slice(0, 2200)}\n\nEntregá una propuesta concreta, breve y accionable.`;

        const proposalText = await editorLLM.generateStream(
            proposalPrompt,
            proposalSystemPrompt,
            (chunk) => {
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
                }
            }
        );

        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({
                type: "done",
                agente: "editor",
                dominio: "editor",
                requiereConfirmacion: true,
                proposalId,
                confirmacion: {
                    tipo: "editor_propuesta",
                    accion: "aplicar_cambios",
                    promptOriginal: String(prompt).trim()
                },
                resumen: normalizeEditorAnswer(proposalText)
            })}\n\n`);
            res.write("data: [DONE]\n\n");
        }

        return res.end();
    } catch (error) {
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message || "No se pudo generar propuesta" });
        }
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Error en propuesta" })}\n\n`);
            res.write("data: [DONE]\n\n");
            return res.end();
        }
    }
});

router.post("/editor/generar-documento", async (req, res) => {
    try {
        const {
            filename,
            instructions = "",
            outputType = "docx",
            formatting = {},
            conversationHistory = [],
            previewOnly = false,
            baseContent = "",
            skipGeneration = false
        } = req.body;

        const {
            dominio,
            safeFileName,
            requestedOutputType,
            normalizedFormatting,
            generatedContent
        } = await generateEditorDraft({
            filename, instructions, outputType, formatting,
            conversationHistory, baseContent, skipGeneration
        });

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
        const extension = requestedOutputType === "txt" ? ".txt"
            : requestedOutputType === "md" ? ".md"
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
        const statusCode = Number(error.statusCode) || 500;
        return res.status(statusCode).json({ error: error.message || "No se pudo generar el archivo" });
    }
});

router.get("/editor/estructura/:filename", async (req, res) => {
    try {
        const filename = req.params.filename;
        const { currentEditableContent, safeFileName } = await resolveEditorSource(filename, "");
        const blocks = textToStructuredBlocks(currentEditableContent);
        return res.json({ sourceFile: safeFileName, totalBlocks: blocks.length, blocks });
    } catch (error) {
        const statusCode = Number(error.statusCode) || 500;
        return res.status(statusCode).json({ error: error.message || "No se pudo obtener la estructura" });
    }
});

router.post("/editor/aplicar-operaciones", async (req, res) => {
    try {
        const { filename, operations = [], baseContent = "" } = req.body;
        if (!filename) return res.status(400).json({ error: "Se requiere 'filename'" });

        const { currentEditableContent, safeFileName } = await resolveEditorSource(filename, baseContent);
        const blocks = textToStructuredBlocks(currentEditableContent);
        const updatedBlocks = applyDocumentOperations(blocks, operations);
        const updatedContent = structuredBlocksToText(updatedBlocks);

        return res.json({
            sourceFile: safeFileName,
            totalBlocks: updatedBlocks.length,
            workingContent: updatedContent,
            preview: updatedContent.slice(0, 12000)
        });
    } catch (error) {
        const statusCode = Number(error.statusCode) || 500;
        return res.status(statusCode).json({ error: error.message || "No se pudieron aplicar operaciones" });
    }
});

export default router;
