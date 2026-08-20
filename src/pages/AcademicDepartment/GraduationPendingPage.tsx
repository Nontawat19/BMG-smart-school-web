import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { collection, getDocs, updateDoc, doc, query, where } from 'firebase/firestore';
import { firestore } from '@/firebase';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { fetchSchoolSettings } from '@/store/slices/schoolSettingsSlice';
import {
    FaGraduationCap, FaSearch, FaCheckCircle, FaUsers, 
    FaClock, FaUserCheck, FaTimesCircle, FaIdCard, FaSortNumericDown, FaSync, FaArrowUp, FaUserGraduate, FaUserMinus,
    FaExclamationTriangle
} from 'react-icons/fa';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle } from "lucide-react";
import Swal from 'sweetalert2';
import Select from 'react-select';
import { CLASSES } from '@/utils/schoolUtils';
import { buildLineRegistrationResolvedUpdate, buildLineRegistrationReviewUpdate } from '@/utils/lineRegistrationUtils';

interface Student {
    id: string;
    docId: string;
    studentNumber: string;
    studentId: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    roomNumber: string;
    status: string;
    profileImageUrl?: string;
    graduationDetails?: {
        date?: string;
        certificateNo?: string;
        gpax?: string;
        remark?: string;
    };
}

const GraduationPendingPage: React.FC = () => {
    const user = useSelector((state: RootState) => state.auth.user);
    const schoolId = (user as any)?.schoolId;
    const { availableClassOptions, classKeys, status: settingsStatus } = useSelector((state: RootState) => state.schoolSettings);
    const dispatch = useDispatch();

    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
    const [selectedRoom, setSelectedRoom] = useState<string>('');
    const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
    const [individualActions, setIndividualActions] = useState<Record<string, string>>({});
    const [bulkAction, setBulkAction] = useState<string>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const itemsPerPage = 50;

    const compactSelectStyles = useMemo(() => ({
        control: (base: any, state: any) => ({
            ...base,
            backgroundColor: isDarkMode ? '#1c1c24' : '#ffffff',
            borderColor: state.isFocused ? '#6366f1' : isDarkMode ? '#374151' : '#e5e7eb',
            boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
            '&:hover': {
                borderColor: state.isFocused ? '#6366f1' : isDarkMode ? '#4b5563' : '#d1d5db'
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
        indicatorSeparator: () => ({ display: 'none' }),
        dropdownIndicator: (base: any) => ({
            ...base,
            color: isDarkMode ? '#9ca3af' : '#6b7280',
            '&:hover': { color: isDarkMode ? '#d1d5db' : '#374151' }
        }),
        input: (base: any) => ({ ...base, color: isDarkMode ? '#f9fafb' : '#1f2937' }),
        menu: (base: any) => ({
            ...base,
            backgroundColor: isDarkMode ? '#233046' : '#ffffff',
            border: `1px solid ${isDarkMode ? '#334155' : '#e5e7eb'}`,
            borderRadius: '1rem',
            fontSize: '0.75rem',
            zIndex: 9999,
            boxShadow: isDarkMode
                ? '0 18px 30px -12px rgba(0, 0, 0, 0.45)'
                : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            overflow: 'hidden'
        }),
        menuList: (base: any) => ({
            ...base,
            maxHeight: '600px',
            padding: '4px'
        }),
        option: (base: any, state: any) => ({
            ...base,
            backgroundColor: state.isSelected
                ? '#6366f1'
                : state.isFocused
                    ? (isDarkMode ? 'rgba(99, 102, 241, 0.18)' : '#eef2ff')
                    : 'transparent',
            color: state.isSelected ? '#ffffff' : (isDarkMode ? '#f8fafc' : '#1f2937'),
            padding: '8px 12px',
            cursor: 'pointer',
            fontWeight: '500',
            '&:active': { backgroundColor: '#4f46e5' }
        }),
        singleValue: (base: any) => ({
            ...base,
            color: isDarkMode ? '#f9fafb' : '#1f2937',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }),
        placeholder: (base: any) => ({
            ...base,
            color: isDarkMode ? '#94a3b8' : '#9ca3af'
        })
    }), [isDarkMode]);

    useEffect(() => {
        if (schoolId && settingsStatus === 'idle') {
            dispatch(fetchSchoolSettings(schoolId) as any);
        }
    }, [schoolId, settingsStatus, dispatch]);

    useEffect(() => {
        const syncDarkMode = () => {
            setIsDarkMode(document.documentElement.classList.contains('dark'));
        };
        syncDarkMode();
        const observer = new MutationObserver(syncDarkMode);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedClassLevel, selectedRoom]);

    const fetchPendingStudents = async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const studentsRef = collection(firestore, 'school-settings', schoolId, 'students');
            const q = query(studentsRef, where('status', 'in', ['รออนุมัติจบ', 'pending_graduation']));
            const snap = await getDocs(q);
            
            const studentDocs: Student[] = snap.docs.map(doc => ({
                docId: doc.id,
                id: doc.data().studentId || doc.id,
                studentNumber: doc.data().studentNumber || '-',
                studentId: doc.data().studentId || '-',
                firstName: doc.data().firstName || '',
                lastName: doc.data().lastName || '',
                classLevel: doc.data().classLevel || '',
                roomNumber: doc.data().room || doc.data().roomNumber || '',
                status: doc.data().status || '',
                profileImageUrl: doc.data().profileImageUrl || '',
                graduationDetails: doc.data().graduationDetails || {
                    date: new Date().toISOString().split('T')[0],
                    certificateNo: '',
                    gpax: '',
                    remark: ''
                }
            })).filter(s => {
                const isNotBlocked = s.graduationDetails?.remark !== 'ติด 0, ร, มส';
                const levelKey = Object.keys(CLASSES).find(k => k === s.classLevel.toLowerCase() || CLASSES[k as keyof typeof CLASSES] === s.classLevel);
                const isInRange = levelKey ? classKeys.includes(levelKey) : false;
                return isNotBlocked && isInRange;
            });
            
            setStudents(studentDocs);
        } catch (error) {
            console.error("Error fetching pending students:", error);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักเรียนที่รอดำเนินการได้', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Helper to normalize class levels for consistent matching
    const normalizeLevel = (lvl: string) => {
        if (!lvl) return '';
        const clean = String(lvl).trim();
        // Check if it's already a key (p1, p2, m1...)
        if (CLASSES[clean as keyof typeof CLASSES]) return clean;
        // Check if it's a label (ป.1, ม.1...)
        const entry = Object.entries(CLASSES).find(([k, v]) => v === clean);
        if (entry) return entry[0];
        // Check if it's a full name (ประถมศึกษาปีที่ 1...)
        const fullEntry = Object.entries(CLASSES).find(([k, v]) => {
            const key = k as keyof typeof CLASSES;
            return v === clean || (key.startsWith('p') && clean.includes(`ประถมศึกษาปีที่ ${key.substring(1)}`)) || 
                   (key.startsWith('m') && clean.includes(`มัธยมศึกษาปีที่ ${key.substring(1)}`));
        });
        return fullEntry ? fullEntry[0] : clean.toLowerCase();
    };

    useEffect(() => {
        fetchPendingStudents();
    }, [schoolId]);

    const [editingDetails, setEditingDetails] = useState<Record<string, any>>({});

    const handleDetailChange = (docId: string, field: string, value: string) => {
        setEditingDetails(prev => ({
            ...prev,
            [docId]: {
                ...(prev[docId] || students.find(s => s.docId === docId)?.graduationDetails || {}),
                [field]: value
            }
        }));
    };

    // Helper to get available action options for a specific student based on their class and school capability
    const getStudentActionOptions = (student: Student) => {
        const hasM1 = availableClassOptions.some(([val]) => val.toLowerCase() === 'm1');
        const hasM4 = availableClassOptions.some(([val]) => val.toLowerCase() === 'm4');
        const levelKey = normalizeLevel(student.classLevel);

        const options = [
            { value: 'repeat', label: 'ซ้ำชั้นเรียน (สอบไม่ผ่าน)', icon: <FaSync size={12} className="text-orange-500" /> },
        ];

        if (levelKey === 'p6') {
            if (hasM1) {
                options.push({ value: 'promote_next_m1', label: 'ศึกษาต่อโรงเรียนเดิม (เลื่อนชั้น ม.1)', icon: <FaArrowUp size={12} className="text-emerald-500" /> });
                options.push({ value: 'exit_other', label: 'ศึกษาต่อโรงเรียนอื่น (จำหน่ายชื่อออก)', icon: <FaUserMinus size={12} className="text-rose-500" /> });
            } else {
                options.push({ value: 'approve_exit', label: 'อนุมัติจบการศึกษา (จำหน่ายชื่อออก)', icon: <FaUserCheck size={12} className="text-indigo-500" /> });
            }
        } else if (levelKey === 'm3') {
            if (hasM4) {
                options.push({ value: 'promote_next_m4', label: 'ศึกษาต่อโรงเรียนเดิม (ม.4)', icon: <FaArrowUp size={12} className="text-emerald-500" /> });
                options.push({ value: 'exit_other', label: 'ศึกษาต่อโรงเรียนอื่น (จำหน่ายชื่อออก)', icon: <FaUserMinus size={12} className="text-rose-500" /> });
            } else {
                options.push({ value: 'approve_exit', label: 'อนุมัติจบการศึกษา (จำหน่ายชื่อออก)', icon: <FaUserCheck size={12} className="text-indigo-500" /> });
            }
        } else if (levelKey === 'm6') {
            options.push({ value: 'approve_exit', label: 'อนุมัติสำเร็จการศึกษา (ระบบศิษย์เก่า)', icon: <FaUserCheck size={12} className="text-indigo-500" /> });
        } else {
            // General fallback
            options.push({ value: 'promote', label: 'เลื่อนชั้นเรียน (ปกติ)', icon: <FaArrowUp size={12} className="text-emerald-500" /> });
            options.push({ value: 'approve_exit', label: 'อนุมัติจบการศึกษา', icon: <FaUserCheck size={12} className="text-indigo-500" /> });
        }

        return options;
    };

    const getBulkActionOptions = () => {
        const hasM1 = availableClassOptions.some(([val]) => val.toLowerCase() === 'm1');
        const hasM4 = availableClassOptions.some(([val]) => val.toLowerCase() === 'm4');

        const options = [
            { value: 'approve_exit', label: 'อนุมัติสำเร็จการศึกษา (ระบบศิษย์เก่า)', icon: <FaUserCheck size={12} className="text-indigo-500" /> },
            { value: 'exit_other', label: 'ศึกษาต่อโรงเรียนอื่น (จำหน่ายชื่อออก)', icon: <FaUserMinus size={12} className="text-rose-500" /> },
            { value: 'repeat', label: 'ซ้ำชั้นเรียน (สอบไม่ผ่าน)', icon: <FaSync size={12} className="text-orange-500" /> },
        ];

        if (hasM1) {
            options.push({ value: 'promote_next_m1', label: 'ศึกษาต่อโรงเรียนเดิม (เลื่อนชั้น ม.1)', icon: <FaArrowUp size={12} className="text-emerald-500" /> });
        }
        if (hasM4) {
            options.push({ value: 'promote_next_m4', label: 'ศึกษาต่อโรงเรียนเดิม (เลื่อนชั้น ม.4)', icon: <FaArrowUp size={12} className="text-emerald-500" /> });
        }

        return options;
    };

    const applyBulkAction = (actionValue: string) => {
        if (!actionValue) return;
        const newActions = { ...individualActions };
        selectedStudents.forEach(docId => {
            newActions[docId] = actionValue;
        });
        setIndividualActions(newActions);
        setBulkAction('');
    };

    const handleSingleUpdate = async (student: Student) => {
        if (!schoolId) return;
        const action = individualActions[student.docId];
        if (!action) return;

        const options = getStudentActionOptions(student);
        const actionLabel = options.find(o => o.value === action)?.label;

        const confirm = await Swal.fire({
            title: 'ยืนยันดำเนินการรายบุคคล?',
            text: `คุณต้องการดำเนินการ "${actionLabel}" สำหรับ ${student.firstName} ${student.lastName} ใช่หรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            customClass: { popup: 'rounded-[2rem]' }
        });

        if (!confirm.isConfirmed) return;

        setLoading(true);
        try {
            const studentRef = doc(firestore, 'school-settings', schoolId, 'students', student.docId);
            let updateData: any = { 
                updatedAt: new Date().toISOString(),
                finalizedAt: new Date().toISOString(),
                finalizedBy: user?.uid
            };

            const currentDetails = editingDetails[student.docId] || student.graduationDetails || {};

            switch (action) {
                case 'approve':
                case 'approve_exit':
                    updateData = { 
                        ...updateData, 
                        status: 'สำเร็จการศึกษา', 
                        studentStatus: 'สำเร็จการศึกษา',
                        graduationDetails: currentDetails,
                        ...buildLineRegistrationResolvedUpdate()
                    };
                    break;
                case 'exit_other':
                    updateData = {
                        ...updateData,
                        status: 'จำหน่ายชื่อออก',
                        studentStatus: 'จำหน่ายชื่อออก',
                        graduationDetails: currentDetails,
                        ...buildLineRegistrationResolvedUpdate()
                    };
                    break;
                case 'promote_next_m1':
                    updateData = {
                        ...updateData,
                        status: 'กำลังศึกษาอยู่',
                        studentStatus: 'กำลังศึกษาอยู่',
                        classLevel: 'm1',
                        room: '1',
                        roomNumber: '1',
                        ...buildLineRegistrationReviewUpdate({ fromClassLevel: student.classLevel, fromRoom: student.roomNumber, toClassLevel: 'm1', toRoom: '1', reason: 'graduation_promotion' })
                    };
                    break;
                case 'promote_next_m4':
                    updateData = {
                        ...updateData,
                        status: 'กำลังศึกษาอยู่',
                        studentStatus: 'กำลังศึกษาอยู่',
                        classLevel: 'm4',
                        room: '1',
                        roomNumber: '1',
                        ...buildLineRegistrationReviewUpdate({ fromClassLevel: student.classLevel, fromRoom: student.roomNumber, toClassLevel: 'm4', toRoom: '1', reason: 'graduation_promotion' })
                    };
                    break;
                case 'promote':
                case 'promote_next':
                    updateData = { ...updateData, status: 'กำลังศึกษาอยู่', studentStatus: 'กำลังศึกษาอยู่' };
                    break;
                case 'repeat':
                    updateData = { ...updateData, status: 'ซ้ำชั้น', studentStatus: 'ซ้ำชั้น', graduationDetails: { ...currentDetails, remark: 'ซ้ำชั้นเรียน' } };
                    break;
                case 'clear_pending':
                    updateData = { 
                        ...updateData, 
                        status: 'รออนุมัติจบ', 
                        studentStatus: 'รออนุมัติจบ', 
                        graduationDetails: { ...currentDetails, remark: 'สำเร็จการศึกษา (รอดำเนินการ)' } 
                    };
                    break;
            }

            await updateDoc(studentRef, updateData);
            
            Swal.fire({ title: 'สำเร็จ!', text: 'ปรับปรุงข้อมูลเรียบร้อยแล้ว', icon: 'success', timer: 1500, showConfirmButton: false });
            fetchPendingStudents();
            setIndividualActions(prev => {
                const newState = { ...prev };
                delete newState[student.docId];
                return newState;
            });
        } catch (error) {
            console.error("Error updating single student:", error);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setLoading(false);
        }
    };

    const classOptions = useMemo(() => {
        return availableClassOptions.map(([val, label]) => ({
            value: val,
            label: String(label).replace('มัธยมศึกษาปีที่', 'ม.')
        }));
    }, [availableClassOptions]);

    const roomOptions = useMemo(() => {
        const rooms = new Set(students.map(s => s.roomNumber));
        return Array.from(rooms).sort().map(r => ({ value: r, label: `ห้อง ${r}` }));
    }, [students]);

    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
            const sid = s.studentId.toLowerCase();
            const sterm = searchTerm.toLowerCase().trim();
            const matchSearch = sterm === '' || fullName.includes(sterm) || sid.includes(sterm);
            
            // Normalize class level for matching
            const studentLevelKey = normalizeLevel(s.classLevel);
            const targetLevelKey = normalizeLevel(selectedClassLevel);
            const matchClass = !selectedClassLevel || studentLevelKey === targetLevelKey;

            // Room matching
            const cleanRoom = String(s.roomNumber || '').trim();
            const targetRoom = String(selectedRoom || '').trim();
            const matchRoom = !selectedRoom || cleanRoom === targetRoom;

            return matchSearch && matchClass && matchRoom;
        });
    }, [students, searchTerm, selectedClassLevel, selectedRoom]);

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const paginatedStudents = useMemo(() => {
        return filteredStudents.slice(indexOfFirstItem, indexOfLastItem);
    }, [filteredStudents, currentPage, indexOfFirstItem, indexOfLastItem]);

    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

    const toggleAll = () => {
        if (selectedStudents.size === paginatedStudents.length) {
            setSelectedStudents(new Set());
        } else {
            setSelectedStudents(new Set(paginatedStudents.map(s => s.docId)));
        }
    };

    const toggleSelectStudent = (docId: string) => {
        const newSet = new Set(selectedStudents);
        if (newSet.has(docId)) newSet.delete(docId);
        else newSet.add(docId);
        setSelectedStudents(newSet);
    };

    const handleApproveGraduation = async () => {
        if (selectedStudents.size === 0) {
            Swal.fire('แจ้งเตือน', 'กรุณาเลือกนักเรียนที่ต้องการอนุมัติ', 'warning');
            return;
        }

        const result = await Swal.fire({
            title: 'ยืนยันการอนุมัติจบการศึกษา',
            text: `คุณต้องการอนุมัติจบการศึกษานักเรียนจำนวน ${selectedStudents.size} คน ใช่หรือไม่? (ข้อมูลจะถูกย้ายไปยังทำเนียบศิษย์เก่า)`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการอนุมัติ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#ef4444',
            customClass: { popup: 'rounded-[2rem]' }
        });

        if (result.isConfirmed) {
            setLoading(true);
            try {
                const batchPromises = Array.from(selectedStudents).map(async (docId) => {
                    const studentRef = doc(firestore, 'school-settings', schoolId, 'students', docId);
                    const student = students.find(s => s.docId === docId);
                    const action = individualActions[docId] || 'approve_exit';
                    const currentDetails = editingDetails[docId] || student?.graduationDetails || {};

                    let updateData: any = {
                        graduationDetails: currentDetails,
                        updatedAt: new Date().toISOString(),
                        finalizedAt: new Date().toISOString(),
                        finalizedBy: user?.uid
                    };

                    if (action === 'repeat') {
                        updateData.status = 'ซ้ำชั้น';
                        updateData.studentStatus = 'ซ้ำชั้น';
                    } else if (action === 'promote_next_m1') {
                        updateData.status = 'กำลังศึกษาอยู่';
                        updateData.studentStatus = 'กำลังศึกษาอยู่';
                        updateData.classLevel = 'm1';
                        updateData.room = '1'; // Default to room 1
                        updateData.roomNumber = '1';
                        Object.assign(updateData, buildLineRegistrationReviewUpdate({ fromClassLevel: student?.classLevel, fromRoom: student?.roomNumber, toClassLevel: 'm1', toRoom: '1', reason: 'graduation_promotion' }));
                    } else if (action === 'promote_next_m4') {
                        updateData.status = 'กำลังศึกษาอยู่';
                        updateData.studentStatus = 'กำลังศึกษาอยู่';
                        updateData.classLevel = 'm4';
                        updateData.room = '1'; // Default to room 1
                        updateData.roomNumber = '1';
                        Object.assign(updateData, buildLineRegistrationReviewUpdate({ fromClassLevel: student?.classLevel, fromRoom: student?.roomNumber, toClassLevel: 'm4', toRoom: '1', reason: 'graduation_promotion' }));
                    } else if (action === 'exit_other') {
                        updateData.status = 'จำหน่ายชื่อออก';
                        updateData.studentStatus = 'จำหน่ายชื่อออก';
                        Object.assign(updateData, buildLineRegistrationResolvedUpdate());
                    } else {
                        // approve_exit or fallback
                        updateData.status = 'สำเร็จการศึกษา';
                        updateData.studentStatus = 'สำเร็จการศึกษา';
                        Object.assign(updateData, buildLineRegistrationResolvedUpdate());
                    }

                    return updateDoc(studentRef, updateData);
                });

                await Promise.all(batchPromises);
                
                Swal.fire({
                    icon: 'success',
                    title: 'อนุมัติสำเร็จ',
                    text: `ดำเนินการอนุมัติจบการศึกษานักเรียน ${selectedStudents.size} คน เรียบร้อยแล้ว`,
                    timer: 2000,
                    showConfirmButton: false,
                    customClass: { popup: 'rounded-[2rem]' }
                });
                
                setSelectedStudents(new Set());
                fetchPendingStudents();
            } catch (error) {
                console.error("Error approving graduation:", error);
                Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการอนุมัติ', 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1c1c24] pb-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="mb-8">
                        <div className="flex items-center gap-4 mb-2">
                            <BackButton to="/academic/hub/registration" />
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FaClock className="text-amber-500" />
                                รายการรอดำเนินการจบการศึกษา
                            </h1>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 ml-14">
                            ตรวจสอบและอนุมัติรายชื่อนักเรียนที่สำเร็จการศึกษา เพื่อจัดเข้าสู่ทำเนียบศิษย์เก่า
                        </p>
                    </div>

                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-3 mb-6">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อ หรือรหัสนักเรียน..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-1.5 bg-gray-50 dark:bg-[#1c1c24] border border-gray-200 dark:border-gray-700 rounded-xl text-[11px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all dark:text-white"
                                />
                            </div>

                            <div className="flex items-center gap-2 min-w-[300px]">
                                <div className="w-32">
                                    <Select
                                        options={classOptions}
                                        value={classOptions.find(o => o.value === selectedClassLevel)}
                                        onChange={(val) => setSelectedClassLevel(val?.value || '')}
                                        placeholder="ระดับชั้น"
                                        isClearable
                                        styles={compactSelectStyles}
                                        menuPortalTarget={document.body}
                                    />
                                </div>
                                <div className="w-24">
                                    <Select
                                        options={roomOptions}
                                        value={roomOptions.find(o => o.value === selectedRoom)}
                                        onChange={(val) => setSelectedRoom(val?.value || '')}
                                        placeholder="ห้อง"
                                        isClearable
                                        styles={compactSelectStyles}
                                        menuPortalTarget={document.body}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 ml-auto">
                                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mr-2">
                                    เลือกแล้ว: {selectedStudents.size} คน
                                </div>
                                <div className="w-56">
                                    <Select
                                        options={getBulkActionOptions()}
                                        value={getBulkActionOptions().find(o => o.value === bulkAction)}
                                        onChange={(val) => {
                                            if (val) applyBulkAction(val.value);
                                        }}
                                        placeholder="คำสั่งดำเนินการแบบกลุ่ม..."
                                        styles={compactSelectStyles}
                                        menuPortalTarget={document.body}
                                        isDisabled={selectedStudents.size === 0}
                                        formatOptionLabel={(option: any) => (
                                            <div className="flex items-center gap-2">
                                                {option.icon}
                                                <span>{option.label}</span>
                                            </div>
                                        )}
                                    />
                                </div>
                                <button
                                    onClick={handleApproveGraduation}
                                    disabled={selectedStudents.size === 0 || loading}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm"
                                >
                                    <FaUserCheck />
                                    อนุมัติการดำเนินการ
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                                        <th className="px-6 py-4 w-16 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-700 text-indigo-600 transition-all cursor-pointer"
                                                checked={selectedStudents.size === paginatedStudents.length && paginatedStudents.length > 0}
                                                onChange={toggleAll}
                                            />
                                        </th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">เลขที่</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">ชื่อ - นามสกุล</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">ระดับชั้น/ห้อง</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center">GPAX</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">เลขที่ใบประกาศ</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest text-right">การดำเนินการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                    {loading ? (
                                        [...Array(8)].map((_, i) => (
                                            <tr key={`skeleton-${i}`}>
                                                <td className="px-6 py-4 text-center"><div className="h-5 w-5 mx-auto rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="px-6 py-4 text-center"><div className="h-3.5 w-8 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="px-6 py-4"><div className="h-3.5 w-36 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="px-6 py-4 text-center"><div className="h-3.5 w-16 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="px-6 py-4 text-center"><div className="h-3.5 w-10 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="px-6 py-4"><div className="h-3.5 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="px-6 py-4 text-right"><div className="h-3.5 w-16 ml-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                            </tr>
                                        ))
                                    ) : paginatedStudents.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-gray-400 italic">ไม่พบรายชื่อนักเรียน</td>
                                        </tr>
                                    ) : (
                                        paginatedStudents.map(student => {
                                            const currentDetails = editingDetails[student.docId] || student.graduationDetails || {};
                                            return (
                                                <tr key={student.docId} className="group hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                                                    <td className="px-6 py-4 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedStudents.has(student.docId)}
                                                            onChange={() => toggleSelectStudent(student.docId)}
                                                            className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-700 text-indigo-600 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-[12px] font-bold text-gray-400 tabular-nums">{student.studentNumber}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center overflow-hidden border border-indigo-100 dark:border-indigo-500/20 flex-shrink-0">
                                                                {student.profileImageUrl ? (
                                                                    <ProfileAvatar src={student.profileImageUrl} className="w-full h-full" />
                                                                ) : (
                                                                    <FaUsers className="text-indigo-300" size={14} />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className="text-[13px] font-extrabold text-gray-800 dark:text-white leading-tight">
                                                                    {student.firstName} {student.lastName}
                                                                </div>
                                                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter flex items-center gap-2">
                                                                    <span>รหัส: {student.studentId}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-[11px] font-black text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                                                            {CLASSES[student.classLevel] || student.classLevel}/{student.roomNumber}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <input 
                                                            type="text"
                                                            value={currentDetails.gpax || ''}
                                                            onChange={(e) => handleDetailChange(student.docId, 'gpax', e.target.value)}
                                                            placeholder="0.00"
                                                            className="w-16 px-2 py-1 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-lg text-[12px] font-black text-center focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <input 
                                                            type="text"
                                                            value={currentDetails.certificateNo || ''}
                                                            onChange={(e) => handleDetailChange(student.docId, 'certificateNo', e.target.value)}
                                                            placeholder="เลขที่ ปพ."
                                                            className="w-full px-3 py-1 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-lg text-[12px] font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center gap-2 justify-end">
                                                            <div className="w-56 text-left">
                                                                <Select
                                                                    options={getStudentActionOptions(student)}
                                                                    placeholder="ดำเนินการ..."
                                                                    onChange={(opt) => {
                                                                        if (opt) setIndividualActions(prev => ({ ...prev, [student.docId]: opt.value }));
                                                                    }}
                                                                    value={getStudentActionOptions(student).find(o => o.value === (individualActions[student.docId] || ''))}
                                                                    styles={compactSelectStyles}
                                                                    menuPortalTarget={document.body}
                                                                    formatOptionLabel={(option: any) => (
                                                                        <div className="flex items-center gap-2">
                                                                            {option.icon}
                                                                            <span className="text-[11px] font-bold">{option.label}</span>
                                                                        </div>
                                                                    )}
                                                                />
                                                            </div>
                                                            <button 
                                                                onClick={() => handleSingleUpdate(student)}
                                                                disabled={!individualActions[student.docId] || loading}
                                                                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white rounded-xl transition-all shadow-lg shadow-emerald-600/10 active:scale-95"
                                                                title="บันทึกรายคน"
                                                            >
                                                                <FaCheckCircle size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {!loading && totalPages > 1 && (
                            <div className="px-6 py-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                    แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredStudents.length)} จาก {filteredStudents.length} รายการ
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-all"
                                    >
                                        <ChevronsLeft size={16} />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-all"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <div className="px-4 py-1 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-[11px] font-bold text-gray-700 dark:text-gray-300">
                                        {currentPage} / {totalPages}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-all"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-all"
                                    >
                                        <ChevronsRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default GraduationPendingPage;
