import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
<<<<<<< HEAD
import BackButton from "@/components/Shared/BackButton";
import { RootState } from "@/store";
import { firestore as db } from "@/firebase";
import { collection, query, where, onSnapshot, writeBatch, doc, getDoc, serverTimestamp } from "firebase/firestore";
=======
import { RootState } from "@/store";
import { firestore as db } from "@/firebase";
import { collection, query, onSnapshot, writeBatch, doc, serverTimestamp } from "firebase/firestore";
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import MainLayout from "@/layouts/MainLayout";
import { 
    Settings, 
    Save, 
    Copy, 
<<<<<<< HEAD
    Search, 
    Info,
    AlertCircle,
    Calendar
} from "lucide-react";
import { useSubjectGroups } from "@/hooks/useSubjectGroups";
import { CLASSES, getClassOptionsBySchoolSettings } from "@/utils/schoolUtils";
import Swal from "sweetalert2";

interface FormativeAssessment {
    id: string;
=======
    ChevronLeft, 
    Search, 
    Info,
    AlertCircle,
    CheckCircle2,
    Calendar
} from "lucide-react";
import { useSubjectGroups } from "@/hooks/useSubjectGroups";
import Swal from "sweetalert2";

interface FormativeAssessment {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    name: string;
    maxScore: number;
    term: 'pre-midterm' | 'post-midterm';
}

interface Course {
    id: string;
    code: string;
    title: string;
    subjectGroup: string;
<<<<<<< HEAD
    classId?: string | string[];
    semester?: string;
    formativeWeight?: number;
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    formativeAssessments?: FormativeAssessment[];
    midtermWeight?: number;
    finalWeight?: number;
    updatedBy?: string;
    updatedAt?: any;
    isActive?: boolean;
}

<<<<<<< HEAD
const allClassOptions = Object.entries(CLASSES) as [string, string][];
const isAnnualCourse = (semester?: string) => !semester || semester === '1-2' || semester === 'annual' || semester === '0' || semester === 'ปีการศึกษา';
const PAGE_SIZE = 20;

const getInitialCourseScores = (course: Course) => {
    const preMidterm = course.formativeAssessments?.filter(a => a.term === 'pre-midterm') || [];
    const postMidterm = course.formativeAssessments?.filter(a => a.term === 'post-midterm') || [];
    const looksLikeOldDefault =
        preMidterm.length === 0 &&
        postMidterm.length === 0 &&
        course.finalWeight === undefined &&
        Number(course.formativeWeight) === 60 &&
        Number(course.midtermWeight) === 20;

    return {
        s1_9: Array(9).fill(0).map((_, i) => preMidterm[i]?.maxScore || 0),
        midterm: looksLikeOldDefault ? 0 : course.midtermWeight || 0,
        s10_18: Array(9).fill(0).map((_, i) => postMidterm[i]?.maxScore || 0),
        final: looksLikeOldDefault ? 0 : course.finalWeight || 0
    };
};

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
const ScoreConfigurationPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    
    const { subjectGroups } = useSubjectGroups(schoolId);
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string>("");
<<<<<<< HEAD
    const [selectedLevel, setSelectedLevel] = useState<string>("");
    const [selectedSemester, setSelectedSemester] = useState<string>("");
    const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>(allClassOptions);
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    const [filterScope, setFilterScope] = useState<"group" | "all">("group");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [localScores, setLocalScores] = useState<Record<string, any>>({});
<<<<<<< HEAD
    const [dirtyCourseIds, setDirtyCourseIds] = useState<Set<string>>(() => new Set());
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        if (!schoolId) return;

        const fetchSchoolClassOptions = async () => {
            try {
                const schoolSnap = await getDoc(doc(db, 'school-settings', schoolId));
                if (!schoolSnap.exists()) {
                    setAvailableClassOptions(allClassOptions);
                    return;
                }

                const data = schoolSnap.data();
                const options = getClassOptionsBySchoolSettings(
                    data.opportunityExpansionLevel || "",
                    data.schoolType || ""
                );
                setAvailableClassOptions(options.length > 0 ? options : allClassOptions);
            } catch (err) {
                console.error("Error fetching school class options:", err);
                setAvailableClassOptions(allClassOptions);
            }
        };

        fetchSchoolClassOptions();
    }, [schoolId]);

    useEffect(() => {
        if (!selectedLevel || availableClassOptions.some(([id]) => id === selectedLevel)) return;

        setSelectedLevel("");
    }, [availableClassOptions, selectedLevel]);
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    // Fetch Courses
    useEffect(() => {
        if (!schoolId) return;
<<<<<<< HEAD

        if (filterScope === "group" && !selectedGroup) {
            setCourses([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        
        const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
        const courseQuery = filterScope === "group"
            ? query(coursesRef, where('subjectGroup', '==', selectedGroup))
            : query(coursesRef);

        const unsubscribe = onSnapshot(courseQuery, (snap) => {
=======
        
        const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
        const unsubscribe = onSnapshot(query(coursesRef), (snap) => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            const courseList = snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Course))
                .filter(c => c.isActive !== false);
            setCourses(courseList);
<<<<<<< HEAD

            // Initialize local scores ONLY if not already initialized
            setLocalScores(prev => {
                const next = { ...prev };
                let hasChanges = false;
                
                courseList.forEach(course => {
                    if (!next[course.id]) {
                        next[course.id] = getInitialCourseScores(course);
                        hasChanges = true;
                    }
                });
                return hasChanges ? next : prev;
            });
=======
            
            // Initialize local scores if not already set
            const initialScores: Record<string, any> = {};
            courseList.forEach(course => {
                const preMidterm = course.formativeAssessments?.filter(a => a.term === 'pre-midterm') || [];
                const postMidterm = course.formativeAssessments?.filter(a => a.term === 'post-midterm') || [];
                
                initialScores[course.id] = {
                    s1_9: Array(9).fill(0).map((_, i) => preMidterm[i]?.maxScore || 0),
                    midterm: course.midtermWeight || 0,
                    s10_18: Array(9).fill(0).map((_, i) => postMidterm[i]?.maxScore || 0),
                    final: course.finalWeight || 0
                };
            });
            setLocalScores(initialScores);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            setIsLoading(false);
        });

        return () => unsubscribe();
<<<<<<< HEAD
    }, [schoolId, selectedGroup, filterScope]);

    // Filtered Courses
    const filteredCourses = useMemo(() => {
        return courses.filter(course => {
            if (selectedLevel) {
                const classIds = Array.isArray(course.classId) ? course.classId : [course.classId];
                if (!classIds.includes(selectedLevel)) return false;
            }

            if (selectedSemester) {
                if (selectedSemester === 'annual') {
                    if (!isAnnualCourse(course.semester)) return false;
                } else if (!isAnnualCourse(course.semester) && course.semester !== selectedSemester) {
                    return false;
                }
            }

            if (filterScope === "group") {
                if (!selectedGroup) return false;
                return course.subjectGroup === selectedGroup;
            }

            return true;
        });
    }, [courses, selectedGroup, selectedLevel, selectedSemester, filterScope]);

    const dirtyVisibleCourseCount = useMemo(() => {
        return filteredCourses.filter(course => dirtyCourseIds.has(course.id)).length;
    }, [filteredCourses, dirtyCourseIds]);

    const totalPages = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE));
    const paginatedCourses = useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return filteredCourses.slice(startIndex, startIndex + PAGE_SIZE);
    }, [filteredCourses, currentPage]);

    const paginationPages = useMemo(() => {
        const maxButtons = 5;
        const half = Math.floor(maxButtons / 2);
        let start = Math.max(1, currentPage - half);
        const end = Math.min(totalPages, start + maxButtons - 1);

        start = Math.max(1, end - maxButtons + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }, [currentPage, totalPages]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedGroup, selectedLevel, selectedSemester, filterScope]);

    useEffect(() => {
        if (currentPage <= totalPages) return;
        setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    // Handle Score Change
    const handleScoreChange = (courseId: string, type: 's1_9' | 's10_18' | 'midterm' | 'final', index: number, value: string) => {
        // Allow empty string for better typing experience
        const numValue = value === "" ? 0 : (parseInt(value) || 0);
        
        setLocalScores(prev => {
            const courseScore = { ...prev[courseId] };
            if (!courseScore) return prev;
            
            if (type === 's1_9' || type === 's10_18') {
                const newArr = [...courseScore[type]];
                newArr[index] = value === "" ? "" : numValue;
                courseScore[type] = newArr;
            } else {
                courseScore[type] = value === "" ? "" : numValue;
            }
            return { ...prev, [courseId]: courseScore };
        });
        setDirtyCourseIds(prev => {
            const next = new Set(prev);
            next.add(courseId);
            return next;
        });
=======
    }, [schoolId]);

    // Filtered Courses
    const filteredCourses = useMemo(() => {
        if (filterScope === "all") return courses;
        if (!selectedGroup) return [];
        return courses.filter(c => c.subjectGroup === selectedGroup);
    }, [courses, selectedGroup, filterScope]);

    // Handle Score Change
    const handleScoreChange = (courseId: string, type: 's1_9' | 's10_18' | 'midterm' | 'final', index: number, value: string) => {
        const numValue = parseInt(value) || 0;
        setLocalScores(prev => {
            const courseScore = { ...prev[courseId] };
            if (type === 's1_9' || type === 's10_18') {
                const newArr = [...courseScore[type]];
                newArr[index] = numValue;
                courseScore[type] = newArr;
            } else {
                courseScore[type] = numValue;
            }
            return { ...prev, [courseId]: courseScore };
        });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    };

    // Calculate Totals
    const calculateTotals = useCallback((courseId: string) => {
        const scores = localScores[courseId];
        if (!scores) return { sum1: 0, sum2: 0, total: 0 };
        
<<<<<<< HEAD
        const sum1 = scores.s1_9.reduce((a: any, b: any) => (parseInt(a) || 0) + (parseInt(b) || 0), 0);
        const sum2 = scores.s10_18.reduce((a: any, b: any) => (parseInt(a) || 0) + (parseInt(b) || 0), 0);
        const midterm = parseInt(scores.midterm) || 0;
        const final = parseInt(scores.final) || 0;
        const total = sum1 + midterm + sum2 + final;
=======
        const sum1 = scores.s1_9.reduce((a: number, b: number) => a + b, 0);
        const sum2 = scores.s10_18.reduce((a: number, b: number) => a + b, 0);
        const total = sum1 + scores.midterm + sum2 + scores.final;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        
        return { sum1, sum2, total };
    }, [localScores]);

    // Copy Template
    const handleCopyTemplate = (sourceCourseId: string) => {
        const sourceScores = localScores[sourceCourseId];
        if (!sourceScores) return;

        Swal.fire({
            title: 'คัดลอกต้นแบบ',
            text: `ต้องการคัดลอกการตั้งค่าคะแนนจากวิชา ${courses.find(c => c.id === sourceCourseId)?.code} ไปยังวิชาอื่นๆ ในกลุ่มที่แสดงอยู่หรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            background: '#1e2235',
            color: '#fff'
        }).then((result) => {
            if (result.isConfirmed) {
                const newScores = { ...localScores };
                filteredCourses.forEach(course => {
                    if (course.id !== sourceCourseId) {
                        newScores[course.id] = JSON.parse(JSON.stringify(sourceScores));
                    }
                });
                setLocalScores(newScores);
<<<<<<< HEAD
                setDirtyCourseIds(prev => {
                    const next = new Set(prev);
                    filteredCourses.forEach(course => {
                        if (course.id !== sourceCourseId) {
                            next.add(course.id);
                        }
                    });
                    return next;
                });
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                Swal.fire({
                    icon: 'success',
                    title: 'คัดลอกสำเร็จ',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 1500
                });
            }
        });
    };

    // Save Changes
    const handleSave = async () => {
<<<<<<< HEAD
        const coursesToSave = filteredCourses.filter(course => dirtyCourseIds.has(course.id));

        if (coursesToSave.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'ยังไม่มีรายการที่แก้ไข',
                text: 'กรุณาแก้ไขคะแนนของรายวิชาที่ต้องการก่อนบันทึก',
=======
        // Validation: Check if any course total is not 100
        const invalidCourses = filteredCourses.filter(course => {
            const { total } = calculateTotals(course.id);
            return total !== 100;
        });

        if (invalidCourses.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'คะแนนรวมไม่ถูกต้อง',
                text: `มีรายวิชาที่คะแนนรวมไม่เท่ากับ 100 (${invalidCourses.map(c => c.code).join(', ')}) กรุณาตรวจสอบอีกครั้ง`,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                background: '#1e2235',
                color: '#fff'
            });
            return;
        }

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
<<<<<<< HEAD
            const toScoreNumber = (score: unknown) => Number(score) || 0;

            coursesToSave.forEach(course => {
                const scores = localScores[course.id];
                if (!scores) return;

                const formativeAssessments: FormativeAssessment[] = [];
                
                scores.s1_9.forEach((score: unknown, i: number) => {
                    const maxScore = toScoreNumber(score);
                    if (maxScore > 0) {
                        formativeAssessments.push({ id: `S${i + 1}`, name: `S${i + 1}`, maxScore, term: 'pre-midterm' });
                    }
                });
                
                scores.s10_18.forEach((score: unknown, i: number) => {
                    const maxScore = toScoreNumber(score);
                    if (maxScore > 0) {
                        formativeAssessments.push({ id: `S${i + 10}`, name: `S${i + 10}`, maxScore, term: 'post-midterm' });
=======
            filteredCourses.forEach(course => {
                const scores = localScores[course.id];
                const formativeAssessments: FormativeAssessment[] = [];
                
                scores.s1_9.forEach((score: number, i: number) => {
                    if (score > 0) {
                        formativeAssessments.push({ name: `S${i + 1}`, maxScore: score, term: 'pre-midterm' });
                    }
                });
                
                scores.s10_18.forEach((score: number, i: number) => {
                    if (score > 0) {
                        formativeAssessments.push({ name: `S${i + 10}`, maxScore: score, term: 'post-midterm' });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    }
                });

                const courseRef = doc(db, 'school-settings', schoolId, 'courses', course.id);
                batch.update(courseRef, {
                    formativeAssessments,
<<<<<<< HEAD
                    midtermWeight: toScoreNumber(scores.midterm),
                    finalWeight: toScoreNumber(scores.final),
=======
                    midtermWeight: scores.midterm,
                    finalWeight: scores.final,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    updatedBy: currentUser ? `${(currentUser as any).firstName || ''} ${(currentUser as any).lastName || ''}`.trim() || currentUser?.email : 'System',
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();
<<<<<<< HEAD
            setDirtyCourseIds(prev => {
                const next = new Set(prev);
                coursesToSave.forEach(course => next.delete(course.id));
                return next;
            });
            Swal.fire({ icon: 'success', title: `บันทึกสำเร็จ ${coursesToSave.length} วิชา`, background: '#1e2235', color: '#fff' });
=======
            Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าสำเร็จ', background: '#1e2235', color: '#fff' });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการบันทึก', background: '#1e2235', color: '#fff' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-600 dark:text-slate-300 font-sans flex flex-col">
                
                {/* Header Area */}
                <div className="bg-white dark:bg-[#161a27] border-b border-slate-200 dark:border-white/5 p-4 sm:p-6 lg:pl-16 sticky top-[60px] z-40 backdrop-blur-md bg-white/90 dark:bg-[#161a27]/90">
                    <div className="max-w-[1600px] mx-auto flex flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
<<<<<<< HEAD
                            <BackButton to="/academic/hub/evaluation" />
=======
                            <Link to="/academic-admin" className="p-2 bg-slate-100 dark:bg-[#1e2235] rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                <ChevronLeft size={18} />
                            </Link>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl shadow-lg border border-emerald-500/20">
                                    <Settings size={24} className="text-emerald-500 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">ตั้งค่าคะแนนเต็มรายวิชา</h1>
                                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded border border-indigo-500/20">Config</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">กำหนดสัดส่วนคะแนนเก็บ กลางภาค และปลายภาค</p>
                                </div>
                            </div>
                        </div>

                        {/* Filters & Actions */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center bg-slate-100 dark:bg-[#1e2235] rounded-2xl border border-slate-200 dark:border-white/5 p-1 gap-1">
<<<<<<< HEAD
                                <span className="pl-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ชั้น</span>
                                <select 
                                    value={selectedLevel}
                                    onChange={(e) => setSelectedLevel(e.target.value)}
                                    className="bg-transparent border-none text-[12px] font-bold text-slate-900 dark:text-white px-3 py-2 outline-none min-w-[110px]"
                                >
                                    <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทุกชั้น</option>
                                    {availableClassOptions.map(([id, name]) => (
                                        <option key={id} value={id} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center bg-slate-100 dark:bg-[#1e2235] rounded-2xl border border-slate-200 dark:border-white/5 p-1 gap-1">
                                <span className="pl-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ภาค</span>
                                <select 
                                    value={selectedSemester}
                                    onChange={(e) => setSelectedSemester(e.target.value)}
                                    className="bg-transparent border-none text-[12px] font-bold text-slate-900 dark:text-white px-3 py-2 outline-none min-w-[110px]"
                                >
                                    <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทุกภาค</option>
                                    <option value="1" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ภาคเรียนที่ 1</option>
                                    <option value="2" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ภาคเรียนที่ 2</option>
                                    <option value="annual" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">รายปี</option>
                                </select>
                            </div>

                            <div className="flex items-center bg-slate-100 dark:bg-[#1e2235] rounded-2xl border border-slate-200 dark:border-white/5 p-1 gap-1">
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                <select 
                                    value={selectedGroup}
                                    onChange={(e) => setSelectedGroup(e.target.value)}
                                    className="bg-transparent border-none text-[12px] font-bold text-slate-900 dark:text-white px-4 py-2 outline-none min-w-[200px]"
                                >
                                    <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">เลือกกลุ่มสาระการเรียนรู้</option>
                                    {subjectGroups.map(g => (
                                        <option key={g.id} value={g.name} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{g.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center bg-slate-100 dark:bg-[#1e2235] px-4 py-2 rounded-2xl border border-slate-200 dark:border-white/5 gap-4">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                        type="radio" 
                                        name="scope" 
                                        checked={filterScope === "group"} 
                                        onChange={() => setFilterScope("group")}
                                        className="w-4 h-4 accent-indigo-500"
                                    />
                                    <span className={`text-[11px] font-bold ${filterScope === "group" ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-50 dark:group-hover:text-slate-300'}`}>เฉพาะกลุ่ม</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                        type="radio" 
                                        name="scope" 
                                        checked={filterScope === "all"} 
                                        onChange={() => setFilterScope("all")}
                                        className="w-4 h-4 accent-indigo-500"
                                    />
                                    <span className={`text-[11px] font-bold ${filterScope === "all" ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-50 dark:group-hover:text-slate-300'}`}>ทั้งหมด</span>
                                </label>
                            </div>

                            <button 
                                onClick={handleSave}
<<<<<<< HEAD
                                disabled={isSaving || dirtyVisibleCourseCount === 0}
                                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-2xl font-black text-[12px] shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 whitespace-nowrap"
                            >
                                <Save size={16} />
                                {dirtyVisibleCourseCount > 0 ? `บันทึก ${dirtyVisibleCourseCount} วิชา` : 'บันทึกตั้งค่า'}
=======
                                disabled={isSaving || filteredCourses.length === 0}
                                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-2xl font-black text-[12px] shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 whitespace-nowrap"
                            >
                                <Save size={16} />
                                บันทึกตั้งค่า
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-4 sm:p-6 overflow-hidden">
                    <div className="max-w-[1600px] mx-auto h-full flex flex-col bg-white dark:bg-[#161a27] rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden">
                        
                        {/* Table Header */}
                        <div className="grid grid-cols-[250px_repeat(9,45px)_60px_repeat(9,45px)_60px_60px_60px_60px_200px] bg-slate-100 dark:bg-[#1e2235] border-b border-slate-200 dark:border-white/10 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center sticky top-0 z-20">
                            {/* Row 1 */}
                            <div className="row-span-2 px-4 py-4 text-left border-r border-slate-200 dark:border-white/5 sticky left-0 bg-slate-100 dark:bg-[#1e2235] flex items-center text-slate-900 dark:text-white">รหัส / รายวิชา</div>
                            
                            {/* Pre-midterm Headers */}
<<<<<<< HEAD
                            <div className="col-span-9 border-r border-b border-slate-200 dark:border-white/5 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 py-2">คะแนนเก็บก่อนกลางภาค</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-bold px-2">กลางภาค</div>
                            
                            {/* Post-midterm Headers */}
                            <div className="col-span-9 border-r border-b border-slate-200 dark:border-white/5 bg-purple-500/5 text-purple-600 dark:text-purple-400 py-2">คะแนนเก็บหลังกลางภาค</div>
=======
                            <div className="col-span-9 border-r border-slate-200 dark:border-white/5 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 py-2 border-b border-slate-200 dark:border-white/5">คะแนนเก็บก่อนกลางภาค</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-bold px-2">กลางภาค</div>
                            
                            {/* Post-midterm Headers */}
                            <div className="col-span-9 border-r border-slate-200 dark:border-white/5 bg-purple-500/5 text-purple-600 dark:text-purple-400 py-2 border-b border-slate-200 dark:border-white/5">คะแนนเก็บหลังกลางภาค</div>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            
                            <div className="row-span-2 flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-slate-200 dark:bg-slate-800/50">รวม 1</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-slate-200 dark:bg-slate-800/50">รวม 2</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-rose-500/5 text-rose-600 dark:text-rose-400">ปลายภาค</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-indigo-500/10 text-indigo-900 dark:text-white text-[11px]">รวม</div>
                            <div className="row-span-2 flex items-center justify-center min-w-[200px]">ผู้บันทึกล่าสุด</div>

                            {/* Row 2: Sub Headers for S1-S18 */}
                            {Array(9).fill(0).map((_, i) => (
                                <div key={`h-s${i+1}`} className="py-2 border-r border-slate-200 dark:border-white/5 bg-indigo-500/5 text-indigo-600/60 dark:text-indigo-400/60 flex flex-col items-center gap-0.5 justify-center">
                                    <span>S{i+1}</span>
                                    <Info size={10} className="opacity-40" />
                                </div>
                            ))}
                            {Array(9).fill(0).map((_, i) => (
                                <div key={`h-s${i+10}`} className="py-2 border-r border-slate-200 dark:border-white/5 bg-purple-500/5 text-purple-600/60 dark:text-purple-400/60 flex flex-col items-center gap-0.5 justify-center">
                                    <span>S{i+10}</span>
                                    <Info size={10} className="opacity-40" />
                                </div>
                            ))}
                        </div>

                        {/* Table Body */}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {isLoading ? (
                                <div className="h-full flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">กำลังโหลดข้อมูลรายวิชา...</p>
                                    </div>
                                </div>
                            ) : filteredCourses.length === 0 ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-slate-100 dark:bg-[#1e2235]/40 p-10 rounded-[2.5rem] border border-slate-200 dark:border-white/5">
                                        <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/10">
                                            <Search size={32} className="text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">ไม่พบรายวิชาที่ตรงเงื่อนไข</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">กรุณาเลือกกลุ่มสาระการเรียนรู้ หรือ เปลี่ยนขอบเขตการค้นหา</p>
                                    </div>
                                </div>
                            ) : (
<<<<<<< HEAD
                                paginatedCourses.map(course => {
=======
                                filteredCourses.map(course => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    const scores = localScores[course.id];
                                    if (!scores) return null;
                                    const { sum1, sum2, total } = calculateTotals(course.id);
                                    
                                    return (
                                        <div key={course.id} className="grid grid-cols-[250px_repeat(9,45px)_60px_repeat(9,45px)_60px_60px_60px_60px_200px] border-b border-slate-200 dark:border-white/5 items-stretch transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] group">
                                            {/* Code & Title */}
                                            <div className="px-4 py-3 border-r border-slate-200 dark:border-white/5 sticky left-0 bg-white dark:bg-[#161a27] group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132] z-10">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{course.code}</span>
                                                        <button 
                                                            onClick={() => handleCopyTemplate(course.id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded transition-all"
                                                            title="คัดลอกเป็นต้นแบบ"
                                                        >
                                                            <Copy size={10} className="text-slate-400" />
                                                        </button>
                                                    </div>
                                                    <span className="text-[12px] font-bold text-slate-900 dark:text-white truncate max-w-[180px]">{course.title}</span>
                                                </div>
                                            </div>

                                            {/* S1-S9 */}
                                            {scores.s1_9.map((val: number, i: number) => (
                                                <input 
                                                    key={`s${i+1}`}
                                                    type="text" 
                                                    value={val || ""}
                                                    onChange={(e) => handleScoreChange(course.id, 's1_9', i, e.target.value)}
                                                    className="w-full h-full bg-transparent border-r border-slate-200 dark:border-white/5 text-center text-[12px] font-black text-slate-900 dark:text-white focus:bg-indigo-500/10 focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5"
                                                    placeholder="0"
                                                />
                                            ))}

                                            {/* Midterm */}
                                            <input 
                                                type="text" 
                                                value={scores.midterm || ""}
                                                onChange={(e) => handleScoreChange(course.id, 'midterm', 0, e.target.value)}
                                                className="w-full h-full bg-emerald-500/5 border-r border-slate-200 dark:border-white/5 text-center text-[13px] font-black text-emerald-600 dark:text-emerald-400 focus:bg-emerald-500/20 focus:outline-none transition-all"
                                                placeholder="0"
                                            />

                                            {/* S10-S18 */}
                                            {scores.s10_18.map((val: number, i: number) => (
                                                <input 
                                                    key={`s${i+10}`}
                                                    type="text" 
                                                    value={val || ""}
                                                    onChange={(e) => handleScoreChange(course.id, 's10_18', i, e.target.value)}
                                                    className="w-full h-full bg-transparent border-r border-slate-200 dark:border-white/5 text-center text-[12px] font-black text-slate-900 dark:text-white focus:bg-purple-500/10 focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5"
                                                    placeholder="0"
                                                />
                                            ))}

                                            {/* Sums */}
                                            <div className="flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800/30 text-[12px] font-black text-slate-500 dark:text-slate-400">{sum1}</div>
                                            <div className="flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800/30 text-[12px] font-black text-slate-500 dark:text-slate-400">{sum2}</div>

                                            {/* Final */}
                                            <input 
                                                type="text" 
                                                value={scores.final || ""}
                                                onChange={(e) => handleScoreChange(course.id, 'final', 0, e.target.value)}
                                                className="w-full h-full bg-rose-500/5 border-r border-slate-200 dark:border-white/5 text-center text-[13px] font-black text-rose-600 dark:text-rose-400 focus:bg-rose-500/20 focus:outline-none transition-all"
                                                placeholder="0"
                                            />

                                            {/* Total */}
                                            <div className={`flex items-center justify-center border-r border-slate-200 dark:border-white/5 text-[14px] font-black ${total === 100 ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/5' : 'text-rose-600 dark:text-rose-500 bg-rose-500/10'}`}>
                                                {total}
                                            </div>

                                            {/* Updated Info */}
                                            <div className="px-4 py-2 flex flex-col justify-center items-center gap-0.5 border-r border-slate-200 dark:border-white/5 min-w-[200px]">
                                                {course.updatedBy ? (
                                                    <>
                                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate w-full text-center">{course.updatedBy}</span>
                                                        <div className="flex items-center gap-1 text-[9px] text-slate-400 dark:text-slate-500 font-bold">
                                                            <Calendar size={8} />
                                                            {course.updatedAt?.toDate().toLocaleDateString('th-TH')}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-600 italic">ยังไม่มีการบันทึก</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="bg-slate-50 dark:bg-[#1e2235]/40 border-t border-slate-200 dark:border-white/10 px-8 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse" />
                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">สถานะระบบ: พร้อมใช้งาน</span>
                                </div>
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400/80">
                                    <AlertCircle size={14} />
<<<<<<< HEAD
                                    <span className="text-[10px] font-bold">บันทึกเฉพาะรายวิชาที่แก้ไข คะแนนรวมไม่จำเป็นต้องครบ 100</span>
=======
                                    <span className="text-[10px] font-bold">คะแนนรวมต้องเท่ากับ 100 ทุกวิชา</span>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">จำนวนที่แสดง:</span>
                                <span className="text-[12px] font-black text-slate-900 dark:text-white">{filteredCourses.length} วิชา</span>
<<<<<<< HEAD
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">แก้ไข:</span>
                                <span className="text-[12px] font-black text-emerald-600 dark:text-emerald-400">{dirtyVisibleCourseCount} วิชา</span>
                            </div>
                        </div>

                        {filteredCourses.length > PAGE_SIZE && (
                            <div className="bg-white dark:bg-[#161a27] border-t border-slate-200 dark:border-white/10 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    แสดง {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredCourses.length)} จาก {filteredCourses.length} วิชา
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e2235] disabled:opacity-40 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        หน้าแรก
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e2235] disabled:opacity-40 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        ย้อนกลับ
                                    </button>

                                    {paginationPages.map(page => (
                                        <button
                                            key={page}
                                            type="button"
                                            onClick={() => setCurrentPage(page)}
                                            className={`min-w-8 px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-colors ${
                                                currentPage === page
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-100 dark:bg-[#1e2235] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e2235] disabled:opacity-40 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        ถัดไป
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e2235] disabled:opacity-40 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        หน้าสุดท้าย
                                    </button>
                                </div>
                            </div>
                        )}
=======
                            </div>
                        </div>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    </div>
                </div>

                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                    
                    /* Hide scrollbar for header to sync with body */
                    .hide-scrollbar::-webkit-scrollbar { display: none; }
                `}</style>
            </div>
        </MainLayout>
    );
};

export default ScoreConfigurationPage;
