const ANNUAL_SEMESTER_VALUES = new Set([
  '',
  '0',
  'annual',
  '1-2',
  '1/2',
  'ปีการศึกษา',
  'ทั้งปีการศึกษา',
  'ทั้งสองภาคเรียน',
]);

export const normalizeSemesterValue = (semester?: string | number) => {
  const raw = String(semester ?? '').trim();
  const normalized = raw.toLowerCase();

  if (ANNUAL_SEMESTER_VALUES.has(normalized) || ANNUAL_SEMESTER_VALUES.has(raw)) {
    return '0';
  }

  if (normalized.startsWith('1/')) return '1';
  if (normalized.startsWith('2/')) return '2';
  if (normalized === '1' || normalized === '2') return normalized;

  return raw || '0';
};

export const semestersOverlap = (first?: string | number, second?: string | number) => {
  const a = normalizeSemesterValue(first);
  const b = normalizeSemesterValue(second);
  return a === '0' || b === '0' || a === b;
};

export const formatSemesterLabel = (semester?: string | number) => {
  const normalized = normalizeSemesterValue(semester);
  return normalized === '0' ? 'ทั้งสองภาคเรียน' : normalized;
};
