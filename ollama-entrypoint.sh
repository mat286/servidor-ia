#!/bin/sh
set -e

echo "🚀 Iniciando Ollama..."
ollama serve &

echo "⏳ Esperando a que Ollama esté listo..."
until ollama list >/dev/null 2>&1; do
  sleep 1
done

echo "📦 Descargando modelos..."
ollama pull qwen2.5:3b
ollama pull llava:7b
ollama pull nomic-embed-text


echo "✅ Modelos cargados correctamente"

# Mantener el contenedor vivo
wait
