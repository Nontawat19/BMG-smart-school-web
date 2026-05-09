import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import BackButton from "@/components/Shared/BackButton";
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp, writeBatch } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { Calendar } from 'lucide-react';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { isNonOfficialHoliday } from '@/utils/calendarUtils';
import { CLASSES } from '@/utils/schoolUtils';
import { getCurrentThaiYear } from '@/utils/dateUtils';

// Sub-components and Utilities from the same folder
import { Student, CourseSchedule } from './types';
import { DAYS, PERIOD_TIMES } from './constants';
import AttendanceHeader from './components/AttendanceHeader';
import HolidayView from './components/HolidayView';
import ScheduleListView from './components/ScheduleListView';
import AttendanceCheckView from './components/AttendanceCheckView';

const normalizeRoom = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? String(numeric) : raw.toLowerCase();
};

const getClassVariants = (classValue: unknown): string[] => {
    if (Array.isArray(classValue)) {
        return Array.from(new Set(classValue.flatMap(getClassVariants)));
    }

    const value = String(classValue || '').trim();
    if (!value) return [];

    const fromLabel = Object.entries(CLASSES).find(([, label]) => label === value)?.[0];
    const classKey = fromLabel || value;

    return Array.from(new Set([
        classKey,
        CLASSES[classKey],
        value
    ].filter(Boolean).map(String)));
};

const matchesClassValue = (recordClass: unknown, selectedClass: unknown): boolean => {
    if (!selectedClass) return true;
    if (!recordClass) return false;

    if (Array.isArray(recordClass)) {
        return recordClass.some(item => matchesClassValue(item, selectedClass));
    }

    const variants = getClassVariants(selectedClass);
    const normalizedVariants = variants.map(v => v.toLowerCase().replace(/\s/g, ''));
    const raw = String(recordClass || '').trim();
    const normalized = raw.toLowerCase().replace(/\s/g, '');

    return normalizedVariants.includes(normalized) ||
        normalizedVariants.some(v => normalized.startsWith(`${v}_`) || normalized.startsWith(`${v}/`)) ||
        normalizedVariants.some(v => normalized.includes(v) || v.includes(normalized));
};

const matchesEnrollmentGroup = (data: any, groupNumber?: number | string): boolean => {
    if (!groupNumber) return true;
    const normalizedSelected = normalizeRoom(groupNumber);
    const groupName = String(data.groupName || '').trim();
    const plainGroup = groupName.replace(/^กลุ่ม\s*/i, '').replace(/^ก\.\s*/i, '');
    const roomStr = normalizeRoom(data.room || data.roomNumber || data.groupNumber || data.group || '');

    return normalizeRoom(plainGroup) === normalizedSelected ||
        roomStr === normalizedSelected ||
        groupName === `กลุ่ม ${groupNumber}` ||
        groupName === `ก.${groupNumber}`;
};

const formatClassDisplay = (value: unknown) => {
    const values = Array.isArray(value) ? value : [value];
    const labels = values
        .flatMap(getClassVariants)
        .filter(Boolean)
        .map(v => CLASSES[v] || v);

    return Array.from(new Set(labels)).join(', ') || 'ไม่ระบุชั้น';
};

const getStableClassKey = (value: unknown) => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean).join('-');
    return String(value || '');
};

const ClassroomAttendancePage: React.FC = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [schedules, setSchedules] = useState<CourseSchedule[]>([]);
    const [inactiveCourseIds, setInactiveCourseIds] = useState<Set<string>>(new Set());
    const [selectedClass, setSelectedClass] = useState<CourseSchedule | null>(() => {
        try {
            const saved = sessionStorage.getItem('attendance_selected_class');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Basic validation: ensure it's an object and has required fields
                if (parsed && typeof parsed === 'object' && (parsed.courseId || parsed.subjectCode)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error("Error restoring selected class from sessionStorage:", e);
        }
        return null;
    });
    const [students, setStudents] = useState<Student[]>([]);
    const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent' | 'late' | 'leave'>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [studentLeaves, setStudentLeaves] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [isHoliday, setIsHoliday] = useState(false);
    const [holidayName, setHolidayName] = useState('');
    const [scheduleDayOverride, setScheduleDayOverride] = useState<string | null>(null);
    const reduxAcademicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [academicYear, setAcademicYear] = useState<string>(reduxAcademicYear);
    const [semester, setSemester] = useState<string>("");

    const dispatch = useDispatch();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
    const schoolId = (currentUser as any)?.schoolId;

    // --- 0. Sync selection to sessionStorage ---
    useEffect(() => {
        if (selectedClass) {
            sessionStorage.setItem('attendance_selected_class', JSON.stringify(selectedClass));
        } else {
            sessionStorage.removeItem('attendance_selected_class');
        }
    }, [selectedClass]);

    // Find current teacher ID from Redux map
    const currentTeacher = useMemo(() => {
        const teachersArr = Object.values(teacherMap || {}) as any[];
        return teachersArr.find((t: any) => t.uid === (currentUser as any)?.uid || t.id === (currentUser as any)?.uid);
    }, [teacherMap, currentUser]);

    useEffect(() => {
        if (schoolId && teacherMapStatus === 'idle') {
            dispatch(fetchTeachersMap(schoolId) as any);
        }
    }, [schoolId, teacherMapStatus, dispatch]);

    const calendarState = useSelector((state: RootState) => state.calendar);

    // --- 1. Fetch Current Settings (Academic Year) ---
    useEffect(() => {
        if (schoolId && calendarState.status === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }
    }, [schoolId, calendarState.status, dispatch]);

    useEffect(() => {
        if (calendarState.status === 'succeeded') {
            setAcademicYear(calendarState.academicYear);
        } else if (!academicYear) {
            setAcademicYear(reduxAcademicYear);
        }
    }, [calendarState.status, calendarState.academicYear, reduxAcademicYear]);

    // --- 1.1 Fetch Courses to find inactive ones ---
    useEffect(() => {
        const fetchCourses = async () => {
            if (!schoolId) return;
            try {
                const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
                const q = query(coursesRef, where('status', '==', 'inactive'));
                const querySnapshot = await getDocs(q);
                const inactiveIds = new Set<string>();
                querySnapshot.forEach(doc => inactiveIds.add(doc.id));
                setInactiveCourseIds(inactiveIds);
            } catch (error) {
                console.error("Error fetching inactive courses:", error);
            }
        };
        fetchCourses();
    }, [schoolId]);

    // --- 1.2 Check for Holidays ---
    useEffect(() => {
        if (!schoolId) return;
        setIsHoliday(false);
        setHolidayName('');
        setScheduleDayOverride(null);

        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (calendarState.status === 'succeeded') {
            const events = calendarState.rawData?.events || {};
            const event = events[dateStr];

            // 1. Determine local semester for this calculation
            const currentTerm = calendarState.terms.find(t => 
                t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate
            ) || calendarState.terms[0]; // Fallback to term1 if not found in any term

            const localSemester = currentTerm?.id === 'term2' ? "2" : "1";
            setSemester(localSemester);

            // 1. Priority: Check if it's a Makeup School Day (Overrides everything)
            if (event && event.type === 'schoolDay') {
                if (event.scheduleDay) setScheduleDayOverride(event.scheduleDay);
                return;
            }

            // 2. Term Boundaries: Check if within any term period
            const isWithinTerm = calendarState.terms.some(t => 
                t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate
            );

            if (!isWithinTerm) {
                setIsHoliday(true);
                setHolidayName('อยู่นอกภาคเรียน (ไม่อยู่ในช่วงวันเรียน 100 วัน)');
            }

            // 3. Regular Weekend: Saturday (6) and Sunday (0) are non-school days unless schoolDay
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                if (!isHoliday) {
                    setIsHoliday(true);
                    setHolidayName(dayOfWeek === 0 ? 'วันอาทิตย์' : 'วันเสาร์');
                }
            }

            // 4. Calendar Events: Specific holidays or special closures
            if (event) {
                if (event.type === 'holiday' || event.type === 'specialHoliday') {
                    setIsHoliday(true);
                    setHolidayName(event.description || 'วันหยุดโรงเรียน');
                }
            }
        }
    }, [currentDate, schoolId, calendarState.status, calendarState.rawData]);

    // Fallback Google Calendar API (kept as is but optional)
    useEffect(() => {
        const checkGoogleHoliday = async () => {
            if (!schoolId || isHoliday) return;
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
            if (apiKey) {
                try {
                    const calendarId = 'th.th#holiday@group.v.calendar.google.com';
                    const timeMin = `${dateStr}T00:00:00Z`;
                    const timeMax = `${dateStr}T23:59:59Z`;

                    const response = await fetch(
                        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        if (data.items && data.items.length > 0) {
                            const event = data.items[0];
                            const summary = event.summary;
                            if (!isNonOfficialHoliday(summary)) {
                                setIsHoliday(true);
                                setHolidayName(summary);
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error fetching Google Calendar API:", error);
                }
            }
        };
        checkGoogleHoliday();
    }, [currentDate, schoolId, isHoliday]);

    // --- 2. Fetch Teacher's Schedule for the Day ---
    useEffect(() => {
        const fetchSchedule = async () => {
            if (!schoolId || !currentTeacher) return;
            setLoading(true);
            setSchedules([]);

            try {
                const dayKey = scheduleDayOverride || DAYS[currentDate.getDay()];
                const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
                const q = query(schedulesRef);
                const querySnapshot = await getDocs(q);

                const dailySchedules: CourseSchedule[] = [];

                querySnapshot.forEach(doc => {
                    const data = doc.data();
                    const dataYear = String(data.academicYear || "");
                    const dataSemester = String(data.semester || "");
                    const yearMatches = !academicYear || !dataYear || dataYear === academicYear;
                    const semesterMatches = !semester || !dataSemester || dataSemester === semester || dataSemester.startsWith(`${semester}/`) || semester.startsWith(`${dataSemester}/`);
                    if (!yearMatches || !semesterMatches) return;

                    const scheduleMap = data.schedule || {};

                    for (let i = 1; i <= 8; i++) {
                        const slotKey = `${dayKey}-${i}`;
                        if (scheduleMap[slotKey]) {
                            const slotContent = scheduleMap[slotKey];
                            const coursesArr = Array.isArray(slotContent) ? slotContent : [slotContent];

                            coursesArr.forEach((course: any) => {
                                if (!course) return;

                                const isMyCourse = String(course.teacherId) === String((currentTeacher as any).id) ||
                                    String(data.teacherId) === String((currentTeacher as any).id) ||
                                    (course.teacherIds && Array.isArray(course.teacherIds) && course.teacherIds.includes(String((currentTeacher as any).id)));

                                if (isMyCourse) {
                                    const timeInfo = PERIOD_TIMES.find(p => p.period === i);
                                    const courseClassId = course.classId || data.classId;
                                    const groupNumber = Number(course.groupNumber || course.group || 1) || 1;
                                    const levelName = formatClassDisplay(courseClassId);

                                    dailySchedules.push({
                                        id: `${doc.id}-${slotKey}-${course.id || course.courseId || course.code || 'course'}-${groupNumber}`,
                                        courseId: course.id || course.courseId,
                                        subjectCode: course.code || course.subjectCode || "",
                                        subjectName: course.title || course.subjectName || "ไม่ระบุชื่อวิชา",
                                        period: i,
                                        startTime: timeInfo?.start || '',
                                        endTime: timeInfo?.end || '',
                                        classId: courseClassId,
                                        className: levelName,
                                        room: String(groupNumber),
                                        groupNumber,
                                        day: dayKey,
                                        isChecked: false
                                    });
                                }
                            });
                        }
                    }
                });

                // --- 2.1 Fetch Substitutions ---
                const startOfDay = new Date(currentDate); startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(currentDate); endOfDay.setHours(23, 59, 59, 999);

                const subRef = collection(db, 'school-settings', schoolId, 'substitutions');
                const subQ = query(
                    subRef,
                    where('substituteTeacherId', '==', (currentTeacher as any).id ? String((currentTeacher as any).id) : "")
                );

                const subSnap = await getDocs(subQ);

                subSnap.forEach(doc => {
                    const data = doc.data();
                    const subDate = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : null;

                    if (subDate && subDate >= startOfDay && subDate <= endOfDay) {
                        const timeInfo = PERIOD_TIMES.find(p => p.period === data.period);
                        const subLevelName = CLASSES[data.classId] || data.classId || "ไม่ระบุชั้น";
                        const rawSubRoom = data.room || data.roomIds || data.classroom || "";
                        let subRoom = "";

                        if (Array.isArray(rawSubRoom)) {
                            const firstValid = rawSubRoom.find(r => r && String(r).toLowerCase() !== 'all');
                            subRoom = firstValid ? String(firstValid) : "";
                        } else if (rawSubRoom && String(rawSubRoom).toLowerCase() !== 'all') {
                            subRoom = String(rawSubRoom);
                        }

                        dailySchedules.push({
                            id: `sub-${doc.id}`,
                            courseId: data.courseId || data.originalCourseId,
                            subjectCode: data.subjectCode || "",
                            subjectName: data.subjectName || "สอนแทน",
                            period: data.period,
                            startTime: timeInfo?.start || '',
                            endTime: timeInfo?.end || '',
                            classId: data.classId,
                            className: subLevelName,
                            room: subRoom,
                            groupNumber: Number(data.groupNumber || data.group || subRoom || 1) || 1,
                            day: dayKey,
                            isChecked: false,
                            isSubstitute: true,
                            originalTeacherName: data.originalTeacherName || "ไม่ระบุ"
                        });
                    }
                });

                dailySchedules.sort((a, b) => a.period - b.period);
                setSchedules(dailySchedules);

            } catch (error: any) {
                console.error("Error fetching schedules:", error);
                if (error.code === 'unavailable' || error.message?.includes('offline')) {
                    Swal.fire('การเชื่อมต่อขัดข้อง', 'ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบอินเทอร์เน็ต', 'warning');
                } else {
                    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลตารางสอนได้', 'error');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchSchedule();
    }, [currentDate, schoolId, currentTeacher, scheduleDayOverride, academicYear, semester]);

    const isCurrentPeriod = (start: string, end: string) => {
        const now = new Date();
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        const startTime = new Date(now); startTime.setHours(startH, startM, 0);
        const endTime = new Date(now); endTime.setHours(endH, endM, 0);
        return now >= startTime && now <= endTime;
    };

    // --- 3. Fetch Students when Class Selected ---
    useEffect(() => {
        const fetchStudents = async () => {
            if (!schoolId || !selectedClass) return;
            setStudentsLoading(true);
            setIsSubmitted(false);

            try {
                const enrollmentsRef = collection(db, 'school-settings', schoolId, 'enrollments');
                const groupNumber = selectedClass.groupNumber || (Number(selectedClass.room) || 1);
                const enrollmentQueries = [];

                if (selectedClass.courseId) {
                    if (academicYear && semester) {
                        enrollmentQueries.push(query(enrollmentsRef, where('courseId', '==', selectedClass.courseId), where('academicYear', '==', academicYear), where('semester', '==', semester)));
                    }
                    if (academicYear) {
                        enrollmentQueries.push(query(enrollmentsRef, where('courseId', '==', selectedClass.courseId), where('academicYear', '==', academicYear)));
                    }
                    enrollmentQueries.push(query(enrollmentsRef, where('courseId', '==', selectedClass.courseId)));
                }

                if (selectedClass.subjectCode) {
                    if (academicYear && semester) {
                        enrollmentQueries.push(query(enrollmentsRef, where('courseCode', '==', selectedClass.subjectCode), where('academicYear', '==', academicYear), where('semester', '==', semester)));
                    }
                    if (academicYear) {
                        enrollmentQueries.push(query(enrollmentsRef, where('courseCode', '==', selectedClass.subjectCode), where('academicYear', '==', academicYear)));
                    }
                    enrollmentQueries.push(query(enrollmentsRef, where('courseCode', '==', selectedClass.subjectCode)));
                }

                let enrollSnap = null;
                for (const enrollmentQ of enrollmentQueries) {
                    const snap = await getDocs(enrollmentQ);
                    if (!snap.empty) {
                        enrollSnap = snap;
                        break;
                    }
                }

                let studentList: Student[] = [];

                if (enrollSnap && !enrollSnap.empty) {
                    let filteredDocs = enrollSnap.docs.filter(d => {
                        const data = d.data();
                        const matchesGroup = matchesEnrollmentGroup(data, groupNumber);
                        const matchesClass = !data.classLevel || matchesClassValue(data.classLevel, selectedClass.classId) || matchesClassValue(data.classLevel, selectedClass.className);
                        return matchesGroup && matchesClass;
                    });

                    if (filteredDocs.length === 0) {
                        filteredDocs = enrollSnap.docs.filter(d => matchesEnrollmentGroup(d.data(), groupNumber));
                    }

                    const enrolledStudentIds = Array.from(new Set(filteredDocs.map(d => d.data().studentId).filter(Boolean).map(String)));
                    const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                    const studentMap = new Map<string, Student>();

                    for (let i = 0; i < enrolledStudentIds.length; i += 30) {
                        const batchIds = enrolledStudentIds.slice(i, i + 30);
                        const studentSnap = await getDocs(query(studentsRef, where('__name__', 'in', batchIds)));
                        studentSnap.forEach(snap => {
                            const data = snap.data() as any;
                            studentMap.set(snap.id, {
                                id: snap.id,
                                firstName: data.firstName || '',
                                lastName: data.lastName || '',
                                number: data.studentNumber || data.number || '',
                                studentNumber: data.studentId || '',
                                studentId: data.studentId || '',
                                gender: data.gender || '',
                                prefix: data.title || data.prefix || '',
                                profileImageUrl: data.profileImageUrl || '',
                                nickname: data.nickname || '',
                            } as Student);
                        });
                    }

                    filteredDocs.forEach(enrollDoc => {
                        const data = enrollDoc.data();
                        const sId = String(data.studentId || enrollDoc.id);
                        if (!studentMap.has(sId)) {
                            const nameParts = String(data.studentName || '').trim().split(/\s+/);
                            studentMap.set(sId, {
                                id: sId,
                                firstName: data.firstName || nameParts[0] || '',
                                lastName: data.lastName || nameParts.slice(1).join(' ') || '',
                                number: data.number || data.studentNumber || '',
                                studentNumber: data.studentCode || data.studentId || '',
                                studentId: data.studentId || data.studentCode || '',
                                gender: data.gender || '',
                                prefix: data.prefix || data.title || '',
                                profileImageUrl: data.profileImageUrl || '',
                                nickname: data.nickname || '',
                            } as Student);
                        }
                    });
                    studentList = Array.from(studentMap.values());
                } else {
                    const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                    const classVariants = getClassVariants(selectedClass.classId);
                    const snapshot = classVariants.length > 0
                        ? await getDocs(query(studentsRef, where('classLevel', 'in', classVariants.slice(0, 30))))
                        : await getDocs(query(studentsRef, where('classLevel', '==', selectedClass.className)));

                    studentList = snapshot.docs.map(doc => {
                        const data = doc.data() as any;
                        return {
                            id: doc.id,
                            ...data,
                            number: data.studentNumber || data.number || "",
                            studentId: data.studentId || "",
                            studentNumber: data.studentId || "",
                            prefix: data.title || data.prefix || "",
                            nickname: data.nickname || ""
                        } as Student;
                    }).filter(student => matchesClassValue((student as any).classLevel || selectedClass.className, selectedClass.classId));
                }

                studentList.sort((a, b) => {
                    const numA = parseInt(a.number || '0', 10);
                    const numB = parseInt(b.number || '0', 10);
                    return (isNaN(numA) ? 0 : numA) - (isNaN(numB) ? 0 : numB);
                });
                setStudents(studentList);

                const initialAttendance: Record<string, any> = {};
                const initialLeaves: Record<string, boolean> = {};
                studentList.forEach(s => initialAttendance[s.id] = 'present');

                // Check for Leave Records
                const leavePromises = studentList.map(async (student) => {
                    try {
                        const leavesRef = collection(db, 'school-settings', schoolId, 'students', student.id, 'leave_summary');
                        const q = query(leavesRef, where('status', '==', 'approved'));
                        const snap = await getDocs(q);

                        const today = new Date(currentDate); today.setHours(0, 0, 0, 0);
                        const todayStr = today.toISOString().split('T')[0];

                        const validLeave = snap.docs.find(doc => {
                            const data = doc.data();
                            const getDateStr = (val: any) => {
                                if (val?.toDate) return val.toDate().toISOString().split('T')[0];
                                if (typeof val === 'string') return val;
                                return '';
                            };
                            const s = getDateStr(data.startDate);
                            const e = getDateStr(data.endDate);
                            return s && e && s <= todayStr && e >= todayStr;
                        });

                        if (validLeave) {
                            return { id: student.id, isLeave: true, leaveType: validLeave.data().leaveType };
                        }
                    } catch (err) {
                        console.error("Error checking leave", err);
                    }
                    return null;
                });

                const leaveResults = await Promise.all(leavePromises);
                leaveResults.forEach(res => {
                    if (res && res.isLeave) {
                        if (res.leaveType === 'ไปราชการ/กิจกรรม') {
                            initialAttendance[res.id] = 'present';
                        } else {
                            initialAttendance[res.id] = 'leave';
                        }
                        initialLeaves[res.id] = true;
                    }
                });

                setAttendance(initialAttendance);
                setStudentLeaves(initialLeaves);

                // Check if attendance already exists
                const dateStr = `${String(currentDate.getDate()).padStart(2, '0')}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${currentDate.getFullYear()}`;
                const attendancePromises = studentList.map(async (student) => {
                    const stableSubjectCode = selectedClass.subjectCode || selectedClass.courseId || '';
                    const classKey = getStableClassKey(selectedClass.classId);
                    const periodNum = selectedClass.period || 0;
                    const roomKey = selectedClass.room && selectedClass.room !== 'all' ? String(selectedClass.room) : '';
                    
                    // Try new format first (with period)
                    const newId = `${dateStr}_${stableSubjectCode}_${classKey}_P${periodNum}`;
                    const newRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', newId);
                    const newSnap = await getDoc(newRef);
                    
                    if (newSnap.exists()) return { id: student.id, status: newSnap.data().status };

                    // Fallback to legacy historical format where room was embedded in classId/document id
                    if (roomKey) {
                        const legacyRoomId = `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}_P${periodNum}`;
                        const legacyRoomRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', legacyRoomId);
                        const legacyRoomSnap = await getDoc(legacyRoomRef);

                        if (legacyRoomSnap.exists()) return { id: student.id, status: legacyRoomSnap.data().status };
                    }
                    
                    // Fallback to old format (no period)
                    const oldId = `${dateStr}_${stableSubjectCode}_${classKey}`;
                    const oldRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', oldId);
                    const oldSnap = await getDoc(oldRef);

                    if (oldSnap.exists()) return { id: student.id, status: oldSnap.data().status };

                    if (roomKey) {
                        const legacyRoomOldId = `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}`;
                        const legacyRoomOldRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', legacyRoomOldId);
                        const legacyRoomOldSnap = await getDoc(legacyRoomOldRef);

                        if (legacyRoomOldSnap.exists()) return { id: student.id, status: legacyRoomOldSnap.data().status };
                    }

                    return null;
                });

                const results = await Promise.all(attendancePromises);
                const loadedAttendance = { ...initialAttendance };
                let hasRecord = false;
                results.forEach(res => {
                    if (res) {
                        if (initialLeaves[res.id]) {
                            loadedAttendance[res.id] = 'leave';
                        } else {
                            loadedAttendance[res.id] = res.status;
                        }
                        hasRecord = true;
                    }
                });
                setAttendance(loadedAttendance);

                if (hasRecord) {
                    setIsSubmitted(true);
                    Swal.fire({ icon: 'info', title: 'มีการบันทึกแล้ว', text: 'สามารถกดปุ่ม "แก้ไข" เพื่อเปลี่ยนแปลงข้อมูลได้', timer: 1500, showConfirmButton: false });
                }

            } catch (error: any) {
                console.error("Error fetching students:", error);
            } finally {
                setStudentsLoading(false);
            }
        };

        if (selectedClass) fetchStudents();
    }, [selectedClass, schoolId, currentDate, academicYear, semester]);

    // --- ปิดระบบ Auto-Refresh เมื่อสลับแท็บตามที่ผู้ใช้แจ้ง (ลดภาระการโหลดซ้ำ) ---
    /*
    useEffect(() => {
        const handleFocus = () => setRefreshTick(t => t + 1);
        const handleVisibility = () => { if (document.visibilityState === 'visible') setRefreshTick(t => t + 1); };
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);
    */

    const handleSaveAttendance = async () => {
        if (!schoolId || !selectedClass) return;

        try {
            const year = currentDate.getFullYear();
            const dateStr = `${String(currentDate.getDate()).padStart(2, '0')}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${year}`;
            // Match Historical Attendance Page: 12:00:00 for the date
            const normalizedDateObj = new Date(year, currentDate.getMonth(), currentDate.getDate(), 12, 0, 0);

            // Generate stable subject code and class key
            const stableSubjectCode = selectedClass.subjectCode || selectedClass.courseId || '';
            const classKey = getStableClassKey(selectedClass.classId);
            const periodNum = selectedClass.period || 0;
            const roomKey = selectedClass.room && selectedClass.room !== 'all' ? String(selectedClass.room) : '';

            // Format ID consistently: DD-MM-YYYY_SubjectCode_ClassId_P{Period}
            const attendanceId = `${dateStr}_${stableSubjectCode}_${classKey}_P${periodNum}`;
            const derivedClassName = selectedClass.className || CLASSES[classKey] || formatClassDisplay(selectedClass.classId);

            const batch = writeBatch(db);
            students.forEach(student => {
                const studentRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', attendanceId);
                const legacyRoomRef = roomKey
                    ? doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}_P${periodNum}`)
                    : null;
                const legacyRoomOldRef = roomKey
                    ? doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}`)
                    : null;
                const oldRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}`);

                batch.set(studentRef, {
                    schoolId,
                    studentId: student.id,
                    date: Timestamp.fromDate(normalizedDateObj),
                    classId: classKey,
                    className: derivedClassName,
                    room: selectedClass.room || null, // ADDED: Critical for historical matching
                    period: selectedClass.period || 0,
                    subjectName: selectedClass.subjectName,
                    subjectCode: stableSubjectCode,
                    courseId: selectedClass.courseId || null,
                    teacherId: (currentTeacher as any)?.id || (currentUser as any)?.uid || 'unknown',
                    teacherName: (currentTeacher as any)?.name || (currentUser as any)?.displayName || '',
                    status: attendance[student.id] || 'present',
                    academicYear,
                    semester,
                    updatedAt: Timestamp.now(),
                }, { merge: true });

                batch.delete(oldRef);
                if (legacyRoomRef) batch.delete(legacyRoomRef);
                if (legacyRoomOldRef) batch.delete(legacyRoomOldRef);
            });

            await batch.commit();

            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกการเช็คชื่อเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
            setIsSubmitted(true);
            setSelectedClass(null);
            sessionStorage.removeItem('attendance_selected_class');
        } catch (error: any) {
            console.error("Error saving attendance:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    };

    const toggleStatus = (studentId: string, status: 'present' | 'absent' | 'late' | 'leave') => {
        if (isSubmitted || isHoliday || studentLeaves[studentId]) return;
        setAttendance(prev => ({ ...prev, [studentId]: status }));
    };

    const attendanceSummary = useMemo(() => {
        return students.reduce(
            (acc, student) => {
                const status = attendance[student.id] || 'present';
                const key = status === 'present' ? 'มา' : status === 'late' ? 'สาย' : status === 'leave' ? 'ลา' : 'ขาด';
                acc[key as keyof typeof acc]++;
                return acc;
            },
            { "มา": 0, "สาย": 0, "ลา": 0, "ขาด": 0 }
        );
    }, [students, attendance]);

    return (
        <MainLayout>
            <div className="p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300 min-h-screen">
                <div className="max-w-5xl mx-auto">
                    <BackButton to="/academic/hub/attendance" className="mb-4" />
                    <AttendanceHeader
                        teacherName={(currentTeacher as any)?.name || ''}
                        currentDate={currentDate}
                        academicYear={academicYear}
                        semester={semester}
                        onDateChange={setCurrentDate}
                        title="ระบบเช็คชื่อเข้าเรียน"
                    />

                    {isHoliday && schedules.length === 0 ? (
                        <HolidayView holidayName={holidayName} />
                    ) : !selectedClass ? (
                        <div className="space-y-4">
                            {isHoliday && schedules.length > 0 && (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-center gap-3 text-amber-700 dark:text-amber-400 mb-4">
                                    <div className="bg-amber-100 dark:bg-amber-900/40 p-2 rounded-full">
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold">หมายเหตุ: วันนี้เป็นวันหยุด ({holidayName})</p>
                                        <p className="text-sm">แต่คุณมีคาบสอนในระบบ จึงสามารถเช็คชื่อได้ตามปกติ</p>
                                    </div>
                                </div>
                            )}
                            <ScheduleListView
                                schedules={schedules}
                                loading={loading}
                                onSelectClass={setSelectedClass}
                                inactiveCourseIds={inactiveCourseIds}
                                isCurrentPeriod={isCurrentPeriod}
                                currentDate={currentDate}
                            />
                        </div>
                    ) : (
                        <AttendanceCheckView
                            selectedClass={selectedClass}
                            students={students}
                            attendance={attendance}
                            studentLeaves={studentLeaves}
                            isSubmitted={isSubmitted}
                            isHoliday={isHoliday}
                            studentsLoading={studentsLoading}
                            schoolId={schoolId}
                            onBack={() => {
                                setSelectedClass(null);
                                sessionStorage.removeItem('attendance_selected_class');
                            }}
                            onEdit={() => setIsSubmitted(false)}
                            onSave={handleSaveAttendance}
                            onToggleStatus={toggleStatus}
                            attendanceSummary={attendanceSummary}
                        />
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default ClassroomAttendancePage;
