# Guía de flujo de la IA y agentes

Esta guía resume **cómo fluye una consulta**, **cómo funciona la IA local con Ollama** y **cómo agregar un agente nuevo**.

---

## 1. Arquitectura simple

El proyecto tiene 3 piezas principales:

- `frontend/` → interfaz web en React
- `backend/` → API en Node.js/Express
- `ollama` → motor local de IA que ejecuta los modelos

### Modelos actuales

- **Texto / chat:** `qwen2.5:3b`
- **Visión / imágenes:** `llava:7b`
- **Embeddings / RAG:** `nomic-embed-text`

Estos modelos se configuran en `.env`:

```env
MODELO_TEXTO=qwen2.5:3b
MODELO_VISION=llava:7b
MODELO_EMBEDDINGS=nomic-embed-text
```

---

## 2. Flujo de una consulta

### Caso normal

1. El usuario escribe en el frontend (`frontend/src/components/ChatComponent.jsx`).
2. El frontend envía el prompt al backend:
   - `POST /agente/auto` si el agente se elige automáticamente
   - `POST /agente/:nombre` si se elige uno fijo
3. El backend recibe la consulta en `backend/index.js`.
4. Si es modo auto, `backend/services/agentSelector.js` decide qué agente usar.
5. El agente ejecuta `procesarPregunta()` desde `backend/agentes/base/AgenteBase.js`.
6. Si el agente usa documentos, busca contexto en `backend/rag/base/RAGBase.js`.
7. El backend arma el prompt final y llama a Ollama desde `backend/services/llm.js`.
8. Ollama responde y el backend devuelve la respuesta al frontend.
9. El frontend muestra la respuesta en streaming.

---

## 3. Cómo funciona la IA internamente

### A) Selector de agente

El selector usa reglas rápidas por palabras clave. Por ejemplo:

- consultas técnicas → `soporteTecnico`
- consultas documentales / normas → `documental`
- consultas generales → `general`
- saludos o charla → `conversacional`

Archivo clave:

- `backend/services/agentSelector.js`

### B) Agente

Cada agente tiene:

- un `nombre`
- un `systemPrompt`
- un `ragDomain`
- un modelo LLM

Archivo base:

- `backend/agentes/base/AgenteBase.js`

### C) RAG

Si el agente necesita documentos:

1. se leen PDFs/TXT/MD
2. se dividen en fragmentos (`chunks`)
3. se generan embeddings con `nomic-embed-text`
4. se compara la pregunta con los chunks más parecidos
5. esos chunks se envían como contexto al modelo

Archivos clave:

- `backend/rag/base/RAGBase.js`
- `backend/services/citations.js`

### D) Ollama

Ollama corre localmente y responde por HTTP:

- `http://localhost:11434`

Archivo clave:

- `backend/services/llm.js`

---

## 4. Agentes actuales

Hoy el sistema tiene estos agentes registrados en `backend/agentes/index.js`:

- `conversacional`
- `documental`
- `soporteTecnico`
- `general`

---

## 5. Cómo crear un agente nuevo

### Paso 1: crear el archivo del agente

Crear una carpeta nueva, por ejemplo:

```text
backend/agentes/recursosHumanos/recursosHumanos.js
```

Contenido base:

```js
import { AgenteBase } from "../base/AgenteBase.js";

export const recursosHumanos = new AgenteBase({
  nombre: "recursosHumanos",
  systemPrompt: `
Sos un agente especializado en consultas de recursos humanos.
Respondé claro, breve y con información oficial.
Si no hay información suficiente, decilo explícitamente.
`,
  ragDomain: "recursosHumanos",
  model: process.env.MODELO_TEXTO || "qwen2.5:3b"
});
```

---

### Paso 2: registrarlo en el índice de agentes

Editar `backend/agentes/index.js`:

```js
import { recursosHumanos } from "./recursosHumanos/recursosHumanos.js";

export const agentes = {
  conversacional,
  documental,
  soporteTecnico,
  general,
  recursosHumanos
};
```

---

### Paso 3: agregar reglas al selector

Editar `backend/services/agentSelector.js` y sumar keywords:

```js
recursosHumanos: [
  "licencia",
  "vacaciones",
  "legajo",
  "rrhh",
  "recursos humanos"
]
```

---

### Paso 4: crear la carpeta documental del agente

```text
backend/rag/recursosHumanos/docs/
```

Ahí van los PDFs, `.txt` o `.md` del nuevo dominio.

---

### Paso 5: cargar documentos

Podés subirlos desde la UI o por API:

```bash
curl -X POST http://localhost:3000/rag/upload/recursosHumanos \
  -F "file=@reglamento-rrhh.pdf"
```

---

### Paso 6: probarlo

```bash
curl -X POST http://localhost:3000/agente/recursosHumanos \
  -H "Content-Type: application/json" \
  -d '{"prompt":"¿Cuántos días de vacaciones corresponden?"}'
```

Si está bien registrado, también aparecerá automáticamente en el frontend.

---

## 6. Si quiero un agente sin documentos

Tenés dos opciones:

1. copiar el patrón de `conversacional`
2. crear el agente y luego cargarle documentos más adelante

Si el agente no tiene documentos y depende de RAG, va a responder que no hay información indexada.

---

## 7. Archivos más importantes del flujo

| Archivo | Función |
|---|---|
| `frontend/src/components/ChatComponent.jsx` | envía y recibe mensajes |
| `backend/index.js` | rutas principales del backend |
| `backend/services/agentSelector.js` | elige el agente correcto |
| `backend/agentes/base/AgenteBase.js` | lógica común de cada agente |
| `backend/rag/base/RAGBase.js` | búsqueda en documentos |
| `backend/services/llm.js` | conexión con Ollama |
| `backend/services/citations.js` | manejo de citas y referencias |

---

## 8. Recomendación práctica

Si vas a crear otro agente:

- usá `qwen2.5:3b` para texto
- mantené prompts cortos y específicos
- separá bien cada dominio en su carpeta `rag/.../docs`
- agregá keywords claras en `agentSelector.js`
- empezá con pocos documentos y probá primero

---

## 9. Resumen rápido

- el **frontend** manda la consulta
- el **backend** elige el agente
- el agente busca contexto en el **RAG**
- `llm.js` llama a **Ollama**
- el modelo responde y vuelve a la UI

