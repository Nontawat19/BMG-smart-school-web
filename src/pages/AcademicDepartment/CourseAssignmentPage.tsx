import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { firestore as db } from "../../firebase";
import { motion, AnimatePresence } from "framer-motion";
<<<<<<< HEAD
import { collection, query, doc, onSnapshot, updateDoc, where, orderBy, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { getCurrentThaiYear } from "@/utils/dateUtils";
=======
import { collection, query, doc, onSnapshot, updateDoc, where, orderBy, getDoc, getDocs } from "firebase/firestore";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import MainLayout from "@/layouts/MainLayout";
import {
    Users,
    MapPin,
    BookOpen,
    ChevronLeft,
<<<<<<< HEAD
    ChevronDown,
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    Search,
    Check,
    Plus,
    X,
    User,
    School,
    Save,
    Trash2,
    Loader2,
    RefreshCw,
    LayoutGrid,
    ChevronRight,
    Building2,
    Monitor,
    Calendar,
    Filter,
    ChevronsLeft,
    ChevronsRight
} from "lucide-react";
import Swal from "sweetalert2";

// --- Types ---
interface GroupAssignment {
    groupNumber: number;
    teacherId: string;
    roomIds: string[];
    classLevels?: string[];
}

interface Course {
    id: string;
    title: string;
    code: string;
    classId?: string;
    credits?: number | string;
    hoursPerWeek?: number;
    semester?: number | string;
    type?: string; // พื้นฐาน, เพิ่มเติม
    subjectGroup?: string; // กลุ่มสาระการเรียนรู้
    teacherAssignments?: GroupAssignment[];
    isActive?: boolean;
}

interface Teacher {
    id: string;
    teacherId?: string;
    name: string;
    email?: string;
    role?: string;
    subjectGroup?: string;
}

interface Room {
    id: string;
    roomName: string;
    roomCode: string;
    roomType?: string;
    building?: string;
    floor?: string;
    capacity?: number;
    isActive?: boolean;
}

// --- Components ---

const PanelHeader = ({ title, icon: Icon, count, compact = false }: { title: string, icon: any, count?: number, compact?: boolean }) => (
    <div className={`flex items-center justify-between ${compact ? 'px-3 py-2' : 'px-4 py-3'} border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]`}>
        <div className="flex items-center gap-2">
            <Icon size={14} className="text-indigo-600 dark:text-indigo-400" />
            <h3 className={`font-bold text-slate-800 dark:text-white tracking-wide uppercase ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{title}</h3>
        </div>
        {count !== undefined && (
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500">({count})</span>
        )}
    </div>
);

const FloatingButton = ({ icon: Icon, color, onClick, label, disabled = false }: { icon: any, color: string, onClick: () => void, label?: string, disabled?: boolean }) => (
    <motion.button
        whileHover={disabled ? {} : { scale: 1.05 }}
        whileTap={disabled ? {} : { scale: 0.9 }}
        onClick={disabled ? undefined : onClick}
        title={label}
        className={`w-11 h-11 ${color} text-white rounded-2xl flex items-center justify-center shadow-2xl transition-all border border-white/10 ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
        <Icon size={22} strokeWidth={3} />
    </motion.button>
);

const ITEMS_PER_PAGE = 10;

const Pagination = ({ currentPage, totalPages, onPageChange }: { currentPage: number, totalPages: number, onPageChange: (p: number) => void }) => {
    if (totalPages <= 1) return null;
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
    const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

    const Btn = ({ onClick, disabled, children, active }: any) => (
<<<<<<< HEAD
        <button 
            onClick={onClick} 
            disabled={disabled} 
            className={`w-6 h-6 rounded-md text-[8px] font-black flex items-center justify-center transition-all shadow-sm ${
                active 
                    ? 'bg-indigo-600 text-white shadow-indigo-600/20' 
                    : disabled 
                        ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed bg-slate-50 dark:bg-white/[0.02]' 
                        : 'text-slate-500 dark:text-slate-400 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/10 hover:border-indigo-500/30 cursor-pointer'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div className="flex items-center justify-center gap-1 py-2 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20 px-2 shrink-0">
            <Btn onClick={() => onPageChange(1)} disabled={currentPage === 1}><ChevronsLeft size={10} /></Btn>
            <Btn onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}><ChevronLeft size={10} /></Btn>
            <div className="flex items-center gap-1 mx-1">
                {pages.map(p => <Btn key={p} onClick={() => onPageChange(p)} active={p === currentPage}>{p}</Btn>)}
            </div>
=======
        <button onClick={onClick} disabled={disabled} className={`w-5 h-5 rounded text-[7px] font-black flex items-center justify-center transition-all ${active ? 'bg-indigo-600 text-white' : disabled ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 cursor-pointer'}`}>{children}</button>
    );

    return (
        <div className="flex items-center justify-center gap-0.5 py-1.5 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 px-1">
            <Btn onClick={() => onPageChange(1)} disabled={currentPage === 1}><ChevronsLeft size={10} /></Btn>
            <Btn onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}><ChevronLeft size={10} /></Btn>
            {pages.map(p => <Btn key={p} onClick={() => onPageChange(p)} active={p === currentPage}>{p}</Btn>)}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            <Btn onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}><ChevronRight size={10} /></Btn>
            <Btn onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}><ChevronsRight size={10} /></Btn>
        </div>
    );
};

const CourseAssignmentPage: React.FC = () => {
<<<<<<< HEAD
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const BackButton = React.lazy(() => import("@/components/Shared/BackButton"));
=======
    const navigate = useNavigate();
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    const { schoolId: urlSchoolId } = useParams<{ schoolId?: string }>();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = urlSchoolId || (currentUser as any)?.schoolId;

    // Data States
    const [courses, setCourses] = useState<Course[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [subjectGroupsList, setSubjectGroupsList] = useState<{id: string, name: string, code: string}[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Selection States
    const [selectedCourses, setSelectedCourses] = useState<Course[]>([]);
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [activeGroupNumber, setActiveGroupNumber] = useState<number>(1);
    const [selectedAssignments, setSelectedAssignments] = useState<{ courseId: string, groupNumber: number, isPending?: boolean }[]>([]);
    const [pendingQueue, setPendingQueue] = useState<{ courseId: string, teacherId: string, roomIds: string[], groupNumber: number, title: string, code: string, classId: any }[]>([]);

<<<<<<< HEAD
    const academicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [selectedYear, setSelectedYear] = useState<string>(academicYear);
    const [selectedSemester, setSelectedSemester] = useState<string>("1");
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [semesterAssignments, setSemesterAssignments] = useState<any[]>([]);
=======
    // Academic Year & Semester States
    const [selectedYear, setSelectedYear] = useState<string>("");
    const [selectedSemester, setSelectedSemester] = useState<string>("1");
    const [availableYears, setAvailableYears] = useState<string[]>([]);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    // Search/Filter States
    const [courseSearch, setCourseSearch] = useState("");
    const [teacherSearch, setTeacherSearch] = useState("");
    const [roomSearch, setRoomSearch] = useState("");
    const [buildingFilter, setBuildingFilter] = useState("ทั้งหมด");
    const [categoryFilter, setCategoryFilter] = useState("ทั้งหมด");
    const [subjectGroupFilter, setSubjectGroupFilter] = useState("กลุ่มวิชา ทั้งหมด");
    const [teacherGroupFilter, setTeacherGroupFilter] = useState("ครู ทั้งหมด");
    const [showOnlyAssigned, setShowOnlyAssigned] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState("ทั้งหมด");
    const [schoolInfo, setSchoolInfo] = useState<any>(null);

    const getLevelLabel = (id: string | undefined) => {
        if (!id) return "";
        // Normalize: if it's already Thai like 'ม.ต้น', return it. 
        // If it's English ID, map to Thai.
        const map: Record<string, string> = {
            k1: 'อนุบาล 1', k2: 'อนุบาล 2', k3: 'อนุบาล 3',
            p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
            m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
            junior_high: 'ม.ต้น', senior_high: 'ม.ปลาย',
            'ม.ต้น': 'ม.ต้น', 'ม.ปลาย': 'ม.ปลาย'
        };
        return map[id] || id;
    };

    // Pagination States
    const [coursePage, setCoursePage] = useState(1);
    const [teacherPage, setTeacherPage] = useState(1);
    const [roomPage, setRoomPage] = useState(1);
    const [assignmentPage, setAssignmentPage] = useState(1);

    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);

    // Derived UI Props for Floating Buttons
    const assignButtonProps = useMemo(() => {
        const canAssign = selectedCourses.length > 0 && selectedTeacherId !== null;
        return {
            color: canAssign ? 'bg-indigo-600' : 'bg-slate-400',
            label: selectedCourses.length > 0 ? `มอบหมายใหม่ ${selectedCourses.length} วิชา` : 'เลือกวิชาด้านซ้าย',
            disabled: !canAssign
        };
    }, [selectedCourses, selectedTeacherId]);

    const middleButtonProps = useMemo(() => {
        const isUpdate = selectedAssignments.length > 0 && selectedTeacherId !== null;
<<<<<<< HEAD
=======
        const isBulkDelete = selectedAssignments.length > 1;
        const isSingleDelete = selectedAssignments.length === 1;

>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        if (isUpdate) {
            const teacherName = teacherMap?.[selectedTeacherId]?.name || "";
            return { icon: RefreshCw, color: 'bg-amber-500', label: `เปลี่ยนครูเป็น ${teacherName} (${selectedAssignments.length} รายการ)`, action: 'update' };
        }
<<<<<<< HEAD
        return { icon: X, color: 'bg-slate-500', label: 'ล้างการเลือกทั้งหมด', action: 'reset' };
    }, [selectedAssignments, selectedTeacherId, teacherMap]);

    const deleteButtonProps = useMemo(() => {
        const canDelete = selectedAssignments.length > 0;
        return {
            icon: Trash2,
            color: canDelete ? 'bg-rose-500' : 'bg-slate-400',
            label: canDelete ? `ลบการมอบหมายที่เลือก (${selectedAssignments.length})` : 'เลือกรายการเพื่อลบ',
            disabled: !canDelete
        };
    }, [selectedAssignments]);

=======
        if (isBulkDelete) return { icon: Trash2, color: 'bg-rose-600', label: `ลบ ${selectedAssignments.length} รายการที่เลือก`, action: 'bulkDelete' };
        if (isSingleDelete) return { icon: Trash2, color: 'bg-rose-500', label: 'ลบรายการที่เลือก', action: 'delete' };
        return { icon: X, color: 'bg-slate-500', label: 'ล้างการเลือกทั้งหมด', action: 'reset' };
    }, [selectedAssignments, selectedTeacherId, teacherMap]);

>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    const roomButtonProps = useMemo(() => {
        const canUpdate = selectedAssignments.length > 0 && selectedRoomId !== null;
        if (canUpdate) {
            const room = rooms.find(r => r.id === selectedRoomId);
            return {
                color: 'bg-emerald-500',
                label: `ย้ายไปห้อง ${room?.roomCode || ''} (${selectedAssignments.length} รายการ)`
            };
        }
        return {
            color: 'bg-slate-400',
            label: 'เลือกวิชาและสถานที่'
        };
    }, [selectedAssignments, selectedRoomId, rooms]);
    const teacherList = useMemo(() => Object.values(teacherMap) as Teacher[], [teacherMap]);

<<<<<<< HEAD
    // Computed courses with merged assignments for the selected year/semester
    const coursesWithAssignments = useMemo(() => {
        return courses.map(course => {
            const assignment = semesterAssignments.find(a => a.courseId === course.id);
            return {
                ...course,
                teacherAssignments: assignment ? assignment.teacherAssignments : (course.teacherAssignments || [])
            };
        });
    }, [courses, semesterAssignments]);

    // --- Enterprise Feature: Teacher Load Calculation ---
    const teacherLoadMap = useMemo(() => {
        const load: Record<string, number> = {};
        coursesWithAssignments.forEach(c => {
            const creditsNum = Number(c.credits || 0);
            const hours = creditsNum > 0 ? Math.round(creditsNum * 2) : (c.hoursPerWeek || 0);
            
            c.teacherAssignments?.forEach((asgn: GroupAssignment) => {
=======
    // --- Enterprise Feature: Teacher Load Calculation ---
    const teacherLoadMap = useMemo(() => {
        const load: Record<string, number> = {};
        courses.forEach(c => {
            const creditsNum = Number(c.credits || 0);
            const hours = creditsNum > 0 ? Math.round(creditsNum * 2) : (c.hoursPerWeek || 0);
            
            c.teacherAssignments?.forEach(asgn => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                if (asgn.teacherId) {
                    load[asgn.teacherId] = (load[asgn.teacherId] || 0) + hours;
                }
            });
        });

        // Add Pending Queue to the load
        pendingQueue.forEach(p => {
            const course = courses.find(c => c.id === p.courseId);
            if (course) {
                const creditsNum = Number(course.credits || 0);
                const hours = creditsNum > 0 ? Math.round(creditsNum * 2) : (course.hoursPerWeek || 0);
                load[p.teacherId] = (load[p.teacherId] || 0) + hours;
            }
        });
        return load;
    }, [courses, pendingQueue]);

    const buildings = useMemo(() => {
        const unique = Array.from(new Set(rooms.map(r => r.building).filter(Boolean)));
        return ["ทั้งหมด", ...unique];
    }, [rooms]);

<<<<<<< HEAD
    const calendarState = useSelector((state: RootState) => state.calendar);

    useEffect(() => {
        if (!schoolId) return;

        if (calendarState.status === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }

        const fetchInitialSettings = async () => {
            try {
                // Fetch School Info
=======
    useEffect(() => {
        if (!schoolId) return;

        // Fetch current active calendar settings
        const fetchCalendarSettings = async () => {
            try {
                // Fetch School Info for levels
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                const schoolRef = doc(db, 'school-settings', schoolId);
                const schoolSnap = await getDoc(schoolRef);
                if (schoolSnap.exists()) {
                    setSchoolInfo(schoolSnap.data());
                }

<<<<<<< HEAD
                // Fetch available years for dropdown
=======
                const calendarRef = doc(db, 'school-settings', schoolId, 'main_calendar', 'default');
                const calendarSnap = await getDoc(calendarRef);
                if (calendarSnap.exists()) {
                    const data = calendarSnap.data();
                    if (data.academicYear) {
                        setSelectedYear(data.academicYear);
                    }
                }

                // Also fetch all available academic years to populate the dropdown
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                const calendarColRef = collection(db, 'school-settings', schoolId, 'main_calendar');
                const calendarColSnap = await getDocs(calendarColRef);
                const years = calendarColSnap.docs
                    .map(doc => doc.id)
                    .filter(id => id !== 'default')
                    .sort((a, b) => b.localeCompare(a));
                
                setAvailableYears(years);
<<<<<<< HEAD
                
                // Initialize selection from Redux if available
                if (calendarState.status === 'succeeded' && !selectedYear) {
                    setSelectedYear(calendarState.academicYear);
                    const currentTerm = calendarState.rawData?.currentTerm || "1";
                    setSelectedSemester(currentTerm);
                }
            } catch (error) {
                console.error("Error fetching initial settings:", error);
            }
        };

        fetchInitialSettings();
=======
            } catch (error) {
                console.error("Error fetching calendar settings:", error);
            }
        };

        fetchCalendarSettings();
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

        const unsubCourses = onSnapshot(query(collection(db, 'school-settings', schoolId, 'courses'), orderBy('code', 'asc')), (snap) => {
            setCourses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)).filter(c => c.isActive !== false));
            setIsLoading(false);
        });

        const unsubRooms = onSnapshot(collection(db, 'school-settings', schoolId, 'physical-rooms'), (snap) => {
            setRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room)));
        });

        const unsubGroups = onSnapshot(collection(db, 'school-settings', schoolId, 'subject_groups'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as { name: string, code: string }) }));
            data.sort((a, b) => parseInt(a.code || '999') - parseInt(b.code || '999'));
            setSubjectGroupsList(data);
        });

        return () => {
            unsubCourses();
            unsubRooms();
            unsubGroups();
        };
    }, [schoolId]);

<<<<<<< HEAD
    // Real-time listener for semester-specific assignments
    useEffect(() => {
        if (!schoolId || !selectedYear || !selectedSemester) return;
        
        const assignmentRef = collection(db, 'school-settings', schoolId, 'course_assignments');
        const q = query(assignmentRef, 
            where('academicYear', '==', selectedYear),
            where('semester', '==', selectedSemester)
        );

        const unsub = onSnapshot(q, (snap) => {
            setSemesterAssignments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => unsub();
    }, [schoolId, selectedYear, selectedSemester]);

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    // Handlers
    const handleAddToQueue = async () => {
        if (!selectedCourses.length || !selectedTeacherId || !schoolId) return;

        const newItems = selectedCourses.map(course => ({
            courseId: course.id,
            teacherId: selectedTeacherId,
            roomIds: selectedRoomId ? [selectedRoomId] : [],
            groupNumber: activeGroupNumber,
            title: course.title || "",
            code: course.code || "",
            classId: course.classId
        }));

        setPendingQueue(prev => [...prev, ...newItems]);
        setSelectedCourses([]);
        setSelectedTeacherId(null);
        setSelectedRoomId(null);
        
        Swal.fire({
            icon: 'info',
            title: 'เตรียมการมอบหมายสำเร็จ',
            text: `วิชาถูกนำไปพักไว้ที่ "รายวิชาที่มอบหมาย" เพื่อรอการระบุสถานที่หรือบันทึกจริง`,
            toast: true,
            position: 'top-end',
            timer: 3000,
            showConfirmButton: false
        });
    };

    const handleCommitAll = async () => {
        if (!pendingQueue.length || !schoolId) return;

        const confirmResult = await Swal.fire({
            title: 'ยืนยันการบันทึกลงระบบ?',
            text: `คุณกำลังจะบันทึกการมอบหมายจำนวน ${pendingQueue.length} รายการ ลงในฐานข้อมูลจริง ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ตกลง, บันทึกเลย',
            cancelButtonText: 'ตรวจสอบอีกครั้ง'
        });

        if (!confirmResult.isConfirmed) return;

        setIsSaving(true);
        Swal.fire({ title: 'กำลังบันทึกลงฐานข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            // Group by courseId for batch-like updates
            const byCourse: Record<string, typeof pendingQueue> = {};
            pendingQueue.forEach(item => {
                if (!byCourse[item.courseId]) byCourse[item.courseId] = [];
                byCourse[item.courseId].push(item);
            });

            for (const [courseId, queueItems] of Object.entries(byCourse)) {
<<<<<<< HEAD
                const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                const courseData = coursesWithAssignments.find(c => c.id === courseId);
=======
                const courseRef = doc(db, 'school-settings', schoolId, 'courses', courseId);
                const courseData = courses.find(c => c.id === courseId);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                if (!courseData) continue;

                const currentAssignments = [...(courseData.teacherAssignments || [])];
                
                queueItems.forEach(item => {
                    const existingIdx = currentAssignments.findIndex(a => a.groupNumber === item.groupNumber);
                    const newAssign: GroupAssignment = {
                        groupNumber: item.groupNumber,
                        teacherId: item.teacherId,
                        roomIds: item.roomIds,
                        classLevels: item.classId ? (Array.isArray(item.classId) ? item.classId : [item.classId]) : []
                    };

                    if (existingIdx !== -1) {
                        currentAssignments[existingIdx] = newAssign;
                    } else {
                        currentAssignments.push(newAssign);
                    }
                });

<<<<<<< HEAD
                await setDoc(assignmentRef, { 
                    courseId,
                    academicYear: selectedYear,
                    semester: selectedSemester,
                    teacherAssignments: currentAssignments 
                }, { merge: true });
=======
                await updateDoc(courseRef, { teacherAssignments: currentAssignments });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            }

            Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลเรียบร้อย', text: 'ข้อมูลถูกเขียนลงฐานข้อมูลและพร้อมใช้งานแล้ว', timer: 2000, showConfirmButton: false });
            setPendingQueue([]);
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetSelections = () => {
        setSelectedCourses([]);
        setSelectedTeacherId(null);
        setSelectedRoomId(null);
        setActiveGroupNumber(1);
        setSelectedAssignments([]);
    };

    const handleUpdateTeacher = async () => {
        if (!selectedAssignments.length || !selectedTeacherId || !schoolId) return;
        
        const teacherName = teacherMap?.[selectedTeacherId]?.name || "ไม่ทราบชื่อ";
        const hasPending = selectedAssignments.some(a => a.isPending);
        const hasSaved = selectedAssignments.some(a => !a.isPending);

        const confirmResult = await Swal.fire({
            title: 'ยืนยันการเปลี่ยนครู?',
            text: `เปลี่ยนเป็น "${teacherName}" สำหรับ ${selectedAssignments.length} รายการที่เลือก?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            cancelButtonText: 'ยกเลิก',
            confirmButtonText: 'ตกลง, เปลี่ยนเลย'
        });

        if (!confirmResult.isConfirmed) return;

        try {
            // 1. Update Pending Queue (Local)
            if (hasPending) {
                setPendingQueue(prev => prev.map(item => {
                    const isTarget = selectedAssignments.some(a => a.isPending && a.courseId === item.courseId && a.groupNumber === item.groupNumber);
                    return isTarget ? { ...item, teacherId: selectedTeacherId } : item;
                }));
            }

            // 2. Update Firestore (Saved Items) via Batch
            if (hasSaved) {
                const { writeBatch } = await import("firebase/firestore");
                const batch = writeBatch(db);
                const savedTargets = selectedAssignments.filter(a => !a.isPending);
                
                // Group by course to avoid multiple batch writes to same doc in sequence
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
<<<<<<< HEAD
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
=======
                    const course = courses.find(c => c.id === courseId);
                    if (!course) continue;
                    const courseRef = doc(db, 'school-settings', schoolId, 'courses', courseId);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    const assignments = [...(course.teacherAssignments || [])];
                    groups.forEach(num => {
                        const idx = assignments.findIndex(a => a.groupNumber === num);
                        if (idx !== -1) assignments[idx] = { ...assignments[idx], teacherId: selectedTeacherId };
                    });
<<<<<<< HEAD
                    batch.set(assignmentRef, { 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: assignments 
                    }, { merge: true });
=======
                    batch.update(courseRef, { teacherAssignments: assignments });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                }
                await batch.commit();
            }

            Swal.fire({ icon: 'success', title: 'อัปเดตครูสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            setSelectedTeacherId(null);
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถอัปเดตข้อมูลครูได้' });
        }
    };

    const handleUpdateRoom = async () => {
        if (!selectedAssignments.length || !selectedRoomId || !schoolId) return;
        
        const room = rooms.find(r => r.id === selectedRoomId);
        const roomName = room ? `${room.roomCode} ${room.roomName}` : "ไม่ทราบชื่อ";
        const hasPending = selectedAssignments.some(a => a.isPending);
        const hasSaved = selectedAssignments.some(a => !a.isPending);

        const confirmResult = await Swal.fire({
            title: 'ยืนยันการระบุสถานที่?',
            text: `เปลี่ยนสถานที่สอนเป็น "${roomName}" สำหรับ ${selectedAssignments.length} รายการ?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            cancelButtonText: 'ยกเลิก',
            confirmButtonText: 'ตกลง, ระบุสถานที่'
        });

        if (!confirmResult.isConfirmed) return;

        try {
            // 1. Update Pending Queue (Local)
            if (hasPending) {
                setPendingQueue(prev => prev.map(item => {
                    const isTarget = selectedAssignments.some(a => a.isPending && a.courseId === item.courseId && a.groupNumber === item.groupNumber);
                    return isTarget ? { ...item, roomIds: [selectedRoomId] } : item;
                }));
            }

            // 2. Update Firestore (Saved Items) via Batch
            if (hasSaved) {
                const { writeBatch } = await import("firebase/firestore");
                const batch = writeBatch(db);
                const savedTargets = selectedAssignments.filter(a => !a.isPending);
                
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
<<<<<<< HEAD
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
=======
                    const course = courses.find(c => c.id === courseId);
                    if (!course) continue;
                    const courseRef = doc(db, 'school-settings', schoolId, 'courses', courseId);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    const assignments = [...(course.teacherAssignments || [])];
                    groups.forEach(num => {
                        const idx = assignments.findIndex(a => a.groupNumber === num);
                        if (idx !== -1) assignments[idx] = { ...assignments[idx], roomIds: [selectedRoomId] };
                    });
<<<<<<< HEAD
                    batch.set(assignmentRef, { 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: assignments 
                    }, { merge: true });
=======
                    batch.update(courseRef, { teacherAssignments: assignments });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                }
                await batch.commit();
            }

            Swal.fire({ icon: 'success', title: 'ระบุสถานที่เรียบร้อย', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            setSelectedRoomId(null);
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถระบุสถานที่ได้' });
        }
    };

    const handleClearRoomFromAssignment = async () => {
        if (!selectedAssignments.length || !schoolId) return;
        
        const hasPending = selectedAssignments.some(a => a.isPending);
        const hasSaved = selectedAssignments.some(a => !a.isPending);

        const confirmResult = await Swal.fire({
            title: 'ยกเลิกสถานที่สอน?',
            text: `คุณต้องการยกเลิกสถานที่สอนสำหรับ ${selectedAssignments.length} รายการที่เลือก ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันการยกเลิก',
            cancelButtonText: 'ย้อนกลับ'
        });

        if (!confirmResult.isConfirmed) return;

        try {
            // 1. Update Pending Queue (Local)
            if (hasPending) {
                setPendingQueue(prev => prev.map(item => {
                    const isTarget = selectedAssignments.some(a => a.isPending && a.courseId === item.courseId && a.groupNumber === item.groupNumber);
                    return isTarget ? { ...item, roomIds: [] } : item;
                }));
            }

            // 2. Update Firestore via Batch
            if (hasSaved) {
                const { writeBatch } = await import("firebase/firestore");
                const batch = writeBatch(db);
                const savedTargets = selectedAssignments.filter(a => !a.isPending);
                
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
<<<<<<< HEAD
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
=======
                    const course = courses.find(c => c.id === courseId);
                    if (!course) continue;
                    const courseRef = doc(db, 'school-settings', schoolId, 'courses', courseId);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    const assignments = [...(course.teacherAssignments || [])];
                    groups.forEach(groupNum => {
                        const idx = assignments.findIndex(a => a.groupNumber === groupNum);
                        if (idx !== -1) assignments[idx] = { ...assignments[idx], roomIds: [] };
                    });
<<<<<<< HEAD
                    batch.set(assignmentRef, { 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: assignments 
                    }, { merge: true });
=======
                    batch.update(courseRef, { teacherAssignments: assignments });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                }
                await batch.commit();
            }

            Swal.fire({ icon: 'success', title: 'ยกเลิกสถานที่สำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถยกเลิกสถานที่ได้' });
        }
    };

    const handleBulkRemoveAssignments = async () => {
        if (!selectedAssignments.length || !schoolId) return;

        const result = await Swal.fire({
            title: 'ยืนยันการลบรายการที่เลือก?',
            text: `คุณต้องการลบรายการที่เลือกจำนวน ${selectedAssignments.length} รายการ ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonText: 'ยกเลิก'
        });

        if (!result.isConfirmed) return;

        try {
            const pendingTargets = selectedAssignments.filter(a => a.isPending);
            const savedTargets = selectedAssignments.filter(a => !a.isPending);

            // Remove from local queue
            if (pendingTargets.length > 0) {
                setPendingQueue(prev => prev.filter(item => 
                    !pendingTargets.some(p => p.courseId === item.courseId && p.groupNumber === item.groupNumber)
                ));
            }

            // Remove from Firestore
            if (savedTargets.length > 0) {
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
<<<<<<< HEAD
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                    const updated = (course.teacherAssignments || []).filter((a: GroupAssignment) => !groups.includes(a.groupNumber));
                    await setDoc(assignmentRef, { 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: updated 
                    }, { merge: true });
=======
                    const course = courses.find(c => c.id === courseId);
                    if (!course) continue;
                    const updated = (course.teacherAssignments || []).filter(a => !groups.includes(a.groupNumber));
                    await updateDoc(doc(db, 'school-settings', schoolId, 'courses', courseId), { teacherAssignments: updated });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                }
            }
            
            Swal.fire({ icon: 'success', title: 'ลบรายการเรียบร้อย', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' });
        }
    };

    const handleRemoveAssignment = async (courseId: string, groupNumber: number) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: `คุณต้องการลบการมอบหมายของกลุ่ม ${groupNumber} ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#374151',
            confirmButtonText: 'ลบการมอบหมาย',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed && schoolId) {
            try {
<<<<<<< HEAD
                const course = coursesWithAssignments.find(c => c.id === courseId);
                if (!course) return;
                const updated = (course.teacherAssignments || []).filter((a: GroupAssignment) => a.groupNumber !== groupNumber);
                const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                await setDoc(doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId), {
                    courseId,
                    academicYear: selectedYear,
                    semester: selectedSemester,
                    teacherAssignments: updated
                }, { merge: true });
=======
                const course = courses.find(c => c.id === courseId);
                if (!course) return;
                const updated = (course.teacherAssignments || []).filter(a => a.groupNumber !== groupNumber);
                await updateDoc(doc(db, 'school-settings', schoolId, 'courses', courseId), { teacherAssignments: updated });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            } catch (error) {
                console.error(error);
            }
        }
    };

<<<<<<< HEAD
    // Helper for level matching - handles both IDs (m1) and Thai labels (ม.1)
=======
    // Helper for level matching
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    const matchesLevel = (courseClassId: string | undefined) => {
        if (selectedLevel === "ทั้งหมด") return true;
        if (!courseClassId) return false;
        
<<<<<<< HEAD
        const cid = courseClassId.toString().toLowerCase().trim();
        const sid = selectedLevel.toLowerCase().trim();

        // Exact match
        if (cid === sid) return true;

        // Common Thai mapping
        const thaiMapping: Record<string, string[]> = {
            'm1': ['ม.1'], 'm2': ['ม.2'], 'm3': ['ม.3'],
            'm4': ['ม.4'], 'm5': ['ม.5'], 'm6': ['ม.6'],
            'p1': ['ป.1'], 'p2': ['ป.2'], 'p3': ['ป.3'],
            'p4': ['ป.4'], 'p5': ['ป.5'], 'p6': ['ป.6'],
            'k1': ['อ.1', 'อนุบาล 1'], 'k2': ['อ.2', 'อนุบาล 2'], 'k3': ['อ.3', 'อนุบาล 3']
        };

        if (thaiMapping[sid]?.includes(cid)) return true;

        // Group logic for "ม.ต้น"
        if (sid === "junior_high" || sid === "ม.ต้น") {
            return ["m1", "m2", "m3", "junior_high", "ม.ต้น", "ม.1", "ม.2", "ม.3"].includes(cid);
        }
        
        // Group logic for "ม.ปลาย"
        if (sid === "senior_high" || sid === "ม.ปลาย") {
            return ["m4", "m5", "m6", "senior_high", "ม.ปลาย", "ม.4", "ม.5", "ม.6"].includes(cid);
=======
        // Exact match (either English ID or Thai string from DB)
        if (courseClassId === selectedLevel) return true;
        
        // Group logic for "ม.ต้น"
        if (selectedLevel === "junior_high" || selectedLevel === "ม.ต้น") {
            return ["m1", "m2", "m3", "junior_high", "ม.ต้น"].includes(courseClassId);
        }
        
        // Group logic for "ม.ปลาย"
        if (selectedLevel === "senior_high" || selectedLevel === "ม.ปลาย") {
            return ["m4", "m5", "m6", "senior_high", "ม.ปลาย"].includes(courseClassId);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        }
        
        return false;
    };

    // Reset pages when filters change (must be before early return)
    useEffect(() => { setCoursePage(1); setAssignmentPage(1); }, [courseSearch, selectedSemester, categoryFilter, subjectGroupFilter, selectedYear, showOnlyAssigned, selectedLevel]);
    useEffect(() => { setTeacherPage(1); }, [teacherSearch, teacherGroupFilter]);
    useEffect(() => { setRoomPage(1); }, [roomSearch, buildingFilter]);

    const subjectGroups = useMemo(() => {
        const names = subjectGroupsList.map(g => g.name);
        return ["กลุ่มวิชา ทั้งหมด", ...names];
    }, [subjectGroupsList]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-[#0b0e14]">
                <RefreshCw className="text-indigo-500 animate-spin mb-4" size={40} />
                <p className="text-slate-600 dark:text-slate-400 font-bold">กำลังเตรียมข้อมูลระบบ...</p>
            </div>
        );
    }

    // --- Senior Logic: Filtering System ---
    
    // 1. Filter for Left Panel (Source Courses)
<<<<<<< HEAD
    const filteredCourses = coursesWithAssignments.filter(c => {
        // Core Logic: Checks if matches all active filters
        const matchesSearch = (c.title?.toLowerCase() || "").includes(courseSearch.toLowerCase()) || (c.code?.toLowerCase() || "").includes(courseSearch.toLowerCase());
        const matchesGroup = subjectGroupFilter === "กลุ่มวิชา ทั้งหมด" || (c.subjectGroup && (c.subjectGroup === subjectGroupFilter || c.subjectGroup.includes(subjectGroupFilter.replace('กลุ่มสาระการเรียนรู้', '').trim()) || subjectGroupFilter.includes(c.subjectGroup.replace('กลุ่มสาระการเรียนรู้', '').trim())));
=======
    const filteredCourses = courses.filter(c => {
        // Core Logic: Checks if matches all active filters
        const matchesSearch = (c.title?.toLowerCase() || "").includes(courseSearch.toLowerCase()) || (c.code?.toLowerCase() || "").includes(courseSearch.toLowerCase());
        const matchesGroup = subjectGroupFilter === "กลุ่มวิชา ทั้งหมด" || (c.subjectGroup === subjectGroupFilter);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        const matchesType = categoryFilter === "ประเภท" || categoryFilter === "ทั้งหมด" || (c.type?.trim().toLowerCase() === categoryFilter.trim().toLowerCase());
        const matchesLevelFilter = matchesLevel(c.classId);
        
        let matchesSemester = true;
        if (selectedSemester !== "0") {
<<<<<<< HEAD
            const courseSem = c.semester?.toString().trim() || "0";
            matchesSemester = courseSem === selectedSemester || courseSem === "0" || courseSem === "";
=======
            const courseSem = c.semester?.toString().trim() || "";
            matchesSemester = courseSem === selectedSemester || courseSem === "0";
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        }

        if (!(matchesSearch && matchesGroup && matchesType && matchesLevelFilter && matchesSemester)) return false;

        // Status logic: Check assignment status
        const assignedInDB = (c.teacherAssignments?.length || 0);
        const assignedInQueue = pendingQueue.filter(p => p.courseId === c.id).length;
        const totalAssigned = assignedInDB + assignedInQueue;

        // Toggle logic: If showOnlyAssigned is ON, show only assigned. If OFF, show ALL but prioritize unassigned flow.
        if (showOnlyAssigned) return totalAssigned > 0;
        
        // Even if not "showOnlyAssigned", we show the course so user can add more groups
        return true; 
    }).sort((a, b) => {
        const aGroup = subjectGroupsList.find(g => g.name === (a as any).subjectGroup);
        const bGroup = subjectGroupsList.find(g => g.name === (b as any).subjectGroup);
        if (aGroup?.code !== bGroup?.code) return (parseInt(aGroup?.code || '999')) - (parseInt(bGroup?.code || '999'));
        return (a.code || "").localeCompare(b.code || "");
    });

    // 2. Filter for Right Panel (Assigned Courses View) - "FOCUS MODE"
<<<<<<< HEAD
    const assignedCourses = coursesWithAssignments.filter(c => {
=======
    const assignedCourses = courses.filter(c => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        if (!matchesLevel(c.classId)) return false;

        // Condition 1: If a teacher is selected, show ALL courses assigned to that teacher
        if (selectedTeacherId) {
<<<<<<< HEAD
            const matchesDB = c.teacherAssignments?.some((a: GroupAssignment) => a.teacherId === selectedTeacherId);
=======
            const matchesDB = c.teacherAssignments?.some(a => a.teacherId === selectedTeacherId);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            const matchesQueue = pendingQueue.some(p => p.courseId === c.id && p.teacherId === selectedTeacherId);
            if (matchesDB || matchesQueue) return true;
        }

        // Condition 2: If items are in the pending queue, show them
        if (pendingQueue.some(p => p.courseId === c.id)) return true;

        // Condition 3: If an assignment is already selected for editing
        if (selectedAssignments.some(a => a.courseId === c.id)) return true;

<<<<<<< HEAD
        // Condition 4: If specifically showOnlyAssigned is on, show those with DB assignments (ONLY if a teacher is selected to avoid cluttering the view)
        if (showOnlyAssigned && selectedTeacherId && c.teacherAssignments && c.teacherAssignments.length > 0) return true;

        return false;
    }).sort((a, b) => {
        const aGroup = subjectGroupsList.find(g => g.name === (a as any).subjectGroup);
        const bGroup = subjectGroupsList.find(g => g.name === (b as any).subjectGroup);
        if (aGroup?.code !== bGroup?.code) return (parseInt(aGroup?.code || '999')) - (parseInt(bGroup?.code || '999'));
        return (a.code || "").localeCompare(b.code || "");
    });
=======
        // Condition 4: If specifically showOnlyAssigned is on, show those with DB assignments
        if (showOnlyAssigned && c.teacherAssignments && c.teacherAssignments.length > 0) return true;

        return false;
    }).sort((a, b) => (a.code || "").localeCompare(b.code || ""));
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    // Paginated data
    const courseTotalPages = Math.ceil(filteredCourses.length / ITEMS_PER_PAGE);
    const paginatedCourses = filteredCourses.slice((coursePage - 1) * ITEMS_PER_PAGE, coursePage * ITEMS_PER_PAGE);

    const filteredTeachers = teacherList.filter(t => {
        const matchesSearch = t.name?.toLowerCase().includes(teacherSearch.toLowerCase());
        const matchesGroup = teacherGroupFilter === "ครู ทั้งหมด" || (t as any).subjectGroup === teacherGroupFilter || (t as any).learningArea === teacherGroupFilter;
        return matchesSearch && matchesGroup;
    });
    const teacherTotalPages = Math.ceil(filteredTeachers.length / ITEMS_PER_PAGE);
    const paginatedTeachers = filteredTeachers.slice((teacherPage - 1) * ITEMS_PER_PAGE, teacherPage * ITEMS_PER_PAGE);

    const filteredRooms = rooms.filter(r => (buildingFilter === "ทั้งหมด" || r.building === buildingFilter) && ((r.roomName?.toLowerCase() || "").includes(roomSearch.toLowerCase()) || (r.roomCode?.toLowerCase() || "").includes(roomSearch.toLowerCase())));
    const roomTotalPages = Math.ceil(filteredRooms.length / ITEMS_PER_PAGE);
    const paginatedRooms = filteredRooms.slice((roomPage - 1) * ITEMS_PER_PAGE, roomPage * ITEMS_PER_PAGE);

    const assignmentTotalPages = Math.ceil(assignedCourses.length / ITEMS_PER_PAGE);
    const paginatedAssignedCourses = assignedCourses.slice((assignmentPage - 1) * ITEMS_PER_PAGE, assignmentPage * ITEMS_PER_PAGE);

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-800 dark:text-slate-300 font-sans flex flex-col overflow-hidden h-screen select-none transition-colors duration-300">
                
                {/* --- Header --- */}
<<<<<<< HEAD
                <header className="px-6 py-3 bg-white dark:bg-[#161a27] border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0 shadow-sm z-30 transition-colors duration-300">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-4">
                            <React.Suspense fallback={<div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/5 animate-pulse" />}>
                                <BackButton to="/academic/hub/registration" />
                            </React.Suspense>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
                                    <BookOpen size={20} className="text-white" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-black text-slate-900 dark:text-white leading-none">การมอบหมายงานสอน</h1>
                                    <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold mt-1 uppercase tracking-wider">กำหนดวิชาสอน ครูผู้สอน และสถานที่เรียนรายภาคเรียน</p>
                                </div>
=======
                <header className="px-6 py-3 bg-white dark:bg-[#161a27] border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0 shadow-sm">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg">
                                <BookOpen size={20} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-slate-900 dark:text-white leading-none">การมอบหมายงานสอน</h1>
                                <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-wider">กำหนดวิชาสอน ครูผู้สอน และสถานที่เรียนรายภาคเรียน</p>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
<<<<<<< HEAD
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/5 shadow-inner">
=======
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/5">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            <div className="flex items-center gap-2 border-r border-slate-200 dark:border-white/10 pr-3">
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">ปีการศึกษา</span>
                                <select 
                                    value={selectedYear} 
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="bg-transparent border-none text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-0 p-0 pr-4"
                                >
                                    {availableYears.length > 0 ? (
                                        availableYears.map(year => (
<<<<<<< HEAD
                                            <option key={year} value={year} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">{year}</option>
                                        ))
                                    ) : (
                                        <option value={selectedYear} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">{selectedYear || '—'}</option>
=======
                                            <option key={year} value={year} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{year}</option>
                                        ))
                                    ) : (
                                        <option value={selectedYear} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{selectedYear || '—'}</option>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    )}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 px-3">
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">ภาคเรียน</span>
                                <select 
                                    value={selectedSemester} 
                                    onChange={(e) => setSelectedSemester(e.target.value)}
                                    className="bg-transparent border-none text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-0 p-0 pr-4"
                                >
<<<<<<< HEAD
                                    <option value="1" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ภาคเรียนที่ 1</option>
                                    <option value="2" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ภาคเรียนที่ 2</option>
                                    <option value="0" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ทั้งปีการศึกษา (0)</option>
=======
                                    <option value="1" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">ภาคเรียนที่ 1</option>
                                    <option value="2" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">ภาคเรียนที่ 2</option>
                                    <option value="0" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">ทั้งปีการศึกษา (0)</option>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                </select>
                            </div>
                            <div className="flex items-center gap-2 px-3 border-l border-slate-200 dark:border-white/10">
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">ระดับชั้น</span>
                                <select 
                                    value={selectedLevel} 
                                    onChange={(e) => setSelectedLevel(e.target.value)}
                                    className="bg-transparent border-none text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-0 p-0 pr-4"
                                >
<<<<<<< HEAD
                                    <option value="ทั้งหมด" className="bg-white dark:bg-[#161a27] font-bold">ทั้งหมด</option>
                                    <option value="m1" className="bg-white dark:bg-[#161a27] font-bold">ม.1</option>
                                    <option value="m2" className="bg-white dark:bg-[#161a27] font-bold">ม.2</option>
                                    <option value="m3" className="bg-white dark:bg-[#161a27] font-bold">ม.3</option>
                                    <option value="junior_high" className="bg-white dark:bg-[#161a27] font-bold">ม.ต้น</option>
                                    <option value="m4" className="bg-white dark:bg-[#161a27] font-bold">ม.4</option>
                                    <option value="m5" className="bg-white dark:bg-[#161a27] font-bold">ม.5</option>
                                    <option value="m6" className="bg-white dark:bg-[#161a27] font-bold">ม.6</option>
                                    <option value="senior_high" className="bg-white dark:bg-[#161a27] font-bold">ม.ปลาย</option>
=======
                                    <option value="ทั้งหมด" className="bg-white dark:bg-[#161a27]">ทั้งหมด</option>
                                    {(() => {
                                        const exp = schoolInfo?.opportunityExpansionLevel || "";
                                        
                                        // Standard levels in logical order
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

                                        // Parsing of "อ.1-ม.6"
                                        const start = exp.split('-')[0]?.trim();
                                        const end = exp.split('-')[1]?.trim();

                                        let startIndex = allPossible.findIndex(l => l.name === start);
                                        let endIndex = allPossible.findIndex(l => l.name === end);

                                        if (startIndex === -1) startIndex = 0;
                                        if (endIndex === -1) endIndex = allPossible.length - 1;

                                        // Extra logic: If the range ends at m3, include the 'ม.ต้น' group label
                                        if (endIndex < allPossible.length - 1 && allPossible[endIndex].id === 'm3') {
                                            endIndex += 1;
                                        }
                                        // If the range ends at m6, include the 'ม.ปลาย' group label
                                        if (endIndex < allPossible.length - 1 && allPossible[endIndex].id === 'm6') {
                                            endIndex += 1;
                                        }

                                        const filtered = allPossible.slice(startIndex, endIndex + 1);
                                        
                                        return filtered.map(l => <option key={l.id} value={l.id} className="bg-white dark:bg-[#161a27]">{l.name}</option>);
                                    })()}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                </select>
                            </div>
                        </div>
                        <button 
                            onClick={handleCommitAll}
                            disabled={!pendingQueue.length || isSaving}
<<<<<<< HEAD
                            className={`px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-white/5 disabled:text-slate-500 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 border border-white/10 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
=======
                            className={`px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {pendingQueue.length > 0 ? `บันทึกข้อมูลลงระบบ (${pendingQueue.length})` : 'ไม่มีรายการรอยืนยัน'}
                        </button>
                    </div>
                </header>

                {/* --- Main Content --- */}
                <main className="flex-1 p-3 flex gap-2 overflow-hidden h-full items-stretch">
                    
                    {/* --- BLOCK 1: Courses & Teachers --- */}
                    <div className="flex-[1.9] bg-white dark:bg-[#161a27] rounded-[1.5rem] border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl relative transition-all duration-300">
                        <div className="flex-1 flex overflow-hidden h-full">
                            
                            <div className="flex-[1.1] flex flex-col border-r border-slate-200 dark:border-white/5">
                                <PanelHeader title="รายวิชา" icon={BookOpen} count={filteredCourses.length} compact />
<<<<<<< HEAD
                                    <div className="space-y-2 p-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative group">
                                                <select 
                                                    value={subjectGroupFilter} 
                                                    onChange={e=>setSubjectGroupFilter(e.target.value)} 
                                                    className="w-full pl-3 pr-10 py-2 bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-white appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm group-hover:border-indigo-500/30"
                                                >
                                                    {subjectGroups.map(g => (
                                                        <option key={g} value={g} className="bg-white dark:bg-[#161a27]">
                                                            {g === "กลุ่มวิชา ทั้งหมด" ? "ทุกกลุ่มสาระ" : g.replace('กลุ่มวิชา ', '')}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                    <ChevronDown size={14} />
                                                </div>
                                            </div>

                                            <div className="relative group">
                                                <select 
                                                    value={categoryFilter} 
                                                    onChange={e=>setCategoryFilter(e.target.value)} 
                                                    className="w-full pl-3 pr-10 py-2 bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-white appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm group-hover:border-indigo-500/30"
                                                >
                                                    <option value="ทั้งหมด" className="bg-white dark:bg-[#161a27]">ทุกประเภทวิชา</option>
                                                    <option value="พื้นฐาน" className="bg-white dark:bg-[#161a27]">พื้นฐาน</option>
                                                    <option value="เพิ่มเติม" className="bg-white dark:bg-[#161a27]">เพิ่มเติม</option>
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                    <ChevronDown size={14} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative group">
                                                <select 
                                                    value={selectedLevel} 
                                                    onChange={e=>setSelectedLevel(e.target.value)}
                                                    className="w-full pl-3 pr-8 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-bold text-slate-700 dark:text-white appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm group-hover:border-indigo-500/30"
                                                >
                                                    <option value="ทั้งหมด" className="bg-white dark:bg-[#161a27]">ทั้งหมด</option>
                                                    <option value="m1" className="bg-white dark:bg-[#161a27]">ม.1</option>
                                                    <option value="m2" className="bg-white dark:bg-[#161a27]">ม.2</option>
                                                    <option value="m3" className="bg-white dark:bg-[#161a27]">ม.3</option>
                                                    <option value="junior_high" className="bg-white dark:bg-[#161a27]">ม.ต้น</option>
                                                    <option value="m4" className="bg-white dark:bg-[#161a27]">ม.4</option>
                                                    <option value="m5" className="bg-white dark:bg-[#161a27]">ม.5</option>
                                                    <option value="m6" className="bg-white dark:bg-[#161a27]">ม.6</option>
                                                    <option value="senior_high" className="bg-white dark:bg-[#161a27]">ม.ปลาย</option>
                                                </select>
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-indigo-500 transition-colors">
                                                    <ChevronDown size={12} />
                                                </div>
                                            </div>
                                            <div className="relative group">
                                                <select 
                                                    value={selectedSemester} 
                                                    onChange={e=>setSelectedSemester(e.target.value)}
                                                    className="w-full pl-3 pr-8 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-bold text-slate-700 dark:text-white appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm group-hover:border-indigo-500/30"
                                                >
                                                    <option value="0" className="bg-white dark:bg-[#161a27]">ทุกภาคเรียน</option>
                                                    <option value="1" className="bg-white dark:bg-[#161a27]">ภาคเรียน 1</option>
                                                    <option value="2" className="bg-white dark:bg-[#161a27]">ภาคเรียน 2</option>
                                                </select>
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-indigo-500 transition-colors">
                                                    <ChevronDown size={12} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative group">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors" size={14} />
                                                <input 
                                                    type="text" 
                                                    placeholder="ค้นหารหัส หรือชื่อวิชา..." 
                                                    value={courseSearch} 
                                                    onChange={e=>setCourseSearch(e.target.value)} 
                                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white transition-all shadow-inner" 
                                                />
                                            </div>
                                            <button 
                                                onClick={() => setShowOnlyAssigned(!showOnlyAssigned)}
                                                className={`flex items-center justify-center gap-2 py-2 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-wide shadow-sm ${showOnlyAssigned ? 'bg-indigo-600 border-indigo-500 text-white shadow-indigo-600/20' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500'}`}
                                            >
                                                <Check size={12} className={showOnlyAssigned ? 'opacity-100' : 'opacity-30'} />
                                                {showOnlyAssigned ? 'มอบหมายแล้ว' : 'ยังไม่มอบหมาย'}
                                            </button>
                                        </div>
                                    </div>
=======
                                <div className="p-1.5 space-y-1">
                                    <div className="grid grid-cols-2 gap-1">
                                        <div className="relative">
                                            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={8} />
                                            <input type="text" placeholder="ค้นหา..." value={courseSearch} onChange={e=>setCourseSearch(e.target.value)} className="w-full pl-5 pr-1 py-1 bg-slate-100 dark:bg-white/5 rounded border border-slate-200 dark:border-white/5 text-[9px] outline-none focus:border-indigo-500/30 text-slate-900 dark:text-white" />
                                        </div>
                                        <div className="relative">
                                            <School className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={8} />
                                            <select value={subjectGroupFilter} onChange={e=>setSubjectGroupFilter(e.target.value)} className="w-full pl-5 pr-1 py-1 bg-slate-100 dark:bg-white/5 rounded border border-slate-200 dark:border-white/5 text-[9px] font-bold outline-none text-slate-700 dark:text-white appearance-none cursor-pointer">
                                                {subjectGroups.map(g => <option key={g} value={g} className="bg-white dark:bg-[#161a27]">{g.replace('กลุ่มวิชา ', '')}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        <div className="relative">
                                            <Filter className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={8} />
                                            <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="w-full pl-5 pr-1 py-1 bg-slate-100 dark:bg-white/5 rounded border border-slate-200 dark:border-white/5 text-[9px] font-bold outline-none text-slate-700 dark:text-white appearance-none cursor-pointer">
                                                <option className="bg-white dark:bg-[#161a27]">ประเภท</option>
                                                <option className="bg-white dark:bg-[#161a27]">พื้นฐาน</option>
                                                <option className="bg-white dark:bg-[#161a27]">เพิ่มเติม</option>
                                            </select>
                                        </div>
                                        <button 
                                            onClick={() => setShowOnlyAssigned(!showOnlyAssigned)}
                                            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border transition-all ${showOnlyAssigned ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-500'}`}
                                        >
                                            <Check size={10} className={showOnlyAssigned ? 'opacity-100' : 'opacity-30'} />
                                            <span className="text-[9px] font-black uppercase tracking-tight">
                                                {showOnlyAssigned ? 'วิชาที่มอบหมายแล้ว' : 'วิชาที่ยังไม่มอบหมาย'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-0.5">
                                    {(() => {
                                        let lastGroup = '';
                                        return paginatedCourses.map(course => {
                                            const isSel = selectedCourses.some(c => c.id === course.id);
                                            const courseGroup = (course as any).subjectGroup || '';
                                            const showHeader = courseGroup !== lastGroup;
                                            if (showHeader) lastGroup = courseGroup;
                                            const groupInfo = subjectGroupsList.find(g => g.name === courseGroup);
                                            const groupCode = groupInfo?.code || '?';
                                            return (
                                                <div key={course.id}>
<<<<<<< HEAD
=======
                                                    {showHeader && courseGroup && (
                                                        <div className="sticky top-0 z-10 bg-slate-100/90 dark:bg-[#1a1f30]/90 backdrop-blur-sm px-2 py-1.5 rounded-lg mt-1 mb-0.5 border-b border-slate-200 dark:border-white/5">
                                                            <span className="text-[9px] font-black text-indigo-500 dark:text-indigo-400">กลุ่มที่ {groupCode} : {courseGroup}</span>
                                                        </div>
                                                    )}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    <div 
                                                        onClick={() => {
                                                            setSelectedCourses(prev => {
                                                                const isAlreadySelected = prev.some(c => c.id === course.id);
                                                                if (isAlreadySelected) return prev.filter(c => c.id !== course.id);
<<<<<<< HEAD
                                                                const dbCount = course.teacherAssignments?.length || 0;
                                                                const qCount = pendingQueue.filter(p => p.courseId === course.id).length;
                                                                setActiveGroupNumber(dbCount + qCount + 1);
                                                                return [...prev, course];
                                                            });
                                                        }} 
                                                        className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-all border-b border-slate-100 dark:border-white/5 ${isSel ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : 'bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/[0.02]'}`}
                                                    >
                                                        {/* Radio Style Indicator */}
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSel ? 'border-indigo-500 bg-white dark:bg-slate-900' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                                            {isSel && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm" />}
                                                        </div>
                                                        
                                                        {/* Course Info */}
                                                        <div className="flex items-center gap-3 text-sm font-medium overflow-hidden">
                                                            <span className="text-slate-400 shrink-0 w-4 text-center">{course.semester || '0'}</span>
                                                            <span className="text-slate-900 dark:text-white font-black shrink-0">{course.code}</span>
                                                            <span className="text-slate-600 dark:text-slate-300 truncate font-bold">{course.title}</span>
                                                        </div>
=======
                                                                
                                                                // Auto-set next group number
                                                                const dbCount = course.teacherAssignments?.length || 0;
                                                                const qCount = pendingQueue.filter(p => p.courseId === course.id).length;
                                                                setActiveGroupNumber(dbCount + qCount + 1);
                                                                
                                                                return [...prev, course];
                                                            });
                                                        }} 
                                                        className={`p-2 rounded-lg cursor-pointer transition-all border ${isSel ? 'bg-indigo-600/10 dark:bg-indigo-600/20 border-indigo-500/30' : 'border-transparent hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                                    >
                                                        <div className="flex items-center justify-between gap-1 mb-1">
                                                            <div className="flex items-center gap-1">
                                                                {isSel && <div className="w-3.5 h-3.5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0"><Check size={8} className="text-white" /></div>}
                                                                <span className="text-[8px] font-black bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 block w-fit">{course.code}</span>
                                                                <span className="text-[8px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                                                    {course.credits !== undefined ? course.credits : (course.hoursPerWeek ? (course.hoursPerWeek / 2) : 0)} นก. ({course.hoursPerWeek || (course.credits ? Math.round(Number(course.credits) * 2) : 0)} คาบ)
                                                                </span>
                                                                {course.type && <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${course.type === 'พื้นฐาน' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-500'}`}>{course.type}</span>}
                                                                {course.classId && (
                                                                    <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                                        {getLevelLabel(course.classId)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                {(() => {
                                                                    const count = (course.teacherAssignments?.length || 0) + pendingQueue.filter(p => p.courseId === course.id).length;
                                                                    return count > 0 && (
                                                                        <span className="text-[7px] font-black px-1 py-0.5 rounded bg-blue-500 text-white shadow-sm">
                                                                            {count} กลุ่ม
                                                                        </span>
                                                                    );
                                                                })()}
                                                                <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded ${course.semester === 1 || course.semester === '1' ? 'text-blue-500 bg-blue-500/10' : course.semester === 2 || course.semester === '2' ? 'text-emerald-500 bg-emerald-500/10' : 'text-indigo-500 bg-indigo-500/10'}`}>
                                                                    {(course.semester === 0 || course.semester === '0') ? 'เทอม 1,2' : `เทอม ${course.semester}`}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <h4 className={`text-[10px] font-bold truncate ${isSel ? 'text-indigo-600 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>{course.title}</h4>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                                <Pagination currentPage={coursePage} totalPages={courseTotalPages} onPageChange={setCoursePage} />
                            </div>

<<<<<<< HEAD
                            <div className="w-16 flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20">
                                <div className="py-2 text-center border-b border-slate-200 dark:border-white/5 font-black text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">กลุ่ม</div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {Array.from({ length: 22 }, (_, i) => (
                                        <button 
                                            key={i+1} 
                                            onClick={() => setActiveGroupNumber(i+1)} 
                                            className={`w-full py-3 text-[11px] font-black transition-all border-b border-slate-100 dark:border-white/5 ${activeGroupNumber === i+1 ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                                        >
                                            {i+1}
                                        </button>
=======
                            <div className="w-16 flex flex-col border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/10">
                                <div className="py-2 text-center border-b border-slate-200 dark:border-white/5 font-black text-[9px] text-slate-400">กลุ่ม</div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {Array.from({ length: 22 }, (_, i) => (
                                        <button key={i+1} onClick={() => setActiveGroupNumber(i+1)} className={`w-full py-2.5 text-[11px] font-black ${activeGroupNumber === i+1 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-600'}`}>{i+1}</button>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    ))}
                                </div>
                            </div>

                            <div className="flex-[1.3] flex flex-col">
                                <PanelHeader title="ครู" icon={Users} count={filteredTeachers.length} compact />
                                <div className="p-2 space-y-1.5">
                                    <div className="relative">
                                        <School className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                        <select value={teacherGroupFilter} onChange={e=>setTeacherGroupFilter(e.target.value)} className="w-full pl-6 pr-1 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] font-bold outline-none border border-slate-200 dark:border-white/5 text-slate-700 dark:text-white transition-all focus:ring-2 focus:ring-indigo-500/20">
                                            <option value="ครู ทั้งหมด" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">ครู ทั้งหมด</option>
                                            {subjectGroupsList.map(g => <option key={g.id} value={g.name} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{g.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
<<<<<<< HEAD
                                        <input type="text" placeholder="ค้นชื่อ..." value={teacherSearch} onChange={e=>setTeacherSearch(e.target.value)} className="w-full pl-6 pr-2 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] outline-none border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white shadow-inner" />
=======
                                        <input type="text" placeholder="ค้นชื่อ..." value={teacherSearch} onChange={e=>setTeacherSearch(e.target.value)} className="w-full pl-6 pr-2 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] outline-none border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-0.5">
                                    {paginatedTeachers.map(teacher => (
<<<<<<< HEAD
                                        <div key={teacher.id} onClick={() => setSelectedTeacherId(prev => prev === teacher.id ? null : teacher.id)} className={`p-2 rounded-lg cursor-pointer flex items-center gap-3 border transition-all ${selectedTeacherId === teacher.id ? 'bg-blue-600/10 dark:bg-blue-600/20 border-blue-500/30' : 'border-transparent hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selectedTeacherId === teacher.id ? 'border-blue-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                                {selectedTeacherId === teacher.id && <div className="w-2 h-2 rounded-full bg-blue-500 animate-in zoom-in-50 duration-200" />}
                                            </div>
=======
                                        <div key={teacher.id} onClick={() => setSelectedTeacherId(prev => prev === teacher.id ? null : teacher.id)} className={`p-2 rounded-lg cursor-pointer flex items-center gap-3 border ${selectedTeacherId === teacher.id ? 'bg-blue-600/10 dark:bg-blue-600/20 border-blue-500/30' : 'border-transparent hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                                            {selectedTeacherId === teacher.id && <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0"><Check size={8} className="text-white" /></div>}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <span className={`text-[10px] font-black ${selectedTeacherId === teacher.id ? 'text-blue-600 dark:text-white' : 'text-slate-500'}`}>
                                                        {teacher.teacherId || "N/A"}
                                                    </span>
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${teacherLoadMap[teacher.id] > 20 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                        {teacherLoadMap[teacher.id] || 0} คาบ/สัปดาห์
                                                    </span>
                                                </div>
                                                <h4 className={`text-[11px] font-bold truncate ${selectedTeacherId === teacher.id ? 'text-blue-600 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>{teacher.name}</h4>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <Pagination currentPage={teacherPage} totalPages={teacherTotalPages} onPageChange={setTeacherPage} />
                            </div>
                        </div>

                    </div>

                    <div className="flex flex-col justify-center gap-3 px-0.5 shrink-0">
                        <FloatingButton 
                            icon={ChevronRight} 
                            color={assignButtonProps.color} 
                            onClick={handleAddToQueue} 
                            label={assignButtonProps.label}
                            disabled={assignButtonProps.disabled} 
                        />
                        <FloatingButton 
                            icon={middleButtonProps.icon} 
                            color={middleButtonProps.color}
                            onClick={() => {
                                if (middleButtonProps.action === 'update') handleUpdateTeacher();
<<<<<<< HEAD
=======
                                else if (middleButtonProps.action === 'bulkDelete') handleBulkRemoveAssignments();
                                else if (middleButtonProps.action === 'delete') handleRemoveAssignment(selectedAssignments[0].courseId, selectedAssignments[0].groupNumber);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                else handleResetSelections();
                            }}
                            label={middleButtonProps.label}
                        />
<<<<<<< HEAD
                        <FloatingButton 
                            icon={deleteButtonProps.icon} 
                            color={deleteButtonProps.color}
                            onClick={handleBulkRemoveAssignments}
                            label={deleteButtonProps.label}
                            disabled={deleteButtonProps.disabled}
                        />
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    </div>
                    <div className="flex-1 bg-white dark:bg-[#161a27] rounded-[1.5rem] border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl">
                        <PanelHeader title="วิชาที่มอบหมายแล้ว" icon={LayoutGrid} count={assignedCourses.length} />
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {assignedCourses.length || pendingQueue.length > 0 ? (
                                <>
                                    {pendingQueue.length > 0 && (
                                        <div className="mb-4">
                                            <div className="flex items-center gap-2 px-2 py-1 mb-2 bg-amber-500/10 rounded-lg">
                                                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                                <span className="text-[10px] font-black text-amber-600 uppercase">รอยืนยันการบันทึก ({pendingQueue.length})</span>
                                            </div>
                                            <div className="space-y-1">
                                                {pendingQueue.map((item, idx) => {
                                                    const isSelected = selectedAssignments.some(a => a.courseId === item.courseId && a.groupNumber === item.groupNumber && a.isPending);
                                                    return (
                                                        <div key={`pending-${idx}`}
                                                            onClick={() => {
                                                                setSelectedAssignments(prev => {
                                                                    const exists = prev.some(a => a.courseId === item.courseId && a.groupNumber === item.groupNumber && a.isPending);
                                                                    if (exists) return prev.filter(a => !(a.courseId === item.courseId && a.groupNumber === item.groupNumber && a.isPending));
                                                                    setSelectedTeacherId(item.teacherId);
                                                                    if (item.roomIds.length > 0) setSelectedRoomId(item.roomIds[0]);
                                                                    return [...prev, { courseId: item.courseId, groupNumber: item.groupNumber, isPending: true }];
                                                                });
                                                            }}
                                                            className={`ml-3 px-2 py-1.5 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${isSelected ? 'bg-amber-500/20 border-amber-500/40' : 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-500/10 hover:bg-amber-100/50'}`}
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
<<<<<<< HEAD
                                                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-all ${isSelected ? 'border-amber-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-amber-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-in zoom-in-50 duration-200" />}
=======
                                                                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border transition-all ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-amber-300 dark:border-white/10'}`}>
                                                                    {isSelected && <Check size={7} className="text-white" />}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-[9px] font-black text-slate-800 dark:text-white leading-tight">
                                                                        <span className="text-amber-600 mr-1">[{item.code}]</span>
                                                                        {item.title}
                                                                    </p>
                                                                    <p className="text-[7px] font-bold text-slate-500">
                                                                        ครู: {teacherMap?.[item.teacherId]?.name || "ไม่ระบุ"} | ห้อง: {item.roomIds.map(rid => rooms.find(r => r.id === rid)?.roomCode).join(', ') || "ยังไม่ระบุ"}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button onClick={(e) => { e.stopPropagation(); setPendingQueue(prev => prev.filter((_, i) => i !== idx)); }} className="p-0.5 text-slate-400 hover:text-red-500"><Trash2 size={11} /></button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
<<<<<<< HEAD
                                            <div className="h-px bg-slate-200 dark:bg-white/5 my-4" />
=======
                                            <div className="h-px bg-slate-200 dark:border-white/5 my-4" />
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                        </div>
                                    )}

                                    {paginatedAssignedCourses.map(course => (
                                        <div key={course.id} className="group/course">
                                            <div 
                                                onClick={() => {
                                                    const dbGroups = course.teacherAssignments || [];
                                                    const queueGroups = pendingQueue.filter(p => p.courseId === course.id);
                                                    
                                                    // Check if all (saved and pending) are selected
<<<<<<< HEAD
                                                    const areSavedSelected = dbGroups.every((g: GroupAssignment) => selectedAssignments.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && !a.isPending));
=======
                                                    const areSavedSelected = dbGroups.every(g => selectedAssignments.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && !a.isPending));
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    const arePendingSelected = queueGroups.every(g => selectedAssignments.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && a.isPending));
                                                    
                                                    if (areSavedSelected && arePendingSelected) {
                                                        // Deselect all for this course
                                                        setSelectedAssignments(prev => prev.filter(a => a.courseId !== course.id));
                                                    } else {
                                                        // Select all
                                                        const newSelection = [...selectedAssignments];
                                                        
<<<<<<< HEAD
                                                        dbGroups.forEach((g: GroupAssignment) => {
=======
                                                        dbGroups.forEach(g => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                            if (!newSelection.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && !a.isPending)) {
                                                                newSelection.push({ courseId: course.id, groupNumber: g.groupNumber });
                                                            }
                                                        });
                                                        
                                                        queueGroups.forEach(g => {
                                                            if (!newSelection.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && a.isPending)) {
                                                                newSelection.push({ courseId: course.id, groupNumber: g.groupNumber, isPending: true });
                                                            }
                                                        });
                                                        
                                                        setSelectedAssignments(newSelection);
                                                    }
                                                }}
                                                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg sticky top-0 z-10 bg-white dark:bg-[#161a27] hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-indigo-500/20 ${selectedAssignments.some(a => a.courseId === course.id) ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : ''}`}
                                            >
<<<<<<< HEAD
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
=======
                                                <div className={`w-3 h-3 rounded flex items-center justify-center border transition-all ${
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    (() => {
                                                        const dbGroups = course.teacherAssignments || [];
                                                        const queueGroups = pendingQueue.filter(p => p.courseId === course.id);
                                                        const total = dbGroups.length + queueGroups.length;
                                                        if (total === 0) return false;
<<<<<<< HEAD
                                                        const selectedCount = selectedAssignments.filter(a => a.courseId === course.id).length;
                                                        return selectedCount === total;
                                                    })() ? 'border-indigo-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'
=======
                                                        const selected = selectedAssignments.filter(a => a.courseId === course.id).length;
                                                        return selected === total;
                                                    })() ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-white/10'
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                }`}>
                                                    {(() => {
                                                        const dbGroups = course.teacherAssignments || [];
                                                        const queueGroups = pendingQueue.filter(p => p.courseId === course.id);
                                                        const total = dbGroups.length + queueGroups.length;
                                                        if (total === 0) return false;
<<<<<<< HEAD
                                                        const selectedCount = selectedAssignments.filter(a => a.courseId === course.id).length;
                                                        return selectedCount === total;
                                                    })() && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-in zoom-in-50 duration-200" />}
                                                </div>
                                                <div className="flex items-center gap-3 text-sm font-bold truncate">
                                                    <span className="text-slate-400 shrink-0 w-4 text-center">{course.semester || '0'}</span>
                                                    <span className="text-slate-900 dark:text-white font-black shrink-0">{course.code}</span>
                                                    <span className="text-slate-600 dark:text-slate-200 truncate">{course.title}</span>
                                                </div>
                                                <span className="text-[7px] font-black text-slate-400 dark:text-slate-500 shrink-0 ml-auto">
                                                    {(() => {
                                                        const dbLen = course.teacherAssignments?.length || 0;
                                                        const qLen = pendingQueue.filter(p => p.courseId === course.id).length;
                                                        return `${dbLen + qLen} กลุ่ม`;
                                                    })()}
                                                </span>
                                            </div>
                                            {course.teacherAssignments?.sort((a: any, b: any) => a.groupNumber - b.groupNumber).map((assign: GroupAssignment, idx: number) => {
=======
                                                        const selected = selectedAssignments.filter(a => a.courseId === course.id).length;
                                                        return selected === total;
                                                    })() && <Check size={6} className="text-white" />}
                                                </div>
                                                <BookOpen size={9} className="text-indigo-400 shrink-0" />
                                                <span className="text-[7px] font-black text-indigo-400 shrink-0">{course.code}</span>
                                                <span className="text-[8px] font-bold text-slate-600 dark:text-slate-300 truncate">{course.title}</span>
                                                <span className="text-[7px] font-bold text-slate-400 dark:text-slate-500 shrink-0 ml-auto">
                                                    {(() => {
                                                        const dbLen = course.teacherAssignments?.length || 0;
                                                        const qLen = pendingQueue.filter(p => p.courseId === course.id).length;
                                                        return dbLen + qLen;
                                                    })()}
                                                </span>
                                            </div>
                                            {course.teacherAssignments?.sort((a,b) => a.groupNumber - b.groupNumber).map((assign, idx) => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                const isSelected = selectedAssignments.some(a => a.courseId === course.id && a.groupNumber === assign.groupNumber && !a.isPending);
                                                return (
                                                    <div key={idx}
                                                        onClick={() => {
                                                            setSelectedAssignments(prev => {
                                                                const exists = prev.some(a => a.courseId === course.id && a.groupNumber === assign.groupNumber && !a.isPending);
                                                                if (exists) {
                                                                    const newSelection = prev.filter(a => !(a.courseId === course.id && a.groupNumber === assign.groupNumber && !a.isPending));
                                                                    if (newSelection.length === 0) {
                                                                        setSelectedTeacherId(null);
                                                                        setSelectedRoomId(null);
                                                                    }
                                                                    return newSelection;
                                                                } else {
                                                                    setSelectedTeacherId(assign.teacherId);
                                                                    if (assign.roomIds && assign.roomIds.length > 0) {
                                                                        setSelectedRoomId(assign.roomIds[0]);
                                                                    }
                                                                    return [...prev, { courseId: course.id, groupNumber: assign.groupNumber }];
                                                                }
                                                            });
                                                        }}
<<<<<<< HEAD
                                                        className={`ml-3 px-2 py-1.5 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${isSelected ? 'bg-indigo-600/10 dark:bg-indigo-500/10 border-indigo-500/30 shadow-sm' : 'bg-slate-50/50 dark:bg-white/[0.03] border-slate-100 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/[0.06] shadow-sm hover:shadow-md'}`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'border-indigo-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-in zoom-in-50 duration-200" />}
=======
                                                        className={`ml-3 px-2 py-1.5 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${isSelected ? 'bg-indigo-600/10 dark:bg-indigo-500/10 border-indigo-500/30' : 'bg-slate-50 dark:bg-white/[0.03] border-transparent hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border transition-all ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-white/10'}`}>
                                                                {isSelected && <Check size={7} className="text-white" />}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className={`text-[9px] font-black leading-tight ${isSelected ? 'text-indigo-600 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                                                                    กลุ่ม {assign.groupNumber} : {(() => {
                                                                        const t = teacherMap?.[assign.teacherId] || Object.values(teacherMap || {}).find(u => u.teacherId === assign.teacherId);
                                                                        if (!t) return "ยังไม่ได้กำหนด";
                                                                        const cleanName = (name: string) => {
                                                                            if (!name) return '';
                                                                            return name.replace(/^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|ว่าที่\s?ร\.ต\.|ว่าที่ร้อยตรี|อาจารย์|อ\.|ครู)\s?/, '').trim();
                                                                        };
                                                                        const namePart = cleanName(t.firstName || (t.name ? t.name.split(' ')[0] : ''));
                                                                        return `ครู${namePart}`;
                                                                    })()}
                                                                </p>
                                                                <div className="flex flex-wrap gap-1 mt-1">
                                                                    {(() => {
                                                                        const label = getLevelLabel(course.classId as string);
                                                                        return label ? (
                                                                            <span className="text-[8px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">{label}</span>
                                                                        ) : null;
                                                                    })()}

                                                                    {assign.roomIds?.map((rid: string) => {
                                                                        const room = rooms.find(r => r.id === rid);
                                                                        return room ? (
                                                                            <span key={rid} className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">{room.roomCode} {room.roomName}</span>
                                                                        ) : (
                                                                            <span key={rid} className="text-[8px] font-bold text-rose-500 bg-rose-100 dark:bg-rose-500/10 px-1.5 py-0.5 rounded">ไม่พบ</span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveAssignment(course.id, assign.groupNumber); }} className="p-0.5 text-slate-400 hover:text-red-500 transition-all shrink-0"><Trash2 size={11} /></button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center opacity-10 py-20">
                                    <LayoutGrid size={40} className="text-slate-400" />
                                    <p className="text-[9px] font-black mt-2 text-slate-400">ยังไม่มีการมอบหมาย</p>
                                </div>
                            )}
                        </div>
                        <Pagination currentPage={assignmentPage} totalPages={assignmentTotalPages} onPageChange={setAssignmentPage} />
                    </div>

                    <div className="flex flex-col justify-center gap-3 px-0.5 shrink-0">
                        <FloatingButton 
                            icon={ChevronLeft} 
                            color={roomButtonProps.color}
                            onClick={() => {
                                if (!selectedRoomId) {
                                    Swal.fire({ icon: 'info', title: 'เลือกสถานที่ก่อน', text: 'กรุณาเลือกห้องเรียนจากรายการทางขวาสุด', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                                    return;
                                }
                                if (selectedAssignments.length === 0) {
                                    Swal.fire({ icon: 'info', title: 'เลือกวิชาที่มอบหมายก่อน', text: 'กรุณาเลือกวิชาที่ต้องการระบุสถานที่จากรายการ "รายวิชาที่มอบหมาย"', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
                                    return;
                                }
                                handleUpdateRoom();
                            }}
                            label={roomButtonProps.label}
                        />
                        <FloatingButton 
                            icon={ChevronRight} 
                            color="bg-rose-500"
                            onClick={() => {
                                if (selectedAssignments.length > 0) {
                                    handleClearRoomFromAssignment();
                                } else if (selectedRoomId) {
                                    setSelectedRoomId(null);
                                    Swal.fire({ icon: 'success', title: 'ยกเลิกการเลือกห้อง', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
                                } else {
                                    Swal.fire({ icon: 'info', title: 'ไม่มีรายการที่เลือก', text: 'กรุณาเลือกห้องหรือวิชาที่มอบหมายก่อน', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                                }
                            }}
                            label={selectedAssignments.length > 0 ? `ยกเลิกสถานที่ ${selectedAssignments.length} รายการ` : 'ยกเลิกการเลือก'}
                        />
                    </div>

                    <div className="flex-[0.7] bg-white dark:bg-[#161a27] rounded-[1.5rem] border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl">
                        <PanelHeader title="สถานที่เรียน" icon={MapPin} count={rooms.length} />
                        <div className="p-3 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5">
                            <div className="grid grid-cols-2 gap-2">
                                <select value={buildingFilter} onChange={e=>setBuildingFilter(e.target.value)} className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20">
                                    {buildings.map(b => <option key={b} value={b} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{b}</option>)}
                                </select>
<<<<<<< HEAD
                                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} /><input type="text" placeholder="ค้นห้อง..." value={roomSearch} onChange={e=>setRoomSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white dark:bg-white/5 rounded-xl text-[10px] font-bold outline-none border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white shadow-inner focus:ring-2 focus:ring-emerald-500/20 transition-all" /></div>
=======
                                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} /><input type="text" placeholder="ค้นห้อง..." value={roomSearch} onChange={e=>setRoomSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white dark:bg-white/5 rounded-xl text-[10px] font-bold outline-none border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></div>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1 space-y-1">
                            {paginatedRooms.map(room => (
                                <div key={room.id} onClick={() => setSelectedRoomId(prev => prev === room.id ? null : room.id)} className={`px-2.5 py-2 rounded-xl cursor-pointer transition-all border flex items-center gap-2 ${selectedRoomId === room.id ? 'bg-emerald-600/10 dark:bg-emerald-600/20 border-emerald-500/30' : 'border-transparent hover:bg-slate-100 dark:hover:bg-white/5'}`}>
<<<<<<< HEAD
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selectedRoomId === room.id ? 'border-emerald-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                        {selectedRoomId === room.id && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-in zoom-in-50 duration-200" />}
                                    </div>
=======
                                    {selectedRoomId === room.id && <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0"><Check size={8} className="text-white" /></div>}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${selectedRoomId === room.id ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{room.roomCode || "—"}</span>
                                    <h4 className={`text-[10px] font-black truncate flex-1 ${selectedRoomId === room.id ? 'text-emerald-600 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>{room.roomName}</h4>
                                    <span className="text-[7px] font-bold text-slate-400 dark:text-slate-500 shrink-0 text-right leading-tight">{room.building && `${room.building}`}{room.floor && ` ชั้น${room.floor}`}</span>
                                </div>
                            ))}
                        </div>
                        <Pagination currentPage={roomPage} totalPages={roomTotalPages} onPageChange={setRoomPage} />
                    </div>

                </main>

                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
                    .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
                    .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                `}</style>
            </div>
        </MainLayout>
    );
};

export default CourseAssignmentPage;
