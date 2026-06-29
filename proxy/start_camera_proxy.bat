@echo off
chcp 65001 >nul
title BMG SmartSchool - CCTV Local Bridge
echo ===================================================
echo   BMG SmartSchool - CCTV Local Bridge
echo   ติดตั้งครั้งเดียว หลังจากนี้รันอัตโนมัติทุกครั้ง
echo ===================================================
echo.

cd /d "%~dp0"

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบ Python กรุณาติดตั้ง Python 3 และติ๊ก "Add Python to PATH"
    echo         ดาวน์โหลดได้ที่ https://www.python.org/downloads/
    pause
    exit /b 1
)

python install_autostart.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] ติดตั้งไม่สำเร็จ ลองคลิกขวาแล้วเลือก "Run as administrator"
)

echo.
pause
