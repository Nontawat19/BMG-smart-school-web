import { parseClassRoom } from '@/utils/scheduleDisplayUtils';

/**
 * Utility functions for navigating from schedule timetable to attendance pages
 */

const DAY_INDEX_MAP: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

/**
 * Calculates the YYYY-MM-DD date string of a given weekday in the current week.
 * Week starts on Monday (1) and ends on Sunday (7).
 */
export const getWeekDateForDay = (dayKey: string, baseDate: Date = new Date()): string => {
  const normalizedDay = dayKey.toLowerCase().trim();
  const targetDayNum = DAY_INDEX_MAP[normalizedDay];

  if (!targetDayNum) {
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    const day = String(baseDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Current day: 0 (Sun) -> 7, 1 (Mon) -> 1, ..., 6 (Sat) -> 6
  const currentDayOfWeek = baseDate.getDay() === 0 ? 7 : baseDate.getDay();
  const diffDays = targetDayNum - currentDayOfWeek;

  const targetDate = new Date(baseDate);
  targetDate.setDate(baseDate.getDate() + diffDays);

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface RouteTargetCell {
  type: 'course' | 'club' | 'special';
  entry?: any;
  club?: any;
  special?: any;
  period?: any;
}

/**
 * Determines the target attendance route and query parameters for a schedule cell.
 */
export const getAttendanceRouteForScheduleCell = (
  cell: RouteTargetCell,
  dayKey: string,
  baseDate: Date = new Date()
): string | null => {
  const targetDate = getWeekDateForDay(dayKey, baseDate);

  if (cell.type === 'club' && cell.club) {
    const clubId = cell.club.id || cell.club.clubId || '';
    return clubId
      ? `/academic/club-attendance?clubId=${encodeURIComponent(clubId)}&date=${targetDate}`
      : `/academic/club-attendance?date=${targetDate}`;
  }

  if (cell.type === 'special' && cell.special) {
    const title = String(cell.special.title || '').toLowerCase();

    if (title.includes('โฮมรูม') || title.includes('โฮมรู') || title.includes('homeroom') || title.includes('โอมรูม')) {
      return `/academic/homeroom-attendance?date=${targetDate}`;
    }
    if (title.includes('แนะแนว') || title.includes('guidance')) {
      return `/academic/guidance-attendance?date=${targetDate}`;
    }
    if (title.includes('ชุมนุม') || title.includes('club')) {
      return `/academic/club-attendance?date=${targetDate}`;
    }
    if (title.includes('เข้าแถว') || title.includes('flag')) {
      return `/academic/flag-ceremony?date=${targetDate}`;
    }

    const periodId = cell.special.id || '';
    return periodId
      ? `/academic/special-period-attendance?periodId=${encodeURIComponent(periodId)}&date=${targetDate}`
      : `/academic/special-period-attendance?date=${targetDate}`;
  }

  if (cell.type === 'course' && cell.entry) {
    const course = cell.entry.course || {};
    const title = String(course.title || course.courseName || course.subjectName || '').toLowerCase();
    const code = String(course.code || course.courseCode || course.subjectCode || '').toLowerCase();

    // Check if course itself is a special activity mapped as regular course
    if (title.includes('โฮมรูม') || title.includes('โฮมรู') || title.includes('homeroom')) {
      return `/academic/homeroom-attendance?date=${targetDate}`;
    }
    if (title.includes('แนะแนว') || title.includes('guidance')) {
      return `/academic/guidance-attendance?date=${targetDate}`;
    }
    if (title.includes('ชุมนุม') || title.includes('club')) {
      return `/academic/club-attendance?date=${targetDate}`;
    }

    // Standard classroom attendance
    const courseId = course.id || course.courseId || course.code || course.courseCode || '';
    const groupNumber = course.groupNumber || 1;
    const periodId = String(cell.period?.id || '');
    const periodMatch = periodId.match(/^period-(\d+)$/);
    const periodNumber = periodMatch ? periodMatch[1] : '';

    const params = new URLSearchParams();
    params.set('date', targetDate);
    if (courseId) params.set('courseId', courseId);
    if (periodNumber) params.set('period', periodNumber);
    if (groupNumber) params.set('groupNumber', String(groupNumber));

    return `/academic/classroom-attendance?${params.toString()}`;
  }

  return null;
};

/**
 * Determines the historical attendance route and query parameters for a schedule cell.
 * Destination: /academic/classroom-attendance-history
 */
export const getAttendanceHistoryRouteForScheduleCell = (
  cell: RouteTargetCell,
  academicYear?: string,
  semester?: string,
  dayKey?: string
): string | null => {
  if (cell.type !== 'course' || !cell.entry) return null;

  const course = cell.entry.course || {};
  const title = String(course.title || course.courseName || course.subjectName || '').toLowerCase();

  // If this is a special activity like homeroom, club, guidance, flag ceremony, it doesn't use course history page
  if (
    title.includes('โฮมรูม') ||
    title.includes('โฮมรู') ||
    title.includes('homeroom') ||
    title.includes('แนะแนว') ||
    title.includes('guidance') ||
    title.includes('ชุมนุม') ||
    title.includes('club') ||
    title.includes('เข้าแถว')
  ) {
    return null;
  }

  const courseId = course.id || course.courseId || course.code || course.courseCode || '';
  if (!courseId) return null;

  // Extract class level and room
  const rawClassName = String(cell.entry.className || '').trim();
  const firstClassSegment = rawClassName.split(/[,+]/)[0]?.trim() || rawClassName;
  const parsedFromClassName = parseClassRoom(firstClassSegment);

  let classLevel = parsedFromClassName.level;
  let roomNumber = parsedFromClassName.room;

  // Fallback to rawClassId or classLevels if level not found
  if (!classLevel) {
    const rawClassId = cell.entry.rawClassId || (Array.isArray(cell.entry.classLevels) ? cell.entry.classLevels[0] : cell.entry.classLevels);
    if (rawClassId) {
      const parsed = parseClassRoom(rawClassId);
      classLevel = parsed.level;
      if (!roomNumber && parsed.room) roomNumber = parsed.room;
    }
  }

  // Fallback to course.classId
  if (!classLevel && course.classId) {
    const parsed = parseClassRoom(Array.isArray(course.classId) ? course.classId[0] : course.classId);
    classLevel = parsed.level;
    if (!roomNumber && parsed.room) roomNumber = parsed.room;
  }

  // If room wasn't in class text (e.g. "ม.5"), check if there's assignmentRoom or roomDisplay
  if (!roomNumber) {
    const rawRoom = cell.entry.assignmentRoom || course.room || '';
    if (typeof rawRoom === 'string' && /^\d+$/.test(rawRoom.trim())) {
      roomNumber = rawRoom.trim();
    } else if (typeof rawRoom === 'number') {
      roomNumber = String(rawRoom);
    }
  }

  const params = new URLSearchParams();
  if (classLevel) params.set('classId', classLevel);
  if (roomNumber) {
    params.set('room', roomNumber);
    params.set('roomNumber', roomNumber);
  }
  if (courseId) params.set('courseId', courseId);
  if (academicYear) params.set('year', academicYear);
  if (semester) params.set('semester', semester);
  if (dayKey) {
    const targetDate = getWeekDateForDay(dayKey);
    const targetMonth = new Date(targetDate).getMonth();
    params.set('month', String(targetMonth));
  }

  return `/academic/classroom-attendance-history?${params.toString()}`;
};

