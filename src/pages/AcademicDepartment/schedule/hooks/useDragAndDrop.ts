import { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { CourseInstance, MasterScheduleEntry, Schedule, Teacher, PeriodSetting, SpecialPeriod, AssignmentConstraintMap } from '../types';
import { checkConstraints, findValidSlots, getClassDisplayName, DAYS, getPartnerIndexForPeriods, getRequiredWeeklyPeriods, isActivityCourse, isDoubleCapableConstraint, shouldUseDoubleSessionForNextPlacement } from '../utils';

const MySwal = withReactContent(Swal);

interface UseDragAndDropProps {
    schedule: Schedule;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    availableCourseInstances: CourseInstance[];
    setAvailableCourseInstances: React.Dispatch<React.SetStateAction<CourseInstance[]>>;
    schoolMasterSchedule: Record<string, MasterScheduleEntry[]>;
    setSchoolMasterSchedule: React.Dispatch<React.SetStateAction<Record<string, MasterScheduleEntry[]>>>;
    takeSnapshot?: () => void;
    selectedTeacher: string;
    selectedTeacherData: Teacher | undefined;
    teacherMap: Record<string, Teacher>;
    roomMap: Record<string, string>;
    selectedSemester: string;
    periodSettings: PeriodSetting[];
    specialPeriods: SpecialPeriod[];
    dynamicUnavailableSlots: string[];
    setActiveDragItem: (item: CourseInstance | null) => void;
    assignmentConstraints: AssignmentConstraintMap;
}

export const useDragAndDrop = ({
    schedule,
    setSchedule,
    availableCourseInstances,
    setAvailableCourseInstances,
    schoolMasterSchedule,
    setSchoolMasterSchedule,
    selectedTeacher,
    selectedTeacherData,
    teacherMap,
    roomMap,
    selectedSemester,
    periodSettings,
    specialPeriods,
    dynamicUnavailableSlots,
    setActiveDragItem,
    assignmentConstraints,
    takeSnapshot
}: UseDragAndDropProps) => {
    const isSameAssignment = (a?: CourseInstance | null, b?: CourseInstance | null) => {
        if (!a || !b) return false;
        const idA = a.compositeId || a.id;
        const idB = b.compositeId || b.id;
        return idA === idB && Number(a.groupNumber || 1) === Number(b.groupNumber || 1);
    };

    const getCourseMoveKey = (teacherId: string | undefined, item?: CourseInstance | null, ignoreInstanceId = false) => {
        if (!item) return '';
        // instanceId is transient (slot-dependent), so for identity we use stable fields
        if (!ignoreInstanceId && item.instanceId) return item.instanceId;
        return `${teacherId || item.teacherId || ''}|${item.id}|${item.compositeId || ''}|${Number(item.groupNumber || 1)}|${JSON.stringify(item.classId || '')}`;
    };

    const isSameCourseInstance = (teacherId: string | undefined, a?: CourseInstance | null, b?: CourseInstance | null) => {
        if (!a || !b) return false;
        // If both have the same instanceId, they are definitely the same
        if (a.instanceId && b.instanceId && a.instanceId === b.instanceId) return true;
        // Fallback to data-based match (stable key) to ensure we find matches in the master schedule
        return getCourseMoveKey(teacherId, a, true) === getCourseMoveKey(teacherId, b, true);
    };

    const removeMatchingCourseFromSlot = (
        slotCourses: CourseInstance[] | undefined,
        teacherId: string | undefined,
        targetItem: CourseInstance
    ) => {
        if (!slotCourses || slotCourses.length === 0) return [];
        return slotCourses.filter(course => !isSameCourseInstance(teacherId, course, targetItem));
    };

    const shouldMoveAsDouble = (item: CourseInstance) => {
        const asgnCst = assignmentConstraints[item.compositeId];
        return isDoubleCapableConstraint(asgnCst);
    };

    const isSlotInPreference = (slotId: string, preference?: 'any' | 'morning' | 'afternoon') => {
        if (!preference || preference === 'any') return false;
        const [, pNumStr] = slotId.split('-');
        const periodIndex = parseInt(pNumStr);
        const period = periodSettings[periodIndex];
        if (!period) return false;
        const lunchIdx = periodSettings.findIndex(p => p.id === 'lunch');
        const lunchStartTime = lunchIdx !== -1 ? periodSettings[lunchIdx].startTime : '12:00';
        const isMorning = period.startTime < lunchStartTime;
        return preference === 'morning' ? isMorning : !isMorning;
    };

    const shouldPlaceNextAsDouble = (
        item: CourseInstance,
        targetSlotId: string,
        alreadyPlacedPeriods: number,
        forceExistingPair: boolean
    ) => {
        if (forceExistingPair) return true;
        const constraint = assignmentConstraints[item.compositeId];
        const rawPeriods = getRequiredWeeklyPeriods(item);
        const totalPeriods = isActivityCourse(item) ? Math.min(rawPeriods, 2) : rawPeriods;
        const remainingPeriods = Math.max(0, totalPeriods - alreadyPlacedPeriods);
        if (remainingPeriods < 2) return false;
        if (!isDoubleCapableConstraint(constraint)) {
            return shouldUseDoubleSessionForNextPlacement(item, alreadyPlacedPeriods, constraint);
        }
        if (remainingPeriods === 2) return true;

        const targetLooksLikeSingle = isSlotInPreference(targetSlotId, constraint?.singlePreference);
        const targetLooksLikeDouble = isSlotInPreference(targetSlotId, constraint?.doublePreference);
        if (targetLooksLikeSingle && !targetLooksLikeDouble) return false;
        return true;
    };

    const getTeachingRuns = () => {
        const orderedPeriods = periodSettings
            .map((period, arrayIndex) => {
                const indexedPeriod = period as PeriodSetting & { index?: number };
                return {
                    index: typeof indexedPeriod.index === 'number' ? indexedPeriod.index : arrayIndex,
                    isTeachingPeriod: period.isTeachingPeriod
                };
            })
            .sort((a, b) => a.index - b.index);

        let currentRun: number[] = [];
        const runs: number[][] = [];
        orderedPeriods.forEach(period => {
            if (period.isTeachingPeriod) {
                currentRun.push(period.index);
                return;
            }

            if (currentRun.length) {
                runs.push(currentRun);
                currentRun = [];
            }
        });
        if (currentRun.length) runs.push(currentRun);
        return runs;
    };

    const getAdjacentTeachingSlots = (slotId: string) => {
        const [day, pNumStr] = slotId.split('-');
        const periodIndex = parseInt(pNumStr);
        const run = getTeachingRuns().find(indexes => indexes.includes(periodIndex));
        if (!run) return [];

        const position = run.indexOf(periodIndex);
        return [run[position - 1], run[position + 1]]
            .filter((index): index is number => typeof index === 'number')
            .map(index => `${day}-${index}`);
    };

    const sortMovesBySlot = (moves: { slot: string; item: CourseInstance }[]) => {
        return [...moves].sort((a, b) => {
            const [dayA, periodA] = a.slot.split('-');
            const [dayB, periodB] = b.slot.split('-');
            if (dayA !== dayB) return DAYS[dayA as keyof typeof DAYS] < DAYS[dayB as keyof typeof DAYS] ? -1 : 1;
            return Number(periodA) - Number(periodB);
        });
    };

    const getTeacherName = (teacherId?: string) => {
        if (!teacherId) return '-';
        if (teacherId === 'pending') return 'ยังไม่ระบุครู';
        if (teacherId.startsWith('GHOST')) {
            return `ครูสำรอง (${teacherId.replace('GHOST_', '')})`;
        }
        const teacher = teacherMap[teacherId];
        return teacher?.name || `${teacher?.title || ''}${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim() || teacherId;
    };

    const formatSlotToThai = (slot: string) => {
        const [day, pNumStr] = slot.split('-');
        const periodIndex = parseInt(pNumStr);
        const dayThai = DAYS[day as keyof typeof DAYS] || day;
        const periodLabel = periodSettings[periodIndex]?.label || `คาบที่ ${periodIndex + 1}`;
        return `วัน${dayThai} (${periodLabel})`;
    };

    const escapeHtml = (value: string) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const formatConflictDetails = (conflicts: { slot: string; item: CourseInstance; teacherId: string }[]) => {
        if (conflicts.length === 0) return 'ไม่พบคาบว่างสำหรับย้ายวิชาที่ถูกทับ';
        return conflicts.slice(0, 4).map(conflict => {
            const classes = Array.isArray(conflict.item.classId)
                ? conflict.item.classId.map(getClassDisplayName).join(', ')
                : getClassDisplayName(conflict.item.classId as string);
            const roomIds = Array.isArray(conflict.item.room)
                ? conflict.item.room
                : [conflict.item.room].filter(Boolean);
            const rooms = roomIds
                .filter(roomId => roomId && roomId !== 'all')
                .map(roomId => roomMap[String(roomId)] || String(roomId))
                .join(', ');
            return escapeHtml(`${formatSlotToThai(conflict.slot)}: ${conflict.item.code || '-'} ${conflict.item.title || '-'} / ${classes || 'ไม่ระบุชั้น'} / ครู ${getTeacherName(conflict.teacherId)}${rooms ? ` / ห้อง ${rooms}` : ''}`);
        }).join('\n');
    };

    const getPairedGridMove = (item: CourseInstance, slotId?: string) => {
        if (!slotId) return [{ slot: '', item }];

        const [day, pNumStr] = slotId.split('-');
        const periodIndex = parseInt(pNumStr);
        const partnerIndex = getPartnerIndexForPeriods(periodIndex, periodSettings);
        const partnerSlotId = partnerIndex !== -1 ? `${day}-${partnerIndex}` : null;
        const partnerItem = partnerSlotId
            ? schedule[partnerSlotId]?.find(course => isSameAssignment(course, item))
            : undefined;

        const shouldMoveAsPair = shouldMoveAsDouble(item);

        if (!shouldMoveAsPair) return [{ slot: slotId, item }];

        if (partnerSlotId && partnerItem) {
            return sortMovesBySlot([
                { slot: slotId, item },
                { slot: partnerSlotId, item: partnerItem }
            ]);
        }

        const adjacentPartner = getAdjacentTeachingSlots(slotId)
            .map(adjacentSlot => ({
                slot: adjacentSlot,
                item: schedule[adjacentSlot]?.find(course => isSameAssignment(course, item))
            }))
            .find((move): move is { slot: string; item: CourseInstance } => Boolean(move.item));

        if (adjacentPartner) {
            return sortMovesBySlot([
                { slot: slotId, item },
                adjacentPartner
            ]);
        }

        return [{ slot: slotId, item }];
    };

    const getDoubleTargetSlots = (slotId: string) => {
        const [day, pNumStr] = slotId.split('-');
        const periodIndex = parseInt(pNumStr);
        const partnerIndex = getPartnerIndexForPeriods(periodIndex, periodSettings);
        if (partnerIndex === -1) return null;
        const startIndex = Math.min(periodIndex, partnerIndex);
        const endIndex = Math.max(periodIndex, partnerIndex);
        return [`${day}-${startIndex}`, `${day}-${endIndex}`];
    };

    const getConstraintMapForDoublePartner = (item: CourseInstance) => {
        const constraint = assignmentConstraints[item.compositeId];
        if (!constraint) return assignmentConstraints;

        return {
            ...assignmentConstraints,
            [item.compositeId]: {
                ...constraint,
                singlePreference: 'any' as const
            }
        };
    };

    const removeInstancesFromBank = (activeId: string, activeItem: CourseInstance, count: number) => {
        setAvailableCourseInstances((list: CourseInstance[]) => {
            let remainingToRemove = Math.max(1, count);
            const next: CourseInstance[] = [];

            for (const item of list) {
                const isActiveItem = item.instanceId === activeId;
                const isSameAssignment = item.compositeId === activeItem.compositeId;
                if ((isActiveItem || isSameAssignment) && remainingToRemove > 0) {
                    remainingToRemove--;
                    continue;
                }
                next.push(item);
            }

            return next;
        });
    };

    const checkIfPlacementIsRelaxed = (item: CourseInstance, slot: string, isDoubleStart: boolean, isDoublePartner: boolean) => {
        const allTeacherIds = item.teacherIds?.length ? item.teacherIds : [item.teacherId || selectedTeacher].filter(Boolean) as string[];
        for (const tId of allTeacherIds) {
            const itemTeacher = teacherMap[tId];
            const check = checkConstraints(
                item,
                slot,
                itemTeacher,
                periodSettings,
                specialPeriods,
                isDoublePartner ? getConstraintMapForDoublePartner(item) : assignmentConstraints,
                tId === selectedTeacher ? dynamicUnavailableSlots : (itemTeacher?.preferences?.unavailableSlots || []),
                {},
                isDoubleStart ? 2 : 1,
                [item.instanceId]
            );
            if (check.forbidden) return true;
        }
        return false;
    };

    const handleDragStart = (event: DragStartEvent) => {
        const activeId = String(event.active.id);
        const item = availableCourseInstances.find(c => c.instanceId === activeId) ||
            Object.values(schedule).flat().find(c => c?.instanceId === activeId);

        if (item) setActiveDragItem(item);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        if (takeSnapshot) takeSnapshot();
        const { active, over } = event;
        setActiveDragItem(null);

        if (!over) return;

        const activeId = String(active.id);
        let overId = over.data.current?.slotId || String(over.id);
        const overIsForbidden = Boolean(over.data.current?.isDropForbidden);
        const overForbiddenMessage = typeof over.data.current?.forbiddenMessage === 'string'
            ? over.data.current.forbiddenMessage
            : '';

        // Resolve card ID to slot ID
        if (!overId.includes('-') && !['course-bank', 'mon', 'tue', 'wed', 'thu', 'fri'].some(p => overId.startsWith(p))) {
            for (const slotKey in schedule) {
                if (schedule[slotKey].some(c => c.instanceId === overId)) {
                    overId = slotKey;
                    break;
                }
            }
        }

        if (activeId === overId) return;

        // Only hard-block here when the target slot has no existing occupant to
        // displace (e.g. teacher unavailable, disallowed day, locked slot). When
        // the slot is occupied, defer to the comprehensive check below, which can
        // resolve the conflict by relocating the occupant instead of refusing the
        // move outright — otherwise every displaceable conflict (e.g. "class
        // already has another subject") got rejected before ever reaching that
        // resolution logic.
        const overHasOccupancy = (schoolMasterSchedule[overId] || []).length > 0;
        if (overIsForbidden && !overHasOccupancy) {
            MySwal.fire({
                icon: 'warning',
                title: 'ไม่สามารถย้ายได้',
                text: overForbiddenMessage || 'คาบนี้ไม่สามารถวางวิชาได้'
            });
            return;
        }

        // Return to bank logic
        if (overId === 'course-bank') {
            const gridItem = Object.values(schedule).flat().find(c => c?.instanceId === activeId);
            if (gridItem) {
                const originalSlot = Object.keys(schedule).find(key => schedule[key].some(c => c.instanceId === activeId));
                const pairedMove = getPairedGridMove(gridItem, originalSlot);
                setSchedule((prev: Schedule) => {
                    const next = { ...prev };
                    pairedMove.forEach(move => {
                        if (!move.slot || !next[move.slot]) return;
                        next[move.slot] = removeMatchingCourseFromSlot(next[move.slot], selectedTeacher, move.item);
                        if (next[move.slot].length === 0) delete next[move.slot];
                    });
                    return next;
                });
                setAvailableCourseInstances((prev: CourseInstance[]) => [
                    ...prev,
                    ...pairedMove.map(move => ({ ...move.item, locked: false }))
                ]);
            }
            return;
        }

        // Find the item being dragged
        const activeItemFromBank = availableCourseInstances.find(c => c.instanceId === activeId);
        let activeItem: CourseInstance | null | undefined = activeItemFromBank;
        let originalCellKey: string | undefined;

        if (!activeItem) {
            for (const key in schedule) {
                const found = schedule[key]?.find(c => c.instanceId === activeId);
                if (found) {
                    originalCellKey = key;
                    activeItem = found;
                    break;
                }
            }
        }

        if (!activeItem) {
            console.warn('[DragDrop] Active item not found');
            return;
        }

        const isFromBank = !!activeItemFromBank;
        const targetItemsInCurrentSchedule = schedule[overId] || [];
        const movingItems = isFromBank ? [{ slot: originalCellKey || '', item: activeItem }] : getPairedGridMove(activeItem, originalCellKey);
        const movingInstanceIds = new Set(movingItems.map(move => move.item.instanceId));
        // Slots being vacated by this exact move — passed to checkConstraints so Constraint 11
        // (max 2 consecutive periods) doesn't count the course's own old slot(s) as still occupied.
        // instanceId alone can't identify them once a schedule has been saved/reloaded from
        // Firestore, since instanceId is stripped on save.
        const movingSlots = movingItems.map(move => move.slot).filter(Boolean) as string[];
        const isLockedUnavailableSlot = dynamicUnavailableSlots.includes(overId);

        // 1. Locked Checks
        if (isLockedUnavailableSlot) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: 'ไม่สามารถวางวิชาลงคาบว่างที่ล็อคไว้ได้' });
            return;
        }
        if (targetItemsInCurrentSchedule.some(c => c.locked && !movingInstanceIds.has(c.instanceId))) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: 'ไม่สามารถวางทับคาบที่ถูกล็อคได้' });
            return;
        }

        // --- DOUBLE PERIOD PARTNER CALCULATION & RESCUE LOGIC ---
        let partnerSlotId: string | null = null;
        let forcedDoubleStartSlotId: string | null = null;
        
        const alreadyPlacedCount = Object.values(schedule).flat().filter(c => c.compositeId === activeItem!.compositeId).length;
        const effectivePlacedCount = isFromBank ? alreadyPlacedCount : alreadyPlacedCount - movingItems.length;
        const shouldUseDoubleTarget = shouldPlaceNextAsDouble(activeItem, overId, effectivePlacedCount, movingItems.length > 1);

        const checkSlotValidity = (slot: string, itemToCheck: CourseInstance, isPartner: boolean, duration = 1) => {
            const allTeacherIds = itemToCheck.teacherIds?.length ? itemToCheck.teacherIds : [itemToCheck.teacherId || selectedTeacher].filter(Boolean) as string[];
            
            for (const tId of allTeacherIds) {
                const tData = teacherMap[tId];
                const check = checkConstraints(
                    itemToCheck,
                    slot,
                    tData,
                    periodSettings,
                    specialPeriods,
                    isPartner ? getConstraintMapForDoublePartner(itemToCheck) : assignmentConstraints,
                    tId === selectedTeacher ? dynamicUnavailableSlots : (tData?.preferences?.unavailableSlots || []),
                    schoolMasterSchedule,
                    duration,
                    Array.from(movingInstanceIds),
                    false,
                    movingSlots
                );

                if (check.forbidden) {
                    const globalConflicts = schoolMasterSchedule[slot] || [];
                    if (globalConflicts.length === 0) return false; // hard constraint
                }
            }
            
            if (dynamicUnavailableSlots.includes(slot)) {
                return false;
            }

            if ((schedule[slot] || []).some(c => c.locked && !movingInstanceIds.has(c.instanceId))) {
                return false;
            }

            return true;
        };

        let targetSlots = [overId];

        if (shouldUseDoubleTarget) {
            const doubleSlots = getDoubleTargetSlots(overId);
            let standardDoubleSuccessful = false;

            if (doubleSlots) {
                const trialStart = doubleSlots[0];
                const trialPartner = doubleSlots[1];
                const item1 = movingItems[0]?.item || activeItem;
                const item2 = movingItems[1]?.item || activeItem;

                if (checkSlotValidity(trialStart, item1, false, 2) && checkSlotValidity(trialPartner, item2, true)) {
                    forcedDoubleStartSlotId = trialStart;
                    overId = trialStart;
                    partnerSlotId = trialPartner;
                    targetSlots = [trialStart, trialPartner];
                    standardDoubleSuccessful = true;
                }
            }

            if (!standardDoubleSuccessful) {
                MySwal.fire({
                    icon: 'warning',
                    title: 'ไม่สามารถวางคาบคู่ได้',
                    text: 'วิชานี้เหลือเป็นชุดคาบคู่ กรุณาเลือกบล็อกคาบคู่ที่ว่างและตรงตามช่วงเวลาที่กำหนด'
                });
                return;
            }
        }

        // Lock checks for final targetSlots
        if (targetSlots.some(slot => dynamicUnavailableSlots.includes(slot))) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: 'ไม่สามารถวางวิชาลงคาบว่างที่ล็อคไว้ได้' });
            return;
        }
        if (targetSlots.some(slot => (schedule[slot] || []).some(c => c.locked && !movingInstanceIds.has(c.instanceId)))) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: 'ไม่สามารถวางทับคาบที่ถูกล็อคได้' });
            return;
        }

        // 2. Comprehensive Constraints Check for Active Item in all final targetSlots
        for (let i = 0; i < targetSlots.length; i++) {
            const slot = targetSlots[i];
            const itemToCheck = movingItems[i]?.item || activeItem;
            const isDoubleStartSlot = Boolean(partnerSlotId && slot === (forcedDoubleStartSlotId || overId));
            const isDoublePartnerSlot = Boolean(partnerSlotId && slot !== (forcedDoubleStartSlotId || overId));
            
            const allTeacherIds = itemToCheck.teacherIds?.length ? itemToCheck.teacherIds : [itemToCheck.teacherId || selectedTeacher].filter(Boolean) as string[];
            for (const tId of allTeacherIds) {
                const tData = teacherMap[tId];
                const check = checkConstraints(
                    itemToCheck as CourseInstance,
                    slot, 
                    tData, 
                    periodSettings, 
                    specialPeriods, 
                    isDoublePartnerSlot ? getConstraintMapForDoublePartner(itemToCheck as CourseInstance) : assignmentConstraints, 
                    tId === selectedTeacher ? dynamicUnavailableSlots : (tData?.preferences?.unavailableSlots || []),
                    schoolMasterSchedule, // check against everyone
                    isDoubleStartSlot ? 2 : 1,
                    Array.from(movingInstanceIds),
                    false,
                    movingSlots
                );

                if (check.forbidden) {
                    const globalConflicts = schoolMasterSchedule[slot] || [];
                    const hasHardConflict = globalConflicts.length === 0;
                    
                    if (hasHardConflict) {
                        MySwal.fire({ icon: 'warning', title: 'ไม่สามารถย้ายได้', text: `[ครู ${getTeacherName(tId)}] ${check.message}` });
                        return;
                    }
                }
            }
        }

        // 3. Duplicate teaching on the same day check for single periods
        if (!partnerSlotId) {
            const [targetDay] = overId.split('-');
            const isDuplicateOnSameDay = Object.entries(schedule).some(([slotKey, courses]) => {
                const [slotDay] = slotKey.split('-');
                if (slotDay !== targetDay) return false;
                if (originalCellKey && slotKey === originalCellKey) return false;
                if (movingItems.some(move => move.slot === slotKey)) return false;

                return courses.some(c => c.compositeId === activeItem!.compositeId && Number(c.groupNumber || 1) === Number(activeItem!.groupNumber || 1));
            });

            if (isDuplicateOnSameDay) {
                const confirmResult = await MySwal.fire({
                    title: 'จัดสอนซ้ำในวันเดียว',
                    text: 'วิชานี้ถูกจัดสอนในวันเดียวกันอยู่แล้ว คุณต้องการจัดสอนซ้ำใช่หรือไม่?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'ตกลง',
                    cancelButtonText: 'ยกเลิก'
                });
                if (!confirmResult.isConfirmed) {
                    return;
                }
            }
        }

        // --- GLOBAL CONFLICT DETECTION & RESOLUTION ---
        const conflictingItems: { slot: string; item: CourseInstance; teacherId: string }[] = [];
        const conflictKeys = new Set<string>();
        const addConflict = (slot: string, item: CourseInstance, teacherId: string) => {
            const key = `${slot}|${getCourseMoveKey(teacherId, item)}`;
            if (conflictKeys.has(key)) return;
            conflictKeys.add(key);
            conflictingItems.push({ slot, item, teacherId });
        };

        targetSlots.forEach(slot => {
            const globalItems = schoolMasterSchedule[slot] || [];
            globalItems.forEach(gItem => {
                if (!gItem.course) return;

                const isSameTeacher = gItem.teacherId === activeItem.teacherId;
                const draggedClasses = (Array.isArray(activeItem.classId) ? activeItem.classId : [activeItem.classId]).filter(Boolean) as string[];
                const itemClasses = Array.isArray(gItem.classId) ? gItem.classId : [gItem.classId];
                const isSameClass = draggedClasses.some(c => itemClasses.includes(c));

                const draggedRooms = (Array.isArray(activeItem.room) ? activeItem.room : [activeItem.room]).filter(Boolean) as string[];
                const itemRooms = gItem.course?.room || [];
                const isSameRoom = draggedRooms.some(r => itemRooms.includes(r)) && draggedRooms.length > 0;

                const isSelf = gItem.teacherId === activeItem.teacherId &&
                    gItem.course.id === activeItem.id &&
                    movingItems.some(move => move.slot === slot && isSameAssignment(move.item, gItem.course as CourseInstance));

                const isCoTeachingSameAssignment = isSameAssignment(activeItem, gItem.course as CourseInstance);
                // Parallel groups of the same course (e.g. English Group 1 ป.3/1 + Group 2 ป.3/2)
                // share the same classLevel but teach DIFFERENT student rooms — allow same slot.
                const isParallelGroupSameCourse =
                    gItem.course?.id === activeItem.id &&
                    Number(activeItem.groupNumber || 1) > 0 &&
                    Number(gItem.groupNumber || 1) !== Number(activeItem.groupNumber || 1);
                if ((isSameTeacher || isSameClass || isSameRoom) && !isSelf && !isCoTeachingSameAssignment && !isParallelGroupSameCourse) {
                    addConflict(slot, gItem.course as CourseInstance, gItem.teacherId);
                }
            });

            (schedule[slot] || []).forEach(localItem => {
                if (movingInstanceIds.has(localItem.instanceId)) return;
                if (isSameAssignment(activeItem, localItem)) return;
                addConflict(slot, localItem, localItem.teacherId || selectedTeacher);
            });
        });

        const displacementMoves: { teacherId: string; fromSlot: string; toSlot: string; item: CourseInstance }[] = [];
        let canResolveAll = true;
        const reservedDisplacementSlots = new Set<string>();
        const slotsBeingFreedByMove = new Set(movingItems.map(move => move.slot).filter(Boolean));
        const isSlotEmptyAfterActiveMove = (slot: string) => {
            if (targetSlots.includes(slot)) return false;
            if (reservedDisplacementSlots.has(slot)) return false;

            const localAfterMove = (schedule[slot] || []).filter(course => !movingInstanceIds.has(course.instanceId));
            if (localAfterMove.length > 0) return false;

            const globalAfterMove = (schoolMasterSchedule[slot] || []).filter(entry => {
                const entryCourse = entry.course as CourseInstance | null;
                if (!entryCourse) return false;
                return !movingItems.some(move => move.slot === slot && isSameCourseInstance(entry.teacherId, entryCourse, move.item));
            });

            return globalAfterMove.length === 0 || slotsBeingFreedByMove.has(slot);
        };

        for (const conflict of conflictingItems) {
            const conflictTeacher = teacherMap[conflict.teacherId];
            
            // 1. Try to displace (find a new home)
            const validSlots = findValidSlots(
                conflict.item,
                conflict.teacherId,
                {}, // pass empty to allow searching master
                schoolMasterSchedule,
                conflictTeacher,
                periodSettings,
                specialPeriods,
                assignmentConstraints,
                conflictTeacher?.preferences?.unavailableSlots || []
            );
            
            const filteredSlots = validSlots.filter(s => isSlotEmptyAfterActiveMove(s)); 
            
            if (filteredSlots.length > 0) {
                reservedDisplacementSlots.add(filteredSlots[0]);
                displacementMoves.push({ 
                    teacherId: conflict.teacherId, 
                    fromSlot: conflict.slot, 
                    toSlot: filteredSlots[0], 
                    item: conflict.item 
                });
            } else {
                canResolveAll = false;
                break;
            }
        }

        if (!canResolveAll) {
            MySwal.fire({
                icon: 'warning',
                title: 'ไม่สามารถย้ายได้',
                html: `<div class="text-left text-sm whitespace-pre-line">${formatConflictDetails(conflictingItems)}</div><p class="mt-3 text-xs text-slate-500">ระบบไม่ย้ายเพื่อป้องกันตารางหาย กรุณาเลือกคาบอื่นหรือเคลียร์คาบที่ชนก่อน</p>`,
                confirmButtonText: 'ตกลง'
            });
            return;
        }

        // --- APPLY STATE UPDATES ---
        const newSchoolMaster = { ...schoolMasterSchedule };
        const newLocalSchedule = { ...schedule };

        const updateGlobalForAllTeachers = (fromSlot: string | null, toSlot: string | null, item: CourseInstance) => {
            const allTeacherIds = item.teacherIds?.length ? item.teacherIds : [item.teacherId || selectedTeacher].filter(Boolean) as string[];
            allTeacherIds.forEach(tId => {
                if (fromSlot && newSchoolMaster[fromSlot]) {
                    newSchoolMaster[fromSlot] = newSchoolMaster[fromSlot].filter(g => {
                        if (g.teacherId !== tId) return true;
                        const courseIdMatch = g.courseId === item.id || g.course?.id === item.id;
                        const groupMatch = Number(g.groupNumber || 1) === Number(item.groupNumber || 1);
                        return !(courseIdMatch && groupMatch);
                    });
                    if (newSchoolMaster[fromSlot].length === 0) delete newSchoolMaster[fromSlot];
                }
                if (toSlot) {
                    if (!newSchoolMaster[toSlot]) newSchoolMaster[toSlot] = [];
                    newSchoolMaster[toSlot].push({
                        teacherId: tId,
                        teacherIds: item.teacherIds,
                        classId: item.classId ?? '',
                        room: item.room || ['all'],
                        courseId: item.id,
                        groupNumber: item.groupNumber || 1,
                        course: item
                    });
                }
            });
        };

        // 1. Remove active item(s)
        if (originalCellKey) {
            movingItems.forEach(move => {
                updateGlobalForAllTeachers(move.slot, null, move.item);
                const allTeacherIds = move.item.teacherIds?.length ? move.item.teacherIds : [move.item.teacherId || selectedTeacher].filter(Boolean) as string[];
                if (allTeacherIds.includes(selectedTeacher) && newLocalSchedule[move.slot]) {
                    newLocalSchedule[move.slot] = removeMatchingCourseFromSlot(newLocalSchedule[move.slot], selectedTeacher, move.item);
                    if (newLocalSchedule[move.slot].length === 0) delete newLocalSchedule[move.slot];
                }
            });
        }

        targetSlots.forEach(slot => {
            if (newLocalSchedule[slot]) {
                newLocalSchedule[slot] = newLocalSchedule[slot].filter(course =>
                    !movingItems.some(move => isSameCourseInstance(selectedTeacher, course, move.item))
                );
                if (newLocalSchedule[slot].length === 0) delete newLocalSchedule[slot];
            }
        });

        // 2. Process displacements
        displacementMoves.forEach(move => {
            const isRelaxed = checkIfPlacementIsRelaxed(move.item, move.toSlot, false, false);
            const updatedItem = { ...move.item };
            if (isRelaxed) {
                updatedItem.isRelaxedSchedule = true;
                updatedItem.scheduleWarning = 'จัดลงช่วงเวลาที่ไม่ได้กำหนด (เงื่อนไขไม่ตรง)';
            } else {
                delete updatedItem.isRelaxedSchedule;
                delete updatedItem.scheduleWarning;
            }

            updateGlobalForAllTeachers(move.fromSlot, move.toSlot, updatedItem);
            const allTeacherIds = updatedItem.teacherIds?.length ? updatedItem.teacherIds : [updatedItem.teacherId || selectedTeacher].filter(Boolean) as string[];
            if (allTeacherIds.includes(selectedTeacher)) {
                if (newLocalSchedule[move.fromSlot]) {
                    newLocalSchedule[move.fromSlot] = removeMatchingCourseFromSlot(newLocalSchedule[move.fromSlot], selectedTeacher, move.item);
                    if (newLocalSchedule[move.fromSlot].length === 0) delete newLocalSchedule[move.fromSlot];
                }
                if (!newLocalSchedule[move.toSlot]) newLocalSchedule[move.toSlot] = [];
                newLocalSchedule[move.toSlot] = removeMatchingCourseFromSlot(newLocalSchedule[move.toSlot], selectedTeacher, updatedItem);
                newLocalSchedule[move.toSlot].push({ ...updatedItem, locked: false });
            }
        });

        // 3. Place active item(s)
        targetSlots.forEach((slot, index) => {
            const itemToPlace = movingItems[index]?.item || activeItem;
            const isDoubleStartSlot = Boolean(partnerSlotId && slot === (forcedDoubleStartSlotId || overId));
            const isDoublePartnerSlot = Boolean(partnerSlotId && slot !== (forcedDoubleStartSlotId || overId));
            
            const isRelaxed = checkIfPlacementIsRelaxed(itemToPlace, slot, isDoubleStartSlot, isDoublePartnerSlot);
            const updatedItem = { ...itemToPlace };
            if (isRelaxed) {
                updatedItem.isRelaxedSchedule = true;
                updatedItem.scheduleWarning = 'จัดลงช่วงเวลาที่ไม่ได้กำหนด (เงื่อนไขไม่ตรง)';
            } else {
                delete updatedItem.isRelaxedSchedule;
                delete updatedItem.scheduleWarning;
            }

            updateGlobalForAllTeachers(null, slot, updatedItem);
            const allTeacherIds = updatedItem.teacherIds?.length ? updatedItem.teacherIds : [updatedItem.teacherId || selectedTeacher].filter(Boolean) as string[];
            if (allTeacherIds.includes(selectedTeacher)) {
                if (!newLocalSchedule[slot]) newLocalSchedule[slot] = [];
                newLocalSchedule[slot] = removeMatchingCourseFromSlot(newLocalSchedule[slot], selectedTeacher, updatedItem);
                newLocalSchedule[slot].push({ ...updatedItem, locked: false });
            }
        });

        // 4. Update states
        setSchoolMasterSchedule(newSchoolMaster);
        if (activeItem.teacherId === selectedTeacher) {
            setSchedule(newLocalSchedule);
        }

        if (isFromBank) {
            removeInstancesFromBank(activeId, activeItem, targetSlots.length);
        } else if (movingItems.length > targetSlots.length) {
            const unplacedItems = movingItems.slice(targetSlots.length);
            setAvailableCourseInstances((prevBank: CourseInstance[]) => [
                ...prevBank,
                ...unplacedItems.map(move => ({ ...move.item, locked: false }))
            ]);
        }

        let successMessage = 'ปรับเปลี่ยนตำแหน่งเรียบร้อย';
        if (shouldUseDoubleTarget && targetSlots.length === 1) {
            successMessage = 'ปรับเปลี่ยนตำแหน่งเรียบร้อย (คาบที่สองคงอยู่ในคลัง คาบวาง 1/2)';
        }

        MySwal.fire({
            toast: true,
            position: 'top-end',
            icon: targetSlots.length === 1 && shouldUseDoubleTarget ? 'warning' : 'success',
            title: successMessage,
            showConfirmButton: false,
            timer: 3000
        });
    };


    const toggleLock = (slotId: string, instanceId: string) => {
        if (takeSnapshot) takeSnapshot();
        setSchedule((prev: Schedule) => {
            const courses = prev[slotId];
            if (!courses || courses.length === 0) return prev;

            const updatedCourses = courses.map((c: CourseInstance) =>
                c.instanceId === instanceId ? { ...c, locked: !c.locked } : c
            );
            return { ...prev, [slotId]: updatedCourses };
        });
    };

    const handleRemoveCourse = (slotId: string, instanceId: string) => {
        if (takeSnapshot) takeSnapshot();
        const courses = schedule[slotId];
        if (!courses || courses.length === 0) return;

        const removedCourse = courses.find(c => c.instanceId === instanceId);
        if (!removedCourse) return;

        const pairedMove = getPairedGridMove(removedCourse, slotId);

        setSchedule((prev: Schedule) => {
            const next = { ...prev };
            pairedMove.forEach(move => {
                if (!move.slot || !next[move.slot]) return;
                next[move.slot] = removeMatchingCourseFromSlot(next[move.slot], selectedTeacher, move.item);
                if (next[move.slot].length === 0) delete next[move.slot];
            });
            return next;
        });

        setAvailableCourseInstances((prevBank: CourseInstance[]) => [
            ...prevBank, 
            ...pairedMove.map(move => ({ ...move.item, locked: false }))
        ]);

        setSchoolMasterSchedule((prevMaster: Record<string, MasterScheduleEntry[]>) => {
            const nextMaster = { ...prevMaster };
            pairedMove.forEach(move => {
                if (move.slot && nextMaster[move.slot]) {
                    const allTeacherIds = move.item.teacherIds?.length ? move.item.teacherIds : [move.item.teacherId || selectedTeacher].filter(Boolean);
                    nextMaster[move.slot] = nextMaster[move.slot].filter((g: MasterScheduleEntry) => {
                        if (!allTeacherIds.includes(g.teacherId)) return true;
                        const isSameCourseId = g.course?.id === move.item.id || g.courseId === move.item.id;
                        const isSameGroup = Number(g.groupNumber || 1) === Number(move.item.groupNumber || 1);
                        return !(isSameCourseId && isSameGroup);
                    });
                    if (nextMaster[move.slot].length === 0) delete nextMaster[move.slot];
                }
            });
            return nextMaster;
        });
    };

    const handleManualAdd = async (slotId: string, courseCode: string) => {
        if (!courseCode) return;
        if (takeSnapshot) takeSnapshot();

        // Find an instance from the bank
        const activeItem = availableCourseInstances.find(c => c.code === courseCode);
        if (!activeItem) {
            MySwal.fire({ icon: 'error', title: 'ไม่พบรายวิชา', text: 'รายวิชานี้อาจจะจัดครบตามจำนวนคาบแล้ว' });
            return;
        }

        const targetItemsInCurrentSchedule = schedule[slotId] || [];

        // 1. Locked Checks
        if (targetItemsInCurrentSchedule.some(c => c.locked)) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถเพิ่มได้', text: 'ไม่สามารถวางทับคาบที่ถูกล็อคได้' });
            return;
        }
        if (targetItemsInCurrentSchedule.length > 0) {
            MySwal.fire({ icon: 'warning', title: 'คาบนี้มีรายวิชาแล้ว', text: 'กรุณาเลือกคาบว่างก่อนเพิ่มรายวิชา' });
            return;
        }

        // --- DOUBLE PERIOD AUTO-PLACEMENT & RESCUE LOGIC ---
        let partnerSlotId: string | null = null;
        let primarySlotId = slotId;

        const alreadyPlacedCount = Object.values(schedule).flat().filter(c => c.compositeId === activeItem.compositeId).length;
        const shouldTryDoublePlacement = shouldPlaceNextAsDouble(activeItem, slotId, alreadyPlacedCount, false);

        const checkSlotValidityManual = (slot: string, isPartner: boolean, duration = 1) => {
            const check = checkConstraints(
                activeItem,
                slot,
                selectedTeacherData,
                periodSettings,
                specialPeriods,
                isPartner ? getConstraintMapForDoublePartner(activeItem) : assignmentConstraints,
                dynamicUnavailableSlots,
                schoolMasterSchedule,
                duration,
                [activeItem.instanceId]
            );
            if (check.forbidden) return false;
            if ((schedule[slot] || []).some(c => c.locked)) return false;
            if (schedule[slot] && schedule[slot].length > 0) return false;
            return true;
        };

        if (shouldTryDoublePlacement) {
            const doubleSlots = getDoubleTargetSlots(slotId);
            let standardDoubleSuccessful = false;

            if (doubleSlots) {
                const trialStart = doubleSlots[0];
                const trialPartner = doubleSlots[1];

                if (checkSlotValidityManual(trialStart, false, 2) && checkSlotValidityManual(trialPartner, true)) {
                    primarySlotId = trialStart;
                    partnerSlotId = trialPartner;
                    standardDoubleSuccessful = true;
                }
            }

            if (!standardDoubleSuccessful) {
                MySwal.fire({
                    icon: 'warning',
                    title: 'ไม่สามารถวางคาบคู่ได้',
                    text: 'วิชานี้เหลือเป็นชุดคาบคู่ กรุณาเลือกบล็อกคาบคู่ที่ว่างและตรงตามช่วงเวลาที่กำหนด'
                });
                return;
            }
        }

        if (!partnerSlotId) {
            const { forbidden, message } = checkConstraints(
                activeItem,
                primarySlotId,
                selectedTeacherData,
                periodSettings,
                specialPeriods,
                assignmentConstraints,
                dynamicUnavailableSlots,
                schoolMasterSchedule,
                1,
                [activeItem.instanceId]
            );

            if (forbidden) {
                MySwal.fire({ icon: 'warning', title: 'ไม่สามารถวางได้', text: message });
                return;
            }
        }

        // Check for duplicate teaching on the same day for single periods
        if (!partnerSlotId) {
            const [targetDay] = slotId.split('-');
            const isDuplicateOnSameDay = Object.entries(schedule).some(([slotKey, courses]) => {
                const [slotDay] = slotKey.split('-');
                if (slotDay !== targetDay) return false;

                return courses.some(c => c.compositeId === activeItem.compositeId && Number(c.groupNumber || 1) === Number(activeItem.groupNumber || 1));
            });

            if (isDuplicateOnSameDay) {
                const confirmResult = await MySwal.fire({
                    title: 'จัดสอนซ้ำในวันเดียว',
                    text: 'วิชานี้ถูกจัดสอนในวันเดียวกันอยู่แล้ว คุณต้องการจัดสอนซ้ำใช่หรือไม่?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'ตกลง',
                    cancelButtonText: 'ยกเลิก'
                });
                if (!confirmResult.isConfirmed) {
                    return;
                }
            }
        }

        // --- UPDATE STATE ---
        const isPrimaryRelaxed = checkIfPlacementIsRelaxed(activeItem, primarySlotId, partnerSlotId ? true : false, false);
        const uid = () => Math.random().toString(36).slice(2, 9);
        const primaryItem = {
            ...activeItem,
            instanceId: `${activeItem.id}-${primarySlotId}-${Date.now()}-${uid()}`,
            locked: false,
            ...(isPrimaryRelaxed ? {
                isRelaxedSchedule: true,
                scheduleWarning: 'จัดลงช่วงเวลาที่ไม่ได้กำหนด (เงื่อนไขไม่ตรง)'
            } : {})
        };

        let partnerItem: CourseInstance | null = null;
        if (partnerSlotId) {
            const isPartnerRelaxed = checkIfPlacementIsRelaxed(activeItem, partnerSlotId, false, true);
            partnerItem = {
                ...activeItem,
                instanceId: `${activeItem.id}-${partnerSlotId}-${Date.now()}-${uid()}`,
                locked: false,
                ...(isPartnerRelaxed ? {
                    isRelaxedSchedule: true,
                    scheduleWarning: 'จัดลงช่วงเวลาที่ไม่ได้กำหนด (เงื่อนไขไม่ตรง)'
                } : {})
            };
        }

        removeInstancesFromBank(activeItem.instanceId, activeItem, partnerSlotId ? 2 : 1);

        setSchedule((prev: Schedule) => {
            const next = { ...prev };

            // Primary Slot
            next[primarySlotId] = [...(next[primarySlotId] || []), primaryItem];

            // Partner Slot (if double)
            if (partnerSlotId && partnerItem) {
                next[partnerSlotId] = [...(next[partnerSlotId] || []), partnerItem];
            }

            return next;
        });

        // Also update schoolMasterSchedule immediately
        setSchoolMasterSchedule((prev) => {
            const next = { ...prev };
            
            if (!next[primarySlotId]) next[primarySlotId] = [];
            next[primarySlotId].push({
                teacherId: primaryItem.teacherId || selectedTeacher,
                teacherIds: primaryItem.teacherIds,
                classId: primaryItem.classId ?? '',
                room: primaryItem.room || ['all'],
                courseId: primaryItem.id,
                groupNumber: primaryItem.groupNumber || 1,
                course: primaryItem
            });

            if (partnerSlotId && partnerItem) {
                if (!next[partnerSlotId]) next[partnerSlotId] = [];
                next[partnerSlotId].push({
                    teacherId: partnerItem.teacherId || selectedTeacher,
                    teacherIds: partnerItem.teacherIds,
                    classId: partnerItem.classId ?? '',
                    room: partnerItem.room || ['all'],
                    courseId: partnerItem.id,
                    groupNumber: partnerItem.groupNumber || 1,
                    course: partnerItem
                });
            }
            
            return next;
        });

        let successMessage = 'เพิ่มวิชาเรียบร้อย';
        if (shouldTryDoublePlacement && !partnerSlotId) {
            successMessage = 'เพิ่มวิชาเรียบร้อย (คาบที่สองคงอยู่ในคลัง คาบวาง 1/2)';
        }

        MySwal.fire({
            toast: true,
            position: 'top-end',
            icon: !partnerSlotId && shouldTryDoublePlacement ? 'warning' : 'success',
            title: successMessage,
            showConfirmButton: false,
            timer: 3000
        });
    };

    return {
        handleDragStart,
        handleDragEnd,
        toggleLock,
        handleRemoveCourse,
        handleManualAdd
    };
};
