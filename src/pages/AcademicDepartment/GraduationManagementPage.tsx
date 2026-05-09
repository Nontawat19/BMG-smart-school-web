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
    FaChevronRight, FaInfoCircle, FaFilter, FaUsers, FaArrowRight,
    FaIdCard, FaSortNumericDown
} from 'react-icons/fa';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Swal from 'sweetalert2';
import Select from 'react-select';
import { CLASS_FULL_NAMES, CLASSES } from '@/utils/schoolUtils';

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
    firstName: string;
    lastName: string;
    classLevel: string;
    roomNumber: string;
    status: string;
}

const GraduationManagementPage: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
    const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const { user } = useSelector((state: RootState) => state.auth);
    const { availableClassOptions, classKeys, status: settingsStatus } = useSelector((state: RootState) => state.schoolSettings);
    const dispatch = useDispatch();
    const schoolId = (user as any)?.schoolId;

    useEffect(() => {
        if (schoolId && settingsStatus === 'idle') {
            dispatch(fetchSchoolSettings(schoolId) as any);
        }
    }, [schoolId, settingsStatus, dispatch]);

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
                status: doc.data().status || doc.data().studentStatus || 'active',
            })).filter(s => {
                const sStatus = String(s.status).toLowerCase();
                return sStatus === 'active' || sStatus === 'ปกติ' || sStatus === 'เรียนอยู่';
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

    // Reset pagination when filters change
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
                cleanClass === CLASSES[selectedClassLevel];

            const cleanRoom = String(s.roomNumber || '').trim();
            const targetRoom = String(selectedRoomNumber || '').trim();
            const matchRoom = !selectedRoomNumber ||
                cleanRoom === targetRoom ||
                cleanRoom === targetRoom.padStart(2, '0') ||
                cleanRoom.endsWith('/' + targetRoom);

            return matchSearch && matchClass && matchRoom;
        });

        // Helper functions
        const getKey = (val: string) => {
            const cleanVal = String(val || "").trim();
            return Object.keys(CLASSES).find(k => k === cleanVal.toLowerCase() || CLASSES[k] === cleanVal) || cleanVal.toLowerCase();
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

    // Pagination Calculations
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

    const handlePromotion = async () => {
        if (selectedStudents.size === 0) {
            Swal.fire({
                title: 'โปรดเลือกนักเรียน',
                text: 'กรุณาเลือกนักเรียนที่ต้องการเลื่อนชั้นอย่างน้อย 1 รายชื่อ',
                icon: 'warning',
                confirmButtonColor: '#6366f1',
                customClass: { popup: 'rounded-[2rem]' }
            });
            return;
        }

        const confirm = await Swal.fire({
            title: 'ยืนยันเลื่อนชั้นนักเรียน?',
            html: `เตรียมปรับระดับชั้นนักเรียนจำนวน <b class="text-indigo-600 text-xl font-black">${selectedStudents.size}</b> คน <br/> ข้อมูลจะถูกปรับปรุงในฐานข้อมูลทันที`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันดำเนินการ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            customClass: { popup: 'rounded-[2rem]', confirmButton: 'rounded-xl px-8 py-3', cancelButton: 'rounded-xl px-8 py-3' }
        });

        if (confirm.isConfirmed) {
            if (!schoolId) return;
            setLoading(true);
            try {
                const promises = Array.from(selectedStudents).map(docId => {
                    const studentRef = doc(firestore, 'school-settings', schoolId, 'students', docId);
                    const userStudent = students.find(s => s.docId === docId);
                    if (!userStudent) return Promise.resolve();

                    // ✅ ใช้ classKeys จาก Redux ในการคำนวณลำดับการเลื่อนชั้น (ข้าม Virtual Levels อัตโนมัติ)
                    const getKey = (val: string) => {
                        const cleanVal = String(val || "").trim();
                        return Object.keys(CLASSES).find(k => k === cleanVal.toLowerCase() || CLASSES[k] === cleanVal) || cleanVal.toLowerCase();
                    };
                    const currentClassKey = getKey(userStudent.classLevel);
                    const currentIndex = classKeys.indexOf(currentClassKey);

                    let updateData: any = {};

                    // 1. ถ้าไม่พบชั้นเรียนในระบบ หรือ อยู่ชั้นสุดท้ายของโรงเรียนจริงๆ -> สำเร็จการศึกษา
                    if (currentIndex === -1 || currentIndex === classKeys.length - 1) {
                        updateData = { status: 'สำเร็จการศึกษา' };
                    } 
                    // 2. ถ้ายังมีชั้นถัดไป -> เลื่อนชั้นตามลำดับใน classKeys (บันทึกเป็นชื่อชั้นเรียน เช่น ม.2)
                    else {
                        const nextKey = classKeys[currentIndex + 1];
                        const nextLabel = CLASSES[nextKey] || nextKey;
                        updateData = { classLevel: nextLabel };
                    }

                    return updateDoc(studentRef, updateData);
                });
                await Promise.all(promises);
                Swal.fire({ title: 'สำเร็จ!', text: 'เลื่อนชั้นนักเรียนเรียบร้อยแล้ว', icon: 'success', customClass: { popup: 'rounded-[2rem]' } });
                fetchStudents();
            } catch (error) {
                Swal.fire({ title: 'ข้อผิดพลาด', text: 'ไม่สามารถบันทึกได้', icon: 'error', customClass: { popup: 'rounded-[2rem]' } });
            } finally { setLoading(false); }
        }
    };

    const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));
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

    const darkVariables = {
        '--select-bg': isDarkMode ? '#232429' : '#ffffff',
        '--select-border': isDarkMode ? '#30323a' : '#e5e7eb',
        '--select-border-hover': isDarkMode ? '#4b5563' : '#d1d5db',
        '--select-menu-bg': isDarkMode ? '#1c1c24' : '#ffffff',
        '--select-option-hover': isDarkMode ? '#2a2b2f' : '#f3f4f6',
        '--select-text': isDarkMode ? '#f3f4f6' : '#111827',
        '--select-height': '40px',
    } as React.CSSProperties;

    const compactSelectStyles = {
        ...selectStyles,
        control: (base: any, state: any) => ({
            ...base,
            ...selectStyles.control(base, state),
            minHeight: '40px',
            height: '40px',
            borderRadius: '0.75rem',
        }),
        valueContainer: (base: any) => ({
            ...base,
            padding: '0 12px',
        }),
        input: (base: any) => ({
            ...base,
            margin: '0',
            padding: '0',
        }),
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50/50 dark:bg-[#0f1014] p-4 sm:p-6 space-y-4 sm:space-y-5" style={darkVariables}>

                {/* 1. Ultra Compact Header Row */}
                <div className="bg-white dark:bg-[#1c1c24] border border-gray-100 dark:border-gray-800 rounded-2xl px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <BackButton to="/academic-admin" className="mr-2" />
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                            <FaGraduationCap className="text-white text-xl" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight text-gray-900 dark:text-white leading-none">เลื่อนชั้น & สำเร็จการศึกษา</h1>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Promotion Management System</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
                        <FaUsers size={12} className="text-indigo-600 dark:text-indigo-400" />
                        <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 tabular-nums">{students.length} รายชื่อในระบบ</span>
                    </div>
                </div>

                {/* 2. Super Compact Integrated Control Bar */}
                <div className="bg-white dark:bg-[#1c1c24] border border-gray-100 dark:border-gray-800 rounded-xl p-3 sm:p-4 shadow-sm">
                    <div className="grid grid-cols-12 gap-2 sm:gap-3">
                        <div className="col-span-12 lg:col-span-4">
                            <div className="relative group">
                                <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={11} />
                                <input
                                    type="text"
                                    placeholder="ชื่อ / สกุล / รหัสประจำตัว..."
                                    className="w-full h-9 pl-10 pr-4 bg-gray-50/50 dark:bg-[#232429] border border-gray-100 dark:border-[#2a2b36] rounded-lg focus:border-indigo-500 outline-none text-xs font-bold transition-all placeholder:text-[10px] placeholder:font-medium"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="col-span-6 lg:col-span-3">
                            <Select
                                options={classOptions}
                                isClearable
                                placeholder="ชั้นเรียน..."
                                onChange={(val) => setSelectedClassLevel(val ? val.value : '')}
                                styles={{
                                    ...compactSelectStyles,
                                    control: (base: any, state: any) => ({
                                        ...base,
                                        ...compactSelectStyles.control(base, state),
                                        height: '36px',
                                        minHeight: '36px',
                                        borderRadius: '0.6rem',
                                        fontSize: '0.75rem'
                                    }),
                                    valueContainer: (base: any) => ({ ...base, padding: '0 8px' })
                                }}
                            />
                        </div>
                        <div className="col-span-6 lg:col-span-2">
                            <Select
                                options={roomOptions}
                                isClearable
                                placeholder="ห้อง..."
                                value={roomOptions.find(opt => opt.value === selectedRoomNumber)}
                                onChange={(val) => setSelectedRoomNumber(val ? val.value : '')}
                                styles={{
                                    ...compactSelectStyles,
                                    control: (base: any, state: any) => ({
                                        ...base,
                                        ...compactSelectStyles.control(base, state),
                                        height: '36px',
                                        minHeight: '36px',
                                        borderRadius: '0.6rem',
                                        fontSize: '0.75rem'
                                    }),
                                    valueContainer: (base: any) => ({ ...base, padding: '0 8px' })
                                }}
                            />
                        </div>
                        <div className="col-span-12 lg:col-span-3">
                            <button
                                onClick={handlePromotion}
                                disabled={loading || selectedStudents.size === 0}
                                className={`w-full h-9 rounded-lg font-black text-[11px] flex items-center justify-center gap-2 transition-all active:scale-95 ${selectedStudents.size > 0
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-100 dark:border-gray-800'
                                    }`}
                            >
                                {loading ? '...' : `ดำเนินการ ${selectedStudents.size > 0 ? `(${selectedStudents.size} คน)` : ''}`}
                                <FaArrowRight size={9} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 3. Student List Container */}
                <div className="bg-white dark:bg-[#1c1c24] border border-gray-100 dark:border-gray-800 rounded-[2.5rem] overflow-hidden shadow-sm">

                    {/* List Header */}
                    <div className="px-6 sm:px-10 py-5 bg-gray-50/50 dark:bg-[#1a1b21] border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                            <span className="text-xs sm:text-sm font-black text-gray-700 dark:text-gray-200 uppercase tracking-tight">
                                พบทั้งหมด {filteredStudents.length} รายชื่อ
                            </span>
                        </div>
                        <button
                            onClick={toggleAll}
                            className="text-[10px] font-black px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl transition-all uppercase tracking-widest border border-indigo-100 dark:border-indigo-500/20"
                        >
                            {selectedStudents.size === filteredStudents.length ? 'ยกเลิกการเลือก' : 'เลือกทั้งหมด'}
                        </button>
                    </div>

                    {/* Desktop View Table */}
                    <div className="hidden md:block overflow-x-auto">
                        {loading ? (
                            <LoadingState />
                        ) : filteredStudents.length === 0 ? (
                            <EmptyState />
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/50 dark:bg-[#1a1b21] sticky top-0 z-20 border-b border-gray-100 dark:border-gray-800">
                                    <tr>
                                        <th className="pl-10 pr-4 py-4 w-20 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-700 text-indigo-600 transition-all cursor-pointer"
                                                checked={filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length}
                                                onChange={toggleAll}
                                            />
                                        </th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">เลขที่</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">รหัสประจำตัว</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">ชื่อ - นามสกุล</th>
                                        <th className="px-10 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">ชั้น / ห้อง</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                    {currentStudents.map(student => (
                                        <tr
                                            key={student.docId}
                                            onClick={() => toggleStudent(student.docId)}
                                            className={`group cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-indigo-500/5 ${selectedStudents.has(student.docId) ? 'bg-indigo-50/30 dark:bg-indigo-500/10' : ''}`}
                                        >
                                            <td className="pl-10 pr-4 py-5 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded-md border-2 border-gray-300 dark:border-gray-700 text-indigo-600 transition-all cursor-pointer"
                                                    checked={selectedStudents.has(student.docId)}
                                                    onChange={(e) => { e.stopPropagation(); toggleStudent(student.docId); }}
                                                />
                                            </td>
                                            <td className="px-6 py-5 font-bold text-gray-900 dark:text-gray-100 tabular-nums">{student.studentNumber}</td>
                                            <td className="px-6 py-5 text-xs font-mono font-bold text-gray-500 dark:text-gray-400">{student.studentId}</td>
                                            <td className="px-6 py-5 font-extrabold text-gray-800 dark:text-gray-100">{student.firstName} {student.lastName}</td>
                                            <td className="px-10 py-5 text-right font-black text-indigo-600 dark:text-indigo-400 text-lg">
                                                {(CLASS_FULL_NAMES[student.classLevel as keyof typeof CLASS_FULL_NAMES] || student.classLevel).replace('มัธยมศึกษาปีที่', 'ม.')}/{student.roomNumber}
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
                                            <div className="font-black text-gray-900 dark:text-gray-100 leading-tight">
                                                {student.firstName} {student.lastName}
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-400 mt-1 flex gap-2">
                                                <span>เลขที่ {student.studentNumber}</span>
                                                <span>รหัส {student.studentId}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-indigo-600 dark:text-indigo-400 font-black text-lg">
                                            {(CLASS_FULL_NAMES[student.classLevel as keyof typeof CLASS_FULL_NAMES] || student.classLevel).replace('มัธยมศึกษาปีที่', 'ม.')}/{student.roomNumber}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pagination Menu (From StudentListPage.tsx) */}
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
                                        title="หน้าแรก"
                                    >
                                        <ChevronsLeft size={14} />
                                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าแรก</span>
                                    </button>

                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-black text-gray-600 dark:text-gray-400 flex items-center gap-1"
                                        title="ย้อนกลับ"
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
                                        title="ถัดไป"
                                    >
                                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ถัดไป</span>
                                        <ChevronRight size={14} />
                                    </button>

                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-black text-gray-600 dark:text-gray-400 flex items-center gap-1"
                                        title="หน้าสุดท้าย"
                                    >
                                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าสุดท้าย</span>
                                        <ChevronsRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. กฎระเบียบและคำแนะนำ (Promotion Rules) */}
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
                            สถานะจะถูกเปลี่ยนเป็น <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-800/40 rounded-md font-bold text-amber-900 dark:text-amber-300">"สำเร็จการศึกษา"</span> ทันที
                            สำหรับชั้นอื่นๆ ระบบจะทำการปรับระดับขึ้นไปอีก 1 ระดับชั้นตามโครงสร้างมาตรฐานของโรงเรียน
                        </p>
                    </div>
                </div>

                {/* Floating Bottom Button for Mobile */}
                {selectedStudents.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:hidden w-[calc(100%-3rem)]">
                        <button
                            onClick={handlePromotion}
                            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-sm"
                        >
                            ยืนยันเลื่อนชั้น ({selectedStudents.size} รายชื่อ)
                            <FaArrowRight size={10} className="animate-bounce-x" />
                        </button>
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

const LoadingState = () => (
    <div className="h-80 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-100 dark:border-indigo-900/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <p className="text-[12px] font-black text-gray-400 tracking-[0.2em] uppercase animate-pulse">กำลังประมวลผลข้อมูล...</p>
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
