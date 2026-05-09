import React from 'react';
import { Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { Student, GradeRecord } from './types';
import PdfPage from './PdfPage';

// อย่าลืม Register Font ให้เรียบร้อย
// Font.register({ family: 'TH Sarabun PSK', src: '...' });

interface SecondaryExamSummaryPageProps {
  academicYear: string;
  selectedClass: string;
  termToDisplay: string;
  CLASSES: Record<string, string>;
  FULL_CLASSES?: Record<string, string>;
  currentCourse: any;
  studentChunk: Student[];
  preMidtermAssessments: any[];
  postMidtermAssessments: any[];
  preMidtermTotal: number;
  postMidtermTotal: number;
  midtermMax: number;
  finalMax: number;
  grades: Record<string, GradeRecord>;
  formatPrefix: (prefix?: string) => string;
  selectedRoom?: string;
  curriculumClassDisplay: string;
  curriculumRoomDisplay: string;
  schoolInfo?: any;
  homeroomTeacher?: any;
  courseTeacherName?: string;
}

// 1. กำหนดความกว้างที่แน่นอน (หน่วยเป็น Point) เพื่อความแม่นยำสูงสุด
const COL_WIDTHS = {
  NO: 20,
  ID: 45,
  NAME: 130,      // ชื่อ-สกุล
  SCORE_ITEM: 20, // คะแนนย่อยแต่ละช่อง
  SCORE_SUM: 20,  // ช่องรวมคะแนนเก็บ
  MIDTERM: 25,    // กลางภาค
  FINAL: 25,      // ปลายภาค
  TOTAL_SEM: 25,  // รวม 100
  GRADE: 25,      // เกรด
  NOTE: 25,       // หมายเหตุ (ลดลงตามคำขอ)
};

const styles = StyleSheet.create({
  // --- Header Section ---
  topHeader: {
    textAlign: 'center',
    marginBottom: 5,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  subTitle: {
    fontSize: 11,
    marginTop: 2,
  },
  courseInfoLine: {
    flexDirection: 'row',
    justifyContent: 'center',
    fontSize: 11,
    gap: 15,
    marginTop: 2,
    fontWeight: 'bold',
  },
  pageNumber: {
    position: 'absolute',
    top: 0,
    right: 5,
    fontSize: 10,
  },
  bold: { fontWeight: 'bold' },

  // --- Table Structure ---
  table: {
    width: '100%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#000',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#000',
    alignItems: 'stretch',
    minHeight: 22, // ความสูงบรรทัดข้อมูล
    overflow: 'hidden',
    flexGrow: 1,
  },

  // --- Cells ---
  cell: {
    borderRightWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0, // ลด padding เพื่อให้คำนวณ width แม่นยำ
  },
  cellText: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 1,
  },
  cellTextLeft: {
    textAlign: 'left',
    fontSize: 11,
    paddingLeft: 4,
  },

  // --- Header Layout ---
  headerContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#000',
    height: 90, // ลดความสูงรวมลงตามการปรับชั้นกลาง
  },

  // กล่องสำหรับจัดกลุ่ม Header
  subHeaderGroup: {
    flexDirection: 'column',
    borderRightWidth: 1,
    borderColor: '#000',
    height: '100%',
  },

  // กล่องย่อยภายใน Header
  subHeaderTop: {
    height: 30,
    borderBottomWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  subHeaderMiddle: {
    height: 60,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#000',
  },
  subHeaderBottom: {
    flexDirection: 'row',
    flex: 1,
  },

  // แบ่งชั้น คะแนนก่อน/หลังกลางภาค
  innerGroup: {
    flexDirection: 'column',
    borderColor: '#000',
  },
  innerGroupTitle: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderRightWidth: 1, // เพิ่มเส้นขอบขวาให้หัวข้อ
    borderColor: '#000',
    paddingHorizontal: 2,
  },
  innerGroupSlots: {
    flex: 1,
    flexDirection: 'row',
  },

  // --- Vertical Text ---
  verticalCellWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  verticalTextContainer: {
    width: 100,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    transform: 'rotate(-90deg)',
  },

  bgGray: { backgroundColor: '#e0e0e0' },
  bgLightGray: { backgroundColor: '#f0f0f0' },
});

const SecondaryExamSummaryPage: React.FC<SecondaryExamSummaryPageProps> = ({
  academicYear,
  selectedClass,
  termToDisplay,
  CLASSES,
  FULL_CLASSES,
  currentCourse,
  studentChunk,
  preMidtermAssessments,
  postMidtermAssessments,
  preMidtermTotal,
  postMidtermTotal,
  midtermMax,
  finalMax,
  grades,
  formatPrefix,
  selectedRoom,
  curriculumClassDisplay,
  curriculumRoomDisplay,
  schoolInfo,
  homeroomTeacher,
  courseTeacherName,
}) => {

  const totalFormativeMax = preMidtermTotal + postMidtermTotal;
  const grandTotalMax = totalFormativeMax + midtermMax + finalMax;

  // 2. คำนวณความกว้างของส่วน "คะแนนเก็บ" (5 slots + 5 slots + 1 sum = 11 cols)
  const preWidth = 5 * COL_WIDTHS.SCORE_ITEM;
  const postWidth = 5 * COL_WIDTHS.SCORE_ITEM;
  const formativeSectionWidth = preWidth + postWidth + COL_WIDTHS.SCORE_SUM;

  // Helpers for fixed slots
  const preSlots = Array.from({ length: 5 });
  const postSlots = Array.from({ length: 5 });

  const VerticalHeader = ({ text, width, max, style = {} }: { text: string, width: number, max?: number, style?: any }) => (
    <View style={[styles.subHeaderGroup, { width, ...style }]}>
      <View style={{ height: 70, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderColor: '#000' }}>
        <View style={styles.verticalTextContainer}>
          <Text style={styles.cellText}>{text}</Text>
        </View>
      </View>
      <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={styles.cellText}>{max !== undefined ? max : ''}</Text>
      </View>
    </View>
  );

  const FullHeightHeader = ({ text, width, vertical = false }: { text: string, width: number, vertical?: boolean }) => (
    <View style={[styles.subHeaderGroup, { width, justifyContent: 'center', alignItems: 'center' }]}>
      {vertical ? (
        <View style={styles.verticalTextContainer}>
          <Text style={styles.cellText}>{text}</Text>
        </View>
      ) : (
        <Text style={styles.cellText}>{text}</Text>
      )}
    </View>
  );

  return (
    <PdfPage orientation="portrait">

      {/* Header หัวกระดาษ */}
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>สรุปผลการประเมินผลสัมฤทธิ์ทางการเรียน</Text>
        <Text style={styles.subTitle}>
          ชั้น {curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''} ภาคเรียนที่ {termToDisplay} ปีการศึกษา {academicYear}
        </Text>
        <View style={styles.courseInfoLine}>
          <Text><Text style={styles.bold}>รายวิชา</Text> {currentCourse?.title}  <Text style={styles.bold}>รหัสวิชา</Text> {currentCourse?.code}</Text>
          <Text><Text style={styles.bold}>ครูผู้สอน</Text> {courseTeacherName || '....................'}  <Text style={styles.bold}>ครูที่ปรึกษา</Text> {homeroomTeacher?.name?.split(' ').slice(-2).join(' ') || '....................'}</Text>
        </View>
      </View>

      {/* ตาราง */}
      <View style={styles.table}>

        {/* --- Table Header Row --- */}
        <View style={styles.headerContainer}>
          <FullHeightHeader text="เลขที่" width={COL_WIDTHS.NO} vertical={true} />
          <FullHeightHeader text="เลขประจำตัว" width={COL_WIDTHS.ID} vertical={true} />
          <FullHeightHeader text="ชื่อ - สกุล" width={COL_WIDTHS.NAME} />

          {/* Formative Scores Header Group */}
          <View style={{ width: formativeSectionWidth, flexDirection: 'column', height: '100%', borderColor: '#000', borderRightWidth: 1 }}>
            {/* ชั้นที่ 1: ชื่อวิชา */}
            <View style={styles.subHeaderTop}>
              <Text style={[styles.cellText, { fontSize: 10 }]}>คะแนนระหว่างเรียน วิชา{currentCourse?.title || ''} (ภาคเรียนที่ {termToDisplay})</Text>
            </View>

            {/* ชั้นที่ 2 & 3: แบ่งก่อน/หลังกลางภาค และช่องคะแนน */}
            <View style={{ flex: 1, flexDirection: 'row' }}>

              <View style={[styles.innerGroup, { width: preWidth }]}>
                <View style={styles.innerGroupTitle}>
                  <Text style={[styles.cellText, { fontSize: 10 }]}>คะแนนก่อนกลางภาค</Text>
                </View>
                <View style={styles.innerGroupSlots}>
                  {preSlots.map((_, i) => (
                    <View key={`pre-h-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM, borderRightWidth: 1, borderBottomWidth: 0 }, !preMidtermAssessments[i] ? styles.bgGray : {}]}>
                      <Text style={styles.cellText}>{preMidtermAssessments[i]?.maxScore || ''}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* คะแนนหลังกลางภาค (5 ช่อง) */}
              <View style={[styles.innerGroup, { width: postWidth }]}>
                <View style={styles.innerGroupTitle}>
                  <Text style={[styles.cellText, { fontSize: 10 }]}>คะแนนหลังกลางภาค</Text>
                </View>
                <View style={styles.innerGroupSlots}>
                  {postSlots.map((_, i) => (
                    <View key={`post-h-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM, borderRightWidth: 1, borderBottomWidth: 0 }, !postMidtermAssessments[i] ? styles.bgGray : {}]}>
                      <Text style={styles.cellText}>{postMidtermAssessments[i]?.maxScore || ''}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* ช่องรวมเก็บ (แนวนอน - Nest อยู่ในกลุ่มเดียวกัน) */}
              <View style={{ width: COL_WIDTHS.SCORE_SUM, flexDirection: 'column', borderColor: '#000' }}>
                <View style={[styles.innerGroupTitle, { borderRightWidth: 0 }]}>
                  <Text style={[styles.cellText, { fontSize: 10 }]}>รวม</Text>
                </View>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={styles.cellText}>{totalFormativeMax}</Text>
                </View>
              </View>

            </View>
          </View>

          {/* Right Columns (Vertical) */}
          <VerticalHeader text="คะแนนกลางภาค" width={COL_WIDTHS.MIDTERM} max={midtermMax} />
          <VerticalHeader text="คะแนนปลายภาค" width={COL_WIDTHS.FINAL} max={finalMax} />
          <VerticalHeader text={`รวมภาคเรียนที่ ${termToDisplay}`} width={COL_WIDTHS.TOTAL_SEM} max={grandTotalMax} />
          <VerticalHeader text="ระดับผลการเรียน" width={COL_WIDTHS.GRADE} />
          <VerticalHeader text="หมายเหตุ" width={COL_WIDTHS.NOTE} />
        </View>

        {/* --- Data Rows --- */}
        {studentChunk.map((s) => {
          const preFormativeScore = preMidtermAssessments.reduce((sum, a) => sum + (grades[s.id]?.formativeDetails?.[a.id] || 0), 0);
          const postFormativeScore = postMidtermAssessments.reduce((sum, a) => sum + (grades[s.id]?.formativeDetails?.[a.id] || 0), 0);
          const totalFormative = preFormativeScore + postFormativeScore;

          return (
            <View key={s.id} style={styles.row}>
              {/* 1. เลขที่ */}
              <View style={[styles.cell, { width: COL_WIDTHS.NO }]}>
                <Text style={styles.cellText}>{s.studentNumber}</Text>
              </View>
              {/* 2. รหัส */}
              <View style={[styles.cell, { width: COL_WIDTHS.ID }]}>
                <Text style={styles.cellText}>{s.studentId}</Text>
              </View>
              {/* 3. ชื่อ */}
              <View style={[styles.cell, { width: COL_WIDTHS.NAME, alignItems: 'flex-start' }]}>
                <Text style={styles.cellTextLeft}>
                  {s.title ? formatPrefix(s.title) : ''}{s.firstName} {s.lastName}
                </Text>
              </View>

              {/* 4. คะแนนก่อนกลางภาค (5 ช่อง) */}
              {preSlots.map((_, i) => {
                const a = preMidtermAssessments[i];
                return (
                  <View key={`pre-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM }, !a ? styles.bgGray : {}]}>
                    <Text style={styles.cellText}>
                      {a ? (grades[s.id]?.formativeDetails?.[a.id] ?? '') : ''}
                    </Text>
                  </View>
                );
              })}

              {/* 5. คะแนนหลังกลางภาค (5 ช่อง) */}
              {postSlots.map((_, i) => {
                const a = postMidtermAssessments[i];
                return (
                  <View key={`post-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM }, !a ? styles.bgGray : {}]}>
                    <Text style={styles.cellText}>
                      {a ? (grades[s.id]?.formativeDetails?.[a.id] ?? '') : ''}
                    </Text>
                  </View>
                );
              })}

              {/* 6. รวมเก็บ (พื้นหลังขาวปกติ) */}
              <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUM }]}>
                <Text style={styles.cellText}>{totalFormative}</Text>
              </View>

              {/* 7. กลางภาค */}
              <View style={[styles.cell, { width: COL_WIDTHS.MIDTERM }]}>
                <Text style={styles.cellText}>{grades[s.id]?.midterm ?? ''}</Text>
              </View>

              {/* 8. ปลายภาค */}
              <View style={[styles.cell, { width: COL_WIDTHS.FINAL }]}>
                <Text style={styles.cellText}>{grades[s.id]?.final ?? ''}</Text>
              </View>

              {/* 9. รวมทั้งเทอม */}
              <View style={[styles.cell, { width: COL_WIDTHS.TOTAL_SEM }]}>
                <Text style={styles.cellText}>{grades[s.id]?.total ?? ''}</Text>
              </View>

              {/* 10. เกรด */}
              <View style={[styles.cell, { width: COL_WIDTHS.GRADE }]}>
                <Text style={styles.cellText}>{grades[s.id]?.grade ?? ''}</Text>
              </View>

              {/* 11. หมายเหตุ */}
              <View style={[styles.cell, { width: COL_WIDTHS.NOTE }]}>
                <Text style={styles.cellText}></Text>
              </View>
            </View>
          );
        })}

        {/* --- Filler Rows --- */}
        {Array.from({ length: Math.max(0, 25 - studentChunk.length) }).map((_, index) => (
          <View key={`empty-${index}`} style={styles.row}>
            <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text style={styles.cellText}></Text></View>
            <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text style={styles.cellText}></Text></View>
            <View style={[styles.cell, { width: COL_WIDTHS.NAME, alignItems: 'flex-start' }]}><Text style={styles.cellTextLeft}></Text></View>

            {/* Empty formative scores */}
            {preSlots.map((_, i) => (
              <View key={`empty-pre-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM }, !preMidtermAssessments[i] ? styles.bgGray : {}]} />
            ))}
            {postSlots.map((_, i) => (
              <View key={`empty-post-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM }, !postMidtermAssessments[i] ? styles.bgGray : {}]} />
            ))}

            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUM }]} />
            <View style={[styles.cell, { width: COL_WIDTHS.MIDTERM }]} />
            <View style={[styles.cell, { width: COL_WIDTHS.FINAL }]} />
            <View style={[styles.cell, { width: COL_WIDTHS.TOTAL_SEM }]} />
            <View style={[styles.cell, { width: COL_WIDTHS.GRADE }]} />
            <View style={[styles.cell, { width: COL_WIDTHS.NOTE }]} />
          </View>
        ))}
      </View>
    </PdfPage >
  );
};

export default SecondaryExamSummaryPage;