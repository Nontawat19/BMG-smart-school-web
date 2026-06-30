#!/usr/bin/env python3
"""
BMG SmartSchool - CCTV Proxy Auto-Start Installer
รันครั้งเดียว แล้ว Proxy จะเริ่มทำงานอัตโนมัติทุกครั้งที่เปิดเครื่อง
"""

import os
import sys
import platform
import subprocess
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROXY_SCRIPT = os.path.join(SCRIPT_DIR, "local_camera_proxy.py")
SERVICE_LABEL = "com.bmg.smartschool.cameraproxy"
TASK_NAME = "BMG_SmartSchool_CameraProxy"


def detect_python():
    for cmd in ("python3", "python"):
        path = shutil.which(cmd)
        if path:
            try:
                result = subprocess.run([path, "--version"], capture_output=True, text=True)
                if "Python 3" in result.stdout or "Python 3" in result.stderr:
                    return path
            except Exception:
                pass
    print("[ERROR] ไม่พบ Python 3 กรุณาติดตั้งก่อนใช้งาน")
    sys.exit(1)


# ─────────────────────────────────────────────
#  macOS
# ─────────────────────────────────────────────

def _macos_uid():
    return subprocess.run(["id", "-u"], capture_output=True, text=True).stdout.strip()


def install_macos(python_path):
    plist_dir = os.path.expanduser("~/Library/LaunchAgents")
    plist_path = os.path.join(plist_dir, f"{SERVICE_LABEL}.plist")
    log_out = os.path.join(SCRIPT_DIR, "camera_proxy_stdout.log")
    log_err = os.path.join(SCRIPT_DIR, "camera_proxy_stderr.log")

    os.makedirs(plist_dir, exist_ok=True)

    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{python_path}</string>
        <string>{PROXY_SCRIPT}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>{SCRIPT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{log_out}</string>
    <key>StandardErrorPath</key>
    <string>{log_err}</string>
</dict>
</plist>"""

    # ถอดออกก่อน (รองรับทั้ง macOS เก่าและใหม่)
    uid = _macos_uid()
    subprocess.run(["launchctl", "bootout", f"gui/{uid}", plist_path], capture_output=True)
    subprocess.run(["launchctl", "unload", plist_path], capture_output=True)

    with open(plist_path, "w") as f:
        f.write(plist)

    # ลองใช้ bootstrap (macOS 10.15+) ก่อน ถ้าไม่ได้ fallback เป็น load (macOS เก่า)
    result = subprocess.run(
        ["launchctl", "bootstrap", f"gui/{uid}", plist_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        result = subprocess.run(["launchctl", "load", plist_path], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[ERROR] ลงทะเบียน LaunchAgent ไม่สำเร็จ: {result.stderr.strip()}")
            sys.exit(1)

    # เริ่มทำงานทันทีโดยไม่ต้องรอ reboot
    subprocess.run(["launchctl", "kickstart", "-k", f"gui/{uid}/{SERVICE_LABEL}"], capture_output=True)

    print(f"[SUCCESS] ติดตั้งสำเร็จ!")
    print(f"[INFO]    Proxy กำลังทำงานอยู่แล้วตอนนี้")
    print(f"[INFO]    จะรันอัตโนมัติทุกครั้งที่ login เข้า Mac")
    print(f"[INFO]    ถ้า Proxy หยุดทำงาน ระบบจะ restart ให้เองอัตโนมัติ")
    print(f"[INFO]    Log: {log_out}")


def uninstall_macos():
    plist_path = os.path.expanduser(f"~/Library/LaunchAgents/{SERVICE_LABEL}.plist")
    uid = _macos_uid()
    if os.path.exists(plist_path):
        # ลองทั้ง bootout (ใหม่) และ unload (เก่า) เพื่อให้ครอบคลุมทุก macOS version
        subprocess.run(["launchctl", "bootout", f"gui/{uid}/{SERVICE_LABEL}"], capture_output=True)
        subprocess.run(["launchctl", "bootout", f"gui/{uid}", plist_path], capture_output=True)
        subprocess.run(["launchctl", "unload", plist_path], capture_output=True)
        os.remove(plist_path)
        print("[SUCCESS] ถอนการติดตั้งสำเร็จ Proxy จะไม่รันอัตโนมัติอีกต่อไป")
    else:
        print("[INFO] ไม่พบ service ที่ติดตั้งไว้")


# ─────────────────────────────────────────────
#  Windows
# ─────────────────────────────────────────────

def install_windows(python_path):
    # ใช้ pythonw.exe (ไม่มี console window)
    # local_camera_proxy.py จัดการ sys.stdout=None เองแล้ว จึงทำงานได้กับ pythonw
    pythonw = os.path.join(os.path.dirname(python_path), "pythonw.exe")
    if not os.path.exists(pythonw):
        pythonw = python_path  # fallback: ใช้ python.exe แทน

    log_out = os.path.join(SCRIPT_DIR, "camera_proxy_stdout.log")
    log_err = os.path.join(SCRIPT_DIR, "camera_proxy_stderr.log")
    task_cmd = f'"{pythonw}" "{PROXY_SCRIPT}"'

    # ลบ entry เก่าจากทุก method ก่อน (ป้องกัน duplicate)
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        try:
            winreg.DeleteValue(key, TASK_NAME)
        except FileNotFoundError:
            pass
        winreg.CloseKey(key)
    except Exception:
        pass
    subprocess.run(f'schtasks /delete /tn "{TASK_NAME}" /f', capture_output=True, shell=True)
    for old_file in ["start_proxy_hidden.vbs", "run_proxy_hidden.vbs"]:
        p = os.path.join(SCRIPT_DIR, old_file)
        if os.path.exists(p):
            os.remove(p)

    # ── ลงทะเบียน Task Scheduler (ดีกว่า Registry: รองรับ restart อัตโนมัติ) ──
    # สร้าง XML task definition เพื่อตั้ง RestartOnFailure ได้
    task_xml = f'''<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>99</Count>
    </RestartOnFailure>
  </Settings>
  <Actions>
    <Exec>
      <Command>{pythonw}</Command>
      <Arguments>"{PROXY_SCRIPT}"</Arguments>
      <WorkingDirectory>{SCRIPT_DIR}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>'''

    import tempfile
    xml_file = os.path.join(tempfile.gettempdir(), f"{TASK_NAME}.xml")
    with open(xml_file, "w", encoding="utf-16") as f:
        f.write(task_xml)

    result = subprocess.run(
        f'schtasks /create /tn "{TASK_NAME}" /xml "{xml_file}" /f',
        capture_output=True, text=True, shell=True
    )
    os.remove(xml_file)

    if result.returncode != 0:
        # Fallback: Registry HKCU\Run (ถ้า schtasks ไม่ทำงาน)
        print(f"[WARN] Task Scheduler ล้มเหลว ({result.stderr.strip()}) → ใช้ Registry แทน")
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0, winreg.KEY_SET_VALUE
            )
            winreg.SetValueEx(key, TASK_NAME, 0, winreg.REG_SZ, task_cmd)
            winreg.CloseKey(key)
            print("[INFO]    ลงทะเบียน Registry startup สำเร็จ (ไม่มี auto-restart)")
        except Exception as exc:
            print(f"[ERROR] ลงทะเบียน auto-start ไม่สำเร็จ: {exc}")
            sys.exit(1)
    else:
        print("[INFO]    Task Scheduler: รันอัตโนมัติตอน login + restart เมื่อ crash")

    # หยุด process เก่า แล้วเริ่มทันที (ไม่ต้อง reboot)
    _kill_port_windows(18188)
    import time as _time
    _time.sleep(1)

    subprocess.Popen(
        [pythonw, PROXY_SCRIPT],
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW,
        cwd=SCRIPT_DIR,
    )

    print("[SUCCESS] ติดตั้งสำเร็จ! Proxy กำลังทำงานเบื้องหลังแล้ว")
    print("[INFO]    จะรันอัตโนมัติทุกครั้งที่เปิดเครื่อง + restart เมื่อ crash")
    print(f"[INFO]    Log: {log_out}")


def _kill_port_windows(port):
    """หยุด process ที่ใช้ port 18188 อยู่ (ค้นจาก netstat แล้ว kill ด้วย PID)"""
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        killed = []
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                pid = parts[-1]
                if pid.isdigit() and pid not in killed:
                    subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True)
                    killed.append(pid)
        if killed:
            print(f"[INFO]    หยุด process PID {', '.join(killed)} สำเร็จ")
        else:
            print(f"[INFO]    ไม่มี process รันอยู่บน port {port}")
    except Exception as exc:
        print(f"[WARN]    kill process ไม่สำเร็จ: {exc}")


def uninstall_windows():
    import winreg

    # ลบ Registry startup entry
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        winreg.DeleteValue(key, TASK_NAME)
        winreg.CloseKey(key)
        print(f"[SUCCESS] ลบ startup entry '{TASK_NAME}' สำเร็จ")
    except FileNotFoundError:
        print(f"[INFO] ไม่พบ startup entry '{TASK_NAME}'")
    except Exception as exc:
        print(f"[WARN] ลบ Registry entry ไม่สำเร็จ: {exc}")

    # ลบ Task Scheduler และ VBS เก่า (ถ้ามีจากเวอร์ชันก่อน)
    subprocess.run(f'schtasks /delete /tn "{TASK_NAME}" /f',
                   capture_output=True, shell=True)
    vbs_old = os.path.join(SCRIPT_DIR, "start_proxy_hidden.vbs")
    if os.path.exists(vbs_old):
        os.remove(vbs_old)

    # หยุด proxy ที่รันอยู่โดยค้นหาจาก port 18188
    _kill_port_windows(18188)
    print("[SUCCESS] ถอนการติดตั้งสำเร็จ Proxy จะไม่รันอัตโนมัติอีกต่อไป")


# ─────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────

def main():
    system = platform.system()
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "install"

    print("=" * 52)
    print("  BMG SmartSchool - CCTV Proxy Auto-Start Installer")
    print("=" * 52)
    print(f"  OS      : {system}")
    print(f"  Action  : {action}")
    print(f"  Script  : {PROXY_SCRIPT}")
    print("=" * 52)
    print()

    if not os.path.exists(PROXY_SCRIPT):
        print(f"[ERROR] ไม่พบไฟล์ {PROXY_SCRIPT}")
        print("        กรุณารัน installer นี้จากโฟลเดอร์เดียวกับ local_camera_proxy.py")
        sys.exit(1)

    if action == "uninstall":
        if system == "Darwin":
            uninstall_macos()
        elif system == "Windows":
            uninstall_windows()
        else:
            print(f"[ERROR] ไม่รองรับ OS: {system}")
            sys.exit(1)
        return

    # install (default)
    python_path = detect_python()
    print(f"  Python  : {python_path}")
    print()

    if system == "Darwin":
        install_macos(python_path)
    elif system == "Windows":
        install_windows(python_path)
    else:
        print(f"[ERROR] ไม่รองรับ OS: {system}  (รองรับเฉพาะ macOS และ Windows)")
        sys.exit(1)

    print()
    print("─" * 52)
    print("  หากต้องการถอนการติดตั้งในภายหลัง ให้รัน:")
    print("  python3 install_autostart.py uninstall")
    print("─" * 52)


if __name__ == "__main__":
    main()
