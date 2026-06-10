@echo off
cd /d "%~dp0"
echo ================================================
echo   MONOPOLY ENTRE AMIS — demarrage du serveur...
echo ================================================
echo.
echo Le jeu va s'ouvrir dans ton navigateur.
echo Laisse cette fenetre noire OUVERTE pendant que vous jouez.
echo Pour arreter le jeu : ferme simplement cette fenetre.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERREUR : Node.js n'est pas installe. Demande a Claude de l'installer.
  pause
  exit /b 1
)
set PORT=3210
start http://localhost:3210
node server\index.js
echo.
echo Le serveur s'est arrete (port deja occupe ?). Ferme et relance ce fichier.
pause
