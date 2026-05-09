import React from 'react';
import { SortableContext } from '@dnd-kit/sortable';
import { BookOpen, Search } from 'lucide-react';
import { CourseInstance } from '../types';
import { DraggableCourse } from './DraggableCourse';

interface CourseBankProps {
    availableCourseInstances: CourseInstance[];
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    groupedCourses: Record<string, CourseInstance[]>;
}

export const CourseBank: React.FC<CourseBankProps> = ({
    availableCourseInstances,
    searchTerm,
    setSearchTerm,
    groupedCourses
}) => {
    return (
        <SortableContext items={[...availableCourseInstances.map(c => c.instanceId), 'course-bank']}>
            <div id="course-bank" className="bg-white/80 dark:bg-[#1a1b1e]/80 backdrop-blur-xl rounded-[2.5rem] p-6 shadow-2xl shadow-indigo-100/20 dark:shadow-none border border-white dark:border-white/5 flex flex-col h-full max-h-[calc(100vh-220px)]">
                <div className="flex items-center justify-between mb-6 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                             <BookOpen size={20} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                            คลังรายวิชา
                        </h2>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400">
                            {availableCourseInstances.length}
                        </span>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative mb-6 flex-shrink-0 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="ค้นหาวิชา..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
                    />
                </div>

                <div className="space-y-6 overflow-y-auto pr-2 flex-grow custom-scrollbar">
                    {Object.keys(groupedCourses).length > 0 ? (
                        Object.entries(groupedCourses).map(([groupName, courses]) => (
                            <div key={groupName} className="group/item">
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center justify-between px-1">
                                    {groupName}
                                    <div className="h-px flex-grow mx-3 bg-slate-100 dark:bg-white/5"></div>
                                    <span className="bg-slate-50 dark:bg-white/5 px-2 py-0.5 rounded-lg border border-slate-100 dark:border-white/5">
                                        {courses.length}
                                    </span>
                                </h3>
                                <div className="grid grid-cols-1 gap-3">
                                    {courses.map(courseInstance => (
                                        <div key={courseInstance.instanceId} className="h-16">
                                            <DraggableCourse course={courseInstance} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-16 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
                            <div className="h-16 w-16 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mb-4">
                                <Search size={28} className="opacity-20" />
                            </div>
                            <p className="text-sm font-bold">ไม่พบรายวิชาที่ต้องการ</p>
                        </div>
                    )}
                </div>
            </div>
        </SortableContext>
    );
};

