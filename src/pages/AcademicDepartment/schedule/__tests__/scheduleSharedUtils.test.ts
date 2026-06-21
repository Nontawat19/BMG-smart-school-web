import { describe, expect, it } from 'vitest';
import {
    matchesScheduleTeacher,
    matchesScheduleTerm,
    resolveScheduleTeacherId,
} from '../scheduleSharedUtils';

describe('scheduleSharedUtils', () => {
    describe('matchesScheduleTerm', () => {
        it('matches exact academic year and semester', () => {
            expect(matchesScheduleTerm({ academicYear: '2569', semester: '1' }, '2569', '1')).toBe(true);
        });

        it('matches compatible semester formats', () => {
            expect(matchesScheduleTerm({ academicYear: '2569', semester: '1/2569' }, '2569', '1')).toBe(true);
            expect(matchesScheduleTerm({ academicYear: '2569', semester: '1' }, '2569', '1/2569')).toBe(true);
        });

        it('rejects different academic years', () => {
            expect(matchesScheduleTerm({ academicYear: '2570', semester: '1' }, '2569', '1')).toBe(false);
        });
    });

    describe('resolveScheduleTeacherId', () => {
        const knownTeacherIds = ['teacher-1', 'teacher-2'];

        it('uses stored teacher id when available', () => {
            expect(resolveScheduleTeacherId('legacy-doc', 'teacher-2', knownTeacherIds)).toBe('teacher-2');
        });

        it('resolves canonical doc ids', () => {
            expect(resolveScheduleTeacherId('teacher-1__2569__1', undefined, knownTeacherIds)).toBe('teacher-1');
        });

        it('resolves legacy doc ids', () => {
            expect(resolveScheduleTeacherId('teacher-1_m1', undefined, knownTeacherIds)).toBe('teacher-1');
        });
    });

    describe('matchesScheduleTeacher', () => {
        const knownTeacherIds = ['teacher-1', 'teacher-2'];

        it('matches canonical doc ids', () => {
            expect(matchesScheduleTeacher('teacher-1__2569__1', undefined, knownTeacherIds, 'teacher-1')).toBe(true);
        });

        it('matches legacy doc ids without stored teacherId', () => {
            expect(matchesScheduleTeacher('teacher-1_m1', undefined, knownTeacherIds, 'teacher-1')).toBe(true);
        });

        it('rejects other teachers', () => {
            expect(matchesScheduleTeacher('teacher-1_m1', undefined, knownTeacherIds, 'teacher-2')).toBe(false);
        });
    });
});
