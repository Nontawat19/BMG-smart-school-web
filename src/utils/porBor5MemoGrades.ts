import { calculateGradeFromTotal } from '@/utils/remediationUtils';

/** ช่องผลการเรียนในแบบสรุปผลสัมฤทธิ์ (ตรงกับ GRADE_BUCKET_KEYS ในแม่แบบ PDF) */
export const GRADE_KEYS = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'ร', 'มส', 'ผ', 'มผ'] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];

const VALID_GRADE_KEYS = new Set<string>(GRADE_KEYS as readonly string[]);

/** แปลงค่าเกรดที่เก็บได้หลายรูปแบบ (4, "4.0", "3.50", "ร") ให้เป็นคีย์ช่องเกรดมาตรฐาน หรือ null ถ้าไม่ใช่เกรด */
export const normalizeGradeKey = (v: unknown): GradeKey | null => {
  if (v === undefined || v === null) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  if (VALID_GRADE_KEYS.has(raw)) return raw as GradeKey;
  const n = Number(raw);
  if (Number.isFinite(n)) {
    const s = String(Math.round(n * 2) / 2);
    return VALID_GRADE_KEYS.has(s) ? (s as GradeKey) : null;
  }
  return null;
};

/**
 * ผลการเรียนสุดท้ายของนักเรียน 1 คนในรายวิชา — ใช้กติกาเดียวกับหน้า ปพ.5 (useGradeBookData): คำนวณจากคะแนนจริง
 * (คะแนนเก็บตามเกณฑ์วิชา + กลางภาค + ปลายภาค) ไม่เชื่อฟิลด์ grade ที่ค้างในเอกสารอย่างเดียว เพราะฟิลด์นี้อาจว่าง/ค้างค่าเก่า
 * ทำให้ตารางสรุปนับเป็น 0 ทั้งที่นักเรียนมีคะแนนแล้ว
 *  - status (ร/มส/มผ/ผ ...) ทับเสมอ
 *  - แก้ตัวสำเร็จ (มี originalGrade และเกรดที่บันทึกต่างจากที่คำนวณ) ให้ใช้เกรดที่บันทึก
 *  - ไม่มีหลักฐานคะแนนเลย → คืน null (ไม่นับในช่องใด ไม่ถือเป็นเกรด 0)
 */
export const resolveFinalGradeKey = (record: any, course: any): GradeKey | null => {
  if (!record) return null;

  const statusKey = normalizeGradeKey(record.status);
  if (statusKey && !/^[0-9.]+$/.test(statusKey)) return statusKey;

  const storedKey = normalizeGradeKey(record.grade);
  if (storedKey === 'ร' || storedKey === 'มส' || storedKey === 'ผ' || storedKey === 'มผ') return storedKey;

  const assessments: any[] = Array.isArray(course?.formativeAssessments) ? course.formativeAssessments : [];
  const details: Record<string, any> = record.formativeDetails || {};
  const detailValues = Object.values(details).map((v) => Number(v) || 0);

  let formative: number;
  if (assessments.length > 0) {
    formative = assessments.reduce((sum, a) => sum + (Number(details[a.id || a.name || '']) || 0), 0);
  } else if (record.preMidterm !== undefined || record.postMidterm !== undefined) {
    formative = (Number(record.preMidterm) || 0) + (Number(record.postMidterm) || 0);
  } else {
    formative = Number(record.formative) || detailValues.reduce((a, b) => a + b, 0);
  }
  const total = formative + (Number(record.midterm) || 0) + (Number(record.final) || 0);

  const hasScoreEvidence =
    total > 0 ||
    detailValues.some((v) => v > 0) ||
    ['formative', 'preMidterm', 'postMidterm', 'midterm', 'final'].some((k) => record[k] !== undefined && record[k] !== null && record[k] !== '');
  if (!hasScoreEvidence) return storedKey; // ไม่มีคะแนน: ใช้เกรดที่บันทึกไว้ถ้ามี ไม่งั้นไม่นับ

  const natural = calculateGradeFromTotal(total) as GradeKey;
  if (storedKey && record.originalGrade && storedKey !== natural) return storedKey;
  return natural;
};

