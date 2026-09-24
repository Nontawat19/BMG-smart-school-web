import React from 'react';
import { Page, Text, View, Document, Image, Font } from '@react-pdf/renderer';
import { ThaiDistributedText, layoutThaiLines } from './ThaiDistributedText';
import { TH_SARABUN_ADVANCE_EM, TH_SARABUN_BOLD_ADVANCE_EM } from './thaiFontMetrics';

// Register TH Sarabun PSK Font
Font.register({
  family: 'TH Sarabun PSK',
  src: '/fonts/THSarabunNew.ttf',
  fontWeight: 'normal',
});

Font.register({
  family: 'TH Sarabun PSK',
  src: '/fonts/THSarabunNew-Bold.ttf',
  fontWeight: 'bold',
});

Font.registerHyphenationCallback((word) => [word]);

const FONT = 'TH Sarabun PSK';

const toThaiDigits = (val: string | number): string => {
  if (val === null || val === undefined) return '';
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return String(val).replace(/[0-9]/g, (d) => thaiDigits[parseInt(d, 10)]);
};

// ลำดับและป้ายกำกับ (เลขไทย) ของช่องผลการเรียนในตาราง "แบบสรุปผลสัมฤทธิ์ทางการเรียน"
export const GRADE_BUCKET_KEYS = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'ร', 'มส', 'ผ', 'มผ'] as const;
export type GradeBucketKey = (typeof GRADE_BUCKET_KEYS)[number];
const GRADE_BUCKET_LABELS: Record<GradeBucketKey, string> = {
  '4': '๔', '3.5': '๓.๕', '3': '๓', '2.5': '๒.๕', '2': '๒', '1.5': '๑.๕', '1': '๑', '0': '๐',
  'ร': 'ร', 'มส': 'มส', 'ผ': 'ผ', 'มผ': 'มผ',
};

// ลำดับและป้ายกำกับของช่องคุณลักษณะอันพึงประสงค์
export const CHARACTERISTIC_BUCKET_KEYS = ['3', '2', '1', '0'] as const;
export type CharacteristicBucketKey = (typeof CHARACTERISTIC_BUCKET_KEYS)[number];
const CHAR_BUCKET_LABELS: Record<CharacteristicBucketKey, string> = {
  '3': '๓', '2': '๒', '1': '๑', '0': '๐',
};

export type GradeBuckets = Record<GradeBucketKey, number>;
export type CharacteristicBuckets = Record<CharacteristicBucketKey, number>;

export const emptyGradeBuckets = (): GradeBuckets =>
  GRADE_BUCKET_KEYS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as GradeBuckets);

export const emptyCharacteristicBuckets = (): CharacteristicBuckets =>
  CHARACTERISTIC_BUCKET_KEYS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as CharacteristicBuckets);

export interface AchievementCourseRow {
  courseCode: string;
  courseTitle: string;
  classLevel: string; // เช่น ม.1
  room: string; // เช่น 1
  studentCount: number;
  gradeBuckets: GradeBuckets;
  charBuckets: CharacteristicBuckets;
  // แบบสรุปผลสัมฤทธิ์ฯ ไม่ต้องกรอกรายวิชา IS และ หน้าที่พลเมือง ตามระเบียบของโรงเรียน
  includeInGradeTable?: boolean;
}

export interface PorBor5SubmissionMemoPdfProps {
  schoolName: string;
  schoolAffiliation?: string;
  docNo?: string;
  dateStr?: string;
  academicYear: string;
  semester: string;
  learningArea?: string;
  teacherName: string;
  teacherPosition?: string;
  courses: AchievementCourseRow[];
  targetPercentage?: string;
  summarySheetCount?: string;
  characteristicsSheetCount?: string;
  reviewerName?: string; // ผู้ตรวจ (งานวัดผลและประเมินผล)
  deputyDirectorName?: string; // รองผู้อำนวยการกลุ่มบริหารวิชาการ
  directorName?: string;
}

const calcPercent = (count: number, total: number): string => {
  if (!total) return '0.0';
  return ((count / total) * 100).toFixed(1);
};

/* ============================================================================================
 * พิกัดทั้งหมดในไฟล์นี้วัดจากภาพแม่แบบต้นฉบับ 3 หน้า (สแกน 150 dpi) แล้วแปลงเป็นพอยต์:
 *   หน้า 1 (A4 แนวตั้ง 595.28pt กว้าง = 1241px)  → 1px = 595.28/1241 pt
 *   หน้า 2-3 (A4 แนวนอน 842pt กว้าง = 1755px)     → 1px = 842/1755 pt
 * ฟอนต์: TH Sarabun New — เนื้อหา 16pt, หัวข้อ/ป้ายกำกับตัวหนา (บันทึกข้อความ 28pt, ป้ายกำกับ 18pt, หัวตาราง 16pt)
 * ========================================================================================== */

const P2_PX = 842 / 1755;

const DOT_EM = TH_SARABUN_ADVANCE_EM['.'] ?? 0.162;
const textWidth = (s: string, size: number) =>
  Array.from(s).reduce((sum, ch) => sum + (TH_SARABUN_ADVANCE_EM[ch] ?? 0.5), 0) * size;
const textWidthBold = (s: string, size: number) =>
  Array.from(s).reduce((sum, ch) => sum + (TH_SARABUN_BOLD_ADVANCE_EM[ch] ?? 0.5), 0) * size;
const DOT_EM_BOLD = TH_SARABUN_BOLD_ADVANCE_EM['.'] ?? 0.162;
const dots = (widthPt: number, size = 16) => '.'.repeat(Math.max(0, Math.floor(widthPt / (DOT_EM * size))));
const dotsTo = (fromX: number, toX: number, size = 16) => dots(toX - fromX, size);
const NB2 = '  ';

const abs = (top: number, left: number, extra?: Record<string, any>) => ({
  position: 'absolute' as const,
  top,
  left,
  ...extra,
});

/** ข้อความบรรทัดเดียว วางที่พิกัดสัมบูรณ์ (cy = กึ่งกลางแนวตั้งของบรรทัด) */
const L: React.FC<{ cy: number; x: number; size?: number; bold?: boolean; w?: number; align?: 'left' | 'center' | 'right'; children: React.ReactNode }> = ({
  cy,
  x,
  size = 16,
  bold,
  w,
  align,
  children,
}) => (
  <Text
    style={{
      ...abs(cy - size / 2, x),
      fontFamily: FONT,
      fontSize: size,
      fontWeight: bold ? 'bold' : 'normal',
      lineHeight: 1,
      ...(w ? { width: w, textAlign: align || 'left' } : {}),
    }}
  >
    {children}
  </Text>
);

/** ช่องเติมข้อมูลบนเส้นจุดไข่ปลา: เส้นประ (ตัวอักษร ".") ยาว width เสมอ แล้ววางข้อมูลทับ (ย่อขนาดให้พอดีช่องถ้ายาวเกิน) */
const Field: React.FC<{ cy: number; x: number; width: number; data?: string; size?: number; align?: 'left' | 'center'; bold?: boolean; inset?: number }> = ({
  cy,
  x,
  width,
  data,
  size = 16,
  align = 'center',
  bold,
  inset = 0,
}) => {
  const tw = bold ? textWidthBold : textWidth;
  // inset: เว้นระยะหน้าข้อมูลที่ชิดซ้าย เพื่อไม่ให้ตัวอักษรติดป้ายกำกับด้านหน้า (เช่น "วันที่")
  const dataW = width - inset;
  const fs = data ? Math.min(size, (size * (dataW - 2)) / Math.max(tw(data, size), 1)) : size;
  return (
    <>
      <L cy={cy} x={x} size={size} bold={bold}>
        {'.'.repeat(Math.max(0, Math.floor(width / ((bold ? DOT_EM_BOLD : DOT_EM) * size))))}
      </L>
      {data ? (
        <L cy={cy - 1.6} x={x + inset} size={fs} w={dataW} align={align} bold={bold}>
          {data}
        </L>
      ) : null}
    </>
  );
};

/** บรรทัดรอง "ประจำภาคเรียนที่ …… ปีการศึกษา ……" ของหน้า 2-3 — วางสองส่วนตามพิกัดต้นแบบ (จำนวนจุดต่างกันเล็กน้อยระหว่างหน้า) */
const SemesterYearLine: React.FC<{
  cy: number;
  leftX: number;
  rightX: number;
  leftDots: number;
  rightDots: number;
  spaceBeforeRightDots?: boolean;
  sem: string;
  year: string;
}> = ({ cy, leftX, rightX, leftDots, rightDots, spaceBeforeRightDots, sem, year }) => {
  const leftLabel = 'ประจำภาคเรียนที่';
  const rightLabel = spaceBeforeRightDots ? 'ปีการศึกษา\u00A0' : 'ปีการศึกษา';
  if (sem || year) {
    return (
      <L cy={cy} x={449.3 - 150} w={300} align="center" bold>
        {`${leftLabel} ${sem || '............'}\u00A0\u00A0\u00A0ปีการศึกษา ${year || '................'}`}
      </L>
    );
  }
  return (
    <>
      <L cy={cy} x={leftX} bold>
        {leftLabel}
      </L>
      <Field cy={cy} x={leftX + textWidthBold(leftLabel, 16)} width={leftDots * DOT_EM_BOLD * 16} data={sem || undefined} bold />
      <L cy={cy} x={rightX} bold>
        {rightLabel}
      </L>
      <Field cy={cy} x={rightX + textWidthBold(rightLabel, 16)} width={rightDots * DOT_EM_BOLD * 16} data={year || undefined} bold />
    </>
  );
};

/* ------------------------------- ตาราง (หน้า 2-3) ------------------------------- */

const LINE = 0.5;
const GRID_COLOR = '#000000';
const HDR_GREEN = '#C2D69B';
const SUM_YELLOW = '#FFFF99';
const PCT_YELLOW = '#F7F34A';

interface CellSpec {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  fill?: string;
  text?: string;
  bold?: boolean;
  align?: 'center' | 'left';
  size?: number;
  noBorder?: boolean;
  /** เซลล์ที่รวมหลายแถว: วางข้อความกึ่งกลางเฉพาะพื้นที่ความสูงนี้จากขอบบน (แม่แบบวางป้ายไว้ในแถวบนของเซลล์รวม) */
  labelH?: number;
}

const Cell: React.FC<CellSpec> = ({ x0, x1, y0, y1, fill, text, bold, align = 'center', size = 16, noBorder, labelH }) => {
  const w = x1 - x0;
  const fs = text ? Math.min(size, (size * (w - (align === 'left' ? 6 : 2))) / Math.max(textWidth(text, size), 1)) : size;
  return (
    <View
      style={{
        position: 'absolute',
        left: x0 - LINE / 2,
        top: y0 - LINE / 2,
        width: w + LINE,
        height: y1 - y0 + LINE,
        backgroundColor: fill,
        borderWidth: noBorder ? 0 : LINE,
        borderColor: GRID_COLOR,
        borderStyle: 'solid',
        justifyContent: labelH ? 'flex-start' : 'center',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        paddingLeft: align === 'left' ? 3 : 0,
        paddingTop: labelH ? Math.max(0, (labelH - fs) / 2 - 0.5) : 0,
      }}
    >
      {text ? (
        <Text style={{ fontFamily: FONT, fontSize: fs, fontWeight: bold ? 'bold' : 'normal', lineHeight: 1, position: 'relative', top: -0.5 }} wrap={false}>
          {text}
        </Text>
      ) : null}
    </View>
  );
};

const px2 = (v: number) => v * P2_PX; // ระยะ (ความสูง/ความกว้าง)
// พิกัดตำแหน่ง: ภาพต้นแบบสแกนเลื่อนจากต้นทางราว +1px (0.48pt) เมื่อเทียบเส้นตารางกับ PDF จริง จึงบวกชดเชยเพื่อให้เส้นทับกันพอดี
const POS_SHIFT = 0.48;
const pos2 = (v: number) => v * P2_PX + POS_SHIFT;

// เส้นแบ่งคอลัมน์ (px ของภาพต้นแบบ) — หน้า 2: ที่ | รายวิชา | รหัส | ชั้น | ห้อง | จำนวน | ๔ ๓.๕ ๓ ๒.๕ ๒ ๑.๕ ๑ ๐ ร มส ผ มผ
const P2_COLS = [147, 199, 546, 665, 747, 833, 933, 988, 1047, 1099.5, 1168, 1221, 1280, 1332, 1384, 1441, 1500, 1559, 1618].map(pos2);
// หน้า 3: ที่ | รายวิชา | รหัส | ชั้น | ห้อง | จำนวน | ๓ ๒ ๑ ๐
const P3_COLS = [338, 389, 736, 854, 937, 1022, 1123, 1224, 1327, 1431, 1535].map(pos2);

const MAX_BODY_BOTTOM = 585; // ขอบล่างสุดที่ยอมให้เนื้อหาตาราง+ลายเซ็นไปถึง (pt)

/** ชื่อครู/ผู้ลงนามใต้เส้นลงชื่อ: "( ชื่อ )" หรือวงเล็บจุดไข่ปลาถ้าไม่มีข้อมูล */
const parenName = (name?: string, blankDots = 56) => (name ? `( ${name} )` : `( ${'.'.repeat(blankDots)} )`);

const LABEL_SIGN_W = textWidth('ลงชื่อ', 16); // ความกว้างคำว่า "ลงชื่อ" ที่ 16pt
const courseLabel = (c: AchievementCourseRow) => c.courseTitle || '-';
const classLabel = (c: AchievementCourseRow) => c.classLevel || '';

export const PorBor5SubmissionMemoPdfDocument: React.FC<PorBor5SubmissionMemoPdfProps> = ({
  schoolName,
  docNo = '',
  dateStr = '',
  academicYear,
  semester,
  learningArea = '',
  teacherName,
  courses = [],
  targetPercentage = '',
  summarySheetCount = '1',
  characteristicsSheetCount = '1',
  reviewerName = '',
  deputyDirectorName = '',
  directorName = '',
}) => {
  const isAnnual = semester === 'annual' || semester === '0';
  const semDigits = !semester || isAnnual ? '' : toThaiDigits(semester);
  const yearDigits = academicYear ? toThaiDigits(academicYear) : '';
  const cleanSchoolName = schoolName?.startsWith('โรงเรียน') ? schoolName : `โรงเรียน${schoolName || ''}`;

  const totalBooks = courses.length;
  // ตารางสรุปผลสัมฤทธิ์รวมทุกรายวิชาที่สอน (รวม IS และหน้าที่พลเมือง) — ไม่ตัดรายวิชาใดออก
  const gradeTableCourses = courses;

  const gradeTotals = GRADE_BUCKET_KEYS.reduce((acc, key) => {
    acc[key] = gradeTableCourses.reduce((sum, c) => sum + (c.gradeBuckets?.[key] || 0), 0);
    return acc;
  }, {} as GradeBuckets);
  const gradeStudentTotal = gradeTableCourses.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  const groupGood = gradeTotals['4'] + gradeTotals['3.5'] + gradeTotals['3']; // เกรด 3-4 (ระดับดี)
  const groupFail = gradeTotals['0'] + gradeTotals['ร'] + gradeTotals['มส'];

  const charTotals = CHARACTERISTIC_BUCKET_KEYS.reduce((acc, key) => {
    acc[key] = courses.reduce((sum, c) => sum + (c.charBuckets?.[key] || 0), 0);
    return acc;
  }, {} as CharacteristicBuckets);
  const charStudentTotal = courses.reduce((sum, c) => sum + (c.studentCount || 0), 0);

  // ค่าเป้าหมายผลการเรียนระดับดี: ใช้ค่าที่ผู้ใช้พิมพ์ก่อน ไม่มีให้คำนวณร้อยละเกรด 3-4 จากตารางนี้
  const targetText = targetPercentage
    ? toThaiDigits(targetPercentage)
    : gradeStudentTotal
    ? toThaiDigits(calcPercent(groupGood, gradeStudentTotal))
    : '';

  /* ===================== หน้า 1: บันทึกข้อความ ===================== */
  const X_LEFT = 71.5; // ขอบซ้าย 2.5 ซม.
  const CONTENT_W = 467.6; // ถึงขอบขวา ~539pt (ขวา 2 ซม.)
  const ITEM_PITCH = 18.0;
  const LINE_H = 18;
  const PARA_NO_BREAK = ['การจัดการเรียนการสอน', 'และแบบบันทึกผลการเรียนรายบุคคล'];
  const PARA_SIZE = 15; // ย่อหน้า "ตามที่โรงเรียน..." ในแม่แบบใช้ 15pt (ส่วนอื่น 16pt)

  const periodText = isAnnual
    ? `ประจำปีการศึกษา${yearDigits ? ` ${yearDigits}` : dots(60)}`
    : `ประจำภาคเรียนที่${semDigits ? ` ${semDigits} ` : dots(21)}ปีการศึกษา${yearDigits ? ` ${yearDigits}` : dots(34)}`;

  const openingText =
    `ตามที่${cleanSchoolName}${NB2}กำหนดมาตรฐานการปฏิบัติงานด้านการวัดผล และประเมินผล การจัดการเรียนการสอน โดยให้มีการนำส่งแบบสรุปผลสัมฤทธิ์ทางการเรียน แบบสรุปผลคุณลักษณะอันพึงประสงค์ และแบบบันทึกผลการเรียนรายบุคคล${NB2}เมื่อทำการเรียนการสอนเสร็จสิ้นแล้ว${NB2}ข้าพเจ้า` +
    (teacherName ? ` ${teacherName} ` : '.'.repeat(53)) +
    `สังกัดกลุ่มสาระการเรียนรู้` +
    (learningArea ? ` ${learningArea} ` : '.'.repeat(54)) +
    `จึงขอรายงานผลสัมฤทธิ์ทางการเรียน ${
      isAnnual
        ? `ประจำปีการศึกษา${yearDigits ? ` ${yearDigits}` : dots(60)}`
        : `ประจำภาคเรียนที่ ${semDigits ? `${semDigits} ` : `${'.'.repeat(9)} `}ปีการศึกษา${yearDigits ? ` ${yearDigits}` : '.'.repeat(19)}`
    }${NB2}รายละเอียดดังนี้`;

  const listTitleText = `รายวิชาที่ดำเนินการจัดการเรียนการสอนทั้งหมด จำนวน${totalBooks ? ` ${toThaiDigits(totalBooks)} ` : '.'.repeat(19)}วิชา (ระบุทุกรายวิชาที่สอน รวม IS, หน้าที่พลเมือง, กลุ่มสนใจ ยกเว้นชุมนุม)`;

  const paraLines = layoutThaiLines(openingText, CONTENT_W, PARA_SIZE, 72, PARA_NO_BREAK).length;
  const titleLines = layoutThaiLines(listTitleText, CONTENT_W, 16, 72).length;
  const listRows = Math.max(5, courses.length);

  // ตำแหน่งแนวตั้งของแต่ละส่วน (cy = กึ่งกลางบรรทัด, pt) — ค่าตั้งต้นตรงกับแม่แบบที่ย่อหน้า 5 บรรทัด / หัวเรื่องรายวิชา 2 บรรทัด / รายวิชา 5 บรรทัด
  const shiftPara = (paraLines - 5) * LINE_H;
  const shiftTitle = (titleLines - 2) * LINE_H;
  const shiftList = (listRows - 5) * ITEM_PITCH;

  const yPara = 273.9;
  const yListTitle = 372.7 + shiftPara;
  const yItem0 = 418.3 + shiftPara + shiftTitle;
  const yAfterList = shiftPara + shiftTitle + shiftList;

  // ส่วนท้าย (สรุปเล่ม → ความเห็นผู้บังคับบัญชา): ถ้าเลยขอบล่างของหน้าจะย้ายไปหน้าต่อเนื่อง
  const bottomOverflow = 789.2 + yAfterList > 812;

  const renderBottom = (dy: number, includeSumRow: boolean) => {
    const c = (v: number) => v + dy;
    return (
      <>
        {includeSumRow ? (
          <>
            <L cy={c(516.7)} x={107.4}>
              รวมแบบบันทึกผลการเรียนประจำรายวิชา (ปพ.๕) ทั้งสิ้น
            </L>
            <L cy={c(516.7)} x={349.7}>
              จำนวน
            </L>
            <Field cy={c(516.7)} x={377.5} width={59} data={totalBooks ? toThaiDigits(totalBooks) : undefined} />
            <L cy={c(516.7)} x={436.5}>
              เล่ม
            </L>
          </>
        ) : null}

        <L cy={c(543.5)} x={143.4}>
          จึงเรียนมาเพื่อโปรดทราบและพิจารณา
        </L>

        <L cy={c(571.8)} x={290.7}>
          ลงชื่อ{dotsTo(290.7 + LABEL_SIGN_W, 495.5)}
        </L>
        <L cy={c(590.0)} x={318.5} w={168} align="center">
          {parenName(teacherName, 60)}
        </L>

        <L cy={c(607.8)} x={X_LEFT}>
          งานวัดผลและประเมินผลตรวจแล้ว
        </L>
        <View style={abs(c(626.5) - 5.55, 72.4, { width: 11.1, height: 11.1, borderWidth: 1.6, borderColor: '#000', borderStyle: 'solid' })} />
        <L cy={c(626.5)} x={89.2}>
          ถูกต้องครบถ้วน
        </L>
        <View style={abs(c(626.5) - 5.55, 180.4, { width: 11.1, height: 11.1, borderWidth: 1.6, borderColor: '#000', borderStyle: 'solid' })} />
        <L cy={c(626.5)} x={196.2}>
          ไม่ถูกต้อง/ไม่ครบถ้วน ระบุ{dotsTo(196.2 + textWidth('ไม่ถูกต้อง/ไม่ครบถ้วน ระบุ', 16), 534.4)}
        </L>
        <L cy={c(644.2)} x={287.3}>
          ลงชื่อ{dotsTo(287.3 + LABEL_SIGN_W, 462.9)}
        </L>
        <L cy={c(644.2)} x={462.9}>
          ผู้ตรวจ
        </L>
        {reviewerName ? (
          <L cy={c(662.4)} x={287.3} w={202} align="center" size={15}>
            {parenName(reviewerName)}
          </L>
        ) : null}

        <L cy={c(680.8)} x={X_LEFT} bold>
          ความเห็นรองผู้อำนวยการกลุ่มบริหารวิชาการ
        </L>
        <L cy={c(680.8)} x={323.3} bold>
          ความเห็นผู้อำนวยการโรงเรียน
        </L>
        <L cy={c(698.9)} x={73.4}>
          {dotsTo(72.0, 271.0)}
        </L>
        <L cy={c(698.9)} x={324.6}>
          {dotsTo(323.8, 522.8)}
        </L>
        <L cy={c(717.2)} x={73.4}>
          {dotsTo(72.0, 272.0)}
        </L>
        <L cy={c(717.2)} x={324.6}>
          {dotsTo(323.8, 523.8)}
        </L>
        <L cy={c(734.9)} x={X_LEFT}>
          ลงชื่อ{dotsTo(X_LEFT + LABEL_SIGN_W, 237.4)}
        </L>
        <L cy={c(734.9)} x={323.3}>
          ลงชื่อ{dotsTo(323.3 + LABEL_SIGN_W, 489.3)}
        </L>
        <L cy={c(753.1)} x={65.4} w={200} align="center">
          {parenName(deputyDirectorName, 40)}
        </L>
        <L cy={c(753.1)} x={314.9} w={200} align="center">
          {parenName(directorName, 40)}
        </L>
        <L cy={c(770.9)} x={62.4} w={200} align="center">
          รองผู้อำนวยการกลุ่มบริหารวิชาการ
        </L>
        <L cy={c(770.9)} x={323.3}>
          ผู้อำนวยการ{cleanSchoolName.replace(/ /g, NB2)}
        </L>
        <L cy={c(789.2)} x={61.0} w={200} align="center">
          {'............/......................./...............'}
        </L>
        <L cy={c(789.2)} x={311.5} w={200} align="center">
          {'............/......................./...............'}
        </L>
      </>
    );
  };

  const attachmentRows = [
    { cy: 208.7, no: '๑.', label: 'แบบสรุปผลสัมฤทธิ์ทางการเรียน', count: summarySheetCount, unit: 'แผ่น' },
    { cy: 226.4, no: '๒.', label: 'แบบสรุปผลคุณลักษณะอันพึงประสงค์', count: characteristicsSheetCount, unit: 'แผ่น' },
    { cy: 244.7, no: '๓.', label: 'แบบบันทึกผลการเรียนรายบุคคล (ปพ.๕)', count: totalBooks ? String(totalBooks) : '', unit: 'เล่ม' },
  ];

  /* ===================== หน้า 2: แบบสรุปผลสัมฤทธิ์ทางการเรียน ===================== */
  const g2 = gradeTableCourses;
  const rows2 = Math.max(13, g2.length);
  const p2Top = pos2(274);
  const p2HdrH = px2(38.5);
  const p2BodyTop = pos2(351);
  const p2RowH = Math.min(px2(38.77), (MAX_BODY_BOTTOM - 130 - p2BodyTop - 2 * px2(38.5)) / rows2);
  const p2BodyBottom = p2BodyTop + rows2 * p2RowH;
  const p2SumTop = p2BodyBottom;
  const p2PctTop = p2SumTop + px2(38.5);
  const p2Bottom = p2PctTop + px2(38.5);
  const c2 = P2_COLS;
  const bodyFont2 = Math.min(14, p2RowH * 0.78);

  /* ===================== หน้า 3: แบบสรุปคุณลักษณะอันพึงประสงค์ ===================== */
  const c3 = P3_COLS;
  const rows3 = Math.max(13, courses.length);
  const p3Top = pos2(236);
  const p3HdrH = px2(39);
  const p3BodyTop = pos2(314);
  const p3RowH = Math.min(px2(38.69), (MAX_BODY_BOTTOM - 100 - p3BodyTop - 2 * px2(39)) / rows3);
  const p3BodyBottom = p3BodyTop + rows3 * p3RowH;
  const p3SumTop = p3BodyBottom;
  const p3PctTop = p3SumTop + px2(39);
  const p3Bottom = p3PctTop + px2(39);
  const bodyFont3 = Math.min(14, p3RowH * 0.78);

  // ลายเซ็นท้ายตาราง: cy ของบรรทัด "ลงชื่อ...ครูผู้สอน" (ตรงแม่แบบคือต่ำกว่าขอบล่างตาราง ~28.7pt) ตามด้วยชื่อในวงเล็บใต้เส้นลงชื่อ
  const signatureBlock = (cy0: number) => (
    <>
      <L cy={cy0} x={322.9}>
        ลงชื่อ{dots(205)}ครูผู้สอน
      </L>
      <L cy={cy0 + 18} x={344.6} w={205.1} align="center">
        {parenName(teacherName, 44)}
      </L>
      <L cy={cy0 + 36} x={322.9}>
        ลงชื่อ{dots(205)}งานวัดและประเมินผล
      </L>
      <L cy={cy0 + 54} x={344.6} w={205.1} align="center">
        {parenName(reviewerName, 44)}
      </L>
    </>
  );

  const subtitleAnnual2 = `ประจำปีการศึกษา ${yearDigits || '................'}`;

  return (
    <Document title={`บันทึกข้อความ_รายงานผลสัมฤทธิ์ทางการเรียน_${teacherName}_ปี${academicYear}`}>
      {/* ===================== หน้า 1: บันทึกข้อความ ===================== */}
      <Page size="A4" style={{ fontFamily: FONT, fontSize: 16, color: '#000' }}>
        <Image src="/assets/images/garuda_official.jpg" style={{ ...abs(61.8, 71.0), width: 44.6, height: 46.3, objectFit: 'fill' }} />
        <L cy={86.2} x={X_LEFT} size={28} bold w={CONTENT_W} align="center">
          บันทึกข้อความ
        </L>

        <L cy={130.5} x={71.5} size={18} bold>
          ส่วนราชการ
        </L>
        <L cy={131.0} x={143.4}>
          กลุ่มบริหารวิชาการ{NB2}
          {cleanSchoolName}
        </L>

        <L cy={151.1} x={71.0} size={18} bold>
          ที่
        </L>
        <L cy={151.6} x={87.8}>
          {docNo || dots(190)}
        </L>
        <L cy={151.1} x={287.3} size={18} bold>
          วันที่
        </L>
        <Field cy={151.6} x={308.4} width={162.6} data={dateStr || undefined} align="left" inset={6} />

        <L cy={171.3} x={72.0} size={18} bold>
          เรื่อง
        </L>
        <L cy={171.8} x={104.1}>
          รายงานผลสัมฤทธิ์ทางการเรียน {periodText}
        </L>

        <L cy={190.5} x={71.5} size={16} bold>
          เรียน
        </L>
        <L cy={190.5} x={103.6}>
          ผู้อำนวยการ{cleanSchoolName.replace(/ /g, NB2)}
        </L>

        <L cy={209.1} x={71.5} size={16} bold>
          สิ่งที่ส่งมาด้วย
        </L>
        {attachmentRows.map((r) => (
          <React.Fragment key={r.no}>
            <L cy={r.cy} x={142.5}>
              {r.no}
            </L>
            <L cy={r.cy} x={156.4}>
              {r.label}
            </L>
            <L cy={r.cy} x={431.2}>
              จำนวน
            </L>
            <Field cy={r.cy} x={459.1} width={34} data={r.count ? toThaiDigits(r.count) : undefined} />
            <L cy={r.cy} x={493.1}>
              {r.unit}
            </L>
          </React.Fragment>
        ))}

        {/* ย่อหน้าเนื้อหาจัดแบบ Thai Distributed (ขอบขวาชิด บรรทัดสุดท้ายชิดซ้าย) */}
        <ThaiDistributedText
          text={openingText}
          width={CONTENT_W}
          fontSize={PARA_SIZE}
          noBreak={PARA_NO_BREAK}
          lineHeight={LINE_H / PARA_SIZE}
          firstLineIndent={72}
          style={abs(yPara - LINE_H / 2, X_LEFT, { width: CONTENT_W })}
        />

        <ThaiDistributedText
          text={listTitleText}
          width={CONTENT_W}
          fontSize={16}
          lineHeight={LINE_H / 16}
          firstLineIndent={72}
          style={abs(yListTitle - LINE_H / 2, X_LEFT, { width: CONTENT_W })}
        />

        {Array.from({ length: listRows }).map((_, i) => {
          const cy = yItem0 + i * ITEM_PITCH;
          const c = courses[i];
          return (
            <React.Fragment key={i}>
              <L cy={cy} x={107.4}>
                {toThaiDigits(i + 1)}.
              </L>
              <L cy={cy} x={123.8}>
                วิชา
              </L>
              <Field cy={cy} x={139.1} width={158.8} data={c ? `${courseLabel(c)}${classLabel(c) ? ` ${classLabel(c)}${c.room ? `/${c.room}` : ''}` : ''}` : undefined} />
              <L cy={cy} x={297.9}>
                รหัสวิชา
              </L>
              <Field cy={cy} x={330.5} width={58.5} data={c?.courseCode || undefined} />
              <L cy={cy} x={389.0}>
                จำนวน ปพ.๕
              </L>
              <Field cy={cy} x={445.1} width={62.4} data={c ? '๑' : undefined} />
              <L cy={cy} x={507.5}>
                เล่ม
              </L>
            </React.Fragment>
          );
        })}

        {!bottomOverflow ? renderBottom(yAfterList, true) : null}
      </Page>

      {bottomOverflow ? (
        <Page size="A4" style={{ fontFamily: FONT, fontSize: 16, color: '#000' }}>
          {renderBottom(80 - 516.7, true)}
        </Page>
      ) : null}

      {/* ===================== หน้า 2: แบบสรุปผลสัมฤทธิ์ทางการเรียน (A4 แนวนอน) ===================== */}
      <Page size="A4" orientation="landscape" style={{ fontFamily: FONT, fontSize: 16, color: '#000' }}>
        <L cy={66.6} x={449.3 - 149.5} w={300} align="center" size={18} bold>
          แบบสรุปผลสัมฤทธิ์ทางการเรียน
        </L>
        {isAnnual ? (
          <L cy={86} x={449.3 - 151} w={300} align="center" bold>
            {subtitleAnnual2}
          </L>
        ) : (
          <SemesterYearLine cy={86} leftX={341.1} rightX={464.4} leftDots={13} rightDots={16} sem={semDigits} year={yearDigits} />
        )}
        <L cy={104.3} x={250.4} bold>
          ค่าเป้าหมายผลการเรียนระดับดี (เกรด ๓-๔) ของกลุ่มสาระฯ คือ ร้อยละ
        </L>
        <View style={abs(112.3, 559.0, { width: 89.6, borderBottomWidth: 0.75, borderBottomColor: '#000', borderBottomStyle: 'solid', height: 0 })} />
        {targetText ? (
          <L cy={104.3} x={559.0} w={89.6} align="center" bold>
            {targetText}
          </L>
        ) : null}

        {/* หัวตาราง */}
        {[0, 1, 2, 3, 4].map((i) => (
          <Cell
            key={`h${i}`}
            x0={c2[i]}
            x1={c2[i + 1]}
            y0={p2Top}
            y1={p2Top + 2 * p2HdrH}
            fill={HDR_GREEN}
            bold
            labelH={p2HdrH}
            text={['ที่', 'รายวิชา', 'รหัส', 'ชั้น', 'ห้อง'][i]}
          />
        ))}
        <Cell x0={c2[5]} x1={c2[6]} y0={p2Top} y1={p2Top + p2HdrH} fill={HDR_GREEN} bold text="จำนวน" />
        <Cell x0={c2[5]} x1={c2[6]} y0={p2Top + p2HdrH} y1={p2Top + 2 * p2HdrH} fill={HDR_GREEN} bold text="(คน)" />
        <Cell x0={c2[6]} x1={c2[18]} y0={p2Top} y1={p2Top + p2HdrH} fill={HDR_GREEN} bold text="จำนวนนักเรียนที่มีผลการเรียน (คน)" />
        {GRADE_BUCKET_KEYS.map((key, i) => (
          <Cell key={key} x0={c2[6 + i]} x1={c2[7 + i]} y0={p2Top + p2HdrH} y1={p2Top + 2 * p2HdrH} fill={HDR_GREEN} bold text={GRADE_BUCKET_LABELS[key]} />
        ))}

        {/* แถวข้อมูล */}
        {Array.from({ length: rows2 }).map((_, r) => {
          const c = g2[r];
          const y0 = p2BodyTop + r * p2RowH;
          const y1 = y0 + p2RowH;
          const vals: (string | undefined)[] = [
            c ? toThaiDigits(r + 1) : undefined,
            c ? courseLabel(c) : undefined,
            c?.courseCode || undefined,
            c ? classLabel(c) : undefined,
            c ? c.room : undefined,
            c ? toThaiDigits(c.studentCount ?? 0) : undefined,
            ...GRADE_BUCKET_KEYS.map((k) => (c ? toThaiDigits(c.gradeBuckets?.[k] || 0) : undefined)),
          ];
          return vals.map((v, i) => (
            <Cell key={`${r}-${i}`} x0={c2[i]} x1={c2[i + 1]} y0={y0} y1={y1} text={v} align={i === 1 ? 'left' : 'center'} size={bodyFont2} />
          ));
        })}

        {/* แถวรวม */}
        <Cell x0={c2[0]} x1={c2[4]} y0={p2SumTop} y1={p2PctTop} fill={SUM_YELLOW} bold text="รวม" />
        <Cell x0={c2[4]} x1={c2[5]} y0={p2SumTop} y1={p2PctTop} fill={SUM_YELLOW} />
        <Cell x0={c2[5]} x1={c2[6]} y0={p2SumTop} y1={p2PctTop} fill={SUM_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(gradeStudentTotal) : undefined} />
        <Cell x0={c2[6]} x1={c2[9]} y0={p2SumTop} y1={p2PctTop} fill={SUM_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(groupGood) : undefined} />
        <Cell x0={c2[13]} x1={c2[16]} y0={p2SumTop} y1={p2PctTop} fill={SUM_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(groupFail) : undefined} />
        <Cell x0={c2[16]} x1={c2[17]} y0={p2SumTop} y1={p2PctTop} fill={SUM_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(gradeTotals['ผ']) : undefined} />
        <Cell x0={c2[17]} x1={c2[18]} y0={p2SumTop} y1={p2PctTop} fill={SUM_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(gradeTotals['มผ']) : undefined} />

        {/* แถวคิดเป็นร้อยละ */}
        <Cell x0={c2[0]} x1={c2[6]} y0={p2PctTop} y1={p2Bottom} fill={PCT_YELLOW} bold text="คิดเป็นร้อยละ" />
        <Cell x0={c2[6]} x1={c2[9]} y0={p2PctTop} y1={p2Bottom} fill={PCT_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(calcPercent(groupGood, gradeStudentTotal)) : undefined} />
        <Cell x0={c2[13]} x1={c2[16]} y0={p2PctTop} y1={p2Bottom} fill={PCT_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(calcPercent(groupFail, gradeStudentTotal)) : undefined} />
        <Cell x0={c2[16]} x1={c2[17]} y0={p2PctTop} y1={p2Bottom} fill={PCT_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(calcPercent(gradeTotals['ผ'], gradeStudentTotal)) : undefined} />
        <Cell x0={c2[17]} x1={c2[18]} y0={p2PctTop} y1={p2Bottom} fill={PCT_YELLOW} bold size={bodyFont2 + 1} text={gradeStudentTotal ? toThaiDigits(calcPercent(gradeTotals['มผ'], gradeStudentTotal)) : undefined} />

        {signatureBlock(p2Bottom + 27.7)}
      </Page>

      {/* ===================== หน้า 3: แบบสรุปคุณลักษณะอันพึงประสงค์ (A4 แนวนอน) ===================== */}
      <Page size="A4" orientation="landscape" style={{ fontFamily: FONT, fontSize: 16, color: '#000' }}>
        <L cy={66.5} x={449.5 - 149.5} w={300} align="center" size={18} bold>
          แบบสรุปคุณลักษณะอันพึงประสงค์
        </L>
        {isAnnual ? (
          <L cy={86} x={448.6 - 148.5} w={300} align="center" bold>
            {subtitleAnnual2}
          </L>
        ) : (
          <SemesterYearLine cy={86} leftX={332.0} rightX={455.3} leftDots={13} rightDots={21} spaceBeforeRightDots sem={semDigits} year={yearDigits} />
        )}

        {[0, 1, 2, 3, 4].map((i) => (
          <Cell
            key={`h${i}`}
            x0={c3[i]}
            x1={c3[i + 1]}
            y0={p3Top}
            y1={p3Top + 2 * p3HdrH}
            fill={HDR_GREEN}
            bold
            labelH={p3HdrH}
            text={['ที่', 'รายวิชา', 'รหัส', 'ชั้น', 'ห้อง'][i]}
          />
        ))}
        <Cell x0={c3[5]} x1={c3[6]} y0={p3Top} y1={p3Top + p3HdrH} fill={HDR_GREEN} bold text="จำนวน" />
        <Cell x0={c3[5]} x1={c3[6]} y0={p3Top + p3HdrH} y1={p3Top + 2 * p3HdrH} fill={HDR_GREEN} bold text="(คน)" />
        <Cell x0={c3[6]} x1={c3[10]} y0={p3Top} y1={p3Top + p3HdrH} fill={HDR_GREEN} bold text="จำนวนนักเรียนที่มีผลการประเมิน (คน)" />
        {CHARACTERISTIC_BUCKET_KEYS.map((key, i) => (
          <Cell key={key} x0={c3[6 + i]} x1={c3[7 + i]} y0={p3Top + p3HdrH} y1={p3Top + 2 * p3HdrH} fill={HDR_GREEN} bold text={CHAR_BUCKET_LABELS[key]} />
        ))}

        {Array.from({ length: rows3 }).map((_, r) => {
          const c = courses[r];
          const y0 = p3BodyTop + r * p3RowH;
          const y1 = y0 + p3RowH;
          const vals: (string | undefined)[] = [
            c ? toThaiDigits(r + 1) : undefined,
            c ? courseLabel(c) : undefined,
            c?.courseCode || undefined,
            c ? classLabel(c) : undefined,
            c ? c.room : undefined,
            c ? toThaiDigits(c.studentCount ?? 0) : undefined,
            ...CHARACTERISTIC_BUCKET_KEYS.map((k) => (c ? toThaiDigits(c.charBuckets?.[k] || 0) : undefined)),
          ];
          return vals.map((v, i) => (
            <Cell key={`${r}-${i}`} x0={c3[i]} x1={c3[i + 1]} y0={y0} y1={y1} text={v} align={i === 1 ? 'left' : 'center'} size={bodyFont3} />
          ));
        })}

        <Cell x0={c3[0]} x1={c3[4]} y0={p3SumTop} y1={p3PctTop} fill={SUM_YELLOW} bold text="รวม" />
        <Cell x0={c3[4]} x1={c3[5]} y0={p3SumTop} y1={p3PctTop} fill={SUM_YELLOW} />
        <Cell x0={c3[5]} x1={c3[6]} y0={p3SumTop} y1={p3PctTop} fill={SUM_YELLOW} bold size={bodyFont3 + 1} text={charStudentTotal ? toThaiDigits(charStudentTotal) : undefined} />
        {CHARACTERISTIC_BUCKET_KEYS.map((key, i) => (
          <Cell key={`s${key}`} x0={c3[6 + i]} x1={c3[7 + i]} y0={p3SumTop} y1={p3PctTop} fill={SUM_YELLOW} bold size={bodyFont3 + 1} text={charStudentTotal ? toThaiDigits(charTotals[key]) : undefined} />
        ))}

        <Cell x0={c3[0]} x1={c3[6]} y0={p3PctTop} y1={p3Bottom} fill={PCT_YELLOW} bold text="คิดเป็นร้อยละ" />
        {CHARACTERISTIC_BUCKET_KEYS.map((key, i) => (
          <Cell
            key={`p${key}`}
            x0={c3[6 + i]}
            x1={c3[7 + i]}
            y0={p3PctTop}
            y1={p3Bottom}
            fill={i === 3 ? '#FFFF00' : PCT_YELLOW}
            bold
            size={bodyFont3 + 1}
            text={charStudentTotal ? toThaiDigits(calcPercent(charTotals[key], charStudentTotal)) : undefined}
          />
        ))}

        {signatureBlock(p3Bottom + 26.9)}
      </Page>
    </Document>
  );
};

export default PorBor5SubmissionMemoPdfDocument;
