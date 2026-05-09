import React from 'react';
import { UserCheck, Calendar, ChevronLeft } from 'lucide-react';

interface AttendanceHeaderProps {
    teacherName: string;
    currentDate: Date;
    academicYear: string;
    semester: string;
    onDateChange: (date: Date) => void;
    title?: string;
}

const AttendanceHeader: React.FC<AttendanceHeaderProps> = ({
    teacherName,
    currentDate,
    academicYear,
    semester,
    onDateChange,
    title = "ระบบเช็คชื่อเข้าเรียน",
}) => {
    const prevDate = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() - 1);
        onDateChange(d);
    };

    const nextDate = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + 1);
        onDateChange(d);
    };

    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
            <div className="space-y-1 text-left">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
                        <UserCheck className="text-indigo-600 dark:text-indigo-400" size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                            {title}
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold flex items-center gap-1.5 pt-0.5">
                            <span className="opacity-60">ครูผู้สอน:</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{teacherName || 'กำลังโหลด...'}</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                {/* Academic Context Display - Only show, not selectable */}
                <div className="flex bg-gray-50 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-gray-800 items-center px-4 shadow-inner">
                    <div className="flex items-baseline gap-1 py-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">ปี</span>
                        <span className="text-[13px] font-black text-gray-900 dark:text-white">
                            {academicYear || '...'}
                        </span>
                    </div>
                    <div className="w-[1.5px] h-3 bg-gray-200 dark:bg-gray-700 mx-3"></div>
                    <div className="flex items-baseline gap-1 py-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">เทอม</span>
                        <span className="text-[13px] font-black text-gray-900 dark:text-white">
                            {semester || '...'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-white dark:bg-[#1a1b1e] p-1 rounded-xl shadow-lg shadow-indigo-500/5 border border-gray-100 dark:border-gray-800 ring-1 ring-gray-100 dark:ring-gray-700/30">
                    <button
                        onClick={prevDate}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-gray-400 hover:text-indigo-600 active:scale-90"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2 px-1 min-w-[170px] justify-center">
                        <Calendar size={16} className="text-indigo-500/70" />
                        <span className="font-black text-xs text-gray-800 dark:text-gray-100 tracking-tight">
                            {currentDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                    </div>
                    <button
                        onClick={nextDate}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-gray-400 hover:text-indigo-600 rotate-180 active:scale-90"
                    >
                        <ChevronLeft size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttendanceHeader;
