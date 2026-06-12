export interface PeriodLike {
  id?: string;
  label?: string;
  startTime?: string;
  endTime?: string;
  index?: number;
  order?: number;
  isTeaching?: boolean;
  isTeachingPeriod?: boolean;
  isFixed?: boolean;
}

export type NormalizedPeriod<T extends PeriodLike = PeriodLike> = T & {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  index: number;
  order: number;
  isTeachingPeriod: boolean;
  isTeaching: boolean;
};

const timeToMinutes = (time?: string) => {
  const normalized = String(time || '').trim().replace('.', ':');
  const [hourRaw, minuteRaw] = normalized.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

export const getEffectivePeriodEnd = (periods: PeriodLike[], period: PeriodLike, index: number) => {
  const currentEnd = timeToMinutes(period.endTime);
  const next = periods[index + 1];
  const nextStart = timeToMinutes(next?.startTime);

  if (currentEnd !== null && nextStart !== null && currentEnd > nextStart) {
    return next?.startTime || period.endTime || '';
  }

  return period.endTime || '';
};

export const getScheduleSlotCandidates = (dayKey: string, period: PeriodLike, periodIndex: number) => {
  const hasStableIndex = typeof period?.index !== 'undefined' || typeof period?.order !== 'undefined';
  const stableIndex = typeof period?.index !== 'undefined'
    ? period.index
    : (typeof period?.order !== 'undefined' ? period.order : periodIndex);
  const candidates = [`${dayKey}-${stableIndex}`, `${dayKey}-${period?.id}`];
  if (!hasStableIndex) candidates.push(`${dayKey}-${periodIndex}`);
  
  const periodNumber = String(period?.id || '').match(/^period-(\d+)$/)?.[1];
  if (periodNumber) {
    const num = Number(periodNumber);
    // Only include the 1-based fallback if it doesn't collide with a 0-based stable index
    if (!hasStableIndex || stableIndex === num) {
      candidates.push(`${dayKey}-${periodNumber}`);
    }
  }
  
  return Array.from(new Set(candidates.filter(Boolean)));
};

const isHomeroomPeriod = (period: PeriodLike) => {
  const id = String(period?.id || '').toLowerCase();
  const label = String(period?.label || '');
  return id === 'homeroom' || label === 'โฮมรูม';
};

const isLunchPeriod = (period: PeriodLike) => {
  const id = String(period?.id || '').toLowerCase();
  const label = String(period?.label || '');
  return id === 'lunch' || label.includes('พัก');
};

export const normalizePeriodSettings = <T extends PeriodLike>(periods: T[] = []): NormalizedPeriod<T>[] => {
  return periods
    .map((period, arrayIndex) => {
      const stableIndex = typeof period.index !== 'undefined'
        ? period.index
        : (typeof period.order !== 'undefined' ? period.order : arrayIndex);
      const explicitTeaching = typeof period.isTeachingPeriod === 'boolean'
        ? period.isTeachingPeriod
        : (typeof period.isTeaching === 'boolean' ? period.isTeaching : undefined);
      const isTeachingPeriod = explicitTeaching ?? (!isHomeroomPeriod(period) && !isLunchPeriod(period));

      return {
        ...period,
        id: period.id || `period-${stableIndex}`,
        label: period.label || `คาบที่ ${stableIndex}`,
        startTime: period.startTime || '',
        endTime: period.endTime || '',
        index: stableIndex,
        order: typeof period.order !== 'undefined' ? period.order : stableIndex,
        isTeachingPeriod,
        isTeaching: isTeachingPeriod,
      } as NormalizedPeriod<T>;
    })
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((period, i) => ({ ...period, index: i, order: typeof period.order !== 'undefined' ? period.order : i }));
};

export const getTimetableDisplayPeriods = <T extends PeriodLike>(periods: T[] = []) => {
  return normalizePeriodSettings(periods).filter(period => !isHomeroomPeriod(period));
};

export const getScheduleDocId = (teacherId: string, academicYear: string, semester: string) => {
  return `${teacherId}__${academicYear || 'unknown'}__${semester || '1'}`;
};

export const isCanonicalScheduleDoc = (docId: string, teacherId: string, academicYear: string, semester: string) => {
  return docId === getScheduleDocId(teacherId, academicYear, semester);
};

const LEVEL_ALIASES: Record<string, string> = {
  k1: 'k1',
  k2: 'k2',
  k3: 'k3',
  p1: 'p1',
  p2: 'p2',
  p3: 'p3',
  p4: 'p4',
  p5: 'p5',
  p6: 'p6',
  m1: 'm1',
  m2: 'm2',
  m3: 'm3',
  m4: 'm4',
  m5: 'm5',
  m6: 'm6',
  'อ.1': 'k1',
  'อ.2': 'k2',
  'อ.3': 'k3',
  'อนุบาลปีที่1': 'k1',
  'อนุบาลปีที่2': 'k2',
  'อนุบาลปีที่3': 'k3',
  'ป.1': 'p1',
  'ป.2': 'p2',
  'ป.3': 'p3',
  'ป.4': 'p4',
  'ป.5': 'p5',
  'ป.6': 'p6',
  'ประถมศึกษาปีที่1': 'p1',
  'ประถมศึกษาปีที่2': 'p2',
  'ประถมศึกษาปีที่3': 'p3',
  'ประถมศึกษาปีที่4': 'p4',
  'ประถมศึกษาปีที่5': 'p5',
  'ประถมศึกษาปีที่6': 'p6',
  'ม.1': 'm1',
  'ม.2': 'm2',
  'ม.3': 'm3',
  'ม.4': 'm4',
  'ม.5': 'm5',
  'ม.6': 'm6',
  'มัธยมศึกษาปีที่1': 'm1',
  'มัธยมศึกษาปีที่2': 'm2',
  'มัธยมศึกษาปีที่3': 'm3',
  'มัธยมศึกษาปีที่4': 'm4',
  'มัธยมศึกษาปีที่5': 'm5',
  'มัธยมศึกษาปีที่6': 'm6',
};

export const normalizeClassLevel = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '');
  const level = compact.split('/')[0];
  return LEVEL_ALIASES[level] || LEVEL_ALIASES[compact] || level.toLowerCase();
};

export const parseClassRoom = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return { level: '', room: '' };
  const compact = raw.replace(/\s+/g, '');
  const [levelPart, roomPart = ''] = compact.split('/');
  return {
    level: normalizeClassLevel(levelPart),
    room: roomPart,
  };
};

export const classMatchesSelection = (value: unknown, selectedClass: string, selectedRoom?: string) => {
  const parsed = parseClassRoom(value);
  if (!parsed.level || parsed.level !== normalizeClassLevel(selectedClass)) return false;
  return !selectedRoom || selectedRoom === 'all' || !parsed.room || parsed.room === selectedRoom;
};

export const getRoomsForClass = (values: unknown[], selectedClass: string) => {
  const rooms = new Set<string>();
  values.forEach(value => {
    const parsed = parseClassRoom(value);
    if (parsed.level === normalizeClassLevel(selectedClass)) {
      rooms.add(parsed.room || 'all');
    }
  });
  return rooms;
};
