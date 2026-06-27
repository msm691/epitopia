@echo off
echo Lancement du serveur (backend)...
start "Epitopia Server" cmd /k "npm run dev:server"

echo Lancement du client (frontend)...
start "Epitopia Client" cmd /k "npm run dev"

echo Serveurs lances dans de nouvelles fenetres !
