@echo off
cd /d "%~dp0"

if not exist ".env" (
  copy ".env.example" ".env" >nul
)

echo Starting Wheelie...
echo.

if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" server\index.js
) else (
  node server\index.js
)

echo.
echo Wheelie stopped.
pause
