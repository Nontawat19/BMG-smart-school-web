import React, { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '@/components/Shared/BackButton';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { CLASS_MAPPING, getClassOptionsBySchoolSettings } from '@/utils/schoolUtils';
import { isStudyingStudent } from '@/utils/studentStatusUtils';
import {
  BookOpenCheck, Check, ChevronLeft, ChevronRight, ClipboardList,
  RefreshCw, Search, Trash2, Users, X,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import Swal from 'sweetalert2';
import { formatSemesterLabel, normalizeSemesterValue, semestersOverlap } from '@/utils/semesterUtils';
import {
  LearnerActivityTeacherScope,
  buildLearnerActivityMemberDocId,
  deriveTeacherScopesFromCourse,
  formatTeacherScopeLabel,
  scopeIncludesTeacher,
} from '@/utils/learnerActivityUtils';

interface LearnerActivity {
  id: string;
  courseId: string;
  courseCode?: string;
  name: string;
  description?: string;
  semester?: string | number;
  classId?: string | string[];
  responsibleTeacherIds?: string[];
  teacherScopes?: LearnerActivityTeacherScope[];
}

interface Course {
  id: string;
  classId?: string | string[];
  teacherAssignments?: any[];
}

interface Student {
  id: string;
  title?: string;
  prefix?: string;
  firstName?: string;
  lastName?: string;
  studentId?: string;
  studentNumber?: string;
  number?: string;
  classLevel?: string;
  room?: string;
  status?: string;
}

interface SchoolSettings {
  schoolType?: string;
  opportunityExpansionLevel?: string;
}

const PREFIX_MAP: Record<string, string> = {
  'ด.ช.': 'เด็กชาย', 'ดช.': 'เด็กชาย', 'ด.ช': 'เด็กชาย',
  'ด.ญ.': 'เด็กหญิง', 'ดญ.': 'เด็กหญิง', 'ด.ญ': 'เด็กหญิง',
  'น.ส.': 'นางสาว', 'นส.': 'นางสาว', 'น.ส': 'นางสาว',
};

const normalizePrefix = (raw?: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  return PREFIX_MAP[trimmed] ?? trimmed;
};

const getLevelLabel = (id?: string): string => {
  const map: Record<string, string> = {
    k1: 'อ.1', k2: 'อ.2', k3: 'อ.3',
    p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
    m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
  };
  return map[String(id || '').toLowerCase()] || id || '';
};


const sortStudents = (a: Student, b: Student) => {
  const cl = String(a.classLevel || '').localeCompare(String(b.classLevel || ''), 'th', { numeric: true });
  if (cl !== 0) return cl;
  const rl = String(a.room || '').localeCompare(String(b.room || ''), 'th', { numeric: true });
  if (rl !== 0) return rl;
  return (Number(a.studentNumber || a.number || 0)) - (Number(b.studentNumber || b.number || 0));
};

const formatSemester = (v?: string | number) => formatSemesterLabel(v);
const semesterOverlaps = (a?: string | number, b?: string | number) => semestersOverlap(a, b);

const KG_LABELS = ['อ.1', 'อ.2', 'อ.3'];
const PRIM_LABELS = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
const JR_LABELS = ['ม.1', 'ม.2', 'ม.3'];
const SR_LABELS = ['ม.4', 'ม.5', 'ม.6'];

// Expands teacher scope classLevels (keys like 'm1') or group keywords
// to student classLevel labels (e.g., 'ม.1') for source student filtering
const expandScopeToStudentLevels = (
  classLevels: string[],
  classId?: string | string[]
): string[] | null => {
  const process = (raw: string): string[] => {
    const l = raw.toLowerCase().trim().replace(/[\s._\-]/g, '');
    if (['มัธยมต้น','มัธยมศึกษาตอนต้น','มต','junior','lowersecondary','ม1ม3','m1m3'].includes(l)) return JR_LABELS;
    if (['มัธยมปลาย','มัธยมศึกษาตอนปลาย','มป','senior','uppersecondary','ม4ม6','m4m6'].includes(l)) return SR_LABELS;
    if (['มัธยม','มัธยมศึกษา','secondary','ม1ม6','m1m6'].includes(l)) return [...JR_LABELS, ...SR_LABELS];
    if (['ประถม','ประถมศึกษา','primary','ป1ป6','p1p6'].includes(l)) return PRIM_LABELS;
    if (['อนุบาล','ปฐมวัย','kindergarten','อ1อ3','k1k3'].includes(l)) return KG_LABELS;
    // specific key like m1, p3, k2
    const label = CLASS_MAPPING[raw] || CLASS_MAPPING[l];
    if (label) return [label];
    // already a label like 'ม.1'
    if (Object.values(CLASS_MAPPING).includes(raw)) return [raw];
    return [];
  };
  const sources = [...classLevels];
  if (classId) (Array.isArray(classId) ? classId : [classId]).forEach(c => sources.push(String(c)));
  if (sources.length === 0) return null;
  const expanded = new Set<string>();
  sources.forEach(s => process(s).forEach(l => expanded.add(l)));
  return expanded.size > 0 ? [...expanded] : null;
};

const LearnerActivityStudentManagementPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const calendarState = useSelector((state: RootState) => state.calendar);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const dispatch = useDispatch();

  const [activities, setActivities] = useState<LearnerActivity[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [selectedTeacherScopeKey, setSelectedTeacherScopeKey] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedEnrolledIds, setSelectedEnrolledIds] = useState<string[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityClassFilter, setActivityClassFilter] = useState('ALL');
  const [sourceSearch, setSourceSearch] = useState('');
  const [activeYear, setActiveYear] = useState(String(getCurrentThaiYear()));
  const [selectedClassLevel, setSelectedClassLevel] = useState('ALL');
  const [activeRoom, setActiveRoom] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingMembersRef = useRef(false);

  useEffect(() => {
    if (schoolId && calendarState.status === 'idle') dispatch(fetchCalendar(schoolId) as any);
  }, [schoolId, calendarState.status, dispatch]);

  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') dispatch(fetchTeachersMap(schoolId) as any);
  }, [schoolId, teacherMapStatus, dispatch]);

  useEffect(() => {
    if (calendarState.academicYear) setActiveYear(calendarState.academicYear);
  }, [calendarState.academicYear]);

  useEffect(() => {
    if (!schoolId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [activitySnap, courseSnap, studentSnap, schoolSnap] = await Promise.all([
          getDocs(collection(db, 'school-settings', schoolId, 'learner-activities')),
          getDocs(collection(db, 'school-settings', schoolId, 'courses')),
          getDocs(collection(db, 'school-settings', schoolId, 'students')),
          getDoc(doc(db, 'school-settings', schoolId)),
        ]);
        setActivities(
          activitySnap.docs
            .map(d => ({ id: d.id, ...d.data() } as LearnerActivity))
            .sort((a, b) => ((b as any).createdAt?.toMillis?.() ?? 0) - ((a as any).createdAt?.toMillis?.() ?? 0))
        );
        setCourses(courseSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
        setStudents(
          studentSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as Student))
            .filter(isStudyingStudent)
            .sort(sortStudents)
        );
        setSchoolSettings(schoolSnap.exists() ? (schoolSnap.data() as SchoolSettings) : null);
      } catch {
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [schoolId]);

  const selectedActivity = useMemo(() => activities.find(a => a.id === selectedActivityId) || null, [activities, selectedActivityId]);
  const selectedSemester = normalizeSemesterValue(selectedActivity?.semester);
  const selectedCourse = useMemo(() => courses.find(c => c.id === selectedActivity?.courseId) || null, [courses, selectedActivity?.courseId]);
  const teacherScopes = useMemo(
    () => selectedActivity ? deriveTeacherScopesFromCourse(selectedActivity, selectedCourse, teacherMap as any) : [],
    [selectedActivity, selectedCourse, teacherMap]
  );
  const selectedTeacherScope = useMemo(
    () => teacherScopes.find(s => s.key === selectedTeacherScopeKey) || null,
    [teacherScopes, selectedTeacherScopeKey]
  );

  const academicYearOptions = useMemo(() => {
    const base = Number(calendarState.academicYear || activeYear || getCurrentThaiYear());
    return Array.from({ length: 5 }, (_, i) => String(base - i));
  }, [calendarState.academicYear, activeYear]);

  const classOptions = useMemo(() => (
    getClassOptionsBySchoolSettings(schoolSettings?.opportunityExpansionLevel, schoolSettings?.schoolType)
      .map(([, label]) => label)
  ), [schoolSettings]);

  const levelOrder = ['k1','k2','k3','p1','p2','p3','p4','p5','p6','m1','m2','m3','m4','m5','m6'];

  const availableActivityClassLevels = useMemo(() => {
    const set = new Set<string>();
    activities.forEach(a => {
      a.teacherScopes?.forEach(s => s.classLevels.forEach(l => set.add(l.toLowerCase())));
      const ids = Array.isArray(a.classId) ? a.classId : a.classId ? [a.classId] : [];
      ids.forEach(l => set.add(String(l).toLowerCase()));
    });
    return [...set].sort((a, b) => {
      const ia = levelOrder.indexOf(a); const ib = levelOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const term = activitySearch.toLowerCase();
    return activities.filter(a => {
      const text = `${a.courseCode || ''} ${a.name || ''} ${a.description || ''}`.toLowerCase();
      if (term && !text.includes(term)) return false;
      if (activityClassFilter !== 'ALL') {
        const scopeLevels = a.teacherScopes?.flatMap(s => s.classLevels.map(l => l.toLowerCase())) || [];
        const classIds = (Array.isArray(a.classId) ? a.classId : a.classId ? [a.classId] : []).map(l => String(l).toLowerCase());
        if (![...scopeLevels, ...classIds].includes(activityClassFilter)) return false;
      }
      return true;
    });
  }, [activities, activitySearch, activityClassFilter]);

  const selectedSet = useMemo(() => new Set(selectedStudents), [selectedStudents]);

  const enrolledStudents = useMemo(
    () => students.filter(s => selectedSet.has(s.id)).sort(sortStudents),
    [students, selectedSet]
  );

  // Derived from selected activity's teacher scope — pre-filters source students automatically
  const activityStudentClassLevels = useMemo((): string[] | null => {
    if (!selectedActivity) return null;
    const classLevels = selectedTeacherScope?.classLevels || [];
    return expandScopeToStudentLevels(classLevels, selectedActivity.classId);
  }, [selectedActivity, selectedTeacherScope]);

  const availableRooms = useMemo(() => {
    let base = students;
    if (activityStudentClassLevels) base = base.filter(s => activityStudentClassLevels.includes(s.classLevel || ''));
    if (selectedClassLevel !== 'ALL') base = base.filter(s => s.classLevel === selectedClassLevel);
    return Array.from(new Set(base.map(s => s.room).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  }, [students, selectedClassLevel, activityStudentClassLevels]);

  const sourceStudents = useMemo(() => {
    const term = sourceSearch.toLowerCase();
    return students
      .filter(s => !selectedSet.has(s.id))
      .filter(s => !activityStudentClassLevels || activityStudentClassLevels.includes(s.classLevel || ''))
      .filter(s => selectedClassLevel === 'ALL' || s.classLevel === selectedClassLevel)
      .filter(s => activeRoom === 'ALL' || String(s.room || '') === activeRoom)
      .filter(s => {
        if (!term) return true;
        const text = `${s.studentId || ''} ${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
        return text.includes(term);
      })
      .sort(sortStudents);
  }, [students, selectedSet, selectedClassLevel, activeRoom, sourceSearch, activityStudentClassLevels]);

  useEffect(() => {
    if (teacherScopes.length === 0) { setSelectedTeacherScopeKey(''); return; }
    if (!teacherScopes.some(s => s.key === selectedTeacherScopeKey)) {
      setSelectedTeacherScopeKey(teacherScopes[0].key);
    }
  }, [teacherScopes, selectedTeacherScopeKey]);

  const loadMembers = async (
    activity: LearnerActivity | null,
    year = activeYear,
    scope: LearnerActivityTeacherScope | null = selectedTeacherScope
  ) => {
    if (!schoolId || !activity) { setSelectedStudents([]); return; }
    isLoadingMembersRef.current = true;
    setMembersLoading(true);
    setAutoSaveStatus('idle');
    try {
      const snap = await getDocs(collection(db, 'school-settings', schoolId, 'learner-activities', activity.id, 'members'));
      const ids = snap.docs
        .map(d => d.data() as any)
        .filter(m =>
          String(m.academicYear || '') === year &&
          semesterOverlaps(m.semester, activity.semester) &&
          (!scope ||
            String(m.teacherScopeKey || '') === scope.key ||
            scopeIncludesTeacher(scope, m.teacherId) ||
            (Array.isArray(m.teacherIds) && m.teacherIds.some((id: string) => scope.teacherIds.includes(String(id)))))
        )
        .map(m => String(m.studentId || ''))
        .filter(Boolean);
      setSelectedStudents(Array.from(new Set(ids)));
      setSelectedEnrolledIds([]);
      setSelectedSourceIds([]);
    } catch {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อนักเรียนในกิจกรรมได้', 'error');
    } finally {
      setMembersLoading(false);
      setTimeout(() => { isLoadingMembersRef.current = false; }, 100);
    }
  };

  const handleActivitySelect = async (activity: LearnerActivity) => {
    setSelectedActivityId(activity.id);
    setSelectedTeacherScopeKey('');
    setSelectedEnrolledIds([]);
    setSelectedSourceIds([]);
    setSourceSearch('');
    await loadMembers(activity, activeYear, null);
  };

  useEffect(() => {
    if (selectedActivity) loadMembers(selectedActivity, activeYear, selectedTeacherScope);
  }, [activeYear, selectedActivity, selectedTeacherScope]);

  // Auto-save: triggers 1.5s after selectedStudents changes (user actions only, not loads)
  useEffect(() => {
    if (isLoadingMembersRef.current || !selectedActivity || saving) return;
    setAutoSaveStatus('pending');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave(true);
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [selectedStudents]);

  const enrollSelected = () => {
    if (!selectedActivity || selectedSourceIds.length === 0) return;
    setSelectedStudents(prev => Array.from(new Set([...prev, ...selectedSourceIds])));
    setSelectedSourceIds([]);
  };

  const unenrollSelected = () => {
    if (selectedEnrolledIds.length === 0) return;
    setSelectedStudents(prev => prev.filter(id => !selectedEnrolledIds.includes(id)));
    setSelectedEnrolledIds([]);
  };

  const toggleSelectAllEnrolled = () => {
    if (selectedEnrolledIds.length === enrolledStudents.length && enrolledStudents.length > 0) {
      setSelectedEnrolledIds([]);
    } else {
      setSelectedEnrolledIds(enrolledStudents.map(s => s.id));
    }
  };

  const toggleSelectAllSource = () => {
    if (selectedSourceIds.length === sourceStudents.length && sourceStudents.length > 0) {
      setSelectedSourceIds([]);
    } else {
      setSelectedSourceIds(sourceStudents.map(s => s.id));
    }
  };

  const handleSave = async (silent = false) => {
    if (!schoolId || !selectedActivity || saving) return;
    setSaving(true);
    setAutoSaveStatus('saving');
    try {
      const membersRef = collection(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'members');
      const existingSnap = await getDocs(membersRef);
      const batch = writeBatch(db);
      const totalMemberIds = new Set<string>();

      existingSnap.docs.forEach(memberDoc => {
        const member = memberDoc.data() as any;
        const matchesScope = selectedTeacherScope
          ? String(member.teacherScopeKey || '') === selectedTeacherScope.key ||
            scopeIncludesTeacher(selectedTeacherScope, member.teacherId) ||
            (Array.isArray(member.teacherIds) && member.teacherIds.some((id: string) => selectedTeacherScope.teacherIds.includes(String(id))))
          : !member.teacherScopeKey;
        if (String(member.academicYear || '') === activeYear && semesterOverlaps(member.semester, selectedSemester) && !matchesScope) {
          const sid = String(member.studentId || '');
          if (sid) totalMemberIds.add(sid);
        }
        if (String(member.academicYear || '') === activeYear && semesterOverlaps(member.semester, selectedSemester) && matchesScope) {
          batch.delete(memberDoc.ref);
        }
      });

      selectedStudents.forEach(studentId => {
        totalMemberIds.add(studentId);
        const student = students.find(s => s.id === studentId);
        const memberDocId = buildLearnerActivityMemberDocId(activeYear, selectedSemester, selectedTeacherScope?.key || 'legacy', studentId);
        batch.set(doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'members', memberDocId), {
          studentId,
          studentName: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : '',
          studentCode: student?.studentId || '',
          classLevel: student?.classLevel || '',
          room: student?.room || '',
          teacherScopeKey: selectedTeacherScope?.key || '',
          teacherId: selectedTeacherScope?.teacherId || '',
          teacherIds: selectedTeacherScope?.teacherIds || [],
          teacherName: selectedTeacherScope ? formatTeacherScopeLabel(selectedTeacherScope, teacherMap as any) : '',
          targetClassLevels: selectedTeacherScope?.classLevels || [],
          targetRoomIds: selectedTeacherScope?.roomIds || [],
          groupNumber: selectedTeacherScope?.groupNumber || null,
          academicYear: activeYear,
          semester: selectedSemester,
          addedAt: serverTimestamp(),
          addedBy: (currentUser as any)?.uid || '',
        });
      });

      batch.update(doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id), {
        memberCountByYear: { [activeYear]: totalMemberIds.size },
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setAutoSaveStatus('saved');
      if (!silent) {
        Swal.fire({ icon: 'success', title: 'บันทึกรายชื่อนักเรียนสำเร็จ', timer: 1400, showConfirmButton: false });
      }
      setTimeout(() => setAutoSaveStatus('idle'), 2500);
    } catch {
      setAutoSaveStatus('idle');
      if (!silent) Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกรายชื่อนักเรียนได้', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 dark:bg-[#0b0e14]">
        <RefreshCw className="mb-4 animate-spin text-emerald-500" size={36} />
        <p className="font-bold text-slate-400">กำลังโหลดระบบ...</p>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden bg-slate-50 text-black dark:bg-[#0b0e14] dark:text-white select-none transition-colors">

        {/* ══════════ HEADER ══════════ */}
        <header className="flex shrink-0 items-center justify-between border-b-2 border-emerald-500/30 bg-slate-100 pl-16 pr-4 py-3 shadow-lg dark:bg-[#11141d] z-30">
          <div className="flex items-center gap-4">
            <BackButton to="/academic/hub/activities" />
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-600 p-2 shadow-lg shadow-emerald-600/30">
                <BookOpenCheck size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-black leading-none">จัดรายชื่อนักเรียนกิจกรรมพัฒนาผู้เรียน</h1>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-black/50 dark:text-white/50">
                  เลือกกิจกรรม → กำหนดนักเรียน → บันทึกอัตโนมัติ
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Year + Class filter */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-inner dark:border-white/5 dark:bg-white/5">
              <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">ปีการศึกษา</span>
              <select
                value={activeYear}
                onChange={e => setActiveYear(e.target.value)}
                className="h-7 bg-transparent px-1 text-sm font-black outline-none dark:text-white"
              >
                {academicYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="mx-1 text-slate-300 dark:text-white/10">|</span>
              <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">ชั้น</span>
              <select
                value={selectedClassLevel}
                onChange={e => { setSelectedClassLevel(e.target.value); setActiveRoom('ALL'); }}
                className="h-7 bg-transparent px-1 text-sm font-black outline-none dark:text-white"
              >
                <option value="ALL">ทั้งหมด</option>
                {classOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Auto-save status indicator */}
            <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[11px] font-black dark:border-white/5 dark:bg-white/5">
              {autoSaveStatus === 'saving' && (
                <><RefreshCw size={13} className="animate-spin text-indigo-400" /><span className="text-indigo-400">กำลังบันทึก...</span></>
              )}
              {autoSaveStatus === 'saved' && (
                <><Check size={13} className="text-emerald-500" /><span className="text-emerald-500">บันทึกแล้ว</span></>
              )}
              {autoSaveStatus === 'pending' && (
                <><div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /><span className="text-amber-400">รอบันทึก...</span></>
              )}
              {autoSaveStatus === 'idle' && (
                <span className="text-slate-300 dark:text-white/20">บันทึกอัตโนมัติ</span>
              )}
            </div>
          </div>
        </header>

        {/* ══════════ MAIN GRID ══════════ */}
        <main className="flex flex-1 gap-2 overflow-hidden p-2 pl-16">

          {/* ── COLUMN 1: Activity List ── */}
          <div className="flex w-[240px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-[#161a27]">
            {/* Search */}
            <div className="space-y-2 border-b border-slate-200 bg-slate-50 p-3 dark:border-white/5 dark:bg-black/10">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                  <ClipboardList size={12} className="text-emerald-500" /> กิจกรรม
                </h2>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                  {filteredActivities.length}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                <input
                  value={activitySearch}
                  onChange={e => setActivitySearch(e.target.value)}
                  placeholder="ค้นหากิจกรรม..."
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
              {availableActivityClassLevels.length > 0 && (
                <select
                  value={activityClassFilter}
                  onChange={e => setActivityClassFilter(e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  <option value="ALL">ทุกชั้น</option>
                  {availableActivityClassLevels.map(level => (
                    <option key={level} value={level}>{getLevelLabel(level)}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Activity rows */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 opacity-20">
                  <ClipboardList size={24} className="mb-1" />
                  <p className="text-[10px] font-black uppercase">ไม่พบกิจกรรม</p>
                </div>
              ) : filteredActivities.map(activity => {
                const isSelected = selectedActivityId === activity.id;
                return (
                  <div
                    key={activity.id}
                    onClick={() => handleActivitySelect(activity)}
                    className={`flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 transition-all ${
                      isSelected
                        ? 'bg-emerald-600/10 dark:bg-emerald-500/10'
                        : 'border-slate-100 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Radio dot */}
                    <div className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected ? 'border-emerald-500 bg-white dark:bg-slate-900' : 'border-slate-300 dark:border-white/10'
                    }`}>
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="min-w-0 flex-1 flex items-center gap-1.5 overflow-hidden">
                      {activity.courseCode && (
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black tracking-wider ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                        }`}>{activity.courseCode}</span>
                      )}
                      <p className={`truncate text-[11px] font-black ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {activity.name}
                      </p>
                      <span className={`shrink-0 text-[9px] font-bold ml-auto ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`}>
                        เทอม {formatSemester(activity.semester)}
                      </span>
                    </div>
                    {isSelected && <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Transfer Arrows (activities → enrolled) ── */}
          <div className="relative flex flex-col items-center justify-center gap-2">
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-slate-200 to-transparent dark:via-white/5" />
            <button
              onClick={() => selectedActivity && Swal.fire({ icon: 'info', title: `เลือก: ${selectedActivity.name}`, text: 'ย้ายนักเรียนจากด้านขวาเข้ากิจกรรมนี้', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false })}
              disabled={!selectedActivity}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
                selectedActivity ? 'border-emerald-400 bg-emerald-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-300 opacity-30 dark:border-white/5 dark:bg-white/5 dark:text-slate-700'
              }`}
            >
              <ChevronRight size={16} strokeWidth={3} />
            </button>
            <button
              onClick={() => { setSelectedActivityId(''); setSelectedStudents([]); setSelectedEnrolledIds([]); setSelectedSourceIds([]); }}
              disabled={!selectedActivity}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
                selectedActivity ? 'cursor-pointer border-slate-400 bg-slate-600 text-white shadow-sm hover:bg-slate-500' : 'border-slate-200 bg-white text-slate-300 opacity-30 dark:border-white/5 dark:bg-white/5 dark:text-slate-700'
              }`}
            >
              <ChevronLeft size={16} strokeWidth={3} />
            </button>
          </div>

          {/* ── COLUMN 2: Middle — Enrolled Students ── */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-[#161a27]">

            {/* Header: activity name + count */}
            <div className="shrink-0 border-b border-slate-200 bg-slate-100 dark:border-white/5 dark:bg-black/60">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Users size={13} className="text-emerald-500 shrink-0" />
                  <h3 className="text-[11px] font-black truncate">
                    {selectedActivity ? selectedActivity.name : 'นักเรียนในกิจกรรม'}
                  </h3>
                  {selectedActivity && (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                      {enrolledStudents.length} คน
                    </span>
                  )}
                </div>
                {membersLoading && <RefreshCw size={12} className="animate-spin text-slate-400 shrink-0" />}
              </div>

              {/* Scope pills (horizontal, only if multiple scopes) */}
              {teacherScopes.length > 0 && (
                <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
                  {teacherScopes.map((scope, idx) => {
                    const isActive = selectedTeacherScopeKey === scope.key;
                    const teacher = (teacherMap as any)[scope.teacherId];
                    return (
                      <button
                        key={scope.key}
                        type="button"
                        onClick={() => { setSelectedTeacherScopeKey(scope.key); setActiveRoom('ALL'); }}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black transition-all ${
                          isActive
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                            : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                        }`}
                      >
                        <span className={`text-[8px] font-black w-4 h-4 flex items-center justify-center rounded ${isActive ? 'bg-white/25' : 'bg-slate-100 dark:bg-white/10'}`}>{idx + 1}</span>
                        {teacher?.name || scope.teacherName || 'ไม่ระบุ'}
                        {scope.classLevels.length > 0 && (
                          <span className={`px-1 rounded text-[8px] font-black ${isActive ? 'bg-white/25' : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}`}>
                            {scope.classLevels.map(getLevelLabel).join(', ')}
                          </span>
                        )}
                        {isActive && <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Table + Group sidebar */}
            <div className="flex flex-1 overflow-hidden">

              {/* Table content */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-1 shrink-0 border-b border-slate-200 bg-slate-100 px-4 py-2 text-[9px] font-black uppercase tracking-tighter text-slate-500 dark:border-white/5 dark:bg-white/[0.03] dark:text-white/60 sticky top-0 z-10 shadow-sm">
                  <div
                    className="col-span-1 flex cursor-pointer items-center gap-1 hover:text-emerald-500 transition-colors group"
                    onClick={toggleSelectAllEnrolled}
                  >
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedEnrolledIds.length === enrolledStudents.length && enrolledStudents.length > 0
                        ? 'border-emerald-500 bg-white dark:bg-[#161a27]'
                        : 'border-slate-500 group-hover:border-emerald-500'
                    }`}>
                      {selectedEnrolledIds.length === enrolledStudents.length && enrolledStudents.length > 0 && (
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">ชั้น/ห้อง</div>
                  <div className="col-span-1">เลขที่</div>
                  <div className="col-span-2">รหัส</div>
                  <div className="col-span-6">ชื่อ-นามสกุล</div>
                </div>

                {/* Table body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {!selectedActivity ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-10">
                      <ClipboardList size={40} className="mb-2" />
                      <p className="text-xs font-black uppercase">เลือกกิจกรรมก่อน</p>
                    </div>
                  ) : membersLoading ? (
                    <div className="flex items-center justify-center h-32 text-slate-400">
                      <RefreshCw size={18} className="animate-spin mr-2" />
                      <span className="text-xs font-bold">กำลังโหลด...</span>
                    </div>
                  ) : enrolledStudents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-10">
                      <Users size={40} className="mb-2" />
                      <p className="text-xs font-black uppercase">ยังไม่มีนักเรียน</p>
                    </div>
                  ) : enrolledStudents.map(s => {
                    const isSel = selectedEnrolledIds.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedEnrolledIds(prev => isSel ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                        className={`grid cursor-pointer grid-cols-12 gap-1 items-center border-b px-4 py-1.5 text-[11px] transition-all hover:bg-slate-50 dark:border-white/[0.02] dark:hover:bg-white/[0.03] ${
                          isSel ? 'bg-emerald-600/10 dark:bg-emerald-500/10' : ''
                        }`}
                      >
                        <div className="col-span-1 flex justify-center">
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSel ? 'border-emerald-500 bg-white dark:bg-[#161a27]' : 'border-slate-600'
                          }`}>
                            {isSel && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
                          </div>
                        </div>
                        <div className="col-span-2 font-bold text-slate-700 dark:text-white/80">
                          {getLevelLabel(s.classLevel)}/{s.room || '-'}
                        </div>
                        <div className="col-span-1 font-black">{s.studentNumber || s.number || '-'}</div>
                        <div className="col-span-2 font-mono font-bold text-slate-500 dark:text-white/60">{s.studentId || '-'}</div>
                        <div className="col-span-6 font-bold">
                          {normalizePrefix(s.title || s.prefix)}{s.firstName || ''} {s.lastName || ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Group sidebar — right side of enrolled column */}
              <div className="w-16 shrink-0 flex flex-col border-l border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20">
                <div className="py-2 text-center border-b border-slate-200 dark:border-white/5 font-black text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">กลุ่ม</div>
                <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar no-scrollbar">
                  {Array.from({ length: 20 }, (_, i) => {
                    const groupNum = i + 1;
                    const scope = teacherScopes[i];
                    const isActive = !!scope && selectedTeacherScopeKey === scope.key;
                    return (
                      <button
                        key={groupNum}
                        onClick={() => { if (scope) { setSelectedTeacherScopeKey(scope.key); setActiveRoom('ALL'); } }}
                        title={scope?.teacherName || `กลุ่ม ${groupNum}`}
                        className={`flex-1 w-full py-1 text-[10px] font-black transition-all border-b border-slate-100 dark:border-white/5 ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-inner'
                            : scope
                            ? 'text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer'
                            : 'text-slate-200 dark:text-slate-800 cursor-default'
                        }`}
                      >
                        {groupNum}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* ── Transfer Arrows (enrolled ↔ source) ── */}
          <div className="relative flex flex-col items-center justify-center gap-2">
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-slate-200 to-transparent dark:via-white/5" />
            {/* Enroll (← move to enrolled) */}
            <button
              onClick={enrollSelected}
              disabled={selectedSourceIds.length === 0 || !selectedActivity}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
                selectedSourceIds.length > 0 && selectedActivity
                  ? 'border-emerald-400 bg-emerald-600 text-white shadow-sm cursor-pointer'
                  : 'border-slate-200 bg-white text-slate-300 opacity-30 dark:border-white/5 dark:bg-white/5 dark:text-slate-700'
              }`}
              title={`ลงทะเบียน ${selectedSourceIds.length} คน`}
            >
              <ChevronLeft size={16} strokeWidth={3} />
            </button>
            {/* Unenroll (→ move out) */}
            <button
              onClick={unenrollSelected}
              disabled={selectedEnrolledIds.length === 0}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
                selectedEnrolledIds.length > 0
                  ? 'border-slate-400 bg-slate-500 text-white shadow-lg cursor-pointer hover:bg-slate-400'
                  : 'border-slate-200 bg-white text-slate-300 opacity-30 dark:border-white/5 dark:bg-white/5 dark:text-slate-700'
              }`}
              title={`ถอน ${selectedEnrolledIds.length} คน`}
            >
              <ChevronRight size={16} strokeWidth={3} />
            </button>
            {/* Delete (unenroll via trash icon) */}
            <button
              onClick={unenrollSelected}
              disabled={selectedEnrolledIds.length === 0}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
                selectedEnrolledIds.length > 0
                  ? 'border-rose-500/20 bg-rose-500/10 text-rose-500 cursor-pointer hover:bg-rose-500 hover:text-white'
                  : 'border-slate-200 bg-white text-slate-300 opacity-30 dark:border-white/5 dark:bg-white/5 dark:text-slate-700'
              }`}
            >
              <Trash2 size={14} strokeWidth={2.5} />
            </button>
            {/* Cancel selection */}
            <button
              onClick={() => { setSelectedEnrolledIds([]); setSelectedSourceIds([]); }}
              disabled={selectedEnrolledIds.length === 0 && selectedSourceIds.length === 0}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
                (selectedEnrolledIds.length > 0 || selectedSourceIds.length > 0)
                  ? 'border-slate-400 bg-slate-200 text-slate-600 cursor-pointer hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'
                  : 'border-slate-200 bg-white text-slate-300 opacity-30 dark:border-white/5 dark:bg-white/5 dark:text-slate-700'
              }`}
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* ── COLUMN 3: Source Students ── */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-[#161a27]">
            <div className="flex h-full overflow-hidden">

              {/* Room sidebar */}
              <div className="flex w-12 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-white/5 dark:bg-black/20">
                <div className="shrink-0 border-b border-slate-200 bg-slate-100 py-2 text-center text-[8px] font-black uppercase tracking-tighter dark:border-white/5 dark:bg-white/[0.03]">
                  ห้อง
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar no-scrollbar">
                  <button
                    onClick={() => setActiveRoom('ALL')}
                    className={`w-full py-2 text-[10px] font-black transition-all ${
                      activeRoom === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-emerald-500 dark:text-white/60 dark:hover:text-emerald-400'
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {availableRooms.map(room => (
                    <button
                      key={room}
                      onClick={() => setActiveRoom(room)}
                      className={`w-full py-2 text-[10px] font-black transition-all ${
                        activeRoom === room ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-emerald-500 dark:text-white/60 dark:hover:text-emerald-400'
                      }`}
                    >
                      {room}
                    </button>
                  ))}
                </div>
              </div>

              {/* Student list */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-100 px-3 py-3 dark:border-white/5 dark:bg-black/60">
                  <div className="flex items-center gap-2">
                    <Users size={13} className="text-blue-500" />
                    <h3 className="text-[10px] font-black uppercase tracking-wider">รายชื่อนักเรียน</h3>
                  </div>
                  <span className="text-[9px] font-bold text-slate-400">{sourceStudents.length} คน</span>
                </div>

                {/* Search */}
                <div className="shrink-0 border-b border-slate-200 bg-slate-50 p-2 dark:border-white/5 dark:bg-black/10">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                    <input
                      type="text"
                      placeholder="ค้นหารหัส/ชื่อนักเรียน..."
                      value={sourceSearch}
                      onChange={e => setSourceSearch(e.target.value)}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-12 gap-1 shrink-0 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[8px] font-black uppercase tracking-tighter text-slate-500 dark:border-white/5 dark:bg-white/[0.03] dark:text-white/60 sticky top-0 z-10 shadow-sm">
                  <div
                    className="col-span-1 flex cursor-pointer items-center gap-1 hover:text-emerald-500 transition-colors group"
                    onClick={toggleSelectAllSource}
                  >
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedSourceIds.length === sourceStudents.length && sourceStudents.length > 0
                        ? 'border-emerald-500 bg-white dark:bg-[#161a27]'
                        : 'border-slate-600 group-hover:border-emerald-500'
                    }`}>
                      {selectedSourceIds.length === sourceStudents.length && sourceStudents.length > 0 && (
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    เลือก
                  </div>
                  <div className="col-span-2">ห้อง</div>
                  <div className="col-span-1">เลขที่</div>
                  <div className="col-span-8">ชื่อ-นามสกุล</div>
                </div>

                {/* Student rows */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-6 px-1">
                  {sourceStudents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 opacity-10">
                      <Users size={28} className="mb-1" />
                      <p className="text-[9px] font-black uppercase">ไม่พบนักเรียน</p>
                    </div>
                  ) : sourceStudents.map(s => {
                    const isSel = selectedSourceIds.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSourceIds(prev => isSel ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                        className={`grid cursor-pointer grid-cols-12 gap-1 items-center border-b px-2 py-1.5 text-[10px] transition-all hover:bg-slate-50 dark:border-white/[0.02] dark:hover:bg-white/[0.03] ${
                          isSel ? 'bg-emerald-600/10 dark:bg-emerald-500/10' : ''
                        }`}
                      >
                        <div className="col-span-1 flex justify-center">
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSel ? 'border-emerald-500 bg-white dark:bg-[#161a27]' : 'border-slate-600'
                          }`}>
                            {isSel && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
                          </div>
                        </div>
                        <div className="col-span-2 font-bold text-slate-700 dark:text-white/80">
                          {getLevelLabel(s.classLevel)}/{s.room || '-'}
                        </div>
                        <div className="col-span-1 font-black">{s.studentNumber || s.number || '-'}</div>
                        <div className="col-span-8 font-bold">
                          <span className="mr-1 font-mono text-[9px] text-slate-400 dark:text-white/40">[{s.studentId}]</span>
                          {normalizePrefix(s.title || s.prefix)}{s.firstName || ''} {s.lastName || ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.15); }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}} />
    </MainLayout>
  );
};

export default LearnerActivityStudentManagementPage;
