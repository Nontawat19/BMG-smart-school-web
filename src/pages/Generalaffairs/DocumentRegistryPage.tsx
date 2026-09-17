import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { ROLES } from "@/constants/roles";
import GeneralAffairsLayout from "@/layouts/GeneralAffairsLayout";
import BackButton from "@/components/Shared/BackButton";
import { firestore, auth, storage } from "@/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  FaInbox,
  FaPaperPlane,
  FaFileSignature,
  FaBullhorn,
  FaCertificate,
  FaStickyNote,
  FaPlus,
  FaSearch,
  FaTimes,
  FaSave,
  FaEdit,
  FaTrashAlt,
  FaFileImage,
  FaChevronLeft,
  FaChevronRight,
  FaListUl,
  FaFolder,
  FaFilePdf,
  FaFileAlt,
  FaAward,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaEye,
} from "react-icons/fa";
import Swal from "sweetalert2";

type TabKey = "received" | "sent" | "orders" | "announcements" | "certificates" | "memos" | "honorCertificates";

interface RegistryRow {
  id: string;
  no: string;
  subject: string;
  dateLabel: string;
  sortMs: number;
  extra?: string;
  status?: string;
  // ── ใช้เฉพาะทะเบียนหนังสือรับ (received) ──
  docRefNo?: string; // "ที่" — เลขที่หนังสือของหน่วยงานต้นทาง
  docDate?: string; // "ลงวันที่" — วันที่ที่ระบุในหนังสือ (ต่างจากวันที่ประทับตรารับ)
  from?: string;
  to?: string;
  department?: string; // "ผู้ปฏิบัติ"
  fileUrl?: string | null;
  // ── ใช้เฉพาะทะเบียนคำสั่ง (orders) ──
  rawDocId?: string;
  sourceCollection?: "orders" | "sent" | "received";
  signedBy?: string; // ผู้ลงนาม
  responsiblePerson?: string; // ผู้รับผิดชอบ
  orderType?: string; // ประเภทคำสั่ง
  notes?: string;
  // ── ใช้สำหรับทะเบียนหนังสือรับรอง (certificates) ──
  recipient?: string;
  certType?: string;
  purpose?: string;
  // ── ใช้สำหรับทะเบียนเลขเกียรติบัตร (honorCertificates) ──
  customId?: string;
  year?: string;
  startNo?: number | string;
  endNo?: number | string;
  activityName?: string;
  issuedDate?: string;
}

// รายชื่อกลุ่มบริหารเดียวกับที่ใช้กำหนดแผนก/สิทธิ์ทั่วทั้งระบบ (ดู TeacherListPage.tsx, AddUserPage.tsx)
// ใช้ชุดเดียวกันเพื่อให้ป้าย "ผู้ปฏิบัติ" ตรงกับแผนกที่มีอยู่จริงในระบบ ไม่ต้องคิดชื่อใหม่
const DEPARTMENT_OPTIONS = [
  "งานบริหารวิชาการ",
  "งานบริหารงบประมาณ",
  "งานบริหารบุคคล",
  "งานบริหารทั่วไป",
  "งานบริหารกิจการนักเรียน",
  "ฝ่ายบริหาร",
];

const DEPARTMENT_BADGE_STYLES: Record<string, string> = {
  "งานบริหารวิชาการ": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "งานบริหารงบประมาณ": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "งานบริหารบุคคล": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "งานบริหารทั่วไป": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "งานบริหารกิจการนักเรียน": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "ฝ่ายบริหาร": "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
};

const DepartmentBadge: React.FC<{ department?: string }> = ({ department }) => {
  if (!department) return <span className="text-gray-400 text-xs">-</span>;
  const style = DEPARTMENT_BADGE_STYLES[department] || "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${style}`}>
      {department.replace(/^งานบริหาร/, "")}
    </span>
  );
};

const URGENCY_LABELS: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};

const ORDER_TYPES = ["แต่งตั้ง", "มอบหมายงาน", "ปฏิบัติหน้าที่", "อื่นๆ"];
const ANNOUNCEMENT_CATEGORIES = ["ทั่วไป", "วิชาการ", "บุคคล", "การเงิน/พัสดุ", "อื่นๆ"];
const CERTIFICATE_TYPES = [
  "ปพ.7 (ใบรับรองผลการศึกษา)",
  "ปพ.7 (ใบรับรองสภาพการเป็นนักเรียน)",
  "หนังสือรับรองความประพฤติ",
  "หนังสือรับรองเงินเดือน",
  "หนังสือรับรองการปฏิบัติงาน/การเป็นบุคลากร",
  "อื่นๆ",
];

const TAB_CONFIG: Record<TabKey, { label: string; icon: React.ReactNode; color: string }> = {
  received: { label: "ทะเบียนหนังสือรับ", icon: <FaInbox />, color: "text-blue-600 dark:text-blue-400" },
  sent: { label: "ทะเบียนหนังสือส่ง", icon: <FaPaperPlane />, color: "text-emerald-600 dark:text-emerald-400" },
  orders: { label: "ทะเบียนคำสั่ง", icon: <FaFileSignature />, color: "text-orange-600 dark:text-orange-400" },
  announcements: { label: "ทะเบียนประกาศ", icon: <FaBullhorn />, color: "text-purple-600 dark:text-purple-400" },
  certificates: { label: "ทะเบียนหนังสือรับรอง", icon: <FaCertificate />, color: "text-amber-600 dark:text-amber-400" },
  memos: { label: "ทะเบียนบันทึกข้อความ", icon: <FaStickyNote />, color: "text-rose-600 dark:text-rose-400" },
  honorCertificates: { label: "ทะเบียนเกียรติบัตร", icon: <FaAward />, color: "text-yellow-600 dark:text-yellow-400" },
};

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const formatThaiFullDate = (v: any): string => {
  if (!v) return "-";
  let d: Date | null = null;
  if (v?.toDate && typeof v.toDate === "function") {
    d = v.toDate();
  } else if (v instanceof Date) {
    d = v;
  } else if (typeof v === "string") {
    if (THAI_MONTHS_FULL.some((m) => v.includes(m))) return v;
    const parts = v.split("T")[0].split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      d = new Date(year, month, day);
    } else {
      const parsed = new Date(v);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  } else if (typeof v === "number") {
    d = new Date(v);
  }
  if (!d || isNaN(d.getTime())) return typeof v === "string" ? v : "-";
  const day = d.getDate();
  const month = THAI_MONTHS_FULL[d.getMonth()];
  const year = d.getFullYear() > 2400 ? d.getFullYear() : d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
};

const formatOrderNo = (no: string): string => {
  if (!no) return "-";
  const parts = no.split("/");
  return parts[0].replace(/^คำสั่งที่\s*/, "").trim() || no;
};

const toMs = (v: any): number => (v?.toDate ? v.toDate().getTime() : 0);
const toDateLabel = (v: any): string =>
  v?.toDate ? v.toDate().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

type SortField =
  | "no"
  | "docRefNo"
  | "subject"
  | "date"
  | "signedBy"
  | "responsiblePerson"
  | "from"
  | "to"
  | "id"
  | "year"
  | "startNo"
  | "endNo";

const DocumentRegistryPage: React.FC = () => {
  const navigate = useNavigate();
  const { schoolId: reduxSchoolId, currentAcademicYear: reduxYear } = useSelector(
    (state: RootState) => state.schoolSettings
  );
  const { user } = useSelector((state: RootState) => state.auth);

  const userRoles = useMemo(() => {
    if (!user?.role) return [];
    return Array.isArray(user.role) ? user.role : [user.role];
  }, [user?.role]);

  // สิทธิ์สำหรับปุ่มแก้ไขและลบ: ให้เห็นเฉพาะงานธุรการและแอดมินเท่านั้น
  const isGeneralAffairsOrAdmin = useMemo(() => {
    if (!user) return false;

    // 1. แอดมิน: super_admin, school_admin, director
    const isAdmin = userRoles.some(
      (r) =>
        r === ROLES.SUPER_ADMIN ||
        r === ROLES.SCHOOL_ADMIN ||
        r === ROLES.DIRECTOR ||
        r === "super_admin" ||
        r === "school_admin" ||
        r === "admin"
    );
    if (isAdmin) return true;

    // 2. งานธุรการ: isGeneralAffairsOfficer หรือกลุ่มบริหารทั่วไป หรือ general_user
    const isGeneralAffairs =
      !!user.isGeneralAffairsOfficer ||
      userRoles.includes(ROLES.GENERAL_USER) ||
      userRoles.includes("general_user") ||
      user.department === "งานบริหารทั่วไป" ||
      (typeof user.department === "string" &&
        (user.department.includes("บริหารทั่วไป") || user.department.includes("ธุรการ")));

    return isGeneralAffairs;
  }, [user, userRoles]);

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolAbbreviation, setSchoolAbbreviation] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  const effectiveSchoolId = schoolId || reduxSchoolId;

  const [activeTab, setActiveTab] = useState<TabKey>("received");
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // ── ครูและบุคลากรสำหรับช่วยเลือกผู้รับผิดชอบ/ผู้ลงนาม ──
  const [teachers, setTeachers] = useState<{ id: string; displayName: string }[]>([]);

  // ── States สำหรับตารางทะเบียนคำสั่งและทะเบียนหนังสือส่ง (ตามภาพต้นฉบับ) ──
  const [filterFilesOnly, setFilterFilesOnly] = useState(false);
  // ควบคุมโหมดการแสดงผลของแต่ละหน้า/แท็บ ("search" = ไม่ดึงมาแสดงอัตโนมัติ ให้คนหาเอา, "all" = แสดงทั้งหมด)
  const [viewModeByTab, setViewModeByTab] = useState<Record<TabKey, "search" | "all">>({
    received: "search",
    sent: "search",
    orders: "search",
    announcements: "search",
    certificates: "search",
    memos: "search",
    honorCertificates: "search",
  });

  const setTabMode = (tab: TabKey, mode: "search" | "all") => {
    setViewModeByTab((prev) => ({ ...prev, [tab]: mode }));
  };
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortAsc, setSortAsc] = useState(false);

  // ── Modal ลงทะเบียนคำสั่ง / แก้ไขคำสั่ง (ภาพที่สอง) ──
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderModalMode, setOrderModalMode] = useState<"create" | "edit">("create");
  const [editingOrder, setEditingOrder] = useState<RegistryRow | null>(null);
  const [orderFormNo, setOrderFormNo] = useState("");
  const [orderFormSubject, setOrderFormSubject] = useState("");
  const [orderFormDocDate, setOrderFormDocDate] = useState("");
  const [orderFormSignedBy, setOrderFormSignedBy] = useState("");
  const [orderFormResponsiblePerson, setOrderFormResponsiblePerson] = useState("");
  const [orderFormOrderType, setOrderFormOrderType] = useState(ORDER_TYPES[0]);
  const [orderFormNotes, setOrderFormNotes] = useState("");
  const [orderExistingFileUrl, setOrderExistingFileUrl] = useState<string | null>(null);
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // ── Modal ลงทะเบียนหนังสือส่ง / แก้ไขหนังสือส่ง (ภาพที่สาม) ──
  const [isSentModalOpen, setIsSentModalOpen] = useState(false);
  const [sentModalMode, setSentModalMode] = useState<"create" | "edit">("create");
  const [editingSent, setEditingSent] = useState<RegistryRow | null>(null);
  const [sentFormNo, setSentFormNo] = useState("");
  const [sentFormDocRefNo, setSentFormDocRefNo] = useState("");
  const [sentFormDocDate, setSentFormDocDate] = useState("");
  const [sentFormFrom, setSentFormFrom] = useState("");
  const [sentFormTo, setSentFormTo] = useState("");
  const [sentFormSubject, setSentFormSubject] = useState("");
  const [sentFormUrgency, setSentFormUrgency] = useState("normal");
  const [sentFormNotes, setSentFormNotes] = useState("");
  const [sentExistingFileUrl, setSentExistingFileUrl] = useState<string | null>(null);
  const [sentFile, setSentFile] = useState<File | null>(null);
  const [isSavingSent, setIsSavingSent] = useState(false);

  // ── Modal ลงทะเบียนหนังสือรับ / แก้ไขหนังสือรับ (ภาพที่สี่) ──
  const [isReceivedModalOpen, setIsReceivedModalOpen] = useState(false);
  const [receivedModalMode, setReceivedModalMode] = useState<"create" | "edit">("create");
  const [editingReceived, setEditingReceived] = useState<RegistryRow | null>(null);
  const [receivedFormNo, setReceivedFormNo] = useState("");
  const [receivedFormDocRefNo, setReceivedFormDocRefNo] = useState("");
  const [receivedFormDocDate, setReceivedFormDocDate] = useState("");
  const [receivedFormFrom, setReceivedFormFrom] = useState("");
  const [receivedFormTo, setReceivedFormTo] = useState("");
  const [receivedFormSubject, setReceivedFormSubject] = useState("");
  const [receivedFormDepartment, setReceivedFormDepartment] = useState(DEPARTMENT_OPTIONS[0]);
  const [receivedFormNotes, setReceivedFormNotes] = useState("");
  const [receivedExistingFileUrl, setReceivedExistingFileUrl] = useState<string | null>(null);
  const [receivedFile, setReceivedFile] = useState<File | null>(null);
  const [isSavingReceived, setIsSavingReceived] = useState(false);

  // ── Modal ลงทะเบียนบันทึกข้อความ / แก้ไขบันทึกข้อความ ──
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [memoModalMode, setMemoModalMode] = useState<"create" | "edit">("create");
  const [editingMemo, setEditingMemo] = useState<RegistryRow | null>(null);
  const [memoFormNo, setMemoFormNo] = useState("");
  const [memoFormSubject, setMemoFormSubject] = useState("");
  const [memoFormDocDate, setMemoFormDocDate] = useState("");
  const [memoFormTo, setMemoFormTo] = useState("");
  const [memoFormFrom, setMemoFormFrom] = useState("");
  const [memoFormNotes, setMemoFormNotes] = useState("");
  const [memoExistingFileUrl, setMemoExistingFileUrl] = useState<string | null>(null);
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const [isSavingMemo, setIsSavingMemo] = useState(false);

  // ── Modal ลงทะเบียนเลขเกียรติบัตร / แก้ไขเลขเกียรติบัตร ──
  const [isHonorCertModalOpen, setIsHonorCertModalOpen] = useState(false);
  const [honorCertModalMode, setHonorCertModalMode] = useState<"create" | "edit">("create");
  const [editingHonorCert, setEditingHonorCert] = useState<RegistryRow | null>(null);
  const [honorCertFormId, setHonorCertFormId] = useState("");
  const [honorCertFormYear, setHonorCertFormYear] = useState("");
  const [honorCertFormStartNo, setHonorCertFormStartNo] = useState("");
  const [honorCertFormEndNo, setHonorCertFormEndNo] = useState("");
  const [honorCertFormAmount, setHonorCertFormAmount] = useState("");
  const [honorCertFormDocDate, setHonorCertFormDocDate] = useState("");
  const [honorCertFormActivity, setHonorCertFormActivity] = useState("");
  const [honorCertFormResponsible, setHonorCertFormResponsible] = useState("");
  const [honorCertFormNotes, setHonorCertFormNotes] = useState("");
  const [honorCertExistingFileUrl, setHonorCertExistingFileUrl] = useState<string | null>(null);
  const [honorCertFile, setHonorCertFile] = useState<File | null>(null);
  const [isSavingHonorCert, setIsSavingHonorCert] = useState(false);

  const [rows, setRows] = useState<Record<TabKey, RegistryRow[]>>({
    received: [],
    sent: [],
    orders: [],
    announcements: [],
    certificates: [],
    memos: [],
    honorCertificates: [],
  });

  // ── Create-entry modal (ส่ง / คำสั่ง / ประกาศ / หนังสือรับรอง) ──
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formSubject, setFormSubject] = useState("");
  const [formTo, setFormTo] = useState(""); // ถึง (ส่ง) / ผู้ลงนาม (คำสั่ง)
  const [formUrgency, setFormUrgency] = useState("normal");
  const [formOrderType, setFormOrderType] = useState(ORDER_TYPES[0]);
  const [formCategory, setFormCategory] = useState(ANNOUNCEMENT_CATEGORIES[0]);
  const [formCertType, setFormCertType] = useState(CERTIFICATE_TYPES[0]);
  const [formRecipient, setFormRecipient] = useState(""); // ออกให้แก่ (หนังสือรับรอง)
  const [formPurpose, setFormPurpose] = useState(""); // วัตถุประสงค์ (หนังสือรับรอง)
  const [formSignedBy, setFormSignedBy] = useState(""); // ผู้ลงนาม (หนังสือรับรอง)
  const [formNotes, setFormNotes] = useState("");

  // -----------------------------
  // โหลด schoolId / ปีการศึกษา / ตัวย่อโรงเรียน
  // -----------------------------
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      const userSnap = await getDoc(doc(firestore, "users", user.uid));
      const sId = userSnap.exists() ? userSnap.data().schoolId : null;
      if (sId) setSchoolId(sId);

      const targetSchoolId = sId || reduxSchoolId;
      if (!targetSchoolId) return;

      const schoolSnap = await getDoc(doc(firestore, "school-settings", targetSchoolId));
      if (schoolSnap.exists()) {
        const sData = schoolSnap.data();
        setSchoolAbbreviation(sData.schoolAbbreviation || "");
        setSchoolName(sData.schoolName || sData.name || "");
      }

      const calSnap = await getDoc(doc(firestore, "school-settings", targetSchoolId, "main_calendar", "default"));
      const year =
        calSnap.exists() && calSnap.data().academicYear
          ? calSnap.data().academicYear
          : (new Date().getFullYear() + 543).toString();
      setAcademicYear(year);
    });
    return () => unsubscribe();
  }, [reduxSchoolId]);

  // -----------------------------
  // โหลดรายชื่อครู/บุคลากรเพื่อช่วยเลือกผู้รับผิดชอบ
  // -----------------------------
  useEffect(() => {
    if (!effectiveSchoolId) return;
    const fetchTeachers = async () => {
      try {
        const tSnap = await getDocs(collection(firestore, "school-settings", effectiveSchoolId, "teachers"));
        const list = tSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              displayName:
                data.displayName ||
                `${data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim() ||
                data.name ||
                "ไม่ระบุชื่อ",
            };
          })
          .filter((t) => t.displayName && t.displayName !== "ไม่ระบุชื่อ");
        setTeachers(list);
      } catch (err) {
        console.error("Error fetching teachers:", err);
      }
    };
    fetchTeachers();
  }, [effectiveSchoolId]);

  // -----------------------------
  // โหลดข้อมูลทั้ง 5 ทะเบียน
  // -----------------------------
  useEffect(() => {
    if (!effectiveSchoolId) return;
    loadAll(effectiveSchoolId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSchoolId]);

  const loadAll = async (sId: string) => {
    setIsLoading(true);
    try {
      const [receivedRes, sentRes, ordersRes, announcementsRes, certificatesRes, memosRes, honorCertificatesRes] =
        await Promise.allSettled([
          loadReceived(sId),
          loadSent(sId),
          loadOrders(sId),
          loadAnnouncements(sId),
          loadCertificates(sId),
          loadMemos(sId),
          loadHonorCertificates(sId),
        ]);

      const received = receivedRes.status === "fulfilled" ? receivedRes.value : [];
      const sent = sentRes.status === "fulfilled" ? sentRes.value : [];
      const orders = ordersRes.status === "fulfilled" ? ordersRes.value : [];
      const announcements = announcementsRes.status === "fulfilled" ? announcementsRes.value : [];
      const certificates = certificatesRes.status === "fulfilled" ? certificatesRes.value : [];
      const memos = memosRes.status === "fulfilled" ? memosRes.value : [];
      const honorCertificates = honorCertificatesRes.status === "fulfilled" ? honorCertificatesRes.value : [];

      if (receivedRes.status === "rejected") console.warn("Could not load received documents:", receivedRes.reason);
      if (sentRes.status === "rejected") console.warn("Could not load sent documents:", sentRes.reason);
      if (ordersRes.status === "rejected") console.warn("Could not load orders:", ordersRes.reason);
      if (announcementsRes.status === "rejected") console.warn("Could not load announcements:", announcementsRes.reason);
      if (certificatesRes.status === "rejected") console.warn("Could not load certificates:", certificatesRes.reason);
      if (memosRes.status === "rejected") console.warn("Could not load memos:", memosRes.reason);
      if (honorCertificatesRes.status === "rejected") console.warn("Could not load honor certificates:", honorCertificatesRes.reason);

      setRows({ received, sent, orders, announcements, certificates, memos, honorCertificates });
    } catch (error) {
      console.error("Error loading document registry:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadReceived = async (sId: string): Promise<RegistryRow[]> => {
    const snap = await getDocs(
      query(collection(firestore, "school-settings", sId, "stampedDocuments"), orderBy("createdAt", "desc"), limit(300))
    );
    return snap.docs.map((d) => {
      const v = d.data();
      const rawDate = v.docDate || v.date;
      return {
        id: d.id,
        rawDocId: d.id,
        sourceCollection: "received" as const,
        no: v.receiveNo || "-",
        subject: v.subject || "-",
        dateLabel: rawDate ? formatThaiFullDate(rawDate) : formatThaiFullDate(v.createdAt),
        docDate: v.docDate || "",
        sortMs: toMs(v.createdAt || rawDate),
        extra: v.createdBy || "",
        status: v.status === "approved" ? "อนุมัติแล้ว" : "รอดำเนินการ",
        docRefNo: v.docRefNo || "-",
        from: v.from || "-",
        to: v.to || "-",
        department: v.department || "",
        fileUrl: v.previewImageUrl || (Array.isArray(v.imageUrls) ? v.imageUrls[0] : null) || v.fileUrl || null,
        notes: v.notes || "",
      };
    });
  };

  const loadSent = async (sId: string): Promise<RegistryRow[]> => {
    const snap = await getDocs(
      query(collection(firestore, "school-settings", sId, "sentDocuments"), orderBy("createdAt", "desc"), limit(300))
    );
    return snap.docs.map((d) => {
      const v = d.data();
      const rawDate = v.docDate || v.date;
      return {
        id: d.id,
        rawDocId: d.id,
        sourceCollection: "sent" as const,
        no: v.sendNo || "-",
        docRefNo: v.docRefNo || v.refNo || "-",
        subject: v.subject || "-",
        dateLabel: rawDate ? formatThaiFullDate(rawDate) : formatThaiFullDate(v.createdAt),
        docDate: v.docDate || "",
        sortMs: toMs(v.createdAt || rawDate),
        from: v.from || "-",
        to: v.to || "-",
        fileUrl: v.fileUrl || null,
        notes: v.notes || "",
        extra: v.createdBy || "",
        status: v.urgency ? URGENCY_LABELS[v.urgency] || v.urgency : undefined,
      };
    });
  };

  const loadOrders = async (sId: string): Promise<RegistryRow[]> => {
    const manualSnap = await getDocs(
      query(collection(firestore, "school-settings", sId, "orders"), orderBy("createdAt", "desc"), limit(300))
    );
    const manualRows: RegistryRow[] = manualSnap.docs.map((d) => {
      const v = d.data();
      return {
        id: `order-${d.id}`,
        rawDocId: d.id,
        sourceCollection: "orders" as const,
        no: v.orderNo || "-",
        subject: v.subject || "-",
        dateLabel: v.docDate ? formatThaiFullDate(v.docDate) : formatThaiFullDate(v.createdAt),
        docDate: v.docDate || "",
        sortMs: toMs(v.createdAt),
        signedBy: v.signedBy || "-",
        responsiblePerson: v.responsiblePerson || v.assignee || "-",
        orderType: v.orderType || "แต่งตั้ง",
        fileUrl: v.fileUrl || null,
        extra: [v.orderType, v.signedBy].filter(Boolean).join(" · "),
        notes: v.notes || "",
        year: v.academicYear || "",
      };
    });

    return manualRows.sort((a, b) => b.sortMs - a.sortMs);
  };

  const loadAnnouncements = async (sId: string): Promise<RegistryRow[]> => {
    const snap = await getDocs(
      query(collection(firestore, "school-settings", sId, "announcements"), orderBy("createdAt", "desc"), limit(300))
    );
    return snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        no: v.announcementNo || "-",
        subject: v.subject || "-",
        dateLabel: toDateLabel(v.createdAt),
        sortMs: toMs(v.createdAt),
        extra: v.category || "",
      };
    });
  };

  const loadMemos = async (sId: string): Promise<RegistryRow[]> => {
    let snap;
    try {
      snap = await getDocs(
        query(collection(firestore, "school-settings", sId, "memos"), orderBy("createdAt", "desc"), limit(300))
      );
    } catch (err) {
      console.warn("Memos query with orderBy failed, falling back to simple getDocs:", err);
      snap = await getDocs(collection(firestore, "school-settings", sId, "memos"));
    }
    return snap.docs
      .map((d) => {
        const v = d.data();
        const rawDate = v.docDate || v.date || v.createdAt;
        return {
          id: d.id,
          rawDocId: d.id,
          sourceCollection: "memos" as any,
          no: v.memoNo || "-",
          subject: v.subject || "-",
          dateLabel: formatThaiFullDate(rawDate),
          docDate: v.docDate || "",
          sortMs: toMs(v.createdAt) || (rawDate ? new Date(rawDate).getTime() : 0),
          from: v.from || "",
          to: v.to || "",
          notes: v.notes || "",
          fileUrl: v.fileUrl || null,
          extra: [v.to ? `เรียน: ${v.to}` : "", v.from ? `จาก: ${v.from}` : "", v.notes ? `หมายเหตุ: ${v.notes}` : ""]
            .filter(Boolean)
            .join(" · "),
        };
      })
      .sort((a, b) => b.sortMs - a.sortMs);
  };

  const loadCertificates = async (sId: string): Promise<RegistryRow[]> => {
    let snap;
    try {
      snap = await getDocs(
        query(collection(firestore, "school-settings", sId, "certificates"), orderBy("createdAt", "desc"), limit(300))
      );
    } catch (err) {
      console.warn("Certificates query with orderBy failed, falling back to simple getDocs:", err);
      snap = await getDocs(collection(firestore, "school-settings", sId, "certificates"));
    }
    return snap.docs
      .map((d) => {
        const v = d.data();
        return {
          id: d.id,
          no: v.certNo || "-",
          subject: v.subject || "-",
          dateLabel: formatThaiFullDate(v.createdAt || v.docDate || v.date),
          sortMs: toMs(v.createdAt),
          recipient: v.recipient || "",
          certType: v.certType || "",
          purpose: v.purpose || "",
          signedBy: v.signedBy || "",
          extra: [
            v.recipient ? `ผู้ขอ: ${v.recipient}` : "",
            v.certType,
            v.purpose ? `วัตถุประสงค์: ${v.purpose}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          status: v.signedBy ? `ผู้ลงนาม: ${v.signedBy}` : undefined,
          notes: v.notes || "",
        };
      })
      .sort((a, b) => b.sortMs - a.sortMs);
  };

  const loadHonorCertificates = async (sId: string): Promise<RegistryRow[]> => {
    let snap;
    try {
      snap = await getDocs(
        query(collection(firestore, "school-settings", sId, "honorCertificates"), orderBy("createdAt", "desc"), limit(300))
      );
    } catch (err) {
      console.warn("Honor certificates query with orderBy failed, falling back to simple getDocs:", err);
      snap = await getDocs(collection(firestore, "school-settings", sId, "honorCertificates"));
    }
    return snap.docs
      .map((d) => {
        const v = d.data();
        const rawDate = v.issuedDate || v.docDate || v.date || v.createdAt;
        const customId = v.customId || v.id || d.id;
        const year = v.academicYear || v.year || "2569";
        const startNo = v.startNo !== undefined && v.startNo !== null ? v.startNo : (v.startNumber ?? "");
        const endNo = v.endNo !== undefined && v.endNo !== null ? v.endNo : (v.endNumber ?? "");
        const activityName = v.activityName || v.subject || "-";
        const responsiblePerson = v.responsiblePerson || v.recipient || "-";
        return {
          id: d.id,
          rawDocId: d.id,
          sourceCollection: "honorCertificates" as any,
          customId: String(customId),
          year: String(year),
          startNo: startNo !== "" ? Number(startNo) : "-",
          endNo: endNo !== "" ? Number(endNo) : "-",
          activityName,
          responsiblePerson,
          no: startNo ? `${startNo} - ${endNo}` : (v.certNo || v.no || "-"),
          subject: activityName,
          dateLabel: formatThaiFullDate(rawDate),
          docDate: v.docDate || v.issuedDate || "",
          issuedDate: v.issuedDate || v.docDate || "",
          sortMs: toMs(v.createdAt) || (rawDate ? new Date(rawDate).getTime() : 0),
          notes: v.notes || "-",
          fileUrl: v.fileUrl || null,
          extra: `${startNo} - ${endNo}`,
        };
      })
      .sort((a, b) => {
        const numA = Number(a.startNo) || 0;
        const numB = Number(b.startNo) || 0;
        return numB - numA || b.sortMs - a.sortMs;
      });
  };

  // -----------------------------
  // ออกเลขทะเบียนถัดไป (รูปแบบเดียวกับ receiveNo ของ GeneralAffairsPage)
  // -----------------------------
  const getNextRunningNo = async (collectionName: string, fieldName: string): Promise<string> => {
    const sId = effectiveSchoolId;
    const yearToUse = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();
    if (!sId) return `0001/${yearToUse}`;
    const colRef = collection(firestore, "school-settings", sId, collectionName);
    let snap;
    try {
      snap = await getDocs(query(colRef, orderBy("createdAt", "desc"), limit(50)));
    } catch (err) {
      console.warn(`Query ${collectionName} with orderBy failed:`, err);
      try {
        snap = await getDocs(colRef);
      } catch (err2) {
        console.error(`Fallback getDocs ${collectionName} failed:`, err2);
        return `0001/${yearToUse}`;
      }
    }

    let maxNum = 0;
    if (snap && !snap.empty) {
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const noStr = String(data[fieldName] || "");
        const yearMatch = noStr.match(/\/(\d{4})/);
        const docYear = data.academicYear || (yearMatch ? yearMatch[1] : yearToUse);
        if (docYear === yearToUse) {
          const numMatch = noStr.match(/(\d+)(?:\/\d{4})?$/) || noStr.match(/(\d+)/);
          if (numMatch) {
            const n = parseInt(numMatch[1], 10);
            if (!isNaN(n) && n > maxNum) {
              maxNum = n;
            }
          }
        }
      });
    }

    const nextNumber = maxNum + 1;
    const formattedNum = String(nextNumber).padStart(4, "0");
    const prefix = schoolAbbreviation ? `${schoolAbbreviation} ` : "";
    return `${prefix}${formattedNum}/${yearToUse}`.trim();
  };

  const resetForm = () => {
    setFormSubject("");
    setFormTo("");
    setFormUrgency("normal");
    setFormOrderType(ORDER_TYPES[0]);
    setFormCategory(ANNOUNCEMENT_CATEGORIES[0]);
    setFormCertType(CERTIFICATE_TYPES[0]);
    setFormRecipient("");
    setFormPurpose("");
    setFormSignedBy("");
    setFormNotes("");
  };

  const openForm = () => {
    if (activeTab === "orders") {
      openCreateOrder();
      return;
    }
    if (activeTab === "sent") {
      openCreateSent();
      return;
    }
    if (activeTab === "received") {
      navigate("/general-affairs");
      return;
    }
    if (activeTab === "memos") {
      openCreateMemo();
      return;
    }
    if (activeTab === "honorCertificates") {
      openCreateHonorCert();
      return;
    }
    resetForm();
    if (activeTab === "certificates") {
      setFormSubject(CERTIFICATE_TYPES[0]);
    }
    setIsFormOpen(true);
  };

  // ── Handlers สำหรับทะเบียนคำสั่ง (ตามภาพที่สอง) ──
  const toggleExpandRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "no" ? false : true); // default new order first
    }
  };

  const openCreateOrder = () => {
    const yearToUse = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();
    // เลขคำสั่งต้องเริ่มนับ 1 ใหม่ทุกปีการศึกษา ตามระเบียบงานสารบรรณ ไม่ใช่รันต่อเนื่องข้ามปี
    const currentOrders = rows.orders.filter((r) => r.year === yearToUse);
    let nextNum = 1;
    if (currentOrders.length > 0) {
      const numbers = currentOrders.map((r) => {
        const m = r.no.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      });
      const maxNum = Math.max(...numbers, 0);
      nextNum = maxNum + 1;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    setOrderModalMode("create");
    setEditingOrder(null);
    setOrderFormNo(String(nextNum));
    setOrderFormSubject("");
    setOrderFormDocDate(todayStr);
    setOrderFormSignedBy(schoolAbbreviation ? `ผอ.${schoolAbbreviation}` : "ผอ.");
    setOrderFormResponsiblePerson("");
    setOrderFormOrderType(ORDER_TYPES[0]);
    setOrderFormNotes("");
    setOrderExistingFileUrl(null);
    setOrderFile(null);
    setIsOrderModalOpen(true);
  };

  const openEditOrder = (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin) return;
    setOrderModalMode("edit");
    setEditingOrder(row);
    setOrderFormNo(row.no || "");
    setOrderFormSubject(row.subject || "");
    setOrderFormDocDate(row.docDate || "");
    setOrderFormSignedBy(row.signedBy && row.signedBy !== "-" ? row.signedBy : "");
    setOrderFormResponsiblePerson(
      row.responsiblePerson && row.responsiblePerson !== "-" ? row.responsiblePerson : ""
    );
    setOrderFormOrderType(row.orderType || ORDER_TYPES[0]);
    setOrderFormNotes(row.notes || "");
    setOrderExistingFileUrl(row.fileUrl || null);
    setOrderFile(null);
    setIsOrderModalOpen(true);
  };

  const handleSaveOrderModal = async () => {
    if (!effectiveSchoolId) return;
    if (!orderFormSubject.trim()) {
      Swal.fire({ icon: "warning", title: "กรุณากรอกรายการ/เรื่องคำสั่ง", confirmButtonColor: "#13795b" });
      return;
    }

    setIsSavingOrder(true);
    try {
      let finalFileUrl = orderExistingFileUrl;
      if (orderFile) {
        const storageRef = ref(storage, `orders/${effectiveSchoolId}/${Date.now()}_${orderFile.name}`);
        await uploadBytes(storageRef, orderFile);
        finalFileUrl = await getDownloadURL(storageRef);
      }

      const yearToUse = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();

      if (orderModalMode === "create") {
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "orders"), {
          orderNo: orderFormNo.trim(),
          subject: orderFormSubject.trim(),
          docDate: orderFormDocDate || new Date().toISOString().split("T")[0],
          signedBy: orderFormSignedBy.trim() || "ผอ.",
          responsiblePerson: orderFormResponsiblePerson.trim() || "-",
          orderType: orderFormOrderType,
          fileUrl: finalFileUrl || null,
          notes: orderFormNotes.trim(),
          academicYear: yearToUse,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (editingOrder) {
        const rawId = editingOrder.rawDocId || editingOrder.id.replace(/^order-/, "");
        if (editingOrder.sourceCollection === "orders" || editingOrder.id.startsWith("order-")) {
          await updateDoc(doc(firestore, "school-settings", effectiveSchoolId, "orders", rawId), {
            orderNo: orderFormNo.trim(),
            subject: orderFormSubject.trim(),
            docDate: orderFormDocDate,
            signedBy: orderFormSignedBy.trim() || "ผอ.",
            responsiblePerson: orderFormResponsiblePerson.trim() || "-",
            orderType: orderFormOrderType,
            fileUrl: finalFileUrl || null,
            notes: orderFormNotes.trim(),
          });
        } else {
          Swal.fire({
            icon: "info",
            title: "รายการเชื่อมโยง",
            text: "รายการนี้เชื่อมโยงมาจากระบบไปราชการ/การลา สามารถแก้ไขรายละเอียดเพิ่มเติมได้ที่ระบบต้นทาง",
            confirmButtonColor: "#13795b",
          });
        }
      }

      Swal.fire({
        icon: "success",
        title: orderModalMode === "create" ? "ลงทะเบียนคำสั่งสำเร็จ" : "แก้ไขคำสั่งสำเร็จ",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      setIsOrderModalOpen(false);
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error saving order:", error);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDeleteOrder = async (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin || !effectiveSchoolId) return;
    const result = await Swal.fire({
      icon: "warning",
      title: "ยืนยันการลบคำสั่ง",
      text: `ต้องการลบคำสั่ง "${row.subject}" (เลขคำสั่ง: ${row.no}) ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;

    try {
      if (row.sourceCollection === "orders" || row.id.startsWith("order-")) {
        const rawId = row.rawDocId || row.id.replace(/^order-/, "");
        await deleteDoc(doc(firestore, "school-settings", effectiveSchoolId, "orders", rawId));
        Swal.fire({
          icon: "success",
          title: "ลบรายการแล้ว",
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 1500,
        });
        loadAll(effectiveSchoolId);
      } else {
        Swal.fire({
          icon: "info",
          title: "ไม่สามารถลบจากหน้านี้ได้",
          text: "รายการนี้เชื่อมโยงมาจากระบบไปราชการ/การลา กรุณาดำเนินการยกเลิกจากระบบต้นทาง",
          confirmButtonColor: "#13795b",
        });
      }
    } catch (error) {
      console.error("Error deleting order:", error);
      Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    }
  };

  // ── Handlers สำหรับทะเบียนหนังสือส่ง (ตามภาพที่สาม) ──
  const openCreateSent = () => {
    let nextNum = 1;
    let lastRefPrefix = "ศธ 04305.030";
    const currentSent = rows.sent;
    if (currentSent.length > 0) {
      const numbers = currentSent.map((r) => {
        const m = r.no.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      });
      const maxNum = Math.max(...numbers, 0);
      nextNum = maxNum + 1;
      const lastWithRef = currentSent.find((r) => r.docRefNo && r.docRefNo.includes("/"));
      if (lastWithRef && lastWithRef.docRefNo) {
        const parts = lastWithRef.docRefNo.split("/");
        if (parts.length > 1) {
          lastRefPrefix = parts.slice(0, -1).join("/");
        }
      }
    }
    const todayStr = new Date().toISOString().split("T")[0];
    const defaultFrom = schoolName
      ? (schoolName.startsWith("โรงเรียน") || schoolName.startsWith("รร.") ? schoolName : `โรงเรียน${schoolName}`)
      : (schoolAbbreviation ? `รร.${schoolAbbreviation}` : "โรงเรียนไชยวานวิทยาคม");

    setSentModalMode("create");
    setEditingSent(null);
    setSentFormNo(String(nextNum));
    setSentFormDocRefNo(`${lastRefPrefix}/${nextNum}`);
    setSentFormDocDate(todayStr);
    setSentFormFrom(defaultFrom);
    setSentFormTo("");
    setSentFormSubject("");
    setSentFormUrgency("normal");
    setSentFormNotes("");
    setSentExistingFileUrl(null);
    setSentFile(null);
    setIsSentModalOpen(true);
  };

  const openEditSent = (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin) return;
    setSentModalMode("edit");
    setEditingSent(row);
    setSentFormNo(row.no || "");
    setSentFormDocRefNo(row.docRefNo && row.docRefNo !== "-" ? row.docRefNo : "");
    setSentFormDocDate(row.docDate || "");
    setSentFormFrom(row.from && row.from !== "-" ? row.from : "");
    setSentFormTo(row.to && row.to !== "-" ? row.to : "");
    setSentFormSubject(row.subject || "");
    setSentFormUrgency(row.status === "ด่วนที่สุด" ? "most_urgent" : row.status === "ด่วนมาก" ? "very_urgent" : row.status === "ด่วน" ? "urgent" : "normal");
    setSentFormNotes(row.notes || "");
    setSentExistingFileUrl(row.fileUrl || null);
    setSentFile(null);
    setIsSentModalOpen(true);
  };

  const handleSaveSentModal = async () => {
    if (!effectiveSchoolId) return;
    if (!sentFormSubject.trim()) {
      Swal.fire({ icon: "warning", title: "กรุณากรอกเรื่องหนังสือส่ง", confirmButtonColor: "#13795b" });
      return;
    }

    setIsSavingSent(true);
    try {
      let finalFileUrl = sentExistingFileUrl;
      if (sentFile) {
        const storageRef = ref(storage, `sentDocuments/${effectiveSchoolId}/${Date.now()}_${sentFile.name}`);
        await uploadBytes(storageRef, sentFile);
        finalFileUrl = await getDownloadURL(storageRef);
      }

      const yearToUse = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();

      if (sentModalMode === "create") {
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "sentDocuments"), {
          sendNo: sentFormNo.trim(),
          docRefNo: sentFormDocRefNo.trim(),
          docDate: sentFormDocDate || new Date().toISOString().split("T")[0],
          from: sentFormFrom.trim() || "-",
          to: sentFormTo.trim() || "-",
          subject: sentFormSubject.trim(),
          urgency: sentFormUrgency,
          fileUrl: finalFileUrl || null,
          notes: sentFormNotes.trim(),
          academicYear: yearToUse,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (editingSent) {
        await updateDoc(doc(firestore, "school-settings", effectiveSchoolId, "sentDocuments", editingSent.id), {
          sendNo: sentFormNo.trim(),
          docRefNo: sentFormDocRefNo.trim(),
          docDate: sentFormDocDate,
          from: sentFormFrom.trim() || "-",
          to: sentFormTo.trim() || "-",
          subject: sentFormSubject.trim(),
          urgency: sentFormUrgency,
          fileUrl: finalFileUrl || null,
          notes: sentFormNotes.trim(),
        });
      }

      Swal.fire({
        icon: "success",
        title: sentModalMode === "create" ? "ลงทะเบียนหนังสือส่งสำเร็จ" : "แก้ไขหนังสือส่งสำเร็จ",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      setIsSentModalOpen(false);
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error saving sent document:", error);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    } finally {
      setIsSavingSent(false);
    }
  };

  const handleDeleteSent = async (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin || !effectiveSchoolId) return;
    const result = await Swal.fire({
      icon: "warning",
      title: "ยืนยันการลบหนังสือส่ง",
      text: `ต้องการลบหนังสือส่ง "${row.subject}" (เลขทะเบียนส่ง: ${row.no}) ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;

    try {
      await deleteDoc(doc(firestore, "school-settings", effectiveSchoolId, "sentDocuments", row.id));
      Swal.fire({
        icon: "success",
        title: "ลบหนังสือส่งแล้ว",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error deleting sent doc:", error);
      Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    }
  };

  const currentUserLabel = () => auth.currentUser?.displayName || auth.currentUser?.email || "ผู้ใช้งาน";

  const handleSaveEntry = async () => {
    if (!effectiveSchoolId) return;
    if (!formSubject.trim()) {
      Swal.fire({ icon: "warning", title: "กรุณากรอกเรื่อง", confirmButtonColor: "#4f46e5" });
      return;
    }

    const yearToUse = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();
    setIsSaving(true);
    try {
      if (activeTab === "sent") {
        const sendNo = await getNextRunningNo("sentDocuments", "sendNo");
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "sentDocuments"), {
          sendNo,
          subject: formSubject.trim(),
          to: formTo.trim(),
          urgency: formUrgency,
          notes: formNotes.trim(),
          academicYear: yearToUse,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (activeTab === "orders") {
        const orderNo = await getNextRunningNo("orders", "orderNo");
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "orders"), {
          orderNo,
          subject: formSubject.trim(),
          orderType: formOrderType,
          signedBy: formTo.trim(),
          notes: formNotes.trim(),
          academicYear: yearToUse,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (activeTab === "announcements") {
        const announcementNo = await getNextRunningNo("announcements", "announcementNo");
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "announcements"), {
          announcementNo,
          subject: formSubject.trim(),
          category: formCategory,
          notes: formNotes.trim(),
          academicYear: yearToUse,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (activeTab === "certificates") {
        const certNo = await getNextRunningNo("certificates", "certNo");
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "certificates"), {
          certNo,
          subject: formSubject.trim(),
          certType: formCertType,
          recipient: formRecipient.trim(),
          purpose: formPurpose.trim(),
          signedBy: formSignedBy.trim(),
          notes: formNotes.trim(),
          academicYear: yearToUse,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (activeTab === "memos") {
        const memoNo = await getNextRunningNo("memos", "memoNo");
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "memos"), {
          memoNo,
          subject: formSubject.trim(),
          to: formTo.trim(),
          notes: formNotes.trim(),
          academicYear: yearToUse,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      }

      Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      setIsFormOpen(false);
      resetForm();
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error saving registry entry:", error);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", confirmButtonColor: "#4f46e5" });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRows = useMemo(() => {
    let list = rows[activeTab] || [];
    if (
      (activeTab === "orders" ||
        activeTab === "sent" ||
        activeTab === "received" ||
        activeTab === "memos" ||
        activeTab === "honorCertificates") &&
      filterFilesOnly
    ) {
      list = list.filter((r) => !!r.fileUrl);
    }
    const term = searchTerm.trim().toLowerCase();

    // ถ้าไม่ได้พิมพ์ค้นหา และอยู่ในโหมดค้นหาเอา (viewModeByTab === "search")
    // จะไม่ดึงข้อมูลมาแสดงอัตโนมัติ (ให้คนหาเอาเหมือนกันทุกหน้า)
    if (!term && viewModeByTab[activeTab] === "search") {
      list = [];
    }

    if (term) {
      list = list.filter(
        (r) =>
          (r.no || "").toLowerCase().includes(term) ||
          (r.subject || "").toLowerCase().includes(term) ||
          (r.customId || "").toLowerCase().includes(term) ||
          (r.year || "").toLowerCase().includes(term) ||
          String(r.startNo ?? "").toLowerCase().includes(term) ||
          String(r.endNo ?? "").toLowerCase().includes(term) ||
          (r.activityName || "").toLowerCase().includes(term) ||
          (r.dateLabel || "").toLowerCase().includes(term) ||
          (r.notes || "").toLowerCase().includes(term) ||
          (r.docRefNo || "").toLowerCase().includes(term) ||
          (r.from || "").toLowerCase().includes(term) ||
          (r.to || "").toLowerCase().includes(term) ||
          (r.signedBy || "").toLowerCase().includes(term) ||
          (r.responsiblePerson || "").toLowerCase().includes(term) ||
          (r.recipient || "").toLowerCase().includes(term) ||
          (r.certType || "").toLowerCase().includes(term) ||
          (r.purpose || "").toLowerCase().includes(term) ||
          (r.extra || "").toLowerCase().includes(term)
      );
    }

    if (activeTab === "orders") {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortField === "no") {
          const numA = parseInt(a.no.match(/\d+/)?.[0] || "0", 10);
          const numB = parseInt(b.no.match(/\d+/)?.[0] || "0", 10);
          cmp = numA - numB;
        } else if (sortField === "subject") {
          cmp = a.subject.localeCompare(b.subject, "th");
        } else if (sortField === "signedBy") {
          cmp = (a.signedBy || "").localeCompare(b.signedBy || "", "th");
        } else if (sortField === "responsiblePerson") {
          cmp = (a.responsiblePerson || "").localeCompare(b.responsiblePerson || "", "th");
        } else {
          // date
          cmp = a.sortMs - b.sortMs;
        }
        return sortAsc ? cmp : -cmp;
      });
    } else if (activeTab === "sent") {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortField === "no") {
          const numA = parseInt(a.no.match(/\d+/)?.[0] || "0", 10);
          const numB = parseInt(b.no.match(/\d+/)?.[0] || "0", 10);
          cmp = numA - numB;
        } else if (sortField === "docRefNo") {
          cmp = (a.docRefNo || "").localeCompare(b.docRefNo || "", "th");
        } else if (sortField === "subject") {
          cmp = a.subject.localeCompare(b.subject, "th");
        } else if (sortField === "from") {
          cmp = (a.from || "").localeCompare(b.from || "", "th");
        } else if (sortField === "to") {
          cmp = (a.to || "").localeCompare(b.to || "", "th");
        } else {
          // date
          cmp = a.sortMs - b.sortMs;
        }
        return sortAsc ? cmp : -cmp;
      });
    } else if (activeTab === "received") {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortField === "no") {
          const numA = parseInt(a.no.match(/\d+/)?.[0] || "0", 10);
          const numB = parseInt(b.no.match(/\d+/)?.[0] || "0", 10);
          cmp = numA - numB;
        } else if (sortField === "docRefNo") {
          cmp = (a.docRefNo || "").localeCompare(b.docRefNo || "", "th");
        } else if (sortField === "subject") {
          cmp = a.subject.localeCompare(b.subject, "th");
        } else if (sortField === "from") {
          cmp = (a.from || "").localeCompare(b.from || "", "th");
        } else if (sortField === "to") {
          cmp = (a.to || "").localeCompare(b.to || "", "th");
        } else {
          // date
          cmp = a.sortMs - b.sortMs;
        }
        return sortAsc ? cmp : -cmp;
      });
    } else if (activeTab === "honorCertificates") {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortField === "id") {
          cmp = (a.customId || a.id).localeCompare(b.customId || b.id);
        } else if (sortField === "year") {
          cmp = (a.year || "").localeCompare(b.year || "");
        } else if (sortField === "startNo") {
          cmp = (Number(a.startNo) || 0) - (Number(b.startNo) || 0);
        } else if (sortField === "endNo") {
          cmp = (Number(a.endNo) || 0) - (Number(b.endNo) || 0);
        } else if (sortField === "subject") {
          cmp = (a.subject || "").localeCompare(b.subject || "", "th");
        } else if (sortField === "responsiblePerson") {
          cmp = (a.responsiblePerson || "").localeCompare(b.responsiblePerson || "", "th");
        } else {
          // date
          cmp = a.sortMs - b.sortMs;
        }
        return sortAsc ? cmp : -cmp;
      });
    }

    return list;
  }, [rows, activeTab, searchTerm, filterFilesOnly, sortField, sortAsc, viewModeByTab]);

  // รีเซ็ตกลับหน้า 1 ทุกครั้งที่เปลี่ยนแท็บ/ค้นหา/ขนาดหน้า ไม่งั้นอาจค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, pageSize, filterFilesOnly, viewModeByTab]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRows, currentPage, pageSize]
  );

  const canCreateInTab = true;

  // ── Handlers สำหรับทะเบียนหนังสือรับ (ตามภาพที่สี่) ──
  const openCreateReceived = () => {
    let nextNum = 1;
    const currentReceived = rows.received;
    if (currentReceived.length > 0) {
      const numbers = currentReceived.map((r) => {
        const m = r.no.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      });
      const maxNum = Math.max(...numbers, 0);
      nextNum = maxNum + 1;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    const defaultTo = schoolAbbreviation ? `ผอ. ร.ร. ${schoolAbbreviation}` : "ผอ.สถานศึกษา";

    setReceivedModalMode("create");
    setEditingReceived(null);
    setReceivedFormNo(String(nextNum));
    setReceivedFormDocRefNo("");
    setReceivedFormDocDate(todayStr);
    setReceivedFormFrom("");
    setReceivedFormTo(defaultTo);
    setReceivedFormSubject("");
    setReceivedFormDepartment(DEPARTMENT_OPTIONS[0]);
    setReceivedFormNotes("");
    setReceivedExistingFileUrl(null);
    setReceivedFile(null);
    setIsReceivedModalOpen(true);
  };

  const openEditReceived = (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin) return;
    setReceivedModalMode("edit");
    setEditingReceived(row);
    setReceivedFormNo(row.no || "");
    setReceivedFormDocRefNo(row.docRefNo && row.docRefNo !== "-" ? row.docRefNo : "");
    setReceivedFormDocDate(row.docDate || "");
    setReceivedFormFrom(row.from && row.from !== "-" ? row.from : "");
    setReceivedFormTo(row.to && row.to !== "-" ? row.to : "");
    setReceivedFormSubject(row.subject || "");
    setReceivedFormDepartment(row.department || DEPARTMENT_OPTIONS[0]);
    setReceivedFormNotes(row.notes || "");
    setReceivedExistingFileUrl(row.fileUrl || null);
    setReceivedFile(null);
    setIsReceivedModalOpen(true);
  };

  const handleSaveReceivedModal = async () => {
    if (!effectiveSchoolId) return;
    if (!receivedFormSubject.trim()) {
      Swal.fire({ icon: "warning", title: "กรุณากรอกเรื่องหนังสือรับ", confirmButtonColor: "#13795b" });
      return;
    }

    setIsSavingReceived(true);
    try {
      let finalFileUrl = receivedExistingFileUrl;
      if (receivedFile) {
        const storageRef = ref(storage, `stampedDocuments/${effectiveSchoolId}/${Date.now()}_${receivedFile.name}`);
        await uploadBytes(storageRef, receivedFile);
        finalFileUrl = await getDownloadURL(storageRef);
      }

      const yearToUse = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();

      if (receivedModalMode === "create") {
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "stampedDocuments"), {
          receiveNo: receivedFormNo.trim(),
          docRefNo: receivedFormDocRefNo.trim(),
          docDate: receivedFormDocDate || new Date().toISOString().split("T")[0],
          from: receivedFormFrom.trim() || "-",
          to: receivedFormTo.trim() || "-",
          subject: receivedFormSubject.trim(),
          department: receivedFormDepartment,
          fileUrl: finalFileUrl || null,
          previewImageUrl: finalFileUrl || null,
          notes: receivedFormNotes.trim(),
          academicYear: yearToUse,
          status: "approved",
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (editingReceived) {
        await updateDoc(doc(firestore, "school-settings", effectiveSchoolId, "stampedDocuments", editingReceived.id), {
          receiveNo: receivedFormNo.trim(),
          docRefNo: receivedFormDocRefNo.trim(),
          docDate: receivedFormDocDate,
          from: receivedFormFrom.trim() || "-",
          to: receivedFormTo.trim() || "-",
          subject: receivedFormSubject.trim(),
          department: receivedFormDepartment,
          fileUrl: finalFileUrl || null,
          previewImageUrl: finalFileUrl || null,
          notes: receivedFormNotes.trim(),
        });
      }

      Swal.fire({
        icon: "success",
        title: receivedModalMode === "create" ? "ลงทะเบียนหนังสือรับสำเร็จ" : "แก้ไขหนังสือรับสำเร็จ",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      setIsReceivedModalOpen(false);
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error saving received document:", error);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    } finally {
      setIsSavingReceived(false);
    }
  };

  const handleDeleteReceived = async (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin || !effectiveSchoolId) return;
    const result = await Swal.fire({
      icon: "warning",
      title: "ยืนยันการลบหนังสือรับ",
      text: `ต้องการลบหนังสือรับ "${row.subject}" (เลขทะเบียนรับ: ${row.no}) ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;

    try {
      await deleteDoc(doc(firestore, "school-settings", effectiveSchoolId, "stampedDocuments", row.id));
      Swal.fire({
        icon: "success",
        title: "ลบรายการแล้ว",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error deleting registry entry:", error);
      Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    }
  };

  // ── Handlers สำหรับทะเบียนบันทึกข้อความ ──
  const openCreateMemo = async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const nextNo = await getNextRunningNo("memos", "memoNo");
    setMemoModalMode("create");
    setEditingMemo(null);
    setMemoFormNo(nextNo);
    setMemoFormSubject("");
    setMemoFormDocDate(todayStr);
    setMemoFormTo("ผู้อำนวยการโรงเรียน");
    setMemoFormFrom(currentUserLabel());
    setMemoFormNotes("");
    setMemoExistingFileUrl(null);
    setMemoFile(null);
    setIsMemoModalOpen(true);
  };

  const openEditMemo = (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin) return;
    setMemoModalMode("edit");
    setEditingMemo(row);
    setMemoFormNo(row.no || "");
    setMemoFormSubject(row.subject || "");
    setMemoFormDocDate(row.docDate || "");
    setMemoFormTo(row.to || "");
    setMemoFormFrom(row.from || "");
    setMemoFormNotes(row.notes || "");
    setMemoExistingFileUrl(row.fileUrl || null);
    setMemoFile(null);
    setIsMemoModalOpen(true);
  };

  const handleSaveMemoModal = async () => {
    if (!effectiveSchoolId) return;
    if (!memoFormSubject.trim()) {
      Swal.fire({ icon: "warning", title: "กรุณากรอกเรื่องบันทึกข้อความ", confirmButtonColor: "#13795b" });
      return;
    }

    setIsSavingMemo(true);
    try {
      let finalFileUrl = memoExistingFileUrl;
      if (memoFile) {
        const storageRef = ref(storage, `memos/${effectiveSchoolId}/${Date.now()}_${memoFile.name}`);
        await uploadBytes(storageRef, memoFile);
        finalFileUrl = await getDownloadURL(storageRef);
      }

      const yearToUse = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();

      if (memoModalMode === "create") {
        await addDoc(collection(firestore, "school-settings", effectiveSchoolId, "memos"), {
          memoNo: memoFormNo.trim(),
          subject: memoFormSubject.trim(),
          docDate: memoFormDocDate || new Date().toISOString().split("T")[0],
          to: memoFormTo.trim() || "ผู้อำนวยการโรงเรียน",
          from: memoFormFrom.trim() || "-",
          notes: memoFormNotes.trim(),
          fileUrl: finalFileUrl || null,
          academicYear: yearToUse,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (editingMemo) {
        await updateDoc(doc(firestore, "school-settings", effectiveSchoolId, "memos", editingMemo.id), {
          memoNo: memoFormNo.trim(),
          subject: memoFormSubject.trim(),
          docDate: memoFormDocDate,
          to: memoFormTo.trim() || "ผู้อำนวยการโรงเรียน",
          from: memoFormFrom.trim() || "-",
          notes: memoFormNotes.trim(),
          fileUrl: finalFileUrl || null,
        });
      }

      Swal.fire({
        icon: "success",
        title: memoModalMode === "create" ? "ออกเลขบันทึกข้อความสำเร็จ" : "แก้ไขบันทึกข้อความสำเร็จ",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      setIsMemoModalOpen(false);
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error saving memo:", error);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    } finally {
      setIsSavingMemo(false);
    }
  };

  const handleDeleteMemo = async (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin || !effectiveSchoolId) return;
    const result = await Swal.fire({
      icon: "warning",
      title: "ยืนยันการลบบันทึกข้อความ",
      text: `ต้องการลบบันทึกข้อความ "${row.subject}" (เลขที่: ${row.no}) ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;

    try {
      await deleteDoc(doc(firestore, "school-settings", effectiveSchoolId, "memos", row.id));
      Swal.fire({
        icon: "success",
        title: "ลบบันทึกข้อความแล้ว",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error deleting memo:", error);
      Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    }
  };

  // ── Handlers สำหรับทะเบียนเลขเกียรติบัตร ──
  const openCreateHonorCert = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const defaultYear = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();
    const existingList = rows.honorCertificates || [];
    const maxEndNo = existingList.reduce((max, r) => {
      const n = Number(r.endNo) || 0;
      return n > max ? n : max;
    }, 0);
    const nextStart = maxEndNo > 0 ? maxEndNo + 1 : 1;

    setHonorCertModalMode("create");
    setEditingHonorCert(null);
    setHonorCertFormId(Date.now().toString());
    setHonorCertFormYear(defaultYear);
    setHonorCertFormStartNo(nextStart.toString());
    setHonorCertFormEndNo("");
    setHonorCertFormAmount("");
    setHonorCertFormDocDate(todayStr);
    setHonorCertFormActivity("");
    setHonorCertFormResponsible(currentUserLabel());
    setHonorCertFormNotes("");
    setHonorCertExistingFileUrl(null);
    setHonorCertFile(null);
    setIsHonorCertModalOpen(true);
  };

  const openEditHonorCert = (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin) return;
    const s = Number(row.startNo) || 0;
    const e = Number(row.endNo) || 0;
    const amount = e >= s && s > 0 ? (e - s + 1).toString() : "";

    setHonorCertModalMode("edit");
    setEditingHonorCert(row);
    setHonorCertFormId(row.customId || row.id);
    setHonorCertFormYear(row.year || academicYear || (new Date().getFullYear() + 543).toString());
    setHonorCertFormStartNo(row.startNo !== undefined && row.startNo !== "-" ? row.startNo.toString() : "");
    setHonorCertFormEndNo(row.endNo !== undefined && row.endNo !== "-" ? row.endNo.toString() : "");
    setHonorCertFormAmount(amount);
    setHonorCertFormDocDate(row.docDate || row.issuedDate || "");
    setHonorCertFormActivity(row.activityName || row.subject || "");
    setHonorCertFormResponsible(row.responsiblePerson || "");
    setHonorCertFormNotes(row.notes && row.notes !== "-" ? row.notes : "");
    setHonorCertExistingFileUrl(row.fileUrl || null);
    setHonorCertFile(null);
    setIsHonorCertModalOpen(true);
  };

  const handleStartNoChange = (val: string) => {
    setHonorCertFormStartNo(val);
    const start = parseInt(val, 10);
    const amt = parseInt(honorCertFormAmount, 10);
    if (!isNaN(start) && !isNaN(amt) && amt > 0) {
      setHonorCertFormEndNo((start + amt - 1).toString());
    } else if (!isNaN(start) && honorCertFormEndNo) {
      const end = parseInt(honorCertFormEndNo, 10);
      if (!isNaN(end) && end >= start) {
        setHonorCertFormAmount((end - start + 1).toString());
      }
    }
  };

  const handleEndNoChange = (val: string) => {
    setHonorCertFormEndNo(val);
    const end = parseInt(val, 10);
    const start = parseInt(honorCertFormStartNo, 10);
    if (!isNaN(end) && !isNaN(start) && end >= start) {
      setHonorCertFormAmount((end - start + 1).toString());
    }
  };

  const handleAmountChange = (val: string) => {
    setHonorCertFormAmount(val);
    const amt = parseInt(val, 10);
    const start = parseInt(honorCertFormStartNo, 10);
    if (!isNaN(amt) && amt > 0 && !isNaN(start)) {
      setHonorCertFormEndNo((start + amt - 1).toString());
    }
  };

  const handleSaveHonorCertModal = async () => {
    if (!effectiveSchoolId) return;
    if (!honorCertFormActivity.trim()) {
      Swal.fire({ icon: "warning", title: "กรุณากรอกชื่อกิจกรรม", confirmButtonColor: "#13795b" });
      return;
    }
    if (!honorCertFormStartNo.toString().trim()) {
      Swal.fire({ icon: "warning", title: "กรุณาระบุเลขที่เริ่มต้น", confirmButtonColor: "#13795b" });
      return;
    }
    if (!honorCertFormEndNo.toString().trim()) {
      Swal.fire({ icon: "warning", title: "กรุณาระบุเลขที่สิ้นสุด", confirmButtonColor: "#13795b" });
      return;
    }

    setIsSavingHonorCert(true);
    try {
      let finalFileUrl = honorCertExistingFileUrl;
      if (honorCertFile) {
        const storageRef = ref(storage, `honorCertificates/${effectiveSchoolId}/${Date.now()}_${honorCertFile.name}`);
        await uploadBytes(storageRef, honorCertFile);
        finalFileUrl = await getDownloadURL(storageRef);
      }

      const certId = honorCertFormId.trim() || Date.now().toString();
      const defaultYear = honorCertFormYear.trim() || academicYear || (new Date().getFullYear() + 543).toString();
      const sNo = Number(honorCertFormStartNo) || honorCertFormStartNo;
      const eNo = Number(honorCertFormEndNo) || honorCertFormEndNo;

      const payload = {
        customId: certId,
        academicYear: defaultYear,
        year: defaultYear,
        startNo: sNo,
        endNo: eNo,
        startNumber: sNo,
        endNumber: eNo,
        issuedDate: honorCertFormDocDate || new Date().toISOString().split("T")[0],
        docDate: honorCertFormDocDate || new Date().toISOString().split("T")[0],
        activityName: honorCertFormActivity.trim(),
        subject: honorCertFormActivity.trim(),
        responsiblePerson: honorCertFormResponsible.trim() || currentUserLabel(),
        notes: honorCertFormNotes.trim(),
        fileUrl: finalFileUrl || null,
        updatedAt: Timestamp.now(),
      };

      if (honorCertModalMode === "create") {
        await setDoc(doc(firestore, "school-settings", effectiveSchoolId, "honorCertificates", certId), {
          ...payload,
          createdBy: currentUserLabel(),
          createdAt: Timestamp.now(),
        });
      } else if (editingHonorCert) {
        await updateDoc(doc(firestore, "school-settings", effectiveSchoolId, "honorCertificates", editingHonorCert.id), payload);
      }

      Swal.fire({
        icon: "success",
        title: honorCertModalMode === "create" ? "ลงทะเบียนเลขเกียรติบัตรสำเร็จ" : "แก้ไขข้อมูลเลขเกียรติบัตรสำเร็จ",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      setIsHonorCertModalOpen(false);
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error saving honor certificate:", error);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    } finally {
      setIsSavingHonorCert(false);
    }
  };

  const handleDeleteHonorCert = async (row: RegistryRow) => {
    if (!isGeneralAffairsOrAdmin || !effectiveSchoolId) return;
    const result = await Swal.fire({
      icon: "warning",
      title: "ยืนยันการลบเลขเกียรติบัตร",
      text: `ต้องการลบรายการ "${row.subject}" (เลขที่: ${row.startNo} - ${row.endNo}) ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;

    try {
      await deleteDoc(doc(firestore, "school-settings", effectiveSchoolId, "honorCertificates", row.id));
      Swal.fire({
        icon: "success",
        title: "ลบรายการแล้ว",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1800,
      });
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error deleting honor certificate:", error);
      Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", confirmButtonColor: "#dc2626" });
    }
  };

  const renderViewModeToggle = (tabKey: TabKey) => {
    const isSearchMode = viewModeByTab[tabKey] === "search" && !searchTerm.trim();
    const totalCount = (rows[tabKey] || []).length;
    return (
      <div className="flex items-center bg-black/20 p-0.5 rounded-lg text-xs font-medium ml-1">
        <button
          type="button"
          onClick={() => setTabMode(tabKey, "search")}
          className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
            isSearchMode
              ? "bg-white text-emerald-800 font-bold shadow-sm"
              : "text-emerald-100 hover:text-white hover:bg-white/10"
          }`}
        >
          ค้นหาเอา (0)
        </button>
        <button
          type="button"
          onClick={() => setTabMode(tabKey, "all")}
          className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
            !isSearchMode
              ? "bg-white text-emerald-800 font-bold shadow-sm"
              : "text-emerald-100 hover:text-white hover:bg-white/10"
          }`}
        >
          ทั้งหมด ({totalCount})
        </button>
      </div>
    );
  };

  return (
    <GeneralAffairsLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300">
        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#2a2b2f]/95 backdrop-blur border-b border-gray-200 dark:border-white/5 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton to="/general-affairs/home" />
            <div className="h-5 w-px bg-gray-200 dark:bg-white/10" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">งานธุรการ</p>
              <h1 className="text-sm font-black text-gray-800 dark:text-white truncate">ทะเบียนหนังสือ</h1>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
            {(Object.keys(TAB_CONFIG) as TabKey[]).map((key) => {
              const cfg = TAB_CONFIG[key];
              const isActive = activeTab === key;
              const count =
                !searchTerm.trim() && viewModeByTab[key] === "search"
                  ? 0
                  : isActive && searchTerm.trim()
                  ? filteredRows.length
                  : rows[key].length;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
                    isActive
                      ? "bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/30"
                      : "bg-white dark:bg-[#212226] border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-300"
                  }`}
                >
                  <span className={`text-xl ${isActive ? "text-white" : cfg.color}`}>{cfg.icon}</span>
                  <span className="text-xs font-bold text-center">{cfg.label}</span>
                  <span className={`text-[10px] font-medium ${isActive ? "text-indigo-100" : "text-gray-400"}`}>
                    {count} รายการ
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table card */}
          <div className="bg-white dark:bg-[#212226] rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* หัวตารางสีเขียวเข้ม — ทะเบียนหนังสือรับ (ตามภาพที่สี่) */}
            {activeTab === "received" && (
              <div className="bg-[#13795b] dark:bg-[#0f6249] text-white px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FaListUl className="text-white text-lg" />
                  <h2 className="text-base sm:text-lg font-bold tracking-wide">
                    ทะเบียนหนังสือรับ ปี {academicYear || (new Date().getFullYear() + 543)}
                  </h2>
                  {renderViewModeToggle("received")}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => navigate("/general-affairs")}
                    className="inline-flex items-center gap-1.5 bg-[#ffc107] hover:bg-[#e0a800] text-gray-900 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <FaPlus size={11} />
                    <span>ลงทะเบียนหนังสือรับ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterFilesOnly((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer ${
                      filterFilesOnly
                        ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-white"
                        : "bg-[#17a2b8] hover:bg-[#138496] text-white"
                    }`}
                    title={filterFilesOnly ? "คลิกเพื่อดูหนังสือรับทั้งหมด" : "คลิกเพื่อกรองดูเฉพาะหนังสือรับที่มีไฟล์แนบ"}
                  >
                    <FaFolder size={12} />
                    <span>ไฟล์หนังสือรับ{filterFilesOnly ? " (กำลังกรอง)" : ""}</span>
                  </button>
                </div>
              </div>
            )}

            {/* หัวตารางสีเขียวเข้ม — ทะเบียนคำสั่ง (รูปแบบเดียวกับภาพที่สอง) */}
            {activeTab === "orders" && (
              <div className="bg-[#13795b] dark:bg-[#0f6249] text-white px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FaListUl className="text-white text-lg" />
                  <h2 className="text-base sm:text-lg font-bold tracking-wide">
                    ทะเบียนคำสั่ง ปี {academicYear || (new Date().getFullYear() + 543)}
                  </h2>
                  {renderViewModeToggle("orders")}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={openCreateOrder}
                    className="inline-flex items-center gap-1.5 bg-[#ffc107] hover:bg-[#e0a800] text-gray-900 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <FaPlus size={11} />
                    <span>ลงทะเบียนคำสั่ง</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterFilesOnly((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer ${
                      filterFilesOnly
                        ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-white"
                        : "bg-[#17a2b8] hover:bg-[#138496] text-white"
                    }`}
                    title={filterFilesOnly ? "คลิกเพื่อดูคำสั่งทั้งหมด" : "คลิกเพื่อกรองดูเฉพาะคำสั่งที่มีไฟล์แนบ"}
                  >
                    <FaFolder size={12} />
                    <span>ไฟล์คำสั่ง{filterFilesOnly ? " (กำลังกรอง)" : ""}</span>
                  </button>
                </div>
              </div>
            )}

            {/* หัวตารางสีเขียวเข้ม — ทะเบียนหนังสือส่ง (ตามภาพที่สาม) */}
            {activeTab === "sent" && (
              <div className="bg-[#13795b] dark:bg-[#0f6249] text-white px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FaListUl className="text-white text-lg" />
                  <h2 className="text-base sm:text-lg font-bold tracking-wide">
                    ทะเบียนหนังสือส่ง ปี {academicYear || (new Date().getFullYear() + 543)}
                  </h2>
                  {renderViewModeToggle("sent")}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={openCreateSent}
                    className="inline-flex items-center gap-1.5 bg-[#ffc107] hover:bg-[#e0a800] text-gray-900 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <FaPlus size={11} />
                    <span>ลงทะเบียนเลขหนังสือส่ง</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterFilesOnly((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer ${
                      filterFilesOnly
                        ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-white"
                        : "bg-[#17a2b8] hover:bg-[#138496] text-white"
                    }`}
                    title={filterFilesOnly ? "คลิกเพื่อดูหนังสือส่งทั้งหมด" : "คลิกเพื่อกรองดูเฉพาะหนังสือส่งที่มีไฟล์แนบ"}
                  >
                    <FaFolder size={12} />
                    <span>ไฟล์หนังสือส่ง{filterFilesOnly ? " (กำลังกรอง)" : ""}</span>
                  </button>
                </div>
              </div>
            )}

            {/* หัวตารางสีเขียวเข้ม — ทะเบียนประกาศ */}
            {activeTab === "announcements" && (
              <div className="bg-[#13795b] dark:bg-[#0f6249] text-white px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FaListUl className="text-white text-lg" />
                  <h2 className="text-base sm:text-lg font-bold tracking-wide">
                    ทะเบียนประกาศ ปี {academicYear || (new Date().getFullYear() + 543)}
                  </h2>
                  {renderViewModeToggle("announcements")}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={openForm}
                    className="inline-flex items-center gap-1.5 bg-[#ffc107] hover:bg-[#e0a800] text-gray-900 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <FaPlus size={11} />
                    <span>ลงทะเบียนประกาศ</span>
                  </button>
                </div>
              </div>
            )}

            {/* หัวตารางสีเขียวเข้ม — ทะเบียนหนังสือรับรอง */}
            {activeTab === "certificates" && (
              <div className="bg-[#13795b] dark:bg-[#0f6249] text-white px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FaListUl className="text-white text-lg" />
                  <h2 className="text-base sm:text-lg font-bold tracking-wide">
                    ทะเบียนหนังสือรับรอง ปี {academicYear || (new Date().getFullYear() + 543)}
                  </h2>
                  {renderViewModeToggle("certificates")}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={openForm}
                    className="inline-flex items-center gap-1.5 bg-[#ffc107] hover:bg-[#e0a800] text-gray-900 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <FaPlus size={11} />
                    <span>ลงทะเบียนหนังสือรับรอง</span>
                  </button>
                </div>
              </div>
            )}

            {/* หัวตารางสีเขียวเข้ม — ทะเบียนบันทึกข้อความ */}
            {activeTab === "memos" && (
              <div className="bg-[#13795b] dark:bg-[#0f6249] text-white px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FaListUl className="text-white text-lg" />
                  <h2 className="text-base sm:text-lg font-bold tracking-wide">
                    ทะเบียนบันทึกข้อความ ปี {academicYear || (new Date().getFullYear() + 543)}
                  </h2>
                  {renderViewModeToggle("memos")}
                </div>
                <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={openCreateMemo}
                    className="inline-flex items-center gap-1.5 bg-[#ffc107] hover:bg-[#e0a800] text-gray-900 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <FaPlus size={11} />
                    <span>ลงทะเบียนบันทึกข้อความ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterFilesOnly((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer ${
                      filterFilesOnly
                        ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-white"
                        : "bg-[#17a2b8] hover:bg-[#138496] text-white"
                    }`}
                    title={filterFilesOnly ? "คลิกเพื่อดูบันทึกข้อความทั้งหมด" : "คลิกเพื่อกรองดูเฉพาะบันทึกข้อความที่มีไฟล์แนบ"}
                  >
                    <FaFolder size={12} />
                    <span>ไฟล์บันทึกข้อความ{filterFilesOnly ? " (กำลังกรอง)" : ""}</span>
                  </button>
                </div>
              </div>
            )}

            {/* หัวตารางสีเขียวเข้ม — ทะเบียนเกียรติบัตร */}
            {activeTab === "honorCertificates" && (
              <div className="bg-[#13795b] dark:bg-[#0f6249] text-white px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FaListUl className="text-white text-lg" />
                  <h2 className="text-base sm:text-lg font-bold tracking-wide">
                    ทะเบียนเกียรติบัตร ปี {academicYear || (new Date().getFullYear() + 543)}
                  </h2>
                  {renderViewModeToggle("honorCertificates")}
                </div>
                <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={openCreateHonorCert}
                    className="inline-flex items-center gap-1.5 bg-[#ffc107] hover:bg-[#e0a800] text-gray-900 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <FaPlus size={11} />
                    <span>ลงทะเบียนเลขเกียรติบัตร</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterFilesOnly((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 font-bold px-3.5 py-1.5 rounded text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer ${
                      filterFilesOnly
                        ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-white"
                        : "bg-[#17a2b8] hover:bg-[#138496] text-white"
                    }`}
                    title={filterFilesOnly ? "คลิกเพื่อดูเกียรติบัตรทั้งหมด" : "คลิกเพื่อกรองดูเฉพาะเกียรติบัตรที่มีไฟล์แนบ"}
                  >
                    <FaFolder size={12} />
                    <span>ไฟล์เกียรติบัตร{filterFilesOnly ? " (กำลังกรอง)" : ""}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Controls: page size + search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#212226]">
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                {activeTab !== "orders" &&
                  activeTab !== "sent" &&
                  activeTab !== "received" &&
                  activeTab !== "memos" &&
                  activeTab !== "honorCertificates" && <span>แสดง</span>}
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2.5 py-1 rounded bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-600 outline-none focus:border-emerald-600 dark:text-white font-medium text-xs sm:text-sm cursor-pointer"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {activeTab !== "orders" &&
                  activeTab !== "sent" &&
                  activeTab !== "received" &&
                  activeTab !== "memos" &&
                  activeTab !== "honorCertificates" && <span>รายการ</span>}
              </div>

              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-semibold flex items-center gap-1 whitespace-nowrap">
                  <FaSearch className="text-gray-500" size={12} /> ค้นหา:
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`ค้นหาใน${TAB_CONFIG[activeTab]?.label || "ทะเบียน"} (ชื่อ, เลขที่, เรื่อง)...`}
                  className="w-full sm:w-72 px-2.5 py-1 bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-600 rounded outline-none focus:border-emerald-600 dark:text-white text-xs sm:text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#1a1b1e] text-left text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700">
                    {activeTab === "orders" ? (
                      <>
                        <th
                          onClick={() => handleSort("no")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เลขคำสั่ง</span>
                            {sortField === "no" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("subject")}
                          className="px-4 py-3 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>รายการ</span>
                            {sortField === "subject" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("date")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ลงวันที่</span>
                            {sortField === "date" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("signedBy")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ผู้ลงนาม</span>
                            {sortField === "signedBy" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("responsiblePerson")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ผู้รับผิดชอบ</span>
                            {sortField === "responsiblePerson" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-center whitespace-nowrap font-bold">ไฟล์คำสั่ง</th>
                        {isGeneralAffairsOrAdmin && (
                          <>
                            <th className="px-4 py-3 text-center whitespace-nowrap font-bold">แก้ไข</th>
                            <th className="px-4 py-3 text-center whitespace-nowrap font-bold">ลบ</th>
                          </>
                        )}
                      </>
                    ) : activeTab === "sent" ? (
                      <>
                        <th
                          onClick={() => handleSort("no")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เลขทะเบียนส่ง</span>
                            {sortField === "no" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("docRefNo")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ที่</span>
                            {sortField === "docRefNo" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("date")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ลงวันที่</span>
                            {sortField === "date" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("from")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>จาก</span>
                            {sortField === "from" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("to")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ถึง</span>
                            {sortField === "to" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("subject")}
                          className="px-4 py-3 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เรื่อง</span>
                            {sortField === "subject" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-center whitespace-nowrap font-bold">ไฟล์</th>
                        {isGeneralAffairsOrAdmin && (
                          <>
                            <th className="px-4 py-3 text-center whitespace-nowrap font-bold">แก้ไข</th>
                            <th className="px-4 py-3 text-center whitespace-nowrap font-bold">ลบ</th>
                          </>
                        )}
                      </>
                    ) : activeTab === "received" ? (
                      <>
                        <th
                          onClick={() => handleSort("no")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เลขทะเบียนรับ</span>
                            {sortField === "no" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("docRefNo")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ที่</span>
                            {sortField === "docRefNo" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("date")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ลงวันที่</span>
                            {sortField === "date" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("from")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>จาก</span>
                            {sortField === "from" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("to")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ถึง</span>
                            {sortField === "to" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("subject")}
                          className="px-4 py-3 min-w-[280px] cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เรื่อง</span>
                            {sortField === "subject" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-center whitespace-nowrap font-bold w-20">ไฟล์</th>
                        {isGeneralAffairsOrAdmin && (
                          <>
                            <th className="px-4 py-3 text-center whitespace-nowrap font-bold w-14">แก้ไข</th>
                            <th className="px-4 py-3 text-center whitespace-nowrap font-bold w-14">ลบ</th>
                          </>
                        )}
                      </>
                    ) : activeTab === "memos" ? (
                      <>
                        <th
                          onClick={() => handleSort("no")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เลขที่</span>
                            {sortField === "no" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("subject")}
                          className="px-4 py-3 min-w-[220px] max-w-md cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เรื่อง</span>
                            {sortField === "subject" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("date")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ลงวันที่</span>
                            {sortField === "date" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3 whitespace-nowrap font-bold">จาก</th>
                        <th className="px-4 py-3 whitespace-nowrap font-bold">เรียน</th>
                        <th className="px-4 py-3 text-center whitespace-nowrap font-bold">ไฟล์แนบ</th>
                        {isGeneralAffairsOrAdmin && (
                          <>
                            <th className="px-3 py-3 text-center whitespace-nowrap font-bold w-14">แก้ไข</th>
                            <th className="px-3 py-3 text-center whitespace-nowrap font-bold w-14">ลบ</th>
                          </>
                        )}
                      </>
                    ) : activeTab === "honorCertificates" ? (
                      <>
                        <th
                          onClick={() => handleSort("id")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ID</span>
                            {sortField === "id" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("year")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ปี พ.ศ.</span>
                            {sortField === "year" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("startNo")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เลขที่เริ่มต้น</span>
                            {sortField === "startNo" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("endNo")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>เลขที่สิ้นสุด</span>
                            {sortField === "endNo" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("date")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ให้ไว้ ณ วันที่</span>
                            {sortField === "date" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("subject")}
                          className="px-4 py-3 min-w-[200px] cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ชื่อกิจกรรม</span>
                            {sortField === "subject" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("responsiblePerson")}
                          className="px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-bold"
                        >
                          <div className="flex items-center gap-1">
                            <span>ผู้รับผิดชอบ</span>
                            {sortField === "responsiblePerson" ? (
                              sortAsc ? <FaSortUp size={12} className="text-emerald-700" /> : <FaSortDown size={12} className="text-emerald-700" />
                            ) : (
                              <FaSort size={12} className="text-gray-400" />
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3 whitespace-nowrap font-bold">หมายเหตุ</th>
                        <th className="px-4 py-3 text-center whitespace-nowrap font-bold">ไฟล์</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap font-bold w-14">แก้ไข</th>
                        <th className="px-3 py-3 text-center whitespace-nowrap font-bold w-14">ลบ</th>
                      </>
                    ) : activeTab === "certificates" ? (
                      <>
                        <th className="px-5 py-3 whitespace-nowrap font-bold">เลขที่</th>
                        <th className="px-5 py-3 min-w-[220px] max-w-sm font-bold">เรื่อง / ประเภทหนังสือ</th>
                        <th className="px-5 py-3 whitespace-nowrap font-bold">ผู้ขอ / ออกให้แก่</th>
                        <th className="px-5 py-3 min-w-[200px] font-bold">วัตถุประสงค์</th>
                        <th className="px-5 py-3 whitespace-nowrap font-bold">วันที่ออก</th>
                        <th className="px-5 py-3 whitespace-nowrap font-bold">ผู้ลงนาม</th>
                      </>
                    ) : (
                      <>
                        <th className="px-5 py-3 whitespace-nowrap">เลขที่</th>
                        <th className="px-5 py-3">เรื่อง</th>
                        <th className="px-5 py-3 whitespace-nowrap">วันที่</th>
                        <th className="px-5 py-3 whitespace-nowrap">รายละเอียดเพิ่มเติม</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center text-gray-400">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center text-gray-400">
                        {!searchTerm.trim() && viewModeByTab[activeTab] === "search" ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                              ยังไม่ได้ค้นหารายการใน{TAB_CONFIG[activeTab]?.label || "ทะเบียนนี้"}
                            </span>
                            <span className="text-xs text-gray-400">
                              (พิมพ์คำค้นหาในช่อง "ค้นหา:" ด้านบน หรือคลิกปุ่มดูทั้งหมด)
                            </span>
                            {(rows[activeTab] || []).length > 0 && (
                              <button
                                type="button"
                                onClick={() => setTabMode(activeTab, "all")}
                                className="mt-1 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-md text-xs font-semibold border border-emerald-300 dark:border-emerald-800 transition-colors cursor-pointer"
                              >
                                ดูรายการทั้งหมดในระบบ ({(rows[activeTab] || []).length} รายการ)
                              </button>
                            )}
                          </div>
                        ) : (
                          "ไม่พบรายการในทะเบียนนี้"
                        )}
                      </td>
                    </tr>
                  ) : activeTab === "orders" ? (
                    pagedRows.map((row) => (
                      <React.Fragment key={row.id}>
                        <tr className="hover:bg-gray-100/70 dark:hover:bg-white/5 transition-colors odd:bg-white even:bg-gray-50/60 dark:odd:bg-[#212226] dark:even:bg-[#1d1e21]">
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleExpandRow(row.id)}
                                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[#28a745] hover:bg-[#218838] text-white text-xs font-bold leading-none shadow-sm transition-transform active:scale-90 select-none cursor-pointer"
                                title={expandedRows[row.id] ? "ย่อรายละเอียด" : "คลิกดูรายละเอียดเพิ่มเติม"}
                              >
                                {expandedRows[row.id] ? "−" : "+"}
                              </button>
                              <span className="font-normal text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                                {formatOrderNo(row.no)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                            <span className="font-normal text-xs sm:text-sm leading-relaxed">
                              {row.subject}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.dateLabel}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.signedBy || "-"}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.responsiblePerson || "-"}
                          </td>
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            {row.fileUrl ? (
                              <a
                                href={row.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center px-2 py-1 rounded bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400 text-xs font-semibold gap-1 transition-colors"
                                title="เปิดดูไฟล์คำสั่ง"
                              >
                                <FaFilePdf size={13} className="text-red-500" />
                                <span>ดูไฟล์</span>
                              </a>
                            ) : (
                              <span className="text-gray-400 font-normal">-</span>
                            )}
                          </td>
                          {isGeneralAffairsOrAdmin && (
                            <>
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openEditOrder(row)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#ffc107] hover:bg-[#e0a800] text-black shadow-sm transition-transform active:scale-95 cursor-pointer"
                                  title="แก้ไขคำสั่ง"
                                >
                                  <FaEdit size={13} />
                                </button>
                              </td>
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOrder(row)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#dc3545] hover:bg-[#c82333] text-white shadow-sm transition-transform active:scale-95 cursor-pointer"
                                  title="ลบคำสั่ง"
                                >
                                  <FaTrashAlt size={12} />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                        {expandedRows[row.id] && (
                          <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/40">
                            <td colSpan={isGeneralAffairsOrAdmin ? 8 : 6} className="px-6 py-3.5 text-xs text-gray-700 dark:text-gray-300">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">เลขที่ฉบับเต็ม:</span>{" "}
                                  {row.no}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">ประเภทคำสั่ง:</span>{" "}
                                  {row.orderType || "-"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">ผู้บันทึก:</span>{" "}
                                  {row.extra || "-"}
                                </div>
                                {row.notes && (
                                  <div className="sm:col-span-3">
                                    <span className="font-bold text-emerald-800 dark:text-emerald-400">หมายเหตุ:</span>{" "}
                                    {row.notes}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  ) : activeTab === "sent" ? (
                    pagedRows.map((row) => (
                      <React.Fragment key={row.id}>
                        <tr className="hover:bg-gray-100/70 dark:hover:bg-white/5 transition-colors odd:bg-white even:bg-gray-50/60 dark:odd:bg-[#212226] dark:even:bg-[#1d1e21]">
                          {/* เลขทะเบียนส่ง */}
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleExpandRow(row.id)}
                                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[#28a745] hover:bg-[#218838] text-white text-xs font-bold leading-none shadow-sm transition-transform active:scale-90 select-none cursor-pointer"
                                title={expandedRows[row.id] ? "ย่อรายละเอียด" : "คลิกดูรายละเอียดเพิ่มเติม"}
                              >
                                {expandedRows[row.id] ? "−" : "+"}
                              </button>
                              <span className="font-normal text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                                {formatOrderNo(row.no)}
                              </span>
                            </div>
                          </td>
                          {/* ที่ */}
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.docRefNo || "-"}
                          </td>
                          {/* ลงวันที่ */}
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.dateLabel}
                          </td>
                          {/* จาก */}
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.from || "-"}
                          </td>
                          {/* ถึง */}
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 text-xs sm:text-sm max-w-xs truncate" title={row.to}>
                            {row.to || "-"}
                          </td>
                          {/* เรื่อง */}
                          <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                            <span className="font-normal text-xs sm:text-sm leading-relaxed">
                              {row.subject}
                            </span>
                          </td>
                          {/* ไฟล์ */}
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            {row.fileUrl ? (
                              <a
                                href={row.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#007bff] hover:bg-[#0069d9] text-white text-xs font-semibold gap-1 transition-colors shadow-sm"
                                title="เปิดดูไฟล์หนังสือส่ง"
                              >
                                <FaEye size={11} />
                                <span>ไฟล์</span>
                              </a>
                            ) : (
                              <span className="text-gray-400 font-normal">-</span>
                            )}
                          </td>
                          {isGeneralAffairsOrAdmin && (
                            <>
                              {/* แก้ไข */}
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openEditSent(row)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#ffc107] hover:bg-[#e0a800] text-black shadow-sm transition-transform active:scale-95 cursor-pointer"
                                  title="แก้ไขหนังสือส่ง"
                                >
                                  <FaEdit size={13} />
                                </button>
                              </td>
                              {/* ลบ */}
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSent(row)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#dc3545] hover:bg-[#c82333] text-white shadow-sm transition-transform active:scale-95 cursor-pointer"
                                  title="ลบหนังสือส่ง"
                                >
                                  <FaTrashAlt size={12} />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                        {expandedRows[row.id] && (
                          <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/40">
                            <td colSpan={isGeneralAffairsOrAdmin ? 9 : 7} className="px-6 py-3.5 text-xs text-gray-700 dark:text-gray-300">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">เลขทะเบียนส่งฉบับเต็ม:</span>{" "}
                                  {row.no}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">เลขที่หนังสือ (ที่):</span>{" "}
                                  {row.docRefNo || "-"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">ความเร่งด่วน:</span>{" "}
                                  {row.status || "ปกติ"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">จาก:</span>{" "}
                                  {row.from || "-"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">ถึง:</span>{" "}
                                  {row.to || "-"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">ผู้บันทึก:</span>{" "}
                                  {row.extra || "-"}
                                </div>
                                {row.notes && (
                                  <div className="sm:col-span-3">
                                    <span className="font-bold text-emerald-800 dark:text-emerald-400">หมายเหตุ:</span>{" "}
                                    {row.notes}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  ) : activeTab === "received" ? (
                    pagedRows.map((row) => (
                      <React.Fragment key={row.id}>
                        <tr className="hover:bg-gray-100/70 dark:hover:bg-white/5 transition-colors odd:bg-white even:bg-gray-50/60 dark:odd:bg-[#212226] dark:even:bg-[#1d1e21]">
                          {/* เลขทะเบียนรับ พร้อมปุ่ม (+) */}
                          <td className="px-4 py-2.5 whitespace-nowrap text-gray-900 dark:text-gray-100 font-normal text-xs sm:text-sm">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleExpandRow(row.id)}
                                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[#28a745] hover:bg-[#218838] text-white text-xs font-bold leading-none shadow-sm transition-transform active:scale-90 select-none cursor-pointer shrink-0"
                                title={expandedRows[row.id] ? "ย่อรายละเอียด" : "คลิกดูรายละเอียดเพิ่มเติม"}
                              >
                                {expandedRows[row.id] ? "−" : "+"}
                              </button>
                              <span className="font-normal text-gray-900 dark:text-gray-100">
                                {formatOrderNo(row.no)}
                              </span>
                            </div>
                          </td>
                          {/* ที่ */}
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.docRefNo || "-"}
                          </td>
                          {/* ลงวันที่ */}
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.dateLabel}
                          </td>
                          {/* จาก */}
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm">
                            {row.from || "-"}
                          </td>
                          {/* ถึง */}
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 text-xs sm:text-sm whitespace-nowrap">
                            {row.to || "-"}
                          </td>
                          {/* เรื่อง */}
                          <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 min-w-[280px] max-w-xl">
                            <span className="font-normal text-xs sm:text-sm leading-relaxed block">
                              {row.subject}
                            </span>
                          </td>
                          {/* ไฟล์ */}
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            {row.fileUrl ? (
                              <a
                                href={row.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#007bff] hover:bg-[#0069d9] text-white text-xs font-semibold gap-1 transition-colors shadow-sm"
                                title="เปิดดูไฟล์หนังสือรับ"
                              >
                                <FaEye size={11} />
                                <span>ไฟล์</span>
                              </a>
                            ) : (
                              <span className="text-gray-400 font-normal">-</span>
                            )}
                          </td>
                          {isGeneralAffairsOrAdmin && (
                            <>
                              {/* แก้ไข */}
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openEditReceived(row)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#ffc107] hover:bg-[#e0a800] text-black shadow-sm transition-transform active:scale-95 cursor-pointer"
                                  title="แก้ไขหนังสือรับ"
                                >
                                  <FaEdit size={13} />
                                </button>
                              </td>
                              {/* ลบ */}
                              <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReceived(row)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#dc3545] hover:bg-[#c82333] text-white shadow-sm transition-transform active:scale-95 cursor-pointer"
                                  title="ลบหนังสือรับ"
                                >
                                  <FaTrashAlt size={12} />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                        {expandedRows[row.id] && (
                          <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/40">
                            <td colSpan={isGeneralAffairsOrAdmin ? 9 : 7} className="px-6 py-3.5 text-xs text-gray-700 dark:text-gray-300">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">เลขทะเบียนรับฉบับเต็ม:</span>{" "}
                                  {row.no}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">เลขที่หนังสือ (ที่):</span>{" "}
                                  {row.docRefNo || "-"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">ผู้ปฏิบัติ / แผนก:</span>{" "}
                                  {row.department || "-"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">จาก:</span>{" "}
                                  {row.from || "-"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">ถึง:</span>{" "}
                                  {row.to || "-"}
                                </div>
                                <div>
                                  <span className="font-bold text-emerald-800 dark:text-emerald-400">ผู้บันทึก:</span>{" "}
                                  {row.extra || "-"}
                                </div>
                                {row.notes && (
                                  <div className="sm:col-span-3">
                                    <span className="font-bold text-emerald-800 dark:text-emerald-400">หมายเหตุ:</span>{" "}
                                    {row.notes}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  ) : activeTab === "memos" ? (
                    pagedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-100/70 dark:hover:bg-white/5 transition-colors odd:bg-white even:bg-gray-50/60 dark:odd:bg-[#212226] dark:even:bg-[#1d1e21]">
                        <td className="px-4 py-2.5 font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap text-xs sm:text-sm">
                          {row.no}
                        </td>
                        <td className="px-4 py-2.5 min-w-[220px] max-w-md text-xs sm:text-sm text-gray-800 dark:text-gray-200">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{row.subject}</div>
                          {row.notes && (
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              หมายเหตุ: {row.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          {row.dateLabel}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          {row.from || "-"}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          {row.to || "-"}
                        </td>
                        <td className="px-4 py-2.5 text-center whitespace-nowrap text-xs">
                          {row.fileUrl ? (
                            <a
                              href={row.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-[#13795b] dark:text-emerald-300 hover:bg-emerald-100 font-bold transition-colors"
                            >
                              <FaFileAlt size={12} /> ดูไฟล์
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        {isGeneralAffairsOrAdmin && (
                          <>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEditMemo(row)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-400 hover:bg-amber-500 text-gray-900 shadow-sm transition-transform active:scale-90 cursor-pointer"
                                title="แก้ไขบันทึกข้อความ"
                              >
                                <FaEdit size={13} />
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleDeleteMemo(row)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm transition-transform active:scale-90 cursor-pointer"
                                title="ลบบันทึกข้อความ"
                              >
                                <FaTrashAlt size={12} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  ) : activeTab === "honorCertificates" ? (
                    pagedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-100/70 dark:hover:bg-white/5 transition-colors odd:bg-white even:bg-gray-50/60 dark:odd:bg-[#212226] dark:even:bg-[#1d1e21]">
                        {/* ID */}
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-gray-800 dark:text-gray-200">
                          {row.customId || row.id}
                        </td>
                        {/* ปี พ.ศ. */}
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          {row.year || academicYear || "2569"}
                        </td>
                        {/* เลขที่เริ่มต้น */}
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">
                          {row.startNo !== undefined && row.startNo !== null && row.startNo !== "" ? row.startNo : "-"}
                        </td>
                        {/* เลขที่สิ้นสุด */}
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">
                          {row.endNo !== undefined && row.endNo !== null && row.endNo !== "" ? row.endNo : "-"}
                        </td>
                        {/* ให้ไว้ ณ วันที่ */}
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          {row.dateLabel}
                        </td>
                        {/* ชื่อกิจกรรม */}
                        <td className="px-4 py-2.5 min-w-[200px] max-w-sm text-xs sm:text-sm text-gray-900 dark:text-gray-100 font-medium">
                          {row.subject}
                        </td>
                        {/* ผู้รับผิดชอบ */}
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-gray-800 dark:text-gray-200">
                          {row.responsiblePerson || "-"}
                        </td>
                        {/* หมายเหตุ */}
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          {row.notes && row.notes !== "" ? row.notes : "-"}
                        </td>
                        {/* ไฟล์ */}
                        <td className="px-4 py-2.5 text-center whitespace-nowrap text-xs">
                          {row.fileUrl ? (
                            <a
                              href={row.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#17a2b8] hover:bg-[#138496] text-white font-bold transition-transform active:scale-95 shadow-sm"
                              title="เปิดดูไฟล์เกียรติบัตร"
                            >
                              <FaFileAlt size={12} /> ดูไฟล์
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        {/* แก้ไข */}
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {isGeneralAffairsOrAdmin ? (
                            <button
                              type="button"
                              onClick={() => openEditHonorCert(row)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#ffc107] hover:bg-[#e0a800] text-black shadow-sm transition-transform active:scale-95 cursor-pointer"
                              title="แก้ไขเลขเกียรติบัตร"
                            >
                              <FaEdit size={13} />
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">-</span>
                          )}
                        </td>
                        {/* ลบ */}
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {isGeneralAffairsOrAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteHonorCert(row)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#dc3545] hover:bg-[#c82333] text-white shadow-sm transition-transform active:scale-95 cursor-pointer"
                              title="ลบเลขเกียรติบัตร"
                            >
                              <FaTrashAlt size={12} />
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : activeTab === "certificates" ? (
                    pagedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-100/70 dark:hover:bg-white/5 transition-colors odd:bg-white even:bg-gray-50/60 dark:odd:bg-[#212226] dark:even:bg-[#1d1e21]">
                        {/* เลขที่ */}
                        <td className="px-5 py-3.5 font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap text-xs sm:text-sm align-top">
                          {row.no}
                        </td>
                        {/* เรื่อง / ประเภท */}
                        <td className="px-5 py-3.5 min-w-[220px] max-w-sm align-top">
                          <div className="font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm leading-snug">
                            {row.subject}
                          </div>
                          {row.certType && row.certType !== row.subject && (
                            <span className="inline-block mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                              {row.certType}
                            </span>
                          )}
                        </td>
                        {/* ผู้ขอ / ออกให้แก่ */}
                        <td className="px-5 py-3.5 whitespace-nowrap align-top">
                          {row.recipient ? (
                            <div className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 font-medium">
                              {row.recipient}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        {/* วัตถุประสงค์ */}
                        <td className="px-5 py-3.5 min-w-[200px] text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed align-top">
                          {row.purpose || (row.extra?.replace(/^ผู้ขอ:[^·]+·?/, "").trim()) || "-"}
                        </td>
                        {/* วันที่ออก */}
                        <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs sm:text-sm align-top">
                          {row.dateLabel}
                        </td>
                        {/* ผู้ลงนาม */}
                        <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400 align-top">
                          {row.signedBy || (row.status?.replace("ผู้ลงนาม: ", "")) || "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    pagedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-5 py-3 font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap">{row.no}</td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-200">{row.subject}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{row.dateLabel}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{row.extra || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!isLoading && filteredRows.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-[#212226]">
                <div className="font-medium">
                  « {filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} ถึง{" "}
                  {Math.min(currentPage * pageSize, filteredRows.length)} จาก {filteredRows.length} »
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <FaChevronLeft size={10} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === totalPages ||
                        Math.abs(p - currentPage) <= 1
                    )
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && (
                          <span className="px-1 text-gray-400">...</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(p)}
                          className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                            currentPage === p
                              ? activeTab === "orders" || activeTab === "sent" || activeTab === "received" || activeTab === "memos" || activeTab === "honorCertificates"
                                ? "bg-[#13795b] border-[#13795b] text-white shadow-sm"
                                : "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                              : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <FaChevronRight size={10} />
                  </button>
                </div>
              </div>
            )}

            {/* Button ข้อมูลทั้งหมด สำหรับทะเบียนเกียรติบัตร (ตามภาพ) */}
            {activeTab === "honorCertificates" && !isLoading && (
              <div className="px-5 pb-4 pt-1 bg-white dark:bg-[#212226]">
                <button
                  type="button"
                  onClick={() => {
                    setPageSize(pageSize >= 9999 ? 10 : 9999);
                    setCurrentPage(1);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#13795b] hover:bg-[#0f6249] text-white font-bold text-xs sm:text-sm shadow-sm transition-transform active:scale-95 cursor-pointer"
                >
                  <FaListUl size={12} />
                  <span>{pageSize >= 9999 ? "แสดงแบบแบ่งหน้า (10 รายการ)" : "ข้อมูลทั้งหมด"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Create Entry Modal ── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[min(88vh,calc(100dvh-2.5rem))] my-auto border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex-shrink-0 flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                ออกเลข{TAB_CONFIG[activeTab].label.replace("ทะเบียน", "")}ใหม่
              </h2>
              <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <FaTimes size={20} />
              </button>
            </div>

            <div className="flex-grow p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  เรื่อง <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
                  placeholder="ระบุเรื่อง..."
                />
              </div>

              {activeTab === "sent" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ถึง</label>
                    <input
                      type="text"
                      value={formTo}
                      onChange={(e) => setFormTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="หน่วยงาน/บุคคลปลายทาง"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ความเร่งด่วน</label>
                    <select
                      value={formUrgency}
                      onChange={(e) => setFormUrgency(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    >
                      {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {activeTab === "orders" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ประเภทคำสั่ง</label>
                    <select
                      value={formOrderType}
                      onChange={(e) => setFormOrderType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    >
                      {ORDER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ผู้ลงนาม</label>
                    <input
                      type="text"
                      value={formTo}
                      onChange={(e) => setFormTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="ชื่อผู้ลงนามในคำสั่ง"
                    />
                  </div>
                </>
              )}

              {activeTab === "announcements" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">หมวดหมู่</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  >
                    {ANNOUNCEMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeTab === "memos" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">เรียน</label>
                  <input
                    type="text"
                    value={formTo}
                    onChange={(e) => setFormTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    placeholder="ผู้รับ/หน่วยงานที่บันทึกถึง"
                  />
                </div>
              )}

              {activeTab === "certificates" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ประเภทหนังสือรับรอง</label>
                    <select
                      value={formCertType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormCertType(val);
                        if (!formSubject || CERTIFICATE_TYPES.includes(formSubject)) {
                          setFormSubject(val);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    >
                      {CERTIFICATE_TYPES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      ออกให้แก่ (ชื่อ-นามสกุล / เลขประจำตัว)
                    </label>
                    <input
                      type="text"
                      value={formRecipient}
                      onChange={(e) => setFormRecipient(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="เช่น เด็กชายรักเรียน ขยันยิ่ง หรือ ครูสมชาย สอนดี"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">วัตถุประสงค์ในการขอ</label>
                    <input
                      type="text"
                      value={formPurpose}
                      onChange={(e) => setFormPurpose(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="เช่น เพื่อใช้ศึกษาต่อ, สมัครงาน, ขอทุนการศึกษา"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ผู้ลงนาม</label>
                    <input
                      type="text"
                      value={formSignedBy}
                      onChange={(e) => setFormSignedBy(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      placeholder="เช่น ผู้อำนวยการโรงเรียน หรือชื่อผู้ลงนาม"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">หมายเหตุ</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
                  placeholder="(ไม่บังคับ)"
                />
              </div>
            </div>

            <div className="flex-shrink-0 p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-[#2a2b2f]">
              <button
                onClick={() => setIsFormOpen(false)}
                className="px-5 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveEntry}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-70"
              >
                {isSaving ? (
                  "กำลังบันทึก..."
                ) : (
                  <>
                    <FaSave size={16} /> ออกเลขและบันทึก
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ลงทะเบียนคำสั่ง / แก้ไขคำสั่ง (ตามภาพที่สอง) ── */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[min(88vh,calc(100dvh-2.5rem))] my-auto border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex-shrink-0 flex justify-between items-center p-5 bg-[#13795b] text-white">
              <div className="flex items-center gap-2.5">
                <FaFileSignature size={18} />
                <div>
                  <h2 className="text-base sm:text-lg font-bold">
                    {orderModalMode === "create" ? "ลงทะเบียนคำสั่งใหม่" : "แก้ไขข้อมูลคำสั่ง"}
                  </h2>
                  <p className="text-[11px] text-emerald-100">
                    ปีการศึกษา {academicYear || (new Date().getFullYear() + 543)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOrderModalOpen(false)}
                className="text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <FaTimes size={18} />
              </button>
            </div>

            <div className="flex-grow p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    เลขคำสั่ง <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orderFormNo}
                    onChange={(e) => setOrderFormNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น 215 หรือ 215/2569"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ลงวันที่ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={orderFormDocDate}
                    onChange={(e) => setOrderFormDocDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  รายการ / เรื่องคำสั่ง <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={orderFormSubject}
                  onChange={(e) => setOrderFormSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="เช่น แต่งตั้งคณะกรรมการดำเนินการสอบวัดผลปลายภาค..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">ผู้ลงนาม</label>
                  <input
                    type="text"
                    list="signers-list"
                    value={orderFormSignedBy}
                    onChange={(e) => setOrderFormSignedBy(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น ผอ. หรือชื่อผู้อำนวยการ"
                  />
                  <datalist id="signers-list">
                    <option value="ผอ." />
                    <option value="ผอ.สถานศึกษา" />
                    {schoolAbbreviation && <option value={`ผอ.${schoolAbbreviation}`} />}
                    <option value="ผู้อำนวยการโรงเรียน" />
                    <option value="รองผู้อำนวยการ" />
                  </datalist>
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">ผู้รับผิดชอบ</label>
                  <input
                    type="text"
                    list="teachers-list"
                    value={orderFormResponsiblePerson}
                    onChange={(e) => setOrderFormResponsiblePerson(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="ระบุชื่อครู / ผู้รับผิดชอบ"
                  />
                  <datalist id="teachers-list">
                    {teachers.map((t) => (
                      <option key={t.id} value={t.displayName} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">ประเภทคำสั่ง</label>
                  <select
                    value={orderFormOrderType}
                    onChange={(e) => setOrderFormOrderType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {ORDER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    แนบไฟล์คำสั่ง (PDF หรือรูปภาพ)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setOrderFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950/30 dark:file:text-emerald-400"
                  />
                  {orderExistingFileUrl && !orderFile && (
                    <div className="mt-1 flex items-center gap-2">
                      <a
                        href={orderExistingFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        <FaFilePdf size={11} className="text-red-500" />
                        <span>เปิดดูไฟล์แนบเดิม</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">หมายเหตุ</label>
                <textarea
                  rows={2}
                  value={orderFormNotes}
                  onChange={(e) => setOrderFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="(ไม่บังคับ)"
                />
              </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2.5 bg-gray-50 dark:bg-[#212226]">
              <button
                type="button"
                onClick={() => setIsOrderModalOpen(false)}
                className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors cursor-pointer text-xs sm:text-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveOrderModal}
                disabled={isSavingOrder}
                className="px-5 py-2 rounded-lg bg-[#13795b] hover:bg-[#0f6249] text-white font-bold shadow transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer text-xs sm:text-sm"
              >
                {isSavingOrder ? (
                  "กำลังบันทึก..."
                ) : (
                  <>
                    <FaSave size={14} />
                    <span>บันทึก</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sent Document Modal (ลงทะเบียนเลขหนังสือส่ง / แก้ไขหนังสือส่ง — ตามภาพที่สาม) ── */}
      {isSentModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-[#212226] rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[min(88vh,calc(100dvh-2.5rem))] my-auto border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 flex justify-between items-center px-5 py-3.5 bg-[#13795b] text-white">
              <div className="flex items-center gap-2">
                <FaPaperPlane className="text-white/90" size={16} />
                <h2 className="text-base sm:text-lg font-bold">
                  {sentModalMode === "create" ? "ลงทะเบียนเลขหนังสือส่ง" : "แก้ไขข้อมูลหนังสือส่ง"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSentModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <FaTimes size={18} />
              </button>
            </div>

            {/* Body Form */}
            <div className="flex-grow p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    เลขทะเบียนส่ง <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={sentFormNo}
                    onChange={(e) => setSentFormNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น 249 หรือ 249/2569"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ที่ (เลขที่หนังสือ)
                  </label>
                  <input
                    type="text"
                    value={sentFormDocRefNo}
                    onChange={(e) => setSentFormDocRefNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น ศธ 04305.030/249"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ลงวันที่ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={sentFormDocDate}
                    onChange={(e) => setSentFormDocDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">ความเร่งด่วน</label>
                  <select
                    value={sentFormUrgency}
                    onChange={(e) => setSentFormUrgency(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {Object.entries(URGENCY_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">จาก</label>
                  <input
                    type="text"
                    list="sent-from-list"
                    value={sentFormFrom}
                    onChange={(e) => setSentFormFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น โรงเรียนไชยวานวิทยาคม, ผอ., นายทะเบียน"
                  />
                  <datalist id="sent-from-list">
                    {schoolName && <option value={schoolName.startsWith("โรงเรียน") ? schoolName : `โรงเรียน${schoolName}`} />}
                    {schoolAbbreviation && <option value={`รร.${schoolAbbreviation}`} />}
                    <option value="นายทะเบียน" />
                    <option value="ผอ." />
                    <option value="กลุ่มบริหารวิชาการ" />
                    <option value="กลุ่มบริหารงานบุคคล" />
                    <option value="กลุ่มบริหารทั่วไป" />
                  </datalist>
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">ถึง (หน่วยงาน/ผู้รับ)</label>
                  <input
                    type="text"
                    value={sentFormTo}
                    onChange={(e) => setSentFormTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น อบต, สพม., ผู้ปกครองนักเรียน"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  เรื่อง <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={sentFormSubject}
                  onChange={(e) => setSentFormSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="ระบุชื่อเรื่องหนังสือส่ง..."
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  แนบไฟล์หนังสือส่ง (PDF หรือรูปภาพ)
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setSentFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950/30 dark:file:text-emerald-400"
                />
                {sentExistingFileUrl && !sentFile && (
                  <div className="mt-1 flex items-center gap-2">
                    <a
                      href={sentExistingFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <FaEye size={12} />
                      <span>เปิดดูไฟล์แนบเดิม</span>
                    </a>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">หมายเหตุ</label>
                <textarea
                  rows={2}
                  value={sentFormNotes}
                  onChange={(e) => setSentFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="(ไม่บังคับ)"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2.5 bg-gray-50 dark:bg-[#212226]">
              <button
                type="button"
                onClick={() => setIsSentModalOpen(false)}
                className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors cursor-pointer text-xs sm:text-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveSentModal}
                disabled={isSavingSent}
                className="px-5 py-2 rounded-lg bg-[#13795b] hover:bg-[#0f6249] text-white font-bold shadow transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer text-xs sm:text-sm"
              >
                {isSavingSent ? (
                  "กำลังบันทึก..."
                ) : (
                  <>
                    <FaSave size={14} />
                    <span>บันทึก</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Received Document Modal (ลงทะเบียนเลขหนังสือรับ / แก้ไขหนังสือรับ — ตามภาพที่สี่) ── */}
      {isReceivedModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-[#212226] rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[min(88vh,calc(100dvh-2.5rem))] my-auto border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 flex justify-between items-center px-5 py-3.5 bg-[#13795b] text-white">
              <div className="flex items-center gap-2">
                <FaInbox className="text-white/90" size={16} />
                <h2 className="text-base sm:text-lg font-bold">
                  {receivedModalMode === "create" ? "ลงทะเบียนเลขหนังสือรับ" : "แก้ไขข้อมูลหนังสือรับ"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsReceivedModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <FaTimes size={18} />
              </button>
            </div>

            {/* Body Form */}
            <div className="flex-grow p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    เลขทะเบียนรับ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={receivedFormNo}
                    onChange={(e) => setReceivedFormNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น 1051"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ที่ (เลขที่หนังสือต้นทาง)
                  </label>
                  <input
                    type="text"
                    value={receivedFormDocRefNo}
                    onChange={(e) => setReceivedFormDocRefNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น นพ 0418/2412 หรือ ศธ 04305/3960"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ลงวันที่ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={receivedFormDocDate}
                    onChange={(e) => setReceivedFormDocDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ผู้ปฏิบัติ / กลุ่มงาน / แผนก
                  </label>
                  <input
                    type="text"
                    value={receivedFormDepartment}
                    onChange={(e) => setReceivedFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น กลุ่มบริหารทั่วไป, วิชาการ"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    จาก (หน่วยงานต้นทาง)
                  </label>
                  <input
                    type="text"
                    value={receivedFormFrom}
                    onChange={(e) => setReceivedFormFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น สพม.นพ., อ.ท่าอุเทน, อบต.ไชยบุรี"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ถึง (ผู้รับ / โรงเรียน)
                  </label>
                  <input
                    type="text"
                    value={receivedFormTo}
                    onChange={(e) => setReceivedFormTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น ผอ. ร.ร. ช.บ.ว., ช.บ.ว."
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  เรื่อง <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={receivedFormSubject}
                  onChange={(e) => setReceivedFormSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="ระบุชื่อเรื่องหนังสือรับ..."
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  แนบไฟล์หนังสือรับ (PDF หรือรูปภาพ)
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setReceivedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950/30 dark:file:text-emerald-400"
                />
                {receivedExistingFileUrl && !receivedFile && (
                  <div className="mt-1 flex items-center gap-2">
                    <a
                      href={receivedExistingFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <FaEye size={12} />
                      <span>เปิดดูไฟล์แนบเดิม</span>
                    </a>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">หมายเหตุ</label>
                <textarea
                  rows={2}
                  value={receivedFormNotes}
                  onChange={(e) => setReceivedFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="(ไม่บังคับ)"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2.5 bg-gray-50 dark:bg-[#212226]">
              <button
                type="button"
                onClick={() => setIsReceivedModalOpen(false)}
                className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors cursor-pointer text-xs sm:text-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveReceivedModal}
                disabled={isSavingReceived}
                className="px-5 py-2 rounded-lg bg-[#13795b] hover:bg-[#0f6249] text-white font-bold shadow transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer text-xs sm:text-sm"
              >
                {isSavingReceived ? (
                  "กำลังบันทึก..."
                ) : (
                  <>
                    <FaSave size={14} />
                    <span>บันทึก</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Memo Document Modal (ลงทะเบียนเลขบันทึกข้อความ / แก้ไขบันทึกข้อความ) ── */}
      {isMemoModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-[#212226] rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[min(88vh,calc(100dvh-2.5rem))] my-auto border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 flex justify-between items-center px-5 py-3.5 bg-[#13795b] text-white">
              <div className="flex items-center gap-2">
                <FaStickyNote className="text-white/90" size={16} />
                <h2 className="text-base sm:text-lg font-bold">
                  {memoModalMode === "create" ? "ลงทะเบียนเลขบันทึกข้อความ" : "แก้ไขบันทึกข้อความ"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsMemoModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <FaTimes size={18} />
              </button>
            </div>

            {/* Body Form */}
            <div className="flex-grow p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    เลขที่บันทึกข้อความ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={memoFormNo}
                    onChange={(e) => setMemoFormNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น 0001/2569 หรือ ช.ว. 0001/2569"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ลงวันที่ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={memoFormDocDate}
                    onChange={(e) => setMemoFormDocDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">จาก</label>
                  <input
                    type="text"
                    value={memoFormFrom}
                    onChange={(e) => setMemoFormFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="ผู้เสนอ / กลุ่มสาระฯ / ฝ่ายงาน"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">เรียน</label>
                  <input
                    type="text"
                    value={memoFormTo}
                    onChange={(e) => setMemoFormTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น ผู้อำนวยการโรงเรียน"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  เรื่อง <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={memoFormSubject}
                  onChange={(e) => setMemoFormSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="ระบุเรื่องบันทึกข้อความ..."
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  แนบไฟล์บันทึกข้อความ (PDF หรือรูปภาพ)
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setMemoFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950/30 dark:file:text-emerald-400"
                />
                {memoExistingFileUrl && !memoFile && (
                  <div className="mt-1 flex items-center gap-2">
                    <a
                      href={memoExistingFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <FaEye size={12} />
                      <span>เปิดดูไฟล์แนบเดิม</span>
                    </a>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">หมายเหตุ</label>
                <textarea
                  rows={2}
                  value={memoFormNotes}
                  onChange={(e) => setMemoFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="(ไม่บังคับ)"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2.5 bg-gray-50 dark:bg-[#212226]">
              <button
                type="button"
                onClick={() => setIsMemoModalOpen(false)}
                className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors cursor-pointer text-xs sm:text-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveMemoModal}
                disabled={isSavingMemo}
                className="px-5 py-2 rounded-lg bg-[#13795b] hover:bg-[#0f6249] text-white font-bold shadow transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer text-xs sm:text-sm"
              >
                {isSavingMemo ? (
                  "กำลังบันทึก..."
                ) : (
                  <>
                    <FaSave size={14} />
                    <span>บันทึก</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ลงทะเบียน / แก้ไขเลขเกียรติบัตร */}
      {isHonorCertModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-xl overflow-hidden flex flex-col max-h-[min(88vh,calc(100dvh-2.5rem))] my-auto">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 bg-gradient-to-r from-emerald-600 via-[#13795b] to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <FaAward size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    {honorCertModalMode === "create" ? "ลงทะเบียนเลขเกียรติบัตรใหม่" : "แก้ไขทะเบียนเลขเกียรติบัตร"}
                  </h3>
                  <p className="text-xs text-emerald-100 font-light">
                    {honorCertModalMode === "create"
                      ? "ออกชุดเลขและบันทึกข้อมูลกิจกรรมเกียรติบัตร"
                      : `แก้ไขข้อมูล ID: ${honorCertFormId}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHonorCertModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <FaTimes size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ID
                  </label>
                  <input
                    type="text"
                    disabled
                    value={honorCertFormId}
                    className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 outline-none select-all"
                  />
                  <span className="text-[11px] text-gray-400 mt-0.5 block">
                    * รหัสระบุรายการอ้างอิงอัตโนมัติ
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ปี พ.ศ. <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={honorCertFormYear}
                    onChange={(e) => setHonorCertFormYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น 2568 หรือ 2569"
                  />
                </div>
              </div>

              {/* ช่วงเลขที่เกียรติบัตร */}
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-[#212226] border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <FaAward className="text-amber-500" />
                  <span>ช่วงเลขที่เกียรติบัตร</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      เลขที่เริ่มต้น <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={honorCertFormStartNo}
                      onChange={(e) => handleStartNoChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                      placeholder="เช่น 1"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      จำนวน (ใบ)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={honorCertFormAmount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="เช่น 36 หรือ 325"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      เลขที่สิ้นสุด <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={honorCertFormEndNo}
                      onChange={(e) => handleEndNoChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#1a1b1e] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                      placeholder="เช่น 36 หรือ 1400"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  ให้ไว้ ณ วันที่ <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="date"
                    value={honorCertFormDocDate}
                    onChange={(e) => setHonorCertFormDocDate(e.target.value)}
                    className="w-full sm:w-1/2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  {honorCertFormDocDate && (
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 rounded-md">
                      {formatThaiFullDate(honorCertFormDocDate)}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  ชื่อกิจกรรม <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={honorCertFormActivity}
                  onChange={(e) => setHonorCertFormActivity(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="เช่น กิจกรรมวันวิทยาศาสตร์แห่งชาติ, ปลูกป่าบ้านนาเพียง"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  ผู้รับผิดชอบ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  list="teachers-honor-cert-list"
                  value={honorCertFormResponsible}
                  onChange={(e) => setHonorCertFormResponsible(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="เช่น ครูสมฤดี, ครูธนรรณ์"
                />
                <datalist id="teachers-honor-cert-list">
                  {teachers.map((t) => (
                    <option key={t.id} value={t.displayName} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  แนบไฟล์ (PDF หรือรูปภาพ)
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setHonorCertFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950/30 dark:file:text-emerald-400 cursor-pointer"
                />
                {honorCertExistingFileUrl && !honorCertFile && (
                  <div className="mt-1 flex items-center gap-2">
                    <a
                      href={honorCertExistingFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <FaEye size={12} />
                      <span>เปิดดูไฟล์แนบเดิม</span>
                    </a>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  หมายเหตุ
                </label>
                <textarea
                  rows={2}
                  value={honorCertFormNotes}
                  onChange={(e) => setHonorCertFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="(ไม่บังคับ) ระบุหมายเหตุเพิ่มเติม"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2.5 bg-gray-50 dark:bg-[#212226]">
              <button
                type="button"
                onClick={() => setIsHonorCertModalOpen(false)}
                className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors cursor-pointer text-xs sm:text-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveHonorCertModal}
                disabled={isSavingHonorCert}
                className="px-5 py-2 rounded-lg bg-[#13795b] hover:bg-[#0f6249] text-white font-bold shadow transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer text-xs sm:text-sm"
              >
                {isSavingHonorCert ? (
                  "กำลังบันทึก..."
                ) : (
                  <>
                    <FaSave size={14} />
                    <span>บันทึก</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </GeneralAffairsLayout>
  );
};

export default DocumentRegistryPage;
