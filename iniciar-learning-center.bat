@echo off
rem Inicia o Lume e abre no navegador. Feche esta janela para parar o app.
rem Variavel opcional: LC_NO_BROWSER=1 (nao abre o navegador, util para testes).
setlocal
cd /d "%~dp0"
title Lume
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

if not exist apps\web\dist\index.html (
  echo Gerando o site, so na primeira vez...
  call npm run build
  if errorlevel 1 goto :erro
)

rem Ja esta rodando? Entao so abre o navegador.
curl.exe -s -f -m 3 http://127.0.0.1:3000/api/v1/health >nul 2>nul
if not errorlevel 1 (
  echo O Lume ja esta rodando.
  if not defined LC_NO_BROWSER start "" http://localhost:3000
  exit /b 0
)

if not defined LC_NO_BROWSER start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
echo Lume em http://localhost:3000
echo Deixe esta janela aberta enquanto usa. Feche para parar.
echo.
call npm start
if errorlevel 1 goto :erro
exit /b 0

:erro
echo.
echo Algo deu errado. Veja a mensagem acima.
pause
exit /b 1
