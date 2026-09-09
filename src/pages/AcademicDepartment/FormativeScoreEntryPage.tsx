import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import BackButton from "@/components/Shared/BackButton";
import { RootState } from "@/store";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLES } from "@/constants/roles";
import { firestore as db } from "@/firebase";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    onSnapshot, 
    writeBatch, 
    serverTimestamp,
    getDoc 
} from "firebase/firestore";
import MainLayout from "@/layouts/MainLayout";
import { 
    ChevronLeft,
    Save,
    Info,
    AlertCircle, 
    Settings,
    ClipboardCheck,
    Calculator,
    ArrowRight,
    ChevronRight,
    BarChart3,
    Trophy,
    ChevronsRight
} from "lucide-react";
import { CLASSES, CLASS_FULL_NAMES, getClassOptionsBySchoolSettings } from "@/utils/schoolUtils";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { isActivityCourseCode, invalidateStaleResolvedRequests } from "@/utils/remediationUtils";
import Swal from "sweetalert2";

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    studentNumber: string;
    room: string;
    studentId?: string;
    title?: string;
}

interface AssessmentItem {
    id?: string;
    name: string;
    maxScore: number;
    term: 'pre-midterm' | 'post-midterm';
}

interface Course {
    id: string;
    code: string;
    title: string;
    classId: string | string[];
    classLevel?: string;
    room?: string[];
    formativeAssessments?: AssessmentItem[];
    formativeWeight?: number;
    midtermWeight?: number;
    finalWeight?: number;
    semester?: string;
    teacherId?: string | string[];
    teacherIds?: string[];
    teacherAssignments?: { teacherId?: string }[];
}

interface GradeRecord {
    formative?: number | string;
    midterm?: number | string;
    final?: number | string;
    formativeDetails?: Record<string, number | string>;
    grade?: string;
    status?: string;
    incompleteFields?: string[];
    updatedAt?: any;
    updatedBy?: string;
}

const getAssessmentKey = (assessment: AssessmentItem) => assessment.id || assessment.name;
const normalizeRoom = (room: unknown) => {
    const value = String(room ?? "").trim();
    if (!value) return "";
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : value.toLowerCase();
};
const courseMatchesRoom = (courseRooms: unknown, selectedRoom: string) => {
    if (!selectedRoom || selectedRoom === 'all') return true;
    if (!Array.isArray(courseRooms) || courseRooms.length === 0) return true;

    const normalizedRooms = courseRooms.map(room => normalizeRoom(room));
    return normalizedRooms.includes('all') || normalizedRooms.includes(normalizeRoom(selectedRoom));
};

const matchesLevel = (courseClassId: any, selectedLevel: any): boolean => {
    if (!selectedLevel || selectedLevel === "ทั้งหมด") return true;
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

    // Check if the selected level is one of our mapped grades
    for (const [id, labels] of Object.entries(gradeMap)) {
        if (id === normalizedSelected || labels.includes(normalizedSelected)) {
            return labels.includes(normalizedId) || id === normalizedId;
        }
    }

    return false;
};

const allClassOptions = Object.entries(CLASSES) as [string, string][];
const toStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    if (value === null || value === undefined) return [];
    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
};
const toScoreNumber = (value: unknown) => value === "" || value === undefined || value === null ? 0 : Number(value) || 0;
const normalizeFormativeDetails = (details?: Record<string, number | string>) => {
    const normalized: Record<string, number> = {};
    Object.entries(details || {}).forEach(([key, value]) => {
        normalized[key] = toScoreNumber(value);
    });
    return normalized;
};
// ช่องกรอกคะแนนยอมรับได้แค่ตัวเลข (ว่างได้) หรือตัวอักษร "ร" (หมายถึงงาน/ชิ้นนี้ยังไม่สมบูรณ์) เท่านั้น —
// ตัวอักษรอื่นพิมพ์ไม่ผ่านเลย คืน null เพื่อไม่ให้ setState เกิดขึ้น
// ถ้ามี "ร" ปนอยู่ในค่าที่พิมพ์ (เช่น ช่องมีเลขเดิมอยู่แล้วแล้วพิมพ์ ร ทับโดยไม่ได้เลือกลบของเดิมก่อน) ให้ "ร"
// ชนะเสมอแทนที่ทั้งช่องไปเลย ไม่ต้องให้ครูลบของเดิมออกก่อนถึงจะพิมพ์ ร ได้
const sanitizeScoreInput = (value: string): string | null => {
    if (value.includes('ร')) return 'ร';
    if (value === '' || /^\d*\.?\d*$/.test(value)) return value;
    return null;
};
// นักเรียนติด "ร" ถ้ามีช่องคะแนนช่องใดช่องหนึ่ง (คะแนนเก็บ หรือ กลางภาค) เป็น "ร" — ไม่ว่าจะกี่ช่องก็ตาม
// สรุปเป็น "ร" เดียวที่สมุดพก ไม่ใช่หลายจุด
// รายชื่อฟิลด์ที่ครูพิมพ์ "ร" ไว้ (ชื่อ assessment key หรือ "midterm") — ต้องบันทึกแยกเป็น incompleteFields
// ต่างหาก เพราะฟิลด์คะแนนดิบ (formativeDetails/midterm) ต้องเก็บเป็นตัวเลขเสมอสำหรับคำนวณคะแนนรวมที่อื่น
// (GradeBookPage ฯลฯ) ถ้าเก็บ "ร" ปนไว้ในนั้นตรงๆ คะแนนรวมจะพังไปด้วย — incompleteFields ใช้แค่ตอนโหลดข้อมูล
// กลับมาแสดงผลในช่องกรอกให้ตรงกับที่ครูพิมพ์ไว้เท่านั้น
const collectIncompleteFields = (record: { formativeDetails?: Record<string, number | string>; midterm?: number | string }): string[] => {
    const fields: string[] = [];
    Object.entries(record.formativeDetails || {}).forEach(([key, v]) => { if (v === 'ร') fields.push(key); });
    if (record.midterm === 'ร') fields.push('midterm');
    return fields;
};
// สีช่องคะแนนสำหรับช่องที่ "เคยติด ร" มาก่อน (เทียบจาก incompleteFields ที่เก็บถาวรไว้ ไม่ว่าจะแก้แล้วหรือยัง):
// ยังไม่แก้ (grade ยังเป็น "ร") = แดง, แก้แล้วแต่ยังไม่ได้คะแนนจริง (0) = เหลือง, แก้แล้วได้คะแนนจริง = เขียว
// ช่องที่ไม่เคยติด ร เลยคืน null ให้ใช้สีปกติของช่องนั้นต่อไป
type IncompleteCellColor = 'red' | 'yellow' | 'green' | null;
const getIncompleteCellColor = (record: { grade?: string; incompleteFields?: string[] }, rawValue: unknown, key: string): IncompleteCellColor => {
    if (!(record.incompleteFields || []).includes(key)) return null;
    if (record.grade === 'ร') return 'red';
    return (Number(rawValue) || 0) > 0 ? 'green' : 'yellow';
};
const getClassLevelVariants = (classKey: string) => {
    return Array.from(new Set([
        classKey,
        CLASSES[classKey],
        CLASS_FULL_NAMES[classKey]
    ].filter(Boolean).map(String)));
};

const FormativeScoreEntryPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const dispatch = useDispatch();

    const { isSchoolAdmin, isAcademicAdmin, isSuperAdmin, hasRole } = usePermissions();
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
    const isSchoolLeadership = hasRole([ROLES.DIRECTOR, ROLES.DEPT_HEAD]);

    const userPrivileges = useMemo(() => {
        const teacherProfiles = Object.values(teacherMap || {}).filter((t: any) => t.uid === currentUser?.uid);
        const teacherProfile = teacherProfiles[0] as any;
        const isHead = teacherProfile?.isHeadOfLearningArea || teacherProfile?.isHeadOfAssessment;
        const isAdmin = isSchoolAdmin || isSuperAdmin || isAcademicAdmin || isSchoolLeadership;

        return {
            canSeeAll: isAdmin || isHead,
            myTeacherIds: teacherProfiles.map((t: any) => t.id)
        };
    }, [currentUser, teacherMap, isSchoolAdmin, isSuperAdmin, isAcademicAdmin, isSchoolLeadership]);

    const { academicYear: calYear, status: calendarStatus } = useSelector((state: RootState) => state.calendar);
    const [academicYear, setAcademicYear] = useState<string>("");

    useEffect(() => {
        if (schoolId && calendarStatus === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }
        if (schoolId && teacherMapStatus === 'idle') {
            dispatch(fetchTeachersMap(schoolId) as any);
        }
    }, [schoolId, calendarStatus, teacherMapStatus, dispatch]);

    useEffect(() => {
        if (calendarStatus === 'succeeded' && calYear) {
            setAcademicYear(calYear);
        }
    }, [calendarStatus, calYear]);

    // Filters
    const [selectedLevel, setSelectedLevel] = useState(() => {
        const rawLevel = searchParams.get('level') || searchParams.get('classId') || "";
        if (!rawLevel) return "";
        // Pre-normalize if it's a label
        const found = allClassOptions.find(([id, label]) => 
            id.toLowerCase() === rawLevel.toLowerCase() || 
            label.toLowerCase() === rawLevel.toLowerCase()
        );
        return found ? found[0] : rawLevel;
    });
    const [selectedRoom, setSelectedRoom] = useState(searchParams.get('room') || "");
    const [selectedSemester, setSelectedSemester] = useState(searchParams.get('semester') || "");
    const [selectedCourseId, setSelectedCourseId] = useState(searchParams.get('courseId') || "");
    const [selectedGroup, setSelectedGroup] = useState(searchParams.get('groupId') || "");
    const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>(allClassOptions);

    const [courses, setCourses] = useState<Course[]>([]);
    const [semesterAssignments, setSemesterAssignments] = useState<Record<string, { teacherId?: string }[]>>({});
    const [students, setStudents] = useState<Student[]>([]);
    const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [availableGroups, setAvailableGroups] = useState<{ id: string; label: string }[]>([]);
    const [courseSearchTerm, setCourseSearchTerm] = useState("");
    const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);
    const [courseDropdownCoords, setCourseDropdownCoords] = useState({ left: 0, top: 0, width: 0, maxHeight: 300 });
    const courseInputRef = useRef<HTMLInputElement>(null);
    const courseFieldRef = useRef<HTMLDivElement>(null);
    const courseBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
    const [rowBulkValues, setRowBulkValues] = useState<Record<string, string>>({});
    const [availableRooms, setAvailableRooms] = useState<string[]>([]);
    const fetchStudentsRequestRef = useRef(0);

    useEffect(() => {
        if (!schoolId) return;

        const fetchSchoolClassOptions = async () => {
            try {
                const schoolSnap = await getDoc(doc(db, 'school-settings', schoolId));
                if (!schoolSnap.exists()) {
                    setAvailableClassOptions(allClassOptions);
                    return;
                }

                const data = schoolSnap.data();
                const options = getClassOptionsBySchoolSettings(
                    data.opportunityExpansionLevel || "",
                    data.schoolType || ""
                );
                setAvailableClassOptions(options.length > 0 ? options : allClassOptions);
            } catch (err) {
                console.error("Error fetching school class options:", err);
                setAvailableClassOptions(allClassOptions);
            }
        };

        fetchSchoolClassOptions();
    }, [schoolId]);

    useEffect(() => {
        if (!selectedLevel || selectedLevel === "ทั้งหมด") return;

        const exists = availableClassOptions.some(([id]) => id === selectedLevel);
        if (!exists) {
            // Try to normalize from label if it was set as a label
            const found = availableClassOptions.find(([id, label]) => label === selectedLevel);
            if (found) {
                setSelectedLevel(found[0]);
            } else {
                setSelectedLevel("");
                setSelectedCourseId("");
                setSelectedGroup("");
            }
        }
    }, [availableClassOptions, selectedLevel]);

    // Rooms that actually exist for the selected level — derived from students who are
    // currently active (isStudyingStudent). Older cohorts that have not graduated yet keep
    // showing their room here even if this year's intake has fewer sections, since the room
    // list follows real student assignments rather than a fixed count.
    useEffect(() => {
        if (!schoolId || !selectedLevel) {
            setAvailableRooms([]);
            return;
        }
        let cancelled = false;
        const fetchRooms = async () => {
            try {
                const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                const classLevelVariants = getClassLevelVariants(selectedLevel);
                const snap = await getDocs(query(studentsRef, where('classLevel', 'in', classLevelVariants)));
                if (cancelled) return;
                const rooms = new Set<string>();
                snap.forEach(d => {
                    const data = d.data();
                    if (!isStudyingStudent(data)) return;
                    if (!matchesLevel(data.classLevel, selectedLevel)) return;
                    const room = String(data.room || "").trim();
                    if (room) rooms.add(room);
                });
                setAvailableRooms(Array.from(rooms).sort((a, b) => a.localeCompare(b, 'th', { numeric: true })));
            } catch (err) {
                console.error("Error fetching room options:", err);
                if (!cancelled) setAvailableRooms([]);
            }
        };
        fetchRooms();
        return () => { cancelled = true; };
    }, [schoolId, selectedLevel]);

    useEffect(() => {
        if (selectedRoom && selectedRoom !== 'all' && availableRooms.length > 0 && !availableRooms.includes(selectedRoom)) {
            setSelectedRoom("");
        }
    }, [availableRooms, selectedRoom]);

    // Fetch Courses
    useEffect(() => {
        if (!schoolId) return;
        const fetchCourses = async () => {
            const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
            const snap = await getDocs(query(coursesRef));
            setCourses(snap.docs
                .map(d => ({ id: d.id, ...d.data() } as Course))
                .filter(course => (course as any).isActive !== false)
            );
        };
        fetchCourses();
    }, [schoolId]);

    // Fetch semester-scoped teacher assignments — course docs themselves don't reliably carry
    // teacherId/teacherAssignments; the current-term source of truth is course_assignments
    // (same collection GradeBookPage reads), keyed by courseId + academicYear + semester.
    useEffect(() => {
        if (!schoolId || !academicYear) {
            setSemesterAssignments({});
            return;
        }
        const assignmentsRef = collection(db, 'school-settings', schoolId, 'course_assignments');
        const constraints = [
            where('academicYear', '==', String(academicYear)),
            ...(selectedSemester && selectedSemester !== 'annual' ? [where('semester', '==', String(selectedSemester))] : [])
        ];
        const unsubscribe = onSnapshot(query(assignmentsRef, ...constraints), (snap) => {
            const mapping: Record<string, { teacherId?: string }[]> = {};
            snap.docs.forEach(d => {
                const data = d.data();
                mapping[data.courseId] = [
                    ...(mapping[data.courseId] || []),
                    ...(data.teacherAssignments || [])
                ];
            });
            setSemesterAssignments(mapping);
        });
        return () => unsubscribe();
    }, [schoolId, academicYear, selectedSemester]);

    // Derived State: Selected Course
    const currentCourse = useMemo(() => courses.find(c => c.id === selectedCourseId), [courses, selectedCourseId]);

    const filteredCourses = useMemo(() => {
        return courses.filter(c => {
            // Activity subjects (โฮมรูม, แนะแนว, ชุมนุม, ลูกเสือ, รด. ฯลฯ — code starting with "ก")
            // are graded pass/fail through the activity evaluation flow, not formative/midterm scores.
            if (isActivityCourseCode(c.code)) return false;

            if (selectedLevel) {
                if (!matchesLevel(c.classId, selectedLevel)) return false;
            }

            if (!courseMatchesRoom(c.room, selectedRoom)) {
                return false;
            }

            if (selectedSemester) {
                const isAnnualCourse = c.semester === '1-2' || c.semester === 'annual' || c.semester === '0' || !c.semester;
                if (!isAnnualCourse && c.semester !== selectedSemester) return false;
            }

            // Teacher / My Courses Filter — teachers only see subjects assigned to them;
            // admins and school leadership (director/dept head/head of learning area/assessment) see everything.
            // Prefer the semester-scoped course_assignments record; fall back to whatever
            // teacherAssignments/teacherId is embedded directly on the course doc.
            const courseTeacherIds = new Set<string>();
            const structuredAssignments = (semesterAssignments[c.id]?.length ? semesterAssignments[c.id] : c.teacherAssignments) || [];
            if (structuredAssignments.length > 0) {
                structuredAssignments.forEach((a) => {
                    if (a.teacherId) courseTeacherIds.add(a.teacherId);
                });
            } else {
                [...toStringArray(c.teacherId), ...toStringArray(c.teacherIds)]
                    .filter(id => id.toLowerCase() !== 'pending')
                    .forEach(id => courseTeacherIds.add(id));
            }

            const myIds = userPrivileges.myTeacherIds || [];
            if (!userPrivileges.canSeeAll) {
                const isMyCourse = myIds.length > 0 && myIds.some((id: string) => courseTeacherIds.has(id));
                if (!isMyCourse) return false;
            }

            return true;
        });
    }, [courses, selectedLevel, selectedRoom, selectedSemester, userPrivileges, semesterAssignments]);

    const courseSearchResults = useMemo(() => {
        const term = courseSearchTerm.toLowerCase().trim();
        if (!term) return filteredCourses;
        return filteredCourses.filter(c =>
            c.code.toLowerCase().includes(term) || c.title.toLowerCase().includes(term)
        );
    }, [filteredCourses, courseSearchTerm]);

    const selectedCourseObj = useMemo(
        () => filteredCourses.find(c => c.id === selectedCourseId),
        [filteredCourses, selectedCourseId]
    );

    const updateCourseDropdownPosition = () => {
        if (!courseFieldRef.current) return;
        const rect = courseFieldRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setCourseDropdownCoords({
            left: rect.left,
            top: rect.bottom + 4,
            width: rect.width,
            maxHeight: Math.max(160, Math.min(spaceBelow - 16, 400)),
        });
    };

    const openCourseDropdown = () => {
        if (courseBlurTimeoutRef.current) clearTimeout(courseBlurTimeoutRef.current);
        updateCourseDropdownPosition();
        setCourseSearchTerm("");
        setIsCourseDropdownOpen(true);
    };

    const closeCourseDropdown = () => {
        courseBlurTimeoutRef.current = setTimeout(() => setIsCourseDropdownOpen(false), 150);
    };

    const selectCourseFromSearch = (courseId: string) => {
        if (courseBlurTimeoutRef.current) clearTimeout(courseBlurTimeoutRef.current);
        setSelectedCourseId(courseId);
        setSelectedGroup("");
        setCourseSearchTerm("");
        setIsCourseDropdownOpen(false);
        courseInputRef.current?.blur();
    };

    // Close instead of leaving the dropdown floating over the wrong spot once the page scrolls/resizes.
    useEffect(() => {
        if (!isCourseDropdownOpen) return;
        const handleScrollOrResize = () => setIsCourseDropdownOpen(false);
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isCourseDropdownOpen]);

    useEffect(() => {
        const fetchGroups = async () => {
            if (!schoolId || !selectedCourseId || !academicYear) {
                setAvailableGroups([]);
                return;
            }

            const constraints = [
                where('courseId', '==', selectedCourseId),
                where('academicYear', '==', academicYear)
            ];
            if (selectedSemester && selectedSemester !== 'annual' && selectedSemester !== '0') {
                constraints.push(where('semester', '==', selectedSemester));
            }

            const snap = await getDocs(query(collection(db, 'school-settings', schoolId, 'enrollments'), ...constraints));
            const groupNames = Array.from(new Set(snap.docs.map(d => d.data().groupName as string).filter(Boolean)));
            setAvailableGroups(groupNames.sort().map(name => ({ id: name, label: name })));
        };

        fetchGroups();
    }, [schoolId, selectedCourseId, selectedSemester, academicYear]);

    useEffect(() => {
        if (selectedGroup && selectedGroup !== 'all' && availableGroups.length > 0 && !availableGroups.some(g => g.id === selectedGroup)) {
            setSelectedGroup('');
        }
    }, [availableGroups, selectedGroup]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (selectedLevel) params.set('level', selectedLevel);
        if (selectedRoom) params.set('room', selectedRoom);
        if (selectedSemester) params.set('semester', selectedSemester);
        if (selectedCourseId) params.set('courseId', selectedCourseId);
        if (selectedGroup) params.set('groupId', selectedGroup);
        const newStr = params.toString();
        if (newStr !== searchParams.toString()) {
            setSearchParams(params, { replace: true });
        }
    }, [selectedLevel, selectedRoom, selectedSemester, selectedCourseId, selectedGroup, searchParams, setSearchParams]);
    
    // Filtered Assessments (Pre-midterm only)
    const activeAssessments = useMemo(() => {
        if (!currentCourse) return [];
        return (currentCourse.formativeAssessments || []).filter(a => a.term === 'pre-midterm' && a.maxScore > 0);
    }, [currentCourse]);

    const totalMaxPossible = useMemo(() => activeAssessments.reduce((sum, a) => sum + a.maxScore, 0), [activeAssessments]);
    const configuredFormativeMax = useMemo(() => currentCourse?.formativeAssessments?.reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0) || 0, [currentCourse]);

    // Fetch Students & Grades
    useEffect(() => {
        const requestId = ++fetchStudentsRequestRef.current;

        if (!schoolId || !selectedLevel || !selectedCourseId) {
            setStudents([]);
            setGrades({});
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const fetchAll = async () => {
            try {
                const classTitle = CLASSES[selectedLevel] || selectedLevel;
                const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                const enrollmentsRef = collection(db, 'school-settings', schoolId, 'enrollments');
                const enrollmentConstraints = [
                    where('courseId', '==', selectedCourseId),
                    where('academicYear', '==', academicYear)
                ];

                if (selectedGroup && selectedGroup !== 'all') {
                    enrollmentConstraints.push(where('groupName', '==', selectedGroup));
                }

                if (selectedSemester && selectedSemester !== 'annual' && selectedSemester !== '0') {
                    const isAnnualCourse = currentCourse?.semester === '1-2' || currentCourse?.semester === 'annual' || currentCourse?.semester === '0';
                    if (!isAnnualCourse && currentCourse?.semester) {
                        enrollmentConstraints.push(where('semester', '==', selectedSemester));
                    }
                }

                const [enrollSnap, gradeSnap] = await Promise.all([
                    getDocs(query(enrollmentsRef, ...enrollmentConstraints)),
                    getDocs(collection(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades'))
                ]);

                let studentList: Student[] = [];

                if (!enrollSnap.empty) {
                    const enrolledStudentIds = Array.from(new Set(enrollSnap.docs.map(d => d.data().studentId as string).filter(Boolean)));
                    const studentDetails: Student[] = [];

                    for (let i = 0; i < enrolledStudentIds.length; i += 30) {
                        const batchIds = enrolledStudentIds.slice(i, i + 30);
                        const batchSnap = await getDocs(query(studentsRef, where('__name__', 'in', batchIds)));
                        batchSnap.forEach(d => {
                            const data = d.data();
                            studentDetails.push({
                                id: d.id,
                                ...data,
                                studentNumber: String(data.number || data.classNumber || data.no || data.studentNumber || ""),
                                studentId: String(data.studentCode || data.studentId || d.id || ""),
                                room: data.room || ""
                            } as Student);
                        });
                    }
                    studentList = studentDetails;
                } else {
                    const classLevelVariants = getClassLevelVariants(selectedLevel);
                    const qStudents = query(studentsRef, where('classLevel', 'in', classLevelVariants));
                    const studentSnap = await getDocs(qStudents);
                    studentList = studentSnap.docs
                        .map(d => ({
                            id: d.id,
                            ...d.data(),
                            studentNumber: String(d.data().number || d.data().classNumber || d.data().no || d.data().studentNumber || ""),
                            studentId: String(d.data().studentCode || d.data().studentId || d.id || ""),
                            room: d.data().room || ""
                        } as Student))
                        .filter(s => matchesLevel((s as any).classLevel, selectedLevel));
                }

                if (selectedRoom && selectedRoom !== 'all') {
                    studentList = studentList.filter(s => normalizeRoom(s.room) === normalizeRoom(selectedRoom));
                }

                studentList.sort((a, b) => parseInt(a.studentNumber) - parseInt(b.studentNumber));

                const gradeMap: Record<string, GradeRecord> = {};
                gradeSnap.forEach(d => {
                    const data = d.data() as GradeRecord & { incompleteFields?: string[] };
                    // แทนที่ค่าตัวเลขดิบ (ที่บันทึกเป็น 0 เสมอ) กลับเป็น "ร" ในช่องที่ครูเคยพิมพ์ "ร" ไว้ ตาม
                    // incompleteFields ที่บันทึกคู่กันไว้ตอนเซฟครั้งก่อน ไม่งั้นเปิดหน้านี้ใหม่จะเห็นเป็น 0
                    // ทั้งที่จริงๆ ยังติด "ร" อยู่ (แค่ฟิลด์คะแนนดิบต้องเก็บเป็นตัวเลขไว้คำนวณคะแนนรวมที่อื่น)
                    // โชว์ป้าย "ร" ทับก็ต่อเมื่อ grade ยังเป็น "ร" อยู่จริงเท่านั้น — ถ้าครูอนุมัติแก้ ร สำเร็จแล้ว
                    // (grade เปลี่ยนเป็นเกรดจริงจากหน้าคำร้องขอแก้ตัว) เลิกโชว์ป้ายไปเอง กลับไปแสดงเป็น 0 ตาม
                    // ค่าจริงที่เก็บไว้ (งาน/คะแนนชิ้นที่ไม่เคยได้จริง = 0 ตามระเบียบ) โดยไม่ต้องมาแก้อะไรหน้านี้เอง
                    const incompleteFields = data.grade === 'ร' ? new Set(data.incompleteFields || []) : new Set<string>();
                    if (incompleteFields.size > 0) {
                        const formativeDetails = { ...(data.formativeDetails || {}) };
                        incompleteFields.forEach(key => {
                            if (key === 'midterm') return;
                            formativeDetails[key] = 'ร';
                        });
                        gradeMap[d.id] = {
                            ...data,
                            formativeDetails,
                            midterm: incompleteFields.has('midterm') ? 'ร' : data.midterm,
                        };
                    } else {
                        gradeMap[d.id] = data;
                    }
                });

                if (requestId !== fetchStudentsRequestRef.current) return;
                setStudents(studentList);
                setGrades(gradeMap);
            } catch (err) {
                console.error(err);
            } finally {
                if (requestId === fetchStudentsRequestRef.current) {
                    setIsLoading(false);
                }
            }
        };

        fetchAll();
    }, [schoolId, selectedLevel, selectedRoom, selectedSemester, selectedCourseId, selectedGroup, academicYear, currentCourse]);

    // Handlers
    const handleScoreChange = (studentId: string, assessmentId: string, rawValue: string) => {
        const value = sanitizeScoreInput(rawValue);
        if (value === null) return;
        setGrades(prev => {
            const current = prev[studentId] || {};
            const details = { ...(current.formativeDetails || {}), [assessmentId]: value };
            return {
                ...prev,
                [studentId]: { ...current, formativeDetails: details }
            };
        });
    };

    const handleMidtermChange = (studentId: string, rawValue: string) => {
        const value = sanitizeScoreInput(rawValue);
        if (value === null) return;
        setGrades(prev => {
            const current = prev[studentId] || {};
            return {
                ...prev,
                [studentId]: { ...current, midterm: value }
            };
        });
    };

    const handleBulkFill = (assessmentId: string, value: string) => {
        setBulkValues(prev => ({ ...prev, [assessmentId]: value }));
        
        const numValue = value === "" ? 0 : parseFloat(value);

        setGrades(prev => {
            const next = { ...prev };
            students.forEach(s => {
                const current = next[s.id] || {};
                const details = { ...(current.formativeDetails || {}), [assessmentId]: value === "" ? "" : numValue };
                next[s.id] = { ...current, formativeDetails: details };
            });
            return next;
        });
    };

    const handleRowBulkFill = (studentId: string, value: string) => {
        setRowBulkValues(prev => ({ ...prev, [studentId]: value }));
        
        const numValue = value === "" ? 0 : (parseFloat(value) || 0);
        
        setGrades(prev => {
            const next = { ...prev };
            const current = next[studentId] || {};
            
            let remaining = numValue;
            const newDetails: Record<string, any> = { ...(current.formativeDetails || {}) };
            activeAssessments.forEach(a => { newDetails[getAssessmentKey(a)] = 0; });

            while (remaining > 0) {
                const canTakeMore = activeAssessments.filter(a => (newDetails[getAssessmentKey(a)] || 0) < a.maxScore);
                if (canTakeMore.length === 0) break;

                const amountPerSlot = Math.floor(remaining / canTakeMore.length);
                if (amountPerSlot === 0) {
                    for (let i = 0; i < remaining && i < canTakeMore.length; i++) {
                        const assessment = canTakeMore[i];
                        if (!assessment) continue;
                        const key = getAssessmentKey(assessment);
                        newDetails[key]++;
                    }
                    remaining = 0;
                } else {
                    let assignedInRound = 0;
                    canTakeMore.forEach(a => {
                        const key = getAssessmentKey(a);
                        const capacity = a.maxScore - (newDetails[key] || 0);
                        const assign = Math.min(amountPerSlot, capacity);
                        newDetails[key] = (newDetails[key] || 0) + assign;
                        assignedInRound += assign;
                    });
                    remaining -= assignedInRound;
                    if (assignedInRound === 0) break;
                }
            }
            
            next[studentId] = { ...current, formativeDetails: newDetails };
            return next;
        });
    };

    const calculateRowTotals = useCallback((studentId: string) => {
        const record = grades[studentId] || {};
        const details = record.formativeDetails || {};
        
        const formativeTotal = activeAssessments.reduce((sum, a) => sum + (parseFloat(details[getAssessmentKey(a)] as any) || 0), 0);
        const midterm = parseFloat(record.midterm as any) || 0;
        const part1Total = formativeTotal + midterm;
        
        return { formativeTotal, part1Total };
    }, [grades, activeAssessments]);

    const handleSave = async () => {
        if (!schoolId || !selectedCourseId) return;
        setIsSaving(true);
        try {
            // คะแนนที่เหลือสูงสุดที่ยังไม่รู้ ณ จุดนี้ (คะแนนเก็บหลังกลางภาค + ปลายภาค) — ใช้เช็คว่า
            // ต่อให้นักเรียนได้คะแนนเต็มทุกส่วนที่เหลือ ก็ยังไม่มีทางถึง 50 หรือไม่ ("หมดโอกาสเต็มที่")
            // ก่อนจะติด "0" ทันทีตั้งแต่หน้านี้ — กันไม่ให้ทุกคนที่ยังทำคะแนนไม่ครบถูกติด 0 เกินจริง
            const maxPostMidFormative = (currentCourse?.formativeAssessments || [])
                .filter(a => a.term === 'post-midterm')
                .reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0);
            const maxRemainingPossible = maxPostMidFormative + (Number(currentCourse?.finalWeight) || 0);

            const batch = writeBatch(db);
            // นักเรียนที่ติด "ร"/"0" อยู่ตอนนี้ (ไม่ถูกทับด้วย มส) — ต้องยกเลิกคำร้องแก้ตัวเดิมที่เคย "resolved"
            // ไปแล้วให้ด้วย เผื่อกรณีเคยแก้สำเร็จไปแล้วแต่คะแนนจริงยังไม่ถึงเกณฑ์อยู่ดี (ติดซ้ำ) ไม่งั้นนักเรียนจะ
            // เห็นสถานะ "แก้ตัวสำเร็จ" ค้างอยู่ทั้งที่จริงๆ ติดใหม่แล้ว (เหมือนเคส มส/มผ ที่แก้ไปก่อนหน้านี้)
            const flaggedStudentIds: string[] = [];
            students.forEach(student => {
                const record = grades[student.id] || {};
                const { part1Total } = calculateRowTotals(student.id);
                const isUnsalvageable = (part1Total + maxRemainingPossible) < 50;

                // ครูพิมพ์ "ร" ลงช่องคะแนนช่องไหนก็ได้ = ยังส่งงาน/สอบไม่ครบ ให้ติด "ร" ทันที แซงหน้าการเดา 0
                // จากคะแนน (แต่ยังเคารพ มส เดิมก่อนเสมอ เพราะเวลาเรียนไม่ถึงเกณฑ์เป็นเรื่องที่หนักกว่า)
                const incompleteFields = collectIncompleteFields(record);
                const incomplete = incompleteFields.length > 0;
                if (!record.status && (incomplete || isUnsalvageable)) flaggedStudentIds.push(student.id);

                const ref = doc(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades', student.id);
                batch.set(ref, {
                    ...record,
                    // ฟิลด์คะแนนดิบเก็บเป็นตัวเลขเสมอ (ร -> 0) สำหรับคำนวณคะแนนรวมที่อื่น — ช่องไหนเป็น "ร"
                    // บันทึกชื่อไว้แยกที่ incompleteFields เพื่อเอาไว้โชว์ "ร" กลับตอนโหลดหน้านี้ใหม่เท่านั้น
                    midterm: toScoreNumber(record.midterm),
                    formativeDetails: normalizeFormativeDetails(record.formativeDetails),
                    incompleteFields,
                    // เคารพ มส เดิมก่อนเสมอ (เหมือนหน้าหลังกลางภาค) แล้วค่อยติด ร ถ้าครูพิมพ์ไว้ แล้วค่อยติด 0
                    // ถ้าหมดโอกาสจริงๆ — ถ้ายังมีโอกาสตามคะแนนคืนได้ ไม่แตะฟิลด์ grade เลย (คงค่าที่มีอยู่เดิมไว้)
                    ...(record.status ? { grade: record.status } : incomplete ? { grade: 'ร' } : isUnsalvageable ? { grade: '0' } : {}),
                    updatedAt: serverTimestamp(),
                    updatedBy: (currentUser as any)?.displayName || (currentUser as any)?.email
                }, { merge: true });
            });
            await batch.commit();
            if (academicYear && selectedSemester) {
                await Promise.all(flaggedStudentIds.map(studentId => invalidateStaleResolvedRequests(
                    schoolId, studentId, 'course', selectedCourseId, academicYear, selectedSemester,
                )));
            }
            Swal.fire({ icon: 'success', title: 'บันทึกคะแนนสำเร็จ', background: '#1e2235', color: '#fff' });
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', background: '#1e2235', color: '#fff' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-600 dark:text-slate-300 font-sans flex flex-col">
                
                {/* Premium Header Bar */}
                <div className="sticky top-[60px] z-40 px-4 lg:pl-16 py-3 bg-white/90 dark:bg-[#0b0e14]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
                    <div className="max-w-[1600px] mx-auto flex flex-row items-center gap-3 overflow-hidden">
                        
                        {/* Title & Course Info */}
                        <div className="flex items-center gap-3 w-[320px] min-w-0 shrink-0">
                            <BackButton to="/academic/hub/evaluation" />
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">บันทึกคะแนน</h1>
                                    <span className="px-2 py-0.5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-tighter rounded-md border border-indigo-500/20">ก่อนกลางภาค</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest min-w-0">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                    {currentCourse ? <span className="text-slate-600 dark:text-slate-400 truncate">{currentCourse.code} • {currentCourse.title}</span> : "โปรดเลือกรายวิชา"}
                                </div>
                            </div>
                        </div>

                        {/* Control Center */}
                        <div className="flex flex-1 min-w-0 flex-nowrap items-center gap-3">
                            
                            {/* Filter Group */}
                            <div className="flex flex-1 min-w-0 flex-nowrap items-center bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner">
                                <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ชั้น</span>
                                    <select 
                                        value={selectedLevel}
                                        onChange={(e) => {
                                            setSelectedLevel(e.target.value);
                                            setSelectedCourseId("");
                                            setSelectedGroup("");
                                        }}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">เลือก</option>
                                        {availableClassOptions.map(([id, name]) => (
                                            <option key={id} value={id} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ห้อง</span>
                                    <select 
                                        value={selectedRoom}
                                        onChange={(e) => setSelectedRoom(e.target.value)}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทั้งหมด</option>
                                        {availableRooms.map(r => (
                                            <option key={r} value={r} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{r}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ภาค</span>
                                    <select 
                                        value={selectedSemester}
                                        onChange={(e) => {
                                            setSelectedSemester(e.target.value);
                                            setSelectedCourseId("");
                                            setSelectedGroup("");
                                        }}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทั้งหมด</option>
                                        <option value="1" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">1</option>
                                        <option value="2" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">2</option>
                                        <option value="annual" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">รายปี</option>
                                    </select>
                                </div>
                                <div className="relative flex flex-1 items-center gap-2 px-4 py-3 min-w-[240px] border-r border-slate-200 dark:border-white/5" ref={courseFieldRef}>
                                    <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter shrink-0">วิชา</span>
                                    <input
                                        ref={courseInputRef}
                                        type="text"
                                        placeholder="ค้นหารหัส/ชื่อวิชา..."
                                        value={isCourseDropdownOpen ? courseSearchTerm : (selectedCourseObj ? `${selectedCourseObj.code} - ${selectedCourseObj.title}` : "")}
                                        onFocus={openCourseDropdown}
                                        onChange={(e) => {
                                            if (!isCourseDropdownOpen) setIsCourseDropdownOpen(true);
                                            setCourseSearchTerm(e.target.value);
                                        }}
                                        onBlur={closeCourseDropdown}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') {
                                                setIsCourseDropdownOpen(false);
                                                courseInputRef.current?.blur();
                                            } else if (e.key === 'Enter' && courseSearchResults.length > 0) {
                                                e.preventDefault();
                                                selectCourseFromSearch(courseSearchResults[0].id);
                                            }
                                        }}
                                        disabled={!selectedLevel}
                                        className="bg-transparent border-none text-[16px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors w-full disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-bold"
                                    />

                                    {isCourseDropdownOpen && createPortal(
                                        <div
                                            className="fixed inset-0 z-[9999]"
                                            onMouseDown={() => setIsCourseDropdownOpen(false)}
                                        >
                                            <div
                                                style={{
                                                    position: 'fixed',
                                                    left: courseDropdownCoords.left,
                                                    top: courseDropdownCoords.top,
                                                    width: courseDropdownCoords.width,
                                                    maxHeight: courseDropdownCoords.maxHeight,
                                                }}
                                                className="overflow-y-auto bg-white dark:bg-[#1e2235] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl"
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                {courseSearchResults.length === 0 ? (
                                                    <div className="px-4 py-4 text-sm text-slate-400 text-center">ไม่พบรายวิชาที่ตรงกับคำค้นหา</div>
                                                ) : (
                                                    courseSearchResults.map(c => (
                                                        <div
                                                            key={c.id}
                                                            role="button"
                                                            tabIndex={-1}
                                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); selectCourseFromSearch(c.id); }}
                                                            className={`px-4 py-3 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors ${c.id === selectedCourseId ? 'bg-indigo-50 dark:bg-indigo-500/10 font-bold' : ''}`}
                                                        >
                                                            <span className="font-black text-indigo-600 dark:text-indigo-400">{c.code}</span>
                                                            {' - '}
                                                            <span className="text-slate-800 dark:text-slate-100">{c.title}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>,
                                        document.body
                                    )}
                                </div>
                                <div className="flex items-center gap-1 px-3 py-1.5 min-w-0 w-[130px]">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">กลุ่ม</span>
                                    <select 
                                        value={selectedGroup}
                                        onChange={(e) => setSelectedGroup(e.target.value)}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors w-full disabled:opacity-40"
                                        disabled={!selectedCourseId || availableGroups.length === 0}
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทุกกลุ่ม</option>
                                        {availableGroups.map(g => (
                                            <option key={g.id} value={g.id} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{g.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-nowrap items-center gap-2 shrink-0">
                                <Link 
                                    to={`/academic/post-midterm-scores?level=${selectedLevel}&room=${selectedRoom}&semester=${selectedSemester}&courseId=${selectedCourseId}&groupId=${selectedGroup}`}
                                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white rounded-xl text-[12px] font-black border border-slate-200 dark:border-white/5 transition-all group whitespace-nowrap"
                                >
                                    ถัดไป
                                    <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                                </Link>

                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving || !selectedCourseId}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800/50 disabled:text-slate-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-indigo-600/20 transition-all border border-indigo-400/20 active:scale-95 whitespace-nowrap"
                                >
                                    <Save size={16} />
                                    บันทึกข้อมูล
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table Section */}
                <div className="flex-1 p-4 sm:p-6 overflow-hidden">
                    <div className="max-w-[1600px] mx-auto h-full flex flex-col bg-white dark:bg-[#161a27] rounded-3xl border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden">
                        
                        {/* Custom Table Layout */}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {!selectedCourseId ? (
                                 <div className="h-full flex items-center justify-center p-12">
                                     <div className="max-w-md text-center bg-slate-100 dark:bg-[#1e2235]/40 p-10 rounded-3xl border border-slate-200 dark:border-white/5">
                                         <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/10">
                                             <Calculator size={32} className="text-indigo-600 dark:text-indigo-400" />
                                         </div>
                                         <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">พร้อมสำหรับบันทึกคะแนน</h3>
                                         <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">กรุณาเลือกระดับชั้น ห้อง และรายวิชา เพื่อเริ่มดำเนินการ</p>
                                     </div>
                                 </div>
                            ) : activeAssessments.length === 0 ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-amber-500/5 p-10 rounded-3xl border border-amber-500/20">
                                        <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-500/10">
                                            <AlertCircle size={32} className="text-amber-500" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">ยังไม่ได้ตั้งค่าสัดส่วนคะแนน</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider mb-6">วิชานี้ยังไม่มีการกำหนดหัวข้อคะแนนเก็บก่อนกลางภาค</p>
                                        <Link 
                                            to={`/academic/score-configuration?level=${encodeURIComponent(selectedLevel || searchParams.get('level') || '')}&courseId=${encodeURIComponent(selectedCourseId || searchParams.get('courseId') || '')}`}
                                            className="inline-flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[12px] font-black transition-all shadow-lg shadow-amber-500/20"
                                        >
                                            <Settings size={16} />
                                            ไปหน้าตั้งค่าคะแนน
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <table className="w-full border-collapse text-left">
                                    <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-[#1e2235]">
                                        <tr className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                                            <th rowSpan={2} className="px-4 py-4 w-[60px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-[#1e2235] sticky left-0 z-40 text-slate-900 dark:text-white">เลขที่</th>
                                            <th rowSpan={2} className="px-6 py-4 min-w-[180px] border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-[#1e2235] sticky left-[60px] z-40 text-slate-900 dark:text-white">ชื่อ-นามสกุล</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[80px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-200 dark:bg-[#1c2132] sticky left-[240px] z-40 text-slate-900 dark:text-white">
                                                <span className="text-[10px] leading-tight">เกลี่ยคะแนนเก็บ</span>
                                            </th>
                                            
                                            <th colSpan={activeAssessments.length} className="px-2 py-2 text-center bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-b border-r border-slate-200 dark:border-white/5">
                                                คะแนนระหว่างภาค (ก่อนกลางภาค)
                                            </th>
                                            
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400">รวมเก็บ ({activeAssessments.reduce((s, a) => s + a.maxScore, 0)})</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">กลางภาค ({currentCourse?.midtermWeight ?? 0})</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[80px] text-center bg-indigo-500/10 text-indigo-900 dark:text-white font-black text-[12px]">รวมส่วน 1</th>
                                        </tr>
                                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                                            {activeAssessments.map(a => {
                                                const assessmentKey = getAssessmentKey(a);
                                                return (
                                                <th key={assessmentKey} className="px-0.5 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-indigo-500/5 w-[40px]">
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span className="text-slate-600 dark:text-white/80">{a.name}</span>
                                                        <span className="text-indigo-600/60 dark:text-indigo-400/60 font-bold">/{a.maxScore}</span>
                                                    </div>
                                                </th>
                                            )})}
                                        </tr>
                                        {/* Bulk Fill Inputs */}
                                        <tr className="bg-slate-200 dark:bg-[#1c2132] border-b border-slate-200 dark:border-white/5">
                                            <td className="sticky left-0 bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5"></td>
                                            <td className="sticky left-[60px] bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5"></td>
                                            <td className="sticky left-[240px] bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5 px-2 py-2 text-[10px] font-black text-indigo-600 dark:text-indigo-400/60 text-center whitespace-nowrap">กรอกทั้งคอลัมน์ →</td>
                                            {activeAssessments.map(a => {
                                                const assessmentKey = getAssessmentKey(a);
                                                return (
                                                <td key={`bulk-${assessmentKey}`} className="px-1 py-1 border-r border-slate-300 dark:border-white/5">
                                                    <input 
                                                        type="text" 
                                                        placeholder="0"
                                                        value={bulkValues[assessmentKey] || ""}
                                                        onChange={(e) => handleBulkFill(assessmentKey, e.target.value)}
                                                        className="w-full bg-indigo-500/10 border border-indigo-500/20 text-center text-[11px] font-black text-indigo-600 dark:text-indigo-400 py-1 rounded-lg outline-none focus:border-indigo-400/50"
                                                    />
                                                </td>
                                            )})}
                                            <td colSpan={3} className="bg-transparent"></td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map(student => {
                                            const record = grades[student.id] || {};
                                            const details = record.formativeDetails || {};
                                            const { formativeTotal, part1Total } = calculateRowTotals(student.id);

                                            return (
                                                <tr key={student.id} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                                                    <td className="px-4 py-3 text-center font-black text-[11px] text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#161a27] sticky left-0 z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        {student.studentNumber}
                                                    </td>
                                                    <td className="px-6 py-3 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#161a27] sticky left-[60px] z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-bold text-slate-900 dark:text-white">{student.title}{student.firstName} {student.lastName}</span>
                                                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">รหัสนักเรียน: {student.studentId || student.id.substring(0, 8)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-1 py-3 border-r border-slate-200 dark:border-white/5 text-center bg-white dark:bg-[#161a27] sticky left-[240px] z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        <input 
                                                            type="text"
                                                            value={rowBulkValues[student.id] || ""}
                                                            onChange={(e) => handleRowBulkFill(student.id, e.target.value)}
                                                            className={`w-10 h-7 rounded-lg bg-indigo-500/10 border text-center text-[11px] font-black transition-all ${
                                                                (Number(rowBulkValues[student.id]) || 0) > totalMaxPossible 
                                                                ? 'border-red-500 text-red-500' 
                                                                : 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                                                            }`}
                                                            placeholder="0"
                                                        />
                                                    </td>

                                                    {activeAssessments.map(a => {
                                                        const assessmentKey = getAssessmentKey(a);
                                                        const cellColor = getIncompleteCellColor(record, details[assessmentKey], assessmentKey);
                                                        const cellBg = cellColor === 'red' ? 'bg-red-500/20'
                                                            : cellColor === 'yellow' ? 'bg-yellow-400/20'
                                                            : cellColor === 'green' ? 'bg-emerald-500/20'
                                                            : ((Number(details[assessmentKey]) || 0) > a.maxScore ? 'bg-red-500/10' : 'bg-white/[0.01]');
                                                        const cellText = cellColor === 'red' ? 'text-red-600 dark:text-red-400'
                                                            : cellColor === 'yellow' ? 'text-yellow-700 dark:text-yellow-400'
                                                            : cellColor === 'green' ? 'text-emerald-700 dark:text-emerald-400'
                                                            : ((Number(details[assessmentKey]) || 0) > a.maxScore ? 'text-red-500' : 'text-slate-900 dark:text-white');
                                                        return (
                                                        <td key={`${student.id}-${assessmentKey}`} className={`px-0.5 py-1 border-r border-slate-200 dark:border-white/5 ${cellBg}`}>
                                                            <input
                                                                type="text"
                                                                value={details[assessmentKey] ?? ""}
                                                                onChange={(e) => handleScoreChange(student.id, assessmentKey, e.target.value)}
                                                                className={`w-full bg-transparent text-center text-[12px] font-black focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5 ${cellText}`}
                                                                placeholder="0"
                                                            />
                                                        </td>
                                                    )})}

                                                    <td className="px-2 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800/20 text-[12px] font-black text-slate-500 dark:text-slate-400">
                                                        {formativeTotal}
                                                    </td>

                                                    {(() => {
                                                        const midtermCellColor = getIncompleteCellColor(record, record.midterm, 'midterm');
                                                        const midtermBg = midtermCellColor === 'red' ? 'bg-red-500/20'
                                                            : midtermCellColor === 'yellow' ? 'bg-yellow-400/20'
                                                            : midtermCellColor === 'green' ? 'bg-emerald-500/20'
                                                            : ((Number(record.midterm) || 0) > (currentCourse?.midtermWeight ?? 0) ? 'bg-red-500/10' : 'bg-emerald-500/[0.02]');
                                                        const midtermText = midtermCellColor === 'red' ? 'text-red-600 dark:text-red-400'
                                                            : midtermCellColor === 'yellow' ? 'text-yellow-700 dark:text-yellow-400'
                                                            : midtermCellColor === 'green' ? 'text-emerald-700 dark:text-emerald-400'
                                                            : ((Number(record.midterm) || 0) > (currentCourse?.midtermWeight ?? 0) ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400');
                                                        return (
                                                    <td className={`px-1 py-1 border-r border-slate-200 dark:border-white/5 ${midtermBg}`}>
                                                        <input
                                                            type="text"
                                                            value={record.midterm ?? ""}
                                                            onChange={(e) => handleMidtermChange(student.id, e.target.value)}
                                                            className={`w-full bg-transparent text-center text-[12px] font-black focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5 ${midtermText}`}
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                    )})()}

                                                    <td className={`px-2 py-3 text-center text-[13px] font-black ${ part1Total > 100 ? 'bg-red-500/20 text-red-500' : 'bg-indigo-500/10 text-indigo-900 dark:text-white' }`}>
                                                        {part1Total}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="bg-slate-50 dark:bg-[#1e2235]/40 border-t border-slate-200 dark:border-white/10 px-8 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse" />
                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">สถานะระบบ: พร้อมใช้งาน</span>
                                </div>
                                {currentCourse && (
                                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400/80">
                                        <Info size={14} />
                                        <span className="text-[10px] font-bold">สัดส่วนคะแนน: เก็บ {configuredFormativeMax || currentCourse.formativeWeight || 0} / กลางภาค {currentCourse.midtermWeight ?? 0} / ปลายภาค {currentCourse.finalWeight ?? 0}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <button className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 dark:bg-[#1e2235] hover:bg-slate-200 dark:hover:bg-[#252a41] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-[11px] font-bold transition-all">
                                    ถัดไป <ArrowRight size={14} />
                                </button>
                                <span className="text-[12px] font-black text-slate-900 dark:text-white">{students.length} รายชื่อ</span>
                            </div>
                        </div>
                    </div>
                </div>

                <style>{`
                    .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                `}</style>
            </div>
        </MainLayout>
    );
};

export default FormativeScoreEntryPage;
