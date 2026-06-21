import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp } from 'firebase/app';
import {
    collection,
    connectFirestoreEmulator,
    deleteDoc,
    doc,
    getDocs,
    getFirestore,
    setDoc,
    writeBatch,
} from 'firebase/firestore';
import { runSchedulingEngine } from '../engine/schedulerEngine';
import type { EngineTask, EngineTeachingSlot } from '../engine/schedulerEngine';
import { validatePostSchedule } from '../actions/autoSchedule/postScheduleValidator';
import type { Course, PeriodSetting } from '../types';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const runIfEmulator = emulatorHost ? describe : describe.skip;

const schoolId = 'schedule-e2e-school';
const year = '2568';
const semester = '1';

const periodSettings: PeriodSetting[] = ['08:30', '09:20', '10:20', '13:00'].map((startTime, index) => ({
    id: `period-${index + 1}`,
    label: `คาบ ${index + 1}`,
    startTime,
    endTime: startTime,
    isTeachingPeriod: true,
}));

const teachingSlots: EngineTeachingSlot[] = ['mon', 'tue', 'wed', 'thu', 'fri'].flatMap(dayKey =>
    periodSettings.map((periodSetting, index) => ({
        dayKey,
        periodSetting,
        slotId: `${dayKey}-${index}`,
    }))
);

const allSlotIds = teachingSlots.map(slot => slot.slotId);

const makeTask = (course: Course, teacherId: string, classId: string, groupNumber: number): EngineTask => ({
    course,
    teacherId,
    targetClasses: [classId],
    targetRooms: ['all'],
    instanceCount: 1,
    duration: 1,
    originalCourseId: course.id,
    compositeId: `${course.id}_${groupNumber}`,
    groupNumber,
});

runIfEmulator('Firestore emulator scheduling E2E', () => {
    const [host, portText] = (emulatorHost || '127.0.0.1:8080').split(':');
    const app = initializeApp({ projectId: 'bmg-smartschool' }, `schedule-e2e-${Date.now()}`);
    const db = getFirestore(app);

    beforeAll(async () => {
        connectFirestoreEmulator(db, host, Number(portText || 8080));

        for (const subcollection of ['courses', 'teachers', 'course_assignments', 'schedules']) {
            const snap = await getDocs(collection(db, 'school-settings', schoolId, subcollection));
            await Promise.all(snap.docs.map(item => deleteDoc(item.ref)));
        }
    });

    afterAll(async () => {
        await Promise.all(getApps().map(existingApp => deleteApp(existingApp)));
    });

    it('seeds realistic school data, schedules it, validates it, and writes schedule docs', async () => {
        const courses: Course[] = [
            { id: 'thai-m1', code: 'TH101', title: 'ภาษาไทย', hoursPerWeek: 1 },
            { id: 'math-m1', code: 'MA101', title: 'คณิตศาสตร์', hoursPerWeek: 1 },
            { id: 'thai-m2', code: 'TH201', title: 'ภาษาไทย', hoursPerWeek: 1 },
            { id: 'science-m2', code: 'SC201', title: 'วิทยาศาสตร์', hoursPerWeek: 1 },
        ];
        const teachers = [
            { id: 'teacher-thai', name: 'ครูภาษาไทย' },
            { id: 'teacher-math', name: 'ครูคณิตศาสตร์' },
            { id: 'teacher-science', name: 'ครูวิทยาศาสตร์' },
        ];

        const batch = writeBatch(db);
        courses.forEach(course => {
            batch.set(doc(db, 'school-settings', schoolId, 'courses', course.id), course);
        });
        teachers.forEach(teacher => {
            batch.set(doc(db, 'school-settings', schoolId, 'teachers', teacher.id), teacher);
        });
        batch.set(doc(db, 'school-settings', schoolId, 'course_assignments', `thai-m1_${year}_${semester}`), {
            courseId: 'thai-m1',
            academicYear: year,
            semester,
            teacherAssignments: [{ teacherId: 'teacher-thai', roomIds: ['all'], classLevels: ['m1'], groupNumber: 1 }],
        });
        batch.set(doc(db, 'school-settings', schoolId, 'course_assignments', `math-m1_${year}_${semester}`), {
            courseId: 'math-m1',
            academicYear: year,
            semester,
            teacherAssignments: [{ teacherId: 'teacher-math', roomIds: ['all'], classLevels: ['m1'], groupNumber: 1 }],
        });
        batch.set(doc(db, 'school-settings', schoolId, 'course_assignments', `thai-m2_${year}_${semester}`), {
            courseId: 'thai-m2',
            academicYear: year,
            semester,
            teacherAssignments: [{ teacherId: 'teacher-thai', roomIds: ['all'], classLevels: ['m2'], groupNumber: 1 }],
        });
        batch.set(doc(db, 'school-settings', schoolId, 'course_assignments', `science-m2_${year}_${semester}`), {
            courseId: 'science-m2',
            academicYear: year,
            semester,
            teacherAssignments: [{ teacherId: 'teacher-science', roomIds: ['all'], classLevels: ['m2'], groupNumber: 1 }],
        });
        await batch.commit();

        const [courseSnap, assignmentSnap] = await Promise.all([
            getDocs(collection(db, 'school-settings', schoolId, 'courses')),
            getDocs(collection(db, 'school-settings', schoolId, 'course_assignments')),
        ]);
        const coursesById = new Map(courseSnap.docs.map(item => [item.id, { id: item.id, ...item.data() } as Course]));
        const tasks: EngineTask[] = assignmentSnap.docs.flatMap(item => {
            const data = item.data() as { courseId: string; teacherAssignments?: Array<{ teacherId: string; classLevels: string[]; groupNumber: number }> };
            const course = coursesById.get(data.courseId);
            if (!course) return [];
            return (data.teacherAssignments || []).flatMap(assignment =>
                (assignment.classLevels || []).map(classId => makeTask(course, assignment.teacherId, classId, assignment.groupNumber || 1))
            );
        });

        const result = runSchedulingEngine({
            tasks,
            initialTimetable: {},
            initialBatchUpdates: {},
            allTeachingSlots: teachingSlots,
            validSlotsByTaskIndex: tasks.map(() => allSlotIds),
            assignmentConstraints: {},
            maxRuns: 10,
            maxRepairAttempts: 100,
        });
        const validation = validatePostSchedule({ tasks, timetable: result.schoolTimetableRecord });

        expect(result.unplacedTasks).toHaveLength(0);
        expect(validation.isValid).toBe(true);

        await Promise.all(Object.entries(result.batchUpdates).map(([docId, schedule]) =>
            setDoc(doc(db, 'school-settings', schoolId, 'schedules', `${docId}__${year}__${semester}`), {
                schedule,
                academicYear: year,
                semester,
                totalPeriods: Object.values(schedule).reduce((sum, courses) => sum + courses.length, 0),
            })
        ));

        const scheduleSnap = await getDocs(collection(db, 'school-settings', schoolId, 'schedules'));
        expect(scheduleSnap.size).toBeGreaterThan(0);
    });
});
