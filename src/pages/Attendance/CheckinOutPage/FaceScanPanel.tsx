import React, { useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanFace, ShieldCheck, WifiOff } from "lucide-react";
import { FoundUser } from "./types";

interface FaceScanPanelProps {
  enabled: boolean;
  endpointConfigured: boolean;
  displayUser: FoundUser | null;
  displayUsers?: FoundUser[];
  checkinTime?: string | null;
  checkoutTime?: string | null;
  onIdentifyFrame: (
    image: Blob,
    liveness?: { isFake: boolean; isScreen: boolean; isPaper: boolean; message?: string; isIpCamera?: boolean }
  ) => Promise<{ 
    matched: boolean; 
    message?: string; 
    user?: FoundUser; 
    users?: FoundUser[];
    confidence?: number;
    faceBoxes?: { x: number; y: number; width: number; height: number; user?: FoundUser | null; isFake?: boolean }[];
  }>;
  className?: string;
  currentTime?: string;
  isHoliday?: boolean;
  studentLateTime?: string;
  studentCheckoutTime?: string;
  teacherLateTime?: string;
  teacherCheckoutTime?: string;
  canScanStudents?: boolean;
  canScanTeachers?: boolean;
  schoolSettings?: any;
  currentUserId?: string;
}

interface CameraConfig {
  id?: string;
  name?: string;
  sourceType?: "webcam" | "ipcamera";
  ipCameraUrl?: string;
  mirrorFeed?: boolean;
  pairedUserId?: string;
}

const getCleanStreamUrl = (rawUrl: string, timestamp?: number): string => {
  if (!rawUrl) return "";

  const isDevProxyActive = import.meta.env.DEV || 
                           window.location.hostname === "localhost" || 
                           window.location.hostname === "127.0.0.1" ||
                           window.location.port === "5173" ||
                           window.location.port === "3000";
  
  if (isDevProxyActive) {
    try {
      const parsedUrl = new URL(rawUrl);
      if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
        const proxyParams = new URLSearchParams(parsedUrl.search);
        if (parsedUrl.username || parsedUrl.password) {
          proxyParams.set("auth", `${decodeURIComponent(parsedUrl.username)}:${decodeURIComponent(parsedUrl.password)}`);
        }
        if (timestamp) {
          proxyParams.set("t", String(timestamp));
        }

        const query = proxyParams.toString();
        return `/camera-proxy/${parsedUrl.host}${parsedUrl.pathname}${query ? `?${query}` : ""}`;
      }
    } catch {
      // Fall through to the raw URL if the input is not parseable.
    }
    
    return rawUrl;
  }

  // In production, the fetch loop decides whether a local-network camera must
  // go through the localhost bridge to avoid enabling insecure browser content.
  let cleanUrl = rawUrl;
  if (timestamp) {
    const separator = cleanUrl.includes('?') ? '&' : '?';
    return `${cleanUrl}${separator}t=${timestamp}`;
  }
  
  return cleanUrl;
};

const isPrivateCameraUrl = (rawUrl: string): boolean => {
  try {
    const { hostname } = new URL(rawUrl);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;

    const parts = hostname.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    const [a, b] = parts;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  } catch {
    return false;
  }
};

const shouldUseLocalBridgeProxy = (rawUrl: string): boolean => {
  if (!rawUrl) return false;
  let protocol = "";
  try {
    protocol = new URL(rawUrl).protocol;
  } catch {
    return false;
  }

  if (protocol === "rtsp:") {
    return isPrivateCameraUrl(rawUrl);
  }

  const isLocalWebHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.port === "5173" ||
    window.location.port === "3000";

  return window.location.protocol === "https:" && !isLocalWebHost && isPrivateCameraUrl(rawUrl);
};

const isRtspCameraUrl = (rawUrl: string): boolean => {
  try {
    return new URL(rawUrl).protocol === "rtsp:";
  } catch {
    return false;
  }
};

const getLocalBridgeFrameUrl = (rawUrl: string): string => {
  const params = new URLSearchParams({
    url: rawUrl,
    t: String(Date.now()),
  });
  return `http://127.0.0.1:18188/frame?${params.toString()}`;
};

const MOTION_SAMPLE_WIDTH = 64;
const MOTION_SCAN_HOLD_MS = 15000;
const IDLE_IP_CAMERA_PROBE_MS = 10000;
const IP_CAMERA_ACTIVE_IDENTIFY_MS = 350;
const RTSP_CAMERA_ACTIVE_IDENTIFY_MS = 600;
const WEBCAM_IDENTIFY_MS = 700;
const RTSP_CAMERA_PREVIEW_MS = 66;
const IP_CAMERA_BOX_STALE_MS = 700;
const IP_CAMERA_MOTION_OBSERVER_MS = 160;
const IP_CAMERA_IDENTIFY_MAX_WIDTH = 960;
const RTSP_CAMERA_IDENTIFY_MAX_WIDTH = 720;
const IP_CAMERA_IDENTIFY_JPEG_QUALITY = 0.86;
const RTSP_CAMERA_IDENTIFY_JPEG_QUALITY = 0.82;
const IP_CAMERA_STALE_FETCH_ABORT_MS = 1800;
const RTSP_CAMERA_STALE_FETCH_ABORT_MS = 10000;
const WEBCAM_IDENTIFY_MAX_WIDTH = 960;
const WEBCAM_IDENTIFY_JPEG_QUALITY = 0.78;
const MOTION_DIFF_THRESHOLD = 28;
const MOTION_MIN_CHANGED_PIXELS = 90;
const MOTION_MIN_CHANGED_RATIO = 0.014;
const MOTION_MIN_AREA_RATIO = 0.05;
const MOTION_MIN_SPAN_RATIO = 0.16;
const MOTION_TOP_IGNORE_RATIO = 0.16;
const MOTION_BOTTOM_IGNORE_RATIO = 0.04;

const FaceScanPanel: React.FC<FaceScanPanelProps> = ({
  enabled,
  endpointConfigured,
  displayUser,
  displayUsers = [],
  checkinTime,
  checkoutTime,
  onIdentifyFrame,
  className = "lg:col-span-2",
  currentTime,
  isHoliday,
  studentLateTime,
  studentCheckoutTime,
  teacherLateTime,
  teacherCheckoutTime,
  canScanStudents,
  canScanTeachers,
  schoolSettings,
  currentUserId,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);
  const hasFaceRef = useRef(false);
  const [cameraError, setCameraError] = useState("");
  const [statusText, setStatusText] = useState("กำลังเปิดกล้อง...");
  const [ipCameraFrameReady, setIpCameraFrameReady] = useState(false);
  const ipCameraFrameReadyRef = useRef(false);
  const currentIpCameraBlobUrlRef = useRef<string>("");
  const pendingRevokeBlobUrlRef = useRef<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const [faceRects, setFaceRects] = useState<{ x: number; y: number; width: number; height: number }[]>([]);
  const [detector, setDetector] = useState<any>(null);
  const keypointsRef = useRef<{ x: number; y: number; label: string }[]>([]);
  const [ipFaceUsers, setIpFaceUsers] = useState<(FoundUser | null)[]>([]);
  const [ipFaceFakes, setIpFaceFakes] = useState<boolean[]>([]);

  const clearDetectionOverlays = () => {
    setFaceRects((prev) => (prev.length > 0 ? [] : prev));
    keypointsRef.current = [];
    setIpFaceUsers((prev) => (prev.length > 0 ? [] : prev));
    setIpFaceFakes((prev) => (prev.length > 0 ? [] : prev));
  };
  
  // Client-side liveness validation state & refs
  const keypointsHistoryRef = useRef<{ x: number; y: number }[][]>([]);
  const isFakeRef = useRef<boolean>(false);
  const lastWebcamMatchRef = useRef<{ matched: boolean; timestamp: number } | null>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevMotionFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastSignificantMotionAtRef = useRef<number>(0);
  const lastIdleProbeAtRef = useRef<number>(0);
  const lastIpFaceBoxesAtRef = useRef<number>(0);
  const lastIdentifiedIpBlobUrlRef = useRef<string>("");
  const prevFaceRectsRef = useRef<{ x: number; y: number; width: number; height: number }[]>([]);
  // Adaptive throttle: วัดความเร็วเครื่องแล้วปรับอัตราการ detect อัตโนมัติ
  const detectionFrameCountRef = useRef(0);
  const detectionSkipRef = useRef(0);     // 0=ทุก frame(60fps), 1=ทุก 2 frames(30fps), 2=ทุก 3(20fps), 3=ทุก 4(15fps)
  const detectionTimeEmaRef = useRef(16); // EMA ของเวลา detect (ms), เริ่มต้นสมมุติว่าเร็ว
  const [livenessMessage, setLivenessMessage] = useState<string>("");

  // Hybrid client-side liveness and anti-spoofing analyzer (Disabled)
  const performLivenessAnalysis = (
    _source: HTMLVideoElement | HTMLCanvasElement,
    _bbox: { originX: number; originY: number; width: number; height: number },
    _mpKeypoints: { x: number; y: number }[]
  ) => {
    isFakeRef.current = false;
    return { isFake: false, type: "" };
  };

  // Compute camera configuration reactively from school settings list.
  // A kiosk user can be paired to a specific camera in SchoolInfoPage.
  const configuredCameras: CameraConfig[] = Array.isArray(schoolSettings?.faceScanConfig?.cameras)
    ? schoolSettings.faceScanConfig.cameras
    : [];
  const activeCamera =
    (currentUserId && configuredCameras.find((camera) => camera.pairedUserId === currentUserId)) ||
    configuredCameras.find((camera) => !camera.pairedUserId) ||
    configuredCameras[0];

  const cameraSource = activeCamera ? activeCamera.sourceType : "webcam";
  const ipCameraUrl = activeCamera?.ipCameraUrl || "";
  const mirrorFeed = activeCamera ? (activeCamera.mirrorFeed ?? false) : true;
  const isRtspCamera = cameraSource === "ipcamera" && isRtspCameraUrl(ipCameraUrl);

  const resetIpCameraPreview = () => {
    if (currentIpCameraBlobUrlRef.current) {
      URL.revokeObjectURL(currentIpCameraBlobUrlRef.current);
      currentIpCameraBlobUrlRef.current = "";
    }
    if (pendingRevokeBlobUrlRef.current) {
      URL.revokeObjectURL(pendingRevokeBlobUrlRef.current);
      pendingRevokeBlobUrlRef.current = "";
    }
    if (imageRef.current) {
      imageRef.current.removeAttribute("src");
    }
    ipCameraFrameReadyRef.current = false;
    lastIdentifiedIpBlobUrlRef.current = "";
    setIpCameraFrameReady(false);
  };

  const analyzeSignificantMotion = (source: HTMLImageElement | HTMLVideoElement) => {
    const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.videoWidth;
    const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.videoHeight;
    if (!sourceWidth || !sourceHeight) return false;

    const sampleHeight = Math.max(1, Math.round(MOTION_SAMPLE_WIDTH * (sourceHeight / sourceWidth)));
    const canvas = motionCanvasRef.current || document.createElement("canvas");
    motionCanvasRef.current = canvas;
    if (canvas.width !== MOTION_SAMPLE_WIDTH) canvas.width = MOTION_SAMPLE_WIDTH;
    if (canvas.height !== sampleHeight) canvas.height = sampleHeight;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;

    ctx.drawImage(source, 0, 0, MOTION_SAMPLE_WIDTH, sampleHeight);
    const frame = ctx.getImageData(0, 0, MOTION_SAMPLE_WIDTH, sampleHeight).data;
    const prevFrame = prevMotionFrameRef.current;
    const currentFrame = new Uint8ClampedArray(frame);
    prevMotionFrameRef.current = currentFrame;

    if (!prevFrame || prevFrame.length !== frame.length) return false;

    const startY = Math.floor(sampleHeight * MOTION_TOP_IGNORE_RATIO);
    const endY = Math.max(startY + 1, Math.floor(sampleHeight * (1 - MOTION_BOTTOM_IGNORE_RATIO)));
    const roiPixels = MOTION_SAMPLE_WIDTH * (endY - startY);

    let changedPixels = 0;
    let minX = MOTION_SAMPLE_WIDTH;
    let minY = sampleHeight;
    let maxX = 0;
    let maxY = 0;

    for (let y = startY; y < endY; y += 1) {
      for (let x = 0; x < MOTION_SAMPLE_WIDTH; x += 1) {
        const idx = (y * MOTION_SAMPLE_WIDTH + x) * 4;
        const lum = frame[idx] * 0.299 + frame[idx + 1] * 0.587 + frame[idx + 2] * 0.114;
        const prevLum = prevFrame[idx] * 0.299 + prevFrame[idx + 1] * 0.587 + prevFrame[idx + 2] * 0.114;

        if (Math.abs(lum - prevLum) >= MOTION_DIFF_THRESHOLD) {
          changedPixels += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (changedPixels < MOTION_MIN_CHANGED_PIXELS) return false;

    const changedRatio = changedPixels / roiPixels;
    const spanWidthRatio = (maxX - minX + 1) / MOTION_SAMPLE_WIDTH;
    const spanHeightRatio = (maxY - minY + 1) / (endY - startY);
    const areaRatio = spanWidthRatio * spanHeightRatio;

    return (
      changedRatio >= MOTION_MIN_CHANGED_RATIO &&
      areaRatio >= MOTION_MIN_AREA_RATIO &&
      (spanWidthRatio >= MOTION_MIN_SPAN_RATIO || spanHeightRatio >= MOTION_MIN_SPAN_RATIO)
    );
  };

  // Extract credentials and clean URL for safe login button
  const { cleanIpUrl, ipCameraUser, ipCameraPass } = (() => {
    if (!ipCameraUrl) return { cleanIpUrl: "", ipCameraUser: "admin", ipCameraPass: "" };
    const credentialsRegex = /^https?:\/\/([^:]+):([^@]+)@([^/]+)(.*)$/;
    const match = ipCameraUrl.match(credentialsRegex);
    if (match) {
      const [_, user, pass, ip, path] = match;
      return {
        cleanIpUrl: `http://${ip}${path}`,
        ipCameraUser: user,
        ipCameraPass: pass
      };
    }
    return { cleanIpUrl: ipCameraUrl, ipCameraUser: "admin", ipCameraPass: "" };
  })();

  // Background frame fetch loop for IP camera double-buffering
  useEffect(() => {
    if (cameraSource !== "ipcamera" || !ipCameraUrl || !enabled) {
      resetIpCameraPreview();
      return;
    }

    let active = true;
    let nextFrameTimer: number | null = null;
    let activeFetchController: AbortController | null = null;
    let staleFetchTimer: number | null = null;
    let consecutiveErrors = 0;

    const fetchNextFrame = async () => {
      if (!active) return;
      
      // Pause fetching if the tab is hidden to let the camera rest and free up resources
      if (document.hidden) {
        nextFrameTimer = window.setTimeout(fetchNextFrame, 1000);
        return;
      }
      
      const cleanUrl = getCleanStreamUrl(ipCameraUrl, Date.now());
      try {
        const isDevProxyActive = import.meta.env.DEV || 
                                 window.location.hostname === "localhost" || 
                                 window.location.hostname === "127.0.0.1" ||
                                 window.location.port === "5173" ||
                                 window.location.port === "3000";
        const fetchHeaders: Record<string, string> = {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        };
        activeFetchController = new AbortController();
        if (staleFetchTimer) window.clearTimeout(staleFetchTimer);
        staleFetchTimer = window.setTimeout(() => {
          activeFetchController?.abort();
        }, isRtspCamera ? RTSP_CAMERA_STALE_FETCH_ABORT_MS : IP_CAMERA_STALE_FETCH_ABORT_MS);
        const fetchOptions: RequestInit = {
          cache: "no-store",
          headers: fetchHeaders,
          signal: activeFetchController.signal,
        };
        
        if (!isDevProxyActive && ipCameraUrl) {
          const credentialsRegex = /^https?:\/\/([^:]+):([^@]+)@([^/]+)(.*)$/;
          const match = ipCameraUrl.match(credentialsRegex);
          if (match) {
            const [_, user, pass] = match;
            fetchHeaders.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
          }
        }

        let fetchUrl = cleanUrl;
        if (fetchUrl.startsWith("http://") || fetchUrl.startsWith("https://")) {
          try {
            const parsedUrl = new URL(fetchUrl);
            if (parsedUrl.username || parsedUrl.password) {
              parsedUrl.username = "";
              parsedUrl.password = "";
              fetchUrl = parsedUrl.toString();
            }
          } catch (e) {
            console.warn("📹 Failed to parse URL for credential stripping:", e);
          }
        }

        let response: Response;
        try {
          if (shouldUseLocalBridgeProxy(ipCameraUrl)) {
            const proxyUrl = getLocalBridgeFrameUrl(ipCameraUrl);
            response = await fetch(proxyUrl, { cache: "no-store", signal: activeFetchController.signal });
            if (!response.ok) {
              const bridgeMessage = await response.text().catch(() => "");
              throw new Error(bridgeMessage || `Local Bridge HTTP ${response.status}`);
            }
          } else {
            response = await fetch(fetchUrl, fetchOptions);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
          }
        } catch (fetchErr) {
          if (shouldUseLocalBridgeProxy(ipCameraUrl)) {
            const message = fetchErr instanceof Error ? fetchErr.message : "";
            throw new Error(message || "ไม่สามารถเชื่อมต่อกล้อง IP ได้ กรุณาเปิด CCTV Local Bridge บนเครื่องนี้ แล้วรีเฟรชหน้าเว็บ");
          }
          throw fetchErr;
        }
        
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("xml") || contentType.includes("text")) {
          throw new Error("กล้องตอบกลับด้วยข้อความระบุว่ายุ่งหรือมีข้อผิดพลาด (Device Busy / XML Response)");
        }
        
        const blob = await response.blob();
        if (staleFetchTimer) {
          window.clearTimeout(staleFetchTimer);
          staleFetchTimer = null;
        }
        if (!active) return;

        const newBlobUrl = URL.createObjectURL(blob);
        const previousBlobUrl = currentIpCameraBlobUrlRef.current;
        currentIpCameraBlobUrlRef.current = newBlobUrl;

        if (previousBlobUrl) {
          if (pendingRevokeBlobUrlRef.current) {
            URL.revokeObjectURL(pendingRevokeBlobUrlRef.current);
          }
          pendingRevokeBlobUrlRef.current = previousBlobUrl;
        }

        if (imageRef.current) {
          imageRef.current.src = newBlobUrl;
        }

        if (!ipCameraFrameReadyRef.current) {
          ipCameraFrameReadyRef.current = true;
          setIpCameraFrameReady(true);
        }

        // Clear error state on successful reconnection
        if (consecutiveErrors > 0) {
          console.log("📹 IP camera reconnected successfully after", consecutiveErrors, "failed attempts");
          setCameraError("");
          setStatusText(endpointConfigured ? "รอใบหน้า (กล้อง IP)..." : "ยังไม่ได้ตั้งค่า endpoint");
        } else if (isRtspCamera) {
          const readyText = endpointConfigured ? "RTSP เรียลไทม์: กำลังสแกน..." : "ยังไม่ได้ตั้งค่า endpoint";
          setStatusText((prev) => (prev === readyText ? prev : readyText));
        }
        consecutiveErrors = 0;

        nextFrameTimer = window.setTimeout(fetchNextFrame, isRtspCamera ? RTSP_CAMERA_PREVIEW_MS : 0);
      } catch (err: any) {
        if (!active) return;
        if (staleFetchTimer) {
          window.clearTimeout(staleFetchTimer);
          staleFetchTimer = null;
        }
        if (err?.name === "AbortError") {
          nextFrameTimer = window.setTimeout(fetchNextFrame, isRtspCamera ? RTSP_CAMERA_PREVIEW_MS : 0);
          return;
        }
        consecutiveErrors++;

        // Log only on 1st, 5th, 10th, then every 20th failure to avoid console spam
        if (consecutiveErrors === 1 || consecutiveErrors === 5 || consecutiveErrors === 10 || consecutiveErrors % 20 === 0) {
          console.warn(`📹 IP camera frame fetch failed (attempt #${consecutiveErrors}):`, err.message || err);
        }

        if (consecutiveErrors >= 3) {
          const rawMessage = err?.message || "";
          const readableMessage = rawMessage.includes("Busy")
            ? "กล้อง IP แจ้งว่ายุ่ง (Device Busy) กรุณารอสักครู่ให้กล้องเคลียร์การเชื่อมต่อ"
            : rawMessage.startsWith("RTSP Error:")
              ? rawMessage
              : rawMessage.includes("ffmpeg")
                ? rawMessage
                : "ไม่สามารถเชื่อมต่อสตรีมกล้อง IP ได้ กรุณาตรวจสอบ URL หรือเครือข่าย";

          setCameraError(readableMessage);
          setStatusText("เชื่อมต่อกล้อง IP ล้มเหลว");
        }
        
        // Exponential backoff: 2s, 4s, 8s, max 15s
        const retryDelay = Math.min(2000 * Math.pow(2, Math.min(consecutiveErrors - 1, 3)), 15000);
        nextFrameTimer = window.setTimeout(fetchNextFrame, retryDelay);
      }
    };

    fetchNextFrame();

    return () => {
      active = false;
      activeFetchController?.abort();
      if (nextFrameTimer) window.clearTimeout(nextFrameTimer);
      if (staleFetchTimer) window.clearTimeout(staleFetchTimer);
      resetIpCameraPreview();
    };
  }, [cameraSource, ipCameraUrl, enabled, endpointConfigured, isRtspCamera]);

  useEffect(() => {
    if (cameraSource === "ipcamera") {
      setDetector(null);
      return;
    }

    let active = true;
    const initFaceDetector = async () => {
      try {
        // @ts-ignore
        const visionModule = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs");
        const { FilesetResolver, FaceDetector } = visionModule;

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );

        const faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "GPU"
          },
          runningMode: "VIDEO"
        });

        if (active) {
          setDetector(faceDetector);
          console.log("MediaPipe Tasks Vision FaceDetector loaded successfully!");
        }
      } catch (err) {
        console.error("Failed to load MediaPipe Tasks Vision:", err);
      }
    };

    initFaceDetector();

    return () => {
      active = false;
    };
  }, [cameraSource]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // Direct IP Camera initialization
    if (cameraSource === "ipcamera") {
      // Release any active webcam stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (!ipCameraUrl) {
        setCameraError("กรุณากรอกลิงก์ HTTP Stream ของกล้อง IP ในเมนูตั้งค่า");
        setStatusText("ยังไม่ได้ตั้งค่ากล้อง IP");
      } else {
        setCameraError("");
        setStatusText(endpointConfigured ? "กำลังดึงสตรีมกล้อง IP..." : "ยังไม่ได้ตั้งค่า endpoint");
      }
      return;
    }

    // Standard Webcam initialization
    const openCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("อุปกรณ์นี้ไม่รองรับการเปิดกล้องผ่านเบราว์เซอร์");
        setStatusText("ไม่สามารถเปิดกล้องได้");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: { ideal: "user" },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError("");
        setStatusText(endpointConfigured ? "รอใบหน้า..." : "ยังไม่ได้ตั้งค่า endpoint");
      } catch (error) {
        console.error("Face scan camera error:", error);
        setCameraError("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์");
        setStatusText("ไม่สามารถเปิดกล้องได้");
      }
    };

    openCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [enabled, endpointConfigured, cameraSource, ipCameraUrl]);

  // Face detection loop for WEBCAM (uses requestAnimationFrame for smooth video)
  useEffect(() => {
    if (!enabled || cameraError || !detector || cameraSource === "ipcamera") {
      if (cameraSource !== "ipcamera") {
        setFaceRects([]);
        keypointsRef.current = [];
        hasFaceRef.current = false;
      }
      return;
    }

    let active = true;
    let animationFrameId: number | null = null;

    const processFrame = () => {
      if (!active) return;

      const video = videoRef.current;
      if (!video) {
        if (active) animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      if (video.readyState >= 2 && video.videoWidth > 0) {
        detectionFrameCountRef.current++;

        // Adaptive Throttle: ข้าม frame ถ้าเครื่องช้า
        const skip = detectionSkipRef.current;
        const shouldDetect = detectionFrameCountRef.current % (skip + 1) === 0;

        if (shouldDetect) {
          try {
            const t0 = performance.now();
            const results = detector.detectForVideo(video, t0);
            const elapsed = performance.now() - t0;

            // EMA α=0.25 → ตอบสนองเร็วพอแต่ไม่กระตุก
            detectionTimeEmaRef.current = detectionTimeEmaRef.current * 0.75 + elapsed * 0.25;
            const ema = detectionTimeEmaRef.current;

            // ปรับ skip ด้วย hysteresis ป้องกัน oscillation
            // เพิ่ม skip (ช้าลง) เมื่อ detect นาน, ลด skip (เร็วขึ้น) เมื่อเครื่องโล่ง
            if      (ema > 45 && skip < 3) detectionSkipRef.current = 3; // >45ms → 15fps
            else if (ema > 28 && skip < 2) detectionSkipRef.current = 2; // >28ms → 20fps
            else if (ema > 18 && skip < 1) detectionSkipRef.current = 1; // >18ms → 30fps
            else if (ema < 12 && skip > 0) detectionSkipRef.current = skip - 1; // โล่งแล้ว เร็วขึ้น

            if (results.detections && results.detections.length > 0) {
              hasFaceRef.current = true;
              const cw = video.clientWidth;
              const ch = video.clientHeight;
              const vw = video.videoWidth;
              const vh = video.videoHeight;

              if (vw && vh) {
                const scale = Math.max(cw / vw, ch / vh);
                const xOffset = (cw - vw * scale) / 2;
                const yOffset = (ch - vh * scale) / 2;

                const detectedRects = results.detections.slice(0, 15).map((detection: any) => {
                  const originX = detection.boundingBox.originX ?? detection.boundingBox.origin_x ?? 0;
                  const originY = detection.boundingBox.originY ?? detection.boundingBox.origin_y ?? 0;
                  const width = detection.boundingBox.width ?? 0;
                  const height = detection.boundingBox.height ?? 0;

                  const clientX = originX * scale + xOffset;
                  const clientY = originY * scale + yOffset;
                  const clientWidth = width * scale;
                  const clientHeight = height * scale;

                  const displayX = mirrorFeed ? (cw - clientX - clientWidth) : clientX;

                  const padW = clientWidth * 0.15;
                  const padTop = clientHeight * 0.38;
                  const padBottom = clientHeight * 0.05;

                  return {
                    x: displayX - padW / 2,
                    y: clientY - padTop,
                    width: clientWidth + padW,
                    height: clientHeight + padTop + padBottom,
                  };
                });

                const prev = prevFaceRectsRef.current;
                const moved = detectedRects.length !== prev.length || detectedRects.some((r: { x: number; y: number; width: number; height: number }, i: number) =>
                  !prev[i] || Math.abs(r.x - prev[i].x) > 1 || Math.abs(r.y - prev[i].y) > 1 ||
                  Math.abs(r.width - prev[i].width) > 1 || Math.abs(r.height - prev[i].height) > 1
                );
                if (moved) {
                  prevFaceRectsRef.current = detectedRects;
                  setFaceRects(detectedRects);
                }

                const firstDetection = results.detections[0];
                if (firstDetection.keypoints && firstDetection.keypoints.length >= 6) {
                  const landmarkLabels = ["ตาขวา", "ตาซ้าย", "จมูก", "ปาก", "หูขวา", "หูซ้าย"];
                  const mappedKps = firstDetection.keypoints.map((kp: any, idx: number) => {
                    const kpX = kp.x * vw;
                    const kpY = kp.y * vh;
                    const kpClientX = kpX * scale + xOffset;
                    const kpClientY = kpY * scale + yOffset;
                    const displayKpX = mirrorFeed ? (cw - kpClientX) : kpClientX;
                    return { x: displayKpX, y: kpClientY, label: landmarkLabels[idx] || "" };
                  });
                  keypointsRef.current = mappedKps;

                  const originX = firstDetection.boundingBox.originX ?? firstDetection.boundingBox.origin_x ?? 0;
                  const originY = firstDetection.boundingBox.originY ?? firstDetection.boundingBox.origin_y ?? 0;
                  const width = firstDetection.boundingBox.width ?? 0;
                  const height = firstDetection.boundingBox.height ?? 0;

                  // Run hybrid liveness analysis
                  const res = performLivenessAnalysis(
                    video,
                    { originX, originY, width, height },
                    firstDetection.keypoints
                  );
                  isFakeRef.current = res.isFake;
                } else {
                  keypointsRef.current = [];
                  keypointsHistoryRef.current = [];
                  isFakeRef.current = false;
                  setLivenessMessage("");
                }
              }
            } else {
              hasFaceRef.current = false;
              setFaceRects((prev) => (prev.length > 0 ? [] : prev));
              keypointsRef.current = [];
              keypointsHistoryRef.current = [];
              isFakeRef.current = false;
              setLivenessMessage("");
            }
          } catch (err) {
            // Skip frame silently
          }
        }
      }

      if (active) {
        animationFrameId = requestAnimationFrame(processFrame);
      }
    };

    const video = videoRef.current;
    if (!video) return;
    if (video.readyState >= 2) {
      processFrame();
    } else {
      const onMetadata = () => { if (active) processFrame(); };
      video.addEventListener("loadedmetadata", onMetadata);
      return () => { video.removeEventListener("loadedmetadata", onMetadata); };
    }

    return () => {
      active = false;
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      hasFaceRef.current = false;
      setFaceRects([]);
      keypointsRef.current = [];
      detectionFrameCountRef.current = 0;
      detectionSkipRef.current = 0;
      detectionTimeEmaRef.current = 16;
    };
  }, [enabled, cameraError, detector, cameraSource]);

  // Motion observer for IP CAMERA. Long-range face boxes come from FindFace, not local MediaPipe.
  useEffect(() => {
    if (!enabled || cameraSource !== "ipcamera") {
      return;
    }

    let active = true;
    let intervalId: number | null = null;

    const observeIpMotion = () => {
      if (!active) return;

      const img = imageRef.current;
      if (!img || !img.complete || img.naturalWidth === 0) return;

      try {
        if (analyzeSignificantMotion(img)) {
          lastSignificantMotionAtRef.current = Date.now();
        }
      } catch (err) {
        // Skip frame silently
      }
    };

    intervalId = window.setInterval(observeIpMotion, IP_CAMERA_MOTION_OBSERVER_MS);

    return () => {
      active = false;
      if (intervalId !== null) window.clearInterval(intervalId);
      hasFaceRef.current = false;
      prevMotionFrameRef.current = null;
      lastSignificantMotionAtRef.current = 0;
      lastIpFaceBoxesAtRef.current = 0;
      clearDetectionOverlays();
    };
  }, [enabled, cameraSource]);

  useEffect(() => {
    // For IP cameras, don't let transient cameraError block the identification loop
    const isIpCamera = cameraSource === "ipcamera";
    if (!enabled || !endpointConfigured || (!isIpCamera && cameraError)) return;

    const identifyIntervalMs = isIpCamera
      ? (isRtspCamera ? RTSP_CAMERA_ACTIVE_IDENTIFY_MS : IP_CAMERA_ACTIVE_IDENTIFY_MS)
      : WEBCAM_IDENTIFY_MS;

    const timer = window.setInterval(async () => {
      if (processingRef.current) return;
      
      const source = isIpCamera ? imageRef.current : videoRef.current;
      if (!source) return;

      const vw = isIpCamera ? (source as HTMLImageElement).naturalWidth : (source as HTMLVideoElement).videoWidth;
      const vh = isIpCamera ? (source as HTMLImageElement).naturalHeight : (source as HTMLVideoElement).videoHeight;
      const isReady = isIpCamera
        ? (source as HTMLImageElement).complete && vw > 0
        : (source as HTMLVideoElement).readyState >= 2 && vw > 0;

      if (!isReady) return;

      if (isIpCamera) {
        if (!isRtspCamera) {
          const currentBlobUrl = currentIpCameraBlobUrlRef.current;
          if (!currentBlobUrl || currentBlobUrl === lastIdentifiedIpBlobUrlRef.current) {
            return;
          }
          lastIdentifiedIpBlobUrlRef.current = currentBlobUrl;

          const now = Date.now();
          const isMotionWindowActive = now - lastSignificantMotionAtRef.current <= MOTION_SCAN_HOLD_MS;
          const canRunIdleProbe = now - lastIdleProbeAtRef.current >= IDLE_IP_CAMERA_PROBE_MS;

          if (!isMotionWindowActive && !canRunIdleProbe) {
            setStatusText((prev) => (prev === "รอคนเดินผ่านกล้อง..." ? prev : "รอคนเดินผ่านกล้อง..."));
            if (now - lastIpFaceBoxesAtRef.current > IP_CAMERA_BOX_STALE_MS) {
              clearDetectionOverlays();
            }
            return;
          }

          if (!isMotionWindowActive) {
            lastIdleProbeAtRef.current = now;
          }
        }
      }

      // Wait for liveness history to accumulate enough frames to make an accurate decision (6-8 frames takes ~200-300ms)
      const minHistory = isIpCamera ? 4 : 8;
      if (keypointsHistoryRef.current.length > 0 && keypointsHistoryRef.current.length < minHistory) {
        setStatusText("กำลังวิเคราะห์ความถูกต้องของใบหน้า...");
        return;
      }

      // Webcam still uses local MediaPipe face detection as the gate.
      // IP camera uses the motion gate above before sending frames to FindFace.
      if (!isIpCamera && !hasFaceRef.current) {
        setStatusText("รอใบหน้า...");
        return;
      }

      // Block only Webcam client-side detections if flagged as spoof
      // (IP Camera bypasses client-side checks as it uses fixed CCTV positions and server-side FindFace liveness check is more reliable)
      if (!isIpCamera && isFakeRef.current) {
        setStatusText(livenessMessage || "🚨 ตรวจพบความผิดปกติ (Anti-Spoofing)");
        
        // Notify index.tsx of blocked liveness status
        await onIdentifyFrame(new Blob(), {
          isFake: true,
          isScreen: livenessMessage.includes("หน้าจอ"),
          isPaper: livenessMessage.includes("กระดาษ"),
          message: livenessMessage,
        });
        return;
      }

      processingRef.current = true;
      setIsProcessing(true);
      setStatusText("กำลังตรวจสอบใบหน้า...");

      try {
        const canvas = document.createElement("canvas");
        const maxWidth = isIpCamera
          ? (isRtspCamera ? RTSP_CAMERA_IDENTIFY_MAX_WIDTH : IP_CAMERA_IDENTIFY_MAX_WIDTH)
          : WEBCAM_IDENTIFY_MAX_WIDTH;
        const ratio = Math.min(1, maxWidth / vw);
        canvas.width = Math.round(vw * ratio);
        canvas.height = Math.round(vh * ratio);
        const context = canvas.getContext("2d");
        if (!context) return;
        
        // Draw the image/video onto canvas
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        const jpegQuality = isIpCamera
          ? (isRtspCamera ? RTSP_CAMERA_IDENTIFY_JPEG_QUALITY : IP_CAMERA_IDENTIFY_JPEG_QUALITY)
          : WEBCAM_IDENTIFY_JPEG_QUALITY;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", jpegQuality));
        if (!blob) {
          setStatusText("ไม่สามารถจับภาพจากกล้องได้");
          return;
        }

        const result = await onIdentifyFrame(blob, {
          isFake: false,
          isScreen: false,
          isPaper: false,
          message: "",
          isIpCamera: isIpCamera,
        });
        
        // Update webcam match status
        if (result.matched) {
          lastWebcamMatchRef.current = { matched: true, timestamp: Date.now() };
        } else {
          lastWebcamMatchRef.current = null;
        }

        // Support displaying the first result's confidence for backward-compatible indicator
        if (result.confidence !== undefined) {
          setLastConfidence(result.confidence);
        } else if (result.users && result.users.length > 0 && result.users[0].faceConfidence !== undefined) {
          setLastConfidence(result.users[0].faceConfidence);
        }

        // For IP camera: draw bounding boxes from FindFace detection results
        if (isIpCamera && result.faceBoxes && result.faceBoxes.length > 0) {
          const img = imageRef.current;
          if (img && img.naturalWidth > 0) {
            hasFaceRef.current = true;
            lastIpFaceBoxesAtRef.current = Date.now();
            const cw = img.clientWidth;
            const ch = img.clientHeight;
            const nw = img.naturalWidth;
            const nh = img.naturalHeight;
            const scale = Math.max(cw / nw, ch / nh);
            const xOff = (cw - nw * scale) / 2;
            const yOff = (ch - nh * scale) / 2;

            const rects = result.faceBoxes.map(box => {
              const rawX = box.x * nw * scale + xOff;
              const rawY = box.y * nh * scale + yOff;
              const rawW = box.width * nw * scale;
              const rawH = box.height * nh * scale;
              const dx = mirrorFeed ? (cw - rawX - rawW) : rawX;
              const padW = rawW * 0.15;
              const padTop = rawH * 0.38;
              const padBottom = rawH * 0.05;
              return {
                x: dx - padW / 2,
                y: rawY - padTop,
                width: rawW + padW,
                height: rawH + padTop + padBottom,
              };
            });

            setFaceRects(rects);
            setIpFaceUsers(result.faceBoxes.map(b => b.user || null));
            setIpFaceFakes(result.faceBoxes.map(b => !!b.isFake));
          }
        } else if (isIpCamera) {
          hasFaceRef.current = false;
          if (Date.now() - lastIpFaceBoxesAtRef.current > IP_CAMERA_BOX_STALE_MS) {
            clearDetectionOverlays();
          }
        }

        setStatusText(result.message || (result.matched ? "สแกนผ่าน" : (isIpCamera ? "กำลังสแกน (กล้อง IP)..." : "รอใบหน้า...")));
      } catch (error) {
        console.error("Face identify error:", error);
        setStatusText("เชื่อมต่อระบบสแกนใบหน้าไม่สำเร็จ");
      } finally {
        setIsProcessing(false);
        processingRef.current = false;
      }
    }, identifyIntervalMs);

    return () => window.clearInterval(timer);
  }, [cameraError, enabled, endpointConfigured, onIdentifyFrame, cameraSource, isRtspCamera]);

  return (
    <div className={`${className} relative flex h-full min-h-[460px] max-h-[580px] flex-col overflow-hidden rounded-3xl border-4 border-indigo-100 bg-[#1e1f21] shadow-2xl dark:border-indigo-500/30`}>
      {/* Full-bleed Camera Preview Container */}
      <div className="relative flex-1 w-full overflow-hidden">
        {cameraSource === "ipcamera" ? (
          ipCameraUrl ? (
            <>
              {/* Always render img so imageRef is always available for MediaPipe detection */}
              <img
                key={ipCameraUrl}
                ref={imageRef}
                alt="IP Camera Feed"
                crossOrigin="anonymous"
                onLoad={() => {
                  setCameraError("");
                  if (pendingRevokeBlobUrlRef.current) {
                    URL.revokeObjectURL(pendingRevokeBlobUrlRef.current);
                    pendingRevokeBlobUrlRef.current = "";
                  }
                }}
                className={`h-full w-full object-cover ${mirrorFeed ? "scale-x-[-1]" : ""} ${!ipCameraFrameReady ? "opacity-0" : ""}`}
              />
              {!ipCameraFrameReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1f21] p-6 text-center text-white z-10">
                  <Camera className="mx-auto mb-3 text-indigo-400 animate-pulse" size={42} />
                  <p className="text-sm font-bold">กำลังเชื่อมต่อกล้อง IP...</p>
                  <p className="text-[10px] text-gray-400 mt-1 max-w-xs">{cameraError || "กรุณารอสักครู่ กำลังดึงสัญญาณสตรีม"}</p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1f21] p-6 text-center text-white z-10">
              <Camera className="mx-auto mb-3 text-indigo-400 animate-pulse" size={42} />
              <p className="text-sm font-bold">ยังไม่ได้ตั้งค่าลิงก์กล้อง IP</p>
              <p className="text-[10px] text-gray-400 mt-1 max-w-xs">คลิกปุ่มตั้งค่า ⚙️ ด้านล่างเพื่อกรอกที่อยู่ HTTP Stream ของกล้อง</p>
            </div>
          )
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${mirrorFeed ? "scale-x-[-1]" : ""}`}
          />
        )}
        {faceRects.map((rect, idx) => {
          // For IP camera: use FindFace-provided user mapping; for webcam: use parent displayUsers only if match is valid/recent
          const isMatchValid = lastWebcamMatchRef.current && (Date.now() - lastWebcamMatchRef.current.timestamp < 1800);
          const user = cameraSource === "ipcamera"
            ? (ipFaceUsers[idx] || null)
            : (isMatchValid ? (displayUsers && displayUsers[idx]) : null);
          const isFake = false;
          const isIdentified = !!user;

          return (
            <div
              key={idx}
              className={`absolute border-2 pointer-events-none rounded-lg z-10 ${
                isIdentified
                  ? "border-emerald-400 bg-emerald-400/5"
                  : "border-rose-400 bg-rose-400/5"
              }`}
              style={{
                left: 0,
                top: 0,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
                willChange: "transform",
              }}
            >
              {/* Corner Brackets */}
              <div className={`absolute -top-1 -left-1 w-3.5 h-3.5 border-t-2 border-l-2 ${isIdentified ? "border-emerald-400" : "border-rose-400"}`}></div>
              <div className={`absolute -top-1 -right-1 w-3.5 h-3.5 border-t-2 border-r-2 ${isIdentified ? "border-emerald-400" : "border-rose-400"}`}></div>
              <div className={`absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-2 border-l-2 ${isIdentified ? "border-emerald-400" : "border-rose-400"}`}></div>
              <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-2 border-r-2 ${isIdentified ? "border-emerald-400" : "border-rose-400"}`}></div>
              
              {/* Label */}
              <span className={`absolute -top-6 left-0 text-white font-black px-1.5 py-0.5 rounded whitespace-nowrap shadow-md ${
                isIdentified 
                  ? "bg-emerald-500 text-black text-xs" 
                  : "bg-rose-500 text-white text-[10px] font-black tracking-wide"
              }`}>
                {isIdentified ? user.name : "กำลังสแกน..."}
              </span>
            </div>
          );
        })}

        {cameraError && (
          <div className={`absolute inset-0 flex items-center justify-center p-4 text-center z-30 ${
            cameraSource === "ipcamera" && ipCameraFrameReady
              ? "bg-black/50 backdrop-blur-sm"  
              : "bg-[#1e1f21]"
          }`}>
            <div className="max-w-md w-full mx-auto max-h-full overflow-y-auto pr-1">
              <WifiOff className="mx-auto mb-3 text-amber-400" size={42} />
              <p className="text-sm font-bold text-white mb-3">{cameraError}</p>
              
              {cameraSource === "ipcamera" && ipCameraUrl && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left text-xs text-gray-300 space-y-3.5 backdrop-blur-md">
                  {shouldUseLocalBridgeProxy(ipCameraUrl) ? (
                    <>
                      <p className="text-amber-300 font-bold text-center mb-1 text-[13px] animate-pulse">จำเป็นต้องเปิดใช้งาน CCTV Local Bridge บนเครื่องนี้</p>
                      
                      <div className="space-y-1.5">
                        <p className="font-bold text-white">เพื่อให้เว็บ HTTPS ปลอดภัย ระบบจะไม่ให้เปิดสิทธิ์ “เนื้อหาที่ไม่ปลอดภัย” ใน Chrome</p>
                        <p className="text-gray-300">ให้รันตัวเชื่อมต่อเฉพาะเครื่องนี้แทน เพื่อดึงภาพจากกล้องวงแลนผ่าน localhost:</p>
                        <div className="bg-black/40 p-2.5 rounded-lg border border-white/10 text-gray-300 space-y-1">
                          <p>1. เปิดไฟล์ <strong>auto_start_proxy.command</strong> บน Mac หรือ <strong>start_camera_proxy.bat</strong> บน Windows</p>
                          <p>2. หรือเปิด Terminal/Command Prompt ในโฟลเดอร์โปรเจกต์ แล้วพิมพ์:</p>
                          <p className="bg-black/60 p-1.5 rounded font-mono text-emerald-400 select-all text-center font-bold">python3 local_camera_proxy.py</p>
                          <p>3. เมื่อโปรแกรมเริ่มรันแล้ว ให้รีเฟรชหน้าเว็บนี้อีกครั้ง</p>
                        </div>
                        <p className="text-[10px] text-amber-200">ตัวเชื่อมต่อนี้รับเฉพาะจากเครื่องนี้และเว็บ BMG SmartSchool เท่านั้น</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-amber-300 font-bold text-center mb-1 text-[13px]">วิธีแก้ปัญหากล้องไม่แสดง</p>

                      <div className="space-y-2">
                        <p className="font-bold text-white">ล็อกอินเข้าระบบกล้อง IP โดยตรงในแท็บใหม่</p>
                        <p className="text-gray-400">กรุณาคลิกปุ่มสีน้ำเงินเพื่อยืนยันตัวตน <strong>(ในแท็บใหม่จะแสดงเป็นภาพนิ่ง 1 ภาพ ซึ่งปกติครับ)</strong> เมื่อเบราว์เซอร์ถามชื่อและรหัสผ่านให้กรอกดังนี้:</p>
                        <div className="bg-black/40 p-2 rounded-lg border border-white/10 font-mono text-[11px] space-y-1">
                          <p><span className="text-gray-500">Username:</span> <strong className="text-emerald-400 select-all">{ipCameraUser}</strong></p>
                          <p><span className="text-gray-500">Password:</span> <strong className="text-emerald-400 select-all">{ipCameraPass || "(ไม่มีรหัสผ่าน)"}</strong></p>
                        </div>
                        <p className="text-[10px] text-amber-300">เมื่อล็อกอินจนเห็นภาพนิ่งในแท็บใหม่แล้ว ให้ปิดแท็บนั้นแล้วกลับมาหน้านี้ ระบบจะดึงภาพมาต่อกันเป็นวิดีโอสดโดยอัตโนมัติ</p>
                        <a 
                          href={cleanIpUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="mt-1 block w-full py-2 px-3 text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors border border-indigo-500 shadow-md font-mono"
                        >
                          เปิดลิงก์กล้องในแท็บใหม่เพื่อล็อกอิน
                        </a>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {!cameraError && !endpointConfigured && (
          <div className="absolute inset-x-4 bottom-28 rounded-2xl bg-black/70 px-4 py-3 text-sm font-bold text-amber-200 backdrop-blur z-10">
            ยังไม่ได้ตั้งค่า endpoint สำหรับส่งภาพไป FindFace
          </div>
        )}
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-2xl bg-black/60 px-3 py-2 text-xs font-black text-white backdrop-blur z-10">
          {isProcessing ? <Loader2 size={16} className="animate-spin text-indigo-300" /> : <ScanFace size={16} className="text-indigo-300" />}
          {cameraSource === "ipcamera" ? "กล้อง IP: กำลังสแกน" : "กำลังค้นหาใบหน้า"}
        </div>
        {currentTime && (
          <div className="absolute right-4 top-4 inline-flex items-center rounded-2xl bg-black/60 px-4 py-2 text-lg font-black text-white tracking-wider backdrop-blur border border-white/10 z-10">
            {currentTime}
          </div>
        )}

      </div>

      {/* Space-Saving Translucent Glass overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-black/60 py-2.5 px-4 text-center backdrop-blur-md border-t border-white/10 z-20 flex flex-col gap-2">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Status Indicator */}
          <div className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-black shrink-0 ${
            statusText.includes("ผ่าน")
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "bg-white/10 text-gray-300 border border-white/10"
          }`}>
            {statusText.includes("ผ่าน") ? <ShieldCheck size={14} /> : <Camera size={14} />}
            {statusText}
          </div>

          {/* Identified User Detail / Wait State */}
          <div className="flex-1 w-full text-right">
            {displayUsers && displayUsers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 justify-end">
                {displayUsers.map((user, idx) => (
                  <div 
                    key={user.id + "-" + idx} 
                    className="inline-flex items-center gap-3 bg-white/10 hover:bg-white/15 transition-colors duration-150 rounded-full px-3 py-1 text-left border border-white/10 shadow-md backdrop-blur-md whitespace-nowrap"
                  >
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[12px] font-black text-white truncate max-w-[150px]" title={user.name}>
                        {user.name}
                      </span>
                      <span className="text-[9px] font-bold text-gray-300 shrink-0">
                        {user.type === "student" ? `รหัส: ${user.displayId}` : user.position || "ครู"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-[9px] font-black">
                      {user.checkinTime && (
                        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-green-300 border border-green-500/10">
                          เข้า {user.checkinTime}
                        </span>
                      )}
                      {user.checkoutTime && (
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-blue-300 border border-blue-500/10">
                          ออก {user.checkoutTime}
                        </span>
                      )}
                      {!user.checkinTime && !user.checkoutTime && (
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-indigo-300 border border-indigo-500/10">
                          ผ่าน
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : displayUser ? (
              <div className="inline-flex items-center gap-3 bg-white/10 transition-colors duration-150 rounded-full px-3 py-1 text-left border border-white/10 shadow-md backdrop-blur-md ml-auto whitespace-nowrap">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-xs font-black text-white truncate max-w-[150px]" title={displayUser.name}>
                    {displayUser.name}
                  </span>
                  <span className="text-[9px] font-bold text-gray-300 shrink-0">
                    {displayUser.type === "student" ? `รหัส: ${displayUser.displayId}` : displayUser.position || "ครู"}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0 text-[9px] font-black">
                  {checkinTime && <span className="rounded-full bg-green-500/25 px-2 py-0.5 text-green-300 border border-green-500/20">เข้า {checkinTime}</span>}
                  {checkoutTime && <span className="rounded-full bg-blue-500/25 px-2 py-0.5 text-blue-300 border border-blue-500/20">ออก {checkoutTime}</span>}
                  {lastConfidence !== null && <span className="rounded-full bg-indigo-500/25 px-2 py-0.5 text-indigo-300 border border-indigo-500/20">{Math.round(lastConfidence * 100)}%</span>}
                </div>
              </div>
            ) : (
              <span className="text-xs font-black text-gray-300 uppercase tracking-wider">รอการลงเวลา...</span>
            )}
          </div>
        </div>

        {/* Compact Inline Time Constraints */}
        {!isHoliday && (
          <div className="pt-2 border-t border-white/5 text-[10px] text-gray-400 flex items-center justify-center gap-4 font-black">
            {canScanStudents && (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-300 font-black">นักเรียน:</span>
                <span className="text-gray-500 text-[9px] uppercase tracking-wider">เข้าสาย</span>
                <span className="text-indigo-300 font-extrabold">{studentLateTime}</span>
                <span className="text-gray-700">|</span>
                <span className="text-gray-500 text-[9px] uppercase tracking-wider">เลิกเรียน</span>
                <span className="text-indigo-300 font-extrabold">{studentCheckoutTime}</span>
              </div>
            )}
            {canScanStudents && canScanTeachers && <div className="w-px bg-white/10 h-3"></div>}
            {canScanTeachers && (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-300 font-black">ครู/บุคลากร:</span>
                <span className="text-gray-500 text-[9px] uppercase tracking-wider">เข้าสาย</span>
                <span className="text-emerald-300 font-extrabold">{teacherLateTime}</span>
                <span className="text-gray-700">|</span>
                <span className="text-gray-500 text-[9px] uppercase tracking-wider">เลิกงาน</span>
                <span className="text-emerald-300 font-extrabold">{teacherCheckoutTime}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceScanPanel;
