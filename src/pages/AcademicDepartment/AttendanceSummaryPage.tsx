import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import {
    collection,
    query,
    where,
    getDocs,
    collectionGroup,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp
} from 'firebase/firestore';
import {
    BarChart3,
    Users,
    BookOpen,
    Search,
    Download,
    Filter,
    ArrowLeft,
    Clock,
    User,
    ChevronDown,
    AlertCircle,
    UserCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import BackButton from "@/components/Shared/BackButton";
import * as XLSX from 'xlsx';
import SkeletonLoader from '@/components/SkeletonLoader';
import Select from 'react-select';
import { CLASSES } from '@/utils/schoolUtils';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';

interface AttendanceRecord {
    studentId: string;
    subjectCode: string;
    subjectName: string;
    teacherId: string;
    teacherName: string;
    status: 'present' | 'absent' | 'late' | 'leave';
    date: any;
    academicYear: string;
    semester: string;
    className?: string; // Add className for room filtering
}

interface StudentStats {
    id: string; // UUID
    enrollId: string; // enrollment doc ID
    studentCode: string; // actual ID
    number: string; // class sequence
    name: string;
    teacherName: string;
    present: number;
    absent: number;
    late: number;
    leave: number;
    total: number;
    percentage: number;
    evaluation: 'มส.' | 'ปกติ';
    manualEvaluation?: 'มส.' | 'ปกติ' | null;
}

interface Course {
    id: string;
    code: string;
    title: string;
    teacherId?: string;
    teacherIds?: string[];
    teacherAssignments?: { teacherId: string; roomIds?: string[]; classLevels?: string[] }[];
    semester?: string;
    isActive?: boolean;
    classId?: string | string[];
    classLevels?: string[];
}

const SummaryCard = ({ title, value, unit, icon, color }: { title: string, value: string | number, unit?: string, icon: React.ReactNode, color: string }) => {
    const variants: Record<string, string> = {
        emerald: "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100/50 dark:border-emerald-500/20",
        blue: "text-blue-500 bg-blue-50 dark:bg-blue-500/10 border-blue-100/50 dark:border-blue-500/20",
        indigo: "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100/50 dark:border-indigo-500/20",
        rose: "text-rose-500 bg-rose-50 dark:bg-rose-500/10 border-rose-100/50 dark:border-rose-500/20",
    };

    return (
        <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md hover:-translate-y-0.5 group">
            <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-xl border ${variants[color] || variants.indigo} flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm`}>
                    {icon}
                </div>
                <div>
                    <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{title}</h3>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">{value}</span>
                        {unit && <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{unit}</span>}
                    </div>
                </div>
            </div>
            <div className="w-full h-1 bg-gray-50 dark:bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full opacity-50 ${color === 'emerald' ? 'bg-emerald-500' : color === 'blue' ? 'bg-blue-500' : color === 'rose' ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: '60%' }}></div>
            </div>
        </div>
    );
};

const AttendanceSummaryPage: React.FC = () => {
    const dispatch = useDispatch();
    const { user: currentUser, ACADEMIC_ACCESS, hasRole } = usePermissions();
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
    const schoolId = (currentUser as any)?.schoolId;

    const [loading, setLoading] = useState(false);
    const [academicYear, setAcademicYear] = useState<string>(() => sessionStorage.getItem('as_year') || '');
    const [semester, setSemester] = useState<string>(() => sessionStorage.getItem('as_semester') || '');
    const [selectedCourse, setSelectedCourse] = useState<any>(() => {
        const saved = sessionStorage.getItem('as_course');
        return saved ? JSON.parse(saved) : null;
    });
    const [selectedRoom, setSelectedRoom] = useState<any>(() => {
        const saved = sessionStorage.getItem('as_room');
        return saved ? JSON.parse(saved) : { value: 'all', label: 'ทุกห้องเรียน' };
    });
    const [searchTerm, setSearchTerm] = useState('');

    const [courses, setCourses] = useState<Course[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
    const [studentsInCourse, setStudentsInCourse] = useState<any[]>([]);
    const [selectedTeacher, setSelectedTeacher] = useState<any>(() => {
        const saved = sessionStorage.getItem('as_teacher');
        return saved ? JSON.parse(saved) : { value: 'all', label: 'ครูทุกคน' };
    });
    const [error, setError] = useState<string | null>(null);

    const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));

    // Persistent Storage Sync
    useEffect(() => {
        if (academicYear) sessionStorage.setItem('as_year', academicYear);
        if (semester) sessionStorage.setItem('as_semester', semester);
        if (selectedCourse) sessionStorage.setItem('as_course', JSON.stringify(selectedCourse));
        else sessionStorage.removeItem('as_course');
        if (selectedRoom) sessionStorage.setItem('as_room', JSON.stringify(selectedRoom));
        if (selectedTeacher) sessionStorage.setItem('as_teacher', JSON.stringify(selectedTeacher));
    }, [academicYear, semester, selectedCourse, selectedRoom, selectedTeacher]);

    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setIsDarkMode(document.documentElement.classList.contains('dark'));
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    const selectStyles = useMemo(() => ({
        control: (base: any, state: any) => ({
            ...base,
            backgroundColor: isDarkMode ? '#2a2b2f' : '#f8fafc',
            borderColor: state.isFocused ? '#6366f1' : isDarkMode ? '#374151' : '#e2e8f0',
            borderRadius: '0.75rem',
            padding: '2px 4px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: 'none',
            color: isDarkMode ? '#fff' : '#1e293b',
            '&:hover': { borderColor: '#6366f1' },
            transition: 'all 0.2s'
        }),
        menu: (base: any) => ({
            ...base,
            backgroundColor: isDarkMode ? '#1a1b1e' : '#fff',
            borderRadius: '1rem',
            zIndex: 50,
            border: isDarkMode ? '1px solid #374151' : '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            padding: '4px'
        }),
        option: (base: any, state: any) => ({
            ...base,
            backgroundColor: state.isSelected ? '#6366f1' : state.isFocused ? (isDarkMode ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)') : 'transparent',
            color: state.isSelected ? '#fff' : isDarkMode ? '#e2e8f0' : '#475569',
            cursor: 'pointer',
            padding: '8px 12px',
            fontSize: '13px',
            fontWeight: '600',
            borderRadius: '0.5rem',
            '&:active': { backgroundColor: '#6366f1', color: '#fff' }
        }),
        singleValue: (base: any) => ({
            ...base,
            color: isDarkMode ? '#fff' : '#1e293b',
        }),
        dropdownIndicator: (base: any) => ({
            ...base,
            color: isDarkMode ? '#4b5563' : '#94a3b8',
        })
    }), [isDarkMode]);

    const fetchSettings = async () => {
        if (!schoolId) return;
        try {
            const settingsRef = doc(db, 'school-settings', schoolId, 'main_calendar', 'default');
            const snap = await getDoc(settingsRef);
            if (snap.exists()) {
                const data = snap.data();
                setAcademicYear(data.academicYear || '2567');
                if (!semester) {
                    const today = new Date().toISOString().split('T')[0];
                    if (data.terms?.term2?.startDate && today >= data.terms.term2.startDate) {
                        setSemester('2');
                    } else {
                        setSemester('1');
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching settings:", error);
        }
    };

    const fetchCourses = async () => {
        if (!schoolId) return;
        try {
            const q = query(collection(db, 'school-settings', schoolId, 'courses'));
            const snap = await getDocs(q);
            const list = snap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    isActive: data.isActive ?? true
                } as any;
            });
            setCourses(list.filter(c => c.isActive).sort((a, b) => a.code.localeCompare(b.code)));
        } catch (error) {
            console.error("Error fetching courses:", error);
        }
    };

    const handleFetchData = async () => {
        if (!schoolId || !academicYear || !semester || !selectedCourse) return;
        setLoading(true);
        setError(null);
        try {
            const enrollRef = collection(db, 'school-settings', schoolId, 'enrollments');
            const enrollQ = query(
                enrollRef,
                where('courseCode', '==', selectedCourse.value),
                where('academicYear', '==', academicYear),
                where('semester', '==', semester)
            );
            const enrollSnap = await getDocs(enrollQ);
            const courseData = courses.find(c => c.code === selectedCourse.value);

            const enrollmentStudents = enrollSnap.docs.map(doc => {
                const d = doc.data();

                // Robust student number detection
                const getNo = (data: any) => {
                    const val = data.studentNumber ?? data.number ?? data.no ?? data.classNumber ?? data.class_number ?? data.sequence ?? data.rollNumber ?? data.index ?? data['เลขที่'] ?? data['เลขที่ในห้อง'] ?? '';
                    const sVal = String(val).trim();
                    return (sVal === 'undefined' || sVal === 'null' || sVal === '-' || sVal === '0') ? '' : sVal;
                };

                const studentNo = getNo(d);

                let tId = d.teacherId || '';

                // Try to find teacher from course assignments if missing in enrollment
                if (!tId && courseData) {
                    const room = String(d.room || '');
                    const assignment = (courseData.teacherAssignments as any[])?.find(a =>
                        a.roomIds?.map(String).includes(room) || a.classLevels?.includes(d.classLevel)
                    );
                    if (assignment) {
                        tId = assignment.teacherId;
                    } else if (courseData.teacherId) {
                        tId = courseData.teacherId;
                    }
                }

                return {
                    id: d.studentId, // Student document ID
                    enrollId: doc.id,
                    studentCode: d.studentCode || d.studentId || '',
                    name: d.studentName || d.name || '',
                    number: studentNo,
                    className: d.classLevel || '',
                    room: d.room || '',
                    teacherId: tId,
                    teacherName: d.teacherName || '', // Support pre-filled teacher name
                    manualEvaluation: d.manualEvaluation || null
                };
            });

            // 1. First Pass: Try to fill names from map to avoid lookup flickering
            enrollmentStudents.forEach(s => {
                if (s.teacherId && teacherMap[s.teacherId]) {
                    s.teacherName = teacherMap[s.teacherId].name;
                }
            });

            // 2. Second Pass: Deep Sync with Students collection to get the most accurate Roll Number
            // We use document IDs AND student codes to be extremely resilient
            const studentIds = enrollmentStudents.map(s => s.id);
            const studentCodes = enrollmentStudents
                .filter(s => s.studentCode && s.studentCode !== s.id)
                .map(s => s.studentCode);

            if (studentIds.length > 0) {
                try {
                    const batchSize = 30;
                    const studentsRef = collection(db, 'school-settings', schoolId, 'students');

                    // Fetch by Document ID
                    for (let i = 0; i < studentIds.length; i += batchSize) {
                        const batch = studentIds.slice(i, i + batchSize);
                        const sSnap = await getDocs(query(studentsRef, where('__name__', 'in', batch)));
                        sSnap.forEach(sDoc => {
                            const sData = sDoc.data();
                            const student = enrollmentStudents.find(s => s.id === sDoc.id);
                            if (student) {
                                const actualNo = sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '';
                                if (actualNo && String(actualNo).trim() !== '-' && String(actualNo).trim() !== '0') {
                                    student.number = String(actualNo).trim();
                                }
                                // Also sync name if enrollment name is missing
                                if (!student.name && sData.firstName) {
                                    student.name = `${sData.title || sData.prefix || ''}${sData.firstName} ${sData.lastName || ''}`;
                                }
                            }
                        });
                    }

                    // Fetch by Student Code (as a secondary fallback)
                    if (studentCodes.length > 0) {
                        for (let i = 0; i < studentCodes.length; i += batchSize) {
                            const batch = studentCodes.slice(i, i + batchSize);
                            const sSnap = await getDocs(query(studentsRef, where('studentId', 'in', batch)));
                            sSnap.forEach(sDoc => {
                                const sData = sDoc.data();
                                const student = enrollmentStudents.find(s => s.studentCode === sData.studentId);
                                if (student && (!student.number || student.number === '-')) {
                                    const actualNo = sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '';
                                    if (actualNo && String(actualNo).trim() !== '-' && String(actualNo).trim() !== '0') {
                                        student.number = String(actualNo).trim();
                                    }
                                }
                            });
                        }
                    }
                } catch (err) {
                    console.error("Error deep syncing student data:", err);
                }
            }

            setStudentsInCourse(enrollmentStudents);

            const attRef = collectionGroup(db, 'ClassroomAttendance');
            const q = query(
                attRef,
                where('schoolId', '==', schoolId),
                where('subjectCode', '==', selectedCourse.value),
                where('academicYear', '==', academicYear),
                where('semester', '==', semester)
            );

            const snap = await getDocs(q);
            const records: AttendanceRecord[] = snap.docs.map(doc => doc.data() as AttendanceRecord);
            setAttendanceRecords(records);

        } catch (err: any) {
            console.error("Error fetching data:", err);
            if (err.code === 'failed-precondition' || err.message?.includes('index')) {
                setError("ระบบต้องการการตั้งค่าดัชนี (Index) กรุณาคลิกลิงก์ใน Console เพื่อสร้าง Index");
            } else {
                setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (schoolId && teacherMapStatus === 'idle') {
            dispatch(fetchTeachersMap(schoolId) as any);
        }
        fetchSettings();
        fetchCourses();
    }, [schoolId, teacherMapStatus, dispatch]);

    useEffect(() => {
        handleFetchData();
    }, [schoolId, academicYear, semester, selectedCourse]);

    const teacherOptions = useMemo(() => {
        const allTeachers = Object.values(teacherMap || {});
        const sorted = allTeachers.sort((a: any, b: any) => a.name.localeCompare(b.name, 'th'));

        const options = sorted.map((t: any) => {
            const tId = t.teacherId || '';
            const tName = t.name || t.displayName || 'ไม่ระบุ';
            return {
                value: t.id,
                label: tId ? `[${tId}] ${tName}` : tName,
                uid: t.uid,
                teacherId: t.teacherId
            };
        });

        return [{ value: 'all', label: 'ครูทุกคน' }, ...options];
    }, [teacherMap]);

    const userPrivileges = useMemo(() => {
        const teacherProfiles = Object.values(teacherMap || {}).filter((t: any) => t.uid === currentUser?.uid);
        const teacherProfile = teacherProfiles[0] as any;
        const department = teacherProfile?.department;

        // Use standard academic access from hook + local school-specific designations
        const isAcademicByRole = hasRole(ACADEMIC_ACCESS);
        const isAcademicStaff = department === 'งานบริหารวิชาการ' || isAcademicByRole;
        const isHead = teacherProfile?.isHeadOfLearningArea || teacherProfile?.isHeadOfAssessment;
        const isAdmin = isAcademicByRole || (currentUser as any)?.position?.includes('วิชาการ');

        return {
            canSeeAll: isAdmin || isAcademicStaff || isHead,
            myTeacherIds: teacherProfiles.map((t: any) => t.id)
        };
    }, [currentUser, teacherMap, ACADEMIC_ACCESS, hasRole]);

    const studentSummary = useMemo(() => {
        const statsMap: Record<string, StudentStats> = {};
        const allTeachers = Object.values(teacherMap || {});
        studentsInCourse.forEach(s => {
            let mappedTeacher = teacherMap[s.teacherId] as any;
            if (!mappedTeacher && allTeachers.length > 0) {
                mappedTeacher = allTeachers.find((t: any) => t.uid === s.teacherId || t.teacherId === s.teacherId);
            }

            const teacherDisplayName = mappedTeacher?.name || mappedTeacher?.displayName || s.teacherName || 'ไม่ระบุ';

            statsMap[s.id] = {
                id: s.id,
                enrollId: s.enrollId,
                studentCode: s.studentCode || '-',
                name: s.name,
                number: s.number,
                teacherName: teacherDisplayName,
                present: 0,
                absent: 0,
                late: 0,
                leave: 0,
                total: 0,
                percentage: 0,
                evaluation: 'ปกติ',
                manualEvaluation: s.manualEvaluation
            };
        });

        attendanceRecords.forEach(rec => {
            if (statsMap[rec.studentId]) {
                const s = statsMap[rec.studentId];
                s.total++;
                if (rec.status === 'present') s.present++;
                else if (rec.status === 'absent') s.absent++;
                else if (rec.status === 'late') s.late++;
                else if (rec.status === 'leave') s.leave++;

                // Fallback for teacher name from attendance records if still missing
                if ((s.teacherName === 'ไม่ระบุ' || !s.teacherName) && rec.teacherName) {
                    s.teacherName = rec.teacherName;
                }
            }
        });

        Object.values(statsMap).forEach(s => {
            const attendedCount = s.present + s.late + s.leave;
            s.percentage = s.total > 0 ? Math.round((attendedCount / s.total) * 100) : 0;

            // เกณฑ์ มส. คือมาเรียนต่ำกว่า 80%
            const autoEval: 'มส.' | 'ปกติ' = s.percentage < 80 ? 'มส.' : 'ปกติ';

            // ใช้ค่าที่กำหนดเอง (manual) ถ้ามี ถ้าไม่มีใช้ตามระบบคำนวณ
            s.evaluation = s.manualEvaluation || autoEval;
        });

        let list = Object.values(statsMap);
        if (selectedRoom && selectedRoom.value !== 'all') {
            const filteredStudentIds = studentsInCourse
                .filter(s => String(s.room) === String(selectedRoom.value))
                .map(s => s.id);
            list = list.filter(item => filteredStudentIds.includes(item.id));
        }

        if (selectedTeacher && selectedTeacher.value !== 'all') {
            const tValue = selectedTeacher.value;
            const tUid = selectedTeacher.uid;
            const tIdAttr = selectedTeacher.teacherId;

            list = list.filter(item => {
                const s = studentsInCourse.find(st => st.id === item.id);
                if (!s) return false;
                const sid = s.teacherId;
                // Match by doc id, uid, or custom teacherId attribute
                return sid === tValue || (tUid && sid === tUid) || (tIdAttr && sid === tIdAttr);
            });
        }

        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            list = list.filter(s => s.name.toLowerCase().includes(lowSearch) || s.id.includes(lowSearch));
        }

        return list.sort((a, b) => {
            const numA = parseInt(a.number) || 999;
            const numB = parseInt(b.number) || 999;
            if (numA !== numB) return numA - numB;
            return a.name.localeCompare(b.name, 'th');
        });
    }, [attendanceRecords, studentsInCourse, selectedRoom, selectedTeacher, searchTerm, selectedCourse, teacherMap]);

    const courseOptions = useMemo(() => {
        const filtered = courses.filter(c => {
            const isAnnual = !c.semester || c.semester === '1-2' || c.semester === 'annual' || c.semester === 'ปีการศึกษา';
            const matchesSemester = isAnnual || !semester || c.semester === semester;
            if (!matchesSemester) return false;
            if (userPrivileges.canSeeAll) return true;
            const myIds = userPrivileges.myTeacherIds || [];
            if (myIds.length === 0) return false;
            const courseTeacherIds = new Set<string>();
            if (c.teacherId) courseTeacherIds.add(c.teacherId);
            if (c.teacherIds) (c.teacherIds as any[]).forEach((id: any) => courseTeacherIds.add(String(id)));
            if (c.teacherAssignments) {
                (c.teacherAssignments as any[]).forEach((a: any) => {
                    if (a.teacherId) courseTeacherIds.add(String(a.teacherId));
                });
            }
            return myIds.some((id: string) => courseTeacherIds.has(String(id)));
        });

        const options = filtered.map(c => ({ value: c.code, label: `${c.code} - ${c.title}` }));

        // Auto-select first course only if NOTHING is selected AND we have options
        if (options.length > 0 && !selectedCourse) {
            setSelectedCourse(options[0]);
        }
        // If current selection is no longer in options (e.g. filtered out by semester), but ONLY if options exist
        else if (selectedCourse && options.length > 0) {
            const isStillValid = options.some(opt => opt.value === selectedCourse.value);
            if (!isStillValid) setSelectedCourse(options[0]);
        }

        return options;
    }, [courses, userPrivileges, semester, selectedCourse]);

    const roomOptions = useMemo(() => {
        // สร้างรายการห้อง 1-20 เป็นค่าตั้งต้นตามความต้องการของผู้ใช้
        const fixedRooms = Array.from({ length: 20 }, (_, i) => String(i + 1));

        // ผสมกับรายการห้องที่มีอยู่ในข้อมูลจริง (ถ้ามีห้องที่มากกว่า 20)
        const activeRooms = new Set<string>();
        studentsInCourse.forEach(s => { if (s.room) activeRooms.add(String(s.room)); });

        const combinedRooms = new Set([...fixedRooms, ...Array.from(activeRooms)]);
        const sortedList = Array.from(combinedRooms).sort((a, b) => Number(a) - Number(b));

        return [
            { value: 'all', label: 'ทุกห้องเรียน' },
            ...sortedList.map(r => ({ value: r, label: `ห้อง ${r}` }))
        ];
    }, [studentsInCourse]);

    const totalCourseStats = useMemo(() => {
        const stats = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
        studentSummary.forEach(s => {
            stats.present += s.present;
            stats.absent += s.absent;
            stats.late += s.late;
            stats.leave += s.leave;
            stats.total += s.total;
        });
        return stats;
    }, [studentSummary]);

    const handleToggleStatus = async (studentId: string, enrollId: string, currentStatus: string) => {
        if (!schoolId || !enrollId) return;
        const newStatus = currentStatus === 'มส.' ? 'ปกติ' : 'มส.';
        try {
            const enrollRef = doc(db, 'school-settings', schoolId, 'enrollments', enrollId);
            await updateDoc(enrollRef, {
                manualEvaluation: newStatus,
                updatedAt: serverTimestamp()
            });
            setStudentsInCourse(prev => prev.map(s => s.id === studentId ? { ...s, manualEvaluation: newStatus } : s));
            Swal.fire({ title: 'สำเร็จ!', text: `เปลี่ยนสถานะเป็น ${newStatus} เรียบร้อยแล้ว`, icon: 'success', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
        } catch (err) {
            console.error("Error updating status:", err);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเปลี่ยนสถานะได้', 'error');
        }
    };

    const handleExport = () => {
        if (!selectedCourse) return;
        const exportData = studentSummary.map(s => ({
            'เลขที่': s.number,
            'รหัสนักเรียน': s.studentCode,
            'ชื่อ-นามสกุล': s.name,
            'ครูผู้สอน': s.teacherName,
            'มา (ครั้ง)': s.present,
            'สาย (ครั้ง)': s.late,
            'ลา (ครั้ง)': s.leave,
            'ขาด (ครั้ง)': s.absent,
            'รวมทั้งหมด (คาบ)': s.total,
            '% การมาเรียน': s.percentage + '%'
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Student Attendance");
        XLSX.writeFile(wb, `สรุปการมาเรียน_${selectedCourse.label}_${academicYear}_${semester}.xlsx`);
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-[#f8fafc] dark:bg-[#131417] transition-colors duration-500">
                {/* Simplified & Premium Header */}
                <div className="bg-white dark:bg-[#1a1b1e] border-b border-gray-200 dark:border-gray-800/50 py-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>

                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-baseline gap-4">
                            <div className="space-y-2">
                                <BackButton to="/academic-admin" className="mb-2" />
                                <div className="flex items-center gap-4 mt-2">
                                    <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                                        <BarChart3 size={24} />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                                            สรุปสถิติการมาเรียน
                                        </h1>
                                        <p className="text-gray-500 dark:text-gray-400 text-xs font-medium max-w-xl">
                                            รายงานสถิติแยกตามรายวิชาแบบละเอียด พร้อมการวิเคราะห์ มส. อัตโนมัติ
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <div className="flex flex-1 md:flex-none bg-gray-100/50 dark:bg-white/5 p-1 px-3 rounded-xl border border-gray-200 dark:border-gray-800 backdrop-blur-sm shadow-inner items-center">
                                    <div className="flex items-baseline gap-1 py-1">
                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">ปี</span>
                                        <span className="text-[12px] font-black text-gray-900 dark:text-white underline decoration-indigo-500/50 decoration-2 underline-offset-4">
                                            {academicYear || 'กำลังโหลด...'}
                                        </span>
                                    </div>
                                    <div className="w-[1.5px] h-3 bg-gray-200 dark:bg-gray-700 mx-4 my-auto"></div>
                                    <select
                                        className="bg-transparent border-none text-[12px] font-black focus:ring-0 dark:text-white px-1 py-0.5 cursor-pointer outline-none appearance-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                        value={semester}
                                        onChange={(e) => setSemester(e.target.value)}
                                    >
                                        <option value="1" className="dark:bg-[#1a1b1e]">เทอม 1</option>
                                        <option value="2" className="dark:bg-[#1a1b1e]">เทอม 2</option>
                                    </select>
                                </div>
                                <button onClick={handleExport} disabled={!selectedCourse || studentSummary.length === 0} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-slate-900 dark:bg-indigo-500 dark:hover:bg-white dark:hover:text-black text-white px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/10 transition-all font-black text-xs group">
                                    <Download size={14} className="group-hover:bounce" />
                                    <span>EXCEL</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative">
                    {/* Modern Filter Card */}
                    <div className="bg-white dark:bg-[#1a1b1e] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 items-end">
                            <div className="lg:col-span-4 space-y-1.5">
                                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <BookOpen size={12} /> เลือกรหัสรายวิชา
                                </span>
                                <Select options={courseOptions} value={selectedCourse} onChange={setSelectedCourse} placeholder="พิมพ์ค้นหาวรหัสวิชา..." styles={selectStyles} isClearable />
                            </div>
                            <div className="lg:col-span-2 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <Users size={12} /> ห้องเรียน
                                </span>
                                <Select options={roomOptions} value={selectedRoom} onChange={setSelectedRoom} styles={selectStyles} isSearchable={false} />
                            </div>
                            <div className="lg:col-span-3 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <User size={12} /> ครูผู้สอน
                                </span>
                                <Select options={teacherOptions} value={selectedTeacher} onChange={setSelectedTeacher} styles={selectStyles} isSearchable={true} placeholder="ค้นหาชื่อครู..." />
                            </div>
                            <div className="lg:col-span-3 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <Search size={12} /> ค้นหานักเรียน
                                </span>
                                <div className="relative group">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500" size={12} />
                                    <input type="text" placeholder="ระบุชื่อ หรือรหัสนักเรียน..." className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-100 dark:border-gray-800 focus:border-indigo-500/50 rounded-xl text-[13px] font-semibold transition-all outline-none text-gray-900 dark:text-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {!selectedCourse ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center bg-white dark:bg-[#1a1b1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500 rounded-full blur-[50px] opacity-10 animate-pulse"></div>
                                <div className="bg-gradient-to-tr from-indigo-500 to-violet-600 p-10 rounded-2xl shadow-xl relative z-10 transition-transform hover:rotate-3">
                                    <BookOpen size={64} className="text-white" />
                                </div>
                            </div>
                            <div className="mt-8 space-y-2 px-6">
                                <h3 className="text-2xl font-black text-gray-900 dark:text-white">พร้อมเริ่มการตรวจสอบแล้ว</h3>
                                <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-sm font-medium leading-relaxed">กรุณาเลือกรายวิชาด้านบนเพื่อเข้าถึงข้อมูลสถิติและการวิเคราะห์เชิงลึก</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Stats Overview */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <SummaryCard title="ค่าเฉลี่ยการมาเรียน" value={totalCourseStats.total > 0 ? (((totalCourseStats.present + totalCourseStats.late + totalCourseStats.leave) / totalCourseStats.total) * 100).toFixed(1) + "%" : "0%"} icon={<UserCheck size={20} />} color="emerald" />
                                <SummaryCard title="คาบเรียนที่บันทึก" value={Math.round(attendanceRecords.length / (studentsInCourse.length || 1))} icon={<Clock size={20} />} unit="คาบ" color="blue" />
                                <SummaryCard title="จำนวนนักเรียน" value={studentsInCourse.length} icon={<Users size={20} />} unit="คน" color="indigo" />
                                <SummaryCard title="รายการขาดเรียน" value={totalCourseStats.absent} icon={<AlertCircle size={20} />} unit="ครั้ง" color="rose" />
                            </div>

                            {error && (
                                <div className="bg-rose-50 border border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 p-4 rounded-xl flex items-center gap-3">
                                    <AlertCircle size={20} className="shrink-0" />
                                    <p className="font-bold text-sm">{error}</p>
                                </div>
                            )}

                            {/* Table Container */}
                            <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                                {loading ? (
                                    <div className="p-8 space-y-6">
                                        <div className="flex gap-4"><SkeletonLoader className="h-4 w-12 rounded-full" /><SkeletonLoader className="h-4 w-48 rounded-full" /></div>
                                        {[1, 2, 3, 4, 5].map(i => <SkeletonLoader key={i} className="h-12 w-full rounded-xl" />)}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-gray-800">
                                                    <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-12">เลขที่</th>
                                                    <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest min-w-[220px]">ข้อมูลนักเรียน</th>
                                                    <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">ครูผู้สอน</th>
                                                    <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-36">สถิติการมาเรียน</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-emerald-500 uppercase tracking-widest text-center w-14">สาย</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-blue-500 uppercase tracking-widest text-center w-14">ลา</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-rose-500 uppercase tracking-widest text-center w-14">ขาด</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-14">คาบ</th>
                                                    <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-28">ผลการประเมิน</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                                {studentSummary.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={9} className="py-20 text-center">
                                                            <div className="flex flex-col items-center gap-3 opacity-30">
                                                                <Users size={48} />
                                                                <p className="font-bold text-sm">ไม่พบข้อมูลนักเรียน</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : studentSummary.map((s, index) => {
                                                    const isMS = s.evaluation === 'มส.';
                                                    return (
                                                        <tr key={s.id} className="group hover:bg-gray-50/50 dark:hover:bg-indigo-500/[0.02] transition-colors">
                                                            <td className="px-4 py-4 text-center">
                                                                <span className="text-sm font-black text-gray-400 dark:text-gray-700 group-hover:text-indigo-600 transition-colors tabular-nums">{s.number || '-'}</span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isMS ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 shadow-sm' : 'bg-gray-100 dark:bg-white/5 text-gray-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-indigo-500/30'}`}>
                                                                        <User size={18} />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <p className={`text-[13px] font-bold truncate ${isMS ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>{s.name}</p>
                                                                            {isMS && <span className="shrink-0 bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm">มส.</span>}
                                                                        </div>
                                                                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-600 tracking-tight italic">Student ID: {s.studentCode}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-white/5 rounded-lg border border-transparent transition-all group-hover:bg-white dark:group-hover:bg-gray-800 group-hover:border-gray-100 dark:group-hover:border-gray-700">
                                                                    <div className="w-5 h-5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                                                                        <User size={10} />
                                                                    </div>
                                                                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 truncate max-w-[100px] leading-tight">{s.teacherName}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="space-y-1.5">
                                                                    <div className="flex justify-between items-baseline px-0.5">
                                                                        <span className={`text-[12px] font-black tabular-nums ${s.percentage < 80 ? 'text-rose-600' : 'text-emerald-600'}`}>{s.percentage}%</span>
                                                                        <span className="text-[10px] font-bold text-gray-400 tabular-nums tracking-tighter">{s.present + s.late + s.leave}/{s.total}</span>
                                                                    </div>
                                                                    <div className="w-full bg-gray-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                                                                        <div className={`h-full transition-all duration-1000 ease-out rounded-full ${s.percentage >= 80 ? 'bg-emerald-500' : s.percentage >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${s.percentage}%` }}></div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.late > 0 ? 'text-amber-500' : 'text-gray-200 dark:text-gray-800'}`}>{s.late}</span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.leave > 0 ? 'text-blue-500' : 'text-gray-200 dark:text-gray-800'}`}>{s.leave}</span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.absent > 0 ? 'text-rose-600' : 'text-gray-200 dark:text-gray-800'}`}>{s.absent}</span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center text-sm font-black text-gray-600 dark:text-gray-400 tabular-nums">
                                                                {s.total}
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <button
                                                                    onClick={() => handleToggleStatus(s.id, s.enrollId, s.evaluation)}
                                                                    className={`min-w-[70px] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${isMS
                                                                        ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20 hover:bg-rose-600 hover:text-white"
                                                                        : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-600 hover:text-white"}`}
                                                                >
                                                                    {s.evaluation}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
                @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
                .group-hover\\:bounce { animation: bounce 1s infinite; }
            `}} />
        </MainLayout>
    );
};

export default AttendanceSummaryPage;
