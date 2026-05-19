import React from 'react';
import { Users, Lock, MapPin, AlertCircle } from 'lucide-react';
import { CourseInstance } from '../types';
import { formatClassDisplay, getClassDisplayName, thaiFormatClass } from '../utils';

export interface CourseCardProps {
    course: CourseInstance;
    isOverlay?: boolean;
    viewType?: 'teacher' | 'class' | 'room';
    teachers?: any[];
    onHover?: (rect: DOMRect | null) => void;
}

export const CourseCard: React.FC<CourseCardProps> = ({ course, isOverlay, viewType = 'teacher', teachers = [], onHover }) => {
    const isLocked = course.locked || (course.constraints?.lockedSlots && course.constraints.lockedSlots.length > 0);
    
    // Determine primary label based on view type
    const courseTeacherIds = Array.isArray(course.teacherIds) && course.teacherIds.length > 0 ? course.teacherIds : [course.teacherId];
    const teacher = teachers.find(t => t.id === course.teacherId || (t.teacherId && t.teacherId === course.teacherId));
    const teacherDisplay = (() => {
        if (courseTeacherIds.length > 1) {
            return courseTeacherIds.map(id => {
                const item = teachers.find(t => t.id === id || (t.teacherId && t.teacherId === id));
                if (!item) return id;
                const raw = item.firstName || (item.name ? item.name.split(' ')[0] : '');
                return raw.replace(/^(นาย|นาง|นางสาว|น\.ส\.|อาจารย์|อ\.|ครู)\s?/, '').trim();
            }).join(', ');
        }
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
        : thaiFormatClass(course.className || getClassDisplayName(course.classId));

    const mainLabel = viewType === 'teacher' ? classDisplay : teacherDisplay;
    
    // Improved labeling for Groups/Rooms
    const getGroupLabel = (cDisplay: string, gNum: number) => {
        if (!cDisplay) return `ก.${gNum}`;
        
        const hasSlash = cDisplay.includes('/');
        
        // If it already has a slash (e.g. ม.1/1), just append group if not all-groups
        if (hasSlash) {
            return gNum > 0 ? `${cDisplay} ก.${gNum}` : cDisplay;
        }
        
        // If it's just a level (e.g. ม.1), and we have a group but no room info in display
        // We'll show as ม.1 ก.{gNum}
        return gNum > 0 ? `${cDisplay} ก.${gNum}` : cDisplay;
    };

    const secondaryLabel = getGroupLabel(classDisplay, course.groupNumber || 1);

    return (
        <div className={`
            group absolute inset-0 transition-all duration-300 flex flex-col items-center justify-center overflow-hidden rounded-xl border
            ${isOverlay 
                ? 'cursor-grabbing bg-indigo-600 dark:bg-indigo-700 text-white ring-[4px] ring-indigo-500/30 z-[9999] scale-105 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)] border-white/30' 
                : course.isElective
                    ? 'cursor-grab bg-rose-50/70 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/30 hover:border-rose-400/60 dark:hover:border-rose-500/60 hover:shadow-lg hover:shadow-rose-500/10'
                    : 'cursor-grab bg-white dark:bg-[#1a1b1e] border-gray-100 dark:border-white/5 hover:border-indigo-400/50 dark:hover:border-indigo-500/50 hover:shadow-lg dark:hover:shadow-indigo-500/10'
            }
        `}>
            {/* Main Content Container - Ultra Compact */}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-0.5 text-center min-w-0 gap-0 overflow-hidden">
                
                {/* Subject Code - Smaller & Sharper */}
                <span className={`
                    text-[9px] font-black tracking-tighter uppercase tabular-nums leading-none truncate w-full px-0.5
                    ${isOverlay ? 'text-white' : course.isElective ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}
                `}>
                    {course.code}{course.isElective && <span className="text-[7.5px] font-black text-rose-500/80 ml-0.5">(เลือก)</span>}
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

            {/* Info Indicator - Bottom Right */}
            <div 
                className="absolute bottom-1 right-1 opacity-30 group-hover:opacity-100 transition-opacity duration-200 cursor-help z-50"
                onMouseEnter={(e) => {
                    e.stopPropagation();
                    onHover?.(e.currentTarget.getBoundingClientRect());
                }}
                onMouseLeave={(e) => {
                    e.stopPropagation();
                    onHover?.(null);
                }}
            >
                <AlertCircle size={7} className={isOverlay ? 'text-white/40' : 'text-indigo-500/60'} />
            </div>
        </div>
    );
};
