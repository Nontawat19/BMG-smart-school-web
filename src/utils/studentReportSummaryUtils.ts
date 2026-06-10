import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { CLASSES, CLASS_FULL_NAMES } from "@/utils/schoolUtils";
import { ACTIVE_STUDENT_STATUS, normalizeStudentStatus } from "@/utils/studentStatusUtils";

export interface StudentReportSummary {
  total: number;
  active: number;
  paused: number;
  suspended: number;
  transferred: number;
  resigned: number;
  graduated: number;
  byLevel: Record<string, number>;
}

export const DEFAULT_STUDENT_REPORT_SUMMARY: StudentReportSummary = {
  total: 0,
  active: 0,
  paused: 0,
  suspended: 0,
  transferred: 0,
  resigned: 0,
  graduated: 0,
  byLevel: {},
};

const getStudentReportSummaryRef = (db: Firestore, schoolId: string) => (
  doc(db, "school-settings", schoolId, "summaries", "studentReport")
);

const toNumber = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const getStudentReportStatus = (student: any) => (
  normalizeStudentStatus(student?.studentStatus || student?.status || "")
);

export const isStudyingStudentForReport = (student: any) => {
  const status = getStudentReportStatus(student);
  return status === ACTIVE_STUDENT_STATUS;
};

const getStudentAcademicYear = (student: any) => {
  const value =
    student?.academicYear ||
    student?.currentAcademicYear ||
    student?.schoolYear ||
    student?.enrollmentAcademicYear ||
    student?.admissionAcademicYear ||
    student?.reEnrollmentDetails?.academicYear ||
    student?.enrollmentDetails?.academicYear ||
    student?.academic?.year ||
    "";
  return String(value || "").trim();
};

const isStudentInAcademicYear = (student: any, academicYear?: string) => {
  const targetYear = String(academicYear || "").trim();
  if (!targetYear) return true;

  const studentYear = getStudentAcademicYear(student);
  if (!studentYear) return true;

  return studentYear === targetYear;
};

const getStatusBucket = (student: any): keyof Omit<StudentReportSummary, "total" | "byLevel"> | null => {
  const status = getStudentReportStatus(student);
  if (status === ACTIVE_STUDENT_STATUS) return "active";
  if (status === "พักการเรียน") return "paused";
  if (status === "แขวนลอย") return "suspended";
  if (status === "ย้าย") return "transferred";
  if (status === "ลาออก" || status === "จำหน่าย") return "resigned";
  if (status === "สำเร็จการศึกษา" || status === "จบการศึกษา") return "graduated";
  return null;
};

export const normalizeStudentReportLevel = (level?: string) => {
  const raw = String(level || "").trim();
  if (!raw) return "ไม่ระบุ";

  const compact = raw.replace(/\s+/g, "").toLowerCase();

  const directKey = Object.keys(CLASSES).find(key => key.toLowerCase() === compact);
  if (directKey) return (CLASSES as Record<string, string>)[directKey];

  const directLabel = Object.values(CLASSES).find(label => label.replace(/\s+/g, "").toLowerCase() === compact);
  if (directLabel) return directLabel;

  const fullNameKey = Object.entries(CLASS_FULL_NAMES).find(([, label]) =>
    label.replace(/\s+/g, "").toLowerCase() === compact
  )?.[0];
  if (fullNameKey) return (CLASSES as Record<string, string>)[fullNameKey] || raw;

  const shorthandMatch = compact.match(/^([kpm])\.?([1-6])$/i);
  if (shorthandMatch) {
    const [, prefix, number] = shorthandMatch;
    const mapped = (CLASSES as Record<string, string>)[`${prefix.toLowerCase()}${number}`];
    if (mapped) return mapped;
  }

  const thaiLevelMatch = compact.match(/^(อ|ป|ม|อนุบาล|ประถมศึกษาปีที่|มัธยมศึกษาปีที่)\.?([1-6])$/);
  if (thaiLevelMatch) {
    const [, prefix, number] = thaiLevelMatch;
    if (prefix === "อ" || prefix === "อนุบาล") return `อ.${number}`;
    if (prefix === "ป" || prefix === "ประถมศึกษาปีที่") return `ป.${number}`;
    if (prefix === "ม" || prefix === "มัธยมศึกษาปีที่") return `ม.${number}`;
  }

  return raw;
};

const getLevelLabel = (student: any) => {
  return normalizeStudentReportLevel(student?.classLevel || student?.level);
};

export const mapStudentReportSummary = (source: any = {}): StudentReportSummary => {
  const byLevelSource = source.byLevel || source.levels || {};
  const byLevel = Object.entries(byLevelSource).reduce((acc, [level, count]) => {
    const value = toNumber(count);
    const normalizedLevel = normalizeStudentReportLevel(level);
    if (value > 0) acc[normalizedLevel] = (acc[normalizedLevel] || 0) + value;
    return acc;
  }, {} as Record<string, number>);
  const active = toNumber(source.active ?? source.studentCount ?? source.total);

  return {
    total: toNumber(source.total ?? active),
    active,
    paused: toNumber(source.paused),
    suspended: toNumber(source.suspended),
    transferred: toNumber(source.transferred),
    resigned: toNumber(source.resigned),
    graduated: toNumber(source.graduated),
    byLevel,
  };
};

const buildStudentReportSummary = (students: any[], academicYear?: string): StudentReportSummary => {
  const summary: StudentReportSummary = { ...DEFAULT_STUDENT_REPORT_SUMMARY, byLevel: {} };

  students.forEach(student => {
    if (!isStudentInAcademicYear(student, academicYear)) return;

    const bucket = getStatusBucket(student);
    if (!bucket) return;
    summary[bucket] += 1;

    if (bucket === "active") {
      const level = getLevelLabel(student);
      summary.byLevel[level] = (summary.byLevel[level] || 0) + 1;
    }
  });

  summary.total = summary.active;
  return summary;
};

export const syncStudentReportSummary = async (db: Firestore, schoolId: string, academicYear?: string) => {
  const studentsSnap = await getDocs(collection(db, "school-settings", schoolId, "students"));
  const summary = buildStudentReportSummary(studentsSnap.docs.map(studentDoc => ({
    id: studentDoc.id,
    ...studentDoc.data(),
  })), academicYear);

  await setDoc(getStudentReportSummaryRef(db, schoolId), {
    ...summary,
    academicYear: academicYear || "",
    isComplete: true,
    source: "students",
    updatedAt: serverTimestamp(),
  });

  return summary;
};

export const fetchStudentReportSummary = async (db: Firestore, schoolId: string, academicYear?: string) => {
  const summaryRef = getStudentReportSummaryRef(db, schoolId);
  const summarySnap = await getDoc(summaryRef);
  const summaryYear = String(summarySnap.data()?.academicYear || "").trim();
  const targetYear = String(academicYear || "").trim();
  if (summarySnap.exists() && summarySnap.data()?.isComplete !== false && (!targetYear || summaryYear === targetYear)) {
    return mapStudentReportSummary(summarySnap.data());
  }

  return syncStudentReportSummary(db, schoolId, academicYear);
};

const applyStudentDelta = (summary: StudentReportSummary, student: any, direction: 1 | -1) => {
  const bucket = getStatusBucket(student);
  if (!bucket) return;

  summary[bucket] = Math.max(0, toNumber(summary[bucket]) + direction);
  if (bucket === "active") {
    const level = getLevelLabel(student);
    const nextCount = Math.max(0, toNumber(summary.byLevel[level]) + direction);
    if (nextCount > 0) summary.byLevel[level] = nextCount;
    else delete summary.byLevel[level];
  }

  summary.total = summary.active;
};

export const updateStudentReportSummaryForChanges = async (
  db: Firestore,
  schoolId: string,
  changes: Array<{ before?: any | null; after?: any | null }>
) => {
  if (!schoolId || changes.length === 0) return;

  const summaryRef = getStudentReportSummaryRef(db, schoolId);
  const summarySnap = await getDoc(summaryRef);
  if (!summarySnap.exists() || summarySnap.data()?.isComplete === false) {
    await syncStudentReportSummary(db, schoolId);
    return;
  }

  await runTransaction(db, async transaction => {
    const currentSnap = await transaction.get(summaryRef);
    const next = mapStudentReportSummary(currentSnap.data());

    changes.forEach(({ before, after }) => {
      if (before) applyStudentDelta(next, before, -1);
      if (after) applyStudentDelta(next, after, 1);
    });

    transaction.set(summaryRef, {
      ...next,
      isComplete: true,
      source: "students",
      updatedAt: serverTimestamp(),
    });
  });
};

export const updateStudentReportSummaryForChange = async (
  db: Firestore,
  schoolId: string,
  before?: any | null,
  after?: any | null
) => updateStudentReportSummaryForChanges(db, schoolId, [{ before, after }]);
