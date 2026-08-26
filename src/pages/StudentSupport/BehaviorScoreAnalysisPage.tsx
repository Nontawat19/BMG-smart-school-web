import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf, PDFViewer } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import { AlertTriangle, ChevronDown, Loader2, Printer, Search, TrendingDown, TrendingUp, Users, X, FileDown } from "lucide-react";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import { firestore } from "@/firebase";
import { RootState } from "@/store";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { CLASS_FULL_NAMES, CLASSES, getClassOptionsBySchoolSettings } from "@/utils/schoolUtils";
import { getRulePoints, getSpecialPeriodRulePoints } from "@/utils/behaviorScoreUtils";

Font.register({
  family: "TH Sarabun PSK",
  fonts: [
    { src: "/fonts/THSarabunNew.ttf" },
    { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
  ],
});

interface Student {
  id: string;
  studentId?: string;
  studentNumber?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  classLevel?: string;
  room?: string | number;
  behaviorScore?: number;
  studentStatus?: string;
  curPhone?: string;
}

interface ScoreEntry {
  points: number;
  createdAt: any;
  academicYear?: string;
}

interface AnalysisRow {
  student: Student;
  plusScore: number;
  minusScore: number;
  netChange: number;
  initialScore: number;
  currentScore: number;
}

type RankType = "negative" | "positive" | "all";

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatThaiDate = (value: any) => {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};

const getStudentName = (student: Student) =>
  `${student.title || ""}${student.firstName || ""} ${student.lastName || ""}`.trim() || "-";

const normalizeRoom = (value: unknown) => String(value ?? "").trim();

const getClassLabel = (student: Student) => {
  const key = String(student.classLevel || "").trim();
  return CLASS_FULL_NAMES[key] || key || "-";
};

// Students may have classLevel stored as either the short key ("m1") or the
// abbreviated label ("ม.1") depending on how the record was created — match
// both so the level checkboxes filter correctly either way.
const getClassKey = (student: Student) => {
  const raw = String(student.classLevel || "").trim();
  if (!raw) return "";
  if ((CLASSES as Record<string, string>)[raw]) return raw;
  return Object.entries(CLASSES).find(([, label]) => label === raw)?.[0] || raw;
};

const pdfStyles = StyleSheet.create({
  page: { paddingTop: 34, paddingHorizontal: 44, paddingBottom: 26, fontFamily: "TH Sarabun PSK", fontSize: 12, color: "#000", backgroundColor: "#fff" },
  topBar: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.8, borderBottomColor: "#5f5f5f", paddingBottom: 2, marginBottom: 8 },
  topText: { fontSize: 12.5, fontWeight: "bold" },
  logo: { position: "absolute", top: 68, left: 60, width: 45, height: 52, objectFit: "contain" },
  titleBlock: { alignItems: "center", marginTop: 26, marginBottom: 24, lineHeight: 1.2 },
  reportTitle: { fontSize: 19, fontWeight: "bold", marginBottom: 5 },
  reportSubtitle: { fontSize: 14.5, marginBottom: 2 },
  table: { borderTopWidth: 0.9, borderLeftWidth: 0.9, borderColor: "#111" },
  row: { flexDirection: "row", minHeight: 22 },
  headerRow: { minHeight: 28, backgroundColor: "#cfcfcf" },
  cell: { borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: "#111", justifyContent: "center", paddingHorizontal: 4, paddingVertical: 2 },
  centerCell: { alignItems: "center", textAlign: "center" },
  leftCell: { alignItems: "flex-start", textAlign: "left", paddingLeft: 6 },
  headerText: { fontSize: 12.5, fontWeight: "bold" },
  bodyText: { fontSize: 12, lineHeight: 1.15 },
  boldText: { fontSize: 12, fontWeight: "bold" },
});

interface AnalysisPdfDocumentProps {
  rows: AnalysisRow[];
  schoolName: string;
  logoUrl?: string;
  academicYear: string;
  startDate: string;
  endDate: string;
}

const AnalysisPdfDocument: React.FC<AnalysisPdfDocumentProps> = ({
  rows, schoolName, logoUrl, academicYear, startDate, endDate,
}) => {
  const pageContentWidth = 754;
  const colIndex = 34;
  const colSchool = 118;
  const colLevel = 96;
  const colId = 56;
  const colPhone = 92;
  const colNet = 76;
  const colRemain = 76;
  const colName = pageContentWidth - colIndex - colSchool - colLevel - colId - colPhone - colNet - colRemain;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <View style={pdfStyles.topBar} fixed>
          <Text style={pdfStyles.topText}>{schoolName}</Text>
          <Text style={pdfStyles.topText}>รายงานวิเคราะห์คะแนนความประพฤติ</Text>
        </View>

        {logoUrl ? <Image src={logoUrl} style={pdfStyles.logo} /> : null}

        <View style={pdfStyles.titleBlock}>
          <Text style={pdfStyles.reportTitle}>รายงานวิเคราะห์คะแนนความประพฤติ</Text>
          <Text style={pdfStyles.reportSubtitle}>{schoolName} ปีการศึกษา {academicYear}</Text>
          <Text style={pdfStyles.reportSubtitle}>ระหว่างวันที่ {formatThaiDate(`${startDate}T12:00:00`)} ถึง {formatThaiDate(`${endDate}T12:00:00`)}</Text>
        </View>

        <View style={pdfStyles.table}>
          <View style={[pdfStyles.row, pdfStyles.headerRow]} fixed>
            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colIndex }]}><Text style={pdfStyles.headerText}>ลำดับ</Text></View>
            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colSchool }]}><Text style={pdfStyles.headerText}>โรงเรียน</Text></View>
            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colLevel }]}><Text style={pdfStyles.headerText}>ระดับชั้น</Text></View>
            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colId }]}><Text style={pdfStyles.headerText}>รหัส</Text></View>
            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colName }]}><Text style={pdfStyles.headerText}>ชื่อ-นามสกุล</Text></View>
            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colPhone }]}><Text style={pdfStyles.headerText}>หมายเลขโทรศัพท์</Text></View>
            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colNet }]}><Text style={pdfStyles.headerText}>คะแนนบวก/ลบ</Text></View>
            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colRemain }]}><Text style={pdfStyles.headerText}>คะแนนคงเหลือ</Text></View>
          </View>

          {rows.length === 0 ? (
            <View style={[pdfStyles.row, { minHeight: 28 }]}>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: pageContentWidth }]}>
                <Text style={pdfStyles.bodyText}>ไม่พบข้อมูลตามเงื่อนไขที่เลือก</Text>
              </View>
            </View>
          ) : (
            rows.map((row, index) => (
              <View key={row.student.id} style={pdfStyles.row} wrap={false}>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colIndex }]}><Text style={pdfStyles.bodyText}>{index + 1}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.leftCell, { width: colSchool }]}><Text style={pdfStyles.bodyText}>{schoolName}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colLevel }]}><Text style={pdfStyles.bodyText}>{getClassLabel(row.student)}/{normalizeRoom(row.student.room) || "-"}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colId }]}><Text style={pdfStyles.bodyText}>{row.student.studentId || "-"}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.leftCell, { width: colName }]}><Text style={pdfStyles.bodyText}>{getStudentName(row.student)}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colPhone }]}><Text style={pdfStyles.bodyText}>{row.student.curPhone || "-"}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colNet }]}><Text style={pdfStyles.bodyText}>{row.netChange > 0 ? "+" : ""}{row.netChange}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: colRemain }]}><Text style={pdfStyles.boldText}>{row.currentScore}</Text></View>
              </View>
            ))
          )}
        </View>
      </Page>
    </Document>
  );
};

const getScoreBadgeClass = (score: number) => {
  if (score >= 90) return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20";
  if (score >= 70) return "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20";
  if (score >= 50) return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20";
  return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20";
};

const LIMIT_OPTIONS = ["10", "20", "30", "50", "100", "all"] as const;

const BehaviorScoreAnalysisPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const schoolId = (currentUser as any)?.schoolId || schoolSettings.schoolId;

  const today = useMemo(() => new Date(), []);
  const defaultStartDate = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 14);
    return toInputDate(date);
  }, [today]);

  const [schoolName, setSchoolName] = useState(schoolSettings.schoolName || "");
  const [students, setStudents] = useState<Student[]>([]);
  const [classLevelOptions, setClassLevelOptions] = useState<[string, string][]>([]);
  const [behaviorScoreConfig, setBehaviorScoreConfig] = useState<any>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [isLevelDropdownOpen, setIsLevelDropdownOpen] = useState(false);
  const levelDropdownRef = useRef<HTMLDivElement>(null);
  const [academicYear, setAcademicYear] = useState(String(getCurrentThaiYear()));
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(toInputDate(today));
  const [rankType, setRankType] = useState<RankType>("negative");
  const [limitCount, setLimitCount] = useState<(typeof LIMIT_OPTIONS)[number]>("10");

  const [reportRows, setReportRows] = useState<AnalysisRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const fetchStudents = async () => {
      if (!schoolId) return;
      setLoadingStudents(true);
      try {
        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolSnap.exists()) {
          const schoolData = schoolSnap.data();
          setSchoolName(schoolData.schoolName || schoolSettings.schoolName || "");
          const options = getClassOptionsBySchoolSettings(schoolData.opportunityExpansionLevel || "", schoolData.schoolType || "");
          setClassLevelOptions(options);
          setSelectedLevels((prev) => (prev.length > 0 ? prev : options.map(([key]) => key)));
          setBehaviorScoreConfig(schoolData.behaviorScoreConfig || null);
        }

        const studentsSnap = await getDocs(collection(firestore, "school-settings", schoolId, "students"));
        const studentList = studentsSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Student))
          .filter(isStudyingStudent);
        setStudents(studentList);
      } catch (error) {
        console.error("Error loading students for behavior score analysis:", error);
        Swal.fire("ดึงข้อมูลล้มเหลว", "ไม่สามารถโหลดข้อมูลนักเรียนได้", "error");
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchStudents();
  }, [schoolId, schoolSettings.schoolName]);

  const toggleLevel = (key: string) => {
    setSelectedLevels((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  useEffect(() => {
    if (!isLevelDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (levelDropdownRef.current && !levelDropdownRef.current.contains(event.target as Node)) {
        setIsLevelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isLevelDropdownOpen]);

  const isLogInRange = useCallback((entry: ScoreEntry) => {
    const date = toDate(entry.createdAt);
    if (!date) return true; // Include entries with missing or invalid dates
    const iso = toInputDate(date);
    if (startDate && iso < startDate) return false;
    if (endDate && iso > endDate) return false;
    if (academicYear && entry.academicYear && String(entry.academicYear) !== academicYear) return false;
    return true;
  }, [academicYear, endDate, startDate]);

  const buildReport = useCallback(async () => {
    if (!schoolId) return;
    if (selectedLevels.length === 0) {
      Swal.fire("กรุณาเลือกระดับชั้น", "เลือกอย่างน้อย 1 ระดับชั้นก่อนค้นหารายการ", "warning");
      return;
    }
    if (startDate > endDate) {
      Swal.fire("ช่วงวันที่ไม่ถูกต้อง", "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด", "warning");
      return;
    }

    const targetStudents = students.filter((student) => selectedLevels.includes(getClassKey(student)));

    setLoadingReport(true);
    setHasSearched(true);
    try {
      const initialScore = Number(behaviorScoreConfig?.startingScore ?? 100);

      const rows = await Promise.all(targetStudents.map(async (student) => {
        const logsRef = collection(firestore, "school-settings", schoolId, "students", student.id, "behavior_logs");
        const attRef = collection(firestore, "school-settings", schoolId, "students", student.id, "attendance");
        const classRef = collection(firestore, "school-settings", schoolId, "students", student.id, "ClassroomAttendance");
        const [logsSnap, attSnap, classSnap] = await Promise.all([getDocs(logsRef), getDocs(attRef), getDocs(classRef)]);

        const entries: ScoreEntry[] = [];

        logsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          entries.push({ points: Number(data.points || 0), createdAt: data.createdAt, academicYear: data.academicYear });
        });

        attSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const logDate = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
          const academicYearStr = academicYear || String(getCurrentThaiYear());

          const effectiveAttendanceStatus = data.metadata?.attendanceBehaviorScoreStatus || data.status;
          if (effectiveAttendanceStatus) {
            const attPoints = getRulePoints(behaviorScoreConfig, effectiveAttendanceStatus);
            if (attPoints > 0) entries.push({ points: -attPoints, createdAt: { toDate: () => logDate }, academicYear: academicYearStr });
          }

          const metadata = data.metadata || {};
          const flagStatus = metadata.flagBehaviorScoreStatus || metadata.flag;
          if (flagStatus) {
            const flagPoints = getRulePoints(behaviorScoreConfig, flagStatus);
            if (flagPoints > 0) entries.push({ points: -flagPoints, createdAt: { toDate: () => logDate }, academicYear: academicYearStr });
          }
        });

        classSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const logDate = data.date?.toDate ? data.date.toDate() : new Date();
          const academicYearStr = data.academicYear || academicYear || String(getCurrentThaiYear());

          if (data.attendanceType === "special_period") {
            if (!data.deductBehavior) return;
            // Signed: positive for a rule marked เชิงบวก, negative for เชิงลบ — do not renegate.
            const spPoints = getSpecialPeriodRulePoints(behaviorScoreConfig, data.status);
            if (spPoints !== 0) entries.push({ points: spPoints, createdAt: { toDate: () => logDate }, academicYear: academicYearStr });
          } else {
            const classPoints = getRulePoints(behaviorScoreConfig, `class:${data.status}`);
            if (classPoints > 0) entries.push({ points: -classPoints, createdAt: { toDate: () => logDate }, academicYear: academicYearStr });
          }
        });

        const inRange = entries.filter(isLogInRange);
        const plusScore = inRange.reduce((sum, entry) => sum + Math.max(0, entry.points), 0);
        const minusScore = inRange.reduce((sum, entry) => sum + Math.min(0, entry.points), 0);
        const netChange = plusScore + minusScore;
        // ไม่จำกัดทั้งเพดานบนและเพดานล่าง — ให้ตรงกับคะแนนจริงบน student doc
        const currentScore = initialScore + netChange;

        return { student, plusScore, minusScore, netChange, initialScore, currentScore };
      }));

      setReportRows(rows);
    } catch (error) {
      console.error("Error building behavior score analysis:", error);
      Swal.fire("ดึงรายงานล้มเหลว", "ไม่สามารถวิเคราะห์คะแนนความประพฤติได้", "error");
    } finally {
      setLoadingReport(false);
    }
  }, [academicYear, behaviorScoreConfig, endDate, isLogInRange, schoolId, selectedLevels, startDate, students]);

  const displayRows = useMemo(() => {
    let rows = [...reportRows];
    if (rankType === "negative") {
      rows = rows.filter((row) => row.netChange < 0).sort((a, b) => a.netChange - b.netChange);
    } else if (rankType === "positive") {
      rows = rows.filter((row) => row.netChange > 0).sort((a, b) => b.netChange - a.netChange);
    } else {
      rows = rows.sort((a, b) => Math.abs(b.netChange) - Math.abs(a.netChange));
    }
    if (limitCount !== "all") {
      rows = rows.slice(0, Number(limitCount));
    }
    return rows;
  }, [reportRows, rankType, limitCount]);

  const buildAnalysisPdfDocument = () => (
    <AnalysisPdfDocument
      rows={displayRows}
      schoolName={schoolName}
      logoUrl={schoolSettings.logoUrl}
      academicYear={academicYear}
      startDate={startDate}
      endDate={endDate}
    />
  );

  const openPdfPreview = () => {
    if (displayRows.length === 0) {
      Swal.fire("ไม่พบข้อมูล", "กรุณาค้นหารายการก่อนพิมพ์รายงาน", "warning");
      return;
    }
    setShowPdfPreview(true);
  };

  const handlePrint = async () => {
    setIsGeneratingPdf(true);
    try {
      const pdfBlob = await pdf(buildAnalysisPdfDocument()).toBlob();
      const rankLabel = rankType === "negative" ? "เชิงลบ" : rankType === "positive" ? "เชิงบวก" : "ทั้งหมด";
      const safeName = `วิเคราะห์คะแนนความประพฤติ_${rankLabel}_${startDate}_${endDate}`.replace(/[\\/:*?"<>|]/g, "");
      saveAs(pdfBlob, `${safeName}.pdf`);
    } catch (error) {
      console.error("Error generating behavior score analysis PDF:", error);
      Swal.fire("สร้าง PDF ไม่สำเร็จ", "ไม่สามารถสร้างรายงานวิเคราะห์คะแนนได้", "error");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 transition-colors dark:bg-[#1c1c24] dark:text-slate-100 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <BackButton to="/student-support/hub" />
              <div>
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Behavior score analysis</p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">วิเคราะห์คะแนนความประพฤติ</h1>
              </div>
            </div>

            <button
              onClick={openPdfPreview}
              disabled={displayRows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer size={16} />
              Print รายการ
            </button>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#2a2b2f]">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <Users size={18} className="text-indigo-500" />
                ตัวกรองรายการ
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">โรงเรียน</label>
                <input
                  value={schoolName || schoolId || "-"}
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">ปีการศึกษา</label>
                <input
                  value={academicYear}
                  onChange={(event) => setAcademicYear(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="grid gap-4 border-t border-slate-200 p-5 dark:border-white/10 md:grid-cols-2 xl:grid-cols-6">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">รายการช่วงชั้นเรียน</label>
                <div className="relative" ref={levelDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsLevelDropdownOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                  >
                    <span className={`truncate ${selectedLevels.length === 0 ? "text-slate-400 dark:text-slate-500" : ""}`}>
                      {selectedLevels.length === 0
                        ? "-- กรุณาเลือกระดับชั้น --"
                        : selectedLevels.length === classLevelOptions.length
                        ? `ทั้งหมด (${classLevelOptions.length} ระดับชั้น)`
                        : classLevelOptions
                            .filter(([key]) => selectedLevels.includes(key))
                            .map(([key]) => CLASS_FULL_NAMES[key] || key)
                            .join(", ")}
                    </span>
                    <ChevronDown size={16} className={`ml-2 shrink-0 text-slate-400 transition-transform ${isLevelDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isLevelDropdownOpen && (
                    <div className="absolute z-20 mt-1.5 w-full min-w-[220px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-[#1f2024]">
                      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/10">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">เลือกระดับชั้น</span>
                        <button
                          type="button"
                          onClick={() => setSelectedLevels((prev) => (prev.length === classLevelOptions.length ? [] : classLevelOptions.map(([key]) => key)))}
                          className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          {selectedLevels.length === classLevelOptions.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
                        </button>
                      </div>
                      <div className="flex flex-col gap-1">
                        {classLevelOptions.map(([key]) => (
                          <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5">
                            <input
                              type="checkbox"
                              checked={selectedLevels.includes(key)}
                              onChange={() => toggleLevel(key)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-white/20"
                            />
                            {CLASS_FULL_NAMES[key] || key}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">วันเริ่มต้น</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">วันสิ้นสุด</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">ประเภท</label>
                <select
                  value={rankType}
                  onChange={(event) => setRankType(event.target.value as RankType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                >
                  <option value="negative">คะแนนเชิงลบ</option>
                  <option value="positive">คะแนนเชิงบวก</option>
                  <option value="all">ทั้งหมด</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">จำนวน</label>
                <select
                  value={limitCount}
                  onChange={(event) => setLimitCount(event.target.value as (typeof LIMIT_OPTIONS)[number])}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                >
                  {LIMIT_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option === "all" ? "ทั้งหมด" : option}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={buildReport}
                  disabled={loadingReport || loadingStudents}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingReport ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                  ค้นหารายการ
                </button>
              </div>
            </div>
          </section>

          <section className="my-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#2a2b2f]">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">นักเรียนในรายการ</p>
              <p className="mt-2 text-2xl font-black">{displayRows.length}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10">
              <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300"><TrendingDown size={14} /> คะแนนหักรวม</p>
              <p className="mt-2 text-2xl font-black text-rose-700 dark:text-rose-300">{displayRows.reduce((sum, row) => sum + row.minusScore, 0)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"><TrendingUp size={14} /> คะแนนเพิ่มรวม</p>
              <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">+{displayRows.reduce((sum, row) => sum + row.plusScore, 0)}</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#2a2b2f]">
            <div className="overflow-x-auto">
              <table className="min-w-[1040px] w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  <tr>
                    <th className="w-12 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">#</th>
                    <th className="border-b border-r border-slate-200 p-3 text-left dark:border-white/10">โรงเรียน</th>
                    <th className="w-32 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">ระดับชั้น</th>
                    <th className="w-28 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">รหัส</th>
                    <th className="border-b border-r border-slate-200 p-3 text-left dark:border-white/10">ชื่อ-นามสกุล</th>
                    <th className="w-36 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">หมายเลขโทรศัพท์</th>
                    <th className="w-28 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">คะแนนบวก/ลบ</th>
                    <th className="w-28 border-b border-slate-200 p-3 text-left dark:border-white/10">คะแนนคงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {(loadingReport || loadingStudents) ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-500 dark:text-slate-400">
                        <Loader2 className="mx-auto mb-3 animate-spin text-indigo-500" size={28} />
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : !hasSearched ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-500 dark:text-slate-400">
                        เลือกเงื่อนไขแล้วกด "ค้นหารายการ" เพื่อวิเคราะห์คะแนน
                      </td>
                    </tr>
                  ) : displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-500 dark:text-slate-400">
                        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={28} />
                        ไม่พบข้อมูลตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    displayRows.map((row, index) => (
                      <tr key={row.student.id} className="border-b border-slate-100 transition hover:bg-indigo-50/50 dark:border-white/5 dark:hover:bg-white/5">
                        <td className="border-r border-slate-100 p-3 font-semibold dark:border-white/5">{index + 1}</td>
                        <td className="border-r border-slate-100 p-3 dark:border-white/5">{schoolName}</td>
                        <td className="border-r border-slate-100 p-3 dark:border-white/5">{getClassLabel(row.student)}/{normalizeRoom(row.student.room) || "-"}</td>
                        <td className="border-r border-slate-100 p-3 font-mono text-xs font-semibold text-indigo-700 dark:border-white/5 dark:text-indigo-300">{row.student.studentId || "-"}</td>
                        <td className="border-r border-slate-100 p-3 font-semibold dark:border-white/5">{getStudentName(row.student)}</td>
                        <td className="border-r border-slate-100 p-3 dark:border-white/5">{row.student.curPhone || "-"}</td>
                        <td className={`border-r border-slate-100 p-3 font-bold dark:border-white/5 ${row.netChange < 0 ? "text-rose-600 dark:text-rose-300" : row.netChange > 0 ? "text-emerald-600 dark:text-emerald-300" : ""}`}>
                          {row.netChange > 0 ? "+" : ""}{row.netChange}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex min-w-14 justify-center rounded-full px-2.5 py-1 text-xs font-black ring-1 ${getScoreBadgeClass(row.currentScore)}`}>
                            {row.currentScore}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {showPdfPreview && (
        <div
          className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPdfPreview(false)}
        >
          <div
            className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                ตัวอย่างเอกสาร — วิเคราะห์คะแนนความประพฤติ
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={isGeneratingPdf}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                  {isGeneratingPdf ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                  title="ปิด"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl bg-slate-100 dark:bg-slate-900">
              <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                {buildAnalysisPdfDocument()}
              </PDFViewer>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default BehaviorScoreAnalysisPage;
