import React, { useState } from 'react';
import { Clock, ChevronLeft, MapPin, LayoutList, LayoutGrid } from 'lucide-react';
import { CourseSchedule } from '../types';
import { ScheduleCardSkeleton } from './Skeletons';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';

interface ScheduleListViewProps {
    schedules: CourseSchedule[];
    loading: boolean;
    onSelectClass: (schedule: CourseSchedule) => void;
    inactiveCourseIds: Set<string>;
    isCurrentPeriod: (start: string, end: string) => boolean;
    currentDate: Date;
}

const ScheduleListView: React.FC<ScheduleListViewProps> = ({
    schedules,
    loading,
    onSelectClass,
    inactiveCourseIds,
    isCurrentPeriod,
    currentDate,
}) => {
    const isPwaMode = usePwaMode();
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

    if (loading) {
        return (
            <div className="grid grid-cols-1 gap-4">
                {[...Array(3)].map((_, i) => <ScheduleCardSkeleton key={i} />)}
            </div>
        );
    }

    if (schedules.length === 0) {
        return (
            <div className="text-center py-10 bg-white dark:bg-[#2a2b2f] rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                <Clock size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">ไม่มีตารางสอนในวันนี้</p>
            </div>
        );
    }

    const filteredSchedules = schedules.filter(s => s.isSubstitute || !s.courseId || !inactiveCourseIds.has(s.courseId));

    const getDisplayPeriod = (schedule: CourseSchedule) =>
        schedule.isSubstitute && schedule.period === 0
            ? '1'
            : schedule.isDoublePeriod && schedule.periods
                ? schedule.periods.join('-')
                : String(schedule.period);

    const getTimeLabel = (schedule: CourseSchedule) =>
        schedule.startTime || schedule.endTime
            ? `${schedule.startTime || '-'}-${schedule.endTime || '-'}`
            : '-';

    return (
        <div className="space-y-3">
            {/* View toggle — desktop only */}
            {!isPwaMode && (
                <div className="flex justify-end">
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                            title="มุมมองรายการ"
                        >
                            <LayoutList size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                            title="มุมมองกริด"
                        >
                            <LayoutGrid size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* List view */}
            {(isPwaMode || viewMode === 'list') && (
                <div className="grid grid-cols-1 gap-4">
                    {filteredSchedules.map((schedule) => {
                        const isNow = isCurrentPeriod(schedule.startTime, schedule.endTime) && currentDate.toDateString() === new Date().toDateString();
                        const displayPeriod = getDisplayPeriod(schedule);
                        const timeLabel = getTimeLabel(schedule);
                        return (
                            <div
                                key={schedule.id + schedule.period}
                                onClick={() => onSelectClass(schedule)}
                                className={`relative p-5 rounded-2xl shadow-sm border transition-all cursor-pointer hover:shadow-md flex justify-between items-center overflow-hidden
                                    ${isNow
                                        ? 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-500 ring-1 ring-indigo-500'
                                        : 'bg-white dark:bg-[#2a2b2f] border-gray-100 dark:border-gray-700'
                                    }`}
                            >
                                {isNow && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.6)]"></div>}
                                <div className={`flex items-center gap-4 ${isNow ? 'pl-2' : ''}`}>
                                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold ${isNow ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'} ${schedule.isDoublePeriod ? 'text-xs' : 'text-lg'}`}>
                                        {!schedule.isSubstitute && schedule.period === 0 ? (
                                            <span>ฮ</span>
                                        ) : schedule.isDoublePeriod ? (
                                            <span className="leading-tight text-center">คาบ<br />{displayPeriod}</span>
                                        ) : (
                                            <span>{displayPeriod}</span>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                            {schedule.subjectName} ชั้น {schedule.className}
                                            {schedule.isSubstitute && (
                                                <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full border border-orange-200">
                                                    สอนแทน: {schedule.originalTeacherName}
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-2 text-sm">
                                            {schedule.subjectCode && <span className="font-medium text-indigo-600 dark:text-indigo-400">{schedule.subjectCode}</span>}
                                            {schedule.subjectCode && <span className="w-1 h-1 bg-gray-300 rounded-full"></span>}
                                            <span className="inline-flex items-center gap-1"><Clock size={14} /> {timeLabel}</span>
                                            {schedule.room && schedule.room !== 'all' && (
                                                <>
                                                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                    <span className="inline-flex items-center gap-1"><MapPin size={14} /> {schedule.room}</span>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-indigo-600 dark:text-indigo-400">
                                    <ChevronLeft size={24} className="rotate-180" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Grid view — desktop only */}
            {!isPwaMode && viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredSchedules.map((schedule) => {
                        const isNow = isCurrentPeriod(schedule.startTime, schedule.endTime) && currentDate.toDateString() === new Date().toDateString();
                        const displayPeriod = getDisplayPeriod(schedule);
                        const timeLabel = getTimeLabel(schedule);
                        return (
                            <div
                                key={schedule.id + schedule.period}
                                onClick={() => onSelectClass(schedule)}
                                className={`relative p-4 rounded-2xl shadow-sm border transition-all cursor-pointer hover:shadow-md overflow-hidden flex flex-col gap-3
                                    ${isNow
                                        ? 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-500 ring-1 ring-indigo-500'
                                        : 'bg-white dark:bg-[#2a2b2f] border-gray-100 dark:border-gray-700'
                                    }`}
                            >
                                {isNow && <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.6)]"></div>}

                                {/* Period badge + substitute tag */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-bold shrink-0
                                        ${isNow ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}
                                        ${schedule.isDoublePeriod ? 'text-[10px]' : 'text-base'}`}
                                    >
                                        {!schedule.isSubstitute && schedule.period === 0 ? (
                                            <span>ฮ</span>
                                        ) : schedule.isDoublePeriod ? (
                                            <span className="leading-tight text-center">คาบ<br />{displayPeriod}</span>
                                        ) : (
                                            <span>{displayPeriod}</span>
                                        )}
                                    </div>
                                    {schedule.isSubstitute && (
                                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full border border-orange-200 leading-tight">
                                            สอนแทน
                                        </span>
                                    )}
                                </div>

                                {/* Subject + class */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-gray-900 dark:text-white leading-snug line-clamp-2">{schedule.subjectName}</p>
                                    <p className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm mt-0.5">ชั้น {schedule.className}</p>
                                </div>

                                {/* Time + room */}
                                <div className="space-y-1">
                                    <p className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                        <Clock size={11} /> {timeLabel}
                                    </p>
                                    {schedule.room && schedule.room !== 'all' && (
                                        <p className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 ml-2">
                                            <MapPin size={11} /> {schedule.room}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ScheduleListView;
