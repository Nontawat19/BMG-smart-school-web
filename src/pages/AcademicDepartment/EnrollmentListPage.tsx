import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { firestore as db } from "../../firebase";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
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
import Select from "react-select";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { isStudyingStudent } from "@/utils/studentStatusUtils";

// Premium Dark mode styles for react-select (Same as other pages)
const compactSelectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg, #f8fafc)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border, #e2e8f0)',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.1)' : 'none',
        borderRadius: '1rem',
        padding: '0 4px',
        fontSize: '13px',
        minHeight: '44px',
        height: '44px',
        '&:hover': {
            borderColor: '#6366f1'
        },
        cursor: 'pointer',
        transition: 'all 0.2s ease'
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 8px',
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '1.25rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        padding: '8px',
        border: '1px solid var(--select-border, #f1f5f9)',
        zIndex: 100,
        overflow: 'hidden',
        width: 'max-content',
        minWidth: '100%'
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected 
            ? '#6366f1' 
            : state.isFocused 
                ? 'rgba(99, 102, 241, 0.08)' 
                : 'transparent',
        color: state.isSelected ? '#ffffff' : 'var(--select-text, #475569)',
        borderRadius: '0.75rem',
        margin: '2px 0',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: state.isSelected ? '700' : '500',
        padding: '10px 12px',
        whiteSpace: 'nowrap',
        '&:active': {
            backgroundColor: '#6366f1'
        }
    }),
    singleValue: (base: any) => ({ 
        ...base, 
        color: 'var(--select-text, #1e293b)', 
        fontWeight: '700',
        whiteSpace: 'nowrap'
    }),
    menuList: (base: any) => ({
        ...base,
        maxHeight: '800px', 
        padding: '4px',
        overflow: 'hidden', // Remove native scrollbar
        '::-webkit-scrollbar': {
            display: 'none' // Hide scrollbar for webkit
        },
        msOverflowStyle: 'none', // IE/Edge
        scrollbarWidth: 'none' // Firefox
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base: any) => ({
        ...base,
        color: '#94a3b8'
    })
};

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
    courseCategory?: string;
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
    category?: string;
}

const EnrollmentListPage: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { user } = useSelector((state: RootState) => state.auth);
    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
    const { currentAcademicYear: schoolYear, availableClassOptions, classKeys } = useSelector((state: RootState) => state.schoolSettings);
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
    const [subjectGroups, setSubjectGroups] = useState<any[]>([]);
    const [categoryFilter, setCategoryFilter] = useState("ทั้งหมด");
    const [subjectGroupFilter, setSubjectGroupFilter] = useState("ทั้งหมด");

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
            dispatch(fetchTeachersMap(schoolId));
            fetchEnrollments();
            
            const fetchExtraData = async () => {
                // School Info
                const schoolRef = doc(db, 'school-settings', schoolId);
                const schoolSnap = await getDoc(schoolRef);
                if (schoolSnap.exists()) setSchoolInfo(schoolSnap.data());

                // Subject Groups
                const groupsRef = collection(db, 'school-settings', schoolId, 'subject_groups');
                const groupsSnap = await getDocs(groupsRef);
                const fetchedGroups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                fetchedGroups.sort((a: any, b: any) => (parseInt(a.code) || 99) - (parseInt(b.code) || 99));
                setSubjectGroups(fetchedGroups);
            };
            fetchExtraData();
        }
    }, [schoolId, dispatch]);

    const fetchEnrollments = async () => {
        setLoading(true);
        try {
            const enrollRef = collection(db, 'school-settings', schoolId!, 'enrollments');
            const coursesRef = collection(db, 'school-settings', schoolId!, 'courses');
            const studentsRef = collection(db, 'school-settings', schoolId!, 'students');
            const assignmentsRef = collection(db, 'school-settings', schoolId!, 'course_assignments');
            
            const [enrollSnap, courseSnap, studentSnap, assignmentSnap, teacherSnap, roomSnap] = await Promise.all([
                getDocs(enrollRef),
                getDocs(coursesRef),
                getDocs(studentsRef),
                getDocs(assignmentsRef),
                getDocs(collection(db, 'school-settings', schoolId!, 'teachers')),
                getDocs(collection(db, 'school-settings', schoolId!, 'physical-rooms'))
            ]);

            const cMap: Record<string, Course> = {};
            courseSnap.docs.forEach(doc => {
                cMap[doc.id] = { id: doc.id, ...doc.data() } as Course;
            });

            const sMap: Record<string, any> = {};
            studentSnap.docs.forEach(doc => {
                const s = { id: doc.id, ...doc.data() };
                if (isStudyingStudent(s)) sMap[doc.id] = s;
            });

            // Map teachers by id
            const localTeacherMap: Record<string, string> = {};
            teacherSnap.docs.forEach(doc => {
                const data = doc.data();
                localTeacherMap[doc.id] = `${data.title || ''}${data.firstName || ''} ${data.lastName || ''}`.trim();
            });

            // Map rooms by id to get their code/name
            const roomMap: Record<string, string> = {};
            roomSnap.docs.forEach(doc => {
                const data = doc.data();
                roomMap[doc.id] = data.roomCode || data.roomName || "";
            });

            // Map assignments by courseId_academicYear_semester
            const aMap: Record<string, any[]> = {};
            assignmentSnap.docs.forEach(doc => {
                const data = doc.data();
                const key = `${data.courseId}_${data.academicYear}_${data.semester}`;
                aMap[key] = data.teacherAssignments || [];
            });

            const data = enrollSnap.docs.map(doc => {
                const d = doc.data();
                const relatedCourse = cMap[d.courseId];
                const relatedStudent = sMap[d.studentId];

                if (!relatedCourse || !relatedStudent) return null;

                const enrollmentYear = d.academicYear || activeYear;
                const enrollmentSemester = d.semester || activeSemester;

                let computedTeacherName = "";
                const studentRoom = relatedStudent.room;
                const studentLevel = relatedStudent.classLevel;
                const foundTeacherIds = new Set<string>();

                // 1. Check specialized assignments for this semester
                const assignmentKey = `${d.courseId}_${enrollmentYear}_${enrollmentSemester}`;
                const semesterAssignments = aMap[assignmentKey] || [];
                
                if (semesterAssignments.length > 0) {
                    semesterAssignments.forEach(assign => {
                        const matchRoom = assign.roomIds && (
                            assign.roomIds.includes(studentRoom) || 
                            assign.roomIds.some((rid: string) => roomMap[rid] === studentRoom)
                        );
                        const matchLevel = assign.classLevels && assign.classLevels.includes(studentLevel);
                        const matchGroup = assign.groupNumber ? (
                            d.groupName === `กลุ่ม ${assign.groupNumber}` || 
                            d.groupName === String(assign.groupNumber) ||
                            d.groupNum === assign.groupNumber ||
                            d.groupNum === String(assign.groupNumber)
                        ) : false;

                        if (matchRoom || matchLevel || matchGroup) {
                            foundTeacherIds.add(assign.teacherId);
                        }
                    });
                }

                // 2. Fallback to legacy assignments on course document if none found
                if (foundTeacherIds.size === 0 && relatedCourse.teacherAssignments && relatedCourse.teacherAssignments.length > 0) {
                    relatedCourse.teacherAssignments.forEach(assign => {
                        const matchRoom = assign.roomIds && (
                            assign.roomIds.includes(studentRoom) || 
                            assign.roomIds.some((rid: string) => roomMap[rid] === studentRoom)
                        );
                        const matchLevel = assign.classLevels && assign.classLevels.includes(studentLevel);
                        const matchGroup = assign.groupNumber ? (
                            d.groupName === `กลุ่ม ${assign.groupNumber}` || 
                            d.groupName === String(assign.groupNumber) ||
                            d.groupNum === assign.groupNumber ||
                            d.groupNum === String(assign.groupNumber)
                        ) : false;

                        if (matchRoom || matchLevel || matchGroup) {
                            foundTeacherIds.add(assign.teacherId);
                        }
                    });
                }

                // 3. Fallback to global teacherIds if still none found
                if (foundTeacherIds.size === 0) {
                    if (relatedCourse.teacherIds && relatedCourse.teacherIds.length > 0) {
                        relatedCourse.teacherIds.forEach(id => foundTeacherIds.add(id));
                    } else if (relatedCourse.teacherId) {
                        foundTeacherIds.add(relatedCourse.teacherId);
                    }
                }

                if (foundTeacherIds.size > 0) {
                    const names = Array.from(foundTeacherIds).map(tid => localTeacherMap[tid]).filter(Boolean);
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
                    courseCategory: relatedCourse.category || "พื้นฐาน",
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

    const dynamicLevelOptions = useMemo(() => {
        const options = [{ value: 'ทั้งหมด', label: 'ทุกระดับชั้น' }];
        
        availableClassOptions.forEach(([key, label]) => {
            options.push({ value: key, label });
        });

        // Add Groups if they exist
        const hasJunior = classKeys.some(k => ['m1', 'm2', 'm3'].includes(k));
        const hasSenior = classKeys.some(k => ['m4', 'm5', 'm6'].includes(k));

        if (hasJunior) options.push({ value: 'junior_high', label: 'ม.ต้น' });
        if (hasSenior) options.push({ value: 'senior_high', label: 'ม.ปลาย' });

        return options;
    }, [availableClassOptions, classKeys]);

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
            const matchCategory = categoryFilter === "ทั้งหมด" || e.courseCategory === categoryFilter;
            const matchSubjGroup = subjectGroupFilter === "ทั้งหมด" || e.subjectGroup === subjectGroupFilter;

            const dataSemester = (e as any).semester || '1';
            const dataYear = (e as any).academicYear || activeYear;

            return matchSearch && matchLevel && matchCourse && matchTeacher && matchGroup && matchCategory && matchSubjGroup && (dataSemester === activeSemester) && (dataYear === activeYear);
        });
    }, [enrollments, searchTerm, levelFilter, courseFilter, teacherFilter, groupFilter, categoryFilter, subjectGroupFilter, activeSemester, activeYear]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentStudents = filteredData.slice(indexOfFirstItem, indexOfLastItem);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, levelFilter, courseFilter, teacherFilter, groupFilter, categoryFilter, subjectGroupFilter, activeSemester, activeYear]);

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white transition-colors duration-300">
                <div className="w-full pl-12 pr-2 sm:pl-14 sm:pr-4 md:pl-16 md:pr-6 py-4 sm:py-6 lg:py-8">
                    <header className="mb-6 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div className="flex items-center gap-4">
                                <BackButton to="/academic/hub/registration" />
                                <div className="flex flex-col">
                                    <h1 className="text-lg sm:text-xl font-black text-black dark:text-white leading-none">สรุปรายชื่อการลงทะเบียน</h1>
                                    <p className="text-[9px] text-black/60 dark:text-white/60 font-bold mt-1 uppercase tracking-wider">
                                        แสดงข้อมูลการลงทะเบียนรายวิชาแยกตามระดับชั้นและกลุ่มเรียนในภาคเรียนปัจจุบัน
                                    </p>
                                </div>
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
                                <Select
                                    options={[
                                        { value: '1', label: 'ภาคเรียนที่ 1' },
                                        { value: '2', label: 'ภาคเรียนที่ 2' }
                                    ]}
                                    value={[
                                        { value: '1', label: 'ภาคเรียนที่ 1' },
                                        { value: '2', label: 'ภาคเรียนที่ 2' }
                                    ].find(opt => opt.value === activeSemester)}
                                    onChange={(opt: any) => setActiveSemester(opt.value)}
                                    styles={compactSelectStyles}
                                    isSearchable={false}
                                />
                                <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs h-full">
                                    <Users size={14} />
                                    <span>พบ {filteredData.length} รายการ</span>
                                </div>
                            </div>
                        </div>
                    </header>

                    <div className="bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-xl rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-xl shadow-indigo-500/5 p-6 mb-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 uppercase tracking-[0.1em] ml-1">ระดับชั้น</label>
                                <Select
                                    options={dynamicLevelOptions}
                                    value={dynamicLevelOptions.find(opt => opt.value === levelFilter)}
                                    onChange={(opt: any) => setLevelFilter(opt.value)}
                                    styles={compactSelectStyles}
                                    isSearchable={false}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 uppercase tracking-[0.1em] ml-1">ประเภทวิชา</label>
                                <Select
                                    options={[
                                        { value: 'ทั้งหมด', label: 'ทุกประเภทวิชา' },
                                        { value: 'พื้นฐาน', label: 'วิชาพื้นฐาน' },
                                        { value: 'เพิ่มเติม', label: 'วิชาเพิ่มเติม' }
                                    ]}
                                    value={[
                                        { value: 'ทั้งหมด', label: 'ทุกประเภทวิชา' },
                                        { value: 'พื้นฐาน', label: 'วิชาพื้นฐาน' },
                                        { value: 'เพิ่มเติม', label: 'วิชาเพิ่มเติม' }
                                    ].find(opt => opt.value === categoryFilter)}
                                    onChange={(opt: any) => setCategoryFilter(opt.value)}
                                    styles={compactSelectStyles}
                                    isSearchable={false}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 uppercase tracking-[0.1em] ml-1">กลุ่มสาระ</label>
                                <Select
                                    options={[{ value: 'ทั้งหมด', label: 'ทุกกลุ่มสาระ' }, ...subjectGroups.map(g => ({ value: g.id || g.name, label: g.name }))]}
                                    value={[{ value: 'ทั้งหมด', label: 'ทุกกลุ่มสาระ' }, ...subjectGroups.map(g => ({ value: g.id || g.name, label: g.name }))].find(opt => opt.value === subjectGroupFilter)}
                                    onChange={(opt: any) => setSubjectGroupFilter(opt.value)}
                                    styles={compactSelectStyles}
                                    isSearchable={true}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 uppercase tracking-[0.1em] ml-1">กลุ่มเรียน</label>
                                <Select
                                    options={groups.map(g => ({ value: g, label: g === 'ทั้งหมด' ? 'ทั้งหมด' : g.replace(/[^0-9]/g, '') || g }))}
                                    value={groups.map(g => ({ value: g, label: g === 'ทั้งหมด' ? 'ทั้งหมด' : g.replace(/[^0-9]/g, '') || g })).find(opt => opt.value === groupFilter)}
                                    onChange={(opt: any) => setGroupFilter(opt.value)}
                                    styles={compactSelectStyles}
                                    isSearchable={true}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 uppercase tracking-[0.1em] ml-1">รายวิชา</label>
                                <Select
                                    options={courses.map(c => ({ value: c, label: c === 'ทั้งหมด' ? 'ทุกรายวิชา' : c }))}
                                    value={courses.map(c => ({ value: c, label: c === 'ทั้งหมด' ? 'ทุกรายวิชา' : c })).find(opt => opt.value === courseFilter)}
                                    onChange={(opt: any) => setCourseFilter(opt.value)}
                                    styles={compactSelectStyles}
                                    isSearchable={true}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400/50 uppercase tracking-[0.1em] ml-1">ครูผู้สอน</label>
                                <Select
                                    options={teachers.map(t => ({ value: t, label: t === 'ทั้งหมด' ? 'ครูทุกคน' : t }))}
                                    value={teachers.map(t => ({ value: t, label: t === 'ทั้งหมด' ? 'ครูทุกคน' : t })).find(opt => opt.value === teacherFilter)}
                                    onChange={(opt: any) => setTeacherFilter(opt.value)}
                                    styles={compactSelectStyles}
                                    isSearchable={true}
                                />
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
                                            <th scope="col" className="py-4 px-3 text-left text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest" style={{ paddingLeft: '10%' }}>ครูผู้สอน</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
                                        <AnimatePresence>
                                            {loading ? (
                                                [...Array(8)].map((_, i) => (
                                                    <tr key={`skeleton-${i}`}>
                                                        <td className="whitespace-nowrap py-4 pl-6 pr-3"><div className="h-4 w-6 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                        <td className="whitespace-nowrap py-4 px-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                                                                <div className="flex flex-col gap-1.5">
                                                                    <div className="h-3.5 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                                                                    <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="whitespace-nowrap py-4 px-3"><div className="h-3.5 w-28 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                        <td className="whitespace-nowrap py-4 px-3 text-center"><div className="h-3.5 w-10 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                        <td className="whitespace-nowrap py-4 px-3" style={{ paddingLeft: '10%' }}><div className="h-3.5 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                    </tr>
                                                ))
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
                                                                <ProfileAvatar
                                                                    className="h-9 w-9 border border-gray-100 dark:border-gray-700"
                                                                    src={`https://ui-avatars.com/api/?name=${e.studentName}&background=random&color=fff`}
                                                                />
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
                                                                    {e.courseCode} {e.courseTitle}
                                                                </span>
                                                                <span className="text-[10px] text-indigo-500 font-bold uppercase">
                                                                    {e.courseCategory} | {e.subjectGroup}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="whitespace-nowrap py-4 px-3 text-center">
                                                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-bold text-xs">
                                                                {e.groupName.replace(/[^0-9]/g, '') || e.groupName}
                                                            </span>
                                                        </td>
                                                        <td className="whitespace-nowrap py-4 px-3" style={{ paddingLeft: '10%' }}>
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
