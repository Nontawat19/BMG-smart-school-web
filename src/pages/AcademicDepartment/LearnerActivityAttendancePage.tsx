import React, { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/Shared/BackButton';
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

interface LearnerActivity {
  id: string;
  courseId: string;
  courseCode?: string;
  name: string;
  description?: string;
  subjectGroup?: string;
  semester?: string | number;
  classId?: string | string[];
  responsibleTeacherIds: string[];
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

interface Enrollment {
  id: string;
  courseId: string;
  studentId: string;
  academicYear?: string;
  semester?: string;
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
  { id: 'present', label: 'มา', color: 'bg-emerald-500' },
  { id: 'late', label: 'สาย', color: 'bg-amber-500' },
  { id: 'leave', label: 'ลา', color: 'bg-blue-500' },
  { id: 'absent', label: 'ขาด', color: 'bg-red-500' },
] as const;

const LearnerActivityAttendancePage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);

  const [activities, setActivities] = useState<LearnerActivity[]>([]);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [selectedSpecialPeriodId, setSelectedSpecialPeriodId] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<LearnerActivity | null>(null);
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
        const q = query(
          collection(db, 'school-settings', schoolId, 'learner-activities'),
          where('responsibleTeacherIds', 'array-contains', currentTeacherId)
        );
        const snap = await getDocs(q);
        const activityList = snap.docs
          .map(activityDoc => ({ id: activityDoc.id, ...activityDoc.data() } as LearnerActivity))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
        setActivities(activityList);

        const periodsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'special-periods'));
        const periods = periodsSnap.docs
          .map(periodDoc => ({ id: periodDoc.id, ...periodDoc.data() } as SpecialPeriod))
          .filter(isLearnerActivitySpecialPeriod)
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

  const currentDayKey = useMemo(() => getDayKey(currentDate), [currentDate]);

  const availableSpecialPeriods = useMemo(() => {
    return specialPeriods.filter(period => isPeriodAvailableOnDay(period, currentDayKey));
  }, [specialPeriods, currentDayKey]);

  const selectedSpecialPeriod = useMemo(() => {
    return availableSpecialPeriods.find(period => period.id === selectedSpecialPeriodId) || null;
  }, [availableSpecialPeriods, selectedSpecialPeriodId]);

  useEffect(() => {
    setSelectedSpecialPeriodId(prev => {
      if (prev && availableSpecialPeriods.some(period => period.id === prev)) return prev;
      return availableSpecialPeriods[0]?.id || '';
    });
  }, [availableSpecialPeriods]);

  useEffect(() => {
    if (!schoolId || !selectedActivity) {
      setStudents([]);
      setAttendance({});
      return;
    }

    const fetchStudentsAndAttendance = async () => {
      setStudentsLoading(true);
      try {
        const [studentSnap, enrollmentSnap] = await Promise.all([
          getDocs(collection(db, 'school-settings', schoolId, 'students')),
          getDocs(query(collection(db, 'school-settings', schoolId, 'enrollments'), where('courseId', '==', selectedActivity.courseId))),
        ]);

        const allStudents = studentSnap.docs
          .map(studentDoc => ({ id: studentDoc.id, ...studentDoc.data() } as Student))
          .filter(student => isActiveStudent(student));
        const membersSnap = await getDocs(collection(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'members'));
        const memberIds = membersSnap.docs
          .map(memberDoc => memberDoc.data() as any)
          .filter(member =>
            String(member.academicYear || '') === activeAcademicYear &&
            isSemesterAvailable(member.semester, activeSemester)
          )
          .map(member => String(member.studentId || ''))
          .filter(Boolean);
        const memberIdSet = new Set(memberIds);
        const enrollments = enrollmentSnap.docs.map(enrollmentDoc => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() } as Enrollment));
        const currentEnrollments = enrollments.filter(enrollment =>
          (!enrollment.academicYear || String(enrollment.academicYear) === activeAcademicYear) &&
          isSemesterAvailable(enrollment.semester, activeSemester)
        );

        const enrolledIds = new Set(currentEnrollments.map(enrollment => enrollment.studentId));
        const targetClasses = normalizeClassIds(selectedActivity.classId);
        const targetClassNames = targetClasses.map(classId => CLASSES[classId] || classId);

        const activityStudents = memberIdSet.size > 0
          ? allStudents.filter(student => memberIdSet.has(student.id))
          : enrolledIds.size > 0
          ? allStudents.filter(student => enrolledIds.has(student.id))
          : allStudents.filter(student => targetClassNames.length === 0 || targetClassNames.includes(String(student.classLevel || '')));

        const sortedStudents = activityStudents.sort(sortStudents);
        setStudents(sortedStudents);

        const initialAttendance: Record<string, 'present' | 'absent' | 'late' | 'leave'> = {};
        sortedStudents.forEach(student => initialAttendance[student.id] = 'present');

        const dateStr = toIsoDate(currentDate);
        const attDocRef = doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'attendance', getAttendanceDocId(activeAcademicYear, activeSemester, dateStr, selectedSpecialPeriod?.id));
        const noPeriodAttDocRef = doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'attendance', getAttendanceDocId(activeAcademicYear, activeSemester, dateStr));
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
  }, [schoolId, selectedActivity, currentDate, activeAcademicYear, activeSemester, selectedSpecialPeriod]);

  const availableActivities = useMemo(() => {
    return activities.filter(activity => isSemesterAvailable(activity.semester, activeSemester));
  }, [activities, activeSemester]);

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

  const handleSaveAttendance = async () => {
    if (!schoolId || !selectedActivity || isSaving) return;
    if (!selectedSpecialPeriod) {
      Swal.fire('ยังไม่ได้กำหนดคาบกิจกรรม', 'กรุณาเพิ่มคาบกิจกรรมพัฒนาผู้เรียนในหน้า “คาบเรียนพิเศษ” หรือเลือกวันที่ตรงกับคาบกิจกรรมก่อนบันทึก', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const dateStr = toIsoDate(currentDate);
      const attDocRef = doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'attendance', getAttendanceDocId(activeAcademicYear, activeSemester, dateStr, selectedSpecialPeriod.id));
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
        academicYear: activeAcademicYear,
        semester: activeSemester,
        activitySemester: normalizeSemester(selectedActivity.semester),
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
              <BackButton to="/academic/hub/activities" className="mb-3" />
              <h1 className="flex items-center gap-3 text-2xl sm:text-3xl font-black">
                <ClipboardCheck className="text-teal-500" size={32} />
                เช็คชื่อกิจกรรมพัฒนาผู้เรียน
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                เช็คชื่อนักเรียนตามกิจกรรมที่ได้รับมอบหมาย
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
          ) : availableActivities.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-10 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
              <AlertCircle className="mx-auto mb-4 text-amber-500" size={46} />
              <h2 className="text-xl font-black">ยังไม่พบกิจกรรมที่เช็คชื่อได้ในภาคเรียนนี้</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">กิจกรรมภาคเรียน {activeSemester} จะแสดงเฉพาะกิจกรรมภาคเรียนเดียวกัน หรือกิจกรรมภาคเรียน 0 ที่ใช้ได้ทั้งสองภาคเรียน</p>
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
                      วันนี้ยังไม่มีคาบกิจกรรมพัฒนาผู้เรียนในหน้าคาบเรียนพิเศษ
                    </div>
                  ) : (
                    <select
                      value={selectedSpecialPeriodId}
                      onChange={e => setSelectedSpecialPeriodId(e.target.value)}
                      className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                    >
                      {availableSpecialPeriods.map(period => (
                        <option key={period.id} value={period.id}>
                          {period.title} ({period.startTime}-{period.endTime})
                        </option>
                      ))}
                    </select>
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
                    {filteredActivities.map(activity => (
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
                          </div>
                          {selectedActivity?.id === activity.id && <CheckCircle2 size={19} className="shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              <section className="lg:col-span-8">
                {!selectedActivity ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-gray-500 dark:border-gray-700 dark:bg-white/[0.03]">
                    <Users size={46} className="mb-4 opacity-40" />
                    เลือกกิจกรรมเพื่อเริ่มเช็คชื่อ
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
                    <div className="border-b border-gray-100 bg-teal-50/60 p-4 dark:border-gray-700 dark:bg-teal-500/10">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-black text-teal-700 dark:text-teal-300">{selectedActivity.name}</h2>
                          <p className="text-xs font-bold text-gray-500">
                            นักเรียน {students.length} คน • {selectedSpecialPeriod ? `${selectedSpecialPeriod.title} ${selectedSpecialPeriod.startTime}-${selectedSpecialPeriod.endTime} น.` : 'ยังไม่พบคาบกิจกรรม'} • {isSubmitted ? 'บันทึกแล้ว' : 'ยังไม่บันทึก'}
                          </p>
                        </div>
                        <button
                          onClick={handleSaveAttendance}
                          disabled={isSaving || students.length === 0 || !selectedSpecialPeriod}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-black text-white shadow-lg shadow-teal-500/20 transition hover:bg-teal-500 disabled:opacity-60"
                        >
                          {isSaving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                          {isSubmitted ? 'อัปเดตข้อมูล' : 'บันทึกการเช็คชื่อ'}
                        </button>
                      </div>
                      <div className="mt-4 grid grid-cols-4 gap-2">
                        <SummaryChip label="มา" value={summary.present} className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" />
                        <SummaryChip label="สาย" value={summary.late} className="bg-amber-500/10 text-amber-600 dark:text-amber-300" />
                        <SummaryChip label="ลา" value={summary.leave} className="bg-blue-500/10 text-blue-600 dark:text-blue-300" />
                        <SummaryChip label="ขาด" value={summary.absent} className="bg-red-500/10 text-red-600 dark:text-red-300" />
                      </div>
                    </div>

                    <div className="border-b border-gray-100 p-4 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                        <input
                          value={studentSearch}
                          onChange={e => setStudentSearch(e.target.value)}
                          placeholder="ค้นหาชื่อนักเรียน รหัส หรือชั้น/ห้อง..."
                          className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                        />
                      </div>
                    </div>

                    <div className="p-4">
                      {studentsLoading ? (
                        <div className="py-16 text-center text-gray-500">กำลังโหลดรายชื่อนักเรียน...</div>
                      ) : filteredStudents.length === 0 ? (
                        <div className="py-16 text-center text-gray-500">ไม่พบนักเรียนในกิจกรรมนี้</div>
                      ) : (
                        <div className="space-y-3">
                          {filteredStudents.map((student, index) => (
                            <article key={student.id} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-[#1e1f21] sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="w-6 text-center text-xs font-black text-gray-400">{index + 1}</span>
                                <img src={student.profileImageUrl || avatarUrl(student)} className="h-11 w-11 rounded-full object-cover" alt="" />
                                <div className="min-w-0">
                                  <p className="truncate font-black text-gray-900 dark:text-white">{student.title || student.prefix || ''}{student.firstName || ''} {student.lastName || ''}</p>
                                  <p className="truncate text-xs text-gray-500">รหัส: {student.studentId || '-'} | ชั้น {student.classLevel || '-'}/{student.room || '-'}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-1 rounded-xl border border-gray-100 bg-white p-1 dark:border-gray-700 dark:bg-black/20 sm:flex">
                                {ATTENDANCE_OPTIONS.map(option => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => toggleStatus(student.id, option.id)}
                                    className={`h-9 rounded-lg px-3 text-xs font-black transition ${attendance[student.id] === option.id ? `${option.color} text-white shadow-sm` : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'}`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
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

const normalizeSemester = (semester?: string | number) => String(semester ?? '').trim() || '0';

const isSemesterAvailable = (itemSemester: string | number | undefined, activeSemester: string) => {
  const normalized = normalizeSemester(itemSemester);
  return normalized === '0' || normalized === activeSemester;
};

const formatSemester = (semester?: string | number) => {
  const normalized = normalizeSemester(semester);
  return normalized === '0' ? 'ทั้งสองภาคเรียน' : normalized;
};

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

const isLearnerActivitySpecialPeriod = (period: SpecialPeriod) => {
  const title = String(period.title || '').trim();
  const normalizedTitle = title.toLowerCase();
  const excludedKeywords = ['ชุมนุม', 'โฮมรูม', 'พักกลางวัน', 'พักเที่ยง'];
  if (excludedKeywords.some(keyword => normalizedTitle.includes(keyword))) return false;

  const activityKeywords = [
    'กิจกรรมพัฒนาผู้เรียน',
    'กิจกรรมฯ',
    'ลูกเสือ',
    'เนตรนารี',
    'ยุวกาชาด',
    'ผู้บำเพ็ญประโยชน์',
    'แนะแนว',
  ];

  return normalizedTitle === 'กิจกรรม' || activityKeywords.some(keyword => normalizedTitle.includes(keyword));
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
  const status = String(student.status || 'เรียนอยู่').trim();
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
