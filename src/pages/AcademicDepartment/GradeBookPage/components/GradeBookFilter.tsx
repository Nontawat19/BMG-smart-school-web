import React from 'react';
import { ChevronDown, CalendarDays, BookOpen, Search, Users } from 'lucide-react';
import { Course } from '../types';

interface GradeBookFilterProps {
    selectedClass: string;
    setSelectedClass: React.Dispatch<React.SetStateAction<string>>;
    selectedRoom: string;
    setSelectedRoom: React.Dispatch<React.SetStateAction<string>>;
    setSelectedCourse: React.Dispatch<React.SetStateAction<string>>;
    availableClassOptions: [string, string][];
    currentCourse: Course | undefined;
    selectedCourse: string;
    selectedGroup: string;
    setSelectedGroup: React.Dispatch<React.SetStateAction<string>>;
    availableGroups: { id: string, label: string }[];
    selectedSemester: string;
    setSelectedSemester: React.Dispatch<React.SetStateAction<string>>;
    filteredCourses: Course[];
    teacherMap: any;
    userPrivileges: { canSeeAll?: boolean;[key: string]: any };
    searchTerm: string;
    setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
}

const GradeBookFilter: React.FC<GradeBookFilterProps> = ({
    selectedClass,
    setSelectedClass,
    selectedRoom,
    setSelectedRoom,
    setSelectedCourse,
    availableClassOptions,
    selectedCourse,
    selectedGroup,
    setSelectedGroup,
    availableGroups,
    selectedSemester,
    setSelectedSemester,
    filteredCourses,
    teacherMap,
    userPrivileges,
    searchTerm,
    setSearchTerm,
}) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-8 bg-white/80 dark:bg-[#2a2b2f]/60 backdrop-blur-xl p-5 rounded-[1.5rem] shadow-xl shadow-indigo-500/5 border border-white/50 dark:border-white/5 transition-all duration-300 group/container items-end">
            {/* ชั้นเรียน */}
            <div className="md:col-span-1 group">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1.5 uppercase tracking-wider ml-1">
                    ชั้นเรียน
                </label>
                <div className="relative">
                    <select
                        value={selectedClass}
                        onChange={(e) => { 
                            setSelectedClass(e.target.value); 
                            setSelectedCourse(''); 
                            setSelectedGroup('');
                        }}
                        className="w-full pl-3 pr-8 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm cursor-pointer whitespace-nowrap text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">ชั้น...</option>
                        {availableClassOptions.map(([id, name]) => <option key={id} value={id} className="bg-white dark:bg-gray-800">{name}</option>)}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={12} />
                    </div>
                </div>
            </div>

            {/* ห้องเรียน */}
            <div className="md:col-span-1 group">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1.5 uppercase tracking-wider ml-1">
                    ห้อง
                </label>
                <div className="relative">
                    <select
                        value={selectedRoom}
                        onChange={(e) => {
                            setSelectedRoom(e.target.value);
                            setSelectedCourse('');
                            setSelectedGroup('');
                        }}
                        disabled={!selectedClass}
                        className="w-full pl-3 pr-8 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm cursor-pointer disabled:opacity-40 whitespace-nowrap text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">ทุกห้อง</option>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(room => (
                            <option key={room} value={String(room)} className="bg-white dark:bg-gray-800">{room}</option>
                        ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={12} />
                    </div>
                </div>
            </div>

            {/* ภาคเรียน */}
            <div className="md:col-span-2 group">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1.5 uppercase tracking-wider ml-1">
                    ภาคเรียน
                </label>
                <div className="relative">
                    <select
                        value={selectedSemester}
                        onChange={(e) => {
                            setSelectedSemester(e.target.value);
                            setSelectedCourse('');
                            setSelectedGroup('');
                        }}
                        className="w-full pl-9 pr-8 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm cursor-pointer text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">ทุกภาคเรียน</option>
                        <option value="1" className="bg-white dark:bg-gray-800">ภาคเรียนที่ 1</option>
                        <option value="2" className="bg-white dark:bg-gray-800">ภาคเรียนที่ 2</option>
                        <option value="annual" className="bg-white dark:bg-gray-800">ทั้งปีการศึกษา</option>
                    </select>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500/70">
                        <CalendarDays size={16} />
                    </div>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={12} />
                    </div>
                </div>
            </div>

            {/* รายวิชา */}
            <div className="md:col-span-2 group">
                <label className="flex items-center gap-2 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1.5 uppercase tracking-wider ml-1">
                    รายวิชาที่เปิดสอน
                </label>
                <div className="relative">
                    <select
                        value={selectedCourse}
                        onChange={(e) => {
                            setSelectedCourse(e.target.value);
                            setSelectedGroup('');
                        }}
                        className="w-full pl-9 pr-10 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm disabled:opacity-50 truncate text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">เลือกรายวิชา...</option>
                        {filteredCourses.map(c => {
                            const semesterTag = (c.semester === '1-2' || c.semester === 'annual' || !c.semester) ? ' [รายปี]' : '';
                            return (
                                <option key={c.id} value={c.id} className="bg-white dark:bg-gray-800">
                                    {c.code} {c.title}{semesterTag}
                                </option>
                            );
                        })}
                    </select>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500/70">
                        <BookOpen size={16} />
                    </div>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={14} />
                    </div>
                </div>
            </div>

            {/* กลุ่มเรียน (เดิมคือห้อง) */}
            <div className="md:col-span-3 group">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1.5 uppercase tracking-wider ml-1">
                    กลุ่มเรียน / ห้องเรียน
                </label>
                <div className="relative">
                    <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        disabled={!selectedCourse}
                        className="w-full pl-9 pr-8 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm cursor-pointer disabled:opacity-40 text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">{!selectedCourse ? 'กรุณาเลือกวิชา...' : 'ทุกกลุ่ม / ห้อง'}</option>
                        {availableGroups.map(g => (
                            <option key={g.id} value={g.id} className="bg-white dark:bg-gray-800">{g.label}</option>
                        ))}
                    </select>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500/70">
                        <Users size={16} />
                    </div>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={12} />
                    </div>
                </div>
            </div>

            {/* ค้นหารายวิชา */}
            <div className="md:col-span-3">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1.5 uppercase tracking-wider ml-1">
                    ค้นหา
                </label>
                <div className="relative">
                    <input
                        type="text"
                        placeholder="รหัส หรือ ชื่อวิชา..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-medium text-xs shadow-sm text-gray-900 dark:text-gray-100"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Search size={16} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GradeBookFilter;
