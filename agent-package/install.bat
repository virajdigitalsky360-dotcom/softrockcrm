@echo off
chcp 65001 >nul 2>&1
title SOFTROCK Screen Agent - Installer

echo ============================================
echo   SOFTROCK Screen Monitoring Agent
echo   Windows Installer
echo ============================================
echo.

REM — Check if Python is installed
echo [1/4] Checking for Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: Python is not installed or not in PATH.
    echo.
    echo   Please install Python 3.10+ from:
    echo     https://www.python.org/downloads/
    echo.
    echo   During installation, CHECK the box:
    echo     "Add Python to PATH"
    echo.
    echo   Then run this installer again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set PYVER=%%i
echo   Found: %PYVER%
echo.

REM — Install dependencies
echo [2/4] Installing Python dependencies...
echo   This may take a few minutes on first run...
echo.
pip install aiortc aiohttp mss Pillow numpy av
if %errorlevel% neq 0 (
    echo.
    echo   Trying with --user flag...
    pip install --user aiortc aiohttp mss Pillow numpy av
    if %errorlevel% neq 0 (
        echo.
        echo   ERROR: Failed to install dependencies.
        echo   Try running this installer as Administrator.
        echo.
        pause
        exit /b 1
    )
)
echo   Dependencies installed successfully.
echo.

REM — Check for token file
echo [3/4] Checking for device token...
if not exist "token.txt" (
    echo.
    echo   No token.txt file found in this folder.
    echo.
    echo   You need your device token from Viraj (Primary Master).
    echo   Viraj will give you a long string that looks like:
    echo     a1b2c3d4-e5f6-7890-abcd-ef1234567890
    echo.
    echo   To add your token:
    echo   1. Open Notepad
    echo   2. Paste ONLY the token string (no spaces, no quotes)
    echo   3. Save as: token.txt  (in this same folder)
    echo   4. Run this installer again
    echo.
    echo   Or ask Viraj to send you the token via a secure channel.
    echo.
    pause
    exit /b 1
)

REM Validate token is not empty
for /f "tokens=*" %%i in (token.txt) do set TOKEN=%%i
if "%TOKEN%"=="" (
    echo   ERROR: token.txt is empty. Paste your device token into it.
    echo.
    pause
    exit /b 1
)
echo   Token found in token.txt
echo.

REM — Verify token works
echo [4/4] Verifying connection to CRM...
python -c "import urllib.request,json;req=urllib.request.Request('https://obqifnikjjplygaobyxk.supabase.co/functions/v1/screen-monitoring-signaling',data=json.dumps({'action':'register'}).encode(),headers={'Content-Type':'application/json','X-Device-Token':'%TOKEN%'});resp=urllib.request.urlopen(req);d=json.loads(resp.read());print('OK' if d.get('ok') else 'FAIL: '+str(d))"
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: Could not connect to the CRM server.
    echo   Check your internet connection and verify the token is correct.
    echo.
    pause
    exit /b 1
)
echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo   Your agent is ready to run.
echo.
echo   To start monitoring now, run:
echo     start_agent.bat
echo.
echo   To auto-start on login, run:
echo     install_startup.bat
echo.
echo   The first time you start the agent, a consent
echo   dialog will appear. Click "I Consent" to proceed.
echo.
pause
