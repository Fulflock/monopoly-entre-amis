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
start http://localhost:3000
node server\index.js
pause
