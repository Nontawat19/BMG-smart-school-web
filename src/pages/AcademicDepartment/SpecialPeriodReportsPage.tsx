import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  collection, collectionGroup, doc, getDoc, getDocs, query, where,
} from "firebase/firestore";
import {
  Document as PdfDocument, Font, Image, Page,
  StyleSheet, Text, View, pdf,
} from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import {
  BarChart3, CalendarClock, ClipboardList,
  FileText, Printer, RefreshCw, Search, Users,
} from "lucide-react";
import Swal from "sweetalert2";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from "@/firebase";
import { RootState } from "@/store";
import { CLASS_FULL_NAMES, CLASSES } from "@/utils/schoolUtils";
import { useActivityHubSettings } from "@/hooks/useActivityHubSettings";

// ─── Font ───────────────────────────────────────────────────────────────────

try {
  Font.register({
    family: "TH Sarabun PSK",
    fonts: [
      { src: "/fonts/THSarabunNew.ttf" },
      { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
    ],
  });
} catch {}

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportType = "by-activity" | "by-class" | "by-student";
type AttendanceStatus = "present" | "late" | "leave" | "absent";

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
  periodType?: "recurring" | "oneTime";
  eventDate?: string;
  durationHours?: number;
}

interface LearnerActivityItem {
  id: string;
  name: string;
  courseCode?: string;
}

interface AttendanceDoc {
  id: string;
  periodId: string;
  periodTitle: string;
  dateStr: string;
  classId: string;
  className: string;
  room: string;
  topic?: string;
  teacherName?: string;
  records: Record<string, AttendanceStatus>;
  summary: Record<AttendanceStatus, number>;
  studentCount: number;
  academicYear?: string;
  semester?: string;
}

interface StudentAttendanceDoc {
  id: string;
  studentId: string;
  specialPeriodId?: string;
  specialPeriodTitle?: string;
  attendanceType?: string;
  classId?: string;
  className?: string;
  room?: string;
  teacherName?: string;
  status?: AttendanceStatus;
  academicYear?: string;
  semester?: string;
  activityTopic?: string;
  activityNote?: string;
  date?: any;
}

interface StudentDirectoryEntry {
  id: string;
  studentId?: string;
  studentNumber?: string;
  number?: string;
  title?: string;
  prefix?: string;
  firstName?: string;
  lastName?: string;
  classLevel?: string;
  room?: string;
}

interface PdfReportData {
  title: string;
  subtitle: string;
  detail?: string;
  schoolName: string;
  logoUrl?: string;
  orientation: "portrait" | "landscape";
  columns: { label: string; width: number; align?: "left" | "center" }[];
  rows: string[][];
}

// ─── Period type detection ────────────────────────────────────────────────────

type PeriodType = "custom" | "guidance" | "club" | "learner";

const getPeriodType = (title: string): PeriodType => {
  const lower = (title || "").toLowerCase();
  if (lower.includes("แนะแนว") || lower.includes("guidance")) return "guidance";
  if (lower.includes("ชุมนุม") || lower.includes("club")) return "club";
  if (lower.includes("กิจกรรมพัฒนา") || lower.includes("learner") || lower.includes("กพ.")) return "learner";
  return "custom";
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "เข้าร่วม",
  late: "มาสาย",
  leave: "ลา",
  absent: "ขาด",
};

const STATUS_SHORT: Record<AttendanceStatus, string> = {
  present: "✓",
  late: "ส",
  leave: "ล",
  absent: "ข",
};

const REPORT_MENUS: { id: ReportType; title: string; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    id: "by-activity",
    title: "รายงานสรุปรายกิจกรรม",
    desc: "สถิติการเข้าร่วมแต่ละวัน แยกตามห้องเรียน",
    icon: <CalendarClock size={22} />,
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
  },
  {
    id: "by-class",
    title: "รายงานรายห้องเรียน",
    desc: "รายชื่อนักเรียนพร้อมสถานะ แยกตามห้องและวันจัด",
    icon: <Users size={22} />,
    color: "bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400",
  },
  {
    id: "by-student",
    title: "รายงานรายบุคคล",
    desc: "สรุปการเข้าร่วมของแต่ละคน ทุกครั้งที่จัดกิจกรรม",
    icon: <BarChart3 size={22} />,
    color: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
  },
];

const PDF_ROWS_PER_PAGE = 35;

// ─── PDF Document ─────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "TH Sarabun PSK",
    paddingTop: 28,
    paddingHorizontal: 30,
    paddingBottom: 24,
    backgroundColor: "#fff",
    color: "#111",
    fontSize: 12,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 0.8,
    borderBottomColor: "#777",
    paddingBottom: 4,
    marginBottom: 8,
  },
  topText: { fontSize: 13, fontWeight: "bold" },
  headerBlock: { position: "relative", minHeight: 68, marginBottom: 4 },
  logo: { position: "absolute", left: 0, top: 2, width: 56, height: 56, objectFit: "contain" },
  titleWrap: { alignItems: "center", paddingTop: 6 },
  title: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  subtitle: { fontSize: 15, textAlign: "center", marginTop: 4 },
  detail: { fontSize: 13, textAlign: "center", marginTop: 3, color: "#333" },
  table: { width: "100%", borderTopWidth: 0.8, borderLeftWidth: 0.8, borderColor: "#222" },
  row: { flexDirection: "row", width: "100%", minHeight: 18, borderBottomWidth: 0.8, borderColor: "#222" },
  headerRow: { backgroundColor: "#d4d4d4", minHeight: 24 },
  cell: { borderRightWidth: 0.8, borderColor: "#222", paddingHorizontal: 3, paddingVertical: 3, justifyContent: "center" },
  headerCell: { alignItems: "center" },
  headerText: { fontSize: 13, fontWeight: "bold", textAlign: "center" },
  bodyText: { fontSize: 12 },
  centerText: { textAlign: "center" },
  pageNumber: { position: "absolute", bottom: 10, right: 30, fontSize: 9, color: "#555" },
});

const ReportPdfDocument: React.FC<{ data: PdfReportData }> = ({ data }) => {
  const logoSrc = data.logoUrl || "/school-logo.png";
  const pages: string[][][] = [];
  for (let i = 0; i < Math.max(data.rows.length, 1); i += PDF_ROWS_PER_PAGE) {
    pages.push(data.rows.slice(i, i + PDF_ROWS_PER_PAGE));
  }
  return (
    <PdfDocument>
      {pages.map((pageRows, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation={data.orientation} style={pdfStyles.page}>
          {pageIndex === 0 && (
            <>
              <View style={pdfStyles.topBar} fixed>
                <Text style={pdfStyles.topText}>{data.schoolName}</Text>
                <Text style={pdfStyles.topText}>{data.title}</Text>
              </View>
              <View style={pdfStyles.headerBlock}>
                {logoSrc && <Image src={logoSrc} style={pdfStyles.logo} />}
                <View style={pdfStyles.titleWrap}>
                  <Text style={pdfStyles.title}>{data.title}</Text>
                  {data.subtitle ? <Text style={pdfStyles.subtitle}>{data.subtitle}</Text> : null}
                  {data.detail && <Text style={pdfStyles.detail}>{data.detail}</Text>}
                </View>
              </View>
            </>
          )}
          <View style={pdfStyles.table}>
            <View style={[pdfStyles.row, pdfStyles.headerRow]} wrap={false}>
              {data.columns.map((col) => (
                <View key={col.label} style={[pdfStyles.cell, pdfStyles.headerCell, { width: `${col.width}%` }]}>
                  <Text style={pdfStyles.headerText}>{col.label}</Text>
                </View>
              ))}
            </View>
            {pageRows.map((row, ri) => (
              <View key={`${pageIndex}-${ri}`} style={pdfStyles.row} wrap={false}>
                {data.columns.map((col, ci) => (
                  <View key={`${pageIndex}-${ri}-${ci}`} style={[pdfStyles.cell, { width: `${col.width}%` }, col.align === "center" ? { alignItems: "center" } : {}]}>
                    <Text style={[pdfStyles.bodyText, col.align === "center" ? pdfStyles.centerText : {}]}>
                      {row[ci] || ""}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
          <Text
            style={pdfStyles.pageNumber}
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`}
            fixed
          />
        </Page>
      ))}
    </PdfDocument>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const thaiDate = (dateStr?: string) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

const sortDocs = (docs: AttendanceDoc[]) =>
  [...docs].sort((a, b) => {
    if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
    return `${a.classId}${a.room}`.localeCompare(`${b.classId}${b.room}`);
  });

const getStudentDisplayName = (student?: StudentDirectoryEntry) => {
  if (!student) return "-";
  return `${student.title || student.prefix || ""}${student.firstName || ""} ${student.lastName || ""}`.trim() || "-";
};

const sanitizeFileName = (value: string) =>
  String(value || "report").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");

const getDateStrFromUnknown = (value: any) => {
  if (!value) return "";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return "";
  }
  if (value?.toDate) {
    const parsed = value.toDate();
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return "";
};

const buildSummaryFromStudentDocs = (docs: StudentAttendanceDoc[], fallbackPeriodId = ""): AttendanceDoc[] => {
  const grouped = new Map<string, AttendanceDoc>();

  docs.forEach((raw) => {
    const periodId = String(raw.specialPeriodId || fallbackPeriodId || "");
    const classId = String(raw.classId || "");
    const room = String(raw.room || "");
    const studentKey = String(raw.studentId || "");
    const dateStr = getDateStrFromUnknown(raw.date);
    const status = (raw.status || "present") as AttendanceStatus;

    if (!periodId || !classId || !room || !studentKey || !dateStr) return;

    const key = `${periodId}__${dateStr}__${classId}__${room}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        periodId,
        periodTitle: String(raw.specialPeriodTitle || ""),
        dateStr,
        classId,
        className: String(raw.className || ""),
        room,
        topic: raw.activityTopic || "",
        teacherName: raw.teacherName || "",
        records: {},
        summary: { present: 0, late: 0, leave: 0, absent: 0 },
        studentCount: 0,
        academicYear: raw.academicYear || "",
        semester: raw.semester || "",
      });
    }

    const target = grouped.get(key)!;
    target.records[studentKey] = status;
    target.summary[status] = (target.summary[status] || 0) + 1;
    target.studentCount = Object.keys(target.records).length;
    if (!target.periodTitle && raw.specialPeriodTitle) target.periodTitle = raw.specialPeriodTitle;
    if (!target.topic && raw.activityTopic) target.topic = raw.activityTopic;
    if (!target.teacherName && raw.teacherName) target.teacherName = raw.teacherName;
  });

  return Array.from(grouped.values());
};

const mergeAttendanceSources = (summaryDocs: AttendanceDoc[], studentDocs: StudentAttendanceDoc[], fallbackPeriodId = "") => {
  const merged = new Map<string, AttendanceDoc>();

  summaryDocs.forEach((doc) => {
    const key = `${doc.periodId}__${doc.dateStr}__${doc.classId}__${doc.room}`;
    merged.set(key, {
      ...doc,
      records: doc.records || {},
      summary: doc.summary || { present: 0, late: 0, leave: 0, absent: 0 },
      studentCount: doc.studentCount || Object.keys(doc.records || {}).length,
    });
  });

  buildSummaryFromStudentDocs(studentDocs, fallbackPeriodId).forEach((fallbackDoc) => {
    const key = `${fallbackDoc.periodId}__${fallbackDoc.dateStr}__${fallbackDoc.classId}__${fallbackDoc.room}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, fallbackDoc);
      return;
    }

    const currentRecordsCount = Object.keys(current.records || {}).length;
    const fallbackRecordsCount = Object.keys(fallbackDoc.records || {}).length;
    if (currentRecordsCount === 0 || fallbackRecordsCount > currentRecordsCount) {
      current.records = fallbackDoc.records;
      current.summary = fallbackDoc.summary;
      current.studentCount = fallbackDoc.studentCount;
    }
    if (!current.topic && fallbackDoc.topic) current.topic = fallbackDoc.topic;
    if (!current.teacherName && fallbackDoc.teacherName) current.teacherName = fallbackDoc.teacherName;
    if (!current.periodTitle && fallbackDoc.periodTitle) current.periodTitle = fallbackDoc.periodTitle;
    merged.set(key, current);
  });

  return Array.from(merged.values());
};

const isSpecialPeriodStudentDoc = (doc: StudentAttendanceDoc, selectedPeriodId: string) =>
  doc.attendanceType === "special_period" && doc.specialPeriodId === selectedPeriodId;

// ─── Page ─────────────────────────────────────────────────────────────────────

const SpecialPeriodReportsPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId || "";
  const { schoolName, logoUrl: schoolLogoUrl } = useSelector((state: RootState) => state.schoolSettings);
  const teachersMap = useSelector((state: RootState) => (state as any).userMap?.teachers as Record<string, { name?: string; title?: string; firstName?: string; lastName?: string; homeroomGrade?: string; homeroomRoom?: string }> || {});
  const calendarTerms = useSelector((state: RootState) => state.calendar.terms);
  const calendarAcademicYear = useSelector((state: RootState) => state.calendar.academicYear);

  // A school that hasn't chosen a mode yet defaults to 'special-period' here, matching the
  // convention most other consumers of this setting use (see useActivityHubSettings).
  const { activityMode: rawActivityMode, loading: activityModeSettingLoading } = useActivityHubSettings(schoolId);
  const activityMode = rawActivityMode ?? 'special-period';
  const [learnerActivities, setLearnerActivities] = useState<LearnerActivityItem[]>([]);

  const [periods, setPeriods] = useState<SpecialPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [periodsLoading, setPeriodsLoading] = useState(true);

  const [reportType, setReportType] = useState<ReportType | null>(null);

  const [attendanceDocs, setAttendanceDocs] = useState<AttendanceDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [studentDirectory, setStudentDirectory] = useState<Record<string, StudentDirectoryEntry>>({});

  // Filters
  const [filterClass, setFilterClass] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  type DateMode = "all" | "today" | "week" | "month" | "semester" | "year" | "custom";
  const [filterDateMode, setFilterDateMode] = useState<DateMode>("all");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");

  const [isPrinting, setIsPrinting] = useState(false);

  const loadCustomAttendanceFallback = async (selectedId: string) => {
    const snap = await getDocs(query(
      collectionGroup(db, "ClassroomAttendance"),
      where("schoolId", "==", schoolId),
      where("attendanceType", "==", "special_period"),
      where("specialPeriodId", "==", selectedId),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudentAttendanceDoc));
  };

  const loadGuidanceAttendance = async (periodId: string): Promise<AttendanceDoc[]> => {
    const snap = await getDocs(query(
      collectionGroup(db, "ClassroomAttendance"),
      where("schoolId", "==", schoolId),
      where("subjectCode", "==", "GUIDANCE"),
    ));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudentAttendanceDoc));
    return buildSummaryFromStudentDocs(docs, periodId);
  };

  const loadClubAttendance = async (periodId: string): Promise<AttendanceDoc[]> => {
    const clubsSnap = await getDocs(collection(db, "school-settings", schoolId, "clubs"));
    const linkedClubs = clubsSnap.docs
      .filter((d) => (d.data() as any).specialPeriodId === periodId)
      .map((d) => ({ id: d.id, ...(d.data() as any) }));

    if (linkedClubs.length === 0) return [];

    const results: AttendanceDoc[] = [];
    await Promise.all(linkedClubs.map(async (club) => {
      const attSnap = await getDocs(collection(db, "school-settings", schoolId, "clubs", club.id, "attendance"));
      attSnap.docs.forEach((d) => {
        const data = d.data();
        const records = (data.records || {}) as Record<string, AttendanceStatus>;
        const dateStr = String(data.date || "");
        if (!dateStr || Object.keys(records).length === 0) return;
        const summary = { present: 0, late: 0, leave: 0, absent: 0 } as Record<AttendanceStatus, number>;
        Object.values(records).forEach((s) => { summary[s as AttendanceStatus] = (summary[s as AttendanceStatus] || 0) + 1; });
        results.push({
          id: d.id,
          periodId,
          periodTitle: club.name || "ชุมนุม",
          dateStr,
          classId: club.id,
          className: club.name || "ชุมนุม",
          room: "1",
          topic: data.topic || "",
          teacherName: data.updatedByTeacherId || "",
          records,
          summary,
          studentCount: Object.keys(records).length,
          academicYear: data.academicYear || "",
          semester: data.semester || "",
        });
      });
    }));
    return results;
  };

  const loadLearnerActivityAttendance = async (periodId: string): Promise<AttendanceDoc[]> => {
    const activitiesSnap = await getDocs(collection(db, "school-settings", schoolId, "learner-activities"));
    const results: AttendanceDoc[] = [];
    await Promise.all(activitiesSnap.docs.map(async (actDoc) => {
      const attSnap = await getDocs(collection(db, "school-settings", schoolId, "learner-activities", actDoc.id, "attendance"));
      attSnap.docs.forEach((d) => {
        const data = d.data();
        if (String(data.specialPeriodId || "") !== periodId) return;
        const records = (data.records || {}) as Record<string, AttendanceStatus>;
        const dateStr = String(data.date || "");
        if (!dateStr || Object.keys(records).length === 0) return;
        const actData = actDoc.data() as any;
        const summary = { present: 0, late: 0, leave: 0, absent: 0 } as Record<AttendanceStatus, number>;
        Object.values(records).forEach((s) => { summary[s as AttendanceStatus] = (summary[s as AttendanceStatus] || 0) + 1; });
        results.push({
          id: d.id,
          periodId,
          periodTitle: data.activityName || actData.name || "",
          dateStr,
          classId: actDoc.id,
          className: data.activityName || actData.name || "กิจกรรม",
          room: data.teacherScopeKey || "1",
          topic: data.topic || "",
          teacherName: data.teacherName || "",
          records,
          summary,
          studentCount: Object.keys(records).length,
          academicYear: data.academicYear || "",
          semester: data.semester || "",
        });
      });
    }));
    return results;
  };

  const loadCourseBasedActivityAttendance = async (activityId: string): Promise<AttendanceDoc[]> => {
    const attSnap = await getDocs(collection(db, "school-settings", schoolId, "learner-activities", activityId, "attendance"));
    const actData = learnerActivities.find((a) => a.id === activityId);
    const results: AttendanceDoc[] = [];
    attSnap.docs.forEach((d) => {
      const data = d.data();
      const records = (data.records || {}) as Record<string, AttendanceStatus>;
      const dateStr = String(data.date || "");
      if (!dateStr || Object.keys(records).length === 0) return;
      const summary = { present: 0, late: 0, leave: 0, absent: 0 } as Record<AttendanceStatus, number>;
      Object.values(records).forEach((s) => { summary[s as AttendanceStatus] = (summary[s as AttendanceStatus] || 0) + 1; });
      results.push({
        id: d.id,
        periodId: activityId,
        periodTitle: data.activityName || actData?.name || "กิจกรรม",
        dateStr,
        classId: activityId,
        className: data.activityName || actData?.name || "กิจกรรม",
        room: data.teacherScopeKey || "1",
        topic: data.topic || "",
        teacherName: data.teacherName || "",
        records,
        summary,
        studentCount: Object.keys(records).length,
        academicYear: data.academicYear || "",
        semester: data.semester || "",
      });
    });
    return results;
  };

  // ── Load selectable items once the (shared, live) activity mode is known ───
  useEffect(() => {
    if (!schoolId || activityModeSettingLoading) return;

    if (activityMode === 'course-based') {
      getDocs(collection(db, "school-settings", schoolId, "learner-activities")).then((actSnap) => {
        const list = actSnap.docs
          .map((d) => ({ id: d.id, name: (d.data() as any).name || 'กิจกรรม', courseCode: (d.data() as any).courseCode } as LearnerActivityItem))
          .sort((a, b) => a.name.localeCompare(b.name, "th"));
        setLearnerActivities(list);
        setPeriodsLoading(false);
      }).catch(() => setPeriodsLoading(false));
    } else {
      getDocs(collection(db, "school-settings", schoolId, "special-periods")).then((snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as SpecialPeriod))
          .sort((a, b) => {
            if (a.periodType === "oneTime" && b.periodType === "oneTime")
              return (b.eventDate || "") > (a.eventDate || "") ? 1 : -1;
            if (a.periodType === "oneTime") return -1;
            if (b.periodType === "oneTime") return 1;
            return String(a.title).localeCompare(String(b.title), "th");
          });
        setPeriods(list);
        setPeriodsLoading(false);
      }).catch(() => setPeriodsLoading(false));
    }
  }, [schoolId, activityMode, activityModeSettingLoading]);

  useEffect(() => {
    if (!schoolId) return;
    getDocs(collection(db, "school-settings", schoolId, "students")).then((snap) => {
      const next: Record<string, StudentDirectoryEntry> = {};
      snap.docs.forEach((d) => {
        next[d.id] = { ...(d.data() as StudentDirectoryEntry), id: d.id };
      });
      setStudentDirectory(next);
    });
  }, [schoolId]);

  // ── Load attendance docs when period/activity selected ──────────────────────
  useEffect(() => {
    if (!schoolId || !selectedPeriodId) { setAttendanceDocs([]); return; }
    setDocsLoading(true);
    const load = async () => {
      try {
        let docs: AttendanceDoc[] = [];

        if (activityMode === 'course-based') {
          docs = await loadCourseBasedActivityAttendance(selectedPeriodId);
        } else {
          const periodTitle = periods.find((p) => p.id === selectedPeriodId)?.title || "";
          const periodType = getPeriodType(periodTitle);

          if (periodType === "guidance") {
            docs = await loadGuidanceAttendance(selectedPeriodId);
          } else if (periodType === "club") {
            docs = await loadClubAttendance(selectedPeriodId);
          } else if (periodType === "learner") {
            docs = await loadLearnerActivityAttendance(selectedPeriodId);
          } else {
            // custom: special-period-attendance + ClassroomAttendance fallback
            const summarySnap = await getDocs(query(
              collection(db, "school-settings", schoolId, "special-period-attendance"),
              where("periodId", "==", selectedPeriodId)
            ));
            const summaryDocs = summarySnap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceDoc));
            const needFallback = summaryDocs.length === 0
              || summaryDocs.some((doc) => Object.keys(doc.records || {}).length === 0);
            let studentDocs: StudentAttendanceDoc[] = [];
            if (needFallback) {
              try {
                studentDocs = await loadCustomAttendanceFallback(selectedPeriodId);
              } catch (fallbackErr) {
                console.warn("[Reports] fallback failed:", fallbackErr);
              }
            }
            docs = mergeAttendanceSources(summaryDocs, studentDocs, selectedPeriodId);
          }
        }

        setAttendanceDocs(docs);
      } catch (error) {
        console.error("Error loading report data:", error);
        setAttendanceDocs([]);
      } finally {
        setDocsLoading(false);
      }
    };

    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, selectedPeriodId, periods, activityMode, learnerActivities]);

  useEffect(() => {
    if (selectedPeriodId && !reportType) {
      setReportType("by-class");
    }
  }, [selectedPeriodId, reportType]);

  const selectedPeriod = useMemo(() => periods.find((p) => p.id === selectedPeriodId) || null, [periods, selectedPeriodId]);

  const selectedItemName = useMemo(() => {
    if (activityMode === 'course-based') return learnerActivities.find((a) => a.id === selectedPeriodId)?.name || '';
    return selectedPeriod?.title || '';
  }, [activityMode, learnerActivities, selectedPeriodId, selectedPeriod]);

  // ── Date range from mode ──────────────────────────────────────────────────
  const effectiveDateRange = useMemo((): { start: string; end: string } | null => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (filterDateMode === "all") return null;

    if (filterDateMode === "today") {
      const t = fmt(today);
      return { start: t, end: t };
    }
    if (filterDateMode === "week") {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const mon = new Date(today); mon.setDate(today.getDate() - diff);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { start: fmt(mon), end: fmt(sun) };
    }
    if (filterDateMode === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    if (filterDateMode === "semester") {
      const todayStr = fmt(today);
      const current = calendarTerms.find((t) => t.startDate <= todayStr && t.endDate >= todayStr);
      if (current) return { start: current.startDate, end: current.endDate };
      if (calendarTerms.length > 0) return { start: calendarTerms[0].startDate, end: calendarTerms[calendarTerms.length - 1].endDate };
      return null;
    }
    if (filterDateMode === "year") {
      if (calendarTerms.length > 0) {
        const starts = calendarTerms.map((t) => t.startDate).filter(Boolean).sort();
        const ends = calendarTerms.map((t) => t.endDate).filter(Boolean).sort();
        if (starts[0] && ends[ends.length - 1]) return { start: starts[0], end: ends[ends.length - 1] };
      }
      // fallback: Thai academic year starts May of current Gregorian year
      const yr = today.getFullYear();
      return { start: `${yr}-05-01`, end: `${yr + 1}-04-30` };
    }
    if (filterDateMode === "custom") {
      if (filterDateStart && filterDateEnd) return { start: filterDateStart, end: filterDateEnd };
      if (filterDateStart) return { start: filterDateStart, end: filterDateStart };
      return null;
    }
    return null;
  }, [filterDateMode, filterDateStart, filterDateEnd, calendarTerms]);

  // Derived filter options
  const availableDates = useMemo(() =>
    Array.from(new Set(attendanceDocs.map((d) => d.dateStr))).sort(),
    [attendanceDocs]
  );
  const availableClasses = useMemo(() =>
    Array.from(new Set(attendanceDocs.map((d) => d.classId))).sort(),
    [attendanceDocs]
  );
  const availableRooms = useMemo(() => {
    const src = filterClass
      ? attendanceDocs.filter((d) => d.classId === filterClass)
      : attendanceDocs;
    return Array.from(new Set(src.map((d) => d.room))).sort((a, b) => parseInt(a) - parseInt(b));
  }, [attendanceDocs, filterClass]);

  // Display names for class filter — supports club/learner-activity periods that use non-standard classIds
  const classDisplayNames = useMemo(() => {
    const names: Record<string, string> = {};
    attendanceDocs.forEach((d) => {
      names[d.classId] = d.className || CLASSES[d.classId] || d.classId;
    });
    return names;
  }, [attendanceDocs]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    if (!filterClass && availableClasses.length > 0) {
      setFilterClass(availableClasses[0]);
    }
  }, [selectedPeriodId, filterClass, availableClasses]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    if (filterClass && !availableClasses.includes(filterClass)) {
      setFilterClass(availableClasses[0] || "");
      return;
    }
    if (!filterRoom && availableRooms.length > 0) {
      setFilterRoom(availableRooms[0]);
      return;
    }
    if (filterRoom && !availableRooms.includes(filterRoom)) {
      setFilterRoom(availableRooms[0] || "");
    }
  }, [selectedPeriodId, filterClass, filterRoom, availableClasses, availableRooms]);

  // Filtered docs
  const filteredDocs = useMemo(() => {
    let docs = attendanceDocs;
    if (filterClass) docs = docs.filter((d) => d.classId === filterClass);
    if (filterRoom) docs = docs.filter((d) => d.room === filterRoom);
    if (effectiveDateRange) {
      docs = docs.filter((d) => d.dateStr >= effectiveDateRange.start && d.dateStr <= effectiveDateRange.end);
    }
    return sortDocs(docs);
  }, [attendanceDocs, filterClass, filterRoom, effectiveDateRange]);

  // ── Build preview table rows ──────────────────────────────────────────────
  const previewData = useMemo(() => {
    if (!reportType || filteredDocs.length === 0) return null;

    if (reportType === "by-activity") {
      // Group by date → for each date show summary per class/room
      const byDate: Record<string, AttendanceDoc[]> = {};
      filteredDocs.forEach((d) => {
        if (!byDate[d.dateStr]) byDate[d.dateStr] = [];
        byDate[d.dateStr].push(d);
      });

      const rows: string[][] = [];
      Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).forEach(([dateStr, docs]) => {
        const dateLabel = thaiDate(dateStr);
        docs.forEach((doc) => {
          const s = doc.summary || {};
          rows.push([
            dateLabel,
            `${doc.className || CLASSES[doc.classId] || doc.classId}/${doc.room !== "1" ? doc.room : ""}`.replace(/\/$/, ""),
            String(doc.studentCount || 0),
            String(s.present || 0),
            String(s.late || 0),
            String(s.leave || 0),
            String(s.absent || 0),
            doc.topic || "-",
            doc.teacherName || "-",
          ]);
        });
      });

      return {
        columns: [
          { label: "วันที่จัด", width: 17 },
          { label: "ห้องเรียน", width: 10, align: "center" as const },
          { label: "ทั้งหมด", width: 7, align: "center" as const },
          { label: "เข้าร่วม", width: 7, align: "center" as const },
          { label: "สาย", width: 6, align: "center" as const },
          { label: "ลา", width: 6, align: "center" as const },
          { label: "ขาด", width: 6, align: "center" as const },
          { label: "หัวข้อกิจกรรม", width: 24 },
          { label: "ผู้สอน", width: 17 },
        ],
        rows,
      };
    }

    if (reportType === "by-class") {
      const rows: string[][] = [];
      filteredDocs.forEach((doc) => {
        const dateLabel = thaiDate(doc.dateStr);
        const classLabel = `${doc.className || CLASSES[doc.classId] || doc.classId}${doc.room && doc.room !== "1" ? `/${doc.room}` : ""}`;
        const records = doc.records || {};
        const sortedRecords = Object.entries(records).sort(([firstSid], [secondSid]) => {
          const firstStudent = studentDirectory[firstSid];
          const secondStudent = studentDirectory[secondSid];
          const firstNo = Number(firstStudent?.studentNumber || firstStudent?.number || 0);
          const secondNo = Number(secondStudent?.studentNumber || secondStudent?.number || 0);
          if (firstNo !== secondNo) return firstNo - secondNo;
          const firstCode = String(firstStudent?.studentId || firstSid);
          const secondCode = String(secondStudent?.studentId || secondSid);
          return firstCode.localeCompare(secondCode, "th", { numeric: true });
        });
        let no = 1;
        sortedRecords.forEach(([sid, status]) => {
          const student = studentDirectory[sid];
          rows.push([
            String(no++),
            student?.studentId || sid,
            getStudentDisplayName(student),
            classLabel,
            dateLabel,
            STATUS_LABEL[status as AttendanceStatus] || status,
            doc.topic || "-",
          ]);
        });
      });

      return {
        columns: [
          { label: "ลำดับ", width: 7, align: "center" as const },
          { label: "รหัสนักเรียน", width: 14 },
          { label: "ชื่อ-สกุล", width: 24 },
          { label: "ห้องเรียน", width: 11, align: "center" as const },
          { label: "วันที่จัด", width: 16 },
          { label: "สถานะ", width: 10, align: "center" as const },
          { label: "หัวข้อกิจกรรม", width: 18 },
        ],
        rows,
      };
    }

    // by-student: aggregate per class/room — show all dates as columns
    if (reportType === "by-student") {
      const dates = Array.from(new Set(filteredDocs.map((d) => d.dateStr))).sort();
      // collect all student records across docs
      const studentMap: Record<string, { name: string; classLabel: string; room: string; dates: Record<string, AttendanceStatus> }> = {};
      filteredDocs.forEach((doc) => {
        const classLabel = CLASSES[doc.classId] || doc.classId;
        Object.entries(doc.records || {}).forEach(([sid, status]) => {
          const student = studentDirectory[sid];
          if (!studentMap[sid]) {
            studentMap[sid] = {
              name: getStudentDisplayName(student),
              classLabel: student?.classLevel ? (CLASSES[student.classLevel] || student.classLevel) : classLabel,
              room: student?.room || doc.room,
              dates: {},
            };
          }
          studentMap[sid].dates[doc.dateStr] = status as AttendanceStatus;
        });
      });

      // Fixed columns: ลำดับ(6) + รหัส(12) + ห้อง(10) + ชื่อ(18) = 46
      // Summary cols: 4 × 7 = 28  → dates pool = 26
      const FIXED_W = 46;
      const SUMMARY_W = 7;
      const datePool = 100 - FIXED_W - SUMMARY_W * 4;
      const eachDateW = dates.length > 0 ? Math.max(5, Math.floor(datePool / dates.length)) : 10;

      const columns = [
        { label: "ลำดับ", width: 6, align: "center" as const },
        { label: "รหัสนักเรียน", width: 12 },
        { label: "ชั้น/ห้อง", width: 10, align: "center" as const },
        { label: "ชื่อ-สกุล", width: 18 },
        ...dates.map((d) => ({ label: new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }), width: eachDateW, align: "center" as const })),
        { label: "เข้าร่วม", width: SUMMARY_W, align: "center" as const },
        { label: "ขาด", width: SUMMARY_W, align: "center" as const },
        { label: "สาย", width: SUMMARY_W, align: "center" as const },
        { label: "ลา", width: SUMMARY_W, align: "center" as const },
      ];

      const rows = Object.entries(studentMap)
        .sort(([, a], [, b]) => `${a.classLabel}${a.room}`.localeCompare(`${b.classLabel}${b.room}`))
        .map(([sid, info], rowIndex) => {
          const student = studentDirectory[sid];
          const dateCells = dates.map((d) => STATUS_SHORT[info.dates[d] || "absent"] || "ข");
          const presentCount = Object.values(info.dates).filter((s) => s === "present").length;
          const absentCount = Object.values(info.dates).filter((s) => s === "absent").length;
          const lateCount = Object.values(info.dates).filter((s) => s === "late").length;
          const leaveCount = Object.values(info.dates).filter((s) => s === "leave").length;
          return [
            String(rowIndex + 1),
            student?.studentId || sid,
            `${info.classLabel}/${info.room}`,
            info.name,
            ...dateCells,
            String(presentCount),
            String(absentCount),
            String(lateCount),
            String(leaveCount),
          ];
        });
      return { columns, rows };
    }

    return null;
  }, [reportType, filteredDocs, studentDirectory]);

  const visiblePreviewRows = useMemo(() => {
    if (!previewData) return [];
    return previewData.rows.filter((row) => {
      if (!studentSearch) return true;
      return row.some((cell) => String(cell || "").toLowerCase().includes(studentSearch.toLowerCase()));
    });
  }, [previewData, studentSearch]);

  // ── Summary stats for preview ─────────────────────────────────────────────
  const totalStats = useMemo(() => {
    let present = 0, late = 0, leave = 0, absent = 0, total = 0;
    filteredDocs.forEach((d) => {
      present += d.summary?.present || 0;
      late += d.summary?.late || 0;
      leave += d.summary?.leave || 0;
      absent += d.summary?.absent || 0;
      total += d.studentCount || 0;
    });
    return { present, late, leave, absent, total, sessions: filteredDocs.length };
  }, [filteredDocs]);

  // ── Print PDF ────────────────────────────────────────────────────────────
  const handlePrint = async () => {
    if (!previewData || !selectedItemName || isPrinting) return;
    if (visiblePreviewRows.length === 0) {
      Swal.fire("ไม่มีข้อมูล", "ไม่พบข้อมูลสำหรับสร้างรายงาน PDF", "info");
      return;
    }
    setIsPrinting(true);
    try {
      const typeLabel = REPORT_MENUS.find((m) => m.id === reportType)?.title || "รายงาน";

      // Full class name (e.g. "ประถมศึกษาปีที่ 1")
      const fullClassName = filterClass
        ? (CLASS_FULL_NAMES[filterClass] || CLASSES[filterClass] || filterClass)
        : "";

      // Find homeroom teacher for the filtered class+room
      let homeroomTeacherName = "";
      if (filterClass && filterRoom) {
        const classShort = CLASSES[filterClass] || filterClass;
        console.log("[PDF] filterClass:", filterClass, "classShort:", classShort, "filterRoom:", filterRoom);
        Object.values(teachersMap).slice(0, 5).forEach((t, i) => {
          console.log(`[PDF] teacher[${i}] name="${t.name}" homeroomGrade="${t.homeroomGrade}" homeroomRoom="${t.homeroomRoom}"`);
        });
        const matched = Object.values(teachersMap).find((t) => {
          const grade = String(t.homeroomGrade || "").trim();
          const room = String(t.homeroomRoom || "").trim();
          const gradeMatch =
            grade === filterClass ||
            grade === classShort ||
            grade === `${classShort}/${filterRoom}` ||
            grade === `${filterClass}/${filterRoom}`;
          const roomMatch = room === "" || room === filterRoom || room === String(parseInt(filterRoom, 10));
          return gradeMatch && roomMatch;
        });
        if (matched) {
          homeroomTeacherName = matched.name || `${matched.title || ""}${matched.firstName || ""} ${matched.lastName || ""}`.trim();
        }
        console.log("[PDF] matched teacher:", matched, "name:", homeroomTeacherName);
      }

            // Build date range label for PDF
      const DATE_MODE_LABELS: Record<string, string> = {
        all: "ทั้งปีการศึกษา", today: "วันนี้", week: "สัปดาห์นี้",
        month: "เดือนนี้", semester: "ภาคเรียนนี้", year: `ปีการศึกษา ${calendarAcademicYear || ""}`,
      };
      let dateRangeLabel = "";
      if (filterDateMode === "all") {
        dateRangeLabel = "";
      } else if (filterDateMode === "custom" && effectiveDateRange) {
        dateRangeLabel = effectiveDateRange.start === effectiveDateRange.end
          ? `วันที่ ${thaiDate(effectiveDateRange.start)}`
          : `${thaiDate(effectiveDateRange.start)} – ${thaiDate(effectiveDateRange.end)}`;
      } else {
        dateRangeLabel = DATE_MODE_LABELS[filterDateMode] || "";
      }

      // Build detail line: "ประถมศึกษาปีที่ 1 ห้อง 4  ครูประจำชั้น ..."
      let filterLabel: string;
      if (fullClassName) {
        filterLabel = `${fullClassName}${filterRoom ? ` ห้อง ${filterRoom}` : ""}`;
        if (homeroomTeacherName) filterLabel += `   ครูประจำชั้น ${homeroomTeacherName}`;
        if (dateRangeLabel) filterLabel += `   ${dateRangeLabel}`;
      } else {
        filterLabel = dateRangeLabel || "ทุกระดับชั้น";
      }

      const pdfData: PdfReportData = {
        title: `รายงานกิจกรรม${selectedItemName}`,
        subtitle: "",
        detail: filterLabel,
        schoolName: schoolName || "โรงเรียน",
        logoUrl: schoolLogoUrl || undefined,
        orientation: reportType === "by-student" && previewData.columns.length > 8 ? "landscape" : "portrait",
        columns: previewData.columns,
        rows: visiblePreviewRows,
      };

      const blob = await pdf(<ReportPdfDocument data={pdfData} />).toBlob();
      saveAs(blob, `รายงาน_${sanitizeFileName(selectedItemName)}_${reportType}_${Date.now()}.pdf`);
    } catch (err) {
      console.error("PDF error:", err);
      Swal.fire("สร้าง PDF ไม่สำเร็จ", "ไม่สามารถสร้างไฟล์รายงานได้ในขณะนี้", "error");
    } finally {
      setIsPrinting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-3 sm:p-4">
        <div className="max-w-6xl mx-auto space-y-3">

          {/* Header */}
          <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
            <BackButton to="/academic/hub/attendance" />
            <ClipboardList className="text-indigo-500 shrink-0" size={20} />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-extrabold leading-tight">รายงานการเข้าร่วมกิจกรรม{activityMode === 'course-based' ? 'พัฒนาผู้เรียน' : 'พิเศษ'}</h1>
              <p className="text-xs text-gray-400 mt-0.5">เลือกข้อมูลจาก dropdown ด้านล่าง แล้วระบบจะแสดงตัวอย่างรายงานให้ทันที</p>
            </div>
          </div>

          {/* Compact controls */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-5">
                <label className="mb-1 block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  กิจกรรม
                </label>
                {periodsLoading ? (
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-400 dark:border-gray-600 dark:bg-[#1e1f21]">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-500" />
                    กำลังโหลดกิจกรรม...
                  </div>
                ) : (
                  <div className="relative">
                    <CalendarClock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" />
                    <select
                      value={selectedPeriodId}
                      onChange={(e) => {
                        setSelectedPeriodId(e.target.value);
                        setReportType(null);
                        setFilterClass("");
                        setFilterRoom("");
                        setFilterDateMode("all");
                        setFilterDateStart("");
                        setFilterDateEnd("");
                        setStudentSearch("");
                      }}
                      className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] pl-9 pr-3 text-sm font-bold outline-none dark:text-white focus:ring-2 focus:ring-indigo-500/20">
                      <option value="">— เลือกกิจกรรม —</option>
                      {activityMode === 'course-based'
                        ? learnerActivities.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}{a.courseCode ? ` (${a.courseCode})` : ''}
                            </option>
                          ))
                        : periods.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title} • {p.periodType === "oneTime" ? thaiDate(p.eventDate) : "รายสัปดาห์"} • {p.startTime}–{p.endTime} น.
                            </option>
                          ))
                      }
                    </select>
                  </div>
                )}
              </div>

              <div className="lg:col-span-3">
                <label className="mb-1 block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  ประเภทรายงาน
                </label>
                <select
                  value={reportType || ""}
                  onChange={(e) => setReportType((e.target.value || null) as ReportType | null)}
                  disabled={!selectedPeriodId}
                  className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] px-3 text-sm font-bold outline-none dark:text-white focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60">
                  <option value="">— เลือกรายงาน —</option>
                  {REPORT_MENUS.map((menu) => (
                    <option key={menu.id} value={menu.id}>{menu.title}</option>
                  ))}
                </select>
              </div>

                <div className="lg:col-span-4 flex items-end">
                  <div className="flex w-full items-center justify-between rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-[#1e1f21] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะข้อมูล</p>
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">
                      {docsLoading ? "กำลังโหลดข้อมูล..." : selectedPeriodId ? `พบ ${attendanceDocs.length} รายการเช็คชื่อ` : "เลือกกิจกรรมก่อน"}
                    </p>
                  </div>
                  {docsLoading && <RefreshCw size={14} className="animate-spin text-indigo-500 shrink-0" />}
                </div>
              </div>
            </div>

            {selectedPeriodId && (
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                  {selectedItemName || "กิจกรรม"}
                </span>
                {selectedPeriod && activityMode === 'special-period' && (
                  <>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold text-gray-600 dark:bg-white/5 dark:text-gray-300">
                      {selectedPeriod.periodType === "oneTime" ? thaiDate(selectedPeriod.eventDate) : "รายสัปดาห์"}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold text-gray-600 dark:bg-white/5 dark:text-gray-300">
                      {selectedPeriod.startTime}–{selectedPeriod.endTime} น.
                    </span>
                  </>
                )}
                {activityMode === 'course-based' && selectedPeriodId && (
                  <span className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                    แบบรายวิชา
                  </span>
                )}
                {reportType && (
                  <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                    {REPORT_MENUS.find((m) => m.id === reportType)?.title}
                  </span>
                )}
              </div>
            )}

            {reportType && selectedPeriodId && (
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                <div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">รายชั้น</label>
                    <select value={filterClass} onChange={(e) => { setFilterClass(e.target.value); setFilterRoom(""); }}
                      disabled={availableClasses.length === 0}
                      className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200">
                      <option value="">{availableClasses.length === 0 ? "ไม่พบระดับชั้น" : "ทุกระดับชั้น"}</option>
                      {availableClasses.map((c) => <option key={c} value={c}>{classDisplayNames[c] || CLASSES[c] || c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">รายห้อง</label>
                    <select value={filterRoom} onChange={(e) => setFilterRoom(e.target.value)}
                      disabled={availableRooms.length === 0}
                      className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200">
                      <option value="">{availableRooms.length === 0 ? "ไม่พบห้องเรียน" : "ทุกห้อง"}</option>
                      {availableRooms.map((r) => <option key={r} value={r}>ห้อง {r}</option>)}
                    </select>
                  </div>
                </div>
                {/* Date range filter */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">ช่วงเวลา</label>
                  <select
                    value={filterDateMode}
                    onChange={(e) => { setFilterDateMode(e.target.value as DateMode); setFilterDateStart(""); setFilterDateEnd(""); }}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="today">วันนี้</option>
                    <option value="week">สัปดาห์นี้</option>
                    <option value="month">เดือนนี้</option>
                    <option value="semester">ภาคเรียนนี้</option>
                    <option value="year">ปีการศึกษานี้</option>
                    <option value="custom">กำหนดเอง</option>
                  </select>
                  {filterDateMode === "custom" && (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="date"
                        value={filterDateStart}
                        onChange={(e) => setFilterDateStart(e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                      />
                      <span className="self-center text-slate-400 text-sm">–</span>
                      <input
                        type="date"
                        value={filterDateEnd}
                        min={filterDateStart}
                        onChange={(e) => setFilterDateEnd(e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                      />
                    </div>
                  )}
                </div>
                {previewData && (
                  <div className="col-span-2 sm:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">ค้นหาในรายงาน</label>
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder={reportType === "by-activity" ? "ค้นหาห้องเรียน, หัวข้อ, ผู้สอน..." : "ค้นหารหัส, ชื่อ, ห้อง, สถานะ..."}
                        className="w-full h-10 pl-8 pr-3 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200" />
                    </div>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-1 xl:col-span-1 flex items-end">
                  <button
                    onClick={handlePrint}
                    disabled={isPrinting || !previewData || visiblePreviewRows.length === 0}
                    className="inline-flex w-full h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {isPrinting ? <RefreshCw size={13} className="animate-spin" /> : <Printer size={13} />}
                    {isPrinting ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          {reportType && selectedPeriodId && (
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-3">
              {filteredDocs.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { label: "วันจัด", value: `${new Set(filteredDocs.map((d) => d.dateStr)).size}`, color: "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300" },
                    { label: "เข้าร่วม", value: totalStats.present, color: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" },
                    { label: "สาย", value: totalStats.late, color: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" },
                    { label: "ลา", value: totalStats.leave, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" },
                    { label: "ขาด", value: totalStats.absent, color: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300" },
                  ].map((s) => (
                    <div key={s.label} className={`rounded-xl px-3 py-2 ${s.color}`}>
                      <p className="text-base font-black leading-none">{s.value}</p>
                      <p className="text-[10px] font-bold opacity-70 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview table */}
              {docsLoading ? (
                <div className="space-y-2 py-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={`skeleton-${i}`} className="h-6 w-full rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                  ))}
                </div>
              ) : !previewData || visiblePreviewRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-400">
                  <FileText size={28} className="mb-2 opacity-30" />
                  <p className="text-sm font-bold">ไม่พบข้อมูลในเงื่อนไขที่เลือก</p>
                  <p className="text-xs mt-1">กรุณาเช็คชื่อในหน้าเช็คชื่อกิจกรรมก่อน</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-white/5">
                        {previewData.columns.map((col) => (
                          <th key={col.label}
                            className={`px-2 py-2 border-b border-gray-200 dark:border-gray-700 font-black text-gray-600 dark:text-gray-300 whitespace-nowrap ${col.align === "center" ? "text-center" : "text-left"}`}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {visiblePreviewRows
                        .slice(0, 50)
                        .map((row, ri) => (
                          <tr key={ri} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                            {previewData.columns.map((col, ci) => (
                              <td key={ci}
                                className={`px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-pre-line ${col.align === "center" ? "text-center" : ""}`}>
                                {row[ci] || ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {visiblePreviewRows.length > 50 && (
                    <p className="text-center text-xs text-gray-400 py-2 border-t border-gray-100 dark:border-gray-700">
                      แสดง 50 รายการแรกจากทั้งหมด {visiblePreviewRows.length} รายการ — กด "ดาวน์โหลด PDF" เพื่อดูครบทั้งหมด
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default SpecialPeriodReportsPage;
