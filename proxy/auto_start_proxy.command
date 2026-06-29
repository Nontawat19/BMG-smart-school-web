#!/bin/bash
clear
echo "==================================================="
echo "  BMG SmartSchool - CCTV Local Bridge"
echo "  ติดตั้งครั้งเดียว หลังจากนี้รันอัตโนมัติทุกครั้ง"
echo "==================================================="
echo ""

cd "$(dirname "$0")"

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] ไม่พบ python3 กรุณาติดตั้ง Python 3 ก่อน"
    read -p "กด Enter เพื่อปิด..."
    exit 1
fi

python3 install_autostart.py

echo ""
read -p "กด Enter เพื่อปิดหน้าต่างนี้..."
