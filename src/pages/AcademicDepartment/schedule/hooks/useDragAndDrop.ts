import { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { CourseInstance, Schedule, Teacher, PeriodSetting, SpecialPeriod, AssignmentConstraintMap } from '../types';
import { checkConstraints, findValidSlots, getClassDisplayName, DAYS, getPartnerIndexForPeriods, getRequiredWeeklyPeriods } from '../utils';

const MySwal = withReactContent(Swal);

interface UseDragAndDropProps {
    schedule: Schedule;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    availableCourseInstances: CourseInstance[];
    setAvailableCourseInstances: React.Dispatch<React.SetStateAction<CourseInstance[]>>;
    schoolMasterSchedule: Record<string, any[]>;
    setSchoolMasterSchedule: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
    selectedTeacher: string;
    selectedTeacherData: Teacher | undefined;
    teacherMap: Record<string, Teacher>;
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
    selectedSemester,
    periodSettings,
    specialPeriods,
    dynamicUnavailableSlots,
    setActiveDragItem,
    assignmentConstraints
}: UseDragAndDropProps) => {
    const isSameAssignment = (a?: CourseInstance | null, b?: CourseInstance | null) => {
        if (!a || !b) return false;
        return a.compositeId === b.compositeId &&
            Number(a.groupNumber || 1) === Number(b.groupNumber || 1);
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

    const shouldMoveAsDouble = (item: CourseInstance) => {
        const asgnCst = assignmentConstraints[item.compositeId];
        return asgnCst?.type === 'double';
    };

    const getTeachingRuns = () => {
        const orderedPeriods = periodSettings
            .map((period, arrayIndex) => ({
                index: typeof (period as any).index === 'number' ? (period as any).index : arrayIndex,
                isTeachingPeriod: period.isTeachingPeriod
            }))
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
            const rooms = Array.isArray(conflict.item.room) ? conflict.item.room.filter(r => r && r !== 'all').join(', ') : '';
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

    const getDoubleStartSlot = (slotId: string) => {
        const doubleSlots = getDoubleTargetSlots(slotId);
        return doubleSlots?.[0] || slotId;
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

    const handleDragStart = (event: DragStartEvent) => {
        const activeId = String(event.active.id);
        const item = availableCourseInstances.find(c => c.instanceId === activeId) ||
            Object.values(schedule).flat().find(c => c?.instanceId === activeId);

        if (item) setActiveDragItem(item);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragItem(null);

        if (!over) return;

        const activeId = String(active.id);
        let overId = over.data.current?.slotId || String(over.id);

        console.log('[DragDrop] End:', { activeId, overId, actualOverId: over.id });

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
                        next[move.slot] = next[move.slot].filter(c => c.instanceId !== move.item.instanceId);
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

        // 1. Locked Checks
        if (targetItemsInCurrentSchedule.some(c => c.locked && !movingInstanceIds.has(c.instanceId))) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: 'ไม่สามารถวางทับคาบที่ถูกล็อคได้' });
            return;
        }

        // --- DOUBLE PERIOD PARTNER CALCULATION ---
        const asgnCst = assignmentConstraints[activeItem.compositeId];
        let partnerSlotId: string | null = null;
        let forcedDoubleStartSlotId: string | null = null;
        
        const hoursPerWeek = getRequiredWeeklyPeriods(activeItem);

        const alreadyPlacedCount = Object.values(schedule).flat().filter(c => c.compositeId === activeItem!.compositeId).length;
        const effectivePlacedCount = isFromBank ? alreadyPlacedCount : alreadyPlacedCount - movingItems.length;
        const hoursRemaining = hoursPerWeek - effectivePlacedCount;

        const shouldUseDoubleTarget = movingItems.length > 1 ||
            (asgnCst?.type === 'double' && hoursRemaining >= 2);

        if (shouldUseDoubleTarget) {
            const doubleSlots = getDoubleTargetSlots(overId);

            if (doubleSlots) {
                forcedDoubleStartSlotId = doubleSlots[0];
                overId = forcedDoubleStartSlotId;
                partnerSlotId = doubleSlots[1];
            } else if (movingItems.length > 1 || asgnCst?.type === 'double') {
                MySwal.fire({ icon: 'warning', title: 'ไม่สามารถวางคาบคู่ได้', text: 'คาบนี้ไม่ได้อยู่ในบล็อกสำหรับคาบคู่' });
                return;
            }
        }

        // Calculate Target Slots
        const targetSlots = [overId];
        if (partnerSlotId) targetSlots.push(partnerSlotId);

        if (targetSlots.some(slot => (schedule[slot] || []).some(c => c.locked && !movingInstanceIds.has(c.instanceId)))) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: 'ไม่สามารถวางทับคาบที่ถูกล็อคได้' });
            return;
        }

        // 2. Comprehensive Constraints Check for Active Item
        // Check constraints for active item in all target slots
        for (let i = 0; i < targetSlots.length; i++) {
            const slot = targetSlots[i];
            const itemToCheck = movingItems[i]?.item || activeItem;
            const isDoubleStartSlot = Boolean(partnerSlotId && slot === (forcedDoubleStartSlotId || overId));
            const isDoublePartnerSlot = Boolean(partnerSlotId && slot !== (forcedDoubleStartSlotId || overId));
            const check = checkConstraints(
                itemToCheck as CourseInstance,
                slot, 
                selectedTeacherData, 
                periodSettings, 
                specialPeriods, 
                isDoublePartnerSlot ? getConstraintMapForDoublePartner(itemToCheck as CourseInstance) : assignmentConstraints, 
                dynamicUnavailableSlots,
                schoolMasterSchedule, // check against everyone
                isDoubleStartSlot ? 2 : 1,
                Array.from(movingInstanceIds)
            );
            
            // If forbidden, we only allow it if we can displace the conflict
            if (check.forbidden) {
                // Determine if the conflict is "soft" (displaceable) or "hard" (permanent constraint)
                const globalConflicts = schoolMasterSchedule[slot] || [];
                const hasHardConflict = globalConflicts.length === 0; // if no items but forbidden, it's a hard constraint (e.g. lunch)
                
                if (hasHardConflict) {
                    MySwal.fire({ icon: 'warning', title: 'ไม่สามารถย้ายได้', text: check.message });
                    return;
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
                const draggedClasses = Array.isArray(activeItem.classId) ? activeItem.classId : [activeItem.classId];
                const itemClasses = Array.isArray(gItem.classId) ? gItem.classId : [gItem.classId];
                const isSameClass = draggedClasses.some(c => itemClasses.includes(c));
                
                const draggedRooms = Array.isArray(activeItem.room) ? activeItem.room : [activeItem.room];
                const itemRooms = Array.isArray(gItem.course?.room) ? gItem.course?.room : [gItem.course?.room];
                const isSameRoom = draggedRooms.some(r => itemRooms.includes(r)) && draggedRooms.length > 0;

                const isSelf = gItem.teacherId === activeItem.teacherId &&
                    gItem.course.id === activeItem.id &&
                    movingItems.some(move => move.slot === slot && isSameAssignment(move.item, gItem.course as CourseInstance));

                const isCoTeachingSameAssignment = isSameAssignment(activeItem, gItem.course as CourseInstance);
                if ((isSameTeacher || isSameClass || isSameRoom) && !isSelf && !isCoTeachingSameAssignment) {
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

        const updateGlobal = (teacherId: string, fromSlot: string | null, toSlot: string | null, item: CourseInstance) => {
            if (fromSlot && newSchoolMaster[fromSlot]) {
                newSchoolMaster[fromSlot] = newSchoolMaster[fromSlot].filter(
                    g => !(g.teacherId === teacherId && isSameCourseInstance(teacherId, g.course as CourseInstance, item))
                );
                if (newSchoolMaster[fromSlot].length === 0) delete newSchoolMaster[fromSlot];
            }
            if (toSlot) {
                if (!newSchoolMaster[toSlot]) newSchoolMaster[toSlot] = [];
                newSchoolMaster[toSlot].push({
                    teacherId,
                    classId: item.classId,
                    groupNumber: item.groupNumber || 1,
                    course: item
                });
            }
        };

        // 1. Remove active item(s)
        if (originalCellKey) {
            movingItems.forEach(move => {
                updateGlobal(move.item.teacherId!, move.slot, null, move.item);
                if (move.item.teacherId === selectedTeacher && newLocalSchedule[move.slot]) {
                    newLocalSchedule[move.slot] = newLocalSchedule[move.slot].filter(c => c.instanceId !== move.item.instanceId);
                    if (newLocalSchedule[move.slot].length === 0) delete newLocalSchedule[move.slot];
                }
            });
        }

        targetSlots.forEach(slot => {
            if (newLocalSchedule[slot]) {
                newLocalSchedule[slot] = newLocalSchedule[slot].filter(c => !movingInstanceIds.has(c.instanceId));
                if (newLocalSchedule[slot].length === 0) delete newLocalSchedule[slot];
            }
        });

        // 2. Process displacements
        displacementMoves.forEach(move => {
            updateGlobal(move.teacherId, move.fromSlot, move.toSlot, move.item);
            if (move.teacherId === selectedTeacher) {
                if (newLocalSchedule[move.fromSlot]) {
                    newLocalSchedule[move.fromSlot] = newLocalSchedule[move.fromSlot].filter(c => !isSameCourseInstance(move.teacherId, c, move.item));
                    if (newLocalSchedule[move.fromSlot].length === 0) delete newLocalSchedule[move.fromSlot];
                }
                if (!newLocalSchedule[move.toSlot]) newLocalSchedule[move.toSlot] = [];
                newLocalSchedule[move.toSlot].push({ ...move.item, locked: false });
            }
        });

        // 3. Place active item(s)
        targetSlots.forEach((slot, index) => {
            const itemToPlace = movingItems[index]?.item || activeItem;
            updateGlobal(itemToPlace.teacherId!, null, slot, itemToPlace);
            if (itemToPlace.teacherId === selectedTeacher) {
                if (!newLocalSchedule[slot]) newLocalSchedule[slot] = [];
                newLocalSchedule[slot].push({ ...itemToPlace, locked: false });
            }
        });

        // 4. Update states
        setSchoolMasterSchedule(newSchoolMaster);
        if (activeItem.teacherId === selectedTeacher) {
            setSchedule(newLocalSchedule);
        }

        if (isFromBank) {
            removeInstancesFromBank(activeId, activeItem, targetSlots.length);
        }

        MySwal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'ปรับเปลี่ยนตำแหน่งเรียบร้อย',
            showConfirmButton: false,
            timer: 1500
        });
    };


    const toggleLock = (slotId: string, instanceId: string) => {
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
        setSchedule((prev: Schedule) => {
            const courses = prev[slotId];
            if (!courses || courses.length === 0) return prev;

            const removedCourse = courses.find(c => c.instanceId === instanceId);
            if (removedCourse?.locked) {
                MySwal.fire({ icon: 'error', title: 'ไม่สามารถลบได้', text: 'กรุณาปลดล็อควิชาก่อนลบ' });
                return prev;
            }

            const updatedCourses = courses.filter(c => c.instanceId !== instanceId);

            if (removedCourse) {
                setAvailableCourseInstances((prevBank: CourseInstance[]) => [...prevBank, { ...removedCourse, locked: false }]);
            }

            const next = { ...prev };
            if (updatedCourses.length === 0) delete next[slotId];
            else next[slotId] = updatedCourses;
            return next;
        });
    };

    const handleManualAdd = async (slotId: string, courseCode: string) => {
        if (!courseCode) return;

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

        // --- DOUBLE PERIOD AUTO-PLACEMENT ---
        const asgnCst = assignmentConstraints[activeItem.compositeId];
        let partnerSlotId: string | null = null;
        let primarySlotId = slotId;
        
        const hoursPerWeek = getRequiredWeeklyPeriods(activeItem);

        const alreadyPlacedCount = Object.values(schedule).flat().filter(c => c.compositeId === activeItem.compositeId).length;
        const hoursRemaining = hoursPerWeek - alreadyPlacedCount;
        const shouldTryDoublePlacement = asgnCst?.type === 'double' && hoursRemaining >= 2;

        if (shouldTryDoublePlacement) {
            const doubleSlots = getDoubleTargetSlots(slotId);
            
            if (doubleSlots) {
                primarySlotId = doubleSlots[0];
                const potPartnerId = doubleSlots[1];
                const partnerCheck = checkConstraints(
                    activeItem, 
                    potPartnerId, 
                    selectedTeacherData, 
                    periodSettings, 
                    specialPeriods, 
                    getConstraintMapForDoublePartner(activeItem), 
                    dynamicUnavailableSlots,
                    schoolMasterSchedule,
                    1,
                    [activeItem.instanceId]
                );
                
                const primaryCheck = checkConstraints(
                    activeItem,
                    primarySlotId,
                    selectedTeacherData,
                    periodSettings,
                    specialPeriods,
                    assignmentConstraints,
                    dynamicUnavailableSlots,
                    schoolMasterSchedule,
                    2,
                    [activeItem.instanceId]
                );

                if (!primaryCheck.forbidden && !partnerCheck.forbidden && (!schedule[primarySlotId] || schedule[primarySlotId].length === 0) && (!schedule[potPartnerId] || schedule[potPartnerId].length === 0)) {
                    partnerSlotId = potPartnerId;
                } else if (asgnCst?.type === 'double' || hoursPerWeek >= 5) {
                    MySwal.fire({ 
                        icon: 'warning', 
                        title: 'ไม่สามารถวางคาบคู่ได้', 
                        text: primaryCheck.message || partnerCheck.message || 'คาบต่อเนื่องไม่ว่าง' 
                    });
                    return;
                }
            } else if (asgnCst?.type === 'double' || hoursPerWeek >= 5) {
                MySwal.fire({ icon: 'warning', title: 'ไม่สามารถวางคาบคู่ได้', text: 'คาบนี้ไม่ได้อยู่ในบล็อกสำหรับคาบคู่' });
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
        setSchedule((prev: Schedule) => {
            const next = { ...prev };
            
            removeInstancesFromBank(activeItem.instanceId, activeItem, partnerSlotId ? 2 : 1);
            
            // Primary Slot
            const newInstance = { ...activeItem, instanceId: `${activeItem.id}-${primarySlotId}-${Date.now()}`, locked: false };
            next[primarySlotId] = [...(next[primarySlotId] || []), newInstance];

            // Partner Slot (if double)
            if (partnerSlotId) {
                const partnerInstance = { ...activeItem, instanceId: `${activeItem.id}-${partnerSlotId}-${Date.now() + 1}`, locked: false };
                next[partnerSlotId] = [...(next[partnerSlotId] || []), partnerInstance];
            }
            
            return next;
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
