import React, { useEffect, useState, useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { firestore, auth } from "@/firebase";
import {
  collection,
  collectionGroup,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  doc,
  getDoc,
  query,
  orderBy,
  limit,
  where,
  getDocs,
} from "firebase/firestore";
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
} from "react-icons/fa";
import Swal from "sweetalert2";

type TabKey = "received" | "sent" | "orders" | "announcements" | "certificates" | "memos";

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
  "ฝ่ายบริหาร": "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
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
};

const toMs = (v: any): number => (v?.toDate ? v.toDate().getTime() : 0);
const toDateLabel = (v: any): string =>
  v?.toDate ? v.toDate().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

const DocumentRegistryPage: React.FC = () => {
  const { schoolId: reduxSchoolId, currentAcademicYear: reduxYear } = useSelector(
    (state: RootState) => state.schoolSettings
  );

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolAbbreviation, setSchoolAbbreviation] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  const effectiveSchoolId = schoolId || reduxSchoolId;

  const [activeTab, setActiveTab] = useState<TabKey>("received");
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Edit modal (ทะเบียนหนังสือรับ — เติม ที่/จาก/ถึง/ผู้ปฏิบัติ ย้อนหลังได้) ──
  const [editingRow, setEditingRow] = useState<RegistryRow | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editDocRefNo, setEditDocRefNo] = useState("");
  const [editDocDate, setEditDocDate] = useState("");
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editDepartment, setEditDepartment] = useState("");

  const [rows, setRows] = useState<Record<TabKey, RegistryRow[]>>({
    received: [],
    sent: [],
    orders: [],
    announcements: [],
    certificates: [],
    memos: [],
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
      const abbr = schoolSnap.exists() ? schoolSnap.data().schoolAbbreviation || "" : "";
      setSchoolAbbreviation(abbr);

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
      const [receivedRes, sentRes, ordersRes, announcementsRes, certificatesRes, memosRes] = await Promise.allSettled([
        loadReceived(sId),
        loadSent(sId),
        loadOrders(sId),
        loadAnnouncements(sId),
        loadCertificates(sId),
        loadMemos(sId),
      ]);

      const received = receivedRes.status === "fulfilled" ? receivedRes.value : [];
      const sent = sentRes.status === "fulfilled" ? sentRes.value : [];
      const orders = ordersRes.status === "fulfilled" ? ordersRes.value : [];
      const announcements = announcementsRes.status === "fulfilled" ? announcementsRes.value : [];
      const certificates = certificatesRes.status === "fulfilled" ? certificatesRes.value : [];
      const memos = memosRes.status === "fulfilled" ? memosRes.value : [];

      if (receivedRes.status === "rejected") console.warn("Could not load received documents:", receivedRes.reason);
      if (sentRes.status === "rejected") console.warn("Could not load sent documents:", sentRes.reason);
      if (ordersRes.status === "rejected") console.warn("Could not load orders:", ordersRes.reason);
      if (announcementsRes.status === "rejected") console.warn("Could not load announcements:", announcementsRes.reason);
      if (certificatesRes.status === "rejected") console.warn("Could not load certificates:", certificatesRes.reason);
      if (memosRes.status === "rejected") console.warn("Could not load memos:", memosRes.reason);

      setRows({ received, sent, orders, announcements, certificates, memos });
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
      const receivedTime = v.time ? ` ${v.time} น.` : "";
      return {
        id: d.id,
        no: v.receiveNo || "-",
        subject: v.subject || "-",
        dateLabel: `${v.date || toDateLabel(v.createdAt)}${receivedTime}`,
        sortMs: toMs(v.createdAt),
        extra: v.createdBy || "",
        status: v.status === "approved" ? "อนุมัติแล้ว" : "รอดำเนินการ",
        docRefNo: v.docRefNo || "",
        docDate: v.docDate || "",
        from: v.from || "",
        to: v.to || "",
        department: v.department || "",
        fileUrl: v.previewImageUrl || (Array.isArray(v.imageUrls) ? v.imageUrls[0] : null) || null,
      };
    });
  };

  const loadSent = async (sId: string): Promise<RegistryRow[]> => {
    const snap = await getDocs(
      query(collection(firestore, "school-settings", sId, "sentDocuments"), orderBy("createdAt", "desc"), limit(300))
    );
    return snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        no: v.sendNo || "-",
        subject: v.subject || "-",
        dateLabel: toDateLabel(v.createdAt),
        sortMs: toMs(v.createdAt),
        extra: v.to ? `ถึง: ${v.to}` : "",
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
        no: v.orderNo || "-",
        subject: v.subject || "-",
        dateLabel: toDateLabel(v.createdAt),
        sortMs: toMs(v.createdAt),
        extra: [v.orderType, v.signedBy].filter(Boolean).join(" · "),
      };
    });

    let travelRows: RegistryRow[] = [];
    try {
      const travelSnap = await getDocs(
        query(collectionGroup(firestore, "travel_summary"), where("schoolId", "==", sId))
      );
      // เฉพาะคำสั่งที่อนุมัติ/ลงนามแล้วเท่านั้นถือเป็น "คำสั่ง" จริง — คำขอที่ยัง pending/rejected ยังไม่นับ
      travelRows = travelSnap.docs
        .filter((d) => d.data().docNo && d.data().status === "approved")
        .map((d) => {
        const v = d.data();
        return {
          id: `travel-${d.id}`,
          no: v.docNo || "-",
          subject: `คำสั่งไปราชการ: ${v.subject || "-"}`,
          dateLabel: toDateLabel(v.createdAt),
          sortMs: toMs(v.createdAt),
          extra: v.requesterName || "",
        };
      });
    } catch (error) {
      console.error("Error loading travel orders:", error);
    }

    let leaveRows: RegistryRow[] = [];
    try {
      const leaveSnap = await getDocs(
        query(collectionGroup(firestore, "leave_summary"), where("schoolId", "==", sId))
      );
      // เฉพาะคำสั่งที่อนุมัติ/ลงนามแล้วเท่านั้นถือเป็น "คำสั่ง" จริง — คำขอที่ยัง pending/rejected ยังไม่นับ
      leaveRows = leaveSnap.docs
        .filter((d) => {
          const v = d.data();
          const isApproved = v.status === "approved" || (v.status === "substitution_assigned" && !!v.approvedBy);
          return v.docNo && isApproved;
        })
        .map((d) => {
          const v = d.data();
          return {
            id: `leave-${d.id}`,
            no: v.docNo || "-",
            subject: `คำสั่งอนุญาตลา${v.leaveType ? " " + v.leaveType : ""}: ${v.reason || "-"}`,
            dateLabel: toDateLabel(v.createdAt),
            sortMs: toMs(v.createdAt),
            extra: v.teacherName || "",
          };
        });
    } catch (error) {
      console.error("Error loading leave orders:", error);
    }

    return [...manualRows, ...travelRows, ...leaveRows].sort((a, b) => b.sortMs - a.sortMs);
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
    const snap = await getDocs(
      query(collection(firestore, "school-settings", sId, "memos"), orderBy("createdAt", "desc"), limit(300))
    );
    return snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        no: v.memoNo || "-",
        subject: v.subject || "-",
        dateLabel: toDateLabel(v.createdAt),
        sortMs: toMs(v.createdAt),
        extra: v.to ? `เรียน: ${v.to}` : "",
      };
    });
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
          dateLabel: toDateLabel(v.createdAt),
          sortMs: toMs(v.createdAt),
          extra: [
            v.recipient ? `ผู้ขอ: ${v.recipient}` : "",
            v.certType,
            v.purpose ? `วัตถุประสงค์: ${v.purpose}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          status: v.signedBy ? `ผู้ลงนาม: ${v.signedBy}` : undefined,
        };
      })
      .sort((a, b) => b.sortMs - a.sortMs);
  };

  // -----------------------------
  // ออกเลขทะเบียนถัดไป (รูปแบบเดียวกับ receiveNo ของ GeneralAffairsPage)
  // -----------------------------
  const getNextRunningNo = async (collectionName: string, fieldName: string): Promise<string> => {
    const sId = effectiveSchoolId;
    if (!sId) return "0001";
    const yearToUse = academicYear || reduxYear || (new Date().getFullYear() + 543).toString();
    const colRef = collection(firestore, "school-settings", sId, collectionName);
    const snap = await getDocs(query(colRef, orderBy("createdAt", "desc"), limit(1)));
    let nextNumber = 1;
    if (!snap.empty) {
      const last = snap.docs[0].data();
      const lastNo = String(last[fieldName] || "");
      const match = lastNo.match(/(\d+)\/(\d{4})/);
      if (match) {
        const lastNum = parseInt(match[1], 10);
        const lastYear = match[2];
        nextNumber = lastYear === yearToUse ? lastNum + 1 : 1;
      }
    }
    const formattedNum = String(nextNumber).padStart(4, "0");
    return `${schoolAbbreviation} ${formattedNum}/${yearToUse}`.trim();
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
    resetForm();
    if (activeTab === "certificates") {
      setFormSubject(CERTIFICATE_TYPES[0]);
    }
    setIsFormOpen(true);
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
    const list = rows[activeTab] || [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (r) =>
        r.no.toLowerCase().includes(term) ||
        r.subject.toLowerCase().includes(term) ||
        (r.docRefNo || "").toLowerCase().includes(term) ||
        (r.from || "").toLowerCase().includes(term) ||
        (r.to || "").toLowerCase().includes(term)
    );
  }, [rows, activeTab, searchTerm]);

  // รีเซ็ตกลับหน้า 1 ทุกครั้งที่เปลี่ยนแท็บ/ค้นหา/ขนาดหน้า ไม่งั้นอาจค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRows, currentPage, pageSize]
  );

  const canCreateInTab = activeTab !== "received"; // หนังสือรับออกเลขที่หน้า GeneralAffairsPage อยู่แล้ว

  // ── ทะเบียนหนังสือรับ: แก้ไขข้อมูล (เติม ที่/จาก/ถึง/ผู้ปฏิบัติ) และลบรายการ ──
  const openEditReceived = (row: RegistryRow) => {
    setEditingRow(row);
    setEditDocRefNo(row.docRefNo || "");
    setEditDocDate(row.docDate || "");
    setEditFrom(row.from || "");
    setEditTo(row.to || "");
    setEditDepartment(row.department || "");
  };

  const handleSaveEditReceived = async () => {
    if (!editingRow || !effectiveSchoolId) return;
    setIsSavingEdit(true);
    try {
      await updateDoc(doc(firestore, "school-settings", effectiveSchoolId, "stampedDocuments", editingRow.id), {
        docRefNo: editDocRefNo.trim(),
        docDate: editDocDate.trim(),
        from: editFrom.trim(),
        to: editTo.trim(),
        department: editDepartment,
      });
      Swal.fire({ icon: "success", title: "บันทึกสำเร็จ", toast: true, position: "top-end", showConfirmButton: false, timer: 1500 });
      setEditingRow(null);
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error updating registry entry:", error);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", confirmButtonColor: "#4f46e5" });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteReceived = async (row: RegistryRow) => {
    if (!effectiveSchoolId) return;
    const result = await Swal.fire({
      icon: "warning",
      title: "ยืนยันการลบ",
      text: `ต้องการลบรายการ "${row.subject}" ออกจากทะเบียนหนังสือรับใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;
    try {
      await deleteDoc(doc(firestore, "school-settings", effectiveSchoolId, "stampedDocuments", row.id));
      Swal.fire({ icon: "success", title: "ลบรายการแล้ว", toast: true, position: "top-end", showConfirmButton: false, timer: 1500 });
      loadAll(effectiveSchoolId);
    } catch (error) {
      console.error("Error deleting registry entry:", error);
      Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", confirmButtonColor: "#4f46e5" });
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300">
        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#111318]/95 backdrop-blur border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton to="/general-affairs/home" />
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">งานธุรการ</p>
              <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">ทะเบียนหนังสือ</h1>
            </div>
          </div>
          {canCreateInTab && (
            <button
              onClick={openForm}
              disabled={!schoolId}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 text-xs font-black text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
            >
              <FaPlus size={12} /> ออกเลขใหม่
            </button>
          )}
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {(Object.keys(TAB_CONFIG) as TabKey[]).map((key) => {
              const cfg = TAB_CONFIG[key];
              const isActive = activeTab === key;
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
                    {rows[key].length} รายการ
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table card */}
          <div className="bg-white dark:bg-[#212226] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* หัวตารางสีเขียว — เฉพาะทะเบียนหนังสือรับ */}
            {activeTab === "received" && (
              <div className="bg-emerald-600 px-5 py-3 flex items-center gap-2">
                <FaInbox className="text-white/80" size={14} />
                <h2 className="text-sm font-black text-white">
                  ทะเบียนหนังสือรับ ปี {academicYear || (new Date().getFullYear() + 543)}
                </h2>
              </div>
            )}

            {/* Controls: page size + search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>แสดง</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-[#1a1b1e] border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>รายการ</span>
              </div>
              <div className="relative w-full sm:w-80">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                <input
                  type="text"
                  placeholder="ค้นหาเลขที่ ที่ จาก/ถึง หรือเรื่อง..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2 bg-gray-50 dark:bg-[#1a1b1e] border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#1a1b1e] text-left text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                    {activeTab === "received" ? (
                      <>
                        <th className="px-4 py-3 whitespace-nowrap">เลขทะเบียนรับ</th>
                        <th className="px-4 py-3 whitespace-nowrap">ที่</th>
                        <th className="px-4 py-3 whitespace-nowrap">ลงวันที่</th>
                        <th className="px-4 py-3 whitespace-nowrap">จาก</th>
                        <th className="px-4 py-3 whitespace-nowrap">ถึง</th>
                        <th className="px-4 py-3">เรื่อง</th>
                        <th className="px-4 py-3 whitespace-nowrap">วันเวลาที่รับ</th>
                        <th className="px-4 py-3 whitespace-nowrap">ผู้ปฏิบัติ</th>
                        <th className="px-4 py-3 text-center whitespace-nowrap">ไฟล์</th>
                        <th className="px-4 py-3 text-center whitespace-nowrap">แก้ไข</th>
                        <th className="px-4 py-3 text-center whitespace-nowrap">ลบ</th>
                      </>
                    ) : (
                      <>
                        <th className="px-5 py-3 whitespace-nowrap">เลขที่</th>
                        <th className="px-5 py-3">เรื่อง</th>
                        <th className="px-5 py-3 whitespace-nowrap">วันที่</th>
                        <th className="px-5 py-3 whitespace-nowrap">รายละเอียดเพิ่มเติม</th>
                        {activeTab === "sent" ? (
                          <th className="px-5 py-3 whitespace-nowrap">สถานะ</th>
                        ) : activeTab === "certificates" ? (
                          <th className="px-5 py-3 whitespace-nowrap">ผู้ลงนาม</th>
                        ) : null}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center text-gray-400">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center text-gray-400">
                        ไม่พบรายการในทะเบียนนี้
                      </td>
                    </tr>
                  ) : activeTab === "received" ? (
                    pagedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap">{row.no}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{row.docRefNo || "-"}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{row.docDate || "-"}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{row.from || "-"}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{row.to || "-"}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200 max-w-xs">{row.subject}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{row.dateLabel}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><DepartmentBadge department={row.department} /></td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {row.fileUrl ? (
                            <a
                              href={row.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                              title="ดูไฟล์เอกสาร"
                            >
                              <FaFileImage size={14} />
                            </a>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => openEditReceived(row)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
                            title="แก้ไข"
                          >
                            <FaEdit size={14} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleDeleteReceived(row)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                            title="ลบ"
                          >
                            <FaTrashAlt size={14} />
                          </button>
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
                        {activeTab === "sent" ? (
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                              {row.status || "-"}
                            </span>
                          </td>
                        ) : activeTab === "certificates" ? (
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
                            {row.status || "-"}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!isLoading && filteredRows.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  หน้า {currentPage} จาก {totalPages} ({filteredRows.length} รายการ)
                </span>
                <div className="flex items-center gap-2">
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
      </div>

      {/* ── Create Entry Modal ── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
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

      {/* ── Edit modal: ทะเบียนหนังสือรับ (ที่ / ลงวันที่ / จาก / ถึง / ผู้ปฏิบัติ) ── */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0 flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">แก้ไขข้อมูลทะเบียนหนังสือรับ</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  เลขทะเบียนรับ {editingRow.no} — {editingRow.subject}
                </p>
              </div>
              <button
                onClick={() => setEditingRow(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
              >
                <FaTimes size={20} />
              </button>
            </div>

            <div className="flex-grow p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ที่</label>
                  <input
                    type="text"
                    value={editDocRefNo}
                    onChange={(e) => setEditDocRefNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    placeholder="เช่น ศธ 04305/ว3855"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ลงวันที่</label>
                  <input
                    type="text"
                    value={editDocDate}
                    onChange={(e) => setEditDocDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    placeholder="เช่น 7 กันยายน 2569"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">จาก</label>
                <input
                  type="text"
                  value={editFrom}
                  onChange={(e) => setEditFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="หน่วยงานต้นทาง เช่น สพม.นว"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ถึง</label>
                <input
                  type="text"
                  value={editTo}
                  onChange={(e) => setEditTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="เช่น ผอ.รร."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ผู้ปฏิบัติ (แผนกที่รับผิดชอบ)</label>
                <select
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                >
                  <option value="">ไม่ระบุ</option>
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-shrink-0 p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-[#2a2b2f]">
              <button
                onClick={() => setEditingRow(null)}
                className="px-5 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveEditReceived}
                disabled={isSavingEdit}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-70"
              >
                {isSavingEdit ? "กำลังบันทึก..." : (<><FaSave size={16} /> บันทึก</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default DocumentRegistryPage;
