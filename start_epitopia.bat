@echo off
title EPITOPIA PAS TOUCHER
color 4F

:: Force le script a aller dans le bon dossier, peu importe ou il est place
cd /d "C:\Users\Administrateur\Desktop\epitopia"

echo === 1. Mise a jour du code ===
git pull origin main

echo.
echo === 2. Installation des dependances ===
call npm install

echo.
echo === 3. Lancement du Serveur et du Client ===
npx concurrently -n "SERVEUR,CLIENT" -c "bgBlack.white,bgBlue.white" "npm run dev:server" "npm run dev"

pause
