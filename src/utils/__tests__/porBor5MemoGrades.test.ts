import { describe, it, expect } from 'vitest';
import { normalizeGradeKey, resolveFinalGradeKey } from '../porBor5MemoGrades';

describe('normalizeGradeKey', () => {
  it('แปลงรูปแบบเกรดที่พบได้ให้เป็นคีย์มาตรฐาน', () => {
    expect(normalizeGradeKey(4)).toBe('4');
    expect(normalizeGradeKey('3.0')).toBe('3');
    expect(normalizeGradeKey('3.50')).toBe('3.5');
    expect(normalizeGradeKey('ร')).toBe('ร');
    expect(normalizeGradeKey('')).toBeNull();
    expect(normalizeGradeKey(undefined)).toBeNull();
    expect(normalizeGradeKey('abc')).toBeNull();
  });
});

describe('resolveFinalGradeKey', () => {
  const course = { formativeAssessments: [{ id: 'a1', maxScore: 30 }, { id: 'a2', maxScore: 30 }] };

  it('คำนวณเกรดจากคะแนนจริง ไม่เชื่อ grade ที่ค้างค่าเก่า', () => {
    const rec = { grade: '0', formativeDetails: { a1: 28, a2: 27 }, midterm: 10, final: 10 }; // รวม 75
    expect(resolveFinalGradeKey(rec, course)).toBe('3.5');
  });

  it('status ทับเสมอ (ร / มส)', () => {
    expect(resolveFinalGradeKey({ status: 'มส', midterm: 90, final: 90 }, course)).toBe('มส');
    expect(resolveFinalGradeKey({ grade: 'ร', midterm: 90 }, course)).toBe('ร');
  });

  it('ไม่มีคะแนนเลย → ไม่นับ (null) แม้ grade เป็น 0 ค่าเริ่มต้นที่ไม่ได้ผ่านการให้คะแนน', () => {
    expect(resolveFinalGradeKey({}, course)).toBeNull();
    expect(resolveFinalGradeKey(null, course)).toBeNull();
  });

  it('ไม่มีเกณฑ์วิชา ใช้ formative/preMidterm/postMidterm ที่บันทึกไว้', () => {
    expect(resolveFinalGradeKey({ preMidterm: 20, postMidterm: 20, midterm: 20, final: 20 }, undefined)).toBe('4');
    expect(resolveFinalGradeKey({ formative: 30, midterm: 10, final: 10 }, undefined)).toBe('1');
  });

  it('แก้ตัวสำเร็จ (มี originalGrade) ให้ใช้เกรดที่บันทึก', () => {
    const rec = { grade: '1', originalGrade: '0', formativeDetails: { a1: 10 }, midterm: 10, final: 10 }; // รวม 30 → คำนวณได้ 0
    expect(resolveFinalGradeKey(rec, course)).toBe('1');
  });
});
