/**
 * Validadores livianos de payload para endpoints del sistema
 */

export function validateAgentRequest(body = {}) {
    const errors = [];
    const payload = body && typeof body === "object" ? body : {};

    const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    if (!prompt) {
        errors.push("'prompt' es requerido y debe ser string no vacío");
    }

    const history = Array.isArray(payload.history) ? payload.history : [];
    if (payload.history !== undefined && !Array.isArray(payload.history)) {
        errors.push("'history' debe ser un arreglo cuando se envía");
    }

    const normalizedHistory = history
        .slice(-12)
        .map((item) => ({
            role: item?.role === "assistant" ? "assistant" : "user",
            content: String(item?.content || "").trim().slice(0, 1200)
        }))
        .filter((item) => item.content.length > 0);

    const stream = payload.stream === true;

    return {
        valid: errors.length === 0,
        errors,
        data: {
            prompt,
            history: normalizedHistory,
            stream
        }
    };
}

export function validateEditorChatRequest(body = {}) {
    const payload = body && typeof body === "object" ? body : {};
    const errors = [];

    const prompt = String(payload.prompt || "").trim();
    const filename = String(payload.filename || "").trim();

    if (!prompt) errors.push("'prompt' es requerido");
    if (!filename) errors.push("'filename' es requerido");

    return {
        valid: errors.length === 0,
        errors,
        data: {
            prompt,
            filename,
            baseContent: String(payload.baseContent || ""),
            conversationHistory: Array.isArray(payload.conversationHistory) ? payload.conversationHistory : [],
            applyChanges: Boolean(payload.applyChanges)
        }
    };
}

export function validationErrorResponse(res, errors = []) {
    return res.status(400).json({
        error: "Payload inválido",
        errorCode: "VALIDATION_ERROR",
        details: errors
    });
}
