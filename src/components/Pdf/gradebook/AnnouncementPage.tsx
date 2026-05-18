import React from 'react';
import { Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Student, GradeRecord } from './types';
import PdfPage from './PdfPage';

// ==========================================
// 1. Interface
// ==========================================
export interface AnnouncementPageProps {
  schoolInfo: any;
  academicYear: string;
  termToDisplay: string;
  selectedClass: string;
  FULL_CLASSES: Record<string, string>;
  currentCourse: any;
  courseTeacherName: string;
  homeroomTeacher: any;
  announcementChunk: Student[];
  grades: Record<string, GradeRecord>;
  getRWSummary: (studentId: string) => { level: number };
  getOverallQuality: (studentId: string) => number | null;
  formatPrefix: (prefix?: string) => string;
  isLastPage: boolean;
  selectedRoom?: string;
  curriculumClassDisplay: string;
  curriculumRoomDisplay: string;
}

// ==========================================
// 2. Styles
// ==========================================
const styles = StyleSheet.create({
  // --- Header Layout ---
  headerContainer: {
    flexDirection: 'row',
    marginBottom: 5,
    minHeight: 80,
    alignItems: 'flex-start',
    paddingTop: 5,
  },
  logoContainer: {
    width: 65,
    height: 65,
    marginRight: 10,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 5,
  },
  logo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  headerTextColumn: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    textAlign: 'center',
  },
  headerLineTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    lineHeight: 1.2,
  },
  headerLineSubtitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    lineHeight: 1.2,
  },
  headerLineDetail: {
    fontSize: 11,
    marginBottom: 4,
    lineHeight: 1.3,
  },
  boldText: { fontWeight: 'bold' },

  // --- Main Layout (Student Table) ---
  contentContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 2 },
  column: { width: '49.5%' },

  table: { width: '100%', borderTop: '1px solid black', borderLeft: '1px solid black' },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid black', height: 14, alignItems: 'center' },

  // Header Table Height (90 is optimal for vertical text)
  tableHeaderGroup: {
    flexDirection: 'row',
    borderBottom: '1px solid black',
    backgroundColor: '#f0f0f0',
    height: 90
  },

  cell: { borderRight: '1px solid black', textAlign: 'center', justifyContent: 'center', height: '100%', fontSize: 9, padding: 0.5 },

  // Column Widths
  colNo: { width: '8%' },
  colId: { width: '15%' },
  colName: { width: '37%', textAlign: 'left', paddingLeft: 4, justifyContent: 'center' },

  colScore: { width: '10%' },
  colGrade: { width: '10%' },
  colRW: { width: '10%' },
  colAttr: { width: '10%' },

  verticalCellWrapper: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden', padding: 0 },

  verticalText: {
    transform: 'rotate(-90deg)',
    width: 90,
    textAlign: 'center',
    fontSize: 10,
  },

  // --- Footer Layout ---
  footerContainer: {
    flexDirection: 'row',
    marginTop: 5,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  footerLeft: { width: '40%' },
  footerRight: {
    width: '58%',
    alignItems: 'flex-end'
  },
  summaryContentWrapper: {
    width: '75%',
    flexDirection: 'column',
  },

  // Grade Summary Table
  ftTable: { width: '100%', borderTop: '1px solid black', borderLeft: '1px solid black' },
  ftRow: { flexDirection: 'row', borderBottom: '1px solid black', height: 14.5, alignItems: 'center' },
  ftCell: { borderRight: '1px solid black', textAlign: 'center', justifyContent: 'center', height: '100%', fontSize: 10 },
  ftCellLeft: { borderRight: '1px solid black', textAlign: 'left', paddingLeft: 5, justifyContent: 'center', height: '100%', fontSize: 10 },

  // Signature Section
  signatureArea: {
    marginTop: 10,
    width: '100%',
    paddingLeft: 0,
  },
  signatureRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  sigLabel: {
    textAlign: 'left',
    width: 30,
    marginRight: 2,
    fontSize: 11,
  },
  sigLine: { width: 100, borderBottom: '1px dotted black', marginBottom: 3 },
  sigPosition: { textAlign: 'left', marginLeft: 5, fontSize: 11 },

  // --- Evaluation Table Styles ---
  evalTableWrapper: {
    width: '100%',
    borderTop: '1px solid black',
    borderLeft: '1px solid black',
    borderRight: '1px solid black',
    borderBottom: '1px solid black',
    marginBottom: 5,
  },
  evalHeaderRow: { flexDirection: 'row', borderBottom: '1px solid black', height: 35 },
  evalLeftHeader: { width: '20%', borderRight: '1px solid black', justifyContent: 'center', alignItems: 'center', padding: 2, backgroundColor: '#fff' },
  evalRightHeaderContainer: { flex: 1, flexDirection: 'column' },
  evalTitleBox: { flex: 1, borderBottom: '1px solid black', justifyContent: 'center', alignItems: 'center', padding: 2 },
  evalLevelBoxContainer: { flex: 1, flexDirection: 'row' },
  evalLevelBox: { flex: 1, borderRight: '1px solid black', justifyContent: 'center', alignItems: 'center', fontSize: 9 },
  evalLastLevelBox: { flex: 1, borderRight: '0px', justifyContent: 'center', alignItems: 'center', fontSize: 9 },
  evalDataRow: { flexDirection: 'row', height: 20 },
  evalDataCellLeft: { width: '20%', borderRight: '1px solid black', justifyContent: 'center', alignItems: 'center', fontSize: 10 },
  evalDataCell: { flex: 1, borderRight: '1px solid black', justifyContent: 'center', alignItems: 'center', fontSize: 10 },
  evalDataCellLast: { flex: 1, borderRight: '0px', justifyContent: 'center', alignItems: 'center', fontSize: 10 },
});

// ==========================================
// 3. Main Component
// ==========================================
const AnnouncementPage: React.FC<AnnouncementPageProps> = ({
  schoolInfo,
  academicYear,
  termToDisplay,
  selectedClass,
  FULL_CLASSES,
  currentCourse,
  courseTeacherName,
  homeroomTeacher,
  announcementChunk,
  grades,
  getRWSummary,
  getOverallQuality,
  formatPrefix,
  isLastPage,
  selectedRoom,
  curriculumClassDisplay,
  curriculumRoomDisplay,
}) => {

  const gradeOrder = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'ร', 'มส'];
  const gradeCounts: Record<string, number> = { '4': 0, '3.5': 0, '3': 0, '2.5': 0, '2': 0, '1.5': 0, '1': 0, '0': 0, 'ร': 0, 'มส': 0 };
  let totalStudents = 0;
  const rwCounts: any = { 3: 0, 2: 0, 1: 0, 0: 0 };
  const attrCounts: any = { 3: 0, 2: 0, 1: 0, 0: 0 };

  announcementChunk.forEach(student => {
    const g = grades[student.id]?.grade;
    if (g && gradeCounts.hasOwnProperty(g)) gradeCounts[g]++;
    const rw = getRWSummary(student.id).level;
    if (rw !== undefined && rw !== null) rwCounts[rw] = (rwCounts[rw] || 0) + 1;
    const attr = getOverallQuality(student.id);
    if (attr !== undefined && attr !== null) attrCounts[attr] = (attrCounts[attr] || 0) + 1;
    totalStudents++;
  });

  const ROWS_PER_COL = 25;

  const className = FULL_CLASSES[selectedClass] || selectedClass;
  const isPrimary = className.includes('ประถม') || className.startsWith('ป.');

  const RenderEvaluationTable = ({ title, counts }: { title: string, counts: any }) => (
    <View style={styles.evalTableWrapper}>
      <View style={styles.evalHeaderRow}>
        <View style={styles.evalLeftHeader}>
          <Text style={[styles.boldText, { fontSize: 10 }]}>จำนวน</Text>
          <Text style={[styles.boldText, { fontSize: 10 }]}>นักเรียน</Text>
        </View>
        <View style={styles.evalRightHeaderContainer}>
          <View style={styles.evalTitleBox}>
            <Text style={[styles.boldText, { fontSize: 9 }]}>{title}</Text>
          </View>
          <View style={styles.evalLevelBoxContainer}>
            <View style={styles.evalLevelBox}><Text>3 (ดีเยี่ยม)</Text></View>
            <View style={styles.evalLevelBox}><Text>2 (ดี)</Text></View>
            <View style={styles.evalLevelBox}><Text>1 (ผ่าน)</Text></View>
            <View style={styles.evalLastLevelBox}><Text>0 (ไม่ผ่าน)</Text></View>
          </View>
        </View>
      </View>
      <View style={styles.evalDataRow}>
        <View style={styles.evalDataCellLeft}><Text>{totalStudents}</Text></View>
        <View style={styles.evalDataCell}><Text>{counts[3] || ''}</Text></View>
        <View style={styles.evalDataCell}><Text>{counts[2] || ''}</Text></View>
        <View style={styles.evalDataCell}><Text>{counts[1] || ''}</Text></View>
        <View style={styles.evalDataCellLast}><Text>{counts[0] || ''}</Text></View>
      </View>
    </View>
  );

  return (
    <PdfPage orientation="portrait">
      <View style={styles.headerContainer}>
        <View style={styles.logoContainer}>
          {schoolInfo?.logoUrl ? <Image src={schoolInfo.logoUrl} style={styles.logo} /> : null}
        </View>
        <View style={styles.headerTextColumn}>
          <Text style={styles.headerLineTitle}>
            แบบประกาศผลสอบ{schoolInfo?.schoolName?.startsWith('โรงเรียน') ? '' : 'โรงเรียน'}{schoolInfo?.schoolName || '................................'}
          </Text>

          <Text style={styles.headerLineSubtitle}>
            <Text style={styles.boldText}>ชั้น</Text> {curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''}
            {!isPrimary && (
              <Text>
                <Text style={styles.boldText}> ภาคเรียนที่</Text> {termToDisplay}
              </Text>
            )}
            <Text style={styles.boldText}> ปีการศึกษา</Text> {academicYear}
          </Text>

          <Text style={styles.headerLineDetail}>
            <Text>
<<<<<<< HEAD
              <Text style={styles.boldText}>กลุ่มสาระฯ</Text> {currentCourse?.subjectGroup || currentCourse?.learningArea || '...'}
=======
              <Text style={styles.boldText}>กลุ่มสาระฯ</Text> {currentCourse?.subjectGroup || '...'}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
              <Text style={styles.boldText}> รายวิชา</Text> {currentCourse?.title}
              <Text style={styles.boldText}> รหัสวิชา</Text> {currentCourse?.code}
              <Text style={styles.boldText}> เวลาเรียน</Text> {currentCourse?.hoursPerWeek} ชม./สัปดาห์
              <Text style={styles.boldText}> จำนวน</Text> {(currentCourse?.hoursPerWeek || 0) / 2} หน่วยกิต
            </Text>
          </Text>

          <Text style={styles.headerLineDetail}>
            <Text>
              <Text style={styles.boldText}>ครูผู้สอน</Text> {courseTeacherName}
              <Text style={styles.boldText}>      ครูที่ปรึกษา</Text> {homeroomTeacher?.name || '...........................................'}
            </Text>
          </Text>
        </View>
      </View>

      <View style={styles.contentContainer}>
        {[0, 1].map(colIndex => {
          const startIdx = colIndex * ROWS_PER_COL;
          const endIdx = startIdx + ROWS_PER_COL;
          const columnStudents = announcementChunk ? announcementChunk.slice(startIdx, endIdx) : [];
          return (
            <View key={colIndex} style={styles.column}>
              <View style={styles.table}>
                <View style={styles.tableHeaderGroup}>
                  <View style={[styles.cell, styles.colNo, styles.verticalCellWrapper]}><Text style={styles.verticalText}>เลขที่</Text></View>
                  <View style={[styles.cell, styles.colId, styles.verticalCellWrapper]}><Text style={styles.verticalText}>เลขประจำตัว</Text></View>

                  <View style={[styles.cell, styles.colName, { alignItems: 'center', justifyContent: 'center', textAlign: 'center' }]}>
                    <Text>ชื่อ - สกุล</Text>
                  </View>

                  <View style={[styles.cell, { width: '20%', padding: 0, flexDirection: 'column' }]}>
                    <View style={{ height: 25, borderBottom: '1px solid black', width: '100%', justifyContent: 'center', alignItems: 'center' }}><Text>ผลการเรียน</Text></View>
                    <View style={{ flex: 1, flexDirection: 'row', width: '100%' }}>
                      <View style={[styles.cell, { width: '50%', borderRight: '1px solid black', borderBottom: 0, padding: 0 }, styles.verticalCellWrapper]}><Text style={styles.verticalText}>คะแนน</Text></View>
                      <View style={[styles.cell, { width: '50%', borderRight: 0, borderBottom: 0, padding: 0 }, styles.verticalCellWrapper]}><Text style={styles.verticalText}>ระดับผลการเรียน</Text></View>
                    </View>
                  </View>
                  <View style={[styles.cell, { width: '20%', padding: 0, flexDirection: 'column' }]}>
                    <View style={{ height: 25, borderBottom: '1px solid black', width: '100%', justifyContent: 'center', alignItems: 'center' }}><Text>การประเมิน</Text></View>
                    <View style={{ flex: 1, flexDirection: 'row', width: '100%' }}>
                      <View style={[styles.cell, { width: '50%', borderRight: '1px solid black', borderBottom: 0, padding: 0 }, styles.verticalCellWrapper]}><Text style={styles.verticalText}>อ่าน คิด วิเคราะห์</Text></View>
                      <View style={[styles.cell, { width: '50%', borderRight: 0, borderBottom: 0, padding: 0 }, styles.verticalCellWrapper]}><Text style={styles.verticalText}>คุณลักษณะ</Text></View>
                    </View>
                  </View>
                </View>
                {Array.from({ length: ROWS_PER_COL }).map((_, i) => {
                  const student = columnStudents[i];
                  if (student) {
                    const gradeData = grades[student.id];
                    const fullName = `${student.title ? formatPrefix(student.title) : ''}${student.firstName || ''} ${student.lastName || ''}`;
                    return (
                      <View key={student.id} style={styles.tableRow}>
                        <View style={[styles.cell, styles.colNo]}><Text>{student.studentNumber}</Text></View>
                        <View style={[styles.cell, styles.colId]}><Text>{student.studentId}</Text></View>
                        <View style={[styles.cell, styles.colName]}>
                          <Text>{fullName}</Text>
                        </View>
                        <View style={[styles.cell, styles.colScore]}><Text>{gradeData?.total || ''}</Text></View>
                        <View style={[styles.cell, styles.colGrade, styles.boldText]}><Text>{gradeData?.grade || ''}</Text></View>
                        <View style={[styles.cell, styles.colRW]}><Text>{getRWSummary(student.id).level || ''}</Text></View>
                        <View style={[styles.cell, styles.colAttr]}><Text>{getOverallQuality(student.id) || ''}</Text></View>
                      </View>
                    );
                  } else {
                    return (
                      <View key={`empty-${colIndex}-${i}`} style={styles.tableRow}>
                        <View style={[styles.cell, styles.colNo]}><Text> </Text></View>
                        <View style={[styles.cell, styles.colId]}><Text> </Text></View>
                        <View style={[styles.cell, styles.colName]}><Text> </Text></View>
                        <View style={[styles.cell, styles.colScore]}><Text> </Text></View>
                        <View style={[styles.cell, styles.colGrade]}><Text> </Text></View>
                        <View style={[styles.cell, styles.colRW]}><Text> </Text></View>
                        <View style={[styles.cell, styles.colAttr]}><Text> </Text></View>
                      </View>
                    );
                  }
                })}
              </View>
            </View>
          );
        })}
      </View>

      {isLastPage && (
        <View style={styles.footerContainer} wrap={false}>
          <View style={styles.footerLeft}>
            <View style={styles.ftTable}>
              <View style={[styles.ftRow, { backgroundColor: '#f0f0f0', height: 20 }]}>
                <View style={[styles.ftCell, { flex: 1, fontWeight: 'bold' }]}><Text style={styles.boldText}>สรุปผลการเรียน</Text></View>
              </View>
              {gradeOrder.map((g) => (
                <View key={g} style={styles.ftRow}>
                  <View style={[styles.ftCellLeft, { width: '55%' }]}><Text>จำนวนนักเรียนที่ได้ผลการเรียน</Text></View>
                  <View style={[styles.ftCell, { width: '15%' }]}><Text>{g}</Text></View>
                  <View style={[styles.ftCell, { width: '15%' }]}><Text>{gradeCounts[g] && gradeCounts[g] > 0 ? gradeCounts[g] : ''}</Text></View>
                  <View style={[styles.ftCell, { width: '15%' }]}><Text>คน</Text></View>
                </View>
              ))}
              <View style={styles.ftRow}>
                <View style={[styles.ftCell, { width: '70%', fontWeight: 'bold' }]}><Text style={styles.boldText}>รวมทั้งเรียนทั้งสิ้น</Text></View>
                <View style={[styles.ftCell, { width: '15%', fontWeight: 'bold' }]}><Text style={styles.boldText}>{totalStudents}</Text></View>
                <View style={[styles.ftCell, { width: '15%' }]}><Text>คน</Text></View>
              </View>
            </View>
          </View>

          <View style={styles.footerRight}>
            <View style={styles.summaryContentWrapper}>
              <RenderEvaluationTable
                title="สรุปผลการประเมินการอ่าน คิด วิเคราะห์"
                counts={rwCounts}
              />
              <RenderEvaluationTable
                title="สรุปผลการประเมินคุณลักษณะที่พึงประสงค์"
                counts={attrCounts}
              />
              <View style={styles.signatureArea}>
                {[
                  { label: 'ครูผู้สอน', name: '' },
                  { label: 'หัวหน้ากลุ่มสาระการเรียนรู้', name: '' },
                  { label: 'หัวหน้าฝ่ายวิชาการ', name: '' },
                  { label: 'รองผู้อำนวยการสถานศึกษา', name: '' },
                  { label: 'ผู้อำนวยการสถานศึกษา', name: '' },
                ].map((sig, idx) => (
                  <View key={idx} style={styles.signatureRow}>
                    <Text style={styles.sigLabel}>ลงชื่อ</Text>
                    <View style={styles.sigLine} />
                    <Text style={styles.sigPosition}>{sig.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}
    </PdfPage>
  );
};

<<<<<<< HEAD
export default AnnouncementPage;
=======
export default AnnouncementPage;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
