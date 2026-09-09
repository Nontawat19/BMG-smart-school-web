/**
 * Shared scheduling utilities used across actions, hooks, and engine layers.
 * Single source of truth — no per-file duplicates.
 */

export const getScheduleDocId = (teacherId: string, academicYear: string, semester: string) =>
    `${teacherId}__${academicYear || 'unknown'}__${semester || '1'}`;

/** Deduplicated list of teacher IDs for a task or assignment (handles both single and co-teaching). */
export const getTaskTeacherIds = (task: { teacherId: string; teacherIds?: string[] }): string[] =>
    Array.from(new Set(
        (task.teacherIds && task.teacherIds.length > 0 ? task.teacherIds : [task.teacherId]).filter(Boolean)
    ));

export const resolveScheduleTeacherId = (
    scheduleKey: string,
    storedTeacherId: string | undefined,
    knownTeacherIds: string[]
): string => {
    if (storedTeacherId && knownTeacherIds.includes(storedTeacherId)) return storedTeacherId;
    const byPattern = knownTeacherIds.find(tId =>
        scheduleKey === tId ||
        scheduleKey.startsWith(`${tId}__`) ||
        scheduleKey.startsWith(`${tId}_`)
    );
    return byPattern || storedTeacherId || scheduleKey.split('__')[0] || scheduleKey.split('_')[0];
};

export const matchesScheduleTerm = (
    data: { academicYear?: string; semester?: string } | undefined,
    targetYear: string,
    targetSemester: string
): boolean => {
    const dataYear = String(data?.academicYear || '');
    const dataSemester = String(data?.semester || '');
    const yearMatches = !targetYear || !dataYear || dataYear === targetYear;
    const semesterMatches =
        !dataSemester ||
        dataSemester === targetSemester ||
        dataSemester.startsWith(`${targetSemester}/`) ||
        targetSemester.startsWith(`${dataSemester}/`);
    return yearMatches && semesterMatches;
};

export const matchesScheduleTeacher = (
    scheduleKey: string,
    storedTeacherId: string | undefined,
    knownTeacherIds: string[],
    targetTeacherId: string
): boolean => resolveScheduleTeacherId(scheduleKey, storedTeacherId, knownTeacherIds) === targetTeacherId;

export const normalizeGroupNumber = (groupNumber?: number | string): number => {
    const n = Number(groupNumber || 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
};

export const getAssignmentCompositeId = (courseId: string, groupNumber?: number | string): string =>
    `${courseId}_${normalizeGroupNumber(groupNumber)}`;

export const normalizeClassIds = (classId: string | string[] | undefined): string[] =>
    Array.from(new Set(
        (Array.isArray(classId) ? classId : [classId]).filter(Boolean) as string[]
    ));

export const normalizeRooms = (rooms: string | string[] | undefined): string[] => {
    const list = Array.isArray(rooms) ? rooms : (rooms ? [rooms] : []);
    return list.filter(r => r && r.toLowerCase() !== 'all');
};

/**
 * A teacher can end up with more than one `schedules` doc matching the same
 * academicYear+semester (e.g. after a re-generate created a new canonical doc
 * id without the old one being deleted). Keep only the canonical doc per
 * teacher for that term — falling back to whatever exists if no canonical doc
 * is present — so stale/duplicate docs never get merged into a shown schedule.
 */
export const getCanonicalScheduleDocs = (
    docs: Array<{ id: string; data: any }>,
    knownTeacherIds: string[],
    year: string,
    term: string
) => {
    const matching = docs
        .map(({ id, data }) => {
            if (!matchesScheduleTerm(data, year, term)) return null;
            const teacherId = resolveScheduleTeacherId(id, data.teacherId, knownTeacherIds);
            const canonicalId = getScheduleDocId(teacherId, String(data.academicYear || year || ''), String(data.semester || term || '1'));
            return { id, data, teacherId, isCanonical: id === canonicalId || id.includes('__') };
        })
        .filter(Boolean) as Array<{ id: string; data: any; teacherId: string; isCanonical: boolean }>;

    const teachersWithCanonicalDocs = new Set(
        matching.filter(item => item.isCanonical).map(item => item.teacherId)
    );

    return matching.filter(item => item.isCanonical || !teachersWithCanonicalDocs.has(item.teacherId));
};
