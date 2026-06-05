@echo off
title INICIAR SISTEMA YAP

:: Configurar rutas absolutas
set "PORTABLE_NODE_DIR=%~dp0.node_portable\node-v20.20.2-win-x64"
set "PATH=%PORTABLE_NODE_DIR%;%PATH%"

echo ===================================================
echo     INICIANDO SERVIDORES DE YAP (LIBRANZAS)
echo ===================================================
echo.
echo Usando Node.js Portable desde: %PORTABLE_NODE_DIR%
echo.

:: Lanzar Backend en una ventana nueva
echo Levantando Servidor de Base de Datos y APIs (Backend)...
start "YAP Backend Server" cmd /k "cd /d \"%~dp0backend\" && node src/server.js"

:: Esperar 3 segundos para asegurar el inicio del backend
timeout /t 3 /nobreak >nul

:: Lanzar Frontend en una ventana nueva
echo Levantando Servidor de Interfaz Visual (Frontend)...
start "YAP Frontend Server" cmd /k "cd /d \"%~dp0frontend\" && npm run dev"

echo.
echo ===================================================
echo  ^|^| PROCESO COMPLETADO EXCELENTEMENTE ^|^|
echo.
echo  Los servidores se estan ejecutando en ventanas separadas.
echo  Por favor deja esas ventanas abiertas para que los links funcionen.
echo.
echo  Enlaces de acceso local en tu navegador:
echo.
echo  1. Formulario de Solicitudes:  http://localhost:5173/solicitar
echo  2. Portal de Clientes/Deudores: http://localhost:5173/portal/login
echo  3. Panel de Administrador:      http://localhost:5173/login
echo ===================================================
echo.
pause
