import { deleteDoc, doc, getDoc, runTransaction } from 'firebase/firestore';
import { firestore as db } from '@/firebase';

const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const LOCK_DOC_ID = 'scheduling_run_lock';

export type SchedulingRunLock = {
    runId: string;
    startedAtMs: number;
    startedBy?: string;
    targetTeacherId?: string;
    status: 'running';
};

const getLockRef = (schoolId: string) =>
    doc(db, 'school-settings', schoolId, 'configs', LOCK_DOC_ID);

export const getActiveSchedulingLock = async (schoolId: string): Promise<SchedulingRunLock | null> => {
    const snap = await getDoc(getLockRef(schoolId));
    if (!snap.exists()) return null;

    const data = snap.data() as Partial<SchedulingRunLock>;
    if (data.status !== 'running' || !data.runId || !data.startedAtMs) return null;
    if (Date.now() - Number(data.startedAtMs) > LOCK_TIMEOUT_MS) return null;

    return {
        runId: String(data.runId),
        startedAtMs: Number(data.startedAtMs),
        startedBy: data.startedBy ? String(data.startedBy) : undefined,
        targetTeacherId: data.targetTeacherId ? String(data.targetTeacherId) : undefined,
        status: 'running'
    };
};

export const acquireSchedulingRunLock = async (
    schoolId: string,
    runId: string,
    startedBy?: string,
    targetTeacherId?: string
) => {
    const lockRef = getLockRef(schoolId);

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(lockRef);
        if (snap.exists()) {
            const data = snap.data() as Partial<SchedulingRunLock>;
            const startedAtMs = Number(data.startedAtMs || 0);
            const isActive = data.status === 'running' && startedAtMs > 0 && (Date.now() - startedAtMs) <= LOCK_TIMEOUT_MS;
            if (isActive && data.runId !== runId) {
                throw new Error('SCHEDULING_LOCKED');
            }
        }

        transaction.set(lockRef, {
            runId,
            status: 'running',
            startedAtMs: Date.now(),
            startedBy: startedBy || '',
            targetTeacherId: targetTeacherId || ''
        });
    });
};

export const releaseSchedulingRunLock = async (schoolId: string, runId: string) => {
    const lockRef = getLockRef(schoolId);

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(lockRef);
        if (!snap.exists()) return;
        const data = snap.data() as Partial<SchedulingRunLock>;
        if (data.runId !== runId) return;
        transaction.delete(lockRef);
    }).catch(async () => {
        const activeLock = await getActiveSchedulingLock(schoolId);
        if (activeLock?.runId === runId) {
            await deleteDoc(lockRef);
        }
    });
};

export const forceReleaseSchedulingRunLock = async (schoolId: string) => {
    await deleteDoc(getLockRef(schoolId));
};
