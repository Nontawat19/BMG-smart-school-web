import React from 'react';
import BackButton from "@/components/Shared/BackButton";
import { ChevronLeft, GraduationCap, Sparkles, BookOpen } from 'lucide-react';
import { Course } from '../types';

interface GradeBookHeaderProps {
    currentCourse: Course | undefined;
    curriculumClassDisplay: string;
    curriculumRoomDisplay: string;
    academicYear: string;
}

const GradeBookHeader: React.FC<GradeBookHeaderProps> = ({
    currentCourse,
    curriculumClassDisplay,
    curriculumRoomDisplay,
    academicYear,
}) => {
    return (
        <div className="flex items-center justify-between mb-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <BackButton to="/academic/hub/evaluation" />
                <div className="flex items-center gap-2 min-w-0">
                    <GraduationCap className="text-blue-600 flex-shrink-0" size={22} />
                    <h1 className="text-base md:text-lg font-black text-gray-900 dark:text-white tracking-tight truncate">
                        ทะเบียนวัดผล (ปพ.5) <span className="text-blue-600">ปีการศึกษา {academicYear}</span>
                    </h1>
                </div>
            </div>
            {currentCourse && (
                <div className="flex items-center gap-2 flex-shrink-0 animate-in fade-in duration-300">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black rounded-lg border border-indigo-100 dark:border-indigo-800">
                        <Sparkles size={10} />
                        {curriculumClassDisplay} {curriculumRoomDisplay ? `ห้อง ${curriculumRoomDisplay}` : '(ทุกห้อง)'}
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-bold rounded-lg border border-gray-200 dark:border-gray-700">
                        <BookOpen size={10} />
                        {currentCourse.code}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GradeBookHeader;
