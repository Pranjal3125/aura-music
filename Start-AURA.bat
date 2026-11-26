@echo off
title AURA — AI Music Vibe Director
cd /d "%~dp0"
echo Starting AURA AI Music Vibe Director...
start "" "http://localhost:5173"
npm.cmd run dev
pause
