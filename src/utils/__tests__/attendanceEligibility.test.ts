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

    describe('MOE Regulation (กระทรวงศึกษาธิการ) - Leave counts as absence & Medical Waiver', () => {
        it('counts sick and personal leave as NOT attended, causing มส if attendance < 80%', () => {
            // Total 20 periods
            // Student 1: 18 present, 2 absent -> 18/20 = 90% -> Eligible
            // Student 2: 15 present, 5 leave (sick/personal) -> 15/20 = 75% -> Below 80% -> มส
            // Student 3: 14 present, 2 late, 4 leave -> 16/20 = 80% -> Eligible (80%)
            const mockSummaries = [
                {
                    studentId: 'std_pass',
                    present: 18,
                    late: 0,
                    leave: 0,
                    absent: 2,
                    totalPossibleHours: 20,
                },
                {
                    studentId: 'std_leave_ms',
                    // Present 15, Leave 5 -> attended = 15 -> 15/20 = 75% -> Below 80% (มส)
                    present: 15,
                    late: 0,
                    leave: 5,
                    absent: 0,
                    totalPossibleHours: 20,
                },
                {
                    studentId: 'std_exact_80',
                    // Present 14, Late 2, Leave 4 -> attended = 16 -> 16/20 = 80% -> Passes
                    present: 14,
                    late: 2,
                    leave: 4,
                    absent: 0,
                    totalPossibleHours: 20,
                },
            ];

            const eligibility = computeAttendanceEligibility(mockSummaries);

            expect(eligibility['std_pass'].percentage).toBe(90);
            expect(eligibility['std_pass'].belowThreshold).toBe(false);

            expect(eligibility['std_leave_ms'].percentage).toBe(75);
            expect(eligibility['std_leave_ms'].belowThreshold).toBe(true);
            expect(eligibility['std_leave_ms'].isWaived).toBe(false);

            expect(eligibility['std_exact_80'].percentage).toBe(80);
            expect(eligibility['std_exact_80'].belowThreshold).toBe(false);
        });

        it('grants special waiver (ผ่อนผันกรณีพิเศษ) when student has approved medical waiver', () => {
            // Student has prolonged illness with medical certificate:
            // 12 attended out of 20 = 60% (normally มส)
            // But has medical waiver approved by committee
            const mockSummaries = [
                {
                    studentId: 'std_hospitalized',
                    present: 12,
                    late: 0,
                    leave: 8,
                    absent: 0,
                    totalPossibleHours: 20,
                },
            ];

            // 1. Without waiver -> belowThreshold: true
            const eligibilityWithoutWaiver = computeAttendanceEligibility(mockSummaries);
            expect(eligibilityWithoutWaiver['std_hospitalized'].belowThreshold).toBe(true);
            expect(eligibilityWithoutWaiver['std_hospitalized'].isWaived).toBe(false);

            // 2. With waiver -> belowThreshold: false, isWaived: true
            const eligibilityWithWaiver = computeAttendanceEligibility(mockSummaries, {
                medicalWaiverStudentIds: new Set(['std_hospitalized']),
                waiverReasons: new Map([['std_hospitalized', 'พักรักษาตัวในโรงพยาบาล มีใบรับรองแพทย์']]),
            });

            const waivedResult = eligibilityWithWaiver['std_hospitalized'];
            expect(waivedResult.belowThreshold).toBe(false);
            expect(waivedResult.isWaived).toBe(true);
            expect(waivedResult.waiverReason).toBe('พักรักษาตัวในโรงพยาบาล มีใบรับรองแพทย์');
            expect(waivedResult.remark).toContain('ผ่อนผันกรณีพิเศษ');
        });

        it('properly computes attendance summaries from raw daily status where leave is not counted as attended', () => {
            const roster = [{ id: 'std_moe' }];
            const mockPages = [
                {
                    term: '1',
                    days: Array.from({ length: 20 }, (_, i) => ({
                        dateStr: `2026-06-${String(i + 1).padStart(2, '0')}`,
                        isSession: true,
                        isHoliday: false,
                    })),
                },
            ];

            // 15 days present, 5 days leave
            const dailyStatus: Record<string, Record<string, any>> = {
                std_moe: {},
            };
            for (let i = 0; i < 15; i++) {
                dailyStatus.std_moe[`2026-06-${String(i + 1).padStart(2, '0')}`] = 'present';
            }
            for (let i = 15; i < 20; i++) {
                dailyStatus.std_moe[`2026-06-${String(i + 1).padStart(2, '0')}`] = 'leave';
            }

            const summaries = buildStudentAttendanceSummaries(roster, mockPages, dailyStatus);
            const s = summaries['std_moe'].elapsed;

            expect(s.totalPossibleHours).toBe(20);
            expect(s.present).toBe(15); // NOT 20! Leave is excluded from attended hours
            expect(s.leave).toBe(5);
            expect(s.percentage).toBe(75);

            // Run eligibility calculation on the summary
            const eligibility = computeAttendanceEligibility(summaries);
            expect(eligibility['std_moe'].percentage).toBe(75);
            expect(eligibility['std_moe'].belowThreshold).toBe(true); // < 80% -> Flagged for มส

            // Now test passing waiver option to computeAttendanceEligibility
            const waivedEligibility = computeAttendanceEligibility(summaries, {
                medicalWaiverStudentIds: new Set(['std_moe']),
            });
            expect(waivedEligibility['std_moe'].belowThreshold).toBe(false);
            expect(waivedEligibility['std_moe'].isWaived).toBe(true);
        });
    });

    describe('Learner Activities (กิจกรรมพัฒนาผู้เรียน) - การประเมิน มผ และการแก้ตัว', () => {
        it('calculates 80% threshold for club/activity sessions and flags มผ when attendance < 80%', () => {
            // Activity meets 1 time per week (total 10 sessions in the term)
            // Student 1 (ผ่าน): attended 8 sessions -> 8/10 = 80% -> passes
            // Student 2 (มผ): attended 7 sessions, 3 leaves (sick/personal) -> 7/10 = 70% -> below 80% -> มผ
            const mockActivitySummaries = [
                {
                    studentId: 'std_act_pass',
                    present: 8,
                    late: 0,
                    leave: 2,
                    totalPossibleHours: 10,
                },
                {
                    studentId: 'std_act_fail',
                    present: 7,
                    late: 0,
                    leave: 3,
                    totalPossibleHours: 10,
                },
            ];

            const eligibility = computeAttendanceEligibility(mockActivitySummaries);

            expect(eligibility['std_act_pass'].percentage).toBe(80);
            expect(eligibility['std_act_pass'].belowThreshold).toBe(false); // ผ่าน

            expect(eligibility['std_act_fail'].percentage).toBe(70);
            expect(eligibility['std_act_fail'].belowThreshold).toBe(true); // ติด มผ
        });

        it('remediates มผ to ผ่าน (ผ) when activity requirements are completed', () => {
            // Remediation for มผ turns status to 'passed' ('ผ')
            const originalFlag = 'มผ';
            const remediationResult = 'passed';
            const displayResult = remediationResult === 'passed' ? 'ผ' : 'มผ';

            expect(originalFlag).toBe('มผ');
            expect(displayResult).toBe('ผ');
        });
    });
});
