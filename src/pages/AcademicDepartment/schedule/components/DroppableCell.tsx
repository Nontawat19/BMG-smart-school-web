import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Check, X, Ban, Lock, Unlock, User, Info, Trash2, Plus } from 'lucide-react';
import { CourseInstance } from '../types';
import { DraggableCourse } from './DraggableCourse';

export interface DroppableCellProps {
    id: string;
    rawSlotId: string;
    courses: CourseInstance[];
    isTeacherPermanentUnavailable: boolean;
    isCourseDisallowedDay: boolean;
    isDynamicUnavailable: boolean;
    isSpecialPeriod: boolean;
    specialPeriodTitle: string | null;
    isOccupiedByOtherClass: boolean;
    occupiedByOtherClassInfo: { classId: string | string[]; courseTitle: string } | null;
    occupiedByAnotherTeacherInfo: { classId: string; courseTitle: string; teacherName: string; isLocked: boolean; } | null;
    onClick: () => void;
    onLockToggle?: (slotId: string, instanceId: string) => void;
    isDraggingOver: boolean;
    isDropForbidden: boolean;
    forbiddenMessage?: string;
    isDoublePartner?: boolean;
    handleRemoveCourse?: (slotId: string, instanceId: string) => void;
    isFilteredOut?: boolean;
    type?: 'teacher' | 'room' | 'class';
    teachers?: any[];
    selectedTeacherId?: string;
    onHover?: (rect: DOMRect | null) => void;
    selectedCourseCode?: string;
    onCellClick?: (slotId: string) => void;
}

export const DroppableCell: React.FC<DroppableCellProps> = ({
    id,
    rawSlotId,
    courses,
    isTeacherPermanentUnavailable,
    isCourseDisallowedDay,
    isDynamicUnavailable,
    isSpecialPeriod,
    specialPeriodTitle,
    isOccupiedByOtherClass,
    occupiedByOtherClassInfo,
    occupiedByAnotherTeacherInfo,
    onClick,
    onLockToggle,
    isDraggingOver,
    isDropForbidden,
    forbiddenMessage,
    isDoublePartner,
    handleRemoveCourse,
    isFilteredOut,
    type,
    teachers,
    selectedTeacherId,
    onHover,
    selectedCourseCode,
    onCellClick,
}) => {
    const { setNodeRef, isOver } = useDroppable({ 
        id,
        data: {
            isSpecialPeriod,
            isDropForbidden,
            slotId: rawSlotId
        }
    });

    const parts = rawSlotId.split('-');
    const slotIndex = parseInt(parts[1]);

    let cellClass = 'bg-gray-50/50 dark:bg-white/[0.02] border-gray-100 dark:border-white/[0.03]';
    let content = null;
    let overlayEffect = null;

    if (isFilteredOut) {
        cellClass = 'bg-gray-100/50 dark:bg-white/[0.01] border-gray-200/50 dark:border-white/[0.02] opacity-30';
    } else if (isTeacherPermanentUnavailable || isCourseDisallowedDay) {
        cellClass = 'bg-red-500/5 dark:bg-[#1a1111] border-red-500/20';
        content = <Ban size={14} className="text-red-500/30" />;
    } else if (isOver) {
        if (isDropForbidden) {
            cellClass = 'bg-rose-500/20 border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.3)]';
            overlayEffect = (
                <div className="absolute inset-0 border-2 border-rose-500/40 rounded-xl animate-pulse z-30 flex flex-col items-center justify-center bg-rose-500/10 p-1">
                    <X size={20} className="text-rose-500/70" />
                    {forbiddenMessage && <span className="text-[6px] font-black text-rose-600 dark:text-rose-400 text-center uppercase tracking-tighter leading-none mt-1">{forbiddenMessage}</span>}
                </div>
            );
        } else {
            cellClass = 'bg-indigo-500/20 border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-[1.02] z-20';
            overlayEffect = (
                <div className="absolute inset-0 border-2 border-indigo-500/40 rounded-xl animate-pulse z-30 flex flex-col items-center justify-center bg-indigo-500/10">
                    <Check size={20} className="text-indigo-500/70" />
                    {isDoublePartner && <span className="text-[6px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mt-1">Double</span>}
                </div>
            );
        }
    } else if (isDraggingOver && isDoublePartner && !isDropForbidden) {
        cellClass = 'bg-indigo-500/5 border-indigo-500/20 border-dashed animate-pulse';
        content = (
            <div className="flex flex-col items-center justify-center h-full opacity-30">
                 <span className="text-[6px] font-black text-indigo-500 uppercase tracking-widest">Double</span>
            </div>
        );
    } else if (isSpecialPeriod) {
        cellClass = 'bg-indigo-50/50 dark:bg-white/[0.03] border-indigo-100/50 dark:border-white/5 shadow-sm';
        content = (
            <div className="flex flex-col items-center justify-center h-full p-0.5 text-center gap-0.5">
               <span className="text-[8px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-tighter leading-none whitespace-nowrap truncate w-full px-0.5">
                  {specialPeriodTitle}
               </span>
               <Lock size={6} className="text-indigo-600 dark:text-indigo-300 opacity-40" />
            </div>
        );
    } else if (isDynamicUnavailable && type === 'teacher') {
        cellClass = 'bg-amber-50 dark:bg-[#1a1612] border-amber-200 dark:border-amber-900/50 shadow-sm';
        content = (
            <div className="flex flex-col items-center justify-center h-full gap-0.5">
                <span className="text-[10px] font-black text-amber-600 dark:text-amber-500">ว่าง</span>
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-600 shadow-sm"></div>
            </div>
        );
    } else if (courses.length > 0) {
        cellClass = 'bg-white dark:bg-white/[0.02] border-gray-100 dark:border-white/5 shadow-sm';
        content = (
            <div className={`h-full w-full relative`}>
                {courses.map(c => (
                    <DraggableCourse 
                        key={c.instanceId} 
                        course={c} 
                        showRemove={true} 
                        onRemove={() => handleRemoveCourse?.(rawSlotId, c.instanceId)} 
                        onLockToggle={() => onLockToggle?.(rawSlotId, c.instanceId)}
                        viewType={type}
                        teachers={teachers}
                    />
                ))}
            </div>
        );
    } else if (isOccupiedByOtherClass) {
        cellClass = 'bg-gray-100/50 dark:bg-white/[0.02] border-gray-200/50 dark:border-white/5 opacity-40';
        content = <div className="text-[6px] font-bold text-gray-400 text-center px-0.5 truncate">{occupiedByOtherClassInfo?.courseTitle}</div>;
    } else {
        content = (
            <div className={`
                flex items-center justify-center h-full transition-all duration-300
                ${(isDraggingOver || selectedCourseCode) ? 'opacity-100 scale-100' : 'opacity-[0.03] group-hover:opacity-20'}
            `}>
                <div className={`
                    flex items-center justify-center rounded-full border-2 border-dashed
                    ${(isDraggingOver || selectedCourseCode) ? 'w-8 h-8 animate-pulse border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'w-6 h-6 border-gray-400 dark:border-gray-500'}
                `}>
                    <Plus size={(isDraggingOver || selectedCourseCode) ? 18 : 14} className={(isDraggingOver || selectedCourseCode) ? 'text-indigo-500' : 'text-gray-400'} />
                </div>
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            onClick={onClick}
            onMouseEnter={(e) => onHover?.(e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => onHover?.(null)}
            className={`
                group relative h-full rounded-lg border transition-all duration-500
                ${cellClass} 
                ${selectedCourseCode && courses.length === 0 ? 'cursor-pointer hover:border-indigo-500/50 hover:ring-2 hover:ring-indigo-500/20 active:scale-95' : ''}
            `}
        >
            {/* 1. SLOT LOCK TRIGGER (Top-Left) - Shifted slightly inside to avoid collision */}
            {type === 'teacher' && !isSpecialPeriod && courses.length === 0 && !isDynamicUnavailable && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick();
                    }}
                    className="absolute top-0 left-0 z-40 w-4 h-4 rounded-tl-lg rounded-br-md bg-amber-500/40 hover:bg-amber-600 text-white flex items-center justify-center transition-all shadow-sm hover:scale-110 active:scale-95 opacity-60 hover:opacity-100 group-hover:opacity-100"
                    title="ล็อคคาบว่าง"
                >
                    <Lock size={7} strokeWidth={4} />
                </button>
            )}

            {/* 2. CANCEL LOCK TRIGGER (Top-Right) */}
            {type === 'teacher' && isDynamicUnavailable && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick();
                    }}
                    className="absolute top-0 right-0 z-40 w-4 h-4 rounded-tr-lg rounded-bl-md bg-rose-500/40 hover:bg-rose-600 text-white flex items-center justify-center transition-all shadow-sm hover:scale-110 active:scale-95 opacity-60 hover:opacity-100 group-hover:opacity-100"
                    title="ยกเลิกคาบว่าง"
                >
                    <Trash2 size={7} strokeWidth={4} />
                </button>
            )}

            {/* 3. MAIN CONTENT AREA */}
            <div className="relative h-full w-full overflow-hidden rounded-lg">
                {content}
                {overlayEffect}
                
                {/* Visual Polish */}
                <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/[0.03] transition-colors pointer-events-none" />
            </div>
        </div>
    );
};
