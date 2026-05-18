import React from 'react';
import { DAYS, checkConstraints, getPartnerIndex } from '../utils';
import { DroppableCell } from './DroppableCell';
import { CourseInstance, PeriodSetting, SpecialPeriod, Teacher, Schedule, AssignmentConstraintMap } from '../types';
import { getTimetableDisplayPeriods, normalizePeriodSettings } from '@/utils/scheduleDisplayUtils';

export interface TimetableGridProps {
    title: string;
    subtitle: string;
    type: 'class' | 'teacher' | 'room';
    allDroppableIds: string[];
    periodSettings: PeriodSetting[];
    specialPeriods: SpecialPeriod[];
    teachers: Teacher[];
    selectedTeacher: string;
    selectedSemester: string;
    schedule: Schedule;
    setSchedule: (s: Schedule) => void;
    filterClass: string;
    filterRoom: string;
    schoolMasterSchedule: Record<string, any[]>;
    activeDragItem: CourseInstance | null;
    dynamicUnavailableSlots: string[];
    setDynamicUnavailableSlots: React.Dispatch<React.SetStateAction<string[]>>;
    setAvailableCourseInstances: React.Dispatch<React.SetStateAction<CourseInstance[]>>;
    onCellHover?: (info: { id: string; courses: CourseInstance[]; isDynamicUnavailable: boolean; rect: DOMRect } | null) => void;
    onLockToggle?: (slotId: string, instanceId: string) => void;
    handleRemoveCourse?: (slotId: string, instanceId: string) => void;
    assignmentConstraints: AssignmentConstraintMap;
    selectedTeacherData?: Teacher;
    onCellClick?: (slotId: string) => void;
    selectedCourseCode?: string;
}

export const TimetableGrid: React.FC<TimetableGridProps> = ({
    title,
    subtitle,
    type,
    allDroppableIds,
    periodSettings,
    specialPeriods,
    teachers,
    selectedTeacher,
    selectedTeacherData,
    selectedSemester,
    schedule,
    setSchedule,
    filterClass,
    filterRoom,
    schoolMasterSchedule,
    activeDragItem,
    dynamicUnavailableSlots,
    setDynamicUnavailableSlots,
    setAvailableCourseInstances,
    onCellHover,
    onLockToggle,
    handleRemoveCourse,
    assignmentConstraints,
    onCellClick,
    selectedCourseCode
}) => {
    const normalizedPeriodSettings = normalizePeriodSettings(periodSettings);
    const normalizedPeriods = getTimetableDisplayPeriods(normalizedPeriodSettings);
    const displayPeriods = normalizedPeriods
        .map((period, index) => {
            const isLunch = period.id === 'lunch' || period.label?.includes('พัก');
            const match = period.id.match(/period-(\d+)/);
            return {
                label: isLunch ? 'พ' : match?.[1] || period.label.replace('คาบที่', '').trim(),
                time: period.startTime,
                index: period.index ?? index,
                period,
            };
        })
    const gridTemplateColumns = `35px repeat(${displayPeriods.length}, minmax(0, 1fr))`;

    const normalizeValue = (value: unknown) => String(value || '').replace(/\s+/g, '').toLowerCase();
    const normalizeList = (value: unknown) => {
        const list = Array.isArray(value) ? value : [value].filter(Boolean);
        return list.map(normalizeValue).filter(Boolean).sort().join('|');
    };
    const hasSameCourseIdentity = (first: CourseInstance, second: CourseInstance) => {
        const firstComposite = normalizeValue(first.compositeId);
        const secondComposite = normalizeValue(second.compositeId);
        if (firstComposite && secondComposite) return firstComposite === secondComposite;

        return normalizeValue(first.id) === normalizeValue(second.id) &&
            String(first.groupNumber || 1) === String(second.groupNumber || 1);
    };
    const areConsecutiveCoursesMergeable = (first: CourseInstance, second: CourseInstance) => {
        if (!hasSameCourseIdentity(first, second)) return false;

        if (type === 'teacher') {
            const firstClasses = normalizeList(first.classId);
            const secondClasses = normalizeList(second.classId);
            if (firstClasses || secondClasses) return firstClasses === secondClasses;
            return normalizeValue(first.className) === normalizeValue(second.className);
        }

        if (type === 'class') {
            const firstTeacher = normalizeValue(first.teacherId);
            const secondTeacher = normalizeValue(second.teacherId);
            return !firstTeacher || !secondTeacher || firstTeacher === secondTeacher;
        }

        return true;
    };

    return (
        <div className="flex flex-col bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] shadow-sm dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)] relative transition-colors h-full">
            {/* Enterprise Glass Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.01] to-transparent pointer-events-none"></div>

            {/* Grid Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-white dark:bg-white/[0.03] backdrop-blur-md">
                <div className="flex flex-col items-start">
                    <h3 className="text-sm sm:text-base font-black text-gray-950 dark:text-white tracking-wide leading-tight">
                        {title}
                    </h3>
                    <p className="text-[11px] sm:text-xs font-bold text-gray-700 dark:text-gray-200 mt-1 leading-snug">{subtitle}</p>
                </div>
            </div>

            <div className="flex-grow px-1.5 py-1.5 flex flex-col bg-transparent">
                <div className="min-w-0 flex flex-col gap-0.5 pb-2">
                        
                        {/* Days / Times Header Row - High Precision Alignment */}
                        <div className="grid gap-0.5 bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5" style={{ gridTemplateColumns }}>
                            <div className="flex items-center justify-center text-[7px] font-black text-gray-900 dark:text-gray-400 uppercase tracking-widest pb-0.5">วัน</div>
                            {displayPeriods.map((p) => (
                                <div key={p.label} className="flex flex-col items-center justify-center">
                                    <span className="text-[9px] font-black text-gray-900 dark:text-white/90 leading-none">{p.label}</span>
                                    <span className="text-[7px] font-black text-gray-700 dark:text-gray-400 tracking-tighter tabular-nums">{p.time}</span>
                                </div>
                            ))}
                        </div>

                        {/* Daily Rows */}
                        {Object.entries(DAYS).map(([dayKey, dayLabel]) => {
                            // Calculate spans for the current day
                            const daySpans: { period: any; span: number; skip: boolean }[] = [];
                            const periods = [...displayPeriods];
                            
                            for (let i = 0; i < periods.length; i++) {
                                const period = periods[i];
                                const rawSlotId = `${dayKey}-${period.index}`;
                                const coursesInSlot = schedule[rawSlotId] || [];
                                
                                const periodSetting = normalizedPeriodSettings[period.index];
                                const specialPeriod = specialPeriods.find(sp => 
                                    (sp.linkedPeriodId === periodSetting?.id && (!sp.day || sp.day === 'all' || sp.day === dayKey)) ||
                                    (sp.startTime === periodSetting?.startTime && sp.endTime === periodSetting?.endTime && (!sp.day || sp.day === 'all' || sp.day === dayKey))
                                );

                                const specialTitle = specialPeriod?.title || 
                                                    (periodSetting?.id === 'homeroom' || periodSetting?.label === 'โฮมรูม' ? 'โฮมรูม' : 
                                                    (periodSetting?.id === 'lunch' || periodSetting?.label?.includes('พัก') ? 'พักเที่ยง' : ''));

                                let span = 1;
                                // Look ahead for consecutive identical slots
                                if (specialTitle !== 'พักเที่ยง' && (coursesInSlot.length === 1 || specialTitle)) {
                                    while (i + span < periods.length) {
                                        const nextPeriod = periods[i + span];
                                        const nextRawSlotId = `${dayKey}-${nextPeriod.index}`;
                                        const nextCourses = schedule[nextRawSlotId] || [];
                                        
                                        const nextPeriodSetting = normalizedPeriodSettings[nextPeriod.index];
                                        const nextSpecialPeriod = specialPeriods.find(sp => 
                                            (sp.linkedPeriodId === nextPeriodSetting?.id && (!sp.day || sp.day === 'all' || sp.day === dayKey)) ||
                                            (sp.startTime === nextPeriodSetting?.startTime && sp.endTime === nextPeriodSetting?.endTime && (!sp.day || sp.day === 'all' || sp.day === dayKey))
                                        );
                                        const nextSpecialTitle = nextSpecialPeriod?.title || 
                                                            (nextPeriodSetting?.id === 'homeroom' || nextPeriodSetting?.label === 'โฮมรูม' ? 'โฮมรูม' : 
                                                            (nextPeriodSetting?.id === 'lunch' || nextPeriodSetting?.label?.includes('พัก') ? 'พักเที่ยง' : ''));

                                        if (nextSpecialTitle === 'พักเที่ยง') break;

                                        let isMatch = false;
                                        if (coursesInSlot.length === 1 && nextCourses.length === 1) {
                                            isMatch = areConsecutiveCoursesMergeable(coursesInSlot[0], nextCourses[0]);
                                        } else if (!coursesInSlot.length && !nextCourses.length && specialTitle && nextSpecialTitle) {
                                            isMatch = specialTitle === nextSpecialTitle;
                                        }

                                        if (isMatch) {
                                            span++;
                                        } else {
                                            break;
                                        }
                                    }
                                }

                                daySpans.push({ period, span, skip: false });
                                // Mark next 'span - 1' periods as skipped
                                for (let j = 1; j < span; j++) {
                                    daySpans.push({ period: periods[i + j], span: 1, skip: true });
                                }
                                i += (span - 1);
                            }

                            return (
                                <div key={dayKey} className="grid gap-0.5 items-stretch h-[44px]" style={{ gridTemplateColumns }}>
                                    <div className="flex items-center justify-center bg-transparent">
                                        <span className="text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-tight">{dayLabel}</span>
                                    </div>
                                    
                                    {daySpans.map((spanItem, sIdx) => {
                                        if (spanItem.skip) return null;
                                        const { period, span } = spanItem;
                                        const rawSlotId = `${dayKey}-${period.index}`;
                                        const slotId = `${type}-${rawSlotId}`;
                                        const coursesInSlot = schedule[rawSlotId] || [];
                                    
                                    const periodSetting = normalizedPeriodSettings[period.index];
                                    const specialPeriod = specialPeriods.find(sp => 
                                        (sp.linkedPeriodId === periodSetting?.id && (!sp.day || sp.day === 'all' || sp.day === dayKey)) ||
                                        (sp.startTime === periodSetting?.startTime && sp.endTime === periodSetting?.endTime && (!sp.day || sp.day === 'all' || sp.day === dayKey))
                                    );

                                    const isSpecial = !periodSetting?.isTeachingPeriod || !!specialPeriod;
                                    const specialTitle = specialPeriod?.title || 
                                                        (periodSetting?.id === 'homeroom' || periodSetting?.label === 'โฮมรูม' ? 'โฮมรูม' : 
                                                        (periodSetting?.id === 'lunch' || periodSetting?.label?.includes('พัก') ? 'พักเที่ยง' : ''));

                                    const { forbidden, message } = activeDragItem 
                                        ? checkConstraints(
                                            activeDragItem, 
                                            rawSlotId, 
                                            teachers.find(t => t.id === activeDragItem.teacherId || (t.teacherId && t.teacherId === activeDragItem.teacherId)), 
                                            periodSettings, 
                                            specialPeriods, 
                                            assignmentConstraints, 
                                            activeDragItem.teacherId === selectedTeacher ? dynamicUnavailableSlots : (teachers.find(t => t.id === activeDragItem.teacherId)?.preferences?.unavailableSlots || []),
                                            schoolMasterSchedule
                                        ) 
                                        : { forbidden: false, message: '' };

                                    // Special check for double period partner
                                    let isDoublePartner = false;
                                    if (activeDragItem) {
                                        const asgnCst = assignmentConstraints[activeDragItem.compositeId];
                                        if (asgnCst?.type === 'double' || asgnCst?.type === 'mixed') {
                                            const pNum = parseInt(rawSlotId.split('-')[1]);
                                            const partnerIdx = getPartnerIndex(pNum);
                                            // If the slot is double-able, show indicator
                                            if (partnerIdx !== -1) isDoublePartner = true;
                                        }
                                    }

                                    return (
                                        <DroppableCell
                                            key={slotId}
                                            id={slotId}
                                            rawSlotId={rawSlotId}
                                            courses={coursesInSlot}
                                            span={span}
                                            isTeacherPermanentUnavailable={false}
                                            isCourseDisallowedDay={false}
                                            isDynamicUnavailable={type === 'teacher' && dynamicUnavailableSlots.includes(rawSlotId)}
                                            isSpecialPeriod={isSpecial}
                                            specialPeriodTitle={specialTitle}
                                            isOccupiedByOtherClass={false}
                                            occupiedByOtherClassInfo={null}
                                            occupiedByAnotherTeacherInfo={null}
                                            onToggleUnavailable={() => {
                                                if (type === 'teacher') {
                                                    if (dynamicUnavailableSlots.includes(rawSlotId)) {
                                                        setDynamicUnavailableSlots(prev => (prev as string[]).filter(s => s !== rawSlotId));
                                                    } else {
                                                        setDynamicUnavailableSlots(prev => [...(prev as string[]), rawSlotId]);
                                                    }
                                                }
                                            }}
                                            onLockToggle={onLockToggle}
                                            isDraggingOver={activeDragItem !== null}
                                            isDropForbidden={forbidden}
                                            forbiddenMessage={message}
                                            isDoublePartner={isDoublePartner}
                                            handleRemoveCourse={handleRemoveCourse}
                                            isFilteredOut={false}
                                            type={type}
                                            teachers={teachers}
                                            selectedTeacherId={selectedTeacher}
                                            onCellClick={onCellClick}
                                            selectedCourseCode={selectedCourseCode}
                                            onHover={(rect) => {
                                                const isDynamicUnavailable = type === 'teacher' && dynamicUnavailableSlots.includes(rawSlotId);
                                                const hasContent = coursesInSlot.length > 0 || isDynamicUnavailable;

                                                if (!rect || !hasContent) {
                                                    onCellHover?.(null);
                                                } else {
                                                    onCellHover?.({
                                                        id: rawSlotId,
                                                        courses: coursesInSlot,
                                                        isDynamicUnavailable,
                                                        rect
                                                    });
                                                }
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        );
                    })}
                    </div>
            </div>
        </div>
    );
};
