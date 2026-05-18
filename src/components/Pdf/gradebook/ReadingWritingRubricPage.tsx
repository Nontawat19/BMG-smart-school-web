import React from 'react';
<<<<<<< HEAD
import { Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import PdfPage from './PdfPage';
import { READING_WRITING_CRITERIA } from './constants';

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

const getThaiTextParts = (text: string | undefined | null) => {
  const clean = sanitizeThaiText(text);
  if (!clean) return [];

  try {
    // แยกเป็น Text runs สั้น ๆ แทนการส่ง string ยาวให้ react-pdf hyphenate เอง
    const segmenter = new Intl.Segmenter('th-TH', { granularity: 'word' });
    const segments = Array.from(segmenter.segment(clean));
    return segments
      .map(s => s.segment.replace(/\s+/g, ' '))
      .filter(Boolean);
  } catch (error) {
    return clean.split('');
  }
};

const measureTextUnits = (text: string) => {
  return Array.from(text).reduce((sum, char) => {
    if (char === ' ') return sum + 0.35;
    if (/[0-9A-Za-z()./]/.test(char)) return sum + 0.55;
    return sum + 1;
  }, 0);
};

const wrapThaiText = (text: string | undefined | null, maxUnits: number) => {
  const parts = getThaiTextParts(text);
  const lines: string[] = [];
  let current = '';

  parts.forEach(part => {
    if (!part) return;
    if (!current) {
      current = part.trimStart();
      return;
    }

    const next = current + part;
    if (measureTextUnits(next) <= maxUnits) {
      current = next;
    } else {
      lines.push(current.trimEnd());
      current = part.trimStart();
    }
  });

  if (current) lines.push(current.trimEnd());
  return lines;
};

const ThaiText: React.FC<{ text: string | undefined | null; style?: any; maxUnits: number }> = ({ text, style, maxUnits }) => {
  const lines = wrapThaiText(text, maxUnits);
  return (
    <Text style={style} hyphenationCallback={disableHyphenation}>
      {lines.map((line, index) => (
        <Text key={`${line}-${index}`} hyphenationCallback={disableHyphenation}>
          {line}{index < lines.length - 1 ? '\n' : ''}
        </Text>
      ))}
    </Text>
  );
};

const getIndicatorRowHeight = (criteriaIndex: number, indicatorIndex: number) => {
  const heights = [
    [118, 96],
    [128, 96],
    [128],
  ];

  return heights[criteriaIndex]?.[indicatorIndex] ?? 112;
};

const getCriteriaRowHeight = (criteria: ReadingWritingCriteria, criteriaIndex: number) =>
  (criteria.indicators || []).reduce((sum, _indicator, indicatorIndex) => sum + getIndicatorRowHeight(criteriaIndex, indicatorIndex), 0);

// ==========================================
// 2. INTERFACES
=======
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import PdfPage from './PdfPage';

// ==========================================
// 2. HELPER FUNCTION (หัวใจสำคัญของการตัดคำ)
// ==========================================
const formatThaiText = (text: string | undefined | null) => {
  // 1. ถ้าไม่มีข้อมูล ให้คืนค่าว่าง "" (ไม่แสดงเครื่องหมาย -)
  if (!text) return "";

  // 2. แทรก Zero-Width Space (\u200B) หลังตัวอักษรทุกตัว
  //    เพื่อให้ PDF รู้ว่าสามารถตัดขึ้นบรรทัดใหม่ตรงไหนก็ได้
  //    ผลลัพธ์: ข้อความจะไหลลงมาเองโดยไม่มีขีด hyphen (-)
  return text.split('').join('\u200B');
};

// ==========================================
// 3. INTERFACES
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
<<<<<<< HEAD
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
    textAlign: 'justify',
    textIndent: 28,
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
    textAlign: 'justify',
    letterSpacing: 0,
    hyphens: 'none',
  },
  textRubric: {
    fontSize: 11.85,
    lineHeight: 1.09,
    textAlign: 'justify',
    letterSpacing: 0,
    hyphens: 'none',
  },
  
  // ปรับความกว้างใหม่เพื่อใช้พื้นที่ที่เพิ่มขึ้น (Sum = 100%)
  colStandard: { width: '8.8%' },
  colIndicator: { width: '16.5%' },
  rubricHeaderGroup: { width: '74.7%' },
  
  nestedCol: { width: '91.2%', flexDirection: 'column' },
  nestedRow: { 
    flexDirection: 'row', 
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderStyle: 'dotted',
  }
});

// ==========================================
// 4. MAIN COMPONENT
=======
// 4. STYLES
// ==========================================
const COL_WIDTHS = {
  STANDARD: '10%',
  INDICATOR: '22%',
};

const styles = StyleSheet.create({
  // --- Header ---
  headerContainer: {
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  scopeSection: {
    marginBottom: 10,
    paddingLeft: 5,
  },
  scopeHeader: {
    fontWeight: 'bold',
    fontSize: 14,
    textDecoration: 'underline',
    marginBottom: 2,
  },
  scopeText: {
    fontSize: 12,
    textAlign: 'justify',
    textIndent: 20,
  },
  // --- Table ---
  tableContainer: {
    width: '100%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#000',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch', // ยืดความสูงให้เท่ากัน
  },
  cell: {
    padding: 4,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    fontSize: 12,
    textAlign: 'left', // ชิดซ้ายเพื่อให้อ่านง่าย
  },
  headerCell: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
    textAlign: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  standardCell: {
    width: COL_WIDTHS.STANDARD,
    padding: 4,
    borderRightWidth: 1,
    borderColor: '#000',
    textAlign: 'left',
    backgroundColor: '#fff',
  },
});

// ==========================================
// 5. MAIN COMPONENT
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
// ==========================================
const ReadingWritingRubricPage: React.FC<ReadingWritingRubricPageProps> = ({
  schoolInfo,
  academicYear,
  termToDisplay,
<<<<<<< HEAD
  readingWritingCriteria,
  curriculumClassDisplay,
  curriculumRoomDisplay,
}) => {
  const formattedSchoolName = schoolInfo?.schoolName?.startsWith('โรงเรียน')
    ? schoolInfo.schoolName
    : `โรงเรียน${schoolInfo?.schoolName || ''}`;

  return (
    <PdfPage>
      {/* Header */}
      <View style={styles.headerContainer} fixed>
        <Text style={styles.title} hyphenationCallback={disableHyphenation}>การประเมินคุณภาพการอ่าน คิด วิเคราะห์ และเขียน ของนักเรียนระดับชั้นมัธยมศึกษาปีที่ 1 - 3</Text>
        <Text style={styles.subtitle} hyphenationCallback={disableHyphenation}>
          ชั้นมัธยมศึกษาปีที่ {curriculumClassDisplay.replace(/[^0-9]/g, '')} {formattedSchoolName} ปีการศึกษา {academicYear || '2568'}
        </Text>
      </View>

      {/* Scope Section */}
      <View style={styles.scopeContainer}>
        <Text style={styles.scopeTitle} hyphenationCallback={disableHyphenation}>ขอบเขตการประเมิน</Text>
        <ThaiText
          style={styles.scopeContent}
          maxUnits={158}
          text="การอ่านจากสื่อสิ่งพิมพ์และสื่ออิเล็กทรอนิกส์ที่ให้ข้อมูลสารสนเทศ ข้อคิด ความรู้เกี่ยวกับสังคมและสิ่งแวดล้อมที่เอื้อให้ผู้อ่านนำไปคิดวิเคราะห์ วิจารณ์ สรุปแนวคิดคุณค่าที่นำไปประยุกต์ใช้ด้วยวิจารณญาณและถ่ายทอดเป็นข้อเขียนเชิงสร้างสรรค์ด้วยภาษาที่ถูกต้องเหมาะสม"
        />
=======
  selectedClass,
  FULL_CLASSES,
  readingWritingCriteria,
  selectedRoom,
  curriculumClassDisplay,
  curriculumRoomDisplay,
}) => {
  return (
    <PdfPage>

      {/* Header */}
      <View style={styles.headerContainer} fixed>
        <Text style={styles.title}>การประเมินคุณภาพการอ่าน คิด วิเคราะห์ และเขียน</Text>
        <Text style={styles.subtitle}>
          ชั้น {curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''} ภาคเรียนที่ {termToDisplay} ปีการศึกษา {academicYear || '2568'}
        </Text>
      </View>

      <View style={styles.scopeSection}>
        <Text style={styles.scopeHeader}>ขอบเขตการประเมิน</Text>
        {/* ใช้ formatThaiText กับข้อความยาวๆ ด้วย */}
        <Text style={styles.scopeText}>
          {formatThaiText('การอ่านจากสื่อสิ่งพิมพ์และสื่ออิเล็กทรอนิกส์ที่ให้ข้อมูลสารสนเทศ ข้อคิด ความรู้เกี่ยวกับสังคมและสิ่งแวดล้อม...')}
        </Text>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
      </View>

      {/* Table */}
      <View style={styles.tableContainer}>
<<<<<<< HEAD
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
=======

        {/* Table Header */}
        <View style={styles.row} fixed>
          <View style={[styles.cell, styles.headerCell, { width: COL_WIDTHS.STANDARD }]}>
            <Text>มาตรฐาน</Text>
          </View>
          <View style={[styles.cell, styles.headerCell, { width: COL_WIDTHS.INDICATOR }]}>
            <Text>ตัวชี้วัด</Text>
          </View>

          <View style={{ width: '68%', flexDirection: 'column' }}>
            <View style={[styles.cell, styles.headerCell, { width: '100%', borderBottomWidth: 1, borderRightWidth: 1 }]}>
              <Text>ระดับคุณภาพ</Text>
            </View>
            <View style={{ flexDirection: 'row', width: '100%' }}>
              <View style={[styles.cell, styles.headerCell, { width: '25%', borderBottomWidth: 1, borderRightWidth: 1 }]}>
                <Text>3 (ดีเยี่ยม)</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: '25%', borderBottomWidth: 1, borderRightWidth: 1 }]}>
                <Text>2 (ดี)</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: '25%', borderBottomWidth: 1, borderRightWidth: 1 }]}>
                <Text>1 (ผ่านเกณฑ์)</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: '25%', borderBottomWidth: 1, borderRightWidth: 1 }]}>
                <Text>0 (ปรับปรุง)</Text>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
              </View>
            </View>
          </View>
        </View>

        {/* Table Body */}
<<<<<<< HEAD
        {(readingWritingCriteria && readingWritingCriteria.length > 0 ? readingWritingCriteria : READING_WRITING_CRITERIA).map((criteria, cIdx, criteriaList) => (
          <View
            key={criteria.id || cIdx}
            style={[
              styles.row,
              {
                borderBottomWidth: cIdx === criteriaList.length - 1 ? 0 : 1,
                height: getCriteriaRowHeight(criteria, cIdx),
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
                    height: getIndicatorRowHeight(cIdx, iIdx),
                  }
                ]}>
                  {/* Indicator Cell */}
                  <View style={[styles.cell, { width: '18.092%' }]}>
                    <ThaiText style={styles.textContent} maxUnits={22.8} text={`${cIdx + 1}.${iIdx + 1} ${indicator.text}`} />
                  </View>
                  
                  {/* Rubric Cells */}
                  <View style={[styles.cell, { width: '20.477%' }]}>
                    <ThaiText style={styles.textRubric} maxUnits={25.2} text={indicator.rubric[3]} />
                  </View>
                  <View style={[styles.cell, { width: '20.477%' }]}>
                    <ThaiText style={styles.textRubric} maxUnits={25.2} text={indicator.rubric[2]} />
                  </View>
                  <View style={[styles.cell, { width: '20.477%' }]}>
                    <ThaiText style={styles.textRubric} maxUnits={25.2} text={indicator.rubric[1]} />
                  </View>
                  <View style={[styles.cell, { width: '20.477%', borderRightWidth: 0 }]}>
                    <ThaiText style={styles.textRubric} maxUnits={25.2} text={indicator.rubric[0]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
=======
        {readingWritingCriteria && readingWritingCriteria.map((criteria, cIdx) => (
          <View key={criteria.id} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000' }} wrap={false}>

            {/* Standard Column */}
            <View style={[styles.standardCell, { borderBottomWidth: 0 }]}>
              <Text>{cIdx + 1}. {criteria.standard}</Text>
            </View>

            {/* Content Column */}
            <View style={{ width: '90%', flexDirection: 'column' }}>
              {criteria.indicators.map((indicator, iIdx) => {
                const isLast = iIdx === criteria.indicators.length - 1;

                return (
                  <View
                    key={`${criteria.id}-${iIdx}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'stretch',
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomStyle: isLast ? 'solid' : 'dotted',
                      borderColor: '#000'
                    }}
                  >
                    {/* Indicator */}
                    <View style={[styles.cell, { width: '24.44%', borderBottomWidth: 0 }]}>
                      <Text>{formatThaiText(`${cIdx + 1}.${iIdx + 1} ${indicator.text}`)}</Text>
                    </View>

                    {/* Rubrics (3, 2, 1, 0) */}
                    <View style={[styles.cell, { flex: 1, borderBottomWidth: 0 }]}>
                      <Text>{formatThaiText(indicator.rubric[3])}</Text>
                    </View>
                    <View style={[styles.cell, { flex: 1, borderBottomWidth: 0 }]}>
                      <Text>{formatThaiText(indicator.rubric[2])}</Text>
                    </View>
                    <View style={[styles.cell, { flex: 1, borderBottomWidth: 0 }]}>
                      <Text>{formatThaiText(indicator.rubric[1])}</Text>
                    </View>
                    <View style={[styles.cell, { flex: 1, borderBottomWidth: 0 }]}>
                      <Text>{formatThaiText(indicator.rubric[0])}</Text>
                    </View>

                  </View>
                );
              })}
            </View>
          </View>
        ))}

>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
      </View>
    </PdfPage>
  );
};

<<<<<<< HEAD
export default ReadingWritingRubricPage;
=======
export default ReadingWritingRubricPage;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
