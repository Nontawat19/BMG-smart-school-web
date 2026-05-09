import React from 'react';
import { Filter, BookOpen, AlertCircle, Users, ChevronLeft, MapPin } from 'lucide-react';
import { Course } from '../types';

interface CourseSelectionStateProps {
    selectedClass: string;
    selectedRoom: string;
    CLASSES: Record<string, string>;
    filteredCourses: Course[];
    setSelectedCourse: (courseId: string) => void;
    teacherMap: any;
}

const CourseSelectionState: React.FC<CourseSelectionStateProps> = ({
    selectedClass,
    selectedRoom,
    CLASSES,
    filteredCourses,
    setSelectedCourse,
    teacherMap,
}) => {
    if (!selectedClass) {
        return (
            <div className="p-20 text-center">
                <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Filter className="text-indigo-600" size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-400">กรุณาเลือกชั้นเรียนเพื่อเริ่มจัดการคะแนน</h3>
            </div>
        );
    }

    const classLabel = CLASSES[selectedClass] || selectedClass;

    return (
        <div className="p-8 animate-in fade-in duration-500">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600">
                    <BookOpen size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">เลือกรายวิชา</h3>
                    <p className="text-sm text-gray-500">รายวิชาที่เปิดสอนในชั้น {classLabel} {selectedRoom ? `ห้อง ${selectedRoom}` : ''}</p>
                </div>
            </div>

            {filteredCourses.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                    <AlertCircle className="mx-auto text-gray-300 mb-2" size={48} />
                    <p className="text-gray-500">ไม่พบรายวิชาที่ตรงกับเงื่อนไขในหลักสูตร</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCourses.map(course => {
                        const assignments = (course as any).teacherAssignments || [];
                        
                        // สร้าง Label สำหรับกลุ่ม/ห้อง เพื่อแสดงแทน "ทุกห้อง"
                        const groupLabels = assignments.map((a: any) => {
                            const gradeShort = classLabel.replace('มัธยมศึกษาปีที่ ', 'ม.');
                            return `${gradeShort}/${a.groupNumber}`;
                        });

                        return (
                            <button
                                key={course.id}
                                onClick={() => setSelectedCourse(course.id)}
                                className="flex flex-col p-5 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-2xl hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 transition-all text-left group relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <BookOpen size={48} />
                                </div>
                                <span className="text-[10px] font-black tracking-tighter text-indigo-600 dark:text-indigo-400 mb-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-full w-fit">{course.code}</span>
                                <h4 className="font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors mb-2 line-clamp-2">{course.title}</h4>

                                <div className="mt-1 mb-4 flex flex-wrap gap-1.5">
                                    <span className="text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                                        <MapPin size={8} />
                                        {groupLabels.length > 0 ? groupLabels.join(', ') : (course.room?.includes('all') ? 'ทุกห้อง' : `ห้อง ${course.room?.join(', ')}`)}
                                    </span>
                                </div>

                                <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2">
                                    {assignments.length > 0 ? (
                                        assignments.map((a: any, idx: number) => (
                                            <div key={idx} className="flex items-start gap-2 text-[10px]">
                                                <div className="w-4 h-4 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
                                                    <Users size={10} />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-bold text-gray-700 dark:text-gray-300 truncate">
                                                        {teacherMap[a.teacherId]?.name || 'ไม่ระบุชื่อครู'}
                                                    </span>
                                                    <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-black tracking-tight">
                                                        กลุ่ม {a.groupNumber} • {(a.targetRooms && a.targetRooms.length > 0) ? a.targetRooms.join(', ') : classLabel}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 italic">
                                            <Users size={10} />
                                            <span>ไม่ระบุครูผู้สอน</span>
                                        </div>
                                    )}
                                    <div className="absolute bottom-4 right-4 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all text-indigo-500">
                                        <ChevronLeft size={16} className="rotate-180" />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CourseSelectionState;
