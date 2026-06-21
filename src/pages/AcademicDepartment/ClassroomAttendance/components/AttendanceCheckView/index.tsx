import React from 'react';
import { Clock, Edit, MapPin, Save } from 'lucide-react';
import { useResponsivePwaMode as usePwaMode } from "@/hooks/useResponsivePwaMode";
import { CourseSchedule, Student } from '../../types';
import AttendanceSummary from './AttendanceSummary';
import StudentGrid from './StudentGrid';

interface AttendanceCheckViewProps {
    selectedClass: CourseSchedule;
    students: Student[];
    attendance: Record<string, string>;
    studentLeaves: Record<string, boolean>;
    isSubmitted: boolean;
    isHoliday: boolean;
    studentsLoading: boolean;
    schoolId: string;
    onBack: () => void;
    onEdit: () => void;
    onSave: () => void;
    onToggleStatus: (studentId: string, status: 'present' | 'absent' | 'late' | 'leave' | 'escape') => void;
    attendanceSummary: {
        มา: number;
        สาย: number;
        ลา: number;
        ขาด: number;
        หนีเรียน: number;
    };
    children?: React.ReactNode;
}

const AttendanceCheckView: React.FC<AttendanceCheckViewProps> = ({
    selectedClass,
    students,
    attendance,
    studentLeaves,
    isSubmitted,
    isHoliday,
    studentsLoading,
    schoolId,
    onBack,
    onEdit,
    onSave,
    onToggleStatus,
    attendanceSummary,
    children,
}) => {
    const isPwaMode = usePwaMode();
    const displayPeriod = selectedClass.isSubstitute && selectedClass.period === 0 
        ? '1' 
        : selectedClass.isDoublePeriod && selectedClass.periods 
            ? selectedClass.periods.join(' - ') 
            : String(selectedClass.period);
    const timeLabel = selectedClass.startTime || selectedClass.endTime ? `${selectedClass.startTime || '-'}-${selectedClass.endTime || '-'}` : '-';

    return (
        <div className={isPwaMode ? "space-y-3 overflow-x-hidden" : "space-y-6"}>
            {/* Header Bar */}
            <div className={`${isPwaMode ? 'relative z-10 px-2.5 py-2 rounded-xl' : 'sticky top-[60px] z-40 p-3 sm:p-5 md:rounded-2xl'} bg-white/98 dark:bg-[#1e1f23]/98 backdrop-blur-md shadow-lg border-b border-gray-100 dark:border-gray-800 transition-all duration-300`}>
                {isPwaMode ? (
                    /* PWA: single compact row */
                    <div className="flex items-center gap-2 w-full">
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-extrabold text-gray-800 dark:text-white truncate leading-tight">
                                {selectedClass.subjectName}
                                <span className="ml-1 text-indigo-600 dark:text-indigo-400">{selectedClass.className}</span>
                                {selectedClass.isSubstitute && (
                                    <span className="ml-1 text-[9px] bg-orange-500/20 text-orange-500 px-1.5 py-0.5 rounded font-black">สอนแทน</span>
                                )}
                            </p>
                            <p className="text-[9px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5 mt-0.5">
                                <Clock size={9} className="shrink-0" />
                                <span>คาบ {displayPeriod} ({timeLabel})</span>
                                {selectedClass.room && selectedClass.room !== 'all' && (
                                    <>
                                        <span className="text-gray-300 dark:text-gray-600">•</span>
                                        <MapPin size={9} className="shrink-0" />
                                        <span className="truncate">{selectedClass.room}</span>
                                    </>
                                )}
                            </p>
                        </div>

                        {isSubmitted ? (
                            <button
                                onClick={onEdit}
                                disabled={isHoliday}
                                className={`flex items-center justify-center p-3 rounded-xl font-black transition-all shadow-md shrink-0 active:scale-95 ${isHoliday ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}`}
                                title="แก้ไข"
                            >
                                <Edit size={20} />
                            </button>
                        ) : (
                            <button
                                onClick={onSave}
                                disabled={isHoliday}
                                className={`flex items-center justify-center p-3 rounded-xl font-black transition-all shadow-md shrink-0 active:scale-95 ${isHoliday ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                                title="บันทึก"
                            >
                                <Save size={20} />
                            </button>
                        )}
                    </div>
                ) : (
                    /* Desktop: original 2-row layout */
                    <div className="flex items-center justify-between w-full gap-3">
                        <div className="flex-1 text-center min-w-0 px-2">
                            <h2 className="font-extrabold text-gray-800 dark:text-white truncate leading-tight text-base sm:text-xl">
                                {selectedClass.subjectName}
                                <span className="ml-1.5 text-indigo-600 dark:text-indigo-400">{selectedClass.className}</span>
                            </h2>
                            <div className="flex flex-wrap items-center justify-center mt-1 gap-2">
                                <p className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 font-bold whitespace-nowrap bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full text-[11px] sm:text-sm">
                                    <Clock size={14} /> คาบ {displayPeriod} ({timeLabel})
                                </p>
                                {selectedClass.room && selectedClass.room !== 'all' && (
                                    <p className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 font-bold whitespace-nowrap bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full text-[11px] sm:text-sm">
                                        <MapPin size={14} className="shrink-0" /> <span className="truncate">{selectedClass.room}</span>
                                    </p>
                                )}
                                {selectedClass.isSubstitute && (
                                    <span className="bg-orange-500/20 text-orange-600 dark:text-orange-400 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md border border-orange-500/30 font-black uppercase">
                                        สอนแทน{selectedClass.originalTeacherName ? `: ${selectedClass.originalTeacherName}` : ''}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex-shrink-0">
                            {isSubmitted ? (
                                <button
                                    onClick={onEdit}
                                    disabled={isHoliday}
                                    className={`flex items-center justify-center rounded-xl font-black transition-all shadow-md p-2.5 sm:px-7 sm:py-2.5 text-xs sm:text-base ${isHoliday ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-600 text-white active:scale-95'}`}
                                >
                                    <Edit size={20} />
                                    <span className="hidden sm:inline ml-2.5">แก้ไข</span>
                                </button>
                            ) : (
                                <button
                                    onClick={onSave}
                                    disabled={isHoliday}
                                    className={`flex items-center justify-center rounded-xl font-black transition-all shadow-md p-2.5 sm:px-7 sm:py-2.5 text-xs sm:text-base ${isHoliday ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'}`}
                                >
                                    <Save size={20} />
                                    <span className="hidden sm:inline ml-2.5">บันทึก</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {children}

            {/* Summary Cards */}
            <AttendanceSummary summary={attendanceSummary} />

            {/* Student Grid */}
            <StudentGrid
                students={students}
                attendance={attendance}
                studentLeaves={studentLeaves}
                isSubmitted={isSubmitted}
                isHoliday={isHoliday}
                loading={studentsLoading}
                schoolId={schoolId}
                onToggleStatus={onToggleStatus}
            />
        </div>
    );
};

export default AttendanceCheckView;
