@echo off
setlocal
cd /d "%~dp0\..\.."

if not exist "responsive-audit-output" (
  echo Le dossier responsive-audit-output est introuvable.
  echo Lance d'abord dev\responsive-audit\audit-responsive.cmd.
  echo.
  pause
  exit /b 1
)

if exist "responsive-audit-output.zip" del "responsive-audit-output.zip"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'responsive-audit-output\*' -DestinationPath 'responsive-audit-output.zip' -Force"
if errorlevel 1 (
  echo Impossible de creer le zip automatiquement.
  echo Tu peux zipper le dossier responsive-audit-output manuellement.
  echo.
  pause
  exit /b 1
)

echo.
echo Zip cree : responsive-audit-output.zip
echo Envoie ce fichier dans ChatGPT.
echo.
pause
