import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from "react-dom";
import {
    Search,
    BookOpen,
    MapPin,
    GraduationCap,
    Check,
    X,
    ChevronDown,
    UserCircle,
    LayoutGrid,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import Swal from 'sweetalert2';

// --- Configuration from ImportCoursePage ---
const CLASS_MAPPING: Record<string, string> = {
    k1: 'อ.1', k2: 'อ.2', k3: 'อ.3',
    p1: 'ป.1', p2: 'ป.2', p3: 'ป.3',
    p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
    m1: 'ม.1', m2: 'ม.2', m3: 'ม.3',
    m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
};

// --- Interfaces ---
interface Course {
    id: string;
    title: string;
    code: string;
    type: string;
    semester?: string;
    teacherId?: string;
    teacherIds?: string[];
    capacity?: number;
    roomIds?: string[];
    classLevels?: string[];
    // Fields from Firestore (ImportCoursePage)
    classId?: string | string[];
    room?: string | string[];

    isCombined?: boolean;
    teacherAssignments?: {
        teacherId: string;
        classLevels: string[];
        roomIds: string[];
    }[];
}

interface CourseListProps {
    courses: Course[];
    selectedCourses: string[];
    onToggleCourse: (id: string) => void;
    courseSearch: string;
    setCourseSearch: (s: string) => void;
    typeFilter: string;
    setTypeFilter: (s: string) => void;
    teacherMap: any;
    enrollmentCounts: Record<string, number>;
    onUpdateTeacher: (courseId: string, teacherIds: string[], assignments?: any[]) => void;
    onUpdateCapacity: (courseId: string, capacity: number) => void;
    onUpdateRooms: (courseId: string, roomIds: string[], teacherId?: string) => void;
    onUpdateClassLevels: (courseId: string, classLevels: string[], teacherId?: string) => void;
    onToggleCombined: (courseId: string, isCombined: boolean) => void;
    availableRooms: string[];
    availableClassLevels: string[];
    teacherMapStatus?: string;
    subjectGroups: { id: string, name: string, code: string }[];
    activeSubjectGroup: string;
    setActiveSubjectGroup: (g: string) => void;
    groupedCourses?: { name: string, courses: Course[], code?: string }[];
}


// --- Smart Dropdown Component ---
interface DropdownSelectProps {
    value: string;
    onChange: (val: string) => void;
    options: string[];
    placeholder: string;
}

const DropdownSelect: React.FC<DropdownSelectProps> = ({ value, onChange, options, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState<{
        left: number;
        width: number;
        top?: number;
        bottom?: number;
        placement: 'top' | 'bottom';
        maxHeight: number;
    }>({ left: 0, width: 0, placement: 'bottom', maxHeight: 300 });
    const containerRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;

            // Decide placement based on available space
            // Default to bottom. Switch to top if space below is tight (< 250px) AND there is more space above.
            const placement = (spaceBelow < 250 && spaceAbove > spaceBelow) ? 'top' : 'bottom';

            // Calculate dynamic max height to fit screen but not be too huge
            const availableSpace = placement === 'bottom' ? spaceBelow : spaceAbove;
            const maxHeight = Math.min(availableSpace - 16, 500); // 16px padding, cap at 500px

            setCoords({
                left: rect.left,
                width: rect.width,
                placement,
                top: rect.bottom + 6,
                bottom: viewportHeight - rect.top + 6,
                maxHeight
            });
        }
    };

    const handleToggle = () => {
        if (!isOpen) {
            updatePosition();
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    // Close on scroll or resize to prevent detached UI
    useEffect(() => {
        const handleScrollOrResize = () => {
            if (isOpen) setIsOpen(false);
        };

        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);

        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // We can't easily check 'contains' for portal content vs container separately without refs to both.
            // Simplest is to rely on the backdrop or check if target is inside the portal content.
            // Since we use a portal, we can just use a transparent fixed backdrop to catch clicks.
        };
        // Simplified: The portal will include a backdrop div for clicking outside.
    }, [isOpen]);

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={handleToggle}
                className="w-full flex items-center justify-between pl-3 pr-3 py-2 text-[10px] font-black bg-gray-100/80 dark:bg-gray-800/50 border border-transparent hover:border-indigo-500/30 rounded-xl text-gray-700 dark:text-gray-300 transition-all outline-none"
            >
                <div className="flex items-center gap-2">
                    <LayoutGrid size={14} className="text-gray-400" />
                    <span>{value === "ทั้งหมด" ? `${placeholder}: ทั้งหมด` : value}</span>
                </div>
                <ChevronDown size={12} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex flex-col" onClick={() => setIsOpen(false)}>
                    {/* Transparent Backdrop */}
                    <div className="absolute inset-0 bg-transparent" />

                    {/* Dropdown Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: coords.placement === 'top' ? 10 : -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: coords.placement === 'top' ? 10 : -10 }}
                        style={{
                            position: 'fixed',
                            left: coords.left,
                            width: coords.width,
                            top: coords.placement === 'bottom' ? coords.top : undefined,
                            bottom: coords.placement === 'top' ? coords.bottom : undefined,
                        }}
                        className="bg-white dark:bg-[#2a2b2f] border border-gray-100 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                    >
                        <div
                            className="overflow-y-auto p-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
                            style={{ maxHeight: coords.maxHeight }}
                        >
                            <button
                                onClick={() => {
                                    onChange("ทั้งหมด");
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-[10px] font-bold transition-colors ${value === "ทั้งหมด" ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                            >
                                ทั้งหมด
                            </button>
                            {options.map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => {
                                        onChange(opt);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-[10px] font-bold transition-colors ${value === opt ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}
        </div>
    );
};

const CourseList: React.FC<CourseListProps> = ({
    courses,
    selectedCourses,
    onToggleCourse,
    courseSearch,
    setCourseSearch,
    typeFilter,
    setTypeFilter,
    teacherMap,
    enrollmentCounts,
    onUpdateTeacher,
    onUpdateCapacity,
    onUpdateRooms,
    onUpdateClassLevels,
    onToggleCombined,
    availableRooms,
    availableClassLevels,
    teacherMapStatus,
    subjectGroups,
    activeSubjectGroup,
    setActiveSubjectGroup,
    groupedCourses
}) => {
    // --- Computed ---
    const teachersList = useMemo(() => Object.values(teacherMap || {}).map((t: any) => ({
        id: t.id,
        name: t.name,
<<<<<<< HEAD
        subjectGroup: t.subjectGroup || t.learningArea || "ทั่วไป"
=======
        subjectGroup: t.subjectGroup || "ทั่วไป"
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    })), [teacherMap]);

    // --- Pagination ---
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Reset page when filters change (implicitly when courses prop changes)
    useEffect(() => {
        setCurrentPage(1);
    }, [courses]);

    const totalPages = Math.ceil(courses.length / itemsPerPage);
    const paginatedCourses = courses.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#1e1f21]">
            {/* Header / Search */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 space-y-3 bg-white/50 dark:bg-[#1e1f21]/50 backdrop-blur-md sticky top-0 z-20">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={16} />
                    <input
                        type="text"
                        placeholder="Search courses..."
                        value={courseSearch}
                        onChange={(e) => setCourseSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                </div>

                <div className="flex gap-2 table-responsive pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    {["ทั้งหมด", "พื้นฐาน", "เพิ่มเติม", "กิจกรรม", "T", "G"].map(type => (
                        <button
                            key={type}
                            onClick={() => setTypeFilter(type)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border ${typeFilter === type
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                {/* Subject Group Premium Custom Select */}
                <div className="relative">
                    <DropdownSelect
                        value={activeSubjectGroup}
                        onChange={setActiveSubjectGroup}
                        options={subjectGroups.map(g => g.name)}
                        placeholder="กลุ่มสาระการเรียนรู้"
                    />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
                    <span>Found {courses.length} courses</span>
                    {selectedCourses.length > 0 && (
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                            Selected {selectedCourses.length}
                        </span>
                    )}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/30 dark:bg-[#131417]/50 backdrop-blur-sm">
                {courses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 opacity-50 p-8 text-center">
                        <BookOpen size={48} className="mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest">ไม่พบรายวิชาที่ค้นหา</p>
                    </div>
                ) : groupedCourses ? (
                    <div className="space-y-6 p-4">
                        {groupedCourses.map((group) => (
                            <div key={group.name} className="space-y-3">
                                <div className="sticky top-0 z-10 bg-gray-50/80 dark:bg-[#131417]/80 backdrop-blur-md py-2 flex items-center gap-2 border-b border-gray-200/50 dark:border-white/5">
                                    <div className="w-1.5 h-4 bg-indigo-600 rounded-full shadow-lg shadow-indigo-500/40" />
                                    <h4 className="text-[10px] font-black text-gray-800 dark:text-gray-200 uppercase tracking-widest flex items-center gap-2">
                                        {group.name}
                                        {group.code && <span className="text-[9px] text-gray-400 font-mono">({group.code})</span>}
                                        <span className="ml-auto bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full text-[9px] text-gray-500">
                                            {group.courses.length} วิชา
                                        </span>
                                    </h4>
                                </div>
                                <div className="space-y-2.5">
                                    {group.courses.map(course => (
                                        <CourseCard
                                            key={course.id}
                                            course={course}
                                            isSelected={selectedCourses.includes(course.id)}
                                            onToggle={() => onToggleCourse(course.id)}
                                            teacherMap={teacherMap}
                                            enrollmentCount={enrollmentCounts[course.id] || 0}
                                            teachersList={teachersList}
                                            availableRooms={availableRooms}
                                            availableClassLevels={availableClassLevels}
                                            onUpdateTeacher={onUpdateTeacher}
                                            onUpdateCapacity={onUpdateCapacity}
                                            onUpdateRooms={onUpdateRooms}
                                            onUpdateClassLevels={onUpdateClassLevels}
                                            onToggleCombined={onToggleCombined}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-4 space-y-3">
                        {paginatedCourses.map(course => (
                            <CourseCard
                                key={course.id}
                                course={course}
                                isSelected={selectedCourses.includes(course.id)}
                                onToggle={() => onToggleCourse(course.id)}
                                teacherMap={teacherMap}
                                enrollmentCount={enrollmentCounts[course.id] || 0}
                                teachersList={teachersList}
                                availableRooms={availableRooms}
                                availableClassLevels={availableClassLevels}
                                onUpdateTeacher={onUpdateTeacher}
                                onUpdateCapacity={onUpdateCapacity}
                                onUpdateRooms={onUpdateRooms}
                                onUpdateClassLevels={onUpdateClassLevels}
                                onToggleCombined={onToggleCombined}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination Controls - Fixed Bottom */}
            {totalPages > 1 && courses.length > 0 && (
                <div className="flex-shrink-0 p-2 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e1f21] flex items-center justify-center gap-2 z-20">
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-400"
                    >
                        <ChevronLeft size={18} />
                    </button>

                    <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let startPage = Math.max(1, currentPage - 2);
                            if (startPage + 4 > totalPages) {
                                startPage = Math.max(1, totalPages - 4);
                            }
                            const pageNum = startPage + i;

                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => handlePageChange(pageNum)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === pageNum
                                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-400"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
};

// --- Sub-component: Course Card ---
interface CourseCardProps {
    course: Course;
    isSelected: boolean;
    onToggle: () => void;
    teacherMap: any;
    enrollmentCount: number;
    teachersList: any[];
    availableRooms: string[];
    availableClassLevels: string[];
    onUpdateTeacher: (id: string, tIds: string[]) => void;
    onUpdateCapacity: (id: string, cap: number) => void;
    onUpdateRooms: (id: string, rIds: string[]) => void;
    onUpdateClassLevels: (id: string, lIds: string[]) => void;
    onToggleCombined: (id: string, val: boolean) => void;
}

const CourseCard: React.FC<CourseCardProps> = ({
    course,
    isSelected,
    onToggle,
    teacherMap,
    enrollmentCount,
    teachersList,
    availableRooms,
    availableClassLevels,
    onUpdateTeacher,
    onUpdateCapacity,
    onUpdateRooms,
    onUpdateClassLevels,
    onToggleCombined
}) => {
    const [editMode, setEditMode] = useState<'teacher' | 'room' | 'level' | null>(null);

    // Helpers
    const getTeacherName = (tid: string) => teacherMap[tid]?.name || "Unknown";
    const assignedTeacherIds = useMemo(() => {
        let ids: string[] = [];
        if (course.teacherIds && Array.isArray(course.teacherIds)) {
            ids = course.teacherIds;
        } else if (course.teacherId) {
            ids = [course.teacherId];
        }
        // Filter empty IDs and IDs that don't exist in the teacher list
        return ids.filter(id => id && id.trim() !== "" && teacherMap[id]);
    }, [course.teacherIds, course.teacherId, teacherMap]);

    // Map classLevels correctly: Check field 'classLevels' first, then 'classId' (Import saves as classId)
    const assignedClassLevels = useMemo(() => {
        if (course.classLevels && course.classLevels.length > 0) return course.classLevels;
        if (course.classId) {
            return Array.isArray(course.classId) ? course.classId : [course.classId];
        }
        return [];
    }, [course]);

    // Map rooms correctly: Check field 'roomIds' first, then 'room' (Import saves as room)
    const assignedRooms = useMemo(() => {
        if (course.roomIds && course.roomIds.length > 0) return course.roomIds;
        if (course.room) {
            const r = Array.isArray(course.room) ? course.room : [course.room];
            return r;
        }
        return [];
    }, [course]);

    // Helper to format class levels
    const formatClassLevel = (level: string) => CLASS_MAPPING[level] || level;

    const handleSaveTeacher = (newIds: string[]) => {
        onUpdateTeacher(course.id, newIds);
        setEditMode(null);
    };

    const handleSaveRooms = (newRooms: string[]) => {
        onUpdateRooms(course.id, newRooms);
        setEditMode(null);
    };

    const handleSaveLevels = (newLevels: string[]) => {
        onUpdateClassLevels(course.id, newLevels);
        setEditMode(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative rounded-xl border transition-all duration-200 ${isSelected
                ? "bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-500/30 shadow-md shadow-indigo-100 dark:shadow-none"
                : "bg-white dark:bg-[#1e1f21] border-gray-200 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-500/30 shadow-sm"
                } ${editMode ? 'z-30' : ''}`}
        >
            <div className="p-3">
                <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div
                        onClick={onToggle}
                        className={`mt-1 w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer flex-shrink-0 transition-all ${isSelected
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-transparent hover:border-indigo-400"
                            }`}
                    >
                        <Check size={12} strokeWidth={3} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        {/* Title Row */}
                        <div className="flex justify-between items-start mb-1">
                            <div onClick={onToggle} className="cursor-pointer">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                                    {course.code}
                                </h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400 truncate pr-2" title={course.title}>
                                    {course.title}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Label "สอนรวม" */}
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold hidden sm:inline-block whitespace-nowrap">
                                    สอนรวม
                                </span>

                                {/* Toggle Combined Class */}
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleCombined(course.id, !course.isCombined);
                                    }}
                                    className={`relative w-9 h-5 rounded-full cursor-pointer transition-all duration-300 ease-in-out border ${course.isCombined
                                        ? 'bg-indigo-500 border-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]'
                                        : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                                        }`}
                                    title={course.isCombined ? "ปิดโหมดสอนรวม" : "เปิดโหมดสอนรวม"}
                                >
                                    <div
                                        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transform transition-transform duration-300 cubic-bezier(0.4, 0.0, 0.2, 1) ${course.isCombined ? 'translate-x-4' : 'translate-x-0'
                                            }`}
                                    />
                                </div>

                                {/* Full Course Type Badge */}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide whitespace-nowrap flex-shrink-0 ${course.type === 'พื้นฐาน' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                    course.type === 'เพิ่มเติม' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                                        course.type === 'กิจกรรม' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                    }`}>
                                    {course.type || "ทั่วไป"}
                                </span>
                            </div>
                        </div>

                        {/* Details Row */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            {/* Teacher */}
                            <div className="relative group/edit">
                                <div
                                    onClick={() => setEditMode('teacher')}
                                    title={assignedTeacherIds.length > 0 ? assignedTeacherIds.map(tid => getTeacherName(tid)).join(', ') : "ยังไม่มีครูผู้สอน"}
                                    className={`flex items-center gap-1.5 text-[11px] font-medium border px-2.5 py-1 rounded-md cursor-pointer transition-all ${assignedTeacherIds.length > 0
                                        ? "text-gray-600 dark:text-indigo-200 bg-gray-100 dark:bg-indigo-500/20 border-gray-200 dark:border-indigo-500/30 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 dark:hover:bg-indigo-500/30 dark:hover:text-indigo-100"
                                        : "text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
                                        }`}
                                >
                                    <UserCircle size={13} strokeWidth={2.5} />
                                    <span>
                                        {assignedTeacherIds.length} คน
                                    </span>
                                </div>
                            </div>

                            {/* Level Dropdown - Conditional */}
                            {course.isCombined ? (
                                <div className="relative group/level">
                                    <div
                                        onClick={() => setEditMode(editMode === 'level' ? null : 'level')}
                                        className="relative appearance-none pl-7 pr-6 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-all outline-none focus:ring-1 focus:ring-indigo-500 min-w-[90px]"
                                    >
                                        <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <GraduationCap size={13} strokeWidth={2.5} className="text-gray-500 dark:text-indigo-300" />
                                        </div>
                                        <span className={`truncate block ${assignedClassLevels.length === 0 ? 'text-gray-500 dark:text-gray-400' : ''}`}>
                                            {assignedClassLevels.length > 0
                                                ? `${assignedClassLevels.length} ระดับ`
                                                : "ชั้นเรียน"}
                                        </span>
                                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronDown size={10} className="text-gray-400 group-hover/level:text-indigo-500" />
                                        </div>
                                    </div>

                                    {editMode === 'level' && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setEditMode(null)} />
                                            <div className="absolute top-full left-0 mt-1 min-w-full w-max max-h-60 overflow-y-auto bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-20 p-1">
                                                <div className="sticky top-0 bg-white dark:bg-[#2a2b2f] border-b border-gray-100 dark:border-gray-700 p-1 mb-1">
                                                    <label className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={assignedClassLevels.length === availableClassLevels.length}
                                                            onChange={(e) => {
                                                                if (e.target.checked) handleSaveLevels(availableClassLevels);
                                                                else handleSaveLevels([]);
                                                            }}
                                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                                        />
                                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">เลือกทั้งหมด</span>
                                                    </label>
                                                </div>
                                                {availableClassLevels.map(l => (
                                                    <label key={l} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={assignedClassLevels.includes(l)}
                                                            onChange={(e) => {
                                                                const newLevels = e.target.checked
                                                                    ? [...assignedClassLevels, l]
                                                                    : assignedClassLevels.filter(x => x !== l);
                                                                handleSaveLevels(newLevels);
                                                            }}
                                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                                        />
                                                        <span className="text-xs text-gray-700 dark:text-gray-200">{formatClassLevel(l)}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="relative group/level">
                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <GraduationCap size={13} strokeWidth={2.5} className="text-gray-500 dark:text-indigo-300" />
                                    </div>
                                    <select
                                        value={assignedClassLevels.length > 0 ? assignedClassLevels[0] : ""}
                                        onChange={(e) => {
                                            const l = e.target.value;
                                            if (l) handleSaveLevels([l]);
                                        }}
                                        className="appearance-none pl-7 pr-6 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-all outline-none focus:ring-1 focus:ring-indigo-500 min-w-[90px]"
                                    >
                                        <option value="" disabled className="bg-white dark:bg-[#2a2b2f] text-gray-400 dark:text-gray-500">ชั้นเรียน</option>
                                        {availableClassLevels.map(l => (
                                            <option key={l} value={l} className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-gray-100">
                                                {formatClassLevel(l)}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <ChevronDown size={10} className="text-gray-400 group-hover/level:text-indigo-500" />
                                    </div>
                                </div>
                            )}

                            {/* Room Dropdown - Conditional */}
                            {course.isCombined ? (
                                <div className="relative group/room">
                                    <div
                                        onClick={() => setEditMode(editMode === 'room' ? null : 'room')}
                                        className="relative appearance-none pl-7 pr-6 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-all outline-none focus:ring-1 focus:ring-indigo-500 min-w-[90px]"
                                    >
                                        <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <MapPin size={13} strokeWidth={2.5} className="text-gray-500 dark:text-indigo-300" />
                                        </div>
                                        <span className={`truncate block ${assignedRooms.length === 0 ? 'text-gray-500 dark:text-gray-400' : ''}`}>
                                            {assignedRooms.length > 0
                                                ? `${assignedRooms.length} ห้อง`
                                                : "เลือกห้อง"}
                                        </span>
                                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ChevronDown size={10} className="text-gray-400 group-hover/room:text-indigo-500" />
                                        </div>
                                    </div>

                                    {editMode === 'room' && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setEditMode(null)} />
                                            <div className="absolute top-full right-0 mt-1 min-w-full w-max max-h-60 overflow-y-auto bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-20 p-1">
                                                <div className="sticky top-0 bg-white dark:bg-[#2a2b2f] border-b border-gray-100 dark:border-gray-700 p-1 mb-1">
                                                    <label className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={assignedRooms.length === availableRooms.length}
                                                            onChange={(e) => {
                                                                if (e.target.checked) handleSaveRooms(availableRooms);
                                                                else handleSaveRooms([]);
                                                            }}
                                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                                        />
                                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">เลือกทั้งหมด</span>
                                                    </label>
                                                </div>
                                                {availableRooms.map(r => (
                                                    <label key={r} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={assignedRooms.includes(r)}
                                                            onChange={(e) => {
                                                                const newRooms = e.target.checked
                                                                    ? [...assignedRooms, r]
                                                                    : assignedRooms.filter(x => x !== r);
                                                                handleSaveRooms(newRooms);
                                                            }}
                                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                                        />
                                                        <span className="text-xs text-gray-700 dark:text-gray-200">ห้อง {r}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="relative group/room">
                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <MapPin size={13} strokeWidth={2.5} className="text-gray-500 dark:text-indigo-300" />
                                    </div>
                                    <select
                                        value={assignedRooms.length > 0 ? assignedRooms[0] : ""}
                                        onChange={(e) => {
                                            const r = e.target.value;
                                            if (r) handleSaveRooms([r]);
                                        }}
                                        className="appearance-none pl-7 pr-6 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-all outline-none focus:ring-1 focus:ring-indigo-500 min-w-[90px]"
                                    >
                                        <option value="" disabled className="bg-white dark:bg-[#2a2b2f] text-gray-400 dark:text-gray-500">เลือกห้อง</option>
                                        <option value="all" className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-gray-100">ทุกห้อง</option>
                                        {availableRooms.map(r => (
                                            <option key={r} value={r} className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-gray-100">ห้อง {r}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <ChevronDown size={10} className="text-gray-400 group-hover/room:text-indigo-500" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Teacher Assignments List (Detailed View) */}
                        {assignedTeacherIds.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800/50 space-y-2">
                                <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-1 mb-1">
                                    รายชื่อผู้สอนและการมอบหมาย
                                </p>
                                {assignedTeacherIds.map(tid => {
                                    const t = teacherMap[tid];
                                    const assignment = course.teacherAssignments?.find(a => a.teacherId === tid);

                                    // Fallback display if no specific assignment
                                    const displayLevels = (assignment?.classLevels?.length || 0) > 0
                                        ? assignment!.classLevels
                                        : assignedClassLevels;
                                    const displayRooms = (assignment?.roomIds?.length || 0) > 0
                                        ? assignment!.roomIds
                                        : assignedRooms;

                                    return (
                                        <div key={tid} className="flex items-center justify-between p-2 rounded-lg bg-gray-50/50 dark:bg-white/5 border border-transparent hover:border-indigo-500/10 transition-all">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-[10px]">
                                                    {t?.name?.charAt(0) || "?"}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                                                        {t?.name || "Unknown"}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-[9px] font-black text-indigo-500 uppercase">
                                                            {displayLevels.length > 0 ? displayLevels.map(l => formatClassLevel(l)).join(", ") : "ไม่ระบุ"}
                                                        </span>
                                                        <span className="text-[9px] text-gray-400">•</span>
                                                        <span className="text-[9px] font-bold text-emerald-500">
                                                            {displayRooms.length > 0
                                                                ? displayRooms.map(r => r === 'all' ? 'ทุกห้อง' : `ห้อง ${r}`).join(", ")
                                                                : "ไม่ระบุ"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Progress Bar (Capacity) */}
                        <div className="mt-3 flex items-center gap-2 cursor-pointer group" onClick={() => {
                            const isDarkMode = document.documentElement.classList.contains('dark');
                            Swal.fire({
                                title: 'แก้ไขจำนวนรับ',
                                input: 'number',
                                inputValue: course.capacity || 40,
                                showCancelButton: true,
                                confirmButtonText: 'บันทึก',
                                cancelButtonText: 'ยกเลิก',
                                confirmButtonColor: '#4f46e5', // indigo-600
                                cancelButtonColor: '#6b7280', // gray-500
                                background: isDarkMode ? '#1f2937' : '#ffffff',
                                color: isDarkMode ? '#f3f4f6' : '#1f2937',
                                customClass: {
                                    input: isDarkMode ? 'dark:bg-gray-700 dark:text-white dark:border-gray-600' : ''
                                }
                            }).then(res => {
                                if (res.isConfirmed) onUpdateCapacity(course.id, Number(res.value));
                            });
                        }}>
                            <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${enrollmentCount > (course.capacity || 40) ? 'bg-red-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min((enrollmentCount / (course.capacity || 40)) * 100, 100)}%` }}
                                />
                            </div>
                            <span className="text-[10px] font-bold text-gray-500 group-hover:text-indigo-600 transition-colors">
                                {enrollmentCount}/{course.capacity || 40}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Editing Overlays - Only for Teacher now (Level/Room are inline) */}
            <AnimatePresence>
                {editMode === 'teacher' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white dark:bg-[#1e1f21] z-10 p-3 flex flex-col gap-2"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase">
                                เลือกครูผู้สอน
                            </span>
                            <button onClick={() => setEditMode(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                                <X size={14} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1">
                            <div className="space-y-1">
                                {teachersList.map(t => (
                                    <label key={t.id} className="flex items-center gap-2 text-xs p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition-colors">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${assignedTeacherIds.includes(t.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-gray-600'}`}>
                                            {assignedTeacherIds.includes(t.id) && <Check size={10} className="text-white" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={assignedTeacherIds.includes(t.id)}
                                            onChange={(e) => {
                                                const newIds = e.target.checked
                                                    ? [...assignedTeacherIds, t.id]
                                                    : assignedTeacherIds.filter(id => id !== t.id);
                                                handleSaveTeacher(newIds);
                                            }}
                                        />
                                        <span className="truncate text-gray-700 dark:text-gray-200">{t.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default CourseList;
