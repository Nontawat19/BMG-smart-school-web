#!/bin/bash
clear
echo "==================================================="
echo "  BMG SmartSchool - CCTV Local Bridge Startup Script"
echo "  This script runs the local camera proxy automatically"
echo "==================================================="
echo ""

# Get the directory of this script
cd "$(dirname "$0")"

# Check if Python is installed
if ! command -v python3 &> /dev/null
then
    echo "[ERROR] python3 could not be found! Please install Python 3."
    exit 1
fi

# requests is optional. If it is not installed, local_camera_proxy.py will
# safely fall back to Python's built-in urllib without downloading packages.
if ! command -v ffmpeg &> /dev/null
then
    echo "[INFO] ffmpeg was not found. RTSP cameras require ffmpeg."
    if command -v brew &> /dev/null
    then
        echo "[INFO] Installing ffmpeg with Homebrew..."
        brew install ffmpeg
        if ! command -v ffmpeg &> /dev/null
        then
            echo "[ERROR] ffmpeg installation finished but ffmpeg is still not in PATH."
            echo "        Please close this window, open Terminal, run: brew install ffmpeg"
            echo "        Then open this startup script again."
            read -r -p "Press Enter to close..."
            exit 1
        fi
    else
        echo "[ERROR] Homebrew was not found, so ffmpeg cannot be installed automatically."
        echo "        Install Homebrew first:"
        echo '        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        echo "        Then run: brew install ffmpeg"
        read -r -p "Press Enter to close..."
        exit 1
    fi
fi

PORT=18188
if command -v lsof &> /dev/null
then
    existing_pids=$(lsof -ti tcp:${PORT} 2>/dev/null)
    if [ -n "$existing_pids" ]
    then
        echo "[INFO] Port ${PORT} is already in use. Restarting existing CCTV Local Bridge..."
        for pid in $existing_pids
        do
            command_line=$(ps -p "$pid" -o command= 2>/dev/null)
            echo "       stopping PID $pid: $command_line"
            kill "$pid" 2>/dev/null
        done
        sleep 1

        still_running=$(lsof -ti tcp:${PORT} 2>/dev/null)
        if [ -n "$still_running" ]
        then
            echo "[INFO] Existing process is still running, forcing it to stop..."
            for pid in $still_running
            do
                kill -9 "$pid" 2>/dev/null
            done
            sleep 1
        fi
    fi
fi

echo "[SUCCESS] Starting CCTV Local Bridge..."
python3 local_camera_proxy.py
