@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Servidor local - Notas de Tareas

echo ============================================================
echo  NOTAS DE TAREAS - SERVIDOR LOCAL DE SINCRONIZACION
echo ============================================================
echo.
echo Esta ventana debe quedarse abierta mientras uses la sincronizacion.
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

echo Arrancando servidor local...
echo.
start "" "http://localhost:8787/index.html"
node "%~dp0sync-server.js"

echo.
echo El servidor se ha cerrado.
pause
