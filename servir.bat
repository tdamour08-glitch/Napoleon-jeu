@echo off
REM ============================================================
REM  Les Aigles - demarrage du serveur local (Windows)
REM
REM  Double-cliquez ce fichier, ou lancez-le avec un port :
REM      servir.bat 8080
REM
REM  Les modules ES imposent un vrai serveur : ouvrir index.html
REM  directement (file://) ne fonctionne pas.
REM ============================================================
setlocal
cd /d "%~dp0"

set PORT=%1
if "%PORT%"=="" set PORT=8000

echo.
echo   Les Aigles - serveur local
echo   Dossier  : %CD%
echo   Adresse  : http://localhost:%PORT%/
echo.
echo   Le navigateur s'ouvrira des que le serveur repondra.
echo   Fermez cette fenetre pour arreter le serveur.
echo.

REM  Le navigateur est ouvert par un script separe qui attend que le
REM  port reponde. Sans cette attente, la page s'ouvrait avant le
REM  demarrage du serveur et affichait "Ce site est inaccessible".
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\ouvrir.ps1" -Port %PORT%

where py >nul 2>nul
if not errorlevel 1 (
  echo   Serveur : Python
  echo.
  py -m http.server %PORT%
  goto :fin
)

where python >nul 2>nul
if not errorlevel 1 (
  echo   Serveur : Python
  echo.
  python -m http.server %PORT%
  goto :fin
)

where npx >nul 2>nul
if not errorlevel 1 (
  echo   Serveur : Node
  echo.
  npx --yes serve -l %PORT% .
  goto :fin
)

echo   Serveur : PowerShell (ni Python ni Node trouves)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\servir.ps1" -Port %PORT% -SansNavigateur

:fin
echo.
echo   ------------------------------------------------------------
echo   Le serveur s'est arrete.
echo   Si un message d'erreur apparait ci-dessus, notez-le : c'est
echo   lui qui dit ce qui n'a pas fonctionne.
echo   Si le port %PORT% etait deja pris, relancez avec un autre :
echo       servir.bat 8080
echo   ------------------------------------------------------------
echo.
pause
endlocal
