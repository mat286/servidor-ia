import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import axios from "axios";
import { agentes } from "./agentes/index.js";
import { logger } from "./services/logger.js";
import { requestContextMiddleware, notFoundMiddleware, errorHandlerMiddleware } from "./middleware/requestContext.js";
import agentesRouter from "./routes/agentes.js";
import ragRouter from "./routes/rag.js";
import editorRouter from "./routes/editor.js";
import legacyRouter from "./routes/legacy.js";

const app = express();
const requestLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes, intentá nuevamente en unos minutos", errorCode: "RATE_LIMIT_EXCEEDED" }
});

app.set("trust proxy", 1);
app.use(helmet());
app.use(requestLimiter);
// CORS restringido: aceptar localhost, 127.0.0.1 y variable de entorno
const allowedOrigins = [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
].concat(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("CORS no permitido"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"]
}));
app.options("*", cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestContextMiddleware);
// Routers
app.use(agentesRouter);
app.use(ragRouter);
app.use(editorRouter);
app.use(legacyRouter);
// ==============================
// HEALTH CHECK
// ==============================

// Estado global del sistema
let ollamaHealthy = false;
let lastOllamaCheck = null;

// Verificar salud de Ollama
async function checkOllamaHealth() {
    try {
        const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
        const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
        ollamaHealthy = response.status === 200;
        lastOllamaCheck = new Date().toISOString();
        return ollamaHealthy;
    } catch (error) {
        ollamaHealthy = false;
        lastOllamaCheck = new Date().toISOString();
        logger.warn("system.ollama_health_check_failed", { error: error.message });
        return false;
    }
}

// Health check periódico (cada 30s)
setInterval(checkOllamaHealth, 30000);

app.get("/health", async (req, res) => {
    const indexStatus = {};
    for (const [nombre, agente] of Object.entries(agentes)) {
        indexStatus[nombre] = {
            indexed: agente.rag.isIndexed(),
            chunks: agente.rag.cachedChunks ? agente.rag.cachedChunks.length : 0
        };
    }

    res.json({
        status: ollamaHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        ollama: {
            healthy: ollamaHealthy,
            lastCheck: lastOllamaCheck
        },
        indices: indexStatus,
        agentes: Object.keys(agentes).length,
        version: "2.0.0"
    });
});

app.get("/", (req, res) => {
    res.json({
        message: "Servidor IA Multi-Agente funcionando 🚀",
        version: "2.0.0",
        agentes: Object.keys(agentes).length,
        endpoints: {
            "POST /agente/auto": "Pregunta con selección automática de agente",
            "POST /agente/:nombre": "Pregunta a un agente específico",
            "GET /agentes": "Lista agentes disponibles",
            "GET /health": "Estado de salud del sistema",
            "POST /rag/upload/:dominio": "Subir documento a un dominio",
            "POST /rag/upload": "Subir documento (compatibilidad)"
        }
    });
});
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

// Startup
app.listen(3000, async () => {
    logger.info("system", "Servidor iniciado", {
        port: 3000,
        agentes: Object.keys(agentes),
        timestamp: new Date().toISOString()
    });

    // Health check inicial
    const isHealthy = await checkOllamaHealth();
    if (isHealthy) {
        logger.info("system", "Ollama disponible", { url: process.env.OLLAMA_URL || "http://localhost:11434" });
    } else {
        logger.warn("system", "Ollama no está disponible. El servidor funcionará pero sin capacidades de IA.", {
            url: process.env.OLLAMA_URL || "http://localhost:11434"
        });
    }
});
