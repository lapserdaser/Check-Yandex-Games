@echo off
chcp 65001 > nul
echo ==========================================
echo  CheckYG — Push to GitHub
echo ==========================================

set GIT="C:\Users\%USERNAME%\AppData\Local\GitHubDesktop\app-3.6.6\resources\app\git\cmd\git.exe"
if not exist %GIT% set GIT="C:\Users\%USERNAME%\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe"

echo Pushing to https://github.com/lapserdaser/Check-Yandex-Games ...
echo.

%GIT% push --force origin main

echo.
if %ERRORLEVEL% == 0 (
    echo SUCCESS! Files pushed to GitHub.
    echo GitHub Pages will be live in ~2 minutes:
    echo https://lapserdaser.github.io/Check-Yandex-Games/
) else (
    echo ERROR: Push failed. Check credentials.
)

echo.
pause
