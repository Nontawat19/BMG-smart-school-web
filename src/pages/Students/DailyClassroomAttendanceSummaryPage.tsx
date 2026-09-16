import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf, PDFViewer } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import { CalendarDays, FileDown, RefreshCw, X, Loader2 } from "lucide-react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import SkeletonLoader from "@/components/SkeletonLoader";
import { firestore } from "@/firebase";
import { RootState, AppDispatch } from "@/store";
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";
import { CLASS_MAPPING, CLASS_FULL_NAMES, getClassLevelRank, getGroupPersonnel, dedupeSchoolWord } from "@/utils/schoolUtils";
import { isActiveStudentStatus } from "@/utils/studentStatusUtils";

Font.register({
  family: "TH Sarabun PSK",
  fonts: [
    { src: "/fonts/THSarabunNew.ttf" },
    { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

interface ClassroomSummaryRow {
  key: string;
  classLevel: string;
  room: string;
  label: string;
  male: number;
  female: number;
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

const PRESENT_STATUSES = new Set(["มา", "OnTime", "กลับก่อน", "ไม่ลงเวลาออก", "NoCheckout", "ไปราชการ", "OfficialTravel", "official_travel"]);
const LATE_STATUSES = new Set(["สาย", "Late"]);
const LEAVE_STATUSES = new Set(["ลา", "ล", "Leave"]);
const ABSENT_STATUSES = new Set(["ขาด", "Absent"]);

const classifyStatus = (status?: string): "present" | "late" | "leave" | "absent" => {
  if (!status) return "absent";
  if (PRESENT_STATUSES.has(status)) return "present";
  if (LATE_STATUSES.has(status)) return "late";
  if (LEAVE_STATUSES.has(status)) return "leave";
  if (ABSENT_STATUSES.has(status)) return "absent";
  return "present";
};

const normalizeStudentGender = (gender?: string, title?: string): "ชาย" | "หญิง" | null => {
  const normalizedGender = String(gender || "").trim().toLowerCase();
  if (["ชาย", "male", "m", "ช"].includes(normalizedGender)) return "ชาย";
  if (["หญิง", "female", "f", "ญ"].includes(normalizedGender)) return "หญิง";

  const normalizedTitle = String(title || "").trim();
  if (["นาย", "ด.ช.", "เด็กชาย", "สามเณร", "พระ"].includes(normalizedTitle)) return "ชาย";
  if (["นางสาว", "ด.ญ.", "เด็กหญิง", "น.ส.", "นาง"].includes(normalizedTitle)) return "หญิง";

  return null;
};

const getClassFullLabel = (classLevel: string, room: string): string => {
  const code = Object.entries(CLASS_MAPPING).find(([, v]) => v === classLevel)?.[0];
  const base = code ? CLASS_FULL_NAMES[code] : classLevel || "-";
  return room ? `${base}/${room}` : base;
};

const formatThaiDateFull = (isoDate: string) => {
  if (!isoDate) return "";
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
};

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingHorizontal: 44,
    paddingBottom: 34,
    fontFamily: "TH Sarabun PSK",
    fontSize: 12.5,
    color: "#000",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.8,
    borderBottomColor: "#5f5f5f",
    paddingBottom: 2,
    marginBottom: 10,
  },
  topText: { fontSize: 12, fontWeight: "bold" },
  header: {
    position: "relative",
    minHeight: 60,
    marginBottom: 10,
    justifyContent: "center",
  },
  logoBox: {
    position: "absolute",
    left: 0,
    top: -4,
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 50, height: 50, objectFit: "contain" },
  titleBlock: { alignItems: "center", paddingLeft: 60, paddingRight: 60, lineHeight: 1.25 },
  reportTitle: { fontSize: 19, fontWeight: "bold", marginBottom: 3, textAlign: "center" },
  reportSubtitle: { fontSize: 14.5, marginBottom: 1, textAlign: "center" },
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#000",
  },
  row: { flexDirection: "row", minHeight: 20 },
  headerRow: { backgroundColor: "#e5e5e5", minHeight: 34 },
  totalRow: { backgroundColor: "#f0f0f0", minHeight: 22 },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000",
    justifyContent: "center",
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  centerCell: { alignItems: "center", textAlign: "center" },
  leftCell: { alignItems: "flex-start", textAlign: "left" },
  headerText: { fontSize: 12, fontWeight: "bold", textAlign: "center" },
  bodyText: { fontSize: 12 },
  boldText: { fontSize: 12, fontWeight: "bold" },
  proposeText: { textAlign: "center", marginTop: 26, marginBottom: 10, fontSize: 13 },
  footer: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBlock: { width: "32%", alignItems: "center" },
  signatureLine: { marginBottom: 2 },
  pageNumber: { position: "absolute", bottom: 20, right: 30, fontSize: 10 },
});

const COL_WIDTHS = {
  idx: "5%",
  label: "25%",
  male: "8%",
  female: "8%",
  total: "12%",
  present: "12%",
  absent: "10%",
  late: "10%",
  leave: "10%",
};

const ROWS_PER_PAGE = 18;

type LevelScope = "kindergarten" | "primary" | "secondary" | "all";

const LEVEL_TABS: { key: LevelScope; label: string; pdfLabel: string }[] = [
  { key: "kindergarten", label: "ระดับอนุบาล", pdfLabel: "ระดับอนุบาล" },
  { key: "primary", label: "ระดับประถมศึกษา", pdfLabel: "ระดับประถมศึกษา" },
  { key: "secondary", label: "ระดับมัธยมศึกษา", pdfLabel: "ระดับมัธยมศึกษา" },
  { key: "all", label: "รวมทุกระดับ", pdfLabel: "รวมทุกระดับ" },
];

const getLevelScopeOfClass = (classLevel: string): LevelScope | "other" => {
  const clean = String(classLevel || "").trim().toLowerCase();
  if (
    clean.startsWith("อ.") ||
    clean.startsWith("อนุบาล") ||
    clean.startsWith("k") ||
    ["k1", "k2", "k3"].includes(clean)
  ) {
    return "kindergarten";
  }
  if (
    clean.startsWith("ป.") ||
    clean.startsWith("ประถม") ||
    clean.startsWith("p") ||
    ["p1", "p2", "p3", "p4", "p5", "p6"].includes(clean)
  ) {
    return "primary";
  }
  if (
    clean.startsWith("ม.") ||
    clean.startsWith("มัธยม") ||
    clean.startsWith("m") ||
    ["m1", "m2", "m3", "m4", "m5", "m6"].includes(clean)
  ) {
    return "secondary";
  }
  return "other";
};

interface PdfProps {
  rows: ClassroomSummaryRow[];
  schoolName: string;
  logoBase64?: string;
  academicYear: string;
  term: string;
  dateStr: string;
  officerName: string;
  deputyName: string;
  deputyRoleLabel: string;
  directorName: string;
  levelLabel?: string;
}

const DailyClassroomSummaryPdfDocument: React.FC<PdfProps> = ({
  rows, schoolName, logoBase64, academicYear, term, dateStr, officerName, deputyName, deputyRoleLabel, directorName, levelLabel,
}) => {
  const displaySchoolName = dedupeSchoolWord(`โรงเรียน${schoolName}`);
  const chunks: ClassroomSummaryRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  const totals = rows.reduce(
    (acc, row) => ({
      male: acc.male + row.male,
      female: acc.female + row.female,
      total: acc.total + row.total,
      present: acc.present + row.present,
      absent: acc.absent + row.absent,
      late: acc.late + row.late,
      leave: acc.leave + row.leave,
    }),
    { male: 0, female: 0, total: 0, present: 0, absent: 0, late: 0, leave: 0 }
  );

  const isFilteredLevel = Boolean(levelLabel && levelLabel !== "รวมทุกระดับ");

  return (
    <Document>
      {chunks.map((chunk, pageIndex) => (
        <Page key={pageIndex} size="A4" style={pdfStyles.page}>
          <View style={pdfStyles.topBar} fixed>
            <Text style={pdfStyles.topText}>{displaySchoolName}</Text>
            <Text style={pdfStyles.topText}>
              รายงานยอดรวมรายวัน รายห้องเรียน{isFilteredLevel ? ` (${levelLabel})` : ""}
            </Text>
          </View>

          {pageIndex === 0 && (
            <View style={pdfStyles.header}>
              {logoBase64 && (
                <View style={pdfStyles.logoBox}>
                  <Image src={logoBase64} style={pdfStyles.logo} />
                </View>
              )}
              <View style={pdfStyles.titleBlock}>
                <Text style={pdfStyles.reportTitle}>รายงานยอดรวมรายวัน รายห้องเรียน</Text>
                <Text style={pdfStyles.reportSubtitle}>
                  {displaySchoolName} {isFilteredLevel ? `[${levelLabel}] ` : ""}ปีการศึกษา {term}/{academicYear}
                </Text>
                <Text style={pdfStyles.reportSubtitle}>ประจำวันที่ {formatThaiDateFull(dateStr)}</Text>
              </View>
            </View>
          )}

          <View style={pdfStyles.table}>
            <View style={[pdfStyles.row, pdfStyles.headerRow]} fixed>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.idx }]}><Text style={pdfStyles.headerText}>#</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.label }]}><Text style={pdfStyles.headerText}>ห้องเรียน/ชั้นเรียน/ระดับชั้น</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.male }]}><Text style={pdfStyles.headerText}>เพศชาย</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.female }]}><Text style={pdfStyles.headerText}>เพศหญิง</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.total }]}><Text style={pdfStyles.headerText}>จำนวนทั้งหมด</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.present }]}><Text style={pdfStyles.headerText}>มาเรียนปกติ</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.absent }]}><Text style={pdfStyles.headerText}>ขาดเรียน</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.late }]}><Text style={pdfStyles.headerText}>มาเรียนสาย</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.leave }]}><Text style={pdfStyles.headerText}>ลา</Text></View>
            </View>

            {chunk.map((row, rowIndex) => {
              const globalIdx = pageIndex * ROWS_PER_PAGE + rowIndex;
              return (
                <View key={row.key} style={pdfStyles.row}>
                  <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.idx }]}><Text style={pdfStyles.bodyText}>{globalIdx + 1}</Text></View>
                  <View style={[pdfStyles.cell, pdfStyles.leftCell, { width: COL_WIDTHS.label }]}><Text style={pdfStyles.bodyText}>{row.label}</Text></View>
                  <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.male }]}><Text style={pdfStyles.bodyText}>{row.male}</Text></View>
                  <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.female }]}><Text style={pdfStyles.bodyText}>{row.female}</Text></View>
                  <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.total }]}><Text style={pdfStyles.bodyText}>{row.total}</Text></View>
                  <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.present }]}><Text style={pdfStyles.bodyText}>{row.present}</Text></View>
                  <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.absent }]}><Text style={pdfStyles.bodyText}>{row.absent}</Text></View>
                  <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.late }]}><Text style={pdfStyles.bodyText}>{row.late}</Text></View>
                  <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.leave }]}><Text style={pdfStyles.bodyText}>{row.leave}</Text></View>
                </View>
              );
            })}

            {pageIndex === chunks.length - 1 && (
              <View style={[pdfStyles.row, pdfStyles.totalRow]}>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.idx }]}><Text style={pdfStyles.boldText}></Text></View>
                <View style={[pdfStyles.cell, pdfStyles.leftCell, { width: COL_WIDTHS.label }]}><Text style={pdfStyles.boldText}>ยอดรวม{isFilteredLevel ? ` (${levelLabel})` : "ทั้งสิ้น"}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.male }]}><Text style={pdfStyles.boldText}>{totals.male}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.female }]}><Text style={pdfStyles.boldText}>{totals.female}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.total }]}><Text style={pdfStyles.boldText}>{totals.total}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.present }]}><Text style={pdfStyles.boldText}>{totals.present}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.absent }]}><Text style={pdfStyles.boldText}>{totals.absent}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.late }]}><Text style={pdfStyles.boldText}>{totals.late}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: COL_WIDTHS.leave }]}><Text style={pdfStyles.boldText}>{totals.leave}</Text></View>
              </View>
            )}
          </View>

          {pageIndex === chunks.length - 1 && (
            <>
              <Text style={pdfStyles.proposeText} wrap={false}>เสนอ ผู้อำนวยการ{displaySchoolName} เพื่อทราบ</Text>
              <View style={pdfStyles.footer} wrap={false}>
                <View style={pdfStyles.signatureBlock}>
                  <Text style={pdfStyles.signatureLine}>.............................................</Text>
                  <Text>( {officerName || ".........................................."} )</Text>
                  <Text style={{ marginTop: 4 }}>เจ้าหน้าที่ระบบดูแลช่วยเหลือนักเรียน</Text>
                </View>
                <View style={pdfStyles.signatureBlock}>
                  <Text style={pdfStyles.signatureLine}>.............................................</Text>
                  <Text>( {deputyName || ".........................................."} )</Text>
                  <Text style={{ marginTop: 4 }}>{deputyRoleLabel}</Text>
                </View>
                <View style={pdfStyles.signatureBlock}>
                  <Text style={pdfStyles.signatureLine}>.............................................</Text>
                  <Text>( {directorName || ".........................................."} )</Text>
                  <Text style={{ marginTop: 4 }}>ผู้อำนวยการ{displaySchoolName}</Text>
                </View>
              </View>
            </>
          )}

          <Text style={pdfStyles.pageNumber} render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`} fixed />
        </Page>
      ))}
    </Document>
  );
};

const DailyClassroomAttendanceSummaryPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const dispatch = useDispatch<AppDispatch>();
  const schoolId = currentUser?.schoolId;

  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rows, setRows] = useState<ClassroomSummaryRow[]>([]);
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("1");
  useEffect(() => {
    if (schoolId) dispatch(fetchSchoolSettings(schoolId));
  }, [schoolId, dispatch]);

  useEffect(() => {
    if (!schoolId) return;
    getCurrentAcademicYear(firestore, schoolId).then((data) => {
      setAcademicYear(data.academicYear);
      if (data.currentTerm) setTerm(data.currentTerm);
    });
  }, [schoolId]);

  useEffect(() => {
    if (!schoolSettings?.logoUrl) return;
    const convert = async () => {
      try {
        const response = await fetch(schoolSettings.logoUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => setLogoBase64(reader.result as string);
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error("Error converting logo:", error);
      }
    };
    convert();
  }, [schoolSettings?.logoUrl]);

  const fetchReport = useCallback(async () => {
    if (!schoolId || !selectedDate) return;
    setLoading(true);
    try {
      const studentsRef = collection(firestore, "school-settings", schoolId, "students");
      const studentsSnap = await getDocs(studentsRef);

      const groups = new Map<string, ClassroomSummaryRow>();
      const studentGroupKey = new Map<string, string>();

      studentsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const status = data.status || data.studentStatus || "กำลังศึกษาอยู่";
        if (!isActiveStudentStatus(status)) return;

        const classLevel = String(data.classLevel || "").trim();
        const room = String(data.room || "").trim();
        if (!classLevel) return;
        const key = `${classLevel}__${room}`;

        if (!groups.has(key)) {
          groups.set(key, {
            key,
            classLevel,
            room,
            label: getClassFullLabel(classLevel, room),
            male: 0,
            female: 0,
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            leave: 0,
          });
        }
        const group = groups.get(key)!;
        group.total += 1;
        const normalizedGender = normalizeStudentGender(data.gender, data.title);
        if (normalizedGender === "ชาย") group.male += 1;
        else if (normalizedGender === "หญิง") group.female += 1;

        studentGroupKey.set(docSnap.id, key);
      });

      const studentIds = Array.from(studentGroupKey.keys());
      const bucketByStudentId = new Map<string, "present" | "late" | "leave" | "absent">();
      await Promise.all(
        studentIds.map(async (studentId) => {
          const attendanceRef = doc(firestore, "school-settings", schoolId, "students", studentId, "attendance", selectedDate);
          const attendanceSnap = await getDoc(attendanceRef);
          if (attendanceSnap.exists()) {
            bucketByStudentId.set(studentId, classifyStatus(attendanceSnap.data().status));
          }
        })
      );

      studentGroupKey.forEach((key, studentId) => {
        const group = groups.get(key);
        if (!group) return;
        const bucket = bucketByStudentId.get(studentId) || "absent";
        group[bucket] += 1;
      });

      const sortedRows = Array.from(groups.values()).sort((a, b) => {
        const rankDiff = getClassLevelRank(a.classLevel) - getClassLevelRank(b.classLevel);
        if (rankDiff !== 0) return rankDiff;
        return (Number(a.room) || 0) - (Number(b.room) || 0);
      });

      setRows(sortedRows);
    } catch (error) {
      console.error("Error fetching daily classroom summary:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการดึงข้อมูล", "error");
    } finally {
      setLoading(false);
    }
  }, [schoolId, selectedDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const [activeTab, setActiveTab] = useState<LevelScope>("all");

  const displayedRows = useMemo(() => {
    if (activeTab === "all") return rows;
    return rows.filter((row) => getLevelScopeOfClass(row.classLevel) === activeTab);
  }, [rows, activeTab]);

  const displayedTotals = useMemo(
    () =>
      displayedRows.reduce(
        (acc, row) => ({
          male: acc.male + row.male,
          female: acc.female + row.female,
          total: acc.total + row.total,
          present: acc.present + row.present,
          absent: acc.absent + row.absent,
          late: acc.late + row.late,
          leave: acc.leave + row.leave,
        }),
        { male: 0, female: 0, total: 0, present: 0, absent: 0, late: 0, leave: 0 }
      ),
    [displayedRows]
  );

  const currentTabObj = useMemo(
    () => LEVEL_TABS.find((t) => t.key === activeTab) || LEVEL_TABS[3],
    [activeTab]
  );

  const getTabCount = (tabKey: LevelScope) => {
    if (tabKey === "all") return rows.length;
    return rows.filter((r) => getLevelScopeOfClass(r.classLevel) === tabKey).length;
  };

  const officerName = useMemo(
    () => [schoolSettings?.studentSupportOfficerPrefix, schoolSettings?.studentSupportOfficerName].filter(Boolean).join(" "),
    [schoolSettings?.studentSupportOfficerPrefix, schoolSettings?.studentSupportOfficerName]
  );

  const { label: deputyRoleLabel, name: deputyName } = useMemo(
    () => getGroupPersonnel(schoolSettings, "general", true),
    [schoolSettings]
  );

  const buildPdfDocument = () => (
    <DailyClassroomSummaryPdfDocument
      rows={displayedRows}
      schoolName={schoolSettings?.schoolName || ""}
      logoBase64={logoBase64}
      academicYear={academicYear}
      term={term}
      dateStr={selectedDate}
      officerName={officerName}
      deputyName={deputyName}
      deputyRoleLabel={deputyRoleLabel}
      directorName={schoolSettings?.directorName || ""}
      levelLabel={currentTabObj.pdfLabel}
    />
  );

  const openPdfPreview = () => {
    if (displayedRows.length === 0) {
      Swal.fire("ไม่มีข้อมูล", `ไม่พบข้อมูลนักเรียนในส่วน ${currentTabObj.label} สำหรับวันที่เลือก`, "info");
      return;
    }
    setShowPdfPreview(true);
  };

  const downloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const blob = await pdf(buildPdfDocument()).toBlob();
      const levelSuffix = activeTab !== "all" ? `_${currentTabObj.pdfLabel}` : "_รวมทุกระดับ";
      saveAs(blob, `รายงานยอดรวมรายวัน_รายห้องเรียน${levelSuffix}_${selectedDate}.pdf`);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถดาวน์โหลดเอกสาร PDF ได้", "error");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-[#1e1f21] dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#2a2b2f] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <BackButton to="/academic/hub/students" />
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">รายงานยอดรวมรายวัน รายห้องเรียน</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  สรุปยอดนักเรียนมาเรียน/ขาด/สาย/ลา แยกตามห้องเรียน สำหรับวันที่เลือก
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openPdfPreview}
              disabled={loading || displayedRows.length === 0}
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-red-600 px-5 text-sm font-black text-white shadow-lg shadow-red-600/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-white/10"
            >
              <FileDown size={16} />
              ดาวน์โหลด PDF ({currentTabObj.label})
            </button>
          </div>

          <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="block lg:w-[320px] lg:flex-none">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">วันที่ต้องการดูรายงาน</span>
                <div className="relative">
                  <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={fetchReport}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60 lg:flex-none"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                ค้นหารายงาน
              </button>
            </div>

            {/* ชุดข้อมูล 4 ระดับ: 1 ระดับอนุบาล 2 ระดับประถมศึกษา 3 ระดับมัธยมศึกษา 4 รวมทุกระดับ */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">ชุดข้อมูล:</span>
              {LEVEL_TABS.map((tab) => {
                const count = getTabCount(tab.key);
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-2 ring-indigo-600 dark:bg-indigo-500"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1e1f21] dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {count} ห้อง
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">นักเรียนทั้งหมด ({currentTabObj.label})</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{displayedTotals.total}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">มาเรียนปกติ</p>
              <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">{displayedTotals.present}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">สาย / ลา</p>
              <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">{displayedTotals.late} / {displayedTotals.leave}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">ขาดเรียน</p>
              <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">{displayedTotals.absent}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#2a2b2f]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-[#323338] dark:text-slate-300">
                <tr>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">#</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ห้องเรียน/ชั้นเรียน/ระดับชั้น</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">เพศชาย</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">เพศหญิง</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">จำนวนทั้งหมด</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">มาเรียนปกติ</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">ขาดเรียน</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">มาเรียนสาย</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">ลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {loading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={9} className="px-3 py-2">
                        <SkeletonLoader height="28px" />
                      </td>
                    </tr>
                  ))
                ) : displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      ไม่พบข้อมูลห้องเรียนสำหรับ{currentTabObj.label} ในวันที่เลือก
                    </td>
                  </tr>
                ) : (
                  <>
                    {displayedRows.map((row, index) => (
                      <tr key={row.key} className="hover:bg-slate-50 dark:hover:bg-[#1e1f21]">
                        <td className="border-r border-slate-200 px-3 py-2 text-center font-bold dark:border-slate-700">{index + 1}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.label}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{row.male}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{row.female}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center font-bold dark:border-slate-700">{row.total}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center text-emerald-600 dark:border-slate-700 dark:text-emerald-400">{row.present}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center text-rose-600 dark:border-slate-700 dark:text-rose-400">{row.absent}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center text-amber-600 dark:border-slate-700 dark:text-amber-400">{row.late}</td>
                        <td className="px-3 py-2 text-center text-sky-600 dark:text-sky-400">{row.leave}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold dark:bg-[#323338]">
                      <td className="border-r border-slate-200 px-3 py-2 dark:border-slate-700"></td>
                      <td className="border-r border-slate-200 px-3 py-2 dark:border-slate-700">ยอดรวม ({currentTabObj.label})</td>
                      <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{displayedTotals.male}</td>
                      <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{displayedTotals.female}</td>
                      <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{displayedTotals.total}</td>
                      <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{displayedTotals.present}</td>
                      <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{displayedTotals.absent}</td>
                      <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{displayedTotals.late}</td>
                      <td className="px-3 py-2 text-center">{displayedTotals.leave}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
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
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                ตัวอย่างเอกสาร — รายงานยอดรวมรายวัน รายห้องเรียน ({currentTabObj.label})
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={isDownloadingPdf}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDownloadingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                  {isDownloadingPdf ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                  title="ปิด"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl bg-slate-100 dark:bg-slate-900">
              <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                {buildPdfDocument()}
              </PDFViewer>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default DailyClassroomAttendanceSummaryPage;
