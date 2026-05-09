import React, { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { firestore as db } from "../../firebase";
import { collection, query, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
import MainLayout from "../../layouts/MainLayout";
import {
    Search,
    Filter,
    Users,
    BookOpen,
    GraduationCap,
    User,
    LayoutGrid,
    Calendar,
    ChevronRight,
    ChevronLeft,
    ChevronsLeft,
    ChevronsRight,
    SearchX,
    UserCircle,
    ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BackButton from "@/components/Shared/BackButton";

interface Enrollment {
    id: string;
    courseCode: string;
    courseTitle: string;
    teacherName: string;
    groupName: string;
    studentCode: string;
    studentName: string;
    room: string;
    number: string;
    classLevel: string;
    enrolledAt: any;
    courseId?: string;
    subjectGroup?: string;
}

interface Course {
    id: string;
    code: string;
    title: string;
    teacherId?: string;
    teacherIds?: string[];
    teacherAssignments?: {
        teacherId: string;
        classLevels: string[];
        roomIds: string[];
        groupNumber?: string | number;
    }[];
    subjectGroup?: string;
}

const EnrollmentListPage: React.FC = () => {
    const { user } = useSelector((state: RootState) => state.auth);
    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
    const { currentAcademicYear: schoolYear } = useSelector((state: RootState) => state.schoolSettings);
    const { terms, academicYear: calYear } = useSelector((state: RootState) => state.calendar);
    const schoolId = user?.schoolId;

    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [levelFilter, setLevelFilter] = useState("ทั้งหมด");
    const [courseFilter, setCourseFilter] = useState("ทั้งหมด");
    const [teacherFilter, setTeacherFilter] = useState("ทั้งหมด");
    const [groupFilter, setGroupFilter] = useState("ทั้งหมด");
    const [activeSemester, setActiveSemester] = useState("1");
    const [activeYear, setActiveYear] = useState("");
    const [schoolInfo, setSchoolInfo] = useState<any>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);

    const getLevelLabel = (id: string | undefined) => {
        if (!id) return "";
        const map: Record<string, string> = {
            k1: 'อนุบาล 1', k2: 'อนุบาล 2', k3: 'อนุบาล 3',
            p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
            m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
            junior_high: 'ม.ต้น', senior_high: 'ม.ปลาย',
            'ม.ต้น': 'ม.ต้น', 'ม.ปลาย': 'ม.ปลาย'
        };
        return map[id] || id;
    };

    const matchesLevel = (dataLevel: string | undefined, filterLevel: string) => {
        if (filterLevel === "ทั้งหมด") return true;
        if (!dataLevel) return false;
        
        const normalizedData = dataLevel.toLowerCase().trim();
        const normalizedFilter = filterLevel.toLowerCase().trim();

        if (normalizedData === normalizedFilter) return true;

        if (normalizedFilter === "junior_high" || normalizedFilter === "ม.ต้น") {
            return ["m1", "m2", "m3", "ม.1", "ม.2", "ม.3"].includes(normalizedData);
        }
        
        if (normalizedFilter === "senior_high" || normalizedFilter === "ม.ปลาย") {
            return ["m4", "m5", "m6", "ม.4", "ม.5", "ม.6"].includes(normalizedData);
        }

        const gradeMap: Record<string, string[]> = {
            k1: ['k1', 'อนุบาล 1', 'อ.1'], k2: ['k2', 'อนุบาล 2', 'อ.2'], k3: ['k3', 'อนุบาล 3', 'อ.3'],
            p1: ['p1', 'ป.1'], p2: ['p2', 'ป.2'], p3: ['p3', 'ป.3'],
            p4: ['p4', 'ป.4'], p5: ['p5', 'ป.5'], p6: ['p6', 'ป.6'],
            m1: ['m1', 'ม.1'], m2: ['m2', 'ม.2'], m3: ['m3', 'ม.3'],
            m4: ['m4', 'ม.4'], m5: ['m5', 'ม.5'], m6: ['m6', 'ม.6']
        };

        return gradeMap[normalizedFilter]?.includes(normalizedData) || false;
    };

    useEffect(() => {
        if (terms && terms.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            const currentTerm = terms.find(t => today >= t.startDate && today <= t.endDate);
            if (currentTerm) {
                const foundTermId = currentTerm.name.includes('2') ? '2' : '1';
                setActiveSemester(foundTermId);
            }
        }
    }, [terms]);

    useEffect(() => {
        if (calYear || schoolYear) {
            setActiveYear(calYear || schoolYear);
        }
    }, [calYear, schoolYear]);

    useEffect(() => {
        if (schoolId) {
            fetchEnrollments();
            const fetchSchoolInfo = async () => {
                const docRef = doc(db, 'school-settings', schoolId);
                const snap = await getDoc(docRef);
                if (snap.exists()) setSchoolInfo(snap.data());
            };
            fetchSchoolInfo();
        }
    }, [schoolId]);

    const fetchEnrollments = async () => {
        setLoading(true);
        try {
            const enrollRef = collection(db, 'school-settings', schoolId!, 'enrollments');
            const coursesRef = collection(db, 'school-settings', schoolId!, 'courses');
            const studentsRef = collection(db, 'school-settings', schoolId!, 'students');

            const [enrollSnap, courseSnap, studentSnap] = await Promise.all([
                getDocs(enrollRef),
                getDocs(coursesRef),
                getDocs(studentsRef)
            ]);

            const cMap: Record<string, Course> = {};
            courseSnap.docs.forEach(doc => {
                cMap[doc.id] = { id: doc.id, ...doc.data() } as Course;
            });

            const sMap: Record<string, any> = {};
            studentSnap.docs.forEach(doc => {
                sMap[doc.id] = { id: doc.id, ...doc.data() };
            });

            const data = enrollSnap.docs.map(doc => {
                const d = doc.data();
                const relatedCourse = cMap[d.courseId];
                const relatedStudent = sMap[d.studentId];

                if (!relatedCourse || !relatedStudent) return null;

                let computedTeacherName = "";
                const studentRoom = relatedStudent.room;
                const studentLevel = relatedStudent.classLevel;
                const foundTeacherIds = new Set<string>();

                if (relatedCourse.teacherAssignments && relatedCourse.teacherAssignments.length > 0) {
                    relatedCourse.teacherAssignments.forEach(assign => {
                        const matchRoom = assign.roomIds && assign.roomIds.includes(studentRoom);
                        const matchLevel = assign.classLevels && assign.classLevels.includes(studentLevel);
                        const matchGroup = assign.groupNumber ? (d.groupName === `กลุ่ม ${assign.groupNumber}` || d.groupName === String(assign.groupNumber)) : false;

                        if (matchRoom || matchLevel || matchGroup) {
                            foundTeacherIds.add(assign.teacherId);
                        }
                    });
                }

                if (foundTeacherIds.size === 0) {
                    if (relatedCourse.teacherIds && relatedCourse.teacherIds.length > 0) {
                        relatedCourse.teacherIds.forEach(id => foundTeacherIds.add(id));
                    } else if (relatedCourse.teacherId) {
                        foundTeacherIds.add(relatedCourse.teacherId);
                    }
                }

                if (foundTeacherIds.size > 0) {
                    const names = Array.from(foundTeacherIds).map(tid => teacherMap[tid]?.name).filter(Boolean);
                    if (names.length > 0) computedTeacherName = names.join(', ');
                }

                return {
                    id: doc.id,
                    ...d,
                    studentName: `${relatedStudent.firstName} ${relatedStudent.lastName}`,
                    studentCode: relatedStudent.studentId || "",
                    classLevel: relatedStudent.classLevel || "",
                    room: relatedStudent.room || "",
                    number: relatedStudent.studentNumber || "",
                    courseCode: relatedCourse.code || "",
                    courseTitle: relatedCourse.title || "",
                    teacherName: computedTeacherName || "ไม่ระบุ",
                    groupName: d.groupName || d.groupNum || "-",
                    subjectGroup: relatedCourse?.subjectGroup || "ทั่วไป"
                } as Enrollment;
            }).filter(Boolean) as Enrollment[];

            data.sort((a, b) => {
                const levelA = a.classLevel || "";
                const levelB = b.classLevel || "";
                if (levelA !== levelB) return levelA.localeCompare(levelB, 'th');

                const codeA = a.courseCode || "";
                const codeB = b.courseCode || "";
                if (codeA !== codeB) return codeA.localeCompare(codeB, 'th');

                const groupA = a.groupName || "";
                const groupB = b.groupName || "";
                if (groupA !== groupB) return groupA.localeCompare(groupB, 'th');

                return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
            });

            setEnrollments(data);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredForMetadata = useMemo(() => {
        return enrollments.filter(e => {
            const dataSemester = (e as any).semester || '1';
            const dataYear = (e as any).academicYear || activeYear;
            return dataSemester === activeSemester && dataYear === activeYear;
        });
    }, [enrollments, activeSemester, activeYear]);

    const levels = useMemo(() => {
        const uniqueLevelsInTable = Array.from(new Set(filteredForMetadata.map(e => e.classLevel)));
        const allPossibleLevels = [
            {id: 'k1', name: 'อ.1', full: 'อนุบาล 1'}, {id: 'k2', name: 'อ.2', full: 'อนุบาล 2'}, {id: 'k3', name: 'อ.3', full: 'อนุบาล 3'},
            {id: 'p1', name: 'ป.1', full: 'ป.1'}, {id: 'p2', name: 'ป.2', full: 'ป.2'}, {id: 'p3', name: 'ป.3', full: 'ป.3'},
            {id: 'p4', name: 'ป.4', full: 'ป.4'}, {id: 'p5', name: 'ป.5', full: 'ป.5'}, {id: 'p6', name: 'ป.6', full: 'ป.6'},
            {id: 'm1', name: 'ม.1', full: 'ม.1'}, {id: 'm2', name: 'ม.2', full: 'ม.2'}, {id: 'm3', name: 'ม.3', full: 'ม.3'},
            {id: 'm4', name: 'ม.4', full: 'ม.4'}, {id: 'm5', name: 'ม.5', full: 'ม.5'}, {id: 'm6', name: 'ม.6', full: 'ม.6'}
        ];

        const exp = schoolInfo?.opportunityExpansionLevel || "";
        let result: string[] = ["ทั้งหมด"];

        if (exp) {
            const start = exp.split('-')[0]?.trim();
            const end = exp.split('-')[1]?.trim();
            let startIndex = allPossibleLevels.findIndex(l => l.name === start || l.id === start || l.full === start);
            let endIndex = allPossibleLevels.findIndex(l => l.name === end || l.id === end || l.full === end);
            if (startIndex === -1) startIndex = 0;
            if (endIndex === -1) endIndex = allPossibleLevels.length - 1;
            const sliced = allPossibleLevels.slice(startIndex, endIndex + 1);
            sliced.forEach(l => {
                result.push(l.id);
                if (l.id === 'm3') result.push('junior_high');
                if (l.id === 'm6') result.push('senior_high');
            });
        } else {
            const baseOrder = allPossibleLevels.map(l => l.id).concat(['junior_high', 'senior_high']);
            const sortedUnique = uniqueLevelsInTable.sort((a, b) => baseOrder.indexOf(a) - baseOrder.indexOf(b));
            result = ["ทั้งหมด", ...sortedUnique];
        }
        return Array.from(new Set(result));
    }, [filteredForMetadata, schoolInfo]);

    const courses = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(filteredForMetadata.map(e => `${e.courseCode} ${e.courseTitle}`)))].sort(), [filteredForMetadata]);
    const teachers = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(filteredForMetadata.map(e => e.teacherName)))].sort(), [filteredForMetadata]);
    const groups = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(filteredForMetadata.map(e => e.groupName || "ไม่ระบุกลุ่ม")))].sort(), [filteredForMetadata]);

    const filteredData = useMemo(() => {
        return enrollments.filter(e => {
            const studentName = (e.studentName || "").toLowerCase();
            const studentCode = (e.studentCode || "");
            const courseCode = (e.courseCode || "").toLowerCase();
            const search = searchTerm.toLowerCase();

            const matchSearch = studentName.includes(search) || studentCode.includes(searchTerm) || courseCode.includes(search);
            const matchLevel = matchesLevel(e.classLevel, levelFilter);
            const matchCourse = courseFilter === "ทั้งหมด" || `${e.courseCode} ${e.courseTitle}` === courseFilter;
            const matchTeacher = teacherFilter === "ทั้งหมด" || e.teacherName === teacherFilter;
            const matchGroup = groupFilter === "ทั้งหมด" || (e.groupName || "ไม่ระบุกลุ่ม") === groupFilter;

            const dataSemester = (e as any).semester || '1';
            const dataYear = (e as any).academicYear || activeYear;

            return matchSearch && matchLevel && matchCourse && matchTeacher && matchGroup && (dataSemester === activeSemester) && (dataYear === activeYear);
        });
    }, [enrollments, searchTerm, levelFilter, courseFilter, teacherFilter, groupFilter, activeSemester, activeYear]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentStudents = filteredData.slice(indexOfFirstItem, indexOfLastItem);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, levelFilter, courseFilter, teacherFilter, groupFilter, activeSemester, activeYear]);

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white transition-colors duration-300">
                <div className="w-full pl-12 pr-2 sm:pl-14 sm:pr-4 md:pl-16 md:pr-6 py-4 sm:py-6 lg:py-8">
                    <header className="mb-6 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div>
                                <BackButton to="/academic-admin" className="mb-4" />
                                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">สรุปรายชื่อการลงทะเบียน</h1>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    แสดงข้อมูลการลงทะเบียนรายวิชาแยกตามระดับชั้นและกลุ่มเรียนในภาคเรียนปัจจุบัน
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 bg-white dark:bg-[#2a2b2f] px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                    <Calendar className="text-indigo-500" size={14} />
                                    <span className="text-xs font-bold">ปีการศึกษา {activeYear}</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white dark:bg-[#2a2b2f] px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                                    <span className="text-xs font-bold">ภาคเรียนที่ {activeSemester}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 p-4 bg-white dark:bg-[#2a2b2f]/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 backdrop-blur-sm">
                            <div className="relative flex-grow min-w-[240px] max-w-md">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="text-gray-400 text-sm" size={14} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="ค้นชื่อนักเรียน, รหัส หรือรายวิชา..."
                                    className="pl-9 pr-4 py-2 w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    value={activeSemester}
                                    onChange={(e) => setActiveSemester(e.target.value)}
                                    className="pl-3 pr-8 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-900 dark:text-white"
                                >
                                    <option value="1">ภาคเรียนที่ 1</option>
                                    <option value="2">ภาคเรียนที่ 2</option>
                                </select>
                                <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs h-full">
                                    <Users size={14} />
                                    <span>พบ {filteredData.length} รายการ</span>
                                </div>
                            </div>
                        </div>
                    </header>

                    <div className="bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-xl rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-xl shadow-indigo-500/5 p-6 mb-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            <div className="group">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 mb-2 uppercase tracking-[0.1em] ml-1">
                                    ระดับชั้น
                                </label>
                                <div className="relative">
                                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500/60 pointer-events-none" size={16} />
                                    <select
                                        value={levelFilter}
                                        onChange={(e) => setLevelFilter(e.target.value)}
                                        className="w-full pl-11 pr-10 h-11 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold appearance-none cursor-pointer text-slate-700 dark:text-slate-200"
                                    >
                                        {levels.map(l => (
                                            <option key={l} value={l} className="dark:bg-slate-900">
                                                {l === "ทั้งหมด" ? "ทุกระดับชั้น" : getLevelLabel(l)}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                                </div>
                            </div>

                            <div className="group">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 mb-2 uppercase tracking-[0.1em] ml-1">
                                    กลุ่มเรียน
                                </label>
                                <div className="relative">
                                    <LayoutGrid className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500/60 pointer-events-none" size={16} />
                                    <select
                                        value={groupFilter}
                                        onChange={(e) => setGroupFilter(e.target.value)}
                                        className="w-full pl-11 pr-10 h-11 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold appearance-none cursor-pointer text-slate-700 dark:text-slate-200"
                                    >
                                        {groups.map(g => (
                                            <option key={g} value={g} className="dark:bg-slate-900">
                                                {g === "ทั้งหมด" ? "ทั้งหมด" : g.replace(/[^0-9]/g, '') || g}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                                </div>
                            </div>

                            <div className="group lg:col-span-1">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 mb-2 uppercase tracking-[0.1em] ml-1">
                                    รายวิชา
                                </label>
                                <div className="relative">
                                    <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500/60 pointer-events-none" size={16} />
                                    <select
                                        value={courseFilter}
                                        onChange={(e) => setCourseFilter(e.target.value)}
                                        className="w-full pl-11 pr-10 h-11 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold appearance-none cursor-pointer text-slate-700 dark:text-slate-200 truncate"
                                    >
                                        {courses.map(c => <option key={c} value={c} className="dark:bg-slate-900">{c === "ทั้งหมด" ? "ทุกรายวิชา" : c}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                                </div>
                            </div>

                            <div className="group">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 mb-2 uppercase tracking-[0.1em] ml-1">
                                    ครูผู้สอน
                                </label>
                                <div className="relative">
                                    <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500/60 pointer-events-none" size={16} />
                                    <select
                                        value={teacherFilter}
                                        onChange={(e) => setTeacherFilter(e.target.value)}
                                        className="w-full pl-11 pr-10 h-11 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-bold appearance-none cursor-pointer text-slate-700 dark:text-slate-200"
                                    >
                                        {teachers.map(t => <option key={t} value={t} className="dark:bg-slate-900">{t === "ทั้งหมด" ? "ครูทุกคน" : t}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <main>
                        <div className="bg-white dark:bg-[#2a2b2f]/60 rounded-2xl shadow-lg ring-1 ring-black/5 dark:ring-white/5 overflow-hidden transition-all duration-500">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
                                        <tr>
                                            <th scope="col" className="py-4 pl-6 pr-3 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest w-16">ลำดับ</th>
                                            <th scope="col" className="py-4 px-3 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">ข้อมูลนักเรียน</th>
                                            <th scope="col" className="py-4 px-3 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">รายวิชา</th>
                                            <th scope="col" className="py-4 px-3 text-center text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest w-24">กลุ่ม</th>
                                            <th scope="col" className="py-4 px-3 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">ครูผู้สอน</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
                                        <AnimatePresence>
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={5} className="py-24 text-center">
                                                        <div className="flex flex-col items-center gap-4">
                                                            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                                            <p className="text-sm font-bold text-slate-500 animate-pulse uppercase tracking-widest">กำลังโหลดข้อมูล...</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : filteredData.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="py-24 text-center">
                                                        <div className="flex flex-col items-center gap-6">
                                                            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center">
                                                                <SearchX size={40} className="text-slate-300 dark:text-slate-600" />
                                                            </div>
                                                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">ไม่พบข้อมูลการลงทะเบียน</h3>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                currentStudents.map((e, index) => (
                                                    <motion.tr
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ duration: 0.15, delay: index * 0.01 }}
                                                        key={e.id}
                                                        className="hover:bg-gray-50 dark:hover:bg-[#2a2b2f]/50 transition-colors group"
                                                    >
                                                        <td className="whitespace-nowrap py-4 pl-6 pr-3 text-xs font-black text-slate-400">
                                                            {indexOfFirstItem + index + 1}
                                                        </td>
                                                        <td className="whitespace-nowrap py-4 px-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-9 w-9 flex-shrink-0">
                                                                    <img
                                                                        className="h-9 w-9 rounded-full object-cover border border-gray-100 dark:border-gray-700"
                                                                        src={`https://ui-avatars.com/api/?name=${e.studentName}&background=random&color=fff`}
                                                                        alt=""
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-[13px] font-bold text-gray-900 dark:text-gray-200 group-hover:text-indigo-600 transition-colors">
                                                                        {e.studentName}
                                                                    </span>
                                                                    <span className="text-[11px] text-gray-500">
                                                                        {e.studentCode} | {getLevelLabel(e.classLevel)}/{e.room}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="whitespace-nowrap py-4 px-3">
                                                            <div className="flex flex-col">
                                                                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300">
                                                                    {e.courseTitle}
                                                                </span>
                                                                <span className="text-[11px] font-black text-indigo-500 uppercase">
                                                                    {e.courseCode}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="whitespace-nowrap py-4 px-3 text-center">
                                                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-100 dark:border-indigo-800">
                                                                {e.groupName.replace(/[^0-9]/g, '') || e.groupName}
                                                            </span>
                                                        </td>
                                                        <td className="whitespace-nowrap py-4 px-3">
                                                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                                                <UserCircle size={14} className="text-slate-400" />
                                                                <span className="text-[12px] font-bold">{e.teacherName}</span>
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                ))
                                            )}
                                        </AnimatePresence>
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-gray-800">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">
                                            แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredData.length)} จาก {filteredData.length}
                                        </div>
                                        <div className="flex items-center gap-1.5 p-1 bg-gray-100/50 dark:bg-black/20 rounded-xl border border-gray-200/50 dark:border-white/5">
                                            <button
                                                onClick={() => setCurrentPage(1)}
                                                disabled={currentPage === 1}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-white/5 disabled:opacity-20 transition-all text-slate-500"
                                            >
                                                <ChevronsLeft size={16} />
                                            </button>
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                disabled={currentPage === 1}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-white/5 disabled:opacity-20 transition-all text-slate-500"
                                            >
                                                <ChevronLeft size={16} />
                                            </button>
                                            <div className="flex items-center gap-1 px-2">
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
                                                            className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${
                                                                currentPage === pageNum
                                                                    ? 'bg-indigo-600 text-white shadow-lg'
                                                                    : 'hover:bg-white dark:hover:bg-white/5 text-slate-500'
                                                            }`}
                                                        >
                                                            {pageNum}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                disabled={currentPage === totalPages}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-white/5 disabled:opacity-20 transition-all text-slate-500"
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                            <button
                                                onClick={() => setCurrentPage(totalPages)}
                                                disabled={currentPage === totalPages}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-white/5 disabled:opacity-20 transition-all text-slate-500"
                                            >
                                                <ChevronsRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </MainLayout>
    );
};

export default EnrollmentListPage;
