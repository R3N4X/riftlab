@echo off
rem Abre la app de escritorio de RiftLab (modo producción, sin servidor de desarrollo).
rem La primera vez compila la app; después de cambiar código, ejecuta: npm run desktop:build
cd /d "%~dp0"
if not exist ".next\standalone\server.js" call npm run desktop:build
start "" "node_modules\electron\dist\electron.exe" . --prod
