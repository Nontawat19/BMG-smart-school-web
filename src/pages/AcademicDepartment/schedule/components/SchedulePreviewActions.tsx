import React from 'react';
import { Cpu, Trash2, X, Zap } from 'lucide-react';

interface SchedulePreviewActionsProps {
    selectedTeacher: string;
    isAutoScheduling: boolean;
    handleClearSchedule: () => void;
    handleClearAllSchedules: () => void;
    handleAutoScheduleForTeacherAndClasses: () => void;
    handleGenerateSchoolTimetable: () => void;
}

export const SchedulePreviewActions: React.FC<SchedulePreviewActionsProps> = ({
    selectedTeacher,
    isAutoScheduling,
    handleClearSchedule,
    handleClearAllSchedules,
    handleAutoScheduleForTeacherAndClasses,
    handleGenerateSchoolTimetable
}) => {
    return (
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
            <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 rounded-full bg-emerald-600"></div>
                <h2 className="text-sm font-black tracking-normal">พรีวิวก่อนลงตาราง</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {selectedTeacher && (
                    <button onClick={handleClearSchedule} className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-rose-500/10 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-all text-[11px] font-black tracking-normal shadow-lg">
                        <Trash2 size={16} /> <span>ลบตารางเฉพาะคนนี้</span>
                    </button>
                )}
                <button onClick={handleClearAllSchedules} className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-rose-600/10 bg-rose-600/5 text-rose-600 hover:bg-rose-600/10 transition-all text-[11px] font-black tracking-normal shadow-lg">
                    <X size={16} /> <span>ลบตารางทั้งหมด</span>
                </button>
                <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-wide">Live Preview</span>
                </div>
                {selectedTeacher && (
                    <button
                        onClick={() => handleAutoScheduleForTeacherAndClasses()}
                        disabled={isAutoScheduling}
                        className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all text-[11px] font-black tracking-normal shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Zap size={16} /> <span>AI: จัดเฉพาะครูคนนี้</span>
                    </button>
                )}
                <button
                    onClick={() => handleGenerateSchoolTimetable()}
                    disabled={isAutoScheduling}
                    className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-indigo-600 text-white text-[12px] font-black tracking-normal shadow-lg hover:bg-indigo-500 hover:scale-[1.02] transition-all group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    <Cpu size={18} /> <span>จัดตารางอัตโนมัติ (ทั้งโรงเรียน)</span>
                </button>
            </div>
        </section>
    );
};
