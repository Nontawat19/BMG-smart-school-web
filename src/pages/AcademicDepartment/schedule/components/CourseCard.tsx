import React from 'react';
import { Users, Lock, MapPin } from 'lucide-react';
import { CourseInstance } from '../types';
import { formatClassDisplay, getClassDisplayName } from '../utils';

export interface CourseCardProps {
    course: CourseInstance;
    isOverlay?: boolean;
    viewType?: 'teacher' | 'class' | 'room';
    teachers?: any[];
}

export const CourseCard: React.FC<CourseCardProps> = ({ course, isOverlay, viewType = 'teacher', teachers = [] }) => {
    const isLocked = course.locked || (course.constraints?.lockedSlots && course.constraints.lockedSlots.length > 0);
    
    // Determine primary label based on view type
    const teacher = teachers.find(t => t.id === course.teacherId || (t.teacherId && t.teacherId === course.teacherId));
    const teacherDisplay = (() => {
        if (!teacher) {
            return (course.teacherId === 'pending' || !course.teacherId || course.teacherId.startsWith('GHOST') ? 'รอระบุครู' : course.teacherId);
        }
        
        const cleanName = (name: string) => {
            if (!name) return '';
            // Remove common Thai titles and academic prefixes
            return name.replace(/^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|ว่าที่\s?ร\.ต\.|ว่าที่ร้อยตรี|อาจารย์|อ\.|ครู)\s?/, '').trim();
        };

        const namePart = cleanName(teacher.firstName || (teacher.name ? teacher.name.split(' ')[0] : ''));
        return `ครู${namePart}`;
    })();

    const classDisplay = Array.isArray(course.classId) 
        ? formatClassDisplay(course.classId)[0] + (course.classId.length > 1 ? ` +${course.classId.length - 1}` : '')
        : course.className || getClassDisplayName(course.classId);

    const mainLabel = viewType === 'teacher' ? classDisplay : teacherDisplay;
    
    // Improved labeling for Groups/Rooms
    const getGroupLabel = (cDisplay: string, gNum: number) => {
        // If it's a standard class like "ม.1", "ป.2", return "ม.1/1"
        if (cDisplay && !cDisplay.includes('+') && !cDisplay.includes(',')) {
            return `${cDisplay}/${gNum}`;
        }
        return `กลุ่ม ${gNum}`;
    };

    const secondaryLabel = viewType === 'teacher' 
        ? getGroupLabel(classDisplay, course.groupNumber || 1) 
        : classDisplay;

    return (
        <div className={`
            group absolute inset-0 transition-all duration-300 flex flex-col items-center justify-center overflow-hidden rounded-xl border
            ${isOverlay 
                ? 'cursor-grabbing bg-indigo-600 dark:bg-indigo-700 text-white ring-[4px] ring-indigo-500/30 z-[9999] scale-105 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)] border-white/30' 
                : 'cursor-grab bg-white dark:bg-[#1a1b1e] border-gray-100 dark:border-white/5 hover:border-indigo-400/50 dark:hover:border-indigo-500/50 hover:shadow-lg dark:hover:shadow-indigo-500/10'
            }
        `}>
            {/* Main Content Container - Ultra Compact */}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-0.5 text-center min-w-0 gap-0 overflow-hidden">
                
                {/* Subject Code - Smaller & Sharper */}
                <span className={`
                    text-[9px] font-black tracking-tighter uppercase tabular-nums leading-none truncate w-full px-0.5
                    ${isOverlay ? 'text-white' : 'text-slate-900 dark:text-slate-100'}
                `}>
                    {course.code}
                </span>
                
                {/* Secondary Info Line (Teacher/Class) */}
                <span className={`
                    text-[7.5px] font-bold tracking-tighter leading-tight truncate w-full whitespace-nowrap px-0.5 mt-[1px]
                    ${isOverlay ? 'text-indigo-100' : 'text-slate-700 dark:text-slate-300'}
                `}>
                    {mainLabel}
                </span>

                {/* Tertiary Info (Group/Class) */}
                <span className={`
                    text-[6.5px] font-bold opacity-50 leading-none truncate w-full whitespace-nowrap px-0.5
                    ${isOverlay ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'}
                `}>
                    {viewType === 'teacher' 
                        ? secondaryLabel 
                        : getGroupLabel(classDisplay, course.groupNumber || 1)
                    }
                </span>
            </div>

            {/* Lock Indicator */}
            {isLocked && (
                <div className="absolute top-1 right-1">
                    <Lock size={7} className={isOverlay ? 'text-white/40' : 'text-amber-500/60'} />
                </div>
            )}
        </div>
    );
};
