import React from 'react';
import { getEffectivePeriodEnd, getScheduleSlotCandidates, getTimetableDisplayPeriods, NormalizedPeriod, PeriodLike } from '@/utils/scheduleDisplayUtils';

interface ScheduleCourseEntry {
  id?: string;
  title?: string;
  courseName?: string;
  subjectName?: string;
  code?: string;
  courseCode?: string;
  subjectCode?: string;
  groupNumber?: number;
  teacherPeriodLabel?: string;
}

interface ScheduleEntry {
  course?: ScheduleCourseEntry;
  classId?: string | string[];
  teacherName?: string;
  className?: string;
  roomCode?: string;
  roomDisplay?: string;
}

interface SpecialPeriodLike {
  id?: string;
  day?: string;
  linkedPeriodId?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  description?: string;
}

interface ClubLike {
  responsibleTeacherIds?: string[];
  scheduleSlot?: string;
  clubName?: string;
}

type DayCell =
  | { type: 'lunch'; period: NormalizedPeriod; colSpan: number }
  | { type: 'special'; special: SpecialPeriodLike; period: NormalizedPeriod; colSpan: number }
  | { type: 'club'; club: ClubLike; period: NormalizedPeriod; colSpan: number }
  | { type: 'empty'; period: NormalizedPeriod; colSpan: number }
  | { type: 'course'; entry: ScheduleEntry; period: NormalizedPeriod; colSpan: number };

const DAYS: Record<string, string> = {
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัสบดี',
  fri: 'ศุกร์',
};

const DAY_SHORT_LABELS: Record<string, string> = {
  mon: 'จ',
  tue: 'อ',
  wed: 'พ',
  thu: 'พฤ',
  fri: 'ศ',
};

const DAY_BORDER_CLASSES: Record<string, string> = {
  mon: 'border-l-4 border-l-[#eedc32] bg-yellow-50/5 dark:bg-yellow-950/5',
  tue: 'border-l-4 border-l-[#ea77bb] bg-pink-50/5 dark:bg-pink-950/5',
  wed: 'border-l-4 border-l-[#4fb56a] bg-green-50/5 dark:bg-green-950/5',
  thu: 'border-l-4 border-l-[#f47c24] bg-orange-50/5 dark:bg-orange-950/5',
  fri: 'border-l-4 border-l-[#4e9beb] bg-sky-50/5 dark:bg-sky-950/5',
};

const DAY_LABEL_CLASSES: Record<string, string> = {
  mon: 'bg-yellow-500 text-white',
  tue: 'bg-pink-500 text-white',
  wed: 'bg-green-500 text-white',
  thu: 'bg-orange-500 text-white',
  fri: 'bg-sky-500 text-white',
};

interface PersonalScheduleTableProps {
  schedule: Record<string, ScheduleEntry>;
  periodSettings: PeriodLike[];
  specialPeriods?: SpecialPeriodLike[];
  clubs?: ClubLike[];
  viewerId?: string;
  mode: 'teacher' | 'student';
}

const getCourseTitle = (course?: ScheduleCourseEntry) => course?.title || course?.courseName || course?.subjectName || 'วิชาไม่ระบุชื่อ';
const getCourseCode = (course?: ScheduleCourseEntry) => course?.code || course?.courseCode || course?.subjectCode || '';
const stripGroupLabel = (value: string = '') => value.replace(/\s*\(กลุ่ม\s*\d+\)/g, '').trim();
const getCompactPeriodLabel = (period: NormalizedPeriod) => {
  if (period?.id === 'lunch') return 'พัก';
  const periodNumber = String(period?.id || '').match(/^period-(\d+)$/)?.[1];
  return periodNumber ? `ค.${periodNumber}` : period?.label;
};

const getCourseColors = (code: string) => {
  const colors = [
    { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-300', border: 'border-t-indigo-100 border-b-indigo-100 dark:border-t-indigo-900/50 dark:border-b-indigo-900/50' },
    { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-800 dark:text-teal-300', border: 'border-t-teal-100 border-b-teal-100 dark:border-t-teal-900/50 dark:border-b-teal-900/50' },
    { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-800 dark:text-violet-300', border: 'border-t-violet-100 border-b-violet-100 dark:border-t-violet-900/50 dark:border-b-violet-900/50' },
    { bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-800 dark:text-sky-300', border: 'border-t-sky-100 border-b-sky-100 dark:border-t-sky-900/50 dark:border-b-sky-900/50' },
    { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-800 dark:text-rose-300', border: 'border-t-rose-100 border-b-rose-100 dark:border-t-rose-900/50 dark:border-b-rose-900/50' },
    { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300', border: 'border-t-amber-100 border-b-amber-100 dark:border-t-amber-900/50 dark:border-b-amber-900/50' },
    { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', text: 'text-fuchsia-800 dark:text-fuchsia-300', border: 'border-t-fuchsia-100 border-b-fuchsia-100 dark:border-t-fuchsia-900/50 dark:border-b-fuchsia-900/50' },
  ];

  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getSpecialPeriod = (specialPeriods: SpecialPeriodLike[], dayKey: string, period: NormalizedPeriod) => {
  return specialPeriods.find(sp => {
    const dayMatches = !sp.day || sp.day === dayKey || sp.day === 'all';
    const linkedMatches = sp.linkedPeriodId === period.id || (!String(period.id).startsWith('period') && sp.id === period.id);
    const timeMatches = sp.startTime === period.startTime && sp.endTime === period.endTime;
    return dayMatches && (linkedMatches || timeMatches);
  });
};

const getEntryMeta = (entry: ScheduleEntry | undefined, mode: 'teacher' | 'student') => {
  if (!entry) return '';
  if (mode === 'student') return entry.teacherName || '';
  return stripGroupLabel(entry.className || '');
};

const getEntryRoom = (entry: ScheduleEntry | undefined, mode: 'teacher' | 'student') => {
  if (!entry) return '';
  return mode === 'student' ? entry.roomCode : entry.roomDisplay;
};

const getTeacherPeriodLabel = (entry: ScheduleEntry | undefined, mode: 'teacher' | 'student') => {
  if (mode !== 'teacher') return '';
  return entry?.course?.teacherPeriodLabel || '';
};

const isSameCourseEntry = (a: ScheduleEntry | undefined, b: ScheduleEntry | undefined, mode: 'teacher' | 'student') => {
  if (!a || !b) return false;
  const aCourse = a.course || {};
  const bCourse = b.course || {};
  return (
    (aCourse.id || getCourseTitle(aCourse)) === (bCourse.id || getCourseTitle(bCourse)) &&
    Number(aCourse.groupNumber || 1) === Number(bCourse.groupNumber || 1) &&
    getEntryMeta(a, mode) === getEntryMeta(b, mode) &&
    getTeacherPeriodLabel(a, mode) === getTeacherPeriodLabel(b, mode)
  );
};

const PersonalScheduleTable: React.FC<PersonalScheduleTableProps> = ({
  schedule,
  periodSettings,
  specialPeriods = [],
  clubs = [],
  viewerId,
  mode,
}) => {
  const displayPeriods = React.useMemo(() => getTimetableDisplayPeriods(periodSettings), [periodSettings]);

  const getScheduleEntryForPeriod = (dayKey: string, period: NormalizedPeriod, periodIndex: number) => {
    const candidates = getScheduleSlotCandidates(dayKey, period, periodIndex);
    const slotKey = candidates.find(key => schedule[key]);
    return {
      slotKey: slotKey || candidates[0] || `${dayKey}-${periodIndex}`,
      entry: slotKey ? schedule[slotKey] : undefined,
    };
  };

  const getDayCells = (dayKey: string) => {
    const cells: DayCell[] = [];
    let i = 0;

    while (i < displayPeriods.length) {
      const period = displayPeriods[i];

      if (period.id === 'lunch') {
        cells.push({ type: 'lunch', period, colSpan: 1 });
        i++;
        continue;
      }

      const { slotKey, entry } = getScheduleEntryForPeriod(dayKey, period, i);
      const special = getSpecialPeriod(specialPeriods, dayKey, period);
      const club = mode === 'teacher'
        ? clubs.find(c => Boolean(viewerId) && c.responsibleTeacherIds?.includes(viewerId as string) && c.scheduleSlot === slotKey)
        : null;

      if (special) {
        cells.push({ type: 'special', special, period, colSpan: 1 });
        i++;
        continue;
      }

      if (club) {
        cells.push({ type: 'club', club, period, colSpan: 1 });
        i++;
        continue;
      }

      if (!entry) {
        cells.push({ type: 'empty', period, colSpan: 1 });
        i++;
        continue;
      }

      let colSpan = 1;
      let nextIndex = i + 1;
      while (nextIndex < displayPeriods.length) {
        const nextPeriod = displayPeriods[nextIndex];
        if (nextPeriod.id === 'lunch') break;

        const { slotKey: nextSlotKey, entry: nextEntry } = getScheduleEntryForPeriod(dayKey, nextPeriod, nextIndex);
        const nextSpecial = getSpecialPeriod(specialPeriods, dayKey, nextPeriod);
        const nextClub = mode === 'teacher'
          ? clubs.find(c => Boolean(viewerId) && c.responsibleTeacherIds?.includes(viewerId as string) && c.scheduleSlot === nextSlotKey)
          : null;

        if (nextSpecial || nextClub || !isSameCourseEntry(entry, nextEntry, mode)) break;
        colSpan++;
        nextIndex++;
      }

      cells.push({ type: 'course', entry, period, colSpan });
      i += colSpan;
    }

    return cells;
  };

  return (
    <div className="w-full overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#1a1b1e] shadow-sm">
      <table className="w-full table-fixed border-collapse text-[7px] min-[420px]:text-[8px] sm:text-[10px] md:text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-[#202125]/50 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
            <th className="p-0.5 sm:p-1.5 text-center font-bold border-r border-gray-200 dark:border-gray-700 leading-tight" style={{ width: '7%' }}>
              <span className="block sm:hidden">วัน</span>
              <span className="hidden sm:block">วัน / คาบ</span>
            </th>
            {displayPeriods.map((period, index) => {
              const isLunch = period.id === 'lunch';
              const teachingCount = Math.max(1, displayPeriods.filter(p => p.id !== 'lunch').length);
              const width = isLunch ? '5%' : `${88 / teachingCount}%`;
              const effectiveEnd = getEffectivePeriodEnd(displayPeriods, period, index);
              return (
                <th key={period.id} className="p-0.5 sm:p-1 text-center font-bold border-r last:border-none border-gray-200 dark:border-gray-700 leading-tight" style={{ width }}>
                  <div className="font-semibold text-[6px] min-[420px]:text-[7px] sm:text-[10px] truncate">
                    <span className="sm:hidden">{getCompactPeriodLabel(period)}</span>
                    <span className="hidden sm:inline">{isLunch ? 'พัก' : period.label}</span>
                  </div>
                  <div className="text-[5px] min-[420px]:text-[6px] sm:text-[8px] text-gray-400 dark:text-gray-500 font-normal mt-0.5 leading-tight break-words">
                    {period.startTime} - {effectiveEnd}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Object.entries(DAYS).map(([dayKey, dayName]) => {
            const cells = getDayCells(dayKey);

            return (
              <tr key={dayKey} className="h-14 min-[420px]:h-16 sm:h-20 landscape:h-16 md:landscape:h-20 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                <td className={`p-0.5 sm:p-1.5 font-bold border-r border-gray-200 dark:border-gray-700 text-center align-middle bg-white dark:bg-[#1a1b1e] ${DAY_BORDER_CLASSES[dayKey] || ''}`}>
                  <span className={`inline-flex items-center justify-center px-1 min-[420px]:px-1.5 sm:px-2 py-0.5 rounded-md text-[7px] min-[420px]:text-[8px] sm:text-[10px] font-bold shadow-sm ${DAY_LABEL_CLASSES[dayKey] || 'bg-gray-500 text-white'}`}>
                    {DAY_SHORT_LABELS[dayKey] || dayName.substring(0, 1)}
                  </span>
                </td>

                {cells.map((cell, idx) => {
                  if (cell.type === 'lunch') {
                    return (
                      <td key={`lunch-${dayKey}`} className="border-r last:border-none border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/20 text-gray-400 dark:text-gray-500 font-bold select-none p-0.5 sm:p-1 text-center align-middle" colSpan={cell.colSpan}>
                        <div className="flex h-full min-h-[52px] min-[420px]:min-h-[60px] sm:min-h-[72px] landscape:min-h-[60px] md:landscape:min-h-[72px] flex-col items-center justify-center gap-0.5 text-[5px] min-[420px]:text-[6px] sm:text-[8px] leading-none font-bold select-none opacity-75">
                          <span className="whitespace-nowrap">พัก</span>
                          <span className="hidden min-[420px]:inline whitespace-nowrap">กลางวัน</span>
                        </div>
                      </td>
                    );
                  }

                  if (cell.type === 'empty') {
                    return (
                      <td key={`empty-${dayKey}-${idx}`} className="border-r last:border-none border-gray-200 dark:border-gray-700 bg-gray-50/20 dark:bg-[#202125]/10 text-gray-300 dark:text-gray-700 text-center align-middle p-0.5 sm:p-1" colSpan={cell.colSpan}>
                        <span className="text-[6px] sm:text-[9px] select-none font-medium opacity-35">-</span>
                      </td>
                    );
                  }

                  if (cell.type === 'special') {
                    return (
                      <td key={`special-${dayKey}-${idx}`} className="border-r last:border-none border-r-gray-200 dark:border-r-gray-700 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-center align-middle p-0.5 sm:p-1 border-t border-b border-t-emerald-100 border-b-emerald-100 dark:border-t-emerald-900/50 dark:border-b-emerald-900/50" colSpan={cell.colSpan}>
                        <div className="flex min-h-[52px] min-[420px]:min-h-[60px] sm:min-h-[72px] landscape:min-h-[60px] md:landscape:min-h-[72px] flex-col items-center justify-center">
                          <div className="font-bold text-[6px] min-[420px]:text-[7px] sm:text-[9px] leading-tight truncate">{cell.special.title}</div>
                          {cell.special.description && (
                            <div className="text-[5px] sm:text-[7px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">{cell.special.description}</div>
                          )}
                        </div>
                      </td>
                    );
                  }

                  if (cell.type === 'club') {
                    return (
                      <td key={`club-${dayKey}-${idx}`} className="border-r last:border-none border-r-gray-200 dark:border-r-gray-700 bg-teal-50 dark:bg-teal-950/20 text-teal-800 dark:text-teal-300 text-center align-middle p-0.5 sm:p-1 border-t border-b border-t-teal-100 border-b-teal-100 dark:border-t-teal-900/50 dark:border-b-teal-900/50" colSpan={cell.colSpan}>
                        <div className="flex min-h-[52px] min-[420px]:min-h-[60px] sm:min-h-[72px] landscape:min-h-[60px] md:landscape:min-h-[72px] flex-col items-center justify-center">
                          <div className="font-bold text-[6px] min-[420px]:text-[7px] sm:text-[9px] leading-tight truncate">{cell.club.clubName}</div>
                          <div className="text-[5px] min-[420px]:text-[6px] sm:text-[8px] text-teal-600 dark:text-teal-400 mt-0.5 truncate">กิจกรรมชุมนุม</div>
                        </div>
                      </td>
                    );
                  }

                  const courseTitle = getCourseTitle(cell.entry.course);
                  const courseCode = getCourseCode(cell.entry.course);
                  const meta = getEntryMeta(cell.entry, mode);
                  const room = getEntryRoom(cell.entry, mode);
                  const teacherPeriodLabel = getTeacherPeriodLabel(cell.entry, mode);
                  const colors = getCourseColors(courseCode);

                  return (
                    <td key={`course-${dayKey}-${idx}`} className={`border-r last:border-none border-r-gray-200 dark:border-r-gray-700 text-center align-middle p-0 cursor-default border-t border-b ${colors.bg} ${colors.text} ${colors.border}`} colSpan={cell.colSpan}>
                      <div className="flex min-h-[52px] min-[420px]:min-h-[60px] sm:min-h-[72px] landscape:min-h-[60px] md:landscape:min-h-[72px] flex-col items-center justify-center gap-0.5 px-0.5 min-[420px]:px-1 sm:px-1.5 py-1 sm:py-1.5">
                        {teacherPeriodLabel && (
                          <div className="mb-0.5 inline-flex max-w-full items-center justify-center rounded-full bg-white/70 dark:bg-black/20 px-1.5 py-0.5 text-[5px] min-[420px]:text-[6px] sm:text-[8px] font-black text-orange-600 dark:text-orange-300 ring-1 ring-orange-200/70 dark:ring-orange-800/50">
                            <span className="truncate">{teacherPeriodLabel}</span>
                          </div>
                        )}
                        <div className="max-w-full font-black text-[6px] min-[420px]:text-[7px] sm:text-[10px] md:text-[11px] leading-tight line-clamp-2" title={courseTitle}>
                          {courseTitle}
                        </div>
                        <div className="max-w-full text-[5px] min-[420px]:text-[6px] sm:text-[8px] font-semibold opacity-70 truncate">
                          {courseCode}
                        </div>
                        {meta && (
                          <div className="max-w-full text-[5px] min-[420px]:text-[6px] sm:text-[8px] font-bold text-gray-750 dark:text-gray-300 truncate">
                            {meta}
                          </div>
                        )}
                        {room && (
                          <div className="mt-0.5 inline-flex max-w-full items-center justify-center gap-0.5 sm:gap-1 rounded-full bg-white/55 dark:bg-black/15 px-1 sm:px-1.5 py-0.5 text-[5px] min-[420px]:text-[6px] sm:text-[8px] font-black text-emerald-600 dark:text-emerald-400">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-400"></span>
                            <span className="truncate">{room}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PersonalScheduleTable;
