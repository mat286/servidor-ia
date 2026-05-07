# Docker Deployment Guide — Servidor IA

## Requisitos Previos

- Docker v20+
- Docker Compose v2+
- Mínimo 8GB RAM disponible (para Ollama + modelos)
- Mínimo 20GB disco libre (para modelos LLM)

## Quick Start

### 1. Clonar y Configurar

```bash
cd /ruta/del/proyecto

# Copiar configuración ejemplo
cp .env.example .env

# (Opcional) Ajustar variables de entorno
nano .env
```

### 2. Levantar Stack Completo

```bash
docker compose up -d --build
```

Este comando:
- ✅ Construye las imágenes de backend y frontend
- ✅ Inicia Ollama y descarga automáticamente todos los modelos (qwen2.5:3b, nomic-embed-text, llava:7b)
- ✅ Inicia el backend en puerto 3000
- ✅ Inicia el frontend en puerto 3001
- ✅ Configura networking entre servicios
- ✅ Habilita healthchecks automáticos

**Tiempo estimado:** 5-15 minutos (depende de velocidad de descarga de modelos)

### 3. Verificar Estado

```bash
# Ver logs en tiempo real
docker compose logs -f

# Verificar que todos los servicios estén saludables
docker compose ps

# Debería mostrar:
# ollama     ... healthy
# backend    ... healthy
# frontend   ... healthy
```

### 4. Acceder a la Aplicación

- **Frontend:** http://localhost:3001
- **Backend API:** http://localhost:3000
- **Health Check:** http://localhost:3000/health
- **Ollama Direct:** http://localhost:11434 (no visible normalmente)

---

## Operación

### Detener Stack

```bash
docker compose down
```

### Detener y Limpiar Todo (incluyendo datos)

```bash
docker compose down -v
```

### Ver Logs de un Servicio Específico

```bash
docker compose logs -f backend   # Backend
docker compose logs -f frontend  # Frontend
docker compose logs -f ollama    # Ollama
```

### Reiniciar un Servicio

```bash
docker compose restart backend
```

### Recrear Containers (sin perder datos)

```bash
docker compose up -d --build --force-recreate
```

---

## Configuración Avanzada

### Cambiar Modelos

Editar `.env`:

```bash
MODELO_TEXTO=mistral:latest          # Cambiar modelo de texto
MODELO_VISION=llava:13b              # Cambiar modelo de visión
MODELO_EMBEDDINGS=mxbai-embed-large  # Cambiar modelo de embeddings
```

Luego:

```bash
docker compose restart ollama
docker compose restart backend
```

### Circuit Breaker (Resilencia)

El circuit breaker detecta si Ollama cae y evita cascadas de fallos:

```bash
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5        # Fallos consecutivos antes de abrir
CIRCUIT_BREAKER_TIMEOUT_MS=30000           # Tiempo antes de reintentar
```

### Embedding Cache (Performance)

Reusar embeddings entre reinicios (no volver a embedder textos vistos):

```bash
RAG_EMBEDDING_CACHE_ENABLED=true
RAG_EMBEDDING_CACHE_MAX=2000               # Max embeddings en memoria
RAG_EMBEDDING_CACHE_TTL_MS=21600000        # 6 horas TTL
```

Los embeddings se guardan en disco en `rag/cache/` por dominio.

### Context Compression (Ahorro de tokens)

Sumarizar contexto RAG largo para maximizar espacio del LLM:

```bash
CONTEXT_COMPRESSION_ENABLED=true
CONTEXT_COMPRESSION_MAX_TOKENS=1024
```

⚠️ **Advertencia:** Requiere recursos de LLM. Usar con cuidado en producción.

---

## Troubleshooting

### Ollama tarda mucho en descargar modelos

**Esperado:** Primera vez que levanta, descarga ~5-6GB de modelos (qwen2.5:3b + embeddings + vision).
- Revisar logs: `docker compose logs ollama`
- Paciencia: Entre 5-15 minutos según conexión

### Backend no conecta a Ollama

```bash
# Verificar que Ollama está saludable
docker compose exec ollama ollama list

# Revisar logs de Ollama
docker compose logs ollama

# Si falla, reiniciar
docker compose restart ollama
```

### Frontend no carga

```bash
# Revisar logs del frontend
docker compose logs frontend

# Verificar que backend esté saludable
curl http://localhost:3000/health

# Si falla, reiniciar todo
docker compose restart
```

### Disco lleno

Los modelos Ollama ocupan ~6GB. Si falta espacio:

```bash
# Limpiar imágenes Docker no usadas
docker image prune -a

# Limpiar volumes sin usar
docker volume prune
```

### Puerto ya en uso

Si 3000, 3001 o 11434 están en uso:

Editar `docker-compose.yml`:

```yaml
backend:
  ports:
    - "3000:3000"    # Cambiar primer 3000 a otro puerto

frontend:
  ports:
    - "3001:3001"    # Cambiar primer 3001 a otro puerto

ollama:
  ports:
    - "11434:11434"  # Cambiar primer 11434 a otro puerto
```

---

## Monitoreo en Producción

### Health Check Endpoint

```bash
curl http://localhost:3000/health
```

Devuelve JSON con estado de Ollama, RAG indices, etc.

### Logs Estructurados

El backend emite logs en formato JSON para fácil parseo:

```bash
docker compose logs backend | grep '"component":"llm"'
```

### Métricas (Futuro)

Próximamente: `/metrics` endpoint compatible con Prometheus.

---

## Deployment en Producción

### Docker Compose

Recomendado para producción simple (1-2 máquinas):

```bash
# Usar archivo de producción
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# (Aún no existe docker-compose.prod.yml, create si necesitas SSL/reverse proxy)
```

### Kubernetes (Futuro)

Para clusters grandes: crear `helm/` charts.

---

## Performance Tuning

| Parámetro | Recomendación | Razón |
|-----------|---------------|-------|
| `OLLAMA_KEEP_ALIVE` | `15m` | Mantiene modelo en RAM sin recargar constantemente |
| `OLLAMA_NUM_CTX` | `2048` | Contexto suficiente para RAG (qwen2.5:3b límite ~4096) |
| `OLLAMA_TEMPERATURE` | `0.2` | Bajo = respuestas más determinísticas (mejor para RAG) |
| `RAG_CHUNK_SIZE` | `700` | Balance entre granularidad y contexto |
| `CIRCUIT_BREAKER_ENABLED` | `true` | Previene cascadas si Ollama cae |

---

## Limpieza de Datos

### Limpiar embeddings cacheados

```bash
# Los embeddings se guardan en:
rm -rf rag/*/embedding_cache/

# El backend los regenerará automáticamente
docker compose restart backend
```

### Reset completo de RAG

```bash
# Eliminar todos los índices RAG
rm -rf rag/*/chunks.json rag/*/embeddings.json rag/*/manifest.json

# Subir archivos nuevamente
# (Los agentes re-indexarán automáticamente)
```

---

## Soporte

Para issues:

1. Revisar logs: `docker compose logs -f`
2. Verificar healthchecks: `docker compose ps`
3. Revisar `/health` endpoint
4. Restart: `docker compose restart`

---

**Última actualización:** 2026-05-08  
**Status:** ✅ Listo para Producción
