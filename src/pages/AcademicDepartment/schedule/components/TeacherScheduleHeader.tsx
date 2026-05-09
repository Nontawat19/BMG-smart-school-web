import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronDown, Loader2, Save, Settings } from 'lucide-react';
import BackButton from '@/components/Shared/BackButton';

interface TeacherScheduleHeaderProps {
    selectedYear: string;
    availableYears: string[];
    selectedSemester: string;
    isSaving: boolean;
    setSelectedYear: (value: string) => void;
    setSelectedSemester: (value: string) => void;
    handleSaveSchedule: () => void;
}

export const TeacherScheduleHeader: React.FC<TeacherScheduleHeaderProps> = ({
    selectedYear,
    availableYears,
    selectedSemester,
    isSaving,
    setSelectedYear,
    setSelectedSemester,
    handleSaveSchedule
}) => {
    return (
        <header className="sticky top-[60px] z-40 bg-white/80 dark:bg-[#2a2b2f]/80 backdrop-blur-2xl border-b border-gray-100 dark:border-white/5 shadow-sm px-3 sm:px-4 lg:px-6 py-2 transition-all">
            <div className="max-w-[1600px] mx-auto flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pl-12 sm:pl-14 lg:pl-0">
                <div className="min-w-0 flex items-center gap-4">
                    <div className="min-w-0 flex items-center gap-3 sm:gap-4">
                        <BackButton to="/academic/hub/scheduling" />
                        <div className="min-w-0 flex items-center gap-3 group cursor-pointer">
                            <div className="shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)] border border-white/10 group-hover:rotate-6 transition-transform">
                                <Calendar size={22} className="text-white" />
                            </div>
                            <div className="min-w-0 flex flex-col">
                                <h1 className="truncate text-base sm:text-lg lg:text-xl font-black tracking-tight text-gray-900 dark:text-white uppercase leading-tight">ระบบจัดตารางสอนอัจฉริยะ</h1>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                    <span className="text-[9px] sm:text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-[0.18em] sm:tracking-[0.25em]">Academic Management Console</span>
                                    <span className="hidden sm:block w-1 h-1 rounded-full bg-gray-700"></span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest leading-none">System Operational</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex w-full xl:w-auto items-center gap-2 sm:gap-3 overflow-x-auto pb-1 xl:pb-0">
                    <div className="shrink-0 flex items-center gap-3 sm:gap-4 bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-xl border border-gray-100 dark:border-white/5 rounded-[16px] px-3 sm:px-4 py-1 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] leading-none mb-0.5">ปีการศึกษา</span>
                                <div className="relative group min-w-[80px]">
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        className="bg-transparent text-xs font-black text-gray-900 dark:text-white focus:outline-none cursor-pointer appearance-none pr-6 w-full"
                                    >
                                        {availableYears.map(year => (
                                            <option key={year} value={year} className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white py-2">
                                                ปี {year}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                        <div className="w-[1px] h-7 bg-gray-100 dark:bg-white/5 mx-1"></div>
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] leading-none mb-0.5">ภาคเรียน</span>
                                <div className="relative group min-w-[90px]">
                                    <select
                                        value={selectedSemester}
                                        onChange={(e) => setSelectedSemester(e.target.value)}
                                        className="bg-transparent text-xs font-black text-gray-900 dark:text-white focus:outline-none cursor-pointer appearance-none pr-6 w-full"
                                    >
                                        <option value="1" className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white">เทอม 1</option>
                                        <option value="2" className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white">เทอม 2</option>
                                    </select>
                                    <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <Link to="/academic/period-constraints" className="shrink-0 flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.08] transition-all text-[10px] font-black uppercase tracking-widest h-[44px] whitespace-nowrap">
                        <Settings size={16} />
                        <span>ตั้งค่าคาบคู่ / เดี่ยว</span>
                    </Link>

                    <button
                        onClick={handleSaveSchedule}
                        disabled={isSaving}
                        className="shrink-0 flex items-center gap-2 sm:gap-3 px-5 sm:px-8 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_auto] hover:bg-right transition-all duration-500 text-white shadow-[0_10px_25px_-5px_rgba(79,70,229,0.5)] hover:shadow-[0_15px_35px_-5px_rgba(79,70,229,0.6)] text-[11px] font-black uppercase tracking-[0.15em] group h-[44px] border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        <span className="relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">บันทึกตารางสอน</span>
                    </button>
                </div>
            </div>
        </header>
    );
};
