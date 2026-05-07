# Active Tasks — Servidor IA

**Actualizado:** 2026-05-08

## Estado: TODAS LAS FASES COMPLETADAS ✅

---

### TAREA-001 — Fix LLMService constructor ✅ COMPLETADO
- Constructor ahora acepta `options = {numCtx, numPredict, temperature}`
- editorLLM usa 6144 ctx correctamente

### TAREA-002 — Fix isIndexed() ✅ COMPLETADO
- Verifica chunks.length > 0, no solo existencia del archivo
- Protege contra JSON malformado

### TAREA-003 — Fix modelos hardcoded "llama3" ✅ COMPLETADO
- soporteTecnico, pasaporte, atencionDNI, documental, conversacional, AgenteBase
- Todos usan `process.env.MODELO_TEXTO || "qwen2.5:3b"`

### TAREA-004 — Registrar agentes pasaporte y atencionDNI ✅ COMPLETADO
- Importados y registrados en `agentes/index.js`

### TAREA-005 — Atomic writes en indexDocs() ✅ COMPLETADO
- Escribe a `.tmp` y luego renameSync

### TAREA-006 — Rediseño del Editor ✅ COMPLETADO
- Creado `services/EditorService.js` con lógica encapsulada
- Endpoint `/editor/chat` reescrito - ya NO depende de JSON del LLM
- Usa generación de texto directo (confiable con modelos pequeños)
- Flujos: question / proposal / edit / direct_replace
- `editorLLM` centralizado en EditorService

---

## Fase 3 — Pendiente (Mejoras RAG)

### TAREA-007 — Sentence-aware chunking ✅ COMPLETADO
- `splitSentenceAware()` + `splitCharBased()` en RAGBase.js

### TAREA-008 — Incremental indexing ✅ COMPLETADO
- `manifest.json` con SHA-256 por archivo. Solo re-indexa cambios.

### TAREA-009 — Keywords agentSelector ✅ COMPLETADO
- Añadidas reglas para `pasaporte` y `atencionDNI`

---

## Fase 4 — Modularización ✅ COMPLETADO

### TAREA-010 — Modularizar index.js ✅ COMPLETADO
- `backend/routes/agentes.js` — endpoints de agentes
- `backend/routes/rag.js` — endpoints RAG/upload/files
- `backend/routes/editor.js` — endpoints editor + helpers
- `backend/routes/legacy.js` — /vision, /analizar-pdf, /chat
- `backend/utils/ragUtils.js` — utilidades de archivo compartidas
- `backend/utils/docxUtils.js` — utilidades DOCX
- `backend/index.js` reducido a 60 líneas (entry point)

### TAREA-011 — Eliminar código muerto ✅ COMPLETADO
- Eliminadas: parseJsonObjectFromText, tryParseEditorJson, parseEditorResultWithRetry
- Eliminadas: escapeRegExp, extractReplaceInstruction, applyDirectReplacement, extractSafeEditorContent
- Mantenida: normalizeEditorAnswer (en uso en /editor/propuesta-stream)

---

## Próximos pasos sugeridos
- Agregar tests de integración para endpoints principales
- Documentar la API con OpenAPI/Swagger
- Configurar CI/CD pipeline

## Fase 4 — Pendiente (Limpieza)

### TAREA-010 — Dividir index.js en routers modulares
- **Estado:** PENDIENTE
- **Descripción:** index.js tiene ~1300 líneas. Dividir en router/editor.js, router/rag.js, router/agentes.js

### TAREA-011 — Limpiar funciones muertas en index.js
- **Estado:** PENDIENTE
- **Descripción:** parseEditorResultWithRetry, extractSafeEditorContent ya no se usan después del rediseño del editor.

## Estado de módulos
| Módulo | Estado |
|--------|--------|
| Agentes base (AgenteBase) | ✅ Funcional |
| RAG Base | ✅ Mejorado (atomic write, isIndexed fix) |
| LLMService | ✅ Constructor corregido (acepta options) |
| AgentSelector | ✅ Funcional |
| AgentHandler | ✅ Funcional |
| EditorService | ✅ Nuevo - texto directo sin JSON |
| Editor endpoints | ✅ /editor/chat rediseñado |
| Upload/Index flow | ✅ Funcional |
| Frontend Chat | ✅ Funcional |
| Frontend Upload | ✅ Funcional |
