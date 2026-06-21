import React, { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/Shared/BackButton';
import ProfileAvatar from '@/components/Shared/ProfileAvatar';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { CLASSES } from '@/utils/schoolUtils';
import { collection, doc, getDoc, getDocs, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { AlertCircle, Calendar, CheckCircle2, ChevronLeft, ClipboardCheck, Clock, LayoutGrid, RefreshCw, Save, Search, Users } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import Swal from 'sweetalert2';
import { Link, useSearchParams } from 'react-router-dom';
import { usePwaMode } from '@/hooks/usePwaMode';
import { formatSemesterLabel, normalizeSemesterValue } from '@/utils/semesterUtils';
import {
  LearnerActivityTeacherScope,
  buildLearnerActivityAttendanceDocId,
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
  subjectGroup?: string;
  semester?: string | number;
  classId?: string | string[];
  specialPeriodId?: string;
  specialPeriodTitle?: string;
  specialPeriodDay?: string;
  specialPeriodStartTime?: string;
  specialPeriodEndTime?: string;
  responsibleTeacherIds: string[];
  teacherScopes?: LearnerActivityTeacherScope[];
}

interface Course {
  id: string;
  classId?: string | string[];
  teacherAssignments?: any[];
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
}


interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
  linkedPeriodId?: string;
}

const ATTENDANCE_OPTIONS = [
  { id: 'present', label: 'มา', color: 'bg-emerald-500', activeClass: 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm ring-1 ring-emerald-200' },
  { id: 'late', label: 'สาย', color: 'bg-amber-500', activeClass: 'bg-white dark:bg-gray-700 text-amber-600 shadow-sm ring-1 ring-amber-200' },
  { id: 'leave', label: 'ลา', color: 'bg-blue-500', activeClass: 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm ring-1 ring-blue-200' },
  { id: 'absent', label: 'ขาด', color: 'bg-red-500', activeClass: 'bg-white dark:bg-gray-700 text-red-600 shadow-sm ring-1 ring-red-200' },
] as const;

const LearnerActivityAttendancePage: React.FC = () => {
  const isPwaMode = usePwaMode();
  const [searchParams] = useSearchParams();
  const queryPeriodId = searchParams.get('periodId') || searchParams.get('specialPeriodId') || '';
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);

  const [activities, setActivities] = useState<LearnerActivity[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [selectedSpecialPeriodId, setSelectedSpecialPeriodId] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<LearnerActivity | null>(null);
  const [selectedTeacherScopeKey, setSelectedTeacherScopeKey] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent' | 'late' | 'leave'>>({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activitySearch, setActivitySearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const currentTeacher = useMemo(() => {
    return Object.values(teacherMap || {}).find((teacher: any) => teacher.uid === (currentUser as any)?.uid || teacher.id === (currentUser as any)?.uid) as any;
  }, [teacherMap, currentUser]);

  const currentTeacherId = currentTeacher?.id || (currentUser as any)?.uid || '';
  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedActivity?.courseId) || null,
    [courses, selectedActivity?.courseId]
  );
  const teacherScopes = useMemo(() => {
    if (!selectedActivity) return [];
    return deriveTeacherScopesFromCourse(selectedActivity, selectedCourse, teacherMap as any)
      .filter(scope => scopeIncludesTeacher(scope, currentTeacherId));
  }, [selectedActivity, selectedCourse, teacherMap, currentTeacherId]);
  const selectedTeacherScope = useMemo(
    () => teacherScopes.find(scope => scope.key === selectedTeacherScopeKey) || null,
    [teacherScopes, selectedTeacherScopeKey]
  );
  const activeAcademicYear = String(calendarState.academicYear || new Date().getFullYear() + 543);
  const activeSemester = useMemo(() => {
    const dateStr = toIsoDate(currentDate);
    const matchedTerm = calendarState.terms.find(term => term.startDate && term.endDate && dateStr >= term.startDate && dateStr <= term.endDate);
    return matchedTerm?.id === 'term2' ? '2' : '1';
  }, [calendarState.terms, currentDate]);

  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') {
      dispatch(fetchTeachersMap(schoolId) as any);
    }
  }, [schoolId, teacherMapStatus, dispatch]);

  useEffect(() => {
    if (schoolId && calendarState.status === 'idle') {
      dispatch(fetchCalendar(schoolId) as any);
    }
  }, [schoolId, calendarState.status, dispatch]);

  useEffect(() => {
    if (!schoolId || !currentTeacherId) return;

    const fetchActivities = async () => {
      setLoading(true);
      try {
        const [snap, courseSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'school-settings', schoolId, 'learner-activities'),
            where('responsibleTeacherIds', 'array-contains', currentTeacherId)
          )),
          getDocs(collection(db, 'school-settings', schoolId, 'courses')),
        ]);
        const activityList = snap.docs
          .map(activityDoc => ({ id: activityDoc.id, ...activityDoc.data() } as LearnerActivity))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
        setActivities(activityList);
        setCourses(courseSnap.docs.map(courseDoc => ({ id: courseDoc.id, ...courseDoc.data() } as Course)));

        const periodsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'special-periods'));
        const periods = periodsSnap.docs
          .map(periodDoc => ({ id: periodDoc.id, ...periodDoc.data() } as SpecialPeriod))
          .filter(isSelectableActivityPeriod)
          .sort(sortSpecialPeriods);
        setSpecialPeriods(periods);
      } catch (error) {
        console.error('Error fetching learner activities:', error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดกิจกรรมพัฒนาผู้เรียนได้', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [schoolId, currentTeacherId]);

  useEffect(() => {
    if (teacherScopes.length === 0) {
      setSelectedTeacherScopeKey('');
      return;
    }
    if (!teacherScopes.some(scope => scope.key === selectedTeacherScopeKey)) {
      setSelectedTeacherScopeKey(teacherScopes[0].key);
    }
  }, [teacherScopes, selectedTeacherScopeKey]);

  const currentDateEvent = useMemo(() => {
    return calendarState.rawData?.events?.[toIsoDate(currentDate)];
  }, [calendarState.rawData, currentDate]);

  const effectiveDayKey = useMemo(() => {
    return currentDateEvent?.type === 'schoolDay' && currentDateEvent.scheduleDay
      ? currentDateEvent.scheduleDay
      : getDayKey(currentDate);
  }, [currentDate, currentDateEvent]);

  const isCompensationScheduleDay = currentDateEvent?.type === 'schoolDay' && Boolean(currentDateEvent.scheduleDay);

  const availableSpecialPeriods = useMemo(() => {
    return specialPeriods.filter(period => {
      // queryPeriodId always takes priority — ensure it's always available
      if (queryPeriodId && period.id === queryPeriodId) return true;
      if (selectedActivity?.specialPeriodId && period.id !== selectedActivity.specialPeriodId) return false;
      if (selectedActivity?.specialPeriodId && period.id === selectedActivity.specialPeriodId) return true;
      return isPeriodAvailableOnDay(period, effectiveDayKey);
    });
  }, [specialPeriods, effectiveDayKey, selectedActivity?.specialPeriodId, queryPeriodId]);

  const selectedSpecialPeriod = useMemo(() => {
    return availableSpecialPeriods.find(period => period.id === selectedSpecialPeriodId) || null;
  }, [availableSpecialPeriods, selectedSpecialPeriodId]);

  // Keep selectedSpecialPeriodId in sync with queryPeriodId if it changes
  useEffect(() => {
    if (queryPeriodId) {
      setSelectedSpecialPeriodId(queryPeriodId);
    }
  }, [queryPeriodId]);

  // Fallback to first available period if the current selection is invalid
  useEffect(() => {
    if (availableSpecialPeriods.length > 0 && !availableSpecialPeriods.some(p => p.id === selectedSpecialPeriodId)) {
      setSelectedSpecialPeriodId(availableSpecialPeriods[0].id);
    }
  }, [availableSpecialPeriods, selectedSpecialPeriodId]);

  useEffect(() => {
    if (!schoolId || !selectedActivity) {
      setStudents([]);
      setAttendance({});
      return;
    }

    const fetchStudentsAndAttendance = async () => {
      setStudentsLoading(true);
      try {
        const [studentSnap, membersSnap] = await Promise.all([
          getDocs(collection(db, 'school-settings', schoolId, 'students')),
          getDocs(collection(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'members')),
        ]);

        const allStudents = studentSnap.docs
          .map(studentDoc => ({ id: studentDoc.id, ...studentDoc.data() } as Student))
          .filter(student => isActiveStudent(student));

        const allMemberData = membersSnap.docs.map(memberDoc => memberDoc.data() as any);

        const scopeMatch = (member: any) =>
          !selectedTeacherScope ||
          String(member.teacherScopeKey || '') === selectedTeacherScope.key ||
          scopeIncludesTeacher(selectedTeacherScope, member.teacherId) ||
          (Array.isArray(member.teacherIds) && member.teacherIds.some((id: string) => selectedTeacherScope.teacherIds.includes(String(id))));

        // Load members for current year + semester only — no cross-year fallback
        const memberIds = allMemberData
          .filter(member =>
            String(member.academicYear || '') === activeAcademicYear &&
            isSemesterAvailable(member.semester, activeSemester) &&
            scopeMatch(member)
          )
          .map(member => String(member.studentId || ''))
          .filter(Boolean);

        const memberIdSet = new Set(memberIds);
        // Student list is strictly from members configured in learner-activity-students page
        const activityStudents = allStudents.filter(student => memberIdSet.has(student.id));

        const sortedStudents = activityStudents.sort(sortStudents);
        setStudents(sortedStudents);

        const initialAttendance: Record<string, 'present' | 'absent' | 'late' | 'leave'> = {};
        sortedStudents.forEach(student => initialAttendance[student.id] = 'present');

        const dateStr = toIsoDate(currentDate);
        const attDocRef = doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'attendance', buildLearnerActivityAttendanceDocId(activeAcademicYear, activeSemester, dateStr, selectedSpecialPeriod?.id, selectedTeacherScope?.key));
        const noPeriodAttDocRef = doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'attendance', buildLearnerActivityAttendanceDocId(activeAcademicYear, activeSemester, dateStr, undefined, selectedTeacherScope?.key));
        const legacyAttDocRef = doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'attendance', dateStr);
        const attSnap = await getDoc(attDocRef);
        const noPeriodAttSnap = attSnap.exists() ? null : await getDoc(noPeriodAttDocRef);
        const legacyAttSnap = attSnap.exists() || noPeriodAttSnap?.exists() ? null : await getDoc(legacyAttDocRef);

        if (attSnap.exists() || noPeriodAttSnap?.exists() || legacyAttSnap?.exists()) {
          const data = attSnap.exists() ? attSnap.data() : noPeriodAttSnap?.exists() ? noPeriodAttSnap.data() : legacyAttSnap?.data();
          setAttendance({ ...initialAttendance, ...(data?.records || {}) });
          setIsSubmitted(true);
        } else {
          setAttendance(initialAttendance);
          setIsSubmitted(false);
        }
      } catch (error) {
        console.error('Error fetching learner activity students:', error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อนักเรียนได้', 'error');
      } finally {
        setStudentsLoading(false);
      }
    };

    fetchStudentsAndAttendance();
  }, [schoolId, selectedActivity, currentDate, activeAcademicYear, activeSemester, selectedSpecialPeriod, selectedTeacherScope]);

  const termActivities = useMemo(() => {
    return activities.filter(activity => isSemesterAvailable(activity.semester, activeSemester));
  }, [activities, activeSemester]);

  const availableActivities = useMemo(() => {
    if (queryPeriodId) {
      // Show activities specifically linked to this period
      const linked = termActivities.filter(a => a.specialPeriodId === queryPeriodId);
      // Fall back to all assigned activities if none are linked — teacher can still check in
      return linked.length > 0 ? linked : termActivities;
    }
    return termActivities;
  }, [termActivities, queryPeriodId]);

  useEffect(() => {
    setSelectedActivity(prev => {
      if (prev && availableActivities.some(activity => activity.id === prev.id)) return prev;
      return availableActivities.length === 1 ? availableActivities[0] : null;
    });
  }, [availableActivities]);

  const filteredActivities = useMemo(() => {
    const term = activitySearch.toLowerCase();
    return availableActivities.filter(activity => {
      const text = `${activity.courseCode || ''} ${activity.name || ''} ${activity.description || ''}`.toLowerCase();
      return !term || text.includes(term);
    });
  }, [availableActivities, activitySearch]);

  const filteredStudents = useMemo(() => {
    const term = studentSearch.toLowerCase();
    return students.filter(student => {
      const text = `${student.studentId || ''} ${student.firstName || ''} ${student.lastName || ''} ${student.classLevel || ''}/${student.room || ''}`.toLowerCase();
      return !term || text.includes(term);
    });
  }, [students, studentSearch]);

  const summary = useMemo(() => {
    return students.reduce((acc, student) => {
      const status = attendance[student.id] || 'present';
      acc[status] += 1;
      return acc;
    }, { present: 0, late: 0, leave: 0, absent: 0 });
  }, [students, attendance]);

  const toggleStatus = (studentId: string, status: 'present' | 'absent' | 'late' | 'leave') => {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  const getStatusStyle = (status?: string) => {
    switch (status) {
      case 'present': return 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-900/5';
      case 'late': return 'border-yellow-200 dark:border-yellow-900 bg-yellow-50/30 dark:bg-yellow-900/5';
      case 'leave': return 'border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/5';
      case 'absent': return 'border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/5';
      default: return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f]';
    }
  };

  const getStatusDot = (status?: string) => (
    status === 'present' ? 'bg-green-500' :
      status === 'late' ? 'bg-yellow-500' :
        status === 'leave' ? 'bg-blue-500' : 'bg-red-500'
  );

  const handleSaveAttendance = async () => {
    if (!schoolId || !selectedActivity || isSaving) return;
    if (teacherScopes.length > 0 && !selectedTeacherScope) {
      Swal.fire('ยังไม่ได้เลือกชุดครู/ห้อง', 'กรุณาเลือกชุดครูหรือห้องรับผิดชอบก่อนบันทึกการเช็คชื่อ', 'warning');
      return;
    }
    if (!selectedSpecialPeriod) {
      Swal.fire('ยังไม่ได้กำหนดคาบกิจกรรม', 'กรุณาเพิ่มคาบกิจกรรมพัฒนาผู้เรียนในหน้า “คาบเรียนพิเศษ” หรือเลือกวันที่ตรงกับคาบกิจกรรมก่อนบันทึก', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const dateStr = toIsoDate(currentDate);
      const attDocRef = doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'attendance', buildLearnerActivityAttendanceDocId(activeAcademicYear, activeSemester, dateStr, selectedSpecialPeriod.id, selectedTeacherScope?.key));
      await setDoc(attDocRef, {
        schoolId,
        activityId: selectedActivity.id,
        courseId: selectedActivity.courseId,
        courseCode: selectedActivity.courseCode || '',
        activityName: selectedActivity.name,
        records: attendance,
        studentCount: students.length,
        summary,
        date: dateStr,
        teacherId: currentTeacherId,
        teacherName: currentTeacher?.name || (currentUser as any)?.displayName || '',
        teacherScopeKey: selectedTeacherScope?.key || '',
        teacherScopeLabel: selectedTeacherScope ? formatTeacherScopeLabel(selectedTeacherScope, teacherMap as any) : '',
        teacherScopeTeacherIds: selectedTeacherScope?.teacherIds || [],
        targetClassLevels: selectedTeacherScope?.classLevels || [],
        targetRoomIds: selectedTeacherScope?.roomIds || [],
        academicYear: activeAcademicYear,
        semester: activeSemester,
        activitySemester: normalizeSemesterValue(selectedActivity.semester),
        specialPeriodId: selectedSpecialPeriod.id,
        specialPeriodTitle: selectedSpecialPeriod.title,
        specialPeriodDay: selectedSpecialPeriod.day || 'all',
        startTime: selectedSpecialPeriod.startTime,
        endTime: selectedSpecialPeriod.endTime,
        updatedAt: Timestamp.now(),
        updatedBy: (currentUser as any)?.uid || '',
      }, { merge: true });

      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1400, showConfirmButton: false });
      setIsSubmitted(true);
    } catch (error) {
      console.error('Error saving learner activity attendance:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกการเช็คชื่อได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen p-4 sm:p-6 text-gray-900 dark:text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <BackButton to="/academic/hub/attendance" className="mb-3" />
              <h1 className="flex items-center gap-3 text-2xl sm:text-3xl font-black">
                <ClipboardCheck className="text-teal-500" size={32} />
                เช็คชื่อกิจกรรมพัฒนาผู้เรียน
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                เช็คชื่อตามคาบกิจกรรมที่กำหนดในหน้าคาบเรียนพิเศษ
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
              <button onClick={() => setCurrentDate(shiftDate(currentDate, -1))} className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/5">
                <ChevronLeft size={20} />
              </button>
              <div className="flex min-w-0 items-center gap-2 px-2 text-sm font-bold">
                <Calendar size={18} className="text-gray-500" />
                <span className="truncate">{currentDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <button onClick={() => setCurrentDate(shiftDate(currentDate, 1))} className="inline-flex h-10 w-10 rotate-180 items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/5">
                <ChevronLeft size={20} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center text-gray-500 dark:border-gray-700 dark:bg-[#2a2b2f]">กำลังโหลดกิจกรรม...</div>
          ) : termActivities.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-10 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
              <AlertCircle className="mx-auto mb-4 text-amber-500" size={46} />
              <h2 className="text-xl font-black">ยังไม่พบกิจกรรมที่เช็คชื่อได้ในภาคเรียนนี้</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">กิจกรรมภาคเรียน {activeSemester} จะแสดงเฉพาะกิจกรรมภาคเรียนเดียวกัน หรือกิจกรรมแบบทั้งสองภาคเรียน</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <aside className="lg:col-span-4">
                <div className="mb-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-gray-700 dark:text-gray-200">
                    <Clock size={18} className="text-teal-500" />
                    คาบกิจกรรมวันนี้
                  </h3>
                  {availableSpecialPeriods.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                      {selectedActivity?.specialPeriodTitle
                        ? `วันนี้ไม่ตรงกับคาบ ${selectedActivity.specialPeriodTitle} ที่ผูกไว้กับกิจกรรมนี้`
                        : 'วันนี้ยังไม่มีคาบกิจกรรมพัฒนาผู้เรียนในหน้าคาบเรียนพิเศษ'}
                    </div>
                  ) : (
                    <>
                      <select
                        value={selectedSpecialPeriodId}
                        onChange={e => setSelectedSpecialPeriodId(e.target.value)}
                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                      >
                        {availableSpecialPeriods.map(period => (
                          <option key={period.id} value={period.id}>
                            {period.title} ({formatSpecialPeriodDay(period.day)} {period.startTime}-{period.endTime})
                          </option>
                        ))}
                      </select>
                      {isCompensationScheduleDay && (
                        <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                          วันนี้เป็นวันเรียนชดเชย ใช้ตาราง{formatSpecialPeriodDay(effectiveDayKey)} จากปฏิทินโรงเรียน
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                    <input
                      value={activitySearch}
                      onChange={e => setActivitySearch(e.target.value)}
                      placeholder="ค้นหากิจกรรม..."
                      className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                    />
                  </div>
                  <div className="space-y-2">
                    {filteredActivities.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-xs font-bold border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                        ไม่พบกิจกรรมสำหรับคาบพิเศษนี้
                      </div>
                    ) : (
                      filteredActivities.map(activity => (
                        <button
                          key={activity.id}
                          type="button"
                          onClick={() => setSelectedActivity(activity)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${selectedActivity?.id === activity.id ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' : 'border-gray-100 hover:border-teal-200 dark:border-gray-700 dark:hover:border-teal-500/40'}`}
                        >
                          <div className="flex items-start gap-3">
                            <LayoutGrid size={20} className="mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black">{activity.courseCode ? `${activity.courseCode} ` : ''}{activity.name}</p>
                              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">ภาคเรียน {formatSemester(activity.semester)} • {formatClassIds(activity.classId)}</p>
                              <p className="mt-1 truncate text-[11px] font-bold text-teal-600 dark:text-teal-300">
                                {activity.specialPeriodTitle
                                  ? `คาบเช็คชื่อ: ${activity.specialPeriodTitle} (${formatSpecialPeriodDay(activity.specialPeriodDay)} ${activity.specialPeriodStartTime || '-'}-${activity.specialPeriodEndTime || '-'})`
                                  : 'ยังไม่ได้ผูกคาบเช็คชื่อ'}
                              </p>
                            </div>
                            {selectedActivity?.id === activity.id && <CheckCircle2 size={19} className="shrink-0" />}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </aside>

              <section className="lg:col-span-8">
                {!selectedActivity ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-gray-500 dark:border-gray-700 dark:bg-white/[0.03]">
                    <Users size={46} className="mb-4 opacity-40" />
                    {queryPeriodId ? "ไม่พบกิจกรรมสำหรับคาบเรียนพิเศษนี้" : "เลือกกิจกรรมเพื่อเริ่มเช็คชื่อ"}
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-black text-teal-700 dark:text-teal-300">
                            {selectedActivity.name}
                          </h2>
                          <p className="truncate text-xs font-bold text-gray-500">
                            นักเรียน {students.length} คน • {selectedSpecialPeriod ? `${selectedSpecialPeriod.title} ${formatSpecialPeriodDay(selectedSpecialPeriod.day)} ${selectedSpecialPeriod.startTime}-${selectedSpecialPeriod.endTime} น.` : 'ยังไม่พบคาบกิจกรรม'} • {isSubmitted ? 'บันทึกแล้ว' : 'ยังไม่บันทึก'}
                          </p>
                          {teacherScopes.length > 0 && (
                            <p className="mt-1 truncate text-xs font-bold text-teal-600 dark:text-teal-300">
                              {selectedTeacherScope ? formatTeacherScopeLabel(selectedTeacherScope, teacherMap as any) : 'เลือกชุดครู/ห้องรับผิดชอบ'}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 sm:items-end">
                          {teacherScopes.length > 0 && (
                            <select
                              value={selectedTeacherScopeKey}
                              onChange={e => setSelectedTeacherScopeKey(e.target.value)}
                              className="h-10 min-w-[280px] rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                            >
                              {teacherScopes.map(scope => (
                                <option key={scope.key} value={scope.key}>
                                  {formatTeacherScopeLabel(scope, teacherMap as any)}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            onClick={handleSaveAttendance}
                            disabled={isSaving || students.length === 0 || !selectedSpecialPeriod}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-black text-white shadow-lg shadow-teal-500/20 transition hover:bg-teal-500 disabled:opacity-60"
                          >
                            {isSaving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                            {isSubmitted ? 'อัปเดตข้อมูล' : 'บันทึกการเช็คชื่อ'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <SummaryChip label="มา" value={summary.present} className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" />
                      <SummaryChip label="สาย" value={summary.late} className="bg-amber-500/10 text-amber-600 dark:text-amber-300" />
                      <SummaryChip label="ลา" value={summary.leave} className="bg-blue-500/10 text-blue-600 dark:text-blue-300" />
                      <SummaryChip label="ขาด" value={summary.absent} className="bg-red-500/10 text-red-600 dark:text-red-300" />
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                      <input
                        value={studentSearch}
                        onChange={e => setStudentSearch(e.target.value)}
                        placeholder="ค้นหาชื่อนักเรียน รหัส หรือชั้น/ห้อง..."
                        className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                      />
                    </div>

                    {studentsLoading ? (
                      <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-gray-500 dark:border-gray-700 dark:bg-[#2a2b2f]">กำลังโหลดรายชื่อนักเรียน...</div>
                    ) : filteredStudents.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-500 dark:border-gray-700 dark:bg-[#2a2b2f]">ไม่พบนักเรียนในกิจกรรมนี้</div>
                    ) : (
                      <div className={isPwaMode ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"}>
                        {filteredStudents.map((student) => {
                          const status = attendance[student.id] || 'present';

                          return (
                            <div
                              key={student.id}
                              className={`relative group rounded-2xl border-2 transition-all duration-300 hover:shadow-lg min-w-0 overflow-hidden ${isPwaMode ? 'p-3' : 'p-4'} ${getStatusStyle(status)}`}
                            >
                              <div className={isPwaMode ? "flex flex-col gap-3" : "flex flex-row sm:flex-col items-center gap-4"}>
                                <div className={isPwaMode ? "flex items-center gap-3 min-w-0" : "contents"}>
                                  <div className="relative flex-shrink-0">
                                    <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block relative">
                                      <div className="absolute -inset-1 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur"></div>
                                      <ProfileAvatar
                                        src={student.profileImageUrl || avatarUrl(student)}
                                        alt={student.firstName || 'student'}
                                        className={`relative border-4 border-white dark:border-[#2a2b2f] shadow-sm ${isPwaMode ? 'w-14 h-14' : 'w-16 h-16 sm:w-24 sm:h-24'}`}
                                        imageClassName="transition-transform group-hover:scale-105"
                                      />
                                    </Link>
                                    <div className={`absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-white dark:border-[#2a2b2f] shadow-sm ${getStatusDot(status)}`} />
                                  </div>

                                  <div className={`flex-grow min-w-0 overflow-hidden w-full space-y-0.5 ${isPwaMode ? 'text-left' : 'text-left sm:text-center'}`}>
                                    <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block transition-colors min-w-0">
                                      <h3 className={`text-gray-900 dark:text-white font-bold mb-0.5 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors ${isPwaMode ? 'mt-0 text-sm' : 'mt-2 sm:mt-0 text-sm sm:text-base'}`}>
                                        {student.title || student.prefix || ''}{student.firstName || ''} {student.lastName || ''}
                                      </h3>
                                    </Link>
                                    <div className={`text-gray-500 dark:text-gray-400 w-full truncate ${isPwaMode ? 'mt-1' : 'mt-1 sm:mt-1.5'}`}>
                                      <span className={`inline-block max-w-full bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md font-mono truncate ${isPwaMode ? 'text-[10px]' : 'text-[10px] sm:text-[11px]'}`}>
                                        รหัส {student.studentId || '-'} | ชั้น {student.classLevel || '-'}/{student.room || '-'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="w-full min-w-0 grid grid-cols-4 gap-1.5 mt-0">
                                  {ATTENDANCE_OPTIONS.map(option => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => toggleStatus(student.id, option.id)}
                                      className={`flex min-w-0 items-center justify-center py-2 rounded-xl font-bold transition-all duration-200 ${isPwaMode ? 'text-[11px]' : 'text-xs'} ${status === option.id
                                        ? `${option.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f] transform scale-105 shadow-md`
                                        : 'bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'
                                      }`}
                                    >
                                      <span className="truncate">{option.label}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

const SummaryChip = ({ label, value, className }: { label: string; value: number; className: string }) => (
  <div className={`rounded-2xl px-3 py-2 text-center ${className}`}>
    <div className="text-lg font-black">{value}</div>
    <div className="text-[11px] font-black">{label}</div>
  </div>
);

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDate = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const normalizeClassIds = (classId?: string | string[]) => {
  if (!classId) return [];
  return (Array.isArray(classId) ? classId : [classId]).map(item => String(item).trim()).filter(Boolean);
};

const isSemesterAvailable = (itemSemester: string | number | undefined, activeSemester: string) => {
  const normalized = normalizeSemesterValue(itemSemester);
  return normalized === '0' || normalized === activeSemester;
};

const formatSemester = (semester?: string | number) => formatSemesterLabel(semester);

const getAttendanceDocId = (academicYear: string, semester: string, dateStr: string, specialPeriodId?: string) => {
  const baseId = `${academicYear}_S${semester}_${dateStr}`;
  return specialPeriodId ? `${baseId}_${sanitizeDocId(specialPeriodId)}` : baseId;
};

const sanitizeDocId = (value: string) => {
  return String(value || '').replace(/[\/#?[\]]/g, '_');
};

const getDayKey = (date: Date) => {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
};

const isPeriodAvailableOnDay = (period: SpecialPeriod, dayKey: string) => {
  return !period.day || period.day === 'all' || period.day === dayKey;
};

const formatSpecialPeriodDay = (day?: string) => {
  const labels: Record<string, string> = {
    all: 'ทุกวัน',
    mon: 'วันจันทร์',
    tue: 'วันอังคาร',
    wed: 'วันพุธ',
    thu: 'วันพฤหัสบดี',
    fri: 'วันศุกร์',
    sat: 'วันเสาร์',
    sun: 'วันอาทิตย์',
  };
  return labels[day || 'all'] || day || 'ทุกวัน';
};

const isSelectableActivityPeriod = (period: SpecialPeriod) => {
  const normalizedTitle = String(period.title || '').trim().toLowerCase();
  const excludedKeywords = ['ชุมนุม', 'โฮมรูม', 'พักกลางวัน', 'พักเที่ยง'];
  if (excludedKeywords.some(keyword => normalizedTitle.includes(keyword))) return false;
  return true;
};

const sortSpecialPeriods = (a: SpecialPeriod, b: SpecialPeriod) => {
  const timeCompare = normalizeTimeForSort(a.startTime).localeCompare(normalizeTimeForSort(b.startTime));
  if (timeCompare !== 0) return timeCompare;
  return String(a.title || '').localeCompare(String(b.title || ''), 'th');
};

const normalizeTimeForSort = (time: string) => {
  return String(time || '').replace(':', '.').padStart(5, '0');
};

const formatClassIds = (classId?: string | string[]) => {
  const classes = normalizeClassIds(classId).map(item => CLASSES[item] || item);
  return classes.length > 0 ? classes.join(', ') : 'ทุกระดับชั้น';
};

const isActiveStudent = (student: Student) => {
  const status = String(student.status || 'กำลังศึกษาอยู่').trim();
  return !['ย้าย', 'ลาออก', 'จำหน่าย', 'สำเร็จการศึกษา', 'ศิษย์เก่า'].includes(status);
};

const sortStudents = (a: Student, b: Student) => {
  const classCompare = String(a.classLevel || '').localeCompare(String(b.classLevel || ''), 'th');
  if (classCompare !== 0) return classCompare;
  const roomCompare = String(a.room || '').localeCompare(String(b.room || ''), 'th', { numeric: true });
  if (roomCompare !== 0) return roomCompare;
  return (Number(a.studentNumber || a.number || 0) || 0) - (Number(b.studentNumber || b.number || 0) || 0);
};

const avatarUrl = (student: Student) => {
  const name = encodeURIComponent(`${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student');
  return `https://ui-avatars.com/api/?name=${name}&background=14b8a6&color=fff`;
};

export default LearnerActivityAttendancePage;
