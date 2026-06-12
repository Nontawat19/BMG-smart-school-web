import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, Lock, Unlock } from 'lucide-react';
import { CourseInstance } from '../types';
import { CourseCard } from './CourseCard';

interface DraggableCourseProps {
    course: CourseInstance;
    onRemove?: () => void;
    showRemove?: boolean;
    onLockToggle?: (courseId: string) => void;
    viewType?: 'teacher' | 'class' | 'room';
    teachers?: any[];
    onHover?: (rect: DOMRect | null) => void;
    onClick?: (course: CourseInstance) => void;
    periodSummary?: {
        scheduled: number;
        total: number;
    };
}

export const DraggableCourse: React.FC<DraggableCourseProps> = ({ 
    course, 
    onRemove, 
    showRemove, 
    viewType, 
    teachers, 
    onHover, 
    onClick,
    onLockToggle,
    periodSummary
}) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: course.instanceId,
        disabled: course.locked,
        data: {
            type: 'course',
            course: course
        }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="h-full w-full relative group">
            <div
                {...listeners}
                onClick={(e) => {
                    e.stopPropagation();
                    onClick?.(course);
                }}
                className="h-full w-full cursor-grab active:cursor-grabbing"
            >
                <CourseCard course={course} viewType={viewType} teachers={teachers} onHover={onHover} periodSummary={periodSummary} />
            </div>

            {/* Lock/Unlock Button - Match Empty Period Style */}
            {onLockToggle && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onLockToggle(course.instanceId);
                    }}
                    className={`
                        absolute top-0 left-0 z-50 w-4 h-4 rounded-tl-xl rounded-br-md 
                        flex items-center justify-center transition-all shadow-sm 
                        hover:scale-110 active:scale-95 
                        ${course.locked 
                            ? 'bg-rose-500/60 hover:bg-rose-600 text-white opacity-90' 
                            : 'bg-amber-500/40 hover:bg-amber-600 text-white opacity-0 group-hover:opacity-80 hover:opacity-100'}
                    `}
                    title={course.locked ? "ปลดล็อคคาบเรียน" : "ล็อคคาบเรียน (ไม่ให้เคลื่อนย้ายหรือลบ)"}
                >
                    {course.locked ? <Unlock size={7} strokeWidth={4} /> : <Lock size={7} strokeWidth={4} />}
                </button>
            )}
            
            {/* Remove Button - Precision Style (Matched with Lock UI) */}
            {showRemove && onRemove && !course.locked && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onRemove();
                    }}
                    className="absolute top-0 right-0 z-50 w-4 h-4 rounded-tr-xl rounded-bl-md bg-rose-500/40 hover:bg-rose-600 text-white flex items-center justify-center transition-all shadow-sm hover:scale-110 active:scale-95 opacity-0 group-hover:opacity-100"
                    title="ลบวิชา"
                >
                    <Trash2 size={7} strokeWidth={4} />
                </button>
            )}
        </div>
    );
};
