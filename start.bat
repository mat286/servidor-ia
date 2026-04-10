@echo off
REM Servidor IA - Inicio de Servicios (Windows)

setlocal enabledelayedexpansion

echo ========================================
echo   Servidor IA - Inicio de Servicios
echo ========================================
echo.

REM Verificar Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker no esta instalado
    echo Descargalo desde: https://www.docker.com/products/docker-desktop
    exit /b 1
)

echo [INFO] Iniciando servicios...
echo.

REM Iniciar servicios
docker-compose up -d

if errorlevel 1 (
    echo [ERROR] Error iniciando servicios
    echo Ver logs con: docker-compose logs
    exit /b 1
)

echo [OK] Servicios iniciados correctamente
echo.

echo [INFO] Esperando a que Ollama cargue los modelos...
echo [INFO] (Este proceso puede tomar 5-10 minutos la primera vez)
echo.

REM Esperar
timeout /t 10 /nobreak

REM Ver estado
echo.
echo Estado de los servicios:
echo.
docker-compose ps

echo.
echo ========================================
echo   OK - Servidor IA esta corriendo
echo ========================================
echo.

echo URLs disponibles:
echo   * Frontend:  http://localhost:3001
echo   * Backend:   http://localhost:3000
echo   * Ollama:    http://localhost:11434
echo.

echo Comandos utiles:
echo   * Ver logs:  docker-compose logs -f
echo   * Detener:   docker-compose down
echo   * Reiniciar: docker-compose restart
echo.

echo Tips:
echo   1. Abre http://localhost:3001 en tu navegador
echo   2. Carga documentos en la seccion derecha
echo   3. Usa el chat para interactuar
echo.

pause
