import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { isAttendanceEntryOnly } from "./attendanceRoles";
import { getStudentStatus, isActiveStudentStatus } from "./studentStatusUtils";
import packageJson from "../../package.json";

// เวอร์ชันระบบรวม (ค่าเดียวกันทุกโรงเรียน เพราะเป็น SPA ที่ deploy ครั้งเดียว)
export const SYSTEM_VERSION: string = packageJson.version;

export interface OwnerDashboardSummary {
  totalSchools: number;
  totalTeachers: number;
  totalStudents: number;
  firestoreUsage: string;
  storageUsage: string;
  firestoreUsageBytes?: number;
  storageUsageBytes?: number;
  firestoreDocumentCount?: number;
  monthlyUsage?: Record<string, FirebaseMonthlyUsageSummary>;
}

export interface SchoolDashboardSummary {
  teacherCount: number;
  studentCount: number;
  firestoreUsage: string;
  storageUsage: string;
  firestoreUsageBytes?: number;
  storageUsageBytes?: number;
  firestoreDocumentCount?: number;
  monthlyUsage?: Record<string, FirebaseMonthlyUsageSummary>;
}

export interface FirebaseMonthlyUsageSummary {
  month: string;
  readOps: number;
  createOps: number;
  updateOps: number;
  deleteOps: number;
  writeOps: number;
  firestoreUsageBytes: number;
  storageUsageBytes: number;
  hostingStorageBytes: number;
  cost: {
    firestoreOperationsTHB: number;
    firestoreStorageTHB: number;
    storageTHB: number;
    hostingStorageTHB: number;
    totalTHB: number;
    currency: "THB";
    usdToThb: number;
  };
}

export const OWNER_DASHBOARD_SUMMARY_PATH = ["summaries", "ownerDashboard"] as const;
export const SCHOOL_DASHBOARD_SUMMARY_PATH = ["summaries", "dashboard"] as const;

export const DEFAULT_OWNER_SUMMARY: OwnerDashboardSummary = {
  totalSchools: 13,
  totalTeachers: 125,
  totalStudents: 3967,
  firestoreUsage: "0 MB",
  storageUsage: "0 GB",
};

export const DEFAULT_SCHOOL_SUMMARY: SchoolDashboardSummary = {
  teacherCount: 0,
  studentCount: 0,
  firestoreUsage: "0 MB",
  storageUsage: "0 GB",
};

export const getNestedValue = (source: any, path: string) => {
  return path.split(".").reduce((current, key) => current?.[key], source);
};

export const getCachedCount = (source: any, paths: string[]) => {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    const numericValue = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }

  return 0;
};

const getCachedCountOptional = (source: any, paths: string[]) => {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value === null || value === undefined || value === "") continue;
    const numericValue = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }

  return undefined;
};

export const teacherCountPaths = [
  "teacherCount",
  "teachersCount",
  "stats.teacherCount",
  "stats.teachers",
  "counts.teacherCount",
  "counts.teachers",
];

export const studentCountPaths = [
  "studentCount",
  "studentsCount",
  "stats.studentCount",
  "stats.students",
  "counts.studentCount",
  "counts.students",
];

const ESTIMATED_FIRESTORE_DOC_BYTES = 1536;
const ESTIMATED_STUDENT_STORAGE_BYTES = 80 * 1024;
const ESTIMATED_TEACHER_STORAGE_BYTES = 120 * 1024;
const ESTIMATED_SCHOOL_LOGO_BYTES = 180 * 1024;
const ESTIMATED_HOSTING_STORAGE_BYTES = 25 * 1024 * 1024;
const BYTES_PER_GIB = 1024 ** 3;

export const FIREBASE_COST_ESTIMATE = {
  usdToThb: 36,
  firestoreReadUsdPer100k: 0.03,
  firestoreWriteUsdPer100k: 0.09,
  firestoreDeleteUsdPer100k: 0.01,
  firestoreStorageUsdPerGiBMonth: 0.15,
  cloudStorageUsdPerGiBMonth: 0.026,
  hostingStorageUsdPerGiBMonth: 0.026,
  freeFirestoreStorageGiB: 1,
  freeCloudStorageGiB: 5,
  freeHostingStorageGiB: 10,
  freeFirestoreReadsPerDay: 50000,
  freeFirestoreWritesPerDay: 20000,
  freeFirestoreDeletesPerDay: 20000,
};
export const ACTIVE_TEACHER_STATUS = "อยู่";

export const isActiveTeacherSummaryStatus = (status?: string) => {
  return String(status || "").trim() === ACTIVE_TEACHER_STATUS;
};

export const isActiveStudentSummaryStatus = (status?: string) => {
  return isActiveStudentStatus(status);
};

const schoolSubcollectionsForUsageEstimate = [
  "teachers",
  "students",
  "courses",
  "course_assignments",
  "enrollments",
  "physical-rooms",
  "subject_groups",
  "main_calendar",
  "schedules",
  "news",
  "clubs",
  "learner-activities",
  "special-periods",
  "configs",
  "desired-characteristics",
  "reading-thinking-writing",
  "screening_assessments",
  "sdq-assessments",
];

const rootCollectionsForUsageEstimate = [
  "users",
  "slugs",
  "student-lookups",
  "summaries",
];

export const formatBytes = (bytes: number, unit: "MB" | "GB" = "MB") => {
  const divisor = unit === "GB" ? 1024 ** 3 : 1024 ** 2;
  const value = bytes / divisor;
  if (value === 0) return `0 ${unit}`;
  if (value < 0.01) return `<0.01 ${unit}`;
  const fixed = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fixed)} ${unit}`;
};

export const formatOps = (ops: number) => {
  const value = Number.isFinite(ops) ? Math.max(0, Math.round(ops)) : 0;
  return `${value.toLocaleString("th-TH")} ops`;
};

export const formatTHB = (amount: number) => {
  const value = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return `฿${value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const getCurrentUsageMonth = () => {
  return new Date().toISOString().slice(0, 7);
};

const isPermissionDeniedError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "permission-denied";

const safeGetCollectionCount = async (ref: Parameters<typeof getCountFromServer>[0], fallback = 0) => {
  try {
    const snapshot = await getCountFromServer(ref);
    return snapshot.data().count || fallback;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return fallback;
    }
    throw error;
  }
};

const daysInUsageMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return 30;
  return new Date(year, monthNumber, 0).getDate();
};

const bytesToGiB = (bytes: number) => {
  return Math.max(0, bytes || 0) / BYTES_PER_GIB;
};

export const calculateFirebaseMonthlyCost = ({
  month,
  readOps,
  writeOps,
  deleteOps,
  firestoreUsageBytes,
  storageUsageBytes,
  hostingStorageBytes = ESTIMATED_HOSTING_STORAGE_BYTES,
}: {
  month: string;
  readOps: number;
  writeOps: number;
  deleteOps: number;
  firestoreUsageBytes: number;
  storageUsageBytes: number;
  hostingStorageBytes?: number;
}) => {
  const days = daysInUsageMonth(month);
  const billableReads = Math.max(0, readOps - FIREBASE_COST_ESTIMATE.freeFirestoreReadsPerDay * days);
  const billableWrites = Math.max(0, writeOps - FIREBASE_COST_ESTIMATE.freeFirestoreWritesPerDay * days);
  const billableDeletes = Math.max(0, deleteOps - FIREBASE_COST_ESTIMATE.freeFirestoreDeletesPerDay * days);
  const billableFirestoreGiB = Math.max(
    0,
    bytesToGiB(firestoreUsageBytes) - FIREBASE_COST_ESTIMATE.freeFirestoreStorageGiB
  );
  const billableStorageGiB = Math.max(
    0,
    bytesToGiB(storageUsageBytes) - FIREBASE_COST_ESTIMATE.freeCloudStorageGiB
  );
  const billableHostingGiB = Math.max(
    0,
    bytesToGiB(hostingStorageBytes) - FIREBASE_COST_ESTIMATE.freeHostingStorageGiB
  );

  const firestoreOperationsUSD =
    (billableReads / 100000) * FIREBASE_COST_ESTIMATE.firestoreReadUsdPer100k +
    (billableWrites / 100000) * FIREBASE_COST_ESTIMATE.firestoreWriteUsdPer100k +
    (billableDeletes / 100000) * FIREBASE_COST_ESTIMATE.firestoreDeleteUsdPer100k;
  const firestoreStorageUSD = billableFirestoreGiB * FIREBASE_COST_ESTIMATE.firestoreStorageUsdPerGiBMonth;
  const storageUSD = billableStorageGiB * FIREBASE_COST_ESTIMATE.cloudStorageUsdPerGiBMonth;
  const hostingStorageUSD = billableHostingGiB * FIREBASE_COST_ESTIMATE.hostingStorageUsdPerGiBMonth;

  const toThb = (usd: number) => Number((usd * FIREBASE_COST_ESTIMATE.usdToThb).toFixed(2));

  return {
    firestoreOperationsTHB: toThb(firestoreOperationsUSD),
    firestoreStorageTHB: toThb(firestoreStorageUSD),
    storageTHB: toThb(storageUSD),
    hostingStorageTHB: toThb(hostingStorageUSD),
    totalTHB: toThb(firestoreOperationsUSD + firestoreStorageUSD + storageUSD + hostingStorageUSD),
    currency: "THB" as const,
    usdToThb: FIREBASE_COST_ESTIMATE.usdToThb,
  };
};

export const buildFirebaseMonthlyUsageSummary = ({
  month = getCurrentUsageMonth(),
  readOps = 0,
  createOps = 0,
  updateOps = 0,
  deleteOps = 0,
  firestoreUsageBytes = 0,
  storageUsageBytes = 0,
  hostingStorageBytes = ESTIMATED_HOSTING_STORAGE_BYTES,
}: Partial<Omit<FirebaseMonthlyUsageSummary, "cost" | "writeOps">> & { month?: string }) => {
  const writeOps = Math.max(0, createOps || 0) + Math.max(0, updateOps || 0);

  return {
    month,
    readOps: Math.max(0, Math.round(readOps || 0)),
    createOps: Math.max(0, Math.round(createOps || 0)),
    updateOps: Math.max(0, Math.round(updateOps || 0)),
    deleteOps: Math.max(0, Math.round(deleteOps || 0)),
    writeOps,
    firestoreUsageBytes: Math.max(0, firestoreUsageBytes || 0),
    storageUsageBytes: Math.max(0, storageUsageBytes || 0),
    hostingStorageBytes: Math.max(0, hostingStorageBytes || 0),
    cost: calculateFirebaseMonthlyCost({
      month,
      readOps: Math.max(0, Math.round(readOps || 0)),
      writeOps,
      deleteOps: Math.max(0, Math.round(deleteOps || 0)),
      firestoreUsageBytes: Math.max(0, firestoreUsageBytes || 0),
      storageUsageBytes: Math.max(0, storageUsageBytes || 0),
      hostingStorageBytes: Math.max(0, hostingStorageBytes || 0),
    }),
  };
};

export const mapOwnerSummary = (source: any): OwnerDashboardSummary => ({
  totalSchools: getCachedCount(source, ["totalSchools", "schoolCount", "schools", "counts.schools"]),
  totalTeachers: getCachedCount(source, ["totalTeachers", "teacherCount", "teachers", "counts.teachers"]),
  totalStudents: getCachedCount(source, ["totalStudents", "studentCount", "students", "counts.students"]),
  firestoreUsage: source?.firestoreUsage || DEFAULT_OWNER_SUMMARY.firestoreUsage,
  storageUsage: source?.storageUsage || DEFAULT_OWNER_SUMMARY.storageUsage,
  firestoreUsageBytes: getCachedCount(source, ["firestoreUsageBytes", "usage.firestoreBytes"]),
  storageUsageBytes: getCachedCount(source, ["storageUsageBytes", "usage.storageBytes"]),
  firestoreDocumentCount: getCachedCount(source, ["firestoreDocumentCount", "usage.firestoreDocumentCount"]),
  monthlyUsage: source?.monthlyUsage || source?.usage?.monthly || {},
});

export const mapSchoolSummary = (source: any, fallback: any = {}): SchoolDashboardSummary => {
  const teacherCount = getCachedCountOptional(source, teacherCountPaths) ?? getCachedCount(fallback, teacherCountPaths);
  const studentCount = getCachedCountOptional(source, studentCountPaths) ?? getCachedCount(fallback, studentCountPaths);

  return {
    teacherCount,
    studentCount,
    firestoreUsage: source?.firestoreUsage || source?.dataUsage || fallback?.firestoreUsage || fallback?.dataUsage || DEFAULT_SCHOOL_SUMMARY.firestoreUsage,
    storageUsage: source?.storageUsage || fallback?.storageUsage || DEFAULT_SCHOOL_SUMMARY.storageUsage,
    firestoreUsageBytes: getCachedCount(source, ["firestoreUsageBytes", "dataUsageBytes", "usage.firestoreBytes"]),
    storageUsageBytes: getCachedCount(source, ["storageUsageBytes", "usage.storageBytes"]),
    firestoreDocumentCount: getCachedCount(source, ["firestoreDocumentCount", "usage.firestoreDocumentCount"]),
    monthlyUsage: source?.monthlyUsage || source?.usage?.monthly || {},
  };
};

export const fetchOwnerDashboardSummary = async (db: Firestore) => {
  const summarySnap = await getDoc(doc(db, ...OWNER_DASHBOARD_SUMMARY_PATH));
  if (!summarySnap.exists()) {
    await setDoc(doc(db, ...OWNER_DASHBOARD_SUMMARY_PATH), {
      ...DEFAULT_OWNER_SUMMARY,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return DEFAULT_OWNER_SUMMARY;
  }

  return mapOwnerSummary(summarySnap.data());
};

export const writeOwnerDashboardSummaryFromSchools = async (
  db: Firestore,
  schools: SchoolDashboardSummary[]
) => {
  const schoolTotals = schools.reduce((totals, school) => {
    totals.totalTeachers += school.teacherCount || 0;
    totals.totalStudents += school.studentCount || 0;
    totals.firestoreUsageBytes += school.firestoreUsageBytes || 0;
    totals.storageUsageBytes += school.storageUsageBytes || 0;
    totals.firestoreDocumentCount += school.firestoreDocumentCount || 0;
    return totals;
  }, {
    totalTeachers: 0,
    totalStudents: 0,
    firestoreUsageBytes: 0,
    storageUsageBytes: 0,
    firestoreDocumentCount: 0,
  });

  const rootDocumentCount = 0;
  const firestoreDocumentCount = schoolTotals.firestoreDocumentCount + rootDocumentCount;
  const firestoreUsageBytes = schoolTotals.firestoreUsageBytes + rootDocumentCount * ESTIMATED_FIRESTORE_DOC_BYTES;
  const storageUsageBytes = schoolTotals.storageUsageBytes;
  const month = getCurrentUsageMonth();
  const monthlyUsage = buildFirebaseMonthlyUsageSummary({
    month,
    readOps: firestoreDocumentCount,
    updateOps: schools.length + 1,
    firestoreUsageBytes,
    storageUsageBytes,
    hostingStorageBytes: ESTIMATED_HOSTING_STORAGE_BYTES,
  });
  const summary: OwnerDashboardSummary = {
    totalSchools: schools.length,
    totalTeachers: schoolTotals.totalTeachers,
    totalStudents: schoolTotals.totalStudents,
    firestoreUsage: formatBytes(firestoreUsageBytes, "MB"),
    storageUsage: formatBytes(storageUsageBytes, "GB"),
    firestoreUsageBytes,
    storageUsageBytes,
    firestoreDocumentCount,
    monthlyUsage: {
      [month]: monthlyUsage,
    },
  };

  try {
    await setDoc(doc(db, ...OWNER_DASHBOARD_SUMMARY_PATH), {
      ...summary,
      counts: {
        schools: summary.totalSchools,
        teachers: summary.totalTeachers,
        students: summary.totalStudents,
      },
      usage: {
        firestoreBytes: firestoreUsageBytes,
        storageBytes: storageUsageBytes,
        firestoreDocumentCount,
        monthly: {
          [month]: monthlyUsage,
        },
        note: "Estimated by summing each school's dashboard summary plus root collection document counts.",
      },
      monthlyUsage: {
        [month]: monthlyUsage,
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.warn("Unable to cache owner dashboard summary:", error);
  }

  return summary;
};

export const getSchoolDashboardSummaryRef = (db: Firestore, schoolId: string) => {
  return doc(db, "school-settings", schoolId, ...SCHOOL_DASHBOARD_SUMMARY_PATH);
};

const buildSchoolSummaryPayload = (summary: SchoolDashboardSummary) => {
  const month = getCurrentUsageMonth();
  const monthlyUsage = summary.monthlyUsage?.[month] || buildFirebaseMonthlyUsageSummary({
    month,
    readOps: summary.firestoreDocumentCount || 0,
    updateOps: 2,
    firestoreUsageBytes: summary.firestoreUsageBytes || 0,
    storageUsageBytes: summary.storageUsageBytes || 0,
  });

  return {
    teacherCount: summary.teacherCount,
    studentCount: summary.studentCount,
    counts: {
      teachers: summary.teacherCount,
      students: summary.studentCount,
    },
    stats: {
      teachers: summary.teacherCount,
      students: summary.studentCount,
    },
    firestoreUsage: summary.firestoreUsage,
    storageUsage: summary.storageUsage,
    firestoreUsageBytes: summary.firestoreUsageBytes || 0,
    storageUsageBytes: summary.storageUsageBytes || 0,
    firestoreDocumentCount: summary.firestoreDocumentCount || 0,
    usage: {
      firestoreBytes: summary.firestoreUsageBytes || 0,
      storageBytes: summary.storageUsageBytes || 0,
      firestoreDocumentCount: summary.firestoreDocumentCount || 0,
      monthly: {
        [month]: monthlyUsage,
      },
      note: "Estimated from this school's Firestore document counts and average app asset sizes.",
    },
    monthlyUsage: {
      [month]: monthlyUsage,
    },
    updatedAt: serverTimestamp(),
  };
};

const shouldRefreshSchoolSummary = (summary: SchoolDashboardSummary, summaryExists: boolean) => {
  if (!summaryExists) return true;
  if (!summary.monthlyUsage?.[getCurrentUsageMonth()]) return true;
  return !summary.firestoreDocumentCount &&
    !summary.firestoreUsageBytes &&
    !summary.storageUsageBytes &&
    summary.firestoreUsage === DEFAULT_SCHOOL_SUMMARY.firestoreUsage &&
    summary.storageUsage === DEFAULT_SCHOOL_SUMMARY.storageUsage;
};

const calculateSchoolDashboardSummary = async (
  db: Firestore,
  schoolId: string
): Promise<SchoolDashboardSummary> => {
  const teachersRef = collection(db, "school-settings", schoolId, "teachers");
  const studentsRef = collection(db, "school-settings", schoolId, "students");

  const [
    teachersSnap,
    studentsSnap,
    ...usageCountSnapshots
  ] = await Promise.all([
    getDocs(teachersRef),
    getDocs(studentsRef),
    ...schoolSubcollectionsForUsageEstimate
      .filter((collectionName) => !["teachers", "students"].includes(collectionName))
      .map((collectionName) =>
        getCountFromServer(collection(db, "school-settings", schoolId, collectionName))
      ),
  ]);

  const teachersList = teachersSnap.docs.map(doc => doc.data());
  const activeTeachers = teachersList.filter(t => t.status === ACTIVE_TEACHER_STATUS && !isAttendanceEntryOnly(t.role));
  const allValidTeachers = teachersList.filter(t => !isAttendanceEntryOnly(t.role));

  const teacherDocumentCount = allValidTeachers.length;
  const studentDocumentCount = studentsSnap.size;
  const activeTeacherCount = activeTeachers.length;
  const teacherCount = activeTeacherCount || teacherDocumentCount;
  const studentCount = studentsSnap.docs.filter(
    (studentDoc) => isActiveStudentStatus(getStudentStatus(studentDoc.data()))
  ).length;

  let firestoreDocumentCount = 2 + teacherDocumentCount + studentDocumentCount;
  usageCountSnapshots.forEach((snapshot) => {
    firestoreDocumentCount += snapshot.data().count || 0;
  });

  const firestoreUsageBytes = firestoreDocumentCount * ESTIMATED_FIRESTORE_DOC_BYTES;
  const storageUsageBytes = estimateSchoolStorageBytes(teacherDocumentCount, studentDocumentCount);

  return {
    teacherCount,
    studentCount,
    firestoreUsage: formatBytes(firestoreUsageBytes, "MB"),
    storageUsage: formatBytes(storageUsageBytes, "GB"),
    firestoreUsageBytes,
    storageUsageBytes,
    firestoreDocumentCount,
    monthlyUsage: {
      [getCurrentUsageMonth()]: buildFirebaseMonthlyUsageSummary({
        readOps: firestoreDocumentCount,
        updateOps: 2,
        firestoreUsageBytes,
        storageUsageBytes,
      }),
    },
  };
};

export const fetchSchoolDashboardSummary = async (
  db: Firestore,
  schoolId: string,
  fallback: any = {}
) => {
  if (!schoolId) return mapSchoolSummary(fallback);

  const summaryRef = getSchoolDashboardSummaryRef(db, schoolId);
  const summarySnap = await getDoc(summaryRef);
  const cachedSummary = summarySnap.exists()
    ? mapSchoolSummary(summarySnap.data(), fallback)
    : mapSchoolSummary(fallback);

  if (!shouldRefreshSchoolSummary(cachedSummary, summarySnap.exists())) {
    return cachedSummary;
  }

  const calculatedSummary = await calculateSchoolDashboardSummary(db, schoolId);
  try {
    await Promise.all([
      setDoc(summaryRef, buildSchoolSummaryPayload(calculatedSummary), { merge: true }),
      setDoc(doc(db, "school-settings", schoolId), {
        teacherCount: calculatedSummary.teacherCount,
        studentCount: calculatedSummary.studentCount,
        counts: {
          teachers: calculatedSummary.teacherCount,
          students: calculatedSummary.studentCount,
        },
        stats: {
          teachers: calculatedSummary.teacherCount,
          students: calculatedSummary.studentCount,
        },
        updatedAt: serverTimestamp(),
      }, { merge: true }),
    ]);
  } catch (error) {
    console.warn("Unable to cache school dashboard summary:", error);
  }

  return calculatedSummary;
};

export const updateOwnerDashboardSummary = async (
  db: Firestore,
  changes: Partial<Record<"schools" | "teachers" | "students", number>>
) => {
  const summaryRef = doc(db, ...OWNER_DASHBOARD_SUMMARY_PATH);
  const month = getCurrentUsageMonth();

  await runTransaction(db, async (transaction) => {
    const summarySnap = await transaction.get(summaryRef);
    const current = summarySnap.exists()
      ? mapOwnerSummary(summarySnap.data())
      : DEFAULT_OWNER_SUMMARY;
    const currentMonthly = current.monthlyUsage?.[month];
    const positiveDelta = Math.max(0, changes.schools || 0) +
      Math.max(0, changes.teachers || 0) +
      Math.max(0, changes.students || 0);
    const negativeDelta = Math.abs(Math.min(0, changes.schools || 0)) +
      Math.abs(Math.min(0, changes.teachers || 0)) +
      Math.abs(Math.min(0, changes.students || 0));
    const nextDocumentCount = Math.max(0, (current.firestoreDocumentCount || 0) + positiveDelta - negativeDelta);
    const nextMonthlyUsage = buildFirebaseMonthlyUsageSummary({
      month,
      readOps: (currentMonthly?.readOps || 0) + 1,
      createOps: (currentMonthly?.createOps || 0) + positiveDelta,
      updateOps: (currentMonthly?.updateOps || 0) + 1,
      deleteOps: (currentMonthly?.deleteOps || 0) + negativeDelta,
      firestoreUsageBytes: current.firestoreUsageBytes || nextDocumentCount * ESTIMATED_FIRESTORE_DOC_BYTES,
      storageUsageBytes: current.storageUsageBytes || 0,
    });

    transaction.set(summaryRef, {
      totalSchools: Math.max(0, current.totalSchools + (changes.schools || 0)),
      totalTeachers: Math.max(0, current.totalTeachers + (changes.teachers || 0)),
      totalStudents: Math.max(0, current.totalStudents + (changes.students || 0)),
      firestoreUsage: current.firestoreUsage || DEFAULT_OWNER_SUMMARY.firestoreUsage,
      storageUsage: current.storageUsage || DEFAULT_OWNER_SUMMARY.storageUsage,
      monthlyUsage: {
        [month]: nextMonthlyUsage,
      },
      usage: {
        monthly: {
          [month]: nextMonthlyUsage,
        },
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
};

export const updateSchoolCachedCounts = async (
  db: Firestore,
  schoolId: string,
  changes: Partial<Record<"teachers" | "students", number>>
) => {
  if (!schoolId) return;

  const teacherDelta = changes.teachers || 0;
  const studentDelta = changes.students || 0;
  const summaryRef = getSchoolDashboardSummaryRef(db, schoolId);
  const month = getCurrentUsageMonth();

  await runTransaction(db, async (transaction) => {
    const summarySnap = await transaction.get(summaryRef);
    const current = summarySnap.exists()
      ? mapSchoolSummary(summarySnap.data())
      : DEFAULT_SCHOOL_SUMMARY;
    const nextTeacherCount = Math.max(0, current.teacherCount + teacherDelta);
    const nextStudentCount = Math.max(0, current.studentCount + studentDelta);
    const nextDocumentCount = Math.max(0, (current.firestoreDocumentCount || 0) + teacherDelta + studentDelta);
    const firestoreUsageBytes = nextDocumentCount * ESTIMATED_FIRESTORE_DOC_BYTES;
    const storageUsageBytes = estimateSchoolStorageBytes(nextTeacherCount, nextStudentCount);
    const currentMonthly = current.monthlyUsage?.[month];
    const positiveDelta = Math.max(0, teacherDelta) + Math.max(0, studentDelta);
    const negativeDelta = Math.abs(Math.min(0, teacherDelta)) + Math.abs(Math.min(0, studentDelta));
    const nextMonthlyUsage = buildFirebaseMonthlyUsageSummary({
      month,
      readOps: (currentMonthly?.readOps || 0) + 1,
      createOps: (currentMonthly?.createOps || 0) + positiveDelta,
      updateOps: (currentMonthly?.updateOps || 0) + 1,
      deleteOps: (currentMonthly?.deleteOps || 0) + negativeDelta,
      firestoreUsageBytes,
      storageUsageBytes,
    });

    transaction.set(summaryRef, {
      teacherCount: nextTeacherCount,
      studentCount: nextStudentCount,
      counts: {
        teachers: nextTeacherCount,
        students: nextStudentCount,
      },
      stats: {
        teachers: nextTeacherCount,
        students: nextStudentCount,
      },
      firestoreUsage: formatBytes(firestoreUsageBytes, "MB"),
      storageUsage: formatBytes(storageUsageBytes, "GB"),
      firestoreUsageBytes,
      storageUsageBytes,
      firestoreDocumentCount: nextDocumentCount,
      usage: {
        firestoreBytes: firestoreUsageBytes,
        storageBytes: storageUsageBytes,
        firestoreDocumentCount: nextDocumentCount,
        monthly: {
          [month]: nextMonthlyUsage,
        },
        note: "Estimated from this school's Firestore document counts and average app asset sizes.",
      },
      monthlyUsage: {
        [month]: nextMonthlyUsage,
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  const updates: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (teacherDelta) {
    updates.teacherCount = increment(teacherDelta);
    updates.counts = {
      ...(updates.counts || {}),
      teachers: increment(teacherDelta),
    };
    updates.stats = {
      ...(updates.stats || {}),
      teachers: increment(teacherDelta),
    };
  }

  if (studentDelta) {
    updates.studentCount = increment(studentDelta);
    updates.counts = {
      ...(updates.counts || {}),
      students: increment(studentDelta),
    };
    updates.stats = {
      ...(updates.stats || {}),
      students: increment(studentDelta),
    };
  }

  await setDoc(doc(db, "school-settings", schoolId), updates, { merge: true });
};

export const updateOwnerAndSchoolCounts = async (
  db: Firestore,
  schoolId: string,
  changes: Partial<Record<"teachers" | "students", number>>
) => {
  await Promise.all([
    updateOwnerDashboardSummary(db, changes),
    updateSchoolCachedCounts(db, schoolId, changes),
  ]);
};

export const refreshOwnerDashboardSummaryFromCounts = async (db: Firestore) => {
  const month = getCurrentUsageMonth();
  const schoolsRef = collection(db, "school-settings");
  const [schoolsSnapshot, schoolsCount] = await Promise.all([
    getDocs(schoolsRef),
    safeGetCollectionCount(schoolsRef, 0),
  ]);
  const rootCounts = await Promise.all(
    rootCollectionsForUsageEstimate.map((collectionName) =>
      safeGetCollectionCount(collection(db, collectionName), 0)
    )
  );

  let totalTeachers = 0;
  let totalStudents = 0;
  let firestoreDocumentCount = schoolsCount || schoolsSnapshot.size;
  firestoreDocumentCount += schoolsSnapshot.size;
  rootCounts.forEach((count) => {
    firestoreDocumentCount += count || 0;
  });

  const schoolCounts = await Promise.all(
    schoolsSnapshot.docs.map(async (schoolDoc) => {
      const [
        teachersSnap,
        studentsSnap,
        ...usageCountSnapshots
      ] = await Promise.all([
        getDocs(collection(db, "school-settings", schoolDoc.id, "teachers")),
        getDocs(collection(db, "school-settings", schoolDoc.id, "students")),
        ...schoolSubcollectionsForUsageEstimate
          .filter((collectionName) => !["teachers", "students"].includes(collectionName))
          .map((collectionName) =>
            getCountFromServer(collection(db, "school-settings", schoolDoc.id, collectionName))
          ),
      ]);

      const teachersList = teachersSnap.docs.map(doc => doc.data());
      const activeTeachers = teachersList.filter(t => t.status === ACTIVE_TEACHER_STATUS && !isAttendanceEntryOnly(t.role));
      const allValidTeachers = teachersList.filter(t => !isAttendanceEntryOnly(t.role));

      const teacherDocumentCount = allValidTeachers.length;
      const studentDocumentCount = studentsSnap.size;
      const activeTeacherCount = activeTeachers.length;
      const teacherCount = activeTeacherCount || teacherDocumentCount;
      const studentCount = studentsSnap.docs.filter(
        (studentDoc) => isActiveStudentStatus(getStudentStatus(studentDoc.data()))
      ).length;
      let schoolDocumentCount = 2 + teacherDocumentCount + studentDocumentCount;
      totalTeachers += teacherCount;
      totalStudents += studentCount;
      firestoreDocumentCount += teacherDocumentCount + studentDocumentCount;
      usageCountSnapshots.forEach((snapshot) => {
        const count = snapshot.data().count || 0;
        schoolDocumentCount += count;
        firestoreDocumentCount += count;
      });
      const firestoreUsageBytes = schoolDocumentCount * ESTIMATED_FIRESTORE_DOC_BYTES;
      const storageUsageBytes = estimateSchoolStorageBytes(teacherDocumentCount, studentDocumentCount);
      const monthlyUsage = buildFirebaseMonthlyUsageSummary({
        month,
        readOps: schoolDocumentCount,
        updateOps: 2,
        firestoreUsageBytes,
        storageUsageBytes,
      });

      return {
        schoolId: schoolDoc.id,
        teacherCount,
        studentCount,
        firestoreDocumentCount: schoolDocumentCount,
        firestoreUsageBytes,
        storageUsageBytes,
        monthlyUsage,
      };
    })
  );

  for (let i = 0; i < schoolCounts.length; i += 240) {
    const batch = writeBatch(db);
    schoolCounts.slice(i, i + 240).forEach(({
      schoolId,
      teacherCount,
      studentCount,
      firestoreDocumentCount,
      firestoreUsageBytes,
      storageUsageBytes,
      monthlyUsage,
    }) => {
      batch.set(doc(db, "school-settings", schoolId), {
        teacherCount,
        studentCount,
        counts: {
          teachers: teacherCount,
          students: studentCount,
        },
        stats: {
          teachers: teacherCount,
          students: studentCount,
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      batch.set(getSchoolDashboardSummaryRef(db, schoolId), {
        teacherCount,
        studentCount,
        counts: {
          teachers: teacherCount,
          students: studentCount,
        },
        stats: {
          teachers: teacherCount,
          students: studentCount,
        },
        firestoreUsage: formatBytes(firestoreUsageBytes, "MB"),
        storageUsage: formatBytes(storageUsageBytes, "GB"),
        firestoreUsageBytes,
        storageUsageBytes,
        firestoreDocumentCount,
        usage: {
          firestoreBytes: firestoreUsageBytes,
          storageBytes: storageUsageBytes,
          firestoreDocumentCount,
          monthly: {
            [month]: monthlyUsage,
          },
          note: "Estimated from this school's Firestore document counts and average app asset sizes.",
        },
        monthlyUsage: {
          [month]: monthlyUsage,
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }

  const firestoreUsageBytes = firestoreDocumentCount * ESTIMATED_FIRESTORE_DOC_BYTES;
  const storageUsageBytes =
    totalSchoolsStorageEstimate(schoolsSnapshot.size) +
    totalTeachers * ESTIMATED_TEACHER_STORAGE_BYTES +
    totalStudents * ESTIMATED_STUDENT_STORAGE_BYTES;

  const summary: OwnerDashboardSummary = {
    totalSchools: schoolsCount || schoolsSnapshot.size,
    totalTeachers,
    totalStudents,
    firestoreUsage: formatBytes(firestoreUsageBytes, "MB"),
    storageUsage: formatBytes(storageUsageBytes, "GB"),
    firestoreUsageBytes,
    storageUsageBytes,
    firestoreDocumentCount,
  };
  const monthlyUsage = buildFirebaseMonthlyUsageSummary({
    month,
    readOps: firestoreDocumentCount,
    updateOps: schoolsSnapshot.size + 1,
    firestoreUsageBytes,
    storageUsageBytes,
    hostingStorageBytes: ESTIMATED_HOSTING_STORAGE_BYTES,
  });

  await setDoc(doc(db, ...OWNER_DASHBOARD_SUMMARY_PATH), {
    ...summary,
    usage: {
      firestoreBytes: firestoreUsageBytes,
      storageBytes: storageUsageBytes,
      firestoreDocumentCount,
      monthly: {
        [month]: monthlyUsage,
      },
      note: "Estimated from Firestore document counts and average app asset sizes.",
    },
    monthlyUsage: {
      [month]: monthlyUsage,
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return summary;
};

const totalSchoolsStorageEstimate = (schoolCount: number) => {
  return schoolCount * ESTIMATED_SCHOOL_LOGO_BYTES;
};

const estimateSchoolStorageBytes = (teacherCount: number, studentCount: number) => {
  return ESTIMATED_SCHOOL_LOGO_BYTES +
    teacherCount * ESTIMATED_TEACHER_STORAGE_BYTES +
    studentCount * ESTIMATED_STUDENT_STORAGE_BYTES;
};

// ข้อมูล License/MA/สัญญา แยกจาก school-settings/{schoolId} หลักโดยตั้งใจ
// เพื่อให้ Firestore rules จำกัดสิทธิ์อ่านเฉพาะ SUPER_ADMIN ได้ (School Admin ไม่ควรเห็นข้อมูลสัญญา)
export type LicenseStatus = "active" | "trial" | "expired";

export interface SchoolLicenseInfo {
  licenseStatus?: LicenseStatus;
  maExpiryDate?: string; // ISO date string (YYYY-MM-DD)
  contractExpiryDate?: string; // ISO date string (YYYY-MM-DD)
  lastBackupAt?: string; // ISO date string, กรอกด้วยมือ
  maNotifiedForDate?: string; // เขียนโดย Cloud Function notifyMaExpiringSoon เพื่อกันแจ้งเตือนซ้ำ
  updatedAt?: any;
}

export const LICENSE_SUMMARY_PATH = ["summaries", "license"] as const;

export const getSchoolLicenseRef = (db: Firestore, schoolId: string) => {
  return doc(db, "school-settings", schoolId, ...LICENSE_SUMMARY_PATH);
};

export const fetchSchoolLicenseInfo = async (
  db: Firestore,
  schoolId: string
): Promise<SchoolLicenseInfo | null> => {
  const snap = await getDoc(getSchoolLicenseRef(db, schoolId));
  return snap.exists() ? (snap.data() as SchoolLicenseInfo) : null;
};

export const saveSchoolLicenseInfo = async (
  db: Firestore,
  schoolId: string,
  info: SchoolLicenseInfo
) => {
  await setDoc(getSchoolLicenseRef(db, schoolId), {
    ...info,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

const daysUntil = (isoDate?: string) => {
  if (!isoDate) return null;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
};

export const getDaysUntilMaExpiry = (maExpiryDate?: string) => daysUntil(maExpiryDate);

// แจ้งเตือนเมื่อเหลือ 30 วันก่อนหมด MA (หรือหมดแล้ว) - ใช้แสดง badge ในหน้า UI
export const isMaExpiringSoon = (maExpiryDate?: string, thresholdDays = 30) => {
  const days = daysUntil(maExpiryDate);
  return days !== null && days <= thresholdDays;
};

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, string> = {
  active: "ใช้งานปกติ",
  trial: "ทดลองใช้",
  expired: "หมดอายุ",
};

// รับ Firestore Timestamp, ISO string, หรือ undefined แล้วคืนข้อความแสดงผล Last Sync
export const formatLastSyncTimestamp = (value: any) => {
  const date = value?.toDate ? value.toDate() : (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "ไม่มีข้อมูล";
  return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
};
