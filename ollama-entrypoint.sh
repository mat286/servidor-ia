#!/bin/bash
set -e

echo "🚀 Iniciando Ollama..."
ollama serve &

OLLAMA_PID=$!

echo "⏳ Esperando a que Ollama esté completamente listo..."
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ollama list >/dev/null 2>&1; then
        echo "✅ Ollama listo"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "⏳ Intento $RETRY_COUNT/$MAX_RETRIES..."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Ollama no respondió después de $MAX_RETRIES intentos"
    exit 1
fi

echo "📦 Descargando modelos..."

MODELO_TEXTO=${MODELO_TEXTO:-qwen2.5:3b}
MODELO_EMBEDDINGS=${MODELO_EMBEDDINGS:-nomic-embed-text}
MODELO_VISION=${MODELO_VISION:-llava:7b}
MODELO_EDITOR=${MODELO_EDITOR:-qwen2.5:1.5b}
MODELO_EDITOR_FALLBACK=${MODELO_EDITOR_FALLBACK:-qwen2.5:0.5b}

pull_model() {
    local model="$1"
    local optional="$2"

    if [ -z "$model" ]; then
        return 0
    fi

    echo "📥 Bajando $model..."
    if ! ollama pull "$model" 2>&1 | tail -5; then
        if [ "$optional" = "optional" ]; then
            echo "⚠️  Advertencia: No se pudo descargar $model, continuando..."
        else
            echo "❌ Error: no se pudo descargar modelo requerido $model"
            exit 1
        fi
    fi
}

pull_model "$MODELO_TEXTO"
pull_model "$MODELO_EMBEDDINGS"
pull_model "$MODELO_EDITOR"
pull_model "$MODELO_EDITOR_FALLBACK" "optional"
pull_model "$MODELO_VISION" "optional"

echo "✅ Modelos cargados correctamente"
echo "🎯 Ollama completamente inicializado"

# Mantener el contenedor vivo
wait $OLLAMA_PID

