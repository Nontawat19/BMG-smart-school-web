@echo off
title BMG SmartSchool - CCTV Local Bridge (Auto-Start Installer)

cd /d "%~dp0"

echo ===================================================
echo   BMG SmartSchool - CCTV Local Bridge (Auto-Start Installer)
echo   Installing auto-start for Windows...
echo ===================================================
echo.

python --version >nul 2>&1
if %errorlevel% equ 0 (
    python install_autostart.py
    goto end
)

py --version >nul 2>&1
if %errorlevel% equ 0 (
    py install_autostart.py
    goto end
)

echo [ERROR] Python was not found on your system.
echo         Please install Python 3 and check "Add Python to PATH" during installation.
echo         Download Python at: https://www.python.org/downloads/
echo.

:end
echo.
pause
