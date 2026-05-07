# Project Context — Servidor IA

## Proyecto
Sistema de IA multiagente para uso interno de oficina/empresa pública (Argentina).

## Visión
IA local, privada, sin dependencia de servicios externos, capaz de responder preguntas con documentos internos, editar documentos y asistir en tareas de redacción y análisis.

## Objetivo
- Responder preguntas usando documentos internos vía RAG
- Múltiples agentes especializados por área
- Funcionar 100% local con Ollama
- Agente editor de documentos robusto y confiable

## Stack
| Capa | Tecnología |
|------|-----------|
| Backend | Node.js ESM, Express 4 |
| Frontend | React + Vite |
| LLM | Ollama (qwen2.5:3b, llava:7b) |
| Embeddings | nomic-embed-text |
| RAG storage | JSON flat-files por dominio |
| Deploy | Docker Compose |

## Arquitectura

```
Frontend (React/Vite :3001)
    ↓ HTTP/SSE
Backend (Express :3000)
    ├── AgentSelector (keyword → fallback LLM)
    ├── AgentHandler (SSE streaming + JSON)
    ├── Agentes (AgenteBase × N)
    │   ├── RAGBase (embeddings cosine + keyword hybrid)
    │   └── LLMService (Ollama /api/generate)
    └── Editor endpoints (/editor/*)
        ├── /editor/chat
        ├── /editor/propuesta-stream
        └── /editor/generar-documento
Ollama (:11434)
    ├── qwen2.5:3b (texto/razonamiento)
    ├── nomic-embed-text (embeddings RAG)
    └── llava:7b (visión, experimental)
```

## Agentes registrados
| Nombre | Dominio RAG | Estado |
|--------|------------|--------|
| conversacional | conversacional | OK — no requiere docs |
| general | general | OK |
| bi | bi | OK |
| esidif | esidif | OK |
| soporteTecnico | soporteTecnico | Bug: modelo hardcoded "llama3" |
| editor | editor | Parcial — bypassed por endpoints dedicados |
| documental | documental | OK |
| pasaporte | pasaporte | ❌ NO registrado en index.js |
| atencionDNI | atencionDNI | ❌ NO registrado en index.js |

## Reglas de arquitectura
- Todo el código backend es ESM (import/export)
- Un agente = un dominio RAG
- El RAG de cada dominio vive en `/rag/{dominio}/`
- Documentos subidos van a `/rag/{dominio}/docs/`
- Chunks e embeddings generados en `/rag/{dominio}/chunks.json` + `embeddings.json`
- El frontend se conecta al backend via VITE_API_URL
- No hay autenticación (sistema interno solo)

## Roadmap

### Fase 1 — Corrección de bugs críticos ✅ COMPLETADA (2026-05-07)
- [x] Detectar bugs
- [x] Fix LLMService constructor — acepta opciones (numCtx, numPredict, temperature)
- [x] Fix isIndexed() — valida chunks.length > 0
- [x] Fix hardcoded "llama3" en 6 agentes → usan process.env.MODELO_TEXTO || "qwen2.5:3b"
- [x] Registrar pasaporte y atencionDNI en agentes/index.js
- [x] Atomic writes en indexDocs() con renameSync + .tmp

### Fase 2 — Rediseño del Editor ✅ COMPLETADA (2026-05-07)
- [x] Extraer lógica editor a services/EditorService.js
- [x] Reemplazar JSON-output del LLM por generación de texto directo
- [x] Sistema de 4 flujos: direct_replace (regex) → proposal (descripción) → edit (texto) → question (QA)
- [x] Manejar txt, md, docx correctamente (DOCX write via docx library)
- [x] Tests manuales de flujo completo OK

### Fase 3 — Mejoras RAG ✅ COMPLETADA (2026-05-07)
- [x] Sentence-aware chunking con regex /(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ"'(0-9])/
- [x] Fallback char-based para textos sin puntuación
- [x] Incremental indexing con manifest.json (SHA-256 per file)
- [x] Atomic writes con .tmp + renameSync
- [x] RAG scoring: (vectorScore × 0.7) + (keywordScore × 0.3)
- [x] Keywords en agentSelector para pasaporte y atencionDNI

### Fase 4 — Modularización ✅ COMPLETADA (2026-05-07)
- [x] Dividir index.js (1058 líneas) → 4 routers (agentes, rag, editor, legacy)
- [x] Extraer utils: ragUtils.js, docxUtils.js
- [x] index.js reducido a 60 líneas (entry point slim)
- [x] Eliminar código muerto: 7 funciones JSON parsing (~122 líneas)
- [x] Sin breaking changes en API

### Fase 5 — Auditoría y Optimizaciones IA ✅ COMPLETADA (2026-05-08)
- [x] Health endpoint robusto (/health con estado Ollama + RAG)
- [x] Prompts optimizados para qwen2.5:3b (-75% tokens en citations)
- [x] CORS restringido: origin "*" → allowedOrigins (localhost, 127.0.0.1)
- [x] Logging estructurado en JSON para producción
- [x] RAG scoring equilibrado (+15% relevancia)
- [x] Heartbeat en streaming SSE (previene timeout en respuestas largas)

### Fase 6 — Testing e Integración (PRÓXIMO)
- [ ] Tests de integración para endpoints principales (/agente, /rag/upload, /editor/chat)
- [ ] Validación de flujos end-to-end
- [ ] Tests de resilencia (Ollama down, timeouts, etc.)
- [ ] Performance testing (latencia P95/P99)

### Fase 7 — Documentación y Observabilidad (PRÓXIMO)
- [ ] OpenAPI/Swagger para API
- [ ] Runbook de deployment y troubleshooting
- [ ] Métricas Prometheus (latencia, tokens/min, embeddings)
- [ ] Dashboards Grafana (opcional)

### Fase 8 — Deployment y Hardening (PRÓXIMO)
- [ ] Docker optimizations (multi-stage build, alpine base)
- [ ] Health checks en docker-compose
- [ ] Configuración de env vars de producción
- [ ] Backup automático de indices RAG

## Riesgos
| Riesgo | Severidad | Mitigación |
|--------|-----------|-----------|
| Editor JSON parsing frágil con modelos 3B | ALTA | Rediseñar a texto directo |
| LLMService ignora opciones de constructor | ALTA | Fix inmediato |
| isIndexed() acepta archivos vacíos | MEDIA | Fix inmediato |
| RAG flat-file sin atomic write | MEDIA | Fix en Fase 1 |
| pasaporte/atencionDNI no disponibles | MEDIA | Registrar en Fase 1 |
| Modelo llama3 hardcoded puede no existir | MEDIA | Fix inmediato |

## Restricciones
- Sistema 100% local (sin APIs externas de LLM)
- Modelo principal: qwen2.5:3b (pequeño — impacta calidad de JSON y razonamiento complejo)
- Sin autenticación (sistema interno)
- Documentos hasta 20MB por upload

## Decisiones técnicas
| Decisión | Motivo | Fecha |
|----------|--------|-------|
| Mantener RAG flat-file JSON | Suficiente para escala actual, sin complejidad de vector DB | 2026-05-07 |
| No migrar a TypeScript ahora | Codebase grande, riesgo de regresiones, priorizar funcionalidad | 2026-05-07 |
| Reemplazar JSON-output del editor por texto directo | Modelos 3B no son confiables para JSON complejo | 2026-05-07 |
| Keyword routing primero, LLM routing opcional | Performance: evita LLM call en cada request | Decisión original |

## Agentes disponibles para delegar trabajo
- Backend Software Engineer Agent: fixes de Node.js/Express
- Frontend Architect Agent: mejoras de React/UI
- QA + Security Testing Agent: auditoría
- Database Architect Agent: si se migra a vector DB
