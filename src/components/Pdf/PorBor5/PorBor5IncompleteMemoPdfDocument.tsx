import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import {
  wrapParagraphLines,
  fitFontSizeToWidth,
  justifyLetterSpacing,
} from '../shared/thaiPdfTextUtils';

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

const styles = StyleSheet.create({
  page: {
    paddingTop: 42.5, // 1.5 cm
    paddingBottom: 56.7, // 2 cm
    paddingLeft: 85, // 3 cm
    paddingRight: 56.7, // 2 cm
    fontFamily: 'TH Sarabun PSK',
    fontSize: 16,
    lineHeight: 1.15,
    color: '#000000',
  },
  headerContainer: {
    flexDirection: 'row',
    height: 46,
    marginBottom: 8,
    alignItems: 'flex-end',
    position: 'relative',
  },
  garuda: {
    width: 42.5, // 1.5 cm
    height: 42.5,
    position: 'absolute',
    top: 0,
    left: 0,
    objectFit: 'contain',
  },
  headerTitle: {
    fontSize: 29,
    fontWeight: 'bold',
    textAlign: 'center',
    width: '100%',
    lineHeight: 1.0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  labelBold: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  metaText: {
    fontSize: 16,
  },
  divider: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    marginTop: 4,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 1.25,
    textAlign: 'left',
    textIndent: 40,
    marginBottom: 0,
  },
  paragraphContinued: {
    fontSize: 16,
    lineHeight: 1.25,
    textAlign: 'left',
    marginBottom: 0,
  },
  tableContainer: {
    marginTop: 8,
    marginBottom: 10,
    // Note: Do not put outer borders on tableContainer directly so react-pdf does not leak hanging vertical borders across page breaks
  },
  tableHeaderRow: {
    flexDirection: 'row',
    minHeight: 22,
  },
  tableRow: {
    flexDirection: 'row',
    minHeight: 20,
  },
  thCell: {
    borderTopWidth: 0.8,
    borderTopColor: '#000',
    borderBottomWidth: 0.8,
    borderBottomColor: '#000',
    borderRightWidth: 0.5,
    borderRightColor: '#6b7280',
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  thFirst: {
    borderLeftWidth: 0.8,
    borderLeftColor: '#000',
  },
  thLast: {
    borderRightWidth: 0.8,
    borderRightColor: '#000',
  },
  thText: {
    fontSize: 12.5,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.05,
  },
  tdCell: {
    borderRightWidth: 0.5,
    borderRightColor: '#d1d5db',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  tdCellLastRow: {
    borderRightWidth: 0.5,
    borderRightColor: '#d1d5db',
    borderBottomWidth: 0.8,
    borderBottomColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  tdFirst: {
    borderLeftWidth: 0.8,
    borderLeftColor: '#000',
  },
  tdLast: {
    borderRightWidth: 0.8,
    borderRightColor: '#000',
  },
  tdCenterText: {
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 1.1,
  },
  tdLeftText: {
    fontSize: 11.5,
    textAlign: 'left',
    lineHeight: 1.1,
    width: '100%',
  },
  tdTeacherText: {
    fontSize: 11,
    textAlign: 'left',
    lineHeight: 1.15,
    width: '100%',
  },
  signaturesContainer: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  directorBox: {
    width: '48%',
    borderWidth: 0.8,
    borderColor: '#000',
    padding: 8,
    borderRadius: 2,
  },
  directorBoxTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    marginLeft: 4,
  },
  checkboxSquare: {
    width: 9,
    height: 9,
    borderWidth: 0.8,
    borderColor: '#000',
    marginRight: 6,
  },
  checkboxLabel: {
    fontSize: 13,
  },
  reporterBox: {
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 15,
  },
  signDots: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 25,
    right: 56.7,
    fontSize: 11,
    color: '#6b7280',
  },
});

export interface IncompleteSectionItem {
  courseCode: string;
  courseTitle: string;
  classLabel: string;
  roomLabel: string;
  teacherName: string;
  subjectGroup: string;
  overallPercentage: number;
  status: 'complete' | 'in_progress' | 'not_started';
}

export interface PorBor5MemoPdfProps {
  schoolName: string;
  schoolAffiliation?: string;
  academicYear: string;
  semester: string;
  docNo?: string;
  reportDate?: string;
  academicHeadName?: string;
  academicHeadRole?: string;
  directorName?: string;
  directorRole?: string;
  items: IncompleteSectionItem[];
}

const toThaiDigits = (num: any): string => {
  if (num === null || num === undefined) return '';
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return num.toString().replace(/[0-9]/g, (d: string) => thaiDigits[parseInt(d, 10)]);
};

const getThaiCurrentDateParts = (dateStr?: string) => {
  const d = dateStr ? new Date(dateStr) : new Date();
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  const day = toThaiDigits(d.getDate());
  const month = months[d.getMonth()];
  const year = toThaiDigits(d.getFullYear() + 543);
  return { day, month, year };
};

export const PorBor5IncompleteMemoPdfDocument: React.FC<PorBor5MemoPdfProps> = ({
  schoolName,
  schoolAffiliation,
  academicYear,
  semester,
  docNo,
  reportDate,
  academicHeadName,
  academicHeadRole = 'หัวหน้ากลุ่มบริหารงานวิชาการ',
  directorName,
  directorRole = 'ผู้อำนวยการโรงเรียน',
  items,
}) => {
  const cleanSchoolName = schoolName.startsWith('โรงเรียน') ? schoolName : `โรงเรียน${schoolName}`;
  const affiliationText = schoolAffiliation ? ` สังกัด${schoolAffiliation}` : '';
  const displayDocNo = docNo ? toThaiDigits(docNo) : 'ศธ .....................................';
  const dateParts = getThaiCurrentDateParts(reportDate);
  // 📌 แสดงวันที่ ณ ตอนสร้าง/ดาวน์โหลดเอกสารจริง (ไม่ใช่ค่าว่าง)
  const displayDate = `${dateParts.day} ${dateParts.month} พ.ศ. ${dateParts.year}`;
  const displaySignDate = `วันที่ ${dateParts.day} เดือน ${dateParts.month} พ.ศ. ${dateParts.year}`;

  // 📌 "ส่วนราชการ" อาจมีชื่อสังกัดยาวจนล้นไปขึ้นบรรทัดใหม่ — ย่อฟอนต์อัตโนมัติให้พอดีบรรทัดเดียวเสมอ
  const serviceUnitText = `กลุ่มบริหารงานวิชาการ ${cleanSchoolName}${affiliationText}`;
  const pageContentWidthPt = 595.28 - 85 - 56.7; // A4 width - paddingLeft - paddingRight
  const serviceUnitLabelWidthPt = 62; // ตรงกับ width ของ label "ส่วนราชการ"
  const serviceUnitFontSize = fitFontSizeToWidth(
    serviceUnitText,
    pageContentWidthPt - serviceUnitLabelWidthPt,
    16,
  );

  const academicYearText = toThaiDigits(academicYear);
  const periodText =
    semester === '1'
      ? `ประจำภาคเรียนที่ ๑ ปีการศึกษา ${academicYearText}`
      : semester === '2'
      ? `ประจำภาคเรียนที่ ๒ ปีการศึกษา ${academicYearText}`
      : `ประจำปีการศึกษา ${academicYearText}`;
  const itemsCountText = toThaiDigits(items.length);

  // Column width ratios (allocated 30% for teacher name to fit long names comfortably)
  const colWidths = {
    index: '5.5%',
    code: '12%',
    title: '26%',
    classRoom: '12.5%',
    teacher: '30%',
    progress: '14%',
  };

  // Paragraph pre-wrapping for Thai SARABUN PSK (prevents awkward early line wraps)
  const paragraphWidthPt = 595.28 - 85 - 56.7; // 453.58 pt
  const indentPt = 40;

  const p1Raw = `ด้วย กลุ่มบริหารงานวิชาการ ได้ดำเนินการติดตามและตรวจสอบการบันทึกข้อมูลการวัดและประเมินผลการเรียนรู้ในสมุดบันทึกผลการเรียนรู้รายวิชา (ปพ.๕) ของครูผู้สอนทุกกลุ่มสาระการเรียนรู้ ${periodText} เพื่อให้การดำเนินงานด้านการวัดผลและประเมินผลของสถานศึกษาเป็นไปด้วยความเรียบร้อย ถูกต้อง และสอดคล้องตามระเบียบของทางราชการ`;
  const p1Lines = wrapParagraphLines(p1Raw, paragraphWidthPt, indentPt, styles.page.fontSize ?? 16);
  const p1Rows = p1Lines.map((line, idx) => {
    const isLast = idx === p1Lines.length - 1;
    const lineMaxWidth = idx === 0 ? paragraphWidthPt - indentPt : paragraphWidthPt;
    const letterSpacing = isLast ? 0 : justifyLetterSpacing(line, lineMaxWidth, styles.page.fontSize ?? 16);
    return { line, letterSpacing };
  });

  const p2Raw = `จากการตรวจสอบข้อมูลในระบบสารสนเทศ ปรากฏว่ายังมีรายวิชาและครูผู้สอนที่ยังไม่ได้ดำเนินการบันทึกข้อมูล หรือยังดำเนินการไม่ครบถ้วนสมบูรณ์ จำนวนทั้งสิ้น ${itemsCountText} กลุ่มเรียน/รายวิชา ดังมีรายละเอียดปรากฏตามตารางรายงานแนบท้ายนี้`;
  const p2Lines = wrapParagraphLines(p2Raw, paragraphWidthPt, indentPt, styles.page.fontSize ?? 16);
  const p2Rows = p2Lines.map((line, idx) => {
    const isLast = idx === p2Lines.length - 1;
    const lineMaxWidth = idx === 0 ? paragraphWidthPt - indentPt : paragraphWidthPt;
    const letterSpacing = isLast ? 0 : justifyLetterSpacing(line, lineMaxWidth, styles.page.fontSize ?? 16);
    return { line, letterSpacing };
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header with Garuda and Title */}
        <View style={styles.headerContainer}>
          <Image style={styles.garuda} src="/assets/images/garuda_official.jpg" />
          <Text style={styles.headerTitle}>บันทึกข้อความ</Text>
        </View>

        {/* Official Memo Metadata */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 }}>
          <Text style={[styles.labelBold, { width: 62 }]}>ส่วนราชการ</Text>
          <Text style={[styles.metaText, { flex: 1, lineHeight: 1.2, fontSize: serviceUnitFontSize }]}>
            {serviceUnitText}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 }}>
          <View style={{ flexDirection: 'row', width: '47%', alignItems: 'flex-start' }}>
            <Text style={[styles.labelBold, { marginRight: 6 }]}>ที่</Text>
            <Text style={[styles.metaText, { flex: 1, lineHeight: 1.2 }]}>{displayDocNo}</Text>
          </View>
          <View style={{ flexDirection: 'row', width: '53%', alignItems: 'flex-start' }}>
            <Text style={[styles.labelBold, { marginRight: 6 }]}>วันที่</Text>
            <Text style={[styles.metaText, { flex: 1, lineHeight: 1.2 }]}>{displayDate}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 }}>
          <Text style={[styles.labelBold, { width: 33 }]}>เรื่อง</Text>
          <Text style={[styles.metaText, { flex: 1, lineHeight: 1.25 }]}>
            รายงานผลการติดตามการจัดทำสมุดบันทึกผลการเรียนรู้รายวิชา (ปพ.๕) {periodText}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
          <Text style={[styles.labelBold, { width: 33 }]}>เรียน</Text>
          <Text style={[styles.metaText, { flex: 1, lineHeight: 1.2 }]}>ผู้อำนวยการ{cleanSchoolName}</Text>
        </View>

        {/* Paragraph 1 */}
        <View style={{ marginBottom: 6 }}>
          {p1Rows.map(({ line, letterSpacing }, idx) => (
            <Text
              key={idx}
              wrap={false}
              style={[
                idx === 0 ? styles.paragraph : styles.paragraphContinued,
                letterSpacing > 0 ? { letterSpacing } : {},
              ]}
            >
              {line}
            </Text>
          ))}
        </View>

        {/* Paragraph 2 */}
        <View style={{ marginBottom: 6 }}>
          {p2Rows.map(({ line, letterSpacing }, idx) => (
            <Text
              key={idx}
              wrap={false}
              style={[
                idx === 0 ? styles.paragraph : styles.paragraphContinued,
                letterSpacing > 0 ? { letterSpacing } : {},
              ]}
            >
              {line}
            </Text>
          ))}
        </View>

        {/* Paragraph 3 */}
        <Text style={[styles.paragraph, { marginBottom: 6 }]}>จึงเรียนมาเพื่อโปรดทราบและพิจารณา</Text>

        {/* Data Table */}
        <View style={styles.tableContainer}>
          {/* Table Header */}
          <View style={styles.tableHeaderRow} fixed>
            <View style={[styles.thCell, styles.thFirst, { width: colWidths.index }]}>
              <Text style={styles.thText}>ลำดับ</Text>
            </View>
            <View style={[styles.thCell, { width: colWidths.code }]}>
              <Text style={styles.thText}>รหัสวิชา</Text>
            </View>
            <View style={[styles.thCell, { width: colWidths.title }]}>
              <Text style={styles.thText}>ชื่อรายวิชา</Text>
            </View>
            <View style={[styles.thCell, { width: colWidths.classRoom }]}>
              <Text style={styles.thText}>ชั้น/ห้อง</Text>
            </View>
            <View style={[styles.thCell, { width: colWidths.teacher }]}>
              <Text style={styles.thText}>ครูผู้สอน</Text>
            </View>
            <View style={[styles.thCell, styles.thLast, { width: colWidths.progress }]}>
              <Text style={styles.thText}>ความคืบหน้า</Text>
            </View>
          </View>

          {/* Table Rows */}
          {items.map((row, idx) => {
            const classAndRoom = row.roomLabel
              ? `${row.classLabel} (${row.roomLabel})`
              : row.classLabel;
            const progressLabel =
              row.status === 'not_started' || row.overallPercentage === 0
                ? 'ยังไม่เริ่มทำ (๐%)'
                : `กำลังทำ (${toThaiDigits(row.overallPercentage)}%)`;
            const isLast = idx === items.length - 1;
            const cellStyle = isLast ? styles.tdCellLastRow : styles.tdCell;

            return (
              <View key={idx} style={styles.tableRow} wrap={false}>
                <View style={[cellStyle, styles.tdFirst, { width: colWidths.index }]}>
                  <Text style={styles.tdCenterText}>
                    {toThaiDigits(idx + 1)}
                  </Text>
                </View>
                <View style={[cellStyle, { width: colWidths.code }]}>
                  <Text style={[styles.tdCenterText, { fontWeight: 'bold' }]}>
                    {row.courseCode}
                  </Text>
                </View>
                <View style={[cellStyle, { width: colWidths.title, alignItems: 'flex-start' }]}>
                  <Text style={styles.tdLeftText}>
                    {row.courseTitle}
                  </Text>
                </View>
                <View style={[cellStyle, { width: colWidths.classRoom }]}>
                  <Text style={styles.tdCenterText}>
                    {classAndRoom}
                  </Text>
                </View>
                <View style={[cellStyle, { width: colWidths.teacher, alignItems: 'flex-start' }]}>
                  <Text style={styles.tdTeacherText}>
                    {row.teacherName}
                  </Text>
                </View>
                <View
                  style={[
                    cellStyle,
                    styles.tdLast,
                    { width: colWidths.progress },
                  ]}
                >
                  <Text
                    style={[
                      styles.tdCenterText,
                      {
                        color: row.status === 'not_started' ? '#dc2626' : '#d97706',
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    {progressLabel}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Signatures Section */}
        <View style={styles.signaturesContainer} wrap={false}>
          {/* Director Order / Acknowledgment Box (Left) */}
          <View style={styles.directorBox}>
            <Text style={styles.directorBoxTitle}>คำสั่ง / ความเห็นของผู้อำนวยการ</Text>

            <View style={styles.checkboxRow}>
              <View style={styles.checkboxSquare} />
              <Text style={styles.checkboxLabel}>ทราบ</Text>
            </View>

            <View style={styles.checkboxRow}>
              <View style={styles.checkboxSquare} />
              <Text style={styles.checkboxLabel}>
                มอบงานวิชาการติดตามและกำชับให้ดำเนินการแล้วเสร็จ
              </Text>
            </View>

            <View style={styles.checkboxRow}>
              <View style={styles.checkboxSquare} />
              <Text style={styles.checkboxLabel}>อื่นๆ .............................................................</Text>
            </View>

            <View style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={styles.signDots}>(ลงชื่อ) ............................................................</Text>
              <Text style={[styles.signDots, { marginTop: 2 }]}>
                ( {directorName ? directorName : '............................................................'} )
              </Text>
              <Text style={[styles.signDots, { marginTop: 1 }]}>
                {(directorRole || 'ผู้อำนวยการ').replace(/โรงเรียน/g, '') + cleanSchoolName}
              </Text>
              <Text style={[styles.signDots, { marginTop: 1 }]}>
                {displaySignDate}
              </Text>
            </View>
          </View>

          {/* Academic Head Signature (Right) */}
          <View style={styles.reporterBox}>
            <Text style={styles.signDots}>(ลงชื่อ) ............................................................ ผู้รายงาน</Text>
            <Text style={[styles.signDots, { marginTop: 3 }]}>
              ( {academicHeadName ? academicHeadName : '............................................................'} )
            </Text>
            <Text style={[styles.signDots, { marginTop: 1 }]}>
              ตำแหน่ง {academicHeadRole}
            </Text>
            <Text style={[styles.signDots, { marginTop: 1 }]}>
              {displaySignDate}
            </Text>
          </View>
        </View>

        {/* Page Number */}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `หน้าที่ ${toThaiDigits(pageNumber)} จาก ${toThaiDigits(totalPages)}`
          }
          fixed
        />
      </Page>
    </Document>
  );
};

export default PorBor5IncompleteMemoPdfDocument;
