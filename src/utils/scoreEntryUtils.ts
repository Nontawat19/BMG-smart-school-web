// Shared score-input handling for the "ร" (incomplete) flag — used by both
// FormativeScoreEntryPage.tsx and PostMidtermScoreEntryPage.tsx, which used to each keep their
// own copy of these functions. Keeping this logic in one place matters here specifically: this
// project has already shipped real grading bugs (the มส attendance-eligibility calculator) from
// the same "same rule duplicated in two files, only one got fixed" pattern — a future change to
// how "ร" is detected or displayed should only need to happen here.

export const toScoreNumber = (value: unknown) =>
    value === "" || value === undefined || value === null ? 0 : Number(value) || 0;

export const normalizeFormativeDetails = (details?: Record<string, number | string>) => {
    const normalized: Record<string, number> = {};
    Object.entries(details || {}).forEach(([key, value]) => {
        normalized[key] = toScoreNumber(value);
    });
    return normalized;
};

// ช่องกรอกคะแนนยอมรับได้แค่ตัวเลข (ว่างได้) หรือตัวอักษร "ร" (หมายถึงงาน/ชิ้นนี้ยังไม่สมบูรณ์) เท่านั้น —
// ตัวอักษรอื่นพิมพ์ไม่ผ่านเลย คืน null เพื่อไม่ให้ setState เกิดขึ้น
// ถ้ามี "ร" ปนอยู่ในค่าที่พิมพ์ (เช่น ช่องมีเลขเดิมอยู่แล้วแล้วพิมพ์ ร ทับโดยไม่ได้เลือกลบของเดิมก่อน) ให้ "ร"
// ชนะเสมอแทนที่ทั้งช่องไปเลย ไม่ต้องให้ครูลบของเดิมออกก่อนถึงจะพิมพ์ ร ได้
export const sanitizeScoreInput = (value: string): string | null => {
    if (value.includes('ร')) return 'ร';
    if (value === '' || /^\d*\.?\d*$/.test(value)) return value;
    return null;
};

// รายชื่อฟิลด์ที่เป็น "ร" (ชื่อ assessment key, "midterm", หรือ "final") — ต้องบันทึกแยกเป็น incompleteFields
// ต่างหาก เพราะฟิลด์คะแนนดิบ (formativeDetails/midterm/final) ต้องเก็บเป็นตัวเลขเสมอสำหรับคำนวณคะแนนรวมที่
// อื่น (GradeBookPage ฯลฯ) ถ้าเก็บ "ร" ปนไว้ในนั้นตรงๆ คะแนนรวมจะพังไปด้วย — เช็ค final ด้วยแม้บางหน้าไม่มีช่อง
// แก้ไขโดยตรง เพราะครูอาจพิมพ์ "ร" ไว้ตั้งแต่หน้าก่อนหน้านั้นแล้ว ต้องคงไว้ไม่ให้หายตอนบันทึกซ้ำจากหน้าอื่น
export const collectIncompleteFields = (record: {
    formativeDetails?: Record<string, number | string>;
    midterm?: number | string;
    final?: number | string;
}): string[] => {
    const fields: string[] = [];
    Object.entries(record.formativeDetails || {}).forEach(([key, v]) => { if (v === 'ร') fields.push(key); });
    if (record.midterm === 'ร') fields.push('midterm');
    if (record.final === 'ร') fields.push('final');
    return fields;
};

// สีช่องคะแนนสำหรับช่องที่ "เคยติด ร" มาก่อน (เทียบจาก incompleteFields ที่เก็บถาวรไว้ ไม่ว่าจะแก้แล้วหรือยัง):
// ยังไม่แก้ (grade ยังเป็น "ร") = แดง, แก้แล้วแต่ยังไม่ได้คะแนนจริง (0) = เหลือง, แก้แล้วได้คะแนนจริง = เขียว
// ช่องที่ไม่เคยติด ร เลยคืน null ให้ใช้สีปกติของช่องนั้นต่อไป
export type IncompleteCellColor = 'red' | 'yellow' | 'green' | null;
export const getIncompleteCellColor = (
    record: { grade?: string; incompleteFields?: string[] },
    rawValue: unknown,
    key: string
): IncompleteCellColor => {
    if (!(record.incompleteFields || []).includes(key)) return null;
    if (record.grade === 'ร') return 'red';
    return (Number(rawValue) || 0) > 0 ? 'green' : 'yellow';
};
