import React from "react";
import { Layout, Users, ChevronDown, School, Calendar } from "lucide-react";

interface EnrollmentFiltersProps {
    availableLevels: string[];
    activeClassLevel: string | null;
    setActiveClassLevel: (level: string) => void;
    activeRoom: string;
    setActiveRoom: (room: string) => void;
    rooms: string[];
    availableGroups?: string[];
    activeGroup?: string;
    setActiveGroup?: (group: string) => void;
    activeSemester: string;
    setActiveSemester: (s: string) => void;
    activeYear: string;
    setActiveYear: (y: string) => void;
    activeTeacher?: string;
    setActiveTeacher?: (t: string) => void;
}

const EnrollmentFilters: React.FC<EnrollmentFiltersProps> = ({
    availableLevels,
    activeClassLevel,
    setActiveClassLevel,
    activeRoom,
    setActiveRoom,
    rooms,
    availableGroups = [],
    activeGroup = "ทั้งหมด",
    setActiveGroup = () => { },
    activeSemester,
    setActiveSemester,
    activeYear,
    setActiveYear,
    activeTeacher = "",
    setActiveTeacher = () => { }
}) => {
    return (
        <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md flex flex-wrap items-center gap-4 lg:gap-6">
            {/* Label Badge */}
            <div className="hidden xl:flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
                <Layout size={18} className="text-indigo-600 dark:text-indigo-400" />
                <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest text-nowrap">กลุ่มตัวกรองข้อมูล</span>
            </div>

            {/* Group Selection */}
            {availableGroups.length > 0 && (
                <div className="flex-1 min-w-[180px] space-y-1.5 animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none pr-3 border-r border-gray-200 dark:border-gray-700">
                            <Layout size={14} className="text-gray-400 group-hover:text-indigo-600 transition-colors" />
                        </div>
                        <select
                            value={activeGroup}
                            onChange={(e) => setActiveGroup(e.target.value)}
                            className="w-full pl-14 pr-10 py-3 text-sm font-bold bg-indigo-50/50 dark:bg-[#1e1f21] border border-indigo-100 dark:border-gray-600 rounded-xl outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all text-indigo-700 dark:text-white"
                        >
                            <option value="ทั้งหมด">แสดงทุกกลุ่ม</option>
                            {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-indigo-600 pointer-events-none" />
                    </div>
                </div>
            )}

            {/* Class Level Selection */}
            <div className="flex-1 min-w-[150px] space-y-1.5">
                <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none pr-3 border-r border-gray-200 dark:border-gray-700">
                        <School size={14} className="text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </div>
                    <select
                        value={activeClassLevel || ""}
                        onChange={(e) => setActiveClassLevel(e.target.value)}
                        className="w-full pl-14 pr-10 py-3 text-sm font-bold bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all text-gray-700 dark:text-white"
                    >
                        {availableLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-indigo-600 pointer-events-none" />
                </div>
            </div>

            {/* Room Selection / Special Program */}
            <div className="flex-1 min-w-[220px] space-y-1.5">
                <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none pr-3 border-r border-gray-200 dark:border-gray-700">
                        <Users size={14} className="text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </div>
                    <select
                        value={activeRoom}
                        onChange={(e) => setActiveRoom(e.target.value)}
                        className="w-full pl-14 pr-10 py-3 text-sm font-bold bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all text-gray-700 dark:text-white"
                    >
                        {rooms.map(r => <option key={r} value={r}>ห้อง {r}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-indigo-600 pointer-events-none" />
                </div>
            </div>

            {/* Academic Year Display (Default Read-Only) */}
            <div className="flex items-center gap-3 pl-6 border-l border-gray-100 dark:border-gray-700">
                <div className="relative group">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">ปีการศึกษา</p>
                    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100/50 dark:border-indigo-500/20 rounded-xl">
                        <Calendar size={14} className="text-indigo-600 dark:text-indigo-400" />
                        <span className="text-sm font-black text-indigo-700 dark:text-indigo-300">{activeYear}</span>
                    </div>
                </div>

                {/* Semester Selector */}
                <div className="flex flex-col">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">ภาคเรียน</p>
                    <div className="relative group min-w-[100px]">
                        <select
                            value={activeSemester}
                            onChange={(e) => setActiveSemester(e.target.value)}
                            className="w-full pl-3 pr-8 py-2 text-xs font-bold bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all text-gray-700 dark:text-white"
                        >
                            <option value="ทั้งหมด">ทั้งหมด</option>
                            <option value="1">เทอม 1</option>
                            <option value="2">เทอม 2</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EnrollmentFilters;
