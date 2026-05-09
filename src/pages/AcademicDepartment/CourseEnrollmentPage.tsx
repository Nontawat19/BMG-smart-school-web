import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import BackButton from "@/components/Shared/BackButton";
import { firestore as db } from "../../firebase";
import { motion, AnimatePresence } from "framer-motion";
import { 
    collection, 
    query, 
    doc, 
    onSnapshot, 
    updateDoc, 
    where, 
    orderBy, 
    getDocs,
    getDoc,
    writeBatch,
    addDoc,
    deleteDoc
} from "firebase/firestore";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import MainLayout from "@/layouts/MainLayout";
import {
    Users,
    BookOpen,
    ChevronLeft,
    Search,
    Check,
    Plus,
    X,
    Save,
    Trash2,
    RefreshCw,
    LayoutGrid,
    ChevronRight,
    Calendar,
    Filter,
    ChevronsLeft,
    ChevronsRight,
    Sparkles,
    School,
    PieChart,
    ChevronUp,
    ChevronDown,

    User,
    MapPin,
    GraduationCap
} from "lucide-react";
import Swal from "sweetalert2";

// --- Types ---
interface Course {
    id: string;
    title: string;
    code: string;
    type?: string;
    subjectGroup?: string;
    semester?: string | number;
    capacity?: number;
    teacherAssignments?: any[];
    classId?: string | string[];
}

interface Student {
    id: string;
    title: string;
    firstName: string;
    lastName: string;
    room: string;
    studentId: string;
    studentNumber?: string;
    classLevel: string;
    groupName?: string;
}

interface Enrollment {
    id: string;
    courseId: string;
    studentId: string;
    groupName: string;
    semester?: string;
    academicYear?: string;
}

const CourseEnrollmentPage: React.FC = () => {
    const { schoolId: urlSchoolId } = useParams<{ schoolId?: string }>();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = urlSchoolId || (currentUser as any)?.schoolId;

    // Data States
    const [courses, setCourses] = useState<Course[]>([]);
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [rooms, setRooms] = useState<any[]>([]);
    const [subjectGroupsList, setSubjectGroupsList] = useState<{id: string, name: string, code: string}[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingChanges, setPendingChanges] = useState<{ 
        type: 'add' | 'remove', 
        studentId: string, 
        courseId: string, 
        groupName: string,
        academicYear: string,
        semester: string
    }[]>([]);

    // Filter States
    const academicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [activeYear, setActiveYear] = useState(academicYear);
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [activeSemester, setActiveSemester] = useState("1");
    const [activeClassLevel, setActiveClassLevel] = useState<string>("ทั้งหมด");
    const [schoolInfo, setSchoolInfo] = useState<any>(null);
    const [activeRoom, setActiveRoom] = useState<string>("01");
    const [activeGroupNum, setActiveGroupNum] = useState<number>(1);

    const getLevelLabel = (id: string | undefined) => {
        if (!id) return "";
        const map: Record<string, string> = {
            k1: 'อนุบาล 1', k2: 'อนุบาล 2', k3: 'อนุบาล 3',
            p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
            m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
            junior_high: 'ม.ต้น', senior_high: 'ม.ปลาย',
            'ม.ต้น': 'ม.ต้น', 'ม.ปลาย': 'ม.ปลาย'
        };
        return map[id] || id;
    };

    const normalizeClassLevels = (value: any): string[] => {
        if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
        if (value === null || value === undefined) return [];
        const normalized = String(value).trim();
        return normalized ? [normalized] : [];
    };

    const matchesLevel = (courseClassId: any, selectedLevel: any): boolean => {
        if (selectedLevel === "ทั้งหมด") return true;
        if (!courseClassId) return false;

        if (Array.isArray(courseClassId)) {
            return courseClassId.some(level => matchesLevel(level, selectedLevel));
        }
        
        // Normalize for comparison
        const normalizedId = String(courseClassId).toLowerCase().trim();
        const normalizedSelected = String(selectedLevel || "").toLowerCase().trim();

        // Direct match
        if (normalizedId === normalizedSelected) return true;

        // Group logic for "ม.ต้น"
        if (normalizedSelected === "junior_high" || normalizedSelected === "ม.ต้น") {
            return ["m1", "m2", "m3", "ม.1", "ม.2", "ม.3", "junior_high", "ม.ต้น"].includes(normalizedId);
        }
        
        // Group logic for "ม.ปลาย"
        if (normalizedSelected === "senior_high" || normalizedSelected === "ม.ปลาย") {
            return ["m4", "m5", "m6", "ม.4", "ม.5", "ม.6", "senior_high", "ม.ปลาย"].includes(normalizedId);
        }

        // Individual grade mapping (English ID <-> Thai Label)
        const gradeMap: Record<string, string[]> = {
            k1: ['k1', 'อนุบาล 1', 'อ.1'], k2: ['k2', 'อนุบาล 2', 'อ.2'], k3: ['k3', 'อนุบาล 3', 'อ.3'],
            p1: ['p1', 'ป.1'], p2: ['p2', 'ป.2'], p3: ['p3', 'ป.3'],
            p4: ['p4', 'ป.4'], p5: ['p5', 'ป.5'], p6: ['p6', 'ป.6'],
            m1: ['m1', 'ม.1'], m2: ['m2', 'ม.2'], m3: ['m3', 'ม.3'],
            m4: ['m4', 'ม.4'], m5: ['m5', 'ม.5'], m6: ['m6', 'ม.6']
        };

        if (gradeMap[normalizedSelected]) {
            return gradeMap[normalizedSelected].includes(normalizedId);
        }

        return false;
    };

    const studentMatchesAssignedLevels = (studentLevel: string, assignedLevels: string[]): boolean => {
        if (assignedLevels.length === 0) return true;
        return assignedLevels.some(level => matchesLevel(studentLevel, level));
    };
    
    const [courseSearch, setCourseSearch] = useState("");
    const [studentSearch, setStudentSearch] = useState("");
    const [subjectGroupFilter, setSubjectGroupFilter] = useState("ทั้งหมด");
    const [categoryFilter, setCategoryFilter] = useState("ทั้งหมด");
    const [showOnlyEnrolled, setShowOnlyEnrolled] = useState(false);

    // Selection States
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

    const [selectedEnrolledIds, setSelectedEnrolledIds] = useState<string[]>([]);
    const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
    const [semesterAssignments, setSemesterAssignments] = useState<any[]>([]);

    // Sync assignments for active year/semester
    useEffect(() => {
        if (!schoolId || !activeYear || !activeSemester) return;
        
        const q = query(
            collection(db, 'school-settings', schoolId, 'course_assignments'),
            where('academicYear', '==', activeYear),
            where('semester', '==', activeSemester)
        );
        
        const unsub = onSnapshot(q, (snap) => {
            setSemesterAssignments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        
        return () => unsub();
    }, [schoolId, activeYear, activeSemester]);

    // Reset selection when filters change to avoid "ghost" selections
    useEffect(() => {
        setSelectedCourseId(null);
        setSelectedCourseIds([]);
        setActiveGroupNum(1);
    }, [subjectGroupFilter, categoryFilter, showOnlyEnrolled, activeClassLevel, activeSemester]);

    // Computed courses with merged assignments
    const coursesWithAssignments = useMemo(() => {
        return courses.map(course => {
            const assignment = semesterAssignments.find(a => a.courseId === course.id);
            return {
                ...course,
                teacherAssignments: assignment ? assignment.teacherAssignments : (course.teacherAssignments || [])
            };
        });
    }, [courses, semesterAssignments]);

    const dispatch = useDispatch();
    const calendarState = useSelector((state: RootState) => state.calendar);

    useEffect(() => {
        if (calendarState.status !== 'succeeded' || !calendarState.academicYear) return;
        const fallbackYear = String(getCurrentThaiYear());
        if (!activeYear || activeYear === fallbackYear) {
            setActiveYear(calendarState.academicYear);
        }
        const currentTerm = calendarState.rawData?.currentTerm;
        if (currentTerm && activeSemester === "1") {
            setActiveSemester(currentTerm);
        }
    }, [calendarState.status, calendarState.academicYear, calendarState.rawData?.currentTerm, activeYear, activeSemester]);

    // Fetch Data
    useEffect(() => {
        if (!schoolId) return;

        if (calendarState.status === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }

        // Fetch School Info & Calendar Settings
        const fetchSettings = async () => {
            try {
                const schoolRef = doc(db, 'school-settings', schoolId);
                const calendarSnap = await getDocs(query(collection(db, 'school-settings', schoolId, 'main_calendar')));
                const years = calendarSnap.docs.map(doc => doc.id).filter(id => id !== 'default');
                setAvailableYears(years.sort((a,b) => b.localeCompare(a)));

                if (calendarState.status === 'succeeded' && !activeYear) {
                    setActiveYear(calendarState.academicYear);
                    const currentTerm = calendarState.rawData?.currentTerm || "1";
                    setActiveSemester(currentTerm);
                }

                const sInfoSnap = await getDoc(schoolRef);
                if (sInfoSnap.exists()) setSchoolInfo(sInfoSnap.data());
            } catch (error) {
                console.error("Error fetching settings:", error);
            }
        };
        fetchSettings();

        const fetchAllData = async () => {
            try {
                // Courses
                const coursesSnap = await getDocs(query(collection(db, 'school-settings', schoolId, 'courses'), orderBy('code', 'asc')));
                setCourses(coursesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));

                // Students
                const studentsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'students'));
                setAllStudents(studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));

                // Enrollments
                const enrollSnap = await getDocs(collection(db, 'school-settings', schoolId, 'enrollments'));
                setEnrollments(enrollSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Enrollment)));

                // Rooms
                const roomsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'physical-rooms'));
                setRooms(roomsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                // Subject Groups
                const groupsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'subject_groups'));
                const groupsData = groupsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as { name: string, code: string }) }));
                groupsData.sort((a, b) => parseInt(a.code || '999') - parseInt(b.code || '999'));
                setSubjectGroupsList(groupsData);

                setIsLoading(false);
            } catch (error) {
                console.error("Error fetching data:", error);
                setIsLoading(false);
            }
        };

        fetchAllData();

        return () => {};
    }, [schoolId]);

    // Computed
    const filteredCourses = useMemo(() => {
        return coursesWithAssignments.filter(c => {
            const isAssigned = c.teacherAssignments && c.teacherAssignments.length > 0;
            const matchesSearch = (c.title || "").toLowerCase().includes(courseSearch.toLowerCase()) || (c.code || "").toLowerCase().includes(courseSearch.toLowerCase());
            const matchesGroup = subjectGroupFilter === "ทั้งหมด" || c.subjectGroup === subjectGroupFilter;
            const matchesLevelFilter = matchesLevel(c.classId, activeClassLevel);
            const matchesCategory = categoryFilter === "ทั้งหมด" || c.type === categoryFilter;
            
            let matchesSemester = true;
            if (activeSemester !== "0") {
                const courseSem = c.semester?.toString().trim() || "";
                matchesSemester = !courseSem || courseSem === activeSemester || courseSem === "0" || courseSem === "annual" || courseSem === "1-2" || courseSem === "ปีการศึกษา";
            }

            // Enrollment filter
            let matchesEnrollment = true;
            if (showOnlyEnrolled) {
                const normalizedYear = String(activeYear).trim();
                const normalizedSem = String(activeSemester).trim();
                matchesEnrollment = enrollments.some(e => 
                    e.courseId === c.id && 
                    String(e.academicYear).trim() === normalizedYear && 
                    String(e.semester).trim() === normalizedSem
                );
            }

            return isAssigned && matchesSearch && matchesGroup && matchesLevelFilter && matchesSemester && matchesCategory && matchesEnrollment;
        }).sort((a, b) => {
            const aG = subjectGroupsList.find(g => g.name === a.subjectGroup);
            const bG = subjectGroupsList.find(g => g.name === b.subjectGroup);
            return (parseInt(aG?.code || '999')) - (parseInt(bG?.code || '999'));
        });
    }, [coursesWithAssignments, courseSearch, subjectGroupFilter, subjectGroupsList, activeClassLevel, activeSemester]);

    // All selected courses data
    const activeCourses = useMemo(() => {
        return coursesWithAssignments.filter(c => selectedCourseIds.includes(c.id));
    }, [coursesWithAssignments, selectedCourseIds]);

    const activeCourse = useMemo(() => {
        return coursesWithAssignments.find(c => c.id === selectedCourseId);
    }, [coursesWithAssignments, selectedCourseId]);

    const activeAssignment = useMemo(() => {
        if (!activeCourse) return null;
        return (activeCourse.teacherAssignments || []).find((assignment: any) => assignment.groupNumber === activeGroupNum) || null;
    }, [activeCourse, activeGroupNum]);

    const activeCourseClassLevels = useMemo(() => {
        const assignmentLevels = normalizeClassLevels(activeAssignment?.classLevels);
        if (assignmentLevels.length > 0) return assignmentLevels;
        return normalizeClassLevels(activeCourse?.classId);
    }, [activeAssignment, activeCourse]);

    const sourceStudents = useMemo(() => {
        // Get set of all students currently enrolled in this course (including pending)
        const enrolledIdsSet = new Set<string>();
        
        if (selectedCourseId) {
            const normalizedCourseId = String(selectedCourseId);
            const normalizedGroup = `กลุ่ม ${activeGroupNum}`.trim();
            const normalizedYear = String(activeYear).trim();
            const normalizedSem = String(activeSemester).trim();

            // From current database enrollments
            enrollments
                .filter(e => 
                    String(e.courseId) === normalizedCourseId && 
                    String(e.groupName).trim() === normalizedGroup && 
                    String(e.academicYear).trim() === normalizedYear && 
                    String(e.semester).trim() === normalizedSem
                )
                .forEach(e => enrolledIdsSet.add(e.studentId));
            
            // From pending changes (only additions)
            pendingChanges
                .filter(c => 
                    c.type === 'add' && 
                    String(c.courseId) === normalizedCourseId && 
                    String(c.groupName).trim() === normalizedGroup &&
                    String(c.academicYear).trim() === normalizedYear &&
                    String(c.semester).trim() === normalizedSem
                )
                .forEach(c => enrolledIdsSet.add(c.studentId));
            
            // Note: If pending remove, we want them back in source
            pendingChanges
                .filter(c => 
                    c.type === 'remove' && 
                    String(c.courseId) === normalizedCourseId && 
                    String(c.groupName).trim() === normalizedGroup &&
                    String(c.academicYear).trim() === normalizedYear &&
                    String(c.semester).trim() === normalizedSem
                )
                .forEach(c => enrolledIdsSet.delete(c.studentId));
        }

        return allStudents.filter(s => {
            const isAlreadyEnrolled = enrolledIdsSet.has(s.id);
            const matchesLevelFilter = selectedCourseId
                ? studentMatchesAssignedLevels(s.classLevel, activeCourseClassLevels)
                : matchesLevel(s.classLevel, activeClassLevel);
            const matchesRoom = activeRoom === "ALL" || (matchesLevelFilter && Number(s.room) === Number(activeRoom));
            const matchesSearch = (s.firstName || "").toLowerCase().includes(studentSearch.toLowerCase()) || (s.lastName || "").toLowerCase().includes(studentSearch.toLowerCase()) || (s.studentId || "").includes(studentSearch);
            
            return matchesRoom && matchesSearch && matchesLevelFilter && !isAlreadyEnrolled;
        }).sort((a, b) => Number(a.studentNumber || 0) - Number(b.studentNumber || 0));
    }, [allStudents, activeClassLevel, activeRoom, studentSearch, selectedCourseId, enrollments, pendingChanges, activeGroupNum, activeYear, activeSemester, activeCourseClassLevels]);

    useEffect(() => {
        if (!selectedCourseId) return;
        setActiveRoom("ALL");
    }, [selectedCourseId, activeGroupNum]);

    const enrolledStudents = useMemo(() => {
        if (!selectedCourseId) return [];
        
        // Condition: If specifically showOnlyEnrolled is on, but no course is selected for viewing, hide
        // (Actually it's already handled by !selectedCourseId check above, but we can be explicit if needed)
        // The user wants similar logic to Assignment page: hide middle content if toggle is on but no selection.
        if (showOnlyEnrolled && !selectedCourseId) return [];

        const normalizedCourseId = String(selectedCourseId);
        const normalizedGroup = `กลุ่ม ${activeGroupNum}`.trim();
        const normalizedYear = String(activeYear).trim();
        const normalizedSem = String(activeSemester).trim();

        // Firestore enrollments
        const courseEnrollments = enrollments.filter(e => 
            String(e.courseId) === normalizedCourseId && 
            String(e.groupName).trim() === normalizedGroup &&
            String(e.academicYear).trim() === normalizedYear &&
            String(e.semester).trim() === normalizedSem
        );
        
        const enrolledIds = courseEnrollments.map(e => e.studentId);
        
        // Create a set of all student IDs that should be in the list
        // Include both already enrolled AND pending additions
        const studentIdsSet = new Set(enrolledIds);
        
        pendingChanges.forEach(change => {
            if (String(change.courseId) === normalizedCourseId && 
                String(change.groupName).trim() === normalizedGroup &&
                String(change.academicYear).trim() === normalizedYear &&
                String(change.semester).trim() === normalizedSem
            ) {
                if (change.type === 'add') {
                    studentIdsSet.add(change.studentId);
                } else if (change.type === 'remove') {
                    // Remove from the set so they DISAPPEAR from the left panel
                    studentIdsSet.delete(change.studentId);
                }
            }
        });

        return allStudents.filter(s => studentIdsSet.has(s.id))
            .sort((a, b) => Number(a.studentNumber || 0) - Number(b.studentNumber || 0));
    }, [selectedCourseId, enrollments, activeGroupNum, allStudents, activeYear, activeSemester, pendingChanges]);



    // Handlers
    const handleBatchEnroll = () => {
        if (!selectedCourseId || selectedSourceIds.length === 0) return;
        
        const normalizedCourseId = String(selectedCourseId);
        const normalizedGroup = `กลุ่ม ${activeGroupNum}`.trim();
        const normalizedYear = String(activeYear).trim();
        const normalizedSem = String(activeSemester).trim();

        const newChanges = [...pendingChanges];
        selectedSourceIds.forEach(studentId => {
            // 1. If already in remove queue, just remove from that queue
            const removeIdx = newChanges.findIndex(c => 
                c.type === 'remove' && 
                c.studentId === studentId && 
                String(c.courseId) === normalizedCourseId && 
                String(c.groupName).trim() === normalizedGroup &&
                String(c.academicYear).trim() === normalizedYear &&
                String(c.semester).trim() === normalizedSem
            );

            if (removeIdx > -1) {
                newChanges.splice(removeIdx, 1);
            } else {
                // 2. Check if already in Firestore for this SPECIFIC term/year/group
                const alreadyEnrolled = enrollments.some(e => 
                    e.studentId === studentId && 
                    String(e.courseId) === normalizedCourseId && 
                    String(e.groupName).trim() === normalizedGroup &&
                    String(e.academicYear || "").trim() === normalizedYear &&
                    String(e.semester || "").trim() === normalizedSem
                );

                if (!alreadyEnrolled) {
                    // 3. Check if already in add queue
                    const addIdx = newChanges.findIndex(c => 
                        c.type === 'add' && 
                        c.studentId === studentId && 
                        String(c.courseId) === normalizedCourseId && 
                        String(c.groupName).trim() === normalizedGroup &&
                        String(c.academicYear).trim() === normalizedYear &&
                        String(c.semester).trim() === normalizedSem
                    );

                    if (addIdx === -1) {
                        newChanges.push({
                            type: 'add',
                            studentId,
                            courseId: selectedCourseId,
                            groupName: `กลุ่ม ${activeGroupNum}`,
                            academicYear: activeYear,
                            semester: activeSemester
                        });
                    }
                }
            }
        });
        
        setPendingChanges(newChanges);
        setSelectedSourceIds([]);
        Swal.fire({ icon: 'info', title: 'เพิ่มลงในรายการรอยืนยัน', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
    };

    const handleBatchUnenroll = () => {
        if (!selectedCourseId || selectedEnrolledIds.length === 0) return;
        
        const normalizedCourseId = String(selectedCourseId);
        const normalizedGroup = `กลุ่ม ${activeGroupNum}`.trim();
        const normalizedYear = String(activeYear).trim();
        const normalizedSem = String(activeSemester).trim();

        const newChanges = [...pendingChanges];
        selectedEnrolledIds.forEach(studentId => {
            // 1. If in add queue, just remove from add queue
            const addIdx = newChanges.findIndex(c => 
                c.type === 'add' && 
                c.studentId === studentId && 
                String(c.courseId) === normalizedCourseId && 
                String(c.groupName).trim() === normalizedGroup &&
                String(c.academicYear).trim() === normalizedYear &&
                String(c.semester).trim() === normalizedSem
            );

            if (addIdx > -1) {
                newChanges.splice(addIdx, 1);
            } else {
                // 2. Check if in Firestore (to mark for removal)
                const inFirestore = enrollments.some(e => 
                    e.studentId === studentId && 
                    String(e.courseId) === normalizedCourseId && 
                    String(e.groupName).trim() === normalizedGroup &&
                    String(e.academicYear || "").trim() === normalizedYear &&
                    String(e.semester || "").trim() === normalizedSem
                );

                if (inFirestore) {
                    const removeIdx = newChanges.findIndex(c => 
                        c.type === 'remove' && 
                        c.studentId === studentId && 
                        String(c.courseId) === normalizedCourseId && 
                        String(c.groupName).trim() === normalizedGroup &&
                        String(c.academicYear).trim() === normalizedYear &&
                        String(c.semester).trim() === normalizedSem
                    );

                    if (removeIdx === -1) {
                        newChanges.push({
                            type: 'remove',
                            studentId,
                            courseId: selectedCourseId,
                            groupName: `กลุ่ม ${activeGroupNum}`,
                            academicYear: activeYear,
                            semester: activeSemester
                        });
                    }
                }
            }
        });

        setPendingChanges(newChanges);
        setSelectedEnrolledIds([]);
        Swal.fire({ icon: 'info', title: 'เพิ่มรายการยกเลิกลงในคิว', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
    };

    const handleCommitAll = async () => {
        if (pendingChanges.length === 0) return;
        
        const confirm = await Swal.fire({
            title: 'ยืนยันการบันทึก?',
            text: `คุณกำลังจะบันทึกการเปลี่ยนแปลงทั้งหมด ${pendingChanges.length} รายการ`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันบันทึก',
            cancelButtonText: 'ตรวจสอบอีกครั้ง',
            confirmButtonColor: '#4f46e5',
            background: '#161a27',
            color: '#fff'
        });

        if (!confirm.isConfirmed) return;

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            
            pendingChanges.forEach(change => {
                const normCId = String(change.courseId);
                const normG = String(change.groupName).trim();
                const normY = String(change.academicYear).trim();
                const normS = String(change.semester).trim();

                if (change.type === 'add') {
                    const student = allStudents.find(s => s.id === change.studentId);
                    const course = courses.find(c => c.id === change.courseId);
                    
                    const enrollRef = doc(collection(db, 'school-settings', schoolId, 'enrollments'));
                    batch.set(enrollRef, {
                        courseId: change.courseId,
                        courseCode: course?.code || "",
                        studentId: change.studentId,
                        studentName: student ? `${student.firstName} ${student.lastName}` : "",
                        classLevel: student?.classLevel || "",
                        room: student?.room || "",
                        groupName: change.groupName,
                        academicYear: change.academicYear,
                        semester: change.semester,
                        createdAt: new Date().toISOString()
                    });
                } else {
                    const toDelete = enrollments.find(e => 
                        String(e.courseId) === normCId && 
                        e.studentId === change.studentId && 
                        String(e.groupName).trim() === normG &&
                        String(e.academicYear || "").trim() === normY &&
                        String(e.semester || "").trim() === normS
                    );
                    if (toDelete) {
                        batch.delete(doc(db, 'school-settings', schoolId, 'enrollments', toDelete.id));
                    }
                }
            });

            await batch.commit();
            setPendingChanges([]);
            Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลเรียบร้อย', text: 'ข้อมูลทั้งหมดถูกอัปเดตลงฐานข้อมูลแล้ว' });
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetPending = () => {
        if (pendingChanges.length > 0) {
            setPendingChanges([]);
            Swal.fire({ icon: 'success', title: 'ล้างรายการรอยืนยันแล้ว', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        }
    };

    const toggleSelectAllSource = () => {
        if (selectedSourceIds.length > 0 && selectedSourceIds.length === sourceStudents.length) {
            setSelectedSourceIds([]);
        } else {
            setSelectedSourceIds(sourceStudents.map(s => s.id));
        }
    };

    const toggleSelectAllEnrolled = () => {
        if (selectedEnrolledIds.length > 0 && selectedEnrolledIds.length === enrolledStudents.length) {
            setSelectedEnrolledIds([]);
        } else {
            setSelectedEnrolledIds(enrolledStudents.map(s => s.id));
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#0b0e14]">
                <RefreshCw className="text-indigo-500 animate-spin mb-4" size={40} />
                <p className="text-slate-400 font-bold">กำลังโหลดระบบลงทะเบียน...</p>
            </div>
        );
    }

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-black dark:text-white font-sans flex flex-col overflow-hidden h-[calc(100vh-64px)] select-none transition-colors duration-300">
                
                {/* --- Header --- */}
                <header className="pl-14 pr-6 py-4 bg-slate-100 dark:bg-[#11141d] border-b-2 border-indigo-500/30 flex items-center justify-between shrink-0 shadow-lg z-30 transition-colors duration-300">
                    <div className="flex items-center gap-6">
                        <BackButton to="/academic/hub/registration" className="mr-2" />
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-600/20">
                                <BookOpen size={20} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-black dark:text-white leading-none">ระบบลงทะเบียนเรียน</h1>
                                <p className="text-[9px] text-black/60 dark:text-white/60 font-bold mt-1 uppercase tracking-wider">จัดการแผนการเรียนและลงทะเบียนนักเรียนรายบุคคล</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Top Filters - Now on Right */}
                        <div className="flex items-center gap-0 bg-slate-100 dark:bg-white/5 p-0.5 rounded-xl border border-slate-200 dark:border-white/5 shadow-inner overflow-hidden">
                            <div className="flex items-center gap-2 px-3.5 py-1.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors group">
                                <Calendar size={13} className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-400 transition-colors" />
                                <span className="text-[9px] font-bold text-black dark:text-white uppercase tracking-tight">ปีการศึกษา</span>
                                <select 
                                    value={activeYear} 
                                    onChange={(e) => setActiveYear(e.target.value)}
                                    className="bg-transparent border-none text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-0 p-0 pr-4"
                                >
                                    {availableYears.length > 0 ? (
                                        availableYears.map(year => (
                                            <option key={year} value={year} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{year}</option>
                                        ))
                                    ) : (
                                        <option value={activeYear} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{activeYear || '—'}</option>
                                    )}
                                </select>
                            </div>

                        </div>



                        <button 
                            onClick={handleCommitAll}
                            disabled={pendingChanges.length === 0 || isSaving}
                            className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg flex items-center gap-2 border shrink-0 disabled:shadow-none disabled:opacity-50 ${
                                isSaving 
                                ? 'bg-slate-700 text-white border-white/10 cursor-wait' 
                                : pendingChanges.length > 0
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30 shadow-emerald-600/40 hover:-translate-y-0.5'
                                    : 'bg-slate-200 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/5'
                            }`}
                        >
                            {isSaving ? (
                                <RefreshCw size={18} className="animate-spin" />
                            ) : (
                                <Save size={18} className={pendingChanges.length > 0 ? "animate-bounce" : ""} />
                            )}
                            {pendingChanges.length > 0 ? `บันทึกข้อมูล (${pendingChanges.length})` : 'ไม่มีรายการรอยืนยัน'}
                        </button>
                    </div>
                </header>

                {/* --- Main Grid --- */}
                <main className="flex-1 p-3 flex gap-3 overflow-hidden h-full items-stretch relative z-10">
                    
                    {/* --- COLUMN 1: Courses & Tabs --- */}
                    <div className="flex-[1.4] bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl relative">
                        <div className="flex-1 flex overflow-hidden h-full">
                            
                            <div className="flex-1 flex flex-col border-r border-slate-200 dark:border-white/5">
                                {/* Inner Filters - Compact */}
                                <div className="p-3 space-y-2 bg-slate-50 dark:bg-black/10 border-b border-slate-200 dark:border-white/5">
                                    {/* Row 1: Subject Group & Category */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="relative">
                                            <select 
                                                value={subjectGroupFilter} 
                                                onChange={e=>setSubjectGroupFilter(e.target.value)} 
                                                className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none transition-all"
                                            >
                                                <option value="ทั้งหมด" className="bg-white dark:bg-[#161a27]">ทุกกลุ่มสาระ</option>
                                                {subjectGroupsList.map(g => <option key={g.id} value={g.name} className="bg-white dark:bg-[#161a27]">{g.name}</option>)}
                                            </select>
                                            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>

                                        <div className="relative">
                                            <select 
                                                value={categoryFilter} 
                                                onChange={e=>setCategoryFilter(e.target.value)} 
                                                className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none transition-all"
                                            >
                                                <option value="ทั้งหมด" className="bg-white dark:bg-[#161a27]">ทุกประเภทวิชา</option>
                                                <option value="พื้นฐาน" className="bg-white dark:bg-[#161a27]">พื้นฐาน</option>
                                                <option value="เพิ่มเติม" className="bg-white dark:bg-[#161a27]">เพิ่มเติม</option>
                                            </select>
                                            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    {/* Row 2: Level & Semester */}
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <select 
                                                value={activeClassLevel} 
                                                onChange={e=>setActiveClassLevel(e.target.value)} 
                                                className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none transition-all"
                                            >
                                                <option value="ทั้งหมด" className="bg-white dark:bg-[#161a27]">ชั้นเรียน</option>
                                                {(() => {
                                                    const exp = schoolInfo?.opportunityExpansionLevel || "";
                                                    const allPossible = [
                                                        {id: 'k1', name: 'อนุบาล 1'}, {id: 'k2', name: 'อนุบาล 2'}, {id: 'k3', name: 'อนุบาล 3'},
                                                        {id: 'p1', name: 'ป.1'}, {id: 'p2', name: 'ป.2'}, {id: 'p3', name: 'ป.3'},
                                                        {id: 'p4', name: 'ป.4'}, {id: 'p5', name: 'ป.5'}, {id: 'p6', name: 'ป.6'},
                                                        {id: 'm1', name: 'ม.1'}, {id: 'm2', name: 'ม.2'}, {id: 'm3', name: 'ม.3'},
                                                        {id: 'junior_high', name: 'ม.ต้น'}, 
                                                        {id: 'm4', name: 'ม.4'}, {id: 'm5', name: 'ม.5'}, {id: 'm6', name: 'ม.6'},
                                                        {id: 'senior_high', name: 'ม.ปลาย'}
                                                    ];
                                                    
                                                    if (!exp) return allPossible.map(l => <option key={l.id} value={l.id} className="bg-white dark:bg-[#161a27]">{l.name}</option>);
                                                    const start = exp.split('-')[0]?.trim();
                                                    const end = exp.split('-')[1]?.trim();
                                                    let startIndex = allPossible.findIndex(l => l.name === start || l.id === start);
                                                    let endIndex = allPossible.findIndex(l => l.name === end || l.id === end);
                                                    if (startIndex === -1) startIndex = 0;
                                                    if (endIndex === -1) endIndex = allPossible.length - 1;
                                                    if (endIndex < allPossible.length - 1 && allPossible[endIndex].id === 'm3') endIndex += 1;
                                                    if (endIndex < allPossible.length - 1 && allPossible[endIndex].id === 'm6') endIndex += 1;

                                                    return allPossible.slice(startIndex, endIndex + 1).map(l => (
                                                        <option key={l.id} value={l.id} className="bg-white dark:bg-[#161a27]">{l.name}</option>
                                                    ));
                                                })()}
                                            </select>
                                            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                        <div className="relative flex-1">
                                            <select 
                                                value={activeSemester} 
                                                onChange={e=>setActiveSemester(e.target.value)} 
                                                className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none transition-all"
                                            >
                                                <option value="1" className="bg-white dark:bg-[#161a27]">ภาคเรียนที่ 1</option>
                                                <option value="2" className="bg-white dark:bg-[#161a27]">ภาคเรียนที่ 2</option>
                                                <option value="0" className="bg-white dark:bg-[#161a27]">ทั้งปี (0)</option>
                                            </select>
                                            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    {/* Search & Enrolled Toggle */}
                                    <div className="flex gap-2">
                                        <div className="flex-1 relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" size={12} />
                                            <input 
                                                type="text" 
                                                placeholder="ค้นหารหัส/ชื่อ..." 
                                                value={courseSearch}
                                                onChange={e=>setCourseSearch(e.target.value)}
                                                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white transition-all" 
                                            />
                                        </div>

                                        <button 
                                            onClick={() => setShowOnlyEnrolled(!showOnlyEnrolled)}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black transition-all duration-300 shadow-sm border ${
                                                showOnlyEnrolled 
                                                ? 'bg-indigo-600 text-white border-indigo-400 shadow-indigo-500/20' 
                                                : 'bg-white dark:bg-white/5 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-white/10 hover:border-indigo-500/30'
                                            }`}
                                        >
                                            <Check size={12} strokeWidth={3} />
                                            ลงทะเบียนแล้ว
                                        </button>
                                    </div>
                                </div>

                                {/* List */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-0.5 pb-4">
                                    {(() => {
                                        let lastGroup = "";
                                        return filteredCourses.map(course => {
                                            const showHeader = course.subjectGroup !== lastGroup;
                                            if (showHeader) lastGroup = course.subjectGroup || "";
                                            const isChecked = selectedCourseIds.includes(course.id);
                                            const isActive = selectedCourseId === course.id;

                                            return (
                                                <div key={course.id}>
                                                    <div 
                                                        onClick={() => {
                                                            setSelectedCourseIds(prev => {
                                                                if (prev.includes(course.id)) {
                                                                    // Deselect
                                                                    const next = prev.filter(id => id !== course.id);
                                                                    // If this was the active course, switch to the next one
                                                                    if (selectedCourseId === course.id) {
                                                                        setSelectedCourseId(next.length > 0 ? next[0] : null);
                                                                        if (next.length > 0) {
                                                                            const nextCourse = coursesWithAssignments.find(c => c.id === next[0]);
                                                                            if (nextCourse?.teacherAssignments?.length) {
                                                                                setActiveGroupNum(nextCourse.teacherAssignments[0].groupNumber);
                                                                            }
                                                                        }
                                                                    }
                                                                    return next;
                                                                } else {
                                                                    // Select
                                                                    // Also set as active course for viewing
                                                                    setSelectedCourseId(course.id);
                                                                    setSelectedEnrolledIds([]);
                                                                    setSelectedSourceIds([]);
                                                                    if (course.teacherAssignments && course.teacherAssignments.length > 0) {
                                                                        setActiveGroupNum(course.teacherAssignments[0].groupNumber);
                                                                    } else {
                                                                        setActiveGroupNum(1);
                                                                    }
                                                                    return [...prev, course.id];
                                                                }
                                                            });
                                                        }}
                                                        className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-all border-b border-slate-100 dark:border-white/5 ${
                                                            isChecked 
                                                            ? 'bg-indigo-50/50 dark:bg-indigo-500/5' 
                                                            : 'bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                                                        }`}
                                                    >
                                                        {/* Radio Dot Checkbox */}
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                            isChecked ? 'border-indigo-500 bg-white dark:bg-slate-900' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'
                                                        }`}>
                                                            {isChecked && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm" />}
                                                        </div>

                                                        {/* Course Info */}
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 tracking-tighter shadow-sm ${
                                                                    isChecked ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                                                }`}>{course.code}</span>
                                                                <h4 className={`text-[12px] font-black truncate tracking-tight ${
                                                                    isChecked ? 'text-indigo-600 dark:text-indigo-300' : 'text-black dark:text-white'
                                                                }`}>{course.title}</h4>
                                                            </div>
                                                            
                                                            <div className="flex flex-col gap-0.5 mt-1">
                                                                {course.teacherAssignments?.map((a: any, idx: number) => {
                                                                    const isActiveGroup = a.groupNumber === activeGroupNum && isActive;
                                                                    return (
                                                                        <div key={idx} className={`flex items-center gap-1.5 transition-all ${isActiveGroup ? 'opacity-100' : 'opacity-40'}`}>
                                                                            <div className={`w-1 h-1 rounded-full ${isActiveGroup ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                                                                            <span className={`text-[8px] font-bold truncate ${isActiveGroup ? 'text-indigo-600 dark:text-indigo-300' : 'text-black dark:text-white'}`}>
                                                                                ก.{a.groupNumber} : {teacherMap[a.teacherId]?.name || "ไม่ระบุครู"}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Transfer Arrows: Course List ↔ Group Panel */}
                    <div className="flex flex-col justify-center items-center gap-3 px-1 relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-200 dark:via-white/5 to-transparent -translate-x-1/2" />
                        
                        {/* ADD selected courses to group panel (>) */}
                        <motion.button 
                            whileHover={selectedCourseIds.length > 0 ? { scale: 1.1, x: 5 } : {}}
                            whileTap={selectedCourseIds.length > 0 ? { scale: 0.9 } : {}}
                            onClick={() => {
                                if (selectedCourseIds.length > 0) {
                                    // Set the first selected course as active for viewing
                                    const firstId = selectedCourseIds[0];
                                    setSelectedCourseId(firstId);
                                    const firstCourse = coursesWithAssignments.find(c => c.id === firstId);
                                    if (firstCourse?.teacherAssignments?.length) {
                                        setActiveGroupNum(firstCourse.teacherAssignments[0].groupNumber);
                                    } else {
                                        setActiveGroupNum(1);
                                    }
                                    setSelectedEnrolledIds([]);
                                    setSelectedSourceIds([]);
                                    Swal.fire({ icon: 'success', title: `เลือก ${selectedCourseIds.length} รายวิชา`, text: 'เลือกนักเรียนจากด้านขวาและกดปุ่มย้ายเพื่อลงทะเบียน', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                                }
                            }}
                            disabled={selectedCourseIds.length === 0}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all duration-300 relative z-10 ${
                                selectedCourseIds.length > 0
                                ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.4)] cursor-pointer' 
                                : 'bg-white dark:bg-white/5 text-slate-300 dark:text-slate-700 border-slate-200 dark:border-white/5 opacity-30 cursor-not-allowed'
                            }`}
                        >
                            <ChevronRight size={22} strokeWidth={3} />
                        </motion.button>

                        {/* REMOVE courses from selection (<) */}
                        <motion.button 
                            whileHover={selectedCourseIds.length > 0 ? { scale: 1.1, x: -5 } : {}}
                            whileTap={selectedCourseIds.length > 0 ? { scale: 0.9 } : {}}
                            onClick={() => {
                                if (selectedCourseIds.length > 0) {
                                    setSelectedCourseIds([]);
                                    setSelectedCourseId(null);
                                    setSelectedEnrolledIds([]);
                                    setSelectedSourceIds([]);
                                    Swal.fire({ icon: 'success', title: 'ยกเลิกการเลือกรายวิชาแล้ว', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
                                }
                            }}
                            disabled={selectedCourseIds.length === 0}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all duration-300 relative z-10 ${
                                selectedCourseIds.length > 0 
                                ? 'bg-slate-600 text-white border-slate-400 shadow-lg cursor-pointer hover:bg-slate-500' 
                                : 'bg-white dark:bg-white/5 text-slate-300 dark:text-slate-700 border-slate-200 dark:border-white/5 opacity-30 cursor-not-allowed'
                            }`}
                        >
                            <ChevronLeft size={22} strokeWidth={3} />
                        </motion.button>

                        {/* Cancel All selections */}
                        <motion.button 
                            whileHover={(selectedCourseIds.length > 0 || selectedSourceIds.length > 0 || selectedEnrolledIds.length > 0) ? { scale: 1.1 } : {}}
                            whileTap={(selectedCourseIds.length > 0 || selectedSourceIds.length > 0 || selectedEnrolledIds.length > 0) ? { scale: 0.9 } : {}}
                            onClick={() => {
                                setSelectedCourseIds([]);
                                setSelectedCourseId(null);
                                setSelectedEnrolledIds([]);
                                setSelectedSourceIds([]);
                                Swal.fire({ icon: 'success', title: 'ยกเลิกการเลือกทั้งหมดแล้ว', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
                            }}
                            disabled={selectedCourseIds.length === 0 && selectedSourceIds.length === 0 && selectedEnrolledIds.length === 0}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all duration-300 relative z-10 ${
                                (selectedCourseIds.length > 0 || selectedSourceIds.length > 0 || selectedEnrolledIds.length > 0)
                                ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)] cursor-pointer hover:bg-rose-400' 
                                : 'bg-white dark:bg-white/5 text-slate-300 dark:text-slate-700 border-slate-200 dark:border-white/5 opacity-30 cursor-not-allowed'
                            }`}
                        >
                            <X size={20} strokeWidth={3} />
                        </motion.button>
                    </div>

                    {/* --- COLUMN 2: Middle - Registered Students --- */}
                    <div className="flex-[3.2] bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl relative">
                        <div className="flex h-full overflow-hidden">
                            {/* Left part of middle: Group Info */}
                            <div className="w-[300px] shrink-0 border-r border-slate-200 dark:border-white/5 flex flex-col">
                                <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 bg-slate-900 dark:bg-black/40 flex items-center justify-between">
                                    <LayoutGrid size={14} className="text-indigo-400" />
                                    <h3 className="text-[10px] font-black text-white uppercase tracking-wider">กลุ่มเรียนที่จัดแล้ว</h3>
                                </div>
                                <div className="px-4 py-2.5 text-[9px] text-black dark:text-white/60 font-black border-b border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/[0.03] uppercase tracking-tighter shadow-sm">
                                    <div className="flex justify-between">
                                        <span>รายชื่อกลุ่มเรียน (วิชา-กลุ่ม รหัสครู ชื่อครู)</span>
                                        <span className="text-indigo-600 dark:text-indigo-400">เลือก</span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                                    <div className="space-y-4">
                                        {activeCourses.length > 0 ? (
                                            activeCourses.map(course => {
                                                const cid = course.id;
                                                return (
                                                    <div key={cid} className="space-y-1.5">
                                                        {/* Course Context Header */}
                                                        <div className="flex items-center gap-2 px-2 py-1 bg-indigo-600/5 dark:bg-indigo-500/5 rounded-lg border border-indigo-500/10 mb-1">
                                                            <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                                                            <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400">{course.code}</span>
                                                            <span className="text-[8px] font-bold text-slate-600 dark:text-slate-400 truncate">{course.title}</span>
                                                        </div>
                                                        
                                                        {course.teacherAssignments && course.teacherAssignments.length > 0 ? (
                                                            course.teacherAssignments.sort((a: any, b: any) => a.groupNumber - b.groupNumber).map((a: any) => {
                                                                const isActive = activeGroupNum === a.groupNumber && selectedCourseId === cid;
                                                                return (
                                                                    <div 
                                                                        key={`${cid}-${a.groupNumber}`}
                                                                        onClick={() => {
                                                                            setSelectedCourseId(cid);
                                                                            setActiveGroupNum(a.groupNumber);
                                                                        }}
                                                                        className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-2.5 ${isActive ? 'bg-indigo-600/10 border-indigo-500/40 shadow-sm ring-1 ring-indigo-500/20' : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                                                    >
                                                                        {/* Compact Group Badge */}
                                                                        <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center shrink-0 leading-none transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40 scale-105' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                                                                            <span className="text-[6px] uppercase font-black tracking-tighter mb-0.5 opacity-60">กลุ่ม</span>
                                                                            <span className="text-sm font-black leading-none">{a.groupNumber}</span>
                                                                        </div>

                                                                        {/* Info Section - Compact */}
                                                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <span className="text-indigo-600 dark:text-indigo-400 font-mono text-[8px] font-black shrink-0">
                                                                                    [{teacherMap[a.teacherId]?.teacherId || "N/A"}]
                                                                                </span>
                                                                                <h4 className={`text-[10px] font-black truncate tracking-tight ${isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}`}>
                                                                                    {teacherMap[a.teacherId]?.name || "ไม่ระบุครู"}
                                                                                </h4>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 mt-0.5 opacity-60">
                                                                                <div className="flex items-center gap-2">
                                                                                    {(() => {
                                                                                        const label = getLevelLabel(course.classId as string);
                                                                                        return label ? (
                                                                                            <div className="flex items-center bg-indigo-500/10 border border-indigo-500/10 px-1.5 py-0.5 rounded-md shrink-0">
                                                                                                <span className="text-[7px] font-black text-indigo-500 uppercase tracking-tighter">{label}</span>
                                                                                            </div>
                                                                                        ) : null;
                                                                                    })()}
                                                                                    <div className="flex items-center gap-1">
                                                                                        <Users size={8} />
                                                                                        <span className="text-[8px] font-bold">
                                                                                            {enrollments.filter(e => e.courseId === cid && e.groupName === `กลุ่ม ${a.groupNumber}`).length} คน
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                                {a.roomIds && a.roomIds.length > 0 ? (
                                                                                    <div className="flex flex-wrap gap-1">
                                                                                        {a.roomIds.map((rid: string) => {
                                                                                            const room = rooms.find(r => r.id === rid);
                                                                                            return room ? (
                                                                                                <div key={rid} className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/10 px-1.5 py-0.5 rounded-md">
                                                                                                    <MapPin size={7} className="text-emerald-400" />
                                                                                                    <span className="text-[7px] font-black text-emerald-400 uppercase tracking-tighter">
                                                                                                        {room.roomCode} {room.roomName}
                                                                                                    </span>
                                                                                                </div>
                                                                                            ) : null;
                                                                                        })}
                                                                                    </div>
                                                                                ) : (
                                                                                    a.roomName && (
                                                                                        <div className="flex items-center gap-1 bg-slate-500/10 border border-slate-500/10 px-1.5 py-0.5 rounded-md">
                                                                                            <MapPin size={7} className="text-slate-400" />
                                                                                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">{a.roomName}</span>
                                                                                        </div>
                                                                                    )
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        
                                                                        {isActive && (
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                                                                        )}
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <div className="py-2 px-3 rounded-lg border border-dashed border-slate-200 dark:border-white/5 text-center">
                                                                <span className="text-[8px] font-bold text-slate-400">ไม่มีกลุ่มเรียน</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="p-8 text-center opacity-20 flex flex-col items-center">
                                                <BookOpen size={30} className="mb-2" />
                                                <p className="text-[9px] font-black uppercase">กรุณาเลือกรายวิชา</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right part of middle: Student List in Course */}
                            <div className="flex-1 flex flex-col">
                                <div className="px-4 py-3 border-b border-white/5 bg-slate-900 dark:bg-black/40 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users size={14} className="text-emerald-400" />
                                        <h3 className="text-[10px] font-black text-white uppercase tracking-wider">นักเรียนในรายวิชา</h3>
                                    </div>
                                </div>
                                {/* Header table */}
                                <div className="grid grid-cols-12 gap-1 px-4 py-2.5 text-[8px] font-black text-black dark:text-white/60 uppercase border-b border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/[0.03] sticky top-0 z-10 shadow-sm">
                                    <div 
                                        className="col-span-2 cursor-pointer hover:text-indigo-400 transition-colors flex items-center gap-1 group"
                                        onClick={toggleSelectAllEnrolled}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${selectedEnrolledIds.length === enrolledStudents.length && enrolledStudents.length > 0 ? 'border-indigo-500 bg-white dark:bg-[#161a27]' : 'border-slate-600 group-hover:border-indigo-500'}`}>
                                            {selectedEnrolledIds.length === enrolledStudents.length && enrolledStudents.length > 0 && (
                                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-in zoom-in duration-300" />
                                            )}
                                        </div>
                                        เลือก
                                    </div>
                                    <div className="col-span-2">ห้อง</div>
                                    <div className="col-span-2">เลขที่</div>
                                    <div className="col-span-2">รหัส</div>
                                    <div className="col-span-4">ชื่อ-นามสกุล</div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {enrolledStudents.map(s => {
                                        const isPendingAdd = pendingChanges.some(c => c.type === 'add' && c.studentId === s.id && c.courseId === selectedCourseId && c.groupName === `กลุ่ม ${activeGroupNum}`);
                                        const isPendingRemove = pendingChanges.some(c => c.type === 'remove' && c.studentId === s.id && c.courseId === selectedCourseId && c.groupName === `กลุ่ม ${activeGroupNum}`);
                                        return (
                                            <div 
                                                key={s.id}
                                                onClick={() => setSelectedEnrolledIds(prev => prev.includes(s.id) ? prev.filter(x=>x!==s.id) : [...prev, s.id])}
                                                className={`grid grid-cols-12 gap-1 px-4 py-2 border-b border-white/[0.02] text-[10px] items-center cursor-pointer hover:bg-white/5 transition-all ${selectedEnrolledIds.includes(s.id) ? 'bg-indigo-600/10' : ''} ${isPendingAdd ? 'bg-emerald-500/10' : ''} ${isPendingRemove ? 'bg-rose-500/10 opacity-60' : ''}`}
                                            >
                                                <div className="col-span-2 flex justify-center">
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${selectedEnrolledIds.includes(s.id) ? 'border-indigo-500 bg-white dark:bg-[#161a27]' : 'border-slate-700'}`}>
                                                        {selectedEnrolledIds.includes(s.id) && (
                                                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-in zoom-in duration-300" />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="col-span-2 font-bold text-slate-400 dark:text-slate-500">{getLevelLabel(s.classLevel)}/{s.room}</div>
                                                <div className="col-span-2 font-black text-slate-800 dark:text-white">
                                                    {s.studentNumber || "-"}
                                                    {isPendingAdd && <span className="ml-1 text-[8px] text-emerald-500 font-black animate-pulse">NEW</span>}
                                                    {isPendingRemove && <span className="ml-1 text-[8px] text-rose-500 font-black">DEL</span>}
                                                </div>
                                                <div className="col-span-2 font-mono text-slate-400 dark:text-slate-500">{s.studentId}</div>
                                                <div className="col-span-4 font-bold text-black dark:text-white truncate">{s.title}{s.firstName} {s.lastName}</div>
                                            </div>
                                        );
                                    })}
                                    {enrolledStudents.length === 0 && (
                                        <div className="p-20 text-center opacity-10">
                                            <Users size={60} className="mx-auto mb-4" />
                                            <p className="text-xs font-black uppercase">ว่างเปล่า</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Transfer Arrows (Functional) */}
                    <div className="flex flex-col justify-center gap-5 px-1 relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-200 dark:via-white/5 to-transparent -translate-x-1/2" />
                        
                        {/* ENROLL: From Right to Middle */}
                        <motion.button 
                            whileHover={selectedSourceIds.length > 0 && selectedCourseId ? { scale: 1.1, x: -5 } : {}}
                            whileTap={selectedSourceIds.length > 0 && selectedCourseId ? { scale: 0.9 } : {}}
                            onClick={handleBatchEnroll}
                            disabled={selectedSourceIds.length === 0 || !selectedCourseId}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-300 relative z-10 ${
                                selectedSourceIds.length > 0 && selectedCourseId
                                ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.4)] cursor-pointer' 
                                : 'bg-white dark:bg-white/5 text-slate-300 dark:text-slate-700 border-slate-200 dark:border-white/5 opacity-40 cursor-not-allowed'
                            }`}
                        >
                            <ChevronLeft size={24} strokeWidth={3} />
                        </motion.button>

                        {/* UNENROLL: From Middle to Right */}
                        <motion.button 
                            whileHover={selectedEnrolledIds.length > 0 ? { scale: 1.1, x: 5 } : {}}
                            whileTap={selectedEnrolledIds.length > 0 ? { scale: 0.9 } : {}}
                            onClick={handleBatchUnenroll}
                            disabled={selectedEnrolledIds.length === 0}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-300 relative z-10 ${
                                selectedEnrolledIds.length > 0 
                                ? 'bg-slate-500 text-white border-slate-400 cursor-pointer shadow-lg' 
                                : 'bg-white dark:bg-white/5 text-slate-300 dark:text-slate-700 border-slate-200 dark:border-white/5 opacity-40 cursor-not-allowed'
                            }`}
                        >
                            <ChevronRight size={24} strokeWidth={3} />
                        </motion.button>

                        {/* DELETE/UNENROLL: Trash Icon */}
                        <motion.button 
                            whileHover={selectedEnrolledIds.length > 0 ? { scale: 1.1 } : {}}
                            whileTap={selectedEnrolledIds.length > 0 ? { scale: 0.9 } : {}}
                            onClick={handleBatchUnenroll}
                            disabled={selectedEnrolledIds.length === 0}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-300 relative z-10 ${
                                selectedEnrolledIds.length > 0 
                                ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.4)] cursor-pointer' 
                                : 'bg-white dark:bg-white/5 text-slate-300 dark:text-slate-700 border-slate-200 dark:border-white/5 opacity-40 cursor-not-allowed'
                            }`}
                        >
                            <Trash2 size={24} strokeWidth={3} />
                        </motion.button>
                    </div>

                    {/* --- COLUMN 3: Right - Source Students --- */}
                    <div className="flex-[2] bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl relative">
                        <div className="flex-1 flex overflow-hidden h-full">
                            
                            {/* Vertical Room Sidebar */}
                            <div className="w-14 flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20">
                                <div className="py-2.5 text-center border-b border-slate-200 dark:border-white/5 font-black text-[8px] text-black dark:text-white/60 uppercase tracking-tighter bg-slate-100 dark:bg-white/[0.03] shadow-sm">ห้อง</div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar no-scrollbar">
                                    {["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "แผน", "ALL"].map((r) => (
                                        <button 
                                            key={r} 
                                            onClick={() => setActiveRoom(r)}
                                            className={`w-full py-2.5 text-[10px] font-black transition-all ${activeRoom === r ? 'bg-indigo-600 text-white' : 'text-black dark:text-white/60 hover:text-indigo-400'}`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Student List */}
                            <div className="flex-1 flex flex-col">
                                <div className="px-4 py-3 border-b border-white/5 bg-slate-900 dark:bg-black/40 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users size={14} className="text-blue-400" />
                                        <h3 className="text-[10px] font-black text-white uppercase tracking-wider">รายชื่อนักเรียน</h3>
                                    </div>
                                </div>
                                <div className="p-3 space-y-2 bg-slate-50 dark:bg-black/10 border-b border-slate-200 dark:border-white/5">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" size={12} />
                                        <input 
                                            type="text" 
                                            placeholder="ค้นหารหัสนักเรียน/ชื่อ-นามสกุล..." 
                                            value={studentSearch}
                                            onChange={(e) => setStudentSearch(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 dark:text-white transition-all" 
                                        />
                                    </div>
                                </div>

                                {/* Table Header */}
                                <div className="grid grid-cols-12 gap-1 px-4 py-2.5 text-[8px] font-black text-black dark:text-white/60 uppercase border-b border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/[0.03] sticky top-0 z-10 shadow-sm">
                                    <div 
                                        className="col-span-2 cursor-pointer hover:text-blue-400 transition-colors flex items-center gap-1 group"
                                        onClick={toggleSelectAllSource}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${selectedSourceIds.length === sourceStudents.length && sourceStudents.length > 0 ? 'border-blue-500 bg-white dark:bg-[#161a27]' : 'border-slate-600 group-hover:border-blue-500'}`}>
                                            {selectedSourceIds.length === sourceStudents.length && sourceStudents.length > 0 && (
                                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-in zoom-in duration-300" />
                                            )}
                                        </div>
                                        เลือก
                                    </div>
                                    <div className="col-span-2">ห้อง</div>
                                    <div className="col-span-2">เลขที่</div>
                                    <div className="col-span-6">รายชื่อ-นามสกุล</div>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar pb-6 px-1">
                                    {sourceStudents.map(s => {
                                        const isSel = selectedSourceIds.includes(s.id);
                                        return (
                                            <div 
                                                key={s.id} 
                                                onClick={() => setSelectedSourceIds(prev => isSel ? prev.filter(x=>x!==s.id) : [...prev, s.id])}
                                                className={`grid grid-cols-12 gap-1 px-2 py-1.5 border-b border-white/[0.02] text-[9px] items-center cursor-pointer hover:bg-white/5 transition-all ${isSel ? 'bg-indigo-600/10' : ''}`}
                                            >
                                                <div className="col-span-2 flex justify-center">
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isSel ? 'border-blue-500 bg-white dark:bg-[#161a27]' : 'border-slate-700'}`}>
                                                        {isSel && (
                                                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-in zoom-in duration-300" />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="col-span-2 font-bold text-slate-400 dark:text-slate-500">{getLevelLabel(s.classLevel)}/{s.room}</div>
                                                <div className="col-span-2 font-black text-slate-800 dark:text-white">{s.studentNumber || "-"}</div>
                                                <div className="col-span-6 font-bold text-black dark:text-white truncate">
                                                    <span className="text-slate-400 dark:text-slate-600 mr-1">[{s.studentId}]</span>
                                                    {s.title}{s.firstName} {s.lastName}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Bottom Pagination Mockup */}
                                <div className="p-2 border-t border-white/5 flex justify-center gap-1">
                                    {[1, 2, 3, 4, 5].map(p => (
                                        <button key={p} className={`w-5 h-5 rounded text-[8px] font-black ${p===1 ? 'bg-indigo-600 text-white' : 'text-black dark:text-white'}`}>{p}</button>
                                    ))}
                                    <button className="w-5 h-5 rounded text-[8px] font-black text-slate-500">...</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>



<style dangerouslySetInnerHTML={{ __html: `
    .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
    .no-scrollbar::-webkit-scrollbar { display: none; }
`}} />
</div>
</MainLayout>
);
};

export default CourseEnrollmentPage;
