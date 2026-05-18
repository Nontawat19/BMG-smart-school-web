import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
<<<<<<< HEAD
import { useSelector, useDispatch } from 'react-redux';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { RootState } from '@/store';
import { firestore as db } from '@/firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, getDocs, serverTimestamp, query, where } from 'firebase/firestore';
import { Save, Zap, Search, ChevronDown, Lock, Unlock, Settings, Filter, Info, BookOpen, X, Check, Book, CalendarX, ChevronLeft, ChevronRight, User, Users } from 'lucide-react';
import MainLayout from "@/layouts/MainLayout";
import BackButton from '@/components/Shared/BackButton';
import Swal from 'sweetalert2';
import { useTheme } from '@/ThemeContext';
import { isAcademicCourse, getPartnerIndex } from './utils';
import { getCurrentThaiYear } from '@/utils/dateUtils';

interface TeacherAssignment {
    groupNumber: number;
    teacherId: string;
    roomIds: string[];
    classLevels?: string[];
}

interface CourseAssignmentDoc {
    id: string;
    courseId: string;
    academicYear: string;
    semester: string;
    teacherAssignments: TeacherAssignment[];
=======
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { firestore as db } from '@/firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, getDocs, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Save, Zap, Search, ChevronDown, Lock, Unlock, Settings, Filter, Info, BookOpen, X, Check, Book, CalendarX, ChevronLeft, ChevronRight, User, Users } from 'lucide-react';
import MainLayout from "@/layouts/MainLayout";
import Swal from 'sweetalert2';
import { useTheme } from '@/ThemeContext';
import { isAcademicCourse, getPartnerIndex } from './utils';

interface GroupAssignment {
    groupNumber: number;
    teacherId: string;
    roomIds: string[];
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
}

interface Course {
    id: string;
    code: string;
    title: string;
    classId: string;
    room?: string;
    subjectGroup?: string;
    semester?: string | number;
    hoursPerWeek?: number;
    credits?: number | string;
    type?: string;
<<<<<<< HEAD
=======
    teacherAssignments?: GroupAssignment[];
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
}

interface Teacher {
    id: string;
    name: string;
}

interface AssignmentRow extends Course {
<<<<<<< HEAD
    assignment: TeacherAssignment;
    academicYear: string;
    semester: string;
    compositeId: string; // courseId + "_" + groupNumber
=======
    assignment: GroupAssignment;
    compositeId: string; // course.id + "_" + groupNumber
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
}

interface PeriodConstraint {
    type: 'any' | 'single' | 'double' | 'mixed';
    isLocked: boolean;
    lockedSlots?: string[];
    doublePreference?: 'any' | 'morning' | 'afternoon';
    singlePreference?: 'any' | 'morning' | 'afternoon';
    excludedDays?: string[];
}

interface PeriodSettingItem {
    id: string; label: string; startTime: string; endTime: string; isTeachingPeriod: boolean; isFixed?: boolean;
}

interface SpecialPeriodItem {
    id: string; title: string; startTime: string; endTime: string; day?: string; linkedPeriodId?: string;
}

const DAYS = [
    { key: 'mon', label: 'จันทร์' },
    { key: 'tue', label: 'อังคาร' },
    { key: 'wed', label: 'พุธ' },
    { key: 'thu', label: 'พฤหัสบดี' },
    { key: 'fri', label: 'ศุกร์' },
];

const DEFAULT_PERIODS: PeriodSettingItem[] = [
    { id: 'homeroom', label: 'โฮมรูม', startTime: '08.30', endTime: '08.40', isTeachingPeriod: false, isFixed: true },
    { id: 'period-1', label: 'คาบที่ 1', startTime: '08.40', endTime: '09.30', isTeachingPeriod: true },
    { id: 'period-2', label: 'คาบที่ 2', startTime: '09.30', endTime: '10.20', isTeachingPeriod: true },
    { id: 'period-3', label: 'คาบที่ 3', startTime: '10.20', endTime: '11.10', isTeachingPeriod: true },
    { id: 'period-4', label: 'คาบที่ 4', startTime: '11.10', endTime: '12.00', isTeachingPeriod: true },
    { id: 'lunch', label: 'พักกลางวัน', startTime: '12.00', endTime: '13.00', isTeachingPeriod: false, isFixed: true },
    { id: 'period-5', label: 'คาบที่ 5', startTime: '13.00', endTime: '13.50', isTeachingPeriod: true },
    { id: 'period-6', label: 'คาบที่ 6', startTime: '13.50', endTime: '14.40', isTeachingPeriod: true },
    { id: 'period-7', label: 'คาบที่ 7', startTime: '14.40', endTime: '15.30', isTeachingPeriod: true },
    { id: 'period-8', label: 'คาบที่ 8', startTime: '15.30', endTime: '16.00', isTeachingPeriod: true },
];

<<<<<<< HEAD
const getRequiredWeeklyPeriods = (course: Pick<Course, 'credits' | 'hoursPerWeek'>) => {
    const hours = Number(course.hoursPerWeek || 0);
    if (hours > 0) return Math.round(hours);

    const credits = Number(course.credits || 0);
    return credits > 0 ? Math.round(credits * 2) : 0;
};

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
const PeriodConstraintPage: React.FC = () => {
    const { isDarkMode } = useTheme();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
<<<<<<< HEAD
    const dispatch = useDispatch();
    const { academicYear: calYear, terms: calTerms, status: calendarStatus } = useSelector((state: RootState) => state.calendar);
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    const [courses, setCourses] = useState<Course[]>([]);
    const [constraints, setConstraints] = useState<Record<string, PeriodConstraint>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [openExcludedMenu, setOpenExcludedMenu] = useState<string | null>(null);
    const [slotModalCourse, setSlotModalCourse] = useState<AssignmentRow | null>(null);
    const [periodSettings, setPeriodSettings] = useState<PeriodSettingItem[]>(DEFAULT_PERIODS);
    const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriodItem[]>([]);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
<<<<<<< HEAD
    const [selectedYear, setSelectedYear] = useState<string>("");
    const [filterSemester, setFilterSemester] = useState('1');
    const [courseAssignments, setCourseAssignments] = useState<CourseAssignmentDoc[]>([]);
=======
    const [filterSemester, setFilterSemester] = useState('1');
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    const [filterClass, setFilterClass] = useState('all');
    const [filterGroup, setFilterGroup] = useState('all');
    const [filterSubjectGroup, setFilterSubjectGroup] = useState('all');
    const [filterPhysicalRoom, setFilterPhysicalRoom] = useState('all'); // NEW
    const [physicalRooms, setPhysicalRooms] = useState<any[]>([]); // NEW
    const [showActivityCourses, setShowActivityCourses] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Metadata for filters
    const [subjectGroups, setSubjectGroups] = useState<string[]>([]);

    // Dynamic class list from school settings
    const [availableClasses, setAvailableClasses] = useState<{key: string; label: string}[]>([]);

    // Full class mapping for display
    const ALL_CLASSES: Record<string, string> = {
        'k1': 'อ.1', 'k2': 'อ.2', 'k3': 'อ.3',
        'p1': 'ป.1', 'p2': 'ป.2', 'p3': 'ป.3',
        'p4': 'ป.4', 'p5': 'ป.5', 'p6': 'ป.6',
        'm1': 'ม.1', 'm2': 'ม.2', 'm3': 'ม.3',
        'lower_secondary': 'ม.ต้น',
        'junior_high': 'ม.ต้น',
        'JUNIOR_HIGH': 'ม.ต้น',
        'm4': 'ม.4', 'm5': 'ม.5', 'm6': 'ม.6',
        'upper_secondary': 'ม.ปลาย',
        'senior_high': 'ม.ปลาย',
        'SENIOR_HIGH': 'ม.ปลาย',
    };

<<<<<<< HEAD
    useEffect(() => {
        if (schoolId && calendarStatus === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }
    }, [schoolId, calendarStatus, dispatch]);

    useEffect(() => {
        if (calYear && !selectedYear) {
            setSelectedYear(calYear);
        }
        if (calTerms && calTerms.length > 0 && filterSemester === '1') {
            const today = new Date().toISOString().split('T')[0];
            const found = calTerms.find(t => today >= t.startDate && today <= t.endDate);
            if (found) {
                const termId = found.name.includes('2') ? '2' : '1';
                setFilterSemester(termId);
            }
        }
    }, [calYear, calTerms, selectedYear, filterSemester]);
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    const buildClassList = (levelRange: string) => {
        const allKeys = ['k1','k2','k3','p1','p2','p3','p4','p5','p6','m1','m2','m3','m4','m5','m6'];
        const labelToKey: Record<string, string> = {};
        for (const [k, v] of Object.entries(ALL_CLASSES)) {
            if (!['lower_secondary','upper_secondary'].includes(k)) labelToKey[v] = k;
        }
        if (!levelRange) return allKeys.map(k => ({ key: k, label: ALL_CLASSES[k] }));
        const parts = levelRange.split('-');
        if (parts.length !== 2) return allKeys.map(k => ({ key: k, label: ALL_CLASSES[k] }));
        const startKey = labelToKey[parts[0].trim()];
        const endKey = labelToKey[parts[1].trim()];
        if (!startKey || !endKey) return allKeys.map(k => ({ key: k, label: ALL_CLASSES[k] }));
        const startIdx = allKeys.indexOf(startKey);
        const endIdx = allKeys.indexOf(endKey);
        if (startIdx === -1 || endIdx === -1) return allKeys.map(k => ({ key: k, label: ALL_CLASSES[k] }));
        const selectedKeys = allKeys.slice(startIdx, endIdx + 1);
        const result: {key: string; label: string}[] = [];
        for (const k of selectedKeys) {
            result.push({ key: k, label: ALL_CLASSES[k] });
            if (k === 'm3' && selectedKeys.includes('m1')) {
                result.push({ key: 'lower_secondary', label: 'ม.ต้น' });
            }
            if (k === 'm6' && selectedKeys.includes('m4')) {
                result.push({ key: 'upper_secondary', label: 'ม.ปลาย' });
            }
        }
        return result;
    };

    useEffect(() => {
        const loadData = async () => {
            if (!schoolId) return;
            setIsLoading(true);
            try {
                // 0. Load School Info for class levels
                const schoolRef = doc(db, 'school-settings', schoolId);
                const schoolSnap = await getDoc(schoolRef);
                if (schoolSnap.exists()) {
                    const levelRange = schoolSnap.data().opportunityExpansionLevel || '';
                    setAvailableClasses(buildClassList(levelRange));
                }

                // 1. Load Courses
                const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
                const coursesSnap = await getDocs(coursesRef);
                const coursesData = coursesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Course));
                setCourses(coursesData);

<<<<<<< HEAD
                // 1.1 Load Course Assignments (Filtered by year and semester)
                const assignmentsRef = collection(db, 'school-settings', schoolId, 'course_assignments');
                const q = query(assignmentsRef, 
                    where('academicYear', '==', selectedYear),
                    where('semester', '==', filterSemester)
                );
                const assignmentsSnap = await getDocs(q);
                const assignmentsData = assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CourseAssignmentDoc));
                setCourseAssignments(assignmentsData);

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                // 2. Load Existing Constraints
                const constraintDocRef = doc(db, 'school-settings', schoolId, 'configs', 'period_constraints');
                const constraintSnap = await getDoc(constraintDocRef);
                if (constraintSnap.exists()) {
                    setConstraints(constraintSnap.data().mapping || {});
                }

                // 3. Load Subject Groups from Firestore
                const sgRef = collection(db, 'school-settings', schoolId, 'subject_groups');
                const sgSnap = await getDocs(sgRef);
                const sgData = sgSnap.docs.map((d: any) => ({ name: d.data().name as string, code: d.data().code as string }));
                // Sort by code, but put กิจกรรมพัฒนาผู้เรียน at the end
                const sorted = sgData
                    .filter((g: any) => g.name !== 'กิจกรรมพัฒนาผู้เรียน')
                    .sort((a: any, b: any) => parseInt(a.code || '999') - parseInt(b.code || '999'));
                const activity = sgData.find((g: any) => g.name === 'กิจกรรมพัฒนาผู้เรียน');
                const groupNames = sorted.map((g: any) => g.name);
                if (activity) groupNames.push(activity.name);
                setSubjectGroups(groupNames);

                // 4. Load Period Settings
                const settingsRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists() && settingsSnap.data().periods) {
                    setPeriodSettings(settingsSnap.data().periods);
                }

                // 5. Load Special Periods
                const spRef = collection(db, 'school-settings', schoolId, 'special-periods');
                const spSnap = await getDocs(spRef);
                const spData = spSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as SpecialPeriodItem));
                setSpecialPeriods(spData);

                // 6. Load Physical Rooms
                const roomsRef = collection(db, 'school-settings', schoolId, 'physical-rooms');
                const roomsSnap = await getDocs(roomsRef);
                setPhysicalRooms(roomsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            } catch (error) {
                console.error("Error loading constraints:", error);
                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
<<<<<<< HEAD
    }, [schoolId, selectedYear, filterSemester]);

    const showLimitWarning = (title: string, text: string) => {
        Swal.fire({
            icon: 'warning',
            title,
            text,
            confirmButtonText: 'รับทราบ',
            confirmButtonColor: '#f59e0b',
            background: isDarkMode ? '#1a1b1e' : '#ffffff',
            color: isDarkMode ? '#ffffff' : '#000000',
        });
    };

    const handleConstraintChange = (assignmentId: string, type: 'any' | 'single' | 'double' | 'mixed') => {
        const assignment = allAssignments.find(item => item.compositeId === assignmentId);
        const requiredPeriods = assignment ? getRequiredWeeklyPeriods(assignment) : 0;
        const current = constraints[assignmentId];
        const lockedSlots = current?.lockedSlots || [];

        if (requiredPeriods > 0 && lockedSlots.length > requiredPeriods) {
            showLimitWarning(
                'จำนวนคาบที่ล็อกไว้เกินกำหนด',
                `รายวิชานี้กำหนดได้สูงสุด ${requiredPeriods} คาบ/สัปดาห์ กรุณาลดจำนวนคาบที่ล็อกไว้ก่อนเปลี่ยนรูปแบบ`
            );
            return;
        }

=======
    }, [schoolId]);

    const handleConstraintChange = (assignmentId: string, type: 'any' | 'single' | 'double' | 'mixed') => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        setConstraints(prev => ({
            ...prev,
            [assignmentId]: {
                ...(prev[assignmentId] || { isLocked: false, doublePreference: 'any', singlePreference: 'any', excludedDays: [] }),
<<<<<<< HEAD
                type,
                doublePreference: type === 'single' ? 'any' : (prev[assignmentId]?.doublePreference || 'any'),
                singlePreference: type === 'double' ? 'any' : (prev[assignmentId]?.singlePreference || 'any'),
=======
                type
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            }
        }));
    };

    const handlePreferenceChange = (assignmentId: string, field: 'doublePreference' | 'singlePreference', val: 'any' | 'morning' | 'afternoon') => {
        setConstraints(prev => ({
            ...prev,
            [assignmentId]: {
                ...(prev[assignmentId] || { type: 'any', isLocked: false, excludedDays: [] }),
                [field]: val
            }
        }));
    };

    const handleExcludedDayToggle = (assignmentId: string, dayKey: string) => {
        setConstraints(prev => {
            const current = prev[assignmentId] || { type: 'any', isLocked: false, excludedDays: [] };
            const days = current.excludedDays || [];
            const newDays = days.includes(dayKey) 
                ? days.filter(d => d !== dayKey)
                : [...days, dayKey];
            
            return {
                ...prev,
                [assignmentId]: { ...current, excludedDays: newDays }
            };
        });
    };

    const toggleLock = (assignmentId: string) => {
        setConstraints(prev => ({
            ...prev,
            [assignmentId]: {
                ...(prev[assignmentId] || { type: 'any' }),
                isLocked: !(prev[assignmentId]?.isLocked || false)
            }
        }));
    };

    const toggleSlot = useCallback((assignmentId: string, slotId: string, totalPeriods: number, totalHoursNeeded: number) => {
<<<<<<< HEAD
        const existing = constraints[assignmentId] || { type: 'any' as const, isLocked: false, lockedSlots: [] };
        const slots = existing.lockedSlots || [];
        const type = existing.type || 'any';
        const requiredPeriods = Math.max(0, Math.round(totalHoursNeeded || 0));
        
        const [dayKey, indexStr] = slotId.split('-');
        const index = parseInt(indexStr);
        const isRemoving = slots.includes(slotId);

        let targets = [slotId];
        
        if (!isRemoving && (type === 'double' || type === 'mixed')) {
            const remaining = requiredPeriods - slots.length;
            const shouldPair = remaining >= 2 && (type === 'double' || (type === 'mixed' && remaining >= 2));

            if (shouldPair) {
                const partnerIndex = getPartnerIndex(index);
                const partnerId = `${dayKey}-${partnerIndex}`;
                const partnerSetting = periodSettings[partnerIndex];

                if (partnerIndex === -1 || partnerIndex >= totalPeriods || !partnerSetting?.isTeachingPeriod) {
                    showLimitWarning('เลือกคาบคู่ไม่ได้', 'คาบนี้ไม่มีคาบคู่มาตรฐานที่ติดกัน กรุณาเลือกคาบในบล็อกคู่ เช่น 1-2, 3-4, 6-7 หรือ 8-9');
                    return;
                }

                if (slots.includes(partnerId)) {
                    showLimitWarning('คาบคู่ถูกเลือกไว้แล้ว', 'คาบที่เป็นคู่กับช่องนี้ถูกล็อกไว้แล้ว กรุณาเลือกคู่อื่นหรือยกเลิกคาบเดิมก่อน');
                    return;
                }

                targets.push(partnerId);
            }
        } else if (isRemoving) {
            const partnerIndex = getPartnerIndex(index);
            if (partnerIndex !== -1) {
                const partnerId = `${dayKey}-${partnerIndex}`;
                if (slots.includes(partnerId) && (type === 'double' || type === 'mixed')) {
                    targets.push(partnerId);
                }
            }
        }

        const uniqueTargets = Array.from(new Set(targets));
        let newSlots = [...slots];
        if (isRemoving) {
            newSlots = newSlots.filter(s => !uniqueTargets.includes(s));
        } else {
            const slotsToAdd = uniqueTargets.filter(t => !newSlots.includes(t));

            if (requiredPeriods <= 0) {
                showLimitWarning('ยังไม่มีจำนวนคาบต่อสัปดาห์', 'กรุณากำหนดหน่วยกิตหรือคาบต่อสัปดาห์ของรายวิชานี้ก่อนล็อกคาบ');
                return;
            }

            if (newSlots.length + slotsToAdd.length > requiredPeriods) {
                showLimitWarning(
                    'เลือกคาบเกินจำนวนที่กำหนด',
                    `รายวิชานี้กำหนดได้สูงสุด ${requiredPeriods} คาบ/สัปดาห์ ตอนนี้ล็อกไว้แล้ว ${newSlots.length} คาบ`
                );
                return;
            }

            newSlots = [...newSlots, ...slotsToAdd];
        }

        setConstraints(prev => ({
            ...prev,
            [assignmentId]: { ...existing, isLocked: newSlots.length > 0, lockedSlots: newSlots }
        }));
    }, [constraints, isDarkMode, periodSettings]);

    const handleSave = async () => {
        if (!schoolId) return;

        const invalidLockedAssignments = allAssignments.filter(asgn => {
            const requiredPeriods = getRequiredWeeklyPeriods(asgn);
            const lockedCount = constraints[asgn.compositeId]?.lockedSlots?.length || 0;
            return requiredPeriods > 0 && lockedCount > requiredPeriods;
        });

        if (invalidLockedAssignments.length > 0) {
            const first = invalidLockedAssignments[0];
            const requiredPeriods = getRequiredWeeklyPeriods(first);
            const lockedCount = constraints[first.compositeId]?.lockedSlots?.length || 0;
            showLimitWarning(
                'ยังบันทึกไม่ได้',
                `${first.code} ${first.title} ล็อกไว้ ${lockedCount} คาบ แต่กำหนดได้สูงสุด ${requiredPeriods} คาบ/สัปดาห์`
            );
            return;
        }

=======
        const teachingPeriods = periodSettings.filter(p => p.isTeachingPeriod);
        setConstraints(prev => {
            const existing = prev[assignmentId] || { type: 'any', isLocked: false, lockedSlots: [] };
            const slots = existing.lockedSlots || [];
            const type = existing.type;
            
            const [dayKey, indexStr] = slotId.split('-');
            const index = parseInt(indexStr);
            const isRemoving = slots.includes(slotId);

            let targets = [slotId];
            
            // Intelligent pairing logic
            if (!isRemoving && (type === 'double' || type === 'mixed')) {
                const currentCount = slots.length;
                const remaining = totalHoursNeeded - currentCount;
                
                const shouldPair = type === 'double' || (type === 'mixed' && remaining >= 2);

                if (shouldPair) {
                    const partnerIndex = getPartnerIndex(index);
                    if (partnerIndex !== -1 && partnerIndex < totalPeriods) {
                        const p1 = periodSettings[index];
                        const p2 = periodSettings[partnerIndex];
                        if (p1 && p2 && p2.isTeachingPeriod) {
                            targets.push(`${dayKey}-${partnerIndex}`);
                        }
                    }
                }
            } else if (isRemoving) {
                // If removing, also check if it was part of a standard pair
                const partnerIndex = getPartnerIndex(index);
                if (partnerIndex !== -1) {
                    const partnerId = `${dayKey}-${partnerIndex}`;
                    if (slots.includes(partnerId)) {
                        targets.push(partnerId);
                    }
                }
            }

            let newSlots = [...slots];
            if (isRemoving) {
                newSlots = newSlots.filter(s => !targets.includes(s));
            } else {
                targets.forEach(t => {
                    if (!newSlots.includes(t)) newSlots.push(t);
                });
            }

            return {
                ...prev,
                [assignmentId]: { ...existing, isLocked: newSlots.length > 0, lockedSlots: newSlots }
            };
        });
    }, [periodSettings]);

    const handleSave = async () => {
        if (!schoolId) return;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        setIsSubmitting(true);
        try {
            const constraintDocRef = doc(db, 'school-settings', schoolId, 'configs', 'period_constraints');
            await setDoc(constraintDocRef, {
                mapping: constraints,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser?.uid
            });
            Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ',
                text: 'การตั้งค่ารูปแบบคาบเรียนถูกบันทึกเรียบร้อยแล้ว',
                timer: 2000,
                showConfirmButton: false,
                background: isDarkMode ? '#1a1b1e' : '#ffffff',
                color: isDarkMode ? '#ffffff' : '#000000',
            });
        } catch (error) {
            console.error("Error saving constraints:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);

    // Create a flattened list of all assignments (rows)
    const allAssignments = useMemo(() => {
<<<<<<< HEAD
        return courseAssignments.flatMap(courseDoc => {
            const course = courses.find(c => c.id === courseDoc.courseId);
            if (!course) return [];
            
            return (courseDoc.teacherAssignments || []).map(asgn => ({
                ...course,
                academicYear: courseDoc.academicYear,
                semester: courseDoc.semester,
                assignment: asgn,
                compositeId: `${courseDoc.courseId}_${asgn.groupNumber}`
            } as AssignmentRow));
        });
    }, [courses, courseAssignments]);
=======
        return courses.flatMap(course => {
            if (!course.teacherAssignments || course.teacherAssignments.length === 0) return [];
            return course.teacherAssignments.map(asgn => ({
                ...course,
                assignment: asgn,
                compositeId: `${course.id}_${asgn.groupNumber}`
            } as AssignmentRow));
        });
    }, [courses]);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    const filteredAssignments = useMemo(() => {
        return allAssignments.filter(asgn => {
            const matchesSearch = (asgn.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  asgn.code?.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesSemester = filterSemester === '0' 
                                    ? String(asgn.semester) === '0'
                                    : (!asgn.semester || String(asgn.semester) === '0' || String(asgn.semester) === filterSemester);

            const matchesClass = (() => {
                if (filterClass === 'all') return true;
                const lowerSecondaryKeys = ['lower_secondary', 'junior_high', 'JUNIOR_HIGH', 'ม.ต้น'];
                const upperSecondaryKeys = ['upper_secondary', 'senior_high', 'SENIOR_HIGH', 'ม.ปลาย'];
                const classIds = Array.isArray(asgn.classId) ? asgn.classId : [asgn.classId];

                if (filterClass === 'lower_secondary') return classIds.some(id => lowerSecondaryKeys.includes(id));
                if (filterClass === 'upper_secondary') return classIds.some(id => upperSecondaryKeys.includes(id));
                return classIds.includes(filterClass);
            })();

            const matchesGroupValue = filterGroup === 'all' || String(asgn.assignment.groupNumber) === filterGroup;
            const matchesSubjectGroup = filterSubjectGroup === 'all' || asgn.subjectGroup === filterSubjectGroup;
            const matchesActivity = showActivityCourses ? true : isAcademicCourse(asgn);

            const matchesPhysicalRoom = (() => {
                if (filterPhysicalRoom === 'all') return true;
                const roomIds = asgn.assignment.roomIds || [];
                // Check by roomName (matching the dropdown value) or roomCode
                return roomIds.some(rId => {
                    const roomObj = physicalRooms.find(pr => pr.id === rId);
                    return roomObj && roomObj.roomName === filterPhysicalRoom;
                });
            })();

            return matchesSearch && matchesSemester && matchesClass && matchesGroupValue && matchesSubjectGroup && matchesActivity && matchesPhysicalRoom;
        });
    }, [allAssignments, searchTerm, filterSemester, filterClass, filterGroup, filterSubjectGroup, showActivityCourses, filterPhysicalRoom, physicalRooms]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredAssignments.length / pageSize);
    const paginatedAssignments = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredAssignments.slice(start, start + pageSize);
    }, [filteredAssignments, currentPage, pageSize]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterSemester, filterClass, filterGroup, filterSubjectGroup, showActivityCourses, filterPhysicalRoom]);

    return (
        <MainLayout>
            <div className="flex flex-col bg-slate-50 dark:bg-[#020408] text-slate-900 dark:text-white transition-colors duration-300 font-inter select-none">
                
                {/* 1. TOP HEADER SECTION */}
                <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#07090e]/95 backdrop-blur-2xl border-b border-slate-200 dark:border-white/[0.03] shadow-lg px-6 py-5">
                    <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-5">
<<<<<<< HEAD
                                <BackButton to="/academic/hub/scheduling" />
                                <div className="flex flex-col">
                                    <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase leading-none">จัดการรูปแบบคาบเรียน</h1>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">กำหนดเงื่อนไขและรูปแบบคาบคู่/เดี่ยว</p>
                                </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Academic Year Selector Moved Here */}
                            <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">ปีการศึกษา</label>
                                <div className="relative flex items-center group">
                                    <select 
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        className="bg-transparent text-xs font-black text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none pr-6"
                                    >
                                        {[0, -1, -2].map(offset => {
                                            const year = (getCurrentThaiYear() + offset).toString();
                                            return <option key={year} value={year} className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">ปี {year}</option>;
                                        })}
                                    </select>
                                    <ChevronDown size={12} className="absolute right-0 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            <div className="h-8 w-px bg-slate-200 dark:bg-white/10 mx-1"></div>

=======
                            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)]">
                                <Settings size={26} className="text-white" />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase leading-none">จัดการรูปแบบคาบเรียน</h1>
                                <Link to="/academic/teacher-schedule" className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-indigo-500 transition-all uppercase tracking-[0.2em] mt-2">
                                    <ArrowLeft size={12} />
                                    <span>กลับไปหน้าจัดตารางสอน</span>
                                </Link>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            <button className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all text-[11px] font-black uppercase tracking-widest shadow-lg">
                                <Zap size={16} />
                                <span>กำหนดรูปแบบคาบอัตโนมัติ</span>
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={isSubmitting}
                                className={`flex items-center gap-2 px-8 py-3.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest shadow-[0_15px_30px_rgba(79,70,229,0.4)] hover:bg-indigo-500 transition-all active:scale-95 ${isSubmitting ? 'opacity-50' : ''}`}
                            >
                                <Save size={16} />
                                <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
                            </button>
                        </div>
                    </div>
                </header>

                <main className="max-w-[1600px] mx-auto w-full px-6 py-8">
                    
                    {/* 2. FILTER BAR SECTION */}
                    <section className="relative z-10 bg-white dark:bg-[#0a0c10]/50 border border-slate-200 dark:border-white/[0.03] rounded-2xl p-8 shadow-xl mb-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-8 items-end">
<<<<<<< HEAD

                            {/* Search */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">ค้นหา</label>
                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                                    <input 
                                        type="text" 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="รหัส, ชื่อวิชา..."
                                        className="w-full h-12 pl-12 pr-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500/50 transition-all"
                                    />
                                </div>
                            </div>

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            {/* Semester */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">ภาคเรียน</label>
                                <div className="relative group">
                                    <select 
                                        value={filterSemester}
                                        onChange={(e) => setFilterSemester(e.target.value)}
                                        className="w-full h-12 px-5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="1" className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">ภาคเรียนที่ 1</option>
                                        <option value="2" className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">ภาคเรียนที่ 2</option>
<<<<<<< HEAD
=======
                                        <option value="0" className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">ทั้งปีการศึกษา</option>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Class Level */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">ระดับชั้น</label>
                                <div className="relative group">
                                    <select 
                                        value={filterClass}
                                        onChange={(e) => setFilterClass(e.target.value)}
                                        className="w-full h-12 px-5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">ทุกระดับชั้น</option>
                                        {availableClasses.map(c => (
                                            <option key={c.key} value={c.key} className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">{c.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Group */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">กลุ่ม</label>
                                <div className="relative group">
                                    <select 
                                        value={filterGroup}
                                        onChange={(e) => setFilterGroup(e.target.value)}
                                        className="w-full h-12 px-5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">ทุกกลุ่ม</option>
                                        {Array.from({ length: 20 }, (_, i) => i + 1).map(num => <option key={num} value={String(num)} className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">กลุ่ม {num}</option>)}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Subject Group */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">กลุ่มสาระฯ</label>
                                <div className="relative group">
                                    <select 
                                        value={filterSubjectGroup}
                                        onChange={(e) => setFilterSubjectGroup(e.target.value)}
                                        className="w-full h-12 px-5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">ทุกกลุ่มสาระฯ</option>
                                        {subjectGroups.map(group => <option key={group} value={group} className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">{group}</option>)}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Physical Room */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">สถานที่</label>
                                <div className="relative group">
                                    <select 
                                        value={filterPhysicalRoom}
                                        onChange={(e) => setFilterPhysicalRoom(e.target.value)}
                                        className="w-full h-12 px-5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">ทุกสถานที่</option>
                                        {physicalRooms.map(room => (
                                            <option key={room.id} value={room.roomName} className="bg-white dark:bg-[#1a1b20] text-slate-700 dark:text-slate-200">
                                                {room.roomName} ({room.roomCode})
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

<<<<<<< HEAD
=======
                            {/* Search */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">ค้นหา</label>
                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                                    <input 
                                        type="text" 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="รหัส, ชื่อวิชา..."
                                        className="w-full h-12 pl-12 pr-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500/50 transition-all"
                                    />
                                </div>
                            </div>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => setShowActivityCourses(!showActivityCourses)}
                                        className={`w-10 h-5 rounded-full transition-all relative ${showActivityCourses ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-white/10'}`}
                                    >
                                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${showActivityCourses ? 'left-6' : 'left-1'}`}></div>
                                    </button>
                                    <span className="text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">แสดงวิชากิจกรรมพัฒนาผู้เรียน</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                                <span>*คาบคู่ = (2), คาบเดี่ยว = (1), ผสม = (2+1)</span>
                            </div>
                        </div>
                    </section>

                    {/* 3. DATA TABLE SECTION */}
                    <div className="bg-white dark:bg-[#0a0c10]/50 border border-slate-200 dark:border-white/[0.03] rounded-2xl overflow-visible shadow-2xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.05]">
                                    <th className="px-5 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">ชั้นเรียน</th>
                                    <th className="px-5 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">รหัส/ชื่อวิชา</th>
                                    <th className="px-5 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">กลุ่ม</th>
                                    <th className="px-5 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">ครูผู้สอน</th>
                                    <th className="px-5 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">หน่วยกิต</th>
                                    <th className="px-5 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">คาบ/สัปดาห์</th>
                                    <th className="px-5 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">รูปแบบคาบ</th>
                                    <th className="px-5 py-5 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">ล็อกคาบสอน</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {isLoading ? (
                                    Array.from({ length: 8 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={7} className="px-8 py-6 h-20 bg-slate-50/50 dark:bg-white/[0.01]"></td>
                                        </tr>
                                    ))
                                ) : paginatedAssignments.length > 0 ? (
                                    paginatedAssignments.map(asgn => {
                                        const current = constraints[asgn.compositeId] || { type: 'any', isLocked: false };
                                        const teacherName = teacherMap[asgn.assignment.teacherId]?.name || 'ไม่ระบุครู';
<<<<<<< HEAD
                                        const requiredPeriods = getRequiredWeeklyPeriods(asgn);
                                        const lockedCount = current.lockedSlots?.length || 0;
                                        const isOverLocked = requiredPeriods > 0 && lockedCount > requiredPeriods;
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                        return (
                                            <tr key={asgn.compositeId} className={`group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors border-b border-slate-100 dark:border-white/5 last:border-0 ${openExcludedMenu === asgn.compositeId ? 'relative z-50' : ''}`}>
                                                <td className="px-4 py-3.5">
                                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 text-[10px] font-black uppercase">
<<<<<<< HEAD
                                                        {(() => {
                                                            const classLevels = asgn.assignment.classLevels || (Array.isArray(asgn.classId) ? asgn.classId : [asgn.classId]);
                                                            return classLevels.map(id => ALL_CLASSES[id] || id).join(', ');
                                                        })()}
=======
                                                        {Array.isArray(asgn.classId) ? asgn.classId.map(id => ALL_CLASSES[id] || id).join(', ') : (ALL_CLASSES[asgn.classId] || asgn.classId)}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{asgn.code}</span>
                                                        <span className="text-xs font-black text-slate-900 dark:text-white leading-tight mt-0.5">{asgn.title}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-[10px] font-black text-slate-500">
                                                            {asgn.assignment.groupNumber}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                                            <User size={12} />
                                                        </div>
                                                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{teacherName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                                        {asgn.credits !== undefined ? asgn.credits : (asgn.hoursPerWeek ? (asgn.hoursPerWeek / 2) : 0)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <div className="flex flex-col items-center">
<<<<<<< HEAD
                                                        <span className={`text-xs font-black ${isOverLocked || (asgn.credits && asgn.hoursPerWeek !== Math.round(Number(asgn.credits) * 2)) ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                                                            {requiredPeriods}
=======
                                                        <span className={`text-xs font-black ${asgn.credits && asgn.hoursPerWeek !== Math.round(Number(asgn.credits) * 2) ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                                                            {asgn.hoursPerWeek || 0}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                        </span>
                                                        {asgn.credits && asgn.hoursPerWeek !== Math.round(Number(asgn.credits) * 2) && (
                                                            <span className="text-[8px] text-red-400 font-bold">ควรเป็น {Math.round(Number(asgn.credits) * 2)}</span>
                                                        )}
<<<<<<< HEAD
                                                        {lockedCount > 0 && (
                                                            <span className={`text-[8px] font-bold ${isOverLocked ? 'text-red-500' : 'text-amber-500'}`}>
                                                                ล็อก {lockedCount}/{requiredPeriods || '-'}
                                                            </span>
                                                        )}
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="relative min-w-[120px]">
                                                            <select 
                                                                value={current.type}
                                                                onChange={(e) => handleConstraintChange(asgn.compositeId, e.target.value as any)}
                                                                className={`w-full h-8 pl-3 pr-8 rounded-lg text-[10px] font-black appearance-none cursor-pointer focus:outline-none focus:ring-2 transition-all shadow-sm border ${
                                                                    current.type === 'double' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30 focus:ring-indigo-500/20' :
                                                                    current.type === 'single' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 focus:ring-emerald-500/20' :
                                                                    current.type === 'mixed' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 focus:ring-amber-500/20' :
                                                                    'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 focus:ring-slate-500/20'
                                                                }`}
                                                            >
                                                                <option value="any" className="bg-white dark:bg-[#1a1b20]">รูปแบบ (อัตโนมัติ)</option>
                                                                {(() => {
                                                                    const h = asgn.hoursPerWeek || 0;
                                                                    if (h === 1) return (
                                                                        <option value="single" className="bg-white dark:bg-[#1a1b20]">คาบเดี่ยว (1)</option>
                                                                    );
                                                                    if (h === 2) return (
                                                                        <>
                                                                            <option value="single" className="bg-white dark:bg-[#1a1b20]">คาบเดี่ยว (1+1)</option>
                                                                            <option value="double" className="bg-white dark:bg-[#1a1b20]">คาบคู่ (2)</option>
                                                                        </>
                                                                    );
                                                                    if (h === 3) return (
                                                                        <>
                                                                            <option value="single" className="bg-white dark:bg-[#1a1b20]">คาบเดี่ยว (1+1+1)</option>
                                                                            <option value="mixed" className="bg-white dark:bg-[#1a1b20]">คู่+เดี่ยว (2+1)</option>
                                                                        </>
                                                                    );
                                                                    if (h === 4) return (
                                                                        <>
                                                                            <option value="single" className="bg-white dark:bg-[#1a1b20]">คาบเดี่ยว (1*4)</option>
                                                                            <option value="double" className="bg-white dark:bg-[#1a1b20]">คาบคู่ x2 (2+2)</option>
                                                                            <option value="mixed" className="bg-white dark:bg-[#1a1b20]">ผสม (2+1+1)</option>
                                                                        </>
                                                                    );
                                                                    return (
                                                                        <>
                                                                            <option value="single" className="bg-white dark:bg-[#1a1b20]">เดี่ยวทั้งหมด (1*{h})</option>
                                                                            <option value="double" className="bg-white dark:bg-[#1a1b20]">เน้นคู่ (2+2+...)</option>
                                                                            <option value="mixed" className="bg-white dark:bg-[#1a1b20]">ผสม (2+1+...)</option>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </select>
                                                            <ChevronDown size={10} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${
                                                                current.type === 'double' ? 'text-indigo-400' :
                                                                current.type === 'single' ? 'text-emerald-400' :
                                                                current.type === 'mixed' ? 'text-amber-400' :
                                                                'text-slate-400'
                                                            }`} />
                                                        </div>

                                                        {/* Preference for Double Part */}
                                                        {(current.type === 'double' || current.type === 'mixed') && (
                                                            <div className="relative min-w-[110px] animate-in fade-in zoom-in-95 duration-200">
                                                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10">
                                                                    <BookOpen size={10} className="text-indigo-500 dark:text-indigo-400 shadow-sm" />
                                                                </div>
                                                                <select 
                                                                    value={current.doublePreference || 'any'}
                                                                    onChange={(e) => handlePreferenceChange(asgn.compositeId, 'doublePreference', e.target.value as any)}
                                                                    className="w-full h-8 pl-7 pr-6 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] font-black text-indigo-700 dark:text-indigo-300 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all shadow-sm"
                                                                >
                                                                    <option value="any" className="bg-white dark:bg-[#1a1b20]">คู่: ไม่ระบุ</option>
                                                                    <option value="morning" className="bg-white dark:bg-[#1a1b20]">คู่: ช่วงเช้า</option>
                                                                    <option value="afternoon" className="bg-white dark:bg-[#1a1b20]">คู่: ช่วงบ่าย</option>
                                                                </select>
                                                                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                                                            </div>
                                                        )}

                                                        {/* Preference for Single Part */}
                                                        {(current.type === 'single' || current.type === 'mixed') && (
                                                            <div className="relative min-w-[110px] animate-in fade-in zoom-in-95 duration-200">
                                                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10">
                                                                    <Book size={10} className="text-emerald-500 dark:text-emerald-400" />
                                                                </div>
                                                                <select 
                                                                    value={current.singlePreference || 'any'}
                                                                    onChange={(e) => handlePreferenceChange(asgn.compositeId, 'singlePreference', e.target.value as any)}
                                                                    className="w-full h-8 pl-7 pr-6 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-black text-emerald-700 dark:text-emerald-300 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-sm"
                                                                >
                                                                    <option value="any" className="bg-white dark:bg-[#1a1b20]">เดี่ยว: ไม่ระบุ</option>
                                                                    <option value="morning" className="bg-white dark:bg-[#1a1b20]">เดี่ยว: ช่วงเช้า</option>
                                                                    <option value="afternoon" className="bg-white dark:bg-[#1a1b20]">เดี่ยว: ช่วงบ่าย</option>
                                                                </select>
                                                                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none" />
                                                            </div>
                                                        )}
                                                        {/* Excluded Days Selector */}
                                                        <div className="relative">
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenExcludedMenu(openExcludedMenu === asgn.compositeId ? null : asgn.compositeId);
                                                                }}
                                                                title="ยกเว้นวันสอน"
                                                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${current.excludedDays?.length ? 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent hover:border-red-500/30 hover:text-red-500'}`}
                                                            >
                                                                <CalendarX size={14} />
                                                                {current.excludedDays && current.excludedDays.length > 0 && (
                                                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-[#1a1b20]">
                                                                        {current.excludedDays.length}
                                                                    </span>
                                                                )}
                                                            </button>

                                                            {openExcludedMenu === asgn.compositeId && (
                                                                <>
                                                                    <div className="fixed inset-0 z-40" onClick={() => setOpenExcludedMenu(null)} />
                                                                    <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-[#1a1b20] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl p-2 min-w-[140px] animate-in fade-in slide-in-from-top-2 duration-200">
                                                                        <div className="px-2 py-1.5 mb-1 border-b border-slate-100 dark:border-white/5">
                                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ยกเว้นวันสอน:</span>
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            {DAYS.map(day => {
                                                                                const isExcluded = current.excludedDays?.includes(day.key);
                                                                                return (
                                                                                    <button
                                                                                        key={day.key}
                                                                                        onClick={() => handleExcludedDayToggle(asgn.compositeId, day.key)}
                                                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-all ${isExcluded ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                                                                    >
                                                                                        <span className="text-[11px]">{day.label}</span>
                                                                                        {isExcluded && <Check size={10} strokeWidth={3} />}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-center">
                                                    <button 
                                                        onClick={() => setSlotModalCourse(asgn)}
                                                        className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto transition-all duration-300 shadow-sm ${current.isLocked ? 'bg-amber-500 text-white shadow-amber-500/20 scale-110' : 'bg-slate-100 dark:bg-white/[0.03] text-slate-400 dark:text-slate-600 border border-transparent hover:border-amber-500/30 hover:text-amber-500 hover:scale-110'}`}
                                                    >
                                                        {current.isLocked ? <Lock size={16} className="drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" /> : <Unlock size={16} />}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="px-8 py-20 text-center">
                                            <div className="flex flex-col items-center">
                                                <BookOpen size={48} className="text-slate-200 dark:text-white/5 mb-4" />
                                                <span className="text-sm font-black text-slate-400 uppercase tracking-widest">ไม่พบข้อมูลรายวิชา</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Pagination Footer */}
                        {totalPages > 1 && (
                            <div className="px-8 py-6 border-t border-slate-100 dark:border-white/[0.03] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.01]">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    แสดง {Math.min(filteredAssignments.length, (currentPage - 1) * pageSize + 1)} - {Math.min(filteredAssignments.length, currentPage * pageSize)} จากทั้งหมด {filteredAssignments.length} รายการ
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 text-slate-500"
                                    >
                                        หน้าแรก
                                    </button>
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 text-slate-500"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    <div className="flex items-center gap-1 mx-2">
                                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                            let pageNum;
                                            if (totalPages <= 5) pageNum = i + 1;
                                            else if (currentPage <= 3) pageNum = i + 1;
                                            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                            else pageNum = currentPage - 2 + i;

                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => setCurrentPage(pageNum)}
                                                    className={`w-10 h-10 rounded-lg text-xs font-black transition-all ${currentPage === pageNum ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 text-slate-500"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                    <button 
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 text-slate-500"
                                    >
                                        หน้าสุดท้าย
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* SLOT PICKER MODAL */}
            {slotModalCourse && (() => {
                const c = slotModalCourse;
                const cst = constraints[c.compositeId] || { type: 'any', isLocked: false, lockedSlots: [] };
                const locked = cst.lockedSlots || [];
<<<<<<< HEAD
                const displayPeriods = periodSettings.filter(p => p.isTeachingPeriod || p.id === 'lunch');
                const classLabel = ALL_CLASSES[c.classId] || c.classId;
                const totalHours = getRequiredWeeklyPeriods(c);
                const hasReachedLimit = totalHours > 0 && locked.length >= totalHours;
                const isOverLimit = totalHours > 0 && locked.length > totalHours;
=======
                const teachingPeriods = periodSettings.filter(p => p.isTeachingPeriod);
                const displayPeriods = periodSettings.filter(p => p.isTeachingPeriod || p.id === 'lunch');
                const classLabel = ALL_CLASSES[c.classId] || c.classId;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                // Build merged columns: teaching periods + special periods mapped by position
                // Special periods that match a teaching period's time slot get overlaid
                const getSpecialForDayAndPeriod = (dayKey: string, periodId: string) => {
                    return specialPeriods.find(sp => {
                        const matchDay = !sp.day || sp.day === 'all' || sp.day === dayKey;
                        const matchPeriod = sp.linkedPeriodId === periodId;
                        return matchDay && matchPeriod;
                    });
                };

                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSlotModalCourse(null)}>
                        <div className="bg-white dark:bg-[#1a1b20] rounded-2xl w-[810px] max-w-[95vw] shadow-2xl border border-slate-200 dark:border-white/10" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-white/5">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Lock size={18} className="text-amber-500" />
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">กำหนดล็อกคาบ</h3>
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500 text-white text-[11px] font-black">{classLabel}</span>
                                    <span className="text-xs font-bold text-slate-400">•</span>
                                    <span className="text-xs font-black text-amber-500">{c.code}</span>
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-300">{c.title}</span>
                                    <span className="text-xs font-bold text-slate-400">•</span>
<<<<<<< HEAD
                                    <span className={`text-xs font-bold ${isOverLimit ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>{locked.length}/{totalHours || '-'} คาบ</span>
=======
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{c.hoursPerWeek || 0} คาบ</span>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                </div>
                                <button onClick={() => setSlotModalCourse(null)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all shrink-0">
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Grid */}
                            <div className="px-5 py-3">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-white/5">
                                            <th className="px-2 py-2 text-[11px] font-black text-slate-400 uppercase text-left w-20">วัน/คาบ</th>
                                            {displayPeriods.map(p => (
                                                <th key={p.id} className={`px-0.5 py-2 text-center ${p.id === 'lunch' ? 'w-10 opacity-40' : ''}`}>
                                                    <div className="text-[11px] font-black text-slate-700 dark:text-slate-200">{p.label}</div>
                                                    <div className="text-[9px] font-bold text-slate-400 mt-0.5">{p.startTime}-{p.endTime}</div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DAYS.map(day => (
                                            <tr key={day.key} className="border-b border-slate-50 dark:border-white/[0.03]">
                                                <td className="px-2 py-2 text-[12px] font-black text-slate-600 dark:text-slate-300">{day.label}</td>
                                                {displayPeriods.map((p) => {
                                                    if (p.id === 'lunch') {
                                                        return (
                                                            <td key={p.id} className="px-0.5 py-1.5">
                                                                <div className="w-full h-9 rounded-lg bg-slate-100 dark:bg-white/5 border border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center opacity-40">
                                                                    <span className="text-[8px] font-black text-slate-400 uppercase vertical-text">พัก</span>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    const originalIndex = periodSettings.indexOf(p);
                                                    const slotId = `${day.key}-${originalIndex}`;
                                                    const isSelected = locked.includes(slotId);
                                                    const sp = getSpecialForDayAndPeriod(day.key, p.id);
                                                    const isDayExcluded = cst.excludedDays?.includes(day.key);
<<<<<<< HEAD
                                                    const isDisabledByLimit = hasReachedLimit && !isSelected;
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    
                                                    if (sp) {
                                                        return (
                                                            <td key={p.id} className="px-0.5 py-1.5">
                                                                <div className="w-full h-9 rounded-lg bg-violet-100 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 flex items-center justify-center">
                                                                    <span className="text-[8px] font-black text-violet-600 dark:text-violet-400 truncate px-0.5">{sp.title}</span>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    if (isDayExcluded) {
                                                        return (
                                                            <td key={p.id} className="px-0.5 py-1.5">
                                                                <div className="w-full h-9 rounded-lg bg-red-100/50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center cursor-not-allowed shadow-inner" title="ห้ามสอนในวันนี้">
                                                                    <X size={14} strokeWidth={3} className="text-red-500 dark:text-red-400" />
                                                                </div>
                                                            </td>
                                                        );
                                                    }
<<<<<<< HEAD
=======
                                                    const totalHours = Math.round(Number(c.credits || 0) * 2) || Number(c.hoursPerWeek || 0);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                    return (
                                                        <td key={p.id} className="px-0.5 py-1.5">
                                                            <button
                                                                onClick={() => toggleSlot(c.compositeId, slotId, periodSettings.length, totalHours)}
<<<<<<< HEAD
                                                                disabled={isDisabledByLimit}
                                                                title={isDisabledByLimit ? `เลือกครบ ${totalHours} คาบ/สัปดาห์แล้ว` : undefined}
                                                                className={`w-full h-9 rounded-lg border transition-all flex items-center justify-center ${
                                                                    isSelected
                                                                        ? 'bg-amber-500 border-amber-400 text-white shadow-md shadow-amber-500/20'
                                                                        : isDisabledByLimit
                                                                            ? 'bg-slate-100 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 opacity-35 cursor-not-allowed'
=======
                                                                className={`w-full h-9 rounded-lg border transition-all flex items-center justify-center ${
                                                                    isSelected
                                                                        ? 'bg-amber-500 border-amber-400 text-white shadow-md shadow-amber-500/20'
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                                        : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 hover:border-amber-400/50 hover:bg-amber-50 dark:hover:bg-amber-500/5'
                                                                }`}
                                                            >
                                                                {isSelected && <Check size={14} strokeWidth={3} />}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] shrink-0">
<<<<<<< HEAD
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                        คาบที่ล็อกไว้: <span className={isOverLimit ? 'text-red-500 font-black' : 'text-amber-500 font-black'}>{locked.length}</span>
                                        <span className="mx-1">/</span>
                                        <span className="font-black">{totalHours || '-'}</span> คาบ
                                    </span>
                                    {hasReachedLimit && !isOverLimit && (
                                        <span className="text-[10px] font-bold text-emerald-500 mt-1">เลือกครบตามจำนวนคาบต่อสัปดาห์แล้ว</span>
                                    )}
                                    {isOverLimit && (
                                        <span className="text-[10px] font-bold text-red-500 mt-1">จำนวนคาบที่ล็อกไว้เกินกว่าที่กำหนด กรุณาลดคาบก่อนบันทึก</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => { setConstraints(prev => ({ ...prev, [c.compositeId]: { ...cst, lockedSlots: [], isLocked: false } })); }}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[11px] font-black hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all"
                                    >
                                        <Unlock size={14} />
                                        <span>ล้างคาบที่ล็อกไว้</span>
=======
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">คาบที่ล็อกไว้: <span className="text-amber-500 font-black">{locked.length}</span> คาบ</span>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => { setConstraints(prev => ({ ...prev, [c.compositeId]: { ...cst, lockedSlots: [], isLocked: false } })); }}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-black hover:bg-emerald-500/20 transition-all"
                                    >
                                        <Lock size={14} />
                                        <span>บังคับจัดลงตารางในคาบนี้เท่านั้น</span>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    </button>
                                    <button 
                                        onClick={() => setSlotModalCourse(null)} 
                                        className="px-8 py-2.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black shadow-lg hover:bg-indigo-500 transition-all"
                                    >
                                        เสร็จสิ้น
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </MainLayout>
    );
};

export default PeriodConstraintPage;
