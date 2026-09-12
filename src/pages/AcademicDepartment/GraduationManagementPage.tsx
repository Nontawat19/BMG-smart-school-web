import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { firestore } from '@/firebase';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { fetchSchoolSettings } from '@/store/slices/schoolSettingsSlice';
import {
    FaGraduationCap, FaSearch, FaUserGraduate, FaCheckCircle,
    FaChevronRight, FaInfoCircle, FaFilter, FaUsers, FaArrowUp,
    FaSync, FaClock, FaUserMinus, FaIdCard, FaSortNumericDown,
    FaUserCheck, FaTimesCircle
} from 'react-icons/fa';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Swal from 'sweetalert2';
import Select from 'react-select';
import { CLASSES } from '@/utils/schoolUtils';
import { isActiveStudentStatus } from '@/utils/studentStatusUtils';
import { buildLineRegistrationResolvedUpdate, buildLineRegistrationReviewUpdate } from '@/utils/lineRegistrationUtils';
import { fetchFlaggedStudents } from '@/utils/remediationUtils';

const compactSelectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg, #ffffff)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border, #e5e7eb)',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
        '&:hover': {
            borderColor: state.isFocused ? '#6366f1' : 'var(--select-border-hover, #d1d5db)'
        },
        padding: '0 4px',
        borderRadius: '0.75rem',
        fontSize: '0.75rem',
        minHeight: '32px',
        height: '32px',
        transition: 'all 0.2s ease'
    }),
    valueContainer: (base: any) => ({ ...base, padding: '0 8px' }),
    indicatorsContainer: (base: any) => ({ ...base, height: '30px' }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        border: '1px solid var(--select-border, #e5e7eb)',
        borderRadius: '1rem',
        fontSize: '0.75rem',
        zIndex: 9999,
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden'
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected ? '#6366f1' : state.isFocused ? 'var(--select-option-hover, #f3f4f6)' : 'transparent',
        color: state.isSelected ? 'white' : 'var(--select-text, #1f2937)',
        padding: '8px 12px',
        cursor: 'pointer',
        fontWeight: '500',
        '&:active': { backgroundColor: '#4f46e5' }
    }),
    singleValue: (base: any) => ({ 
        ...base, 
        color: 'var(--select-text, #1f2937)', 
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    }),
    menuList: (base: any) => ({
        ...base,
        maxHeight: '600px', // เพิ่มความสูงให้เห็นครบทุกชั้นโดยไม่ต้องสกอร์
        padding: '4px'
    }),
    placeholder: (base: any) => ({ ...base, color: '#9ca3af' })
};

interface Student {
    id: string;
    docId: string;
    schoolId: string;
    studentNumber: string;
    studentId: string;
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

type TransitionType = 'promote' | 'repeat' | 'graduate' | 'pending_grad' | 'exit';

const GraduationManagementPage: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
    const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
    const [batchActionType, setBatchActionType] = useState<TransitionType>('promote');
    const [batchDetails] = useState({
        nextRoom: '',
        gradDate: new Date().toISOString().split('T')[0],
        certNo: '',
        gpax: '',
        remark: '',
        exitReason: '',
        destination: ''
    });

    const [individualActions, setIndividualActions] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 30;

    const { user } = useSelector((state: RootState) => state.auth);
    const { availableClassOptions, classKeys, status: settingsStatus } = useSelector((state: RootState) => state.schoolSettings);
    const dispatch = useDispatch();
    const schoolId = (user as any)?.schoolId;

    useEffect(() => {
        if (schoolId && settingsStatus === 'idle') {
            dispatch(fetchSchoolSettings(schoolId) as any);
        }
    }, [schoolId, settingsStatus, dispatch]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedClassLevel, selectedRoomNumber]);

    const classOptions = useMemo(() => {
        return availableClassOptions.map(([val, label]) => ({
            value: val,
            label: String(label).replace('มัธยมศึกษาปีที่', 'ม.')
        }));
    }, [availableClassOptions]);

    const roomOptions = useMemo(() => {
        return Array.from({ length: 20 }, (_, i) => ({ value: (i + 1).toString(), label: `${(i + 1)}` }));
    }, []);

    const fetchStudents = async () => {
        if (!schoolId) return;
        setLoading(true);
        setSelectedStudents(new Set());
        try {
            const parentRef = collection(firestore, 'school-settings', schoolId, 'students');
            const snap = await getDocs(parentRef);
            const studentDocs: Student[] = snap.docs.map(doc => ({
                id: doc.data().studentId || doc.id,
                docId: doc.id,
                schoolId: doc.data().schoolId,
                studentNumber: doc.data().studentNumber || doc.data().number || doc.data().no || '-',
                studentId: doc.data().studentId || '-',
                firstName: doc.data().firstName || '',
                lastName: doc.data().lastName || '',
                classLevel: doc.data().classLevel || '',
                roomNumber: doc.data().room || doc.data().roomNumber || '',
                status: doc.data().status || doc.data().studentStatus || 'กำลังศึกษาอยู่',
                graduationDetails: doc.data().graduationDetails || {}
            })).filter(s => {
                const sStatus = String(s.status).toLowerCase();
                const isPendingWithIssues = sStatus === 'รออนุมัติจบ' && s.graduationDetails?.remark === 'ติด 0, ร, มส';
                const isActive = isActiveStudentStatus(s.status) || sStatus === 'ซ้ำชั้น' || isPendingWithIssues;
                
                // 📌 Filter by configured levels
                const levelKey = Object.keys(CLASSES).find(k => k === s.classLevel.toLowerCase() || CLASSES[k as keyof typeof CLASSES] === s.classLevel);
                const isInRange = levelKey ? classKeys.includes(levelKey) : false;

                return isActive && isInRange;
            });
            setStudents(studentDocs);
        } catch (error) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักเรียนได้', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [schoolId]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedClassLevel, selectedRoomNumber]);

    const filteredStudents = useMemo(() => {
        const filtered = students.filter(s => {
            const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
            const sid = (s.studentId || '').toLowerCase();
            const sterm = searchTerm.toLowerCase().trim();
            const matchSearch = sterm === '' || fullName.includes(sterm) || sid.includes(sterm);

            const cleanClass = String(s.classLevel || '').trim();
            const matchClass = !selectedClassLevel ||
                cleanClass === selectedClassLevel ||
                cleanClass === CLASSES[selectedClassLevel as keyof typeof CLASSES];

            const cleanRoom = String(s.roomNumber || '').trim();
            const targetRoom = String(selectedRoomNumber || '').trim();
            const matchRoom = !selectedRoomNumber ||
                cleanRoom === targetRoom ||
                cleanRoom === targetRoom.padStart(2, '0') ||
                cleanRoom.endsWith('/' + targetRoom);

            return matchSearch && matchClass && matchRoom;
        });

        const getKey = (val: string) => {
            const cleanVal = String(val || "").trim();
            return Object.keys(CLASSES).find(k => k === cleanVal.toLowerCase() || CLASSES[k as keyof typeof CLASSES] === cleanVal) || cleanVal.toLowerCase();
        };

        const getNum = (val: string | number) => {
            const m = String(val).match(/\d+/);
            return m ? parseInt(m[0], 10) : 999999;
        };

        return [...filtered].sort((a, b) => {
            const indexA = classKeys.indexOf(getKey(a.classLevel));
            const indexB = classKeys.indexOf(getKey(b.classLevel));
            if (indexA !== indexB) return indexA - indexB;

            const roomA = parseInt(a.roomNumber) || 0;
            const roomB = parseInt(b.roomNumber) || 0;
            if (roomA !== roomB) return roomA - roomB;

            const numA = getNum(a.studentNumber);
            const numB = getNum(b.studentNumber);
            if (numA !== numB) return numA - numB;
            return (a.firstName || '').localeCompare(b.firstName || '', 'th');
        });
    }, [students, searchTerm, selectedClassLevel, selectedRoomNumber, classKeys]);

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentStudents = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

    const toggleStudent = (docId: string) => {
        const newSelected = new Set(selectedStudents);
        if (newSelected.has(docId)) newSelected.delete(docId);
        else newSelected.add(docId);
        setSelectedStudents(newSelected);
    };

    const toggleAll = () => {
        if (selectedStudents.size === filteredStudents.length && filteredStudents.length > 0) {
            setSelectedStudents(new Set());
        } else {
            setSelectedStudents(new Set(filteredStudents.map(s => s.docId)));
        }
    };

    const actionOptions = [
        { value: 'promote', label: 'เลื่อนชั้นเรียน (ปกติ)', icon: <FaArrowUp size={12} className="text-emerald-500" /> },
        { value: 'repeat', label: 'ซ้ำชั้นเรียน (สอบไม่ผ่าน)', icon: <FaSync size={12} className="text-orange-500" /> },
        { value: 'graduate', label: 'สำเร็จการศึกษา (รอดำเนินการ)', icon: <FaUserGraduate size={12} className="text-indigo-500" /> },
        { value: 'pending_grad', label: 'รออนุมัติจบ (ติด 0,ร,มส)', icon: <FaClock size={12} className="text-amber-500" /> },
        { value: 'exit', label: 'จำหน่ายชื่อ / ย้ายออก', icon: <FaUserMinus size={12} className="text-rose-500" /> },
    ];

    const filteredActionOptions = useMemo(() => {
        const isFinalYear = ['p6', 'm3', 'm6'].includes(selectedClassLevel.toLowerCase());
        if (!selectedClassLevel) return actionOptions;
        return actionOptions.filter(opt => isFinalYear ? opt.value !== 'promote' : opt.value !== 'graduate');
    }, [selectedClassLevel]);

    useEffect(() => {
        if (!selectedClassLevel) return;
        const isFinalYear = ['p6', 'm3', 'm6'].includes(selectedClassLevel.toLowerCase());
        const isCurrentActionValid = filteredActionOptions.some(opt => opt.value === batchActionType);
        if (!isCurrentActionValid) setBatchActionType(isFinalYear ? 'graduate' : 'promote');
    }, [selectedClassLevel, batchActionType, filteredActionOptions]);

    const handleSingleActionChange = (docId: string, action: string) => {
        setIndividualActions(prev => ({ ...prev, [docId]: action }));
    };

    // เช็คว่านักเรียนคนไหนใน docIds ยังติด 0/ร/มส/มผ ค้างอยู่จริง (ยังไม่ได้แก้ตัวสำเร็จ) ก่อนจะอนุมัติ
    // "สำเร็จการศึกษา" — ใช้ fetchFlaggedStudents ตัวเดียวกับที่หน้านักเรียน (MyGradeFlagsPage) ใช้เช็คผลตัวเอง
    // เพื่อไม่ให้มีตรรกะ "ยังติดผลอยู่ไหม" คนละชุดกันระหว่างสองหน้า — เดิมหน้านี้พึ่งพาให้เจ้าหน้าที่จำเองว่า
    // ต้องเลือก "รออนุมัติจบ (ติด 0,ร,มส)" แทน "สำเร็จการศึกษา" ด้วยตัวเอง ไม่มีการตรวจสอบอัตโนมัติเลย
    const findStudentsWithUnresolvedFlags = async (docIds: string[]) => {
        try {
            const rows = await fetchFlaggedStudents(schoolId!, {}, { studentIds: docIds });
            return rows.filter(r => r.flags.length > 0);
        } catch (err) {
            console.error('Error checking 0/ร/มส/มผ before graduation:', err);
            return []; // เช็คไม่สำเร็จ ปล่อยผ่านไปก่อน ดีกว่าบล็อกเจ้าหน้าที่ไม่ให้ทำงานได้เลยเพราะปัญหาเครือข่ายชั่วคราว
        }
    };

    // แสดงคำเตือนถ้ามีคนติดผลค้างอยู่ — ไม่บล็อกเด็ดขาด (เจ้าหน้าที่อาจรู้เหตุผลที่ต้องอนุมัติต่อจริงๆ) แต่ต้อง
    // กดยืนยันเพิ่มอีกครั้งเห็นรายชื่อ/วิชาที่ยังติดชัดๆ ก่อน คืน true ถ้าให้ไปต่อได้ (ไม่มีคนติด หรือกดยืนยันจะไปต่อ)
    const confirmProceedDespiteFlags = async (flaggedRows: Awaited<ReturnType<typeof findStudentsWithUnresolvedFlags>>) => {
        if (flaggedRows.length === 0) return true;
        const listHtml = flaggedRows.map(r => {
            const flagSummary = r.flags.map(f => `${f.courseTitle} (${f.grade})`).join(', ');
            return `<li><b>${r.name}</b> — ${flagSummary}</li>`;
        }).join('');
        const result = await Swal.fire({
            title: 'ยังติดผลการเรียนค้างอยู่',
            html: `นักเรียน ${flaggedRows.length} คนนี้ยังมีผลการเรียนติด 0/ร/มส/มผ ที่ยังไม่ได้แก้ตัวสำเร็จ:<ul style="text-align:left;margin-top:8px;">${listHtml}</ul>แนะนำให้เลือก "รออนุมัติจบ (ติด 0,ร,มส)" แทน หรือยืนยันอนุมัติจบต่อถ้าแน่ใจ`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันอนุมัติจบต่อ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#dc2626',
            customClass: { popup: 'rounded-[2rem]' }
        });
        return result.isConfirmed;
    };

    const handleSingleUpdate = async (student: Student) => {
        if (!schoolId) return;
        const action = individualActions[student.docId];
        if (!action) return;

        if (action === 'graduate') {
            const flaggedRows = await findStudentsWithUnresolvedFlags([student.docId]);
            const shouldProceed = await confirmProceedDespiteFlags(flaggedRows);
            if (!shouldProceed) return;
        }

        const actionLabel = actionOptions.find(o => o.value === action)?.label;
        const confirm = await Swal.fire({
            title: 'ยืนยันดำเนินการรายบุคคล?',
            text: `ดำเนินการ "${actionLabel}" สำหรับ ${student.firstName} ${student.lastName} ใช่หรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            customClass: { popup: 'rounded-[2rem]' }
        });

        if (!confirm.isConfirmed) return;

        setIsSubmitting(true);
        try {
            const studentRef = doc(firestore, 'school-settings', schoolId, 'students', student.docId);
            const currentClassKey = Object.keys(CLASSES).find(k => k === String(student.classLevel).toLowerCase() || CLASSES[k as keyof typeof CLASSES] === student.classLevel) || student.classLevel.toLowerCase();
            const currentIndex = classKeys.indexOf(currentClassKey);
            const nextClass = currentIndex < classKeys.length - 1 ? (CLASSES[classKeys[currentIndex + 1] as keyof typeof CLASSES] || classKeys[currentIndex + 1]) : student.classLevel;

            let updateData: any = { updatedAt: new Date().toISOString() };
            switch (action) {
                case 'promote': updateData = { ...updateData, classLevel: nextClass, status: 'กำลังศึกษาอยู่', studentStatus: 'กำลังศึกษาอยู่', ...buildLineRegistrationReviewUpdate({ fromClassLevel: student.classLevel, fromRoom: student.roomNumber, toClassLevel: nextClass, toRoom: student.roomNumber, reason: 'promotion' }) }; break;
                case 'repeat': updateData = { ...updateData, status: 'ซ้ำชั้น', studentStatus: 'ซ้ำชั้น' }; break;
                case 'graduate': updateData = { ...updateData, status: 'รออนุมัติจบ', studentStatus: 'รออนุมัติจบ', graduationDetails: { remark: 'สำเร็จการศึกษา (รอดำเนินการ)', date: new Date().toISOString().split('T')[0] }, ...buildLineRegistrationResolvedUpdate() }; break;
                case 'pending_grad': updateData = { ...updateData, status: 'รออนุมัติจบ', studentStatus: 'รออนุมัติจบ', graduationDetails: { remark: 'ติด 0, ร, มส' }, ...buildLineRegistrationResolvedUpdate() }; break;
                case 'exit': updateData = { ...updateData, status: 'จำหน่ายชื่อออก', studentStatus: 'จำหน่ายชื่อออก', ...buildLineRegistrationResolvedUpdate() }; break;
            }

            await updateDoc(studentRef, updateData);
            Swal.fire({ title: 'สำเร็จ!', icon: 'success', timer: 1500, showConfirmButton: false });
            fetchStudents();
            setIndividualActions(prev => { const newState = { ...prev }; delete newState[student.docId]; return newState; });
        } catch (error) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBatchTransition = async () => {
        if (!schoolId || selectedStudents.size === 0) return;

        if (batchActionType === 'graduate') {
            const flaggedRows = await findStudentsWithUnresolvedFlags(Array.from(selectedStudents));
            const shouldProceed = await confirmProceedDespiteFlags(flaggedRows);
            if (!shouldProceed) return;
        }

        const confirm = await Swal.fire({
            title: 'ยืนยันดำเนินการ?',
            text: `ปรับปรุงข้อมูลนักเรียน ${selectedStudents.size} คน`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันบันทึก'
        });

        if (!confirm.isConfirmed) return;
        setIsSubmitting(true);
        try {
            const promises = Array.from(selectedStudents).map(docId => {
                const s = students.find(item => item.docId === docId);
                if (!s) return Promise.resolve();
                const studentRef = doc(firestore, 'school-settings', schoolId, 'students', docId);
                const currentClassKey = Object.keys(CLASSES).find(k => k === String(s.classLevel).toLowerCase() || CLASSES[k as keyof typeof CLASSES] === s.classLevel) || s.classLevel.toLowerCase();
                const currentIndex = classKeys.indexOf(currentClassKey);
                const nextClass = currentIndex < classKeys.length - 1 ? (CLASSES[classKeys[currentIndex + 1] as keyof typeof CLASSES] || classKeys[currentIndex + 1]) : s.classLevel;

                let updateData: any = { updatedAt: new Date().toISOString() };
                switch (batchActionType) {
                    case 'promote': updateData = { ...updateData, classLevel: nextClass, room: batchDetails.nextRoom || s.roomNumber, roomNumber: batchDetails.nextRoom || s.roomNumber, status: 'กำลังศึกษาอยู่', studentStatus: 'กำลังศึกษาอยู่', ...buildLineRegistrationReviewUpdate({ fromClassLevel: s.classLevel, fromRoom: s.roomNumber, toClassLevel: nextClass, toRoom: batchDetails.nextRoom || s.roomNumber, reason: 'promotion' }) }; break;
                    case 'graduate': updateData = { ...updateData, status: 'รออนุมัติจบ', studentStatus: 'รออนุมัติจบ', graduationDetails: { date: batchDetails.gradDate }, ...buildLineRegistrationResolvedUpdate() }; break;
                    case 'exit': updateData = { ...updateData, status: 'จำหน่ายชื่อออก', studentStatus: 'จำหน่ายชื่อออก', ...buildLineRegistrationResolvedUpdate() }; break;
                }
                return updateDoc(studentRef, updateData);
            });
            await Promise.all(promises);
            Swal.fire({ title: 'สำเร็จ!', icon: 'success' });
            fetchStudents();
        } finally {
            setIsSubmitting(false);
        }
    };

    const [isDarkMode, setIsDarkMode] = useState(false);
    useEffect(() => {
        const checkDark = () => setIsDarkMode(document.documentElement.classList.contains('dark'));
        checkDark();
        const obs = new MutationObserver(checkDark);
        obs.observe(document.documentElement, { attributes: true });
        return () => obs.disconnect();
    }, []);

    const darkVariables = {
        '--select-bg': isDarkMode ? '#232429' : '#ffffff',
        '--select-border': isDarkMode ? '#30323a' : '#e5e7eb',
        '--select-menu-bg': isDarkMode ? '#1c1c24' : '#ffffff',
        '--select-text': isDarkMode ? '#f3f4f6' : '#111827',
    } as React.CSSProperties;

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50/50 dark:bg-[#0f1014] p-4 sm:p-6 space-y-4" style={darkVariables}>
                {/* Header Section */}
                <div className="bg-white dark:bg-[#1c1c24] border border-gray-100 dark:border-gray-800 rounded-2xl px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <BackButton to="/academic/hub/registration" />
                        <div>
                            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                                <FaGraduationCap className="text-indigo-600" />
                                บริหารการจบการศึกษา
                            </h1>
                            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                Graduation & Promotion Management
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filter & Search Bar */}
                <div className="bg-white dark:bg-[#1c1c24] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2 relative">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">ค้นหารายชื่อ</label>
                            <div className="relative">
                                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อ, นามสกุล หรือรหัสนักเรียน..."
                                    className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white font-medium"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">ระดับชั้น</label>
                            <Select
                                options={classOptions}
                                placeholder="เลือกชั้นเรียน..."
                                isClearable
                                onChange={(opt) => setSelectedClassLevel(opt?.value || '')}
                                value={classOptions.find(o => o.value === selectedClassLevel)}
                                styles={compactSelectStyles}
                                menuPortalTarget={document.body}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">ห้องเรียน</label>
                            <Select
                                options={roomOptions}
                                placeholder="เลือกห้อง..."
                                isClearable
                                onChange={(opt) => setSelectedRoomNumber(opt?.value || '')}
                                value={roomOptions.find(o => o.value === selectedRoomNumber)}
                                styles={compactSelectStyles}
                                menuPortalTarget={document.body}
                            />
                        </div>
                    </div>
                </div>

                {/* Batch Action Bar */}
                <div className="bg-white dark:bg-[#1c1c24] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                            <FaFilter size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">ดำเนินการแบบกลุ่ม</h3>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Selected: {selectedStudents.size} students</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <div className="w-full md:w-64">
                            <Select
                                options={filteredActionOptions}
                                placeholder="เลือกสิ่งที่ต้องการดำเนินการ..."
                                onChange={(opt) => opt && setBatchActionType(opt.value as TransitionType)}
                                value={filteredActionOptions.find(o => o.value === batchActionType)}
                                styles={compactSelectStyles}
                                menuPortalTarget={document.body}
                            />
                        </div>
                        <button
                            onClick={handleBatchTransition}
                            disabled={selectedStudents.size === 0 || isSubmitting}
                            className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm ${
                                selectedStudents.size > 0 
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-500/20' 
                                : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed'
                            }`}
                        >
                            <FaCheckCircle size={14} />
                            ยืนยันบันทึกแบบกลุ่ม
                        </button>
                    </div>
                </div>

                {/* Main Content Table */}
                <div className="bg-white dark:bg-[#1c1c24] border border-gray-100 dark:border-gray-800 rounded-[2rem] shadow-sm overflow-hidden">
                    <div className="hidden md:block">
                        {loading ? (
                            <LoadingState />
                        ) : filteredStudents.length === 0 ? (
                            <EmptyState />
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-800">
                                        <th className="pl-10 pr-4 py-4 w-20 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-700 text-indigo-600 transition-all cursor-pointer"
                                                checked={filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length}
                                                onChange={toggleAll}
                                            />
                                        </th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">เลขที่</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">รหัสประจำตัว</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">ชื่อ - นามสกุล</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">ระดับชั้น/ห้อง</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest text-right w-[320px]">การดำเนินการรายบุคคล</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                    {currentStudents.map(student => (
                                        <tr
                                            key={student.docId}
                                            className={`group transition-colors hover:bg-gray-50 dark:hover:bg-indigo-500/5 ${selectedStudents.has(student.docId) ? 'bg-indigo-50/30 dark:bg-indigo-500/10' : ''}`}
                                        >
                                            <td className="pl-10 pr-4 py-5 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-700 text-indigo-600 transition-all cursor-pointer"
                                                    checked={selectedStudents.has(student.docId)}
                                                    onChange={(e) => { e.stopPropagation(); toggleStudent(student.docId); }}
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-[13px] font-bold text-gray-800 dark:text-gray-200 tabular-nums text-center">{student.studentNumber}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[11px] font-bold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                                                    {student.studentId}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-[13px] font-extrabold text-gray-800 dark:text-white">
                                                <div className="flex flex-col">
                                                    <span>{student.firstName} {student.lastName}</span>
                                                    <div className="flex gap-1 mt-0.5">
                                                        {student.status === 'ซ้ำชั้น' && (
                                                            <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[9px] font-bold">ซ้ำชั้นเรียน</span>
                                                        )}
                                                        {student.graduationDetails?.remark === 'ติด 0, ร, มส' && (
                                                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] font-bold">ติด 0, ร, มส</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                                                    {CLASSES[student.classLevel as keyof typeof CLASSES] || student.classLevel}/{student.roomNumber}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center gap-2 justify-end">
                                                    <div className="w-56 text-left">
                                                        <Select
                                                            options={filteredActionOptions}
                                                            placeholder="เลือกการดำเนินการ..."
                                                            onChange={(opt) => {
                                                                if (opt) handleSingleActionChange(student.docId, opt.value);
                                                            }}
                                                            value={filteredActionOptions.find(o => o.value === (individualActions[student.docId] || ''))}
                                                            styles={compactSelectStyles}
                                                            menuPortalTarget={document.body}
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => handleSingleUpdate(student)}
                                                        disabled={!individualActions[student.docId] || isSubmitting}
                                                        className={`p-2 rounded-xl transition-all shadow-sm ${
                                                            individualActions[student.docId] 
                                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/20' 
                                                            : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed'
                                                        }`}
                                                        title="บันทึกรายบุคคล"
                                                    >
                                                        <FaCheckCircle size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Mobile View List */}
                    <div className="md:hidden divide-y divide-gray-50 dark:divide-gray-800/50">
                        {loading ? (
                            <LoadingState />
                        ) : filteredStudents.length === 0 ? (
                            <EmptyState />
                        ) : (
                            currentStudents.map(student => (
                                <div
                                    key={student.docId}
                                    onClick={() => toggleStudent(student.docId)}
                                    className={`p-6 flex items-center justify-between gap-4 transition-colors ${selectedStudents.has(student.docId) ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : ''}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="checkbox"
                                            className="w-6 h-6 rounded-lg border-2 border-gray-300 dark:border-gray-700 text-indigo-600 cursor-pointer"
                                            checked={selectedStudents.has(student.docId)}
                                            onChange={(e) => { e.stopPropagation(); toggleStudent(student.docId); }}
                                        />
                                        <div>
                                            <div className="font-black text-gray-900 dark:text-gray-100 leading-tight flex items-center gap-2">
                                                {student.firstName} {student.lastName}
                                                {student.status === 'ซ้ำชั้น' && (
                                                    <span className="px-1 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[8px] font-bold">ซ้ำชั้น</span>
                                                )}
                                                {student.graduationDetails?.remark === 'ติด 0, ร, มส' && (
                                                    <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[8px] font-bold">ติด 0, ร, มส</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-400 mt-1 flex gap-2">
                                                <span>เลขที่ {student.studentNumber}</span>
                                                <span>รหัส {student.studentId}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-indigo-600 dark:text-indigo-400 font-black text-lg">
                                            {CLASSES[student.classLevel as keyof typeof CLASSES] || student.classLevel}/{student.roomNumber}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pagination Menu */}
                    {totalPages > 1 && (
                        <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-gray-800">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredStudents.length)} จาก {filteredStudents.length} รายการ
                                </div>
                                <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-gray-50/50 dark:bg-black/20 rounded-xl border border-gray-200/50 dark:border-white/5">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-black text-gray-600 dark:text-gray-400 flex items-center gap-1"
                                    >
                                        <ChevronsLeft size={14} />
                                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าแรก</span>
                                    </button>

                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-black text-gray-600 dark:text-gray-400 flex items-center gap-1"
                                    >
                                        <ChevronLeft size={14} />
                                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ย้อนกลับ</span>
                                    </button>

                                    <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />

                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                            let pageNum = i + 1;
                                            if (totalPages > 5) {
                                                const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                                                pageNum = start + i;
                                            }
                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => setCurrentPage(pageNum)}
                                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-black transition-all ${currentPage === pageNum
                                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-105'
                                                        : 'hover:bg-white dark:hover:bg-white/5 text-gray-600 dark:text-gray-400'
                                                        }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />

                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-black text-gray-600 dark:text-gray-400 flex items-center gap-1"
                                    >
                                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ถัดไป</span>
                                        <ChevronRight size={14} />
                                    </button>

                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-black text-gray-600 dark:text-gray-400 flex items-center gap-1"
                                    >
                                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าสุดท้าย</span>
                                        <ChevronsRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Regulation Tips */}
                <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/20 p-5 sm:p-6 flex flex-col md:flex-row gap-5 items-center md:items-start text-center md:text-left transition-all hover:shadow-md">
                    <div className="p-4 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-500/20 shrink-0">
                        <FaInfoCircle size={24} />
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-sm font-black text-amber-900 dark:text-amber-400 uppercase tracking-widest flex items-center justify-center md:justify-start gap-2">
                            กฎระเบียบการเลื่อนชั้นและจบการศึกษา
                        </h4>
                        <p className="text-xs sm:text-sm text-amber-800/80 dark:text-amber-200/60 font-medium leading-relaxed">
                            ระบบจะตรวจสอบระดับชั้นปัจจุบันของนักเรียนโดยอัตโนมัติ หากเป็นชั้นสูงสุดของช่วงชั้น (เช่น <span className="font-bold text-amber-600 dark:text-amber-500">ป.6, ม.3 หรือ ม.6</span>)
                            สถานะจะถูกเปลี่ยนเป็น <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-800/40 rounded-md font-bold text-amber-900 dark:text-amber-300">"สำเร็จการศึกษา (รอดำเนินการ)"</span> ทันที
                            เพื่อส่งต่อไปยังหน้าตรวจสอบและอนุมัติจบการศึกษา ก่อนจะลงข้อมูลในทำเนียบศิษย์เก่า
                        </p>
                    </div>
                </div>

                {/* Floating Bottom Button for Mobile */}
                {selectedStudents.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:hidden w-[calc(100%-3rem)]">
                        <button
                            onClick={handleBatchTransition}
                            disabled={isSubmitting}
                            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-sm"
                        >
                            {isSubmitting ? 'กำลังบันทึก...' : `ยืนยันบันทึก (${selectedStudents.size} รายชื่อ)`}
                            <FaCheckCircle size={10} />
                        </button>
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

const LoadingState = () => (
    <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
        {[...Array(6)].map((_, i) => (
            <div key={`skeleton-${i}`} className="flex items-center gap-4 px-6 py-4">
                <div className="h-5 w-5 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"></div>
                <div className="h-3.5 w-8 rounded bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"></div>
                <div className="h-3.5 flex-1 max-w-[220px] rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                <div className="h-3.5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"></div>
                <div className="h-3.5 w-10 rounded bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0 hidden sm:block"></div>
            </div>
        ))}
    </div>
);

const EmptyState = () => (
    <div className="h-80 flex flex-col items-center justify-center text-center p-12 opacity-50">
        <FaUserGraduate size={48} className="text-gray-300 dark:text-gray-700 mb-6" />
        <h4 className="text-lg font-black text-gray-800 dark:text-gray-200">ไม่พบรายชื่อในระบบ</h4>
        <p className="text-xs text-gray-400 font-medium max-w-xs mt-2">โปรดเลือกตัวกรองสายชั้นเรียนและห้องเรียนเพื่อเริ่มต้นตรวจสอบ</p>
    </div>
);

export default GraduationManagementPage;
