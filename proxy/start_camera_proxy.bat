@echo off
chcp 65001 >nul
title BMG SmartSchool - CCTV Local Bridge

cd /d "%~dp0"

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบ Python กรุณาติดตั้ง Python 3 และติ๊ก "Add Python to PATH"
    echo         ดาวน์โหลดได้ที่ https://www.python.org/downloads/
    pause
    exit /b 1
)

echo ====================================================
echo   BMG SmartSchool - CCTV Local Bridge
echo   อย่าปิดหน้าต่างนี้ขณะใช้งานระบบสแกนหน้า
echo ====================================================
echo.

python local_camera_proxy.py

echo.
echo [หยุดทำงานแล้ว]
pause
