import { describe, it, expect } from 'vitest';
import { calculateGradeFromTotal } from '../remediationUtils';

describe('Standard Thai School Grading Criteria (สพฐ. / กระทรวงศึกษาธิการ)', () => {
    it('correctly maps all 8 grade boundaries', () => {
        // Grade 4: 80 - 100
        expect(calculateGradeFromTotal(100)).toBe('4');
        expect(calculateGradeFromTotal(85)).toBe('4');
        expect(calculateGradeFromTotal(80)).toBe('4');

        // Grade 3.5: 75 - 79
        expect(calculateGradeFromTotal(79)).toBe('3.5');
        expect(calculateGradeFromTotal(77)).toBe('3.5');
        expect(calculateGradeFromTotal(75)).toBe('3.5');

        // Grade 3: 70 - 74 (เช่น 70 หรือ 73 ต้องได้เกรด 3)
        expect(calculateGradeFromTotal(74)).toBe('3');
        expect(calculateGradeFromTotal(73)).toBe('3');
        expect(calculateGradeFromTotal(70)).toBe('3');

        // Grade 2.5: 65 - 69
        expect(calculateGradeFromTotal(69)).toBe('2.5');
        expect(calculateGradeFromTotal(65)).toBe('2.5');

        // Grade 2: 60 - 64
        expect(calculateGradeFromTotal(64)).toBe('2');
        expect(calculateGradeFromTotal(60)).toBe('2');

        // Grade 1.5: 55 - 59
        expect(calculateGradeFromTotal(59)).toBe('1.5');
        expect(calculateGradeFromTotal(58)).toBe('1.5');
        expect(calculateGradeFromTotal(55)).toBe('1.5');

        // Grade 1: 50 - 54
        expect(calculateGradeFromTotal(54)).toBe('1');
        expect(calculateGradeFromTotal(50)).toBe('1');

        // Grade 0: 0 - 49
        expect(calculateGradeFromTotal(49)).toBe('0');
        expect(calculateGradeFromTotal(15)).toBe('0');
        expect(calculateGradeFromTotal(0)).toBe('0');
    });

    it('verifies that student with formative=58, midterm=15, final=0 (total=73) receives grade 3, NOT 1.5', () => {
        const formative = 58;
        const midterm = 15;
        const finalExam = 0;
        const total = formative + midterm + finalExam;
        expect(total).toBe(73);
        expect(calculateGradeFromTotal(total)).toBe('3');
    });
});
