import React, { useState, useEffect, useRef } from "react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { firestore, storage, auth } from "@/firebase";
import { collection, addDoc, serverTimestamp, Timestamp, doc, getDoc, query, orderBy, limit, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { FaFileUpload, FaStamp, FaSave, FaTimes, FaCheck, FaQrcode, FaCalendarAlt, FaChevronDown, FaTrash } from "react-icons/fa";
import jsPDF from "jspdf";
import Swal from "sweetalert2";
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader, DecodeHintType } from "@zxing/library";
import Tesseract from "tesseract.js";

// Configure PDF Worker (bundled locally so it always matches the installed pdfjs-dist
// version — a CDN-served worker can be stale/mismatched and silently render blank pages)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
// เอกสารสแกนบางไฟล์ฝังรูปด้วย JPEG2000 (JPX) ซึ่ง pdf.js ต้องใช้ตัวถอดรหัส WASM นี้
// ถ้าไม่ระบุ wasmUrl หน้าที่มีรูปแบบ JPX จะเรนเดอร์ออกมาว่างเปล่าโดยไม่มี error แจ้งผู้ใช้
const PDFJS_WASM_URL = "/pdfjs-wasm/";

// รายชื่อกลุ่มบริหารเดียวกับที่ใช้ในหน้าทะเบียนหนังสือ (DocumentRegistryPage.tsx) และหน้าจัดการ
// บุคลากรทั่วทั้งระบบ (TeacherListPage.tsx, AddUserPage.tsx) — ใช้ชุดเดียวกันเพื่อให้ "ผู้ปฏิบัติ"
// ที่กรอกตอนรับเอกสารตรงกับที่แสดงในทะเบียนหนังสือเสมอ
const DEPARTMENT_OPTIONS = [
  "งานบริหารวิชาการ",
  "งานบริหารงบประมาณ",
  "งานบริหารบุคคล",
  "งานบริหารทั่วไป",
  "งานบริหารกิจการนักเรียน",
  "ฝ่ายบริหาร",
];

// 📌 ตรวจสอบว่าภาพที่เรนเดอร์ออกมาว่างเปล่า (เกือบขาวล้วน) หรือไม่ (รับ pixel data ตรง ๆ
// เพื่อให้ใช้ร่วมกับ canvas ตรวจสอบขนาดเล็กที่ลดขนาดไว้แล้วได้ ไม่ต้องอ่านพิกเซลความละเอียดเต็มซ้ำ)
const isImageDataBlank = (data: Uint8ClampedArray) => {
  let nonWhitePixels = 0;
  // สุ่มตรวจทุก ๆ 25 พิกเซล เพื่อความเร็ว (เพียงพอสำหรับตรวจจับหน้าที่ว่างจริง ๆ)
  for (let i = 0; i < data.length; i += 4 * 25) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
      nonWhitePixels++;
      if (nonWhitePixels > 5) return false;
    }
  }
  return true;
};

// 📌 วาด canvas ต้นฉบับลงบน canvas ขนาดเล็กเพื่อใช้ตรวจสอบหน้าว่าง/สแกน QR Code
// maxDim ตั้งไว้สูงกว่าเอกสารขนาดมาตรฐาน (A4 ที่ scale 1.5 ~ 900-1300px) มาก
// เพื่อให้หน้าเอกสารทั่วไปไม่ถูกย่อขนาดเลย (คงความละเอียดเท่าต้นฉบับ = อ่าน QR Code ได้แม่นยำเท่าเดิม)
// จะย่อเฉพาะหน้าที่มีขนาดกระดาษใหญ่ผิดปกติเท่านั้น เพื่อไม่ให้อ่านพิกเซลจำนวนมหาศาลจนช้า
const createScanImageData = (source: HTMLCanvasElement, maxDim = 2200) => {
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = Math.max(1, Math.round(source.width * scale));
  scanCanvas.height = Math.max(1, Math.round(source.height * scale));
  const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true })!;
  // ปิดการ smooth ตอนย่อขนาด เพื่อไม่ให้ขอบลาย QR Code เบลอจนถอดรหัสไม่ออก
  // (ไม่ใช้ filter เพิ่มคอนทราสต์ เพราะ jsQR ทำ adaptive threshold ของตัวเองอยู่แล้ว
  // การเพิ่มคอนทราสต์ล่วงหน้าอาจทำให้โมดูล QR ขนาดเล็ก/ความหนาแน่นสูงเพี้ยนจนอ่านไม่ออกแทน)
  scanCtx.imageSmoothingEnabled = false;
  scanCtx.drawImage(source, 0, 0, scanCanvas.width, scanCanvas.height);
  return scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
};

// 📌 ใช้ ZXing แทน jsQR — jsQR ตรวจจับ QR Code จากเอกสารสแกน/ถ่ายสำเนาได้ไม่แม่นยำพอ
// (พบว่าบางครั้งจับ pattern ปลอมจากเส้นตารางในเอกสารแล้วคืนค่า QR Code เวอร์ชัน 1 ว่างเปล่ากลับมา)
// ZXing เป็น engine ที่ผ่านการพิสูจน์แล้วว่าแม่นยำกว่ามากในสถานการณ์จริงแบบนี้ และรองรับ charset
// ตามมาตรฐาน ECI ของ QR Code ได้ถูกต้อง (ไม่มีปัญหาข้อความภาษาไทยว่างเปล่าแบบ jsQR)
const zxingReader = new QRCodeReader();
const zxingHints = new Map();
zxingHints.set(DecodeHintType.TRY_HARDER, true);

// 📌 แปลงพิกเซล RGBA เป็น luminance source ที่ ZXing ใช้ถอดรหัสได้
const buildZxingBitmap = (data: Uint8ClampedArray, width: number, height: number): BinaryBitmap => {
  const packed = new Int32Array(width * height);
  for (let p = 0, j = 0; p < packed.length; p++, j += 4) {
    packed[p] = (data[j] << 16) | (data[j + 1] << 8) | data[j + 2];
  }
  const luminanceSource = new RGBLuminanceSource(packed, width, height);
  return new BinaryBitmap(new HybridBinarizer(luminanceSource));
};

// 📌 หา QR Code "ทุกอัน" ในภาพเดียว (ไม่ใช่แค่อันแรกที่เจอ) — เอกสารบางหน้ามีตาราง QR Code
// หลายอันอยู่ด้วยกัน (เช่น หน้าแนบท้ายหนังสือ) โดยหลังจากเจอแต่ละอันจะ "ลบ" บริเวณนั้นออกจากภาพ
// ที่ใช้สแกน (ระบายเป็นสีขาว) แล้วสแกนซ้ำ เพื่อหาอันถัดไปที่อาจซ่อนอยู่
const scanAllQrCodes = (imageData: ImageData, maxCodes = 12): string[] => {
  const data = new Uint8ClampedArray(imageData.data); // คัดลอกมาแก้ไขได้ ไม่กระทบต้นฉบับ
  const { width, height } = imageData;
  const found: string[] = [];

  for (let i = 0; i < maxCodes; i++) {
    let result;
    try {
      result = zxingReader.decode(buildZxingBitmap(data, width, height), zxingHints);
    } catch {
      break; // NotFoundException — ไม่เจอ QR Code เพิ่มแล้ว
    }

    const text = result.getText();
    if (text) found.push(text);

    // ระบายพื้นที่ของ QR Code ที่เพิ่งอ่านได้ (พร้อมขอบกันชนเล็กน้อย) ให้เป็นสีขาว
    // เพื่อไม่ให้สแกนซ้ำอันเดิม แล้วลองหาอันถัดไปในภาพเดียวกัน
    const points = result.getResultPoints();
    const xs = points.map((p) => p.getX());
    const ys = points.map((p) => p.getY());
    const pad = Math.max(4, Math.round((Math.max(...xs) - Math.min(...xs)) * 0.15));
    const minX = Math.max(0, Math.floor(Math.min(...xs) - pad));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs) + pad));
    const minY = Math.max(0, Math.floor(Math.min(...ys) - pad));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys) + pad));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
      }
    }
  }

  return found;
};

const GeneralAffairsPage: React.FC = () => {
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [stampedImages, setStampedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [receiveNo, setReceiveNo] = useState("");
  const [subject, setSubject] = useState(""); // 📌 เพิ่ม state สำหรับ 'ชื่อเรื่อง'
  const [qrCodeUrl, setQrCodeUrl] = useState(""); // 📌 เพิ่ม state สำหรับ 'QR Code URL' (ค่าแรกที่เจอ เพื่อความเข้ากันได้กับของเดิม)
  const [qrCodeUrls, setQrCodeUrls] = useState<string[][]>([]); // 📌 QR Code ทั้งหมดที่ตรวจพบในแต่ละหน้า (index ตรงกับหมายเลขหน้า, 1 หน้าอาจมีได้หลายอัน)
  const [urgency, setUrgency] = useState("normal"); // 📌 เปลี่ยน state เริ่มต้นสำหรับ 'ความด่วน' เป็น 'ปกติ'
  const [dueDate, setDueDate] = useState(""); // 📌 เพิ่ม state สำหรับ 'กำหนดเวลา'
  // ── เมทาดาทาทะเบียนหนังสือรับ (ที่ / ลงวันที่ / จาก / ถึง / ผู้ปฏิบัติ) — เดิมต้องไปกรอกย้อนหลัง
  // ที่หน้าทะเบียนหนังสือ (DocumentRegistryPage) ตอนนี้กรอกได้ตั้งแต่ตอนประทับตรารับเอกสารเลย
  const [docRefNo, setDocRefNo] = useState("");
  const [docDate, setDocDate] = useState("");
  const [docFrom, setDocFrom] = useState("");
  const [docTo, setDocTo] = useState("");
  const [docDepartment, setDocDepartment] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState({ date: '', time: '' }); // 📌 State สำหรับเก็บวันที่เวลาปัจจุบัน

  // 📌 State สำหรับการปรับตำแหน่ง Stamp
  const [isPositioning, setIsPositioning] = useState(false);
  const [stampPosition, setStampPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // 📌 State สำหรับ Drag and Drop
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // 📌 State สำหรับเปิด/ปิด Operations Panel
  const [isOperationsOpen, setIsOperationsOpen] = useState(true);

  const removeStoredQrCode = (page: number, indexInPage: number) => {
    setQrCodeUrls(prev => {
      const next = [...prev];
      next[page] = (next[page] || []).filter((_, i) => i !== indexInPage);
      return next;
    });
  };

  // -----------------------------
  // 📌 Redux User
  // -----------------------------
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const userName = (currentUser as any)?.displayName || currentUser?.email || "User";

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string>("โรงเรียน"); // 📌 State สำหรับชื่อโรงเรียน
  const [schoolAbbreviation, setSchoolAbbreviation] = useState<string>(""); // 📌 State สำหรับตัวย่อโรงเรียน
  const [academicYear, setAcademicYear] = useState<string>(""); // 📌 State สำหรับปีการศึกษา

  // 📌 ฟังก์ชันสำหรับดึงเลขที่รับถัดไปอัตโนมัติ (Auto-increment)
  const updateNextReceiveNo = async (sId: string, abbr: string, year: string) => {
    const docsRef = collection(firestore, "school-settings", sId, "stampedDocuments");
    const q = query(docsRef, orderBy("createdAt", "desc"), limit(1));
    const querySnapshot = await getDocs(q);
    
    let nextNumber = 1;
    if (!querySnapshot.empty) {
      const lastDoc = querySnapshot.docs[0].data();
      const lastReceiveNo = lastDoc.receiveNo || "";
      const match = lastReceiveNo.match(/(\d+)\/(\d{4})/);
      if (match) {
        const lastNum = parseInt(match[1]);
        const lastYear = match[2];
        // ถ้าปีการศึกษาตรงกัน ให้บวกเพิ่ม ถ้าไม่ตรง (ปีใหม่) ให้เริ่มที่ 1
        nextNumber = (lastYear === year) ? lastNum + 1 : 1;
      }
    }
    const formattedNum = String(nextNumber).padStart(4, '0');
    setReceiveNo(`${abbr} ${formattedNum}/${year}`.trim());
  };

  useEffect(() => {
    const fetchSchoolData = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userSchoolId = userDocSnap.data().schoolId;
          setSchoolId(userSchoolId);
          if (userSchoolId) {
            const schoolDocRef = doc(firestore, "school-settings", userSchoolId);
            const schoolDocSnap = await getDoc(schoolDocRef);
            if (schoolDocSnap.exists()) {
              const data = schoolDocSnap.data();
              setSchoolName(data.schoolName || "โรงเรียน");
              const abbr = data.schoolAbbreviation || "";
              setSchoolAbbreviation(abbr);
              // "ถึง" ของหนังสือรับเกือบทั้งหมดคือ ผอ.รร. ของตัวเอง — ตั้งค่าเริ่มต้นให้ ผู้ใช้แก้เองได้ถ้าไม่ใช่
              if (abbr) setDocTo(`ผอ.รร.${abbr}`);

              // 📌 ดึงปีการศึกษาจากปฏิทินโรงเรียน (อ้างอิงจาก SchoolCalendarPage)
              const calendarDocRef = doc(firestore, "school-settings", userSchoolId, "main_calendar", "default");
              const calendarDocSnap = await getDoc(calendarDocRef);
              let year = (new Date().getFullYear() + 543).toString();
              if (calendarDocSnap.exists()) {
                year = calendarDocSnap.data().academicYear || year;
              }
              setAcademicYear(year);
              // 📌 ดึงเลขที่รับถัดไปอัตโนมัติ
              updateNextReceiveNo(userSchoolId, abbr, year);
            }
          }
        }
      }
    };
    fetchSchoolData();
  }, []);

  // ชื่อเดือนไทย — ใช้จับบรรทัด "ลงวันที่" จากหนังสือราชการ (รูปแบบ "7 กันยายน 2569" หรือมีเลขไทยก็ได้)
  const THAI_MONTHS = "มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม";

  // 📌 สแกนหา "ชื่อเรื่อง", "ที่", "ลงวันที่" และหน่วยงานต้นทาง ("จาก") ด้วย OCR รอบเดียว (แทนที่จะรัน
  // Tesseract แยกทีละฟิลด์ซึ่งช้ากว่ามาก) — ผลลัพธ์เป็นการเดาที่ดีที่สุดจากภาพสแกน ไม่ได้แม่นยำ 100%
  // เสมอ (ลายมือ/ตราประทับทับตัวอักษรมักทำให้ OCR อ่านผิด) ผู้ใช้แก้ไขในช่องได้เองถ้าไม่ตรง
  const scanForSubject = async (canvas: HTMLCanvasElement) => {
    try {
      // กำหนดพื้นที่ในการสแกน (ส่วนบนของเอกสาร) เพื่อเพิ่มความเร็วและความแม่นยำ — ครอบคลุมทั้งหัวจดหมาย
      // (ผู้ส่ง) และบรรทัด ที่/วันที่/เรื่อง ซึ่งปกติอยู่ในส่วนบนของหนังสือราชการทั้งหมดอยู่แล้ว
      const rectangle = {
        left: 0,
        top: 0,
        width: canvas.width * 0.9,
        height: canvas.height * 0.4,
      };

      const { data: { text } } = await Tesseract.recognize(canvas, 'tha+eng', { rectangle } as any);
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const detected: string[] = [];

      // "เรื่อง"
      for (const line of lines) {
        const match = line.match(/(?:เรื่อง|เรือง|Subject)\s*[:;]?\s*(.+)/i);
        if (match) {
          const subjectText = match[1].trim().replace(/^[:;.\-]\s*/, '');
          if (subjectText.length > 1) {
            setSubject(subjectText);
            detected.push('ชื่อเรื่อง');
            break;
          }
        }
      }

      // "ที่" — ต้องอยู่ต้นบรรทัดเท่านั้น เพราะ "ที่" เป็นคำไทยทั่วไปที่มักปนอยู่ในข้อความอื่น
      for (const line of lines) {
        const match = line.match(/^ที่\s+(.{3,40})/);
        if (match) {
          setDocRefNo(match[1].trim());
          detected.push('ที่');
          break;
        }
      }

      // "ลงวันที่" — หาบรรทัด/ช่วงข้อความที่มีรูปแบบ [วัน] [ชื่อเดือนไทย] [ปี]
      const dateMatch = text.match(new RegExp(`([0-9๐-๙]{1,2}\\s*)?(${THAI_MONTHS})\\s*([0-9๐-๙]{4})`));
      if (dateMatch) {
        setDocDate(dateMatch[0].replace(/\s+/g, ' ').trim());
        detected.push('ลงวันที่');
      }

      // "จาก" — หนังสือราชการไม่มีป้าย "จาก:" ตรงๆ แต่ผู้ส่งคือหัวจดหมายด้านบนสุด มักขึ้นต้นด้วย
      // "สำนักงาน..." หรือ "โรงเรียน..." — ใช้บรรทัดแรกที่เจอคำเหล่านี้เป็นตัวเดาหน่วยงานต้นทาง
      const fromLine = lines.find((l) => /^(สำนักงาน|โรงเรียน|กรม|กระทรวง|เทศบาล|องค์การบริหาร)/.test(l));
      if (fromLine) {
        setDocFrom(fromLine);
        detected.push('จาก');
      }

      if (detected.length > 0) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'ตรวจพบข้อมูลอัตโนมัติ',
          text: `พบ: ${detected.join(', ')} — กรุณาตรวจสอบความถูกต้องอีกครั้ง`,
          showConfirmButton: false,
          timer: 2500,
        });
      }
    } catch (err) {
      console.error("OCR Error for document field scanning:", err);
      // ไม่ต้องแสดงข้อผิดพลาดให้ผู้ใช้เห็น
    }
  };

  // -----------------------------
  // 📌 Convert PDF → Images
  // -----------------------------
  const processPdfFile = async (file: File | null | undefined) => {
    setImagePreviewUrls([]);
    setStampedImages([]);
    setQrCodeUrls([]);
    if (!file || file.type !== "application/pdf") {
      Swal.fire({
        icon: "error",
        title: "ไฟล์ไม่ถูกต้อง",
        text: "กรุณาเลือกไฟล์ PDF เท่านั้น",
        background: "#2a2b2f", color: "#ffffff"
      });
      return;
    }
    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, wasmUrl: PDFJS_WASM_URL }).promise;

      const imgs: string[] = [];
      const qrResults: string[][] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });

        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d", { willReadFrequently: true })!;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: ctx,
          viewport,
          canvas: canvas,
        }).promise;

        // 📌 ตรวจสอบหน้าว่างเปล่า/สแกน QR Code จาก canvas ขนาดย่อ (เร็วกว่าอ่านพิกเซลความละเอียดเต็มมาก
        // และไม่กระทบความคมชัดของภาพหน้าเอกสารที่จะนำไปแสดงผล/บันทึกจริงซึ่งยังคงเรนเดอร์ที่ scale 1.5 เท่าเดิม)
        let scanData = createScanImageData(canvas);

        // 📌 กันเคสหน้าเรนเดอร์ออกมาว่างเปล่า (พบเป็นครั้งคราวจาก worker/แคชของ browser)
        // โดยลองเรนเดอร์ซ้ำด้วย canvas ใหม่อีกครั้งก่อนนำไปแสดงผล
        if (isImageDataBlank(scanData.data)) {
          console.warn(`Page ${pageNum} rendered blank, retrying...`);
          canvas = document.createElement("canvas");
          ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({
            canvasContext: ctx,
            viewport,
            canvas: canvas,
          }).promise;
          scanData = createScanImageData(canvas);
        }

        // 📌 สแกน QR Code ทุกอันในหน้านี้ (เอกสารบางฉบับมี QR Code หลายอันในหน้าเดียว เช่น ตารางแนบท้ายหนังสือ)
        let codesInPage = scanAllQrCodes(scanData);

        // 📌 ถ้าสแกนที่ความละเอียดปกติ (scale 1.5) ไม่เจอเลย ให้เรนเดอร์หน้านี้ซ้ำที่ความละเอียดสูงขึ้นมาก
        // เฉพาะสำหรับสแกน QR Code เท่านั้น (ไม่ใช้แสดงผล) เพราะ QR Code บางอันความหนาแน่นสูง/ถูกวางในพื้นที่แคบ
        // ทำให้ที่ความละเอียดแสดงผลปกติมีพิกเซลต่อโมดูลไม่พอ จนถอดรหัสไม่ออก
        if (codesInPage.length === 0) {
          const hiResViewport = page.getViewport({ scale: 4 });
          const hiResCanvas = document.createElement("canvas");
          hiResCanvas.width = hiResViewport.width;
          hiResCanvas.height = hiResViewport.height;
          const hiResCtx = hiResCanvas.getContext("2d", { willReadFrequently: true })!;
          await page.render({
            canvasContext: hiResCtx,
            viewport: hiResViewport,
            canvas: hiResCanvas,
          }).promise;
          codesInPage = scanAllQrCodes(createScanImageData(hiResCanvas, 4500));
        }

        qrResults.push(codesInPage);
        if (codesInPage.length > 0) {
          setQrCodeUrl(prev => prev || codesInPage[0]); // เก็บค่าแรกที่เจอไว้ในช่องหลัก (ความเข้ากันได้กับของเดิม)
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `พบ QR Code ${codesInPage.length > 1 ? `${codesInPage.length} รายการ` : ''} ในหน้า ${pageNum}`,
            timer: 1500,
            showConfirmButton: false,
            background: '#2a2b2f',
            color: '#ffffff'
          });
        }

        // 📌 สแกนหา "ชื่อเรื่อง" ด้วย OCR (เฉพาะหน้าแรก) — ไม่ await เพราะ OCR ใช้เวลานาน
        // ปล่อยให้ทำงานเบื้องหลังแล้วอัปเดตช่อง "ชื่อเรื่อง" เมื่อเสร็จ โดยไม่บล็อกการแสดงหน้าอื่น ๆ
        if (pageNum === 1) {
          scanForSubject(canvas);
        }

        imgs.push(canvas.toDataURL("image/jpeg", 0.8)); // 💡 เปลี่ยนเป็น JPEG เพื่อลดขนาดไฟล์

        // 📌 แสดงผลทีละหน้าทันทีที่พร้อม แทนที่จะรอให้ประมวลผลครบทุกหน้าก่อน
        // ผู้ใช้จะเห็นหน้าแรก ๆ เร็วขึ้นมากโดยเฉพาะเอกสารที่มีหลายหน้า
        setImagePreviewUrls([...imgs]);
        setQrCodeUrls([...qrResults]);
      }
    } catch (e) {
      console.error("PDF preview error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // -----------------------------
  // 📌 Process Image Files
  // -----------------------------
  const processImageFile = async (file: File) => {
    setImagePreviewUrls([]);
    setStampedImages([]);
    setQrCodeUrls([]);
    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setImagePreviewUrls([e.target.result as string]);
          
          // 📌 เพิ่ม: สแกน QR Code จากรูปภาพ
          const img = new Image();
          img.src = e.target.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (ctx) {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              const codesFound = scanAllQrCodes(createScanImageData(canvas));
              setQrCodeUrls([codesFound]);
              if (codesFound.length > 0) {
                setQrCodeUrl(codesFound[0]);
                Swal.fire({
                  icon: 'success',
                  title: 'พบ QR Code',
                  text: codesFound.length > 1 ? `พบ QR Code ${codesFound.length} รายการในภาพนี้` : 'ระบบอ่านข้อมูลจาก QR Code เรียบร้อยแล้ว',
                  timer: 1500,
                  showConfirmButton: false,
                  background: '#2a2b2f',
                  color: '#ffffff'
                });
              }

              // 📌 เพิ่ม: สแกนหา "ชื่อเรื่อง" จากรูปภาพ
              scanForSubject(canvas);
            }
          };
        }
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error("Image processing error:", e);
      setIsLoading(false);
    }
  };

  
  
  const processFile = async (file: File | null | undefined) => {
    if (!file) return;
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    if (fileType === "application/pdf") {
      await processPdfFile(file);
    } else if (fileType.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(fileName)) {
      await processImageFile(file);
    } else {
      Swal.fire({ icon: "error", title: "ไฟล์ไม่ถูกต้อง", text: "รองรับเฉพาะไฟล์ PDF และรูปภาพ (JPG, PNG) เท่านั้น", background: "#2a2b2f", color: "#ffffff" });
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    await processFile(file);
    event.target.value = "";
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    await processFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); setIsDraggingOver(false); };
  // -----------------------------
  // 📌 Draw Stamp Box
  // -----------------------------
  const drawStampBox = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    data: { receiveNo: string; subject: string; date: string; time: string; createdBy: string; schoolName: string; }
  ) => {
    const boxWidth = 330;
    const boxHeight = 135;
    const padding = 12;
  
    ctx.strokeStyle = "#1E3A8A";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, boxWidth, boxHeight);
  
    ctx.fillStyle = "#1E3A8A";
    ctx.font = "bold 24px 'TH Sarabun New'";
  
    let offsetY = y + padding + 5;
  
    ctx.fillText(data.schoolName, x + padding, offsetY + 8);
    offsetY += 35;
  
    ctx.font = "22px 'TH Sarabun New'";
    ctx.fillText(`เลขที่รับ: ${data.receiveNo}`, x + padding, offsetY);
    offsetY += 28;

    ctx.fillText(`เรื่อง: ${data.subject}`, x + padding, offsetY, boxWidth - (padding * 2));
    offsetY += 28;
  
    ctx.fillText(`วันที่: ${data.date}   เวลา: ${data.time}`, x + padding, offsetY);
  };

  // -----------------------------
  // 📌 Stamp Positioning Logic
  // -----------------------------
  useEffect(() => {
    if (isPositioning && previewCanvasRef.current && imagePreviewUrls.length > 0) {
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      img.src = imagePreviewUrls[0];
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        // Set initial stamp position (top-right corner)
        setStampPosition({ x: canvas.width - 330 - 20, y: 20 });
      };
    }
  }, [isPositioning, imagePreviewUrls]);

  useEffect(() => {
    if (isPositioning && previewCanvasRef.current && imagePreviewUrls.length > 0) {
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      img.src = imagePreviewUrls[0];
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const now = new Date();
        const stampData = {
          receiveNo: receiveNo || "เลขที่รับ",
          subject: subject || "ชื่อเรื่อง",
          date: now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          time: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          createdBy: userName,
          schoolName: schoolName,
        };
        drawStampBox(ctx, stampPosition.x, stampPosition.y, stampData);
      };
    }
  }, [isPositioning, stampPosition, receiveNo, subject, imagePreviewUrls, userName, schoolName]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const boxWidth = 330;
    const boxHeight = 135;

    if (
      mouseX >= stampPosition.x && mouseX <= stampPosition.x + boxWidth &&
      mouseY >= stampPosition.y && mouseY <= stampPosition.y + boxHeight
    ) {
      setIsDragging(true);
      setDragStart({
        x: mouseX - stampPosition.x,
        y: mouseY - stampPosition.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    setStampPosition({
      x: mouseX - dragStart.x,
      y: mouseY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleConfirmStampPosition = async () => {
    const firstPageSrc = imagePreviewUrls[0];
    const img = new Image();
    img.src = firstPageSrc;
    img.onload = async () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const now = new Date();
        const stampData = { receiveNo, subject, date: now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }), time: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), createdBy: userName, schoolName: schoolName };
        drawStampBox(ctx, stampPosition.x, stampPosition.y, stampData);
        
        const stampedFirstPage = canvas.toDataURL("image/jpeg", 0.8); // 💡 เปลี่ยนเป็น JPEG
        setStampedImages([stampedFirstPage, ...imagePreviewUrls.slice(1)]);
        setIsPositioning(false);
        Swal.fire({ icon: 'success', title: 'ประทับตราสำเร็จ!', text: 'เอกสารพร้อมสำหรับบันทึกและส่งมอบ', background: '#2a2b2f', color: '#ffffff', timer: 1500, showConfirmButton: false });
    };
  };
  // -----------------------------
  // 📌 Apply Stamp (หน้าแรกเท่านั้น)
  // -----------------------------
  const handleStamp = async () => {
    if (!receiveNo || !subject || imagePreviewUrls.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "ข้อมูลไม่ครบถ้วน",
        text: "กรุณาเลือกไฟล์เอกสาร และกรอก 'เลขที่รับ' กับ 'ชื่อเรื่อง' ให้ครบถ้วน",
        background: "#2a2b2f",
        color: "#ffffff",
      });
      return;
    }

    setIsPositioning(true); // เปิดโหมดปรับตำแหน่ง
  };

  // 📌 ฟังก์ชันสำหรับล้างค่าในฟอร์ม (Reset Form)
  const resetForm = () => {
    setImagePreviewUrls([]);
    setStampedImages([]);
    // 📌 ล้างค่าแล้วรันเลขที่รับถัดไปสำหรับเอกสารใบใหม่
    if (schoolId && academicYear) {
      updateNextReceiveNo(schoolId, schoolAbbreviation, academicYear);
    }
    setSubject("");
    setQrCodeUrl("");
    setQrCodeUrls([]);
    setUrgency("normal");
    setDueDate("");
    setDocRefNo("");
    setDocDate("");
    setDocFrom("");
    setDocTo(schoolAbbreviation ? `ผอ.รร.${schoolAbbreviation}` : "");
    setDocDepartment("");
    const fileInput = document.getElementById('pdf-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  // -----------------------------
  // 📌 Save to Firebase & Export PDF
  // -----------------------------
  const handleSaveAndExport = async () => {
    if (stampedImages.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "ยังไม่ได้ประทับตรา",
        text: "กรุณาประทับตราเอกสารก่อนบันทึก",
        background: "#2a2b2f", color: "#ffffff"
      });
      return;
    }

    if (!schoolId) {
      Swal.fire({
        icon: "error",
        title: "ไม่พบข้อมูลโรงเรียน",
        text: "ไม่สามารถระบุโรงเรียนของคุณได้ กรุณาติดต่อผู้ดูแลระบบ",
        background: "#2a2b2f", color: "#ffffff"
      });
      return;
    }

    setIsUploading(true);
    Swal.fire({
      title: 'กำลังบันทึกและอัปโหลด...',
      text: 'กรุณารอสักครู่ ระบบกำลังจัดเก็บเอกสารของคุณ',
      allowOutsideClick: false,
      background: '#2a2b2f', color: '#ffffff',
      didOpen: () => Swal.showLoading()
    });

    try {
      // Sanitize receiveNo to be a valid path segment for the folder name.
      const sanitizedReceiveNo = receiveNo.replace(/[^a-zA-Z0-9-]/g, '_');
      const documentFolder = `school-settings/${schoolId}/stampedDocuments/${sanitizedReceiveNo}`;

      const imageUrls: string[] = [];
      const uploadPromises = stampedImages.map(async (imgSrc, index) => {
        const imageBlob = await (await fetch(imgSrc)).blob();
        const imageFileName = `page_${index + 1}.jpeg`; // 💡 เปลี่ยนนามสกุลไฟล์
        const imageStorageRef = ref(storage, `${documentFolder}/${imageFileName}`);
        const uploadResult = await uploadBytes(imageStorageRef, imageBlob);
        const downloadURL = await getDownloadURL(uploadResult.ref);
        imageUrls[index] = downloadURL; // Ensure order is correct
      });

      await Promise.all(uploadPromises);

      // 💡 ใช้ URL ของ page_1.jpeg เป็น previewImageUrl
      const previewImageUrl = imageUrls[0];

      const now = Timestamp.now();

      // 📌 Firestore ไม่รองรับ "array ซ้อน array" (nested arrays) — ถ้าส่ง qrCodeUrls แบบ string[][]
      // ตรง ๆ การบันทึกจะล้มเหลว/ถูกปฏิเสธ ทำให้ QR Code ที่เจอในหน้าอื่น ๆ หายไปทั้งหมด
      // ต้องแปลงให้แบนราบเป็น array ของ object {page, url} ก่อนบันทึกเสมอ
      const qrCodeEntries = qrCodeUrls.flatMap((urls, page) => urls.map((url) => ({ page, url })));

      // 3. Save document info to Firestore
      await addDoc(collection(firestore, "school-settings", schoolId, "stampedDocuments"), {
        receiveNo,
        subject, // 📌 บันทึก 'ชื่อเรื่อง'
        qrCodeUrl, // 📌 บันทึก 'QR Code URL' (ค่าแรกที่เจอ)
        qrCodeUrls: qrCodeEntries, // 📌 บันทึก QR Code ที่ตรวจพบในแต่ละหน้า (แบบแบนราบ ไม่ใช่ nested array)
        urgency, // 📌 บันทึก 'ความด่วน'
        dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null, // 📌 บันทึก 'กำหนดเวลา'
        docRefNo: docRefNo.trim(), // 📌 "ที่" — เลขที่หนังสือของหน่วยงานต้นทาง
        docDate: docDate.trim(), // 📌 "ลงวันที่" — วันที่ระบุในหนังสือ (ต่างจาก date/time ที่เป็นวันที่ประทับตรารับ)
        from: docFrom.trim(),
        to: docTo.trim(),
        department: docDepartment, // 📌 "ผู้ปฏิบัติ"
        date: now.toDate().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }), // 📌 ใช้วันที่ปัจจุบัน
        time: now.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), // 📌 ใช้เวลาปัจจุบัน
        // pdfUrl: downloadURL, // 📌 เปลี่ยนเป็น imageUrls
        imageUrls: imageUrls, // 📌 บันทึก Array ของ URL รูปภาพ
        pageCount: imageUrls.length, // 📌 บันทึกจำนวนหน้า
        previewImageUrl: previewImageUrl, // 📌 เพิ่ม URL ของรูปภาพตัวอย่าง
        status: "pending_approval", // สถานะเริ่มต้น
        createdAt: serverTimestamp(),
        createdBy: userName,
      });

      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', text: 'เอกสารถูกส่งไปรอการอนุมัติเรียบร้อยแล้ว', background: '#2a2b2f', color: '#ffffff', timer: 2000, showConfirmButton: false });

      // 📌 เรียกใช้ฟังก์ชันล้างฟอร์ม
      resetForm();

    } catch (error) {
      console.error("Error saving and exporting PDF:", error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกเอกสารได้', background: '#2a2b2f', color: '#ffffff' });
    } finally {
      setIsUploading(false);
    }
  };

  // 📌 Effect สำหรับอัปเดตเวลาปัจจุบันทุกวินาที
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentDateTime({
        date: now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: now.toLocaleTimeString('th-TH')
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (isPositioning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-sm" onClick={() => setIsPositioning(false)}></div>
        
        <div className="relative w-full max-w-[98vw] h-[95vh] bg-white dark:bg-[#2a2b2f] rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1f21]">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FaStamp className="text-indigo-600 dark:text-indigo-400" />
                ปรับตำแหน่งตราประทับ
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                ลากกล่องตราประทับไปยังตำแหน่งที่ต้องการบนเอกสาร
              </p>
            </div>
            <button 
              onClick={() => setIsPositioning(false)}
              className="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <FaTimes size={20} />
            </button>
          </div>

          {/* Canvas Container */}
          <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-[#18191a] flex items-center justify-center relative p-2">
            <canvas
              ref={previewCanvasRef}
              className="max-w-full max-h-full object-contain shadow-lg cursor-move touch-none rounded-sm bg-white"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>

          {/* Modal Footer */}
          <div className="flex-none px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1f21] flex justify-end gap-3">
            <button 
              onClick={() => setIsPositioning(false)} 
              className="px-5 py-2.5 rounded-lg font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:ring-2 focus:ring-gray-200"
            >
              ยกเลิก
            </button>
            <button 
              onClick={handleConfirmStampPosition} 
              className="px-5 py-2.5 rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:shadow transition-all focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 flex items-center gap-2"
            >
              <FaCheck />
              ยืนยันตำแหน่ง
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50/50 dark:bg-[#1e1f21] transition-colors duration-300 font-sans">
        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#111318]/95 backdrop-blur border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton to="/general-affairs/home" />
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">งานธุรการ · e-Saraban</p>
              <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">ลงรับเอกสาร / ประทับตรา</h1>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0 text-xs text-slate-500 dark:text-slate-400">
            <FaCalendarAlt size={14} />
            <span className="font-bold text-slate-800 dark:text-white">{currentDateTime.time}</span>
            <span>{currentDateTime.date}</span>
          </div>
        </div>

        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">

          {/* 📌 min-h ตรงนี้ให้ "งบความสูงที่เหลือ" กับ flex-1 ของการ์ดขวาไปใช้ขยายเต็มพื้นที่
              ใช้ได้ทั้งโหมดเรียงซ้อน (มือถือ/แท็บเล็ต) ที่ flex-1 ขยายแนวตั้งเติมพื้นที่ว่างหลังการ์ดซ้าย
              และโหมดเรียงข้าง (desktop, lg:) ที่การ์ดขวามี min-h ของตัวเองกำกับอยู่แล้ว */}
          <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 items-start min-h-[calc(100vh-8rem)]">
            
            {/* LEFT SIDEBAR - CONTROLS (Sticky เฉพาะจอ lg ขึ้นไป, บนมือถือให้สูงตามเนื้อหาจริงไม่บังคับเต็มจอ) */}
            <div className="w-full lg:w-[320px] xl:w-[360px] flex-shrink-0 lg:sticky lg:top-16 z-10 h-auto lg:h-[calc(100vh-4rem)] bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">

              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">รายละเอียดเอกสาร</h2>
              </div>

              <div className="overflow-y-auto lg:h-[calc(100%-3.5rem)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] p-3 sm:p-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    {/* 📌 จับคู่ช่องสั้น "เลขที่รับ" กับ "ความเร่งด่วน" ไว้แถวเดียวกัน ลดความสูงรวมของฟอร์มบนจอเล็ก */}
                    <div className="col-span-1">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เลขที่รับ</label>
                      <input
                        type="text"
                        value={receiveNo}
                        onChange={(e) => setReceiveNo(e.target.value)}
                        placeholder="เช่น 123/2567"
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ความเร่งด่วน</label>
                      <select
                        value={urgency}
                        onChange={(e) => setUrgency(e.target.value)}
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all appearance-none text-sm"
                      >
                        <option value="normal">ปกติ</option>
                        <option value="urgent">ด่วน</option>
                        <option value="very_urgent">ด่วนมาก</option>
                        <option value="most_urgent">ด่วนที่สุด</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อเรื่อง</label>
                      <textarea
                        rows={2}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="ระบุชื่อเรื่องเอกสาร..."
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-sm"
                      />
                    </div>
                    {/* 📌 ที่ / ลงวันที่ — ข้อมูลจากตัวหนังสือต้นทาง (ต่างจาก "เลขที่รับ"/"กำหนดเวลา" ที่เป็นข้อมูลของโรงเรียนเอง) */}
                    <div className="col-span-1">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ที่</label>
                      <input
                        type="text"
                        value={docRefNo}
                        onChange={(e) => setDocRefNo(e.target.value)}
                        placeholder="เช่น ศธ 04305/ว3855"
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                      />
                      <p className="mt-1 text-[10px] whitespace-nowrap truncate text-amber-600 dark:text-amber-400">
                        ตรวจสอบให้ตรงต้นฉบับก่อนบันทึก
                      </p>
                    </div>
                    <div className="col-span-1">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ลงวันที่</label>
                      <input
                        type="text"
                        value={docDate}
                        onChange={(e) => setDocDate(e.target.value)}
                        placeholder="เช่น 7 กันยายน 2569"
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">จาก</label>
                      <input
                        type="text"
                        value={docFrom}
                        onChange={(e) => setDocFrom(e.target.value)}
                        placeholder="หน่วยงานต้นทาง"
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                      />
                      <p className="mt-1 text-[10px] whitespace-nowrap truncate text-amber-600 dark:text-amber-400">
                        ตรวจสอบให้ตรงต้นฉบับก่อนบันทึก
                      </p>
                    </div>
                    <div className="col-span-1">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ถึง</label>
                      <input
                        type="text"
                        value={docTo}
                        onChange={(e) => setDocTo(e.target.value)}
                        placeholder="เช่น ผอ.รร."
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้ปฏิบัติ (แผนกที่รับผิดชอบ)</label>
                      <select
                        value={docDepartment}
                        onChange={(e) => setDocDepartment(e.target.value)}
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all appearance-none text-sm"
                      >
                        <option value="">ไม่ระบุ</option>
                        {DEPARTMENT_OPTIONS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    {/* 📌 จับคู่ "กำหนดเวลา" กับ "ลิงก์เอกสาร (QR Code)" ไว้แถวเดียวกันด้วย เพื่อความหนาแน่นแบบฟอร์มเอ็นเตอร์ไพรส์ */}
                    <div className="col-span-1">
                      <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กำหนดเวลา</label>
                      <input
                        type="datetime-local"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <span>ลิงก์เอกสาร (QR)</span>
                        {qrCodeUrl && <span className="text-green-500 text-[10px] flex items-center gap-1 normal-case tracking-normal"><FaCheck /> พบแล้ว</span>}
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                          <FaQrcode />
                        </div>
                        <input
                          type="url"
                          value={qrCodeUrl}
                          onChange={(e) => setQrCodeUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full pl-10 px-3 py-1.5 sm:py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                        />
                      </div>
                    </div>
                    {qrCodeUrls.some(urls => urls.length > 0) && (
                      <div className="col-span-2">
                        <label className="block mb-1 sm:mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          QR Code ที่จัดเก็บไว้ ({qrCodeUrls.reduce((sum, urls) => sum + urls.length, 0)})
                        </label>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {qrCodeUrls.flatMap((urls, page) => urls.map((url, i) => (
                            <div key={`${page}-${i}`} className="flex items-center gap-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5">
                              <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 shrink-0">หน้า {page + 1}</span>
                              <span className={`flex-1 text-xs truncate ${url ? 'text-gray-600 dark:text-gray-300' : 'text-amber-500 italic'}`} title={url || 'อ่านค่าไม่สำเร็จ'}>
                                {url || '(อ่านข้อความไม่สำเร็จ)'}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeStoredQrCode(page, i)}
                                className="text-gray-400 hover:text-red-500 shrink-0 transition-colors"
                                title="ลบรายการนี้"
                              >
                                <FaTrash size={11} />
                              </button>
                            </div>
                          )))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT CONTENT - PREVIEW */}
            <div 
              className={`relative flex-1 min-w-0 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 min-h-[200px] lg:min-h-[calc(100vh-8rem)] flex flex-col transition-all duration-300 ${
                isDraggingOver ? 'ring-4 ring-indigo-500/30 border-indigo-500' : ''
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {/* Toolbar / Status Bar */}
              <div className="flex-none px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-[#2a2b2f] rounded-t-2xl">
                <h3 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <span className="w-2 h-6 bg-indigo-500 rounded-full"></span>
                  ตัวอย่างเอกสาร
                </h3>
                <div className="flex items-center gap-3">
                  {imagePreviewUrls.length > 0 && (
                    <label htmlFor="pdf-upload" className="cursor-pointer text-xs font-medium px-3 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 transition-colors flex items-center gap-2">
                      <FaFileUpload size={12} />
                      เปลี่ยนไฟล์
                    </label>
                  )}
                  <input id="pdf-upload" type="file" accept="application/pdf, image/*" className="hidden" onChange={handleFileChange} />
                  
                  {imagePreviewUrls.length > 0 && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {imagePreviewUrls.length} หน้า
                    </span>
                  )}
                  {stampedImages.length > 0 && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 flex items-center gap-1">
                      <FaCheck size={10} /> พร้อมบันทึก
                    </span>
                  )}
                </div>
              </div>

              {/* Scrollable Content — ใช้ flex-1 (ไม่ใช่ h-full) ให้กรอบเส้นประยืดเต็มพื้นที่ที่เหลือจริง
                  ไม่ว่าการ์ดแม่จะได้ความสูงมาจาก min-height หรือค่าอะไรก็ตาม (h-full/เปอร์เซ็นต์ไม่รับประกันแบบนี้) */}
              <div className="flex-1 flex flex-col p-3 sm:p-6 bg-gray-100/50 dark:bg-[#18191a] rounded-b-2xl">
                {isLoading && imagePreviewUrls.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 animate-pulse">
                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full mb-4"></div>
                    <p>กำลังประมวลผลเอกสาร...</p>
                  </div>
                ) : imagePreviewUrls.length === 0 ? (
                  <label
                    htmlFor="pdf-upload"
                    className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl m-2 sm:m-4 bg-white dark:bg-[#1e1f21] cursor-pointer hover:bg-gray-50 dark:hover:bg-[#25262a] transition-colors"
                  >
                    <div className="w-14 h-14 sm:w-20 sm:h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-3 sm:mb-6 text-indigo-500 dark:text-indigo-400">
                      <FaFileUpload size={24} className="sm:hidden" />
                      <FaFileUpload size={32} className="hidden sm:block" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">อัปโหลดเอกสาร</h3>
                    <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-0 sm:mb-6">
                      คลิกเพื่อเลือกไฟล์ PDF หรือรูปภาพ หรือลากไฟล์มาวางที่นี่เพื่อเริ่มดำเนินการ
                    </p>
                  </label>
                ) : (
                  <div className="space-y-8 max-w-4xl mx-auto">
                    {(stampedImages.length > 0 ? stampedImages : imagePreviewUrls).map((img, idx) => (
                      <div key={idx} className="relative group shadow-lg rounded-lg transition-transform hover:scale-[1.01] duration-300">
                        <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-black/10 to-transparent rounded-t-lg pointer-events-none"></div>
                        <div className="absolute top-4 left-4 bg-gray-900/80 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-md shadow-sm z-10">
                          หน้าที่ {idx + 1}
                        </div>
                        {qrCodeUrls[idx]?.length > 0 && (
                          <div className="absolute top-4 right-4 bg-purple-600/90 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-md shadow-sm z-10 flex items-center gap-1.5">
                            <FaQrcode size={12} /> พบ QR Code{qrCodeUrls[idx].length > 1 ? ` (${qrCodeUrls[idx].length})` : ''}
                          </div>
                        )}
                        <img
                          src={img}
                          alt={`Page ${idx + 1}`}
                          className="w-full h-auto rounded-lg bg-white"
                          loading="lazy"
                        />
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-4 animate-pulse">
                        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                        กำลังประมวลผลหน้าถัดไป...
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Operations Panel (Overlay) */}
              {imagePreviewUrls.length > 0 && (
                <div 
                  className={`sticky bottom-6 z-20 self-end mr-6 mb-6 transition-all duration-300 ${
                    isOperationsOpen 
                      ? 'w-60 bg-white dark:bg-[#2a2b2f] rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95 p-4' 
                      : 'w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-lg cursor-pointer flex items-center justify-center text-white hover:scale-110'
                  }`}
                  onClick={() => !isOperationsOpen && setIsOperationsOpen(true)}
                  title={!isOperationsOpen ? "แสดงเมนูดำเนินการ" : ""}
                >
                  {isOperationsOpen ? (
                    <>
                      <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                        <h2 className="text-base font-bold text-gray-900 dark:text-white whitespace-nowrap">ดำเนินการ</h2>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsOperationsOpen(false);
                          }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                          title="ซ่อน"
                        >
                          <FaChevronDown />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        <button
                          onClick={handleStamp}
                          disabled={isLoading}
                          className="w-full bg-white border border-gray-200 dark:bg-gray-700 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-white font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                          <FaStamp className="text-red-500 text-lg" />
                          <span className="text-sm">ประทับตรา</span>
                        </button>

                        <button
                          onClick={handleSaveAndExport}
                          disabled={stampedImages.length === 0 || isUploading}
                          className={`w-full font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${
                            stampedImages.length > 0
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 dark:shadow-none' 
                              : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                          }`}
                        >
                          <FaSave className="text-lg" />
                          <span className="text-sm">{isUploading ? 'กำลังบันทึก...' : 'เสนอผู้บริหาร'}</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <FaStamp size={24} />
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </MainLayout>
  );
};

export default GeneralAffairsPage;
