import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import imageCompression from "browser-image-compression";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/firebase";
import { X, RotateCcw, Camera, SwitchCamera, Check } from "lucide-react";

interface Props {
  schoolId: string;
  roomId: string;
  onClose: () => void;
  onSent: (imageUrl: string, storagePath: string) => void;
}

/**
 * ป็อปอัพกล้องถ่ายภาพส่งแชท — เปิดกล้องจริงในเบราว์เซอร์ (ไม่ใช่แค่เลือกไฟล์) ถ่ายแล้วบีบอัดก่อน
 * อัปโหลดขึ้น Firebase Storage เสมอ เพื่อประหยัดพื้นที่ (รูปแชทมีอายุ ~1 ปีการศึกษาแล้วลบทิ้งอัตโนมัติ
 * ทั้งไฟล์ใน Storage และเอกสารข้อความ — ดู cleanupExpiredChatImages ใน functions/index.js)
 *
 * render ผ่าน portal ไปที่ document.body และ stopPropagation ที่ mousedown เหมือน GroupChatCreator/
 * DeptChatMemberPicker เพราะปุ่มเปิดอยู่ในหน้าต่างแชทลอยตัวที่ซ้อนลึกใน Navbar dropdown
 */
const CameraCapture: React.FC<Props> = ({ schoolId, roomId, onClose, onSent }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    setError("");
    stopStream();

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        console.error("Error opening camera:", err);
        if (!cancelled) setError("เปิดกล้องไม่ได้ กรุณาอนุญาตให้เว็บไซต์นี้ใช้กล้อง");
      });

    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      if (!cancelled) setHasMultipleCameras(devices.filter((d) => d.kind === "videoinput").length > 1);
    }).catch(() => { /* ไม่ต้องทำอะไร ปุ่มสลับกล้องแค่ไม่โชว์ */ });

    return () => { cancelled = true; stopStream(); };
  }, [facingMode]);

  // ปิดกล้องทันทีตอน unmount กันกล้องค้างเปิดอยู่เบื้องหลังหลังปิดป็อปอัพ
  useEffect(() => () => stopStream(), []);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setCapturedDataUrl(canvas.toDataURL("image/jpeg", 0.92));
  };

  const handleRetake = () => setCapturedDataUrl(null);

  const handleSend = async () => {
    if (!capturedDataUrl || isUploading) return;
    setIsUploading(true);
    try {
      const blob = await (await fetch(capturedDataUrl)).blob();
      const rawFile = new File([blob], "chat-photo.jpg", { type: "image/jpeg" });
      // บีบอัดก่อนอัปโหลดเสมอ ลดพื้นที่ Storage/ฐานข้อมูล ตามที่ขอ — ใช้ไลบรารีเดียวกับที่
      // src/services/uploadMedia.ts ใช้อยู่แล้วสำหรับรูปแนบโพสต์ทั่วไปในระบบ
      const compressedFile = await imageCompression(rawFile, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: "image/jpeg",
      });

      const storagePath = `school-settings/${schoolId}/chat-images/${roomId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, compressedFile, { contentType: "image/jpeg" });
      const imageUrl = await getDownloadURL(snapshot.ref);
      onSent(imageUrl, storagePath);
    } catch (err) {
      console.error("Error uploading chat photo:", err);
      setError("ส่งรูปไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setIsUploading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-black"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between p-3">
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white">
          <X size={18} />
        </button>
        {!capturedDataUrl && hasMultipleCameras && (
          <button
            onClick={() => setFacingMode((p) => (p === "environment" ? "user" : "environment"))}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
            title="สลับกล้อง"
          >
            <SwitchCamera size={18} />
          </button>
        )}
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="max-w-xs text-center text-sm text-white">{error}</p>
        ) : capturedDataUrl ? (
          <img src={capturedDataUrl} alt="ภาพที่ถ่าย" className="max-h-full max-w-full object-contain" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-8 p-6">
        {capturedDataUrl ? (
          <>
            <button
              onClick={handleRetake}
              disabled={isUploading}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-50"
              title="ถ่ายใหม่"
            >
              <RotateCcw size={22} />
            </button>
            <button
              onClick={handleSend}
              disabled={isUploading}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-50"
              title="ส่ง"
            >
              {isUploading ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Check size={26} />
              )}
            </button>
          </>
        ) : (
          !error && (
            <button
              onClick={handleCapture}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white"
              title="ถ่ายภาพ"
            >
              <Camera size={26} />
            </button>
          )
        )}
      </div>
    </div>,
    document.body
  );
};

export default CameraCapture;
