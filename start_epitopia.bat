@echo off
title EPITOPIA PAS TOUCHER
color 4F

:: On reste dans le dossier actuel du script
cd /d "%~dp0"

echo === 1. Mise a jour du code ===
git pull origin main

echo.
echo === 2. Installation des dependances ===
call npm install

echo.
echo === 3. Compilation du jeu (Production) ===
call npm run build --workspace client

echo.
echo === 4. Lancement du Serveur et de Caddy ===
npx concurrently -n "NODE,CADDY" -c "bgBlack.white,bgBlue.white" "npm run dev:server" "caddy run"

pause
