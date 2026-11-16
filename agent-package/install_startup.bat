@echo off
chcp 65001 >nul 2>&1
title Install Startup Shortcut
set AGENTDIR=%~dp0
set AGENTDIR=%AGENTDIR:~0,-1%
if not exist "token.txt" (
    echo ERROR: token.txt not found. Run install.bat first.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in (token.txt) do set TOKEN=%%i
echo @echo off > "%AGENTDIR%\run_silent.bat"
echo start "" /b pythonw "%AGENTDIR%\screen_agent.py" --token "%TOKEN%" >> "%AGENTDIR%\run_silent.bat"
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
copy "%AGENTDIR%\run_silent.bat" "%STARTUP%\SOFTROCK_ScreenAgent.bat" >nul 2>&1
if %errorlevel% equ 0 (
    echo Success! Agent will auto-start silently on login.
    echo To remove later, run uninstall_startup.bat
) else (
    echo ERROR: Could not create startup shortcut. Try as Administrator.
)
pause
