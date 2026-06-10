import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { collection, doc, getDocs, writeBatch, deleteDoc, query, where } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Course, CourseInstance, Schedule, Teacher, PeriodSetting, SpecialPeriod, SchedulingMetrics, SchoolSettings, AssignmentConstraintMap } from '../types';
import { useAutoScheduleAction } from '../actions/useAutoScheduleAction';

const MySwal = withReactContent(Swal);

const getScheduleDocId = (teacherId: string, academicYear: string, semester: string) => {
    return `${teacherId}__${academicYear || 'unknown'}__${semester || '1'}`;
};

const resolveScheduleTeacherId = (
    scheduleKey: string,
    storedTeacherId: string | undefined,
    knownTeacherIds: string[]
) => {
    if (storedTeacherId && knownTeacherIds.includes(storedTeacherId)) return storedTeacherId;
    const byPattern = knownTeacherIds.find(tId =>
        scheduleKey === tId ||
        scheduleKey.startsWith(`${tId}__`) ||
        scheduleKey.startsWith(`${tId}_`)
    );
    return byPattern || storedTeacherId || scheduleKey.split('__')[0] || scheduleKey.split('_')[0];
};

const hasScheduleEntries = (scheduleData: any) => {
    const entries = scheduleData?.schedule || scheduleData;
    return Object.values(entries || {}).some((courses: any) => Array.isArray(courses) && courses.length > 0);
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
    fetchData: (schoolId: string) => Promise<void>;
    loadTeacherMasterSchedule: () => Promise<void>;
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
    fetchData,
    loadTeacherMasterSchedule,
    schoolSettings,
    scheduleSectionRef,
    assignmentConstraints
}: UseScheduleActionsProps) => {

    const handleSaveSchedule = async () => {
        if (!selectedTeacher || !schoolId) {
            MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกครูผู้สอนก่อนบันทึก' });
            return;
        }
        setIsSaving(true);
        try {
            const batch = writeBatch(db);

            // 1. Prepare the consolidated schedule to save
            // We save the entire schedule in one document per teacher to ensure consistency and avoid duplication.
            const scheduleToSave: Record<string, any> = {};
            
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

            // 2. Save to Firestore
            const scheduleDocId = getScheduleDocId(selectedTeacher, selectedYear, selectedSemester);
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

            const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
            const existingSchedules = await getDocs(schedulesRef);
            existingSchedules.docs.forEach(scheduleDoc => {
                if (scheduleDoc.id === scheduleDocId) return;
                const data = scheduleDoc.data();
                const docTeacherId = resolveScheduleTeacherId(scheduleDoc.id, data.teacherId, teachers.map(t => t.id));
                if (docTeacherId !== selectedTeacher) return;

                const dataYear = String(data.academicYear || "");
                const dataSemester = String(data.semester || "");
                const yearMatches = !selectedYear || !dataYear || dataYear === selectedYear;
                const semesterMatches = !dataSemester || dataSemester === selectedSemester || dataSemester.startsWith(selectedSemester + '/') || selectedSemester.startsWith(dataSemester + '/');
                if (!yearMatches || !semesterMatches) return;

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
            await loadTeacherMasterSchedule();
            await fetchData(schoolId);
        } catch (error) {
            console.error("Error saving schedule: ", error);
            MySwal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'เกิดข้อผิดพลาดในการบันทึกตารางสอน' });
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
            setIsSaving(true);
            try {
                const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
                const q = query(schedulesRef, where('teacherId', '==', selectedTeacher));
                const snapshot = await getDocs(q);
                
                const deletePromises = snapshot.docs
                    .filter(doc => {
                        const data = doc.data();
                        return String(data.academicYear) === selectedYear && String(data.semester) === selectedSemester;
                    })
                    .map(doc => deleteDoc(doc.ref));

                if (deletePromises.length > 0) {
                    await Promise.all(deletePromises);
                } else {
                    const scheduleDocId = getScheduleDocId(selectedTeacher, selectedYear, selectedSemester);
                    const scheduleRef = doc(db, "school-settings", schoolId, "schedules", scheduleDocId);
                    await deleteDoc(scheduleRef);
                }

                setSchedule({});
                await fetchData(schoolId);

                MySwal.fire(
                    'สำเร็จ!',
                    'ตารางสอนของครูท่านนี้ถูกล้างแล้ว',
                    'success'
                );
            } catch (error) {
                console.error("Error clearing teacher schedule:", error);
                MySwal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถล้างตารางสอนได้' });
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
        loadTeacherMasterSchedule,
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

        return snapshot.docs.some(scheduleDoc => {
            const data = scheduleDoc.data();
            const docTeacherId = resolveScheduleTeacherId(scheduleDoc.id, data.teacherId, teachers.map(t => t.id));
            if (teacherId && docTeacherId !== teacherId) return false;

            const dataYear = String(data.academicYear || "");
            const dataSemester = String(data.semester || "");
            const yearMatches = !selectedYear || !dataYear || dataYear === selectedYear;
            const semesterMatches = !dataSemester || dataSemester === selectedSemester || dataSemester.startsWith(selectedSemester + '/') || selectedSemester.startsWith(dataSemester + '/');

            return yearMatches && semesterMatches && hasScheduleEntries(data);
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

                await batch.commit();

                MySwal.fire('สำเร็จ', 'ล้างข้อมูลเรียบร้อยแล้ว', 'success');
                setSchedule({});
                await fetchData(schoolId);

            } catch (error) {
                console.error(error);
                MySwal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถล้างข้อมูลตารางสอนทั้งหมดได้', 'error');
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
