@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================
echo  Audit responsive local - Site d'outils
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable.
  echo Installe Node.js LTS depuis https://nodejs.org/ puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\playwright" (
  echo Installation des dependances locales...
  call npm install
  if errorlevel 1 goto :error
)

echo Verification / installation du navigateur Chromium Playwright...
call npx playwright install chromium
if errorlevel 1 goto :error

echo.
echo Lancement de l'audit...
call npm run audit
if errorlevel 1 goto :error

echo.
echo Audit termine.
echo Le dossier de sortie est a la racine du projet : responsive-audit-output
echo Tu peux le zipper et le renvoyer dans ChatGPT.
echo.
pause
exit /b 0

:error
echo.
echo Une erreur a interrompu l'audit.
echo Copie le message ci-dessus ou envoie une capture si besoin.
echo.
pause
exit /b 1
