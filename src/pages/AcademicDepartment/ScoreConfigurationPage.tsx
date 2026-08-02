import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import BackButton from "@/components/Shared/BackButton";
import { RootState } from "@/store";
import { firestore as db } from "@/firebase";
import { collection, query, where, onSnapshot, writeBatch, doc, getDoc, getDocs, serverTimestamp } from "firebase/firestore";
import MainLayout from "@/layouts/MainLayout";
import {
    Settings,
    Save,
    Copy,
    Search,
    Info,
    AlertCircle,
    Calendar,
    History,
    X,
    CheckSquare,
    Square
} from "lucide-react";
import { useSubjectGroups } from "@/hooks/useSubjectGroups";
import { CLASSES, getClassOptionsBySchoolSettings } from "@/utils/schoolUtils";
import Swal from "sweetalert2";

interface FormativeAssessment {
    id: string;
    name: string;
    maxScore: number;
    term: 'pre-midterm' | 'post-midterm';
}

interface Course {
    id: string;
    code: string;
    title: string;
    subjectGroup: string;
    classId?: string | string[];
    semester?: string;
    formativeWeight?: number;
    formativeAssessments?: FormativeAssessment[];
    midtermWeight?: number;
    finalWeight?: number;
    updatedBy?: string;
    updatedAt?: any;
    isActive?: boolean;
}

interface ArchivedCourse {
    id: string;
    academicYear: string;
    courseId: string;
    code: string;
    title: string;
    subjectGroup: string;
    classId?: string | string[] | null;
    semester?: string | null;
    formativeAssessments?: FormativeAssessment[];
    midtermWeight?: number;
    finalWeight?: number;
}

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

const getScoresFromArchive = (archived: ArchivedCourse) => {
    const preMidterm = archived.formativeAssessments?.filter(a => a.term === 'pre-midterm') || [];
    const postMidterm = archived.formativeAssessments?.filter(a => a.term === 'post-midterm') || [];

    return {
        s1_9: Array(9).fill(0).map((_, i) => preMidterm[i]?.maxScore || 0),
        midterm: archived.midtermWeight || 0,
        s10_18: Array(9).fill(0).map((_, i) => postMidterm[i]?.maxScore || 0),
        final: archived.finalWeight || 0
    };
};

const ScoreConfigurationPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const academicYear = useSelector((state: RootState) => state.calendar.academicYear);

    const { subjectGroups } = useSubjectGroups(schoolId);
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string>("");
    const [selectedLevel, setSelectedLevel] = useState<string>("");
    const [selectedSemester, setSelectedSemester] = useState<string>("");
    const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>(allClassOptions);
    const [filterScope, setFilterScope] = useState<"group" | "all">("group");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [localScores, setLocalScores] = useState<Record<string, any>>({});
    const [dirtyCourseIds, setDirtyCourseIds] = useState<Set<string>>(() => new Set());
    const [currentPage, setCurrentPage] = useState(1);

    // Mirrors dirtyCourseIds without forcing the Firestore listener effect below to
    // re-subscribe on every keystroke (it only needs the latest value inside the callback).
    const dirtyCourseIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        dirtyCourseIdsRef.current = dirtyCourseIds;
    }, [dirtyCourseIds]);

    // Copy-from-previous-year state
    const [showCopyYearModal, setShowCopyYearModal] = useState(false);
    const [sourceYear, setSourceYear] = useState<string>("");
    const [isLoadingArchive, setIsLoadingArchive] = useState(false);
    const [archiveLoaded, setArchiveLoaded] = useState(false);
    const [archivedCourses, setArchivedCourses] = useState<ArchivedCourse[]>([]);
    const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<string>>(() => new Set());

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

    // Fetch Courses
    useEffect(() => {
        if (!schoolId) return;

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
            const courseList = snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Course))
                .filter(c => c.isActive !== false);
            setCourses(courseList);

            // Initialize local scores for new courses, and re-sync any course that has
            // no unsaved local edits so a save by another admin isn't silently overwritten
            // (courses with pending local edits — dirtyCourseIds — are left untouched).
            setLocalScores(prev => {
                const next = { ...prev };
                let hasChanges = false;

                courseList.forEach(course => {
                    if (dirtyCourseIdsRef.current.has(course.id)) return;

                    const fresh = getInitialCourseScores(course);
                    const existing = next[course.id];
                    if (!existing || JSON.stringify(existing) !== JSON.stringify(fresh)) {
                        next[course.id] = fresh;
                        hasChanges = true;
                    }
                });
                return hasChanges ? next : prev;
            });
            setIsLoading(false);
        });

        return () => unsubscribe();
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
            background: '#252629',
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
                setDirtyCourseIds(prev => {
                    const next = new Set(prev);
                    filteredCourses.forEach(course => {
                        if (course.id !== sourceCourseId) {
                            next.add(course.id);
                        }
                    });
                    return next;
                });
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

    // Copy this single course's score configuration from last academic year's archive
    const handleCopyCourseFromLastYear = async (courseId: string) => {
        const course = courses.find(c => c.id === courseId);
        if (!course || !schoolId) return;

        const lastYear = String((parseInt(academicYear, 10) || (new Date().getFullYear() + 543)) - 1);

        try {
            const archiveSnap = await getDoc(doc(db, 'school-settings', schoolId, 'course_score_archive', `${lastYear}_${courseId}`));
            if (!archiveSnap.exists()) {
                Swal.fire({
                    icon: 'info',
                    title: `ไม่พบข้อมูลปีการศึกษา ${lastYear} สำหรับวิชานี้`,
                    text: 'ระบบเริ่มเก็บข้อมูลอัตโนมัติเมื่อมีการกดบันทึกในปีนั้นๆ',
                    background: '#252629',
                    color: '#fff'
                });
                return;
            }

            const archived = { id: archiveSnap.id, ...archiveSnap.data() } as ArchivedCourse;

            const result = await Swal.fire({
                title: 'คัดลอกจากปีที่แล้ว',
                text: `ต้องการคัดลอกสัดส่วนคะแนนของวิชา ${course.code} จากปีการศึกษา ${lastYear} มาใช้แทนค่าปัจจุบัน (ที่ยังไม่บันทึก) หรือไม่?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ยืนยัน',
                cancelButtonText: 'ยกเลิก',
                background: '#252629',
                color: '#fff'
            });

            if (result.isConfirmed) {
                setLocalScores(prev => ({ ...prev, [courseId]: getScoresFromArchive(archived) }));
                setDirtyCourseIds(prev => {
                    const next = new Set(prev);
                    next.add(courseId);
                    return next;
                });
                Swal.fire({
                    icon: 'success',
                    title: `คัดลอกจากปีการศึกษา ${lastYear} สำเร็จ`,
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 1500,
                    background: '#252629',
                    color: '#fff'
                });
            }
        } catch (err) {
            console.error("Error copying score configuration from last year:", err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการคัดลอกข้อมูล', background: '#252629', color: '#fff' });
        }
    };

    // Save Changes
    const handleSave = async () => {
        const coursesToSave = filteredCourses.filter(course => dirtyCourseIds.has(course.id));

        if (coursesToSave.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'ยังไม่มีรายการที่แก้ไข',
                text: 'กรุณาแก้ไขคะแนนของรายวิชาที่ต้องการก่อนบันทึก',
                background: '#252629',
                color: '#fff'
            });
            return;
        }

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
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
                    }
                });

                const updatedBy = currentUser ? `${(currentUser as any).firstName || ''} ${(currentUser as any).lastName || ''}`.trim() || currentUser?.email : 'System';

                const courseRef = doc(db, 'school-settings', schoolId, 'courses', course.id);
                batch.update(courseRef, {
                    formativeAssessments,
                    midtermWeight: toScoreNumber(scores.midterm),
                    finalWeight: toScoreNumber(scores.final),
                    updatedBy,
                    updatedAt: serverTimestamp()
                });

                // Snapshot into the year-scoped archive so this configuration can be
                // copied forward as "last year's" data once a new academic year starts.
                if (academicYear) {
                    const archiveRef = doc(db, 'school-settings', schoolId, 'course_score_archive', `${academicYear}_${course.id}`);
                    batch.set(archiveRef, {
                        academicYear,
                        courseId: course.id,
                        code: course.code,
                        title: course.title,
                        subjectGroup: course.subjectGroup,
                        classId: course.classId ?? null,
                        semester: course.semester ?? null,
                        formativeAssessments,
                        midtermWeight: toScoreNumber(scores.midterm),
                        finalWeight: toScoreNumber(scores.final),
                        updatedBy,
                        archivedAt: serverTimestamp()
                    }, { merge: true });
                }
            });

            await batch.commit();
            setDirtyCourseIds(prev => {
                const next = new Set(prev);
                coursesToSave.forEach(course => next.delete(course.id));
                return next;
            });
            Swal.fire({ icon: 'success', title: `บันทึกสำเร็จ ${coursesToSave.length} วิชา`, background: '#252629', color: '#fff' });
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการบันทึก', background: '#252629', color: '#fff' });
        } finally {
            setIsSaving(false);
        }
    };

    // Candidate source years for "copy from previous year" (Buddhist-era academic years)
    const yearOptions = useMemo(() => {
        const base = parseInt(academicYear, 10) || (new Date().getFullYear() + 543);
        return Array.from({ length: 5 }, (_, i) => String(base - 1 - i));
    }, [academicYear]);

    // Match an archived course to a currently-loaded course by subject code
    const matchCurrentCourse = useCallback((code: string) => {
        return courses.find(c => c.code === code);
    }, [courses]);

    const matchedArchivedCourses = useMemo(
        () => archivedCourses.filter(ac => matchCurrentCourse(ac.code)),
        [archivedCourses, matchCurrentCourse]
    );

    const fetchArchivedCourses = async (year: string) => {
        if (!schoolId || !year) return;

        setIsLoadingArchive(true);
        setArchiveLoaded(false);
        setSelectedArchiveIds(new Set());
        try {
            const archiveRef = collection(db, 'school-settings', schoolId, 'course_score_archive');
            const snap = await getDocs(query(archiveRef, where('academicYear', '==', year)));
            let list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArchivedCourse));

            if (filterScope === "group" && selectedGroup) {
                list = list.filter(c => c.subjectGroup === selectedGroup);
            }
            list.sort((a, b) => a.code.localeCompare(b.code));

            setArchivedCourses(list);
        } catch (err) {
            console.error("Error fetching archived score configuration:", err);
            Swal.fire({ icon: 'error', title: 'โหลดข้อมูลปีการศึกษาที่แล้วไม่สำเร็จ', background: '#252629', color: '#fff' });
        } finally {
            setIsLoadingArchive(false);
            setArchiveLoaded(true);
        }
    };

    const openCopyYearModal = () => {
        const defaultYear = yearOptions[0] || "";
        setSourceYear(defaultYear);
        setShowCopyYearModal(true);
        if (defaultYear) fetchArchivedCourses(defaultYear);
    };

    const handleSourceYearChange = (year: string) => {
        setSourceYear(year);
        fetchArchivedCourses(year);
    };

    const toggleArchiveSelection = (id: string) => {
        setSelectedArchiveIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAllMatchedArchive = () => {
        setSelectedArchiveIds(new Set(matchedArchivedCourses.map(c => c.id)));
    };

    const clearArchiveSelection = () => setSelectedArchiveIds(new Set());

    const handleApplyCopyFromYear = () => {
        if (selectedArchiveIds.size === 0) return;

        const newScores = { ...localScores };
        const newDirty = new Set(dirtyCourseIds);
        let appliedCount = 0;

        archivedCourses.forEach(ac => {
            if (!selectedArchiveIds.has(ac.id)) return;
            const target = matchCurrentCourse(ac.code);
            if (!target) return;

            newScores[target.id] = getScoresFromArchive(ac);
            newDirty.add(target.id);
            appliedCount++;
        });

        setLocalScores(newScores);
        setDirtyCourseIds(newDirty);
        setShowCopyYearModal(false);

        Swal.fire({
            icon: 'success',
            title: `คัดลอกจากปีการศึกษา ${sourceYear} สำเร็จ ${appliedCount} วิชา`,
            text: 'กรุณาตรวจสอบความถูกต้องแล้วกดบันทึกเพื่อยืนยัน',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2500,
            background: '#252629',
            color: '#fff'
        });
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-600 dark:text-gray-300 font-sans flex flex-col">
                
                {/* Header Area */}
                <div className="bg-white/95 dark:bg-[#2a2b2f]/95 border-b border-gray-200 dark:border-gray-800 px-4 py-4 sm:px-6 lg:pl-16 sticky top-[60px] z-40 backdrop-blur-md shadow-sm">
                    <div className="max-w-[1600px] mx-auto space-y-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex min-w-0 items-center gap-4">
                            <BackButton to="/academic/hub/evaluation" />
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300">
                                    <Settings size={22} />
                                </div>
                                <div className="min-w-[260px]">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="text-2xl font-black leading-tight tracking-tight text-gray-900 dark:text-white">ตั้งค่าคะแนนเต็มรายวิชา</h1>
                                    </div>
                                    <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">กำหนดสัดส่วนคะแนนเก็บ กลางภาค และปลายภาค</p>
                                </div>
                            </div>
                        </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={openCopyYearModal}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-black text-indigo-600 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                                >
                                    <History size={16} />
                                    คัดลอกจากปีที่แล้ว
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || dirtyVisibleCourseCount === 0}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:text-white/80 disabled:shadow-none dark:disabled:bg-emerald-500/20 dark:disabled:text-emerald-100/50"
                                >
                                    <Save size={16} />
                                    {dirtyVisibleCourseCount > 0 ? `บันทึก ${dirtyVisibleCourseCount} วิชา` : 'บันทึกตั้งค่า'}
                                </button>
                            </div>
                        </div>

                        {/* Filters & Actions */}
                        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 shadow-inner dark:border-gray-800 dark:bg-[#252629]/70 md:grid-cols-2 xl:grid-cols-[180px_180px_minmax(280px,1fr)_250px]">
                            <label className="flex h-12 items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-gray-800 dark:bg-[#2a2b2f] dark:focus-within:ring-indigo-500/20">
                                <span className="w-10 shrink-0 text-[11px] font-black uppercase tracking-wide text-gray-400 dark:text-gray-500">ชั้น</span>
                                <select 
                                    value={selectedLevel}
                                    onChange={(e) => setSelectedLevel(e.target.value)}
                                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-900 outline-none dark:text-white"
                                >
                                    <option value="" className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">ทุกชั้น</option>
                                    {availableClassOptions.map(([id, name]) => (
                                        <option key={id} value={id} className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">{name}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="flex h-12 items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-gray-800 dark:bg-[#2a2b2f] dark:focus-within:ring-indigo-500/20">
                                <span className="w-10 shrink-0 text-[11px] font-black uppercase tracking-wide text-gray-400 dark:text-gray-500">ภาค</span>
                                <select 
                                    value={selectedSemester}
                                    onChange={(e) => setSelectedSemester(e.target.value)}
                                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-900 outline-none dark:text-white"
                                >
                                    <option value="" className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">ทุกภาค</option>
                                    <option value="1" className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">ภาคเรียนที่ 1</option>
                                    <option value="2" className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">ภาคเรียนที่ 2</option>
                                    <option value="annual" className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">รายปี</option>
                                </select>
                            </label>

                            <label className="flex h-12 items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-gray-800 dark:bg-[#2a2b2f] dark:focus-within:ring-indigo-500/20">
                                <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-gray-400 dark:text-gray-500">กลุ่มสาระ</span>
                                <select 
                                    value={selectedGroup}
                                    onChange={(e) => setSelectedGroup(e.target.value)}
                                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-900 outline-none dark:text-white"
                                >
                                    <option value="" className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">เลือกกลุ่มสาระการเรียนรู้</option>
                                    {subjectGroups.map(g => (
                                        <option key={g.id} value={g.name} className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">{g.name}</option>
                                    ))}
                                </select>
                            </label>

                            <div className="grid h-12 grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f]">
                                <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition ${filterScope === "group" ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}>
                                    <input 
                                        type="radio" 
                                        name="scope" 
                                        checked={filterScope === "group"} 
                                        onChange={() => setFilterScope("group")}
                                        className="sr-only"
                                    />
                                    เฉพาะกลุ่ม
                                </label>
                                <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-xs font-black transition ${filterScope === "all" ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}>
                                    <input 
                                        type="radio" 
                                        name="scope" 
                                        checked={filterScope === "all"} 
                                        onChange={() => setFilterScope("all")}
                                        className="sr-only"
                                    />
                                    ทั้งหมด
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-4 sm:p-6 overflow-hidden">
                    <div className="max-w-[1600px] mx-auto h-full flex flex-col bg-white dark:bg-[#2a2b2f] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
                        
                        {/* Table Header */}
                        <div className="grid grid-cols-[minmax(170px,1.7fr)_repeat(9,minmax(30px,1fr))_minmax(54px,1.1fr)_repeat(9,minmax(30px,1fr))_minmax(44px,0.9fr)_minmax(44px,0.9fr)_minmax(44px,0.9fr)_minmax(44px,0.9fr)_minmax(120px,1.6fr)] bg-gray-100 dark:bg-[#252629] border-b border-gray-200 dark:border-gray-800 text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center sticky top-0 z-20">
                            {/* Row 1 */}
                            <div className="row-span-2 px-4 py-4 text-left border-r border-gray-200 dark:border-gray-800 sticky left-0 bg-gray-100 dark:bg-[#252629] flex items-center text-gray-900 dark:text-white">รหัส / รายวิชา</div>
                            
                            {/* Pre-midterm Headers */}
                            <div className="col-span-9 border-r border-b border-gray-200 dark:border-gray-800 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 py-2">คะแนนเก็บก่อนกลางภาค</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-gray-200 dark:border-gray-800 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-bold px-2">กลางภาค</div>
                            
                            {/* Post-midterm Headers */}
                            <div className="col-span-9 border-r border-b border-gray-200 dark:border-gray-800 bg-purple-500/5 text-purple-600 dark:text-purple-400 py-2">คะแนนเก็บหลังกลางภาค</div>
                            
                            <div className="row-span-2 flex items-center justify-center border-r border-gray-200 dark:border-gray-800 bg-gray-200 dark:bg-gray-800/50">รวม 1</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-gray-200 dark:border-gray-800 bg-gray-200 dark:bg-gray-800/50">รวม 2</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-gray-200 dark:border-gray-800 bg-rose-500/5 text-rose-600 dark:text-rose-400">ปลายภาค</div>
                            <div className="row-span-2 flex items-center justify-center border-r border-gray-200 dark:border-gray-800 bg-indigo-500/10 text-indigo-900 dark:text-white text-[11px]">รวม</div>
                            <div className="row-span-2 flex items-center justify-center">ผู้บันทึกล่าสุด</div>

                            {/* Row 2: Sub Headers for S1-S18 */}
                            {Array(9).fill(0).map((_, i) => (
                                <div key={`h-s${i+1}`} className="py-2 border-r border-gray-200 dark:border-gray-800 bg-indigo-500/5 text-indigo-600/60 dark:text-indigo-400/60 flex flex-col items-center gap-0.5 justify-center">
                                    <span>S{i+1}</span>
                                    <Info size={10} className="opacity-40" />
                                </div>
                            ))}
                            {Array(9).fill(0).map((_, i) => (
                                <div key={`h-s${i+10}`} className="py-2 border-r border-gray-200 dark:border-gray-800 bg-purple-500/5 text-purple-600/60 dark:text-purple-400/60 flex flex-col items-center gap-0.5 justify-center">
                                    <span>S{i+10}</span>
                                    <Info size={10} className="opacity-40" />
                                </div>
                            ))}
                        </div>

                        {/* Table Body */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                            {isLoading ? (
                                <div className="h-full flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">กำลังโหลดข้อมูลรายวิชา...</p>
                                    </div>
                                </div>
                            ) : filteredCourses.length === 0 ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-gray-100 dark:bg-[#252629]/40 p-10 rounded-3xl border border-gray-200 dark:border-gray-800">
                                        <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/10">
                                            <Search size={32} className="text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">ไม่พบรายวิชาที่ตรงเงื่อนไข</h3>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed font-bold uppercase tracking-wider">กรุณาเลือกกลุ่มสาระการเรียนรู้ หรือ เปลี่ยนขอบเขตการค้นหา</p>
                                    </div>
                                </div>
                            ) : (
                                paginatedCourses.map(course => {
                                    const scores = localScores[course.id];
                                    if (!scores) return null;
                                    const { sum1, sum2, total } = calculateTotals(course.id);
                                    
                                    return (
                                        <div key={course.id} className="grid grid-cols-[minmax(170px,1.7fr)_repeat(9,minmax(30px,1fr))_minmax(54px,1.1fr)_repeat(9,minmax(30px,1fr))_minmax(44px,0.9fr)_minmax(44px,0.9fr)_minmax(44px,0.9fr)_minmax(44px,0.9fr)_minmax(120px,1.6fr)] border-b border-gray-200 dark:border-gray-800 items-stretch transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02] group">
                                            {/* Code & Title */}
                                            <div className="px-4 py-3 border-r border-gray-200 dark:border-gray-800 sticky left-0 bg-white dark:bg-[#2a2b2f] group-hover:bg-gray-50 dark:group-hover:bg-[#1c2132] z-10">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{course.code}</span>
                                                        <div className="relative group/copytpl">
                                                            <button
                                                                onClick={() => handleCopyTemplate(course.id)}
                                                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all"
                                                            >
                                                                <Copy size={10} className="text-gray-400" />
                                                            </button>
                                                            <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/copytpl:opacity-100 dark:bg-gray-700">
                                                                คัดลอกเป็นต้นแบบไปวิชาอื่น
                                                            </span>
                                                        </div>
                                                        <div className="relative group/copyyear">
                                                            <button
                                                                onClick={() => handleCopyCourseFromLastYear(course.id)}
                                                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all"
                                                            >
                                                                <History size={10} className="text-gray-400" />
                                                            </button>
                                                            <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/copyyear:opacity-100 dark:bg-gray-700">
                                                                คัดลอกจากปีการศึกษาที่แล้ว (วิชานี้)
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[12px] font-bold text-gray-900 dark:text-white truncate max-w-[180px]">{course.title}</span>
                                                </div>
                                            </div>

                                            {/* S1-S9 */}
                                            {scores.s1_9.map((val: number, i: number) => (
                                                <input 
                                                    key={`s${i+1}`}
                                                    type="text" 
                                                    value={val || ""}
                                                    onChange={(e) => handleScoreChange(course.id, 's1_9', i, e.target.value)}
                                                    className="w-full h-full bg-transparent border-r border-gray-200 dark:border-gray-800 text-center text-[12px] font-black text-gray-900 dark:text-white focus:bg-indigo-500/10 focus:outline-none transition-all placeholder-gray-300 dark:placeholder-white/5"
                                                    placeholder="0"
                                                />
                                            ))}

                                            {/* Midterm */}
                                            <input 
                                                type="text" 
                                                value={scores.midterm || ""}
                                                onChange={(e) => handleScoreChange(course.id, 'midterm', 0, e.target.value)}
                                                className="w-full h-full bg-emerald-500/5 border-r border-gray-200 dark:border-gray-800 text-center text-[13px] font-black text-emerald-600 dark:text-emerald-400 focus:bg-emerald-500/20 focus:outline-none transition-all"
                                                placeholder="0"
                                            />

                                            {/* S10-S18 */}
                                            {scores.s10_18.map((val: number, i: number) => (
                                                <input 
                                                    key={`s${i+10}`}
                                                    type="text" 
                                                    value={val || ""}
                                                    onChange={(e) => handleScoreChange(course.id, 's10_18', i, e.target.value)}
                                                    className="w-full h-full bg-transparent border-r border-gray-200 dark:border-gray-800 text-center text-[12px] font-black text-gray-900 dark:text-white focus:bg-purple-500/10 focus:outline-none transition-all placeholder-gray-300 dark:placeholder-white/5"
                                                    placeholder="0"
                                                />
                                            ))}

                                            {/* Sums */}
                                            <div className="flex items-center justify-center border-r border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/30 text-[12px] font-black text-gray-500 dark:text-gray-400">{sum1}</div>
                                            <div className="flex items-center justify-center border-r border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/30 text-[12px] font-black text-gray-500 dark:text-gray-400">{sum2}</div>

                                            {/* Final */}
                                            <input 
                                                type="text" 
                                                value={scores.final || ""}
                                                onChange={(e) => handleScoreChange(course.id, 'final', 0, e.target.value)}
                                                className="w-full h-full bg-rose-500/5 border-r border-gray-200 dark:border-gray-800 text-center text-[13px] font-black text-rose-600 dark:text-rose-400 focus:bg-rose-500/20 focus:outline-none transition-all"
                                                placeholder="0"
                                            />

                                            {/* Total */}
                                            <div className={`flex items-center justify-center border-r border-gray-200 dark:border-gray-800 text-[14px] font-black ${total === 100 ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/5' : 'text-rose-600 dark:text-rose-500 bg-rose-500/10'}`}>
                                                {total}
                                            </div>

                                            {/* Updated Info */}
                                            <div className="px-2 py-2 flex flex-col justify-center items-center gap-0.5 border-r border-gray-200 dark:border-gray-800 overflow-hidden">
                                                {course.updatedBy ? (
                                                    <>
                                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 truncate w-full text-center">{course.updatedBy}</span>
                                                        <div className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500 font-bold">
                                                            <Calendar size={8} />
                                                            {course.updatedAt?.toDate().toLocaleDateString('th-TH')}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-600 italic">ยังไม่มีการบันทึก</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="bg-gray-50 dark:bg-[#252629]/40 border-t border-gray-200 dark:border-gray-800 px-8 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse" />
                                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">สถานะระบบ: พร้อมใช้งาน</span>
                                </div>
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400/80">
                                    <AlertCircle size={14} />
                                    <span className="text-[10px] font-bold">บันทึกเฉพาะรายวิชาที่แก้ไข คะแนนรวมไม่จำเป็นต้องครบ 100</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">จำนวนที่แสดง:</span>
                                <span className="text-[12px] font-black text-gray-900 dark:text-white">{filteredCourses.length} วิชา</span>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">แก้ไข:</span>
                                <span className="text-[12px] font-black text-emerald-600 dark:text-emerald-400">{dirtyVisibleCourseCount} วิชา</span>
                            </div>
                        </div>

                        {filteredCourses.length > PAGE_SIZE && (
                            <div className="bg-white dark:bg-[#2a2b2f] border-t border-gray-200 dark:border-gray-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    แสดง {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredCourses.length)} จาก {filteredCourses.length} วิชา
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#252629] disabled:opacity-40 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        หน้าแรก
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#252629] disabled:opacity-40 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
                                                    : 'bg-gray-100 dark:bg-[#252629] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#252629] disabled:opacity-40 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        ถัดไป
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#252629] disabled:opacity-40 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        หน้าสุดท้าย
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Copy From Previous Year Modal */}
                {showCopyYearModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#2a2b2f]">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/15 dark:text-indigo-300">
                                        <History size={18} />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-black text-gray-900 dark:text-white">คัดลอกสัดส่วนคะแนนจากปีการศึกษาที่แล้ว</h2>
                                        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                            ขอบเขต: {filterScope === "group" ? (selectedGroup || "ยังไม่เลือกกลุ่มสาระ") : "ทุกกลุ่มสาระ"}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowCopyYearModal(false)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Year Select */}
                            <div className="border-b border-gray-200 px-6 py-3 dark:border-gray-800">
                                <label className="flex items-center gap-3">
                                    <span className="text-[11px] font-black uppercase tracking-wide text-gray-400 dark:text-gray-500">ปีการศึกษาต้นทาง</span>
                                    <select
                                        value={sourceYear}
                                        onChange={(e) => handleSourceYearChange(e.target.value)}
                                        className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-900 outline-none dark:border-gray-800 dark:bg-[#252629] dark:text-white"
                                    >
                                        {yearOptions.map(y => (
                                            <option key={y} value={y} className="bg-white dark:bg-[#252629] text-gray-900 dark:text-white">ปีการศึกษา {y}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-auto p-4">
                                {isLoadingArchive ? (
                                    <div className="flex h-40 items-center justify-center">
                                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500/20 border-t-indigo-500" />
                                    </div>
                                ) : archiveLoaded && archivedCourses.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                                        <AlertCircle size={28} className="text-amber-500" />
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">ไม่พบข้อมูลของปีการศึกษา {sourceYear}</p>
                                        <p className="max-w-sm text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                            ระบบจะเก็บข้อมูลสัดส่วนคะแนนอัตโนมัติทุกครั้งที่มีการกด "บันทึก" ในหน้านี้ นับจากนี้เป็นต้นไป
                                            หากยังไม่เคยบันทึกในปีการศึกษาดังกล่าว จะยังไม่มีข้อมูลให้คัดลอก
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-3 flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                                พบ {archivedCourses.length} วิชา ({matchedArchivedCourses.length} วิชาตรงกับปีปัจจุบัน)
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button onClick={selectAllMatchedArchive} className="text-[11px] font-black text-indigo-600 hover:underline dark:text-indigo-400">เลือกทั้งหมดที่ตรงกัน</button>
                                                <span className="text-gray-300 dark:text-gray-600">|</span>
                                                <button onClick={clearArchiveSelection} className="text-[11px] font-black text-gray-500 hover:underline dark:text-gray-400">ล้างการเลือก</button>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            {archivedCourses.map(ac => {
                                                const target = matchCurrentCourse(ac.code);
                                                const isMatched = !!target;
                                                const isSelected = selectedArchiveIds.has(ac.id);
                                                return (
                                                    <button
                                                        key={ac.id}
                                                        type="button"
                                                        disabled={!isMatched}
                                                        onClick={() => toggleArchiveSelection(ac.id)}
                                                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                                                            !isMatched
                                                                ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-50 dark:border-gray-800 dark:bg-white/[0.02]'
                                                                : isSelected
                                                                    ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                                                                    : 'border-gray-200 bg-white hover:border-indigo-200 dark:border-gray-800 dark:bg-[#252629] dark:hover:border-indigo-500/30'
                                                        }`}
                                                    >
                                                        {isSelected ? (
                                                            <CheckSquare size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                                                        ) : (
                                                            <Square size={18} className="shrink-0 text-gray-300 dark:text-gray-600" />
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">{ac.code}</span>
                                                                <span className="truncate text-[12px] font-bold text-gray-900 dark:text-white">{ac.title}</span>
                                                            </div>
                                                            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">{ac.subjectGroup}</span>
                                                        </div>
                                                        {!isMatched && (
                                                            <span className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400">ไม่พบวิชานี้ในปีปัจจุบัน</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
                                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                    เลือกแล้ว {selectedArchiveIds.size} วิชา
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowCopyYearModal(false)}
                                        className="h-10 rounded-xl border border-gray-200 px-4 text-[12px] font-black text-gray-600 transition hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        onClick={handleApplyCopyFromYear}
                                        disabled={selectedArchiveIds.size === 0}
                                        className="h-10 rounded-xl bg-indigo-600 px-5 text-[12px] font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-200 dark:disabled:bg-indigo-500/20"
                                    >
                                        คัดลอกที่เลือก ({selectedArchiveIds.size})
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                    .custom-scrollbar::-webkit-scrollbar:horizontal { height: 0px; }
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
