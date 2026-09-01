@echo off
REM ============================================================
REM  Les Aigles - demarrage du serveur local (Windows)
REM  Double-cliquez ce fichier : il lance un serveur sur le
REM  dossier du jeu, puis ouvre le navigateur.
REM  Les modules ES imposent un vrai serveur : ouvrir
REM  index.html directement (file://) ne fonctionne pas.
REM ============================================================
setlocal
cd /d "%~dp0"
set PORT=8000

echo.
echo   Les Aigles - serveur local sur le port %PORT%
echo   Fermez cette fenetre pour arreter le serveur.
echo.

REM --- 1. Python, s'il est installe (le plus courant) ---
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/
  py -m http.server %PORT%
  goto :fin
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/
  python -m http.server %PORT%
  goto :fin
)

REM --- 2. Node, s'il est installe ---
where npx >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/
  npx --yes serve -l %PORT% .
  goto :fin
)

REM --- 3. Sinon PowerShell, qui est livre avec Windows ---
echo   Ni Python ni Node trouves : on passe par PowerShell.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\servir.ps1" -Port %PORT%

:fin
endlocal
