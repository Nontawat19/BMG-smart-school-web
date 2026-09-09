import { TH_SARABUN_ADVANCE_WIDTHS, TH_SARABUN_FALLBACK_WIDTH } from '../OfficialTravel/thSarabunMetrics';

// 📌 รวมฟังก์ชันช่วยจัดข้อความภาษาไทยสำหรับเอกสาร PDF (@react-pdf/renderer) ไว้ที่เดียว
// เพราะ textAlign: 'justify' ของ react-pdf/textkit ถูกออกแบบมาสำหรับภาษาที่มีช่องว่างระหว่างคำ (เช่นอังกฤษ)
// เมื่อใช้กับภาษาไทย (ไม่มีช่องว่างระหว่างคำ) มันจะดันช่องว่างทั้งหมดไปกองที่ไม่กี่จุดที่มีช่องว่างจริง
// (เช่น "ค  1.1  ม.1/2") หรือถ้าไม่มีช่องว่างเลยในบรรทัด มันจะกระจายเป็นระยะห่างระหว่างตัวอักษรทุกตัว
// (เช่น "แ ล ะ ว ิ เ ค ร า ะ ห์") ทำให้ข้อความดูพังไม่เป็นระเบียบ — ฟังก์ชันเหล่านี้จึงคำนวณการตัดบรรทัด
// และระยะห่างตัวอักษรเองแบบจำกัดขอบเขต ปลอดภัยกว่า

// คำนวณความกว้างตัวอักษรภาษาไทยของฟอนต์ TH Sarabun ตาม advance width จริง
export const measureTextWidth = (text: string, fontSize: number): number => {
  let widthPer1000 = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    widthPer1000 += TH_SARABUN_ADVANCE_WIDTHS[code] ?? TH_SARABUN_FALLBACK_WIDTH;
  }
  return (widthPer1000 / 1000) * fontSize;
};

export const WRAP_SAFETY_FACTOR = 0.97;

// ตัดบรรทัดภาษาไทยตามคำจริงโดยใช้ Intl.Segmenter เพื่อไม่ให้เกิดการตัดคำกลางประโยคหรือขึ้นบรรทัดใหม่สั้นผิดปกติ
export const wrapParagraphLines = (
  text: string,
  maxWidthPt: number,
  firstLineIndentPt: number,
  fontSize: number,
): string[] => {
  if (!text) return [];

  // @ts-ignore
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return [text];

  let segments: string[];
  try {
    // @ts-ignore
    const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    // @ts-ignore
    segments = Array.from(segmenter.segment(text)).map((s) => s.segment);
  } catch (e) {
    console.warn("Intl.Segmenter error:", e);
    return [text];
  }

  const safeMaxWidth = maxWidthPt * WRAP_SAFETY_FACTOR;
  const widthForLine = (lineIndex: number) => (lineIndex === 0 ? safeMaxWidth - firstLineIndentPt : safeMaxWidth);
  const OPENING_PUNCTUATION = new Set(['"', "'", '(', '[', '"', '\'']);

  const lines: string[] = [];
  let current = "";

  const pushLine = (): string => {
    let finalized = current.replace(/\s+$/, '');
    let carry = '';
    while (finalized.length > 0 && OPENING_PUNCTUATION.has(finalized[finalized.length - 1])) {
      carry = finalized[finalized.length - 1] + carry;
      finalized = finalized.slice(0, -1).replace(/\s+$/, '');
    }
    lines.push(finalized);
    current = "";
    return carry;
  };

  for (const seg of segments) {
    const isSpace = seg.trim() === '';
    const candidate = current + seg;

    if (current.length > 0 && measureTextWidth(candidate, fontSize) > widthForLine(lines.length)) {
      const carry = pushLine();
      current = isSpace ? carry : carry + seg;
      continue;
    }

    current = candidate;

    if (measureTextWidth(current, fontSize) > widthForLine(lines.length) && current.length > 1) {
      let cut = current.length;
      while (cut > 1 && measureTextWidth(current.slice(0, cut), fontSize) > widthForLine(lines.length)) {
        cut--;
      }
      const remainder = current.slice(cut);
      current = current.slice(0, cut);
      const carry = pushLine();
      current = carry + remainder;
    }
  }

  if (current.trim().length > 0 || lines.length === 0) {
    lines.push(current.replace(/\s+$/, ''));
  }

  return lines;
};

// ลดขนาดฟอนต์ลงทีละน้อยจนกว่าข้อความจะพอดีกับความกว้างที่กำหนดในบรรทัดเดียว
export const fitFontSizeToWidth = (text: string, maxWidthPt: number, baseFontSize: number, minFontSize = 10): number => {
  let fontSize = baseFontSize;
  while (fontSize > minFontSize && measureTextWidth(text, fontSize) > maxWidthPt) {
    fontSize -= 0.5;
  }
  return fontSize;
};

// ปรับระยะห่างตัวอักษร (letter-spacing) ให้บรรทัดกระจายเต็มขอบสวยงามแบบระเบียบราชการ (Thai justification)
// จำกัดไว้ไม่ให้ยืดเกิน 25% ของความกว้างเป้าหมาย กันกรณีบรรทัดสั้นผิดปกติ (เช่นบรรทัดสุดท้ายของย่อหน้า)
// ถูกยืดจนดูเว่อร์ — โดยทั่วไปควรข้าม (ส่งค่า targetWidthPt เท่ากับความกว้างจริง หรือไม่เรียกเลย)
// สำหรับบรรทัดสุดท้ายของแต่ละย่อหน้า/รายการ
export const justifyLetterSpacing = (line: string, targetWidthPt: number, fontSize: number): number => {
  if (line.length <= 1) return 0;
  const extra = targetWidthPt - measureTextWidth(line, fontSize);
  if (extra <= 0) return 0;
  if (extra > targetWidthPt * 0.25) return 0;
  return extra / (line.length - 1);
};

// 📌 ตัดข้อความเป็นบรรทัด ๆ พร้อมคำนวณ letterSpacing ให้แต่ละบรรทัดพอดีเต็มความกว้าง (ยกเว้นบรรทัดสุดท้าย
// ซึ่งปล่อยชิดซ้ายตามธรรมชาติไม่ยืด) คืนค่าเป็น array พร้อมใช้ render เป็น <Text> แยกทีละบรรทัดได้เลย
export interface JustifiedLine {
  line: string;
  letterSpacing: number;
}

export const buildJustifiedLines = (
  text: string,
  maxWidthPt: number,
  fontSize: number,
  firstLineIndentPt = 0,
): JustifiedLine[] => {
  const lines = wrapParagraphLines(text, maxWidthPt, firstLineIndentPt, fontSize);
  return lines.map((line, idx) => {
    const isLast = idx === lines.length - 1;
    const lineMaxWidth = idx === 0 ? maxWidthPt - firstLineIndentPt : maxWidthPt;
    const letterSpacing = isLast ? 0 : justifyLetterSpacing(line, lineMaxWidth, fontSize);
    return { line, letterSpacing };
  });
};

