@echo off
chcp 65001 > nul
title CheckYG Server
cd /d "%~dp0"

echo ========================================================
echo   🚀 Запуск CheckYG — Инспектор Яндекс Игр
echo ========================================================
echo.
echo 🌐 Открытие браузера: http://localhost:3000
start "" "http://localhost:3000"
echo.
echo 💡 СЕРВЕР АКТИВЕН!
echo    Чтобы ВЫКЛЮЧИТЬ сервер — просто закройте это окно консоли
echo    или запустите "stop.bat".
echo ========================================================
echo.

node server.js
pause
