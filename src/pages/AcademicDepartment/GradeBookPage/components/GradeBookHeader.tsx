import React from 'react';
import { Link } from 'react-router-dom';
<<<<<<< HEAD
import BackButton from "@/components/Shared/BackButton";
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
<<<<<<< HEAD
                <BackButton to="/academic/hub/evaluation" className="mb-2" />
=======
                <Link to="/academic-admin" className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline mb-2 text-sm font-bold">
                    <ChevronLeft size={16} /> กลับหน้าบริหารวิชาการ
                </Link>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                <h1 className="text-2xl md:text-3xl font-black flex items-center flex-wrap gap-x-3 text-gray-900 dark:text-white tracking-tight leading-none">
                    <GraduationCap className="text-blue-600 flex-shrink-0" size={36} />
                    <span>ทะเบียนวัดผล (ปพ.5) ปีการศึกษา {academicYear}</span>
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-3 font-medium">จัดการคะแนนและประเมินผลสัมฤทธิ์ทางการเรียน</p>
                {currentCourse && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-500">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-black rounded-lg border border-indigo-100 dark:border-indigo-800 shadow-sm">
                            <Sparkles size={12} />
                            ข้อมูลหลักสูตร: {curriculumClassDisplay} {curriculumRoomDisplay ? `ห้อง ${curriculumRoomDisplay}` : '(ทุกห้อง)'}
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[11px] font-bold rounded-lg border border-gray-200 dark:border-gray-700">
                            <BookOpen size={12} />
                            รหัสวิชา: {currentCourse.code}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GradeBookHeader;
