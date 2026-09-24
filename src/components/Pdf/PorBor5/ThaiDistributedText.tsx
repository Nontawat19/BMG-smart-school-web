import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { TH_SARABUN_ADVANCE_EM } from './thaiFontMetrics';

/**
 * ย่อหน้าแบบ "Thai Distributed" (จัดกระจายแบบไทยเหมือน Microsoft Word)
 *
 * react-pdf มี textAlign: 'justify' แต่ขยายเฉพาะ "ช่องว่าง" ซึ่งภาษาไทยมีน้อย (คั่นวลีเท่านั้น) ผลคือช่องว่างบางจุดกว้างผิดปกติ
 * และฟอนต์ TH Sarabun ไม่มีอักขระช่องว่างพิเศษ (ZWSP ฯลฯ) ให้ใช้เป็นจุดกระจาย จึงทำเองดังนี้
 *   1) ตัดบรรทัดตามความกว้างจริงของฟอนต์ (ตารางความกว้างสร้างจากไฟล์ฟอนต์ตัวเดียวกับที่ PDF ใช้) โดยตัดที่ขอบเขตคำ
 *      (Intl.Segmenter 'th') ไม่ตัดกลางคำ
 *   2) ทุกบรรทัดยกเว้นบรรทัดสุดท้าย: วางอักขระทีละกลุ่ม (ตัวพยัญชนะ+สระ/วรรณยุกต์ที่ผสมกัน) แล้วกระจายส่วนที่เหลือของบรรทัดเท่าๆ กัน
 *      ให้ขอบขวาชิดเสมอกัน บรรทัดสุดท้ายชิดซ้ายตามปกติ
 */

const FALLBACK_ADVANCE_EM = 0.5;

const graphemeSegmenter =
  typeof Intl !== 'undefined' && (Intl as any).Segmenter ? new (Intl as any).Segmenter('th', { granularity: 'grapheme' }) : null;
const wordSegmenter =
  typeof Intl !== 'undefined' && (Intl as any).Segmenter ? new (Intl as any).Segmenter('th', { granularity: 'word' }) : null;

const splitGraphemes = (s: string): string[] =>
  graphemeSegmenter ? Array.from(graphemeSegmenter.segment(s) as Iterable<{ segment: string }>).map((x) => x.segment) : Array.from(s);

const splitWords = (s: string): string[] =>
  wordSegmenter ? Array.from(wordSegmenter.segment(s) as Iterable<{ segment: string }>).map((x) => x.segment) : s.split(/(\s+)/);

const isSpaceChar = (c: string) => c === ' ' || c === ' ';

const charAdvanceEm = (ch: string) => TH_SARABUN_ADVANCE_EM[ch] ?? FALLBACK_ADVANCE_EM;
const graphemeAdvanceEm = (g: string) => Array.from(g).reduce((sum, ch) => sum + charAdvanceEm(ch), 0);

interface Props {
  text: string;
  /** วลีที่ไม่ให้ตัดบรรทัดกลางวลี */
  noBreak?: string[];
  /** ความกว้างของกล่องเนื้อหา (pt) */
  width: number;
  fontSize?: number;
  lineHeight?: number;
  /** เยื้องบรรทัดแรก (pt) */
  firstLineIndent?: number;
  style?: any;
}

/** ตัดบรรทัดตามความกว้างจริงของฟอนต์ — คืนรายการ grapheme ต่อบรรทัด (ตัดช่องว่างท้ายบรรทัดแล้ว) */
export const layoutThaiLines = (
  text: string,
  width: number,
  fontSize = 15,
  firstLineIndent = 0,
  noBreak: string[] = []
): string[][] => {
  const em = (g: string) => graphemeAdvanceEm(g) * fontSize;
  // วลีที่ห้ามตัดกลาง (Word มองคำไทยบางกลุ่มเป็นหน่วยเดียว) — แยกวลีออกเป็นโทเคนเดียว ส่วนที่เหลือตัดคำตามปกติ
  const words: string[] = [];
  if (noBreak.length) {
    const escaped = noBreak.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const parts = text.split(new RegExp(`(${escaped.join('|')})`));
    for (const part of parts) {
      if (!part) continue;
      if (noBreak.includes(part)) words.push(part);
      else words.push(...splitWords(part));
    }
  } else {
    words.push(...splitWords(text));
  }
  const lines: string[][] = [];
  let current: string[] = [];
  let currentWidth = 0;
  const limitFor = (lineIndex: number) => width - (lineIndex === 0 ? firstLineIndent : 0) - 0.5; // เผื่อ 0.5pt กันล้นขอบ

  const pushLine = () => {
    while (current.length && isSpaceChar(current[current.length - 1])) current.pop();
    lines.push(current);
    current = [];
    currentWidth = 0;
  };

  for (const word of words) {
    const gs = splitGraphemes(word);
    const w = gs.reduce((sum, g) => sum + em(g), 0);
    const wordIsSpace = gs.every(isSpaceChar);

    if (current.length === 0 && wordIsSpace) continue;

    if (!wordIsSpace && currentWidth + w > limitFor(lines.length) && current.length > 0) {
      pushLine();
    }

    if (!wordIsSpace && w > limitFor(lines.length)) {
      for (const g of gs) {
        const gw = em(g);
        if (currentWidth + gw > limitFor(lines.length) && current.length > 0) pushLine();
        current.push(g);
        currentWidth += gw;
      }
      continue;
    }

    current.push(...gs);
    currentWidth += w;
  }
  if (current.length) pushLine();
  return lines;
};

export const ThaiDistributedText: React.FC<Props> = ({
  text,
  width,
  fontSize = 15,
  lineHeight = 1.3,
  firstLineIndent = 0,
  noBreak,
  style,
}) => {
  const em = (g: string) => graphemeAdvanceEm(g) * fontSize;
  const lines = layoutThaiLines(text, width, fontSize, firstLineIndent, noBreak);
  const lineH = fontSize * lineHeight;
  const baseText = { fontSize, lineHeight };

  return (
    <View style={style}>
      {lines.map((gs, i) => {
        const isLast = i === lines.length - 1;
        const indent = i === 0 ? firstLineIndent : 0;
        if (isLast) {
          // บรรทัดสุดท้ายของย่อหน้า: ชิดซ้ายตามปกติ
          return (
            <View key={i} style={{ paddingLeft: indent, height: lineH }} wrap={false}>
              <Text style={baseText}>{gs.join('')}</Text>
            </View>
          );
        }
        return (
          <View
            key={i}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: indent, height: lineH }}
            wrap={false}
          >
            {gs.map((g, gi) =>
              isSpaceChar(g) ? (
                // ช่องว่างจริงในข้อความ: เว้นความกว้างเท่าอักขระเว้นวรรค (ไม่ใช้ Text เพราะ react-pdf ตัดช่องว่างล้วนทิ้ง)
                <View key={gi} style={{ width: em(g), flexShrink: 0 }} />
              ) : (
                <Text key={gi} style={{ ...baseText, flexShrink: 0 }}>
                  {g}
                </Text>
              )
            )}
          </View>
        );
      })}
    </View>
  );
};

export default ThaiDistributedText;
