import React, { useMemo } from 'react';
import Select from 'react-select';
import { Trash2, Zap } from 'lucide-react';
import { CLASSES, thaiFormatClass } from '../utils';
import { Course, CourseInstance, Schedule, SchoolSettings, Teacher, getAssignmentTeacherIds } from '../types';
import { TeacherSelect } from './TeacherSelect';

interface CompactScheduleToolbarProps {
    isDarkMode: boolean;
    allCourses: Course[];
    availableCourseInstances: CourseInstance[];
    teachers: Teacher[];
    selectedTeacher: string;
    selectedSemester: string;
    filterClass: string;
    filterRoom: string;
    filterGroup: string;
    filterPhysicalRoom: string;
    physicalRooms: any[];
    searchTerm: string;
    schoolSettings: SchoolSettings;
    isAutoScheduling: boolean;
    setSearchTerm: (value: string) => void;
    setSelectedTeacher: (value: string) => void;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    setFilterClass: (value: string) => void;
    setFilterRoom: (value: string) => void;
    setFilterGroup: (value: string) => void;
    setFilterPhysicalRoom: (value: string) => void;
    handleClearSchedule: () => void;
    handleAutoScheduleForTeacherAndClasses: () => void;
}

const getSubjectGroupOrder = (groupName?: string): number => {
    if (!groupName) return 999;
    const normalized = groupName
        .replace(/^กลุ่มสาระการเรียนรู้\s*/u, "")
        .replace(/^กลุ่มสาระ\s*/u, "")
        .replace(/\s+/g, "")
        .trim();

    if (normalized.includes('ไทย')) return 1;
    if (normalized.includes('คณิต')) return 2;
    if (normalized.includes('วิท') || normalized.includes('เทคโน')) return 3;
    if (normalized.includes('สังคม') || normalized.includes('ศาสนา') || normalized.includes('วัฒน')) return 4;
    if (normalized.includes('สุข') || normalized.includes('พล')) return 5;
    if (normalized.includes('ศิลป') || normalized.includes('ดนตรี') || normalized.includes('นาฏ')) return 6;
    if (normalized.includes('การงาน') || normalized.includes('อาชีพ')) return 7;
    if (normalized.includes('ต่างประเทศ') || normalized.includes('อังกฤษ') || normalized.includes('จีน') || normalized.includes('ญี่ปุ่น') || normalized.includes('ฝรั่งเศส') || normalized.includes('เยอรมัน') || normalized.includes('เกาหลี')) return 8;
    if (normalized.includes('กิจกรรม') || normalized.includes('พัฒนาผู้เรียน')) return 9;
    return 100; // other groups
};

export const CompactScheduleToolbar: React.FC<CompactScheduleToolbarProps> = ({
    isDarkMode,
    allCourses,
    availableCourseInstances,
    teachers,
    selectedTeacher,
    selectedSemester,
    filterClass,
    filterRoom,
    filterGroup,
    filterPhysicalRoom,
    physicalRooms,
    searchTerm,
    schoolSettings,
    isAutoScheduling,
    setSearchTerm,
    setSelectedTeacher,
    setSchedule,
    setFilterClass,
    setFilterRoom,
    setFilterGroup,
    setFilterPhysicalRoom,
    handleClearSchedule,
    handleAutoScheduleForTeacherAndClasses
}) => {
    const courseMatchesRoom = (course: Course) => {
        if (filterRoom === 'all') return true;

        const courseClassIds = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean) as string[];
        const assignedClassIds = course.teacherAssignments
            ?.filter(a => !selectedTeacher || getAssignmentTeacherIds(a).includes(selectedTeacher))
            .flatMap(a => a.classLevels || []) || [];
        const allAssociatedClasses = [...courseClassIds, ...assignedClassIds];

        return allAssociatedClasses.some(id => {
            const parts = String(id).split('/');
            if (parts.length < 2) return false;
            const roomPart = parts[1].trim();
            if (filterRoom === 'แผน') return roomPart === 'แผน';
            return Number(roomPart) === Number(filterRoom);
        });
    };

    const courseMatchesGroup = (course: Course) => {
        if (filterGroup === 'all') return true;

        return course.teacherAssignments
            ?.filter(a => !selectedTeacher || getAssignmentTeacherIds(a).includes(selectedTeacher))
            .some(a => String(a.groupNumber || 1) === filterGroup) || false;
    };

    const handleClassChange = (option: any) => {
        const nextClass = option?.value || 'all';
        setFilterClass(nextClass);

        if (nextClass !== 'all') {
            setFilterRoom('1');
            setFilterGroup('1');
        }
    };

    // Filtered courses for dropdown selection
    const courseOptions = useMemo(() => {
        const filtered = allCourses
            .filter(c => {
                const semStr = String(c.semester || "");
                const targetSem = String(selectedSemester || "1");
                const isCorrectSemester = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                if (!isCorrectSemester) return false;

                const hasAssignments = (c.teacherAssignments?.length || 0) > 0;
                const isForSelectedTeacher = !selectedTeacher || c.teacherAssignments?.some(a => getAssignmentTeacherIds(a).includes(selectedTeacher));

                const classIds = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                const assignedClasses = c.teacherAssignments?.filter(a => !selectedTeacher || getAssignmentTeacherIds(a).includes(selectedTeacher)).flatMap(a => a.classLevels || []) || [];
                const allAssociatedClasses = [...classIds, ...assignedClasses];
                const isForSelectedClass = filterClass === 'all' || allAssociatedClasses.some(id => id === filterClass || id.startsWith(filterClass + '/'));

                if (!hasAssignments || !isForSelectedTeacher || !isForSelectedClass || !courseMatchesRoom(c) || !courseMatchesGroup(c)) return false;

                const remainingCount = availableCourseInstances.filter(inst => inst.code === c.code).length;
                return remainingCount > 0;
            })
            .sort((a, b) => {
                const groupA = getSubjectGroupOrder(a.subjectGroup);
                const groupB = getSubjectGroupOrder(b.subjectGroup);
                if (groupA !== groupB) {
                    return groupA - groupB;
                }
                const sA = a.subjectGroup || '';
                const sB = b.subjectGroup || '';
                const groupComp = sA.localeCompare(sB, 'th');
                if (groupComp !== 0) return groupComp;

                return a.code.localeCompare(b.code);
            })
            .map(course => {
                const cleanGroup = course.subjectGroup
                    ? course.subjectGroup.replace(/^กลุ่มสาระการเรียนรู้\s*/u, "").replace(/^กลุ่มสาระ\s*/u, "").trim()
                    : "";
                const label = cleanGroup 
                    ? `[${cleanGroup}] ${course.code} - ${course.title}`
                    : `${course.code} - ${course.title}`;
                return {
                    value: course.code,
                    label,
                    course
                };
            });

        return [{ value: '', label: 'ทุกรายวิชา...' }, ...filtered];
    }, [allCourses, selectedSemester, selectedTeacher, filterClass, filterRoom, filterGroup, availableCourseInstances]);

    const selectedCourseOption = useMemo(() => {
        if (!searchTerm) return null;
        const course = allCourses.find(c => c.code === searchTerm);
        if (!course) return { value: searchTerm, label: searchTerm };
        const label = `${course.code} - ${course.title}`;
        return { value: course.code, label };
    }, [allCourses, searchTerm]);

    const selectedTeacherLabel = useMemo(() => {
        const teacher = teachers.find(t => t.id === selectedTeacher);
        if (!teacher) return '';
        return `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || teacher.name || ''}`.trim();
    }, [teachers, selectedTeacher]);

    const teacherSelectWidth = useMemo(() => {
        const labelLength = selectedTeacherLabel.length || 14;
        return Math.min(320, Math.max(220, labelLength * 6 + 110));
    }, [selectedTeacherLabel]);

    const courseSelectWidth = useMemo(() => {
        const labelLength = selectedCourseOption?.label?.length || 18;
        return Math.min(380, Math.max(260, labelLength * 5 + 80));
    }, [selectedCourseOption]);

    const selectStyles = useMemo(() => ({
        control: (base: any, state: any) => ({
            ...base,
            minHeight: '32px',
            height: '32px',
            borderRadius: '12px',
            backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.7)' : 'rgba(249, 250, 251, 0.9)',
            borderColor: state.isFocused ? '#6366f1' : isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            fontWeight: '800',
            fontSize: '11px',
            transition: 'all 0.2s ease',
            boxShadow: 'none',
            '&:hover': {
                borderColor: state.isFocused ? '#6366f1' : isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
            }
        }),
        menu: (base: any) => ({
            ...base,
            backgroundColor: isDarkMode ? '#1e293b' : 'white',
            border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
            borderRadius: '14px',
            overflowX: 'hidden',
            width: '100%',
            minWidth: '320px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            zIndex: 9999
        }),
        option: (base: any, { isFocused, isSelected }: any) => ({
            ...base,
            backgroundColor: isSelected
                ? '#4f46e5'
                : isFocused
                    ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                    : 'transparent',
            color: isDarkMode ? '#f8fafc' : '#0f172a',
            cursor: 'pointer',
            padding: '6px 12px',
            margin: '1px 8px',
            borderRadius: '8px',
            width: 'calc(100% - 16px)',
            fontSize: '11px',
            fontWeight: '700',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
        }),
        valueContainer: (base: any) => ({
            ...base,
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center'
        }),
        indicatorsContainer: (base: any) => ({ ...base, height: '30px' }),
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
        singleValue: (base: any) => ({ 
            ...base, 
            color: isDarkMode ? '#f8fafc' : '#0f172a',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%'
        }),
        input: (base: any) => ({ ...base, color: isDarkMode ? 'white' : 'black', margin: 0, padding: 0 }),
        placeholder: (base: any) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }),
        menuList: (base: any) => ({ ...base, maxHeight: '250px', padding: 0 }),
        indicatorSeparator: () => ({ display: 'none' })
    }), [isDarkMode]);

    return (
        <div className="w-full flex flex-col gap-2 transition-all relative overflow-visible">
            
            {/* Combined Toolbar Layout */}
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-end gap-3">
                {/* 1. FILTERS ROW */}
                <div className="flex flex-row flex-wrap items-center justify-end gap-2 min-w-0">
                    {/* Teacher Select */}
                    <div className="shrink-0 min-w-[220px]" style={{ width: `${teacherSelectWidth}px` }}>
                        <TeacherSelect 
                            teachers={teachers} 
                            selectedTeacher={selectedTeacher} 
                            setSelectedTeacher={setSelectedTeacher} 
                            setSchedule={setSchedule} 
                        />
                    </div>

                    {/* Course Select */}
                    <div className="shrink-0 min-w-[260px]" style={{ width: `${courseSelectWidth}px` }}>
                        <Select
                            menuPortalTarget={document.body}
                            value={selectedCourseOption}
                            onChange={(option: any) => setSearchTerm(option?.value || '')}
                            options={courseOptions}
                            placeholder="ค้นหารายวิชา..."
                            isClearable
                            className="text-xs"
                            styles={selectStyles}
                        />
                    </div>

                </div>

                {/* Vertical Divider on XL screen */}
                <div className="hidden xl:block w-[1px] h-6 bg-gray-200 dark:bg-white/10 self-center"></div>

                {/* 2. ACTIONS ROW */}
                <div className="flex flex-wrap items-center gap-1.5 xl:shrink-0 justify-start xl:justify-end">


                    {/* Auto schedule teacher (AI) */}
                    {selectedTeacher && (
                        <button
                            onClick={handleAutoScheduleForTeacherAndClasses}
                            disabled={isAutoScheduling}
                            className="flex items-center gap-1 h-[32px] px-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all text-[11px] font-black disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Zap size={13} className="shrink-0" />
                            <span>จัดเฉพาะท่านนี้</span>
                        </button>
                    )}

                    {/* Clear teacher schedule */}
                    {selectedTeacher && (
                        <button 
                            onClick={handleClearSchedule} 
                            className="flex items-center gap-1 h-[32px] px-2.5 rounded-xl border border-rose-500/10 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all text-[11px] font-black"
                        >
                            <Trash2 size={13} className="shrink-0" /> 
                            <span>ลบตารางท่านนี้</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
