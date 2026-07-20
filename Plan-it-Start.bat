@echo off
cd /d "%~dp0"
if not exist "node_modules" (
    echo Installiere Abhaengigkeiten...
    npm install
)
npm start
