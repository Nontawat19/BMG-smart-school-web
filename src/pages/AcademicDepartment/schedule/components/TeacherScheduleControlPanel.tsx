import React from 'react';
import Select from 'react-select';
import { ChevronDown } from 'lucide-react';
import { CLASSES } from '../utils';
import { Course, CourseInstance, Schedule, SchoolSettings, Teacher } from '../types';
import { TeacherSelect } from './TeacherSelect';

interface TeacherScheduleControlPanelProps {
    isDarkMode: boolean;
    allCourses: Course[];
    availableCourseInstances: CourseInstance[];
    teachers: Teacher[];
    selectedTeacher: string;
    selectedSemester: string;
    filterClass: string;
    filterRoom: string;
    filterPhysicalRoom: string;
    physicalRooms: any[];
    searchTerm: string;
    schoolSettings: SchoolSettings;
    setSearchTerm: (value: string) => void;
    setSelectedTeacher: (value: string) => void;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    setFilterClass: (value: string) => void;
    setFilterRoom: (value: string) => void;
    setFilterPhysicalRoom: (value: string) => void;
}

export const TeacherScheduleControlPanel: React.FC<TeacherScheduleControlPanelProps> = ({
    isDarkMode,
    allCourses,
    availableCourseInstances,
    teachers,
    selectedTeacher,
    selectedSemester,
    filterClass,
    filterRoom,
    filterPhysicalRoom,
    physicalRooms,
    searchTerm,
    schoolSettings,
    setSearchTerm,
    setSelectedTeacher,
    setSchedule,
    setFilterClass,
    setFilterRoom,
    setFilterPhysicalRoom
}) => {
    return (
        <section className="bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] p-5 shadow-sm relative overflow-hidden group transition-colors">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-1 h-5 rounded-full bg-indigo-600"></div>
                    <h2 className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">แผงควบคุมการเลือกวิชา</h2>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-indigo-500/20 text-indigo-400 text-[10px] font-black border border-indigo-500/30">1</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">รายวิชา</label>
                    </div>
                    <div className="relative group/input">
                        <Select
                            menuPortalTarget={document.body}
                            value={searchTerm ? { value: searchTerm, label: allCourses.find(c => c.code === searchTerm)?.title || searchTerm, course: allCourses.find(c => c.code === searchTerm) } : null}
                            onChange={(option: any) => setSearchTerm(option?.value || '')}
                            options={[
                                { value: '', label: 'ทุกรายวิชา...' },
                                ...allCourses
                                    .filter(c => {
                                        const semStr = String(c.semester || "");
                                        const targetSem = String(selectedSemester || "1");
                                        const isCorrectSemester = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                                        if (!isCorrectSemester) return false;

                                        const hasAssignments = (c.teacherAssignments?.length || 0) > 0;
                                        const isForSelectedTeacher = !selectedTeacher || c.teacherAssignments?.some(a => a.teacherId === selectedTeacher);

                                        const classIds = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                                        const assignedClasses = c.teacherAssignments?.filter(a => !selectedTeacher || a.teacherId === selectedTeacher).flatMap(a => a.classLevels || []) || [];
                                        const allAssociatedClasses = [...classIds, ...assignedClasses];
                                        const isForSelectedClass = filterClass === 'all' || allAssociatedClasses.some(id => id === filterClass || id.startsWith(filterClass + '/'));

                                        if (!hasAssignments || !isForSelectedTeacher || !isForSelectedClass) return false;

                                        const remainingCount = availableCourseInstances.filter(inst => inst.code === c.code).length;
                                        return remainingCount > 0;
                                    })
                                    .sort((a, b) => a.code.localeCompare(b.code))
                                    .map(course => ({
                                        value: course.code,
                                        label: `${course.code} - ${course.title}`,
                                        course
                                    }))
                            ]}
                            placeholder="เลือกรายวิชา..."
                            isClearable
                            className="react-select-container text-xs font-black"
                            classNamePrefix="react-select"
                            styles={{
                                control: (base) => ({
                                    ...base, minHeight: '36px', height: '36px', borderRadius: '12px',
                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249, 250, 251, 0.8)',
                                    borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                    fontWeight: '800'
                                }),
                                menu: (base) => ({
                                    ...base,
                                    backgroundColor: isDarkMode ? '#1a1b1e' : 'white',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                                }),
                                option: (base, { isFocused, isSelected }) => ({
                                    ...base,
                                    backgroundColor: isSelected
                                        ? '#4f46e5'
                                        : isFocused
                                            ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                            : 'transparent',
                                    color: isDarkMode ? 'white' : 'black',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                }),
                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                indicatorsContainer: (base) => ({ ...base, height: '36px' }),
                                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                singleValue: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
                                input: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black', margin: 0, padding: 0 }),
                                placeholder: (base) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' })
                            }}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-amber-500/20 text-amber-400 text-[10px] font-black border border-amber-500/30">2</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">ครูผู้สอน</label>
                    </div>
                    <TeacherSelect teachers={teachers} selectedTeacher={selectedTeacher} setSelectedTeacher={setSelectedTeacher} setSchedule={setSchedule} />
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-black border border-emerald-500/30">3</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">ระดับชั้น</label>
                    </div>
                    <div className="relative group/input">
                        <select
                            value={filterClass}
                            onChange={(e) => setFilterClass(e.target.value)}
                            className="w-full h-9 px-4 bg-gray-50/80 dark:bg-[#1a1b1e] border border-gray-100 dark:border-white/5 rounded-[12px] text-xs font-bold appearance-none cursor-pointer focus:outline-none dark:text-white"
                        >
                            <option value="all" className="dark:bg-[#1a1b1e] dark:text-white">เลือกชั้น...</option>
                            {schoolSettings.availableClasses.map((k) => (
                                <option key={k} value={k} className="dark:bg-[#1a1b1e] dark:text-white">
                                    {CLASSES[k as keyof typeof CLASSES]}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-black border border-blue-500/30">4</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">กลุ่ม</label>
                    </div>
                    <div className="relative group/input">
                        <select
                            value={filterRoom}
                            onChange={(e) => setFilterRoom(e.target.value)}
                            className="w-full h-9 px-4 bg-gray-50/80 dark:bg-[#1a1b1e] border border-gray-100 dark:border-white/5 rounded-[12px] text-xs font-bold appearance-none cursor-pointer focus:outline-none dark:text-white"
                        >
                            <option value="all" className="dark:bg-[#1a1b1e] dark:text-white">ทุกกลุ่ม...</option>
                            {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                                <option key={num} value={String(num)} className="dark:bg-[#1a1b1e] dark:text-white">
                                    กลุ่ม {num}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-violet-500/20 text-violet-400 text-[10px] font-black border border-violet-500/30">5</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">สถานที่</label>
                    </div>
                    <div className="relative group/input">
                        <select
                            value={filterPhysicalRoom}
                            onChange={(e) => setFilterPhysicalRoom(e.target.value)}
                            className="w-full h-9 px-4 bg-gray-50/80 dark:bg-[#1a1b1e] border border-gray-100 dark:border-white/5 rounded-[12px] text-xs font-bold appearance-none cursor-pointer focus:outline-none dark:text-white"
                        >
                            <option value="all" className="dark:bg-[#1a1b1e] dark:text-white">ทุกสถานที่...</option>
                            {physicalRooms.map((room: any) => (
                                <option key={room.id} value={room.id} className="dark:bg-[#1a1b1e] dark:text-white">
                                    {room.roomCode ? `(${room.roomCode}) ` : ''}{room.roomName}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>
        </section>
    );
};
