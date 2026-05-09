import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import BackButton from "@/components/Shared/BackButton";
import { RootState } from "@/store";
import { firestore as db } from "@/firebase";
import { collection, query, onSnapshot, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import MainLayout from "@/layouts/MainLayout";
import { 
    Settings, 
    Save, 
    Copy, 
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
    name: string;
    maxScore: number;
    term: 'pre-midterm' | 'post-midterm';
}

interface Course {
    id: string;
    code: string;
    title: string;
    subjectGroup: string;
    formativeAssessments?: FormativeAssessment[];
    midtermWeight?: number;
    finalWeight?: number;
    updatedBy?: string;
    updatedAt?: any;
    isActive?: boolean;
}

const ScoreConfigurationPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    
    const { subjectGroups } = useSubjectGroups(schoolId);
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string>("");
    const [filterScope, setFilterScope] = useState<"group" | "all">("group");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [localScores, setLocalScores] = useState<Record<string, any>>({});

    // Fetch Courses
    useEffect(() => {
        if (!schoolId) return;
        
        const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
        const unsubscribe = onSnapshot(query(coursesRef), (snap) => {
            const courseList = snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Course))
                .filter(c => c.isActive !== false);
            setCourses(courseList);
            
            // Auto-select first group if none selected
            if (!selectedGroup && courseList.length > 0) {
                const firstGroup = courseList[0].subjectGroup;
                if (firstGroup) setSelectedGroup(firstGroup);
            }

            // Initialize local scores ONLY if not already initialized
            setLocalScores(prev => {
                const next = { ...prev };
                let hasChanges = false;
                
                courseList.forEach(course => {
                    if (!next[course.id]) {
                        const preMidterm = course.formativeAssessments?.filter(a => a.term === 'pre-midterm') || [];
                        const postMidterm = course.formativeAssessments?.filter(a => a.term === 'post-midterm') || [];
                        
                        next[course.id] = {
                            s1_9: Array(9).fill(0).map((_, i) => preMidterm[i]?.maxScore || 0),
                            midterm: course.midtermWeight || 0,
                            s10_18: Array(9).fill(0).map((_, i) => postMidterm[i]?.maxScore || 0),
                            final: course.finalWeight || 0
                        };
                        hasChanges = true;
                    }
                });
                return hasChanges ? next : prev;
            });
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId, selectedGroup]);

    // Filtered Courses
    const filteredCourses = useMemo(() => {
        if (filterScope === "all") return courses;
        if (!selectedGroup) return [];
        return courses.filter(c => c.subjectGroup === selectedGroup);
    }, [courses, selectedGroup, filterScope]);

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
    };

    // Calculate Totals
    const calculateTotals = useCallback((courseId: string) => {
        const scores = localScores[courseId];
        if (!scores) return { sum1: 0, sum2: 0, total: 0 };
        
        const sum1 = scores.s1_9.reduce((a: any, b: any) => (parseInt(a) || 0) + (parseInt(b) || 0), 0);
        const sum2 = scores.s10_18.reduce((a: any, b: any) => (parseInt(a) || 0) + (parseInt(b) || 0), 0);
        const midterm = parseInt(scores.midterm) || 0;
        const final = parseInt(scores.final) || 0;
        const total = sum1 + midterm + sum2 + final;
        
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
                background: '#1e2235',
                color: '#fff'
            });
            return;
        }

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
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
                    }
                });

                const courseRef = doc(db, 'school-settings', schoolId, 'courses', course.id);
                batch.update(courseRef, {
                    formativeAssessments,
                    midtermWeight: scores.midterm,
                    finalWeight: scores.final,
                    updatedBy: currentUser ? `${(currentUser as any).firstName || ''} ${(currentUser as any).lastName || ''}`.trim() || currentUser?.email : 'System',
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();
            Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าสำเร็จ', background: '#1e2235', color: '#fff' });
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
                            <BackButton to="/academic-admin" />
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
                                disabled={isSaving || filteredCourses.length === 0}
                                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-2xl font-black text-[12px] shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 whitespace-nowrap"
                            >
                                <Save size={16} />
                                บันทึกตั้งค่า
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
                            <div className="col-span-9 border-r border-b border-slate-200 dark:border-white/5 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 py-2">คะแนนเก็บก่อนกลางภาค</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-slate-200 dark:border-white/5 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-bold px-2">กลางภาค</div>
                            
                            {/* Post-midterm Headers */}
                            <div className="col-span-9 border-r border-b border-slate-200 dark:border-white/5 bg-purple-500/5 text-purple-600 dark:text-purple-400 py-2">คะแนนเก็บหลังกลางภาค</div>
                            
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
                                filteredCourses.map(course => {
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
                                    <span className="text-[10px] font-bold">คะแนนรวมต้องเท่ากับ 100 ทุกวิชา</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">จำนวนที่แสดง:</span>
                                <span className="text-[12px] font-black text-slate-900 dark:text-white">{filteredCourses.length} วิชา</span>
                            </div>
                        </div>
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
