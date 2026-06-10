import React from 'react';
import { Calendar, ChevronDown, Cpu, Loader2, Save, X } from 'lucide-react';
import BackButton from '@/components/Shared/BackButton';

interface TeacherScheduleHeaderProps {
    selectedYear: string;
    availableYears: string[];
    selectedSemester: string;
    isSaving: boolean;
    isAutoScheduling: boolean;
    setSelectedYear: (value: string) => void;
    setSelectedSemester: (value: string) => void;
    handleGenerateSchoolTimetable: () => void;
    handleClearAllSchedules: () => void;
    handleSaveSchedule: () => void;
}

export const TeacherScheduleHeader: React.FC<TeacherScheduleHeaderProps> = ({
    selectedYear,
    availableYears,
    selectedSemester,
    isSaving,
    isAutoScheduling,
    setSelectedYear,
    setSelectedSemester,
    handleGenerateSchoolTimetable,
    handleClearAllSchedules,
    handleSaveSchedule
}) => {
    return (
        <header className="relative z-40 bg-white/80 dark:bg-[#2a2b2f]/80 backdrop-blur-2xl border-b border-gray-100 dark:border-white/5 shadow-sm px-3 lg:px-4 py-1.5 transition-all">
            <div className="w-full max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(220px,1fr)_330px_580px] xl:items-center gap-2 xl:gap-3">
                <div className="min-w-0 flex items-center">
                    <div className="min-w-0 flex items-center gap-2.5">
                        <BackButton to="/academic/hub/scheduling" className="shrink-0 w-9 h-9" />
                        <div className="min-w-0 flex items-center gap-2.5 group cursor-pointer">
                            <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-[0_0_16px_rgba(79,70,229,0.35)] border border-white/10 group-hover:rotate-6 transition-transform">
                                <Calendar size={20} className="text-white" />
                            </div>
                            <div className="min-w-0 flex flex-col">
                                <h1 className="truncate text-base lg:text-lg font-black tracking-tight text-gray-900 dark:text-white uppercase leading-tight">ระบบจัดตารางสอนอัจฉริยะ</h1>
                                <div className="mt-0.5 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
                                    <span className="hidden min-[1500px]:inline shrink truncate text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-[0.2em]">Academic Management Console</span>
                                    <span className="hidden sm:block shrink-0 w-1 h-1 rounded-full bg-gray-700"></span>
                                    <div className="shrink-0 flex items-center gap-1.5">
                                        <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.16em] leading-none">System Operational</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="min-w-0 w-full xl:justify-self-end">
                    <div className="flex w-full max-w-[330px] items-center gap-2">
                        <label className="group relative flex h-10 w-[172px] items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50/80 px-3 shadow-sm backdrop-blur-xl transition-colors hover:border-indigo-400/40 dark:border-white/5 dark:bg-white/[0.03]">
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-normal text-gray-400 dark:text-gray-500">ปีการศึกษา</span>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="w-[58px] shrink-0 appearance-none bg-transparent pr-5 text-[14px] font-black leading-none text-gray-900 outline-none cursor-pointer dark:text-white"
                            >
                                {availableYears.map(year => (
                                    <option key={year} value={year} className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white py-2">
                                        {year}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-hover:text-indigo-400" />
                        </label>

                        <label className="group relative flex h-10 w-[150px] items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50/80 px-3 shadow-sm backdrop-blur-xl transition-colors hover:border-indigo-400/40 dark:border-white/5 dark:bg-white/[0.03]">
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-normal text-gray-400 dark:text-gray-500">ภาคเรียนที่</span>
                            <select
                                value={selectedSemester}
                                onChange={(e) => setSelectedSemester(e.target.value)}
                                className="w-[36px] shrink-0 appearance-none bg-transparent pr-5 text-[14px] font-black leading-none text-gray-900 outline-none cursor-pointer dark:text-white"
                            >
                                <option value="1" className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white">1</option>
                                <option value="2" className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white">2</option>
                            </select>
                            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-hover:text-indigo-400" />
                        </label>
                    </div>
                </div>

                <div className="flex min-w-0 w-full items-center justify-start gap-2 xl:justify-end">
                    <button
                        onClick={handleGenerateSchoolTimetable}
                        disabled={isAutoScheduling}
                        className="min-w-0 flex flex-[1_1_220px] xl:flex-none xl:w-[242px] items-center justify-center gap-2 px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 transition-all duration-300 text-white shadow-[0_8px_20px_-5px_rgba(79,70,229,0.45)] hover:shadow-[0_12px_28px_-5px_rgba(79,70,229,0.55)] text-[11px] font-black uppercase tracking-normal group h-10 border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {isAutoScheduling ? <Loader2 size={17} className="shrink-0 animate-spin" /> : <Cpu size={17} className="shrink-0" />}
                        <span className="relative z-10 min-w-0 truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">จัดตารางสอนทั้งโรงเรียน</span>
                    </button>
                    <button
                        onClick={handleClearAllSchedules}
                        className="min-w-0 flex flex-[1_1_128px] xl:flex-none xl:w-[118px] items-center justify-center gap-2 px-3 py-2 rounded-2xl border border-rose-600/20 bg-rose-600/5 text-rose-500 hover:bg-rose-600/10 hover:border-rose-500/35 transition-all duration-300 text-[11px] font-black uppercase tracking-normal group h-10 active:scale-95 whitespace-nowrap"
                    >
                        <X size={17} className="shrink-0" />
                        <span className="relative z-10 min-w-0 truncate">ลบทั้งหมด</span>
                    </button>
                    <button
                        onClick={handleSaveSchedule}
                        disabled={isSaving}
                        className="min-w-0 flex flex-[1_1_180px] xl:flex-none xl:w-[188px] items-center justify-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_auto] hover:bg-right transition-all duration-500 text-white shadow-[0_8px_20px_-5px_rgba(79,70,229,0.5)] hover:shadow-[0_12px_28px_-5px_rgba(79,70,229,0.6)] text-[11px] font-black uppercase tracking-normal group h-10 border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {isSaving ? <Loader2 size={17} className="shrink-0 animate-spin" /> : <Save size={17} className="shrink-0" />}
                        <span className="relative z-10 min-w-0 truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">บันทึกตารางสอน</span>
                    </button>
                </div>
            </div>
        </header>
    );
};
