import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, History, Calendar, ArrowRight, X } from 'lucide-react';
import { getEffectivePeriodEnd, getScheduleSlotCandidates, getTimetableDisplayPeriods, NormalizedPeriod, PeriodLike } from '@/utils/scheduleDisplayUtils';
import { getAttendanceRouteForScheduleCell, getAttendanceHistoryRouteForScheduleCell } from '@/utils/scheduleAttendanceUtils';
import { specialPeriodMatchesDay } from '@/utils/specialPeriodDay';

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
  rawClassId?: string | string[];
  classLevels?: string[];
  assignmentRoom?: string | number;
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
  academicYear?: string;
  semester?: string;
}

interface CellActionModalData {
  courseTitle: string;
  courseCode?: string;
  className?: string;
  room?: string;
  dayName: string;
  periodLabel: string;
  liveRoute: string;
  historyRoute: string | null;
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
    const dayMatches = specialPeriodMatchesDay(sp.day, dayKey);
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
  academicYear,
  semester,
}) => {
  const navigate = useNavigate();
  const [selectedCellForAction, setSelectedCellForAction] = React.useState<CellActionModalData | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCellForAction(null);
      }
    };
    if (selectedCellForAction) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCellForAction]);

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
                    const isInteractive = mode === 'teacher';
                    const attendanceRoute = isInteractive ? getAttendanceRouteForScheduleCell(cell, dayKey) : null;
                    return (
                      <td
                        key={`special-${dayKey}-${idx}`}
                        className={`border-r last:border-none border-r-gray-200 dark:border-r-gray-700 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-center align-middle p-0.5 sm:p-1 border-t border-b border-t-emerald-100 border-b-emerald-100 dark:border-t-emerald-900/50 dark:border-b-emerald-900/50 transition-all ${
                          attendanceRoute ? 'cursor-pointer hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 hover:shadow-sm active:scale-[0.99] group' : ''
                        }`}
                        colSpan={cell.colSpan}
                        onClick={attendanceRoute ? () => navigate(attendanceRoute) : undefined}
                        title={attendanceRoute ? `${cell.special.title} (คลิกเพื่อเข้าหน้าเช็คชื่อ)` : cell.special.title}
                      >
                        <div className="flex min-h-[52px] min-[420px]:min-h-[60px] sm:min-h-[72px] landscape:min-h-[60px] md:landscape:min-h-[72px] flex-col items-center justify-center">
                          <div className="font-bold text-[6px] min-[420px]:text-[7px] sm:text-[9px] leading-tight truncate">{cell.special.title}</div>
                          {cell.special.description && (
                            <div className="text-[5px] sm:text-[7px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">{cell.special.description}</div>
                          )}
                          {attendanceRoute && (
                            <div className="hidden group-hover:inline-flex items-center gap-0.5 text-[5px] min-[420px]:text-[6px] sm:text-[8px] font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                              <UserCheck size={9} />
                              <span>เช็คชื่อ</span>
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  }

                  if (cell.type === 'club') {
                    const isInteractive = mode === 'teacher';
                    const attendanceRoute = isInteractive ? getAttendanceRouteForScheduleCell(cell, dayKey) : null;
                    return (
                      <td
                        key={`club-${dayKey}-${idx}`}
                        className={`border-r last:border-none border-r-gray-200 dark:border-r-gray-700 bg-teal-50 dark:bg-teal-950/20 text-teal-800 dark:text-teal-300 text-center align-middle p-0.5 sm:p-1 border-t border-b border-t-teal-100 border-b-teal-100 dark:border-t-teal-900/50 dark:border-b-teal-900/50 transition-all ${
                          attendanceRoute ? 'cursor-pointer hover:bg-teal-100/80 dark:hover:bg-teal-900/40 hover:shadow-sm active:scale-[0.99] group' : ''
                        }`}
                        colSpan={cell.colSpan}
                        onClick={attendanceRoute ? () => navigate(attendanceRoute) : undefined}
                        title={attendanceRoute ? `${cell.club.clubName} (คลิกเพื่อเข้าหน้าเช็คชื่อ)` : cell.club.clubName}
                      >
                        <div className="flex min-h-[52px] min-[420px]:min-h-[60px] sm:min-h-[72px] landscape:min-h-[60px] md:landscape:min-h-[72px] flex-col items-center justify-center">
                          <div className="font-bold text-[6px] min-[420px]:text-[7px] sm:text-[9px] leading-tight truncate">{cell.club.clubName}</div>
                          <div className="text-[5px] min-[420px]:text-[6px] sm:text-[8px] text-teal-600 dark:text-teal-400 mt-0.5 truncate">กิจกรรมชุมนุม</div>
                          {attendanceRoute && (
                            <div className="hidden group-hover:inline-flex items-center gap-0.5 text-[5px] min-[420px]:text-[6px] sm:text-[8px] font-bold text-teal-700 dark:text-teal-300 mt-0.5">
                              <UserCheck size={9} />
                              <span>เช็คชื่อ</span>
                            </div>
                          )}
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
                  const isInteractive = mode === 'teacher';
                  const liveAttendanceRoute = isInteractive ? getAttendanceRouteForScheduleCell(cell, dayKey) : null;
                  const historyAttendanceRoute = isInteractive ? getAttendanceHistoryRouteForScheduleCell(cell, academicYear, semester, dayKey) : null;

                  const periodEndTime = getEffectivePeriodEnd(displayPeriods, cell.period, idx);
                  const periodFullLabel = cell.period.label
                    ? `${cell.period.label} (${cell.period.startTime} - ${periodEndTime})`
                    : `${cell.period.startTime} - ${periodEndTime}`;
                  const dayFullLabel = DAYS[dayKey] ? `วัน${DAYS[dayKey]}` : dayKey;

                  const handleCellClick = () => {
                    if (!liveAttendanceRoute) return;
                    if (historyAttendanceRoute) {
                      setSelectedCellForAction({
                        courseTitle,
                        courseCode,
                        className: meta,
                        room,
                        dayName: dayFullLabel,
                        periodLabel: periodFullLabel,
                        liveRoute: liveAttendanceRoute,
                        historyRoute: historyAttendanceRoute,
                      });
                    } else {
                      navigate(liveAttendanceRoute);
                    }
                  };

                  return (
                    <td
                      key={`course-${dayKey}-${idx}`}
                      className={`border-r last:border-none border-r-gray-200 dark:border-r-gray-700 text-center align-middle p-0 border-t border-b ${colors.bg} ${colors.text} ${colors.border} transition-all relative ${
                        liveAttendanceRoute ? 'cursor-pointer hover:brightness-95 hover:shadow-md active:scale-[0.99] group' : 'cursor-default'
                      }`}
                      colSpan={cell.colSpan}
                      onClick={liveAttendanceRoute ? handleCellClick : undefined}
                      title={liveAttendanceRoute ? (historyAttendanceRoute ? `${courseTitle} (คลิกเพื่อเลือกเช็คชื่อ หรือเช็คชื่อย้อนหลัง)` : `${courseTitle} (คลิกเพื่อเข้าหน้าเช็คชื่อ)`) : courseTitle}
                    >
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
                        {isInteractive && liveAttendanceRoute && (
                          <div className="hidden group-hover:flex flex-wrap items-center justify-center gap-1 mt-1 z-10 animate-in fade-in duration-150 max-w-full">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(liveAttendanceRoute);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold whitespace-nowrap shadow-xs transition-all hover:scale-105 active:scale-95 shrink-0"
                              title="เช็คชื่อคาบนี้ (สด)"
                            >
                              <UserCheck size={10} className="shrink-0" />
                              <span className="whitespace-nowrap">เช็คชื่อ</span>
                            </button>
                            {historyAttendanceRoute && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(historyAttendanceRoute);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-[9px] font-bold whitespace-nowrap shadow-xs transition-all hover:scale-105 active:scale-95 shrink-0"
                                title="เช็คชื่อย้อนหลัง (ประวัติ)"
                              >
                                <History size={10} className="shrink-0" />
                                <span className="whitespace-nowrap">ย้อนหลัง</span>
                              </button>
                            )}
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

      {/* Attendance Action Selection Modal */}
      {selectedCellForAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedCellForAction(null)}
        >
          <div
            className="relative w-full max-w-md bg-white dark:bg-[#1a1b1e] rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Decorative background glow */}
            <div className="absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-br from-indigo-500/15 to-purple-500/15 rounded-full blur-2xl pointer-events-none" />

            {/* Header */}
            <div className="relative flex items-start justify-between gap-3 mb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-2">
                  <Calendar size={13} />
                  <span>{selectedCellForAction.dayName} • {selectedCellForAction.periodLabel}</span>
                </div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white leading-snug">
                  {selectedCellForAction.courseTitle}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {selectedCellForAction.courseCode && (
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{selectedCellForAction.courseCode}</span>
                  )}
                  {selectedCellForAction.className && (
                    <>
                      <span>•</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedCellForAction.className}</span>
                    </>
                  )}
                  {selectedCellForAction.room && (
                    <>
                      <span>•</span>
                      <span>{selectedCellForAction.room}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedCellForAction(null)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="ปิด"
              >
                <X size={18} />
              </button>
            </div>

            {/* Action Choice Cards */}
            <div className="relative space-y-3">
              {/* Option 1: Live Attendance */}
              <button
                type="button"
                onClick={() => {
                  const route = selectedCellForAction.liveRoute;
                  setSelectedCellForAction(null);
                  navigate(route);
                }}
                className="w-full group p-4 rounded-2xl border-2 border-indigo-100 hover:border-indigo-500 dark:border-indigo-900/40 dark:hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-left transition-all flex items-center justify-between shadow-sm hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform shrink-0">
                    <UserCheck size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900 dark:text-white text-base">เช็คชื่อประจำวัน</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-200/80 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                        คาบนี้ (สด)
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      บันทึกเวลาเรียน ขาด ลา มาสาย ของคาบเรียนวันนี้
                    </p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-indigo-600 dark:text-indigo-400 transform group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              {/* Option 2: Historical Attendance */}
              {selectedCellForAction.historyRoute && (
                <button
                  type="button"
                  onClick={() => {
                    const route = selectedCellForAction.historyRoute!;
                    setSelectedCellForAction(null);
                    navigate(route);
                  }}
                  className="w-full group p-4 rounded-2xl border-2 border-purple-100 hover:border-purple-500 dark:border-purple-900/40 dark:hover:border-purple-500 bg-purple-50/40 hover:bg-purple-50 dark:bg-purple-950/20 dark:hover:bg-purple-950/40 text-left transition-all flex items-center justify-between shadow-sm hover:shadow-md active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform shrink-0">
                      <History size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-900 dark:text-white text-base">เช็คชื่อย้อนหลัง</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200/80 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                          ประวัติทั้งเทอม
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        ตรวจสอบและแก้ไขประวัติการเข้าเรียนรายเดือน / ปพ.5
                      </p>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-purple-600 dark:text-purple-400 transform group-hover:translate-x-1 transition-transform shrink-0" />
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="relative mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCellForAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalScheduleTable;
