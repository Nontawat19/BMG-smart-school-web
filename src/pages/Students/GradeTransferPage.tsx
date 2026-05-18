import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { collection, getDocs, query, updateDoc, doc, where } from 'firebase/firestore';
import { firestore } from '@/firebase';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { fetchSchoolSettings } from '@/store/slices/schoolSettingsSlice';
import { FaExchangeAlt, FaSearch, FaChevronLeft, FaChevronRight, FaArrowRight } from 'react-icons/fa';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Swal from 'sweetalert2';
import Select from 'react-select';
import { CLASSES } from '@/utils/schoolUtils';
import { isActiveStudentStatus } from '@/utils/studentStatusUtils';

// Dark mode styles for react-select
const selectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isDisabled ? 'var(--select-bg-disabled)' : 'var(--select-bg)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border)',
        boxShadow: state.isFocused ? '0 0 0 1px #6366f1' : 'none',
        '&:hover': {
            borderColor: state.isFocused ? '#6366f1' : 'var(--select-border-hover)'
        },
        height: '46px',
        minHeight: '46px',
        borderRadius: '0.75rem',
        transition: 'all 0.15s ease',
        cursor: state.isDisabled ? 'not-allowed' : 'pointer',
        padding: '0 2px',
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 12px',
        height: '46px',
        display: 'flex',
        alignItems: 'center',
    }),
    singleValue: (base: any) => ({
        ...base,
        color: 'var(--select-text)',
        fontWeight: '700',
        fontSize: '0.9rem',
        margin: 0,
    }),
    placeholder: (base: any) => ({
        ...base,
        color: '#94a3b8',
        fontSize: '0.875rem',
        fontWeight: '500',
        margin: 0,
        whiteSpace: 'nowrap',
    }),
    indicatorsContainer: (base: any) => ({
        ...base,
        height: '46px',
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg)',
        border: '1px solid var(--select-border)',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        padding: '4px',
        zIndex: 100,
        marginTop: '4px',
    }),
    menuList: (base: any) => ({
        ...base,
        maxHeight: '600px', // No scrollbar for configured levels
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
        borderRadius: '0.5rem',
        margin: '2px 0',
        padding: '10px 12px',
        fontWeight: '600',
        fontSize: '0.875rem',
        cursor: 'pointer',
    }),
    input: (base: any) => ({
        ...base,
        color: 'var(--select-text)',
        margin: 0,
        padding: 0,
    }),
    indicatorSeparator: () => ({ display: 'none' }),
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

const GradeTransferPage: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
    const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [selectedLeft, setSelectedLeft] = useState<Set<string>>(new Set());
    const [selectedRight, setSelectedRight] = useState<Set<string>>(new Set());

    const [currentPageLeft, setCurrentPageLeft] = useState(1);
    const itemsPerPage = 30;

    const [toClassLevel, setToClassLevel] = useState<string>('');
    const [toRoomNumber, setToRoomNumber] = useState<string>('');

    const { user } = useSelector((state: RootState) => state.auth);
    const { availableClassOptions, status: settingsStatus } = useSelector((state: RootState) => state.schoolSettings);
    const dispatch = useDispatch();
    const schoolId = (user as any)?.schoolId;

    useEffect(() => {
        if (schoolId && settingsStatus === 'idle') {
            dispatch(fetchSchoolSettings(schoolId) as any);
        }
    }, [schoolId, settingsStatus, dispatch]);

    const classOptions = useMemo(() => {
        return availableClassOptions.map(([val, label]) => ({ value: label, label }));
    }, [availableClassOptions]);

    const roomOptions = useMemo(() => {
        return Array.from({ length: 20 }, (_, i) => ({ value: (i + 1).toString(), label: `ห้อง ${(i + 1)}` }));
    }, []);

    const fetchStudents = async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const studentsRef = collection(firestore, 'school-settings', schoolId, 'students');
            const snap = await getDocs(studentsRef);
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
            })).filter(s => isActiveStudentStatus(s.status));

            setStudents(studentDocs);
        } catch (error) {
            console.error('Error fetching students:', error);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักเรียนได้', 'error');
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

            const cleanClass = String(s.classLevel || '').trim();
            const matchClass = !selectedClassLevel || cleanClass === selectedClassLevel;

            const cleanRoom = String(s.roomNumber || '').trim();
            const targetRoom = String(selectedRoomNumber || '').trim();
            const matchRoom = !selectedRoomNumber || cleanRoom === targetRoom;

            return matchSearch && matchClass && matchRoom;
        }).sort((a, b) => {
            const classA = String(a.classLevel || '');
            const classB = String(b.classLevel || '');
            const classCompare = classA.localeCompare(classB, 'th');
            if (classCompare !== 0) return classCompare;

            const roomA = String(a.roomNumber || '');
            const roomB = String(b.roomNumber || '');
            const roomCompare = roomA.localeCompare(roomB, undefined, { numeric: true });
            if (roomCompare !== 0) return roomCompare;

            const numA = parseInt(a.studentNumber) || 999;
            const numB = parseInt(b.studentNumber) || 999;
            return numA - numB;
        });
    }, [students, searchTerm, selectedClassLevel, selectedRoomNumber]);

    const toggleLeft = (docId: string) => {
        const newSelected = new Set(selectedLeft);
        if (newSelected.has(docId)) newSelected.delete(docId);
        else newSelected.add(docId);
        setSelectedLeft(newSelected);
    };

    const toggleAllLeft = () => {
        if (selectedLeft.size === filteredStudents.length && filteredStudents.length > 0) {
            setSelectedLeft(new Set());
        } else {
            setSelectedLeft(new Set(filteredStudents.map(s => s.docId)));
        }
    };

    const executeTransfer = async () => {
        if (selectedLeft.size === 0) return;
        if (!toClassLevel || !toRoomNumber) {
            Swal.fire('แจ้งเตือน', 'กรุณาระบุระดับชั้นและห้องปลายทางให้ชัดเจน', 'warning');
            return;
        }

        const movingStudents = filteredStudents.filter(s => selectedLeft.has(s.docId));
        
        const confirm = await Swal.fire({
            title: 'ยืนยันการย้ายระดับชั้น?',
            html: `ต้องการย้ายนักเรียน <b>${movingStudents.length}</b> คน ไปยัง <b>${toClassLevel} ห้อง ${toRoomNumber}</b> ใช่หรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการย้าย',
            cancelButtonText: 'ยกเลิก',
        });

        if (!confirm.isConfirmed) return;

        setLoading(true);
        try {
            const movingDocIds = new Set(movingStudents.map(s => s.docId));
            const promises: any[] = [];

            // 1. Identify affected destination room
            const affectedRooms = new Set<string>();
            affectedRooms.add(`${toClassLevel}|${toRoomNumber}`);

            // Add source rooms to affectedRooms to re-order student numbers
            movingStudents.forEach(s => {
                affectedRooms.add(`${s.classLevel}|${s.roomNumber}`);
            });

            // 2. Perform updates
            for (const docId of movingDocIds) {
                const ref = doc(firestore, 'school-settings', schoolId, 'students', docId);
                promises.push(updateDoc(ref, {
                    classLevel: toClassLevel,
                    room: toRoomNumber,
                    roomNumber: toRoomNumber
                }));
            }
            await Promise.all(promises);

            // 3. Re-fetch all students to get the updated state before re-numbering
            const studentsRef = collection(firestore, 'school-settings', schoolId, 'students');
            const snap = await getDocs(studentsRef);
            const allStudentsUpdated = snap.docs.map(doc => ({
                id: doc.data().studentId || doc.id,
                docId: doc.id,
                firstName: doc.data().firstName || '',
                lastName: doc.data().lastName || '',
                classLevel: doc.data().classLevel || '',
                roomNumber: doc.data().room || doc.data().roomNumber || '',
                status: doc.data().status || doc.data().studentStatus || 'active',
            })).filter(s => isActiveStudentStatus(s.status));

            const renumberPromises: any[] = [];
            affectedRooms.forEach(roomKey => {
                const [cLevel, rNum] = roomKey.split('|');
                const roomStudents = allStudentsUpdated.filter(s => s.classLevel === cLevel && s.roomNumber === rNum);
                
                // Sort Alphabetically
                roomStudents.sort((a, b) => a.firstName.localeCompare(b.firstName, 'th') || a.lastName.localeCompare(b.lastName, 'th'));

                roomStudents.forEach((student, index) => {
                    const ref = doc(firestore, 'school-settings', schoolId, 'students', student.docId);
                    renumberPromises.push(updateDoc(ref, { studentNumber: String(index + 1) }));
                });
            });

            await Promise.all(renumberPromises);
            
            Swal.fire('สำเร็จ', 'ย้ายระดับชั้นและจัดเรียงเลขที่ใหม่เรียบร้อย', 'success');
            setSelectedLeft(new Set());
            fetchStudents();
        } catch (error) {
            console.error('Error transferring:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถย้ายระดับชั้นได้', 'error');
        } finally {
            setLoading(false);
        }
    };

    const targetRoomPreview = useMemo(() => {
        if (!toClassLevel || !toRoomNumber) return null;
        return students.filter(s => s.classLevel === toClassLevel && s.roomNumber === toRoomNumber)
            .sort((a, b) => (parseInt(a.studentNumber) || 999) - (parseInt(b.studentNumber) || 999));
    }, [students, toClassLevel, toRoomNumber]);

    const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));

    useEffect(() => {
        const observer = new MutationObserver(() => setIsDarkMode(document.documentElement.classList.contains('dark')));
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    const darkVariables = {
        '--select-bg': isDarkMode ? '#2a2b2f' : '#f8fafc',
        '--select-bg-disabled': isDarkMode ? '#1e1e24' : '#f1f5f9',
        '--select-border': isDarkMode ? '#374151' : '#e2e8f0',
        '--select-border-hover': isDarkMode ? '#4b5563' : '#cbd5e1',
        '--select-menu-bg': isDarkMode ? 'rgba(28, 28, 36, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        '--select-option-hover': isDarkMode ? '#374151' : '#f1f5f9',
        '--select-text': isDarkMode ? '#f3f4f6' : '#1e293b',
    } as React.CSSProperties;

    return (
        <MainLayout>
            <div className="p-4 sm:p-8 space-y-6" style={darkVariables}>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-4 mb-2">
                        <BackButton to="/academic/hub/students" />
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl shadow-sm">
                                <FaExchangeAlt size={20} />
                            </div>
                            ระบบย้ายชั้นนักเรียน
                        </h1>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 max-w-2xl text-sm leading-relaxed border-l-4 border-indigo-500 pl-4 py-1 ml-14">
                        ใช้สำหรับย้ายนักเรียนข้ามระดับชั้น เช่น ย้ายจาก ม.5 ไป ม.4 หรือเลื่อนชั้น/ลดชั้นตามความเหมาะสม
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Source Section */}
                    <div className="lg:col-span-5 bg-white dark:bg-[#1c1c24] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">1</span>
                            เลือกห้องเรียนต้นทาง
                        </h2>

                        <div className="space-y-4 mb-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 block">ระดับชั้น</label>
                                    <Select options={classOptions} isClearable placeholder="เลือกชั้น..." onChange={(val) => setSelectedClassLevel(val ? val.value : '')} styles={selectStyles} />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 block">ห้อง</label>
                                    <Select options={roomOptions} isClearable placeholder="เลือกห้อง..." onChange={(val) => setSelectedRoomNumber(val ? val.value : '')} styles={selectStyles} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 block">ค้นหารายชื่อ</label>
                                <div className="relative">
                                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="text" placeholder="ค้นหาชื่อ..." className="w-full pl-11 pr-4 h-[46px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm font-bold transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden min-h-[400px] flex flex-col bg-gray-50/30 dark:bg-white/5">
                            <div className="overflow-y-auto max-h-[500px]">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-[#2a2b2f] sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 w-12 text-center">
                                                <input type="checkbox" className="rounded w-4 h-4" checked={filteredStudents.length > 0 && selectedLeft.size === filteredStudents.length} onChange={toggleAllLeft} />
                                            </th>
                                            <th className="p-3 text-left font-bold text-gray-500">เลขที่</th>
                                            <th className="p-3 text-left font-bold text-gray-500">รหัส</th>
                                            <th className="p-3 text-left font-bold text-gray-500">ชื่อ - สกุล</th>
                                            <th className="p-3 text-right font-bold text-gray-500">ชั้นเรียน</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {filteredStudents.map(s => (
                                            <tr key={s.docId} className={`hover:bg-indigo-50/50 dark:hover:bg-white/5 cursor-pointer transition-colors ${selectedLeft.has(s.docId) ? 'bg-indigo-50/80 dark:bg-indigo-500/10' : ''}`} onClick={() => toggleLeft(s.docId)}>
                                                <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                                    <input type="checkbox" className="rounded w-4 h-4" checked={selectedLeft.has(s.docId)} onChange={() => toggleLeft(s.docId)} />
                                                </td>
                                                <td className="p-3 text-gray-400 font-medium">{s.studentNumber || '-'}</td>
                                                <td className="p-3 text-gray-500 font-medium">{s.studentId}</td>
                                                <td className="p-3 font-bold text-gray-800 dark:text-gray-200">{s.firstName} {s.lastName}</td>
                                                <td className="p-3 text-right">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                                        {s.classLevel}/{s.roomNumber}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredStudents.length === 0 && (
                                    <div className="py-20 text-center">
                                        <p className="text-gray-400 font-medium">ไม่พบข้อมูลนักเรียน</p>
                                        <p className="text-xs text-gray-400">กรุณาเลือกชั้นและห้องที่ต้องการ</p>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 mt-auto border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1c1c24] flex justify-between items-center">
                                <span className="text-sm text-gray-500 font-medium">ทั้งหมด {filteredStudents.length} คน</span>
                                <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full shadow-sm">
                                    เลือกแล้ว {selectedLeft.size} คน
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Action Arrow */}
                    <div className="lg:col-span-2 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg animate-bounce lg:animate-none lg:rotate-0 rotate-90">
                                <FaArrowRight size={20} />
                            </div>
                            <button
                                onClick={executeTransfer}
                                disabled={selectedLeft.size === 0 || !toClassLevel || !toRoomNumber || loading}
                                className={`px-8 py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all duration-300 shadow-xl ${selectedLeft.size > 0 && toClassLevel && toRoomNumber ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed opacity-50'}`}
                            >
                                {loading ? 'กำลังดำเนินการ...' : 'ยืนยันการย้าย'}
                            </button>
                        </div>
                    </div>

                    {/* Destination Section */}
                    <div className="lg:col-span-5 bg-white dark:bg-[#1c1c24] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 flex flex-col">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 flex items-center justify-center font-bold text-sm">2</span>
                            เลือกห้องเรียนปลายทาง
                        </h2>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 block">ระดับชั้นใหม่</label>
                                <Select options={classOptions} placeholder="เลือกชั้น..." onChange={(val) => setToClassLevel(val ? val.value : '')} styles={selectStyles} />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 block">ห้องใหม่</label>
                                <Select options={roomOptions} placeholder="เลือกห้อง..." onChange={(val) => setToRoomNumber(val ? val.value : '')} styles={selectStyles} />
                            </div>
                        </div>

                        <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden min-h-[400px] flex-grow flex flex-col bg-gray-50/30 dark:bg-white/5">
                            <div className="p-3 bg-gray-50 dark:bg-[#2a2b2f] font-bold text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                                รายชื่อนักเรียนปัจจุบันในห้องปลายทาง
                            </div>
                            <div className="overflow-y-auto max-h-[500px] flex-grow">
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {targetRoomPreview?.map(s => (
                                            <tr key={s.docId}>
                                                <td className="p-3 w-12 text-center text-gray-400 font-medium">{s.studentNumber || '-'}</td>
                                                <td className="p-3 text-gray-500 font-medium">{s.studentId}</td>
                                                <td className="p-3 font-bold text-gray-700 dark:text-gray-300">{s.firstName} {s.lastName}</td>
                                                <td className="p-3 text-right">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400">
                                                        {s.classLevel}/{s.roomNumber}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!targetRoomPreview || targetRoomPreview.length === 0) && (
                                            <tr>
                                                <td className="py-20 text-center" colSpan={4}>
                                                    <p className="text-gray-400 font-medium">
                                                        {(!toClassLevel || !toRoomNumber) ? 'ระบุห้องปลายทางเพื่อดูรายชื่อ' : 'ยังไม่มีนักเรียนในห้องนี้'}
                                                    </p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {targetRoomPreview && (
                                <div className="p-4 mt-auto border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1c1c24] flex justify-between items-center">
                                    <span className="text-sm text-gray-500 font-medium">นักเรียนเดิม</span>
                                    <span className="px-3 py-1 bg-pink-600 text-white text-xs font-bold rounded-full shadow-sm">
                                        {targetRoomPreview.length} คน
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default GradeTransferPage;
