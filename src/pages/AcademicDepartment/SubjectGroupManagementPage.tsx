import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import { firestore as db } from '../../firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { setSubjectGroups, updateSubjectGroup } from '@/store/slices/subjectGroupsSlice';
import MainLayout from "@/layouts/MainLayout";
import { CLASSES } from '@/utils/schoolUtils';
import {
    ArrowLeft,
    Plus,
    Trash2,
    Edit2,
    Save,
    X,
    BookOpen,
    Search,
    FileText,
    GraduationCap,
    ChevronRight,
    LayoutGrid,
    Filter,
    CheckCircle2,
    AlertCircle,
    Users,
    Shield,
    ListChecks,
    Target,
    Activity,
    Compass,
    Globe,
    Music,
    Palette,
    Dribbble,
    Crown,
    UserPlus,
    Package,
    BookMarked,
    FileSearch,
    MousePointerClick,
    MonitorCheck,
    MousePointer2,
    Terminal
} from 'lucide-react';
import Swal from 'sweetalert2';

interface Indicator {
    id: string;
    code: string;
    description: string;
    level: string;
}

interface SubjectGroup {
    id: string;
    name: string;
    code?: string;
    headId?: string;
    headName?: string;
    headTeacherId?: string;
    headTeacherName?: string;
}

interface Teacher {
    id: string;
    title: string;
    firstName: string;
    lastName: string;
    position: string;
}

const GROUP_ICONS: Record<string, any> = {
    "ภาษาไทย": BookOpen,
    "คณิตศาสตร์": Target,
    "วิทยาศาสตร์และเทคโนโลยี": Compass,
    "สังคมศึกษา ศาสนา และวัฒนธรรม": Globe,
    "สุขศึกษาและพลศึกษา": Activity,
    "ศิลปะ": Palette,
    "การงานอาชีพ": Dribbble,
    "ภาษาต่างประเทศ": Music,
    "กิจกรรมพัฒนาผู้เรียน": Users,
};

const GROUP_COLORS: Record<string, string> = {
    "ภาษาไทย": "indigo",
    "คณิตศาสตร์": "blue",
    "วิทยาศาสตร์และเทคโนโลยี": "emerald",
    "สังคมศึกษา ศาสนา และวัฒนธรรม": "amber",
    "สุขศึกษาและพลศึกษา": "rose",
    "ศิลปะ": "pink",
    "การงานอาชีพ": "orange",
    "ภาษาต่างประเทศ": "sky",
    "กิจกรรมพัฒนาผู้เรียน": "teal",
};

const DEFAULT_GROUPS = [
    { name: "ภาษาไทย", code: "1" },
    { name: "คณิตศาสตร์", code: "2" },
    { name: "วิทยาศาสตร์และเทคโนโลยี", code: "3" },
    { name: "สังคมศึกษา ศาสนา และวัฒนธรรม", code: "4" },
    { name: "สุขศึกษาและพลศึกษา", code: "5" },
    { name: "ศิลปะ", code: "6" },
    { name: "การงานอาชีพ", code: "7" },
    { name: "ภาษาต่างประเทศ", code: "8" },
    { name: "กิจกรรมพัฒนาผู้เรียน", code: "9" },
];


interface Course {
    id: string;
    title: string;
    code: string;
    subjectGroup?: string;
    type?: string;
    indicators?: string[];
    expectedOutcomes?: string[];
}

const SubjectGroupManagementPage: React.FC = () => {
    const [groups, setGroups] = useState<SubjectGroup[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [teachers, setTeachers] = useState<Teacher[]>([]);

    // Form States
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupCode, setNewGroupCode] = useState("");

    // Search & Filter
    const [searchTerm, setSearchTerm] = useState("");

    const currentUser = useSelector((state: RootState) => state.auth.user);
    const dispatch = useDispatch();
    const schoolId = (currentUser as any)?.schoolId;

    useEffect(() => {
        if (schoolId) {
            fetchGroups();
            fetchCourses();
            fetchTeachers();
        }
    }, [schoolId]);

    const fetchTeachers = async () => {
        try {
            const colRef = collection(db, 'school-settings', schoolId, 'teachers');
            const snapshot = await getDocs(colRef);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
            setTeachers(data);
        } catch (error) {
            console.error("Error fetching teachers:", error);
        }
    };

    const fetchCourses = async () => {
        try {
            const colRef = collection(db, 'school-settings', schoolId, 'courses');
            const snapshot = await getDocs(colRef);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
            setCourses(data);
        } catch (error) {
            console.error("Error fetching courses:", error);
        }
    };

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const colRef = collection(db, 'school-settings', schoolId, 'subject_groups');
            const snapshot = await getDocs(colRef);
            let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubjectGroup));

            // Check if any default groups are missing and add them
            const existingCodes = new Set(data.map(g => g.code));
            const missingDefaults = DEFAULT_GROUPS.filter(dg => !existingCodes.has(dg.code));

            if (missingDefaults.length > 0) {
                const batch = writeBatch(db);
                const addedData: SubjectGroup[] = [];
                missingDefaults.forEach(item => {
                    const newDocRef = doc(colRef);
                    batch.set(newDocRef, { name: item.name, code: item.code });
                    addedData.push({ id: newDocRef.id, name: item.name, code: item.code });
                });
                await batch.commit();
                data = [...data, ...addedData];
            }

            const sortedData = data.sort((a, b) => {
                const codeA = parseInt(a.code || "999");
                const codeB = parseInt(b.code || "999");
                return codeA - codeB;
            });

            const normalizedGroups = sortedData.map(g => ({
                ...g,
                headId: g.headId || g.headTeacherId || "",
                headName: g.headName || g.headTeacherName || "",
                headTeacherId: g.headTeacherId || g.headId || "",
                headTeacherName: g.headTeacherName || g.headName || "",
            }));

            setGroups(normalizedGroups);
            dispatch(setSubjectGroups(normalizedGroups));
            if (data.length > 0 && !selectedGroupId && window.innerWidth >= 1024) {
                setSelectedGroupId(data[0].id);
            }
        } catch (error) {
            console.error("Error fetching subject groups:", error);
            Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลกลุ่มสาระฯ ได้', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Indicators logic removed as requested by user

    const handleAddGroup = async () => {
        const { value: formValues } = await Swal.fire({
            title: 'เพิ่มกลุ่มสาระ',
            html:
                `<div class="text-left mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ชื่อกลุ่มสาระการเรียนรู้</div>` +
                `<input id="swal-group-name" class="swal2-input !m-0 !mb-4 !w-full !px-4 !h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="เช่น ภาษาไทย, คณิตศาสตร์...">` +
                `<div class="text-left mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">รหัส Mapping (ตัวเลข)</div>` +
                `<input id="swal-group-code" class="swal2-input !m-0 !w-full !px-4 !h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="รหัสตัวเลข">`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'ยืนยันเพิ่มข้อมูล',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            customClass: {
                popup: 'rounded-[24px] p-6',
                title: 'text-xl font-bold text-slate-900 dark:text-white mb-6',
                confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm',
                cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm'
            },
            preConfirm: () => {
                const name = (document.getElementById('swal-group-name') as HTMLInputElement).value;
                const code = (document.getElementById('swal-group-code') as HTMLInputElement).value;
                if (!name) {
                    Swal.showValidationMessage('กรุณาระบุชื่อกลุ่มสาระฯ');
                    return false;
                }
                return { name, code };
            }
        });

        if (formValues) {
            try {
                const colRef = collection(db, 'school-settings', schoolId, 'subject_groups');
                const docRef = await addDoc(colRef, { name: formValues.name, code: formValues.code });
                fetchGroups();
                setSelectedGroupId(docRef.id);
                Swal.fire({ icon: 'success', title: 'เพิ่มกลุ่มสาระฯ สำเร็จ', timer: 1500, showConfirmButton: false });
            } catch (error) {
                Swal.fire('Error', 'ไม่สามารถเพิ่มข้อมูลได้', 'error');
            }
        }
    };

    const handleEditGroupStart = async (group: SubjectGroup) => {
        const { value: formValues } = await Swal.fire({
            title: 'แก้ไขกลุ่มสาระ',
            html:
                `<div class="text-left mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ชื่อกลุ่มสาระการเรียนรู้</div>` +
                `<input id="swal-input1" class="swal2-input !m-0 !mb-4 !w-full !px-4 !h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="ชื่อกลุ่มสาระฯ" value="${group.name}">` +
                `<div class="text-left mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">รหัส Mapping (ตัวเลข)</div>` +
                `<input id="swal-input2" class="swal2-input !m-0 !w-full !px-4 !h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="รหัสตัวเลข (Mapping)" value="${group.code || ''}">`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'บันทึกการแก้ไข',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            customClass: {
                popup: 'rounded-[24px] p-6',
                title: 'text-xl font-bold text-slate-900 dark:text-white mb-6',
                confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm',
                cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm'
            },
            preConfirm: () => {
                return {
                    name: (document.getElementById('swal-input1') as HTMLInputElement).value,
                    code: (document.getElementById('swal-input2') as HTMLInputElement).value
                }
            }
        });

        if (formValues) {
            try {
                const docRef = doc(db, 'school-settings', schoolId, 'subject_groups', group.id);
                await updateDoc(docRef, { ...formValues });
                fetchGroups();
                Swal.fire({ icon: 'success', title: 'แก้ไขสำเร็จ', timer: 1000, showConfirmButton: false });
            } catch (error) {
                Swal.fire('Error', 'ไม่สามารถแก้ไขได้', 'error');
            }
        }
    };

    const handleDeleteGroup = async (id: string) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: "ข้อมูลกลุ่มสาระและรายละเอียดภายในจะหายไปทั้งหมด",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ยืนยัน ลบข้อมูล',
            cancelButtonText: 'ยกเลิก',
            customClass: {
                popup: 'rounded-[24px] p-6',
                title: 'text-xl font-bold text-slate-900 dark:text-white',
                htmlContainer: 'text-sm font-medium text-slate-500 dark:text-slate-400',
                confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm',
                cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm'
            }
        });

        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, 'school-settings', schoolId, 'subject_groups', id));
                if (selectedGroupId === id) setSelectedGroupId(null);
                fetchGroups();
                Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', timer: 1000, showConfirmButton: false });
            } catch (error) {
                Swal.fire('Error', 'ไม่สามารถลบได้', 'error');
            }
        }
    };

    // Indicator bank handlers removed

    // filteredIndicators logic removed

    const selectedGroup = groups.find(g => g.id === selectedGroupId);

    // Filter courses for selected group
    const uncategorizedCourses = useMemo(() => {
        const groupNames = new Set(groups.map(g => g.name));
        const groupCodes = new Set(groups.map(g => g.code).filter(Boolean));
        return courses.filter(c =>
            c.subjectGroup &&
            !groupNames.has(c.subjectGroup) &&
            !groupCodes.has(c.subjectGroup)
        );
    }, [courses, groups]);

    const filteredCoursesList = useMemo(() => {
        if (selectedGroupId === 'OTHERS') return uncategorizedCourses;
        if (!selectedGroup) return [];
        return courses.filter(c =>
            c.subjectGroup === selectedGroup.name ||
            (selectedGroup.code && c.subjectGroup === selectedGroup.code)
        );
    }, [courses, selectedGroup, selectedGroupId, uncategorizedCourses]);

    const handleUpdateGroupHead = async (teacherId: string, groupId?: string) => {
        const targetGroupId = groupId || selectedGroupId;
        if (!targetGroupId || !schoolId) return;

        const group = groups.find(g => g.id === targetGroupId);
        if (!group) return;

        try {
            const batch = writeBatch(db);
            const groupRef = doc(db, 'school-settings', schoolId, 'subject_groups', targetGroupId);

            let newHeadId = "";
            let newHeadName = "";

            // 1. If there's a previous head, remove their status from the teachers collection
            const previousHeadId = group.headId || group.headTeacherId;
            if (previousHeadId) {
                const prevTeacherRef = doc(db, 'school-settings', schoolId, 'teachers', previousHeadId);
                // Check if they are still head of THIS group before removing (insurance)
                batch.update(prevTeacherRef, {
                    isHeadOfLearningArea: false
                });
            }

            // 2. If a new head is selected, update their status
            if (teacherId) {
                const teacher = teachers.find(t => t.id === teacherId);
                if (teacher) {
                    newHeadId = teacher.id;
                    newHeadName = `${teacher.title || ''}${teacher.firstName} ${teacher.lastName}`;

                    const newTeacherRef = doc(db, 'school-settings', schoolId, 'teachers', teacherId);
                    batch.update(newTeacherRef, {
                        isHeadOfLearningArea: true,
                        learningArea: group.name,
                        subjectGroup: group.name // Sync both fields for compatibility
                    });
                }
            }

            // 3. Update the group document
            batch.update(groupRef, {
                headId: newHeadId,
                headName: newHeadName,
                headTeacherId: newHeadId,
                headTeacherName: newHeadName
            });

            await batch.commit();

            // Update local state
            setGroups(groups.map(g => g.id === targetGroupId ? {
                ...g,
                headId: newHeadId,
                headName: newHeadName,
                headTeacherId: newHeadId,
                headTeacherName: newHeadName
            } : g));
            dispatch(updateSubjectGroup({
                id: targetGroupId,
                headId: newHeadId,
                headName: newHeadName,
                headTeacherId: newHeadId,
                headTeacherName: newHeadName
            }));

            Swal.fire({
                icon: 'success',
                title: teacherId ? 'แต่งตั้งหัวหน้ากลุ่มสาระฯ สำเร็จ' : 'นำหัวหน้ากลุ่มสาระฯ ออกสำเร็จ',
                timer: 1500,
                showConfirmButton: false,
                background: document.documentElement.classList.contains('dark') ? '#1e1f21' : '#ffffff',
                color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1e1f21'
            });
        } catch (error) {
            console.error("Error updating group head:", error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    };

    const handleShowTeacherPicker = async (groupId: string) => {
        const group = groups.find(g => g.id === groupId);

        // Sort teachers by full name for better UX
        const sortedTeachers = [...teachers].sort((a, b) => {
            const nameA = `${a.title || ''}${a.firstName} ${a.lastName}`;
            const nameB = `${b.title || ''}${b.firstName} ${b.lastName}`;
            return nameA.localeCompare(nameB, 'th');
        });

        const { value: teacherId } = await Swal.fire({
            title: 'แต่งตั้งหัวหน้ากลุ่มสาระฯ',
            text: `เลือกบุคลากรเพื่อทำหน้าที่หัวหน้ากลุ่ม${group?.name}`,
            input: 'select',
            inputOptions: Object.fromEntries([
                ['', '-- ไม่ระบุ --'],
                ...sortedTeachers.map(t => [t.id, `${t.title || ''}${t.firstName} ${t.lastName}`])
            ]),
            inputValue: group?.headId || group?.headTeacherId || '',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการแต่งตั้ง',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            background: document.documentElement.classList.contains('dark') ? '#1e1f21' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1e1f21',
            customClass: {
                popup: 'rounded-[24px] p-8',
                title: 'text-xl font-bold text-slate-900 dark:text-white',
                htmlContainer: 'text-sm font-medium text-slate-500 dark:text-slate-400 mb-6',
                input: 'swal2-select !m-0 !w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl h-12 outline-none focus:ring-2 focus:ring-indigo-500/20',
                confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm',
                cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm'
            }
        });

        if (teacherId !== undefined) {
            handleUpdateGroupHead(teacherId, groupId);
        }
    };

    const handleUpdateCourseIndicators = async (courseId: string, type: 'indicators' | 'outcomes', data: string[]) => {
        try {
            const docRef = doc(db, 'school-settings', schoolId, 'courses', courseId);
            await updateDoc(docRef, { [type]: data });
            fetchCourses();
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1000, showConfirmButton: false });
        } catch (error) {
            Swal.fire('Error', 'ไม่สามารถบันทึกได้', 'error');
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-600 dark:text-slate-300 font-sans flex flex-col">
                {/* Premium Header Bar */}
                <div className="sticky top-[60px] z-40 px-4 lg:pl-16 py-3 bg-white/90 dark:bg-[#0b0e14]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
                    <div className="max-w-[1600px] mx-auto flex flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-fit">
                            <BackButton to="/academic/hub/registration" />
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">จัดการกลุ่มสาระ & ตัวชี้วัด</h1>
                                    <span className="px-2 py-0.5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-tighter rounded-md border border-indigo-500/20">Learning Areas</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                    <span>{groups.length} กลุ่มสาระ • {courses.length} รายวิชา</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Actions or Stats if needed */}
                        </div>
                    </div>
                </div>

                <div className="w-full mx-auto flex flex-col h-[calc(100vh-64px)] overflow-hidden">
                    <div className="flex-1 flex flex-col lg:flex-row p-3 xl:p-4 gap-3 xl:gap-4 min-h-0 overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto custom-scrollbar-horizontal">
                        {/* Column 1: Groups (Sidebar) - Premium Navigation */}
                        <div className={`w-full lg:w-60 xl:w-72 flex-shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] lg:rounded-[32px] flex flex-col shadow-sm transition-all duration-300 overflow-hidden ${selectedGroupId ? 'hidden lg:flex' : 'flex'}`}>
                            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-900/30 backdrop-blur-md">
                                <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <LayoutGrid size={14} className="text-indigo-600" />
                                    กลุ่มสาระฯ
                                </span>
                                <button
                                    onClick={handleAddGroup}
                                    className="w-7 h-7 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg shadow-indigo-600/20 transition-all active:scale-90 flex items-center justify-center"
                                    title="เพิ่มกลุ่มสาระฯ"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-1.5">
                                {groups.map(group => {
                                    const Icon = GROUP_ICONS[group.name] || LayoutGrid;
                                    const isActive = selectedGroupId === group.id;
                                    const colorKey = GROUP_COLORS[group.name] || 'indigo';

                                    // Refined Color Tokens
                                    const colorClasses: Record<string, { bg: string, text: string, icon: string, border: string }> = {
                                        indigo: { bg: 'bg-indigo-50/50 dark:bg-indigo-500/10', text: 'text-indigo-700 dark:text-indigo-400', icon: 'bg-indigo-600', border: 'border-indigo-100 dark:border-indigo-500/20' },
                                        blue: { bg: 'bg-blue-50/50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', icon: 'bg-blue-600', border: 'border-blue-100 dark:border-blue-500/20' },
                                        emerald: { bg: 'bg-emerald-50/50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', icon: 'bg-emerald-600', border: 'border-emerald-100 dark:border-emerald-500/20' },
                                        amber: { bg: 'bg-amber-50/50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', icon: 'bg-amber-600', border: 'border-amber-100 dark:border-amber-500/20' },
                                        rose: { bg: 'bg-rose-50/50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400', icon: 'bg-rose-600', border: 'border-rose-100 dark:border-rose-500/20' },
                                        pink: { bg: 'bg-pink-50/50 dark:bg-pink-500/10', text: 'text-pink-700 dark:text-pink-400', icon: 'bg-pink-600', border: 'border-pink-100 dark:border-pink-500/20' },
                                        orange: { bg: 'bg-orange-50/50 dark:bg-orange-500/10', text: 'text-orange-700 dark:text-orange-400', icon: 'bg-orange-600', border: 'border-orange-100 dark:border-orange-500/20' },
                                        sky: { bg: 'bg-sky-50/50 dark:bg-sky-500/10', text: 'text-sky-700 dark:text-sky-400', icon: 'bg-sky-600', border: 'border-sky-100 dark:border-sky-500/20' },
                                        teal: { bg: 'bg-teal-50/50 dark:bg-teal-500/10', text: 'text-teal-700 dark:text-teal-400', icon: 'bg-teal-600', border: 'border-teal-100 dark:border-teal-500/20' },
                                    };

                                    const colors = colorClasses[colorKey];
                                    const headId = group.headId || group.headTeacherId;
                                    const headName = group.headName || group.headTeacherName;

                                    return (
                                        <div key={group.id} className="group/item relative px-1">
                                            <button
                                                onClick={() => {
                                                    setSelectedGroupId(group.id);
                                                    setSelectedCourseId(null);
                                                    setSearchTerm("");
                                                }}
                                                className={`w-full text-left p-2 rounded-2xl flex items-center gap-3 transition-all duration-300 border ${isActive
                                                    ? `${colors.bg} ${colors.border} shadow-sm border-solid`
                                                    : 'text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:translate-x-1'
                                                    }`}
                                            >
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 shrink-0 ${isActive ? `${colors.icon} text-white shadow-lg` : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover/item:bg-white dark:group-hover/item:bg-slate-700'}`}>
                                                    <Icon size={18} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-xs font-black truncate leading-tight ${isActive ? colors.text : 'text-slate-700 dark:text-slate-300'}`}>{group.name}</div>
                                                    {headId ? (
                                                        <div
                                                            className={`text-[9px] font-bold flex items-center gap-1 mt-1 transition-colors w-fit ${isActive ? colors.text : 'text-slate-400'}`}
                                                            onClick={(e) => { e.stopPropagation(); handleShowTeacherPicker(group.id); }}
                                                        >
                                                            <div className={`w-1 h-1 rounded-full ${isActive ? colors.icon : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                                                            <span className="truncate max-w-[130px] opacity-70">หัวหน้า: {headName}</span>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            onClick={(e) => { e.stopPropagation(); handleShowTeacherPicker(group.id); }}
                                                            className={`text-[8px] font-black flex items-center gap-1 mt-1 py-0.5 transition-all opacity-0 group-hover/item:opacity-100 cursor-pointer text-indigo-500 hover:underline`}
                                                        >
                                                            <UserPlus size={10} /> แต่งตั้งหัวหน้า
                                                        </div>
                                                    )}
                                                </div>
                                                {isActive && <div className={`w-1 h-5 rounded-full shrink-0 ${colors.icon}`}></div>}
                                            </button>

                                            {/* Inline Actions - Refined */}
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/item:flex items-center gap-1 bg-white dark:bg-slate-800 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-slate-100 dark:border-slate-700 rounded-xl p-1 z-10 transition-all animate-in fade-in scale-in-95 backdrop-blur-md bg-white/90 dark:bg-slate-800/90">
                                                <button onClick={(e) => { e.stopPropagation(); handleEditGroupStart(group); }} className="w-8 h-8 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-slate-400 hover:text-indigo-600 rounded-lg transition-all flex items-center justify-center"><Edit2 size={12} /></button>
                                                <div className="w-[1px] h-3 bg-slate-100 dark:bg-slate-700"></div>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }} className="w-8 h-8 hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 rounded-lg transition-all flex items-center justify-center"><Trash2 size={12} /></button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {uncategorizedCourses.length > 0 && (
                                    <button
                                        onClick={() => {
                                            setSelectedGroupId('OTHERS');
                                            setSelectedCourseId(null);
                                            setSearchTerm("");
                                        }}
                                        className={"w-full text-left p-2.5 rounded-2xl flex items-center gap-3 mt-4 border border-dashed transition-all " + (selectedGroupId === 'OTHERS'
                                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xl scale-[1.02]'
                                            : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        )}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedGroupId === 'OTHERS' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                            <Package size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-black">อื่นๆ / ไม่ระบุกลุ่ม</div>
                                            <div className="text-[10px] opacity-60 font-bold">{uncategorizedCourses.length} รายวิชา</div>
                                        </div>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Column 2: Courses - Refined List Design */}
                        <div className={`w-full lg:w-80 xl:w-96 flex-shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] lg:rounded-[32px] flex flex-col shadow-sm transition-all duration-300 overflow-hidden ${(selectedGroupId && !selectedCourseId) ? 'flex' : 'hidden lg:flex'}`}>
                            {selectedGroupId && (
                                <button
                                    onClick={() => {
                                        setSelectedGroupId(null);
                                        setSelectedCourseId(null);
                                    }}
                                    className="lg:hidden m-4 flex items-center gap-2 text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-500/20 active:scale-95 transition-all w-fit"
                                >
                                    <ArrowLeft size={14} /> เลือกกลุ่มสาระใหม่
                                </button>
                            )}
                            <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-4 bg-slate-50/20 dark:bg-slate-900/20 backdrop-blur-sm">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <BookMarked size={14} className="text-emerald-500" />
                                        รายชื่อวิชา
                                    </span>
                                    <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/10 uppercase tracking-widest">{filteredCoursesList.length} วิชา</span>
                                </div>
                                <div className="relative group">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 transition-colors group-focus-within:text-indigo-500" size={14} />
                                    <input
                                        type="text"
                                        placeholder="พิมพ์ชื่อหรือรหัสวิชา..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 dark:focus:border-indigo-500/50 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
                                {filteredCoursesList.filter(c =>
                                    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    c.code.toLowerCase().includes(searchTerm.toLowerCase())
                                ).map(course => {
                                    const isActive = selectedCourseId === course.id;
                                    const isAdditional = course.type === 'เพิ่มเติม';
                                    return (
                                        <button
                                            key={course.id}
                                            onClick={() => setSelectedCourseId(course.id)}
                                            className={`w-full text-left p-3.5 rounded-2xl transition-all duration-300 relative group/course border animate-in fade-in slide-in-from-left-1 ${isActive
                                                ? 'bg-white dark:bg-slate-800 border-indigo-100 dark:border-indigo-500/20 shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:scale-[1.02] z-10'
                                                : 'bg-transparent border-transparent hover:bg-white dark:hover:bg-slate-800/50 hover:border-slate-100 dark:hover:border-slate-800 hover:shadow-sm'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className={`text-[10px] font-black px-2 py-0.5 rounded-md tracking-wider border ${isActive ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>{course.code}</div>
                                                <div className={`text-[8px] font-black px-2 py-0.5 rounded-full border tracking-widest uppercase ${isAdditional
                                                    ? 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                                    : 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20'}`}>
                                                    {isAdditional ? 'เพิ่มเติม' : 'พื้นฐาน'}
                                                </div>
                                            </div>
                                            <div className={`text-xs font-black leading-snug break-words transition-colors ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 group-hover/course:text-slate-900 dark:group-hover/course:text-slate-200'}`}>
                                                {course.title}
                                            </div>
                                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/4 bg-indigo-600 rounded-r-full"></div>}
                                        </button>
                                    );
                                })}

                                {filteredCoursesList.length === 0 && (
                                    <div className="py-24 text-center select-none bg-slate-50/50 dark:bg-slate-900/50 rounded-[32px] mx-2">
                                        <div className="w-16 h-16 bg-white dark:bg-slate-950 rounded-[20px] shadow-sm flex items-center justify-center mx-auto mb-5 border border-slate-100 dark:border-slate-800">
                                            <FileSearch size={24} className="text-slate-200 dark:text-slate-700" />
                                        </div>
                                        <p className="text-[11px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">ไม่พบรายวิชา</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Column 3: Management Content */}
                        <div className={`flex-1 min-w-0 lg:min-w-[400px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[20px] xl:rounded-[24px] shadow-sm flex flex-col transition-all duration-300 overflow-hidden ${!selectedCourseId ? 'hidden lg:flex' : 'flex'}`}>
                            {selectedCourseId ? (() => {
                                const course = courses.find(c => c.id === selectedCourseId);
                                const isBasic = course?.type === 'พื้นฐาน';
                                const items = (isBasic ? course?.indicators : course?.expectedOutcomes) || [];
                                return (
                                    <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 lg:slide-in-from-right-4 duration-500">
                                        {/* Ultra-Premium Header: Modern & Dynamic */}
                                        {/* Ultra-Premium Dashboard Header: Refined & Modern */}
                                        <div className="relative bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 transition-all shrink-0">
                                            {/* Top Accent Line */}
                                            <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600"></div>

                                            {/* Design elements */}
                                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full -mr-32 -mt-32 pointer-events-none"></div>

                                            <div className="px-4 py-2.5 lg:px-5 lg:py-3 xl:px-6 xl:py-3.5">
                                                <div className="max-w-6xl mx-auto">
                                                    {/* Navigation Strategy: Context & Back Button */}
                                                    <div className="flex items-center justify-between mb-2">
                                                        <button
                                                            onClick={() => setSelectedCourseId(null)}
                                                            className="lg:hidden flex items-center gap-2 text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-500/20 active:scale-95 transition-all"
                                                        >
                                                            <ArrowLeft size={14} /> ย้อนกลับ
                                                        </button>

                                                        <div className="hidden lg:flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] select-none">
                                                            <span className="hover:text-indigo-500 transition-colors uppercase tracking-widest">{selectedGroup?.name}</span>
                                                            <ChevronRight size={14} className="text-slate-200 dark:text-slate-800" />
                                                            <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-100/50 dark:border-indigo-500/20">{course?.code}</span>
                                                        </div>

                                                        <div className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                            <span className="text-[10px] font-black uppercase tracking-widest">{items.length} รายการปัจจุบัน</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                                        <div className="flex-1 min-w-0 space-y-1">
                                                            <div className="inline-flex px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none">
                                                                รายวิชา{course?.type}
                                                            </div>
                                                            <h2 className="text-base lg:text-lg font-black text-slate-900 dark:text-white leading-tight tracking-tight drop-shadow-sm break-words">
                                                                {course?.title}
                                                            </h2>
                                                            <p className="text-[8px] lg:text-[9px] font-medium text-slate-400 dark:text-slate-500 max-w-2xl leading-relaxed">
                                                                จัดการ{isBasic ? 'ตัวชี้วัดรายวิชาพื้นฐาน' : 'ผลการเรียนรู้รายวิชาเพิ่มเติม'}
                                                            </p>
                                                        </div>

                                                        <button
                                                            onClick={() => {
                                                                const isBasic = course?.type === 'พื้นฐาน';
                                                                Swal.fire({
                                                                    title: `เพิ่ม${isBasic ? 'ตัวชี้วัด' : 'ผลการเรียนรู้'}`,
                                                                    input: 'textarea',
                                                                    inputPlaceholder: `พิมพ์หรือวางข้อมูลเพื่อเพิ่มรายการใหม่...`,
                                                                    showCancelButton: true,
                                                                    confirmButtonText: 'บันทึกข้อมูล',
                                                                    cancelButtonText: 'ยกเลิก',
                                                                    confirmButtonColor: '#4f46e5',
                                                                    customClass: {
                                                                        popup: 'rounded-[32px] p-6 lg:p-10',
                                                                        title: 'text-2xl font-black text-slate-900 dark:text-white mb-6',
                                                                        input: 'font-sarabun text-sm rounded-2xl h-48 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 focus:ring-indigo-500/20 shadow-inner',
                                                                        confirmButton: 'px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20',
                                                                        cancelButton: 'px-8 py-3 rounded-xl font-bold text-sm'
                                                                    }
                                                                }).then((result) => {
                                                                    if (result.isConfirmed && result.value) {
                                                                        const newItems = result.value.split('\n').filter((s: string) => s.trim().length > 0);
                                                                        if (newItems.length > 0) {
                                                                            const key = isBasic ? 'indicators' : 'outcomes';
                                                                            const current = isBasic ? (course?.indicators || []) : (course?.expectedOutcomes || []);
                                                                            handleUpdateCourseIndicators(course!.id, key, [...current, ...newItems]);
                                                                        }
                                                                    }
                                                                });
                                                            }}
                                                            className="w-full lg:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[12px] text-[10px] lg:text-[11px] font-black shadow-lg shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
                                                        >
                                                            <Plus size={14} />
                                                            เพิ่มข้อมูล
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-slate-950/20">
                                            <div className="max-w-5xl mx-auto p-3 lg:p-6 space-y-6">
                                                <div className="flex items-center justify-between px-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-0.5 h-4 bg-indigo-500 rounded-full"></div>
                                                        <h3 className="text-[10px] lg:text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">รายการข้อมูลทั้งหมด</h3>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 gap-2.5">
                                                    {items.map((item, i) => (
                                                        <div key={i} className="group/row flex gap-3 lg:gap-4 p-3 lg:p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-[16px] shadow-sm hover:shadow-lg transition-all duration-300 relative overflow-hidden">
                                                            {/* Index Badge */}
                                                            <div className="relative w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 flex items-center justify-center shrink-0 text-[10px] font-black text-slate-300 dark:text-slate-600 group-hover/row:text-indigo-500 group-hover/row:bg-indigo-50 dark:group-hover/row:bg-indigo-500/10 group-hover/row:border-indigo-100 dark:group-hover/row:border-indigo-500/20 transition-all shadow-inner">
                                                                {String(i + 1).padStart(2, '0')}
                                                            </div>

                                                            <div className="flex-1 pr-10">
                                                                <p className="text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed font-sarabun">
                                                                    {item}
                                                                </p>
                                                            </div>

                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover/row:opacity-100 transition-all translate-x-1 group-hover/row:translate-x-0">
                                                                <button
                                                                    onClick={() => {
                                                                        const key = isBasic ? 'indicators' : 'outcomes';
                                                                        const current = isBasic ? (course?.indicators || []) : (course?.expectedOutcomes || []);
                                                                        handleUpdateCourseIndicators(course!.id, key, current.filter((_, idx) => idx !== i));
                                                                    }}
                                                                    className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center shadow-md shadow-red-500/5 active:scale-95"
                                                                    title="ลบรายการ"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {items.length === 0 && (
                                                        <div className="py-24 text-center bg-white dark:bg-slate-900 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[32px] flex flex-col items-center justify-center">
                                                            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-3xl shadow-inner flex items-center justify-center mb-6">
                                                                <ListChecks size={40} className="text-slate-200 dark:text-slate-600" />
                                                            </div>
                                                            <h4 className="text-xl font-black text-slate-800 dark:text-slate-200 mb-2">ยังไม่มีข้อมูลรายการ</h4>
                                                            <p className="text-xs font-medium text-slate-400 max-w-[240px] mx-auto leading-relaxed">เพิ่มตัวชี้วัดหรือผลการเรียนรู้ เพื่อใช้ประเมินผลการเรียนในลำดับถัดไป</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })() : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-12 select-none relative overflow-hidden bg-slate-50/20 dark:bg-slate-950/20">
                                    {/* Abstract Decorative Elements */}
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
                                        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-500/10 blur-[120px] rounded-full animate-pulse"></div>
                                        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-emerald-500/10 blur-[120px] rounded-full animate-pulse delay-700"></div>
                                    </div>

                                    <div className="relative group perspective-1000">
                                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 blur-[80px] opacity-20 rounded-full group-hover:opacity-30 transition-opacity duration-700"></div>
                                        <div className="relative w-36 h-36 lg:w-44 lg:h-44 bg-white dark:bg-slate-900 rounded-[48px] shadow-[0_32px_80px_-15px_rgba(0,0,0,0.1)] border border-white/50 dark:border-slate-800 flex items-center justify-center mb-12 transition-all duration-700 group-hover:scale-105 group-hover:rotate-3">
                                            <div className="w-20 h-20 lg:w-24 lg:h-24 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center border border-slate-100 dark:border-slate-700/50 shadow-inner">
                                                <MousePointerClick size={48} className="text-indigo-500/40 lg:hidden" />
                                                <MonitorCheck size={56} className="text-indigo-600/50 hidden lg:block stroke-[1.5px]" />
                                            </div>

                                            {/* Floating Mini Orbs */}
                                            <div className="absolute -top-4 -right-4 w-10 h-10 bg-emerald-500 rounded-2xl shadow-lg border-4 border-white dark:border-slate-900 animate-bounce delay-150 flex items-center justify-center text-white">
                                                <CheckCircle2 size={16} />
                                            </div>
                                            <div className="absolute -bottom-2 -left-6 w-12 h-12 bg-indigo-600 rounded-3xl shadow-lg border-4 border-white dark:border-slate-900 animate-bounce flex items-center justify-center text-white">
                                                <ListChecks size={20} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative z-10 space-y-4 max-w-sm mx-auto">
                                        <h3 className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">
                                            พร้อมสำหรับการจัดการ <br />
                                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-500">ตัวชี้วัด & ผลการเรียนรู้</span>
                                        </h3>
                                        <p className="text-sm font-bold text-slate-400 dark:text-slate-500 leading-relaxed px-4 opacity-80">
                                            เริ่มจากการเลือก <span className="text-slate-600 dark:text-slate-300">กลุ่มสาระฯ</span> และ <span className="text-slate-600 dark:text-slate-300">รายวิชา</span> ที่คุณต้องการตรวจสอบหรืออัปเดตข้อมูลตัวชี้วัด (EPP)
                                        </p>

                                        <div className="pt-8 flex flex-wrap items-center justify-center gap-4 opacity-50">
                                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-full">
                                                <MousePointer2 size={12} /> คลิกเพื่อเลือก
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-full">
                                                <Terminal size={12} /> พิมพ์เพื่อค้นหา
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default SubjectGroupManagementPage;
