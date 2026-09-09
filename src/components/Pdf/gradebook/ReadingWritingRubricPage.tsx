import React from 'react';
import { Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import PdfPage from './PdfPage';
import { READING_WRITING_CRITERIA } from './constants';
import { buildJustifiedLines } from '../shared/thaiPdfTextUtils';

// ความกว้างที่ใช้ได้จริงของตาราง (pt) คำนวณจาก A4 (595.28pt) - padding หน้า (15mm ซ้าย, 10mm ขวา)
const TABLE_WIDTH_PT = 524.41;
const CELL_HORIZONTAL_PADDING_PT = 6.4; // padding: '3 3.2' (ซ้าย+ขวา)
const CONTENT_FONT_SIZE = 11.85;

// ความกว้างข้อความจริงภายในแต่ละคอลัมน์ (หักระยะขอบซ้าย/ขวาของ cell ออกแล้ว) — สัดส่วนคอลัมน์ต้องตรงกับ
// colStandard/colIndicator/rubricHeaderGroup ใน styles ด้านล่าง (มาตรฐาน 8.8% / ตัวชี้วัด 20% / ระดับคุณภาพ 17.8%x4)
const INDICATOR_TEXT_WIDTH_PT = TABLE_WIDTH_PT * 0.20 - CELL_HORIZONTAL_PADDING_PT;
const RUBRIC_TEXT_WIDTH_PT = TABLE_WIDTH_PT * 0.175 - CELL_HORIZONTAL_PADDING_PT;
const INDICATOR_NUMBER_WIDTH_PT = 20; // ความกว้างคอลัมน์ย่อยของเลข "N.N" ในช่องตัวชี้วัด
const SCOPE_TEXT_WIDTH_PT = TABLE_WIDTH_PT - 12; // scopeContainer paddingHorizontal:6 (ซ้าย+ขวา)

// ==========================================
// 0. GLOBAL CONFIG
// ==========================================
// บังคับปิดการใส่เครื่องหมายขีดกลาง (-) ทั้งหมดในโปรเจกต์ (สำหรับหน้านี้)
const disableHyphenation = (word: string) => [word];
Font.registerHyphenationCallback(disableHyphenation);

// ==========================================
// 1. HELPER FUNCTION
// ==========================================
const sanitizeThaiText = (text: string | undefined | null) => {
  if (!text) return "";
  return text
    .replace(/[\u200B\u200D\u200C\u00AD]/g, '')
    .replace(/\s*[-‐‑‒–—]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// ใช้ตัวตัดคำ/จัดระยะห่างตัวอักษรแบบเดียวกับหน้าตัวชี้วัด (buildJustifiedLines) แทนการประมาณความกว้างแบบหยาบๆ
// เดิม + textAlign:'justify' ซึ่งทำให้ข้อความไทยที่ไม่มีช่องว่างถูกยืดตัวอักษรจนพังเมื่อบรรทัดสั้น
// ตัดตามขอบเขตคำเสมอ (ไม่ตัดกลางคำ) — หน้านี้ใช้แนวนอนเพื่อให้แต่ละคอลัมน์กว้างพอสำหรับการตัดคำแบบนี้
const ThaiText: React.FC<{ text: string | undefined | null; style?: any; maxWidthPt: number; fontSize?: number }> = ({
  text,
  style,
  maxWidthPt,
  fontSize = CONTENT_FONT_SIZE,
}) => {
  const clean = sanitizeThaiText(text);
  const lines = buildJustifiedLines(clean, maxWidthPt, fontSize);
  return (
    <Text style={style} hyphenationCallback={disableHyphenation}>
      {lines.map((l, index) => (
        <Text key={index} style={{ letterSpacing: l.letterSpacing }} hyphenationCallback={disableHyphenation}>
          {l.line}{index < lines.length - 1 ? '\n' : ''}
        </Text>
      ))}
    </Text>
  );
};

// ==========================================
// 2. INTERFACES
// ==========================================
interface ReadingWritingIndicator {
  text: string;
  rubric: {
    3: string;
    2: string;
    1: string;
    0: string;
  };
}

interface ReadingWritingCriteria {
  id: string;
  standard: string;
  indicators: ReadingWritingIndicator[];
}

interface ReadingWritingRubricPageProps {
  schoolInfo?: any;
  academicYear?: string;
  termToDisplay: string;
  selectedClass: string;
  FULL_CLASSES: Record<string, string>;
  readingWritingCriteria: ReadingWritingCriteria[];
  selectedRoom?: string;
  curriculumClassDisplay: string;
  curriculumRoomDisplay: string;
}

// ==========================================
// 3. STYLES
// ==========================================
const styles = StyleSheet.create({
  headerContainer: {
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  scopeContainer: {
    marginBottom: 5,
    paddingHorizontal: 6,
  },
  scopeTitle: {
    fontSize: 11.5,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  scopeContent: {
    fontSize: 11.5,
    lineHeight: 1.18,
  },
  tableContainer: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    alignItems: 'stretch',
  },
  cell: {
    padding: '3 3.2',
    borderRightWidth: 1,
    borderRightColor: '#000',
    justifyContent: 'flex-start',
    hyphens: 'none',
  },
  headerCell: {
    backgroundColor: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11.5,
    minHeight: 24,
  },
  textHeader: {
    fontWeight: 'bold',
    fontSize: 12.3,
    lineHeight: 1.08,
    letterSpacing: 0,
    hyphens: 'none',
  },
  textContent: {
    fontSize: 11.85,
    lineHeight: 1.09,
    hyphens: 'none',
  },
  textRubric: {
    fontSize: 11.85,
    lineHeight: 1.09,
    hyphens: 'none',
  },
  
  // คอลัมน์ "ตัวชี้วัด" เดิมแคบกว่าคอลัมน์ระดับคุณภาพทั้งที่เนื้อหายาวพอกัน ทำให้ตัดคำถี่ห้วนกว่าคอลัมน์อื่นชัดเจน
  // จึงยกพื้นที่ให้ตัวชี้วัดเพิ่ม โดยหักจากคอลัมน์ระดับคุณภาพเล็กน้อย (ไม่แตะ "มาตรฐาน" เพราะแคบเกินไปจะทำให้
  // ข้อความอย่าง "วิเคราะห์"/"การเขียน" ตัดจนแตกเป็นตัวอักษรเดี่ยว) (Sum = 100%)
  colStandard: { width: '10%' },
  colIndicator: { width: '20%' },
  rubricHeaderGroup: { width: '70%' },

  nestedCol: { width: '90%', flexDirection: 'column' },
  nestedRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderStyle: 'dotted',
  }
});

// ==========================================
// 4. MAIN COMPONENT
// ==========================================
const ReadingWritingRubricPage: React.FC<ReadingWritingRubricPageProps> = ({
  schoolInfo,
  academicYear,
  termToDisplay,
  selectedClass,
  readingWritingCriteria,
  curriculumClassDisplay,
  curriculumRoomDisplay,
}) => {
  const formattedSchoolName = schoolInfo?.schoolName?.startsWith('โรงเรียน')
    ? schoolInfo.schoolName
    : `โรงเรียน${schoolInfo?.schoolName || ''}`;

  const isPrimary = String(selectedClass || '').toLowerCase().startsWith('p');
  const levelWord = isPrimary ? 'ประถมศึกษา' : 'มัธยมศึกษา';
  const gradeNum = parseInt(String(selectedClass || '').replace(/[^0-9]/g, ''), 10) || 0;
  const rangeLabel = gradeNum <= 3 ? '1 - 3' : '4 - 6';

  return (
    <PdfPage>
      {/* Header */}
      <View style={styles.headerContainer} fixed>
        <Text style={styles.title} hyphenationCallback={disableHyphenation}>การประเมินคุณภาพการอ่าน คิด วิเคราะห์ และเขียน ของนักเรียนระดับชั้น{levelWord}ปีที่ {rangeLabel}</Text>
        <Text style={styles.subtitle} hyphenationCallback={disableHyphenation}>
          ชั้น{levelWord}ปีที่ {curriculumClassDisplay.replace(/[^0-9]/g, '')} {formattedSchoolName} ปีการศึกษา {academicYear || '2568'}
        </Text>
      </View>

      {/* Scope Section */}
      <View style={styles.scopeContainer}>
        <Text style={styles.scopeTitle} hyphenationCallback={disableHyphenation}>ขอบเขตการประเมิน</Text>
        <ThaiText
          style={styles.scopeContent}
          maxWidthPt={SCOPE_TEXT_WIDTH_PT}
          fontSize={11.5}
          text="การอ่านจากสื่อสิ่งพิมพ์และสื่ออิเล็กทรอนิกส์ที่ให้ข้อมูลสารสนเทศ ข้อคิด ความรู้เกี่ยวกับสังคมและสิ่งแวดล้อมที่เอื้อให้ผู้อ่านนำไปคิดวิเคราะห์ วิจารณ์ สรุปแนวคิดคุณค่าที่นำไปประยุกต์ใช้ด้วยวิจารณญาณและถ่ายทอดเป็นข้อเขียนเชิงสร้างสรรค์ด้วยภาษาที่ถูกต้องเหมาะสม"
        />
      </View>

      {/* Table */}
      <View style={styles.tableContainer}>
        {/* Table Header Row 1 */}
        <View style={styles.row} fixed>
          <View style={[styles.cell, styles.headerCell, styles.colStandard, { minHeight: 48 }]}>
            <Text hyphenationCallback={disableHyphenation}>มาตรฐาน</Text>
          </View>
          <View style={[styles.cell, styles.headerCell, styles.colIndicator, { minHeight: 48 }]}>
            <Text hyphenationCallback={disableHyphenation}>ตัวชี้วัด</Text>
          </View>
          <View style={[styles.rubricHeaderGroup, { flexDirection: 'column' }]}>
            <View style={[styles.cell, styles.headerCell, { width: '100%', minHeight: 24, borderBottomWidth: 1, borderBottomColor: '#000', borderRightWidth: 0 }]}>
              <Text hyphenationCallback={disableHyphenation}>ระดับคุณภาพ</Text>
            </View>
            <View style={{ flexDirection: 'row', width: '100%', minHeight: 24 }}>
              <View style={[styles.cell, styles.headerCell, { width: '25%' }]}>
                <Text hyphenationCallback={disableHyphenation}>3 (ดีเยี่ยม)</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: '25%' }]}>
                <Text hyphenationCallback={disableHyphenation}>2 (ดี)</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: '25%' }]}>
                <Text hyphenationCallback={disableHyphenation}>1 (ผ่านเกณฑ์)</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: '25%', borderRightWidth: 0 }]}>
                <Text hyphenationCallback={disableHyphenation}>0 (ปรับปรุง)</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Table Body */}
        {(readingWritingCriteria && readingWritingCriteria.length > 0 ? readingWritingCriteria : READING_WRITING_CRITERIA).map((criteria, cIdx, criteriaList) => (
          <View
            key={criteria.id || cIdx}
            style={[
              styles.row,
              {
                borderBottomWidth: cIdx === criteriaList.length - 1 ? 0 : 1,
              },
            ]}
            wrap={false}
          >
            {/* Standard Column */}
            <View style={[styles.cell, styles.colStandard]}>
              <Text style={styles.textHeader} hyphenationCallback={disableHyphenation}>{cIdx + 1}. {sanitizeThaiText(criteria.standard)}</Text>
            </View>

            {/* Nested Content for Indicators and Rubrics */}
            <View style={styles.nestedCol}>
              {(criteria.indicators || []).map((indicator, iIdx) => (
                <View key={iIdx} style={[
                  styles.nestedRow,
                  {
                    borderBottomWidth: iIdx === (criteria.indicators?.length || 0) - 1 ? 0 : 1,
                    borderRightWidth: 0,
                  }
                ]}>
                  {/* Indicator Cell: เลข "N.N" แยกเป็นคอลัมน์ย่อยของตัวเอง ไม่ให้ปนกับข้อความตอนตัดบรรทัด
                      (เดิมรวมเลขไว้ในข้อความเดียวกัน ทำให้ตอนตัดคำ เลข "N.N" มักโดดเดี่ยวอยู่บรรทัดแรกบรรทัดเดียว) */}
                  <View style={[styles.cell, { width: '22.222%', flexDirection: 'row' }]}>
                    <Text style={[styles.textContent, { width: INDICATOR_NUMBER_WIDTH_PT }]}>{cIdx + 1}.{iIdx + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <ThaiText style={styles.textContent} maxWidthPt={INDICATOR_TEXT_WIDTH_PT - INDICATOR_NUMBER_WIDTH_PT} text={indicator.text} />
                    </View>
                  </View>

                  {/* Rubric Cells */}
                  <View style={[styles.cell, { width: '19.444%' }]}>
                    <ThaiText style={styles.textRubric} maxWidthPt={RUBRIC_TEXT_WIDTH_PT} text={indicator.rubric[3]} />
                  </View>
                  <View style={[styles.cell, { width: '19.444%' }]}>
                    <ThaiText style={styles.textRubric} maxWidthPt={RUBRIC_TEXT_WIDTH_PT} text={indicator.rubric[2]} />
                  </View>
                  <View style={[styles.cell, { width: '19.444%' }]}>
                    <ThaiText style={styles.textRubric} maxWidthPt={RUBRIC_TEXT_WIDTH_PT} text={indicator.rubric[1]} />
                  </View>
                  <View style={[styles.cell, { width: '19.444%', borderRightWidth: 0 }]}>
                    <ThaiText style={styles.textRubric} maxWidthPt={RUBRIC_TEXT_WIDTH_PT} text={indicator.rubric[0]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </PdfPage>
  );
};

export default ReadingWritingRubricPage;
