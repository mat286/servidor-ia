import { randomUUID } from "crypto";
import { logger } from "../services/logger.js";

export function requestContextMiddleware(req, res, next) {
    const requestId = req.headers["x-request-id"] || randomUUID();
    const start = Date.now();

    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    res.on("finish", () => {
        const durationMs = Date.now() - start;
        logger.info("request.completed", {
            requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs
        });
    });

    next();
}

export function notFoundMiddleware(req, res) {
    return res.status(404).json({
        error: "Endpoint no encontrado",
        errorCode: "NOT_FOUND",
        requestId: req.requestId || null
    });
}

export function errorHandlerMiddleware(err, req, res, next) {
    const statusCode = Number(err?.statusCode) || 500;

    logger.error("request.failed", {
        requestId: req.requestId || null,
        method: req.method,
        path: req.originalUrl,
        statusCode,
        error: err?.message || "Error inesperado"
    });

    if (res.headersSent) {
        return next(err);
    }

    return res.status(statusCode).json({
        error: err?.message || "Error interno del servidor",
        errorCode: err?.errorCode || "INTERNAL_ERROR",
        requestId: req.requestId || null
    });
}
