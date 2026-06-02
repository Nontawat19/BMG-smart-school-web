@echo off
title BMG CCTV Local Bridge Proxy
echo ===================================================
echo   BMG SmartSchool - CCTV Local Bridge Startup Script
echo   This script runs the local camera proxy automatically
echo ===================================================
echo.

:: Get the directory where this script is located
cd /d "%~dp0"

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3 and check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

:: requests is optional. If it is not installed, local_camera_proxy.py will
:: safely fall back to Python's built-in urllib without downloading packages.
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] ffmpeg was not found. RTSP cameras require ffmpeg.
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        echo [INFO] Installing ffmpeg with winget...
        winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
        where ffmpeg >nul 2>&1
        if %errorlevel% neq 0 (
            echo [ERROR] ffmpeg installation finished but ffmpeg is still not in PATH.
            echo         Close this window and open it again. If it still fails, restart Windows.
            pause
            exit /b 1
        )
    ) else (
        echo [ERROR] winget was not found, so ffmpeg cannot be installed automatically.
        echo         Install ffmpeg manually from https://ffmpeg.org/download.html
        echo         Or install App Installer / winget from Microsoft Store, then run this script again.
        pause
        exit /b 1
    )
)

set PORT=18188
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo [INFO] Port %PORT% is already in use. Restarting existing CCTV Local Bridge...
    echo        stopping PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo [SUCCESS] Starting CCTV Local Bridge...
python local_camera_proxy.py

pause
