@echo off
title EPITOPIA PAS TOUCHER
color 4F

:: Force le script a aller dans le bon dossier, peu importe ou il est place
cd /d "C:\Users\Administrateur\Desktop\epitopia"

echo === 1. Mise a jour du code ===
git reset --hard
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
