import http.server
import socketserver
import urllib.request
import urllib.parse
import base64
import shutil
import subprocess
import threading
import time
import ipaddress
import re
import sys
import os

# Fix: pythonw.exe (Windows background) sets sys.stdout/stderr = None -> print() crashes
# Redirect to log files so the proxy can run silently without a console window
if getattr(sys, 'stdout', None) is None or getattr(sys, 'stderr', None) is None:
    _log_dir = os.path.dirname(os.path.abspath(__file__))
    if getattr(sys, 'stdout', None) is None:
        sys.stdout = open(os.path.join(_log_dir, 'camera_proxy_stdout.log'), 'a', encoding='utf-8', buffering=1)
    if getattr(sys, 'stderr', None) is None:
        sys.stderr = open(os.path.join(_log_dir, 'camera_proxy_stderr.log'), 'a', encoding='utf-8', buffering=1)

PORT = 18188
HOST = "127.0.0.1"
BRIDGE_VERSION = "2026.06.30-windows-fix"
ALLOWED_ORIGINS = {
    "https://bmg-smartschool.web.app",
    "https://bmg-smartschool.firebaseapp.com",
    "https://epp5online.web.app",
    "https://epp5online.firebaseapp.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
ALLOWED_FINDFACE_HOSTS = {
    host.strip()
    for host in os.environ.get("BMG_FINDFACE_HOSTS", "118.172.43.186,localhost,127.0.0.1").split(",")
    if host.strip()
}
RTSP_FRAME_MAX_AGE_SECONDS = 0.8
RTSP_STREAM_FPS = int(os.environ.get("BMG_RTSP_FPS", "12"))
RTSP_OUTPUT_MAX_WIDTH = int(os.environ.get("BMG_RTSP_MAX_WIDTH", "1280"))
RTSP_JPEG_QUALITY = os.environ.get("BMG_RTSP_JPEG_QUALITY", "2")
RTSP_TRANSPORTS = [
    transport.strip()
    for transport in os.environ.get("BMG_RTSP_TRANSPORTS", "tcp,udp").split(",")
    if transport.strip() in ("tcp", "udp")
]
RTSP_FIRST_FRAME_TIMEOUT_SECONDS = float(os.environ.get("BMG_RTSP_FIRST_FRAME_TIMEOUT", "10"))
RTSP_STREAM_BOUNDARY = "bmg_rtsp_frame"
RTSP_PIPE_READ_BYTES = int(os.environ.get("BMG_RTSP_PIPE_READ_BYTES", "262144"))
RTSP_WORKERS = {}
RTSP_WORKERS_LOCK = threading.Lock()


def sanitize_for_log(value):
    value = re.sub(r"(rtsp://)([^:/?#]+):([^@/?#]+)@", r"\1***:***@", value)
    # Camera URLs (with basic-auth credentials) are passed as a `url=` query
    # param to /frame and /findface, often percent-encoded. Redact the whole
    # value rather than trying to match every encoding of "user:pass@".
    value = re.sub(r"(?i)(url=)[^&\s\"]+", r"\1[redacted]", value)
    return value


LOG_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILES = (
    os.path.join(LOG_DIR, "camera_proxy_stdout.log"),
    os.path.join(LOG_DIR, "camera_proxy_stderr.log"),
)
LOG_MAX_BYTES = int(os.environ.get("BMG_LOG_MAX_BYTES", str(5 * 1024 * 1024)))
LOG_TRIM_INTERVAL_SECONDS = 300


def _trim_log_file(path, max_bytes):
    try:
        if os.path.getsize(path) <= max_bytes:
            return
        keep_bytes = max_bytes // 2
        with open(path, "rb") as f:
            f.seek(-keep_bytes, os.SEEK_END)
            tail = f.read()
        with open(path, "wb") as f:
            f.write(b"--- log trimmed (exceeded %d bytes) ---\n" % max_bytes)
            f.write(tail)
    except OSError:
        pass


def _log_rotation_loop():
    # Truncates the log files in place once they grow too large. Safe to run
    # alongside the 'a' / append-mode writers because append writes always
    # seek to end-of-file first, so they keep working correctly after a trim.
    while True:
        time.sleep(LOG_TRIM_INTERVAL_SECONDS)
        for log_path in LOG_FILES:
            _trim_log_file(log_path, LOG_MAX_BYTES)


class RtspFrameWorker:
    def __init__(self, url):
        self.url = url
        self.latest_frame = None
        self.latest_frame_at = 0
        self.last_error = None
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def get_frame(self, timeout=6, require_fresh=True, after=0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self.lock:
                has_newer_frame = not after or self.latest_frame_at > after
                if self.latest_frame and has_newer_frame and (
                    not require_fresh or time.time() - self.latest_frame_at <= RTSP_FRAME_MAX_AGE_SECONDS
                ):
                    return self.latest_frame, self.latest_frame_at
                last_error = self.last_error

            if last_error and not last_error.startswith("Connecting RTSP"):
                raise RuntimeError(last_error)
            time.sleep(0.006)

        raise TimeoutError("No fresh RTSP frame available yet. Check the RTSP URL, camera account, and network.")

    def run(self):
        if not shutil.which("ffmpeg"):
            with self.lock:
                self.last_error = "ffmpeg not found. Please install ffmpeg to use RTSP cameras."
            return

        while not self.stop_event.is_set():
            process = None
            transport = "tcp"
            try:
                for transport in RTSP_TRANSPORTS or ["tcp"]:
                    if self.stop_event.is_set():
                        return

                    with self.lock:
                        self.last_error = f"Connecting RTSP via {transport.upper()}..."

                    process_started_at = time.time()
                    process = subprocess.Popen(
                        [
                            "ffmpeg",
                            "-hide_banner",
                            "-loglevel",
                            "error",
                            "-fflags",
                            "nobuffer+discardcorrupt",
                            "-avioflags",
                            "direct",
                            "-flags",
                            "low_delay",
                            "-probesize",
                            "32",
                            "-analyzeduration",
                            "0",
                            "-rtsp_transport",
                            transport,
                            "-i",
                            self.url,
                            "-an",
                            "-vf",
                            f"fps={RTSP_STREAM_FPS},scale={RTSP_OUTPUT_MAX_WIDTH}:-2:force_original_aspect_ratio=decrease",
                            "-vsync",
                            "drop",
                            "-q:v",
                            RTSP_JPEG_QUALITY,
                            "-f",
                            "image2pipe",
                            "-vcodec",
                            "mjpeg",
                            "pipe:1",
                        ],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        stdin=subprocess.DEVNULL,
                        **(
                            {"creationflags": subprocess.CREATE_NO_WINDOW}
                            if sys.platform == "win32" else {}
                        ),
                    )

                    # Make stdout non-blocking if possible (Unix/macOS)
                    is_nonblocking = False
                    if process.stdout:
                        try:
                            import fcntl
                            fd = process.stdout.fileno()
                            fl = fcntl.fcntl(fd, fcntl.F_GETFL)
                            fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
                            is_nonblocking = True
                        except (ImportError, AttributeError):
                            pass

                    def stop_if_no_first_frame(proc, started_at, rtsp_transport):
                        time.sleep(RTSP_FIRST_FRAME_TIMEOUT_SECONDS)
                        if self.stop_event.is_set() or proc.poll() is not None:
                            return
                        with self.lock:
                            has_first_frame = self.latest_frame_at >= started_at
                            if not has_first_frame:
                                self.last_error = (
                                    f"No RTSP frame from camera via {rtsp_transport.upper()} after "
                                    f"{RTSP_FIRST_FRAME_TIMEOUT_SECONDS:.0f}s. Trying another transport or check URL/account."
                                )
                        if not has_first_frame and proc.poll() is None:
                            try:
                                proc.kill()
                            except Exception:
                                pass

                    threading.Thread(
                        target=stop_if_no_first_frame,
                        args=(process, process_started_at, transport),
                        daemon=True,
                    ).start()

                    buffer = b""
                    # Windows: ใช้ queue + thread แยก เพราะ os.read() block ไม่มี timeout
                    if not is_nonblocking and process.stdout:
                        import queue as _queue
                        pipe_queue = _queue.Queue()

                        def _pipe_reader(pipe, q, n):
                            try:
                                while True:
                                    data = pipe.read(n)
                                    if not data:
                                        break
                                    q.put(data)
                            except Exception:
                                pass
                            finally:
                                q.put(None)

                        _reader_thread = threading.Thread(
                            target=_pipe_reader,
                            args=(process.stdout, pipe_queue, RTSP_PIPE_READ_BYTES),
                            daemon=True,
                        )
                        _reader_thread.start()

                    while not self.stop_event.is_set() and process.poll() is None:
                        if is_nonblocking:
                            try:
                                chunk = os.read(process.stdout.fileno(), RTSP_PIPE_READ_BYTES) if process.stdout else b""
                                if not chunk:
                                    break
                            except BlockingIOError:
                                time.sleep(0.005)
                                continue
                            except OSError:
                                break
                        else:
                            try:
                                chunk = pipe_queue.get(timeout=0.1)
                            except Exception:
                                continue
                            if chunk is None:
                                break

                        buffer += chunk

                        while True:
                            start = buffer.find(b"\xff\xd8")
                            end = buffer.find(b"\xff\xd9", start + 2) if start != -1 else -1
                            if start == -1:
                                buffer = buffer[-1:]
                                break
                            if end == -1:
                                buffer = buffer[start:]
                                break

                            frame = buffer[start:end + 2]
                            buffer = buffer[end + 2:]
                            with self.lock:
                                self.latest_frame = frame
                                self.latest_frame_at = time.time()
                                self.last_error = None

                    stderr = b""
                    if process.stderr:
                        # Make stderr non-blocking to prevent read lockup if it exits
                        try:
                            if is_nonblocking:
                                fd_err = process.stderr.fileno()
                                fl_err = fcntl.fcntl(fd_err, fcntl.F_GETFL)
                                fcntl.fcntl(fd_err, fcntl.F_SETFL, fl_err | os.O_NONBLOCK)
                                try:
                                    stderr = os.read(fd_err, 4096)
                                except (BlockingIOError, OSError):
                                    pass
                            else:
                                stderr = process.stderr.read(4096)
                        except Exception:
                            pass
                    if process.returncode not in (0, None):
                        message = stderr.decode("utf-8", errors="replace").strip()
                        if not message:
                            message = self.last_error or f"ffmpeg exited with code {process.returncode}"
                        with self.lock:
                            self.last_error = message.splitlines()[-1][:500]
                        print(
                            f"[RTSP:{transport.upper()}] {sanitize_for_log(self.url)} failed: {self.last_error}",
                            file=sys.stderr,
                        )
                    if process and process.poll() is None:
                        process.kill()
                    process = None

                    with self.lock:
                        frame_is_fresh = (
                            self.latest_frame
                            and time.time() - self.latest_frame_at <= RTSP_FRAME_MAX_AGE_SECONDS
                        )
                    if frame_is_fresh:
                        break

                time.sleep(0.5)
            except Exception as exc:
                with self.lock:
                    self.last_error = f"RTSP {transport.upper()} error: {exc}"
            finally:
                if process and process.poll() is None:
                    process.kill()
                time.sleep(1)


def get_rtsp_frame(url, after=0):
    with RTSP_WORKERS_LOCK:
        worker = RTSP_WORKERS.get(url)
        if not worker:
            worker = RtspFrameWorker(url)
            RTSP_WORKERS[url] = worker
    return worker.get_frame(require_fresh=True, after=after)


def get_rtsp_worker(url):
    with RTSP_WORKERS_LOCK:
        worker = RTSP_WORKERS.get(url)
        if not worker:
            worker = RtspFrameWorker(url)
            RTSP_WORKERS[url] = worker
    return worker


def is_allowed_findface_target(target_url):
    parsed = urllib.parse.urlparse(target_url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False

    hostname = parsed.hostname
    if hostname in ALLOWED_FINDFACE_HOSTS:
        return True

    try:
        target_ip = ipaddress.ip_address(hostname)
        return target_ip.is_private or target_ip.is_loopback or target_ip.is_link_local
    except ValueError:
        return False

# Try importing requests for connection pooling to keep connections alive and avoid lag, fall back to urllib
try:
    import requests
    from requests.adapters import HTTPAdapter
    HAS_REQUESTS = True
    session = requests.Session()
    # Configure connection pooling to allow rapid concurrent requests to the CCTV camera
    adapter = HTTPAdapter(pool_connections=10, pool_maxsize=50)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    print("=" * 60)
    print("🚀 [INFO] Enabled high-performance connection pooling using 'requests'")
except ImportError:
    HAS_REQUESTS = False
    print("=" * 60)
    print("⚠️ [WARNING] 'requests' library not found. Falling back to standard 'urllib'")
    print("   (Recommended: Run 'pip install requests' to achieve smoother framerates)")

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Avoid logging full camera URLs because they may contain credentials.
        sys.stderr.write("%s - %s\n" % (self.address_string(), sanitize_for_log(format % args)))

    def is_allowed_browser_origin(self):
        origin = self.headers.get('Origin')
        referer = self.headers.get('Referer')

        if origin:
            return origin in ALLOWED_ORIGINS

        if referer:
            try:
                parsed = urllib.parse.urlparse(referer)
                referer_origin = f"{parsed.scheme}://{parsed.netloc}"
                return referer_origin in ALLOWED_ORIGINS
            except Exception:
                return False

        # Allow command-line health checks from the same machine.
        return self.client_address[0] in ("127.0.0.1", "::1")

    def set_cors_headers(self):
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header(
                'Access-Control-Allow-Headers',
                'Content-Type, content-type, Cache-Control, cache-control, Pragma, pragma, Authorization, authorization, X-School-Id, x-school-id'
            )
            self.send_header('Access-Control-Allow-Private-Network', 'true')

    def end_headers(self):
        self.set_cors_headers()
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def do_OPTIONS(self):
        # Handle Private Network Access (PNA) Preflight requests
        if not self.is_allowed_browser_origin():
            self.send_response(403)
            self.end_headers()
            return

        self.send_response(204)
        self.end_headers()

    def forward_findface_request(self, method):
        try:
            if not self.is_allowed_browser_origin():
                self.send_response(403)
                self.end_headers()
                self.wfile.write(b"Origin is not allowed")
                return

            parsed_url = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            target_url = query_params.get('url', [None])[0]

            if not target_url:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Missing 'url' parameter")
                return

            if not is_allowed_findface_target(target_url):
                self.send_response(403)
                self.end_headers()
                self.wfile.write(b"FindFace target host is not allowed")
                return

            forward_headers = {}
            for header_name in ("Authorization", "Content-Type", "X-School-Id"):
                value = self.headers.get(header_name)
                if value:
                    forward_headers[header_name] = value

            body = None
            if method == "POST":
                content_length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(content_length) if content_length > 0 else b""

            if HAS_REQUESTS:
                response = session.request(method, target_url, headers=forward_headers, data=body, timeout=12)
                response_body = response.content
                content_type = response.headers.get("Content-Type", "application/json")
                status_code = response.status_code
            else:
                req = urllib.request.Request(target_url, data=body, headers=forward_headers, method=method)
                try:
                    with urllib.request.urlopen(req, timeout=12) as response:
                        response_body = response.read()
                        content_type = response.headers.get("Content-Type", "application/json")
                        status_code = response.status
                except urllib.error.HTTPError as error:
                    response_body = error.read()
                    content_type = error.headers.get("Content-Type", "text/plain")
                    status_code = error.code

            self.send_response(status_code)
            self.send_header("Content-Type", content_type)
            self.end_headers()
            self.wfile.write(response_body)
        except Exception as exc:
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(f"FindFace Proxy Error: {sanitize_for_log(str(exc))}".encode('utf-8'))

    def do_POST(self):
        if self.path.startswith('/findface'):
            self.forward_findface_request("POST")
            return

        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/health'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            ffmpeg_status = shutil.which("ffmpeg") or "not found"
            self.wfile.write(f"BMG CCTV Local Bridge {BRIDGE_VERSION}\nffmpeg: {ffmpeg_status}\n".encode('utf-8'))
            return

        if self.path.startswith('/findface'):
            self.forward_findface_request("GET")
            return

        if self.path.startswith('/stream'):
            try:
                if not self.is_allowed_browser_origin():
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b"Origin is not allowed")
                    return

                parsed_url = urllib.parse.urlparse(self.path)
                query_params = urllib.parse.parse_qs(parsed_url.query)
                target_url = query_params.get('url', [None])[0]

                if not target_url:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Missing 'url' parameter")
                    return

                parsed_target_url = urllib.parse.urlparse(target_url)
                if parsed_target_url.scheme != "rtsp" or not parsed_target_url.hostname:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Only RTSP URLs are supported by /stream")
                    return

                try:
                    target_ip = ipaddress.ip_address(parsed_target_url.hostname)
                    allowed_camera_host = (
                        target_ip.is_private
                        or target_ip.is_loopback
                        or target_ip.is_link_local
                    )
                except ValueError:
                    allowed_camera_host = parsed_target_url.hostname in ("localhost",)

                if not allowed_camera_host:
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b"Only local network RTSP URLs are allowed")
                    return

                worker = get_rtsp_worker(target_url)
                try:
                    first_frame, _first_frame_at = worker.get_frame(timeout=8)
                except Exception as exc:
                    self.send_response(502)
                    self.send_header('Content-Type', 'text/plain; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(f"RTSP Stream Error: {sanitize_for_log(str(exc))}".encode('utf-8'))
                    return

                self.send_response(200)
                self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={RTSP_STREAM_BOUNDARY}")
                self.send_header("Connection", "close")
                self.end_headers()

                last_frame_at = 0
                frame_delay = 1 / RTSP_STREAM_FPS
                self.wfile.write(
                    (
                        f"--{RTSP_STREAM_BOUNDARY}\r\n"
                        "Content-Type: image/jpeg\r\n"
                        f"Content-Length: {len(first_frame)}\r\n\r\n"
                    ).encode("ascii")
                )
                self.wfile.write(first_frame)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
                while True:
                    with worker.lock:
                        frame = worker.latest_frame
                        frame_at = worker.latest_frame_at
                        last_error = worker.last_error

                    if last_error and not frame:
                        raise RuntimeError(last_error)

                    if frame and frame_at != last_frame_at:
                        self.wfile.write(
                            (
                                f"--{RTSP_STREAM_BOUNDARY}\r\n"
                                "Content-Type: image/jpeg\r\n"
                                f"Content-Length: {len(frame)}\r\n\r\n"
                            ).encode("ascii")
                        )
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")
                        self.wfile.flush()
                        last_frame_at = frame_at

                    time.sleep(frame_delay)
            except (BrokenPipeError, ConnectionResetError):
                return
            except Exception as exc:
                try:
                    self.send_response(502)
                    self.send_header('Content-Type', 'text/plain; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(f"RTSP Stream Error: {sanitize_for_log(str(exc))}".encode('utf-8'))
                except Exception:
                    pass
            return

        if self.path.startswith('/frame'):
            try:
                if not self.is_allowed_browser_origin():
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b"Origin is not allowed")
                    return

                # Parse query parameters to extract the target camera URL
                parsed_url = urllib.parse.urlparse(self.path)
                query_params = urllib.parse.parse_qs(parsed_url.query)
                target_url = query_params.get('url', [None])[0]
                
                if not target_url:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Missing 'url' parameter")
                    return

                parsed_target_url = urllib.parse.urlparse(target_url)
                if parsed_target_url.scheme not in ("http", "https", "rtsp") or not parsed_target_url.hostname:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Invalid camera URL")
                    return

                try:
                    target_ip = ipaddress.ip_address(parsed_target_url.hostname)
                    allowed_camera_host = (
                        target_ip.is_private
                        or target_ip.is_loopback
                        or target_ip.is_link_local
                    )
                except ValueError:
                    allowed_camera_host = parsed_target_url.hostname in ("localhost",)

                if not allowed_camera_host:
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b"Only local network camera URLs are allowed")
                    return
                
                if parsed_target_url.scheme == "rtsp":
                    try:
                        after_raw = query_params.get('after', ['0'])[0]
                        try:
                            after = float(after_raw)
                        except (TypeError, ValueError):
                            after = 0
                        img_data, frame_at = get_rtsp_frame(target_url, after=after)
                    except Exception as exc:
                        self.send_response(502)
                        self.send_header('Content-Type', 'text/plain; charset=utf-8')
                        self.end_headers()
                        self.wfile.write(f"RTSP Error: {sanitize_for_log(str(exc))}".encode('utf-8'))
                        return
                    self.send_response(200)
                    self.send_header('Content-Type', 'image/jpeg')
                    self.send_header('X-BMG-Frame-At', f"{frame_at:.6f}")
                    self.end_headers()
                    self.wfile.write(img_data)
                    return

                # Check for basic authentication credentials embedded in URL
                credentials_match = re.match(r"^https?://([^:]+):([^@]+)@([^/]+)(.*)$", target_url)
                headers = {}
                clean_target_url = target_url
                auth_header = None
                
                if credentials_match:
                    user, password, ip, path = credentials_match.groups()
                    auth_str = f"{user}:{password}"
                    auth_header = "Basic " + base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
                    headers['Authorization'] = auth_header
                    # Reconstruct clean URL without credentials to prevent urllib/requests parsing bugs
                    scheme = "https" if target_url.startswith("https") else "http"
                    clean_target_url = f"{scheme}://{ip}{path}"
                
                img_data = b""
                content_type = "image/jpeg"
                
                if HAS_REQUESTS:
                    # High performance fetch using connection pooling
                    req_headers = {}
                    if auth_header:
                        req_headers['Authorization'] = auth_header
                    
                    response = session.get(clean_target_url, headers=req_headers, timeout=4)
                    if response.status_code == 200:
                        img_data = response.content
                        content_type = response.headers.get('Content-Type', 'image/jpeg')
                    else:
                        raise Exception(f"Camera returned HTTP {response.status_code}")
                else:
                    # Fallback fetch using standard urllib
                    req = urllib.request.Request(clean_target_url, headers=headers)
                    with urllib.request.urlopen(req, timeout=4) as response:
                        img_data = response.read()
                        content_type = response.headers.get('Content-Type', 'image/jpeg')
                
                self.send_response(200)
                if not content_type.startswith("image/"):
                    content_type = "image/jpeg"
                self.send_header('Content-Type', content_type)
                self.end_headers()
                self.wfile.write(img_data)
                
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b"Proxy Error: unable to fetch camera frame")
        else:
            self.send_response(404)
            self.end_headers()

# Use multi-threading to handle rapid browser frame polls concurrently without blocking
class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    ffmpeg_path = shutil.which("ffmpeg")
    print("=" * 60)
    print("               BMG Smart School - CCTV Local Bridge")
    print("=" * 60)
    print(f" Version: {BRIDGE_VERSION}")
    print(f" Running proxy on: http://127.0.0.1:{PORT}")
    print(f" ffmpeg: {ffmpeg_path or 'not found'}")
    print(f" RTSP stream: {RTSP_STREAM_FPS} fps, max width {RTSP_OUTPUT_MAX_WIDTH}px, JPEG quality {RTSP_JPEG_QUALITY}")
    print(" This local proxy only accepts requests from this machine and")
    print(" approved BMG SmartSchool origins. It allows the HTTPS website to")
    print(" connect and stream frames from your local network IP CCTV cameras.")
    print(" RTSP cameras require ffmpeg installed on this computer.")
    print(" Keep this terminal window open during kiosk attendance operations.")
    print("-" * 60)
    print(" To start: Open your browser to the production website:")
    print(" https://bmg-smartschool.web.app/attendance/checkin-out")
    print("-" * 60)
    print(" Press Ctrl+C to close this bridge proxy.")
    print("=" * 60)
    
    threading.Thread(target=_log_rotation_loop, daemon=True).start()

    try:
        with ThreadingTCPServer((HOST, PORT), ProxyHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n CCTV Local Bridge closed successfully.")
        sys.exit(0)
    except Exception as e:
        print(f"\n Error starting bridge proxy: {e}")
        sys.exit(1)
