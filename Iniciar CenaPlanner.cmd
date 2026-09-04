@echo off
setlocal
title CenaPlanner - servidor local
cd /d "%~dp0"
set "CENAPLANNER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%CENAPLANNER_NODE%\node.exe" set "PATH=%CENAPLANNER_NODE%;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 22.13 ou superior.
  pause
  exit /b 1
)
if not exist "node_modules\vinext\dist\cli.js" (
  echo Dependencias nao encontradas nesta pasta. Solicite a configuracao do projeto.
  pause
  exit /b 1
)
if not exist ".env" (
  echo Arquivo .env nao encontrado. Configure o ambiente antes de iniciar.
  pause
  exit /b 1
)
echo Iniciando CenaPlanner...
echo Abra no navegador o endereco Local informado abaixo.
echo Mantenha esta janela aberta enquanto estiver usando o sistema.
echo Para encerrar, pressione Ctrl+C.
echo.
node "node_modules\vinext\dist\cli.js" dev
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar. Confira a mensagem acima.
  pause
)
endlocal
