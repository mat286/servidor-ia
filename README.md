# Servidor IA

Versión reducida del proyecto con solo la información esencial para ejecutar y mantener la app.

## Qué incluye

- `backend/`: API en Node.js/Express
- `frontend/`: interfaz en React + Vite
- `docker-compose.yml`: arranque completo con Ollama
- `start.bat` / `start.sh`: scripts opcionales de inicio
- `GUIA_IA_Y_AGENTES.md`: flujo del sistema y cómo crear nuevos agentes

## Inicio rápido

```bash
docker-compose up -d
```

### URLs

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:3000`
- Ollama: `http://localhost:11434`

## Desarrollo local

### Backend

```bash
cd backend
npm install
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Estructura mínima

```text
.
├── backend/
├── frontend/
├── docker-compose.yml
├── .env.example
├── start.bat
└── start.sh
```

