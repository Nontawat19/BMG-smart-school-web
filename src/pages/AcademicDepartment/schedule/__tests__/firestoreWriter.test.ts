import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuerySnapshot } from 'firebase/firestore';

// `firestoreWriter.ts` only ever calls `doc(...)`, `writeBatch(db).set/delete/commit()`.
// Mock both at the module boundary so these tests never touch a real Firestore project.
const batches: Array<{ set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }> = [];

vi.mock('@/firebase', () => ({ firestore: {} }));

vi.mock('firebase/firestore', () => ({
    doc: (...segments: unknown[]) => ({ __path: segments.slice(1).join('/') }),
    writeBatch: () => {
        const batch = {
            set: vi.fn(),
            delete: vi.fn(),
            commit: vi.fn().mockResolvedValue(undefined),
        };
        batches.push(batch);
        return batch;
    },
}));

const { writeSchedulesToFirestore } = await import('../actions/autoSchedule/firestoreWriter');
import type { FirestoreWriterInput, WriteCourseRecord } from '../actions/autoSchedule/firestoreWriter';
import type { Teacher } from '../types';

const noopProgress = () => {};

const makeTeacher = (id: string): Teacher => ({ id, name: id });

const makeCourse = (overrides: Partial<WriteCourseRecord> & { id: string }): WriteCourseRecord => ({
    title: overrides.id,
    code: overrides.id,
    instanceId: `${overrides.id}-inst`,
    compositeId: `${overrides.id}_1`,
    groupNumber: 1,
    classId: 'm1',
    room: ['all'],
    ...overrides,
});

/** A fake QuerySnapshot containing the given docs (id + raw data). */
const makeSnapshot = (docs: Array<{ id: string; data: Record<string, unknown> }>): QuerySnapshot =>
    ({
        docs: docs.map(d => ({
            id: d.id,
            data: () => d.data,
            ref: { __path: `school-settings/s1/schedules/${d.id}` },
        })),
    }) as unknown as QuerySnapshot;

const baseInput = (overrides: Partial<FirestoreWriterInput> = {}): FirestoreWriterInput => ({
    schoolId: 's1',
    selectedYear: '2568',
    selectedSemester: '1',
    batchUpdates: {},
    existingSchedulesSnapshot: makeSnapshot([]),
    scheduleDocMeta: {},
    allTeachersData: [],
    coTeachingWriteTeacherIds: new Set(),
    shouldHardResetSchoolWide: false,
    ...overrides,
});

beforeEach(() => {
    batches.length = 0;
});

describe('writeSchedulesToFirestore', () => {
    it('writes a brand-new schedule for a teacher with no existing data', async () => {
        const result = await writeSchedulesToFirestore(
            baseInput({
                batchUpdates: { t1: { 'mon-0': [makeCourse({ id: 'c1', classId: 'm1' })] } },
                allTeachersData: [makeTeacher('t1')],
            }),
            noopProgress
        );

        expect(result.teacherIdsToWrite).toEqual(['t1']);
        expect(batches).toHaveLength(1);
        expect(batches[0].set).toHaveBeenCalledTimes(1);

        const [ref, data] = batches[0].set.mock.calls[0];
        expect(ref.__path).toBe('school-settings/s1/schedules/t1__2568__1');
        expect(data.teacherId).toBe('t1');
        expect(data.classId).toEqual(['m1']);
        expect(data.totalPeriods).toBe(1);
        expect(data.semester).toBe('1');
        expect(data.academicYear).toBe('2568');
    });

    it('strips taskId and filters out isTemporarySchedule entries before writing', async () => {
        await writeSchedulesToFirestore(
            baseInput({
                batchUpdates: {
                    t1: {
                        'mon-0': [
                            makeCourse({ id: 'c1', taskId: 42 } as WriteCourseRecord),
                            makeCourse({ id: 'c2', isTemporarySchedule: true }),
                        ],
                    },
                },
                allTeachersData: [makeTeacher('t1')],
            }),
            noopProgress
        );

        const [, data] = batches[0].set.mock.calls[0];
        const writtenSlot = data.schedule['mon-0'];
        expect(writtenSlot).toHaveLength(1);
        expect(writtenSlot[0].id).toBe('c1');
        expect(writtenSlot[0].taskId).toBeUndefined();
    });

    it('merges duplicate course+group entries in the same slot, combining classId/room/teacherIds', async () => {
        await writeSchedulesToFirestore(
            baseInput({
                batchUpdates: {
                    t1: {
                        'mon-0': [
                            makeCourse({ id: 'c1', classId: 'm1', room: ['101'], teacherIds: ['t1'] }),
                            makeCourse({ id: 'c1', classId: 'm2', room: ['102'], teacherIds: ['t1'] }),
                        ],
                    },
                },
                allTeachersData: [makeTeacher('t1')],
            }),
            noopProgress
        );

        const [, data] = batches[0].set.mock.calls[0];
        const writtenSlot = data.schedule['mon-0'];
        expect(writtenSlot).toHaveLength(1);
        expect(writtenSlot[0].classId).toEqual(['m1', 'm2']);
        expect(writtenSlot[0].room).toEqual(['101', '102']);
    });

    it('skips writing when the new schedule is identical to the existing stored document (dirty checking)', async () => {
        const schedule = { 'mon-0': [makeCourse({ id: 'c1', classId: 'm1' })] };
        const result = await writeSchedulesToFirestore(
            baseInput({
                batchUpdates: { t1: schedule },
                allTeachersData: [makeTeacher('t1')],
                existingSchedulesSnapshot: makeSnapshot([
                    { id: 't1__2568__1', data: { schedule, teacherId: 't1' } },
                ]),
            }),
            noopProgress
        );

        expect(result.numBatches).toBe(1);
        // No dirty writes and nothing to delete means the write loop never runs at all.
        expect(batches).toHaveLength(0);
    });

    it('writes when the new schedule differs from the existing stored document', async () => {
        const existingSchedule = { 'mon-0': [makeCourse({ id: 'c1', classId: 'm1' })] };
        const newSchedule = { 'mon-0': [makeCourse({ id: 'c2', classId: 'm1' })] };
        await writeSchedulesToFirestore(
            baseInput({
                batchUpdates: { t1: newSchedule },
                allTeachersData: [makeTeacher('t1')],
                existingSchedulesSnapshot: makeSnapshot([
                    { id: 't1__2568__1', data: { schedule: existingSchedule, teacherId: 't1' } },
                ]),
            }),
            noopProgress
        );

        expect(batches[0].set).toHaveBeenCalledTimes(1);
    });

    it('deletes a teacher\'s existing document when there is no new schedule for them', async () => {
        await writeSchedulesToFirestore(
            baseInput({
                batchUpdates: {},
                allTeachersData: [makeTeacher('t1')],
                existingSchedulesSnapshot: makeSnapshot([
                    { id: 't1__2568__1', data: { schedule: { 'mon-0': [] }, teacherId: 't1' } },
                ]),
            }),
            noopProgress
        );

        expect(batches[0].delete).toHaveBeenCalledTimes(1);
        expect(batches[0].delete.mock.calls[0][0].__path).toBe('school-settings/s1/schedules/t1__2568__1');
    });

    it('hard-reset: deletes all matching-semester docs in a cleanup batch, then writes unconditionally even if unchanged', async () => {
        const schedule = { 'mon-0': [makeCourse({ id: 'c1', classId: 'm1' })] };
        const result = await writeSchedulesToFirestore(
            baseInput({
                batchUpdates: { t1: schedule },
                allTeachersData: [makeTeacher('t1')],
                shouldHardResetSchoolWide: true,
                existingSchedulesSnapshot: makeSnapshot([
                    // Identical schedule — would normally be skipped by dirty-checking,
                    // but hard reset writes unconditionally after wiping everything.
                    { id: 't1__2568__1', data: { schedule, teacherId: 't1', academicYear: '2568', semester: '1' } },
                    // Different year — must NOT be deleted.
                    { id: 't1__2567__1', data: { schedule, teacherId: 't1', academicYear: '2567', semester: '1' } },
                ]),
            }),
            noopProgress
        );

        // First batch = cleanup deletes, second batch = the actual write.
        expect(batches).toHaveLength(2);
        expect(batches[0].delete).toHaveBeenCalledTimes(1);
        expect(batches[0].delete.mock.calls[0][0].__path).toBe('school-settings/s1/schedules/t1__2568__1');
        expect(batches[1].set).toHaveBeenCalledTimes(1);
        expect(result.numBatches).toBe(1);
    });

    it('scopes writes to only the target teacher and their co-teaching partners when normalizedTargetTeacherId is set', async () => {
        await writeSchedulesToFirestore(
            baseInput({
                batchUpdates: {
                    t1: { 'mon-0': [makeCourse({ id: 'c1', classId: 'm1' })] },
                    t2: { 'mon-0': [makeCourse({ id: 'c2', classId: 'm1' })] },
                },
                allTeachersData: [makeTeacher('t1'), makeTeacher('t2')],
                normalizedTargetTeacherId: 't1',
            }),
            noopProgress
        );

        expect(batches[0].set).toHaveBeenCalledTimes(1);
        expect(batches[0].set.mock.calls[0][0].__path).toBe('school-settings/s1/schedules/t1__2568__1');
    });
});
