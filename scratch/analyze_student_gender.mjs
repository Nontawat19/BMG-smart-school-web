import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';

const envText = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const line of envText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) continue;
  const key = trimmed.slice(0, eqIndex).trim();
  const rawValue = trimmed.slice(eqIndex + 1).trim();
  const value = rawValue.replace(/^"/, '').replace(/"$/, '');
  if (!(key in process.env)) process.env[key] = value;
}

const schoolId = process.argv[2];

if (!schoolId) {
  console.error('Usage: node scratch/analyze_student_gender.mjs <schoolId>');
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const ACTIVE_STUDENT_STATUS = 'กำลังศึกษาอยู่';
const ACTIVE_STUDENT_STATUS_ALIASES = ['กำลังศึกษา', 'กำลังศึกษาอยู่', 'เรียนอยู่', 'active', 'ปกติ'];
const ARCHIVED_STUDENT_STATUSES = [
  'ย้าย',
  'ลาออก',
  'จำหน่าย',
  'จำหน่ายชื่อออก',
  'สำเร็จการศึกษา',
  'รออนุมัติจบ',
  'ซ้ำชั้น',
  'graduated',
  'exited',
  'pending_grad',
  'repeat',
];

const normalizeStudentStatus = (status) => {
  const normalized = String(status || '').trim();
  const lower = normalized.toLowerCase();
  return ACTIVE_STUDENT_STATUS_ALIASES.some((value) => value.toLowerCase() === lower)
    ? ACTIVE_STUDENT_STATUS
    : normalized;
};

const isArchivedStudentStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ARCHIVED_STUDENT_STATUSES.some((value) => value.toLowerCase() === normalized);
};

const isCurrentStudent = (student) => {
  const status = normalizeStudentStatus(student?.status || student?.studentStatus || ACTIVE_STUDENT_STATUS);
  return !isArchivedStudentStatus(status);
};

const isMaleStudentListLogic = (student) => {
  const title = String(student?.title || '').trim();
  const gender = String(student?.gender || '').trim().toLowerCase();
  return ['นาย', 'ด.ช.', 'เด็กชาย', 'สามเณร'].includes(title) || ['ชาย', 'male', 'm'].includes(gender);
};

const normalizeDailySummaryGender = (student) => {
  const gender = String(student?.gender || '').trim();
  if (gender === 'ชาย' || gender.toLowerCase() === 'male' || gender.toLowerCase() === 'm') return 'ชาย';
  if (gender === 'หญิง' || gender.toLowerCase() === 'female' || gender.toLowerCase() === 'f') return 'หญิง';

  const title = String(student?.title || '').trim();
  if (['นาย', 'ด.ช.', 'เด็กชาย', 'สามเณร'].includes(title)) return 'ชาย';
  if (['นางสาว', 'ด.ญ.', 'เด็กหญิง'].includes(title)) return 'หญิง';

  return 'ไม่ทราบ';
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const studentsRef = collection(db, 'school-settings', schoolId, 'students');
const snap = await getDocs(query(studentsRef, orderBy('createdAt', 'desc')));

const allStudents = snap.docs.map((docSnap) => ({
  id: docSnap.id,
  ...docSnap.data(),
}));

const currentStudents = allStudents.filter(isCurrentStudent);

const studentListSummary = {
  male: 0,
  female: 0,
  total: currentStudents.length,
};

const normalizedSummary = {
  male: 0,
  female: 0,
  unknown: 0,
};

const rawGenderCounts = new Map();
const titleCounts = new Map();
const statusCounts = new Map();

for (const student of currentStudents) {
  const rawGender = String(student.gender || '').trim() || '(empty)';
  rawGenderCounts.set(rawGender, (rawGenderCounts.get(rawGender) || 0) + 1);

  const title = String(student.title || '').trim() || '(empty)';
  titleCounts.set(title, (titleCounts.get(title) || 0) + 1);

  const status = normalizeStudentStatus(student.status || student.studentStatus || ACTIVE_STUDENT_STATUS) || '(empty)';
  statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

  if (isMaleStudentListLogic(student)) {
    studentListSummary.male += 1;
  } else {
    studentListSummary.female += 1;
  }

  const normalizedGender = normalizeDailySummaryGender(student);
  if (normalizedGender === 'ชาย') normalizedSummary.male += 1;
  else if (normalizedGender === 'หญิง') normalizedSummary.female += 1;
  else normalizedSummary.unknown += 1;
}

const currentPageLogic = currentStudents.reduce(
  (acc, student) => {
    const gender = String(student.gender || '').trim();
    if (gender === 'ชาย') acc.male += 1;
    else if (gender === 'หญิง') acc.female += 1;
    return acc;
  },
  { male: 0, female: 0 }
);

const byClassroom = new Map();

for (const student of currentStudents) {
  const classLevel = String(student.classLevel || '').trim() || '(no class)';
  const room = String(student.room || '').trim() || '-';
  const key = `${classLevel}/${room}`;
  const gender = normalizeDailySummaryGender(student);
  if (!byClassroom.has(key)) {
    byClassroom.set(key, { classLevel, room, male: 0, female: 0, unknown: 0, total: 0 });
  }
  const bucket = byClassroom.get(key);
  bucket.total += 1;
  if (gender === 'ชาย') bucket.male += 1;
  else if (gender === 'หญิง') bucket.female += 1;
  else bucket.unknown += 1;
}

const sortedMapEntries = (map) =>
  Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, value }));

console.log(JSON.stringify({
  schoolId,
  totalDocuments: allStudents.length,
  currentStudents: currentStudents.length,
  studentListLogic: studentListSummary,
  dailySummaryCurrentLogic: currentPageLogic,
  normalizedGenderSummary: normalizedSummary,
  rawGenderCounts: sortedMapEntries(rawGenderCounts),
  titleCounts: sortedMapEntries(titleCounts),
  statusCounts: sortedMapEntries(statusCounts),
  classroomSummary: Array.from(byClassroom.values()).sort((a, b) => {
    if (a.classLevel !== b.classLevel) return a.classLevel.localeCompare(b.classLevel, 'th');
    return a.room.localeCompare(b.room, 'th', { numeric: true });
  }),
}, null, 2));
