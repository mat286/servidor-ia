# Servidor IA Multi-Agente 🚀

Sistema IA local, privado, sin dependencia de servicios externos. Múltiples agentes especializados por área, RAG con búsqueda híbrida, y editor de documentos inteligente.

**Status:** ✅ Listo para Producción | **Fecha:** 2026-05-08

---

## 📋 Quick Start

### Docker (Recomendado)

```bash
# Clonar
git clone <repo>
cd servidor-ia

# Levantar todo (incluye autoload de modelos)
docker compose up -d --build

# Verificar estado
docker compose ps
```

**URLs:**
- 🎨 Frontend: http://localhost:3001
- 🔌 Backend API: http://localhost:3000
- 🏥 Health Check: http://localhost:3000/health
- 📦 Ollama: http://localhost:11434

**Tiempo:** 5-15 minutos (primer run con descarga de modelos)

---

## 🏗️ Arquitectura

```
Frontend (React/Vite :3001)
    ↓ HTTP/SSE
Backend (Node.js/Express :3000)
    ├── 9 Agentes
    │   ├── conversacional
    │   ├── general, bi, esidif
    │   ├── soporteTecnico, documental
    │   ├── editor (documentos)
    │   ├── pasaporte, atencionDNI
    │   └── cada uno con RAG especializado
    ├── EditorService (4 flujos inteligentes)
    ├── CircuitBreaker (resilencia)
    ├── EmbeddingCache (performance)
    └── ContextCompressor (optimización)
Ollama (:11434)
    ├── qwen2.5:3b (texto)
    ├── nomic-embed-text (embeddings)
    └── llava:7b (visión)
```

---

## 📦 Stack Técnico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 18 + Vite + CSS Modules |
| **Backend** | Node.js 18+ ESM + Express 4 |
| **LLM** | Ollama (modelos locales) |
| **Embeddings** | nomic-embed-text (384 dims) |
| **RAG Storage** | JSON flat-files + embedding_cache |
| **Deploy** | Docker Compose (v2+) |

---

## 🚀 Características Principales

### ✅ Multi-Agente
- 9 agentes especializados por dominio
- Selector automático por keyword + fallback LLM
- RAG independiente por dominio

### ✅ RAG Avanzado
- Chunking sentence-aware (respeta límites naturales)
- Incremental indexing (no re-procesa docs sin cambios)
- Búsqueda híbrida: cosine + keyword overlap
- Scoring equilibrado: 70% vector + 30% keyword

### ✅ Editor Inteligente
- 4 flujos: direct_replace (regex) → proposal → edit → question
- Generación de texto directo (sin JSON)
- Soporta: DOCX, PDF, TXT, MD
- Propuesta + confirmación antes de aplicar

### ✅ Resilencia (Opción C)
- 🛡️ **Circuit Breaker:** Previene cascadas si Ollama cae
- 💾 **Embedding Cache:** Reusar embeddings entre reinicios (-90% startup)
- 🧠 **Context Compression:** Sumarizar RAG largo (opcional)

### ✅ Performance
- Healthchecks automáticos
- Logging estructurado JSON
- Rate limiting configurable
- CORS restringido

---

## 📁 Estructura

```
.
├── backend/
│   ├── index.js (60 líneas — entry point slim)
│   ├── routes/
│   │   ├── agentes.js (endpoints de agentes)
│   │   ├── rag.js (upload, files, RAG)
│   │   ├── editor.js (editor inteligente)
│   │   └── legacy.js (vision, análisis PDF, chat)
│   ├── utils/
│   │   ├── ragUtils.js (helpers RAG)
│   │   └── docxUtils.js (generación DOCX)
│   ├── services/
│   │   ├── llm.js (Ollama wrapper + circuit breaker)
│   │   ├── circuitBreaker.js (NEW — resilencia)
│   │   ├── embeddingCache.js (NEW — performance)
│   │   ├── contextCompressor.js (NEW — optimización)
│   │   ├── EditorService.js (lógica del editor)
│   │   ├── agentSelector.js
│   │   ├── agentHandler.js
│   │   ├── logger.js
│   │   └── ... (otros servicios)
│   ├── agentes/ (9 agentes especializados)
│   └── rag/ (índices RAG por dominio)
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── ChatComponent.jsx
│   │   │   └── DocumentUploadComponent.jsx
│   │   └── ... (estilos, assets)
│   └── vite.config.js
├── docker-compose.yml (OPTIMIZADO con healthchecks)
├── ollama-entrypoint.sh (autoload de modelos)
├── .env.example (todas las variables)
├── DOCKER_DEPLOYMENT.md (guía completa)
├── OPCION_C_IMPROVEMENTS.md (mejoras técnicas)
└── README.md (este archivo)
```

---

## ⚙️ Configuración

### Minimal (.env)

```bash
# Modelos
MODELO_TEXTO=qwen2.5:3b
MODELO_VISION=llava:7b
MODELO_EMBEDDINGS=nomic-embed-text

# Ollama
OLLAMA_NUM_CTX=2048
OLLAMA_TEMPERATURE=0.2

# Resilencia
CIRCUIT_BREAKER_ENABLED=true
RAG_EMBEDDING_CACHE_ENABLED=true

# Deploy
docker compose up -d --build
```

### Full (Todas las opciones)

Ver `.env.example` con todas las variables documentadas.

---

## 🔧 Operación

### Deployar
```bash
docker compose up -d --build
```

### Detener
```bash
docker compose down
```

### Ver logs
```bash
docker compose logs -f backend
docker compose logs -f ollama
docker compose logs -f frontend
```

### Healthcheck
```bash
curl http://localhost:3000/health
```

### Reiniciar un servicio
```bash
docker compose restart backend
```

---

## 📊 APIs Principales

### Agentes
```bash
POST /agente/auto           # Selección automática de agente
POST /agente/:nombre        # Agente específico
GET /agentes                # Listar disponibles
```

### RAG
```bash
POST /rag/upload/:dominio   # Subir documento
GET /rag/files/:dominio     # Listar documentos
DELETE /rag/files/:dominio/:filename
```

### Editor
```bash
POST /editor/chat           # Chat del editor
POST /editor/propuesta-stream  # Streaming de propuesta
POST /editor/generar-documento # Generar archivo
```

### System
```bash
GET /health                 # Health check
GET /                        # API info
```

---

## 🛡️ Security

- ✅ CORS restringido a localhost (configurable)
- ✅ Rate limiting: 300 requests/15min por IP
- ✅ Helmet.js para headers de seguridad
- ✅ Input validation en todos los endpoints
- ⚠️ Sin autenticación (sistema interno)

---

## 📈 Performance

| Métrica | Valor | Nota |
|---------|-------|------|
| **Latencia embedding (cache hit)** | < 1ms | Con embedding cache |
| **Startup del backend** | 30-60s | Con cache persistente |
| **RAG search** | 100-200ms | Depending on chunk size |
| **Editor response** | 2-5s | Con qwen2.5:3b |
| **Embedding cache size** | ~500MB/10k | Configurable |

---

## 🚨 Troubleshooting

### Ollama tarda en descargar

**Esperado:** Primera ejecución descarga ~5-6GB (qwen + embeddings + vision)
- Revisar: `docker compose logs ollama`
- Paciencia: 5-15 min según conexión

### Backend no conecta a Ollama

```bash
docker compose exec ollama ollama list
docker compose logs ollama
docker compose restart ollama
```

### Puerto ya en uso

Editar `docker-compose.yml`:
```yaml
backend:
  ports:
    - "3000:3000"  # Cambiar primer 3000
```

### Disk lleno

```bash
docker image prune -a     # Limpiar imágenes
docker volume prune       # Limpiar volumes
```

---

## 📚 Documentación Completa

- [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) — Deploy, operación, troubleshooting
- [OPCION_C_IMPROVEMENTS.md](OPCION_C_IMPROVEMENTS.md) — Circuit breaker, embedding cache, context compression
- [GUIA_IA_Y_AGENTES.md](GUIA_IA_Y_AGENTES.md) — Arquitectura de agentes, crear nuevos
- [docs/project-memory/](docs/project-memory/) — Contexto técnico del proyecto

---

## 🔄 Próximas Mejoras (Roadmap)

### Fase 6: Testing
- Tests de integración para endpoints
- Validación de flujos end-to-end
- Tests de resilencia

### Fase 7: Observabilidad
- OpenAPI/Swagger documentation
- Métricas Prometheus
- Dashboards Grafana

### Fase 8: Kubernetes (Futuro)
- Helm charts
- Auto-scaling
- Multi-region deployment

---

## 📄 Licencia & Créditos

Sistema interno de oficina/empresa pública.  
Desarrollado: 2026-05-08

---

## 🤝 Support

**Issues o preguntas:**
1. Revisar [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) troubleshooting
2. Ver logs: `docker compose logs -f`
3. Verificar health: http://localhost:3000/health

---

**Made with ❤️ for local, private AI**

├── start.bat
└── start.sh
```

