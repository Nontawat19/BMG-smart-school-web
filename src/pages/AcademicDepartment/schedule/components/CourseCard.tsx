import React from 'react';
import { Users, Lock, MapPin, AlertCircle } from 'lucide-react';
import { CourseInstance, Teacher } from '../types';
import { formatClassDisplay, getClassDisplayName, thaiFormatClass } from '../utils';

export interface CourseCardProps {
    course: CourseInstance;
    isOverlay?: boolean;
    viewType?: 'teacher' | 'class' | 'room';
    teachers?: Teacher[];
    onHover?: (rect: DOMRect | null) => void;
    periodSummary?: {
        scheduled: number;
        total: number;
    };
}

export const CourseCard: React.FC<CourseCardProps> = ({ course, isOverlay, viewType = 'teacher', teachers = [], onHover }) => {
    const isLocked = course.locked || (course.constraints?.lockedSlots && course.constraints.lockedSlots.length > 0);
    const isTemporary = Boolean(course.isTemporarySchedule);
    const isRelaxed = Boolean(course.isRelaxedSchedule);
    
    // Determine primary label based on view type
    const courseTeacherIds = Array.isArray(course.teacherIds) && course.teacherIds.length > 0 ? course.teacherIds : [course.teacherId];
    const primaryTeacherId = courseTeacherIds.find(Boolean) || course.teacherId;
    const teacher = teachers.find(t => t.id === primaryTeacherId || (t.teacherId && t.teacherId === primaryTeacherId));
    const teacherDisplay = (() => {
        if (!teacher) {
            return (primaryTeacherId === 'pending' || !primaryTeacherId || primaryTeacherId.startsWith('GHOST') ? 'รอระบุครู' : primaryTeacherId);
        }
        
        const cleanName = (name: string) => {
            if (!name) return '';
            // Remove common Thai titles and academic prefixes
            return name.replace(/^(พระสามเณร|พระมหา|พระครู|พระใบฎีกา|หลวงพ่อ|พระอาจารย์|พระ|สามเณร|นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|ว่าที่\s?ร\.ต\.|ว่าที่ร้อยตรี|อาจารย์|อ\.|ครู)\s?/, '').trim();
        };

        const namePart = cleanName(teacher.firstName || (teacher.name ? teacher.name.split(' ')[0] : ''));
        return `ครู${namePart}`;
    })();

    const classDisplay = Array.isArray(course.classId) 
        ? formatClassDisplay(course.classId)[0] + (course.classId.length > 1 ? ` +${course.classId.length - 1}` : '')
        : thaiFormatClass(course.className || getClassDisplayName(course.classId));

    const mainLabel = viewType === 'teacher' ? classDisplay : teacherDisplay;
    

    return (
        <div 
            className={`
            group absolute inset-0 transition-all duration-300 flex flex-col items-center justify-center overflow-hidden rounded-xl border min-w-0
            ${isOverlay 
                ? 'cursor-grabbing bg-indigo-600 dark:bg-indigo-700 text-white ring-[4px] ring-indigo-500/30 z-[9999] scale-105 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.4)] border-white/30' 
                : isTemporary
                    ? 'cursor-grab bg-amber-50/90 dark:bg-amber-950/30 border-amber-300/80 dark:border-amber-700/60 hover:border-amber-500/80 dark:hover:border-amber-500/80 hover:shadow-lg hover:shadow-amber-500/10'
                    : isRelaxed
                    ? 'cursor-grab bg-orange-50/80 dark:bg-orange-950/20 border-orange-200/60 dark:border-orange-900/30 hover:border-orange-400/60 dark:hover:border-orange-500/60 hover:shadow-lg hover:shadow-orange-500/10'
                    : course.isElective
                    ? 'cursor-grab bg-rose-50/70 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/30 hover:border-rose-400/60 dark:hover:border-rose-500/60 hover:shadow-lg hover:shadow-rose-500/10'
                    : 'cursor-grab bg-white dark:bg-[#1a1b1e] border-gray-100 dark:border-white/5 hover:border-indigo-400/50 dark:hover:border-indigo-500/50 hover:shadow-lg dark:hover:shadow-indigo-500/10'
            }
        `}
            onMouseEnter={(e) => {
                e.stopPropagation();
                onHover?.(e.currentTarget.getBoundingClientRect());
            }}
            onMouseLeave={(e) => {
                e.stopPropagation();
                onHover?.(null);
            }}
            onPointerLeave={(e) => {
                e.stopPropagation();
                onHover?.(null);
            }}
        >
            {/* Main Content Container - Ultra Compact */}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-0.5 py-0.5 text-center min-w-0 gap-0 overflow-hidden">
                
                {/* Subject Code */}
                <span className={`
                    text-[12px] md:text-[13px] font-black uppercase tabular-nums leading-[1.1] truncate w-full px-0.5 shrink-0 max-w-full
                    ${isOverlay ? 'text-white' : isTemporary ? 'text-amber-800 dark:text-amber-200' : isRelaxed ? 'text-orange-800 dark:text-orange-300' : course.isElective ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}
                `}>
                    {course.code}{isTemporary && <span className="text-[8px] font-black text-amber-600/90 ml-0.5">รอตรวจ</span>}{isRelaxed && <span className="text-[7.5px] font-black text-orange-600/90 ml-0.5">(เงื่อนไขไม่ตรง)</span>}{course.isElective && <span className="text-[8px] font-black text-rose-500/80 ml-0.5">(เลือก)</span>}
                </span>

                {/* Subject Name */}
                <span className={`
                    text-[8px] md:text-[9px] font-bold leading-[1.05] truncate w-full px-0.5 shrink-0 max-w-full
                    ${isOverlay ? 'text-indigo-100' : 'text-slate-700 dark:text-slate-200'}
                `}>
                    {course.title}
                </span>

                {/* Secondary Info Line (Teacher/Class) */}
                <span className={`
                    text-[8px] md:text-[9px] font-bold leading-[1.05] truncate w-full px-0.5 shrink-0 max-w-full
                    ${isOverlay ? 'text-indigo-100' : 'text-slate-600 dark:text-slate-300'}
                `}>
                    {mainLabel}
                </span>
            </div>

            {/* Lock Indicator */}
            {(isLocked || isTemporary || isRelaxed) && (
                <div className="absolute top-1 right-1">
                    {isTemporary ? <AlertCircle size={7} className={isOverlay ? 'text-white/50' : 'text-amber-600/80'} /> : isRelaxed ? <AlertCircle size={7} className={isOverlay ? 'text-white/50' : 'text-orange-500/80'} /> : <Lock size={7} className={isOverlay ? 'text-white/40' : 'text-amber-500/60'} />}
                </div>
            )}
        </div>
    );
};
