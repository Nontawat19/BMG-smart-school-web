import { useEffect } from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { CourseInstance, Schedule, Teacher } from '../types';

const MySwal = withReactContent(Swal);

interface UseSmartMoveProps {
    schoolId: string | undefined;
    selectedTeacher: string;
    schedule: Schedule;
    availableCourseInstances: CourseInstance[];
    fetchData: (schoolId: string) => void;
    loadTeacherMasterSchedule: () => void;
}

export const useSmartMove = ({
    schoolId,
    selectedTeacher,
    schedule,
    availableCourseInstances,
    fetchData,
    loadTeacherMasterSchedule
}: UseSmartMoveProps) => {

    useEffect(() => {
        // @ts-ignore
        window.handleSmartMove = async (overId, targetSlotId, conflictingTeacherId, targetCourseId, activeInstanceId, activeClassIdsStr, conflictClassIdsStr) => {
            const activeClassIds = activeClassIdsStr.split(',');
            const conflictClassIds = conflictClassIdsStr.split(',');

            MySwal.close(); // Close dialog first

            const result = await MySwal.fire({
                title: 'ยืนยันการย้ายอัจฉริยะ (Smart Move)',
                text: `ระบบจะย้ายวิชาของครูท่านอื่นไปที่ช่องว่าง และนำวิชาของคุณมาลงแทนที่เดิม ตกลงหรือไม่?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ตกลง ย้ายเลย',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#4f46e5',
                showLoaderOnConfirm: true,
                preConfirm: async () => {
                    try {
                        const batch = writeBatch(db);

                        // 1. Update Conflicting Teacher's Schedule
                        // We need to fetch the current schedule of the conflicting teacher for these classes
                        for (const cId of conflictClassIds) {
                            const docId = `${conflictingTeacherId}_${cId}`;
                            const docRef = doc(db, 'school-settings', schoolId!, 'schedules', docId);
                            const docSnap = await getDoc(docRef);

                            if (docSnap.exists()) {
                                const currentData = docSnap.data();
                                const currentSchedule = currentData.schedule || {};

                                // Find the course to move
                                const slotCourses = currentSchedule[overId] || [];
                                const courseToMove = slotCourses.find((c: any) => c.id === targetCourseId);
                                if (courseToMove) {
                                    const updatedSchedule = { ...currentSchedule };
                                    updatedSchedule[overId] = slotCourses.filter((c: any) => c.id !== targetCourseId);
                                    if (updatedSchedule[overId].length === 0) delete updatedSchedule[overId]; // Remove from old slot

                                    updatedSchedule[targetSlotId] = [...(updatedSchedule[targetSlotId] || []), { ...courseToMove, instanceId: `${targetCourseId}-${targetSlotId}-${cId}` }]; // Move to new slot

                                    batch.update(docRef, {
                                        schedule: updatedSchedule,
                                        totalPeriods: Object.values(updatedSchedule).filter(Boolean).length
                                    });
                                }
                            }
                        }

                        // 2. Update My Schedule
                        // Since we are in the middle of a drag result, we want to save our move too.
                        // activeInstanceId is the course we are dragging.
                        const movingCourse = availableCourseInstances.find(c => c.instanceId === activeInstanceId);
                        if (movingCourse) {
                            for (const cId of activeClassIds) {
                                const myDocId = `${selectedTeacher}_${cId}`;
                                const myDocRef = doc(db, 'school-settings', schoolId!, 'schedules', myDocId);

                                // Fetch current local schedule for this class (from Firestore or state)
                                // Using state 'schedule' is safer for the current editing teacher
                                const currentMySchedule = { ...schedule }; // This might be for a specific class if not filtered
                                // NOTE: If selectedTeacher manages multiple classes, 'schedule' state in this component 
                                // typically reflects the MERGED view. 
                                // The handleSaveSchedule logic handles separating it by class.
                                // For simplicity here, we'll update ALL classes this course belongs to.

                                const updatedMySchedule = { ...currentMySchedule };
                                // Remove from original position (where it was dragged from)
                                // We don't necessarily know the original slot in this callback easily, 
                                // but we know we want it at 'overId'.
                                // Cleaning up other slots for this instanceId:
                                Object.keys(updatedMySchedule).forEach(slot => {
                                    if (updatedMySchedule[slot]?.some(c => c.instanceId === activeInstanceId)) {
                                        updatedMySchedule[slot] = updatedMySchedule[slot].filter(c => c.instanceId !== activeInstanceId);
                                        if (updatedMySchedule[slot].length === 0) delete updatedMySchedule[slot];
                                    }
                                });

                                updatedMySchedule[overId] = [...(updatedMySchedule[overId] || []), { ...movingCourse }];

                                batch.set(myDocRef, {
                                    schedule: updatedMySchedule,
                                    teacherId: selectedTeacher,
                                    classId: cId,
                                    totalPeriods: Object.values(updatedMySchedule).filter(Boolean).length
                                }, { merge: true });
                            }
                        }

                        await batch.commit();
                        return true;
                    } catch (error) {
                        console.error("Smart move failed", error);
                        MySwal.showValidationMessage(`เกิดข้อผิดพลาด: ${error}`);
                    }
                }
            });

            if (result.isConfirmed) {
                MySwal.fire('สำเร็จ', 'ย้ายตารางเรียบร้อยแล้ว', 'success');
                // Refresh everything
                if (schoolId) {
                    fetchData(schoolId);
                    loadTeacherMasterSchedule();
                }
            }
        };

        return () => {
            // @ts-ignore
            window.handleSmartMove = undefined;
        };
    }, [schoolId, selectedTeacher, schedule, availableCourseInstances]);
};
