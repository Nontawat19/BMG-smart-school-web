import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from "@/layouts/MainLayout";
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { firestore as db, storage } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { pdf } from '@react-pdf/renderer';
import GradeBookDocument from '@/components/Pdf/gradebook/GradeBookDocument';
import SkeletonLoader from "@/components/SkeletonLoader";
import { CLASSES, CLASS_FULL_NAMES } from "@/utils/schoolUtils";
import Swal from 'sweetalert2';

import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { fetchSchoolSettings } from '@/store/slices/schoolSettingsSlice';
import { fetchSubjectGroups } from '@/store/slices/subjectGroupsSlice';
import { fetchPeriodSettings } from '@/store/slices/periodSettingsSlice';

import {
  Course,
  Teacher,
  CharacteristicCriteria,
  ReadingWritingCriteria,
  GroupAssignment
} from './GradeBookPage/types';

import GradeBookHeader from './GradeBookPage/components/GradeBookHeader';
import GradeBookFilter from './GradeBookPage/components/GradeBookFilter';
import GradeBookToolbar from './GradeBookPage/components/GradeBookToolbar';
import GradeBookActionButtons from './GradeBookPage/components/GradeBookActionButtons';
import CourseSelectionState from './GradeBookPage/components/CourseSelectionState';
import GradeBookQrHidden from './GradeBookPage/components/GradeBookQrHidden';
import GradeBookStats from './GradeBookPage/components/GradeBookStats';
import GradeBookResults from './GradeBookPage/components/GradeBookResults';

import { useGradeBookActions } from './GradeBookPage/hooks/useGradeBookActions';
import { usePdfGenerator } from './GradeBookPage/hooks/usePdfGenerator';
import { useGradeBookCalculations } from './GradeBookPage/hooks/useGradeBookCalculations';
import { useGradeBookFilters } from './GradeBookPage/hooks/useGradeBookFilters';
import { usePermissions } from '@/hooks/usePermissions';
import { useGradeBookData } from './GradeBookPage/hooks/useGradeBookData';
import { useGradeBookAttendance } from './GradeBookPage/hooks/useGradeBookAttendance';

const formatPrefix = (prefix?: string) => {
  if (!prefix) return '';
  const mapping: Record<string, string> = {
    'ด.ช.': 'เด็กชาย',
    'ด.ญ.': 'เด็กหญิง',
    'น.ส.': 'นางสาว',
    'นาย': 'นาย',
    'นาง': 'นาง',
  };
  return mapping[prefix] || prefix;
};

const GradeBookPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'grades' | 'characteristics' | 'readingWriting'>('grades');
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesterAssignments, setSemesterAssignments] = useState<Record<string, GroupAssignment[]>>({});
  const [characteristicsCriteria, setCharacteristicsCriteria] = useState<CharacteristicCriteria[]>([]);
  const [readingWritingCriteria, setReadingWritingCriteria] = useState<ReadingWritingCriteria[]>([]);
  const [maxScores, setMaxScores] = useState({ formative: 0, midterm: 0, final: 0 });
  const qrRef = useRef<HTMLDivElement>(null);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);

  // PDF States
  const [isPdfReady, setIsPdfReady] = useState(false);
  const [isPdfValidating, setIsPdfValidating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [liveQrUrl, setLiveQrUrl] = useState<string>('');

  const [courseSchedule, setCourseSchedule] = useState<Record<string, number[]>>({});
  const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>([]);

  const { user: currentUser, isSchoolAdmin } = usePermissions();
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const { availableClassOptions: reduxLevels, currentAcademicYear: schoolYear, schoolName, logoUrl, directorName, directorPrefix, status: schoolSettingsStatus } = useSelector((state: RootState) => state.schoolSettings);
  const { groups: reduxSubjectGroups, status: subjectGroupsStatus } = useSelector((state: RootState) => state.subjectGroups);
  const { academicYear: calYear, terms: calTerms, rawData: calendarData, status: calendarStatus } = useSelector((state: RootState) => state.calendar);
  const { periods: reduxPeriods, status: periodsStatus } = useSelector((state: RootState) => state.periodSettings);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();

  const userPrivileges = useMemo(() => {
    const teacherProfiles = Object.values(teacherMap || {}).filter((t: any) => t.uid === currentUser?.uid);
    const teacherProfile = teacherProfiles[0] as Teacher | undefined;
    const isHead = teacherProfile?.isHeadOfLearningArea || teacherProfile?.isHeadOfAssessment;
    const isAdmin = isSchoolAdmin;

    return {
      canSeeAll: isAdmin || isHead,
      isAdmin,
      isHead,
      teacherDocId: teacherProfile?.id,
      myTeacherIds: teacherProfiles.map(t => t.id)
    };
  }, [currentUser, teacherMap, isSchoolAdmin]);

  const {
    selectedClass, setSelectedClass,
    selectedRoom, setSelectedRoom,
    selectedSemester, setSelectedSemester,
    selectedCourse, setSelectedCourse,
    selectedGroup, setSelectedGroup,
    searchTerm, setSearchTerm,
    filteredCourses,
    availableGroups
  } = useGradeBookFilters(
    searchParams.get('classId') || '',
    searchParams.get('room') || '',
    searchParams.get('semester') || '',
    searchParams.get('courseId') || '',
    searchParams.get('groupId') || '',
    useMemo(() => {
      return courses.map(c => ({
        ...c,
        teacherAssignments: semesterAssignments[c.id] || []
      }));
    }, [courses, semesterAssignments]),
    teacherMap,
    userPrivileges,
    calYear || ''
  );

  const coursesWithAssignments = useMemo(() => {
    return courses.map(c => ({
      ...c,
      teacherAssignments: semesterAssignments[c.id] || []
    }));
  }, [courses, semesterAssignments]);

  const currentCourse = useMemo(() => coursesWithAssignments.find(c => c.id === selectedCourse), [coursesWithAssignments, selectedCourse]);

  const checkIsHolidayLocal = useCallback((dateStr: string, events: Record<string, any>): { isHoliday: boolean; description: string } => {
    if (!dateStr || !events) return { isHoliday: false, description: '' };
    const event = events[dateStr];
    const d = new Date(dateStr);
    const dayOfWeek = d.getUTCDay();
    if (event) {
      if (event.type === 'holiday') return { isHoliday: true, description: event.description || 'วันหยุดราชการ' };
      if (event.type === 'specialHoliday') return { isHoliday: true, description: event.description || 'วันหยุดกรณีพิเศษ' };
      if (event.type === 'schoolDay') return { isHoliday: false, description: event.description || 'วันเรียนชดเชย' };
    }
    if (dayOfWeek === 0 || dayOfWeek === 6) return { isHoliday: true, description: 'วันหยุดเสาร์-อาทิตย์' };
    return { isHoliday: false, description: '' };
  }, []);

  const calculateGradeMemoized = useCallback((total: number) => {
    if (total >= 80) return "4";
    if (total >= 75) return "3.5";
    if (total >= 70) return "3";
    if (total >= 65) return "2.5";
    if (total >= 60) return "2";
    if (total >= 55) return "1.5";
    if (total >= 50) return "1";
    return "0";
  }, []);

  const {
    students,
    grades,
    setGrades,
    loading,
    studentCourseDailyStatus,
    sdqMap
  } = useGradeBookData(
    schoolId,
    selectedClass,
    selectedRoom,
    selectedSemester,
    selectedCourse,
    selectedGroup,
    currentCourse,
    calYear || '',
    [],
    calculateGradeMemoized
  );

  const calculations = useGradeBookCalculations(grades, students, characteristicsCriteria, readingWritingCriteria, activeTab);

  const attendance = useGradeBookAttendance(
    calendarData,
    courseSchedule,
    selectedSemester,
    selectedClass,
    students,
    selectedCourse,
    currentCourse,
    maxScores,
    characteristicsCriteria,
    readingWritingCriteria,
    grades,
    studentCourseDailyStatus,
    checkIsHolidayLocal
  );



  const {
    isSaving,
    handleScoreChange,
    handleBulkFill,
    handleBulkFillColumn,
    handleSyncSDQColumn,
    handleClearScores,
    handleSave,
    handleImportFromOtherCourse
  } = useGradeBookActions(
    schoolId,
    selectedCourse,
    selectedClass,
    activeTab,
    grades,
    setGrades,
    students,
    characteristicsCriteria,
    readingWritingCriteria,
    maxScores,
    currentCourse,
    coursesWithAssignments,
    sdqMap
  );

  useEffect(() => {
    if (!schoolId) return;
    if (teacherMapStatus === 'idle') dispatch(fetchTeachersMap(schoolId) as any);
    if (calendarStatus === 'idle') dispatch(fetchCalendar(schoolId) as any);
    if (schoolSettingsStatus === 'idle') dispatch(fetchSchoolSettings(schoolId) as any);
    if (subjectGroupsStatus === 'idle') dispatch(fetchSubjectGroups(schoolId) as any);
    if (periodsStatus === 'idle') dispatch(fetchPeriodSettings(schoolId) as any);
  }, [schoolId, teacherMapStatus, calendarStatus, schoolSettingsStatus, subjectGroupsStatus, periodsStatus, dispatch]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedClass) params.set('classId', selectedClass);
    if (selectedRoom) params.set('room', selectedRoom);
    if (selectedSemester) params.set('semester', selectedSemester);
    if (selectedCourse) params.set('courseId', selectedCourse);
    if (selectedGroup) params.set('groupId', selectedGroup);
    const newStr = params.toString();
    if (newStr !== searchParams.toString()) window.history.replaceState(null, '', `?${newStr}`);
  }, [selectedClass, selectedRoom, selectedSemester, selectedCourse, selectedGroup, searchParams]);

  useEffect(() => {
    if (reduxLevels.length > 0) {
      setAvailableClassOptions(reduxLevels);
    }
    
    // Auto-select semester based on current date and terms
    if (calendarStatus === 'succeeded' && calTerms && calTerms.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const found = calTerms.find(t => today >= t.startDate && today <= t.endDate);
      if (found && !selectedSemester) {
        const termId = found.name.includes('2') ? '2' : '1';
        setSelectedSemester(termId);
      }
    }
  }, [reduxLevels, calendarStatus, calYear, calTerms, selectedSemester, setSelectedSemester]);

  useEffect(() => {
    if (!schoolId) return;
    const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
    const unsubscribe = onSnapshot(query(coursesRef, orderBy('code', 'asc')), (snap) => {
      setCourses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)).filter(c => c.isActive !== false));
    });
    return () => unsubscribe();
  }, [schoolId]);

  // Real-time Semester Assignments
  useEffect(() => {
    if (!schoolId || !calYear || !selectedSemester) {
      setSemesterAssignments({});
      return;
    }
    const assignmentsRef = collection(db, 'school-settings', schoolId, 'course_assignments');
    const q = query(
      assignmentsRef,
      where('academicYear', '==', String(calYear)),
      where('semester', '==', String(selectedSemester))
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const mapping: Record<string, GroupAssignment[]> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        mapping[data.courseId] = data.teacherAssignments || [];
      });
      setSemesterAssignments(mapping);
    });

    return () => unsubscribe();
  }, [schoolId, calYear, selectedSemester]);

  useEffect(() => {
    const fetchCore = async () => {
      if (!schoolId) return;
      const schoolSnap = await getDoc(doc(db, 'school-settings', schoolId));
      if (schoolSnap.exists()) setSchoolInfo(schoolSnap.data());
    };
    fetchCore();
  }, [schoolId]);

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!schoolId || !selectedClass || !selectedCourse) {
        setCourseSchedule({});
        return;
      }
      try {
        const qSchedules = query(
          collection(db, 'school-settings', schoolId, 'schedules'),
          where('academicYear', '==', String(calYear || '')),
          where('semester', '==', String(selectedSemester || ''))
        );
        const snap = await getDocs(qSchedules);
        const scheduleMap: Record<string, number[]> = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
        const classTitle = CLASSES[selectedClass] || selectedClass;
        const targetCode = (currentCourse?.code || "").replace(/\s/g, '');
        const classCandidates = new Set([selectedClass, classTitle]);

        snap.forEach(doc => {
          const data = doc.data();
          const classIds = Array.isArray(data.classId) ? data.classId : [data.classId];
          const matchesClass = classIds.some((id: string) => classCandidates.has(String(id))) || String(data.className || "").includes(classTitle);
          if (matchesClass) {
            Object.entries(data.schedule || {}).forEach(([key, val]: [string, any]) => {
              const coursesInSlot = Array.isArray(val) ? val : [val];
              if (coursesInSlot.some(c => c && ((c.id === selectedCourse) || (c.code || "").replace(/\s/g, '') === targetCode))) {
                const [day, periodStr] = key.split('-');
                const period = parseInt(periodStr, 10);
                if (scheduleMap[day] && !isNaN(period) && !scheduleMap[day].includes(period)) scheduleMap[day].push(period);
              }
            });
          }
        });
        setCourseSchedule(scheduleMap);
      } catch (err) { console.error("Schedule error:", err); }
    };
    fetchSchedule();
  }, [schoolId, selectedClass, selectedCourse, currentCourse, calYear, selectedSemester]);

  useEffect(() => {
    if (!currentCourse) {
      setMaxScores({ formative: 0, midterm: 0, final: 0 });
      return;
    }

    const hasScoreConfig = Array.isArray(currentCourse.formativeAssessments);

    if (!hasScoreConfig) {
      setMaxScores({ formative: 0, midterm: 0, final: 0 });
      return;
    }

    const configuredFormative = currentCourse.formativeAssessments?.reduce((sum, assessment) => sum + (Number(assessment.maxScore) || 0), 0) || 0;
    const f = configuredFormative;
    const m = Number(currentCourse.midtermWeight ?? 0);
    const fn = currentCourse.finalWeight !== undefined ? Number(currentCourse.finalWeight) : Math.max(0, 100 - f - m);
    setMaxScores({ formative: f, midterm: m, final: fn });
  }, [currentCourse]);

  useEffect(() => {
    const fetchCriteria = async () => {
      if (!schoolId) return;
      try {
        const charSnap = await getDocs(query(collection(db, 'school-settings', schoolId, 'desired-characteristics'), orderBy('createdAt', 'asc')));
        let chars = charSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CharacteristicCriteria));
        
        // Default Characteristics if empty
        if (chars.length === 0) {
          chars = [
            { id: '1', title: 'รักชาติ ศาสน์ กษัตริย์', indicators: ['', '', '', ''] },
            { id: '2', title: 'ซื่อสัตย์สุจริต', indicators: ['', '', '', ''] },
            { id: '3', title: 'มีวินัย', indicators: ['', '', ''] },
            { id: '4', title: 'ใฝ่เรียนรู้', indicators: ['', '', ''] },
            { id: '5', title: 'อยู่อย่างพอเพียง', indicators: ['', '', ''] },
            { id: '6', title: 'มุ่งมั่นในการทำงาน', indicators: ['', '', ''] },
            { id: '7', title: 'รักความเป็นไทย', indicators: ['', '', '', ''] },
            { id: '8', title: 'มีจิตสาธารณะ', indicators: ['', '', ''] }
          ];
        }
        setCharacteristicsCriteria(chars);

        const rwSnap = await getDocs(query(collection(db, 'school-settings', schoolId, 'reading-thinking-writing'), orderBy('createdAt', 'asc')));
        let rws = rwSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReadingWritingCriteria));
        
        // Default Reading/Writing if empty
        if (rws.length === 0) {
          rws = [
            { 
              id: '1', 
              standard: 'การอ่าน', 
              indicators: [
                { 
                  text: 'สามารถคัดสรรสื่อที่ต้องการอ่าน เพื่อหาข้อมูลสารสนเทศได้ตามวัตถุประสงค์ สามารถสร้างความเข้าใจ และประยุกต์ใช้ความรู้จากการอ่าน', 
                  rubric: {
                    3: 'สามารถคัดสรรสื่อที่อ่าน เพื่อหาข้อมูลสารสนเทศได้ตามวัตถุประสงค์ และนำความรู้ที่ได้จากการอ่าน มาประยุกต์ใช้ได้เป็นอย่างดี',
                    2: 'สามารถคัดสรรสื่อที่ต้องการอ่าน เพื่อหาข้อมูลสารสนเทศได้ตามวัตถุประสงค์ และนำความรู้ที่ได้จากการอ่าน มาประยุกต์ใช้ได้',
                    1: 'สามารถคัดสรรสื่อที่ต้องการอ่าน เพื่อหาข้อมูลสารสนเทศได้ตามวัตถุประสงค์ แต่ไม่สามารถนำความรู้ใด จากการอ่าน มาประยุกต์ใช้ได้',
                    0: 'ไม่สามารถคัดสรรสื่อที่ต้องการอ่าน เพื่อหาข้อมูลสารสนเทศ ตามวัตถุประสงค์ได้'
                  }
                },
                {
                  text: 'สามารถจับประเด็นสำคัญ และประเด็นสนับสนุนโต้แย้ง',
                  rubric: {
                    3: 'จับประเด็นสำคัญ และประเด็นสนับสนุนโต้แย้งได้ครอบคลุมเนื้อหาทั้งหมด',
                    2: 'จับประเด็นสำคัญ และประเด็นสนับสนุนโต้แย้งได้ แต่ยังไม่ครอบคลุมเนื้อหาทั้งหมด ขาดรายละเอียดเพียง 1 ประเด็น',
                    1: 'จับประเด็นสำคัญ และประเด็นสนับสนุนโต้แย้งได้ แต่ยังไม่ครอบคลุมเนื้อหาทั้งหมด ขาดรายละเอียดเพียง 2 ประเด็น',
                    0: 'ไม่สามารถจับประเด็นสำคัญ และประเด็นสนับสนุนหรือโต้แย้งได้'
                  }
                }
              ] 
            },
            { 
              id: '2', 
              standard: 'วิเคราะห์', 
              indicators: [
                { 
                  text: 'สามารถวิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่าน', 
                  rubric: {
                    3: 'วิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่านได้ถูกต้องทั้งหมด',
                    2: 'วิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่านได้ถูกต้องเป็นส่วนใหญ่',
                    1: 'วิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่านได้ถูกต้องเป็นบางส่วน',
                    0: 'ไม่สามารถ วิเคราะห์ วิจารณ์ ความสมเหตุสมผล ความน่าเชื่อถือ ลำดับความ และความเป็นไปได้ของเรื่องที่อ่านได้อย่างถูกต้อง'
                  }
                },
                {
                  text: 'สามารถสรุปคุณค่าแนวคิด แง่คิดที่ได้จากการอ่าน',
                  rubric: {
                    3: 'สรุปคุณค่าแนวคิด แง่คิดที่ได้จากการอ่านได้อย่างถูกต้อง ชัดเจน',
                    2: 'สรุปคุณค่าแนวคิด แง่คิดที่ได้จากการอ่านได้อย่างถูกต้อง ชัดเจนเป็นส่วนใหญ่',
                    1: 'สรุปคุณค่าแนวคิด แง่คิดที่ได้จากการอ่านได้อย่างถูกต้อง ชัดเจนเป็นบางส่วน',
                    0: 'ไม่สามารถสรุปคุณค่าแนวคิด แง่คิดที่ได้จากการอ่านได้'
                  }
                }
              ] 
            },
            { 
              id: '3', 
              standard: 'การเขียน', 
              indicators: [
                { 
                  text: 'สามารถสรุปอภิปราย ขยายความ แสดงความคิดเห็น โต้แย้ง สนับสนุน โน้มน้าว โดยการเขียนสื่อสาร ในรูปแบบต่างๆ เช่น ผังความคิด เป็นต้น', 
                  rubric: {
                    3: 'สรุปอภิปราย พร้อมทั้งขยายความ แสดงความคิดเห็น ในการโต้แย้ง สนับสนุน หรือโน้มน้าวได้ถูกต้องชัดเจน',
                    2: 'สรุปอภิปราย พร้อมทั้งขยายความ แสดงความคิดเห็น ในการโต้แย้ง สนับสนุน หรือโน้มน้าวได้ถูกต้องชัดเจนส่วนใหญ่',
                    1: 'สรุปอภิปราย พร้อมทั้งขยายความ แสดงความคิดเห็น ในการโต้แย้ง สนับสนุน หรือโน้มน้าวได้ถูกต้องชัดเจนบางส่วน',
                    0: 'ไม่สามารถสรุป อภิปราย ขยายความ แสดงความคิดเห็น โต้แย้ง สนับสนุน โน้มน้าว โดยการเขียนสื่อสาร ในรูปแบบต่าง ๆ ได้'
                  }
                }
              ] 
            }
          ];
        }
        setReadingWritingCriteria(rws);
      } catch (err) {
        console.error("Fetch criteria error:", err);
      }
    };
    fetchCriteria();
  }, [schoolId]);

  const homeroomTeacher = useMemo(() => {
    if (!selectedClass) return null;
    const className = CLASSES[selectedClass];
    return Object.values(teacherMap || {}).find((t: any) => t.homeroomGrade === className);
  }, [teacherMap, selectedClass]);

  const courseTeacherName = useMemo(() => {
    if (!currentCourse) return '';
    const ids = new Set<string>();
    
    // Check semester-specific assignments first (Highest priority)
    if (currentCourse.teacherAssignments && currentCourse.teacherAssignments.length > 0) {
      currentCourse.teacherAssignments.forEach(a => {
        if (a.teacherId) ids.add(a.teacherId);
      });
    } else {
      // Fallback to legacy fields
      if (currentCourse.teacherId) ids.add(currentCourse.teacherId);
      if (currentCourse.teacherIds) currentCourse.teacherIds.forEach(id => ids.add(id));
    }

    if (ids.size > 0) {
      return Array.from(ids)
        .map(id => teacherMap[id]?.name || teacherMap[id]?.displayName)
        .filter(Boolean)
        .join(', ');
    }
    
    return (currentUser as any)?.displayName || '';
  }, [currentCourse, teacherMap, currentUser]);

  const studentChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < students.length; i += 25) chunks.push(students.slice(i, i + 25));
    return chunks.length ? chunks : [[]];
  }, [students]);

  const announcementChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < students.length; i += 40) chunks.push(students.slice(i, i + 40));
    return chunks.length ? chunks : [[]];
  }, [students]);

  // PDF Resolvers
  const resolvedSubjectGroup = useMemo(() => {
    if (!currentCourse || !reduxSubjectGroups) return null;
    const courseSubjectGroup = currentCourse.subjectGroup || currentCourse.learningArea || '';
    return reduxSubjectGroups.find(g =>
      g.id === courseSubjectGroup ||
      g.name === courseSubjectGroup ||
      g.code === courseSubjectGroup
    );
  }, [currentCourse, reduxSubjectGroups]);

  const headOfLearningAreaName = useMemo(() => {
    if (!resolvedSubjectGroup || !teacherMap) return '';
    const headId = resolvedSubjectGroup.headTeacherId || (resolvedSubjectGroup as any).headId;
    return teacherMap[headId || '']?.name || teacherMap[headId || '']?.displayName || '';
  }, [resolvedSubjectGroup, teacherMap]);

  const headOfAssessmentName = useMemo(() => {
    return Object.values(teacherMap || {}).find((t: any) => t.isHeadOfAssessment)?.name || '';
  }, [teacherMap]);

  const preMidtermAssessments = useMemo(() => currentCourse?.formativeAssessments?.filter(a => a.term === 'pre-midterm' || !a.term) || [], [currentCourse]);
  const postMidtermAssessments = useMemo(() => currentCourse?.formativeAssessments?.filter(a => a.term === 'post-midterm') || [], [currentCourse]);
  const preMidtermTotal = useMemo(() => preMidtermAssessments.reduce((sum, a) => sum + (a.maxScore || 0), 0), [preMidtermAssessments]);
  const postMidtermTotal = useMemo(() => postMidtermAssessments.reduce((sum, a) => sum + (a.maxScore || 0), 0), [postMidtermAssessments]);

  const curriculumClassDisplay = useMemo(() => {
    if (!selectedClass) return '';
    const fullName = CLASS_FULL_NAMES[selectedClass as keyof typeof CLASS_FULL_NAMES];
    if (fullName) return fullName;
    return selectedClass.toUpperCase().replace(/^M/, 'ม.').replace(/^P/, 'ป.');
  }, [selectedClass]);

  const curriculumRoomDisplay = useMemo(() => {
    let room = "";
    // If we have a group selected, that's our "Room" for the gradebook
    if (selectedGroup && selectedGroup !== 'all' && selectedGroup !== '') {
      // Extracts "1" from "กลุ่ม 1"
      room = selectedGroup.replace('กลุ่ม', '').trim();
    } else if (selectedRoom && selectedRoom !== 'all') {
      room = selectedRoom;
    } else if (selectedRoom === 'all') {
      room = 'ทุกห้อง';
    } else {
      room = currentCourse?.room ? (Array.isArray(currentCourse.room) ? currentCourse.room.join(', ') : currentCourse.room) : '';
    }

    // Final check for 'all' string
    if (room === 'all') return 'ทุกห้อง';
    return room;
  }, [selectedGroup, selectedRoom, currentCourse]);

  const pdfProps = useMemo(() => ({
    students,
    grades,
    maxScores,
    schoolInfo: { ...schoolInfo, schoolName, logoUrl, directorName, directorPrefix, academicYear: calYear },
    currentCourse,
    courseTeacherName,
    homeroomTeacher,
    headOfLearningAreaName,
    headOfAssessmentName,
    resolvedSubjectGroupName: resolvedSubjectGroup?.name || '',
    activeTab,
    characteristicsCriteria,
    readingWritingCriteria,
    studentAttendanceSummaries: attendance.studentAttendanceSummaries,
    attendancePages: attendance.attendancePages,
    studentChunks,
    announcementChunks,
    completenessStats: attendance.completenessStats,
    qrCodeDataUrl,
    liveQrUrl,
    // Add missing helper functions and data
    getCriteriaScore: calculations.getCriteriaScore,
    getOverallQuality: calculations.getOverallQuality,
    getRWScore: calculations.getRWScore,
    getRWSummary: calculations.getRWSummary,
    gradeDistribution: calculations.gradeDistribution,
    assessmentSummary: calculations.assessmentSummary,
    formatPrefix,
    allIndicators: currentCourse?.indicators || [],
    indicatorLabel: 'ตัวชี้วัด/ผลการเรียนรู้ที่คาดหวัง',
    totalCourseHours: attendance.completenessStats?.recordedDaysCount || 0,
    academicYear: calYear || '',
    CLASSES,
    FULL_CLASSES: CLASS_FULL_NAMES,
    calendarData,
    courseSchedule,
    studentCourseDailyStatus,
    checkIsHolidayLocal,
    schoolId: schoolId || '',
    selectedClass,
    selectedRoom,
    curriculumClassDisplay,
    curriculumRoomDisplay,
    preMidtermAssessments,
    postMidtermAssessments,
    preMidtermTotal,
    postMidtermTotal,
    midtermMax: maxScores.midterm,
    finalMax: maxScores.final,
    termToDisplay: selectedSemester,
    currentTerm: selectedSemester,
    specialPeriods: reduxPeriods || [],
  }), [
    students, grades, maxScores, schoolInfo, schoolName, logoUrl, directorName, directorPrefix, calYear,
    currentCourse, courseTeacherName, homeroomTeacher, headOfLearningAreaName, headOfAssessmentName,
    resolvedSubjectGroup, activeTab, characteristicsCriteria, readingWritingCriteria,
    attendance.studentAttendanceSummaries, attendance.attendancePages, studentChunks, announcementChunks,
    attendance.completenessStats, qrCodeDataUrl, liveQrUrl, calculations, formatPrefix,
    CLASSES, calendarData, courseSchedule, studentCourseDailyStatus, checkIsHolidayLocal, schoolId,
    selectedClass, selectedRoom, curriculumClassDisplay, curriculumRoomDisplay,
    preMidtermAssessments, postMidtermAssessments, preMidtermTotal, postMidtermTotal, selectedSemester, reduxPeriods
  ]);

  const { handleCreatePdf } = usePdfGenerator(
    setIsPdfValidating,
    setPdfProgress,
    setPdfUrl,
    setLiveQrUrl,
    setQrCodeDataUrl,
    setIsPdfReady,
    attendance.validateDataCompleteness,
    currentCourse,
    selectedCourse,
    selectedClass,
    curriculumRoomDisplay === 'ทุกห้อง' ? 'all' : curriculumRoomDisplay,
    schoolId || '',
    calYear || '',
    selectedSemester,
    students,
    qrRef
  );

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-7xl mx-auto">
          <GradeBookHeader
            currentCourse={currentCourse}
            curriculumClassDisplay={curriculumClassDisplay}
            curriculumRoomDisplay={curriculumRoomDisplay}
            academicYear={calYear || ''}
          />
          <GradeBookFilter
            selectedClass={selectedClass} setSelectedClass={setSelectedClass}
            selectedRoom={selectedRoom} setSelectedRoom={setSelectedRoom}
            setSelectedCourse={setSelectedCourse} availableClassOptions={availableClassOptions}
            currentCourse={currentCourse}
            selectedCourse={selectedCourse} 
            selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup}
            availableGroups={availableGroups}
            selectedSemester={selectedSemester} setSelectedSemester={setSelectedSemester}
            filteredCourses={filteredCourses}
            teacherMap={teacherMap} userPrivileges={userPrivileges}
            searchTerm={searchTerm} setSearchTerm={setSearchTerm}
          />
          <GradeBookToolbar
            selectedCourse={selectedCourse} completenessStats={attendance.completenessStats}
            activeTab={activeTab} setActiveTab={setActiveTab}
            academicSettings={schoolInfo} academicYear={calYear || ''}
            selectedClass={selectedClass}
            selectedRoom={selectedRoom}
            selectedGroup={selectedGroup}
            selectedSemester={selectedSemester}
            isPdfValidating={isPdfValidating} handleCreatePdf={() => handleCreatePdf(GradeBookDocument, pdfProps)}
            isSaving={isSaving} handleSave={handleSave}
          />
          <GradeBookActionButtons
            activeTab={activeTab} selectedCourse={selectedCourse}
            handleImportFromOtherCourse={handleImportFromOtherCourse}
            handleSyncSDQ={async () => { }}
            handleBulkFill={handleBulkFill} handleClearScores={handleClearScores}
          />
          {!selectedClass || !selectedCourse ? (
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <CourseSelectionState selectedClass={selectedClass} selectedRoom={selectedRoom} CLASSES={CLASSES} filteredCourses={filteredCourses} setSelectedCourse={setSelectedCourse} teacherMap={teacherMap} />
            </div>
          ) : (
            <GradeBookResults
              loading={loading} activeTab={activeTab} students={students} grades={grades}
              completenessStats={attendance.completenessStats}
              characteristicsCriteria={characteristicsCriteria} readingWritingCriteria={readingWritingCriteria}
              maxScores={maxScores} selectedClass={selectedClass} selectedCourse={selectedCourse}
              sdqMap={sdqMap} scoreDistribution={calculations.scoreDistribution}
              formatPrefix={formatPrefix} handleScoreChange={handleScoreChange}
              handleBulkFillColumn={handleBulkFillColumn} handleSyncSDQColumn={handleSyncSDQColumn}
              getOverallQuality={calculations.getOverallQuality}
            />
          )}
        </div>
      </div>
      <GradeBookQrHidden qrRef={qrRef} liveQrUrl={liveQrUrl} schoolInfo={schoolInfo} />
    </MainLayout>
  );
};

export default GradeBookPage;
