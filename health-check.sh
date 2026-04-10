#!/bin/bash

# Health Check Script para Servidor IA

echo "🔍 Verificando Servidor IA..."
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Función para verificar
check_service() {
    local name=$1
    local url=$2
    local port=$3
    
    echo -n "Verificando $name (puerto $port)... "
    
    if curl -s "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e "${RED}❌ Error${NC}"
        return 1
    fi
}

# Contador de errores
ERRORS=0

# Verificar Ollama
if ! check_service "Ollama" "http://localhost:11434/api/tags" "11434"; then
    ERRORS=$((ERRORS + 1))
fi

# Verificar Backend
if ! check_service "Backend" "http://localhost:3000/" "3000"; then
    ERRORS=$((ERRORS + 1))
fi

# Verificar Frontend
if ! check_service "Frontend" "http://localhost:3001/" "3001"; then
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Verificar Docker Compose
echo -n "Estado de Docker Compose... "
if docker-compose ps > /dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
    echo ""
    echo "Contenedores:"
    docker-compose ps --no-trunc
else
    echo -e "${RED}❌ Error${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Resumen
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ Todos los servicios están funcionando correctamente${NC}"
    echo ""
    echo "Puedes acceder a:"
    echo "  • Frontend:  ${YELLOW}http://localhost:3001${NC}"
    echo "  • Backend:   ${YELLOW}http://localhost:3000${NC}"
    echo "  • Ollama:    ${YELLOW}http://localhost:11434${NC}"
    exit 0
else
    echo -e "${RED}❌ Se encontraron $ERRORS error(es)${NC}"
    echo ""
    echo "Para solucionar:"
    echo "  1. Ver logs:      ${YELLOW}docker-compose logs${NC}"
    echo "  2. Reiniciar:     ${YELLOW}docker-compose restart${NC}"
    echo "  3. Reconstruir:   ${YELLOW}docker-compose build${NC}"
    exit 1
fi
