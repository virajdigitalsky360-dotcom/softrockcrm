@echo off
title Remove Startup Shortcut
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
if exist "%STARTUP%\SOFTROCK_ScreenAgent.bat" (
    del "%STARTUP%\SOFTROCK_ScreenAgent.bat"
    echo Startup shortcut removed.
) else (
    echo No startup shortcut found.
)
if exist "run_silent.bat" del run_silent.bat
echo Agent will no longer auto-start. Run start_agent.bat manually instead.
pause
