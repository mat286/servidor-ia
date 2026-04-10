#!/bin/bash

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Servidor IA - Inicio de Servicios   ${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker no está instalado${NC}"
    exit 1
fi

echo -e "${YELLOW}⏳ Iniciando servicios...${NC}\n"

# Iniciar servicios
docker-compose up -d

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Servicios iniciados correctamente${NC}\n"
    
    echo -e "${YELLOW}⏳ Esperando a que Ollama cargue los modelos...${NC}"
    echo -e "${YELLOW}   (Este proceso puede tomar 5-10 minutos la primera vez)${NC}\n"
    
    # Esperar a que Ollama esté listo
    sleep 10
    
    # Verificar estado
    echo -e "${BLUE}📊 Estado de los servicios:${NC}\n"
    docker-compose ps
    
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}  ✅ Servidor IA está corriendo        ${NC}"
    echo -e "${GREEN}========================================${NC}\n"
    
    echo -e "${BLUE}🌐 URLs disponibles:${NC}"
    echo -e "  • Frontend:  ${GREEN}http://localhost:3001${NC}"
    echo -e "  • Backend:   ${GREEN}http://localhost:3000${NC}"
    echo -e "  • Ollama:    ${GREEN}http://localhost:11434${NC}\n"
    
    echo -e "${BLUE}📝 Comandos útiles:${NC}"
    echo -e "  • Ver logs:  ${YELLOW}docker-compose logs -f${NC}"
    echo -e "  • Detener:   ${YELLOW}docker-compose down${NC}"
    echo -e "  • Reiniciar: ${YELLOW}docker-compose restart${NC}\n"
    
    echo -e "${BLUE}💡 Tips:${NC}"
    echo -e "  1. Abre http://localhost:3001 en tu navegador"
    echo -e "  2. Carga documentos en la sección derecha"
    echo -e "  3. Usa el chat para interactuar\n"
    
else
    echo -e "${RED}❌ Error iniciando servicios${NC}"
    echo -e "${RED}Ver logs con: docker-compose logs${NC}"
    exit 1
fi
