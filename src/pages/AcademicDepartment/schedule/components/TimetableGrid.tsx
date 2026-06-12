import React from 'react';
import { DAYS, checkConstraints, getClassDisplayName, getMatchingSpecialPeriod, getPartnerIndexForPeriods, getRequiredWeeklyPeriods, isProtectedSpecialPeriodSetting } from '../utils';
import { DroppableCell } from './DroppableCell';
import { CourseInstance, PeriodSetting, SpecialPeriod, Teacher, Schedule, AssignmentConstraintMap } from '../types';
import { getTimetableDisplayPeriods, normalizePeriodSettings } from '@/utils/scheduleDisplayUtils';

export interface TimetableGridProps {
    title: string;
    subtitle: string;
    headerActions?: React.ReactNode;
    showGrid?: boolean;
    emptyMessage?: string;
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
    onCourseClick?: (course: CourseInstance) => void;
}

export const TimetableGrid: React.FC<TimetableGridProps> = ({
    title,
    subtitle,
    headerActions,
    showGrid = true,
    emptyMessage,
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
    selectedCourseCode,
    onCourseClick,
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
    const mergeCourseInstancesForDisplay = (courses: CourseInstance[]) => {
        const merged = new Map<string, CourseInstance>();

        courses.forEach(course => {
            const classKey = normalizeList(course.classId || course.className);
            const roomKey = normalizeList(course.room);
            const key = [
                normalizeValue(course.compositeId) || normalizeValue(course.id),
                String(course.groupNumber || 1),
                classKey,
                roomKey,
            ].join('|');

            const existing = merged.get(key);
            if (!existing) {
                merged.set(key, { ...course });
                return;
            }

            const teacherIds = Array.from(new Set([
                ...(Array.isArray(existing.teacherIds) ? existing.teacherIds : [existing.teacherId].filter(Boolean) as string[]),
                ...(Array.isArray(course.teacherIds) ? course.teacherIds : [course.teacherId].filter(Boolean) as string[]),
            ].filter(Boolean)));

            const existingClassIds = Array.isArray(existing.classId) ? existing.classId : [existing.classId].filter(Boolean) as string[];
            const courseClassIds = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean) as string[];
            const classIds = Array.from(new Set([...existingClassIds, ...courseClassIds]));

            merged.set(key, {
                ...existing,
                teacherIds,
                teacherId: existing.teacherId || course.teacherId,
                classId: classIds.length > 1 ? classIds : (classIds[0] || existing.classId),
                className: classIds.length > 0 ? classIds.map(getClassDisplayName).join(' + ') : existing.className,
            });
        });

        return Array.from(merged.values());
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
    const getCourseKey = (course: CourseInstance) => (
        normalizeValue(course.compositeId) || `${normalizeValue(course.id)}_${String(course.groupNumber || 1)}`
    );
    const scheduledPeriodCountByCourse = React.useMemo(() => {
        const counts = new Map<string, number>();

        Object.values(schedule).forEach(courses => {
            mergeCourseInstancesForDisplay(courses || []).forEach(course => {
                const key = getCourseKey(course);
                if (!key) return;
                counts.set(key, (counts.get(key) || 0) + 1);
            });
        });

        return counts;
    }, [schedule]);
    const getCoursePeriodSummary = React.useCallback((course: CourseInstance) => {
        const key = getCourseKey(course);
        return {
            scheduled: key ? scheduledPeriodCountByCourse.get(key) || 0 : 0,
            total: getRequiredWeeklyPeriods(course),
        };
    }, [scheduledPeriodCountByCourse]);

    return (
        <div className="flex flex-col bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] shadow-sm dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)] relative transition-colors h-full">
            {/* Enterprise Glass Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.01] to-transparent pointer-events-none"></div>

            {/* Grid Header */}
            <div className="px-4 py-2 border-b border-gray-100 dark:border-white/5 flex flex-row items-center justify-between w-full gap-2 bg-white dark:bg-white/[0.03] backdrop-blur-md">
                <div className="flex flex-col items-start flex-1 min-w-0 overflow-hidden">
                    <h3 className="text-xs sm:text-sm font-black text-gray-950 dark:text-white tracking-wide leading-tight truncate w-full">
                        {title}
                    </h3>
                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-0.5 leading-snug truncate w-full">
                        {subtitle}
                    </p>
                </div>
                {headerActions && (
                    <div className="flex-shrink-0 flex justify-end ml-2">
                        {headerActions}
                    </div>
                )}
            </div>

            {!showGrid ? (
                <div className="flex min-h-[270px] flex-grow items-center justify-center px-4 py-10 text-center">
                    <div className="max-w-[260px] text-[11px] font-black text-gray-400 dark:text-gray-500">
                        {emptyMessage || 'กรุณาเลือกข้อมูลเพื่อแสดงตาราง'}
                    </div>
                </div>
            ) : (
            <div className="flex-grow px-1.5 py-1.5 flex flex-col bg-transparent overflow-hidden">
                <div className="min-w-0 flex-1 min-h-0 flex flex-col gap-0.5 pb-1">
                        
                        {/* Days / Times Header Row - High Precision Alignment */}
                        <div className="grid gap-0.5 bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5" style={{ gridTemplateColumns }}>
                            <div className="flex items-center justify-center text-[8px] font-black text-gray-900 dark:text-gray-400 uppercase tracking-widest pb-0.5">วัน</div>
                            {displayPeriods.map((p) => (
                                <div key={p.label} className="flex flex-col items-center justify-center">
                                    <span className="text-[10px] font-black text-gray-900 dark:text-white/90 leading-none">{p.label}</span>
                                    <span className="text-[8px] font-black text-gray-700 dark:text-gray-400 tabular-nums">{p.time}</span>
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
                                const coursesInSlot = mergeCourseInstancesForDisplay(schedule[rawSlotId] || []);
                                
                                const periodSetting = normalizedPeriodSettings[period.index];
                                const specialPeriod = getMatchingSpecialPeriod(specialPeriods, periodSetting, dayKey);

                                const isProtectedSpecial = isProtectedSpecialPeriodSetting(periodSetting);
                                const specialTitle = specialPeriod?.title || 
                                                    (periodSetting?.id === 'homeroom' || periodSetting?.label === 'โฮมรูม' ? 'โฮมรูม' : 
                                                    (periodSetting?.id === 'lunch' || periodSetting?.label?.includes('พัก') ? 'พักเที่ยง' : ''));

                                let span = 1;
                                // Look ahead for consecutive identical slots
                                if (!isProtectedSpecial && !specialPeriod && coursesInSlot.length === 1) {
                                    while (i + span < periods.length) {
                                        const nextPeriod = periods[i + span];
                                        const nextRawSlotId = `${dayKey}-${nextPeriod.index}`;
                                        const nextCourses = mergeCourseInstancesForDisplay(schedule[nextRawSlotId] || []);
                                        
                                        const nextPeriodSetting = normalizedPeriodSettings[nextPeriod.index];
                                        const nextSpecialPeriod = getMatchingSpecialPeriod(specialPeriods, nextPeriodSetting, dayKey);
                                        const nextIsProtectedSpecial = isProtectedSpecialPeriodSetting(nextPeriodSetting);
                                        const nextSpecialTitle = nextSpecialPeriod?.title || 
                                                            (nextPeriodSetting?.id === 'homeroom' || nextPeriodSetting?.label === 'โฮมรูม' ? 'โฮมรูม' : 
                                                            (nextPeriodSetting?.id === 'lunch' || nextPeriodSetting?.label?.includes('พัก') ? 'พักเที่ยง' : ''));

                                        if (nextIsProtectedSpecial || nextSpecialPeriod || nextSpecialTitle === 'พักเที่ยง') break;

                                        let isMatch = false;
                                        if (coursesInSlot.length === 1 && nextCourses.length === 1) {
                                            isMatch = areConsecutiveCoursesMergeable(coursesInSlot[0], nextCourses[0]);
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
                                <div key={dayKey} className="grid gap-0.5 items-stretch flex-1" style={{ gridTemplateColumns }}>
                                    <div className="flex items-center justify-center bg-transparent">
                                        <span className="text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-tight">{dayLabel}</span>
                                    </div>
                                    
                                    {daySpans.map((spanItem, sIdx) => {
                                        if (spanItem.skip) return null;
                                        const { period, span } = spanItem;
                                        const rawSlotId = `${dayKey}-${period.index}`;
                                        const slotId = `${type}-${rawSlotId}`;
                                        const coursesInSlot = mergeCourseInstancesForDisplay(schedule[rawSlotId] || []);
                                    
                                    const periodSetting = normalizedPeriodSettings[period.index];
                                    const specialPeriod = getMatchingSpecialPeriod(specialPeriods, periodSetting, dayKey);

                                    const isSpecial = !periodSetting?.isTeachingPeriod || isProtectedSpecialPeriodSetting(periodSetting) || !!specialPeriod;
                                    const specialTitle = specialPeriod?.title || 
                                                        (periodSetting?.id === 'homeroom' || periodSetting?.label === 'โฮมรูม' ? 'โฮมรูม' : 
                                                        (periodSetting?.id === 'lunch' || periodSetting?.label?.includes('พัก') ? 'พักเที่ยง' : ''));

                                     const ignoredInstanceIds: string[] = [];
                                     if (activeDragItem) {
                                         ignoredInstanceIds.push(activeDragItem.instanceId);
                                         let originalSlot: string | null = null;
                                         for (const [slotKey, courses] of Object.entries(schedule)) {
                                             if (courses.some(c => c.instanceId === activeDragItem.instanceId)) {
                                                 originalSlot = slotKey;
                                                 break;
                                             }
                                         }
                                         if (originalSlot) {
                                             const [origDay, origPeriodStr] = originalSlot.split('-');
                                             const origPeriod = parseInt(origPeriodStr);
                                             const partnerIdx = getPartnerIndexForPeriods(origPeriod, periodSettings);
                                             if (partnerIdx !== -1) {
                                                 const partnerSlot = `${origDay}-${partnerIdx}`;
                                                 const partnerCourses = schedule[partnerSlot] || [];
                                                 const partnerItem = partnerCourses.find(c => 
                                                     c.compositeId === activeDragItem.compositeId && 
                                                     c.instanceId !== activeDragItem.instanceId
                                                 );
                                                 if (partnerItem) {
                                                     ignoredInstanceIds.push(partnerItem.instanceId);
                                                 }
                                             }
                                         }
                                     }

                                     const { forbidden, message } = activeDragItem 
                                         ? checkConstraints(
                                             activeDragItem, 
                                             rawSlotId, 
                                             teachers.find(t => t.id === activeDragItem.teacherId || (t.teacherId && t.teacherId === activeDragItem.teacherId)), 
                                             periodSettings, 
                                             specialPeriods, 
                                             assignmentConstraints, 
                                             activeDragItem.teacherId === selectedTeacher ? dynamicUnavailableSlots : (teachers.find(t => t.id === activeDragItem.teacherId)?.preferences?.unavailableSlots || []),
                                             schoolMasterSchedule,
                                             1,
                                             ignoredInstanceIds
                                         ) 
                                         : { forbidden: false, message: '' };

                                    // Special check for double period partner
                                    let isDoublePartner = false;
                                    if (activeDragItem) {
                                        const asgnCst = assignmentConstraints[activeDragItem.compositeId];
                                        if (asgnCst?.type === 'double' || asgnCst?.type === 'mixed') {
                                            const pNum = parseInt(rawSlotId.split('-')[1]);
                                            const partnerIdx = getPartnerIndexForPeriods(pNum, periodSettings);
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
                                            onCourseClick={onCourseClick}
                                            selectedCourseCode={selectedCourseCode}
                                            getCoursePeriodSummary={getCoursePeriodSummary}
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
            )}
        </div>
    );
};
