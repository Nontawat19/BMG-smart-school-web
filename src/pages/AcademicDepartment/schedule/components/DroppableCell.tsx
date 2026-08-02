import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Check, X, Ban, Lock, Unlock, User, Info, Trash2, Plus } from 'lucide-react';
import { CourseInstance, Teacher } from '../types';
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
    onToggleUnavailable?: () => void;
    onRemoveUnavailable?: () => void;
    onLockToggle?: (slotId: string, instanceId: string, course?: CourseInstance) => void;
    isDraggingOver: boolean;
    isDropForbidden: boolean;
    forbiddenMessage?: string;
    isDoublePartner?: boolean;
    handleRemoveCourse?: (slotId: string, instanceId: string, course?: CourseInstance) => void;
    isFilteredOut?: boolean;
    type?: 'teacher' | 'room' | 'class';
    teachers?: Teacher[];
    selectedTeacherId?: string;
    onHover?: (rect: DOMRect | null) => void;
    selectedCourseCode?: string;
    onCellClick?: (slotId: string) => void;
    onCourseClick?: (course: CourseInstance) => void;
    span?: number;
    getCoursePeriodSummary?: (course: CourseInstance) => {
        scheduled: number;
        total: number;
    };
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
    onToggleUnavailable,
    onRemoveUnavailable,
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
    onCourseClick,
    span = 1,
    getCoursePeriodSummary,
}) => {
    const { setNodeRef, isOver } = useDroppable({ 
        id,
        data: {
            isSpecialPeriod,
            isDropForbidden,
            forbiddenMessage,
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
            cellClass = 'bg-emerald-500/20 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.3)] scale-[1.02] z-20';
            overlayEffect = (
                <div className="absolute inset-0 border-2 border-emerald-500/40 rounded-xl animate-pulse z-30 flex flex-col items-center justify-center bg-emerald-500/10">
                    <Check size={20} className="text-emerald-500/70" />
                    {isDoublePartner && <span className="text-[6px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-1">Double</span>}
                </div>
            );
        }
    } else if (isDraggingOver && isDoublePartner && !isDropForbidden) {
        cellClass = 'bg-emerald-500/5 border-emerald-500/20 border-dashed animate-pulse';
        content = (
            <div className="flex flex-col items-center justify-center h-full opacity-30">
                 <span className="text-[6px] font-black text-emerald-500 uppercase tracking-widest">Double</span>
            </div>
        );
    } else if (isSpecialPeriod) {
        cellClass = 'bg-indigo-50/50 dark:bg-white/[0.03] border-indigo-100/50 dark:border-white/5 shadow-sm';
        content = (
            <div className="flex flex-col items-center justify-center h-full p-0.5 2xl:p-1 text-center gap-0.5 2xl:gap-1">
               <span className="text-[10px] lg:text-[11px] 2xl:text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-tighter leading-[1.1] line-clamp-2 w-full px-0.5 break-words">
                  {specialPeriodTitle}
               </span>
               <Lock size={10} className="text-indigo-600 dark:text-indigo-300 opacity-40 mt-0.5" />
            </div>
        );
    } else if (isDynamicUnavailable && type === 'teacher') {
        cellClass = 'bg-amber-50 dark:bg-[#1a1612] border-amber-200 dark:border-amber-900/50 shadow-sm';
        content = (
            <div className="flex flex-col items-center justify-center h-full gap-0.5 2xl:gap-1">
                <span className="text-[10px] 2xl:text-xs font-black text-amber-600 dark:text-amber-500">ว่าง</span>
                <div className="w-1.5 h-1.5 2xl:w-2 2xl:h-2 rounded-full bg-amber-400 dark:bg-amber-600 shadow-sm mt-0.5"></div>
            </div>
        );
    } else if (courses.length > 0) {
        cellClass = 'bg-white dark:bg-white/[0.02] border-gray-100 dark:border-white/5 shadow-sm';
        content = (
            <div className={`h-full w-full flex ${courses.length > 1 ? 'flex-row gap-0.5 p-0.5' : 'flex-col p-0'}`}>
                {courses.map(c => (
                    <div key={c.instanceId} className={`flex-1 relative ${courses.length > 1 ? 'min-w-0 h-full' : 'w-full h-full'}`}>
                        <DraggableCourse 
                            course={c} 
                            showRemove={true} 
                            onRemove={() => handleRemoveCourse?.(rawSlotId, c.instanceId, c)} 
                            onLockToggle={() => onLockToggle?.(rawSlotId, c.instanceId, c)}
                            viewType={type}
                            teachers={teachers}
                            onClick={onCourseClick}
                            periodSummary={getCoursePeriodSummary?.(c)}
                            onHover={(rect) => {
                                if (!rect) {
                                    onHover?.(null);
                                } else {
                                    onHover?.(rect);
                                }
                            }}
                        />
                    </div>
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
                ${(isDraggingOver || selectedCourseCode) ? 'opacity-100 scale-100' : 'opacity-[0.03] group-hover:opacity-10'}
            `}>
                <div className={`
                    flex items-center justify-center rounded-full border-2 border-dashed
                    ${(isDraggingOver || selectedCourseCode) ? 'w-8 h-8 animate-pulse border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'w-6 h-6 border-gray-300 dark:border-gray-600'}
                `}>
                    <Plus size={(isDraggingOver || selectedCourseCode) ? 18 : 14} className={(isDraggingOver || selectedCourseCode) ? 'text-emerald-500' : 'text-gray-400 dark:text-gray-500'} />
                </div>
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            onClick={() => {
                if (selectedCourseCode) {
                    onCellClick?.(rawSlotId);
                }
            }}
            className={`
                group relative h-full rounded-xl border transition-all duration-500
                ${cellClass} 
                ${selectedCourseCode && courses.length === 0 ? 'cursor-pointer hover:border-indigo-500/50 hover:ring-2 hover:ring-indigo-500/20 active:scale-95' : ''}
            `}
            style={{ gridColumn: span > 1 ? `span ${span}` : undefined }}
        >
            {/* 1. SLOT LOCK TRIGGER (Top-Left) */}
            {type === 'teacher' && !isSpecialPeriod && courses.length === 0 && (
                <>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleUnavailable?.();
                        }}
                        className={`
                            absolute top-0 left-0 z-40 w-4 h-4 rounded-tl-xl rounded-br-md 
                            flex items-center justify-center transition-all shadow-sm 
                            hover:scale-110 active:scale-95 
                            ${isDynamicUnavailable 
                                ? 'bg-rose-500/60 hover:bg-rose-600 text-white opacity-90' 
                                : 'bg-amber-500/40 hover:bg-amber-600 text-white opacity-40 hover:opacity-100 group-hover:opacity-80'}
                        `}
                        title={isDynamicUnavailable ? "ยกเลิกการล็อคคาบว่าง" : "ล็อคคาบว่าง (ไม่ให้จัดตารางลงคาบนี้)"}
                    >
                        {isDynamicUnavailable ? <Unlock size={7} strokeWidth={4} /> : <Lock size={7} strokeWidth={4} />}
                    </button>
                    {isDynamicUnavailable && onRemoveUnavailable && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveUnavailable();
                            }}
                            className="absolute top-0 right-0 z-40 w-4 h-4 rounded-tr-xl rounded-bl-md bg-rose-500/60 hover:bg-rose-600 text-white flex items-center justify-center transition-all shadow-sm hover:scale-110 active:scale-95 opacity-90"
                            title="ลบคาบว่าง"
                        >
                            <Trash2 size={7} strokeWidth={4} />
                        </button>
                    )}
                </>
            )}

            {/* 3. MAIN CONTENT AREA */}
            <div className="relative h-full w-full overflow-hidden rounded-xl">
                {content}
                {overlayEffect}
                
                {/* Visual Polish */}
                <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/[0.03] transition-colors pointer-events-none" />
            </div>
        </div>
    );
};
