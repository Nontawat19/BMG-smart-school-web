import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { classMatchesSelection, normalizePeriodSettings, getScheduleSlotCandidates } from '@/utils/scheduleDisplayUtils';
import { getScheduleDocId, matchesScheduleTerm, resolveScheduleTeacherId } from '../AcademicDepartment/schedule/scheduleSharedUtils';
import { Loader2, Calendar, Maximize2, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PeriodSetting {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
  isFixed?: boolean;
}

interface ScheduleCell {
  title: string;
  code?: string;
  teacherName: string;
}

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
  linkedPeriodId?: string;
  periodType?: 'recurring' | 'oneTime';
  eventDate?: string;
}

type Schedule = Record<string, ScheduleCell | null>;

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { key: 'mon', label: 'จันทร์',    color: 'bg-yellow-500' },
  { key: 'tue', label: 'อังคาร',    color: 'bg-pink-500' },
  { key: 'wed', label: 'พุธ',       color: 'bg-green-500' },
  { key: 'thu', label: 'พฤหัสบดี', color: 'bg-orange-500' },
  { key: 'fri', label: 'ศุกร์',     color: 'bg-blue-500' },
];

const DEFAULT_PERIODS: PeriodSetting[] = [
  { id: 'homeroom',  label: 'โฮมรูม',   startTime: '08:30', endTime: '08:40', isTeachingPeriod: false, isFixed: true },
  { id: 'period-1',  label: 'คาบ 1',    startTime: '08:40', endTime: '09:30', isTeachingPeriod: true },
  { id: 'period-2',  label: 'คาบ 2',    startTime: '09:30', endTime: '10:20', isTeachingPeriod: true },
  { id: 'period-3',  label: 'คาบ 3',    startTime: '10:20', endTime: '11:10', isTeachingPeriod: true },
  { id: 'period-4',  label: 'คาบ 4',    startTime: '11:10', endTime: '12:00', isTeachingPeriod: true },
  { id: 'lunch',     label: 'พักกลางวัน', startTime: '12:00', endTime: '13:00', isTeachingPeriod: false, isFixed: true },
  { id: 'period-5',  label: 'คาบ 5',    startTime: '13:00', endTime: '13:50', isTeachingPeriod: true },
  { id: 'period-6',  label: 'คาบ 6',    startTime: '13:50', endTime: '14:40', isTeachingPeriod: true },
  { id: 'period-7',  label: 'คาบ 7',    startTime: '14:40', endTime: '15:30', isTeachingPeriod: true },
  { id: 'period-8',  label: 'คาบ 8',    startTime: '15:30', endTime: '16:00', isTeachingPeriod: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : [v].filter(Boolean));

const shortName = (data: any): string => {
  if (!data) return '';
  const raw = data.firstName || data.name || '';
  const cleaned = raw.replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.|ผอ\.|ครู)\s*/u, '');
  const first = cleaned.trim().split(/\s+/)[0];
  return first ? `ครู${first}` : '';
};


// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  schoolId: string;
  classKey: string;    // e.g. "m3"
  room: string;        // e.g. "1"
  academicYear: string;
  currentTerm: string;
  className?: string;  // display name e.g. "ม.3"
}

// ─── Component ────────────────────────────────────────────────────────────────

const StudentScheduleEmbed: React.FC<Props> = ({
  schoolId, classKey, room, academicYear, currentTerm, className,
}) => {
  const [schedule, setSchedule]           = useState<Schedule>({});
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>(normalizePeriodSettings(DEFAULT_PERIODS) as any);
  const [isLoading, setIsLoading]         = useState(false);
  const [homeroomTeacher, setHomeroomTeacher] = useState('');
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [isFullscreen, setIsFullscreen]   = useState(false);

  // Fetch period settings (best-effort, no permissions required for school doc)
  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings'))
      .then(snap => {
        if (snap.exists() && snap.data().periods)
          setPeriodSettings(normalizePeriodSettings(snap.data().periods) as any);
      })
      .catch(() => {/* use defaults */});
  }, [schoolId]);

  const fetchSchedule = useCallback(async () => {
    if (!classKey || !schoolId || !academicYear || !currentTerm) return;

    setIsLoading(true);
    setSchedule({});

    try {
      // ── 1. Fetch all teachers (best-effort — student may not have access) ──
      let teacherNameMap: Record<string, string> = {};
      let homeroomName = '';
      try {
        const teachersSnap = await getDocs(
          collection(db, 'school-settings', schoolId, 'teachers')
        );
        const HOMEROOM_MAP: Record<string, string> = {
          k1:'อ.1',k2:'อ.2',k3:'อ.3',
          p1:'ป.1',p2:'ป.2',p3:'ป.3',p4:'ป.4',p5:'ป.5',p6:'ป.6',
          m1:'ม.1',m2:'ม.2',m3:'ม.3',m4:'ม.4',m5:'ม.5',m6:'ม.6',
        };
        const gradeLabel = HOMEROOM_MAP[classKey] || '';
        const targetHomeroomGrade = room ? `${gradeLabel}/${room}` : gradeLabel;

        teachersSnap.forEach(d => {
          const data = d.data();
          teacherNameMap[d.id] = shortName(data);
          if (data.homeroomGrade === targetHomeroomGrade ||
             (!homeroomName && data.homeroomGrade === gradeLabel)) {
            homeroomName = data.name || shortName(data);
          }
        });
      } catch {
        // student doesn't have teacher read permission — proceed without teacher names
      }
      setHomeroomTeacher(homeroomName);

      // ── 2b. Fetch special periods (best-effort) ──
      try {
        const spSnap = await getDocs(
          collection(db, 'school-settings', schoolId, 'special-periods')
        );
        const spData: SpecialPeriod[] = [];
        spSnap.forEach(d => spData.push({ id: d.id, ...d.data() } as SpecialPeriod));
        setSpecialPeriods(spData);
      } catch {
        // student may not have permission — display without special periods
      }

      // ── 4. Fetch schedules + course_assignments ──
      const [schedSnap, assignSnap] = await Promise.all([
        getDocs(collection(db, 'school-settings', schoolId, 'schedules')),
        getDocs(query(
          collection(db, 'school-settings', schoolId, 'course_assignments'),
          where('academicYear', '==', academicYear),
          where('semester',     '==', currentTerm),
        )),
      ]);

      const assignmentMap: Record<string, any> = {};
      assignSnap.forEach(d => {
        const data = d.data();
        if (data.courseId) assignmentMap[data.courseId] = data;
      });

      // ── 3. Resolve canonical schedule docs ──
      const knownTeacherIds = Object.keys(teacherNameMap);
      const allDocs = schedSnap.docs.map(d => ({ id: d.id, data: d.data() }));

      const matching = allDocs
        .map(({ id, data }) => {
          if (!matchesScheduleTerm(data, academicYear, currentTerm)) return null;
          const teacherId = resolveScheduleTeacherId(id, data.teacherId, knownTeacherIds);
          const canonicalId = getScheduleDocId(teacherId,
            String(data.academicYear || academicYear),
            String(data.semester    || currentTerm));
          return { id, data, teacherId, isCanonical: id === canonicalId || id.includes('__') };
        })
        .filter(Boolean) as Array<{ id: string; data: any; teacherId: string; isCanonical: boolean }>;

      const teachersWithCanonical = new Set(
        matching.filter(x => x.isCanonical).map(x => x.teacherId)
      );
      const canonicalDocs = matching.filter(
        x => x.isCanonical || !teachersWithCanonical.has(x.teacherId)
      );

      // ── 4. Build schedule grid ──
      const merged: Schedule = {};

      canonicalDocs.forEach(({ data, teacherId }) => {
        const classIds = asArray(data.classId);
        if (!classIds.some(id => classMatchesSelection(id, classKey))) return;

        const tName = teacherNameMap[teacherId] || '';
        const schedData = (data.schedule as Record<string, any>) || {};

        for (const slot in schedData) {
          const courseData = schedData[slot];
          if (!courseData) continue;
          const courses = Array.isArray(courseData) ? courseData : [courseData];

          courses.forEach((course: any) => {
            if (!course || course.isTemporarySchedule) return;

            const courseGroupNum = String(course.groupNumber || 1);
            const allAssignments = [
              ...(assignmentMap[course.id]?.teacherAssignments || []),
              ...(course.teacherAssignments || []),
            ];
            const relevantAssignments = allAssignments.length > 0
              ? allAssignments.filter((a: any) => String(a.groupNumber || 1) === courseGroupNum)
              : [];

            const classSources = [
              ...asArray(course.classId),
              ...relevantAssignments.flatMap((a: any) => asArray(a.classLevels)),
              ...(relevantAssignments.length === 0 ? classIds : []),
            ];

            const matchesRoom = !room || room === 'all'
              || classSources.some(s => classMatchesSelection(s, classKey, room));
            if (!matchesRoom) return;

            if (!merged[slot]) {
              merged[slot] = { title: course.title || course.code || '', code: course.code, teacherName: tName };
            } else if (tName && !merged[slot]!.teacherName.includes(tName)) {
              merged[slot]!.teacherName += tName ? `, ${tName}` : '';
            }
          });
        }
      });

      setSchedule(merged);
    } catch (err) {
      console.error('StudentScheduleEmbed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [classKey, room, schoolId, academicYear, currentTerm]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const enterFullscreen = () => {
    setIsFullscreen(true);
    document.body.style.overflow = 'hidden';
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
    document.body.style.overflow = '';
  };

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitFullscreen(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const displayPeriods = periodSettings.filter(
    p => p.isTeachingPeriod || p.id === 'lunch'
  );
  const hasData = Object.values(schedule).some(Boolean);

  const getSpecialForSlot = (dayKey: string, periodId: string, startTime: string, endTime: string): SpecialPeriod | undefined => {
    return specialPeriods.find(sp => {
      if (sp.periodType === 'oneTime') return false;
      const dayMatch = !sp.day || sp.day === 'all' || sp.day === dayKey;
      if (!dayMatch) return false;
      if (sp.linkedPeriodId && sp.linkedPeriodId === periodId) return true;
      const spStart = sp.startTime?.replace('.', ':');
      const spEnd = sp.endTime?.replace('.', ':');
      return spStart === startTime && spEnd === endTime;
    });
  };

  const formatTeacher = (name: string) => {
    if (!name) return '';
    const parts = name.split(', ').filter(Boolean);
    if (parts.length <= 1) return name;
    return `${parts[0]} +${parts.length - 1}`;
  };

  const todayDayIdx = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const dayKeyMap: Record<number, string> = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' };
  const todayKey = dayKeyMap[todayDayIdx] ?? null;
  const todayDayInfo = DAYS.find(d => d.key === todayKey);

  // Soft color palette cycling per subject code
  const CELL_COLORS = [
    'border-l-indigo-400',
    'border-l-emerald-400',
    'border-l-rose-400',
    'border-l-amber-400',
    'border-l-sky-400',
    'border-l-violet-400',
    'border-l-teal-400',
    'border-l-orange-400',
  ];
  const codeColorMap: Record<string, string> = {};
  let colorIdx = 0;
  const getCellColor = (code?: string) => {
    const key = code || 'default';
    if (!codeColorMap[key]) {
      codeColorMap[key] = CELL_COLORS[colorIdx % CELL_COLORS.length];
      colorIdx++;
    }
    return codeColorMap[key];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-indigo-500 mr-3" size={22} />
        <span className="text-gray-500 dark:text-gray-400 text-sm">กำลังโหลดตารางเรียน...</span>
      </div>
    );
  }

  const renderTable = (fullscreen = false) => (
    <div className={fullscreen ? 'h-full overflow-auto' : 'overflow-x-auto -mx-1'}>
      <table
        className="border-collapse text-xs"
        style={{ tableLayout: 'fixed', minWidth: fullscreen ? '900px' : '780px', width: '100%' }}
      >
        <colgroup>
          <col style={{ width: fullscreen ? '60px' : '52px' }} />
          {displayPeriods.map(p => (
            p.id === 'homeroom' || p.id === 'lunch'
              ? <col key={p.id} style={{ width: '44px' }} />
              : <col key={p.id} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-gray-50 dark:bg-[#1a1b1f]">
            <th className="py-2 px-2 text-left text-[10px] text-gray-400 dark:text-gray-500 font-medium border-b border-gray-200 dark:border-gray-700 sticky left-0 bg-gray-50 dark:bg-[#1a1b1f] z-10">
              วัน
            </th>
            {displayPeriods.map(p => {
              const isBreak = p.id === 'lunch' || p.id === 'homeroom';
              return (
                <th
                  key={p.id}
                  className={`py-2 px-1 text-center border-b border-l border-gray-200 dark:border-gray-700 ${
                    isBreak ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {isBreak ? (
                    <span className="text-[10px] leading-none block">🍽</span>
                  ) : (
                    <>
                      <div className="font-semibold text-[11px] leading-none text-gray-700 dark:text-gray-200">
                        {p.label.replace('คาบ ', '')}
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-gray-500 font-normal mt-0.5">{p.startTime}</div>
                    </>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {DAYS.map(({ key: dayKey, label: dayLabel, color }) => (
            <tr key={dayKey}>
              <td className="py-2 px-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1b1f] align-middle text-center sticky left-0 z-10">
                <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-bold ${color} mx-auto mb-0.5`}>
                  {dayLabel[0]}
                </div>
                <div className="text-[9px] text-gray-400 dark:text-gray-500 leading-none">{dayLabel}</div>
              </td>
              {displayPeriods.map((p, pIdx) => {
                const slot = getScheduleSlotCandidates(dayKey, p, pIdx).find(k => schedule[k]) ?? `${dayKey}-${(p as any).index ?? pIdx}`;
                const cell = schedule[slot];
                const isBreak = p.id === 'lunch' || p.id === 'homeroom';
                const special = !cell && !isBreak ? getSpecialForSlot(dayKey, p.id, p.startTime, p.endTime) : undefined;
                const accentColor = cell ? getCellColor(cell.code) : '';
                const cellH = fullscreen ? 'min-h-[80px]' : 'min-h-[68px]';

                return (
                  <td
                    key={p.id}
                    className={`border-b border-l border-gray-200 dark:border-gray-700 align-top p-0 ${
                      isBreak ? 'bg-gray-50/80 dark:bg-[#1a1b1f]' : ''
                    }`}
                  >
                    {isBreak ? (
                      <div className={`h-full ${cellH} flex flex-col items-center justify-center gap-1 py-2`}>
                        <span className="text-sm">🍽</span>
                        <span className="text-[8px] text-gray-300 dark:text-gray-600 leading-none">พัก</span>
                      </div>
                    ) : cell ? (
                      <div className={`h-full ${cellH} flex flex-col p-1.5 border-l-2 ${accentColor} bg-white dark:bg-[#1e1f26]`}>
                        <div className={`font-medium leading-tight text-gray-800 dark:text-gray-100 line-clamp-2 flex-1 ${fullscreen ? 'text-[12px]' : 'text-[11px]'}`}>
                          {cell.title}
                        </div>
                        {cell.code && (
                          <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{cell.code}</div>
                        )}
                        {cell.teacherName && (
                          <div className="text-[9px] text-indigo-500 dark:text-indigo-400 mt-0.5 truncate">
                            {formatTeacher(cell.teacherName)}
                          </div>
                        )}
                      </div>
                    ) : special ? (
                      <div className={`h-full ${cellH} flex flex-col p-1.5 border-l-2 border-l-purple-400 bg-purple-50/60 dark:bg-purple-900/10`}>
                        <div className={`font-medium leading-tight text-purple-700 dark:text-purple-300 line-clamp-2 flex-1 ${fullscreen ? 'text-[12px]' : 'text-[11px]'}`}>
                          {special.title}
                        </div>
                        <div className="text-[9px] text-purple-400 dark:text-purple-500 mt-0.5">กิจกรรม</div>
                      </div>
                    ) : (
                      <div className={cellH} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const titleText = `ตารางเรียน ${className ?? ''}${room ? `/${room}` : ''} · ปีการศึกษา ${academicYear} ภาคเรียนที่ ${currentTerm}`;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 min-w-0">
            <Calendar size={15} className="shrink-0" />
            <span className="font-semibold text-sm truncate">{titleText}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {homeroomTeacher && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                <span className="hidden sm:inline">ครูที่ปรึกษา: </span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{homeroomTeacher}</span>
              </div>
            )}
            {hasData && (
              <button
                onClick={enterFullscreen}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 transition-colors"
              >
                <Maximize2 size={13} />
                <span className="hidden xs:inline">เต็มจอ</span>
              </button>
            )}
          </div>
        </div>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-3">
              <Calendar className="text-indigo-400" size={28} />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">ยังไม่มีข้อมูลตารางเรียน</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {className}{room ? `/${room}` : ''} · ภาคเรียนที่ {currentTerm}/{academicYear}
            </p>
          </div>
        ) : (
          <>
            {/* ─── Today's schedule highlight ─── */}
            <div className="rounded-xl border border-indigo-100 dark:border-indigo-800/30 bg-indigo-50/50 dark:bg-indigo-900/10 p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">วันนี้เรียนอะไรบ้าง</span>
                {todayDayInfo ? (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${todayDayInfo.color}`}>
                    {todayDayInfo.label}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-400 text-white">หยุด</span>
                )}
              </div>
              {!todayKey ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">วันหยุดสุดสัปดาห์ ไม่มีคาบเรียน</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {displayPeriods.map((p, pIdx) => {
                    if (!p.isTeachingPeriod) return null;
                    const slot = getScheduleSlotCandidates(todayKey, p, pIdx).find(k => schedule[k])
                      ?? `${todayKey}-${(p as any).index ?? pIdx}`;
                    const cell = schedule[slot];
                    const special = !cell ? getSpecialForSlot(todayKey, p.id, p.startTime, p.endTime) : undefined;
                    return (
                      <div
                        key={p.id}
                        className={`min-w-[88px] max-w-[110px] shrink-0 rounded-lg px-2 py-2 text-center ${
                          cell
                            ? 'bg-white dark:bg-[#1e1f26] border border-gray-200 dark:border-gray-700 shadow-sm'
                            : special
                            ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700/30'
                            : 'bg-white/60 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="text-[9px] font-medium text-gray-400 dark:text-gray-500 mb-1">{p.label}</div>
                        <div className="text-[9px] text-gray-300 dark:text-gray-600 mb-1.5">{p.startTime}</div>
                        {cell ? (
                          <>
                            <div className="text-[10px] font-semibold text-gray-800 dark:text-gray-100 leading-tight line-clamp-2 min-h-[28px]">
                              {cell.title}
                            </div>
                            {cell.teacherName && (
                              <div className="text-[9px] text-indigo-500 dark:text-indigo-400 mt-1 truncate">
                                {formatTeacher(cell.teacherName)}
                              </div>
                            )}
                          </>
                        ) : special ? (
                          <div className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 leading-tight line-clamp-2 min-h-[28px]">
                            {special.title}
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-300 dark:text-gray-600 min-h-[28px] flex items-center justify-center">
                            ว่าง
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ─── Full weekly table ─── */}
            <div>
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">ตารางเรียนทั้งสัปดาห์</p>
              {renderTable(false)}
            </div>
          </>
        )}
      </div>

      {/* ── Fullscreen Rotated Overlay ── */}
      {isFullscreen && createPortal(
        <>
          {/* Dark backdrop that fills portrait screen */}
          <div
            className="fixed inset-0 bg-black z-[9998]"
            onClick={exitFullscreen}
          />
          {/* Rotated landscape content: width=100vh, height=100vw, rotated 90deg clockwise */}
          <div
            className="fixed flex flex-col bg-white dark:bg-[#18191d] overflow-hidden shadow-2xl z-[9999]"
            style={{
              top: '50%',
              left: '50%',
              width: '100svh',
              height: '100svw',
              transform: 'translate(-50%, -50%) rotate(90deg)',
            }}
          >
            {/* Bar at "top" of landscape (appears as right edge on portrait) */}
            <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-[#1a1b1f] border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 min-w-0">
                <Calendar size={14} className="shrink-0" />
                <span className="font-semibold text-sm truncate">{titleText}</span>
                {homeroomTeacher && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                    · ครูที่ปรึกษา: <span className="font-medium text-gray-700 dark:text-gray-200">{homeroomTeacher}</span>
                  </span>
                )}
              </div>
              <button
                onClick={exitFullscreen}
                className="ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
              >
                <X size={14} />
                <span>ปิด</span>
              </button>
            </div>
            {/* Table in landscape space */}
            <div className="flex-1 overflow-auto p-1.5">
              {renderTable(true)}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};

export default StudentScheduleEmbed;
