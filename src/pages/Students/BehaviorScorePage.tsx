import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, auth } from "@/firebase";
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  serverTimestamp,
  where,
  limit
} from "firebase/firestore";
import { 
  Search, 
  Filter, 
  Plus, 
  Minus, 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  History, 
  Check, 
  X, 
  AlertTriangle, 
  Info, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ClipboardList,
  SlidersHorizontal,
  ChevronDown
} from "lucide-react";
import Swal from 'sweetalert2';
import { getLevelsByRange } from "@/utils/schoolUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { useTheme } from "@/ThemeContext";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { getRulePoints, getBehaviorAttendanceStatusKey, getBehaviorFlagCeremonyStatusKey, getSpecialPeriodRulePoints } from "@/utils/behaviorScoreUtils";

interface Student {
  id: string;
  profileImageUrl?: string;
  studentId: string;
  title: string;
  firstName: string;
  lastName: string;
  classLevel: string;
  room: string;
  schoolId: string;
  studentStatus: string;
  behaviorScore?: number;
  studentNumber?: string;
}

interface BehaviorLog {
  id: string;
  type: string;
  title: string;
  category: string;
  action: string;
  points: number;
  previousScore: number;
  nextScore: number;
  notes: string;
  createdBy: string;
  createdAt: any;
  academicYear: string;
  behaviorStatus?: string;
}

interface BehaviorScoreRule {
  id: string;
  title: string;
  category: string;
  type: "increase" | "decrease";
  points: number;
  isActive?: boolean;
}

const DEFAULT_BEHAVIOR_RULES: BehaviorScoreRule[] = [
  { id: "late-class", title: "เข้าเรียนสาย", category: "การมาเรียน", type: "decrease", points: 5, isActive: true },
  { id: "skip-class", title: "ขาดเรียน/หนีเรียน", category: "การมาเรียน", type: "decrease", points: 10, isActive: true },
  { id: "volunteer", title: "ช่วยงานโรงเรียน/จิตอาสา", category: "ความดี", type: "increase", points: 10, isActive: true },
];

export default function BehaviorScorePage() {
  const { schoolId: paramSchoolId } = useParams<{ schoolId: string }>();
  const { user: currentUser, STAFF_ACCESS, ACADEMIC_ACCESS } = usePermissions();
  const { isDarkMode } = useTheme();

  const [schoolId, setSchoolId] = useState<string | null>(paramSchoolId || null);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'warn' | 'low'>('all');

  // Multi-Selection State
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Behavior Score Config (for auto-deduction lookup)
  const [behaviorScoreConfig, setBehaviorScoreConfig] = useState<any>(null);

  // Modal States
  const [activeAdjustStudent, setActiveAdjustStudent] = useState<Student | null>(null);
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [studentHistoryLogs, setStudentHistoryLogs] = useState<BehaviorLog[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'manual' | 'attendance' | 'flag' | 'classroom' | 'special'>('all');
  const [historyPage, setHistoryPage] = useState(1);

  // Form States for Modal
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('deduct');
  const [adjustPoints, setAdjustPoints] = useState<number>(5);
  const [adjustRuleId, setAdjustRuleId] = useState<string>("");
  const [customPointsMode, setCustomPointsMode] = useState<boolean>(false);
  const [customPointsVal, setCustomPointsVal] = useState<string>("");
  const [adjustCategory, setAdjustCategory] = useState<string>("พฤติกรรมทั่วไป");
  const [adjustNotes, setAdjustNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Form States
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkType, setBulkType] = useState<'add' | 'deduct'>('deduct');
  const [bulkPoints, setBulkPoints] = useState<number>(5);
  const [bulkRuleId, setBulkRuleId] = useState<string>("");
  const [bulkCustomMode, setBulkCustomMode] = useState<boolean>(false);
  const [bulkCustomPointsVal, setBulkCustomPointsVal] = useState<string>("");
  const [bulkCategory, setBulkCategory] = useState<string>("พฤติกรรมทั่วไป");
  const [bulkNotes, setBulkNotes] = useState<string>("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [behaviorRules, setBehaviorRules] = useState<BehaviorScoreRule[]>(DEFAULT_BEHAVIOR_RULES);

  // Fetch schoolId from auth context if parameter not present
  useEffect(() => {
    if (!schoolId && currentUser) {
      const sId = (currentUser as any).schoolId;
      if (sId) setSchoolId(sId);
    }
  }, [currentUser, schoolId]);

  // Fetch school levels for filtering
  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levels = getLevelsByRange(data.opportunityExpansionLevel);
          setAvailableLevels(levels);
          setBehaviorScoreConfig(data.behaviorScoreConfig || null);
          const savedRules = data.behaviorScoreConfig?.rules;
          if (Array.isArray(savedRules) && savedRules.length > 0) {
            const normalizedRules = savedRules
              .map((rule: Partial<BehaviorScoreRule>, index: number): BehaviorScoreRule => ({
                id: rule.id || `rule-${index + 1}`,
                title: String(rule.title || "").trim(),
                category: String(rule.category || "").trim() || "พฤติกรรมทั่วไป",
                type: rule.type === "increase" ? "increase" : "decrease",
                points: Math.max(1, Number(rule.points) || 1),
                isActive: rule.isActive !== false,
              }))
              .filter((rule) => Boolean(rule.title) && rule.isActive !== false);
            setBehaviorRules(normalizedRules.length > 0 ? normalizedRules : DEFAULT_BEHAVIOR_RULES);
          } else {
            setBehaviorRules(DEFAULT_BEHAVIOR_RULES);
          }
        }
      } catch (error) {
        console.error("Error fetching school levels:", error);
      }
    };
    fetchLevels();
  }, [schoolId]);

  const activeAdjustRules = useMemo(
    () => behaviorRules.filter((rule) => rule.type === (adjustType === "add" ? "increase" : "decrease")),
    [adjustType, behaviorRules]
  );
  const activeBulkRules = useMemo(
    () => behaviorRules.filter((rule) => rule.type === (bulkType === "add" ? "increase" : "decrease")),
    [behaviorRules, bulkType]
  );
  const filteredHistoryLogs = useMemo(() => {
    setHistoryPage(1);
    if (historyTypeFilter === 'manual')     return studentHistoryLogs.filter(l => l.type === 'activity_adjust');
    if (historyTypeFilter === 'attendance') return studentHistoryLogs.filter(l => l.type === 'attendance');
    if (historyTypeFilter === 'flag')       return studentHistoryLogs.filter(l => l.type === 'flag_ceremony');
    if (historyTypeFilter === 'classroom')  return studentHistoryLogs.filter(l => l.type === 'classroom');
    if (historyTypeFilter === 'special')    return studentHistoryLogs.filter(l => l.type === 'special_period');
    return studentHistoryLogs;
  }, [studentHistoryLogs, historyTypeFilter]);

  const historyPageSize = 20;
  const historyTotalPages = Math.ceil(filteredHistoryLogs.length / historyPageSize);
  const pagedHistoryLogs = filteredHistoryLogs.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize,
  );

  useEffect(() => {
    const selectedRule = activeAdjustRules.find((rule) => rule.id === adjustRuleId) || activeAdjustRules[0];
    if (!selectedRule) return;
    if (selectedRule.id !== adjustRuleId) {
      setAdjustRuleId(selectedRule.id);
    }
    setAdjustCategory(selectedRule.category);
    if (!customPointsMode) {
      setAdjustPoints(selectedRule.points);
    }
  }, [activeAdjustRules, adjustRuleId, customPointsMode]);

  useEffect(() => {
    const selectedRule = activeBulkRules.find((rule) => rule.id === bulkRuleId) || activeBulkRules[0];
    if (!selectedRule) return;
    if (selectedRule.id !== bulkRuleId) {
      setBulkRuleId(selectedRule.id);
    }
    setBulkCategory(selectedRule.category);
    if (!bulkCustomMode) {
      setBulkPoints(selectedRule.points);
    }
  }, [activeBulkRules, bulkCustomMode, bulkRuleId]);

  // Fetch Students
  const fetchStudents = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const studentsCollection = collection(firestore, "school-settings", currentSchoolId, "students");
      const q = query(studentsCollection, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const studentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Student)).filter(isStudyingStudent);
      setStudents(studentsData);
    } catch (err) {
      console.error("Error fetching students: ", err);
      setError("เกิดข้อผิดพลาดในการดึงข้อมูลนักเรียน");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (schoolId) {
      fetchStudents(schoolId);
    }
  }, [schoolId, fetchStudents]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassLevel, selectedRoom, scoreFilter]);

  // Fetch Logs for selected student (manual + attendance + flag ceremony)
  const fetchStudentLogs = async (student: Student) => {
    if (!schoolId) return;
    setIsLoadingHistory(true);
    setStudentHistoryLogs([]);
    try {
      // 1. Manual behavior logs
      const logsRef = collection(firestore, "school-settings", schoolId, "students", student.id, "behavior_logs");
      const logsQuery = query(logsRef, orderBy("createdAt", "desc"), limit(200));
      const logsSnapshot = await getDocs(logsQuery);
      const manualLogs = logsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as BehaviorLog));

      // 2. Attendance records → gate + flag ceremony auto-deductions
      const attRef = collection(firestore, "school-settings", schoolId, "students", student.id, "attendance");
      const attSnapshot = await getDocs(attRef);
      const autoLogs: BehaviorLog[] = [];

      attSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const logDate = data.date ? new Date(`${data.date}T12:00:00`) : new Date();

        // Gate attendance (สาย / ขาด / กลับก่อน / ไม่ลงเวลาออก)
        if (data.status) {
          const attPoints = getRulePoints(behaviorScoreConfig, data.status);
          if (attPoints > 0) {
            const statusKey = getBehaviorAttendanceStatusKey(data.status);
            const attTitle =
              statusKey === 'late'       ? 'มาสาย' :
              statusKey === 'absent'     ? 'ขาดเรียน (ไม่ลงเวลาเข้า)' :
              statusKey === 'early'      ? 'กลับก่อนกำหนด' :
              statusKey === 'noCheckout' ? 'ไม่ลงเวลาออก' : data.status;
            const attNote =
              statusKey === 'late'       ? 'ลงเวลาเข้าหลังเวลากำหนด' :
              statusKey === 'absent'     ? 'ไม่มีการลงเวลาเข้าภายในเวลาที่กำหนด' :
              statusKey === 'early'      ? 'ลงเวลาออกก่อนเวลาเลิกเรียน' :
              statusKey === 'noCheckout' ? 'ลงเวลาเข้าแต่ไม่มีเวลาออกเมื่อสิ้นวัน' : '';

            autoLogs.push({
              id: `att_${docSnap.id}`,
              type: "attendance",
              title: attTitle,
              category: "ลงเวลา",
              action: 'deduct',
              points: -attPoints,
              previousScore: 0,
              nextScore: 0,
              notes: attNote,
              createdBy: "ระบบอัตโนมัติ",
              createdAt: { toDate: () => logDate },
              academicYear: "",
              behaviorStatus: data.status,
            });
          }
        }

        // Flag ceremony (เช็คแถว)
        const metadata = data.metadata || {};
        const flagStatus = metadata.flagBehaviorScoreStatus || metadata.flag;
        if (flagStatus && String(flagStatus).startsWith('flag:')) {
          const flagPoints = getRulePoints(behaviorScoreConfig, flagStatus);
          if (flagPoints > 0) {
            const flagStatusKey = getBehaviorFlagCeremonyStatusKey(flagStatus);
            const flagTitle =
              flagStatusKey === 'noScanPresentDeduct' ? 'ไม่สแกนบัตรเข้าแถว' :
              flagStatusKey === 'scannedAbsentDeduct' ? 'ไม่เข้าแถว' :
              String(flagStatus).replace('flag:', '');
            const flagNote =
              flagStatusKey === 'noScanPresentDeduct' ? 'ครูยืนยันว่ามาเข้าแถว แต่ไม่ได้สแกนบัตร/บัตร Lock' :
              flagStatusKey === 'scannedAbsentDeduct' ? 'มีเวลาสแกนบัตรเข้า แต่ไม่ได้เข้าร่วมกิจกรรมเข้าแถว' : '';

            autoLogs.push({
              id: `flag_${docSnap.id}`,
              type: "flag_ceremony",
              title: flagTitle,
              category: "เข้าแถว",
              action: 'deduct',
              points: -flagPoints,
              previousScore: 0,
              nextScore: 0,
              notes: flagNote,
              createdBy: "ระบบอัตโนมัติ",
              createdAt: { toDate: () => logDate },
              academicYear: "",
              behaviorStatus: flagStatus,
            });
          }
        }
      });

      // 3. ClassroomAttendance → เช็คชื่อรายวิชา + กิจกรรมพิเศษ
      const classRef = collection(firestore, "school-settings", schoolId, "students", student.id, "ClassroomAttendance");
      const classSnapshot = await getDocs(classRef);

      classSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const logDate = data.date?.toDate ? data.date.toDate() : new Date();

        if (data.attendanceType === 'special_period') {
          // กิจกรรมพิเศษ — เฉพาะที่เปิดหักคะแนน
          if (!data.deductBehavior) return;
          const spPoints = getSpecialPeriodRulePoints(behaviorScoreConfig, data.status);
          if (spPoints > 0) {
            const spTitle =
              data.status === 'late'   ? 'เข้าร่วมสาย' :
              data.status === 'absent' ? 'ไม่เข้าร่วมกิจกรรม' :
              data.status === 'escape' ? 'หลีกเลี่ยงกิจกรรม' : data.status;
            autoLogs.push({
              id: `sp_${docSnap.id}`,
              type: "special_period",
              title: spTitle,
              category: "กิจกรรมพิเศษ",
              action: 'deduct',
              points: -spPoints,
              previousScore: 0,
              nextScore: 0,
              notes: [data.specialPeriodTitle || data.subjectName, data.className ? `ชั้น ${data.className}` : ''].filter(Boolean).join(' · '),
              createdBy: data.teacherName || "ระบบอัตโนมัติ",
              createdAt: { toDate: () => logDate },
              academicYear: data.academicYear || "",
              behaviorStatus: data.status,
            });
          }
        } else {
          // เช็คชื่อรายวิชาปกติ
          const classStatus = `class:${data.status}`;
          const classPoints = getRulePoints(behaviorScoreConfig, classStatus);
          if (classPoints > 0) {
            const classTitle =
              data.status === 'late'   ? 'เข้าเรียนสาย' :
              data.status === 'absent' ? 'ขาดเรียน' :
              data.status === 'escape' ? 'หนีเรียน' : data.status;
            autoLogs.push({
              id: `cls_${docSnap.id}`,
              type: "classroom",
              title: classTitle,
              category: "เช็คชื่อรายวิชา",
              action: 'deduct',
              points: -classPoints,
              previousScore: 0,
              nextScore: 0,
              notes: [data.subjectName, data.period ? `คาบที่ ${data.period}` : ''].filter(Boolean).join(' · '),
              createdBy: data.teacherName || "ระบบอัตโนมัติ",
              createdAt: { toDate: () => logDate },
              academicYear: data.academicYear || "",
              behaviorStatus: data.status,
            });
          }
        }
      });

      // 4. Merge and sort by date descending
      const getTime = (log: BehaviorLog) => {
        if (!log.createdAt) return 0;
        if (log.createdAt.toDate) return log.createdAt.toDate().getTime();
        if (log.createdAt.seconds) return log.createdAt.seconds * 1000;
        return new Date(log.createdAt).getTime();
      };
      const allLogs = [...manualLogs, ...autoLogs].sort((a, b) => getTime(b) - getTime(a));

      setStudentHistoryLogs(allLogs);
    } catch (err) {
      console.error("Error fetching student history logs:", err);
      toast.error("ไม่สามารถดึงข้อมูลประวัติได้");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const openHistoryModal = (student: Student) => {
    setHistoryStudent(student);
    setHistoryTypeFilter('all');
    setHistoryPage(1);
    fetchStudentLogs(student);
  };

  const openAdjustModal = (student: Student, type: 'add' | 'deduct') => {
    setActiveAdjustStudent(student);
    setAdjustType(type);
    const rulesForType = behaviorRules.filter((rule) => rule.type === (type === "add" ? "increase" : "decrease"));
    const defaultRule = rulesForType[0] || DEFAULT_BEHAVIOR_RULES.find((rule) => rule.type === (type === "add" ? "increase" : "decrease"));
    setAdjustRuleId(defaultRule?.id || "");
    setAdjustPoints(defaultRule?.points || 5);
    setCustomPointsMode(false);
    setCustomPointsVal("");
    setAdjustCategory(defaultRule?.category || "พฤติกรรมทั่วไป");
    setAdjustNotes("");
  };

  // Handle score adjustment submission (Single Student)
  const handleSubmitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !activeAdjustStudent) return;

    const pointsToApply = customPointsMode ? parseInt(customPointsVal) : adjustPoints;
    if (isNaN(pointsToApply) || pointsToApply <= 0) {
      toast.warn("กรุณาระบุจำนวนคะแนนให้ถูกต้อง (มากกว่า 0)");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedRule = activeAdjustRules.find((rule) => rule.id === adjustRuleId);
      const finalPoints = adjustType === 'add' ? pointsToApply : -pointsToApply;
      const currentScore = activeAdjustStudent.behaviorScore ?? 100;
      const nextScore = Math.max(0, currentScore + finalPoints);

      // 1. Write Log
      const logsRef = collection(firestore, "school-settings", schoolId, "students", activeAdjustStudent.id, "behavior_logs");
      await addDoc(logsRef, {
        type: "activity_adjust",
        title: selectedRule?.title || (adjustType === 'add' ? `เพิ่มคะแนนความประพฤติ (${adjustCategory})` : `หักคะแนนความประพฤติ (${adjustCategory})`),
        category: selectedRule?.category || adjustCategory,
        ruleId: selectedRule?.id || null,
        ruleType: selectedRule?.type || (adjustType === "add" ? "increase" : "decrease"),
        action: adjustType,
        points: finalPoints,
        previousScore: currentScore,
        nextScore: nextScore,
        notes: adjustNotes || (adjustType === 'add' ? "บันทึกพฤติกรรมเชิงบวก" : "บันทึกพฤติกรรมเชิงลบ"),
        createdBy: auth.currentUser?.email || auth.currentUser?.displayName || "ผู้ใช้ทั่วไป",
        createdAt: serverTimestamp(),
        academicYear: String(getCurrentThaiYear()),
      });

      // 2. Update Student Doc
      const studentDocRef = doc(firestore, "school-settings", schoolId, "students", activeAdjustStudent.id);
      await updateDoc(studentDocRef, {
        behaviorScore: nextScore
      });

      // 3. Update local state
      setStudents(prev => prev.map(s => s.id === activeAdjustStudent.id ? { ...s, behaviorScore: nextScore } : s));

      toast.success("บันทึกพฤติกรรมเรียบร้อยแล้ว", { theme: "dark" });
      setActiveAdjustStudent(null);
    } catch (err) {
      console.error("Error adjusting behavior score: ", err);
      toast.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle score adjustment (Bulk Students)
  const handleSubmitBulkAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;

    if (selectedStudentIds.length === 0) {
      toast.warn("กรุณาเลือกนักเรียนที่ต้องการบันทึกพฤติกรรมอย่างน้อย 1 คน");
      return;
    }

    const pointsToApply = bulkCustomMode ? parseInt(bulkCustomPointsVal) : bulkPoints;
    if (isNaN(pointsToApply) || pointsToApply <= 0) {
      toast.warn("กรุณาระบุจำนวนคะแนนให้ถูกต้อง (มากกว่า 0)");
      return;
    }

    const finalPoints = bulkType === 'add' ? pointsToApply : -pointsToApply;
    const selectedBulkRule = activeBulkRules.find((rule) => rule.id === bulkRuleId);

    Swal.fire({
      title: 'ยืนยันการบันทึกข้อมูลแบบกลุ่ม',
      text: `คุณกำลังบันทึกคะแนน ${bulkType === 'add' ? '+' : '-'}${pointsToApply} คะแนน ให้แก่นักเรียนที่เลือกจำนวน ${selectedStudentIds.length} คน`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันการบันทึก',
      cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f',
      color: '#ffffff'
    }).then(async (result) => {
      if (result.isConfirmed) {
        setIsSubmitting(true);
        Swal.fire({
          title: 'กำลังประมวลผล...',
          allowOutsideClick: false,
          background: '#2a2b2f',
          color: '#ffffff',
          didOpen: () => {
            Swal.showLoading();
          }
        });

        try {
          const promises = selectedStudentIds.map(async (studentId) => {
            const student = students.find(s => s.id === studentId);
            if (!student) return;

            const currentScore = student.behaviorScore ?? 100;
            const nextScore = Math.max(0, currentScore + finalPoints);

            // 1. Write Log
            const logsRef = collection(firestore, "school-settings", schoolId, "students", studentId, "behavior_logs");
            await addDoc(logsRef, {
              type: "activity_adjust",
              title: selectedBulkRule?.title || (bulkType === 'add' ? `เพิ่มคะแนนความประพฤติกลุ่ม (${bulkCategory})` : `หักคะแนนความประพฤติกลุ่ม (${bulkCategory})`),
              category: selectedBulkRule?.category || bulkCategory,
              ruleId: selectedBulkRule?.id || null,
              ruleType: selectedBulkRule?.type || (bulkType === "add" ? "increase" : "decrease"),
              action: bulkType,
              points: finalPoints,
              previousScore: currentScore,
              nextScore: nextScore,
              notes: bulkNotes || (bulkType === 'add' ? "บันทึกพฤติกรรมกลุ่มเชิงบวก" : "บันทึกพฤติกรรมกลุ่มเชิงลบ"),
              createdBy: auth.currentUser?.email || auth.currentUser?.displayName || "ผู้ใช้ทั่วไป",
              createdAt: serverTimestamp(),
              academicYear: String(getCurrentThaiYear()),
            });

            // 2. Update Doc
            const studentDocRef = doc(firestore, "school-settings", schoolId, "students", studentId);
            return updateDoc(studentDocRef, {
              behaviorScore: nextScore
            });
          });

          await Promise.all(promises);

          // Update local state
          setStudents(prev => prev.map(s => {
            if (selectedStudentIds.includes(s.id)) {
              const currentScore = s.behaviorScore ?? 100;
              const nextScore = Math.max(0, currentScore + finalPoints);
              return { ...s, behaviorScore: nextScore };
            }
            return s;
          }));

          Swal.fire({
            title: 'สำเร็จ!',
            text: `บันทึกข้อมูลเรียบร้อยแล้ว`,
            icon: 'success',
            background: '#2a2b2f',
            color: '#ffffff'
          });

          // Reset bulk state
          setSelectedStudentIds([]);
          setBulkNotes("");
          setBulkCustomPointsVal("");
          setShowBulkForm(false);
        } catch (err) {
          console.error("Error bulk adjusting score: ", err);
          Swal.fire({
            title: 'ล้มเหลว',
            text: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลแบบกลุ่ม',
            icon: 'error',
            background: '#2a2b2f',
            color: '#ffffff'
          });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  // Helper score badges
  const renderScoreBadge = (score?: number) => {
    const val = score ?? 100;
    let badgeClass = "bg-green-500/10 text-green-500 border-green-500/20";
    if (val < 50) {
      badgeClass = "bg-rose-500/10 text-rose-500 border-rose-500/20";
    } else if (val < 85) {
      badgeClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
    }

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-bold border ${badgeClass} inline-flex items-center gap-1`}>
        {val < 50 ? <ShieldAlert className="w-4 h-4" /> : val < 85 ? <Info className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
        {val} คะแนน
      </span>
    );
  };

  // Filter lists
  const filteredStudents = students.filter(student =>
    `${student.title}${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (student.studentNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  ).filter(student => {
    if (selectedClassLevel === 'ม.ต้น') return ['ม.1', 'ม.2', 'ม.3'].includes(student.classLevel);
    if (selectedClassLevel === 'ม.ปลาย') return ['ม.4', 'ม.5', 'ม.6'].includes(student.classLevel);
    return selectedClassLevel === '' || student.classLevel === selectedClassLevel;
  }).filter(student => 
    selectedRoom === '' || student.room === selectedRoom
  ).filter(student => {
    const score = student.behaviorScore ?? 100;
    if (scoreFilter === 'high') return score >= 90;
    if (scoreFilter === 'warn') return score >= 50 && score < 90;
    if (scoreFilter === 'low') return score < 50;
    return true;
  });

  // Sort students by studentNumber or studentId
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    // Sort by level first
    const levelCompare = a.classLevel.localeCompare(b.classLevel, 'th');
    if (levelCompare !== 0) return levelCompare;

    // Then room
    const roomCompare = a.room.localeCompare(b.room, undefined, { numeric: true });
    if (roomCompare !== 0) return roomCompare;

    // Then number
    const numA = parseInt(a.studentNumber || '999');
    const numB = parseInt(b.studentNumber || '999');
    if (numA !== numB) return numA - numB;

    // Default name
    return a.firstName.localeCompare(b.firstName, 'th');
  });

  // Checkboxes behavior
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedStudentIds(sortedStudents.map(s => s.id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudentIds(prev => [...prev, studentId]);
    } else {
      setSelectedStudentIds(prev => prev.filter(id => id !== studentId));
    }
  };

  // Pagination bounds
  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentStudents = sortedStudents.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 dark:bg-[#121318] p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header & Back Button */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <BackButton to="/academic/hub/students" />
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                  ระบบบันทึกคะแนนความประพฤติ
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                  เพิ่ม หัก และบริหารจัดการคะแนนพฤติกรรมของนักเรียนรายบุคคลหรือแบบรายกลุ่ม
                </p>
              </div>
            </div>

            {/* Config Button (Only for Academic Management) */}
            <Link
              to="/academic/behavior-score-config"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-[#202124] border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-[#2c2d30] transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              ตั้งค่าเกณฑ์คะแนน
            </Link>
          </div>

          {/* Quick Stats Panel */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#1e1f24] rounded-2xl p-4 shadow-sm border border-transparent dark:border-gray-800">
              <div className="text-gray-400 text-xs font-semibold">จำนวนนักเรียนทั้งหมด</div>
              <div className="text-2xl font-extrabold text-gray-800 dark:text-white mt-1">{students.length} คน</div>
            </div>
            <div className="bg-white dark:bg-[#1e1f24] rounded-2xl p-4 shadow-sm border border-transparent dark:border-gray-800">
              <div className="text-emerald-500 text-xs font-semibold">ความประพฤติดีเยี่ยม (90+)</div>
              <div className="text-2xl font-extrabold text-emerald-500 mt-1">
                {students.filter(s => (s.behaviorScore ?? 100) >= 90).length} คน
              </div>
            </div>
            <div className="bg-white dark:bg-[#1e1f24] rounded-2xl p-4 shadow-sm border border-transparent dark:border-gray-800">
              <div className="text-amber-500 text-xs font-semibold">ควรเฝ้าระวัง (50-89)</div>
              <div className="text-2xl font-extrabold text-amber-500 mt-1">
                {students.filter(s => {
                  const sc = s.behaviorScore ?? 100;
                  return sc >= 50 && sc < 90;
                }).length} คน
              </div>
            </div>
            <div className="bg-white dark:bg-[#1e1f24] rounded-2xl p-4 shadow-sm border border-transparent dark:border-gray-800">
              <div className="text-rose-500 text-xs font-semibold">คะแนนต่ำกว่าเกณฑ์ (&lt;50)</div>
              <div className="text-2xl font-extrabold text-rose-500 mt-1">
                {students.filter(s => (s.behaviorScore ?? 100) < 50).length} คน
              </div>
            </div>
          </div>

          {/* Filtering Controls */}
          <div className="bg-white dark:bg-[#1e1f24] rounded-2xl p-5 shadow-sm border border-transparent dark:border-gray-800 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200">
              <Filter className="w-4 h-4 text-indigo-500" />
              ตัวกรองข้อมูล
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Level Filter */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">ระดับชั้นเรียน</label>
                <select
                  value={selectedClassLevel}
                  onChange={(e) => {
                    setSelectedClassLevel(e.target.value);
                    setSelectedRoom('');
                  }}
                  className="w-full bg-slate-50 dark:bg-[#121318] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-gray-700 dark:text-gray-300"
                >
                  <option value="">ทุกระดับชั้น</option>
                  <option value="ม.ต้น">มัธยมศึกษาตอนต้น (ม.1-3)</option>
                  <option value="ม.ปลาย">มัธยมศึกษาตอนปลาย (ม.4-6)</option>
                  {availableLevels.map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>

              {/* Room Filter */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">ห้องเรียน</label>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#121318] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-gray-700 dark:text-gray-300"
                >
                  <option value="">ทุกห้อง</option>
                  {[...Array(12)].map((_, i) => (
                    <option key={i + 1} value={String(i + 1)}>ห้อง {i + 1}</option>
                  ))}
                </select>
              </div>

              {/* Score Range Filter */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">ช่วงคะแนนพฤติกรรม</label>
                <select
                  value={scoreFilter}
                  onChange={(e: any) => setScoreFilter(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#121318] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-gray-700 dark:text-gray-300"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="high">ดีเยี่ยม (90 คะแนนขึ้นไป)</option>
                  <option value="warn">ต้องติดตามเฝ้าระวัง (50 - 89 คะแนน)</option>
                  <option value="low">ต่ำกว่าเกณฑ์ (น้อยกว่า 50 คะแนน)</option>
                </select>
              </div>

              {/* Search Bar */}
              <div className="lg:col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1">ค้นหาข้อมูลนักเรียน</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="พิมพ์ชื่อ สกุล, รหัสนักเรียน หรือเลขที่..."
                    className="w-full bg-slate-50 dark:bg-[#121318] border border-gray-200 dark:border-gray-800 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-gray-700 dark:text-gray-300"
                  />
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Bulk Action Panel */}
          {selectedStudentIds.length > 0 && (
            <div className="bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-950/20 dark:to-indigo-900/10 rounded-2xl p-5 shadow-sm border border-indigo-200/50 dark:border-indigo-500/10 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-sm">
                    เลือกอยู่ {selectedStudentIds.length} คน
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 text-sm ml-2.5 font-medium">
                    คุณสามารถบันทึกหรือทำพฤติกรรมกลุ่มสำหรับนักเรียนที่เลือกทั้งหมดพร้อมกัน
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowBulkForm(!showBulkForm)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    {showBulkForm ? "ซ่อนกล่องบันทึกกลุ่ม" : "ลงบันทึกกลุ่ม"}
                  </button>
                  <button
                    onClick={() => setSelectedStudentIds([])}
                    className="px-3.5 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-bold hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    ยกเลิกเลือก
                  </button>
                </div>
              </div>

              {/* Bulk Form Container */}
              {showBulkForm && (
                <form onSubmit={handleSubmitBulkAdjust} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-indigo-200/50 dark:border-indigo-500/10">
                  {/* Action Type */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">ประเภทบันทึก</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setBulkType('deduct')}
                        className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          bulkType === 'deduct' 
                            ? 'bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400 font-extrabold ring-1 ring-rose-400' 
                            : 'bg-white border-gray-200 text-gray-500 dark:bg-[#1a1b1e] dark:border-gray-800'
                        }`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                        คะแนนเชิงลบ
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkType('add')}
                        className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          bulkType === 'add' 
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400 font-extrabold ring-1 ring-emerald-400' 
                            : 'bg-white border-gray-200 text-gray-500 dark:bg-[#1a1b1e] dark:border-gray-800'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        คะแนนเชิงบวก
                      </button>
                    </div>
                  </div>

                  {/* Points Input */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">คะแนน</label>
                    <div className="flex gap-1.5">
                      {!bulkCustomMode ? (
                        <>
                          {[5, 10, 15, 20].map(pt => (
                            <button
                              key={pt}
                              type="button"
                              onClick={() => setBulkPoints(pt)}
                              className={`flex-1 py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                                bulkPoints === pt 
                                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                                  : 'bg-white dark:bg-[#1a1b1e] border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400'
                              }`}
                            >
                              {pt}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setBulkCustomMode(true)}
                            className="flex-1 py-2 px-1 text-xs font-bold rounded-xl border bg-white dark:bg-[#1a1b1e] border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400"
                          >
                            ระบุเอง
                          </button>
                        </>
                      ) : (
                        <div className="flex w-full gap-2">
                          <input
                            type="number"
                            value={bulkCustomPointsVal}
                            onChange={(e) => setBulkCustomPointsVal(e.target.value)}
                            placeholder="ระบุคะแนน..."
                            min="1"
                            className="flex-1 bg-white dark:bg-[#1a1b1e] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => setBulkCustomMode(false)}
                            className="px-2.5 py-1.5 text-xs rounded-xl border border-gray-300 text-gray-500"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rule Selection */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">หัวข้อพฤติกรรม</label>
                    <select
                      value={bulkRuleId}
                      onChange={(e) => {
                        const rule = activeBulkRules.find((item) => item.id === e.target.value);
                        setBulkRuleId(e.target.value);
                        if (rule) {
                          setBulkCategory(rule.category);
                          if (!bulkCustomMode) setBulkPoints(rule.points);
                        }
                      }}
                      className="w-full bg-white dark:bg-[#1a1b1e] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs focus:outline-none text-gray-700 dark:text-gray-300"
                    >
                      {activeBulkRules.map(rule => (
                        <option key={rule.id} value={rule.id}>
                          {rule.title} ({rule.category}) - {rule.points} คะแนน
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Description Notes */}
                  <div className="md:col-span-2 space-y-1">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">รายละเอียดพฤติกรรมเพิ่มเติม / หมายเหตุ</label>
                    <input
                      type="text"
                      value={bulkNotes}
                      onChange={(e) => setBulkNotes(e.target.value)}
                      placeholder="เช่น ช่วยจัดเก็บกวาดขยะงานประจำปีการศึกษา, ไม่ส่งงานวิชาภาษาไทย, แต่งกายไม่ถูกระเบียบ..."
                      className="w-full bg-white dark:bg-[#1a1b1e] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs focus:outline-none text-gray-700 dark:text-gray-300"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-2 bg-gradient-to-r from-rose-500 to-red-600 text-white rounded-xl text-xs font-extrabold shadow-md hover:from-rose-600 hover:to-red-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? "กำลังบันทึก..." : `ยืนยันลงบันทึกกลุ่ม (${selectedStudentIds.length} คน)`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Student Table Card */}
          <div className="bg-white dark:bg-[#1e1f24] rounded-2xl shadow-sm border border-transparent dark:border-gray-800 overflow-hidden">
            
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                รายชื่อนักเรียน ({filteredStudents.length} คน)
              </span>
              
              {/* Pagination info */}
              {totalPages > 1 && (
                <span className="text-xs text-gray-400 font-medium">
                  แสดง {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredStudents.length)} จาก {filteredStudents.length}
                </span>
              )}
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-2"></div>
                <p className="text-gray-400 text-sm">กำลังโหลดข้อมูลนักเรียน...</p>
              </div>
            ) : currentStudents.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Search className="w-12 h-12 text-gray-300 dark:text-gray-700 mb-3" />
                <h3 className="font-bold text-gray-800 dark:text-gray-300 mb-1">ไม่พบข้อมูลนักเรียน</h3>
                <p className="text-gray-400 text-xs max-w-sm">โปรดระบุเกณฑ์การค้นหาหรือชั้นเรียนอื่นๆ</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[#15161b] text-gray-500 dark:text-gray-400 text-xs font-bold border-b border-gray-100 dark:border-gray-800">
                      <th className="py-3 px-4 w-12 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedStudentIds.length > 0 && selectedStudentIds.length === sortedStudents.length}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th className="py-3 px-3 w-16 text-center">เลขที่</th>
                      <th className="py-3 px-4">ชื่อ-นามสกุล</th>
                      <th className="py-3 px-4 w-32">รหัสนักเรียน</th>
                      <th className="py-3 px-4 w-28">ระดับชั้น/ห้อง</th>
                      <th className="py-3 px-4 w-44">คะแนนความประพฤติ</th>
                      <th className="py-3 px-4 text-right pr-6">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800 text-sm">
                    {currentStudents.map((student) => {
                      const isSelected = selectedStudentIds.includes(student.id);
                      return (
                        <tr
                          key={student.id}
                          className={`hover:bg-slate-50/50 dark:hover:bg-[#202126]/30 transition-colors ${
                            isSelected ? 'bg-indigo-50/20 dark:bg-indigo-500/5' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
                              checked={isSelected}
                              onChange={(e) => handleSelectStudent(student.id, e.target.checked)}
                            />
                          </td>

                          {/* Student number */}
                          <td className="py-3 px-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400">
                            {student.studentNumber || "-"}
                          </td>

                          {/* Name and avatar */}
                          <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
                            <div className="flex items-center gap-3">
                              <ProfileAvatar
                                className="w-8 h-8 rounded-full"
                                src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                                alt={`${student.firstName} ${student.lastName}`}
                              />
                              <div>
                                <span className="hover:text-indigo-500 cursor-pointer">
                                  {`${student.title}${student.firstName} ${student.lastName}`}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Student ID */}
                          <td className="py-3 px-4 text-xs font-mono text-gray-500 dark:text-gray-400">
                            {student.studentId}
                          </td>

                          {/* Level/Room */}
                          <td className="py-3 px-4 text-xs font-bold text-gray-600 dark:text-gray-300">
                            ชั้น {student.classLevel}/{student.room}
                          </td>

                          {/* Current Score Badge */}
                          <td className="py-3 px-4">
                            {renderScoreBadge(student.behaviorScore)}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right pr-6">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Add Points */}
                              <button
                                onClick={() => openAdjustModal(student, 'add')}
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white rounded-lg text-emerald-600 dark:text-emerald-400 transition-colors"
                                title="บวกคะแนนความดี"
                              >
                                <Plus className="w-4 h-4" />
                              </button>

                              {/* Subtract Points */}
                              <button
                                onClick={() => openAdjustModal(student, 'deduct')}
                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg text-rose-600 dark:text-rose-400 transition-colors"
                                title="หักคะแนนพฤติกรรม"
                              >
                                <Minus className="w-4 h-4" />
                              </button>

                              {/* View History */}
                              <button
                                onClick={() => openHistoryModal(student)}
                                className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white rounded-lg text-indigo-600 dark:text-indigo-400 transition-colors"
                                title="ดูประวัติการบันทึก"
                              >
                                <History className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
                <span className="text-xs text-gray-400">
                  หน้า {currentPage} จาก {totalPages}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 border border-gray-200 dark:border-gray-800 rounded-lg disabled:opacity-50 text-gray-600 dark:text-gray-400"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 border border-gray-200 dark:border-gray-800 rounded-lg disabled:opacity-50 text-gray-600 dark:text-gray-400"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 border border-gray-200 dark:border-gray-800 rounded-lg disabled:opacity-50 text-gray-600 dark:text-gray-400"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 border border-gray-200 dark:border-gray-800 rounded-lg disabled:opacity-50 text-gray-600 dark:text-gray-400"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* -------------------- Adjust score Modal -------------------- */}
      {activeAdjustStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1e1f24] rounded-2xl max-w-md w-full max-h-[90vh] shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 transform transition-all flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-[#18191d] shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-white text-base">
                {adjustType === 'add' ? 'บันทึกคะแนนเชิงบวก (เพิ่มคะแนน)' : 'บันทึกคะแนนเชิงลบ (หักคะแนน)'}
              </h3>
              <button 
                onClick={() => setActiveAdjustStudent(null)} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitAdjust} className="p-6 space-y-4 overflow-y-auto">
              
              {/* Student Card Summary */}
              <div className="bg-slate-50 dark:bg-[#141519] p-3.5 rounded-xl flex items-center gap-3">
                <ProfileAvatar
                  className="w-10 h-10 rounded-full"
                  src={activeAdjustStudent.profileImageUrl || `https://ui-avatars.com/api/?name=${activeAdjustStudent.firstName}+${activeAdjustStudent.lastName}&background=random`}
                  alt=""
                />
                <div>
                  <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                    {`${activeAdjustStudent.title}${activeAdjustStudent.firstName} ${activeAdjustStudent.lastName}`}
                  </h4>
                  <div className="text-gray-400 text-xs mt-0.5">
                    รหัส: {activeAdjustStudent.studentId} | ชั้น {activeAdjustStudent.classLevel}/{activeAdjustStudent.room} | คะแนนเดิม: <span className="font-bold text-indigo-500">{activeAdjustStudent.behaviorScore ?? 100}</span>
                  </div>
                </div>
              </div>

              {/* Adjust type preview (plus or minus) */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType('deduct')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    adjustType === 'deduct' 
                      ? 'bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400 font-extrabold ring-1 ring-rose-400' 
                      : 'bg-white border-gray-200 text-gray-500 dark:bg-[#1a1b1e] dark:border-gray-800'
                  }`}
                >
                  <Minus className="w-3.5 h-3.5" />
                  คะแนนเชิงลบ
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('add')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    adjustType === 'add' 
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400 font-extrabold ring-1 ring-emerald-400' 
                      : 'bg-white border-gray-200 text-gray-500 dark:bg-[#1a1b1e] dark:border-gray-800'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  คะแนนเชิงบวก
                </button>
              </div>

              {/* Points */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">ระบุจำนวนคะแนน</label>
                <div className="flex gap-2">
                  {!customPointsMode ? (
                    <>
                      {[5, 10, 15, 20].map(pt => (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => setAdjustPoints(pt)}
                          className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                            adjustPoints === pt 
                              ? 'bg-indigo-600 border-indigo-600 text-white' 
                              : 'bg-slate-50 dark:bg-[#1a1b1e] border-gray-200 dark:border-gray-850 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {pt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCustomPointsMode(true)}
                        className="flex-1 py-2 text-xs font-bold rounded-xl border bg-slate-50 dark:bg-[#1a1b1e] border-gray-200 dark:border-gray-850 text-gray-600 dark:text-gray-400 hover:border-indigo-500"
                      >
                        ระบุเอง
                      </button>
                    </>
                  ) : (
                    <div className="flex w-full gap-2">
                      <input
                        type="number"
                        value={customPointsVal}
                        onChange={(e) => setCustomPointsVal(e.target.value)}
                        placeholder="ระบุตัวเลขคะแนน..."
                        min="1"
                        autoFocus
                        className="flex-1 bg-slate-50 dark:bg-[#1a1b1e] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setCustomPointsMode(false)}
                        className="px-3 py-2 text-xs rounded-xl border border-gray-300 text-gray-550 hover:bg-slate-50"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Rule */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">หัวข้อพฤติกรรม</label>
                <select
                  value={adjustRuleId}
                  onChange={(e) => {
                    const rule = activeAdjustRules.find((item) => item.id === e.target.value);
                    setAdjustRuleId(e.target.value);
                    if (rule) {
                      setAdjustCategory(rule.category);
                      if (!customPointsMode) setAdjustPoints(rule.points);
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-[#1a1b1e] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none text-gray-700 dark:text-gray-300"
                >
                  {activeAdjustRules.map(rule => (
                    <option key={rule.id} value={rule.id}>
                      {rule.title} ({rule.category}) - {rule.points} คะแนน
                    </option>
                  ))}
                </select>
              </div>

              {/* Note / Details */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">รายละเอียด / หมายเหตุ</label>
                <textarea
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="ตัวอย่าง: ทำเวรความสะอาดเรียบร้อยมาก, พิมพ์สาย 3 ครั้งติดต่อกัน, เข้าห้องเรียนสาย..."
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-[#1a1b1e] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none text-gray-755 dark:text-gray-300 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setActiveAdjustStudent(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-600 dark:text-gray-400 dark:border-gray-850 rounded-xl text-sm font-bold hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-extrabold text-white shadow-md active:scale-95 transition-all ${
                    adjustType === 'add' 
                      ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700' 
                      : 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700'
                  }`}
                >
                  {isSubmitting ? "กำลังบันทึก..." : "ยืนยันบันทึก"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* -------------------- View History Modal -------------------- */}
      {historyStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center px-4 pt-16 pb-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1e1f24] rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 transform transition-all flex flex-col max-h-[calc(100vh-80px)]">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-gray-800 flex justify-between items-center bg-slate-50 dark:bg-[#18191d] shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-white text-base flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-500" />
                ประวัติพฤติกรรมและความประพฤติ
              </h3>
              <button
                onClick={() => setHistoryStudent(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-4 py-3 overflow-y-auto flex-1 space-y-3">

              {/* Student Summary — compact inline */}
              <div className="bg-slate-50 dark:bg-[#141519] px-3 py-2.5 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ProfileAvatar
                    className="w-8 h-8 rounded-full shrink-0"
                    src={historyStudent.profileImageUrl || `https://ui-avatars.com/api/?name=${historyStudent.firstName}+${historyStudent.lastName}&background=random`}
                    alt=""
                  />
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-800 dark:text-gray-200 text-xs truncate">
                      {`${historyStudent.title}${historyStudent.firstName} ${historyStudent.lastName}`}
                    </h4>
                    <p className="text-gray-400 text-[10px] truncate">
                      {historyStudent.studentId} · ชั้น {historyStudent.classLevel}/{historyStudent.room}
                    </p>
                  </div>
                </div>
                {renderScoreBadge(historyStudent.behaviorScore)}
              </div>

              {/* Stats + Filter — single compact row */}
              {!isLoadingHistory && studentHistoryLogs.length > 0 && (
                <div className="flex items-center gap-2">
                  {/* Stats pills */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-bold text-gray-400 bg-slate-100 dark:bg-[#141519] px-2 py-1 rounded-lg">
                      {studentHistoryLogs.length} รายการ
                    </span>
                    <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">
                      +{studentHistoryLogs.filter(l => l.points > 0).reduce((s, l) => s + l.points, 0)}
                    </span>
                    <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-2 py-1 rounded-lg">
                      {studentHistoryLogs.filter(l => l.points < 0).reduce((s, l) => s + l.points, 0)}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-5 bg-slate-200 dark:bg-gray-700 shrink-0" />

                  {/* Type filter tabs */}
                  <div className="flex gap-1 overflow-x-auto">
                    {([
                      { key: 'all',        label: 'ทั้งหมด',      count: studentHistoryLogs.length },
                      { key: 'manual',     label: 'ครู',           count: studentHistoryLogs.filter(l => l.type === 'activity_adjust').length },
                      { key: 'attendance', label: 'ลงเวลา',        count: studentHistoryLogs.filter(l => l.type === 'attendance').length },
                      { key: 'flag',       label: 'เข้าแถว',       count: studentHistoryLogs.filter(l => l.type === 'flag_ceremony').length },
                      { key: 'classroom',  label: 'รายวิชา',       count: studentHistoryLogs.filter(l => l.type === 'classroom').length },
                      { key: 'special',    label: 'กิจกรรมพิเศษ',  count: studentHistoryLogs.filter(l => l.type === 'special_period').length },
                    ] as const).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setHistoryTypeFilter(tab.key)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                          historyTypeFilter === tab.key
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-[#141519] text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {tab.label}
                        <span className={`font-black ${historyTypeFilter === tab.key ? 'opacity-70' : 'opacity-50'}`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Logs Timeline */}
              {isLoadingHistory ? (
                <div className="py-10 flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-500 mb-2"></div>
                  <p className="text-gray-400 text-xs">กำลังโหลดประวัติ...</p>
                </div>
              ) : filteredHistoryLogs.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-xs">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {studentHistoryLogs.length === 0
                    ? 'ยังไม่มีประวัติคะแนนความประพฤติสำหรับนักเรียนคนนี้'
                    : 'ไม่มีรายการในหมวดหมู่นี้'}
                </div>
              ) : (
                <div className="relative border-l border-slate-200 dark:border-gray-800 ml-3 space-y-2 pb-1">
                  {pagedHistoryLogs.map((log) => {
                    const isDeduct = log.points < 0 || log.action === 'deduct';
                    const pointText = log.points > 0 ? `+${log.points}` : `${log.points}`;
                    const dotColor =
                      log.points > 0             ? 'bg-emerald-500' :
                      log.type === 'attendance'  ? 'bg-amber-500' :
                      log.type === 'flag_ceremony' ? 'bg-orange-500' :
                      log.type === 'classroom'   ? 'bg-teal-500' :
                      log.type === 'special_period' ? 'bg-violet-500' :
                      'bg-rose-500';
                    const typeBadgeClass =
                      log.type === 'activity_adjust' ? 'bg-indigo-500/10 text-indigo-500' :
                      log.type === 'attendance'      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                      log.type === 'flag_ceremony'   ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                      log.type === 'classroom'       ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400' :
                      log.type === 'special_period'  ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' :
                      'bg-gray-500/10 text-gray-500';
                    const typeLabel =
                      log.type === 'activity_adjust' ? 'ครู' :
                      log.type === 'attendance'      ? 'ลงเวลา' :
                      log.type === 'flag_ceremony'   ? 'เข้าแถว' :
                      log.type === 'classroom'       ? 'รายวิชา' :
                      log.type === 'special_period'  ? 'กิจกรรมพิเศษ' :
                      log.category || 'ระบบ';

                    return (
                      <div key={log.id} className="relative pl-5">
                        {/* Dot */}
                        <span className={`absolute -left-[5px] top-[7px] h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#1e1f24] ${dotColor}`} />

                        {/* Compact card */}
                        <div className="bg-slate-50 dark:bg-[#1a1b1f] px-2.5 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                          {/* Row 1: badge + title + points */}
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${typeBadgeClass}`}>
                              {typeLabel}
                            </span>
                            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 flex-1 truncate">
                              {log.title || "แก้ไขคะแนนความประพฤติ"}
                            </span>
                            <span className={`text-[11px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                              isDeduct ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'
                            }`}>
                              {pointText}
                            </span>
                          </div>

                          {/* Row 2: notes (if any) */}
                          {log.notes && (
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 pl-0 truncate">
                              {log.notes}
                            </p>
                          )}

                          {/* Row 3: by + date */}
                          <div className="flex items-center justify-between mt-1 text-[9px] text-gray-400">
                            <span>{log.createdBy || "ผู้ใช้ระบบ"}</span>
                            <span>
                              {log.createdAt?.toDate
                                ? log.createdAt.toDate().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                                  + ' ' + log.createdAt.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                                : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-[#18191d] border-t border-slate-100 dark:border-gray-800 flex items-center justify-between gap-3 shrink-0">
              {historyTotalPages > 1 ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHistoryPage(1)}
                    disabled={historyPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 px-2">
                    {historyPage} / {historyTotalPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPage === historyTotalPages}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setHistoryPage(historyTotalPages)}
                    disabled={historyPage === historyTotalPages}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div />
              )}
              <button
                onClick={() => setHistoryStudent(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
              >
                ปิดหน้าต่าง
              </button>
            </div>

          </div>
        </div>
      )}

      <ToastContainer />
    </MainLayout>
  );
}
