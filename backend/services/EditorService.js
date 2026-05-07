// EditorService — Servicio centralizado del agente editor
// Elimina dependencia de JSON output del LLM (inestable en modelos 3B)
// Usa generación de texto directo para mayor confiabilidad

import fs from "fs";
import path from "path";
import pdf from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { LLMService } from "./llm.js";

const wordExtractor = new WordExtractor();
const MODELO_TEXTO_DEFAULT = process.env.MODELO_TEXTO || "qwen2.5:3b";
const MODELO_EDITOR = process.env.MODELO_EDITOR || "qwen2.5:1.5b";
const MODELO_EDITOR_FALLBACK = process.env.MODELO_EDITOR_FALLBACK || "qwen2.5:0.5b";
const EDITOR_MAX_SOURCE_CHARS = Number(process.env.EDITOR_MAX_SOURCE_CHARS || 1200);

// LLM dedicado para el editor — valores calibrados para CPU sin GPU
export const editorLLM = new LLMService(MODELO_EDITOR, {
    numCtx: Number(process.env.OLLAMA_EDITOR_NUM_CTX || 1536),
    numPredict: Number(process.env.OLLAMA_EDITOR_NUM_PREDICT || 256),
    temperature: Number(process.env.OLLAMA_EDITOR_TEMPERATURE || 0.1),
    timeout: Number(process.env.OLLAMA_EDITOR_TIMEOUT_MS || 45000)
});

// Fallback del editor para evitar bloquear UX por timeout
export const editorLLMFallback = new LLMService(MODELO_EDITOR_FALLBACK, {
    numCtx: Number(process.env.OLLAMA_EDITOR_FALLBACK_NUM_CTX || 1024),
    numPredict: Number(process.env.OLLAMA_EDITOR_FALLBACK_NUM_PREDICT || 180),
    temperature: Number(process.env.OLLAMA_EDITOR_FALLBACK_TEMPERATURE || 0.1),
    timeout: Number(process.env.OLLAMA_EDITOR_FALLBACK_TIMEOUT_MS || 25000)
});

// Último fallback: reutiliza el modelo de texto general si faltan modelos del editor.
export const editorLLMTextFallback = new LLMService(MODELO_TEXTO_DEFAULT, {
    numCtx: Number(process.env.OLLAMA_NUM_CTX || 2048),
    numPredict: Number(process.env.OLLAMA_NUM_PREDICT || 256),
    temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.2),
    timeout: Number(process.env.OLLAMA_TIMEOUT_MS || 180000)
});

function isLikelyTimeoutError(error) {
    const message = String(error?.message || "").toLowerCase();
    return /timeout|timed out|econnaborted|etimedout|econnreset/.test(message);
}

function isLikelyModelNotFoundError(error) {
    const message = String(error?.message || "").toLowerCase();
    return /status code 404|model.*not found|not found/.test(message);
}

async function generateWithEditorFallback(prompt, systemPrompt) {
    try {
        return await editorLLM.generate(prompt, systemPrompt, false);
    } catch (error) {
        if (!isLikelyTimeoutError(error) && !isLikelyModelNotFoundError(error)) {
            throw error;
        }

        try {
            return await editorLLMFallback.generate(prompt, systemPrompt, false);
        } catch (fallbackError) {
            if (!isLikelyTimeoutError(fallbackError) && !isLikelyModelNotFoundError(fallbackError)) {
                throw fallbackError;
            }

            return await editorLLMTextFallback.generate(prompt, systemPrompt, false);
        }
    }
}

// ────────────────────────────────────────────────
// UTILIDADES DE TEXTO
// ────────────────────────────────────────────────

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

export function formatConversationHistoryForEditor(history = []) {
    if (!Array.isArray(history)) return "";

    return history
        .filter(item => item && item.content && item.role !== "assistant")
    .slice(-3)
    .map(item => `Usuario: ${String(item.content).trim().slice(0, 600)}`)
        .join("\n");
}

export function isLikelyEditRequest(prompt = "") {
    const normalized = String(prompt || "").toLowerCase();
    return /(resum|reescri|correg|edit|modific|cambi|ajust|elimin|quit|borr|agreg|complet|orden|mejor|adapt|convert|unific|redact|simplific|abrevi|expand|formate|limpi|pul|estructura)/.test(normalized);
}

function escapeRegExp(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractReplaceInstruction(prompt = "") {
    const text = String(prompt || "")
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'");

    const patterns = [
        /(?:cambi(?:a|ar|e|á)\s+la\s+palabra|reemplaz(?:a|ar|e|á)|sustitu(?:i|í|ye|ir))\s+["']?([^"'\n]+?)["']?\s+(?:por|a)\s+["']?([^"'\n]+?)["']?(?=[\s.,;!?]|$)/i,
        /["']([^"'\n]+)["']\s*(?:->|=>)\s*["']([^"'\n]+)["']/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const from = String(match[1] || "").trim().replace(/[.,;!?]+$/, "");
            const to = String(match[2] || "").trim().replace(/[.,;!?]+$/, "");
            if (from && to) return { from, to };
        }
    }

    return null;
}

export function applyDirectReplacement(content = "", from = "", to = "") {
    const safeFrom = String(from || "").trim();
    const safeTo = String(to || "");
    if (!safeFrom) return { content: String(content || ""), replacements: 0 };

    const escaped = escapeRegExp(safeFrom);
    const isSimpleWord = /^[a-zA-Z0-9_]+$/.test(safeFrom);
    const regex = new RegExp(isSimpleWord ? `\\b${escaped}\\b` : escaped, "gi");
    let replacements = 0;
    const replaced = String(content || "").replace(regex, () => {
        replacements += 1;
        return safeTo;
    });

    return { content: replaced, replacements };
}

// ────────────────────────────────────────────────
// LECTURA DE DOCUMENTOS
// ────────────────────────────────────────────────

export async function readDocumentText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".txt" || ext === ".md") {
        return fs.readFileSync(filePath, "utf8");
    }

    if (ext === ".pdf") {
        const buffer = fs.readFileSync(filePath);
        const data = await pdf(buffer);
        return (data.text || "").trim();
    }

    if (ext === ".docx") {
        const result = await mammoth.extractRawText({ path: filePath });
        return String(result.value || "").trim();
    }

    if (ext === ".doc") {
        const extracted = await wordExtractor.extract(filePath);
        return String(extracted?.getBody?.() || "").trim();
    }

    throw new Error(`Formato no soportado para edición: ${ext}`);
}

/**
 * Resuelve el archivo fuente del editor y extrae su contenido.
 * Lanza error con statusCode apropiado si falla.
 */
export async function resolveEditorSource(docsDir, filename, baseContent = "") {
    const safeFileName = path.basename(decodeURIComponent(String(filename || "")));
    if (!safeFileName) {
        const err = new Error("Nombre de archivo inválido");
        err.statusCode = 400;
        throw err;
    }

    const sourcePath = path.join(docsDir, safeFileName);

    if (!fs.existsSync(sourcePath)) {
        const err = new Error("El archivo fuente no existe");
        err.statusCode = 404;
        throw err;
    }

    const sourceText = await readDocumentText(sourcePath);

    if (!sourceText.trim()) {
        const err = new Error("No se pudo extraer contenido utilizable del archivo");
        err.statusCode = 400;
        throw err;
    }

    const currentEditableContent = (String(baseContent || "").trim() || sourceText).trim();

    if (currentEditableContent.length < 40) {
        const err = new Error(
            "No se pudo extraer texto suficiente del archivo para editarlo. " +
            "Probá con un PDF con texto seleccionable o con un archivo .docx."
        );
        err.statusCode = 400;
        throw err;
    }

    return { safeFileName, sourceText, currentEditableContent };
}

// ────────────────────────────────────────────────
// GENERACIÓN DE CONTENIDO — TEXTO DIRECTO (sin JSON)
// ────────────────────────────────────────────────

/**
 * Genera el documento editado usando generación de texto puro.
 * NO depende de JSON output del LLM — mucho más confiable con modelos pequeños.
 */
export async function generateEditedContent({
    safeFileName,
    currentEditableContent,
    instruction,
    conversationHistory = []
}) {
    const conversationText = formatConversationHistoryForEditor(conversationHistory);

    const systemPrompt = `Editor de documentos. Devolvé SOLO el texto modificado según la instrucción, sin explicaciones ni comentarios. Mismo idioma del original.`;

    const prompt = `Archivo: ${safeFileName}

Texto actual del documento:
"""
${currentEditableContent.slice(0, EDITOR_MAX_SOURCE_CHARS)}
"""

Instrucción del usuario:
${instruction}
${conversationText ? `\nContexto de la conversación previa:\n${conversationText}` : ""}

Devolvé ÚNICAMENTE el texto del documento modificado:`;

    const rawContent = await generateWithEditorFallback(prompt, systemPrompt);
    return cleanGeneratedDocumentText(rawContent);
}

/**
 * Genera una propuesta breve de qué cambios se aplicarían.
 * Para el flujo de confirmación antes de editar.
 */
export async function generateProposal({ safeFileName, currentEditableContent, instruction }) {
    const systemPrompt = `Editor de documentos. Explicá en máximo 4 líneas qué cambios harías si el usuario confirma. No edites el documento. Respondé en español.`;

    const prompt = `Archivo: ${safeFileName}

Instrucción del usuario:
${instruction}

Contenido actual del documento (extracto):
"""
${currentEditableContent.slice(0, 1200)}
"""

¿Qué cambios aplicarías si el usuario confirma?`;

    return await generateWithEditorFallback(prompt, systemPrompt);
}

/**
 * Responde preguntas sobre el documento sin modificarlo.
 */
export async function answerDocumentQuestion({ safeFileName, currentEditableContent, question }) {
    const systemPrompt = `Asistente de documentos. Respondé basándote solo en el contenido provisto. Si no está en el documento, indicalo. Respondé en español.`;

    const prompt = `Documento: ${safeFileName}

Contenido:
"""
${currentEditableContent.slice(0, EDITOR_MAX_SOURCE_CHARS)}
"""

Pregunta: ${question}

Respuesta:`;

    return await generateWithEditorFallback(prompt, systemPrompt);
}

// ────────────────────────────────────────────────
// FLUJO PRINCIPAL DEL EDITOR CHAT
// ────────────────────────────────────────────────

/**
 * Procesa una solicitud del editor chat.
 * Retorna un objeto con respuesta y contenido editado.
 * 
 * Flujo:
 * 1. Reemplazo directo (sin LLM) si la instrucción es literal
 * 2. Si isEdit y !applyChanges → propuesta de cambios
 * 3. Si isEdit y applyChanges → generar documento editado (texto directo)
 * 4. Si es pregunta → responder sobre el documento
 */
export async function processEditorChat({
    prompt,
    safeFileName,
    currentEditableContent,
    conversationHistory = [],
    applyChanges = false
}) {
    const isEdit = isLikelyEditRequest(prompt) || applyChanges;

    // 1. Intento de reemplazo directo (sin LLM)
    if (applyChanges) {
        const replaceInstruction = extractReplaceInstruction(prompt);
        if (replaceInstruction) {
            const result = applyDirectReplacement(
                currentEditableContent,
                replaceInstruction.from,
                replaceInstruction.to
            );

            if (result.replacements > 0) {
                return {
                    respuesta: `Reemplazé "${replaceInstruction.from}" por "${replaceInstruction.to}" (${result.replacements} ocurrencia${result.replacements > 1 ? "s" : ""}).`,
                    editedContent: result.content,
                    modified: true,
                    replacementApplied: result.replacements,
                    modo: "direct_replace"
                };
            }
        }
    }

    // 2. Propuesta de cambios (sin aplicar)
    if (isEdit && !applyChanges) {
        const proposalText = await generateProposal({
            safeFileName,
            currentEditableContent,
            instruction: prompt
        });

        return {
            respuesta: proposalText || "Entendí el cambio solicitado. Si confirmás, aplico la modificación al archivo.",
            editedContent: currentEditableContent,
            modified: false,
            modo: "proposal",
            requiereConfirmacion: true
        };
    }

    // 3. Edición confirmada → generar texto editado (sin JSON)
    if (isEdit) {
        const editedContent = await generateEditedContent({
            safeFileName,
            currentEditableContent,
            instruction: prompt,
            conversationHistory
        });

        const modified = editedContent.trim() !== currentEditableContent.trim();

        return {
            respuesta: modified
                ? "Documento editado según tus instrucciones. Revisá el preview y descargá cuando estés listo."
                : "No detecté cambios necesarios según la instrucción. El documento quedó igual.",
            editedContent: modified ? editedContent : currentEditableContent,
            modified,
            replacementApplied: 0,
            modo: "edit"
        };
    }

    // 4. Pregunta sobre el documento (sin modificar)
    const answer = await answerDocumentQuestion({
        safeFileName,
        currentEditableContent,
        question: prompt
    });

    return {
        respuesta: answer,
        editedContent: currentEditableContent,
        modified: false,
        modo: "question"
    };
}
