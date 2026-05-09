import { Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import PdfPage from './PdfPage';
import { READING_WRITING_CRITERIA } from './constants';

// ==========================================
// 0. GLOBAL CONFIG
// ==========================================
// บังคับปิดการใส่เครื่องหมายขีดกลาง (-) ทั้งหมดในโปรเจกต์ (สำหรับหน้านี้)
Font.registerHyphenationCallback(word => [word]);

// ==========================================
// 1. HELPER FUNCTION
// ==========================================
const formatThaiText = (text: string | undefined | null) => {
  if (!text) return "";
  // ลบตัวช่วยตัดคำเดิมออกก่อน
  const clean = text.replace(/[\u200B\u200D\u200C\u00AD]/g, '');
  
  try {
    // ใช้ Intl.Segmenter เพื่อแทรก ZWSP ระหว่างคำอย่างแม่นยำ
    const segmenter = new Intl.Segmenter('th-TH', { granularity: 'word' });
    const segments = Array.from(segmenter.segment(clean));
    return segments.map(s => s.segment).join('\u200B');
  } catch (error) {
    return clean;
  }
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
    marginBottom: 8,
  },
  title: {
    fontSize: 12, // ลดลงเพื่อให้ไม่ขึ้นบรรทัดใหม่
    fontWeight: 'bold',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  scopeContainer: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  scopeTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  scopeContent: {
    fontSize: 11,
    lineHeight: 1.4,
    textAlign: 'justify',
    textIndent: 30, // เพิ่มการย่อหน้าให้เหมือนภาพ
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
    padding: '6 4',
    borderRightWidth: 1,
    borderRightColor: '#000',
    justifyContent: 'flex-start', // เริ่มจากด้านบนเหมือนภาพ
    hyphens: 'none',
  },
  headerCell: {
    backgroundColor: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    minHeight: 22,
  },
  textHeader: {
    fontWeight: 'bold',
    fontSize: 10,
    hyphens: 'none',
  },
  textContent: {
    fontSize: 11,
    lineHeight: 1.3,
    textAlign: 'left', // เรียงเป็นประโยคชิดซ้าย
    hyphens: 'none',
  },
  textRubric: {
    fontSize: 11,
    lineHeight: 1.3,
    textAlign: 'left', // เรียงเป็นประโยคชิดซ้าย
    hyphens: 'none',
  },
  
  // ปรับความกว้างใหม่เพื่อใช้พื้นที่ที่เพิ่มขึ้น (Sum = 100%)
  colStandard: { width: '8%' },
  colIndicator: { width: '24%' },
  colRubric: { width: '17%' },
  
  nestedCol: { width: '92%', flexDirection: 'column' },
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
// ==========================================
const ReadingWritingRubricPage: React.FC<ReadingWritingRubricPageProps> = ({
  schoolInfo,
  academicYear,
  termToDisplay,
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
        <Text style={styles.title} hyphenationCallback={(word) => [word]}>การประเมินคุณภาพการอ่าน คิด วิเคราะห์ และเขียน ของนักเรียนระดับชั้นมัธยมศึกษาปีที่ 1 - 3</Text>
        <Text style={styles.subtitle} hyphenationCallback={(word) => [word]}>
          ชั้นมัธยมศึกษาปีที่ {curriculumClassDisplay.replace(/[^0-9]/g, '')} {formattedSchoolName} ปีการศึกษา {academicYear || '2568'}
        </Text>
      </View>

      {/* Scope Section */}
      <View style={styles.scopeContainer}>
        <Text style={styles.scopeTitle} hyphenationCallback={(word) => [word]}>ขอบเขตการประเมิน</Text>
        <Text style={styles.scopeContent} hyphenationCallback={(word) => [word]}>
          {formatThaiText('การอ่านจากสื่อสิ่งพิมพ์และสื่ออิเล็กทรอนิกส์ที่ให้ข้อมูลสารสนเทศ ข้อคิด ความรู้เกี่ยวกับสังคมและสิ่งแวดล้อมที่เอื้อให้ผู้อ่านนำไปคิดวิเคราะห์ วิจารณ์ สรุปแนวคิดคุณค่าที่นำไปประยุกต์ใช้ด้วยวิจารณญาณและถ่ายทอดเป็นข้อเขียนเชิงสร้างสรรค์ด้วยภาษาที่ถูกต้องเหมาะสม')}
        </Text>
      </View>

      {/* Table */}
      <View style={styles.tableContainer}>
        {/* Table Header Row 1 */}
        <View style={styles.row} fixed>
          <View style={[styles.cell, styles.headerCell, styles.colStandard]}>
            <Text hyphenationCallback={(word) => [word]}>มาตรฐาน</Text>
          </View>
          <View style={[styles.cell, styles.headerCell, styles.colIndicator]}>
            <Text hyphenationCallback={(word) => [word]}>ตัวชี้วัด</Text>
          </View>
          <View style={[styles.cell, styles.headerCell, { width: '68%', borderRightWidth: 0 }]}>
            <Text hyphenationCallback={(word) => [word]}>ระดับคุณภาพ</Text>
          </View>
        </View>

        {/* Table Header Row 2 (Levels) */}
        <View style={styles.row} fixed>
          <View style={[styles.cell, styles.headerCell, styles.colStandard]}><Text hyphenationCallback={(word) => [word]} /></View>
          <View style={[styles.cell, styles.headerCell, styles.colIndicator]}><Text hyphenationCallback={(word) => [word]} /></View>
          <View style={[styles.cell, styles.headerCell, styles.colRubric]}>
            <Text hyphenationCallback={(word) => [word]}>3 (ดีเยี่ยม)</Text>
          </View>
          <View style={[styles.cell, styles.headerCell, styles.colRubric]}>
            <Text hyphenationCallback={(word) => [word]}>2 (ดี)</Text>
          </View>
          <View style={[styles.cell, styles.headerCell, styles.colRubric]}>
            <Text hyphenationCallback={(word) => [word]}>1 (ผ่านเกณฑ์)</Text>
          </View>
          <View style={[styles.cell, styles.headerCell, styles.colRubric, { borderRightWidth: 0 }]}>
            <Text hyphenationCallback={(word) => [word]}>0 (ปรับปรุง)</Text>
          </View>
        </View>

        {/* Table Body */}
        {(readingWritingCriteria && readingWritingCriteria.length > 0 ? readingWritingCriteria : READING_WRITING_CRITERIA).map((criteria, cIdx) => (
          <View key={criteria.id || cIdx} style={[styles.row, { borderBottomWidth: cIdx === (readingWritingCriteria?.length || READING_WRITING_CRITERIA.length) - 1 ? 0 : 1 }]} wrap={false}>
            {/* Standard Column */}
            <View style={[styles.cell, styles.colStandard]}>
              <Text style={styles.textHeader} hyphenationCallback={(word) => [word]}>{cIdx + 1}. {formatThaiText(criteria.standard)}</Text>
            </View>

            {/* Nested Content for Indicators and Rubrics */}
            <View style={styles.nestedCol}>
              {(criteria.indicators || []).map((indicator, iIdx) => (
                <View key={iIdx} style={[
                  styles.nestedRow, 
                  { borderBottomWidth: iIdx === (criteria.indicators?.length || 0) - 1 ? 0 : 1, borderRightWidth: 0 }
                ]}>
                  {/* Indicator Cell */}
                  <View style={[styles.cell, { width: '26.087%' }]}>
                    <Text style={styles.textContent} hyphenationCallback={(word) => [word]}>{formatThaiText(`${cIdx + 1}.${iIdx + 1} ${indicator.text}`)}</Text>
                  </View>
                  
                  {/* Rubric Cells */}
                  <View style={[styles.cell, { width: '18.4783%' }]}>
                    <Text style={styles.textRubric} hyphenationCallback={(word) => [word]}>{formatThaiText(indicator.rubric[3])}</Text>
                  </View>
                  <View style={[styles.cell, { width: '18.4783%' }]}>
                    <Text style={styles.textRubric} hyphenationCallback={(word) => [word]}>{formatThaiText(indicator.rubric[2])}</Text>
                  </View>
                  <View style={[styles.cell, { width: '18.4783%' }]}>
                    <Text style={styles.textRubric} hyphenationCallback={(word) => [word]}>{formatThaiText(indicator.rubric[1])}</Text>
                  </View>
                  <View style={[styles.cell, { width: '18.4783%', borderRightWidth: 0 }]}>
                    <Text style={styles.textRubric} hyphenationCallback={(word) => [word]}>{formatThaiText(indicator.rubric[0])}</Text>
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