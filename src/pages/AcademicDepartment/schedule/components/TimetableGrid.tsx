import React from 'react';
import { DAYS, checkConstraints, getPartnerIndex } from '../utils';
import { DroppableCell } from './DroppableCell';
import { CourseInstance, PeriodSetting, SpecialPeriod, Teacher, Schedule, AssignmentConstraintMap } from '../types';

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
    const displayPeriods = periodSettings
        .map((period, index) => {
            const isLunch = period.id === 'lunch' || period.label?.includes('พัก');
            const match = period.id.match(/period-(\d+)/);
            return {
                label: isLunch ? 'พ' : match?.[1] || period.label.replace('คาบที่', '').trim(),
                time: period.startTime,
                index,
                period,
            };
        })
        .filter(({ period }) => period.id !== 'homeroom' && period.label !== 'โฮมรูม');
    const gridTemplateColumns = `35px repeat(${displayPeriods.length}, minmax(0, 1fr))`;

    return (
        <div className="flex flex-col bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] shadow-sm dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)] relative transition-colors h-full">
            {/* Enterprise Glass Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.01] to-transparent pointer-events-none"></div>

            {/* Grid Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between bg-white dark:bg-white/[0.03] backdrop-blur-md">
                <div className="flex flex-col items-center">
                    <h3 className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] leading-tight text-center drop-shadow-[0_0_10px_rgba(99,102,241,0.3)]">
                        {title}
                    </h3>
                    <p className="text-[7px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-[0.1em] mt-0.5 opacity-80">{subtitle}</p>
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
                        {Object.entries(DAYS).map(([dayKey, dayLabel]) => (
                            <div key={dayKey} className="grid gap-0.5 items-stretch h-[44px]" style={{ gridTemplateColumns }}>
                                <div className="flex items-center justify-center bg-transparent">
                                    <span className="text-[9px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-tight">{dayLabel}</span>
                                </div>
                                
                                {displayPeriods.map((period) => {
                                    const rawSlotId = `${dayKey}-${period.index}`;
                                    const slotId = `${type}-${rawSlotId}`;
                                    const coursesInSlot = schedule[rawSlotId] || [];
                                    
                                    const periodSetting = periodSettings[period.index];
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
                                            selectedTeacherData, 
                                            periodSettings, 
                                            specialPeriods, 
                                            assignmentConstraints, 
                                            dynamicUnavailableSlots,
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
                                            isTeacherPermanentUnavailable={false}
                                            isCourseDisallowedDay={false}
                                            isDynamicUnavailable={type === 'teacher' && dynamicUnavailableSlots.includes(rawSlotId)}
                                            isSpecialPeriod={isSpecial}
                                            specialPeriodTitle={specialTitle}
                                            isOccupiedByOtherClass={false}
                                            occupiedByOtherClassInfo={null}
                                            occupiedByAnotherTeacherInfo={null}
                                            onClick={() => {
                                                if (selectedCourseCode) {
                                                    onCellClick?.(rawSlotId);
                                                } else if (type === 'teacher') {
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
                        ))}
                    </div>
            </div>
        </div>
    );
};
