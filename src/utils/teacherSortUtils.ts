export const SUBJECT_GROUP_ORDER = [
  'ภาษาไทย',
  'คณิตศาสตร์',
  'วิทยาศาสตร์และเทคโนโลยี',
  'สังคมศึกษา ศาสนา และวัฒนธรรม',
  'สุขศึกษาและพลศึกษา',
  'ศิลปะ',
  'การงานอาชีพ',
  'ภาษาต่างประเทศ',
  'กิจกรรมพัฒนาผู้เรียน',
];

const SUBJECT_GROUP_ALIASES: Record<string, number> = {
  thai: 1,
  math: 2,
  mathematics: 2,
  science: 3,
  social: 4,
  health: 5,
  art: 6,
  career: 7,
  foreign: 8,
  activity: 9,
};

export const normalizeTeacherText = (value: unknown) =>
  String(value || '').replace(/\s+/g, '').trim().toLowerCase();

export const getTeacherSubjectGroupOrder = (teacher: any) => {
  const rawValue = String(teacher?.subjectGroup || teacher?.learningArea || '').trim();
  if (!rawValue) return 999;

  const numericMatch = rawValue.match(/\d+/);
  if (numericMatch) {
    const numericValue = Number(numericMatch[0]);
    if (numericValue >= 1 && numericValue <= 9) return numericValue;
  }

  const normalizedValue = normalizeTeacherText(rawValue)
    .replace(/^กลุ่มสาระการเรียนรู้/u, '')
    .replace(/^กลุ่มสาระ/u, '');

  const aliasOrder = SUBJECT_GROUP_ALIASES[normalizedValue];
  if (aliasOrder) return aliasOrder;

  const index = SUBJECT_GROUP_ORDER.findIndex(group => {
    const normalizedGroup = normalizeTeacherText(group)
      .replace(/^กลุ่มสาระการเรียนรู้/u, '')
      .replace(/^กลุ่มสาระ/u, '');
    return normalizedValue === normalizedGroup || normalizedValue.includes(normalizedGroup) || normalizedGroup.includes(normalizedValue);
  });

  return index === -1 ? 999 : index + 1;
};

export const isActiveTeacher = (teacher: any) => {
  const status = String(teacher?.status || 'อยู่').trim();
  if (status && status !== 'อยู่') return false;

  // Exclude accounts meant for registration/attendance tools
  const name = String(teacher?.name || '').toLowerCase();
  const firstName = String(teacher?.firstName || '').toLowerCase();
  const lastName = String(teacher?.lastName || '').toLowerCase();
  const id = String(teacher?.id || '').toLowerCase();
  const teacherId = String(teacher?.teacherId || '').toLowerCase();
  const email = String(teacher?.email || '').toLowerCase();
  const role = String(teacher?.role || '').toLowerCase();

  const isAttendanceAccount = 
    /attendance|atthendance|athemdance|athendance|ลงเวลา/.test(name) ||
    /attendance|atthendance|athemdance|athendance|ลงเวลา/.test(firstName) ||
    /attendance|atthendance|athemdance|athendance|ลงเวลา/.test(lastName) ||
    /attendance|atthendance|athemdance|athendance/.test(id) ||
    /attendance|atthendance|athemdance|athendance/.test(teacherId) ||
    /attendance|atthendance|athemdance|athendance/.test(email) ||
    /attendance|atthendance|athemdance|athendance/.test(role);

  return !isAttendanceAccount;
};

export const compareTeacherIds = (first: unknown, second: unknown) => {
  const a = String(first || '').trim();
  const b = String(second || '').trim();

  const aNumber = Number(a.replace(/[^\d.-]/g, ''));
  const bNumber = Number(b.replace(/[^\d.-]/g, ''));
  const aHasNumber = a !== '' && !Number.isNaN(aNumber);
  const bHasNumber = b !== '' && !Number.isNaN(bNumber);

  if (aHasNumber && bHasNumber && aNumber !== bNumber) return aNumber - bNumber;
  if (aHasNumber !== bHasNumber) return aHasNumber ? -1 : 1;
  return a.localeCompare(b, 'th', { numeric: true, sensitivity: 'base' });
};

export const compareTeachersByGroupAndId = (first: any, second: any) => {
  const groupA = getTeacherSubjectGroupOrder(first);
  const groupB = getTeacherSubjectGroupOrder(second);
  if (groupA !== groupB) return groupA - groupB;

  const idCompare = compareTeacherIds(first?.teacherId, second?.teacherId);
  if (idCompare !== 0) return idCompare;

  const nameA = first?.name || `${first?.title || ''}${first?.firstName || ''} ${first?.lastName || ''}`.trim();
  const nameB = second?.name || `${second?.title || ''}${second?.firstName || ''} ${second?.lastName || ''}`.trim();
  return String(nameA).localeCompare(String(nameB), 'th', { numeric: true, sensitivity: 'base' });
};

export const getActiveSortedTeachers = <T extends any>(teachers: T[]) =>
  [...teachers].filter(isActiveTeacher).sort(compareTeachersByGroupAndId);
