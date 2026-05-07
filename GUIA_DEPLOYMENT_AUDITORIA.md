# 📋 GUÍA DE DEPLOYMENT POST-AUDITORÍA

## Versión Anterior → Nueva
**Versión Pre-Auditoría:** 2.0.0  
**Versión Post-Auditoría:** 2.1.0 (recomendado)

---

## ✅ CHECKLIST DE DEPLOYMENT

### Fase 1: Pre-Deployment Validation (15 min)

```bash
# 1. Verificar que no hay errores de sintaxis
npm run lint  # Si existe, sino:
node -c backend/index.js
node -c backend/services/logger.js
node -c backend/services/agentHandler.js

# 2. Verificar que Ollama está corriendo
curl http://localhost:11434/api/tags

# 3. Ver estado actual
curl http://localhost:3000/health  # No existe aún, lo hará post-deploy
```

### Fase 2: Deploy (20 min)

```bash
# 1. Backup de .env (si existe)
cp .env .env.backup.pre-audit-2026-05-07

# 2. No hay cambios en dependencies, pero verificar
npm list | grep -E "express|axios|cors|helmet"

# 3. Reiniciar servidor (Docker o local)
# Docker:
docker-compose restart backend

# Local:
pkill -f "node.*index.js"
npm start &
```

### Fase 3: Post-Deployment Tests (20 min)

#### Test 1: Health Check Endpoint
```bash
# Debe responder con estado de Ollama y índices
curl http://localhost:3000/health | jq .

# Respuesta esperada:
{
  "status": "healthy|unhealthy",
  "ollama": { "healthy": true, "lastCheck": "..." },
  "indices": {
    "conversacional": { "indexed": true, "chunks": 0 },
    "general": { "indexed": false, "chunks": 0 },
    ...
  }
}
```

#### Test 2: Logging Estructura
```bash
# Ejecutar query y ver logs
tail -f nohup.out | grep -i "component"

# Esperado: JSON con campos timestamp, level, component, message, metadata
{"timestamp":"2026-05-07T...","level":"info","component":"system","message":"Servidor iniciado",...}
```

#### Test 3: CORS Validado
```bash
# Test origen permitido (debe ser 200)
curl -H "Origin: http://localhost:3001" -H "Access-Control-Request-Method: POST" \
  -X OPTIONS http://localhost:3000/agente/conversacional -v 2>&1 | grep -i "access-control-allow"

# Test origen no permitido (debe rechazar)
curl -H "Origin: http://malicious.com:3001" -H "Access-Control-Request-Method: POST" \
  -X OPTIONS http://localhost:3000/agente/conversacional -v 2>&1 | grep -i "cors"
```

#### Test 4: Streaming con Heartbeat
```bash
# Abrir SSE y ver heartbeat cada 15s
curl -H "Content-Type: application/json" \
  -d '{"prompt":"Hola","stream":true}' \
  http://localhost:3000/agente/conversacional

# Esperado: {"type":"heartbeat"} cada 15 segundos durante pauses
# {"type":"meta",...}
# {"type":"chunk","content":"..."}
# {"type":"heartbeat"}  ← Cada 15s
# {"type":"done",...}
```

#### Test 5: RAG Scoring
```bash
# Indexar un documento de prueba en "general"
curl -X POST -F "file=@test.pdf" \
  http://localhost:3000/rag/upload/general

# Query y verificar chunks devueltos
curl -H "Content-Type: application/json" \
  -d '{"prompt":"búsqueda test"}' \
  http://localhost:3000/agente/general

# Esperado: Chunks con scores > 0.05 (mejor relevancia que antes)
```

---

## 🔍 VALIDACIONES CRÍTICAS

### 1. ¿Ollama está disponible?
```bash
# POST-DEPLOY (primer startup)
# Ver logs:
grep -i "ollama.ready\|ollama.unavailable" nohup.out

# Esperado: "Ollama disponible" mensaje
```

### 2. ¿Todos los índices cargan?
```bash
curl http://localhost:3000/health | jq '.indices'

# Esperado: Todos los agentes listados con estado indexed true/false
```

### 3. ¿Prompts están optimizados?
```bash
# Manual: Revisar conversacional systemPrompt en logs
curl -H "Content-Type: application/json" \
  -d '{"prompt":"Hola mate","stream":false}' \
  http://localhost:3000/agente/conversacional

# Esperado: Respuesta < 5s (más rápido que antes)
```

### 4. ¿Heartbeat funciona?
```bash
# Abrir conexión SSE y dejar 30s sin datos
# Debe recibir: {"type":"heartbeat"} en segundos 15 y 30
```

---

## 📊 MÉTRICAS DE BASELINE POST-DEPLOY

Después de deployment, registrar estos valores:

```json
{
  "deployment_date": "2026-05-07",
  "baseline": {
    "ollama_check_ms": "5000",
    "agent_query_latency_ms": 2500,
    "streaming_chunk_latency_ms": 150,
    "rag_retrieval_ms": 800,
    "health_check_ms": 10,
    "cors_overhead_ms": 2,
    "logging_overhead_ms": 1
  }
}
```

Monitor estos valores en siguiente audit (30 días).

---

## 🐛 TROUBLESHOOTING

### Problema 1: `/health` Endpoint No Responde
```bash
# Causa: health check timeout
# Fix: Aumentar OLLAMA_TIMEOUT_MS en .env
export OLLAMA_TIMEOUT_MS=10000
# Redeploy
```

### Problema 2: CORS Error en Frontend
```bash
# Causa: Origin no en allowlist
# Fix: Agregar a .env
export ALLOWED_ORIGINS=http://myapp.com:3001,http://staging.app.com:3001
# Redeploy
```

### Problema 3: Heartbeat No Se Ve
```bash
# Causa: Cliente ignora type:"heartbeat"
# Fix: Nada, es por diseño (heartbeat es invisible al usuario)
# Verificar en network inspector que evento existe cada 15s
```

### Problema 4: Logging Demasiado Verboso
```bash
# Causa: Componentes loggeando cada evento
# Fix: Agregar log level filter (no implementado aún, TODO)
# Por ahora: grep -v "type: heartbeat" nohup.out
```

---

## 🔄 ROLLBACK PLAN

Si algo falla post-deployment:

```bash
# 1. Revert código (git rollback)
git revert HEAD

# 2. Reinstalar si cambios en logger.js
npm install

# 3. Restart servidor
docker-compose restart backend

# 4. Verificar `/health` endpoint (no debe existir en rollback)
curl http://localhost:3000/health  # Debe dar 404
```

---

## 📅 SCHEDULE RECOMENDADO

### Día 1 (HOY)
- [ ] Deploy a stage environment
- [ ] Ejecutar todos los tests (Fase 3)
- [ ] Validar métricas de baseline
- [ ] Revisar logs en detalle

### Día 2
- [ ] Carga inicial de producción (si existe)
- [ ] Monitorear `/health` endpoint
- [ ] User acceptance testing (editor, agentes)

### Día 3-7
- [ ] Observación 24/7 en producción
- [ ] Logs alertas si Ollama down
- [ ] Recopilar feedback de usuarios

### Semana 2
- [ ] Implementar circuit breaker (si necesario)
- [ ] Métricas Prometheus (opcional)

---

## 📝 CHECKLIST FINAL

**Pre-Deploy**
- [ ] Git commit con cambios auditados
- [ ] Backup .env
- [ ] Verificar Ollama disponible
- [ ] No hay breaking changes en API

**Deploy**
- [ ] Restart servidor exitoso
- [ ] No errores en logs iniciales
- [ ] `/health` endpoint accessible

**Post-Deploy**
- [ ] CORS válido
- [ ] Logging con estructura JSON
- [ ] Heartbeat en SSE cada 15s
- [ ] RAG relevance mejorada
- [ ] Baseline metrics registradas

**Operacional (Próximas 2 semanas)**
- [ ] Monitorear `/health` diario
- [ ] Revisar logs para anomalías
- [ ] Performance stable (latencia similar)
- [ ] Sin crashes de Ollama

---

## 🎯 SUCCESS CRITERIA

Deployment es exitoso si:

1. ✅ `/health` retorna estado correcto
2. ✅ Zero errors en logs primeras 2 horas
3. ✅ Prompts más rápidos (latencia -10%)
4. ✅ CORS bloquea origins no permitidos
5. ✅ Streaming no se corta en respuestas largas
6. ✅ RAG chunks relevantes
7. ✅ Logging parseable (JSON válido)

---

**Guía Creada:** 7 de mayo de 2026  
**Versión:** 2.1.0  
**Mantener para próximas auditorías**
