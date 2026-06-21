import { describe, expect, it } from 'vitest';
import { checkConstraints, getPartnerIndex, getPartnerIndexForPeriods, isProtectedSpecialPeriodSetting } from '../utils';
import type { CourseInstance, PeriodSetting, Teacher } from '../types';

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
});
