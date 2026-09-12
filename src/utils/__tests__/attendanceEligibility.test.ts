import { describe, it, expect } from 'vitest';
import {
    buildAttendancePages,
    buildStudentAttendanceSummaries,
    computeAttendanceEligibility,
} from '../attendanceEligibility';

describe('attendanceEligibility multi-room calculation', () => {
    const calendarData = {
        terms: {
            term1: {
                startDate: '2026-05-18',
                endDate: '2026-10-09',
            },
        },
        events: {},
    };

    it('does not inflate totalPossibleHours for Room 1 when Room 2 has classes on a different day', () => {
        // Room 1 meets Wednesday (1 period per week)
        const room1Schedule = { wed: [0] };

        // Daily attendance status:
        // Room 1 student s1 attended 18 Wednesdays
        // Room 2 student s2 attended 20 Thursdays
        const dailyStatusRoom1: Record<string, any> = {};
        const dailyStatusRoom2: Record<string, any> = {};

        // 18 Wednesdays on or before today
        const wednesdays = [
            '2026-05-20', '2026-05-27', '2026-06-03', '2026-06-10', '2026-06-17',
            '2026-06-24', '2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22',
            '2026-07-29', '2026-08-05', '2026-08-12', '2026-08-19', '2026-08-26',
            '2026-09-02', '2026-09-09', '2026-09-10'
        ];
        wednesdays.forEach(d => {
            dailyStatusRoom1[d] = 'present';
        });

        // 20 Thursdays for Room 2
        const thursdays = [
            '2026-05-21', '2026-05-28', '2026-06-04', '2026-06-11', '2026-06-18',
            '2026-06-25', '2026-07-02', '2026-07-09', '2026-07-16', '2026-07-23',
            '2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27',
            '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'
        ];
        thursdays.forEach(d => {
            dailyStatusRoom2[d] = 'present';
        });

        const combinedDailyStatus = {
            s1_room1: dailyStatusRoom1,
            s2_room2: dailyStatusRoom2,
        };

        // When scoped properly for Room 1 roster (s1_room1 only):
        const rosterRoom1 = [{ id: 's1_room1' }];
        const scopedStatusRoom1 = { s1_room1: dailyStatusRoom1 };

        const pagesRoom1 = buildAttendancePages(
            calendarData,
            room1Schedule,
            '1',
            'm5/1',
            scopedStatusRoom1
        );

        const summariesRoom1 = buildStudentAttendanceSummaries(
            rosterRoom1,
            pagesRoom1,
            combinedDailyStatus
        );

        const eligibilityRoom1 = computeAttendanceEligibility(summariesRoom1);
        const resultS1 = eligibilityRoom1['s1_room1'];

        // Should NOT be 32+ periods! Should be ~18-21 periods (1 per week)
        expect(resultS1.totalHours).toBeLessThanOrEqual(21);
        expect(resultS1.presentHours).toBe(18);
        expect(resultS1.percentage).toBeGreaterThanOrEqual(80);
        expect(resultS1.belowThreshold).toBe(false);
    });
});
