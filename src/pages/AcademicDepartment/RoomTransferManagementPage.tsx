import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { collection, getDocs, query, updateDoc, doc } from 'firebase/firestore';
import { firestore } from '@/firebase';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { fetchSchoolSettings } from '@/store/slices/schoolSettingsSlice';
import { FaExchangeAlt, FaSearch, FaCheckCircle, FaTimesCircle, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import Swal from 'sweetalert2';
import Select from 'react-select';
import { CLASS_FULL_NAMES, CLASSES } from '@/utils/schoolUtils';

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
    docId: string; // The firestore document ID
    schoolId: string;
    studentNumber: string;
    studentId: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    roomNumber: string;
    status: string;
}

const RoomTransferManagementPage: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
    const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [selectedLeft, setSelectedLeft] = useState<Set<string>>(new Set());
    const [selectedRight, setSelectedRight] = useState<Set<string>>(new Set());

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
        return availableClassOptions.map(([val, label]) => ({ value: val, label }));
    }, [availableClassOptions]);

    const roomOptions = useMemo(() => {
        return Array.from({ length: 20 }, (_, i) => ({ value: (i + 1).toString(), label: `ห้อง ${(i + 1)}` }));
    }, []);

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
                studentNumber: doc.data().studentNumber || doc.data().number || doc.data().no || '-',
                studentId: doc.data().studentId || '-',
                firstName: doc.data().firstName || '',
                lastName: doc.data().lastName || '',
                classLevel: doc.data().classLevel || '',
                roomNumber: doc.data().room || doc.data().roomNumber || '',
                status: doc.data().status || doc.data().studentStatus || 'active',
            })).filter(s => s.status === 'active' || s.status === 'ปกติ' || s.status === 'เรียนอยู่');

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

    useEffect(() => {
        if (selectedClassLevel) {
            setToClassLevel(selectedClassLevel);
        } else {
            setToClassLevel('');
        }
    }, [selectedClassLevel]);

    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
            const sid = (s.studentId || '').toLowerCase();
            const sterm = searchTerm.toLowerCase().trim();
            const matchSearch = sterm === '' || fullName.includes(sterm) || sid.includes(sterm);

            // Match class by key (p1, m1) OR display name (ป.1, ม.1)
            const cleanClass = String(s.classLevel || '').trim();
            const matchClass = !selectedClassLevel ||
                cleanClass === selectedClassLevel ||
                cleanClass === CLASSES[selectedClassLevel];

            // Match room by exact match OR handle slashes (e.g., "1/2" matching "2")
            const cleanRoom = String(s.roomNumber || '').trim();
            const targetRoom = String(selectedRoomNumber || '').trim();
            const matchRoom = !selectedRoomNumber ||
                cleanRoom === targetRoom ||
                cleanRoom === targetRoom.padStart(2, '0') ||
                cleanRoom.endsWith('/' + targetRoom);

            return matchSearch && matchClass && matchRoom;
        }).sort((a, b) => {
            // Priority 1: Class level
            const classA = String(a.classLevel || '');
            const classB = String(b.classLevel || '');
            const classCompare = classA.localeCompare(classB, 'th');
            if (classCompare !== 0) return classCompare;

            // Priority 2: Room Number (Alphabetically or Numerically)
            const roomA = String(a.roomNumber || '');
            const roomB = String(b.roomNumber || '');
            const roomCompare = roomA.localeCompare(roomB, undefined, { numeric: true, sensitivity: 'base' });
            if (roomCompare !== 0) return roomCompare;

            // Priority 3: Student Number
            const getNum = (val: string | number) => {
                if (!val || val === '-') return 999999;
                const m = String(val).match(/\d+/);
                return m ? parseInt(m[0], 10) : 999999;
            };
            const numA = getNum(a.studentNumber);
            const numB = getNum(b.studentNumber);

            if (numA !== numB) {
                return numA - numB;
            }

            // Priority 4: First Name (if numbers are identical or both missing/999999)
            return (a.firstName || '').localeCompare(b.firstName || '', 'th');
        });
    }, [students, searchTerm, selectedClassLevel, selectedRoomNumber]);

    // Left Toggles
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

    // Right Toggles
    const toggleRight = (docId: string) => {
        const newSelected = new Set(selectedRight);
        if (newSelected.has(docId)) newSelected.delete(docId);
        else newSelected.add(docId);
        setSelectedRight(newSelected);
    };

    const toggleAllRight = () => {
        const rightList = targetRoomPreview?.studentsList || [];
        if (selectedRight.size === rightList.length && rightList.length > 0) {
            setSelectedRight(new Set());
        } else {
            setSelectedRight(new Set(rightList.map(s => s.docId)));
        }
    };

    const executeTransfer = async (movingStudents: any[], isMovingRight: boolean) => {
        const destClass = isMovingRight ? toClassLevel : selectedClassLevel;
        const destRoom = isMovingRight ? toRoomNumber : selectedRoomNumber;

        if (!destClass || !destRoom) {
            Swal.fire('แจ้งเตือน', 'กรุณาระบุระดับชั้นและห้องปลายทางให้ชัดเจน', 'warning');
            return false;
        }

        // 1. Identify all affected rooms (Class + Room keys)
        const affectedRooms = new Set<string>();
        // Add Destination Room
        affectedRooms.add(`${destClass}|${destRoom}`);

        // Add Source Rooms from moving students
        movingStudents.forEach(s => {
            const cStr = String(s.classLevel || '').trim();
            const rStr = String(s.roomNumber || '').trim();
            if (cStr && rStr) affectedRooms.add(`${cStr}|${rStr}`);
        });

        const confirm = await Swal.fire({
            title: isMovingRight ? 'ยืนยันการย้ายห้องไปปลายทาง?' : 'ยืนยันการย้ายกลับห้องต้นทาง?',
            html: `
                <div class="text-left text-gray-700 dark:text-gray-300">
                    <p>ต้องการย้ายนักเรียน <b>${movingStudents.length}</b> คน ไปยัง <b>${(CLASS_FULL_NAMES as any)[destClass] || destClass} ห้อง ${destRoom}</b> ใช่หรือไม่?</p>
                    <div class="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 rounded-lg text-sm border border-indigo-100 dark:border-indigo-800/30">
                        <p class="font-bold mb-1"><i class="fas fa-magic"></i> ระบบจะรันเลขที่ใหม่อัตโนมัติ</p>
                        <ul class="list-disc pl-5">
                            <li>เรียงตามตัวอักษรของชื่อนักเรียน (ก-ฮ) เหมือนระบบ DMC</li>
                            <li>จัดเรียงใหม่พร้อมกันทั้ง <b>ห้องที่ย้ายไป</b> และ <b>ห้องเดิม</b></li>
                        </ul>
                    </div>
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการย้าย',
            cancelButtonText: 'ยกเลิก',
        });

        if (!confirm.isConfirmed) return false;

        setLoading(true);
        try {
            const movingDocIds = new Set(movingStudents.map(s => s.docId));

            // Create a copy of all students with the new class/room assigned to the moving ones
            let updatedAllStudents = students.map(s => {
                if (movingDocIds.has(s.docId)) {
                    return { ...s, classLevel: destClass, room: destRoom, roomNumber: destRoom };
                }
                return { ...s };
            });

            const promises: any[] = [];

            // 2. For each affected room, sort all students in it alphabetically and assign 1..N
            affectedRooms.forEach(roomKey => {
                const [cLevel, rNum] = roomKey.split('|');

                let roomStudents = updatedAllStudents.filter(s => {
                    const c = String(s.classLevel || '').trim();
                    const mClass = c === cLevel || c === (CLASS_FULL_NAMES as any)[cLevel] || c === (CLASSES as any)[cLevel];
                    const r = String(s.roomNumber || '').trim();
                    const mRoom = r === rNum || r === rNum.padStart(2, '0') || r.endsWith('/' + rNum);
                    return mClass && mRoom;
                });

                // Sort Alphabetically
                roomStudents.sort((a, b) => a.firstName.localeCompare(b.firstName, 'th') || a.lastName.localeCompare(b.lastName, 'th'));

                // Assign numbers and queue updates
                roomStudents.forEach((student, index) => {
                    const newNumber = String(index + 1);
                    const ref = doc(firestore, 'school-settings', schoolId, 'students', student.docId);

                    const updateData: any = { studentNumber: newNumber };
                    // If this is a moving student, also update their room info
                    if (movingDocIds.has(student.docId)) {
                        updateData.classLevel = destClass;
                        updateData.room = destRoom;
                        updateData.roomNumber = destRoom;
                    }

                    promises.push(updateDoc(ref, updateData));
                });
            });

            await Promise.all(promises);
            Swal.fire('สำเร็จ', 'ย้ายห้องและจัดเรียงเลขที่ใหม่เรียบร้อย', 'success');
            return true;
        } catch (error) {
            console.error('Error transferring:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถย้ายห้องได้ โปรดลองอีกครั้ง', 'error');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handleTransferToRight = async () => {
        if (selectedLeft.size === 0) return;
        if (!toClassLevel || !toRoomNumber) {
            Swal.fire('แจ้งเตือน', 'กรุณาเลือกระดับชั้นและห้องปลายทาง', 'warning');
            return;
        }

        const selectedList = filteredStudents.filter(s => selectedLeft.has(s.docId));
        const invalidClasses = selectedList.filter(s => {
            const cleanClass = String(s.classLevel || '').trim();
            return cleanClass !== toClassLevel &&
                cleanClass !== (CLASS_FULL_NAMES as any)[toClassLevel] &&
                cleanClass !== (CLASSES as any)[toClassLevel];
        });

        if (invalidClasses.length > 0) {
            Swal.fire('แจ้งเตือน', 'การย้ายห้องต้องอยู่ในระดับชั้นเดียวกันเท่านั้น (ห้ามย้ายข้ามระดับชั้น)', 'warning');
            return;
        }

        const success = await executeTransfer(selectedList, true);
        if (success) {
            setSelectedLeft(new Set());
            fetchStudents();
        }
    };

    const handleTransferToLeft = async () => {
        if (selectedRight.size === 0) return;
        if (!selectedClassLevel || !selectedRoomNumber) {
            Swal.fire('แจ้งเตือน', 'กรุณาระบุระดับชั้นและห้องของฝั่งต้นทาง (ซ้าย) ให้ชัดเจนก่อนย้ายกลับ', 'warning');
            return;
        }

        const rightList = targetRoomPreview?.studentsList || [];
        const listToMove = rightList.filter(s => selectedRight.has(s.docId));

        const invalidClasses = listToMove.filter(s => {
            const cleanClass = String(s.classLevel || '').trim();
            return cleanClass !== selectedClassLevel &&
                cleanClass !== (CLASS_FULL_NAMES as any)[selectedClassLevel] &&
                cleanClass !== (CLASSES as any)[selectedClassLevel];
        });

        if (invalidClasses.length > 0) {
            Swal.fire('แจ้งเตือน', 'การย้ายกลับห้องต้นทางต้องอยู่ในระดับชั้นเดียวกันกับของเดิมเท่านั้น (ห้ามย้ายข้ามระดับชั้น)', 'warning');
            return;
        }

        const success = await executeTransfer(listToMove, false);
        if (success) {
            setSelectedRight(new Set());
            fetchStudents();
        }
    };

    const targetRoomPreview = useMemo(() => {
        if (!toClassLevel || !toRoomNumber) return null;
        let targetStudents = students.filter(s => {
            const cleanClass = String(s.classLevel || '').trim();
            const matchClass = cleanClass === toClassLevel || cleanClass === (CLASS_FULL_NAMES as any)[toClassLevel] || cleanClass === (CLASSES as any)[toClassLevel];

            const cleanRoom = String(s.roomNumber || '').trim();
            const targetRoomStr = String(toRoomNumber || '').trim();
            const matchRoom = cleanRoom === targetRoomStr ||
                cleanRoom === targetRoomStr.padStart(2, '0') ||
                cleanRoom.endsWith('/' + targetRoomStr);

            return matchClass && matchRoom;
        });
        const getNum = (val: string | number) => {
            if (!val || val === '-') return 999999;
            const m = String(val).match(/\d+/);
            return m ? parseInt(m[0], 10) : 999999;
        };
        const maxNumber = targetStudents.reduce((max, s) => {
            const num = getNum(s.studentNumber);
            return num !== 999999 ? Math.max(max, num) : max;
        }, 0);

        targetStudents = targetStudents.sort((a, b) => {
            const numA = getNum(a.studentNumber);
            const numB = getNum(b.studentNumber);
            if (numA === 999999 && numB === 999999) {
                return (a.firstName || '').localeCompare(b.firstName || '', 'th');
            }
            return numA - numB;
        });

        return {
            currentCount: targetStudents.length,
            nextStartNumber: maxNumber + 1,
            studentsList: targetStudents
        };
    }, [students, toClassLevel, toRoomNumber]);


    // Helper to determine if dark mode is active (needed for custom inline styling approach if css vars are not set globally)
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

    // Setup dynamic CSS variables for the select styling based on current theme
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
                <div className="flex flex-col gap-2">
                    <BackButton to="/academic-admin" className="mb-4" />
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
                        <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl shadow-sm">
                            <FaExchangeAlt size={24} />
                        </div>
                        จัดการระบบย้ายห้อง
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-2xl text-sm leading-relaxed border-l-4 border-indigo-500 pl-4 py-1">
                        ระบบย้ายนักเรียนใช้สำหรับย้ายนักเรียนจากห้องเรียนเดิมไปยังห้องเรียนใหม่ สามารถเลือกนักเรียนได้หลายคนพร้อมกันในคราวเดียว
                    </p>
                </div>

                <div className="flex flex-col xl:flex-row gap-6 items-stretch">
                    {/* ข้อมูลต้นทาง */}
                    <div className="flex-1 min-w-[300px] xl:w-5/12 bg-white dark:bg-[#1c1c24] rounded-2xl shadow-sm shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800 p-6">
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">1</div>
                            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ห้องเดิม (ต้นทาง)</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
                            <div className="md:col-span-12 lg:col-span-5">
                                <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 mb-2 block ml-1">ค้นหานักเรียน</label>
                                <div className="relative group">
                                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500/50 group-focus-within:text-indigo-500 transition-colors" size={14} />
                                    <input
                                        type="text"
                                        placeholder="ชื่อ / สกุล / รหัส..."
                                        className="w-full pl-11 pr-4 h-[46px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#2a2b2f] rounded-[0.75rem] focus:bg-white dark:focus:bg-[#1c1c24] focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-sm text-slate-700 dark:text-slate-200"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="md:col-span-6 lg:col-span-3">
                                <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 mb-2 block ml-1">ระดับชั้น</label>
                                <Select
                                    options={classOptions}
                                    isClearable
                                    placeholder="เลือกชั้น..."
                                    onChange={(val) => setSelectedClassLevel(val ? val.value : '')}
                                    styles={selectStyles}
                                />
                            </div>
                            <div className="md:col-span-6 lg:col-span-4">
                                <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 mb-2 block ml-1">ห้องเรียนเดิม</label>
                                <Select
                                    options={roomOptions}
                                    isClearable
                                    placeholder="เลือกห้อง..."
                                    onChange={(val) => setSelectedRoomNumber(val ? val.value : '')}
                                    styles={selectStyles}
                                />
                            </div>
                        </div>

                        <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden flex flex-col h-[500px] shadow-sm bg-gray-50/50 dark:bg-white/5 relative">
                            {/* Decorative Top Gradient */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50 z-20"></div>

                            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 hover:scrollbar-thumb-indigo-500/50">
                                {loading ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                                        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                        <p className="font-medium animate-pulse">กำลังโหลดข้อมูลนักเรียน...</p>
                                    </div>
                                ) : filteredStudents.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 animate-in fade-in duration-300">
                                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                                            <FaSearch className="text-3xl opacity-40 text-gray-500" />
                                        </div>
                                        <p className="font-bold text-gray-600 dark:text-gray-300">ไม่พบข้อมูลนักเรียน</p>
                                        <p className="text-sm mt-1">ลองเปลี่ยนเงื่อนไขการค้นหาดูอีกครั้ง</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 dark:bg-[#2a2b2f] sticky top-0 shadow-sm z-10">
                                            <tr>
                                                <th className="px-4 py-3 w-16 text-center">
                                                    <div className="flex items-center justify-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                                            checked={filteredStudents.length > 0 && selectedLeft.size === filteredStudents.length}
                                                            onChange={toggleAllLeft}
                                                            title="เลือกทั้งหมด"
                                                        />
                                                    </div>
                                                </th>
                                                <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">เลขที่</th>
                                                <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">รหัส</th>
                                                <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">ชื่อ - สกุล</th>
                                                <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">ชั้นเรียน</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {filteredStudents.map((student) => (
                                                <tr
                                                    key={student.docId}
                                                    className={`hover:bg-indigo-50 dark:hover:bg-white/5 cursor-pointer transition-colors ${selectedLeft.has(student.docId) ? 'bg-indigo-50/50 dark:bg-white/5' : ''}`}
                                                    onClick={() => toggleLeft(student.docId)}
                                                >
                                                    <td className="px-4 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer mt-1"
                                                            checked={selectedLeft.has(student.docId)}
                                                            onChange={(e) => { e.stopPropagation(); toggleLeft(student.docId); }}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{student.studentNumber}</td>
                                                    <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-300">{student.studentId}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{student.firstName} {student.lastName}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="inline-flex px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-xs font-bold text-gray-600 dark:text-gray-300 tracking-wider">
                                                            {CLASS_FULL_NAMES[student.classLevel as keyof typeof CLASS_FULL_NAMES] || student.classLevel}/{student.roomNumber}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-gray-50/90 dark:bg-[#1c1c24]/90 backdrop-blur-md sticky bottom-0 border-t border-gray-200 dark:border-gray-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                                            <tr>
                                                <td colSpan={5} className="py-3 px-4 text-center">
                                                    <span className="text-gray-600 dark:text-gray-400 font-medium">
                                                        เลือกแล้ว <strong className="text-indigo-600 dark:text-indigo-400 text-lg mx-1">{selectedLeft.size}</strong> คน
                                                        จากทั้งหมด {filteredStudents.length} คน
                                                    </span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ปลายทาง */}

                    {/* Middle Action Bridge */}
                    <div className="flex flex-col justify-center items-center py-4 xl:py-10 shrink-0 self-center w-[100px] xl:w-[60px] z-10 xl:sticky xl:top-24">
                        <div className="flex xl:flex-col items-center gap-3 p-1.5 sm:p-2 bg-white/80 dark:bg-[#1e1f21]/80 backdrop-blur-md rounded-full border border-gray-100 dark:border-gray-800 shadow-sm">
                            <button
                                onClick={handleTransferToRight}
                                disabled={selectedLeft.size === 0 || !toClassLevel || !toRoomNumber || loading}
                                className={`relative flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full transition-all duration-300 group
                                    ${selectedLeft.size === 0 || !toClassLevel || !toRoomNumber || loading
                                        ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-300 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                                        : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:scale-110 active:scale-95 shadow-[0_0_20px_rgba(99,102,241,0.4)] dark:shadow-[0_0_25px_rgba(99,102,241,0.3)] animate-pulse-subtle'}`}
                                title="ย้ายไปห้องปลายทาง"
                            >
                                <FaChevronRight className="text-xl sm:text-2xl rotate-90 xl:rotate-0 translate-x-px group-hover:translate-x-1.5 transition-transform duration-300" />
                                {selectedLeft.size > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-900 text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 animate-in zoom-in shadow-sm">
                                        {selectedLeft.size}
                                    </span>
                                )}</button>

                            <div className="hidden xl:block w-8 h-px bg-gray-200/50 dark:bg-gray-800/80"></div>
                            <div className="xl:hidden w-px h-8 bg-gray-200/50 dark:bg-gray-800/80"></div>

                            <button
                                onClick={handleTransferToLeft}
                                disabled={selectedRight.size === 0 || !selectedClassLevel || !selectedRoomNumber || loading}
                                className={`relative flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full transition-all duration-300 group
                                    ${selectedRight.size === 0 || !selectedClassLevel || !selectedRoomNumber || loading
                                        ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-300 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                                        : 'bg-gradient-to-br from-rose-500 to-pink-600 text-white hover:scale-110 active:scale-95 shadow-[0_0_20px_rgba(244,63,94,0.4)] dark:shadow-[0_0_25px_rgba(244,63,94,0.3)] animate-pulse-subtle'}`}
                                title="ย้ายกลับห้องต้นทาง"
                            >
                                <FaChevronLeft className="text-xl sm:text-2xl rotate-90 xl:rotate-0 -translate-x-px group-hover:-translate-x-1.5 transition-transform duration-300" />
                                {selectedRight.size > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-indigo-400 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 animate-in zoom-in shadow-sm">
                                        {selectedRight.size}
                                    </span>
                                )}</button>
                        </div>
                    </div>

                    {/* ปลายทาง */}
                    <div className="flex-1 min-w-[300px] xl:w-5/12 flex flex-col gap-6 xl:sticky xl:top-24">
                        <div className="bg-white dark:bg-[#1c1c24] rounded-2xl shadow-sm shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800 p-6 flex flex-col flex-1">
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                                <div className="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 flex items-center justify-center font-bold">2</div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ห้องใหม่ (ปลายทาง)</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 mb-2 block ml-1">ระดับชั้น (ใหม่)</label>
                                    <Select
                                        options={classOptions}
                                        value={selectedClassLevel ? classOptions.find(opt => opt.value === selectedClassLevel) : (toClassLevel ? classOptions.find(opt => opt.value === toClassLevel) : null)}
                                        isDisabled={!!selectedClassLevel}
                                        placeholder={selectedClassLevel ? 'ล็อคตามห้องต้นทาง' : 'เลือกระดับชั้น...'}
                                        onChange={(val) => setToClassLevel(val ? val.value : '')}
                                        styles={selectStyles}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 mb-2 block ml-1">ห้อง (ใหม่)</label>
                                    <Select
                                        options={roomOptions}
                                        isClearable
                                        placeholder="เลือกห้อง..."
                                        onChange={(val) => setToRoomNumber(val ? val.value : '')}
                                        styles={selectStyles}
                                    />
                                </div>
                            </div>

                            {/* แสดงนักเรียนปลายทาง */}
                            <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden flex flex-col h-[500px] shadow-sm bg-gray-50/50 dark:bg-white/5 relative">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-rose-500 opacity-50 z-20"></div>

                                <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 hover:scrollbar-thumb-pink-500/50">
                                    {!targetRoomPreview ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                                            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                                                <FaSearch className="text-3xl opacity-40 text-gray-500" />
                                            </div>
                                            <p className="font-bold text-gray-600 dark:text-gray-300">ระบุห้องปลายทาง</p>
                                            <p className="text-sm mt-1">กรุณาเลือกระดับชั้นและห้องเรียน</p>
                                        </div>
                                    ) : targetRoomPreview.studentsList.length === 0 && selectedLeft.size === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                                            <p className="font-bold text-gray-600 dark:text-gray-300">ไม่มีนักเรียนในห้องนี้</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 dark:bg-[#2a2b2f] sticky top-0 shadow-sm z-10">
                                                <tr>
                                                    <th className="px-4 py-3 w-16 text-center">
                                                        <div className="flex items-center justify-center">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500 cursor-pointer"
                                                                checked={targetRoomPreview && targetRoomPreview.studentsList.length > 0 && selectedRight.size === targetRoomPreview.studentsList.length}
                                                                onChange={toggleAllRight}
                                                                title="เลือกทั้งหมด"
                                                            />
                                                        </div>
                                                    </th>
                                                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 w-16 text-center">เลขที่</th>
                                                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">ชื่อ - สกุล</th>
                                                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">ชั้นเรียน</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {targetRoomPreview.studentsList.map((student) => (
                                                    <tr key={student.docId} className={`hover:bg-pink-50 dark:hover:bg-white/5 cursor-pointer transition-colors ${selectedRight.has(student.docId) ? 'bg-pink-50/50 dark:bg-white/5' : ''}`} onClick={() => toggleRight(student.docId)}>
                                                        <td className="px-4 py-3 text-center">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500 cursor-pointer mt-1"
                                                                checked={selectedRight.has(student.docId)}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleRight(student.docId);
                                                                }}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400 font-bold">{student.studentNumber}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{student.firstName} {student.lastName}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="inline-flex px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-xs font-bold text-gray-600 dark:text-gray-300 tracking-wider">
                                                                {CLASS_FULL_NAMES[student.classLevel as keyof typeof CLASS_FULL_NAMES] || student.classLevel}/{student.roomNumber}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {/* จำลองรายการใหม่จากการเลือกฝั่งซ้าย */}
                                                {selectedLeft.size > 0 && Array.from(selectedLeft).map((docId, index) => {
                                                    const s = filteredStudents.find(fs => fs.docId === docId);
                                                    if (!s) return null;
                                                    return (
                                                        <tr key={`new-${docId}`} className="bg-indigo-50/80 dark:bg-indigo-500/10 border-l-4 border-indigo-500">
                                                            <td className="px-4 py-3 text-center text-indigo-600 dark:text-indigo-400 font-black animate-pulse" colSpan={2}>
                                                                {targetRoomPreview.nextStartNumber + index}
                                                            </td>
                                                            <td className="px-4 py-3 font-medium text-indigo-900 dark:text-indigo-200 line-through decoration-indigo-300/50">{s.firstName} {s.lastName}</td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className="inline-flex flex-col items-end gap-1">
                                                                    <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">ย้ายมาใหม่</span>
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                            <tfoot className="bg-gray-50/90 dark:bg-[#1c1c24]/90 backdrop-blur-md sticky bottom-0 border-t border-gray-200 dark:border-gray-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                                                <tr>
                                                    <td colSpan={4} className="py-3 px-4 text-center">
                                                        <span className="text-gray-600 dark:text-gray-400 font-medium">
                                                            รวมทั้งหมด <strong className="text-pink-600 dark:text-pink-400 text-lg mx-1">{targetRoomPreview.studentsList.length + selectedLeft.size}</strong> คน
                                                        </span>
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default RoomTransferManagementPage;
