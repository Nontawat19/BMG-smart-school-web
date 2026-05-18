<<<<<<< HEAD
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import BackButton from "@/components/Shared/BackButton";
=======
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import { RootState } from "@/store";
import { firestore as db } from "@/firebase";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
<<<<<<< HEAD
    getDoc,
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    onSnapshot, 
    writeBatch, 
    serverTimestamp 
} from "firebase/firestore";
import MainLayout from "@/layouts/MainLayout";
import { 
    ChevronLeft, 
    ChevronRight,
    Save, 
    Search, 
    Info, 
<<<<<<< HEAD
    Settings,
    AlertCircle,
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    Trophy,
    Calculator,
    ArrowLeft,
    ChevronsRight
} from "lucide-react";
<<<<<<< HEAD
import { CLASSES, CLASS_FULL_NAMES, getClassOptionsBySchoolSettings } from "@/utils/schoolUtils";
=======
import { CLASSES } from "@/utils/schoolUtils";
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import Swal from "sweetalert2";

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    studentNumber: string;
    room: string;
<<<<<<< HEAD
    studentId?: string;
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    title?: string;
}

interface AssessmentItem {
<<<<<<< HEAD
    id?: string;
=======
    id: string;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    name: string;
    maxScore: number;
    term: 'pre-midterm' | 'post-midterm';
}

interface Course {
    id: string;
    code: string;
    title: string;
    classId: string | string[];
    room?: string[];
    formativeAssessments?: AssessmentItem[];
    formativeWeight?: number;
    midtermWeight?: number;
    finalWeight?: number;
<<<<<<< HEAD
    semester?: string;
}

interface GradeRecord {
    formative?: number | string;
    midterm?: number | string;
    final?: number | string;
    total?: number | string;
    grade?: string;
    status?: string;
    formativeDetails?: Record<string, number | string>;
=======
}

interface GradeRecord {
    formative?: number;
    midterm?: number;
    final?: number;
    total?: number;
    grade?: string;
    status?: string;
    formativeDetails?: Record<string, number>;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    updatedAt?: any;
    updatedBy?: string;
}

<<<<<<< HEAD
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
const toScoreNumber = (value: unknown) => value === "" || value === undefined || value === null ? 0 : Number(value) || 0;
const normalizeFormativeDetails = (details?: Record<string, number | string>) => {
    const normalized: Record<string, number> = {};
    Object.entries(details || {}).forEach(([key, value]) => {
        normalized[key] = toScoreNumber(value);
    });
    return normalized;
};
const getClassLevelVariants = (classKey: string) => {
    return Array.from(new Set([
        classKey,
        CLASSES[classKey],
        CLASS_FULL_NAMES[classKey]
    ].filter(Boolean).map(String)));
};

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
const PostMidtermScoreEntryPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
<<<<<<< HEAD
    const dispatch = useDispatch();

    const { academicYear: calYear, status: calendarStatus } = useSelector((state: RootState) => state.calendar);
    const [academicYear, setAcademicYear] = useState<string>("");

    useEffect(() => {
        if (schoolId && calendarStatus === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }
    }, [schoolId, calendarStatus, dispatch]);

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
=======

    // Filters
    const [selectedLevel, setSelectedLevel] = useState(searchParams.get('level') || "");
    const [selectedRoom, setSelectedRoom] = useState(searchParams.get('room') || "");
    const [selectedCourseId, setSelectedCourseId] = useState(searchParams.get('courseId') || "");
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    const [courses, setCourses] = useState<Course[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
<<<<<<< HEAD
    const [availableGroups, setAvailableGroups] = useState<{ id: string; label: string }[]>([]);
    const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
    const [rowBulkValues, setRowBulkValues] = useState<Record<string, string>>({});
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
=======
    const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
    const [rowBulkValues, setRowBulkValues] = useState<Record<string, string>>({});
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    // Fetch Courses
    useEffect(() => {
        if (!schoolId) return;
        const fetchCourses = async () => {
            const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
<<<<<<< HEAD
            const snap = await getDocs(query(coursesRef));
            setCourses(snap.docs
                .map(d => ({ id: d.id, ...d.data() } as Course))
                .filter(course => (course as any).isActive !== false)
            );
=======
            const snap = await getDocs(query(coursesRef, where('isActive', '!=', false)));
            setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        };
        fetchCourses();
    }, [schoolId]);

    // Derived State: Selected Course
    const currentCourse = useMemo(() => courses.find(c => c.id === selectedCourseId), [courses, selectedCourseId]);
<<<<<<< HEAD

    const filteredCourses = useMemo(() => {
        return courses.filter(c => {
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

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                return c.code.toLowerCase().includes(term) || c.title.toLowerCase().includes(term);
            }

            return true;
        });
    }, [courses, selectedLevel, selectedRoom, selectedSemester, searchTerm]);

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
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    
    // Filtered Assessments (Post-midterm only)
    const activeAssessments = useMemo(() => {
        if (!currentCourse) return [];
        return (currentCourse.formativeAssessments || []).filter(a => a.term === 'post-midterm' && a.maxScore > 0);
    }, [currentCourse]);

    const totalMaxPossible = useMemo(() => activeAssessments.reduce((sum, a) => sum + a.maxScore, 0), [activeAssessments]);
<<<<<<< HEAD
    const configuredFormativeMax = useMemo(() => currentCourse?.formativeAssessments?.reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0) || 0, [currentCourse]);
    const preMidtermPartMax = useMemo(() => {
        const preMidtermMax = currentCourse?.formativeAssessments
            ?.filter(a => a.term === 'pre-midterm')
            .reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0) || 0;
        return preMidtermMax + Number(currentCourse?.midtermWeight ?? 0);
    }, [currentCourse]);

    // Fetch Students & Grades
    useEffect(() => {
        const requestId = ++fetchStudentsRequestRef.current;

=======

    // Fetch Students & Grades
    useEffect(() => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        if (!schoolId || !selectedLevel || !selectedCourseId) {
            setStudents([]);
            setGrades({});
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
<<<<<<< HEAD
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
=======
        const classTitle = CLASSES[selectedLevel] || selectedLevel;
        const studentsRef = collection(db, 'school-settings', schoolId, 'students');
        let qStudents = query(studentsRef, where('classLevel', '==', classTitle));
        if (selectedRoom && selectedRoom !== 'all') {
            qStudents = query(studentsRef, where('classLevel', '==', classTitle), where('room', '==', selectedRoom));
        }

        const fetchAll = async () => {
            try {
                const [studentSnap, gradeSnap] = await Promise.all([
                    getDocs(qStudents),
                    getDocs(collection(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades'))
                ]);

                const studentList = studentSnap.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                    studentNumber: String(d.data().number || d.data().classNumber || d.data().no || "")
                } as Student)).sort((a, b) => parseInt(a.studentNumber) - parseInt(b.studentNumber));
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                const gradeMap: Record<string, GradeRecord> = {};
                gradeSnap.forEach(d => {
                    gradeMap[d.id] = d.data() as GradeRecord;
                });

<<<<<<< HEAD
                if (requestId !== fetchStudentsRequestRef.current) return;
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                setStudents(studentList);
                setGrades(gradeMap);
            } catch (err) {
                console.error(err);
            } finally {
<<<<<<< HEAD
                if (requestId === fetchStudentsRequestRef.current) {
                    setIsLoading(false);
                }
=======
                setIsLoading(false);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            }
        };

        fetchAll();
<<<<<<< HEAD
    }, [schoolId, selectedLevel, selectedRoom, selectedSemester, selectedCourseId, selectedGroup, academicYear, currentCourse]);

    // Handlers
    const handleScoreChange = (studentId: string, assessmentId: string, value: string) => {
        setGrades(prev => {
            const current = prev[studentId] || {};
            const details = { ...(current.formativeDetails || {}), [assessmentId]: value };
=======
    }, [schoolId, selectedLevel, selectedRoom, selectedCourseId]);

    // Handlers
    const handleScoreChange = (studentId: string, assessmentId: string, value: string) => {
        const numValue = Math.max(0, parseFloat(value) || 0);

        setGrades(prev => {
            const current = prev[studentId] || {};
            const details = { ...(current.formativeDetails || {}), [assessmentId]: numValue };
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            return {
                ...prev,
                [studentId]: { ...current, formativeDetails: details }
            };
        });
    };

    const handleFinalChange = (studentId: string, value: string) => {
<<<<<<< HEAD
=======
        const numValue = Math.max(0, parseFloat(value) || 0);

>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        setGrades(prev => {
            const current = prev[studentId] || {};
            return {
                ...prev,
<<<<<<< HEAD
                [studentId]: { ...current, final: value }
=======
                [studentId]: { ...current, final: numValue }
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            };
        });
    };

    const handleBulkFill = (assessmentId: string, value: string) => {
        setBulkValues(prev => ({ ...prev, [assessmentId]: value }));
        
<<<<<<< HEAD
        const numValue = value === "" ? 0 : parseFloat(value);
=======
        const numValue = Math.max(0, parseFloat(value) || 0);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

        setGrades(prev => {
            const next = { ...prev };
            students.forEach(s => {
                const current = next[s.id] || {};
<<<<<<< HEAD
                const details = { ...(current.formativeDetails || {}), [assessmentId]: value === "" ? "" : numValue };
=======
                const details = { ...(current.formativeDetails || {}), [assessmentId]: numValue };
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                next[s.id] = { ...current, formativeDetails: details };
            });
            return next;
        });
    };

    const handleRowBulkFill = (studentId: string, value: string) => {
        setRowBulkValues(prev => ({ ...prev, [studentId]: value }));
        
<<<<<<< HEAD
        const numValue = value === "" ? 0 : (parseFloat(value) || 0);
=======
        const numValue = Math.max(0, parseFloat(value) || 0);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        
        setGrades(prev => {
            const next = { ...prev };
            const current = next[studentId] || {};
            
            let remaining = numValue;
<<<<<<< HEAD
            const newDetails: Record<string, any> = { ...(current.formativeDetails || {}) };
            activeAssessments.forEach(a => { newDetails[getAssessmentKey(a)] = 0; });

            // Fair distribution algorithm
            while (remaining > 0) {
                const canTakeMore = activeAssessments.filter(a => (newDetails[getAssessmentKey(a)] || 0) < a.maxScore);
=======
            const newDetails: Record<string, number> = {};
            activeAssessments.forEach(a => { newDetails[a.id] = 0; });

            // Fair distribution algorithm
            while (remaining > 0) {
                const canTakeMore = activeAssessments.filter(a => (newDetails[a.id] || 0) < a.maxScore);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                if (canTakeMore.length === 0) break;

                const amountPerSlot = Math.floor(remaining / canTakeMore.length);
                if (amountPerSlot === 0) {
                    for (let i = 0; i < remaining && i < canTakeMore.length; i++) {
<<<<<<< HEAD
                        const assessment = canTakeMore[i];
                        if (!assessment) continue;
                        const key = getAssessmentKey(assessment);
                        newDetails[key]++;
=======
                        newDetails[canTakeMore[i].id]++;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    }
                    remaining = 0;
                } else {
                    let assignedInRound = 0;
                    canTakeMore.forEach(a => {
<<<<<<< HEAD
                        const key = getAssessmentKey(a);
                        const capacity = a.maxScore - (newDetails[key] || 0);
                        const assign = Math.min(amountPerSlot, capacity);
                        newDetails[key] = (newDetails[key] || 0) + assign;
=======
                        const capacity = a.maxScore - newDetails[a.id];
                        const assign = Math.min(amountPerSlot, capacity);
                        newDetails[a.id] += assign;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
        
<<<<<<< HEAD
=======
        // เราต้องดึงการตั้งค่าคะแนนเต็มทั้งหมดมาเพื่อหาว่าช่องไหนเป็น Pre ช่องไหนเป็น Post
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        const allAssessments = currentCourse?.formativeAssessments || [];
        const preMidAssessments = allAssessments.filter(a => a.term === 'pre-midterm');
        const postMidAssessments = allAssessments.filter(a => a.term === 'post-midterm');

<<<<<<< HEAD
        const preMidTotal = preMidAssessments.reduce((sum, a) => sum + (parseFloat(details[getAssessmentKey(a)] as any) || 0), 0);
        const postMidTotal = postMidAssessments.reduce((sum, a) => sum + (parseFloat(details[getAssessmentKey(a)] as any) || 0), 0);
        
        const midterm = parseFloat(record.midterm as any) || 0;
        const final = parseFloat(record.final as any) || 0;
        
        const sum1 = preMidTotal + midterm;
        const total = sum1 + postMidTotal + final;
=======
        const preMidTotal = preMidAssessments.reduce((sum, a) => sum + (details[a.id] || 0), 0);
        const postMidTotal = postMidAssessments.reduce((sum, a) => sum + (details[a.id] || 0), 0);
        
        const sum1 = preMidTotal + (record.midterm || 0);
        const total = sum1 + postMidTotal + (record.final || 0);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        
        return { postMidTotal, sum1, total };
    }, [grades, currentCourse]);

    const calculateGrade = (total: number): string => {
        if (total >= 80) return '4';
        if (total >= 75) return '3.5';
        if (total >= 70) return '3';
        if (total >= 65) return '2.5';
        if (total >= 60) return '2';
        if (total >= 55) return '1.5';
        if (total >= 50) return '1';
        return '0';
    };

    const handleSave = async () => {
        if (!schoolId || !selectedCourseId) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            students.forEach(student => {
                const record = grades[student.id] || {};
                const { total } = calculateRowTotals(student.id);
                
                const ref = doc(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades', student.id);
                batch.set(ref, {
                    ...record,
<<<<<<< HEAD
                    final: toScoreNumber(record.final),
                    total: total,
                    grade: record.status || calculateGrade(total),
                    formativeDetails: normalizeFormativeDetails(record.formativeDetails),
=======
                    final: Number(record.final || 0),
                    total: total,
                    grade: record.status || calculateGrade(total),
                    formativeDetails: record.formativeDetails || {},
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    updatedAt: serverTimestamp(),
                    updatedBy: (currentUser as any)?.displayName || (currentUser as any)?.email
                }, { merge: true });
            });
            await batch.commit();
            Swal.fire({ icon: 'success', title: 'บันทึกคะแนนสำเร็จ', background: '#1e2235', color: '#fff' });
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', background: '#1e2235', color: '#fff' });
        } finally {
            setIsSaving(false);
        }
    };

    // Filtered Students for Display
    const filteredStudents = useMemo(() => {
<<<<<<< HEAD
        const term = searchTerm.toLowerCase().trim();
        if (!term) return students;

        return students.filter(s => {
            const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
            const studentNumber = String(s.studentNumber || "").toLowerCase();
            const studentCode = String(s.studentId || "").toLowerCase();

            return fullName.includes(term) || studentNumber.includes(term) || studentCode.includes(term);
        });
=======
        return students.filter(s => 
            `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.studentNumber.includes(searchTerm)
        );
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    }, [students, searchTerm]);

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-600 dark:text-slate-300 font-sans flex flex-col">
                
                {/* Premium Header Bar */}
                <div className="sticky top-[60px] z-40 px-4 lg:pl-16 py-3 bg-white/90 dark:bg-[#0b0e14]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
<<<<<<< HEAD
                    <div className="max-w-[1600px] mx-auto flex flex-row items-center gap-3 overflow-hidden">
                        
                        {/* Title & Course Info */}
                        <div className="flex items-center gap-3 w-[320px] min-w-0 shrink-0">
                            <BackButton to="/academic/hub/evaluation" />
                            <div className="flex flex-col min-w-0">
=======
                    <div className="max-w-[1600px] mx-auto flex flex-row items-center justify-between gap-4">
                        
                        {/* Title & Course Info */}
                        <div className="flex items-center gap-4 min-w-fit">
                            <Link to="/academic-admin" className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-white/5 rounded-xl text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-all">
                                <ChevronLeft size={20} />
                            </Link>
                            <div className="h-10 w-[1px] bg-slate-200 dark:bg-white/10 mx-1 hidden sm:block" />
                            <div className="flex flex-col">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">บันทึกคะแนน</h1>
                                    <span className="px-2 py-0.5 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-tighter rounded-md border border-emerald-500/20">หลังกลางภาค</span>
                                </div>
<<<<<<< HEAD
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest min-w-0">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                    {currentCourse ? <span className="text-slate-600 dark:text-slate-400 truncate">{currentCourse.code} • {currentCourse.title}</span> : "โปรดเลือกรายวิชา"}
=======
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                    {currentCourse ? <span className="text-slate-600 dark:text-slate-400">{currentCourse.code} • {currentCourse.title}</span> : "โปรดเลือกรายวิชา"}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                </div>
                            </div>
                        </div>

                        {/* Control Center */}
<<<<<<< HEAD
                        <div className="flex flex-1 min-w-0 flex-nowrap items-center gap-3">
                            
                            {/* Filter Group */}
                            <div className="flex flex-1 min-w-0 flex-nowrap items-center bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner">
=======
                        <div className="flex flex-1 items-center justify-end gap-3">
                            
                            {/* Filter Group */}
                            <div className="flex items-center bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ชั้น</span>
                                    <select 
                                        value={selectedLevel}
<<<<<<< HEAD
                                        onChange={(e) => {
                                            setSelectedLevel(e.target.value);
                                            setSelectedCourseId("");
                                            setSelectedGroup("");
                                        }}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">เลือก</option>
                                        {availableClassOptions.map(([id, name]) => (
=======
                                        onChange={(e) => setSelectedLevel(e.target.value)}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">เลือก</option>
                                        {Object.entries(CLASSES).map(([id, name]) => (
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
<<<<<<< HEAD
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทั้งหมด</option>
                                        {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                                            <option key={r} value={String(r)} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{r}</option>
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
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-emerald-400 transition-colors"
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทั้งหมด</option>
                                        <option value="1" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">1</option>
                                        <option value="2" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">2</option>
                                        <option value="annual" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">รายปี</option>
                                    </select>
                                </div>
                                <div className="flex flex-1 items-center gap-1 px-3 py-1.5 min-w-[170px] border-r border-slate-200 dark:border-white/5">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">วิชา</span>
                                    <select 
                                        value={selectedCourseId}
                                        onChange={(e) => {
                                            setSelectedCourseId(e.target.value);
                                            setSelectedGroup("");
                                        }}
=======
                                        <option value="all" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทั้งหมด</option>
                                        {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                                            <option key={r} value={r} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{r}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 px-3 py-1.5 min-w-[220px]">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">วิชา</span>
                                    <select 
                                        value={selectedCourseId}
                                        onChange={(e) => setSelectedCourseId(e.target.value)}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors w-full"
                                        disabled={!selectedLevel}
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">เลือกวิชา</option>
<<<<<<< HEAD
                                        {filteredCourses.map(c => (
                                            <option key={c.id} value={c.id} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{c.code} - {c.title}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 px-3 py-1.5 min-w-0 w-[130px]">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">กลุ่ม</span>
                                    <select 
                                        value={selectedGroup}
                                        onChange={(e) => setSelectedGroup(e.target.value)}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-emerald-400 transition-colors w-full disabled:opacity-40"
                                        disabled={!selectedCourseId || availableGroups.length === 0}
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทุกกลุ่ม</option>
                                        {availableGroups.map(g => (
                                            <option key={g.id} value={g.id} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{g.label}</option>
                                        ))}
=======
                                        {courses
                                            .filter(c => {
                                                if (Array.isArray(c.classId)) return c.classId.includes(selectedLevel);
                                                return c.classId === selectedLevel;
                                            })
                                            .map(c => (
                                                <option key={c.id} value={c.id} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{c.code} - {c.title}</option>
                                            ))
                                        }
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    </select>
                                </div>
                            </div>

                            {/* Search */}
<<<<<<< HEAD
                            <div className="relative group w-[220px] shrink-0">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={14} />
                                <input 
                                    type="text"
                                    placeholder="ค้นหาวิชา/นักเรียน..."
=======
                            <div className="relative group min-w-[180px]">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={14} />
                                <input 
                                    type="text"
                                    placeholder="ค้นหานักเรียน..."
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl py-2 pl-10 pr-4 text-[12px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                />
                            </div>

                            {/* Actions */}
<<<<<<< HEAD
                            <div className="flex flex-nowrap items-center gap-2 shrink-0">
                                <Link 
                                    to={`/academic/formative-scores?level=${selectedLevel}&room=${selectedRoom}&semester=${selectedSemester}&courseId=${selectedCourseId}&groupId=${selectedGroup}`}
                                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white rounded-xl text-[12px] font-black border border-slate-200 dark:border-white/5 transition-all group whitespace-nowrap"
=======
                            <div className="flex items-center gap-2">
                                <Link 
                                    to={`/academic/formative-scores?level=${selectedLevel}&room=${selectedRoom}&courseId=${selectedCourseId}`}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white rounded-xl text-[12px] font-black border border-slate-200 dark:border-white/5 transition-all group whitespace-nowrap"
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                >
                                    <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                                    ก่อนกลางภาค
                                </Link>

                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving || !selectedCourseId}
<<<<<<< HEAD
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800/50 disabled:text-slate-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-indigo-600/20 transition-all border border-indigo-400/20 active:scale-95 whitespace-nowrap"
=======
                                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800/50 disabled:text-slate-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-indigo-600/20 transition-all border border-indigo-400/20 active:scale-95 whitespace-nowrap"
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
                                        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/10">
                                            <Trophy size={32} className="text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">บันทึกคะแนนส่วนสุดท้าย</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">กรุณาเลือกระดับชั้น ห้อง และรายวิชา เพื่อบันทึกคะแนนหลังกลางภาคและปลายภาค</p>
                                    </div>
                                </div>
<<<<<<< HEAD
                            ) : activeAssessments.length === 0 ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-amber-500/5 p-10 rounded-3xl border border-amber-500/20">
                                        <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-500/10">
                                            <AlertCircle size={32} className="text-amber-500" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">ยังไม่ได้ตั้งค่าสัดส่วนคะแนน</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider mb-6">วิชานี้ยังไม่มีการกำหนดหัวข้อคะแนนเก็บหลังกลางภาค</p>
                                        <Link 
                                            to="/academic/score-config"
                                            className="inline-flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[12px] font-black transition-all shadow-lg shadow-amber-500/20"
                                        >
                                            <Settings size={16} />
                                            ไปหน้าตั้งค่าคะแนน
                                        </Link>
                                    </div>
                                </div>
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            ) : (
                                <table className="w-full border-collapse text-left">
                                    <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-[#1e2235]">
                                        <tr className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                                            <th rowSpan={2} className="px-4 py-4 w-[60px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-[#1e2235] sticky left-0 z-40 text-slate-900 dark:text-white">เลขที่</th>
                                            <th rowSpan={2} className="px-6 py-4 min-w-[180px] border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-[#1e2235] sticky left-[60px] z-40 text-slate-900 dark:text-white">ชื่อ-นามสกุล</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[80px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-200 dark:bg-[#1c2132] sticky left-[240px] z-40 text-slate-900 dark:text-white">
                                                <span className="text-[10px] leading-tight">เกลี่ยคะแนนเก็บ</span>
                                            </th>
                                            
<<<<<<< HEAD
                                            <th colSpan={activeAssessments.length} className="px-2 py-2 text-center bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-b border-r border-slate-200 dark:border-white/5 uppercase tracking-tighter font-black">
=======
                                            <th colSpan={activeAssessments.length} className="px-2 py-2 text-center bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-b border-slate-200 dark:border-white/5 border-r border-slate-200 dark:border-white/5 uppercase tracking-tighter font-black">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                คะแนนระหว่างภาค (หลังกลางภาค)
                                            </th>
                                            
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400">รวมเก็บ ({activeAssessments.reduce((s, a) => s + a.maxScore, 0)})</th>
<<<<<<< HEAD
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-200 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">ก่อนกลางภาค ({preMidtermPartMax})</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400">ปลายภาค ({currentCourse?.finalWeight ?? 0})</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[80px] text-center bg-indigo-500/10 text-indigo-900 dark:text-white font-black text-[12px]">รวมสุทธิ</th>
                                        </tr>
                                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                                            {activeAssessments.map(a => {
                                                const assessmentKey = getAssessmentKey(a);
                                                return (
                                                <th key={assessmentKey} className="px-0.5 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-emerald-500/5 w-[40px]">
=======
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-200 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">ก่อนกลางภาค (60)</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400">ปลายภาค ({currentCourse?.finalWeight || 20})</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[80px] text-center bg-indigo-500/10 text-indigo-900 dark:text-white font-black text-[12px]">รวมสุทธิ</th>
                                        </tr>
                                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                                            {activeAssessments.map(a => (
                                                <th key={a.id} className="px-0.5 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-emerald-500/5 w-[40px]">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span className="text-slate-600 dark:text-white/80">{a.name}</span>
                                                        <span className="text-emerald-600/60 dark:text-emerald-400/60 font-bold">/{a.maxScore}</span>
                                                    </div>
                                                </th>
<<<<<<< HEAD
                                            )})}
=======
                                            ))}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                        </tr>
                                        {/* Bulk Fill Inputs */}
                                        <tr className="bg-slate-200 dark:bg-[#1c2132] border-b border-slate-200 dark:border-white/5">
                                            <td className="sticky left-0 bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5"></td>
                                            <td className="sticky left-[60px] bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5"></td>
                                            <td className="sticky left-[240px] bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5 px-2 py-2 text-[10px] font-black text-emerald-600 dark:text-emerald-400/60 text-center whitespace-nowrap">กรอกทั้งคอลัมน์ →</td>
<<<<<<< HEAD
                                            {activeAssessments.map(a => {
                                                const assessmentKey = getAssessmentKey(a);
                                                return (
                                                <td key={`bulk-${assessmentKey}`} className="px-1 py-1 border-r border-slate-300 dark:border-white/5">
                                                    <input 
                                                        type="text" 
                                                        placeholder="0"
                                                        value={bulkValues[assessmentKey] || ""}
                                                        onChange={(e) => handleBulkFill(assessmentKey, e.target.value)}
                                                        className="w-full bg-purple-500/10 border border-purple-500/20 text-center text-[11px] font-black text-purple-600 dark:text-purple-400 py-1 rounded-lg outline-none focus:border-purple-400/50"
                                                    />
                                                </td>
                                            )})}
=======
                                            {activeAssessments.map(a => (
                                                <td key={`bulk-${a.id}`} className="px-1 py-1 border-r border-slate-300 dark:border-white/5">
                                                    <input 
                                                        type="text" 
                                                        placeholder="0"
                                                        value={bulkValues[a.id] || ""}
                                                        onChange={(e) => handleBulkFill(a.id, e.target.value)}
                                                        className="w-full bg-purple-500/10 border border-purple-500/20 text-center text-[11px] font-black text-purple-600 dark:text-purple-400 py-1 rounded-lg outline-none focus:border-purple-400/50"
                                                    />
                                                </td>
                                            ))}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                            <td colSpan={4} className="bg-transparent"></td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map(student => {
                                            const record = grades[student.id] || {};
                                            const details = record.formativeDetails || {};
                                            const { postMidTotal, sum1, total } = calculateRowTotals(student.id);

                                            return (
                                                <tr key={student.id} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                                                    <td className="px-4 py-3 text-center font-black text-[11px] text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#161a27] sticky left-0 z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        {student.studentNumber}
                                                    </td>
                                                    <td className="px-6 py-3 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#161a27] sticky left-[60px] z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-bold text-slate-900 dark:text-white">{student.title}{student.firstName} {student.lastName}</span>
<<<<<<< HEAD
                                                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">รหัสนักเรียน: {student.studentId || student.id.substring(0, 8)}</span>
=======
                                                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ID: {student.id.substring(0, 8)}</span>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                        </div>
                                                    </td>
                                                    <td className="px-1 py-3 border-r border-slate-200 dark:border-white/5 text-center bg-white dark:bg-[#161a27] sticky left-[240px] z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        <input 
                                                            type="text"
                                                            value={rowBulkValues[student.id] || ""}
                                                            onChange={(e) => handleRowBulkFill(student.id, e.target.value)}
                                                            className={`w-10 h-7 rounded-lg bg-emerald-500/10 border text-center text-[11px] font-black transition-all ${
<<<<<<< HEAD
                                                                (Number(rowBulkValues[student.id]) || 0) > totalMaxPossible 
=======
                                                                (parseFloat(rowBulkValues[student.id]) || 0) > totalMaxPossible 
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                                ? 'border-red-500 text-red-500' 
                                                                : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                                            }`}
                                                            placeholder="0"
                                                        />
                                                    </td>

<<<<<<< HEAD
                                                    {activeAssessments.map(a => {
                                                        const assessmentKey = getAssessmentKey(a);
                                                        return (
                                                        <td key={`${student.id}-${assessmentKey}`} className={`px-0.5 py-1 border-r border-slate-200 dark:border-white/5 ${ (Number(details[assessmentKey]) || 0) > a.maxScore ? 'bg-red-500/10' : 'bg-white/[0.01]' }`}>
                                                            <input 
                                                                 type="text"
                                                                 value={details[assessmentKey] ?? ""}
                                                                 onChange={(e) => handleScoreChange(student.id, assessmentKey, e.target.value)}
                                                                 className={`w-full bg-transparent text-center text-[12px] font-black focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5 ${
                                                                     (Number(details[assessmentKey]) || 0) > a.maxScore ? 'text-red-500' : 'text-slate-900 dark:text-white'
=======
                                                    {activeAssessments.map(a => (
                                                        <td key={`${student.id}-${a.id}`} className={`px-0.5 py-1 border-r border-slate-200 dark:border-white/5 ${ (details[a.id] || 0) > a.maxScore ? 'bg-red-500/10' : 'bg-white/[0.01]' }`}>
                                                            <input 
                                                                 type="text"
                                                                 value={details[a.id] ?? ""}
                                                                 onChange={(e) => handleScoreChange(student.id, a.id, e.target.value)}
                                                                 className={`w-full bg-transparent text-center text-[12px] font-black focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5 ${
                                                                     (details[a.id] || 0) > a.maxScore ? 'text-red-500' : 'text-slate-900 dark:text-white'
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                                 }`}
                                                                 placeholder="0"
                                                            />
                                                        </td>
<<<<<<< HEAD
                                                    )})}
=======
                                                    ))}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                                                    <td className="px-2 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800/20 text-[12px] font-black text-slate-500 dark:text-slate-400">
                                                        {postMidTotal}
                                                    </td>

                                                    <td className="px-2 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-800/10 text-[12px] font-black text-slate-400 dark:text-slate-600 italic">
                                                        {sum1}
                                                    </td>

<<<<<<< HEAD
                                                    <td className={`px-1 py-1 border-r border-slate-200 dark:border-white/5 ${ (Number(record.final) || 0) > (currentCourse?.finalWeight ?? 0) ? 'bg-red-500/10' : 'bg-white/[0.01]' }`}>
=======
                                                    <td className={`px-1 py-1 border-r border-slate-200 dark:border-white/5 ${ (record.final || 0) > (currentCourse?.finalWeight || 20) ? 'bg-red-500/10' : 'bg-white/[0.01]' }`}>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                        <input 
                                                            type="text"
                                                            value={record.final ?? ""}
                                                            onChange={(e) => handleFinalChange(student.id, e.target.value)}
                                                            className={`w-full bg-transparent text-center text-[12px] font-black focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5 ${
<<<<<<< HEAD
                                                                (Number(record.final) || 0) > (currentCourse?.finalWeight ?? 0) ? 'text-red-500' : 'text-indigo-600 dark:text-indigo-400'
=======
                                                                (record.final || 0) > (currentCourse?.finalWeight || 20) ? 'text-red-500' : 'text-indigo-600 dark:text-indigo-400'
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                            }`}
                                                            placeholder="0"
                                                        />
                                                    </td>

                                                    <td className={`px-2 py-3 text-center text-[13px] font-black ${ total > 100 ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-indigo-500/10 text-indigo-900 dark:text-white' }`}>
                                                        {total}
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
<<<<<<< HEAD
                                        <span className="text-[10px] font-bold">สัดส่วนคะแนน: เก็บ {configuredFormativeMax || currentCourse.formativeWeight || 0} / กลางภาค {currentCourse.midtermWeight ?? 0} / ปลายภาค {currentCourse.finalWeight ?? 0}</span>
=======
                                        <span className="text-[10px] font-bold">สัดส่วนคะแนน: เก็บ {currentCourse.formativeWeight || 60} / กลางภาค {currentCourse.midtermWeight || 20} / ปลายภาค {currentCourse.finalWeight || 20}</span>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <Link 
<<<<<<< HEAD
                                    to={`/academic/formative-scores?level=${selectedLevel}&room=${selectedRoom}&semester=${selectedSemester}&courseId=${selectedCourseId}&groupId=${selectedGroup}`}
=======
                                    to={`/academic/formative-scores?level=${selectedLevel}&room=${selectedRoom}&courseId=${selectedCourseId}`}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 dark:bg-[#1e2235] hover:bg-slate-200 dark:hover:bg-[#252a41] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-[11px] font-bold transition-all"
                                >
                                    <ArrowLeft size={14} /> ก่อนหน้า
                                </Link>
                                <span className="text-[12px] font-black text-slate-900 dark:text-white">{filteredStudents.length} รายชื่อ</span>
                            </div>
                        </div>
                    </div>
                </div>

                <style>{`
<<<<<<< HEAD
                    .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
                    .no-scrollbar::-webkit-scrollbar { display: none; }
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                `}</style>
            </div>
        </MainLayout>
    );
};

export default PostMidtermScoreEntryPage;
