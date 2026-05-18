import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { firestore as db } from '../../firebase';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { Document, Page, Text, View, StyleSheet, Font, Image, PDFViewer, pdf, PDFDownloadLink } from '@react-pdf/renderer';
import { StudentSchedulePDF, BulkStudentSchedulePDF, ScheduleEntry, SpecialPeriod } from '@/components/Pdf/StudentScheduleDocument';
import { Loader2, FileDown, Calendar, Users, Printer, Search } from 'lucide-react';
import BackButton from "@/components/Shared/BackButton";
import toast from 'react-hot-toast';
import { saveAs } from 'file-saver';
import { CLASSES, getLevelsByRange } from '@/utils/schoolUtils';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { classMatchesSelection, getRoomsForClass, normalizePeriodSettings, parseClassRoom } from '@/utils/scheduleDisplayUtils';

// --- Types ---
interface Course {
  id: string;
  title: string;
  code: string;
  classId?: string | string[];
  room?: string[];
  hoursPerWeek?: number;
  teacherId?: string;
  teacherIds?: string[];
  isCombined?: boolean;
  constraints?: {
    disallowedDays?: string[];
  };
  isActive?: boolean;
  groupNumber?: number | string;
}

interface SchoolInfo {
  schoolName?: string;
  subDistrict?: string;
  district?: string;
  province?: string;
  affiliation?: string;
  directorName?: string;
  academicHeadName?: string;
  logoUrl?: string;
}

interface PeriodSetting {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
  isFixed?: boolean;
}

type Schedule = Record<string, ScheduleEntry | null>;

// --- Constants ---
const DAYS: Record<string, string> = {
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัสบดี',
  fri: 'ศุกร์',
};
const HOMEROOM_GRADE_MAP: Record<string, string> = {
  k1: 'อ.1', k2: 'อ.2', k3: 'อ.3',
  p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
  m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6'
};

const DEFAULT_PERIODS: (PeriodSetting & { index: number })[] = [
  { id: 'homeroom', label: 'โฮมรูม', startTime: '08.30', endTime: '08.40', isTeachingPeriod: false, isFixed: true, index: 0 },
  { id: 'period-1', label: 'คาบที่ 1', startTime: '08:40', endTime: '09:30', isTeachingPeriod: true, index: 1 },
  { id: 'period-2', label: 'คาบที่ 2', startTime: '09:30', endTime: '10:20', isTeachingPeriod: true, index: 2 },
  { id: 'period-3', label: 'คาบที่ 3', startTime: '10:20', endTime: '11:10', isTeachingPeriod: true, index: 3 },
  { id: 'period-4', label: 'คาบที่ 4', startTime: '11:10', endTime: '12:00', isTeachingPeriod: true, index: 4 },
  { id: 'lunch', label: 'พักกลางวัน', startTime: '12:00', endTime: '13:00', isTeachingPeriod: false, isFixed: true, index: 5 },
  { id: 'period-5', label: 'คาบที่ 5', startTime: '13:00', endTime: '13:50', isTeachingPeriod: true, index: 6 },
  { id: 'period-6', label: 'คาบที่ 6', startTime: '13:50', endTime: '14:40', isTeachingPeriod: true, index: 7 },
  { id: 'period-7', label: 'คาบที่ 7', startTime: '14:40', endTime: '15:30', isTeachingPeriod: true, index: 8 },
  { id: 'period-8', label: 'คาบที่ 8', startTime: '15:30', endTime: '16:00', isTeachingPeriod: true, index: 9 },
];

// --- Register Thai Font ---
Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/npm/@fontsource/sarabun@4.5.0/files/sarabun-thai-400-normal.woff' },
    { src: 'https://cdn.jsdelivr.net/npm/@fontsource/sarabun@4.5.0/files/sarabun-thai-700-normal.woff', fontWeight: 'bold' },
  ],
});

// --- PDF Styles ---
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Sarabun',
    fontSize: 12,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 10,
    textAlign: 'center',
    position: 'relative',
    height: 70,
    justifyContent: 'center',
  },
  logo: {
    width: 50,
    height: 50,
    position: 'absolute',
    left: 20,
    top: 0,
  },
  headerText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  subHeaderText: {
    fontSize: 14,
    marginBottom: 2,
  },
  table: {
    width: '100%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#000',
  },
  row: {
    flexDirection: 'row',
    borderColor: '#000',
    minHeight: 45,
    alignItems: 'stretch',
  },
  headerRow: {
    backgroundColor: '#f0f0f0',
    minHeight: 35,
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    padding: 1,
    textAlign: 'center',
    justifyContent: 'center',
    fontSize: 10,
  },
  dayCell: { width: '8%', fontWeight: 'bold' },
  periodCell: { flex: 1 },
  lunchCell: { width: '5%', padding: 0, alignItems: 'center', justifyContent: 'center' },

  // Content inside cells
  courseTitle: { fontWeight: 'bold', fontSize: 10, marginBottom: 1 },
  courseCode: { fontSize: 9, marginBottom: 1 },
  teacherName: { fontSize: 8, color: '#444' },

  // Footer
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  signatureBlock: {
    width: '30%',
    alignItems: 'center',
  },
  signatureLine: {
    marginTop: 20,
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderStyle: 'dotted',
    width: '100%',
    height: 1,
  },
  signatureText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  totalPeriods: {
    marginTop: 10,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: 'bold',
    paddingRight: 20,
  }
});

// --- Helpers ---
const formatTeacherName = (teacher: any) => {
  if (!teacher) return 'N/A';
  
  if (teacher.firstName) {
    return `คุณครู${teacher.firstName}`;
  }
  
  let name = teacher.name || '';
  // Remove common Thai prefixes and academic/military titles
  name = name.replace(/^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|ว่าที่ร้อยตรี|ว่าที่ ร\.ต\.|ว่าที่ ร\.ต\.หญิง|ว่าที่ร้อยโท|ดร\.|ผอ\.|ครู)\s*/, '');
  
  // Take only the first part of the name (the first name)
  const firstName = name.trim().split(/\s+/)[0];
  return `คุณครู${firstName}`;
};

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
  const dataYear = String(data.academicYear || "");
  const dataTerm = String(data.semester || "");
  const yearMatches = !year || !dataYear || dataYear === String(year);
  const termMatches = !term || !dataTerm || dataTerm === String(term) || dataTerm.startsWith(`${term}/`) || String(term).startsWith(`${dataTerm}/`);
  return yearMatches && termMatches;
};

const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [value].filter(Boolean);

const assignmentClassLevels = (assignment: any) => asArray(assignment?.classLevels);

const courseClassIds = (course: Course) => asArray(course.classId);

const matchesSelectedClassRoom = (values: unknown[], selectedClass: string, selectedRoom?: string) => (
  values.some(value => classMatchesSelection(value, selectedClass, selectedRoom))
);

const assignmentMatchesClassRoom = (assignment: any, selectedClass: string, selectedRoom?: string) => (
  matchesSelectedClassRoom(assignmentClassLevels(assignment), selectedClass, selectedRoom)
);

const mergeScheduleEntry = (target: Schedule, slot: string, entry: ScheduleEntry) => {
  const current = target[slot];
  if (
    current &&
    (current.course.id || current.course.code) === (entry.course.id || entry.course.code) &&
    Number((current.course as any).groupNumber || 1) === Number((entry.course as any).groupNumber || 1)
  ) {
    const names = new Set(String(current.teacherName || '').split(',').map(v => v.trim()).filter(Boolean));
    String(entry.teacherName || '').split(',').map(v => v.trim()).filter(Boolean).forEach(name => names.add(name));
    current.teacherName = Array.from(names).join(', ');
    if (!current.roomCode && entry.roomCode) current.roomCode = entry.roomCode;
    return;
  }
  target[slot] = entry;
};



const StudentSchedulePage: React.FC = () => {
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [schedule, setSchedule] = useState<Schedule>({});
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>(DEFAULT_PERIODS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [totalPeriods, setTotalPeriods] = useState(0);
  const [homeroomTeacher, setHomeroomTeacher] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [currentTerm, setCurrentTerm] = useState('');
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>({});
  const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>([]);
  const [inactiveCourseIds, setInactiveCourseIds] = useState<Set<string>>(new Set()); // Store inactive course IDs

  const [bulkData, setBulkData] = useState<any[] | null>(null);
  const [isPreparingBulk, setIsPreparingBulk] = useState(false);
  const [multiRoomData, setMultiRoomData] = useState<any[] | null>(null); // New state for all-rooms view
  const [roomMap, setRoomMap] = useState<Record<string, string>>({});
  const [coursesMap, setCoursesMap] = useState<Record<string, any>>({});
  const [availableGroups, setAvailableGroups] = useState<string[]>([]); // This will store Room numbers (e.g., 1, 2, 3)
  const [availableGroupNumbers, setAvailableGroupNumbers] = useState<string[]>([]); // This will store Group numbers
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  
  // Redux Calendar State
  const calendarState = useSelector((state: RootState) => state.calendar);
  const reduxAcademicYear = calendarState.academicYear || String(getCurrentThaiYear());
  const reduxTerms = calendarState.terms;

  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();

  const fetchScheduleData = useCallback(async () => {
    if (!selectedClass || !schoolId) {
      setSchedule({});
      setMultiRoomData(null);
      setTotalPeriods(0);
      setHomeroomTeacher('');
      return;
    }

    if (teacherMapStatus === 'idle' && schoolId) {
      dispatch(fetchTeachersMap(schoolId) as any);
    }

    if (teacherMapStatus !== 'succeeded') return;

    setIsLoading(true);

    // CRITICAL: Clear previous data immediately so we don't show old room's data
    setSchedule({});
    setMultiRoomData(null);
    setTotalPeriods(0);

    try {
      // Find homeroom teacher logic
      let foundHomeroomTeacher = '';
      const gradeLabel = HOMEROOM_GRADE_MAP[selectedClass as keyof typeof HOMEROOM_GRADE_MAP];
      const specificGradeWithRoom = selectedRoom ? `${gradeLabel}/${selectedRoom}` : '';

      for (const teacherId in teacherMap) {
        const t = teacherMap[teacherId];
        // Check for specific room first, then fallback to general grade
        if (specificGradeWithRoom && t.homeroomGrade === specificGradeWithRoom) {
          foundHomeroomTeacher = t.name;
          break;
        } else if (!foundHomeroomTeacher && gradeLabel && t.homeroomGrade === gradeLabel) {
          foundHomeroomTeacher = t.name;
        }
      }
      setHomeroomTeacher(foundHomeroomTeacher);

      const [querySnapshot, assignmentSnap] = await Promise.all([
        getDocs(collection(db, 'school-settings', schoolId, 'schedules')),
        getDocs(query(
          collection(db, 'school-settings', schoolId, 'course_assignments'),
          where('academicYear', '==', academicYear),
          where('semester', '==', currentTerm)
        ))
      ]);
      const assignmentMap: Record<string, any> = {};
      assignmentSnap.forEach(d => {
        const data = d.data();
        if (data.courseId) assignmentMap[data.courseId] = data;
      });

      if (selectedRoom) {
        // --- Existing Single Room Logic ---
        const mergedSchedule: Schedule = {};
        querySnapshot.forEach((doc) => {
          const data = doc.data();
            if (!matchesYearTerm(data, academicYear, currentTerm)) return;

            // Client-side Filter for Grade
            const classIds = asArray(data.classId);
            const isGradeMatch = classIds.some(id => classMatchesSelection(id, selectedClass));
            if (!isGradeMatch) return;

            const teacher = teacherMap[data.teacherId];
            const teacherName = formatTeacherName(teacher);
            const scheduleData = data.schedule as Record<string, any>;

            for (const slot in scheduleData) {
              const courseData = scheduleData[slot];
              if (courseData) {
                const courses = Array.isArray(courseData) ? courseData : [courseData];
                courses.forEach((course: Course) => {
                  if (course && (!course.id || !inactiveCourseIds.has(course.id))) {
                    const latestCourse = coursesMap[course.id];
                    const allAssignments = [
                      ...(assignmentMap[course.id]?.teacherAssignments || []),
                      ...(latestCourse?.teacherAssignments || []),
                    ];
                    const hasAssignments = allAssignments.length > 0;
                    
                    // Room matching: check if course is for this specific room
                    // A course matches if its classId is 'selectedClass/selectedRoom' or if it's assigned to this room
                    const classSources = [
                      ...courseClassIds(course),
                      ...allAssignments.flatMap((a: any) => assignmentClassLevels(a)),
                      ...classIds,
                    ];
                    const matchesRoom = !selectedRoom || selectedRoom === 'all' || matchesSelectedClassRoom(classSources, selectedClass, selectedRoom);

                    // Group matching
                    const matchesGroup = !selectedGroup || selectedGroup === 'all' || 
                      (hasAssignments 
                        ? allAssignments.some((a: any) => String(a.groupNumber || 1) === selectedGroup)
                        : String(course.groupNumber || 1) === selectedGroup
                      );

                    if (matchesRoom && matchesGroup) {
                      // Final validation against teacherAssignments for specific room/group pairing if exists
                      const isStrictMatch = !hasAssignments || allAssignments.some((a: any) => {
                        const teacherMatch = assignmentIncludesTeacher(a, data.teacherId);
                        const roomMatch = !selectedRoom || selectedRoom === 'all' || assignmentMatchesClassRoom(a, selectedClass, selectedRoom);
                        const groupMatch = !selectedGroup || selectedGroup === 'all' || String(a.groupNumber || 1) === selectedGroup;
                        return teacherMatch && roomMatch && groupMatch;
                      });

                      if (isStrictMatch) {
                        const assignment = allAssignments.find((a: any) => {
                          const teacherMatch = assignmentIncludesTeacher(a, data.teacherId);
                          const roomMatch = !selectedRoom || selectedRoom === 'all' || assignmentMatchesClassRoom(a, selectedClass, selectedRoom);
                          const groupMatch = !selectedGroup || selectedGroup === 'all' || String(a.groupNumber || 1) === selectedGroup;
                          return teacherMatch && roomMatch && groupMatch;
                        });

                        const roomIds = assignment?.roomIds || (course.room?.includes('all') ? [] : (Array.isArray(course.room) ? course.room : [course.room].filter(Boolean)));
                        const roomCode = roomIds.length > 0 
                          ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                          : '';
                        
                        mergeScheduleEntry(mergedSchedule, slot, { course: course, teacherName, roomCode: String(roomCode) });
                      }
                    }
                  }
                });
              }
            }
        });
        setSchedule(mergedSchedule);
        setTotalPeriods(Object.values(mergedSchedule).filter(Boolean).length);

      } else {
        // --- All Rooms (Multi-page view) ---
        // This is used for the "View All Rooms" functionality
        const roomSchedules: Record<string, Record<string, ScheduleEntry>> = {};
        const commonSchedule: Record<string, ScheduleEntry> = {};

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (!matchesYearTerm(data, academicYear, currentTerm)) return;
          const classIds = asArray(data.classId);
          const isGradeMatch = classIds.some(id => classMatchesSelection(id, selectedClass));
          if (!isGradeMatch) return;

          const teacher = teacherMap[data.teacherId];
          const teacherName = formatTeacherName(teacher);
          const scheduleData = data.schedule as Record<string, any>;

          for (const slot in scheduleData) {
            const courseData = scheduleData[slot];
            if (courseData) {
              const courses = Array.isArray(courseData) ? courseData : [courseData];
              courses.forEach((course: Course) => {
                if (course && (!course.id || !inactiveCourseIds.has(course.id))) {
                  const latestCourse = coursesMap[course.id];
                  const allAssignments = [
                    ...(assignmentMap[course.id]?.teacherAssignments || []),
                    ...(latestCourse?.teacherAssignments || []),
                  ];
                  const hasAssignments = allAssignments.length > 0;
                  
                  // For "All Rooms" view, we need to know which rooms this course belongs to
                  const targetRooms = new Set<string>();
                  const classSources = [...courseClassIds(course), ...classIds];
                  getRoomsForClass(classSources, selectedClass).forEach(room => targetRooms.add(room));

                  if (hasAssignments) {
                    allAssignments.forEach((a: any) => {
                      const levels = assignmentClassLevels(a);
                      const matchesGrade = levels.some((cl: string) => classMatchesSelection(cl, selectedClass));
                      if (matchesGrade) {
                        getRoomsForClass(levels, selectedClass).forEach(room => targetRooms.add(room));
                      }
                    });
                  }

                  if (targetRooms.size === 0) targetRooms.add('1');

                  targetRooms.forEach((room: string) => {
                    const assignment = allAssignments.find((a: any) => {
                      const roomMatch = room === 'all' || assignmentMatchesClassRoom(a, selectedClass, room);
                      return roomMatch;
                    });

                    const roomIds = assignment?.roomIds || (course.room?.includes('all') ? [] : (Array.isArray(course.room) ? course.room : [course.room].filter(Boolean)));
                    const roomCode = roomIds.length > 0 
                      ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                      : '';

                    const entry: ScheduleEntry = { course: { ...course }, teacherName, roomCode: String(roomCode) };

                    if (room === 'all') {
                      mergeScheduleEntry(commonSchedule, slot, entry);
                    } else {
                      if (!roomSchedules[room]) roomSchedules[room] = {};
                      mergeScheduleEntry(roomSchedules[room], slot, entry);
                    }
                  });
                }
              });
            }
          }
        });

        const roomKeys = Object.keys(roomSchedules).length > 0 ? Object.keys(roomSchedules) : ['1'];
        roomKeys.sort((a, b) => parseInt(a) - parseInt(b));

        const processedMultiData: any[] = [];
        for (const room of roomKeys) {
          const finalSchedule = { ...commonSchedule, ...(roomSchedules[room] || {}) };
          processedMultiData.push({
            className: CLASSES[selectedClass as keyof typeof CLASSES],
            room: room,
            schedule: finalSchedule,
            homeroomTeacher: foundHomeroomTeacher,
            totalPeriods: Object.values(finalSchedule).filter(Boolean).length
          });
        }
        setMultiRoomData(processedMultiData);
      }

    } catch (error) {
      console.error("Error fetching schedule: ", error);
      alert("ไม่สามารถดึงข้อมูลตารางเรียนได้");
    } finally {
      setIsLoading(false);
    }
  }, [selectedClass, schoolId, dispatch, teacherMap, teacherMapStatus, selectedRoom, selectedGroup, coursesMap, roomMap, inactiveCourseIds, academicYear, currentTerm]);

  const prepareBulkExport = async () => {
    if (!schoolId) return;
    setIsPreparingBulk(true);
    setBulkData(null); // Reset previous data

    try {
      // 1. Fetch ALL schedules for the school
      const [querySnapshot, assignmentSnap] = await Promise.all([
        getDocs(collection(db, 'school-settings', schoolId, 'schedules')),
        getDocs(query(
          collection(db, 'school-settings', schoolId, 'course_assignments'),
          where('academicYear', '==', academicYear),
          where('semester', '==', currentTerm)
        ))
      ]);
      const assignmentMap: Record<string, any> = {};
      assignmentSnap.forEach(d => {
        const data = d.data();
        if (data.courseId) assignmentMap[data.courseId] = data;
      });

      // Map to store schedules: ClassID -> RoomNumber -> Schedule
      const schoolSchedules: Record<string, Record<string, Record<string, ScheduleEntry>>> = {};

      // 2. Process each teacher's schedule
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (!matchesYearTerm(data, academicYear, currentTerm)) return;
        const teacherId = data.teacherId;
        const teacher = teacherMap[teacherId];
        const teacherName = formatTeacherName(teacher);

        const scheduleData = data.schedule as Record<string, any>;
        const classIdsRaw = asArray(data.classId);
        
        // Group by grade (e.g. m1, m2) instead of specific classId (e.g. m1/1)
        const grades = new Set<string>();
        classIdsRaw.forEach(id => {
          if (!id) return;
          const grade = parseClassRoom(id).level;
          grades.add(grade);
        });

        grades.forEach((grade: string) => {
          if (!grade) return;

          // Initialize class map if not exists
          if (!schoolSchedules[grade]) {
            schoolSchedules[grade] = {};
          }

          for (const slot in scheduleData) {
            const courseData = scheduleData[slot];
            if (courseData) {
              const courses = Array.isArray(courseData) ? courseData : [courseData];
              courses.forEach((course: Course) => {
                  if (course && (!course.id || !inactiveCourseIds.has(course.id))) {
                    const latestCourse = coursesMap[course.id];
                    const allAssignments = [
                      ...(assignmentMap[course.id]?.teacherAssignments || []),
                      ...(latestCourse?.teacherAssignments || []),
                    ];
                    const classSources = [
                      ...courseClassIds(course),
                      ...classIdsRaw,
                      ...allAssignments.flatMap((a: any) => assignmentClassLevels(a)),
                    ];
                    const roomSet = getRoomsForClass(classSources, grade);
                    const isCommon = course.room?.includes('all') && !course.groupNumber && roomSet.has('all');
                    const gNum = String(course.groupNumber || '');
                    const targetRoomKeys = course.groupNumber
                      ? [gNum]
                      : (isCommon ? ['ALL_ROOMS'] : Array.from(roomSet).filter(room => room !== 'all'));
                    if (targetRoomKeys.length === 0) targetRoomKeys.push('1');

          targetRoomKeys.forEach((targetRoomKey: string) => {
                    if (!schoolSchedules[grade][targetRoomKey]) {
                      schoolSchedules[grade][targetRoomKey] = {};
                    }

                    const assignment = allAssignments.find((a: any) => 
                      String(a.groupNumber || 1) === targetRoomKey && 
                      (assignmentMatchesClassRoom(a, grade, targetRoomKey) || matchesSelectedClassRoom(courseClassIds(course), grade, targetRoomKey))
                    );

                    const roomIds = assignment?.roomIds || (course.room?.includes('all') ? [] : (Array.isArray(course.room) ? course.room : [course.room].filter(Boolean)));
                    let roomCode = roomIds.length > 0 
                      ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                      : '';

                    mergeScheduleEntry(schoolSchedules[grade][targetRoomKey], slot, {
                      course: { ...course },
                      teacherName,
                      roomCode: String(roomCode)
                    });
                  });
                }
              });
            }
          }
        });
      });

      // 3. Post-process: Distribute 'ALL_ROOMS' to specific rooms and flatten for PDF
      const finalBulkData: any[] = [];
      const sortedClasses = Object.keys(CLASSES).filter(key => schoolSchedules[key] || availableClassOptions.some(([k]) => k === key)); // Sort by predetermined order

      for (const classId of sortedClasses) {
        if (!schoolSchedules[classId]) continue;

        // Determine all active rooms for this class
        const roomKeys = Object.keys(schoolSchedules[classId]).filter(k => k !== 'ALL_ROOMS');
        // If no specific rooms found but we have 'ALL_ROOMS', assume at least room 1.
        if (roomKeys.length === 0 && schoolSchedules[classId]['ALL_ROOMS']) {
          roomKeys.push('1');
        }
        // Sort numeric rooms properly
        roomKeys.sort((a, b) => parseInt(a) - parseInt(b));

        // Get common schedule for this class (from 'all' rooms)
        const commonSchedule = schoolSchedules[classId]['ALL_ROOMS'] || {};

        // Generate data for each room
        for (const room of roomKeys) {
          const specificSchedule = schoolSchedules[classId][room] || {};
          // Merge: Common + Specific.
          const mergedSchedule = { ...commonSchedule, ...specificSchedule };

          const totalPeriods = Object.values(mergedSchedule).filter(Boolean).length;

          let homeroomTeacherName = '';
          const gradeToFind = HOMEROOM_GRADE_MAP[classId as keyof typeof HOMEROOM_GRADE_MAP];
          for (const teacherId in teacherMap) {
            if (gradeToFind && teacherMap[teacherId].homeroomGrade === gradeToFind) {
              homeroomTeacherName = teacherMap[teacherId].name;
              break;
            }
          }

          finalBulkData.push({
            className: CLASSES[classId as keyof typeof CLASSES],
            room: room,
            schedule: mergedSchedule,
            homeroomTeacher: homeroomTeacherName,
            totalPeriods
          });
        }
      }

      // Sort by Class then Room (already somewhat sorted by class iteration, room sort inside)

      setBulkData(finalBulkData);
      toast.success('เตรียมข้อมูลสำเร็จ พร้อมดาวน์โหลด');

    } catch (error) {
      console.error("Error preparing bulk export:", error);
      toast.error("เกิดข้อผิดพลาดในการเตรียมข้อมูล");
    } finally {
      setIsPreparingBulk(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!selectedClass) return;

    const toastId = toast.loading('กำลังสร้างไฟล์ PDF...');
    try {
      let docInput;
      if (selectedRoom) {
        docInput = (
          <StudentSchedulePDF
            schedule={schedule}
            periodSettings={periodSettings}
            schoolInfo={schoolInfo}
            className={CLASSES[selectedClass as keyof typeof CLASSES]}
            academicYear={academicYear}
            term={currentTerm}
            homeroomTeacher={homeroomTeacher}
            totalPeriods={totalPeriods}
            specialPeriods={specialPeriods}
            roomName={selectedRoom}
            groupName={selectedGroup}
          />
        );
      } else {
        docInput = (
          <BulkStudentSchedulePDF
            data={multiRoomData || []}
            schoolInfo={schoolInfo}
            academicYear={academicYear}
            term={currentTerm}
            specialPeriods={specialPeriods}
            periodSettings={periodSettings}
            groupName={selectedGroup}
          />
        );
      }

      const blob = await pdf(docInput).toBlob();
      const roomInfo = selectedRoom ? `_ห้อง${selectedRoom}` : '';
      const groupInfo = selectedGroup && selectedGroup !== 'all' ? `_กลุ่ม${selectedGroup}` : '';
      saveAs(blob, `ตารางเรียน_${CLASSES[selectedClass as keyof typeof CLASSES] || 'class'}${roomInfo}${groupInfo}.pdf`);
      toast.success('ดาวน์โหลดสำเร็จ', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF', { id: toastId });
    }
  };

  useEffect(() => {
    if (schoolId) {
      dispatch(fetchTeachersMap(schoolId) as any);
      dispatch(fetchCalendar(schoolId) as any);
    }
  }, [schoolId, dispatch]);

  // Sync from Redux Calendar
  useEffect(() => {
    if (calendarState.status === 'succeeded') {
      setAcademicYear(reduxAcademicYear);
      
      const today = new Date().toISOString().split('T')[0];
      const term1 = reduxTerms.find(t => t.id === 'term1' || t.name.includes('1'));
      const term2 = reduxTerms.find(t => t.id === 'term2' || t.name.includes('2'));

      if (term1 && term1.startDate && term1.endDate && today >= term1.startDate && today <= term1.endDate) {
        setCurrentTerm('1');
      } else if (term2 && term2.startDate && term2.endDate && today >= term2.startDate && today <= term2.endDate) {
        setCurrentTerm('2');
      } else if (term2?.startDate && today >= term2.startDate) {
        setCurrentTerm('2');
      } else if (term1?.startDate && today >= term1.startDate) {
        setCurrentTerm('1');
      }
    }
  }, [calendarState.status, reduxAcademicYear, reduxTerms]);

  useEffect(() => {
    fetchScheduleData();
  }, [fetchScheduleData]);

  useEffect(() => {
    if (!schoolId) return;

    const fetchSchoolData = async () => {
      try {
        const schoolDocRef = doc(db, 'school-settings', schoolId);
        const schoolDocSnap = await getDoc(schoolDocRef);
        if (schoolDocSnap.exists()) {
          setSchoolInfo(schoolDocSnap.data() as SchoolInfo);

          // Filter classes based on school settings
          const data = schoolDocSnap.data();
          const levels = getLevelsByRange(data.opportunityExpansionLevel || "");
          const filteredLevels: [string, string][] = Object.entries(CLASSES).filter(([key, val]) => levels.includes(val)) as [string, string][];

          setAvailableClassOptions(filteredLevels);
        }
      } catch (e) { console.error(e); }
    };

    const fetchSpecialPeriods = async () => {
      try {
        const periodsCollectionRef = collection(db, 'school-settings', schoolId, 'special-periods');
        const querySnapshot = await getDocs(periodsCollectionRef);
        const periodsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as SpecialPeriod));
        setSpecialPeriods(periodsData);
      } catch (error) { console.error(error); }
    };

    const fetchPeriodSettings = async () => {
      if (!schoolId) return;
      try {
        const docRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().periods) {
          setPeriodSettings(normalizePeriodSettings(docSnap.data().periods));
        } else {
          setPeriodSettings(normalizePeriodSettings(DEFAULT_PERIODS));
        }
      } catch (error) { console.error(error); }
    };

    const fetchPhysicalRooms = async () => {
      if (!schoolId) return;
      try {
        const q = query(collection(db, 'school-settings', schoolId, 'physical-rooms'));
        const snap = await getDocs(q);
        const map: Record<string, string> = {};
        snap.forEach(doc => {
          const data = doc.data();
          map[doc.id] = data.roomCode || data.roomName || doc.id;
        });
        setRoomMap(map);
      } catch (error) { console.error(error); }
    };

    const fetchCoursesMap = async () => {
      if (!schoolId) return;
      try {
        const q = query(collection(db, 'school-settings', schoolId, 'courses'));
        const snap = await getDocs(q);
        const map: Record<string, any> = {};
        snap.forEach(doc => {
          map[doc.id] = { id: doc.id, ...doc.data() };
        });
        setCoursesMap(map);
      } catch (error) { console.error(error); }
    };

    fetchSchoolData();
    fetchSpecialPeriods();
    fetchPeriodSettings();
    fetchPhysicalRooms();
    fetchCoursesMap();

    // Fetch inactive courses
    const fetchInactiveCourses = async () => {
      if (!schoolId) return;
      try {
        const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
        const q = query(coursesRef, where('isActive', '==', false));
        const snapshot = await getDocs(q);
        const ids = new Set(snapshot.docs.map(doc => doc.id));
        setInactiveCourseIds(ids);
      } catch (error) { console.error(error); }
    };
    fetchInactiveCourses();
  }, [schoolId]);

  // Dynamic Room/Group detection
  useEffect(() => {
    if (selectedClass && Object.keys(coursesMap).length > 0) {
      const rooms = new Set<string>();
      const groups = new Set<string>();
      
      Object.values(coursesMap).forEach(course => {
        const classIds = Array.isArray(course.classId) ? course.classId : [course.classId];
        const isMatch = classIds.some((id: string) => id === selectedClass || (id && id.startsWith(selectedClass + '/')));
        
        if (isMatch) {
          // Extract rooms from classIds
          classIds.forEach((id: string) => {
            if (id && id.startsWith(selectedClass + '/') && id.includes('/')) {
              rooms.add(id.split('/')[1]);
            }
          });

          // Extract rooms and groups from assignments
          course.teacherAssignments?.forEach((a: any) => {
            if (a.groupNumber) groups.add(String(a.groupNumber));
            
            const matchesSelectedGrade = (a.classLevels || []).some((cl: string) => cl === selectedClass || cl.startsWith(selectedClass + '/'));
            if (matchesSelectedGrade) {
              if (a.groupNumber) groups.add(String(a.groupNumber));
              (a.classLevels || []).forEach((cl: string) => {
                if (cl.startsWith(selectedClass + '/') && cl.includes('/')) {
                  rooms.add(cl.split('/')[1]);
                }
              });
            }
          });

          // Legacy room detection
          if (course.room && Array.isArray(course.room)) {
            course.room.forEach((r: string) => { 
              if (r !== 'all' && !isNaN(Number(r))) rooms.add(r); 
            });
          }
        }
      });

      const sortedRooms = Array.from(rooms).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b);
        return numA - numB;
      });

      const sortedGroups = Array.from(groups).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b);
        return numA - numB;
      });

      setAvailableGroups(sortedRooms.length > 0 ? sortedRooms : ['1']);
      setAvailableGroupNumbers(sortedGroups.length > 0 ? sortedGroups : ['1']);
    } else {
      setAvailableGroups([]);
      setAvailableGroupNumbers([]);
    }
  }, [selectedClass, coursesMap]);
  // Auto-select first room only when class changes and NO room is selected
  useEffect(() => {
    if (selectedClass && !selectedRoom) {
      setSelectedRoom('1');
    }
  }, [selectedClass]);

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-7xl mx-auto">

          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <BackButton to="/academic/hub/scheduling" className="mb-4" />
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3 mt-2">
                <Calendar className="text-indigo-600 dark:text-indigo-400" size={32} />
                ดูตารางเรียนนักเรียน
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-base">
                ตรวจสอบและพิมพ์ตารางเรียนของแต่ละชั้นเรียน
              </p>
            </div>
          </div>

          {/* Control Bar */}
          <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 sticky top-[70px] z-30">
            <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">

              {/* Class Selector */}
              <div className="w-full lg:w-1/4 relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  เลือกชั้นเรียน
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Users className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    value={selectedClass}
                    onChange={e => { setSelectedClass(e.target.value); setBulkData(null); }}
                    className="block w-full pl-10 pr-10 py-3 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-xl bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white transition-all hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer appearance-none"
                  >
                    <option value="">-- กรุณาเลือกชั้นเรียน --</option>
                    {availableClassOptions.map(([key, name]) => (
                      <option key={key} value={key}>{name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Room Selector */}
              <div className="w-full lg:w-1/6 relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  เลือกห้อง
                </label>
                <div className="relative">
                  <select
                    value={selectedRoom}
                    onChange={e => setSelectedRoom(e.target.value)}
                    className="block w-full pl-4 pr-10 py-3 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-xl bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white transition-all hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer appearance-none font-medium"
                    disabled={!selectedClass}
                  >
                    <option value="all">ทุกห้อง</option>
                    {availableGroups.map(r => (
                      <option key={r} value={r}>
                        ห้อง {r}
                      </option>
                    ))}
                    {/* Fallback if empty */}
                    {availableGroups.length === 0 && Array.from({ length: 12 }, (_, i) => String(i + 1)).map(r => (
                      <option key={r} value={r}>ห้อง {r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Group Selector */}
              <div className="w-full lg:w-1/6 relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  เลือกกลุ่มเรียน
                </label>
                <div className="relative">
                  <select
                    value={selectedGroup}
                    onChange={e => setSelectedGroup(e.target.value)}
                    className="block w-full pl-4 pr-10 py-3 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-xl bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white transition-all hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer appearance-none font-medium"
                    disabled={!selectedClass}
                  >
                    <option value="all">ทุกกลุ่ม</option>
                    {availableGroupNumbers.map(g => (
                      <option key={g} value={g}>
                        กลุ่ม {g}
                      </option>
                    ))}
                    {/* Fallback if empty */}
                    {availableGroupNumbers.length === 0 && [ '1', '2', '3', '4'].map(g => (
                      <option key={g} value={g}>กลุ่ม {g}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 w-full lg:w-auto justify-end">
                {selectedClass && (
                  <button
                    onClick={handleDownloadPDF}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-indigo-200 dark:shadow-none transform hover:-translate-y-0.5"
                  >
                    <Printer size={20} /> พิมพ์ตารางเรียน
                  </button>
                )}

                {!bulkData ? (
                  <button
                    onClick={prepareBulkExport}
                    disabled={isPreparingBulk}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-emerald-200 dark:shadow-none transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isPreparingBulk ? <Loader2 className="animate-spin" size={20} /> : <FileDown size={20} />}
                    {isPreparingBulk ? 'กำลังเตรียมข้อมูล...' : 'โหลดรวมทุกชั้น'}
                  </button>
                ) : (
                  <PDFDownloadLink
                    document={
                      <BulkStudentSchedulePDF
                        data={bulkData}
                        schoolInfo={schoolInfo}
                        academicYear={academicYear}
                        term={currentTerm}
                        specialPeriods={specialPeriods}
                        periodSettings={periodSettings}
                      />
                    }
                    fileName="ตารางเรียนรวมทุกชั้น.pdf"
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-emerald-200 dark:shadow-none transform hover:-translate-y-0.5"
                  >
                    {/* @ts-ignore */}
                    {({ loading }) => loading ? <><Loader2 className="animate-spin" size={20} /> กำลังสร้าง PDF...</> : <><FileDown size={20} /> ดาวน์โหลด PDF รวม</>}
                  </PDFDownloadLink>
                )}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden min-h-[600px]">
            {isLoading ? (
              <div className="flex flex-col justify-center items-center h-[600px] bg-gray-50 dark:bg-[#202125]">
                <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
                <p className="text-gray-500 font-medium">กำลังโหลดข้อมูลตารางเรียน...</p>
              </div>
            ) : !selectedClass ? (
              <div className="flex flex-col justify-center items-center h-[600px] bg-gray-50 dark:bg-[#202125] text-center p-8">
                <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-6">
                  <Users className="text-indigo-600 dark:text-indigo-400" size={48} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">ยังไม่ได้เลือกชั้นเรียน</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">
                  กรุณาเลือกชั้นเรียนจากรายการด้านบนเพื่อดูตารางเรียน
                </p>
              </div>
            ) : (
              <div className="w-full h-[85vh] bg-gray-100 dark:bg-gray-900">
                {/* Prevent PDFViewer crash if data is empty for Bulk view */}
                {(!selectedClass) ? (
                  <div className="flex flex-col justify-center items-center h-full text-center p-8">
                    <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                      <Users className="text-gray-400" size={40} />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">กรุณาเลือกชั้นเรียน</h3>
                    <p className="text-gray-500 dark:text-gray-400">เลือกชั้นเรียนเพื่อดูตารางเรียน</p>
                  </div>
                ) : (
                  <PDFViewer width="100%" height="100%" className="w-full h-full border-none" showToolbar={true}>
                    {selectedRoom ? (
                      <StudentSchedulePDF
                        schedule={schedule}
                        periodSettings={periodSettings}
                        schoolInfo={schoolInfo}
                        className={CLASSES[selectedClass as keyof typeof CLASSES]}
                        academicYear={academicYear}
                        term={currentTerm}
                        homeroomTeacher={homeroomTeacher}
                        totalPeriods={totalPeriods}
                        specialPeriods={specialPeriods}
                        roomName={selectedRoom}
                        groupName={selectedGroup}
                      />
                    ) : (
                      <BulkStudentSchedulePDF
                        data={multiRoomData || []}
                        schoolInfo={schoolInfo}
                        academicYear={academicYear}
                        term={currentTerm}
                        specialPeriods={specialPeriods}
                        periodSettings={periodSettings}
                      />
                    )}
                  </PDFViewer>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </MainLayout>
  );
};

export default StudentSchedulePage;
