@echo off
rem Abre o Lume como app de desktop (Electron), com a janela da Udemy dentro dele.
rem Os dados deste modo ficam em %APPDATA%\Lume (separados do modo navegador).
setlocal
cd /d "%~dp0"
title Lume (desktop)
set NODE_NO_WARNINGS=1

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node 22.13 ou mais novo em https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias, so na primeira vez...
  call npm install
  if errorlevel 1 goto :erro
)

call npm run desktop
if errorlevel 1 goto :erro
exit /b 0

:erro
echo.
echo Algo deu errado. Veja a mensagem acima.
pause
exit /b 1
