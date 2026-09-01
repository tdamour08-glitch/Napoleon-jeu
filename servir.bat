@echo off
REM ============================================================
REM  Les Aigles - demarrage du serveur local (Windows)
REM
REM  Double-cliquez ce fichier. Il choisit un port libre, demarre
REM  un serveur sur le dossier du jeu, ATTEND qu'il reponde, puis
REM  ouvre le navigateur.
REM
REM  Les modules ES imposent un vrai serveur : ouvrir index.html
REM  directement (file://) ne fonctionne pas.
REM ============================================================
setlocal
cd /d "%~dp0"

REM --- Choix d'un port libre : 8000, sinon 8080, sinon 8090 ---
set PORT=
for %%P in (8000 8080 8090) do (
  if not defined PORT (
    powershell -NoProfile -Command "exit ([bool]((Get-NetTCPConnection -State Listen -LocalPort %%P -ErrorAction SilentlyContinue)))" >nul 2>nul
    if errorlevel 1 (echo   Le port %%P est deja utilise.) else (set PORT=%%P)
  )
)

if not defined PORT (
  echo.
  echo   Les ports 8000, 8080 et 8090 sont tous occupes.
  echo   Fermez l'application qui les utilise, puis relancez.
  echo.
  pause
  exit /b 1
)

echo.
echo   Les Aigles - serveur local sur le port %PORT%
echo   Le navigateur s'ouvrira des que le serveur repondra.
echo   Fermez cette fenetre pour arreter le serveur.
echo.

REM --- Ouvre le navigateur seulement une fois le port a l'ecoute ---
REM     Sans cette attente, la page s'ouvrait avant le demarrage du
REM     serveur et affichait une erreur de connexion.
start "" /b powershell -NoProfile -Command ^
  "for ($i=0; $i -lt 80; $i++) { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('localhost', %PORT%); $c.Close(); Start-Process 'http://localhost:%PORT%/'; break } catch { Start-Sleep -Milliseconds 250 } }"

REM --- 1. Python, s'il est installe (le plus courant) ---
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server %PORT%
  goto :fin
)

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT%
  goto :fin
)

REM --- 2. Node, s'il est installe ---
where npx >nul 2>nul
if %errorlevel%==0 (
  npx --yes serve -l %PORT% .
  goto :fin
)

REM --- 3. Sinon PowerShell, livre avec Windows ---
echo   Ni Python ni Node trouves : on passe par PowerShell.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\servir.ps1" -Port %PORT% -SansNavigateur

:fin
echo.
echo   Serveur arrete.
pause
endlocal
