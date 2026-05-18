import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { CalendarDays, Loader2, School, UserRound } from 'lucide-react';
import { RootState } from '@/store';
import { firestore as db } from '@/firebase';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import PersonalScheduleTable from '@/components/Schedule/PersonalScheduleTable';
import { normalizePeriodSettings } from '@/utils/scheduleDisplayUtils';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { CLASSES } from '@/utils/schoolUtils';

interface PeriodSetting {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
  isFixed?: boolean;
  index?: number;
}

const DEFAULT_PERIODS: PeriodSetting[] = [
  { id: 'homeroom', label: 'โฮมรูม', startTime: '08.30', endTime: '08.40', isTeachingPeriod: false, isFixed: true, index: 0 },
  { id: 'period-1', label: 'คาบที่ 1', startTime: '08.40', endTime: '09.30', isTeachingPeriod: true, index: 1 },
  { id: 'period-2', label: 'คาบที่ 2', startTime: '09.30', endTime: '10.20', isTeachingPeriod: true, index: 2 },
  { id: 'period-3', label: 'คาบที่ 3', startTime: '10.20', endTime: '11.10', isTeachingPeriod: true, index: 3 },
  { id: 'period-4', label: 'คาบที่ 4', startTime: '11.10', endTime: '12.00', isTeachingPeriod: true, index: 4 },
  { id: 'lunch', label: 'พักกลางวัน', startTime: '12.00', endTime: '13.00', isTeachingPeriod: false, isFixed: true, index: 5 },
  { id: 'period-5', label: 'คาบที่ 5', startTime: '13.00', endTime: '13.50', isTeachingPeriod: true, index: 6 },
  { id: 'period-6', label: 'คาบที่ 6', startTime: '13.50', endTime: '14.40', isTeachingPeriod: true, index: 7 },
  { id: 'period-7', label: 'คาบที่ 7', startTime: '14.40', endTime: '15.30', isTeachingPeriod: true, index: 8 },
  { id: 'period-8', label: 'คาบที่ 8', startTime: '15.30', endTime: '16.00', isTeachingPeriod: true, index: 9 },
];

const LEVEL_ALIASES: Record<string, string> = {
  k1: 'k1', k2: 'k2', k3: 'k3',
  p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4', p5: 'p5', p6: 'p6',
  m1: 'm1', m2: 'm2', m3: 'm3', m4: 'm4', m5: 'm5', m6: 'm6',
  'อ1': 'k1', 'อ.1': 'k1', 'อนุบาล1': 'k1', 'อนุบาล 1': 'k1',
  'อ2': 'k2', 'อ.2': 'k2', 'อนุบาล2': 'k2', 'อนุบาล 2': 'k2',
  'อ3': 'k3', 'อ.3': 'k3', 'อนุบาล3': 'k3', 'อนุบาล 3': 'k3',
  'ป1': 'p1', 'ป.1': 'p1', 'ประถม1': 'p1', 'ประถม 1': 'p1',
  'ป2': 'p2', 'ป.2': 'p2', 'ประถม2': 'p2', 'ประถม 2': 'p2',
  'ป3': 'p3', 'ป.3': 'p3', 'ประถม3': 'p3', 'ประถม 3': 'p3',
  'ป4': 'p4', 'ป.4': 'p4', 'ประถม4': 'p4', 'ประถม 4': 'p4',
  'ป5': 'p5', 'ป.5': 'p5', 'ประถม5': 'p5', 'ประถม 5': 'p5',
  'ป6': 'p6', 'ป.6': 'p6', 'ประถม6': 'p6', 'ประถม 6': 'p6',
  'ม1': 'm1', 'ม.1': 'm1', 'มัธยม1': 'm1', 'มัธยม 1': 'm1',
  'ม2': 'm2', 'ม.2': 'm2', 'มัธยม2': 'm2', 'มัธยม 2': 'm2',
  'ม3': 'm3', 'ม.3': 'm3', 'มัธยม3': 'm3', 'มัธยม 3': 'm3',
  'ม4': 'm4', 'ม.4': 'm4', 'มัธยม4': 'm4', 'มัธยม 4': 'm4',
  'ม5': 'm5', 'ม.5': 'm5', 'มัธยม5': 'm5', 'มัธยม 5': 'm5',
  'ม6': 'm6', 'ม.6': 'm6', 'มัธยม6': 'm6', 'มัธยม 6': 'm6',
};

const normalizeLevel = (value: any) => {
  if (!value) return '';
  const raw = String(value).trim();
  const levelOnly = raw.includes('/') ? raw.split('/')[0].trim() : raw;
  const compact = levelOnly.toLowerCase().replace(/\s+/g, '');
  return LEVEL_ALIASES[compact] || LEVEL_ALIASES[levelOnly] || compact;
};

const getStudentRoom = (student: any) => {
  const classLike = String(student?.classLevel || student?.homeroomGrade || '');
  const roomFromClass = classLike.includes('/') ? classLike.split('/')[1]?.trim() : '';
  return String(
    student?.room ||
    student?.roomNumber ||
    student?.classroom ||
    student?.section ||
    roomFromClass ||
    ''
  ).trim();
};

const formatTeacherName = (teacher: any) => {
  if (!teacher) return '';
  if (teacher.firstName) return `ครู${teacher.firstName}`;
  const name = String(teacher.name || '').replace(/^(นาย|นางสาว|นาง|น\.ส\.|ครู)\s*/, '');
  return `ครู${name.trim().split(/\s+/)[0] || ''}`.trim();
};

const formatClassNames = (classIds: any, roomNum?: string | number) => {
  const ids = Array.isArray(classIds) ? classIds : [classIds].filter(Boolean);
  const roomSuffix = roomNum ? `/${roomNum}` : '';
  return ids.map(c => `${CLASSES[String(c)] || c}${roomSuffix}`).join(', ');
};

const getCourseTitle = (course: any) => course?.title || course?.courseName || course?.subjectName || 'วิชาไม่ระบุชื่อ';
const getCourseCode = (course: any) => course?.code || course?.courseCode || course?.subjectCode || '';

const getAssignmentTeacherIds = (assignment: any): string[] => {
  const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
    ? assignment.teacherIds
    : (assignment?.teacherId ? [assignment.teacherId] : []);
  return Array.from(new Set(ids.filter(Boolean)));
};

const assignmentIncludesTeacher = (assignment: any, teacherId: string) => {
  const ids = getAssignmentTeacherIds(assignment);
  return ids.length === 0 || ids.includes(teacherId);
};

const matchesYearTerm = (data: any, year: string, term: string) => {
  const dataYear = String(data.academicYear || '');
  const dataTerm = String(data.semester || '');
  const yearMatches = !year || !dataYear || dataYear === String(year);
  const termMatches = !term || !dataTerm || dataTerm === String(term) || dataTerm.startsWith(`${term}/`) || String(term).startsWith(`${dataTerm}/`);
  return yearMatches && termMatches;
};

const mergeScheduleEntry = (target: Record<string, any>, slot: string, entry: any, mode: 'teacher' | 'student') => {
  const current = target[slot];
  if (
    current &&
    (current.course.id || getCourseTitle(current.course)) === (entry.course.id || getCourseTitle(entry.course)) &&
    Number(current.course.groupNumber || 1) === Number(entry.course.groupNumber || 1)
  ) {
    if (mode === 'teacher' && entry.className && !String(current.className || '').includes(entry.className)) {
      current.className = `${current.className}, ${entry.className}`;
    }
    if (mode === 'student' && entry.teacherName) {
      const names = new Set(String(current.teacherName || '').split(',').map(v => v.trim()).filter(Boolean));
      String(entry.teacherName).split(',').map(v => v.trim()).filter(Boolean).forEach(name => names.add(name));
      current.teacherName = Array.from(names).join(', ');
    }
    if (!current.roomCode && entry.roomCode) current.roomCode = entry.roomCode;
    if (!current.roomDisplay && entry.roomDisplay) current.roomDisplay = entry.roomDisplay;
    return;
  }
  target[slot] = entry;
};

const MySchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const calendarState = useSelector((state: RootState) => state.calendar);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

  const [mode, setMode] = useState<'teacher' | 'student' | null>(null);
  const [person, setPerson] = useState<any | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [schedule, setSchedule] = useState<Record<string, any>>({});
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>(DEFAULT_PERIODS);
  const [specialPeriods, setSpecialPeriods] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [academicYear, setAcademicYear] = useState(String(getCurrentThaiYear()));
  const [currentTerm, setCurrentTerm] = useState('1');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  const displayName = useMemo(() => {
    if (!person) return '';
    if (person.name) return person.name;
    return `${person.title || ''}${person.firstName || ''} ${person.lastName || ''}`.trim();
  }, [person]);

  const studentClassId = useMemo(() => {
    if (!person || mode !== 'student') return '';
    return normalizeLevel(person.classLevel || person.gradeLevel || person.homeroomGrade || person.classId);
  }, [person, mode]);

  const studentRoom = useMemo(() => mode === 'student' ? getStudentRoom(person) : '', [person, mode]);

  useEffect(() => {
    const loadViewer = async () => {
      setIsLoadingProfile(true);
      try {
        const studentSessionRaw = localStorage.getItem('studentSession');
        const currentUserType = localStorage.getItem('currentUserType');

        if (!currentUser && currentUserType === 'student' && studentSessionRaw) {
          const session = JSON.parse(studentSessionRaw);
          if (session.schoolId && session.studentId) {
            const studentSnap = await getDoc(doc(db, 'school-settings', session.schoolId, 'students', session.studentId));
            if (studentSnap.exists()) {
              setSchoolId(session.schoolId);
              setMode('student');
              setPerson({ id: studentSnap.id, docId: studentSnap.id, ...studentSnap.data() });
              return;
            }
          }
        }

        if (!currentUser?.uid) {
          navigate('/login', { replace: true });
          return;
        }

        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const resolvedSchoolId = String((currentUser as any)?.schoolId || userData.schoolId || '').trim();

        if (!resolvedSchoolId) {
          setPerson(null);
          return;
        }

        const roles = Array.isArray(currentUser.role) ? currentUser.role : [currentUser.role];
        const preferStudent = roles.includes('student');

        const findProfileDoc = async (collectionName: 'teachers' | 'students') => {
          const baseRef = collection(db, 'school-settings', resolvedSchoolId, collectionName);
          const directSnap = await getDoc(doc(db, 'school-settings', resolvedSchoolId, collectionName, currentUser.uid));
          if (directSnap.exists()) return directSnap;

          const byUidSnap = await getDocs(query(baseRef, where('uid', '==', currentUser.uid), limit(1)));
          if (!byUidSnap.empty) return byUidSnap.docs[0];

          if (currentUser.email) {
            const byEmailSnap = await getDocs(query(baseRef, where('email', '==', currentUser.email), limit(1)));
            if (!byEmailSnap.empty) return byEmailSnap.docs[0];
          }

          const lookupId = collectionName === 'teachers' ? userData.teacherId : userData.studentId;
          if (lookupId) {
            const idField = collectionName === 'teachers' ? 'teacherId' : 'studentId';
            const byCodeSnap = await getDocs(query(baseRef, where(idField, '==', lookupId), limit(1)));
            if (!byCodeSnap.empty) return byCodeSnap.docs[0];
          }

          return null;
        };

        const firstCollection = preferStudent ? 'students' : 'teachers';
        const secondCollection = preferStudent ? 'teachers' : 'students';
        const firstDoc = await findProfileDoc(firstCollection);
        const profileDoc = firstDoc || await findProfileDoc(secondCollection);

        if (!profileDoc) {
          setPerson(null);
          return;
        }

        setSchoolId(resolvedSchoolId);
        setMode(profileDoc.ref.parent.id === 'students' ? 'student' : 'teacher');
        setPerson({ id: profileDoc.id, docId: profileDoc.id, ...profileDoc.data() });
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadViewer();
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!schoolId) return;
    dispatch(fetchCalendar(schoolId) as any);
    dispatch(fetchTeachersMap(schoolId) as any);
  }, [dispatch, schoolId]);

  useEffect(() => {
    if (calendarState.status !== 'succeeded') return;

    const year = calendarState.academicYear || String(getCurrentThaiYear());
    const today = new Date().toISOString().split('T')[0];
    let term = '1';

    const terms = calendarState.terms || [];
    const found = terms.find((t: any) => today >= t.startDate && today <= t.endDate);
    if (found) {
      term = String(found.name || found.id || '').includes('2') ? '2' : '1';
    } else {
      const term2 = terms.find((t: any) => String(t.name || t.id || '').includes('2'));
      if (term2?.startDate && today >= term2.startDate) term = '2';
    }

    setAcademicYear(year);
    setCurrentTerm(term);
  }, [calendarState]);

  useEffect(() => {
    if (!schoolId || !person || !mode) return;
    if (mode === 'student' && teacherMapStatus !== 'succeeded') return;

    const fetchSchedule = async () => {
      setIsLoadingSchedule(true);
      try {
        const [configSnap, specialSnap, roomsSnap, coursesSnap, clubsSnap, assignmentSnap, schedulesSnap] = await Promise.all([
          getDoc(doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings')),
          getDocs(collection(db, 'school-settings', schoolId, 'special-periods')),
          getDocs(collection(db, 'school-settings', schoolId, 'physical-rooms')),
          getDocs(collection(db, 'school-settings', schoolId, 'courses')),
          getDocs(collection(db, 'school-settings', schoolId, 'clubs')),
          getDocs(query(
            collection(db, 'school-settings', schoolId, 'course_assignments'),
            where('academicYear', '==', academicYear),
            where('semester', '==', currentTerm)
          )),
          mode === 'teacher'
            ? getDocs(query(collection(db, 'school-settings', schoolId, 'schedules'), where('teacherId', '==', person.docId)))
            : getDocs(collection(db, 'school-settings', schoolId, 'schedules')),
        ]);

        const periods = configSnap.exists() && configSnap.data().periods
          ? normalizePeriodSettings(configSnap.data().periods)
          : normalizePeriodSettings(DEFAULT_PERIODS);
        setPeriodSettings(periods);
        setSpecialPeriods(specialSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setClubs(clubsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const roomMap: Record<string, string> = {};
        roomsSnap.forEach(d => {
          const data = d.data();
          roomMap[d.id] = data.roomCode || data.roomName || d.id;
        });

        const coursesMap: Record<string, any> = {};
        coursesSnap.forEach(d => {
          coursesMap[d.id] = { id: d.id, ...d.data() };
        });

        const assignmentMap: Record<string, any> = {};
        assignmentSnap.forEach(d => {
          const data = d.data();
          if (data.courseId) assignmentMap[data.courseId] = data;
        });

        const findTeacherAssignment = (course: any, teacherId: string, groupNum: number) => {
          const semesterAssignments = assignmentMap[course.id]?.teacherAssignments || [];
          const courseAssignments = coursesMap[course.id]?.teacherAssignments || [];
          return [...semesterAssignments, ...courseAssignments].find((a: any) =>
            assignmentIncludesTeacher(a, teacherId) && Number(a.groupNumber || 1) === Number(groupNum)
          );
        };

        const merged: Record<string, any> = {};

        schedulesSnap.forEach(scheduleDoc => {
          const data = scheduleDoc.data();
          if (!matchesYearTerm(data, academicYear, currentTerm)) return;

          const scheduleData = data.schedule || {};
          Object.entries(scheduleData).forEach(([slot, rawCourse]) => {
            const courses = Array.isArray(rawCourse) ? rawCourse : [rawCourse].filter(Boolean);
            courses.forEach((course: any) => {
              if (!course) return;
              if (course.id && coursesMap[course.id]?.isActive === false) return;

              const groupNum = Number(course.groupNumber || 1) || 1;

              if (mode === 'teacher') {
                const assignment = findTeacherAssignment(course, person.docId, groupNum);
                const roomIds = assignment?.roomIds || course.room || [];
                const normalizedRoomIds = Array.isArray(roomIds) ? roomIds : [roomIds].filter(Boolean);
                let roomDisplay = normalizedRoomIds.length > 0 && !normalizedRoomIds.includes('all')
                  ? normalizedRoomIds.map((id: string) => roomMap[id] || id).join(', ')
                  : '';
                if (!roomDisplay && groupNum) roomDisplay = String(groupNum);

                const className = assignment?.classLevels?.length
                  ? formatClassNames(assignment.classLevels, assignment.room)
                  : formatClassNames(data.classId, Array.isArray(course.room) ? undefined : course.room);

                mergeScheduleEntry(merged, slot, { course: { ...course, groupNumber: groupNum }, className, roomDisplay }, 'teacher');

                return;
              }

              const classIds = Array.isArray(data.classId) ? data.classId : [data.classId].filter(Boolean);
              const courseClassIds = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean);
              const latestCourse = coursesMap[course.id] || {};
              const allAssignments = [
                ...(assignmentMap[course.id]?.teacherAssignments || []),
                ...(latestCourse.teacherAssignments || []),
              ];

              const gradeMatches = [...classIds, ...courseClassIds].some((id: string) => {
                const normalized = normalizeLevel(id);
                return normalized === studentClassId || String(id).startsWith(`${studentClassId}/`);
              });
              if (!gradeMatches) return;

              const roomMatchesFromClass = [...classIds, ...courseClassIds].some((id: string) => {
                const text = String(id);
                if (!text.includes('/')) return true;
                const [level, room] = text.split('/');
                return normalizeLevel(level) === studentClassId && (!studentRoom || room === studentRoom);
              });

              const matchingAssignment = allAssignments.find((a: any) => {
                const teacherMatches = assignmentIncludesTeacher(a, data.teacherId);
                const levelMatches = (a.classLevels || []).some((level: string) => {
                  const text = String(level);
                  if (!text.includes('/')) return normalizeLevel(text) === studentClassId;
                  const [levelPart, roomPart] = text.split('/');
                  return normalizeLevel(levelPart) === studentClassId && (!studentRoom || roomPart === studentRoom);
                });
                const groupMatches = !course.groupNumber || Number(a.groupNumber || 1) === groupNum;
                return teacherMatches && levelMatches && groupMatches;
              });

              if (!roomMatchesFromClass && !matchingAssignment) return;

              const roomIds = matchingAssignment?.roomIds || (course.room?.includes?.('all') ? [] : (Array.isArray(course.room) ? course.room : [course.room].filter(Boolean)));
              const roomCode = roomIds.length > 0 ? roomIds.map((id: string) => roomMap[id] || id).join(', ') : '';
              const teacher = teacherMap[data.teacherId];

              mergeScheduleEntry(merged, slot, {
                course: { ...course, groupNumber: groupNum, title: getCourseTitle(course), code: getCourseCode(course) },
                teacherName: formatTeacherName(teacher),
                roomCode,
              }, 'student');
            });
          });
        });

        setSchedule(merged);
      } catch (error) {
        console.error('Error fetching personal schedule:', error);
        setSchedule({});
      } finally {
        setIsLoadingSchedule(false);
      }
    };

    fetchSchedule();
  }, [academicYear, currentTerm, mode, person, schoolId, studentClassId, studentRoom, teacherMap, teacherMapStatus]);

  const isLoading = isLoadingProfile || isLoadingSchedule || (mode === 'student' && teacherMapStatus !== 'succeeded');
  const scheduleCount = Object.values(schedule).filter(Boolean).length;

  return (
    <MainLayout>
      <div className="w-full px-2 sm:px-6 lg:px-8 py-2 sm:py-5 text-gray-900 dark:text-white">
        <div className="max-w-7xl mx-auto">
          <section className="bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-3 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
                  <BackButton to="/home" className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
                  {mode === 'student' ? <School size={22} /> : <UserRound size={22} />}
                  <span className="text-sm font-bold">{mode === 'student' ? 'ตารางเรียนของฉัน' : 'ตารางสอนของฉัน'}</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {displayName || 'ตารางของฉัน'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {mode === 'student'
                    ? `${CLASSES[studentClassId] || studentClassId}${studentRoom ? `/${studentRoom}` : ''}`
                    : 'ตารางสอนรายบุคคลจากระบบจัดตารางกลาง'}
                </p>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                <CalendarDays size={16} />
                ภาคเรียนที่ {currentTerm} ปีการศึกษา {academicYear}
              </div>
            </div>

            <div className="pt-3 sm:pt-4">
              {isLoading ? (
                <div className="flex flex-col justify-center items-center py-16 text-gray-500 dark:text-gray-400">
                  <Loader2 className="animate-spin text-indigo-500 mb-3" size={34} />
                  <p className="text-sm font-medium">กำลังโหลดข้อมูลตาราง...</p>
                </div>
              ) : !person ? (
                <div className="py-16 text-center">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ไม่พบข้อมูลผู้ใช้งาน</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">กรุณาเข้าสู่ระบบใหม่อีกครั้ง</p>
                </div>
              ) : scheduleCount === 0 ? (
                <div className="py-16 text-center">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ไม่พบข้อมูลตาราง</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ยังไม่มีตารางในภาคเรียนนี้ หรือข้อมูลชั้น/ห้องยังไม่ตรงกับตารางกลาง</p>
                </div>
              ) : (
                <PersonalScheduleTable
                  schedule={schedule}
                  periodSettings={periodSettings}
                  specialPeriods={specialPeriods}
                  clubs={clubs}
                  viewerId={person.docId}
                  mode={mode || 'teacher'}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </MainLayout>
  );
};

export default MySchedulePage;
