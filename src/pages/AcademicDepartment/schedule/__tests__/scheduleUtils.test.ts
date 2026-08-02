import { describe, expect, it } from 'vitest';
import { checkConstraints, getPartnerIndex, getPartnerIndexForPeriods, haveDistinctSpecificRooms, isProtectedSpecialPeriodSetting } from '../utils';
import type { Course, CourseInstance, PeriodSetting, Teacher } from '../types';

describe('isProtectedSpecialPeriodSetting', () => {
    it('treats fixed non-teaching periods as protected', () => {
        expect(isProtectedSpecialPeriodSetting({ id: 'homeroom', label: 'โฮมรูม' })).toBe(true);
        expect(isProtectedSpecialPeriodSetting({ id: 'lunch', label: 'พักกลางวัน' })).toBe(true);
        expect(isProtectedSpecialPeriodSetting({ id: 'club', label: 'ชุมนุม' })).toBe(true);
    });

    it('does not treat ordinary teaching periods as protected just because they contain broad words', () => {
        expect(isProtectedSpecialPeriodSetting({ id: 'period-1', label: 'คาบที่ 1' })).toBe(false);
        expect(isProtectedSpecialPeriodSetting({ id: 'period-2', label: 'กิจกรรมการเรียนรู้' })).toBe(false);
        expect(isProtectedSpecialPeriodSetting({ id: 'period-3', label: 'แนะแนววิชาการ' })).toBe(false);
    });
});

describe('double-period partner selection', () => {
    it('supports consecutive default teaching pairs including 2-3 and 6-7', () => {
        expect(getPartnerIndex(1)).toBe(2);
        expect(getPartnerIndex(2)).toBe(3);
        expect(getPartnerIndex(3)).toBe(4);
        expect(getPartnerIndex(4)).toBe(3);
        expect(getPartnerIndex(6)).toBe(7);
        expect(getPartnerIndex(7)).toBe(8);
    });

    it('supports consecutive custom-period pairs without crossing lunch', () => {
        const periodSettings: PeriodSetting[] = [
            { id: 'homeroom', label: 'โฮมรูม', startTime: '08:00', endTime: '08:30', isTeachingPeriod: false },
            { id: 'period-1', label: 'คาบที่ 1', startTime: '08:30', endTime: '09:20', isTeachingPeriod: true },
            { id: 'period-2', label: 'คาบที่ 2', startTime: '09:20', endTime: '10:10', isTeachingPeriod: true },
            { id: 'period-3', label: 'คาบที่ 3', startTime: '10:10', endTime: '11:00', isTeachingPeriod: true },
            { id: 'period-4', label: 'คาบที่ 4', startTime: '11:00', endTime: '11:50', isTeachingPeriod: true },
            { id: 'lunch', label: 'พักกลางวัน', startTime: '11:50', endTime: '12:50', isTeachingPeriod: false },
            { id: 'period-5', label: 'คาบที่ 5', startTime: '12:50', endTime: '13:40', isTeachingPeriod: true },
            { id: 'period-6', label: 'คาบที่ 6', startTime: '13:40', endTime: '14:30', isTeachingPeriod: true },
            { id: 'period-7', label: 'คาบที่ 7', startTime: '14:30', endTime: '15:20', isTeachingPeriod: true },
        ];

        expect(getPartnerIndexForPeriods(2, periodSettings)).toBe(3);
        expect(getPartnerIndexForPeriods(3, periodSettings)).toBe(4);
        expect(getPartnerIndexForPeriods(4, periodSettings)).toBe(3);
        expect(getPartnerIndexForPeriods(6, periodSettings)).toBe(7);
        expect(getPartnerIndexForPeriods(7, periodSettings)).toBe(8);
        expect(getPartnerIndexForPeriods(8, periodSettings)).toBe(7);
    });
});

describe('checkConstraints', () => {
    const periodSettings: PeriodSetting[] = [
        { id: 'period-1', label: 'คาบที่ 1', startTime: '08:30', endTime: '09:20', isTeachingPeriod: true },
        { id: 'period-2', label: 'คาบที่ 2', startTime: '09:20', endTime: '10:10', isTeachingPeriod: true },
        { id: 'lunch', label: 'พักกลางวัน', startTime: '12:00', endTime: '12:50', isTeachingPeriod: false },
    ];

    const teacher: Teacher = {
        id: 'teacher-1',
        name: 'ครูทดสอบ',
        preferences: {}
    };

    const course: CourseInstance = {
        id: 'course-1',
        title: 'ภาษาไทยพื้นฐาน',
        code: 'ท32101',
        classId: 'ม.5/1',
        room: ['room-1'],
        teacherId: 'teacher-1',
        teacherIds: ['teacher-1'],
        instanceId: 'course-1-mon-0',
        compositeId: 'course-1_1',
        groupNumber: 1,
    };

    it('forbids placing a course into a dynamically locked unavailable slot', () => {
        const result = checkConstraints(
            course,
            'mon-1',
            teacher,
            periodSettings,
            [],
            {},
            ['mon-1'],
            {}
        );

        expect(result.forbidden).toBe(true);
        expect(result.message).toContain('คาบว่าง');
    });

    it('allows placing a course into an ordinary teaching slot when no constraints block it', () => {
        const result = checkConstraints(
            course,
            'mon-0',
            teacher,
            periodSettings,
            [],
            {},
            [],
            {}
        );

        expect(result.forbidden).toBe(false);
        expect(result.message).toBe('');
    });

    // Regression coverage for a reported false-positive conflict: elective/rotation-group
    // courses (e.g. ทัศนศิลป์, สุขศึกษา) are assigned a coarse, grade-level-only classId
    // (per CLASS_MAPPING in schoolUtils.ts — no per-room granularity), so two entirely
    // different subjects taught in different rooms at the same time were wrongly blocked
    // just because they shared that grade-level classId.
    describe('class conflict check ignores room for elective/rotation-group courses sharing a coarse classId', () => {
        const electiveCourseA: CourseInstance = {
            ...course,
            id: 'art-course',
            title: 'ทัศนศิลป์5',
            code: 'ศ23101',
            classId: 'm3',
            room: ['room-313'],
            groupNumber: 1,
            compositeId: 'art-course_1',
        };

        const otherTeacher: Teacher = { id: 'teacher-2', name: 'ครูสอนสุขศึกษา', preferences: {} };

        const occupantCourse: Course = {
            id: 'health-course',
            title: 'สุขศึกษา5',
            code: 'พ23101',
            credits: 1,
            classId: 'm3',
            room: ['room-117'],
            groupNumber: 2,
        } as Course;

        it('allows two different courses that share a coarse grade-level classId when their rooms do not overlap', () => {
            const result = checkConstraints(
                electiveCourseA,
                'mon-0',
                teacher,
                periodSettings,
                [],
                {},
                [],
                {
                    'mon-0': [{ teacherId: otherTeacher.id, classId: 'm3', course: occupantCourse, groupNumber: 2 }]
                }
            );

            expect(result.forbidden).toBe(false);
        });

        it('still blocks two different courses sharing a coarse classId when rooms overlap (real conflict)', () => {
            const clashingOccupant: Course = { ...occupantCourse, room: ['room-313'] };
            const result = checkConstraints(
                electiveCourseA,
                'mon-0',
                teacher,
                periodSettings,
                [],
                {},
                [],
                {
                    'mon-0': [{ teacherId: otherTeacher.id, classId: 'm3', course: clashingOccupant, groupNumber: 2 }]
                }
            );

            expect(result.forbidden).toBe(true);
        });

        it('still blocks when either course has no specific room (cannot prove they are physically separate)', () => {
            const noRoomOccupant: Course = { ...occupantCourse, room: [] };
            const result = checkConstraints(
                electiveCourseA,
                'mon-0',
                teacher,
                periodSettings,
                [],
                {},
                [],
                {
                    'mon-0': [{ teacherId: otherTeacher.id, classId: 'm3', course: noRoomOccupant, groupNumber: 2 }]
                }
            );

            expect(result.forbidden).toBe(true);
        });

        it('still blocks when rooms only partially overlap', () => {
            const partiallyOverlappingOccupant: Course = { ...occupantCourse, room: ['room-117', 'room-313'] };
            const result = checkConstraints(
                { ...electiveCourseA, room: ['room-313', 'room-314'] },
                'mon-0',
                teacher,
                periodSettings,
                [],
                {},
                [],
                {
                    'mon-0': [{ teacherId: otherTeacher.id, classId: 'm3', course: partiallyOverlappingOccupant, groupNumber: 2 }]
                }
            );

            expect(result.forbidden).toBe(true);
        });

        it('allows the same course split into parallel groups sharing a coarse classId (pre-existing exemption still works)', () => {
            const parallelGroupOccupant: Course = { ...occupantCourse, id: electiveCourseA.id, title: electiveCourseA.title, room: [] };
            const result = checkConstraints(
                electiveCourseA,
                'mon-0',
                teacher,
                periodSettings,
                [],
                {},
                [],
                {
                    'mon-0': [{ teacherId: otherTeacher.id, classId: 'm3', course: parallelGroupOccupant, groupNumber: 2 }]
                }
            );

            expect(result.forbidden).toBe(false);
        });
    });
});

describe('haveDistinctSpecificRooms', () => {
    it('returns true when both sides have specific, non-overlapping rooms', () => {
        expect(haveDistinctSpecificRooms(['room-313'], ['room-117'])).toBe(true);
    });

    it('returns false when rooms overlap', () => {
        expect(haveDistinctSpecificRooms(['room-313', 'room-117'], ['room-117'])).toBe(false);
    });

    it('returns false when either side has no specific room info', () => {
        expect(haveDistinctSpecificRooms([], ['room-117'])).toBe(false);
        expect(haveDistinctSpecificRooms(['room-313'], [])).toBe(false);
        expect(haveDistinctSpecificRooms(['all'], ['room-117'])).toBe(false);
        expect(haveDistinctSpecificRooms(undefined, ['room-117'])).toBe(false);
    });
});
