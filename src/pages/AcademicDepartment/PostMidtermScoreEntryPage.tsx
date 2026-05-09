import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import { Link, useSearchParams } from "react-router-dom";
import BackButton from "@/components/Shared/BackButton";
import { RootState } from "@/store";
import { firestore as db } from "@/firebase";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    onSnapshot, 
    writeBatch, 
    serverTimestamp 
} from "firebase/firestore";
import MainLayout from "@/layouts/MainLayout";
import { 
    ChevronLeft, 
    ChevronRight,
    Save, 
    Search, 
    Info, 
    Settings,
    AlertCircle,
    Trophy,
    Calculator,
    ArrowLeft,
    ChevronsRight
} from "lucide-react";
import { CLASSES } from "@/utils/schoolUtils";
import Swal from "sweetalert2";

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    studentNumber: string;
    room: string;
    title?: string;
}

interface AssessmentItem {
    id: string;
    name: string;
    maxScore: number;
    term: 'pre-midterm' | 'post-midterm';
}

interface Course {
    id: string;
    code: string;
    title: string;
    classId: string | string[];
    room?: string[];
    formativeAssessments?: AssessmentItem[];
    formativeWeight?: number;
    midtermWeight?: number;
    finalWeight?: number;
}

interface GradeRecord {
    formative?: number | string;
    midterm?: number | string;
    final?: number | string;
    total?: number | string;
    grade?: string;
    status?: string;
    formativeDetails?: Record<string, number | string>;
    updatedAt?: any;
    updatedBy?: string;
}

const PostMidtermScoreEntryPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;

    // Filters
    const [selectedLevel, setSelectedLevel] = useState(searchParams.get('level') || "");
    const [selectedRoom, setSelectedRoom] = useState(searchParams.get('room') || "");
    const [selectedCourseId, setSelectedCourseId] = useState(searchParams.get('courseId') || "");

    const [courses, setCourses] = useState<Course[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
    const [rowBulkValues, setRowBulkValues] = useState<Record<string, string>>({});

    // Fetch Courses
    useEffect(() => {
        if (!schoolId) return;
        const fetchCourses = async () => {
            const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
            const snap = await getDocs(query(coursesRef, where('isActive', '!=', false)));
            setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
        };
        fetchCourses();
    }, [schoolId]);

    // Derived State: Selected Course
    const currentCourse = useMemo(() => courses.find(c => c.id === selectedCourseId), [courses, selectedCourseId]);
    
    // Filtered Assessments (Post-midterm only)
    const activeAssessments = useMemo(() => {
        if (!currentCourse) return [];
        return (currentCourse.formativeAssessments || []).filter(a => a.term === 'post-midterm' && a.maxScore > 0);
    }, [currentCourse]);

    const totalMaxPossible = useMemo(() => activeAssessments.reduce((sum, a) => sum + a.maxScore, 0), [activeAssessments]);

    // Fetch Students & Grades
    useEffect(() => {
        if (!schoolId || !selectedLevel || !selectedCourseId) {
            setStudents([]);
            setGrades({});
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const classTitle = CLASSES[selectedLevel] || selectedLevel;
        const studentsRef = collection(db, 'school-settings', schoolId, 'students');
        let qStudents = query(studentsRef, where('classLevel', '==', classTitle));
        if (selectedRoom && selectedRoom !== 'all') {
            qStudents = query(studentsRef, where('classLevel', '==', classTitle), where('room', '==', selectedRoom));
        }

        const fetchAll = async () => {
            try {
                const [studentSnap, gradeSnap] = await Promise.all([
                    getDocs(qStudents),
                    getDocs(collection(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades'))
                ]);

                const studentList = studentSnap.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                    studentNumber: String(d.data().number || d.data().classNumber || d.data().no || "")
                } as Student)).sort((a, b) => parseInt(a.studentNumber) - parseInt(b.studentNumber));

                const gradeMap: Record<string, GradeRecord> = {};
                gradeSnap.forEach(d => {
                    gradeMap[d.id] = d.data() as GradeRecord;
                });

                setStudents(studentList);
                setGrades(gradeMap);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAll();
    }, [schoolId, selectedLevel, selectedRoom, selectedCourseId]);

    // Handlers
    const handleScoreChange = (studentId: string, assessmentId: string, value: string) => {
        // Allow empty string for better typing experience
        const numValue = value === "" ? 0 : parseFloat(value);
        
        setGrades(prev => {
            const current = prev[studentId] || {};
            const details = { ...(current.formativeDetails || {}), [assessmentId]: value === "" ? "" : numValue };
            return {
                ...prev,
                [studentId]: { ...current, formativeDetails: details }
            };
        });
    };

    const handleFinalChange = (studentId: string, value: string) => {
        const numValue = value === "" ? 0 : parseFloat(value);

        setGrades(prev => {
            const current = prev[studentId] || {};
            return {
                ...prev,
                [studentId]: { ...current, final: value === "" ? "" : numValue }
            };
        });
    };

    const handleBulkFill = (assessmentId: string, value: string) => {
        setBulkValues(prev => ({ ...prev, [assessmentId]: value }));
        
        const numValue = value === "" ? 0 : parseFloat(value);

        setGrades(prev => {
            const next = { ...prev };
            students.forEach(s => {
                const current = next[s.id] || {};
                const details = { ...(current.formativeDetails || {}), [assessmentId]: value === "" ? "" : numValue };
                next[s.id] = { ...current, formativeDetails: details };
            });
            return next;
        });
    };

    const handleRowBulkFill = (studentId: string, value: string) => {
        setRowBulkValues(prev => ({ ...prev, [studentId]: value }));
        
        const numValue = value === "" ? 0 : (parseFloat(value) || 0);
        
        setGrades(prev => {
            const next = { ...prev };
            const current = next[studentId] || {};
            
            let remaining = numValue;
            const newDetails: Record<string, any> = {};
            activeAssessments.forEach(a => { newDetails[a.id] = 0; });

            // Fair distribution algorithm
            while (remaining > 0) {
                const canTakeMore = activeAssessments.filter(a => (newDetails[a.id] || 0) < a.maxScore);
                if (canTakeMore.length === 0) break;

                const amountPerSlot = Math.floor(remaining / canTakeMore.length);
                if (amountPerSlot === 0) {
                    for (let i = 0; i < remaining && i < canTakeMore.length; i++) {
                        newDetails[canTakeMore[i].id]++;
                    }
                    remaining = 0;
                } else {
                    let assignedInRound = 0;
                    canTakeMore.forEach(a => {
                        const capacity = a.maxScore - (newDetails[a.id] || 0);
                        const assign = Math.min(amountPerSlot, capacity);
                        newDetails[a.id] = (newDetails[a.id] || 0) + assign;
                        assignedInRound += assign;
                    });
                    remaining -= assignedInRound;
                    if (assignedInRound === 0) break;
                }
            }
            
            next[studentId] = { ...current, formativeDetails: newDetails };
            return next;
        });
    };

    const calculateRowTotals = useCallback((studentId: string) => {
        const record = grades[studentId] || {};
        const details = record.formativeDetails || {};
        
        const allAssessments = currentCourse?.formativeAssessments || [];
        const preMidAssessments = allAssessments.filter(a => a.term === 'pre-midterm');
        const postMidAssessments = allAssessments.filter(a => a.term === 'post-midterm');

        const preMidTotal = preMidAssessments.reduce((sum, a) => sum + (parseFloat(details[a.id] as any) || 0), 0);
        const postMidTotal = postMidAssessments.reduce((sum, a) => sum + (parseFloat(details[a.id] as any) || 0), 0);
        
        const midterm = parseFloat(record.midterm as any) || 0;
        const final = parseFloat(record.final as any) || 0;
        
        const sum1 = preMidTotal + midterm;
        const total = sum1 + postMidTotal + final;
        
        return { postMidTotal, sum1, total };
    }, [grades, currentCourse]);

    const calculateGrade = (total: number): string => {
        if (total >= 80) return '4';
        if (total >= 75) return '3.5';
        if (total >= 70) return '3';
        if (total >= 65) return '2.5';
        if (total >= 60) return '2';
        if (total >= 55) return '1.5';
        if (total >= 50) return '1';
        return '0';
    };

    const handleSave = async () => {
        if (!schoolId || !selectedCourseId) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            students.forEach(student => {
                const record = grades[student.id] || {};
                const { total } = calculateRowTotals(student.id);
                
                const ref = doc(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades', student.id);
                batch.set(ref, {
                    ...record,
                    final: Number(record.final || 0),
                    total: total,
                    grade: record.status || calculateGrade(total),
                    formativeDetails: record.formativeDetails || {},
                    updatedAt: serverTimestamp(),
                    updatedBy: (currentUser as any)?.displayName || (currentUser as any)?.email
                }, { merge: true });
            });
            await batch.commit();
            Swal.fire({ icon: 'success', title: 'บันทึกคะแนนสำเร็จ', background: '#1e2235', color: '#fff' });
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', background: '#1e2235', color: '#fff' });
        } finally {
            setIsSaving(false);
        }
    };

    // Filtered Students for Display
    const filteredStudents = useMemo(() => {
        return students.filter(s => 
            `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.studentNumber.includes(searchTerm)
        );
    }, [students, searchTerm]);

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-600 dark:text-slate-300 font-sans flex flex-col">
                
                {/* Premium Header Bar */}
                <div className="sticky top-[60px] z-40 px-4 lg:pl-16 py-3 bg-white/90 dark:bg-[#0b0e14]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
                    <div className="max-w-[1600px] mx-auto flex flex-row items-center justify-between gap-4">
                        
                        {/* Title & Course Info */}
                        <div className="flex items-center gap-4 min-w-fit">
                            <BackButton to="/academic-admin" />
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">บันทึกคะแนน</h1>
                                    <span className="px-2 py-0.5 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-tighter rounded-md border border-emerald-500/20">หลังกลางภาค</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                    {currentCourse ? <span className="text-slate-600 dark:text-slate-400">{currentCourse.code} • {currentCourse.title}</span> : "โปรดเลือกรายวิชา"}
                                </div>
                            </div>
                        </div>

                        {/* Control Center */}
                        <div className="flex flex-1 items-center justify-end gap-3">
                            
                            {/* Filter Group */}
                            <div className="flex items-center bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner">
                                <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ชั้น</span>
                                    <select 
                                        value={selectedLevel}
                                        onChange={(e) => setSelectedLevel(e.target.value)}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">เลือก</option>
                                        {Object.entries(CLASSES).map(([id, name]) => (
                                            <option key={id} value={id} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ห้อง</span>
                                    <select 
                                        value={selectedRoom}
                                        onChange={(e) => setSelectedRoom(e.target.value)}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">ทั้งหมด</option>
                                        {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                                            <option key={r} value={r} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{r}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1 px-3 py-1.5 min-w-[220px]">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">วิชา</span>
                                    <select 
                                        value={selectedCourseId}
                                        onChange={(e) => setSelectedCourseId(e.target.value)}
                                        className="bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors w-full"
                                        disabled={!selectedLevel}
                                    >
                                        <option value="" className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">เลือกวิชา</option>
                                        {courses
                                            .filter(c => {
                                                if (Array.isArray(c.classId)) return c.classId.includes(selectedLevel);
                                                return c.classId === selectedLevel;
                                            })
                                            .map(c => (
                                                <option key={c.id} value={c.id} className="bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white">{c.code} - {c.title}</option>
                                            ))
                                        }
                                    </select>
                                </div>
                            </div>

                            {/* Search */}
                            <div className="relative group min-w-[180px]">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={14} />
                                <input 
                                    type="text"
                                    placeholder="ค้นหานักเรียน..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl py-2 pl-10 pr-4 text-[12px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <Link 
                                    to={`/academic/formative-scores?level=${selectedLevel}&room=${selectedRoom}&courseId=${selectedCourseId}`}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white rounded-xl text-[12px] font-black border border-slate-200 dark:border-white/5 transition-all group whitespace-nowrap"
                                >
                                    <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                                    ก่อนกลางภาค
                                </Link>

                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving || !selectedCourseId}
                                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800/50 disabled:text-slate-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-indigo-600/20 transition-all border border-indigo-400/20 active:scale-95 whitespace-nowrap"
                                >
                                    <Save size={16} />
                                    บันทึกข้อมูล
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table Section */}
                <div className="flex-1 p-4 sm:p-6 overflow-hidden">
                    <div className="max-w-[1600px] mx-auto h-full flex flex-col bg-white dark:bg-[#161a27] rounded-3xl border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden">
                        
                        {/* Custom Table Layout */}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {!selectedCourseId ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-slate-100 dark:bg-[#1e2235]/40 p-10 rounded-3xl border border-slate-200 dark:border-white/5">
                                        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/10">
                                            <Trophy size={32} className="text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">บันทึกคะแนนส่วนสุดท้าย</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">กรุณาเลือกระดับชั้น ห้อง และรายวิชา เพื่อบันทึกคะแนนหลังกลางภาคและปลายภาค</p>
                                    </div>
                                </div>
                            ) : activeAssessments.length === 0 ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-amber-500/5 p-10 rounded-3xl border border-amber-500/20">
                                        <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-500/10">
                                            <AlertCircle size={32} className="text-amber-500" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">ยังไม่ได้ตั้งค่าสัดส่วนคะแนน</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider mb-6">วิชานี้ยังไม่มีการกำหนดหัวข้อคะแนนเก็บหลังกลางภาค</p>
                                        <Link 
                                            to="/academic/score-config"
                                            className="inline-flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[12px] font-black transition-all shadow-lg shadow-amber-500/20"
                                        >
                                            <Settings size={16} />
                                            ไปหน้าตั้งค่าคะแนน
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <table className="w-full border-collapse text-left">
                                    <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-[#1e2235]">
                                        <tr className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                                            <th rowSpan={2} className="px-4 py-4 w-[60px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-[#1e2235] sticky left-0 z-40 text-slate-900 dark:text-white">เลขที่</th>
                                            <th rowSpan={2} className="px-6 py-4 min-w-[180px] border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-[#1e2235] sticky left-[60px] z-40 text-slate-900 dark:text-white">ชื่อ-นามสกุล</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[80px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-200 dark:bg-[#1c2132] sticky left-[240px] z-40 text-slate-900 dark:text-white">
                                                <span className="text-[10px] leading-tight">เกลี่ยคะแนนเก็บ</span>
                                            </th>
                                            
                                            <th colSpan={activeAssessments.length} className="px-2 py-2 text-center bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-b border-r border-slate-200 dark:border-white/5 uppercase tracking-tighter font-black">
                                                คะแนนระหว่างภาค (หลังกลางภาค)
                                            </th>
                                            
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400">รวมเก็บ ({activeAssessments.reduce((s, a) => s + a.maxScore, 0)})</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-slate-200 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">ก่อนกลางภาค (60)</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[70px] text-center border-r border-slate-200 dark:border-white/5 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400">ปลายภาค ({currentCourse?.finalWeight || 20})</th>
                                            <th rowSpan={2} className="px-2 py-4 w-[80px] text-center bg-indigo-500/10 text-indigo-900 dark:text-white font-black text-[12px]">รวมสุทธิ</th>
                                        </tr>
                                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                                            {activeAssessments.map(a => (
                                                <th key={a.id} className="px-0.5 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-emerald-500/5 w-[40px]">
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span className="text-slate-600 dark:text-white/80">{a.name}</span>
                                                        <span className="text-emerald-600/60 dark:text-emerald-400/60 font-bold">/{a.maxScore}</span>
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                        {/* Bulk Fill Inputs */}
                                        <tr className="bg-slate-200 dark:bg-[#1c2132] border-b border-slate-200 dark:border-white/5">
                                            <td className="sticky left-0 bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5"></td>
                                            <td className="sticky left-[60px] bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5"></td>
                                            <td className="sticky left-[240px] bg-slate-200 dark:bg-[#1c2132] z-20 border-r border-slate-300 dark:border-white/5 px-2 py-2 text-[10px] font-black text-emerald-600 dark:text-emerald-400/60 text-center whitespace-nowrap">กรอกทั้งคอลัมน์ →</td>
                                            {activeAssessments.map(a => (
                                                <td key={`bulk-${a.id}`} className="px-1 py-1 border-r border-slate-300 dark:border-white/5">
                                                    <input 
                                                        type="text" 
                                                        placeholder="0"
                                                        value={bulkValues[a.id] || ""}
                                                        onChange={(e) => handleBulkFill(a.id, e.target.value)}
                                                        className="w-full bg-purple-500/10 border border-purple-500/20 text-center text-[11px] font-black text-purple-600 dark:text-purple-400 py-1 rounded-lg outline-none focus:border-purple-400/50"
                                                    />
                                                </td>
                                            ))}
                                            <td colSpan={4} className="bg-transparent"></td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map(student => {
                                            const record = grades[student.id] || {};
                                            const details = record.formativeDetails || {};
                                            const { postMidTotal, sum1, total } = calculateRowTotals(student.id);

                                            return (
                                                <tr key={student.id} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                                                    <td className="px-4 py-3 text-center font-black text-[11px] text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#161a27] sticky left-0 z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        {student.studentNumber}
                                                    </td>
                                                    <td className="px-6 py-3 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#161a27] sticky left-[60px] z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-bold text-slate-900 dark:text-white">{student.title}{student.firstName} {student.lastName}</span>
                                                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ID: {student.id.substring(0, 8)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-1 py-3 border-r border-slate-200 dark:border-white/5 text-center bg-white dark:bg-[#161a27] sticky left-[240px] z-10 group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132]">
                                                        <input 
                                                            type="text"
                                                            value={rowBulkValues[student.id] || ""}
                                                            onChange={(e) => handleRowBulkFill(student.id, e.target.value)}
                                                            className={`w-10 h-7 rounded-lg bg-emerald-500/10 border text-center text-[11px] font-black transition-all ${
                                                                (Number(rowBulkValues[student.id]) || 0) > totalMaxPossible 
                                                                ? 'border-red-500 text-red-500' 
                                                                : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                                            }`}
                                                            placeholder="0"
                                                        />
                                                    </td>

                                                    {activeAssessments.map(a => (
                                                        <td key={`${student.id}-${a.id}`} className={`px-0.5 py-1 border-r border-slate-200 dark:border-white/5 ${ (Number(details[a.id]) || 0) > a.maxScore ? 'bg-red-500/10' : 'bg-white/[0.01]' }`}>
                                                            <input 
                                                                 type="text"
                                                                 value={details[a.id] ?? ""}
                                                                 onChange={(e) => handleScoreChange(student.id, a.id, e.target.value)}
                                                                 className={`w-full bg-transparent text-center text-[12px] font-black focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5 ${
                                                                     (Number(details[a.id]) || 0) > a.maxScore ? 'text-red-500' : 'text-slate-900 dark:text-white'
                                                                 }`}
                                                                 placeholder="0"
                                                            />
                                                        </td>
                                                    ))}

                                                    <td className="px-2 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800/20 text-[12px] font-black text-slate-500 dark:text-slate-400">
                                                        {postMidTotal}
                                                    </td>

                                                    <td className="px-2 py-3 text-center border-r border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-800/10 text-[12px] font-black text-slate-400 dark:text-slate-600 italic">
                                                        {sum1}
                                                    </td>

                                                    <td className={`px-1 py-1 border-r border-slate-200 dark:border-white/5 ${ (Number(record.final) || 0) > (currentCourse?.finalWeight || 20) ? 'bg-red-500/10' : 'bg-white/[0.01]' }`}>
                                                        <input 
                                                            type="text"
                                                            value={record.final ?? ""}
                                                            onChange={(e) => handleFinalChange(student.id, e.target.value)}
                                                            className={`w-full bg-transparent text-center text-[12px] font-black focus:outline-none transition-all placeholder-slate-300 dark:placeholder-white/5 ${
                                                                (Number(record.final) || 0) > (currentCourse?.finalWeight || 20) ? 'text-red-500' : 'text-indigo-600 dark:text-indigo-400'
                                                            }`}
                                                            placeholder="0"
                                                        />
                                                    </td>

                                                    <td className={`px-2 py-3 text-center text-[13px] font-black ${ total > 100 ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-indigo-500/10 text-indigo-900 dark:text-white' }`}>
                                                        {total}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="bg-slate-50 dark:bg-[#1e2235]/40 border-t border-slate-200 dark:border-white/10 px-8 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse" />
                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">สถานะระบบ: พร้อมใช้งาน</span>
                                </div>
                                {currentCourse && (
                                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400/80">
                                        <Info size={14} />
                                        <span className="text-[10px] font-bold">สัดส่วนคะแนน: เก็บ {currentCourse.formativeWeight || 60} / กลางภาค {currentCourse.midtermWeight || 20} / ปลายภาค {currentCourse.finalWeight || 20}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <Link 
                                    to={`/academic/formative-scores?level=${selectedLevel}&room=${selectedRoom}&courseId=${selectedCourseId}`}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 dark:bg-[#1e2235] hover:bg-slate-200 dark:hover:bg-[#252a41] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-[11px] font-bold transition-all"
                                >
                                    <ArrowLeft size={14} /> ก่อนหน้า
                                </Link>
                                <span className="text-[12px] font-black text-slate-900 dark:text-white">{filteredStudents.length} รายชื่อ</span>
                            </div>
                        </div>
                    </div>
                </div>

                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                `}</style>
            </div>
        </MainLayout>
    );
};

export default PostMidtermScoreEntryPage;
