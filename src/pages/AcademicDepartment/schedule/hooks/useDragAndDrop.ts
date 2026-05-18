import { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { CourseInstance, Schedule, Teacher, PeriodSetting, SpecialPeriod, AssignmentConstraintMap } from '../types';
import { checkConstraints, findValidSlots, getClassDisplayName, DAYS, getPartnerIndex } from '../utils';

const MySwal = withReactContent(Swal);

interface UseDragAndDropProps {
    schedule: Schedule;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    availableCourseInstances: CourseInstance[];
    setAvailableCourseInstances: React.Dispatch<React.SetStateAction<CourseInstance[]>>;
    schoolMasterSchedule: Record<string, any[]>;
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
<<<<<<< HEAD
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
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    const handleDragStart = (event: DragStartEvent) => {
        const activeId = String(event.active.id);
        const item = availableCourseInstances.find(c => c.instanceId === activeId) ||
            Object.values(schedule).flat().find(c => c?.instanceId === activeId);

        if (item) setActiveDragItem(item);
    };

    const handleDragEnd = (event: DragEndEvent) => {
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
                setSchedule((prev: Schedule) => {
                    const next = { ...prev };
                    for (const key in next) {
                        next[key] = next[key].filter(c => c.instanceId !== activeId);
                        if (next[key].length === 0) delete next[key];
                    }
                    return next;
                });
                setAvailableCourseInstances((prev: CourseInstance[]) => [...prev, { ...gridItem, locked: false }]);
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

        // 1. Locked Checks
        if (targetItemsInCurrentSchedule.some(c => c.locked)) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: 'ไม่สามารถวางทับคาบที่ถูกล็อคได้' });
            return;
        }
<<<<<<< HEAD
        if (isFromBank && targetItemsInCurrentSchedule.length > 0) {
            MySwal.fire({ icon: 'warning', title: 'คาบนี้มีรายวิชาแล้ว', text: 'กรุณาเลือกคาบว่าง หรือย้ายรายวิชาเดิมออกก่อน' });
            return;
        }
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

        // 2. Global Conflict Checks (School Master Schedule)
        const targetOccupancies = (schoolMasterSchedule[overId] || []).filter(occ => {
            const semStr = String(occ.course?.semester || "");
            const targetSem = String(selectedSemester || "1");
            return !occ.course?.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
        });

        const lockedConflict = targetOccupancies.find(occ => occ.teacherId !== selectedTeacher && occ.course?.locked);
        if (lockedConflict) {
            MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: `คาบนี้ถูกล็อคโดยครูท่านอื่น (${teacherMap[lockedConflict.teacherId]?.name || 'N/A'})` });
            return;
        }

        // 3. Comprehensive Constraints Check (Availability, Master Schedule Conflicts)
        const { forbidden, message } = checkConstraints(
            activeItem as CourseInstance, 
            overId, 
            selectedTeacherData, 
            periodSettings, 
            specialPeriods, 
            assignmentConstraints, 
            dynamicUnavailableSlots,
            schoolMasterSchedule
        );
        
        if (forbidden) {
            MySwal.fire({ icon: 'warning', title: 'ไม่สามารถย้ายได้', text: message });
            return;
        }

        // --- DOUBLE PERIOD AUTO-PLACEMENT ---
        const asgnCst = assignmentConstraints[activeItem.compositeId];
        let partnerSlotId: string | null = null;
        
        // Calculate remaining hours to see if we can do a double
        const totalCredits = Number(activeItem.credits) || 0;
        const standardPeriods = Math.round(totalCredits * 2);
        const hoursPerWeek = standardPeriods > 0 ? standardPeriods : (activeItem.hoursPerWeek || 1);

        const alreadyPlacedCount = Object.values(schedule).flat().filter(c => c.compositeId === activeItem!.compositeId).length;
        const hoursRemaining = hoursPerWeek - alreadyPlacedCount;

        if (isFromBank && (asgnCst?.type === 'double' || asgnCst?.type === 'mixed') && hoursRemaining >= 2) {
            const [day, pNumStr] = overId.split('-');
            const pNum = parseInt(pNumStr);
            const partnerIdx = getPartnerIndex(pNum);
            
                if (partnerIdx !== -1) {
                    const potPartnerId = `${day}-${partnerIdx}`;
                    const partnerCheck = checkConstraints(
                        activeItem as CourseInstance, 
                        potPartnerId, 
                        selectedTeacherData, 
                        periodSettings, 
                        specialPeriods, 
                        assignmentConstraints, 
                        dynamicUnavailableSlots,
                        schoolMasterSchedule
                    );
                    
<<<<<<< HEAD
                    if (!partnerCheck.forbidden && (!schedule[potPartnerId] || schedule[potPartnerId].length === 0)) {
=======
                    if (!partnerCheck.forbidden && !schedule[potPartnerId]) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        partnerSlotId = potPartnerId;
                    } else if (asgnCst.type === 'double') {
                        MySwal.fire({ 
                            icon: 'warning', 
                            title: 'ไม่สามารถวางคาบคู่ได้', 
                            text: partnerCheck.message || 'คาบต่อเนื่องไม่ว่าง' 
                        });
                        return;
                    }
                } else if (asgnCst.type === 'double') {
                MySwal.fire({ icon: 'warning', title: 'ไม่สามารถวางคาบคู่ได้', text: 'คาบนี้ไม่ได้อยู่ในบล็อกสำหรับคาบคู่' });
                return;
            }
        }

        // --- SUCCESS: UPDATE STATE ---
        setSchedule((prev: Schedule) => {
            const next = { ...prev };

            if (isFromBank) {
<<<<<<< HEAD
                // Remove the exact number of periods placed. Double periods consume two bank instances.
                removeInstancesFromBank(activeId, activeItem!, partnerSlotId ? 2 : 1);
=======
                // Remove from bank
                setAvailableCourseInstances((list: CourseInstance[]) => list.filter(c => c.instanceId !== activeId));
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                
                // Primary Slot
                const newInstance = { ...activeItem!, instanceId: `${activeItem!.id}-${overId}-${Date.now()}`, locked: false };
                next[overId] = [...(next[overId] || []), newInstance];

                // Partner Slot (if double)
                if (partnerSlotId) {
                    const partnerInstance = { ...activeItem!, instanceId: `${activeItem!.id}-${partnerSlotId}-${Date.now() + 1}`, locked: false };
                    next[partnerSlotId] = [...(next[partnerSlotId] || []), partnerInstance];
                }
            } else if (originalCellKey) {
                // Moving within Grid
                const targetSlotItems = next[overId] || [];
                const existingItem = targetSlotItems[0]; // For now assume 1 course per slot

                if (existingItem) {
                    // SWAP: Check if the item in the target slot can move to our original slot
                    const swapCheck = checkConstraints(
                        existingItem, 
                        originalCellKey, 
                        selectedTeacherData, 
                        periodSettings, 
                        specialPeriods, 
                        assignmentConstraints, 
                        dynamicUnavailableSlots,
                        schoolMasterSchedule
                    );

                    if (swapCheck.forbidden) {
                        MySwal.fire({ 
                            icon: 'warning', 
                            title: 'ไม่สามารถสลับคาบได้', 
                            text: `วิชาที่สลับไม่สามารถวางในคาบเดิมได้: ${swapCheck.message}` 
                        });
                        return prev;
                    }

                    // SWAP: Exchange positions
                    next[originalCellKey] = next[originalCellKey].map(c => 
                        c.instanceId === activeId ? { ...existingItem, instanceId: `${existingItem.id}-${originalCellKey}-${Date.now()}` } : c
                    );
                    next[overId] = targetSlotItems.map(c => 
                        c.instanceId === existingItem.instanceId ? { ...activeItem!, instanceId: `${activeItem!.id}-${overId}-${Date.now() + 1}` } : c
                    );
                } else {
                    // MOVE: Simple move to empty slot
                    next[originalCellKey] = next[originalCellKey].filter(c => c.instanceId !== activeId);
                    if (next[originalCellKey].length === 0) delete next[originalCellKey];
                    
                    const movedInstance = { ...activeItem!, instanceId: `${activeItem!.id}-${overId}-${Date.now()}`, locked: false };
                    next[overId] = [...(next[overId] || []), movedInstance];
                }
            }
            return next;
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

    const handleManualAdd = (slotId: string, courseCode: string) => {
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
<<<<<<< HEAD
        if (targetItemsInCurrentSchedule.length > 0) {
            MySwal.fire({ icon: 'warning', title: 'คาบนี้มีรายวิชาแล้ว', text: 'กรุณาเลือกคาบว่างก่อนเพิ่มรายวิชา' });
            return;
        }
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

        // 2. Constraints Check
        const { forbidden, message } = checkConstraints(
            activeItem, 
            slotId, 
            selectedTeacherData, 
            periodSettings, 
            specialPeriods, 
            assignmentConstraints, 
            dynamicUnavailableSlots,
            schoolMasterSchedule
        );
        
        if (forbidden) {
            MySwal.fire({ icon: 'warning', title: 'ไม่สามารถวางได้', text: message });
            return;
        }

        // --- DOUBLE PERIOD AUTO-PLACEMENT ---
        const asgnCst = assignmentConstraints[activeItem.compositeId];
        let partnerSlotId: string | null = null;
        
        const totalCredits = Number(activeItem.credits) || 0;
        const standardPeriods = Math.round(totalCredits * 2);
        const hoursPerWeek = standardPeriods > 0 ? standardPeriods : (activeItem.hoursPerWeek || 1);

        const alreadyPlacedCount = Object.values(schedule).flat().filter(c => c.compositeId === activeItem.compositeId).length;
        const hoursRemaining = hoursPerWeek - alreadyPlacedCount;

        if ((asgnCst?.type === 'double' || asgnCst?.type === 'mixed') && hoursRemaining >= 2) {
            const [day, pNumStr] = slotId.split('-');
            const pNum = parseInt(pNumStr);
            const partnerIdx = getPartnerIndex(pNum);
            
            if (partnerIdx !== -1) {
                const potPartnerId = `${day}-${partnerIdx}`;
                const partnerCheck = checkConstraints(
                    activeItem, 
                    potPartnerId, 
                    selectedTeacherData, 
                    periodSettings, 
                    specialPeriods, 
                    assignmentConstraints, 
                    dynamicUnavailableSlots,
                    schoolMasterSchedule
                );
                
                if (!partnerCheck.forbidden && (!schedule[potPartnerId] || schedule[potPartnerId].length === 0)) {
                    partnerSlotId = potPartnerId;
                } else if (asgnCst.type === 'double') {
                    MySwal.fire({ 
                        icon: 'warning', 
                        title: 'ไม่สามารถวางคาบคู่ได้', 
                        text: partnerCheck.message || 'คาบต่อเนื่องไม่ว่าง' 
                    });
                    return;
                }
            } else if (asgnCst.type === 'double') {
                MySwal.fire({ icon: 'warning', title: 'ไม่สามารถวางคาบคู่ได้', text: 'คาบนี้ไม่ได้อยู่ในบล็อกสำหรับคาบคู่' });
                return;
            }
        }

        // --- UPDATE STATE ---
        setSchedule((prev: Schedule) => {
            const next = { ...prev };
            
<<<<<<< HEAD
            removeInstancesFromBank(activeItem.instanceId, activeItem, partnerSlotId ? 2 : 1);
=======
            // Remove from bank
            setAvailableCourseInstances((list: CourseInstance[]) => {
                const index = list.findIndex(c => c.instanceId === activeItem.instanceId);
                if (index === -1) return list;
                const newList = [...list];
                newList.splice(index, 1);
                return newList;
            });
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            
            // Primary Slot
            const newInstance = { ...activeItem, instanceId: `${activeItem.id}-${slotId}-${Date.now()}`, locked: false };
            next[slotId] = [...(next[slotId] || []), newInstance];

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
