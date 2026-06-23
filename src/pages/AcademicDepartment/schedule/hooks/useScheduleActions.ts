import type { Dispatch, SetStateAction } from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { collection, doc, getDocs, getDocsFromServer, writeBatch, deleteDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Course, CourseInstance, Schedule, Teacher, PeriodSetting, SpecialPeriod, SchedulingMetrics, SchoolSettings, AssignmentConstraintMap } from '../types';
import { useAutoScheduleAction } from '../actions/useAutoScheduleAction';
import { getScheduleDocId, matchesScheduleTeacher, matchesScheduleTerm } from '../scheduleSharedUtils';
import { getActiveSchedulingLock } from '../scheduleRunLock';

const MySwal = withReactContent(Swal);

const hasScheduleEntries = (scheduleData: unknown) => {
    const data = scheduleData as Record<string, unknown> | undefined;
    const entries = (data?.schedule as Record<string, unknown> | undefined) || data;
    return Object.values(entries || {}).some(
        (courses: unknown) => Array.isArray(courses) && courses.some((c: unknown) => c != null)
    );
};

interface UseScheduleActionsProps {
    schoolId: string | undefined;
    selectedTeacher: string;
    selectedYear: string;
    selectedSemester: string;
    teachers: Teacher[];
    allCourses: Course[];
    schedule: Schedule;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    setAvailableCourseInstances: React.Dispatch<React.SetStateAction<CourseInstance[]>>;
    setIsSaving: (isSaving: boolean) => void;
    setIsAutoScheduling: (isAutoScheduling: boolean) => void;
    setSchedulingMetrics: (metrics: SchedulingMetrics | null) => void;
    periodSettings: PeriodSetting[];
    specialPeriods: SpecialPeriod[];
    dynamicUnavailableSlots: string[];
    setDynamicUnavailableSlots?: Dispatch<SetStateAction<string[]>>;
    setLocalUnavailableSlotsMap?: Dispatch<SetStateAction<Record<string, string[]>>>;
    fetchData: (schoolId: string) => Promise<void>;
    schoolSettings: SchoolSettings;
    scheduleSectionRef: React.RefObject<HTMLDivElement | null>;
    assignmentConstraints: AssignmentConstraintMap;
}

export const useScheduleActions = ({
    schoolId,
    selectedTeacher,
    selectedYear,
    selectedSemester,
    teachers,
    allCourses,
    schedule,
    setSchedule,
    setAvailableCourseInstances,
    setIsSaving,
    setIsAutoScheduling,
    setSchedulingMetrics,
    periodSettings,
    specialPeriods,
    dynamicUnavailableSlots,
    setDynamicUnavailableSlots,
    setLocalUnavailableSlotsMap,
    fetchData,
    schoolSettings,
    scheduleSectionRef,
    assignmentConstraints
}: UseScheduleActionsProps) => {

const getFirebaseErrorMessage = (error: unknown): string => {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (msg.includes('permission') || msg.includes('unauthorized')) return 'ไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาตรวจสอบการเข้าสู่ระบบ';
    if (msg.includes('network') || msg.includes('unavailable')) return 'เกิดปัญหาการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบการเชื่อมต่อ';
    if (msg.includes('quota')) return 'เกินโควต้าการใช้งาน กรุณาลองใหม่ภายหลัง';
    return error instanceof Error ? error.message : 'ข้อผิดพลาดที่ไม่รู้จัก';
};

    const ensureScheduleNotLocked = async () => {
        if (!schoolId) return true;
        const activeLock = await getActiveSchedulingLock(schoolId);
        if (!activeLock) return true;

        MySwal.fire({
            icon: 'warning',
            title: 'ระบบกำลังจัดตาราง',
            text: 'มีการจัดตารางสอนอัตโนมัติอยู่ในขณะนี้ กรุณารอให้เสร็จก่อนแล้วค่อยบันทึกหรือแก้ไขอีกครั้ง'
        });
        return false;
    };

    const handleSaveSchedule = async () => {
        if (!selectedTeacher || !schoolId) {
            MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกครูผู้สอนก่อนบันทึก' });
            return;
        }
        if (!(await ensureScheduleNotLocked())) return;
        setIsSaving(true);
        try {
            // 1. Prepare the consolidated schedule to save
            const scheduleToSave: Record<string, Omit<CourseInstance, 'instanceId' | 'className'>[]> = {};

            Object.entries(schedule).forEach(([slotId, courses]) => {
                if (courses && courses.length > 0) {
                    scheduleToSave[slotId] = courses.map(course => {
                        const { instanceId, className, ...courseData } = course;
                        return courseData;
                    });
                }
            });

            const teacherClasses = new Set<string>();
            Object.values(schedule).forEach(courses => {
                courses.forEach(c => {
                    const ids = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                    ids.forEach(id => teacherClasses.add(id));
                });
            });

            const scheduleDocId = getScheduleDocId(selectedTeacher, selectedYear, selectedSemester);

            // 2. Read existing docs BEFORE queuing any batch writes, forcing a server fetch
            //    to bypass Firestore's local cache.  Using getDocs() here would serve the
            //    cached collection snapshot which may not include docs created by the
            //    auto-scheduler after the page loaded, leaving stale docs un-deleted and
            //    causing courses to appear in both the old and new slot after save.
            const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
            const existingSchedules = await getDocsFromServer(schedulesRef);

            // 3. Build and commit batch
            const batch = writeBatch(db);

            const scheduleRef = doc(db, "school-settings", schoolId, "schedules", scheduleDocId);
            batch.set(scheduleRef, {
                teacherId: selectedTeacher,
                academicYear: selectedYear,
                semester: selectedSemester,
                schedule: scheduleToSave,
                updatedAt: new Date(),
                classId: Array.from(teacherClasses),
            });

            const teacherRef = doc(db, 'school-settings', schoolId, 'teachers', selectedTeacher);
            batch.set(teacherRef, {
                preferences: { unavailableSlots: dynamicUnavailableSlots }
            }, { merge: true });

            const knownTeacherIds = teachers.map(t => t.id);
            existingSchedules.docs.forEach(scheduleDoc => {
                if (scheduleDoc.id === scheduleDocId) return;
                const data = scheduleDoc.data();
                if (!matchesScheduleTeacher(scheduleDoc.id, data.teacherId, knownTeacherIds, selectedTeacher)) return;
                if (!matchesScheduleTerm(data, selectedYear, selectedSemester)) return;
                batch.delete(scheduleDoc.ref);
            });

            await batch.commit();

            MySwal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'บันทึกตารางสอนสำเร็จ!',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
            });
            await fetchData(schoolId);
        } catch (error) {
            console.error("Error saving schedule: ", error);
            MySwal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: getFirebaseErrorMessage(error) });
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearSchedule = async () => {
        if (!selectedTeacher || !schoolId) {
            MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกครูที่ต้องการล้างตารางสอน' });
            return;
        }

        const result = await MySwal.fire({
            title: 'ยืนยันการล้างตารางสอน',
            text: `คุณแน่ใจหรือไม่ว่าต้องการล้างตารางสอนทั้งหมดของครูท่านนี้?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ใช่, ล้างข้อมูล',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            if (!(await ensureScheduleNotLocked())) return;
            setIsSaving(true);
            try {
                const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
                const snapshot = await getDocs(schedulesRef);
                const knownTeacherIds = teachers.map(t => t.id);

                const deletePromises = snapshot.docs
                    .filter(scheduleDoc => {
                        const data = scheduleDoc.data();
                        return matchesScheduleTeacher(scheduleDoc.id, data.teacherId, knownTeacherIds, selectedTeacher) &&
                            matchesScheduleTerm(data, selectedYear, selectedSemester);
                    })
                    .map(scheduleDoc => deleteDoc(scheduleDoc.ref));

                if (deletePromises.length > 0) {
                    await Promise.all(deletePromises);
                } else {
                    const scheduleDocId = getScheduleDocId(selectedTeacher, selectedYear, selectedSemester);
                    const scheduleRef = doc(db, "school-settings", schoolId, "schedules", scheduleDocId);
                    await deleteDoc(scheduleRef);
                }

                // Also clear any "locked free" (ว่าง) period markers for this teacher —
                // otherwise those cells stay stuck/locked even after the schedule is wiped.
                const teacherRef = doc(db, 'school-settings', schoolId, 'teachers', selectedTeacher);
                await writeBatch(db).set(teacherRef, { preferences: { unavailableSlots: [] } }, { merge: true }).commit();
                setDynamicUnavailableSlots?.([]);
                setLocalUnavailableSlotsMap?.(prev => {
                    const next = { ...prev };
                    delete next[selectedTeacher];
                    return next;
                });

                setSchedule({});
                await fetchData(schoolId);

                MySwal.fire(
                    'สำเร็จ!',
                    'ตารางสอนของครูท่านนี้ถูกล้างแล้ว',
                    'success'
                );
            } catch (error) {
                console.error("Error clearing teacher schedule:", error);
                MySwal.fire({ icon: 'error', title: 'ล้างตารางไม่สำเร็จ', text: getFirebaseErrorMessage(error) });
            } finally {
                setIsSaving(false);
            }
        }
    };
    
    const {
        handleGenerateSchoolTimetable: runGenerateSchoolTimetable,
        handleAutoScheduleForTeacherAndClasses: runAutoScheduleForTeacherAndClasses
    } = useAutoScheduleAction({
        schoolId,
        selectedTeacher,
        selectedYear,
        selectedSemester,
        teachers,
        allCourses,
        schedule,
        setSchedule,
        setAvailableCourseInstances,
        setIsSaving,
        setIsAutoScheduling,
        setSchedulingMetrics,
        periodSettings,
        specialPeriods,
        dynamicUnavailableSlots,
        fetchData,
        schoolSettings,
        scheduleSectionRef,
        assignmentConstraints
    });

    const hasExistingScheduleForCurrentTerm = async (teacherId?: string) => {
        if (!schoolId) return false;

        if (teacherId && teacherId === selectedTeacher && hasScheduleEntries(schedule)) {
            return true;
        }

        const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
        const snapshot = await getDocs(schedulesRef);
        const knownTeacherIds = teachers.map(t => t.id);

        return snapshot.docs.some(scheduleDoc => {
            const data = scheduleDoc.data();
            if (teacherId && !matchesScheduleTeacher(scheduleDoc.id, data.teacherId, knownTeacherIds, teacherId)) return false;
            return matchesScheduleTerm(data, selectedYear, selectedSemester) && hasScheduleEntries(data);
        });
    };

    const confirmReschedule = async (scope: 'school' | 'teacher') => {
        const hasExistingSchedule = await hasExistingScheduleForCurrentTerm(scope === 'teacher' ? selectedTeacher : undefined);
        if (!hasExistingSchedule) return true;

        const result = await MySwal.fire({
            title: scope === 'teacher' ? 'จัดตารางสอนครูท่านนี้ใหม่?' : 'จัดตารางสอนทั้งโรงเรียนใหม่?',
            text: scope === 'teacher'
                ? 'ครูท่านนี้มีตารางสอนอยู่แล้ว หากยืนยัน ระบบจะจัดตารางใหม่ทับข้อมูลเดิม'
                : 'มีตารางสอนในปีการศึกษาและภาคเรียนนี้อยู่แล้ว หากยืนยัน ระบบจะจัดตารางใหม่ทับข้อมูลเดิม',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'ยืนยันจัดใหม่',
            cancelButtonText: 'ยกเลิก'
        });

        return result.isConfirmed;
    };

    const handleGenerateSchoolTimetable = async () => {
        if (await confirmReschedule('school')) {
            await runGenerateSchoolTimetable();
        }
    };

    const handleAutoScheduleForTeacherAndClasses = async () => {
        if (!selectedTeacher) {
            await runAutoScheduleForTeacherAndClasses();
            return;
        }

        if (await confirmReschedule('teacher')) {
            await runAutoScheduleForTeacherAndClasses();
        }
    };

    const handleClearAllTeachersSchedules = async () => {
        if (!schoolId) return;

        const result = await MySwal.fire({
            title: 'ล้างตารางสอนทั้งโรงเรียน?',
            text: "คุณแน่ใจหรือไม่ที่จะล้างข้อมูลตารางสอนทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ล้างข้อมูลทั้งหมด',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            setIsSaving(true);
            try {
                const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
                const snapshot = await getDocs(schedulesRef);
                const batch = writeBatch(db);

                snapshot.docs.forEach(scheduleDoc => {
                    const data = scheduleDoc.data();
                    const dataYear = String(data.academicYear || "");
                    const dataSemester = String(data.semester || "");
                    const yearMatches = !selectedYear || !dataYear || dataYear === selectedYear;
                    const semesterMatches = !dataSemester || dataSemester === selectedSemester || dataSemester.startsWith(selectedSemester + '/') || selectedSemester.startsWith(dataSemester + '/');
                    if (yearMatches && semesterMatches) {
                        batch.delete(scheduleDoc.ref);
                    }
                });

                // Also clear every teacher's "locked free" (ว่าง) period markers —
                // otherwise those cells stay stuck/locked even after the schedule is wiped.
                teachers.forEach(teacher => {
                    if (!teacher.id) return;
                    const teacherRef = doc(db, 'school-settings', schoolId, 'teachers', teacher.id);
                    batch.set(teacherRef, { preferences: { unavailableSlots: [] } }, { merge: true });
                });

                await batch.commit();

                MySwal.fire('สำเร็จ', 'ล้างข้อมูลเรียบร้อยแล้ว', 'success');
                setSchedule({});
                setDynamicUnavailableSlots?.([]);
                setLocalUnavailableSlotsMap?.({});
                await fetchData(schoolId);

            } catch (error) {
                console.error(error);
                MySwal.fire({ icon: 'error', title: 'ล้างตารางไม่สำเร็จ', text: getFirebaseErrorMessage(error) });
            } finally {
                setIsSaving(false);
            }
        }
    };

    return {
        handleSaveSchedule,
        handleClearSchedule,
        handleGenerateSchoolTimetable,
        handleAutoScheduleForTeacherAndClasses,
        handleClearAllTeachersSchedules
    };
};
