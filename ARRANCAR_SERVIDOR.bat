@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Arranque - Notas de Tareas

echo ============================================================
echo  NOTAS DE TAREAS - ARRANQUE DE SERVIDOR LOCAL
echo ============================================================
echo.
echo Este BAT arrancara el ordenador como servidor local y despues
echo abrira la app en el navegador del ordenador.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: No se ha encontrado Node.js en este ordenador.
  echo.
  echo Instala Node.js LTS desde https://nodejs.org/
  echo Despues vuelve a ejecutar este archivo BAT.
  echo.
  pause
  exit /b 1
)

echo Arrancando servidor local en una ventana nueva...
start "Servidor local - Notas de Tareas" cmd /k "cd /d "%~dp0" && node sync-server.js"

echo Esperando unos segundos a que el servidor quede preparado...
timeout /t 2 /nobreak >nul

echo Abriendo la app en el ordenador...
start "" "http://localhost:8787/index.html"

echo.
echo LISTO.
echo Deja abierta la ventana titulada "Servidor local - Notas de Tareas".
echo En el movil usa la IP que muestra esa ventana, por ejemplo:
echo http://192.168.1.50:8787
pause
