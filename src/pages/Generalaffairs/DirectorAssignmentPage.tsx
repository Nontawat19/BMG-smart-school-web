import React, { useState, useEffect, useRef } from "react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { firestore, storage, auth } from "@/firebase";
import { collection, query, where, getDocs, Timestamp, doc, updateDoc, getDoc, deleteField, arrayUnion, arrayRemove, addDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { FaFilePdf, FaCheckCircle, FaTimes, FaCheck, FaImages, FaWindowClose, FaTrash, FaPen, FaQrcode, FaCalendarAlt, FaEraser, FaSignature, FaUserTie, FaBuilding, FaBullhorn, FaRegCommentDots, FaSave, FaBook, FaChartPie, FaChalkboardTeacher, FaEye, FaBolt, FaChevronDown, FaSearch, FaChevronLeft, FaChevronRight, FaInbox } from "react-icons/fa";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import jsPDF from "jspdf";
import Swal from "sweetalert2";
import SkeletonLoader from "@/components/SkeletonLoader";

interface StampedDocument {
  id: string;
  receiveNo: string;
  subject: string; // 💡 เพิ่ม subject เพื่อให้ type ตรงกับข้อมูลจริง
  qrCodeUrl?: string; // 📌 เพิ่ม qrCodeUrl
  qrCodeUrls?: { page: number; url: string }[]; // 📌 QR Code ที่ตรวจพบในแต่ละหน้า (แบบแบนราบ เพราะ Firestore ไม่รองรับ nested array)
  dueDate?: Timestamp; // 📌 เพิ่ม dueDate
  urgency?: 'normal' | 'urgent' | 'very_urgent' | 'most_urgent'; // 📌 เพิ่ม 'ปกติ' ใน field สำหรับความด่วน
  date: string;
  time: string;
  pdfUrl: string;
  imageUrls?: string[]; // 💡 เพิ่ม field สำหรับเก็บ URL ของรูปภาพทุกหน้า
  pageCount?: number; // 💡 เพิ่ม field สำหรับเก็บจำนวนหน้า
  previewImageUrl?: string; // 📌 เพิ่ม field สำหรับรูปภาพตัวอย่าง
  status: 'pending_approval' | 'approved';
  createdAt: Timestamp;
  createdBy: string;
  // 📌 เพิ่ม field สำหรับเก็บข้อมูลการมอบหมายงาน
  assignments?: {
    academic: boolean;
    general: boolean;
    budget: boolean;
    personnel: boolean;
    assignee?: string;
    comment?: string;
  };
}

// Configure PDF Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ขนาดกล่อง "ความคิดเห็นของผู้บริหาร" — ใช้ร่วมกันทั้งตอนวาดพรีวิวและตอนคำนวณตำแหน่งเริ่มต้น
const ASSIGNMENT_STAMP_WIDTH = 330;
const ASSIGNMENT_STAMP_HEIGHT = 260;
const ASSIGNMENT_STAMP_MARGIN = 20;

// Helper เพื่อดึง Download URL สดใหม่จาก Firebase Storage เมื่อ URL เดิมหมดอายุ (Token Expired)
const refreshFirebaseStorageUrl = async (url: string): Promise<string> => {
  try {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('firebasestorage.googleapis.com')) {
      const match = url.match(/\/o\/([^?]+)/);
      if (match && match[1]) {
        const storagePath = decodeURIComponent(match[1]);
        const storageRef = ref(storage, storagePath);
        return await getDownloadURL(storageRef);
      }
    }
    return url;
  } catch (err) {
    console.warn('Could not refresh Firebase Storage URL:', url, err);
    return url;
  }
};

// 📌 จัดกลุ่ม QR Code ที่บันทึกไว้แบบแบนราบ [{page, url}, ...] ให้กลับมาเป็น array ต่อหน้า (string[][])
// เพื่อใช้แสดงผลในตัว viewer เท่านั้น (ค่านี้เป็นแค่ state ฝั่ง client ไม่ได้ส่งกลับไปบันทึกที่ Firestore
// จึงไม่ติดข้อจำกัดเรื่อง nested array)
const groupQrCodesByPage = (entries: { page: number; url: string }[] | undefined): string[][] => {
  const grouped: string[][] = [];
  (entries || []).forEach(({ page, url }) => {
    if (!grouped[page]) grouped[page] = [];
    grouped[page].push(url);
  });
  return grouped;
};

const DirectorAssignmentPageSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-gray-50 dark:bg-[#1e1f21] p-4 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex-1 space-y-3">
              <SkeletonLoader className="h-6 w-3/4 rounded-md" />
              <SkeletonLoader className="h-5 w-1/3 rounded-md" />
              <SkeletonLoader className="h-4 w-2/3 rounded-md" />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <SkeletonLoader className="h-10 w-28 rounded-lg" />
              <SkeletonLoader className="h-10 w-40 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const DirectorAssignmentPage: React.FC = () => {
  const [documents, setDocuments] = useState<StampedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  const [teachers, setTeachers] = useState<{id: string, displayName: string, email?: string, uid?: string}[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userSchoolId = userDocSnap.data().schoolId;
          setSchoolId(userSchoolId);
          // 📌 Fetch school info here
          if (userSchoolId) {
            const schoolDocRef = doc(firestore, "school-settings", userSchoolId);
            const schoolDocSnap = await getDoc(schoolDocRef);
            if (schoolDocSnap.exists()) {
              setSchoolInfo(schoolDocSnap.data());
            }
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 📌 States for assignment stamp positioning
  const [isPositioning, setIsPositioning] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<StampedDocument | null>(null);
  const [stampPosition, setStampPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [assignmentData, setAssignmentData] = useState<any>(null);

  // 💡 State ใหม่: เพื่อเก็บข้อมูลการมอบหมายชั่วคราวก่อนประทับตรา
  const [pendingAssignment, setPendingAssignment] = useState<{ docId: string; data: any } | null>(null);

  // 💡 State สำหรับเมนูรายการลิงก์ QR Code แบบย่อ (ใช้ doc.id ระบุว่าเปิดของเอกสารไหนอยู่)
  const [qrDropdownOpenFor, setQrDropdownOpenFor] = useState<string | null>(null);

  // 💡 State สำหรับดรอปดาวน์เลือกครู (สร้างขึ้นเองแทน <select> เดิม เพราะเมนูของ <select> บนมือถือ
  // จะใช้ธีมมืด/สว่างตามระบบปฏิบัติการเสมอ ไม่ตามธีมของเว็บที่ผู้ใช้เลือกไว้)
  const [isTeacherDropdownOpen, setIsTeacherDropdownOpen] = useState(false);

  // 💡 State สำหรับ Image Viewer Modal
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [imagesToView, setImagesToView] = useState<string[]>([]);
  const [qrCodesToView, setQrCodesToView] = useState<string[][]>([]);
  const [isRefreshingImages, setIsRefreshingImages] = useState(false);

  // 💡 State สำหรับ Modal มอบหมายงาน (UI ใหม่)
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [targetDoc, setTargetDoc] = useState<StampedDocument | null>(null);

  // 📌 ล็อกไม่ให้หน้าเว็บด้านหลังเลื่อนได้ตอนเปิด modal เต็มจอ — ถ้าไม่ล็อก เบราว์เซอร์จะยังโชว์สกอร์บาร์
  // ของหน้าเว็บด้านหลัง (รายการเอกสารที่ยาว) ให้เห็นทั้งที่เนื้อหาใน modal เองพอดีกับจอแล้ว
  useEffect(() => {
    const shouldLock = isAssignmentModalOpen || isImageViewerOpen || isPositioning;
    if (shouldLock) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = previousOverflow; };
    }
  }, [isAssignmentModalOpen, isImageViewerOpen, isPositioning]);
  const [assignmentForm, setAssignmentForm] = useState({
    acknowledge: false,
    proceed: false,
    academic: false,
    personnel: false,
    budget: false,
    general: false,
    inform: false,
    informTeacher: '',
    comment: '',
    signature: ''
  });
  const signaturePadRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState<string[]>([]);


  // 📌 Quick Comments
  const quickComments = [
    "เห็นควรให้ดำเนินการตามเสนอ",
    "อนุมัติ ให้ดำเนินการตามเสนอ",
    "อนุมัติ ให้ดำเนินการตามระเบียบที่เกี่ยวข้อง",
    "รับทราบ และให้ดำเนินการตามเสนอ",
    "เห็นควรให้ดำเนินการ และรายงานผลให้ทราบ",
    "เห็นสมควรให้ดำเนินการตามระเบียบทางราชการ",
    "ให้ผู้รับผิดชอบดำเนินการตามขั้นตอนที่เกี่ยวข้อง",
    "รับทราบ และแจ้งผู้เกี่ยวข้องทราบ",
    "ให้ดำเนินการและแจ้งผลให้ทราบต่อไป",
    "รับทราบ และให้แจ้งหน่วยงานต้นเรื่องทราบ",
    "เห็นควรให้ประสานงานหน่วยงานที่เกี่ยวข้อง",
    "ให้ตอบหนังสือแจ้งผลการดำเนินการ",
    "อนุมัติ ให้ใช้จ่ายงบประมาณตามระเบียบทางราชการ",
    "เห็นควรให้ดำเนินการตามแผนงบประมาณที่ได้รับจัดสรร",
    "ให้เจ้าหน้าที่การเงินดำเนินการตามระเบียบที่เกี่ยวข้อง",
    "ให้ตรวจสอบความถูกต้องก่อนดำเนินการ",
    "ให้พิจารณารายละเอียดเพิ่มเติมก่อนดำเนินการ",
    "ให้เสนอเรื่องพร้อมเอกสารประกอบให้ครบถ้วนอีกครั้ง",
    "ยังไม่อนุมัติ ให้ทบทวนและเสนอใหม่",
    "ไม่อนุมัติ",
    "เห็นควรชะลอการดำเนินการไว้ก่อน"
  ];

  const handleQuickComment = (text: string) => {
    setAssignmentForm(prev => ({
      ...prev,
      comment: prev.comment ? `${prev.comment} ${text}` : text
    }));
  };

  const fetchDocuments = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const docsRef = collection(firestore, "school-settings", schoolId, "stampedDocuments");
      // 💡 วิธีทางเลือก: แก้ไข Query เพื่อหลีกเลี่ยง Composite Index
      // 1. ดึงข้อมูลโดยกรอง (where) จาก status เท่านั้น
      const q = query(docsRef, where("status", "==", "pending_approval"));
      const querySnapshot = await getDocs(q);
      let docsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as StampedDocument[];

      // 2. นำข้อมูลที่ได้มาจัดเรียง (sort) บน Client-side ด้วย JavaScript
      // โดยเรียงตาม createdAt จากใหม่ไปเก่า (descending)
      docsData.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

      setDocuments(docsData);

    } catch (error) {
      // 💡 ปรับปรุง: แสดง error ที่ได้รับจาก Firebase โดยตรงใน console
      // ซึ่งมักจะมีลิงก์สำหรับสร้าง Index ที่ขาดไปแนบมาด้วย
      console.error(
        "Firebase query failed. This often means a composite index is missing. Check the error message below for a link to create it:", error
      );
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลเอกสารได้', background: '#2a2b2f', color: '#ffffff' });
    } finally {
      setIsLoading(false);
    }
  };

  // 📌 เพิ่ม: ฟังก์ชันสำหรับส่ง LINE Notification
  const sendAssignmentNotification = async (
    department: 'academic' | 'general' | 'budget' | 'personnel',
    docDetails: { subject: string; receiveNo: string; urgency?: 'normal' | 'urgent' | 'very_urgent' | 'most_urgent'; comment?: string; pdfUrl: string; qrCodeUrl?: string; dueDate?: Timestamp; }
  ) => {
    if (!schoolId || !schoolInfo) return;

    try {
        const lineOASettings = schoolInfo.lineOASettings || {};
        
        // 1. Define the order of preference for configs
        const configPriority: ('academic' | 'general' | 'budget' | 'personnel')[] = [
            department, // Try the specific department first
            'general',  // Fallback to general
            'academic', // Fallback to others if needed
            'budget',
            'personnel'
        ];

        let validConfig = null;

        // 2. Find the first valid config in the priority list
        for (const deptKey of [...new Set(configPriority)]) { // Use Set to avoid duplicates
            const config = lineOASettings[deptKey];
            const isEnabled = config?.enableNotification === undefined ? true : config.enableNotification;
            if (config && config.lineChannelAccessToken && isEnabled) {
                validConfig = config;
                console.log(`Notification will be sent using config from department: "${deptKey}"`);
                break; // Found a valid config, stop searching
            }
        }

        if (!validConfig) {
            console.warn(`Notification skipped: No valid & enabled LINE OA config found for department "${department}" or any fallback.`);
            return;
        }

        const { lineChannelAccessToken } = validConfig;

        // --- New Flex Message Design ---
        const getUrgencyInfo = (urgency: typeof docDetails.urgency) => {
            switch (urgency) {
                case 'urgent': return { text: 'ด่วน', color: '#2563EB' }; // blue-600
                case 'very_urgent': return { text: 'ด่วนมาก', color: '#D97706' }; // amber-600
                case 'most_urgent': return { text: 'ด่วนที่สุด', color: '#DC2626' }; // red-600
                default: return { text: 'ปกติ', color: '#666666' };
            }
        };

        const urgencyInfo = getUrgencyInfo(docDetails.urgency);
        const assignmentDate = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
        const directorFullName = `${schoolInfo.directorPrefix || ''}${schoolInfo.directorName || 'ผู้อำนวยการ'}`.trim();
        const dueDateText = docDetails.dueDate 
            ? docDetails.dueDate.toDate().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;

        const flexMessage = {
            type: "flex",
            altText: `แจ้งเตือนงานใหม่: ${docDetails.subject}`,
            contents: {
                type: "bubble",
                size: "giga",
                header: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "box",
                            layout: "horizontal",
                            contents: [
                                {
                                    type: "image",
                                    url: schoolInfo.logoUrl || "https://storage.googleapis.com/proud-of-me-366309.appspot.com/school-logo.png",
                                    size: "xs",
                                    aspectMode: "cover",
                                    flex: 1,
                                    aspectRatio: "1:1",
                                    gravity: "center"
                                },
                                {
                                    type: "box",
                                    layout: "vertical",
                                    contents: [
                                        { type: "text", text: "แจ้งเตือนเอกสารเข้า", weight: "bold", size: "xl", color: "#FFFFFF" },
                                        { type: "text", text: schoolInfo.schoolName || "โรงเรียน", size: "sm", color: "#FFFFFFCC" }
                                    ],
                                    flex: 4,
                                    margin: "md"
                                }
                            ]
                        }
                    ],
                    paddingAll: "20px",
                    backgroundColor: "#0D47A1" // Dark Blue
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        { type: "text", text: "เรื่อง", size: "sm", color: "#AAAAAA" },
                        { type: "text", text: docDetails.subject, weight: "bold", size: "xl", margin: "md", wrap: true },
                        { type: "separator", margin: "xl" },
                        {
                            type: "box",
                            layout: "vertical",
                            margin: "lg",
                            spacing: "sm",
                            contents: [
                                {
                                    type: "box", layout: "horizontal", contents: [
                                        { type: "box", layout: "vertical", contents: [{ type: "text", text: "เลขรับ", size: "sm", color: "#AAAAAA" }, { type: "text", text: docDetails.receiveNo, wrap: true, color: "#666666", size: "sm" }] },
                                        { type: "box", layout: "vertical", contents: [{ type: "text", text: "ความเร่งด่วน", size: "sm", color: "#AAAAAA" }, { type: "text", text: urgencyInfo.text, wrap: true, color: urgencyInfo.color, size: "sm", weight: "bold" }] }
                                    ]
                                },
                                {
                                    type: "box", layout: "horizontal", contents: [
                                        { type: "box", layout: "vertical", contents: [{ type: "text", text: "มอบหมายโดย", size: "sm", color: "#AAAAAA" }, { type: "text", text: directorFullName, wrap: true, color: "#666666", size: "sm" }] },
                                        { type: "box", layout: "vertical", contents: [{ type: "text", text: "วันที่มอบหมาย", size: "sm", color: "#AAAAAA" }, { type: "text", text: assignmentDate, wrap: true, color: "#666666", size: "sm" }] }
                                    ]
                                },
                                ...(dueDateText ? [{
                                    type: "box", layout: "horizontal", contents: [
                                        { type: "box", layout: "vertical", contents: [{ type: "text", text: "กำหนดส่ง (ภายใน)", size: "sm", color: "#AAAAAA" }, { type: "text", text: dueDateText, wrap: true, color: "#D32F2F", size: "sm", weight: "bold" }] }
                                    ]
                                }] : [])
                            ]
                        },
                        ...(docDetails.comment ? [{
                            type: "box",
                            layout: "vertical",
                            margin: "lg",
                            contents: [
                                { type: "separator", margin: "lg" },
                                {
                                    type: "box",
                                    layout: "vertical",
                                    margin: "lg",
                                    contents: [
                                        { type: "text", text: "ข้อสั่งการ:", weight: "bold", size: "md", color: "#1E88E5" },
                                        { type: "text", text: docDetails.comment, wrap: true, size: "sm", color: "#666666", margin: "md" }
                                    ]
                                }
                            ],
                        }] : [])
                    ]
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    spacing: "sm",
                    contents: [
                        {
                            type: "button",
                            action: { type: "uri", label: "เปิดเอกสาร", uri: docDetails.pdfUrl },
                            style: "primary",
                            color: "#1E88E5", // Lighter Blue
                            height: "sm",
                        },
                        ...(docDetails.qrCodeUrl ? [{
                            type: "button",
                            action: { type: "uri", label: "เปิดลิงก์ต้นฉบับ (QR)", uri: docDetails.qrCodeUrl },
                            style: "secondary",
                            color: "#905CFF",
                            height: "sm",
                            margin: "sm"
                        }] : [])
                    ],
                    flex: 0
                }
            }
        };

        // 3. Send notification (Broadcast to the teacher's/department's OA)
        const targetUrl = "https://api.line.me/v2/bot/message/broadcast";
        const bodyPayload = { messages: [flexMessage] };
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const url = isLocalhost ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` : targetUrl;

        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${lineChannelAccessToken}` },
            body: JSON.stringify(bodyPayload)
        });

    } catch (error) {
        console.error("Error in sendAssignmentNotification:", error);
    }
  };

  useEffect(() => {
    const fetchTeachers = async () => {
      if (!schoolId) return;
      try {
        const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
        const q = query(teachersRef);
        const querySnapshot = await getDocs(q);
        const teacherList = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            displayName: `${data.title || ''}${data.firstName || ''} ${data.lastName || ''}`,
            email: data.email,
            uid: data.uid || ''
          };
        });
        // เรียงลำดับรายชื่อ ก-ฮ
        teacherList.sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'));
        console.log(`Fetched ${teacherList.length} teachers`);
        setTeachers(teacherList);
      } catch (error) {
        console.error("Error fetching teachers:", error);
      }
    };
    fetchTeachers();
  }, [schoolId]);

  useEffect(() => {
    if (schoolId) {
      fetchDocuments();
    }
  }, [schoolId]);

  // 📌 Effect: โหลดลายเซ็นที่บันทึกไว้
  useEffect(() => {
    const fetchSavedSignatures = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(firestore, "users", auth.currentUser.uid));
        if (userDoc.exists() && userDoc.data().savedSignatures) {
          setSavedSignatures(userDoc.data().savedSignatures);
        }
      }
    };
    fetchSavedSignatures();
  }, []);

  // 📌 Effect สำหรับจัดการ Canvas ลายเซ็นใน Modal ใหม่
  useEffect(() => {
    if (isAssignmentModalOpen && signaturePadRef.current) {
      const canvas = signaturePadRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // ปรับขนาด Canvas ให้ตรงกับการแสดงผล
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      // วาดลายเซ็นเดิม (ถ้ามี)
      if (assignmentForm.signature) {
        const img = new Image();
        img.src = assignmentForm.signature;
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }

      // ตั้งค่าเส้น
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1E40AF';
    }
  }, [isAssignmentModalOpen]);

  // 📌 ฟังก์ชันวาดลายเซ็น (React Event Handlers)
  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = signaturePadRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    } else {
        return { x: 0, y: 0 };
    }
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = signaturePadRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    const { x, y } = getPointerPos(e);
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = signaturePadRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getPointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = signaturePadRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.beginPath();
    }
  };

  const clearSignature = () => {
    const canvas = signaturePadRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        setAssignmentForm(prev => ({ ...prev, signature: '' }));
    }
  };

  // 📌 ฟังก์ชันจัดการลายเซ็นที่บันทึกไว้
  const handleSaveSignature = async () => {
    const canvas = signaturePadRef.current;
    if (!canvas || !auth.currentUser) return;
    
    // ตรวจสอบว่า canvas ว่างหรือไม่
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
        Swal.fire({ icon: 'warning', title: 'ว่างเปล่า', text: 'กรุณาเซ็นชื่อก่อนบันทึก', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, background: '#2a2b2f', color: '#fff' });
        return;
    }

    const signatureData = canvas.toDataURL();
    try {
      await updateDoc(doc(firestore, "users", auth.currentUser.uid), {
        savedSignatures: arrayUnion(signatureData)
      });
      setSavedSignatures(prev => [...prev, signatureData]);
      Swal.fire({ icon: 'success', title: 'บันทึกลายเซ็นแล้ว', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, background: '#2a2b2f', color: '#fff' });
    } catch (error) {
      console.error("Error saving signature:", error);
    }
  };

  const handleLoadSignature = (sig: string) => {
    const canvas = signaturePadRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = sig;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setAssignmentForm(prev => ({ ...prev, signature: sig }));
    };
  };

  const handleDeleteSignature = async (sig: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser) return;
    try {
        await updateDoc(doc(firestore, "users", auth.currentUser.uid), {
            savedSignatures: arrayRemove(sig)
        });
        setSavedSignatures(prev => prev.filter(s => s !== sig));
    } catch (error) {
        console.error("Error deleting signature:", error);
    }
  };

  const handleApprove = (doc: StampedDocument) => {
    // 💡 เพิ่ม: ตรวจสอบว่ามีข้อมูลที่รอดำเนินการสำหรับเอกสารนี้หรือไม่ เพื่อเติมฟอร์มล่วงหน้า
    const existingData = pendingAssignment?.docId === doc.id ? pendingAssignment.data : null;
    setTargetDoc(doc);
    
    setAssignmentForm({
      acknowledge: existingData?.acknowledge || false,
      proceed: existingData?.proceed || false,
      academic: existingData?.academic || false,
      personnel: existingData?.personnel || false,
      budget: existingData?.budget || false,
      general: existingData?.general || false,
      inform: existingData?.inform || false,
      informTeacher: existingData?.informTeacher || '',
      comment: existingData?.comment || '',
      signature: existingData?.signature || ''
    });

    setIsAssignmentModalOpen(true);
  };

  const handleConfirmAssignmentModal = () => {
    if (!targetDoc) return;

    // Validation
    if (!assignmentForm.acknowledge && !assignmentForm.proceed && !assignmentForm.inform && 
        !assignmentForm.academic && !assignmentForm.personnel && !assignmentForm.budget && !assignmentForm.general) {
      Swal.fire({ icon: 'warning', title: 'ยังไม่ได้เลือกการดำเนินการ', text: 'กรุณาเลือกการดำเนินการอย่างน้อย 1 รายการ', background: '#2a2b2f', color: '#ffffff' });
      return;
    }
    if (assignmentForm.inform && !assignmentForm.informTeacher) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาระบุชื่อผู้รับแจ้ง เนื่องจากคุณได้เลือก "แจ้งให้"', background: '#2a2b2f', color: '#ffffff' });
      return;
    }

    const canvas = signaturePadRef.current;
    if (!canvas) return;

    // Check blank canvas
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
         Swal.fire({ icon: 'warning', title: 'ยังไม่ได้ลงลายมือชื่อ', text: 'กรุณาวาดลายมือชื่อของผู้บริหาร', background: '#2a2b2f', color: '#ffffff' });
         return;
    }

    const finalData = {
        ...assignmentForm,
        signature: canvas.toDataURL()
    };
    
    //  เก็บข้อมูลการมอบหมายและ ID ของเอกสารไว้ใน state เพื่อรอการประทับตรา
    setPendingAssignment({ docId: targetDoc.id, data: finalData });

    // 💡 เข้าสู่โหมดการวางตำแหน่งตราประทับทันที
    if (targetDoc.previewImageUrl) {
      setAssignmentData(finalData);
      setCurrentDocument(targetDoc);
      setStampPosition({ x: ASSIGNMENT_STAMP_MARGIN, y: ASSIGNMENT_STAMP_MARGIN });
      setIsPositioning(true);
    } else {
      Swal.fire({ icon: 'error', title: 'รูปภาพตัวอย่างไม่พร้อมใช้งาน', text: 'ไม่พบรูปภาพตัวอย่างสำหรับเอกสารนี้', background: '#2a2b2f', color: '#ffffff' });
    }

    setIsAssignmentModalOpen(false);
    setTargetDoc(null);
  };
  
  // 📌 Draw the assignment stamp box
  const drawAssignmentStamp = (ctx: CanvasRenderingContext2D, x: number, y: number, data: any) => {
    const boxWidth = ASSIGNMENT_STAMP_WIDTH;
    const boxHeight = ASSIGNMENT_STAMP_HEIGHT;
    const padding = 15;

    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(x, y, boxWidth, boxHeight);

    ctx.strokeStyle = "#1E40AF"; // 💡 เปลี่ยนเป็นสีน้ำเงิน (Blue-700)
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.fillStyle = "#1C3D9A"; // 💡 เปลี่ยนเป็นสีน้ำเงินเข้ม (คล้ายกับ Blue-800)
    ctx.font = "bold 22px 'TH Sarabun New'";
    ctx.textAlign = "center";
    ctx.fillText("ความคิดเห็นของผู้บริหาร", x + boxWidth / 2, y + 30);
    
    ctx.textAlign = "left";
    ctx.fillStyle = "#000000";
    ctx.font = "20px 'TH Sarabun New'";
    
    let offsetY = y + 60;
    // Draw checkboxes
    const chkSize = 15;
    const col1 = x + padding;
    const rowHeight = 25;

    // --- ความคิดเห็น ---
    ctx.strokeRect(col1, offsetY - chkSize + 2, chkSize, chkSize);
    if (data.acknowledge) ctx.fillText("✓", col1 + 2, offsetY + 1);
    ctx.fillText("ทราบ", col1 + chkSize + 5, offsetY);
    offsetY += rowHeight;

    ctx.strokeRect(col1, offsetY - chkSize + 2, chkSize, chkSize);
    if (data.proceed) ctx.fillText("✓", col1 + 2, offsetY + 1);
    ctx.fillText("ดำเนินการ", col1 + chkSize + 5, offsetY);
    offsetY += rowHeight;

    // Inform
    ctx.strokeRect(col1, offsetY - chkSize + 2, chkSize, chkSize);
    if (data.inform) ctx.fillText("✓", col1 + 2, offsetY + 1);
    ctx.fillText(`แจ้งให้: ${data.inform ? data.informTeacher : '...................................'}`, col1 + chkSize + 5, offsetY, boxWidth - (padding * 2) - chkSize - 5);
    
    offsetY += rowHeight;

    if (data.comment) {
      ctx.fillText(`ข้อสั่งการ: ${data.comment}`, col1, offsetY, boxWidth - (padding * 2));
    } else {
      ctx.fillText(`ข้อสั่งการ: ........................................................`, col1, offsetY);
    }

    ctx.font = "18px 'TH Sarabun New'";
    ctx.textAlign = "center";
    const dateText = new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dateY = y + boxHeight - 15;
    ctx.fillText(dateText, x + boxWidth / 2, dateY);

    // Draw Signature and Date
    if (data.signatureImage) {
      // Calculate available space for signature to prevent overlapping
      const signatureTopLimit = offsetY + 10; // Below comment line
      const signatureBottomLimit = dateY - 25; // Above date line
      const maxSigHeight = Math.max(0, signatureBottomLimit - signatureTopLimit);
      const maxSigWidth = boxWidth - 40;

      let sigW = data.signatureImage.width * 0.65;
      let sigH = data.signatureImage.height * 0.65;
      const ratio = sigW / sigH;

      // Constrain dimensions to fit available space
      if (sigH > maxSigHeight) { sigH = maxSigHeight; sigW = sigH * ratio; }
      if (sigW > maxSigWidth) { sigW = maxSigWidth; sigH = sigW / ratio; }

      const signatureX = x + (boxWidth - sigW) / 2;
      const signatureY = signatureTopLimit + (maxSigHeight - sigH) / 2;
      ctx.drawImage(data.signatureImage, signatureX, signatureY, sigW, sigH);
    }
  };

  // 💡 ฟังก์ชันใหม่: เพื่อเข้าสู่โหมดการวางตำแหน่งตราประทับ
  const handleEnterPositioningMode = () => {
    if (!pendingAssignment) return;

    const docToStamp = documents.find(d => d.id === pendingAssignment.docId);
    if (!docToStamp) {
      Swal.fire({ icon: 'error', title: 'ไม่พบเอกสาร', text: 'ไม่พบเอกสารที่ต้องการประทับตรา', background: '#2a2b2f', color: '#ffffff' });
      setPendingAssignment(null);
      return;
    }
    if (!docToStamp.previewImageUrl) {
      Swal.fire({ icon: 'error', title: 'รูปภาพตัวอย่างไม่พร้อมใช้งาน', text: 'ไม่พบรูปภาพตัวอย่างสำหรับเอกสารนี้ กรุณาตรวจสอบเอกสารต้นฉบับ', background: '#2a2b2f', color: '#ffffff' });
      setPendingAssignment(null);
      return;
    }
    setAssignmentData(pendingAssignment.data);
    setCurrentDocument(docToStamp);
    setStampPosition({ x: ASSIGNMENT_STAMP_MARGIN, y: ASSIGNMENT_STAMP_MARGIN }); // รีเซ็ตตำแหน่งเริ่มต้นของตราประทับ (จะถูกปรับเป็นมุมล่างซ้ายอัตโนมัติเมื่อรู้ขนาดภาพจริง)
    setIsPositioning(true);
  };
  // 📌 Effects and handlers for stamp positioning (similar to GeneralAffairsPage)
  useEffect(() => {
    if (isPositioning && previewCanvasRef.current && currentDocument?.previewImageUrl) {
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext("2d")!;
      // 💡 ตรวจสอบว่ามี assignmentData ก่อนวาด
      if (assignmentData) {
        const img = new Image();
        img.crossOrigin = "anonymous"; // Important for cross-origin images
        img.src = currentDocument.previewImageUrl;
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // 💡 ตำแหน่งเริ่มต้น (มุมบนซ้าย) มักไปทับหัวเรื่อง/เนื้อหาเอกสาร — พอรู้ขนาดภาพจริงแล้ว
          // ให้ขยับกล่องไปมุมล่างซ้ายแทน ซึ่งเอกสารส่วนใหญ่เว้นที่ว่างไว้มากกว่า
          const isDefaultPosition = stampPosition.x === ASSIGNMENT_STAMP_MARGIN && stampPosition.y === ASSIGNMENT_STAMP_MARGIN;
          const drawX = stampPosition.x;
          const drawY = isDefaultPosition
            ? Math.max(ASSIGNMENT_STAMP_MARGIN, img.height - ASSIGNMENT_STAMP_HEIGHT - ASSIGNMENT_STAMP_MARGIN)
            : stampPosition.y;

          if (isDefaultPosition && drawY !== stampPosition.y) {
            setStampPosition({ x: drawX, y: drawY });
          }

          // Load signature image before drawing stamp
          const signatureImage = new Image();
          signatureImage.src = assignmentData.signature;
          signatureImage.onload = () => {
            const dataWithImage = { ...assignmentData, signatureImage };
            drawAssignmentStamp(ctx, drawX, drawY, dataWithImage);
          };
          signatureImage.onerror = () => drawAssignmentStamp(ctx, drawX, drawY, assignmentData); // Draw without signature on error

        };
        img.onerror = (err) => {
          console.error("Error loading preview image:", err);
          Swal.fire({ 
            icon: 'error', 
            title: 'โหลดรูปภาพไม่สำเร็จ', 
            text: 'ไม่สามารถโหลดรูปภาพตัวอย่างเอกสารได้ อาจเกิดจากปัญหา CORS ใน Firebase Storage กรุณาตรวจสอบการตั้งค่า', 
            background: '#2a2b2f', color: '#ffffff' 
          });
          setIsPositioning(false);
          setCurrentDocument(null);
          setAssignmentData(null);
          setPendingAssignment(null);
        };
      }
    }
  }, [isPositioning, stampPosition, currentDocument, assignmentData]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;    // Verhältnis der tatsächlichen Breite zur angezeigten Breite
    const scaleY = canvas.height / rect.height;  // Verhältnis der tatsächlichen Höhe zur angezeigten Höhe
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const boxWidth = 330; // ความกว้างของตราประทับ
    const boxHeight = 260; // ความสูงของตราประทับ

    if (mouseX >= stampPosition.x && mouseX <= stampPosition.x + boxWidth && mouseY >= stampPosition.y && mouseY <= stampPosition.y + boxHeight) { // ตรวจสอบการคลิกภายในขอบเขตของตราประทับ
      setIsDragging(true);
      setDragStart({ x: mouseX - stampPosition.x, y: mouseY - stampPosition.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;   // Verhältnis der tatsächlichen Breite zur angezeigten Breite
    const scaleY = canvas.height / rect.height; // Verhältnis der tatsächlichen Höhe zur angezeigten Höhe
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    setStampPosition({ x: mouseX - dragStart.x, y: mouseY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touchX = (e.touches[0].clientX - rect.left) * scaleX;
    const touchY = (e.touches[0].clientY - rect.top) * scaleY;

    const boxWidth = 330;
    const boxHeight = 260;

    if (touchX >= stampPosition.x && touchX <= stampPosition.x + boxWidth && touchY >= stampPosition.y && touchY <= stampPosition.y + boxHeight) {
      setIsDragging(true);
      setDragStart({ x: touchX - stampPosition.x, y: touchY - stampPosition.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touchX = (e.touches[0].clientX - rect.left) * scaleX;
    const touchY = (e.touches[0].clientY - rect.top) * scaleY;
    setStampPosition({ x: touchX - dragStart.x, y: touchY - dragStart.y });
  };

  const handleTouchEnd = () => setIsDragging(false);

  const handleConfirmAssignment = async () => {
    if (!currentDocument || !assignmentData || !schoolId) return;

    // 💡 เพิ่มการตรวจสอบ previewImageUrl ก่อนดำเนินการต่อ
    if (!currentDocument.previewImageUrl) {
      Swal.fire({ icon: 'error', title: 'ข้อมูลไม่สมบูรณ์', text: 'ไม่พบรูปภาพตัวอย่างเอกสารเพื่อประทับตรา', background: '#2a2b2f', color: '#ffffff' });
      setIsPositioning(false);
      return;
    }

    Swal.fire({
      title: 'กำลังอนุมัติและบันทึก...',
      text: 'กรุณารอสักครู่ ระบบกำลังประทับตราและอัปเดตข้อมูล',
      background: '#2a2b2f', color: '#ffffff', allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      // 1. Create the new stamped preview image
      const originalImage = new Image();
      originalImage.crossOrigin = "anonymous";
      originalImage.src = currentDocument.previewImageUrl; // ตอนนี้มั่นใจว่าไม่ใช่ null/undefined
      
      await new Promise<void>((resolve, reject) => {
        originalImage.onload = () => {
          // ตรวจสอบขนาดรูปภาพที่โหลดมา
          resolve();
        };
        originalImage.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
      ctx.drawImage(originalImage, 0, 0);

      // Load signature image to be drawn on the final canvas
      const signatureImage = new Image();
      signatureImage.src = assignmentData.signature;
      await new Promise(resolve => { signatureImage.onload = resolve; });
      const dataWithImage = { ...assignmentData, signatureImage };

      drawAssignmentStamp(ctx, stampPosition.x, stampPosition.y, dataWithImage);

      const newPreviewImageBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8)); // 💡 เปลี่ยนเป็น JPEG
      if (!newPreviewImageBlob) {
        throw new Error("ไม่สามารถสร้างรูปภาพตัวอย่างใหม่ได้ (canvas.toBlob failed)");
      }

      // 2. Upload the new preview image to Storage
      const newImageFileName = `page_1.jpeg`; // 💡 เปลี่ยนชื่อไฟล์เป็น page_1.jpeg
      const sanitizedReceiveNo = currentDocument.receiveNo.replace(/[^a-zA-Z0-9-]/g, '_');
      const documentFolder = `school-settings/${schoolId}/stampedDocuments/${sanitizedReceiveNo}`;
      const newImageStorageRef = ref(storage, `${documentFolder}/${newImageFileName}`);
      const uploadResult = await uploadBytes(newImageStorageRef, newPreviewImageBlob);
      const newPreviewImageUrl = await getDownloadURL(uploadResult.ref);

      // 💡 --- START: Re-create PDF from all page images ---
      const allPageImagesDataUrls: string[] = [];


      // Fetch pages 2 onwards from the stored image URLs
      if (currentDocument.imageUrls && currentDocument.imageUrls.length > 1) {
        const imageLoadPromises = currentDocument.imageUrls.slice(1).map(async (url) => {
          const freshUrl = await refreshFirebaseStorageUrl(url);
          const response = await fetch(freshUrl);
          const blob = await response.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        });
        const otherPagesDataUrls = await Promise.all(imageLoadPromises);
        allPageImagesDataUrls.push(...otherPagesDataUrls);
      }

      // Page 1 is the newly stamped director's page, add it to the beginning of the array
      allPageImagesDataUrls.unshift(canvas.toDataURL('image/jpeg', 0.8)); // 💡 เปลี่ยนเป็น JPEG


      // Create a new PDF document from all page images
      // 💡 สำคัญ: ต้องระบุ orientation ให้ตรงกับสัดส่วนภาพจริง (แนวนอน/แนวตั้ง) ทุกครั้ง —
      // ถ้าไม่ระบุ jsPDF จะ default เป็น "portrait" เสมอ และถ้าเจอภาพแนวนอน (กว้าง > สูง)
      // จะ "สลับ" ความกว้าง/สูงของหน้ากระดาษให้กลายเป็นแนวตั้งโดยอัตโนมัติ แต่ addImage ยังวาดภาพ
      // ด้วยขนาดแนวนอนเดิม ทำให้ภาพเข้าไม่เต็มหน้า เหลือพื้นที่ว่างด้านล่าง (เอกสารแสดงผลไม่ครบ)
      // hotfixes: ["px_scaling"] จำเป็นเมื่อใช้ unit "px" เช่นกัน — ไม่งั้น jsPDF คำนวณ scale factor ผิด
      const pdfOrientation: "l" | "p" = originalImage.width > originalImage.height ? "l" : "p";
      const newPdf = new jsPDF({
        unit: "px",
        format: [originalImage.width, originalImage.height],
        orientation: pdfOrientation,
        hotfixes: ["px_scaling"],
      });
      newPdf.deletePage(1); // Remove the default blank page

      for (let i = 0; i < allPageImagesDataUrls.length; i++) {
        newPdf.addPage([originalImage.width, originalImage.height], pdfOrientation);
        newPdf.addImage(allPageImagesDataUrls[i], "JPEG", 0, 0, originalImage.width, originalImage.height, undefined, 'MEDIUM'); // 💡 เปลี่ยนเป็น JPEG และเพิ่มการบีบอัด
      }

      const newPdfBlob = newPdf.output('blob');
      const newPdfFileName = `final-stamped-${Date.now()}-${currentDocument.receiveNo}.pdf`;
      const newPdfStorageRef = ref(storage, `school-settings/${schoolId}/stampedDocuments/${newPdfFileName}`);
      const newPdfUploadResult = await uploadBytes(newPdfStorageRef, newPdfBlob);
      const newPdfUrl = await getDownloadURL(newPdfUploadResult.ref);
      // 💡 --- END: Re-create PDF with Director's Stamp ---
      
      // 3. Update Firestore document with new data, new PDF URL, and remove old image URLs
      const docRef = doc(firestore, "school-settings", schoolId, "stampedDocuments", currentDocument.id);
      await updateDoc(docRef, {
        status: "approved",
        approvedAt: Timestamp.now(), // 💡 เพิ่ม/อัปเดต URL ของ PDF ที่สมบูรณ์แล้ว
        pdfUrl: newPdfUrl, // 💡 เพิ่ม/อัปเดต URL ของ PDF ที่สมบูรณ์แล้ว
        previewImageUrl: newPreviewImageUrl, // 💡 อัปเดต URL ของรูปภาพตัวอย่าง
        imageUrls: deleteField(), // 💡 ลบฟิลด์รูปภาพเดิมออกจาก Firestore เพื่อแทนที่ด้วย PDF
        pageCount: allPageImagesDataUrls.length, // 💡 อัปเดตจำนวนหน้าของ PDF
        assignments: {
          ...assignmentData,
          assignee: assignmentData.inform ? assignmentData.informTeacher : "",
          signature: assignmentData.signature, // 💡 บันทึกลายเซ็น
          comment: assignmentData.comment || "",
        }
      });
      
      // 4. Clean up old files from Storage (optional but recommended for saving space)
      // Delete old PDF and old page images
      currentDocument.imageUrls?.forEach(async (imageUrl) => {
        await deleteObject(ref(storage, imageUrl)).catch((err: any) => console.warn("Could not delete old image:", err));
      });

      // 💡 --- START: Send Notifications ---
      const departmentsToNotify = {
          academic: assignmentData.academic,
          budget: assignmentData.budget,
          personnel: assignmentData.personnel,
          general: assignmentData.general,
      };

      //  แก้ไข: ตรวจสอบว่ามีการเลือกฝ่ายงานอย่างน้อยหนึ่งฝ่ายหรือไม่ ก่อนที่จะส่งการแจ้งเตือน
      const isAnyDepartmentSelected = Object.values(departmentsToNotify).some(shouldNotify => shouldNotify);

      if (isAnyDepartmentSelected) {
          const docDetailsForNotif = {
              subject: currentDocument.subject,
              receiveNo: currentDocument.receiveNo,
              urgency: currentDocument.urgency,
              comment: assignmentData.comment,
              qrCodeUrl: currentDocument.qrCodeUrl, // 📌 Pass the QR Code URL
              pdfUrl: newPdfUrl, // Use the newly generated PDF URL
              dueDate: currentDocument.dueDate, // 📌 ส่งข้อมูลกำหนดส่งไปด้วย
          };

          // 📌 แก้ไข: ส่งการแจ้งเตือนเพียงครั้งเดียว โดยใช้ฝ่าย 'general' เป็นตัวหลักในการหา Token
          // ฟังก์ชัน sendAssignmentNotification ภายในมี logic fallback เพื่อหา Token ที่ใช้งานได้อยู่แล้ว
          sendAssignmentNotification('general', docDetailsForNotif).catch(err => {
              console.error("Failed to send notification in background:", err);
          });
      }

      // 📌 แจ้งเตือนครู/บุคลากรที่ ผอ. เลือก "แจ้งให้" ทราบเป็นรายบุคคล — แจ้งทั้งในระบบ (กระดิ่ง) และ Push Notification
      // เหมือนกับที่ระบบสอนแทนทำ (SubstituteManagementPage.tsx)
      if (assignmentData.inform && assignmentData.informTeacher) {
        const targetTeacher = teachers.find(t => t.displayName === assignmentData.informTeacher);
        if (targetTeacher?.uid) {
          const informMessage = `คุณได้รับมอบหมายงานจาก ผอ. เรื่อง "${currentDocument.subject || currentDocument.receiveNo}"${assignmentData.comment ? ` — ข้อสั่งการ: ${assignmentData.comment}` : ''}`;
          const informLink = `/director/assigned-work?id=${currentDocument.id}`;
          try {
            const informNotiRef = await addDoc(collection(firestore, "school-settings", schoolId, "notifications"), {
              userId: targetTeacher.uid,
              message: informMessage,
              createdAt: Timestamp.now(),
              isRead: false,
              link: informLink,
            });

            const functions = getFunctions();
            const processPushNotification = httpsCallable(functions, "processPushNotification");
            await processPushNotification({
              userId: targetTeacher.uid,
              message: informMessage,
              link: informLink,
              source: "general_affairs",
              schoolId: schoolId,
              notificationId: informNotiRef.id,
            });
            console.log("✅ ส่งแจ้งเตือนงานมอบหมายถึงครูรายบุคคลสำเร็จ");
          } catch (notifyErr) {
            console.error("Error sending inform notification:", notifyErr);
          }
        } else {
          console.warn(`ไม่พบ uid ของครู "${assignmentData.informTeacher}" — ข้ามการแจ้งเตือนรายบุคคล`);
        }
      }
      // 💡 --- END: Send Notifications ---

      Swal.fire({ icon: 'success', title: 'อนุมัติและมอบหมายสำเร็จ!', text: 'เอกสารได้รับการอนุมัติและส่งต่อไปยังผู้รับผิดชอบแล้ว', background: '#2a2b2f', color: '#ffffff' });
      fetchDocuments(); // 💡 เรียกข้อมูลใหม่เพื่ออัปเดต UI
    } catch (error: any) { // 💡 Catch error as 'any' to access error.message
      console.error("Error approving document:", error);
      let errorMessage = 'ไม่สามารถอนุมัติเอกสารได้';
      if (error.message && error.message.includes('CORS')) {
        errorMessage = 'เกิดข้อผิดพลาดเกี่ยวกับ CORS กรุณาตรวจสอบการตั้งค่า Firebase Storage';
      }
      
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: errorMessage, background: '#2a2b2f', color: '#ffffff' });
    } finally {
      // 5. Reset state regardless of success or failure
      setIsPositioning(false);
      setCurrentDocument(null);
      setAssignmentData(null);
      setPendingAssignment(null); // 💡 เพิ่มการเคลียร์ pendingAssignment
    }
  };

  // 💡 ฟังก์ชันสำหรับเปิด Image Viewer
  const handleViewImages = async (doc: StampedDocument) => {
    if (doc.imageUrls && doc.imageUrls.length > 0) {
      setImagesToView(doc.imageUrls);
      setQrCodesToView(groupQrCodesByPage(doc.qrCodeUrls));
      setIsImageViewerOpen(true);
      setIsRefreshingImages(true);
      try {
        const refreshedUrls = await Promise.all(
          doc.imageUrls.map(url => refreshFirebaseStorageUrl(url))
        );
        setImagesToView(refreshedUrls);
      } catch (err) {
        console.warn('Could not refresh some image URLs:', err);
      } finally {
        setIsRefreshingImages(false);
      }
    } else {
      // กรณีไม่พบ imageUrls ให้เปิด PDF เป็น fallback
      if (doc.pdfUrl) {
        Swal.fire({
          icon: 'info',
          title: 'ไม่พบรูปภาพตัวอย่าง',
          text: 'ระบบไม่พบชุดรูปภาพของเอกสารนี้ จะทำการเปิดไฟล์ PDF ต้นฉบับแทน',
          background: '#2a2b2f', color: '#ffffff',
          didClose: () => window.open(doc.pdfUrl, '_blank')
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบเอกสาร',
          text: 'ไม่พบรูปภาพตัวอย่างและไฟล์ PDF ต้นฉบับ',
          background: '#2a2b2f', color: '#ffffff'
        });
      }
    }
  };

  const getUrgencyInfo = (urgency: StampedDocument['urgency']) => {
    switch (urgency) {
      case 'urgent':
        return { text: 'ด่วน', className: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800' };
      case 'very_urgent':
        return { text: 'ด่วนมาก', className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800' };
      case 'most_urgent':
        return { text: 'ด่วนที่สุด', className: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800' };
      default:
        return null; // For 'normal' or undefined
    }
  };

  // ค้นหา + แบ่งหน้า เหมือนหน้าทะเบียนหนังสือ/งานที่ได้รับมอบหมาย ให้สอดคล้องกันทั้งระบบงานธุรการ
  const filteredDocuments = documents.filter((d) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      (d.subject || "").toLowerCase().includes(term) ||
      (d.receiveNo || "").toLowerCase().includes(term) ||
      (d.createdBy || "").toLowerCase().includes(term)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / itemsPerPage));
  const pagedDocuments = filteredDocuments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  const renderContent = () => {
    if (isLoading) return <DirectorAssignmentPageSkeleton />;
    if (documents.length === 0) return <p className="text-center text-gray-500 dark:text-gray-500 py-8">ไม่มีหนังสือเสนอ</p>;
    if (filteredDocuments.length === 0) {
      return <p className="text-center text-gray-500 dark:text-gray-500 py-8">ไม่พบรายการที่ตรงกับคำค้นหา</p>;
    }

    return (
      <div className="space-y-4">
        {pagedDocuments.map((doc) => {
          const urgencyInfo = getUrgencyInfo(doc.urgency);
          // 📌 รวมลิงก์ QR Code ทั้งหมดของเอกสารนี้ (เอกสารเก่าที่ยังไม่มี qrCodeUrls จะ fallback ไปใช้ qrCodeUrl เดี่ยว)
          const qrLinks = (doc.qrCodeUrls && doc.qrCodeUrls.length > 0)
            ? doc.qrCodeUrls
            : (doc.qrCodeUrl ? [{ page: 0, url: doc.qrCodeUrl }] : []);
          return (
            <div key={doc.id} className="bg-gray-50 dark:bg-[#1e1f21] p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <p className="font-bold text-xl text-indigo-600 dark:text-indigo-400">{doc.subject}</p>
                  {urgencyInfo && (
                    <div className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider ${urgencyInfo.className}`}>
                      {urgencyInfo.text}
                    </div>
                  )}
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-200">เลขที่รับ: {doc.receiveNo}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  วันที่: {doc.date} เวลา: {doc.time} | ส่งโดย: {teachers.find(t => t.email === doc.createdBy)?.displayName || doc.createdBy}
                </p>
                {doc.dueDate && (
                  <p className="text-sm text-red-600 dark:text-red-400 font-semibold mt-1 flex items-center gap-2">
                    <FaCalendarAlt />
                    กำหนดส่ง: {doc.dueDate.toDate().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {qrLinks.length === 1 && (
                  <a
                    href={qrLinks[0].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    title="เปิดลิงก์จาก QR Code"
                  >
                    <FaQrcode />
                  </a>
                )}
                {qrLinks.length > 1 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setQrDropdownOpenFor(prev => prev === doc.id ? null : doc.id)}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                      title="เปิดลิงก์จาก QR Code"
                    >
                      <FaQrcode />
                      <span className="text-xs font-bold">({qrLinks.length})</span>
                    </button>
                    {qrDropdownOpenFor === doc.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setQrDropdownOpenFor(null)} />
                        <div className="absolute z-20 top-full mt-1.5 right-0 sm:left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]">
                          {qrLinks.map(({ page, url }, i) => (
                            <a
                              key={`${page}-${i}`}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setQrDropdownOpenFor(null)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <FaQrcode className="text-purple-500 shrink-0" size={12} />
                              <span className="truncate">ลิงก์ที่ {i + 1} (หน้า {page + 1})</span>
                            </a>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <button
                  onClick={() => handleViewImages(doc)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  <FaImages />
                  <span>ดูเอกสาร</span>
                </button>
                {/* 💡 เปลี่ยนปุ่มตามสถานะของ pendingAssignment */}
                {pendingAssignment?.docId === doc.id && doc.previewImageUrl ? (
                  <>
                    <button
                      onClick={() => handleApprove(doc)}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                      title="แก้ไขการมอบหมาย"
                    >
                      <FaPen />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      onClick={handleEnterPositioningMode}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors animate-pulse"
                    >
                      <FaCheckCircle />
                      <span>ประทับตราและมอบหมายงาน</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleApprove(doc)}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    <FaCheckCircle />
                    <span>เกษียณหนังสือ</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    );
  };

  // 💡 UI สำหรับ Image Viewer Modal
  if (isImageViewerOpen) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center z-50 p-4">
        <div className="w-full max-w-4xl flex justify-between items-center p-3 mb-3 bg-gray-900/90 rounded-xl border border-white/10 shadow-lg">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FaImages className="text-indigo-400" />
              <span>เอกสารทั้งหมด ({imagesToView.length} หน้า)</span>
            </h2>
            {isRefreshingImages && (
              <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                กำลังโหลดภาพที่คมชัด...
              </span>
            )}
          </div>
          <button
            onClick={() => setIsImageViewerOpen(false)}
            className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
            aria-label="Close image viewer"
          >
            <FaWindowClose size={22} className="text-red-500 hover:text-red-400" />
          </button>
        </div>
        {/* 💡 เรียงภาพต่อกันแบบต่อเนื่องเหมือนเลื่อนดูไฟล์ PDF จริง (ไม่มีกรอบ/ช่องว่างแยกแต่ละหน้า) */}
        <div className="flex-1 w-full max-w-4xl overflow-y-auto bg-gray-300 dark:bg-black/40 rounded-lg">
          {imagesToView.map((imgSrc, index) => (
            <div key={index} className="relative bg-white mb-1 last:mb-0">
              <div className="absolute top-3 left-3 bg-gray-900/75 text-white text-[11px] font-medium px-2.5 py-1 rounded-full backdrop-blur-sm z-10">
                หน้า {index + 1}/{imagesToView.length}
              </div>
              {(qrCodesToView[index]?.length || 0) > 0 && (
                <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
                  {qrCodesToView[index].map((qrUrl, qrIdx) => (
                    <a
                      key={qrIdx}
                      href={qrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-purple-600/90 hover:bg-purple-600 text-white text-[11px] font-medium px-2.5 py-1 rounded-full backdrop-blur-sm flex items-center gap-1.5 transition-colors"
                      title="เปิดลิงก์จาก QR Code ที่พบในหน้านี้"
                    >
                      <FaQrcode size={11} /> {qrCodesToView[index].length > 1 ? `QR ${qrIdx + 1}` : 'QR'}
                    </a>
                  ))}
                </div>
              )}
              <img
                src={imgSrc}
                alt={`Page ${index + 1}`}
                className="w-full h-auto block"
                onError={async (e) => {
                  try {
                    const fresh = await refreshFirebaseStorageUrl(imgSrc);
                    if (fresh && fresh !== imgSrc) {
                      (e.target as HTMLImageElement).src = fresh;
                    }
                  } catch (err) {
                    console.error('Failed on-the-fly refresh for page', index + 1, err);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isPositioning) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-50 p-4">
        <div className="w-full max-w-4xl text-center mb-4">
          <h2 className="text-2xl font-bold text-white">ปรับตำแหน่งตรามอบหมายงาน</h2>
          <p className="text-gray-300">คลิกค้างที่ตราประทับเพื่อลากไปยังตำแหน่งที่ต้องการ</p>
        </div>
        <canvas
          ref={previewCanvasRef}
          className="max-w-full max-h-[75vh] object-contain rounded-lg border-2 border-amber-500 cursor-grab touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} // ใช้ handleMouseUp เพื่อให้แน่ใจว่า isDragging เป็น false
          onMouseLeave={handleMouseUp} // ใช้ handleMouseUp เพื่อให้แน่ใจว่า isDragging เป็น false
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        <div className="mt-6 flex gap-4">
          <button onClick={() => {
            setIsPositioning(false);
            setCurrentDocument(null); // Clear current document on cancel
          }} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
            <FaTimes /><span>ยกเลิก</span>
          </button>
          <button onClick={handleConfirmAssignment} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
            <FaCheck /><span>ยืนยันและอนุมัติ</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300">
        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#111318]/95 backdrop-blur border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton to="/general-affairs/home" />
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">งานธุรการ · สำหรับผู้บริหาร</p>
              <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">เอกสารรอมอบหมาย (ผอ.)</h1>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 pt-6 pb-6">
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl overflow-hidden shadow-sm dark:shadow-none mb-6">
            <div className="bg-emerald-600 px-6 py-3 flex items-center gap-2">
              <FaInbox className="text-white/80" size={14} />
              <h2 className="text-sm font-black text-white">เอกสารรอมอบหมาย ({filteredDocuments.length} รายการ)</h2>
            </div>
            <div className="p-6 text-gray-900 dark:text-white">
              <p className="text-gray-500 dark:text-gray-400 mb-4">รายการเอกสารที่ถูกส่งมาเพื่อรอการประทับตรามอบหมาย</p>
              <div className="relative w-full sm:w-80">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                <input
                  type="text"
                  placeholder="ค้นหาเรื่อง เลขที่รับ หรือผู้ส่ง..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white text-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 text-gray-900 dark:text-white shadow-sm dark:shadow-none">
            {renderContent()}
          </div>

          {!isLoading && filteredDocuments.length > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-3 bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>แสดง</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>รายการ</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  หน้า {currentPage} จาก {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <FaChevronLeft size={11} />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <FaChevronRight size={11} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 💡 New Assignment Modal */}
      {isAssignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-50 dark:bg-[#18191a] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col animate-fade-in-up border border-gray-200 dark:border-gray-700 max-h-[90vh] sm:max-h-[95vh]">
            {/* Header */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-[#2a2b2f] rounded-t-2xl flex-shrink-0">
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                  <FaSignature size={20} />
                </div>
                บันทึกข้อความเกษียณหนังสือ
              </h3>
              <button
                onClick={() => setIsAssignmentModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              >
                <FaTimes size={20} />
              </button>
            </div>

            {/* Body */}
            <div 
              className="p-2.5 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-4 bg-gray-50 dark:bg-[#18191a] overflow-y-auto lg:overflow-hidden flex-1 min-h-0 scrollbar-hide"
            >

              {/* Left Column: Controls (Span 7) */}
              <div className="lg:col-span-7 flex flex-col gap-2 lg:gap-3 lg:h-full lg:overflow-y-auto pr-1 lg:pr-0 custom-scrollbar">

                {/* Group รวม: ความเห็น & การสั่งการ + มอบหมายครู + ข้อสั่งการเพิ่มเติม ในการ์ดเดียวกัน
                    (เดิมแยก 3 การ์ด แต่ละใบมี padding/border/shadow ของตัวเอง กินพื้นที่แนวตั้งซ้ำซ้อนบนมือถือ) */}
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-2.5 sm:p-5 shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col gap-1.5 sm:gap-3 lg:flex-1 lg:min-h-0">

                {/* Group 1: ความเห็น & การสั่งการ — รวมปุ่ม ทราบ/ดำเนินการ กับฝ่ายงานไว้ใน grid 3 คอลัมน์เดียวกัน
                    (เดิมแยกเป็นแถวปุ่ม 2 อัน + ตาราง 2x2 ของฝ่ายงาน รวม 3 แถว ตอนนี้เหลือแค่ 2 แถว ประหยัดพื้นที่ลง 1 แถวเต็ม ๆ) */}
                <div className="flex-shrink-0">
                  <h4 className="text-sm sm:text-base font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <FaCheckCircle className="text-indigo-500" size={18} /> ความเห็น & การสั่งการ
                  </h4>

                  <div className="grid grid-cols-4 gap-1 sm:gap-2">
                    {[
                      { key: 'acknowledge', label: 'ทราบ', color: 'indigo', icon: <FaEye />, span: 2 },
                      { key: 'proceed', label: 'ดำเนินการ', color: 'green', icon: <FaBolt />, span: 2 },
                      { key: 'academic', label: 'งานวิชาการ', color: 'blue', icon: <FaBook />, span: 1 },
                      { key: 'personnel', label: 'งานบุคคล', color: 'pink', icon: <FaUserTie />, span: 1 },
                      { key: 'budget', label: 'งานงบประมาณ', color: 'green', icon: <FaChartPie />, span: 1 },
                      { key: 'general', label: 'งานทั่วไป', color: 'orange', icon: <FaBuilding />, span: 1 }
                    ].map((item) => (
                      <div
                        key={item.key}
                        onClick={() => setAssignmentForm({...assignmentForm, [item.key]: !assignmentForm[item.key as keyof typeof assignmentForm]})}
                        style={{ gridColumn: `span ${item.span}` }}
                        className={`px-1.5 py-2 rounded-lg border-2 cursor-pointer transition-all duration-200 flex flex-row items-center justify-center gap-1 text-center group relative overflow-hidden
                          ${assignmentForm[item.key as keyof typeof assignmentForm]
                            ? `border-${item.color}-500 bg-${item.color}-50 dark:bg-${item.color}-900/20 text-${item.color}-700 dark:text-${item.color}-300 shadow-sm`
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                          }`}
                        title={item.label}
                      >
                        <div className={`text-xs shrink-0 transition-transform duration-200 ${assignmentForm[item.key as keyof typeof assignmentForm] ? 'scale-110' : 'scale-100 grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100'}`}>
                          {item.icon}
                        </div>
                        <span className="font-bold text-[11px] leading-none whitespace-nowrap truncate">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Group 2: มอบหมายครูผู้รับผิดชอบ — แยกเป็นส่วนเด่นชัด ให้เห็นง่ายชัดเจน ไม่ใช่ปุ่มเล็ก ๆ ซ่อนอยู่มุมเดิม
                    (ยังคงกรอบสี/ไฮไลต์ของตัวเองไว้ให้เด่น แค่เอา card เต็มรูปแบบ (shadow, พื้นหลังขาวซ้ำ) ออก
                    เพราะตอนนี้อยู่ในการ์ดรวมแล้ว) */}
                <div
                  onClick={() => {
                    setAssignmentForm(prev => ({...prev, inform: !prev.inform}));
                    setIsTeacherDropdownOpen(false);
                  }}
                  className={`rounded-xl p-2 sm:p-3 border-2 cursor-pointer transition-all duration-200 flex-shrink-0 ${
                    assignmentForm.inform
                      ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-900/10'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 hover:border-orange-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors flex-shrink-0 ${assignmentForm.inform ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 dark:border-gray-600 text-transparent'}`}>
                      <FaCheck size={14} />
                    </div>
                    <FaChalkboardTeacher className="text-orange-500 flex-shrink-0" size={24} />
                    <span className="font-bold text-base sm:text-lg text-gray-800 dark:text-gray-100">มอบหมายครูผู้รับผิดชอบ</span>
                  </div>

                  {/* Inform Select - Animated (สร้างดรอปดาวน์เองแทน <select> ธรรมดา เพื่อให้คุมสี
                      โหมดมืด/สว่างได้เอง — เมนูของ <select> บนมือถือมักใช้ธีมของระบบปฏิบัติการเสมอ
                      ไม่ใช่ธีมของเว็บ ทำให้บางเครื่องเห็นเมนูเป็นสีเข้มทั้งที่เว็บอยู่โหมดสว่าง) */}
                  <div
                    className={`transition-all duration-300 ease-in-out ${assignmentForm.inform ? 'max-h-[500px] overflow-visible mt-2.5 opacity-100' : 'max-h-0 overflow-hidden opacity-0'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsTeacherDropdownOpen(prev => !prev)}
                        className="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-base py-2.5 px-4 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                      >
                        <span className={`truncate text-left ${assignmentForm.informTeacher ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                          {assignmentForm.informTeacher || '-- เลือกรายชื่อครู/บุคลากร --'}
                        </span>
                        <FaChevronDown size={13} className={`text-gray-400 shrink-0 transition-transform duration-200 ${isTeacherDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isTeacherDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setIsTeacherDropdownOpen(false)} />
                          <div className="absolute z-20 top-full left-0 right-0 mt-1.5 max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1">
                            {teachers.map((t) => (
                              <button
                                type="button"
                                key={t.id}
                                onClick={() => {
                                  setAssignmentForm({...assignmentForm, informTeacher: t.displayName});
                                  setIsTeacherDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm sm:text-base transition-colors ${
                                  assignmentForm.informTeacher === t.displayName
                                    ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-semibold'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                              >
                                {t.displayName}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Group 3: ข้อสั่งการเพิ่มเติม */}
                <div className="flex flex-col lg:flex-1 lg:min-h-0 border-t border-gray-100 dark:border-gray-800 pt-2">
                  <h4 className="text-sm sm:text-base font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                    <FaBullhorn className="text-orange-500" size={18} /> ข้อสั่งการเพิ่มเติม
                  </h4>

                  {/* Comment Section */}
                  <div className="flex flex-col lg:flex-1 lg:min-h-0 relative">
                    <div className="relative h-12 lg:h-auto lg:flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                      <textarea
                        className="w-full h-full bg-transparent border-none focus:ring-0 p-3 text-base resize-none text-gray-800 dark:text-gray-100 placeholder-gray-400"
                        placeholder="ระบุข้อความ..."
                        value={assignmentForm.comment}
                        onChange={(e) => setAssignmentForm({...assignmentForm, comment: e.target.value})}
                      ></textarea>
                    </div>

                    {/* Quick Comments */}
                    <div className="mt-1.5">
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none mask-linear-fade">
                        {quickComments.map((text, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleQuickComment(text)}
                                className="flex-shrink-0 px-3 py-2 text-sm font-medium rounded-full bg-gray-100 hover:bg-indigo-50 text-gray-700 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 transition-all active:scale-95 whitespace-nowrap"
                            >
                                {text}
                            </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                </div>
              </div>

              {/* Right Column: Signature (Span 5) */}
              <div className="lg:col-span-5 flex flex-col lg:h-full lg:overflow-hidden">
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-2.5 sm:p-5 shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col lg:h-full">
                <div className="flex justify-between items-center mb-1.5">
                  <h4 className="text-sm sm:text-base font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <FaPen size={16} /> ลายมือชื่อ
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveSignature}
                      className="px-3 py-2 text-sm font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 rounded-lg transition-colors flex items-center gap-1.5"
                      title="บันทึกลายเซ็น"
                    >
                      <FaSave /> บันทึก
                    </button>
                    <button
                      onClick={clearSignature}
                      className="px-3 py-2 text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 rounded-lg transition-colors flex items-center gap-1.5"
                      title="ล้างลายเซ็น"
                    >
                      <FaEraser /> ล้าง
                    </button>
                  </div>
                </div>

                <div className="h-48 lg:h-auto lg:flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden touch-none relative lg:min-h-0 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors group cursor-crosshair">
                  <canvas
                    ref={signaturePadRef}
                    className="w-full h-full cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {!isDrawing && !assignmentForm.signature && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-gray-400 dark:text-gray-500 group-hover:text-indigo-400 transition-colors">
                      <FaPen className="text-3xl mb-2 opacity-50" />
                      <span className="text-base font-medium">เซ็นชื่อในกรอบนี้</span>
                    </div>
                  )}
                </div>

                {/* Saved Signatures List */}
                {savedSignatures.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">ลายเซ็นที่บันทึกไว้:</p>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                            {savedSignatures.map((sig, idx) => (
                                <div key={idx} className="relative group flex-shrink-0 cursor-pointer border border-gray-200 dark:border-gray-600 hover:border-indigo-500 rounded-lg bg-white dark:bg-gray-700 w-16 h-10 transition-all hover:shadow-sm" onClick={() => handleLoadSignature(sig)} title="ใช้ลายเซ็นนี้">
                                    <img src={sig} alt={`Sig ${idx}`} className="w-full h-full object-contain p-0.5" />
                                    <button 
                                        onClick={(e) => handleDeleteSignature(sig, e)}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center transition-opacity"
                                        title="ลบ"
                                    >
                                        <FaTimes size={8} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-white dark:bg-[#2a2b2f] rounded-b-none sm:rounded-b-2xl flex-shrink-0 pb-4 sm:pb-3">
              <button
                onClick={() => setIsAssignmentModalOpen(false)}
                className="px-5 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-base font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmAssignmentModal}
                className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-base font-bold shadow-lg shadow-indigo-500/30 transition-all transform hover:scale-105 flex items-center gap-2"
              >
                <FaCheck size={18} /> ยืนยันการมอบหมาย
              </button>
            </div>
          </div>
        </div>
      )}

    </MainLayout>
  );
};

export default DirectorAssignmentPage;