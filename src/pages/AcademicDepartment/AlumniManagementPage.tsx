import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { firestore } from '@/firebase';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { fetchSchoolSettings } from '@/store/slices/schoolSettingsSlice';
import {
    FaGraduationCap, FaSearch, FaUserGraduate, FaInfoCircle, FaFilter, 
    FaUsers, FaHistory, FaUserTimes, FaExchangeAlt, FaFileAlt
} from 'react-icons/fa';
import { Home, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Swal from 'sweetalert2';
import Select from 'react-select';
import { CLASSES } from '@/utils/schoolUtils';
import { getStudentStatus, isArchivedStudent } from '@/utils/studentStatusUtils';

// Premium Dark mode styles for react-select
const selectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border)',
        boxShadow: state.isFocused ? '0 0 0 1px #6366f1' : 'none',
        '&:hover': {
            borderColor: state.isFocused ? '#6366f1' : 'var(--select-border-hover)'
        },
        padding: '2px',
        borderRadius: '1rem',
        fontSize: '0.875rem',
        minHeight: '48px'
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg)',
        border: '1px solid var(--select-border)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        borderRadius: '1.25rem',
        overflow: 'hidden',
        zIndex: 50,
        padding: '4px'
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected
            ? '#6366f1'
            : state.isFocused
                ? 'var(--select-option-hover)'
                : 'transparent',
        color: state.isSelected ? 'white' : 'var(--select-text)',
        borderRadius: '0.75rem',
        margin: '2px 0',
        cursor: 'pointer',
        fontSize: '0.875rem',
        '&:active': {
            backgroundColor: '#4f46e5'
        }
    }),
    singleValue: (base: any) => ({
        ...base,
        color: 'var(--select-text)',
        fontWeight: '600'
    }),
    placeholder: (base: any) => ({
        ...base,
        color: '#9ca3af',
        fontWeight: '500'
    })
};

interface Student {
    id: string;
    docId: string;
    schoolId: string;
    studentNumber: string;
    studentId: string;
    profileImageUrl?: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    roomNumber: string;
    status: string;
    graduationDetails?: {
        date?: string;
        certificateNo?: string;
        gpax?: string;
        remark?: string;
    };
    exitDetails?: {
        reason?: string;
        destinationSchool?: string;
        exitDate?: string;
    };
}

const AlumniManagementPage: React.FC = () => {
    const user = useSelector((state: RootState) => state.auth.user);
    const { availableClassOptions, currentAcademicYear, status: settingsStatus } = useSelector((state: RootState) => state.schoolSettings);
    const dispatch = useDispatch();
    const schoolId = user?.schoolId;

    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
    const [selectedRoom, setSelectedRoom] = useState<string>('');
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [isBulkReactivate, setIsBulkReactivate] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [reactivateStudent, setReactivateStudent] = useState<Student | null>(null);
    const [reactivateForm, setReactivateForm] = useState({
        academicYear: '',
        classLevel: '',
        room: '1',
    });
    const [calendarAcademicYears, setCalendarAcademicYears] = useState<string[]>([]);
    const [isReactivating, setIsReactivating] = useState(false);
    const itemsPerPage = 20;

    useEffect(() => {
        if (schoolId && settingsStatus === 'idle') {
            dispatch(fetchSchoolSettings(schoolId) as any);
        }
    }, [schoolId, settingsStatus, dispatch]);

    useEffect(() => {
        if (currentAcademicYear && !reactivateForm.academicYear) {
            setReactivateForm(prev => ({ ...prev, academicYear: currentAcademicYear }));
        }
    }, [currentAcademicYear, reactivateForm.academicYear]);

    useEffect(() => {
        const fetchCalendarAcademicYears = async () => {
            if (!schoolId) return;
            try {
                const calendarRef = collection(firestore, 'school-settings', schoolId, 'main_calendar');
                const snapshot = await getDocs(calendarRef);
                const years = snapshot.docs
                    .map(calendarDoc => {
                        const data = calendarDoc.data();
                        return String(data.academicYear || (calendarDoc.id !== 'default' ? calendarDoc.id : '') || '').trim();
                    })
                    .filter(year => /^\d{4}$/.test(year));
                const latestFiveYears = Array.from(new Set(years))
                    .sort((a, b) => Number(b) - Number(a))
                    .slice(0, 5);

                setCalendarAcademicYears(latestFiveYears);
            } catch (error) {
                console.error('Error fetching calendar academic years:', error);
            }
        };

        fetchCalendarAcademicYears();
    }, [schoolId]);

    const fetchStudents = async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const parentRef = collection(firestore, 'school-settings', schoolId, 'students');
            const snap = await getDocs(parentRef);
            const studentDocs: Student[] = snap.docs.map(doc => ({
                id: doc.data().studentId || doc.id,
                docId: doc.id,
                schoolId: doc.data().schoolId,
                studentNumber: doc.data().studentNumber || '-',
                studentId: doc.data().studentId || '-',
                profileImageUrl: doc.data().profileImageUrl || '',
                firstName: doc.data().firstName || '',
                lastName: doc.data().lastName || '',
                classLevel: doc.data().classLevel || '',
                roomNumber: doc.data().room || doc.data().roomNumber || '',
                status: getStudentStatus(doc.data()),
                graduationDetails: doc.data().graduationDetails,
                exitDetails: doc.data().exitDetails,
            })).filter(s => isArchivedStudent(s) && s.status !== 'รออนุมัติจบ' && s.status !== 'pending_graduation');
            setStudents(studentDocs);
        } catch (error) {
            console.error("Error fetching alumni:", error);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลศิษย์เก่าได้', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [schoolId]);

    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
            const sid = (s.studentId || '').toLowerCase();
            const sterm = searchTerm.toLowerCase().trim();
            const matchSearch = sterm === '' || fullName.includes(sterm) || sid.includes(sterm);

            const matchStatus = !statusFilter || s.status === statusFilter;
            const matchClass = !selectedClassLevel || s.classLevel === selectedClassLevel;
            const matchRoom = !selectedRoom || s.roomNumber === selectedRoom;

            return matchSearch && matchStatus && matchClass && matchRoom;
        }).sort((a, b) => {
            // Sort by graduation date if available
            const dateA = a.graduationDetails?.date || a.exitDetails?.exitDate || '0';
            const dateB = b.graduationDetails?.date || b.exitDetails?.exitDate || '0';
            return dateB.localeCompare(dateA);
        });
    }, [students, searchTerm, statusFilter, selectedClassLevel, selectedRoom]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, selectedClassLevel, selectedRoom]);

    // Pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

    const getClassKey = (classLevel: string) => {
        const normalized = String(classLevel || '').trim();
        return Object.entries(CLASSES).find(([key, label]) => key === normalized || label === normalized)?.[0] || normalized;
    };

    const getNextClassOption = (student: Student) => {
        const currentKey = getClassKey(student.classLevel);
        const currentIndex = availableClassOptions.findIndex(([key, label]) => key === currentKey || label === student.classLevel);
        if (currentIndex < 0) return null;
        return availableClassOptions[currentIndex + 1] || null;
    };

    const openReactivateModal = (student: Student) => {
        const nextClass = getNextClassOption(student);
        if (!nextClass && student.status === 'สำเร็จการศึกษา') {
            Swal.fire({
                icon: 'info',
                title: 'เป็นศิษย์เก่าถาวร',
                text: `${student.firstName} ${student.lastName} จบชั้นสูงสุดของโรงเรียนนี้แล้ว จึงไม่สามารถรับกลับเข้าเรียนต่อในระดับถัดไปได้`,
                confirmButtonColor: '#4f46e5',
                customClass: { popup: 'rounded-[2rem]' }
            });
            return;
        }

        setIsBulkReactivate(false);
        setReactivateStudent(student);
        setReactivateForm({
            academicYear: academicYearOptions[0] || currentAcademicYear || '',
            classLevel: nextClass?.[1] || '',
            room: student.roomNumber || '1',
        });
    };

    const openBulkReactivateModal = () => {
        const selectedList = students.filter(s => selectedStudentIds.includes(s.docId));
        const validList = selectedList.filter(s => {
            const nextClass = getNextClassOption(s);
            return !(!nextClass && s.status === 'สำเร็จการศึกษา');
        });

        if (validList.length === 0) {
            Swal.fire('แจ้งเตือน', 'นักเรียนที่เลือกทั้งหมดเป็นศิษย์เก่าถาวรหรือไม่สามารถรับเข้าเรียนต่อได้', 'warning');
            return;
        }

        if (validList.length < selectedList.length) {
            Swal.fire({
                title: 'พบนักเรียนบางคนเป็นศิษย์เก่าถาวร',
                text: `มีนักเรียน ${selectedList.length - validList.length} คนที่ไม่สามารถรับเข้าเรียนต่อได้ ระบบจะดำเนินการเฉพาะคนที่มีสิทธิ์เท่านั้น`,
                icon: 'info',
                confirmButtonColor: '#4f46e5',
                customClass: { popup: 'rounded-[2rem]' }
            });
        }

        setIsBulkReactivate(true);
        // Use the first valid student's next class as default
        const firstNextClass = getNextClassOption(validList[0]);
        setReactivateForm({
            academicYear: academicYearOptions[0] || currentAcademicYear || '',
            classLevel: firstNextClass?.[1] || '',
            room: validList[0].roomNumber || '1',
        });
        setReactivateStudent(validList[0]); // Just for UI name display in single mode, bulk uses validList
    };

    const toggleSelectAll = () => {
        if (selectedStudentIds.length === currentItems.length) {
            setSelectedStudentIds([]);
        } else {
            setSelectedStudentIds(currentItems.map(s => s.docId));
        }
    };

    const toggleSelectStudent = (docId: string) => {
        setSelectedStudentIds(prev => 
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const handleReactivateSubmit = async () => {
        if (!schoolId) return;
        
        const selectedList = isBulkReactivate 
            ? students.filter(s => selectedStudentIds.includes(s.docId)).filter(s => {
                const nextClass = getNextClassOption(s);
                return !(!nextClass && s.status === 'สำเร็จการศึกษา');
            })
            : reactivateStudent ? [reactivateStudent] : [];

        if (selectedList.length === 0) return;

        if (!reactivateForm.academicYear || !reactivateForm.classLevel || !reactivateForm.room) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกปีการศึกษา ระดับชั้น และห้องเรียน', 'warning');
            return;
        }

        const confirmText = isBulkReactivate 
            ? `นักเรียนที่เลือกจำนวน ${selectedList.length} คน จะกลับเป็นนักเรียนปัจจุบัน ชั้น ${reactivateForm.classLevel}/${reactivateForm.room} ปีการศึกษา ${reactivateForm.academicYear}`
            : `${selectedList[0].firstName} ${selectedList[0].lastName} จะกลับเป็นนักเรียนปัจจุบัน ชั้น ${reactivateForm.classLevel}/${reactivateForm.room} ปีการศึกษา ${reactivateForm.academicYear}`;

        const result = await Swal.fire({
            title: 'ยืนยันรับกลับเข้าเรียน?',
            text: confirmText,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            customClass: { popup: 'rounded-[2rem]' }
        });

        if (!result.isConfirmed) return;

        setIsReactivating(true);
        try {
            const batchSize = 10;
            for (let i = 0; i < selectedList.length; i += batchSize) {
                const chunk = selectedList.slice(i, i + batchSize);
                await Promise.all(chunk.map(async (student) => {
                    const studentRef = doc(firestore, 'school-settings', schoolId, 'students', student.docId);
                    return updateDoc(studentRef, {
                        classLevel: reactivateForm.classLevel,
                        room: reactivateForm.room,
                        roomNumber: reactivateForm.room,
                        status: 'กำลังศึกษาอยู่',
                        studentStatus: 'กำลังศึกษาอยู่',
                        reEnrollmentDetails: {
                            fromStatus: student.status,
                            fromClassLevel: student.classLevel,
                            fromRoom: student.roomNumber,
                            academicYear: reactivateForm.academicYear,
                            reactivatedAt: new Date().toISOString(),
                        },
                        updatedAt: new Date().toISOString()
                    });
                }));
            }

            setReactivateStudent(null);
            setSelectedStudentIds([]);
            Swal.fire('สำเร็จ', `ดำเนินการเรียบร้อยแล้ว (${selectedList.length} รายการ)`, 'success');
            fetchStudents();
        } catch (error) {
            console.error("Reactivate error:", error);
            Swal.fire('ผิดพลาด', 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
        } finally {
            setIsReactivating(false);
        }
    };

    const statusOptions = [
        { value: '', label: 'ทั้งหมด' },
        { value: 'สำเร็จการศึกษา', label: 'สำเร็จการศึกษา' },
        { value: 'ย้าย', label: 'ย้าย' },
        { value: 'ลาออก', label: 'ลาออก' },
        { value: 'จำหน่าย', label: 'จำหน่าย' },
        { value: 'จำหน่ายชื่อออก', label: 'จำหน่ายชื่อออก' },
        { value: 'รออนุมัติจบ', label: 'รออนุมัติจบ (จบหลังเพื่อน)' },
        { value: 'ซ้ำชั้น', label: 'ซ้ำชั้น' },
    ];

    const statusBadgeClass = (status: string) => {
        if (status === 'สำเร็จการศึกษา') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        if (['จำหน่ายชื่อออก', 'จำหน่าย', 'ลาออก'].includes(status)) return 'bg-red-500/20 text-red-400 border-red-500/30';
        if (status === 'ย้าย') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (status === 'รออนุมัติจบ') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    };

    const getExitReasonLabel = (status: string) => `เหตุผลที่${status === 'จำหน่ายชื่อออก' ? 'จำหน่าย' : status}`;

    const academicYearOptions = useMemo(() => {
        if (calendarAcademicYears.length > 0) return calendarAcademicYears;

        const current = Number(currentAcademicYear) || new Date().getFullYear() + 543;
        return Array.from({ length: 5 }, (_, idx) => String(current - idx));
    }, [calendarAcademicYears, currentAcademicYear]);

    const roomOptions = useMemo(() => Array.from({ length: 20 }, (_, i) => String(i + 1)), []);

    const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));
    useEffect(() => {
        const observer = new MutationObserver(() => setIsDarkMode(document.documentElement.classList.contains('dark')));
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    const darkVariables = {
        '--select-bg': isDarkMode ? '#232429' : '#ffffff',
        '--select-border': isDarkMode ? '#30323a' : '#e5e7eb',
        '--select-border-hover': isDarkMode ? '#4b5563' : '#d1d5db',
        '--select-menu-bg': isDarkMode ? '#1c1c24' : '#ffffff',
        '--select-option-hover': isDarkMode ? '#2a2b2f' : '#f3f4f6',
        '--select-text': isDarkMode ? '#f3f4f6' : '#111827',
    } as React.CSSProperties;

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white overflow-x-hidden" style={darkVariables}>
                <div className="w-full pl-12 pr-2 sm:pl-14 sm:pr-4 md:pl-16 md:pr-6 py-4 sm:py-6 lg:py-8">
                    <header className="mb-6 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                                <div className="flex items-center gap-4">
                                    <Link 
                                        to="/home"
                                        className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
                                    >
                                        <Home size={20} />
                                    </Link>
                                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ทำเนียบศิษย์เก่า</h1>
                                </div>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    แสดงและจัดการข้อมูลศิษย์เก่า นักเรียนย้าย ลาออก และจำหน่ายชื่อออก
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 p-4 bg-white dark:bg-[#2a2b2f]/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 backdrop-blur-sm">
                            <div className="relative flex-grow min-w-[240px] max-w-md">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaSearch className="text-gray-400 text-sm" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อ, รหัสนักเรียน..."
                                    className="pl-9 pr-4 py-2 w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs text-gray-900 dark:text-white"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={selectedClassLevel}
                                    onChange={(e) => setSelectedClassLevel(e.target.value)}
                                    className="pl-3 pr-8 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-900 dark:text-white"
                                >
                                    <option value="">ทุกชั้น</option>
                                    {availableClassOptions.map(([key, label]) => <option key={key} value={label}>{label}</option>)}
                                </select>
                                <select
                                    value={selectedRoom}
                                    onChange={(e) => setSelectedRoom(e.target.value)}
                                    className="pl-3 pr-8 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-900 dark:text-white"
                                >
                                    <option value="">ทุกห้อง</option>
                                    {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="pl-3 pr-8 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-900 dark:text-white"
                                >
                                    {statusOptions.map(opt => <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>

                             <div className="flex items-center gap-2 ml-auto px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 text-xs font-bold text-gray-600 dark:text-gray-300">
                                <FaHistory size={13} />
                                <span>{filteredStudents.length} / {students.length} รายชื่อ</span>
                            </div>

                            {selectedStudentIds.length > 0 && (
                                <button
                                    onClick={openBulkReactivateModal}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 text-xs font-bold"
                                >
                                    <FaExchangeAlt size={13} />
                                    <span>รับเข้าเรียนต่อที่เลือก ({selectedStudentIds.length})</span>
                                </button>
                            )}
                        </div>
                    </header>

                    <main>
                        <div className="bg-white dark:bg-[#2a2b2f]/60 rounded-2xl shadow-lg ring-1 ring-black/5 dark:ring-white/5 overflow-hidden">
                            <div className="table-responsive">
                                <table className="min-w-full divide-y divide-gray-700">
                                     <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
                                        <tr>
                                            <th className="py-3 px-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 w-10">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                                                    checked={selectedStudentIds.length === currentItems.length && currentItems.length > 0}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 w-12">ลำดับ</th>
                                            <th className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
                                            <th className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">รหัสนักเรียน</th>
                                            <th className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชั้น/ห้องล่าสุด</th>
                                            <th className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">สถานะ</th>
                                            <th className="hidden lg:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">รายละเอียด</th>
                                            <th className="py-3 pl-3 pr-4 sm:pr-6 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">ดำเนินการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
                                        {loading ? (
                                            <tr>
                                                <td colSpan={8} className="px-6 py-20 text-center">
                                                    <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                                    <p className="mt-4 text-sm font-bold text-gray-400 uppercase tracking-widest">กำลังโหลดข้อมูล...</p>
                                                </td>
                                            </tr>
                                        ) : currentItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-6 py-20 text-center">
                                                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                                        <FaSearch className="text-gray-400 dark:text-gray-500 text-2xl" />
                                                    </div>
                                                    <p className="text-gray-500 dark:text-gray-400 font-medium">ไม่พบข้อมูลศิษย์เก่า</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            currentItems.map((s, index) => (
                                                <tr key={s.docId} className={`hover:bg-gray-50 dark:hover:bg-[#2a2b2f]/50 transition-colors ${selectedStudentIds.includes(s.docId) ? 'bg-indigo-500/5 dark:bg-indigo-500/10' : ''}`}>
                                                    <td className="py-3 px-2 text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                                                            checked={selectedStudentIds.includes(s.docId)}
                                                            onChange={() => toggleSelectStudent(s.docId)}
                                                        />
                                                    </td>
                                                    <td className="whitespace-nowrap py-3 px-2 text-xs text-center font-medium text-gray-500 dark:text-gray-400">{indexOfFirstItem + index + 1}</td>
                                                    <td className="whitespace-nowrap py-3 px-2 text-xs">
                                                        <div className="flex items-center group">
                                                            <div className="h-8 w-8 flex-shrink-0">
                                                                <ProfileAvatar
                                                                    className="h-8 w-8"
                                                                    src={s.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(`${s.firstName || 'Student'} ${s.lastName || ''}`)}&background=random`}
                                                                    alt={`${s.firstName} ${s.lastName}`}
                                                                    loading="lazy"
                                                                    referrerPolicy="no-referrer"
                                                                />
                                                            </div>
                                                            <div className="ml-3">
                                                                <div className="font-medium text-gray-900 dark:text-gray-200">{s.firstName} {s.lastName}</div>
                                                                <div className="text-[10px] text-gray-400 dark:text-gray-500">NO: {s.studentNumber}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{s.studentId}</td>
                                                    <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{s.classLevel}/{s.roomNumber}</td>
                                                    <td className="whitespace-nowrap px-2 py-3 text-xs">
                                                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border ${statusBadgeClass(s.status)}`}>
                                                            {s.status}
                                                        </span>
                                                    </td>
                                                    <td className="hidden lg:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
	                                                        {s.status === 'สำเร็จการศึกษา'
	                                                            ? `จบเมื่อ: ${s.graduationDetails?.date || '-'} | GPAX: ${s.graduationDetails?.gpax || '-'}`
	                                                            : ['จำหน่ายชื่อออก', 'จำหน่าย', 'ลาออก', 'ย้าย'].includes(s.status)
	                                                                ? `วันที่ออก/ย้าย: ${s.exitDetails?.exitDate || '-'} | ${getExitReasonLabel(s.status)}: ${s.exitDetails?.reason || '-'}${s.exitDetails?.destinationSchool ? ` | ปลายทาง/หมายเหตุ: ${s.exitDetails.destinationSchool}` : ''}`
	                                                                : s.graduationDetails?.remark || '-'}
                                                    </td>
                                                    <td className="relative whitespace-nowrap py-3 pl-3 pr-4 text-right text-xs font-medium sm:pr-6">
                                                        {s.status === 'สำเร็จการศึกษา' && !getNextClassOption(s) ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold bg-gray-100 dark:bg-white/5 text-gray-400">
                                                                <FaUserGraduate size={11} /> ศิษย์เก่าถาวร
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => openReactivateModal(s)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all active:scale-95"
                                                                title="ย้ายกลับมาเป็นนักเรียนปัจจุบัน"
                                                            >
                                                                <FaExchangeAlt size={11} /> รับเข้าเรียนต่อ
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-gray-800">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredStudents.length)} จาก {filteredStudents.length} รายการ
                                        </div>
                                        <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-gray-50/50 dark:bg-black/20 rounded-xl border border-gray-200/50 dark:border-white/5">
                                            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1" title="หน้าแรก">
                                                <ChevronsLeft size={14} /><span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าแรก</span>
                                            </button>
                                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1" title="ย้อนกลับ">
                                                <ChevronLeft size={14} /><span className="hidden sm:inline text-[9px] uppercase tracking-wider">ย้อนกลับ</span>
                                            </button>
                                            <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                    const pageNum = totalPages > 5 ? Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i : i + 1;
                                                    return (
                                                        <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === pageNum ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-105' : 'hover:bg-white dark:hover:bg-white/5 text-gray-600 dark:text-gray-400'}`}>
                                                            {pageNum}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />
                                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1" title="ถัดไป">
                                                <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ถัดไป</span><ChevronRight size={14} />
                                            </button>
                                            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1" title="หน้าสุดท้าย">
                                                <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าสุดท้าย</span><ChevronsRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                </div>

                {reactivateStudent && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-gray-100 dark:border-white/5 bg-white dark:bg-[#1c1c24] shadow-2xl">
                            <div className="px-6 py-5 border-b border-gray-100 dark:border-white/5 flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white">รับนักเรียนกลับเข้าเรียนต่อ</h3>
                                    <p className="text-xs font-bold text-gray-400 mt-1">
                                        เลือกปีการศึกษา ระดับชั้น และห้องสำหรับย้ายจากศิษย์เก่ากลับเป็นนักเรียนปัจจุบัน
                                    </p>
                                </div>
                                <button
                                    onClick={() => setReactivateStudent(null)}
                                    className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-rose-500 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 p-4">
                                    {isBulkReactivate ? (
                                        <>
                                            <div className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                                                <FaUsers className="text-indigo-500" />
                                                รับเข้าเรียนต่อแบบกลุ่ม ({selectedStudentIds.length} รายการ)
                                            </div>
                                            <div className="mt-1 text-xs font-bold text-gray-400">
                                                นักเรียนที่เลือกทั้งหมดจะถูกย้ายกลับไปเป็นนักเรียนปัจจุบันในระดับชั้นที่กำหนด
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-sm font-black text-gray-900 dark:text-white">
                                                {reactivateStudent.firstName} {reactivateStudent.lastName}
                                            </div>
                                            <div className="mt-1 text-xs font-bold text-gray-400">
                                                รหัส {reactivateStudent.studentId} | ชั้นล่าสุด {reactivateStudent.classLevel}/{reactivateStudent.roomNumber} | สถานะ {reactivateStudent.status}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">ปีการศึกษาเข้าเรียนต่อ</label>
                                        <select
                                            value={reactivateForm.academicYear}
                                            onChange={(e) => setReactivateForm(prev => ({ ...prev, academicYear: e.target.value }))}
                                            className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#232429] border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                                        >
                                            <option value="">เลือกปีการศึกษา</option>
                                            {academicYearOptions.map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">ระดับชั้นใหม่</label>
                                        <select
                                            value={reactivateForm.classLevel}
                                            onChange={(e) => setReactivateForm(prev => ({ ...prev, classLevel: e.target.value }))}
                                            className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#232429] border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                                        >
                                            <option value="">เลือกชั้น</option>
                                            {availableClassOptions.map(([key, label]) => (
                                                <option key={key} value={label}>{label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">ห้องใหม่</label>
                                        <select
                                            value={reactivateForm.room}
                                            onChange={(e) => setReactivateForm(prev => ({ ...prev, room: e.target.value }))}
                                            className="w-full h-11 px-3 rounded-xl bg-white dark:bg-[#232429] border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                                        >
                                            {roomOptions.map(room => (
                                                <option key={room} value={room}>{room}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 p-4 text-xs font-bold text-indigo-700 dark:text-indigo-300 leading-relaxed">
                                    ถ้ากดยืนยัน ระบบจะเปลี่ยนสถานะเป็น “กำลังศึกษาอยู่” และย้ายข้อมูลออกจากหน้าศิษย์เก่าไปแสดงในรายชื่อนักเรียนปัจจุบัน
                                </div>
                            </div>

                            <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex flex-col sm:flex-row justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setReactivateStudent(null)}
                                    className="h-11 px-5 rounded-xl text-sm font-black text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="button"
                                    onClick={handleReactivateSubmit}
                                    disabled={isReactivating}
                                    className="h-11 px-6 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isReactivating ? 'กำลังบันทึก...' : 'ยืนยันรับเข้าเรียนต่อ'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Info Card */}
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20 p-5 flex flex-col md:flex-row gap-5 items-center md:items-start text-center md:text-left transition-all hover:shadow-md">
                    <div className="p-4 bg-blue-500 text-white rounded-2xl shadow-lg shadow-blue-500/20 shrink-0">
                        <FaInfoCircle size={24} />
                    </div>
                    <div className="space-y-1.5">
                        <h4 className="text-sm font-black text-blue-900 dark:text-blue-400 uppercase tracking-widest flex items-center justify-center md:justify-start gap-2">
                            ระบบเก็บรักษาประวัติศิษย์เก่า
                        </h4>
                        <p className="text-xs text-blue-800/80 dark:text-blue-200/60 font-medium leading-relaxed">
                            หน้าข้อมูลศิษย์เก่านี้จัดเก็บประวัตินักเรียนที่จบการศึกษา หรือถูกจำหน่ายชื่อออกไปแล้ว ข้อมูลเหล่านี้จะไม่แสดงในหน้า "ข้อมูลนักเรียนปัจจุบัน" เพื่อป้องกันความสับสน
                            หากนักเรียนมีการกลับมาเข้าเรียนใหม่ คุณสามารถใช้ปุ่ม <span className="font-bold text-indigo-600 dark:text-indigo-400 underline decoration-indigo-300">"RE-ACTIVATE"</span> เพื่อย้ายข้อมูลกลับเข้าสู่ระบบปัจจุบันได้ทันที
                        </p>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default AlumniManagementPage;
