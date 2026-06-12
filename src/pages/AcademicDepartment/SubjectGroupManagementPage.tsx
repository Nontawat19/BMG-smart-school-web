import React, { useState, useEffect, useMemo } from 'react';
import BackButton from "@/components/Shared/BackButton";
import { firestore as db } from '../../firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { setSubjectGroups, updateSubjectGroup } from '@/store/slices/subjectGroupsSlice';
import MainLayout from "@/layouts/MainLayout";
import {
    ArrowLeft, Plus, Trash2, Edit2, BookOpen, Search,
    ChevronRight, LayoutGrid, CheckCircle2, Users, ListChecks, Target,
    Activity, Compass, Globe, Music, Palette, Wrench, Crown, UserPlus,
    Package, BookMarked, FileSearch, MousePointerClick, MonitorCheck,
    MousePointer2, Terminal, Layers, BookCopy
} from 'lucide-react';
import Swal from 'sweetalert2';

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

interface Course {
    id: string;
    title: string;
    code: string;
    subjectGroup?: string;
    type?: string;
    indicators?: string[];
    expectedOutcomes?: string[];
}

const GROUP_ICONS: Record<string, any> = {
    "ภาษาไทย": BookOpen,
    "คณิตศาสตร์": Target,
    "วิทยาศาสตร์และเทคโนโลยี": Compass,
    "สังคมศึกษา ศาสนา และวัฒนธรรม": Globe,
    "สุขศึกษาและพลศึกษา": Activity,
    "ศิลปะ": Palette,
    "การงานอาชีพ": Wrench,
    "ภาษาต่างประเทศ": Music,
    "กิจกรรมพัฒนาผู้เรียน": Users,
    "กลุ่มสาระค้นคว้า": Search,
};

const GROUP_GRADIENTS: Record<string, { from: string; to: string; pill: string; accent: string; light: string; border: string }> = {
    "ภาษาไทย":                          { from: "from-indigo-500",  to: "to-violet-600",  pill: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20",  accent: "from-indigo-500 to-violet-500",  light: "bg-indigo-50 dark:bg-indigo-500/10",  border: "border-indigo-200 dark:border-indigo-500/30" },
    "คณิตศาสตร์":                       { from: "from-blue-500",    to: "to-cyan-600",    pill: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20",             accent: "from-blue-500 to-cyan-500",      light: "bg-blue-50 dark:bg-blue-500/10",      border: "border-blue-200 dark:border-blue-500/30" },
    "วิทยาศาสตร์และเทคโนโลยี":          { from: "from-emerald-500", to: "to-teal-600",    pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20", accent: "from-emerald-500 to-teal-500", light: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/30" },
    "สังคมศึกษา ศาสนา และวัฒนธรรม":    { from: "from-amber-500",   to: "to-orange-600",  pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",         accent: "from-amber-500 to-orange-500",   light: "bg-amber-50 dark:bg-amber-500/10",    border: "border-amber-200 dark:border-amber-500/30" },
    "สุขศึกษาและพลศึกษา":              { from: "from-rose-500",    to: "to-pink-600",    pill: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",               accent: "from-rose-500 to-pink-500",      light: "bg-rose-50 dark:bg-rose-500/10",      border: "border-rose-200 dark:border-rose-500/30" },
    "ศิลปะ":                            { from: "from-pink-500",    to: "to-fuchsia-600", pill: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-500/10 dark:text-pink-300 dark:border-pink-500/20",               accent: "from-pink-500 to-fuchsia-500",   light: "bg-pink-50 dark:bg-pink-500/10",      border: "border-pink-200 dark:border-pink-500/30" },
    "การงานอาชีพ":                      { from: "from-orange-500",  to: "to-amber-600",   pill: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/20",   accent: "from-orange-500 to-amber-500",   light: "bg-orange-50 dark:bg-orange-500/10",  border: "border-orange-200 dark:border-orange-500/30" },
    "ภาษาต่างประเทศ":                   { from: "from-sky-500",     to: "to-blue-600",    pill: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20",                     accent: "from-sky-500 to-blue-500",       light: "bg-sky-50 dark:bg-sky-500/10",        border: "border-sky-200 dark:border-sky-500/30" },
    "กิจกรรมพัฒนาผู้เรียน":             { from: "from-teal-500",    to: "to-emerald-600", pill: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20",               accent: "from-teal-500 to-emerald-500",   light: "bg-teal-50 dark:bg-teal-500/10",      border: "border-teal-200 dark:border-teal-500/30" },
    "กลุ่มสาระค้นคว้า":                 { from: "from-violet-500",  to: "to-purple-600",  pill: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20",   accent: "from-violet-500 to-purple-500",  light: "bg-violet-50 dark:bg-violet-500/10",  border: "border-violet-200 dark:border-violet-500/30" },
};

const DEFAULT_GRADIENT = { from: "from-slate-500", to: "to-slate-600", pill: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600", accent: "from-slate-400 to-slate-500", light: "bg-slate-50 dark:bg-slate-800", border: "border-slate-200 dark:border-slate-700" };

const DEFAULT_GROUPS = [
    { name: "ภาษาไทย", code: "1" }, { name: "คณิตศาสตร์", code: "2" },
    { name: "วิทยาศาสตร์และเทคโนโลยี", code: "3" }, { name: "สังคมศึกษา ศาสนา และวัฒนธรรม", code: "4" },
    { name: "สุขศึกษาและพลศึกษา", code: "5" }, { name: "ศิลปะ", code: "6" },
    { name: "การงานอาชีพ", code: "7" }, { name: "ภาษาต่างประเทศ", code: "8" },
    { name: "กิจกรรมพัฒนาผู้เรียน", code: "9" }, { name: "กลุ่มสาระค้นคว้า", code: "I" },
];

const SubjectGroupManagementPage: React.FC = () => {
    const [groups, setGroups] = useState<SubjectGroup[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    const currentUser = useSelector((state: RootState) => state.auth.user);
    const dispatch = useDispatch();
    const schoolId = (currentUser as any)?.schoolId;

    useEffect(() => {
        if (schoolId) { fetchGroups(); fetchCourses(); fetchTeachers(); }
    }, [schoolId]);

    const fetchTeachers = async () => {
        try {
            const snap = await getDocs(collection(db, 'school-settings', schoolId, 'teachers'));
            setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
        } catch (e) { console.error(e); }
    };

    const fetchCourses = async () => {
        try {
            const snap = await getDocs(collection(db, 'school-settings', schoolId, 'courses'));
            setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
        } catch (e) { console.error(e); }
    };

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const colRef = collection(db, 'school-settings', schoolId, 'subject_groups');
            const snap = await getDocs(colRef);
            let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SubjectGroup));
            const existingCodes = new Set(data.map(g => g.code));
            const missing = DEFAULT_GROUPS.filter(dg => !existingCodes.has(dg.code));
            if (missing.length > 0) {
                const batch = writeBatch(db);
                const added: SubjectGroup[] = [];
                missing.forEach(item => {
                    const ref = doc(colRef);
                    batch.set(ref, { name: item.name, code: item.code });
                    added.push({ id: ref.id, name: item.name, code: item.code });
                });
                await batch.commit();
                data = [...data, ...added];
            }
            const sorted = data.sort((a, b) => (a.code || '999').localeCompare(b.code || '999', undefined, { numeric: true, sensitivity: 'base' }));
            const normalized = sorted.map(g => ({ ...g, headId: g.headId || g.headTeacherId || "", headName: g.headName || g.headTeacherName || "", headTeacherId: g.headTeacherId || g.headId || "", headTeacherName: g.headTeacherName || g.headName || "" }));
            setGroups(normalized);
            dispatch(setSubjectGroups(normalized));
            if (data.length > 0 && !selectedGroupId && window.innerWidth >= 1024) setSelectedGroupId(data[0].id);
        } catch (e) {
            Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลได้', 'error');
        } finally { setLoading(false); }
    };

    const handleAddGroup = async () => {
        const { value } = await Swal.fire({
            title: 'เพิ่มกลุ่มสาระ',
            html: `<div class="text-left mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ชื่อกลุ่มสาระการเรียนรู้</div><input id="swal-group-name" class="swal2-input !m-0 !mb-4 !w-full !px-4 !h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="เช่น ภาษาไทย, คณิตศาสตร์..."><div class="text-left mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">รหัส Mapping</div><input id="swal-group-code" class="swal2-input !m-0 !w-full !px-4 !h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="เช่น 1, 2, I">`,
            focusConfirm: false, showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#4f46e5',
            customClass: { popup: 'rounded-[24px] p-6', confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm', cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm' },
            preConfirm: () => {
                const name = (document.getElementById('swal-group-name') as HTMLInputElement).value;
                const code = (document.getElementById('swal-group-code') as HTMLInputElement).value;
                if (!name) { Swal.showValidationMessage('กรุณาระบุชื่อ'); return false; }
                return { name, code };
            }
        });
        if (value) {
            const ref = await addDoc(collection(db, 'school-settings', schoolId, 'subject_groups'), { name: value.name, code: value.code });
            fetchGroups(); setSelectedGroupId(ref.id);
            Swal.fire({ icon: 'success', title: 'เพิ่มสำเร็จ', timer: 1500, showConfirmButton: false });
        }
    };

    const handleEditGroup = async (group: SubjectGroup) => {
        const { value } = await Swal.fire({
            title: 'แก้ไขกลุ่มสาระ',
            html: `<div class="text-left mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ชื่อกลุ่มสาระการเรียนรู้</div><input id="swal-input1" class="swal2-input !m-0 !mb-4 !w-full !px-4 !h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl outline-none" value="${group.name}"><div class="text-left mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">รหัส Mapping</div><input id="swal-input2" class="swal2-input !m-0 !w-full !px-4 !h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl outline-none" value="${group.code || ''}">`,
            focusConfirm: false, showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#4f46e5',
            customClass: { popup: 'rounded-[24px] p-6', confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm', cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm' },
            preConfirm: () => ({ name: (document.getElementById('swal-input1') as HTMLInputElement).value, code: (document.getElementById('swal-input2') as HTMLInputElement).value })
        });
        if (value) {
            await updateDoc(doc(db, 'school-settings', schoolId, 'subject_groups', group.id), { ...value });
            fetchGroups();
            Swal.fire({ icon: 'success', title: 'แก้ไขสำเร็จ', timer: 1000, showConfirmButton: false });
        }
    };

    const handleDeleteGroup = async (id: string) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?', text: "ข้อมูลจะหายไปทั้งหมด", icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#ef4444', confirmButtonText: 'ลบข้อมูล', cancelButtonText: 'ยกเลิก',
            customClass: { popup: 'rounded-[24px] p-6', confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm', cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm' }
        });
        if (result.isConfirmed) {
            await deleteDoc(doc(db, 'school-settings', schoolId, 'subject_groups', id));
            if (selectedGroupId === id) setSelectedGroupId(null);
            fetchGroups();
            Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', timer: 1000, showConfirmButton: false });
        }
    };

    const handleShowTeacherPicker = async (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        const sorted = [...teachers].sort((a, b) => `${a.title}${a.firstName} ${a.lastName}`.localeCompare(`${b.title}${b.firstName} ${b.lastName}`, 'th'));
        const { value: teacherId } = await Swal.fire({
            title: 'แต่งตั้งหัวหน้ากลุ่มสาระฯ', text: `กลุ่ม${group?.name}`,
            input: 'select',
            inputOptions: Object.fromEntries([['', '-- ไม่ระบุ --'], ...sorted.map(t => [t.id, `${t.title || ''}${t.firstName} ${t.lastName}`])]),
            inputValue: group?.headId || group?.headTeacherId || '',
            showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#4f46e5',
            background: document.documentElement.classList.contains('dark') ? '#1e1f21' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1e1f21',
            customClass: { popup: 'rounded-[24px] p-8', input: 'swal2-select !m-0 !w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-semibold rounded-xl h-12', confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm', cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm' }
        });
        if (teacherId !== undefined) {
            const batch = writeBatch(db);
            const groupRef = doc(db, 'school-settings', schoolId, 'subject_groups', groupId);
            const prev = group?.headId || group?.headTeacherId;
            if (prev) batch.update(doc(db, 'school-settings', schoolId, 'teachers', prev), { isHeadOfLearningArea: false });
            let newId = ""; let newName = "";
            if (teacherId) {
                const t = teachers.find(t => t.id === teacherId);
                if (t) { newId = t.id; newName = `${t.title || ''}${t.firstName} ${t.lastName}`; batch.update(doc(db, 'school-settings', schoolId, 'teachers', teacherId), { isHeadOfLearningArea: true, learningArea: group?.name, subjectGroup: group?.name }); }
            }
            batch.update(groupRef, { headId: newId, headName: newName, headTeacherId: newId, headTeacherName: newName });
            await batch.commit();
            setGroups(groups.map(g => g.id === groupId ? { ...g, headId: newId, headName: newName, headTeacherId: newId, headTeacherName: newName } : g));
            dispatch(updateSubjectGroup({ id: groupId, headId: newId, headName: newName, headTeacherId: newId, headTeacherName: newName }));
            Swal.fire({ icon: 'success', title: teacherId ? 'แต่งตั้งสำเร็จ' : 'นำออกสำเร็จ', timer: 1500, showConfirmButton: false, background: document.documentElement.classList.contains('dark') ? '#1e1f21' : '#ffffff', color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1e1f21' });
        }
    };

    const handleUpdateCourseIndicators = async (courseId: string, type: 'indicators' | 'outcomes', data: string[]) => {
        await updateDoc(doc(db, 'school-settings', schoolId, 'courses', courseId), { [type]: data });
        fetchCourses();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1000, showConfirmButton: false });
    };

    const selectedGroup = groups.find(g => g.id === selectedGroupId);

    const uncategorizedCourses = useMemo(() => {
        const names = new Set(groups.map(g => g.name));
        const codes = new Set(groups.map(g => g.code).filter(Boolean));
        return courses.filter(c => c.subjectGroup && !names.has(c.subjectGroup) && !codes.has(c.subjectGroup));
    }, [courses, groups]);

    const filteredCoursesList = useMemo(() => {
        if (selectedGroupId === 'OTHERS') return uncategorizedCourses;
        if (!selectedGroup) return [];
        return courses.filter(c => c.subjectGroup === selectedGroup.name || (selectedGroup.code && c.subjectGroup === selectedGroup.code));
    }, [courses, selectedGroup, selectedGroupId, uncategorizedCourses]);

    const totalCourses = courses.length;
    const totalGroups = groups.length;

    if (loading) {
        return (
            <MainLayout>
                <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
                            <Layers size={28} className="text-white" />
                        </div>
                        <p className="text-sm font-bold text-gray-400">กำลังโหลดข้อมูล...</p>
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">

                {/* ── Hero Header Bar ── */}
                <div className="sticky top-[60px] z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                    <div className="px-4 lg:pl-10 lg:pr-6 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <BackButton to="/academic/hub/registration" />
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
                                <Layers size={18} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base font-black text-gray-900 dark:text-white tracking-tight leading-none">จัดการกลุ่มสาระ &amp; ตัวชี้วัด</h1>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">Learning Areas &amp; Indicators</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-full">
                                <Layers size={12} className="text-indigo-500" />
                                <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">{totalGroups} กลุ่มสาระ</span>
                            </div>
                            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-full">
                                <BookCopy size={12} className="text-emerald-500" />
                                <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">{totalCourses} รายวิชา</span>
                            </div>
                            <button onClick={handleAddGroup} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-[11px] font-black shadow-lg shadow-indigo-500/25 transition-all active:scale-95">
                                <Plus size={13} /> เพิ่มกลุ่มสาระ
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── 3-Column Layout ── */}
                <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden h-[calc(100vh-120px)]">

                    {/* ── Column 1: Subject Groups ── */}
                    <div className={`w-full lg:w-64 xl:w-72 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden ${selectedGroupId ? 'hidden lg:flex' : 'flex'}`}>
                        <div className="px-4 lg:pl-10 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <LayoutGrid size={13} className="text-gray-400" />
                                <span className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">กลุ่มสาระฯ</span>
                            </div>
                            <span className="text-[10px] font-black text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{groups.length}</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 lg:pl-8 space-y-0.5">
                            {groups.map(group => {
                                const Icon = GROUP_ICONS[group.name] || LayoutGrid;
                                const isActive = selectedGroupId === group.id;
                                const g = GROUP_GRADIENTS[group.name] || DEFAULT_GRADIENT;
                                const headName = group.headName || group.headTeacherName;
                                const headId = group.headId || group.headTeacherId;
                                const courseCount = courses.filter(c => c.subjectGroup === group.name || (group.code && c.subjectGroup === group.code)).length;

                                return (
                                    <div key={group.id} className="group/item relative">
                                        <button
                                            onClick={() => { setSelectedGroupId(group.id); setSelectedCourseId(null); setSearchTerm(""); }}
                                            className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${isActive ? `${g.light} ${g.border} border` : 'hover:bg-gray-50 dark:hover:bg-gray-800/60 border border-transparent'}`}
                                        >
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${isActive ? `bg-gradient-to-br ${g.from} ${g.to} text-white shadow-md` : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                                                <Icon size={16} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-xs font-black truncate leading-tight ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{group.name}</div>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    {headId ? (
                                                        <span className="text-[9px] font-bold text-gray-400 truncate max-w-[110px]">{headName}</span>
                                                    ) : (
                                                        <span
                                                            onClick={(e) => { e.stopPropagation(); handleShowTeacherPicker(group.id); }}
                                                            className="text-[9px] font-black text-indigo-400 hover:text-indigo-600 cursor-pointer flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                                        >
                                                            <UserPlus size={9} /> แต่งตั้ง
                                                        </span>
                                                    )}
                                                    {courseCount > 0 && <span className="text-[9px] font-bold text-gray-300 dark:text-gray-600 ml-auto shrink-0">{courseCount} วิชา</span>}
                                                </div>
                                            </div>
                                            {isActive && <div className={`w-1 h-5 rounded-full shrink-0 bg-gradient-to-b ${g.from} ${g.to}`} />}
                                        </button>

                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/item:flex items-center gap-0.5 bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700 rounded-lg p-0.5 z-10">
                                            <button onClick={(e) => { e.stopPropagation(); handleShowTeacherPicker(group.id); }} className="w-7 h-7 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-gray-400 hover:text-indigo-600 rounded-md transition-all flex items-center justify-center" title="แต่งตั้งหัวหน้า"><Crown size={11} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }} className="w-7 h-7 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-gray-400 hover:text-indigo-600 rounded-md transition-all flex items-center justify-center" title="แก้ไข"><Edit2 size={11} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }} className="w-7 h-7 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 rounded-md transition-all flex items-center justify-center" title="ลบ"><Trash2 size={11} /></button>
                                        </div>
                                    </div>
                                );
                            })}

                            {uncategorizedCourses.length > 0 && (
                                <button
                                    onClick={() => { setSelectedGroupId('OTHERS'); setSelectedCourseId(null); setSearchTerm(""); }}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all mt-2 border border-dashed ${selectedGroupId === 'OTHERS' ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}
                                >
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${selectedGroupId === 'OTHERS' ? 'bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}><Package size={16} /></div>
                                    <div>
                                        <div className="text-xs font-black text-gray-600 dark:text-gray-300">อื่นๆ / ไม่ระบุ</div>
                                        <div className="text-[9px] text-gray-400 font-bold">{uncategorizedCourses.length} รายวิชา</div>
                                    </div>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Column 2: Course List ── */}
                    <div className={`w-full lg:w-72 xl:w-80 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 overflow-hidden ${(selectedGroupId && !selectedCourseId) ? 'flex' : 'hidden lg:flex'}`}>
                        {/* Column 2 Header */}
                        {selectedGroup ? (
                            <div className="shrink-0">
                                <div className={`h-1 w-full bg-gradient-to-r ${(GROUP_GRADIENTS[selectedGroup.name] || DEFAULT_GRADIENT).accent}`} />
                                <div className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                                    <button onClick={() => { setSelectedGroupId(null); setSelectedCourseId(null); }} className="lg:hidden mb-2 flex items-center gap-1.5 text-[10px] font-black text-indigo-600 dark:text-indigo-400">
                                        <ArrowLeft size={12} /> เลือกกลุ่มสาระ
                                    </button>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {(() => {
                                                const Icon = GROUP_ICONS[selectedGroup.name] || LayoutGrid;
                                                const g = GROUP_GRADIENTS[selectedGroup.name] || DEFAULT_GRADIENT;
                                                return <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${g.from} ${g.to} flex items-center justify-center shrink-0`}><Icon size={13} className="text-white" /></div>;
                                            })()}
                                            <span className="text-xs font-black text-gray-900 dark:text-white truncate">{selectedGroup.name}</span>
                                        </div>
                                        <span className="text-[10px] font-black bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 px-2 py-0.5 rounded-full shrink-0">{filteredCoursesList.length} วิชา</span>
                                    </div>
                                    <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600" />
                                        <input
                                            type="text" placeholder="ค้นหาชื่อหรือรหัสวิชา..."
                                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                                <div className="flex items-center gap-2">
                                    <BookMarked size={13} className="text-gray-400" />
                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">รายวิชา</span>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                            {filteredCoursesList.filter(c =>
                                c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                c.code.toLowerCase().includes(searchTerm.toLowerCase())
                            ).map(course => {
                                const isActive = selectedCourseId === course.id;
                                const isBasic = course.type !== 'เพิ่มเติม';
                                const g = selectedGroup ? (GROUP_GRADIENTS[selectedGroup.name] || DEFAULT_GRADIENT) : DEFAULT_GRADIENT;
                                return (
                                    <button
                                        key={course.id}
                                        onClick={() => setSelectedCourseId(course.id)}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 relative group/course border ${isActive
                                            ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm'
                                            : 'bg-transparent border-transparent hover:bg-white dark:hover:bg-gray-800/60 hover:border-gray-100 dark:hover:border-gray-700'
                                        }`}
                                    >
                                        {isActive && <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4/5 rounded-r-full bg-gradient-to-b ${g.from} ${g.to}`} />}
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded font-mono tracking-wider ${isActive ? `bg-gradient-to-br ${g.from} ${g.to} text-white` : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{course.code}</span>
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ml-auto ${isBasic ? 'bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400' : 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                                                {isBasic ? 'พื้นฐาน' : 'เพิ่มเติม'}
                                            </span>
                                        </div>
                                        <div className={`text-[11px] font-bold leading-snug ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{course.title}</div>
                                    </button>
                                );
                            })}

                            {!selectedGroupId && (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-3"><BookOpen size={20} className="text-gray-300 dark:text-gray-600" /></div>
                                    <p className="text-xs font-bold text-gray-300 dark:text-gray-600">เลือกกลุ่มสาระก่อน</p>
                                </div>
                            )}

                            {selectedGroupId && filteredCoursesList.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-3"><FileSearch size={20} className="text-gray-300 dark:text-gray-600" /></div>
                                    <p className="text-xs font-bold text-gray-300 dark:text-gray-600">ไม่พบรายวิชา</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Column 3: Indicator Management ── */}
                    <div className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-white dark:bg-gray-900 ${!selectedCourseId ? 'hidden lg:flex' : 'flex'}`}>
                        {selectedCourseId ? (() => {
                            const course = courses.find(c => c.id === selectedCourseId);
                            const isBasic = course?.type === 'พื้นฐาน';
                            const items = (isBasic ? course?.indicators : course?.expectedOutcomes) || [];
                            const g = selectedGroup ? (GROUP_GRADIENTS[selectedGroup.name] || DEFAULT_GRADIENT) : DEFAULT_GRADIENT;

                            return (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* Col3 Header */}
                                    <div className="shrink-0 border-b border-gray-100 dark:border-gray-800">
                                        <div className={`h-1 w-full bg-gradient-to-r ${g.accent}`} />
                                        <div className="px-5 py-3">
                                            <div className="flex items-center justify-between gap-3 mb-1">
                                                <button onClick={() => setSelectedCourseId(null)} className="lg:hidden flex items-center gap-1.5 text-[10px] font-black text-indigo-600 dark:text-indigo-400">
                                                    <ArrowLeft size={12} /> ย้อนกลับ
                                                </button>
                                                <div className="hidden lg:flex items-center gap-2 text-[10px] font-bold text-gray-400 flex-1">
                                                    <span>{selectedGroup?.name}</span>
                                                    <ChevronRight size={12} className="text-gray-300 dark:text-gray-700" />
                                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black ${g.pill} border`}>{course?.code}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-full">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{items.length} รายการ</span>
                                                    </div>
                                                    <button
                                                        onClick={() => Swal.fire({
                                                            title: `เพิ่ม${isBasic ? 'ตัวชี้วัด' : 'ผลการเรียนรู้'}`, input: 'textarea',
                                                            inputPlaceholder: 'พิมพ์หรือวางข้อมูล (1 บรรทัด = 1 รายการ)',
                                                            showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#4f46e5',
                                                            customClass: { popup: 'rounded-[24px] p-6', input: 'font-sarabun text-sm rounded-xl h-40 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3', confirmButton: 'px-6 py-2.5 rounded-xl font-bold text-sm', cancelButton: 'px-6 py-2.5 rounded-xl font-bold text-sm' }
                                                        }).then(r => {
                                                            if (r.isConfirmed && r.value) {
                                                                const newItems = r.value.split('\n').filter((s: string) => s.trim().length > 0);
                                                                if (newItems.length > 0) {
                                                                    const key = isBasic ? 'indicators' : 'outcomes';
                                                                    const current = isBasic ? (course?.indicators || []) : (course?.expectedOutcomes || []);
                                                                    handleUpdateCourseIndicators(course!.id, key, [...current, ...newItems]);
                                                                }
                                                            }
                                                        })}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-[11px] font-black shadow-md shadow-indigo-500/25 transition-all active:scale-95"
                                                    >
                                                        <Plus size={12} /> เพิ่มข้อมูล
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isBasic ? 'bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400' : 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                                                        รายวิชา{course?.type || 'พื้นฐาน'}
                                                    </span>
                                                </div>
                                                <h2 className="text-base font-black text-gray-900 dark:text-white leading-tight">{course?.title}</h2>
                                                <p className="text-[10px] text-gray-400 mt-0.5">จัดการ{isBasic ? 'ตัวชี้วัดรายวิชาพื้นฐาน' : 'ผลการเรียนรู้รายวิชาเพิ่มเติม'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Items list */}
                                    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-4">
                                        <div className="flex items-center gap-2 mb-3 px-1">
                                            <div className="w-0.5 h-4 bg-indigo-500 rounded-full" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">รายการทั้งหมด</span>
                                        </div>

                                        <div className="space-y-2">
                                            {items.map((item, i) => (
                                                <div key={i} className="group/row flex gap-3 p-3.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 relative">
                                                    <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center shrink-0 text-[9px] font-black text-gray-300 dark:text-gray-600 group-hover/row:bg-indigo-50 dark:group-hover/row:bg-indigo-500/10 group-hover/row:text-indigo-500 group-hover/row:border-indigo-100 dark:group-hover/row:border-indigo-500/20 transition-all">
                                                        {String(i + 1).padStart(2, '0')}
                                                    </div>
                                                    <p className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 leading-relaxed pr-8 font-sarabun">{item}</p>
                                                    <button
                                                        onClick={() => {
                                                            const key = isBasic ? 'indicators' : 'outcomes';
                                                            const current = isBasic ? (course?.indicators || []) : (course?.expectedOutcomes || []);
                                                            handleUpdateCourseIndicators(course!.id, key, current.filter((_, idx) => idx !== i));
                                                        }}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover/row:opacity-100 active:scale-95"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}

                                            {items.length === 0 && (
                                                <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-gray-900 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl">
                                                    <div className="w-14 h-14 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4"><ListChecks size={28} className="text-gray-200 dark:text-gray-700" /></div>
                                                    <h4 className="text-base font-black text-gray-700 dark:text-gray-300 mb-1">ยังไม่มีรายการ</h4>
                                                    <p className="text-xs text-gray-400 max-w-[200px] leading-relaxed">กดปุ่ม "เพิ่มข้อมูล" เพื่อเพิ่มตัวชี้วัดหรือผลการเรียนรู้</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })() : (
                            /* Empty state */
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 select-none relative overflow-hidden bg-gray-50 dark:bg-gray-950">
                                <div className="absolute inset-0 pointer-events-none">
                                    <div className="absolute top-1/3 left-1/3 w-72 h-72 bg-indigo-500/5 blur-[100px] rounded-full" />
                                    <div className="absolute bottom-1/3 right-1/3 w-72 h-72 bg-violet-500/5 blur-[100px] rounded-full" />
                                </div>
                                <div className="relative mb-8">
                                    <div className="w-32 h-32 bg-white dark:bg-gray-900 rounded-[40px] shadow-xl border border-gray-100 dark:border-gray-800 flex items-center justify-center mx-auto">
                                        <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
                                            <MonitorCheck size={32} className="text-indigo-400/50 hidden lg:block" />
                                            <MousePointerClick size={28} className="text-indigo-400/50 lg:hidden" />
                                        </div>
                                    </div>
                                    <div className="absolute -top-3 -right-3 w-9 h-9 bg-emerald-500 rounded-2xl shadow-lg border-4 border-white dark:border-gray-950 flex items-center justify-center text-white animate-bounce">
                                        <CheckCircle2 size={14} />
                                    </div>
                                    <div className="absolute -bottom-2 -left-4 w-10 h-10 bg-indigo-600 rounded-2xl shadow-lg border-4 border-white dark:border-gray-950 flex items-center justify-center text-white animate-bounce delay-150">
                                        <ListChecks size={16} />
                                    </div>
                                </div>
                                <div className="relative z-10 space-y-3 max-w-xs">
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                                        จัดการ <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-500">ตัวชี้วัด</span><br />& ผลการเรียนรู้
                                    </h3>
                                    <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed">
                                        เลือก <span className="font-bold text-gray-600 dark:text-gray-300">กลุ่มสาระฯ</span> และ <span className="font-bold text-gray-600 dark:text-gray-300">รายวิชา</span> เพื่อจัดการข้อมูลตัวชี้วัด
                                    </p>
                                    <div className="pt-4 flex flex-wrap items-center justify-center gap-2">
                                        <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 border border-gray-200 dark:border-gray-800 px-2.5 py-1 rounded-full">
                                            <MousePointer2 size={10} /> คลิกเพื่อเลือก
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 border border-gray-200 dark:border-gray-800 px-2.5 py-1 rounded-full">
                                            <Terminal size={10} /> พิมพ์เพื่อค้นหา
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default SubjectGroupManagementPage;
