import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import BackButton from '@/components/Shared/BackButton';
import ProfileAvatar from '@/components/Shared/ProfileAvatar';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchSchoolSettings } from '@/store/slices/schoolSettingsSlice';
import { CLASSES } from '@/utils/schoolUtils';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { isActiveStudentStatus } from '@/utils/studentStatusUtils';
import {
  applySpecialPeriodBehaviorScore,
} from '@/utils/behaviorScoreUtils';
import {
  collection, doc, getDoc, getDocs, query,
  Timestamp, where, writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle, BarChart2, Calendar, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardCheck, Info, RefreshCw, Save, Search,
  Users,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';

// ─── Types ─────────────────────────────────────────────────────────────────

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
  periodType?: 'recurring' | 'oneTime';
  eventDate?: string;
  eventEndDate?: string;
  durationHours?: number;
  isTeachingLoad?: boolean;
  deductBehaviorDefault?: boolean;
}

interface Student {
  id: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  prefix?: string;
  studentId?: string;
  studentNumber?: string;
  number?: string;
  classLevel?: string;
  room?: string;
  profileImageUrl?: string;
  status?: string;
  nickname?: string;
  behaviorScore?: number;
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';

// ─── Constants ─────────────────────────────────────────────────────────────

const ATTENDANCE_OPTIONS: { id: AttendanceStatus; label: string; shortLabel: string; color: string; bg: string; border: string }[] = [
  { id: 'present', label: 'มาร่วม', shortLabel: 'มา', color: 'bg-emerald-500 hover:bg-emerald-600', bg: 'bg-emerald-50/50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-800' },
  { id: 'late', label: 'มาสาย', shortLabel: 'สาย', color: 'bg-amber-500 hover:bg-amber-600', bg: 'bg-amber-50/50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800' },
  { id: 'leave', label: 'ลา', shortLabel: 'ลา', color: 'bg-blue-500 hover:bg-blue-600', bg: 'bg-blue-50/50 dark:bg-blue-900/10', border: 'border-blue-200 dark:border-blue-800' },
  { id: 'absent', label: 'ขาด', shortLabel: 'ขาด', color: 'bg-red-500 hover:bg-red-600', bg: 'bg-red-50/50 dark:bg-red-900/10', border: 'border-red-200 dark:border-red-800' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const toIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDay = (day?: string) => {
  const map: Record<string, string> = {
    all: 'ทุกวัน', mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ',
    thu: 'พฤหัสบดี', fri: 'ศุกร์', sat: 'เสาร์', sun: 'อาทิตย์',
  };
  return map[day || 'all'] || day || 'ทุกวัน';
};

const CLASS_FULL_LABELS: Record<string, string> = {
  k1: 'อนุบาล 1', k2: 'อนุบาล 2', k3: 'อนุบาล 3',
  p1: 'ประถมศึกษาปีที่ 1', p2: 'ประถมศึกษาปีที่ 2', p3: 'ประถมศึกษาปีที่ 3',
  p4: 'ประถมศึกษาปีที่ 4', p5: 'ประถมศึกษาปีที่ 5', p6: 'ประถมศึกษาปีที่ 6',
  m1: 'มัธยมศึกษาปีที่ 1', m2: 'มัธยมศึกษาปีที่ 2', m3: 'มัธยมศึกษาปีที่ 3',
  m4: 'มัธยมศึกษาปีที่ 4', m5: 'มัธยมศึกษาปีที่ 5', m6: 'มัธยมศึกษาปีที่ 6',
};

const getClassLevelVariants = (classKey: string) => {
  const shortLabel = CLASSES[classKey] || classKey;
  return Array.from(new Set([
    classKey, shortLabel, CLASS_FULL_LABELS[classKey],
    shortLabel.replace('ป.', 'ประถมศึกษาปีที่ '),
    shortLabel.replace('ม.', 'มัธยมศึกษาปีที่ '),
    shortLabel.replace('อ.', 'อนุบาล '),
  ].filter(Boolean).map(String)));
};

const getRoomVariants = (room: string) => {
  const raw = String(room || '').trim();
  const numeric = Number(raw);
  return Array.from(new Set([
    raw,
    Number.isFinite(numeric) && numeric > 0 ? String(numeric) : '',
    Number.isFinite(numeric) && numeric > 0 ? String(numeric).padStart(2, '0') : '',
    raw.replace(/^0+/, '') || raw,
  ].filter(Boolean)));
};

const buildDocId = (periodId: string, year: string, semester: string, dateStr: string, classKey: string, room: string) =>
  `${periodId}_${year}_S${semester}_${dateStr}_${classKey}_${room}`.replace(/[\/#?[\]]/g, '_');

const buildStudentDocId = (periodId: string, year: string, semester: string, dateStr: string) =>
  `SP_${periodId}_${year}_S${semester}_${dateStr}`.replace(/[\/#?[\]]/g, '_');

// ─── Page ──────────────────────────────────────────────────────────────────

const SpecialPeriodAttendancePage: React.FC = () => {
  const isPwaMode = usePwaMode();
  const [searchParams] = useSearchParams();
  const queryPeriodId = searchParams.get('periodId') || '';

  const dispatch = useDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId || '';
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);

  // ── Period ──────────────────────────────────────────────────────────────
  const [allPeriods, setAllPeriods] = useState<SpecialPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState(queryPeriodId);
  const [periodsLoading, setPeriodsLoading] = useState(true);

  // ── Class / Room ─────────────────────────────────────────────────────────
  const [selectedClassKey, setSelectedClassKey] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [availableRooms, setAvailableRooms] = useState<string[]>([]);

  // ── Attendance ───────────────────────────────────────────────────────────
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [studentLeaves, setStudentLeaves] = useState<Record<string, { isLeave: boolean; leaveType?: string }>>({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [studentSearch, setStudentSearch] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // ── Activity Details ─────────────────────────────────────────────────────
  const [activityTopic, setActivityTopic] = useState('');
  const [activityNote, setActivityNote] = useState('');

  // ── Behavior Deduction ──────────────────────────────────────────────────
  const [deductBehavior, setDeductBehavior] = useState(false);
  const [behaviorConfig, setBehaviorConfig] = useState<any>(null);

  // ── Academic Period ──────────────────────────────────────────────────────
  const activeAcademicYear = String(calendarState.academicYear || getCurrentThaiYear());
  const activeSemester = useMemo(() => {
    const dateStr = toIsoDate(currentDate);
    const match = calendarState.terms.find(t => t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate);
    return match?.id === 'term2' ? '2' : '1';
  }, [calendarState.terms, currentDate]);

  const currentTeacherId = useMemo(() => {
    const t = Object.values(teacherMap || {}).find((t: any) =>
      t.uid === (currentUser as any)?.uid || t.id === (currentUser as any)?.uid
    ) as any;
    return t?.id || (currentUser as any)?.uid || '';
  }, [teacherMap, currentUser]);

  const currentTeacher = useMemo(() =>
    Object.values(teacherMap || {}).find((t: any) =>
      t.id === currentTeacherId || t.uid === currentTeacherId
    ) as any,
    [teacherMap, currentTeacherId]
  );

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') dispatch(fetchTeachersMap(schoolId) as any);
  }, [schoolId, teacherMapStatus, dispatch]);

  useEffect(() => {
    if (schoolId && calendarState.status === 'idle') dispatch(fetchCalendar(schoolId) as any);
  }, [schoolId, calendarState.status, dispatch]);

  useEffect(() => {
    if (schoolId && schoolSettings.status === 'idle') dispatch(fetchSchoolSettings(schoolId) as any);
  }, [schoolId, schoolSettings.status, dispatch]);

  // ── Load behavior config (global — used for min/max/starting bounds) ─────
  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, 'school-settings', schoolId)).then(snap => {
      if (snap.exists()) setBehaviorConfig(snap.data()?.behaviorScoreConfig || null);
    });
  }, [schoolId]);

  // ── Load periods ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;
    getDocs(collection(db, 'school-settings', schoolId, 'special-periods')).then(snap => {
      const EXCLUDED = ['โฮมรูม', 'โอมรูม', 'homeroom', 'พักกลางวัน', 'พักเที่ยง', 'เข้าแถว', 'ชุมนุม', 'แนะแนว'];
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as SpecialPeriod))
        .filter(p => !EXCLUDED.some(kw => p.title.toLowerCase().includes(kw)))
        .sort((a, b) => {
          if (a.periodType === 'oneTime' && b.periodType === 'oneTime')
            return (b.eventDate || '') > (a.eventDate || '') ? 1 : -1;
          if (a.periodType === 'oneTime') return -1;
          if (b.periodType === 'oneTime') return 1;
          return String(a.title).localeCompare(String(b.title), 'th');
        });
      setAllPeriods(list);
      const initPeriod = queryPeriodId ? list.find(p => p.id === queryPeriodId) : list[0];
      if (!queryPeriodId && list.length > 0) setSelectedPeriodId(list[0].id);
      if (initPeriod) {
        setDeductBehavior(initPeriod.deductBehaviorDefault || false);
        if (initPeriod.periodType === 'oneTime' && initPeriod.eventDate) {
          const todayStr = toIsoDate(new Date());
          const startDate = initPeriod.eventDate;
          const endDate = initPeriod.eventEndDate || startDate;
          if (todayStr >= startDate && todayStr <= endDate) {
            setCurrentDate(new Date(todayStr + 'T00:00:00'));
          } else {
            setCurrentDate(new Date(startDate + 'T00:00:00'));
          }
        }
      }
      setPeriodsLoading(false);
    });
  }, [schoolId, queryPeriodId]);

  // ── Auto-set behavior toggle + date when period changes ──────────────────
  useEffect(() => {
    if (!selectedPeriodId || allPeriods.length === 0) return;
    const period = allPeriods.find(p => p.id === selectedPeriodId);
    if (!period) return;
    setDeductBehavior(period.deductBehaviorDefault || false);
    if (period.periodType === 'oneTime' && period.eventDate) {
      const todayStr = toIsoDate(new Date());
      const startDate = period.eventDate;
      const endDate = period.eventEndDate || startDate;
      if (todayStr >= startDate && todayStr <= endDate) {
        setCurrentDate(new Date(todayStr + 'T00:00:00'));
      } else {
        setCurrentDate(new Date(startDate + 'T00:00:00'));
      }
    }
  }, [selectedPeriodId, allPeriods]);

  // ── Load rooms when class changes ─────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || !selectedClassKey) { setAvailableRooms([]); return; }
    const variants = getClassLevelVariants(selectedClassKey);
    getDocs(query(
      collection(db, 'school-settings', schoolId, 'students'),
      where('classLevel', 'in', variants.slice(0, 10))
    )).then(snap => {
      const rooms = Array.from(new Set(
        snap.docs.map(d => String((d.data() as any).room || '').trim()).filter(Boolean)
      )).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      setAvailableRooms(rooms);
      if (rooms.length > 0 && !rooms.includes(selectedRoom)) setSelectedRoom(rooms[0]);
    });
  }, [schoolId, selectedClassKey]);

  // ── Load students & attendance ────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || !selectedClassKey || !selectedRoom || !selectedPeriodId) {
      setStudents([]); setAttendance({}); setIsSubmitted(false);
      return;
    }
    const classVariants = getClassLevelVariants(selectedClassKey);
    const roomVariants = getRoomVariants(selectedRoom);
    const dateStr = toIsoDate(currentDate);
    const docId = buildDocId(selectedPeriodId, activeAcademicYear, activeSemester, dateStr, selectedClassKey, selectedRoom);
    const studentDocId = buildStudentDocId(selectedPeriodId, activeAcademicYear, activeSemester, dateStr);

    setStudentsLoading(true);
    setIsSubmitted(false);

    const load = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'school-settings', schoolId, 'students'),
          where('classLevel', 'in', classVariants.slice(0, 10))
        ));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Student))
          .filter(s => {
            const status = String(s.status || '').trim();
            return isActiveStudentStatus(status || 'กำลังศึกษาอยู่') &&
              classVariants.includes(String(s.classLevel || '').trim()) &&
              roomVariants.includes(String(s.room || '').trim());
          })
          .sort((a, b) =>
            (parseInt(a.number || a.studentNumber || '0', 10) || 0) -
            (parseInt(b.number || b.studentNumber || '0', 10) || 0)
          );

        setStudents(list);

        const init: Record<string, AttendanceStatus> = {};
        list.forEach(s => { init[s.id] = 'present'; });

        // Load approved leaves
        const leaves: Record<string, { isLeave: boolean; leaveType?: string }> = {};
        await Promise.all(list.map(async s => {
          try {
            const leaveSnap = await getDocs(query(
              collection(db, 'school-settings', schoolId, 'students', s.id, 'leave_summary'),
              where('status', '==', 'approved')
            ));
            const valid = leaveSnap.docs.find(ld => {
              const data = ld.data();
              const start = normalizeDateValue(data.startDate);
              const end = normalizeDateValue(data.endDate);
              return start && end && start <= dateStr && end >= dateStr;
            });
            if (valid) {
              const lType = valid.data().leaveType;
              init[s.id] = lType === 'ไปราชการ/กิจกรรม' ? 'present' : 'leave';
              leaves[s.id] = { isLeave: true, leaveType: lType };
            }
          } catch {}
        }));
        setStudentLeaves(leaves);

        // Load saved attendance from summary doc
        const summaryRef = doc(db, 'school-settings', schoolId, 'special-period-attendance', docId);
        const summarySnap = await getDoc(summaryRef);

        // Also check individual student docs
        const existingResults = await Promise.all(list.map(async s => {
          const ref = doc(db, 'school-settings', schoolId, 'students', s.id, 'ClassroomAttendance', studentDocId);
          const snap2 = await getDoc(ref);
          return snap2.exists() ? { id: s.id, status: snap2.data().status as AttendanceStatus } : null;
        }));

        const hasRecord = existingResults.some(r => r !== null);
        if (hasRecord) {
          const loaded = { ...init };
          existingResults.forEach(r => { if (r) loaded[r.id] = r.status; });
          setAttendance(loaded);
          setIsSubmitted(true);
        } else {
          setAttendance(init);
        }

        if (summarySnap.exists()) {
          const data = summarySnap.data();
          setActivityTopic(data.topic || '');
          setActivityNote(data.note || '');
        } else {
          setActivityTopic('');
          setActivityNote('');
        }

        if (hasRecord) {
          Swal.fire({ icon: 'info', title: 'ตรวจพบการเช็คชื่อเดิม', text: 'คุณสามารถกด "แก้ไข" เพื่อปรับปรุงข้อมูลได้', timer: 1800, showConfirmButton: false });
        }
      } catch (err) {
        console.error('Error loading students:', err);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อนักเรียนได้', 'error');
      } finally {
        setStudentsLoading(false);
      }
    };

    load();
  }, [schoolId, selectedClassKey, selectedRoom, selectedPeriodId, currentDate, activeAcademicYear, activeSemester]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedPeriod = useMemo(() => allPeriods.find(p => p.id === selectedPeriodId) || null, [allPeriods, selectedPeriodId]);
  const isPeriodLocked = !!queryPeriodId;

  const classOptions: [string, string][] = schoolSettings.availableClassOptions.length > 0
    ? schoolSettings.availableClassOptions
    : Object.entries(CLASSES);

  const summary = useMemo(() => students.reduce(
    (acc, s) => { const st = attendance[s.id] || 'present'; acc[st] = (acc[st] || 0) + 1; return acc; },
    { present: 0, late: 0, leave: 0, absent: 0 } as Record<AttendanceStatus, number>
  ), [students, attendance]);

  const filteredStudents = useMemo(() => {
    const term = studentSearch.toLowerCase();
    return students.filter(s => {
      const text = `${s.studentId || ''} ${s.firstName || ''} ${s.lastName || ''} ${s.number || ''}`.toLowerCase();
      return !term || text.includes(term);
    });
  }, [students, studentSearch]);

  const handleSelectAllPresent = () => {
    if (isSubmitted) return;
    const updated: Record<string, AttendanceStatus> = {};
    students.forEach(s => {
      const leave = studentLeaves[s.id];
      updated[s.id] = leave?.isLeave && leave.leaveType !== 'ไปราชการ/กิจกรรม' ? 'leave' : 'present';
    });
    setAttendance(updated);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!schoolId || !selectedPeriod || !selectedClassKey || !selectedRoom || isSaving) return;
    setIsSaving(true);
    try {
      const dateStr = toIsoDate(currentDate);
      const normalizedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12, 0, 0);
      const docId = buildDocId(selectedPeriodId, activeAcademicYear, activeSemester, dateStr, selectedClassKey, selectedRoom);
      const studentDocId = buildStudentDocId(selectedPeriodId, activeAcademicYear, activeSemester, dateStr);
      const className = CLASSES[selectedClassKey] || selectedClassKey;

      const batch = writeBatch(db);

      // Per-student attendance docs
      for (const student of students) {
        const newStatus = attendance[student.id] || 'present';
        const studentRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', studentDocId);

        // Read old status for behavior delta
        let oldStatus: string | undefined;
        if (deductBehavior) {
          try {
            const prev = await getDoc(studentRef);
            if (prev.exists()) oldStatus = prev.data().status;
          } catch {}
        }

        batch.set(studentRef, {
          schoolId,
          studentId: student.id,
          date: Timestamp.fromDate(normalizedDate),
          classId: selectedClassKey,
          className,
          room: selectedRoom,
          period: 0,
          subjectName: selectedPeriod.title,
          subjectCode: `SP_${selectedPeriodId}`,
          courseId: selectedPeriodId,
          teacherId: currentTeacherId,
          teacherName: currentTeacher?.name || (currentUser as any)?.displayName || '',
          status: newStatus,
          academicYear: activeAcademicYear,
          semester: activeSemester,
          activityTopic,
          activityNote,
          attendanceType: 'special_period',
          specialPeriodId: selectedPeriodId,
          specialPeriodTitle: selectedPeriod.title,
          deductBehavior,
          updatedAt: Timestamp.now(),
        }, { merge: true });

        if (deductBehavior) {
          const studentDocRef = doc(db, 'school-settings', schoolId, 'students', student.id);
          applySpecialPeriodBehaviorScore({
            batch,
            studentRef: studentDocRef,
            currentScore: student.behaviorScore,
            oldStatus: oldStatus || null,
            newStatus,
            config: behaviorConfig,
          });
        }
      }

      // Summary doc
      const summaryRef = doc(db, 'school-settings', schoolId, 'special-period-attendance', docId);
      batch.set(summaryRef, {
        schoolId,
        periodId: selectedPeriodId,
        periodTitle: selectedPeriod.title,
        periodStartTime: selectedPeriod.startTime,
        periodEndTime: selectedPeriod.endTime,
        date: Timestamp.fromDate(normalizedDate),
        dateStr,
        classId: selectedClassKey,
        className,
        room: selectedRoom,
        teacherId: currentTeacherId,
        teacherName: currentTeacher?.name || (currentUser as any)?.displayName || '',
        topic: activityTopic,
        note: activityNote,
        records: attendance,
        studentCount: students.length,
        summary,
        academicYear: activeAcademicYear,
        semester: activeSemester,
        deductBehavior,
        updatedAt: Timestamp.now(),
        updatedBy: (currentUser as any)?.uid || '',
      }, { merge: true });

      await batch.commit();

      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1400, showConfirmButton: false });
      setIsSubmitted(true);
    } catch (err) {
      console.error('Error saving special period attendance:', err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกการเช็คชื่อได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className={`min-h-screen text-gray-900 dark:text-white transition-colors duration-300 ${isPwaMode ? 'px-2 py-2 pb-6' : 'p-3 sm:p-4'}`}>
        <div className={`${isPwaMode ? 'max-w-full space-y-3' : 'max-w-5xl mx-auto min-w-0 space-y-3'}`}>

          {/* ─ Header bar ─ */}
          <div className="flex items-center gap-2 bg-white dark:bg-[#2a2b2f] rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 shadow-sm">
            <BackButton
              to="/academic/hub/attendance"
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/20 transition-all shrink-0 p-0"
            />
            <ClipboardCheck className="text-indigo-500 shrink-0" size={16} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-gray-900 dark:text-white leading-none truncate">
                {selectedPeriod ? `เช็คชื่อ${selectedPeriod.title}` : 'เช็คชื่อคาบพิเศษ'}
              </p>
              {selectedPeriod && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                  {selectedPeriod.periodType === 'oneTime'
                    ? (() => {
                        const start = new Date((selectedPeriod.eventDate || '') + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
                        const end = selectedPeriod.eventEndDate
                          ? new Date(selectedPeriod.eventEndDate + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                          : null;
                        return end ? `${start} – ${end}` : start;
                      })()
                    : `${formatDay(selectedPeriod.day)}`} • {selectedPeriod.startTime}–{selectedPeriod.endTime}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
              <span className="font-bold">ปี {activeAcademicYear || '…'}</span>
              <span>/</span>
              <span className="font-bold">เทอม {activeSemester || '…'}</span>
            </div>
            <Link
              to="/academic/special-period-reports"
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 text-[10px] font-black text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
            >
              <BarChart2 size={11} />
              รายงาน
            </Link>
            {/* Date picker */}
            {(() => {
              const isOneTimeRange = selectedPeriod?.periodType === 'oneTime' && !!selectedPeriod.eventDate;
              const minDate = isOneTimeRange ? selectedPeriod!.eventDate! : undefined;
              const maxDate = isOneTimeRange ? (selectedPeriod!.eventEndDate || selectedPeriod!.eventDate!) : undefined;
              const curStr = toIsoDate(currentDate);
              const canPrev = !isOneTimeRange || curStr > minDate!;
              const canNext = !isOneTimeRange || curStr < maxDate!;
              return (
                <div className="flex items-center bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
                  <button
                    disabled={!canPrev}
                    onClick={() => setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })}
                    className={`px-2 py-1.5 transition-all ${canPrev ? 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-indigo-500' : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'}`}>
                    <ChevronLeft size={14} />
                  </button>
                  <div className="relative flex items-center gap-1 px-2">
                    <Calendar size={11} className="text-indigo-400 shrink-0" />
                    <span className="text-[11px] font-black text-gray-800 dark:text-gray-100 whitespace-nowrap">
                      {currentDate.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <input
                      type="date"
                      value={curStr}
                      min={minDate}
                      max={maxDate}
                      onChange={e => { const d = new Date(e.target.value + 'T00:00:00'); if (!isNaN(d.getTime())) setCurrentDate(d); }}
                      className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                  <button
                    disabled={!canNext}
                    onClick={() => setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}
                    className={`px-2 py-1.5 transition-all ${canNext ? 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-indigo-500' : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'}`}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })()}
          </div>

          {periodsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
            </div>
          ) : allPeriods.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-10 text-center">
              <AlertCircle className="mx-auto mb-3 text-amber-500" size={36} />
              <h2 className="text-base font-black">ยังไม่มีคาบเรียนพิเศษในระบบ</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">กรุณาเพิ่มคาบเรียนพิเศษในหน้า <strong>จัดการคาบเรียนพิเศษ</strong> ก่อน</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">

              {/* ─ LEFT SIDEBAR ─ */}
              <aside className="lg:col-span-4 space-y-3">

                {/* Period selector (when not locked) */}
                {!isPeriodLocked && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f23] p-3 shadow-sm">
                    <h3 className="mb-2 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">คาบกิจกรรมพิเศษ</h3>
                    <div className="space-y-1.5">
                      {allPeriods.map(p => {
                        const isOneTime = p.periodType === 'oneTime';
                        return (
                          <button key={p.id} type="button" onClick={() => setSelectedPeriodId(p.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                              selectedPeriodId === p.id
                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15'
                                : 'border-gray-200 hover:border-indigo-300 dark:border-gray-700 dark:hover:border-indigo-500/40'
                            }`}>
                            <div className="flex items-center gap-1.5">
                              <p className={`text-xs font-black truncate ${selectedPeriodId === p.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>{p.title}</p>
                              {isOneTime && (
                                <span className="shrink-0 rounded-full bg-violet-100 dark:bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-black text-violet-600 dark:text-violet-300">ครั้งเดียว</span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {isOneTime
                                ? `${new Date((p.eventDate || '') + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} • `
                                : `${formatDay(p.day)} • `
                              }{p.startTime}–{p.endTime} น.
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Class + Room selector */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f23] p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">ห้องเรียน</h3>
                    {selectedClassKey && selectedRoom && (
                      <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full">
                        {CLASSES[selectedClassKey] || selectedClassKey}/{selectedRoom}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-gray-400">ระดับชั้น</label>
                      <select value={selectedClassKey}
                        onChange={e => { setSelectedClassKey(e.target.value); setSelectedRoom(''); }}
                        className="h-9 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white">
                        <option value="">-- ระดับชั้น --</option>
                        {classOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-gray-400">ห้อง</label>
                      <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}
                        disabled={!selectedClassKey}
                        className="h-9 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:text-white">
                        <option value="">-- ห้อง --</option>
                        {availableRooms.map(r => <option key={r} value={r}>ห้อง {r}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Activity details */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f23] p-3 shadow-sm">
                  <h3 className="mb-2 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">รายละเอียดกิจกรรม</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-gray-400">หัวข้อกิจกรรม</label>
                      <input type="text" value={activityTopic} onChange={e => setActivityTopic(e.target.value)}
                        disabled={isSubmitted}
                        placeholder="เช่น อบรมคุณธรรม, ทัศนศึกษา"
                        className="h-9 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] px-3 text-xs font-bold outline-none placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-gray-400">บันทึกเพิ่มเติม</label>
                      <textarea rows={2} value={activityNote} onChange={e => setActivityNote(e.target.value)}
                        disabled={isSubmitted}
                        placeholder="ระบุรายละเอียดเพิ่มเติม..."
                        className="w-full resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] p-2 text-xs font-bold outline-none placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:text-white" />
                    </div>
                  </div>
                </div>

              </aside>

              {/* ─ RIGHT: STUDENT GRID ─ */}
              <section className="lg:col-span-8 space-y-3">

                {!selectedPeriodId || !selectedClassKey || !selectedRoom ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.03] text-center text-gray-400">
                    <Users size={36} className="mb-3 opacity-30" />
                    <p className="text-sm font-bold">
                      {!selectedPeriodId ? 'เลือกคาบกิจกรรมพิเศษ' : 'เลือกระดับชั้นและห้องเรียนเพื่อเริ่มเช็คชื่อ'}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Compact top bar: 2-row layout, mobile-safe */}
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f23] px-3 pt-3 pb-2 shadow-sm space-y-2">

                      {/* Row 1: title + status + action buttons */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 truncate leading-none">
                            {selectedPeriod?.title} — {CLASSES[selectedClassKey] || selectedClassKey}/{selectedRoom}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {students.length} คน •{' '}
                            <span className={isSubmitted ? 'text-emerald-500' : 'text-gray-400'}>
                              {isSubmitted ? '✓ บันทึกแล้ว' : 'ยังไม่บันทึก'}
                            </span>
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={handleSelectAllPresent} disabled={isSubmitted || students.length === 0}
                            className="h-8 px-2.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 disabled:opacity-50 transition-all flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 size={13} />มาทั้งหมด
                          </button>
                          {isSubmitted ? (
                            <button onClick={() => setIsSubmitted(false)}
                              className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-[11px] font-black text-white transition-all flex items-center gap-1 whitespace-nowrap">
                              <RefreshCw size={13} />แก้ไข
                            </button>
                          ) : (
                            <button onClick={handleSave} disabled={isSaving || students.length === 0}
                              className="h-8 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-[11px] font-black text-white shadow-sm disabled:opacity-60 transition-all flex items-center gap-1 whitespace-nowrap">
                              {isSaving ? <RefreshCw className="animate-spin" size={13} /> : <Save size={13} />}
                              บันทึก
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Row 2: behavior toggle + summary pills */}
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                        {/* Toggle */}
                        <button
                          type="button"
                          onClick={() => setDeductBehavior(v => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${deductBehavior ? 'bg-violet-600' : 'bg-gray-200 dark:bg-gray-600'}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${deductBehavior ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                        </button>
                        <span className={`text-[11px] font-black shrink-0 ${deductBehavior ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400'}`}>
                          {deductBehavior
                            ? getActivityBehaviorLabel(behaviorConfig)
                            : 'คะแนนพฤติกรรม: ปิดอยู่'}
                        </span>

                        {/* Summary pills */}
                        {students.length > 0 && (
                          <div className="flex items-center gap-1 ml-auto shrink-0">
                            {ATTENDANCE_OPTIONS.map(opt => (
                              <div key={opt.id} className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 ${opt.bg} border ${opt.border}`}>
                                <span className={`text-xs font-black leading-none ${opt.id === 'present' ? 'text-emerald-600 dark:text-emerald-400' : opt.id === 'late' ? 'text-amber-600 dark:text-amber-400' : opt.id === 'leave' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {summary[opt.id]}
                                </span>
                                <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400">{opt.shortLabel}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                      <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                        placeholder="ค้นหาชื่อ รหัส หรือเลขที่..."
                        className="h-9 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white" />
                    </div>

                    {studentsLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-violet-500" />
                      </div>
                    ) : filteredStudents.length === 0 ? (
                      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1e1f23] text-center text-gray-400">
                        <Users size={28} className="mb-2 opacity-30" />
                        <p className="text-sm font-bold">ไม่พบนักเรียนในห้องนี้</p>
                      </div>
                    ) : isPwaMode ? (
                      /* PWA: single column card list */
                      <div className="grid grid-cols-1 gap-2">
                        {filteredStudents.map(student => {
                          const status = attendance[student.id] || 'present';
                          const leave = studentLeaves[student.id];
                          const opt = ATTENDANCE_OPTIONS.find(o => o.id === status)!;
                          return (
                            <div key={student.id}
                              className={`relative rounded-xl border-2 p-2.5 transition-all ${opt.bg} ${opt.border}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[10px] font-black text-gray-500 shrink-0">
                                  {student.number || student.studentNumber || '–'}
                                </div>
                                <Link to={`/school/${schoolId}/students/view/${student.id}`} className="flex items-center gap-2 group min-w-0">
                                  <ProfileAvatar
                                    src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                                    alt={student.firstName || ''}
                                    className="h-8 w-8 border border-gray-100 dark:border-gray-800 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-bold text-gray-800 dark:text-gray-200 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                      {student.title || student.prefix || ''}{student.firstName || ''} {student.lastName || ''}
                                    </p>
                                    <p className="text-[10px] text-gray-400">{student.studentId || '–'}</p>
                                  </div>
                                </Link>
                                {leave?.isLeave && (
                                  <span className="ml-auto shrink-0 flex items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-black text-blue-600 dark:text-blue-300">
                                    <Info size={9} /> ลา
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-4 gap-1">
                                {ATTENDANCE_OPTIONS.map(o => (
                                  <button key={o.id} type="button" disabled={isSubmitted}
                                    onClick={() => setAttendance(prev => ({ ...prev, [student.id]: o.id }))}
                                    className={`rounded-lg py-1.5 text-[10px] font-black transition-all ${
                                      status === o.id
                                        ? `${o.color} text-white shadow-sm`
                                        : 'bg-white/60 text-gray-400 hover:bg-white dark:bg-black/20 dark:text-gray-500 dark:hover:bg-white/10'
                                    } ${isSubmitted ? 'cursor-not-allowed' : ''}`}>
                                    {o.shortLabel}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Desktop: compact table */
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f23] overflow-hidden shadow-sm">
                        <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 bg-gray-50/50 dark:bg-white/[0.02] flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-wider">
                          <div className="flex items-center gap-3">
                            <div className="w-6 text-center">ที่</div>
                            <div className="pl-10">ชื่อ-นามสกุล</div>
                          </div>
                          <div className="hidden sm:block">สถานะการเข้าร่วม</div>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                          {filteredStudents.map(student => {
                            const status = attendance[student.id] || 'present';
                            const leave = studentLeaves[student.id];
                            return (
                              <div key={student.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50/50 dark:hover:bg-white/[0.015] transition-all">
                                <div className="flex items-center gap-2.5">
                                  <div className="h-6 w-6 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[10px] font-black text-gray-500 shrink-0">
                                    {student.number || student.studentNumber || '–'}
                                  </div>
                                  <Link to={`/school/${schoolId}/students/view/${student.id}`} className="flex items-center gap-2 group">
                                    <ProfileAvatar
                                      src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                                      alt={student.firstName || ''}
                                      className="h-8 w-8 border border-gray-100 dark:border-gray-800 shrink-0" />
                                    <div>
                                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-none">
                                        {student.title || student.prefix || ''}{student.firstName || ''} {student.lastName || ''}
                                        {student.nickname && <span className="ml-1 text-[10px] text-gray-400">({student.nickname})</span>}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] text-gray-400">{student.studentId || '–'}</span>
                                        {leave?.isLeave && (
                                          <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-black text-blue-600 dark:text-blue-300">
                                            <Info size={9} /> ลา ({leave.leaveType})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </Link>
                                </div>
                                <div className="flex gap-1 w-full sm:w-auto shrink-0">
                                  {ATTENDANCE_OPTIONS.map(o => (
                                    <button key={o.id} type="button" disabled={isSubmitted}
                                      onClick={() => setAttendance(prev => ({ ...prev, [student.id]: o.id }))}
                                      className={`flex-1 sm:flex-initial h-8 px-2.5 sm:px-3 rounded-lg border text-[11px] font-black transition-all ${
                                        status === o.id
                                          ? `${o.color} border-transparent text-white shadow-sm active:scale-95`
                                          : 'bg-white dark:bg-[#1e1f23] border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                                      } ${isSubmitted ? 'cursor-not-allowed opacity-90' : ''}`}>
                                      {o.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

// ─── Behavior helpers ───────────────────────────────────────────────────────

const getActivityBehaviorLabel = (globalConfig: any): string => {
  const rules = globalConfig?.specialPeriodRules;
  const getGlobal = (key: string): number => {
    if (Array.isArray(rules) && rules.length > 0) {
      const r = rules.find((r: any) => r.statusKey === key);
      return r?.isActive !== false ? (r?.points ?? 0) : 0;
    }
    return key === 'late' ? 2 : key === 'absent' ? 5 : 0;
  };
  const late = getGlobal('late');
  const absent = getGlobal('absent');
  const parts: string[] = [];
  if (late > 0) parts.push(`สาย −${late}`);
  if (absent > 0) parts.push(`ขาด −${absent}`);
  return parts.length > 0 ? `คะแนน: ${parts.join(' / ')}` : 'คะแนนพฤติกรรม: เปิดอยู่';
};

// ─── Misc helpers ───────────────────────────────────────────────────────────

const normalizeDateValue = (value: any) => {
  if (value?.toDate) return value.toDate().toISOString().split('T')[0];
  if (typeof value === 'string') return value;
  return '';
};

export default SpecialPeriodAttendancePage;
