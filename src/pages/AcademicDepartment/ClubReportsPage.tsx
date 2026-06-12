import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { ChevronRight, FileText, Printer, RefreshCw, Search, Users, UserX, BarChart3, ClipboardCheck, FolderKanban } from "lucide-react";
import {
  Document as PdfDocument,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from "@/components/SkeletonLoader";
import { firestore as db } from "@/firebase";
import { RootState, AppDispatch } from "@/store";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { getClassLevelRank } from "@/utils/schoolUtils";

try {
  Font.register({
    family: "TH Sarabun PSK",
    fonts: [
      { src: "/fonts/THSarabunNew.ttf" },
      { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
    ],
  });
} catch (error) {
  console.warn("Unable to register Thai PDF font", error);
}

type ReportType =
  | "club-student-list"
  | "students-without-club"
  | "club-student-count-summary"
  | "club-attendance-summary"
  | "student-club-by-classroom";

interface Club {
  id: string;
  name: string;
  capacity?: number;
  memberCount?: number;
  responsibleTeacherIds?: string[];
}

interface Student {
  id: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  studentId?: string;
  studentCode?: string;
  classLevel?: string;
  room?: string;
  number?: string;
  studentNumber?: string;
  status?: string;
}

interface Membership {
  clubId: string;
  clubName: string;
  studentId: string;
  status?: string;
  joinedAt?: string;
}

interface AttendanceSession {
  id: string;
  date: string;
  title: string;
  records: Record<string, AttendanceStatus>;
}

interface EvaluationResult {
  status?: "pending" | "passed" | "failed";
  note?: string;
}

interface PdfColumn {
  label: string;
  width: number;
  rotate?: boolean;
  align?: "left" | "center";
  compact?: boolean;
  compactHeader?: boolean;
}

interface PdfReportData {
  title: string;
  subtitle: string;
  detail?: string;
  schoolName: string;
  logoUrl?: string;
  orientation: "portrait" | "landscape";
  columns: PdfColumn[];
  rows: string[][];
}

const reportMenus: { id: ReportType; title: string; description: string; icon: React.ReactNode; colorClass: string; }[] = [
  {
    id: "club-student-list",
    title: "ใบรายชื่อนักเรียนในแต่ละชุมนุม",
    description: "รายชื่อนักเรียนแยกตามชุมนุมพร้อมรหัสและชั้นเรียน",
    icon: <Users size={24} />,
    colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  },
  {
    id: "students-without-club",
    title: "รายชื่อนักเรียนที่ไม่มีชุมนุม",
    description: "ตรวจสอบนักเรียนที่ยังไม่ถูกจัดเข้าชุมนุม",
    icon: <UserX size={24} />,
    colorClass: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  },
  {
    id: "club-student-count-summary",
    title: "รายงานสรุปจำนวนนักเรียนในแต่ละชุมนุม",
    description: "สรุปจำนวนสมาชิก จำนวนผ่าน/ไม่ผ่าน และครูประจำชุมนุม",
    icon: <BarChart3 size={24} />,
    colorClass: "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400",
  },
  {
    id: "club-attendance-summary",
    title: "รายงานสรุปการเข้าชุมนุม",
    description: "สรุปสถานะการเข้าชุมนุมรายครั้งของนักเรียน",
    icon: <ClipboardCheck size={24} />,
    colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  },
  {
    id: "student-club-by-classroom",
    title: "รายงานรายชื่อชุมนุมของนักเรียนตามห้องเรียน",
    description: "แสดงชุมนุม การยืนยัน และผลประเมินของนักเรียนในห้องเรียน",
    icon: <FolderKanban size={24} />,
    colorClass: "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  },
];

const PDF_ROWS_PER_PAGE = 20;
const ATTENDANCE_SLOT_COUNT = 20;
const YEARLY_TERM_VALUE = "year";

type AttendanceStatus = "present" | "absent" | "late" | "leave";

const statusLabel: Record<string, string> = {
  confirmed: "ยืนยันแล้ว",
  pending: "รออนุมัติ",
  passed: "ผ่าน",
  failed: "ไม่ผ่าน",
  present: "ม",
  late: "ส",
  leave: "ล",
  absent: "ข",
};

const getStudentCode = (student?: Student) => student?.studentId || student?.studentCode || "";
const getStudentName = (student?: Student) => `${student?.title || ""}${student?.firstName || ""} ${student?.lastName || ""}`.trim();
const formatClassRoom = (student?: Student) => [student?.classLevel, student?.room].filter(Boolean).join("/");
const sanitizeFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");

const formatThaiDate = (dateStr: string) => {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return "-";
  return parsed.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
};

const formatShortDate = (dateStr: string) => {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return "-";
  return parsed.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

const parseIsoDate = (dateStr: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parsed = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getAcademicYearFromDate = (dateStr: string) => {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return "";
  const month = parsed.getMonth() + 1;
  const buddhistYear = parsed.getFullYear() + 543;
  return String(month >= 5 ? buddhistYear : buddhistYear - 1);
};

const getSemesterFromDate = (dateStr: string) => {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return "";
  const month = parsed.getMonth() + 1;
  return month >= 5 && month <= 10 ? "1" : "2";
};

const isSessionInSelectedTerm = (session: AttendanceSession, academicYear: string, semester: string) => {
  const sessionAcademicYear = getAcademicYearFromDate(session.date);
  const sessionSemester = getSemesterFromDate(session.date);
  if (!sessionAcademicYear || !sessionSemester) return true;
  if (semester === YEARLY_TERM_VALUE) return !academicYear || sessionAcademicYear === academicYear;
  return (!academicYear || sessionAcademicYear === academicYear) && (!semester || sessionSemester === semester);
};

const getEvaluationDocIds = (academicYear: string, semester: string) => {
  if (semester === YEARLY_TERM_VALUE) {
    return [`${academicYear}_${YEARLY_TERM_VALUE}`, `${academicYear}_1`, `${academicYear}_2`];
  }
  return [`${academicYear}_${semester}`];
};

const mergeEvaluationResults = (snapshots: any[]) => {
  return snapshots.reduce((acc, snap) => {
    if (!snap.exists()) return acc;
    return { ...acc, ...((snap.data().results || {}) as Record<string, EvaluationResult>) };
  }, {} as Record<string, EvaluationResult>);
};

const getAttendanceSlots = (sessions: AttendanceSession[]) => {
  const slots: Array<AttendanceSession | null> = sessions.slice(0, ATTENDANCE_SLOT_COUNT);
  while (slots.length < ATTENDANCE_SLOT_COUNT) slots.push(null);
  return slots;
};

const getAttendanceMark = (session: AttendanceSession | null, studentId: string) => {
  if (!session) return "N/A";
  return statusLabel[session.records[studentId]] || "N/A";
};

const getAttendanceCounts = (slots: Array<AttendanceSession | null>, studentId: string) => {
  return slots.reduce((acc, session) => {
    if (!session) return acc;
    const status = session.records[studentId];
    if (status) acc[status] += 1;
    return acc;
  }, { present: 0, absent: 0, late: 0, leave: 0 } as Record<AttendanceStatus, number>);
};

const sortStudents = (a: Student, b: Student) => {
  const rankA = getClassLevelRank(a.classLevel);
  const rankB = getClassLevelRank(b.classLevel);
  if (rankA !== rankB) return rankA - rankB;
  const roomA = Number(a.room) || 0;
  const roomB = Number(b.room) || 0;
  if (roomA !== roomB) return roomA - roomB;
  const noA = Number(a.studentNumber || a.number) || 0;
  const noB = Number(b.studentNumber || b.number) || 0;
  if (noA !== noB) return noA - noB;
  return getStudentCode(a).localeCompare(getStudentCode(b), "th");
};

const ClubReportsPage: React.FC = () => {
  const { reportType } = useParams<{ reportType?: ReportType }>();
  const currentReport = reportMenus.find((report) => report.id === reportType);
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const calendarState = useSelector((state: RootState) => state.calendar);
  const schoolId = (currentUser as any)?.schoolId || "";

  const [loading, setLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<any>({});
  const [schoolName, setSchoolName] = useState("");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [memberships, setMemberships] = useState<Record<string, Membership>>({});
  const [attendanceByClub, setAttendanceByClub] = useState<Record<string, AttendanceSession[]>>({});
  const [evaluationsByClub, setEvaluationsByClub] = useState<Record<string, Record<string, EvaluationResult>>>({});
  const [selectedClubId, setSelectedClubId] = useState("all");
  const [selectedClassLevel, setSelectedClassLevel] = useState("all");
  const [selectedRoom, setSelectedRoom] = useState("all");
  const [semester, setSemester] = useState(String((schoolSettings as any)?.currentTerm || (calendarState as any).currentTerm || "1"));
  const [academicYear, setAcademicYear] = useState(String((schoolSettings as any)?.currentAcademicYear || calendarState.academicYear || ""));
  const [search, setSearch] = useState("");

  const isPrimaryOnlySchool = useMemo(() => {
    const options = (schoolSettings.availableClassOptions || []) as [string, string][];
    const hasPrimary = options.some(([key, label]) => key.startsWith("p") || label.includes("ป."));
    const hasSecondary = options.some(([key, label]) => key.startsWith("m") || label.includes("ม."));
    return hasPrimary && !hasSecondary;
  }, [schoolSettings.availableClassOptions]);

  useEffect(() => {
    if (schoolId && teacherMapStatus === "idle") {
      dispatch(fetchTeachersMap(schoolId));
    }
  }, [dispatch, schoolId, teacherMapStatus]);

  useEffect(() => {
    if (!schoolId) return;
    loadReportData();
  }, [schoolId, academicYear, semester]);

  useEffect(() => {
    if (isPrimaryOnlySchool && semester !== YEARLY_TERM_VALUE) {
      setSemester(YEARLY_TERM_VALUE);
    }
  }, [isPrimaryOnlySchool, semester]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      const [schoolSnap, clubsSnap, studentsSnap] = await Promise.all([
        getDoc(doc(db, "school-settings", schoolId)),
        getDocs(query(collection(db, "school-settings", schoolId, "clubs"), orderBy("name"))),
        getDocs(collection(db, "school-settings", schoolId, "students")),
      ]);

      const schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
      setSchoolInfo(schoolData);
      setSchoolName(String(schoolData.schoolName || schoolData.name || schoolData.schoolThaiName || ""));

      const clubRows = clubsSnap.docs.map((clubDoc) => ({ id: clubDoc.id, ...(clubDoc.data() as any) } as Club));
      const studentRows = studentsSnap.docs
        .map((studentDoc) => ({ id: studentDoc.id, ...(studentDoc.data() as any) } as Student))
        .sort(sortStudents);

      const membershipMap: Record<string, Membership> = {};
      const attendanceMap: Record<string, AttendanceSession[]> = {};
      const evaluationMap: Record<string, Record<string, EvaluationResult>> = {};

      await Promise.all(clubRows.map(async (club) => {
        const [membersSnap, attendanceSnap, evaluationSnaps] = await Promise.all([
          getDocs(collection(db, "school-settings", schoolId, "clubs", club.id, "members")),
          getDocs(collection(db, "school-settings", schoolId, "clubs", club.id, "attendance")),
          Promise.all(getEvaluationDocIds(academicYear, semester).map((docId) => (
            getDoc(doc(db, "school-settings", schoolId, "clubs", club.id, "evaluations", docId))
          ))),
        ]);

        membersSnap.docs.forEach((memberDoc) => {
          const raw = memberDoc.data() as any;
          membershipMap[memberDoc.id] = {
            clubId: club.id,
            clubName: club.name,
            studentId: memberDoc.id,
            status: raw.status || "pending",
            joinedAt: raw.joinedAt,
          };
        });

        attendanceMap[club.id] = attendanceSnap.docs
          .map((attendanceDoc) => {
            const raw = attendanceDoc.data() as any;
            const date = raw.date || attendanceDoc.id.split("_")[0] || attendanceDoc.id;
            return {
              id: attendanceDoc.id,
              date,
              title: raw.specialPeriodTitle ? `${formatThaiDate(date)} ${raw.specialPeriodTitle}` : formatThaiDate(date),
              records: raw.records || {},
            };
          })
          .filter((session) => isSessionInSelectedTerm(session, academicYear, semester))
          .sort((a, b) => a.date.localeCompare(b.date, "th"));

        evaluationMap[club.id] = mergeEvaluationResults(evaluationSnaps);
      }));

      setClubs(clubRows);
      setStudents(studentRows);
      setMemberships(membershipMap);
      setAttendanceByClub(attendanceMap);
      setEvaluationsByClub(evaluationMap);
      setSelectedClubId((prev) => prev !== "all" && clubRows.some((club) => club.id === prev) ? prev : clubRows[0]?.id || "all");
    } catch (error) {
      console.error("Error loading club reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedClub = clubs.find((club) => club.id === selectedClubId);
  const classLevels = useMemo(() => {
    const configured = (schoolSettings.availableClassOptions || []).map(([, label]: [string, string]) => label);
    const fromStudents = Array.from(new Set(students.map((student) => student.classLevel).filter(Boolean))) as string[];
    const merged = Array.from(new Set([...configured, ...fromStudents]));
    return merged.sort((a, b) => getClassLevelRank(a) - getClassLevelRank(b));
  }, [schoolSettings.availableClassOptions, students]);

  const rooms = useMemo(() => {
    const scoped = selectedClassLevel === "all"
      ? students
      : students.filter((student) => student.classLevel === selectedClassLevel);
    return Array.from(new Set(scoped.map((student) => student.room).filter(Boolean) as string[]))
      .sort((a, b) => Number(a) - Number(b));
  }, [selectedClassLevel, students]);

  const selectedClubMembers = useMemo(() => {
    if (!selectedClub) return [];
    return students.filter((student) => memberships[student.id]?.clubId === selectedClub.id);
  }, [memberships, selectedClub, students]);

  const keyword = search.trim().toLowerCase();
  const matchesSearch = (values: Array<string | undefined>) => !keyword || values.join(" ").toLowerCase().includes(keyword);

  const teacherNameLines = (club: Club) => {
    const ids = club.responsibleTeacherIds || [];
    const allTeachers = Object.values(teacherMap as any || {});
    return ids.map((id, index) => {
      const teacher = (teacherMap as any)?.[id]
        ?? allTeachers.find((t: any) => t.teacherId === id || t.uid === id);
      const name = (teacher?.name || `${teacher?.title || ""}${teacher?.firstName || ""} ${teacher?.lastName || ""}`.trim()) || "";
      return `คุณครูคนที่ ${index + 1} : ${name || "-"}`;
    });
  };
  const teacherNames = (club: Club) => teacherNameLines(club).join(" ");

  const rows = useMemo(() => {
    if (!reportType) return [];
    if (reportType === "students-without-club") {
      return students
        .filter((student) => !memberships[student.id])
        .filter((student) => matchesSearch([schoolName, getStudentCode(student), getStudentName(student), formatClassRoom(student)]));
    }
    if (reportType === "student-club-by-classroom") {
      return students
        .filter((student) => selectedClassLevel === "all" || student.classLevel === selectedClassLevel)
        .filter((student) => selectedRoom === "all" || student.room === selectedRoom)
        .filter((student) => matchesSearch([getStudentCode(student), getStudentName(student), memberships[student.id]?.clubName, formatClassRoom(student)]));
    }
    if (reportType === "club-student-list" || reportType === "club-attendance-summary") {
      return selectedClubMembers.filter((student) => matchesSearch([selectedClub?.name, getStudentCode(student), getStudentName(student), formatClassRoom(student)]));
    }
    if (reportType === "club-student-count-summary") {
      return clubs.filter((club) => matchesSearch([schoolName, club.name, teacherNames(club)]));
    }
    return [];
  }, [clubs, keyword, memberships, reportType, schoolName, selectedClassLevel, selectedClub?.id, selectedClubMembers, selectedRoom, students]);

  const buildPdfData = (): PdfReportData | null => {
    if (!reportType || !currentReport) return null;

    const base = {
      title: currentReport.title,
      subtitle: semester === YEARLY_TERM_VALUE
        ? `${schoolName || "โรงเรียน"} ปีการศึกษา ${academicYear || "2568"}`
        : `${schoolName || "โรงเรียน"} ปีการศึกษา ${semester}/${academicYear || "2568"}`,
      schoolName: schoolName || "โรงเรียน",
      logoUrl: schoolInfo?.logoUrl,
    };

    if (reportType === "club-student-list") {
      return {
        ...base,
        title: selectedClub ? `ใบรายชื่อนักเรียน ${selectedClub.name}` : currentReport.title,
        detail: selectedClub ? `คุณครูประจำชุมนุม : ${teacherNames(selectedClub).replace(/\s+/g, " ") || "-"}` : "",
        orientation: "landscape",
        columns: [
          { label: "ลำดับ", width: 6, align: "center" },
          { label: "ชุมนุม", width: 17, align: "center" },
          { label: "รหัส", width: 8, align: "center" },
          { label: "ชื่อ-นามสกุล", width: 26, align: "center" },
          { label: "ชั้นเรียน", width: 24, align: "center" },
          { label: "หมายเหตุ", width: 19, align: "center" },
        ],
        rows: (rows as Student[]).map((student, index) => [
          String(index + 1),
          selectedClub?.name || "-",
          getStudentCode(student),
          getStudentName(student),
          formatClassRoom(student),
          "",
        ]),
      };
    }

    if (reportType === "students-without-club") {
      return {
        ...base,
        orientation: "landscape",
        columns: [
          { label: "ลำดับ", width: 6, align: "center" },
          { label: "โรงเรียน", width: 16, align: "center" },
          { label: "รหัส", width: 8, align: "center" },
          { label: "ชื่อ-นามสกุล", width: 35, align: "center" },
          { label: "ชั้นเรียน", width: 21, align: "center" },
          { label: "หมายเหตุ", width: 14, align: "center" },
        ],
        rows: (rows as Student[]).map((student, index) => [
          String(index + 1),
          schoolName || "-",
          getStudentCode(student),
          getStudentName(student),
          formatClassRoom(student),
          "",
        ]),
      };
    }

    if (reportType === "club-student-count-summary") {
      return {
        ...base,
        orientation: "landscape",
        columns: [
          { label: "ลำดับ", width: 4, align: "center" },
          { label: "โรงเรียน", width: 13, align: "center", compact: true },
          { label: "ชื่อชุมนุม", width: 17, align: "center", compact: true },
          { label: "คาบเรียน", width: 6, align: "center", compactHeader: true },
          { label: "จำนวนสูงสุด", width: 6, align: "center", compactHeader: true },
          { label: "จำนวนทั้งหมด", width: 8, align: "center", compactHeader: true },
          { label: "จำนวนผ่าน", width: 7, align: "center", compactHeader: true },
          { label: "จำนวนไม่ผ่าน", width: 8, align: "center", compactHeader: true },
          { label: "ร้อยละ", width: 6, align: "center" },
          { label: "คุณครูประจำชุมนุม", width: 25, align: "left" },
        ],
        rows: (rows as Club[]).map((club, index) => {
          const members = students.filter((student) => memberships[student.id]?.clubId === club.id);
          const evalResults = evaluationsByClub[club.id] || {};
          const passed = members.filter((student) => evalResults[student.id]?.status === "passed").length;
          const failed = members.filter((student) => evalResults[student.id]?.status === "failed").length;
          const percent = members.length ? ((passed / members.length) * 100).toFixed(2) : "0.00";
          return [
            String(index + 1),
            schoolName || "-",
            club.name,
            "20",
            String(club.capacity || "-"),
            String(members.length),
            String(passed),
            String(failed),
            percent,
            teacherNameLines(club).join("\n"),
          ];
        }),
      };
    }

    if (reportType === "club-attendance-summary") {
      const sessions = selectedClub ? (attendanceByClub[selectedClub.id] || []) : [];
      const attendanceSlots = getAttendanceSlots(sessions);
      const sessionWidth = Math.min(2.6, 48 / ATTENDANCE_SLOT_COUNT);
      const columns: PdfColumn[] = [
        { label: "#", width: 2.5, align: "center" },
        { label: "รหัสนักเรียน", width: 6, align: "center" },
        { label: "ชื่อ-นามสกุล", width: 16, align: "center" },
        { label: "ชั้นเรียน", width: 8, align: "center" },
        ...attendanceSlots.map((session, index) => ({
          label: `คาบที่${index + 1}${session ? ` : ${session.title}` : ""}`,
          width: sessionWidth,
          rotate: true,
          align: "center" as const,
        })),
        { label: "ตรวจมาเรียน", width: 4.2, rotate: true, align: "center" as const },
        { label: "ขอตรวจขาดชุมนุม", width: 4.2, rotate: true, align: "center" as const },
        { label: "ขอตรวจสาย", width: 4.2, rotate: true, align: "center" as const },
        { label: "ขอตรวจลากิจ", width: 4.2, rotate: true, align: "center" as const },
        { label: "ขอตรวจทั้งหมด", width: 4.7, rotate: true, align: "center" as const },
      ];
      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
      const normalized = totalWidth > 100
        ? columns.map((col) => ({ ...col, width: (col.width / totalWidth) * 100 }))
        : columns;

      return {
        ...base,
        title: selectedClub ? `รายงานสรุปการเข้าชุมนุม : ${selectedClub.name}` : currentReport.title,
        detail: selectedClub ? `คุณครูประจำชุมนุม : ${teacherNames(selectedClub).replace(/\s+/g, " ") || "-"}` : "",
        orientation: "landscape",
        columns: normalized,
        rows: (rows as Student[]).map((student, index) => {
          const counts = getAttendanceCounts(attendanceSlots, student.id);
          return [
            String(index + 1),
            getStudentCode(student),
            getStudentName(student),
            formatClassRoom(student),
            ...attendanceSlots.map((session) => getAttendanceMark(session, student.id)),
            String(counts.present),
            String(counts.absent),
            String(counts.late),
            String(counts.leave),
            String(counts.present + counts.absent + counts.late + counts.leave),
          ];
        }),
      };
    }

    return {
      ...base,
      orientation: "landscape",
      columns: [
        { label: "ลำดับ", width: 5, align: "center" },
        { label: "รหัส", width: 8, align: "center" },
        { label: "ชื่อ-นามสกุล", width: 24, align: "center" },
        { label: "ชื่อชุมนุม", width: 24, align: "center" },
        { label: "Status", width: 12, align: "center" },
        { label: "การยืนยันชุมนุม", width: 14, align: "center" },
        { label: "ผลการประเมิน", width: 13, align: "center" },
      ],
      rows: (rows as Student[]).map((student, index) => {
        const membership = memberships[student.id];
        const result = membership ? evaluationsByClub[membership.clubId]?.[student.id]?.status : undefined;
        return [
          String(index + 1),
          getStudentCode(student),
          getStudentName(student),
          membership?.clubName || "-",
          student.status === "inactive" ? "พ้นสภาพ" : "กำลังศึกษาอยู่",
          statusLabel[membership?.status || ""] || "-",
          statusLabel[result || "pending"] || "รอตรวจ",
        ];
      }),
    };
  };

  const handleGeneratePdf = async () => {
    const data = buildPdfData();
    if (!data || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const blob = await pdf(<ClubReportPdfDocument data={data} />).toBlob();
      const termLabel = semester === YEARLY_TERM_VALUE
        ? `ปีการศึกษา_${academicYear || "2568"}`
        : `ภาคเรียน_${semester}_${academicYear || "2568"}`;
      saveAs(blob, `${sanitizeFileName(data.title)}_${termLabel}.pdf`);
    } catch (error) {
      console.error("Error generating club report PDF:", error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const renderFilters = () => (
    <div className="border-b border-gray-200 p-4 dark:border-white/10 sm:p-5 print:hidden">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_190px]">
        <Field label="โรงเรียน">
          <select className="report-input" value={schoolId} disabled>
            <option>{schoolName || schoolId || "โรงเรียน"}</option>
          </select>
        </Field>
        <Field label="ภาคเรียน">
          <select className="report-input" value={`${academicYear}-${semester}`} onChange={(event) => {
            const [year, term] = event.target.value.split("-");
            setAcademicYear(year);
            setSemester(term);
          }}>
            <option value={`${academicYear || "2568"}-${YEARLY_TERM_VALUE}`}>ทั้งปีการศึกษา {academicYear || "2568"}</option>
            <option value={`${academicYear || "2568"}-1`}>{schoolName || "โรงเรียน"}-1/{academicYear || "2568"}</option>
            <option value={`${academicYear || "2568"}-2`}>{schoolName || "โรงเรียน"}-2/{academicYear || "2568"}</option>
          </select>
        </Field>
        {(reportType === "club-student-list" || reportType === "club-attendance-summary") && (
          <Field label="รายชื่อชุมนุมในภาคเรียน">
            <select className="report-input" value={selectedClubId} onChange={(event) => setSelectedClubId(event.target.value)}>
              {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
            </select>
          </Field>
        )}
        {reportType === "student-club-by-classroom" && (
          <Field label="ชั้นเรียน">
            <div className="grid grid-cols-2 gap-3">
              <select className="report-input" value={selectedClassLevel} onChange={(event) => {
                setSelectedClassLevel(event.target.value);
                setSelectedRoom("all");
              }}>
                <option value="all">ทุกชั้นเรียน</option>
                {classLevels.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
              <select className="report-input" value={selectedRoom} onChange={(event) => setSelectedRoom(event.target.value)}>
                <option value="all">ทุกห้อง</option>
                {rooms.map((room) => <option key={room} value={room}>ห้อง {room}</option>)}
              </select>
            </div>
          </Field>
        )}
        <Field label="ค้นหา">
          <div className="flex gap-2">
            <input className="report-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
            <button className="inline-flex h-10 min-w-[120px] items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
              <Search size={16} />
              ค้นหา
            </button>
          </div>
        </Field>
      </div>
    </div>
  );

  const renderReportTable = () => {
    if (!reportType) return null;
    if (loading) return <div className="p-6"><SkeletonLoader height="360px" /></div>;

    if (reportType === "club-student-list") {
      return (
        <ReportTable headers={["#", "ชุมนุม", "รหัส", "ชื่อ-นามสกุล", "ชั้นเรียน", "หมายเหตุ"]}>
          {(rows as Student[]).map((student, index) => (
            <tr key={student.id}>
              <Td>{index + 1}</Td>
              <Td>{selectedClub?.name || "-"}</Td>
              <Td>{getStudentCode(student)}</Td>
              <Td>{getStudentName(student)}</Td>
              <Td>{formatClassRoom(student)}</Td>
              <Td />
            </tr>
          ))}
        </ReportTable>
      );
    }

    if (reportType === "students-without-club") {
      return (
        <ReportTable headers={["#", "โรงเรียน", "รหัส", "ชื่อ-นามสกุล", "ชั้นเรียน"]}>
          {(rows as Student[]).map((student, index) => (
            <tr key={student.id}>
              <Td>{index + 1}</Td>
              <Td className="font-bold text-slate-900 dark:text-white">{schoolName}</Td>
              <Td>{getStudentCode(student)}</Td>
              <Td>{getStudentName(student)}</Td>
              <Td>{formatClassRoom(student)}</Td>
            </tr>
          ))}
        </ReportTable>
      );
    }

    if (reportType === "club-student-count-summary") {
      return (
        <ReportTable headers={["#", "โรงเรียน", "ชื่อชุมนุม", "คาบเรียน", "จำนวนสูงสุด", "จำนวนทั้งหมด", "จำนวนผ่าน", "จำนวนไม่ผ่าน", "ร้อยละ", "คุณครูประจำชุมนุม"]}>
          {(rows as Club[]).map((club, index) => {
            const members = students.filter((student) => memberships[student.id]?.clubId === club.id);
            const evalResults = evaluationsByClub[club.id] || {};
            const passed = members.filter((student) => evalResults[student.id]?.status === "passed").length;
            const failed = members.filter((student) => evalResults[student.id]?.status === "failed").length;
            const percent = members.length ? ((passed / members.length) * 100).toFixed(2) : "0.00";
            return (
              <tr key={club.id}>
                <Td>{index + 1}</Td>
                <Td className="font-bold text-slate-900 dark:text-white">{schoolName}</Td>
                <Td>{club.name}</Td>
                <Td>20</Td>
                <Td>{club.capacity || "-"}</Td>
                <Td>{members.length}</Td>
                <Td>{passed}</Td>
                <Td>{failed}</Td>
                <Td>{percent}</Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    {teacherNameLines(club).map((teacherName, teacherIndex) => (
                      <span key={`${club.id}-teacher-${teacherIndex}`} className="whitespace-nowrap">{teacherName}</span>
                    ))}
                  </div>
                </Td>
              </tr>
            );
          })}
        </ReportTable>
      );
    }

    if (reportType === "club-attendance-summary") {
      const sessions = selectedClub ? (attendanceByClub[selectedClub.id] || []) : [];
      const attendanceSlots = getAttendanceSlots(sessions);
      return (
        <ReportTable headers={[
          "#",
          "รหัสนักเรียน",
          "ชื่อ-นามสกุล",
          "ชั้น",
          ...attendanceSlots.map((session, index) => (
            <div className="flex flex-col items-center min-w-[32px]" title={session ? session.title : undefined}>
              <span>{`คาบ ${index + 1}`}</span>
              {session && (
                <span className="mt-0.5 text-[11px] font-normal text-gray-500 dark:text-gray-400">
                  {formatShortDate(session.date)}
                </span>
              )}
            </div>
          )),
          "มา",
          "ขาด",
          "สาย",
          "ลา",
          "รวม",
        ]}>
          {(rows as Student[]).map((student, index) => {
            const counts = getAttendanceCounts(attendanceSlots, student.id);
            return (
              <tr key={student.id}>
                <Td className="text-center">{index + 1}</Td>
                <Td className="text-center">{getStudentCode(student)}</Td>
                <Td className="whitespace-nowrap">{getStudentName(student)}</Td>
                <Td className="text-center">{formatClassRoom(student)}</Td>
                {attendanceSlots.map((session, slotIndex) => (
                  <Td key={session?.id || `empty-${slotIndex}`} className="text-center">{getAttendanceMark(session, student.id)}</Td>
                ))}
                <Td className="text-center">{counts.present}</Td>
                <Td className="text-center">{counts.absent}</Td>
                <Td className="text-center">{counts.late}</Td>
                <Td className="text-center">{counts.leave}</Td>
                <Td className="text-center">{counts.present + counts.absent + counts.late + counts.leave}</Td>
              </tr>
            );
          })}
        </ReportTable>
      );
    }

    return (
      <ReportTable headers={["#", "รหัส", "ชื่อ-นามสกุล", "ชื่อชุมนุม", "Status", "การยืนยันชุมนุม", "ผลการประเมิน"]}>
        {(rows as Student[]).map((student, index) => {
          const membership = memberships[student.id];
          const result = membership ? evaluationsByClub[membership.clubId]?.[student.id]?.status : undefined;
          return (
            <tr key={student.id}>
              <Td>{index + 1}</Td>
              <Td>{getStudentCode(student)}</Td>
              <Td>{getStudentName(student)}</Td>
              <Td>{membership?.clubName || "-"}</Td>
              <Td>{student.status === "inactive" ? "พ้นสภาพ" : "กำลังศึกษาอยู่"}</Td>
              <Td>{statusLabel[membership?.status || ""] || "-"}</Td>
              <Td>{statusLabel[result || "pending"] || "รอตรวจ"}</Td>
            </tr>
          );
        })}
      </ReportTable>
    );
  };

  if (!currentReport && !reportType) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-gray-50 px-3 py-4 dark:bg-[#1c1c24] sm:px-4 md:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex items-center gap-4">
              <BackButton to="/academic/hub/activities" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">รายงานชุมนุม</h1>
                <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">เลือกดูรายงานกิจกรรมและชุมนุมตามประเภท</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reportMenus.map((report) => (
                <Link
                  key={report.id}
                  to={`/academic/club-reports/${report.id}`}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-white/10 dark:bg-[#2a2b2f] dark:hover:border-indigo-500/50 dark:hover:shadow-indigo-500/20"
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${report.colorClass}`}>
                      {report.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-1 text-base font-bold text-gray-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                        {report.title}
                      </h3>
                      <p className="text-sm font-medium text-gray-500 line-clamp-2 dark:text-gray-400">
                        {report.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end text-sm font-bold text-indigo-600 opacity-0 transition-all group-hover:opacity-100 dark:text-indigo-400">
                    ดูรายงาน <ChevronRight size={16} className="ml-1" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <style>{`
        .report-input { height: 40px; width: 100%; border-radius: 6px; border: 1px solid #d9dee5; background: white; padding: 0 12px; font-size: 14px; color: #334155; outline: none; transition: all 0.2s; }
        .report-input:focus { border-color: #2f86d1; box-shadow: 0 0 0 2px rgba(47, 134, 209, 0.12); }
        .report-input:disabled { background: #f1f5f9; color: #1e293b; cursor: not-allowed; font-weight: 600; border-color: #e2e8f0; }
        
        .dark .report-input { background: #1c1c24; border-color: rgba(255, 255, 255, 0.1); color: #f8fafc; }
        .dark .report-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .dark .report-input:disabled { background: rgba(255, 255, 255, 0.05); color: #ffffff; cursor: not-allowed; font-weight: 600; border-color: rgba(255, 255, 255, 0.1); }

        @media print {
          body * { visibility: hidden; }
          #club-report-print, #club-report-print * { visibility: visible; }
          #club-report-print { position: absolute; left: 0; top: 0; width: 100%; }
          .report-table th, .report-table td { font-size: 11px; padding: 5px 6px; }
        }
      `}</style>
      <div className="min-h-screen bg-gray-50 px-3 py-4 dark:bg-[#1c1c24] sm:px-4 md:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-4 flex items-center gap-4 print:hidden">
            <BackButton to="/academic/club-reports" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold text-gray-900 dark:text-white">{currentReport?.title || "รายงานชุมนุม"}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{currentReport?.description}</p>
            </div>
          </div>

          <div id="club-report-print" className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#2a2b2f]">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                <FileText size={20} className="text-indigo-500" />
                {currentReport?.title || "รายงานชุมนุม"}
              </h2>
              <div className="flex gap-2 print:hidden">
                <button onClick={loadReportData} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-bold text-white hover:bg-emerald-600">
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf || loading}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
                >
                  {isGeneratingPdf ? <RefreshCw size={16} className="animate-spin" /> : <Printer size={16} />}
                  PDF
                </button>
              </div>
            </div>
            {renderFilters()}
            <div className="overflow-auto p-4">
              {renderReportTable()}
              {!loading && rows.length === 0 && (
                <div className="border border-dashed border-gray-300 py-12 text-center text-sm font-semibold text-gray-400 dark:border-white/10">
                  ไม่พบข้อมูลรายงาน
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-bold text-gray-900 dark:text-white">{label}</span>
    {children}
  </label>
);

const ReportTable: React.FC<{ headers: (string | React.ReactNode)[]; children: React.ReactNode }> = ({ headers, children }) => (
  <table className="report-table min-w-full border-collapse border border-gray-300 bg-white text-[13px] text-gray-800 dark:border-white/10 dark:bg-[#2a2b2f] dark:text-gray-100">
    <thead>
      <tr className="bg-gray-200 dark:bg-white/10">
        {headers.map((header, index) => (
          <th key={index} className="whitespace-nowrap border border-gray-300 px-1.5 py-2 text-center font-bold dark:border-white/10">
            {header}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);

const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <td className={`border border-gray-300 px-1.5 py-2 align-middle dark:border-white/10 ${className}`}>{children}</td>
);

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
  topText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  headerBlock: {
    position: "relative",
    minHeight: 70,
    marginBottom: 4,
  },
  logo: {
    position: "absolute",
    left: 0,
    top: 2,
    width: 58,
    height: 58,
    objectFit: "contain",
  },
  titleWrap: {
    alignItems: "center",
    paddingTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 1.05,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 1.05,
  },
  detail: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 1.05,
  },
  table: {
    width: "100%",
    borderTopWidth: 0.8,
    borderLeftWidth: 0.8,
    borderColor: "#222",
  },
  row: {
    flexDirection: "row",
    width: "100%",
    minHeight: 18,
    borderBottomWidth: 0.8,
    borderColor: "#222",
  },
  headerRow: {
    backgroundColor: "#d4d4d4",
    minHeight: 25,
  },
  rotatedHeaderRow: {
    backgroundColor: "#d4d4d4",
    minHeight: 74,
  },
  cell: {
    borderRightWidth: 0.8,
    borderColor: "#222",
    paddingHorizontal: 3,
    paddingVertical: 3,
    justifyContent: "center",
  },
  headerCell: {
    alignItems: "center",
  },
  headerText: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 1,
  },
  compactHeaderText: {
    fontSize: 10.5,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 1,
  },
  rotatedText: {
    transform: "rotate(-90deg)",
    width: 68,
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 1,
  },
  bodyText: {
    fontSize: 11.5,
    lineHeight: 1,
  },
  tinyText: {
    fontSize: 8.5,
    lineHeight: 1,
  },
  teacherText: {
    fontSize: 9.5,
    lineHeight: 1.05,
  },
  compactText: {
    fontSize: 9.5,
    lineHeight: 1.05,
  },
  centerText: {
    textAlign: "center",
  },
  pageNumber: {
    position: "absolute",
    bottom: 10,
    right: 30,
    fontSize: 9,
    color: "#555",
  },
});

const ClubReportPdfDocument: React.FC<{ data: PdfReportData }> = ({ data }) => {
  const hasRotatedColumns = data.columns.some((column) => column.rotate);
  const logoSrc = data.logoUrl || "/school-logo.png";
  const rowPages = chunkRowsForPdf(data.rows, PDF_ROWS_PER_PAGE);

  return (
    <PdfDocument>
      {rowPages.map((pageRows, pageIndex) => (
        <Page key={`club-report-page-${pageIndex}`} size="A4" orientation={data.orientation} style={pdfStyles.page}>
          {pageIndex === 0 && (
            <>
              <View style={pdfStyles.topBar} fixed>
                <Text style={pdfStyles.topText}>{data.schoolName}</Text>
                <Text style={pdfStyles.topText}>{data.title}</Text>
              </View>

              <View style={pdfStyles.headerBlock}>
                {logoSrc ? <Image src={logoSrc} style={pdfStyles.logo} /> : null}
                <View style={pdfStyles.titleWrap}>
                  <Text style={pdfStyles.title}>{data.title}</Text>
                  <Text style={pdfStyles.subtitle}>{data.subtitle}</Text>
                  {data.detail ? <Text style={pdfStyles.detail}>{data.detail}</Text> : null}
                </View>
              </View>
            </>
          )}

          <View style={pdfStyles.table}>
            <View style={[pdfStyles.row, hasRotatedColumns ? pdfStyles.rotatedHeaderRow : pdfStyles.headerRow]} wrap={false}>
              {data.columns.map((column) => (
                <View
                  key={column.label}
                  style={[
                    pdfStyles.cell,
                    pdfStyles.headerCell,
                    { width: `${column.width}%`, minHeight: hasRotatedColumns ? 74 : 25 },
                  ]}
                >
                  <Text style={column.rotate ? pdfStyles.rotatedText : column.compactHeader ? pdfStyles.compactHeaderText : pdfStyles.headerText}>
                    {column.label}
                  </Text>
                </View>
              ))}
            </View>

            {pageRows.map((row, rowIndex) => (
              <View key={`${pageIndex}-${rowIndex}-${row.join("-")}`} style={pdfStyles.row} wrap={false}>
                {data.columns.map((column, colIndex) => {
                  const cellText = row[colIndex] || "";
                  const cellLines = cellText.split("\n");
                  const isTeacherColumn = column.label.includes("คุณครู");

                  return (
                    <View
                      key={`${pageIndex}-${rowIndex}-${column.label}`}
                      style={[
                        pdfStyles.cell,
                        { width: `${column.width}%` },
                        column.align === "center" ? { alignItems: "center" } : {},
                      ]}
                    >
                      {cellLines.map((line, lineIndex) => (
                        <Text
                          key={`${pageIndex}-${rowIndex}-${column.label}-${lineIndex}`}
                          wrap={!isTeacherColumn}
                          style={[
                            data.columns.length > 12 ? pdfStyles.tinyText : pdfStyles.bodyText,
                            isTeacherColumn ? pdfStyles.teacherText : {},
                            column.compact ? pdfStyles.compactText : {},
                            column.align === "center" ? pdfStyles.centerText : {},
                          ]}
                        >
                          {line}
                        </Text>
                      ))}
                    </View>
                  );
                })}
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

const chunkRowsForPdf = (rows: string[][], size: number) => {
  if (rows.length === 0) return [[]];
  const pages: string[][][] = [];
  for (let i = 0; i < rows.length; i += size) {
    pages.push(rows.slice(i, i + size));
  }
  return pages;
};

export default ClubReportsPage;
