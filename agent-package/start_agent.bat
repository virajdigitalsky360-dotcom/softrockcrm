@echo off
chcp 65001 >nul 2>&1
title SOFTROCK Screen Monitor - ACTIVE

if not exist "token.txt" (
    echo ERROR: token.txt not found. Run install.bat first.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in (token.txt) do set TOKEN=%%i
if "%TOKEN%"=="" (
    echo ERROR: token.txt is empty. Paste your device token into it.
    pause
    exit /b 1
)
echo Starting SOFTROCK Screen Monitoring Agent...
echo Press Ctrl+C to stop.
python screen_agent.py --token "%TOKEN%"
if %errorlevel% neq 0 (
    echo Agent stopped with an error. Run install.bat to fix dependencies.
    pause
)
