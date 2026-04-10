# Fase 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package.json package-lock.json* ./

# Instalar dependencias
RUN npm install

# Copiar código fuente
COPY . .

# Build
RUN npm run build

# Fase 2: Servir archivos estáticos
FROM node:18-alpine

WORKDIR /app

# Instalar serve para servir archivos estáticos
RUN npm install -g serve

# Copiar archivos build desde la fase anterior
COPY --from=builder /app/dist ./dist

# Exponer puerto
EXPOSE 3001

# Comando para iniciar
CMD ["serve", "-s", "dist", "-l", "3001"]
