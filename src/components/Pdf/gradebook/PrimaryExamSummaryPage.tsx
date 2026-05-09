import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { Student, GradeRecord } from './types';
import PdfPage from './PdfPage';

interface PrimaryExamSummaryPageProps {
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

const COL_WIDTHS = {
  NO: 20,
  ID: 45,
  NAME: 130,      // ชื่อ-สกุล
  SCORE_ITEM: 20, // คะแนนย่อยแต่ละช่อง
  SCORE_SUM: 20,  // ช่องรวมคะแนนเก็บ
  MIDTERM: 25,    // กลางภาค
  FINAL: 25,      // ปลายภาค
  TOTAL_SEM: 25,  // รวม 100
  GRADE: 25,      // เเกรด
  NOTE: 25,       // หมายเหตุ (ลดลงตามคำขอ)
};

const styles = StyleSheet.create({
  // --- Header Section ---
  topHeader: {
    textAlign: 'center',
    marginBottom: 5,
    paddingHorizontal: 10,
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
    minHeight: 22,
    overflow: 'hidden',
    flexGrow: 1,
  },

  // --- Cells ---
  cell: {
    borderRightWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
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
  subHeaderGroup: {
    flexDirection: 'column',
    borderRightWidth: 1,
    borderColor: '#000',
    height: '100%',
  },
  subHeaderTop: {
    height: 30,
    borderBottomWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  innerGroup: {
    flexDirection: 'column',
    borderColor: '#000',
  },
  innerGroupTitle: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 2,
  },
  innerGroupSlots: {
    flex: 1,
    flexDirection: 'row',
  },

  // --- Vertical Text ---
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

const PrimaryExamSummaryPage: React.FC<PrimaryExamSummaryPageProps> = ({
  academicYear,
  termToDisplay,
  currentCourse,
  studentChunk,
  preMidtermAssessments,
  postMidtermAssessments,
  midtermMax,
  finalMax,
  grades,
  formatPrefix,
  curriculumClassDisplay,
  curriculumRoomDisplay,
  schoolInfo,
  homeroomTeacher,
  courseTeacherName,
}) => {

  const preMidtermTotal = preMidtermAssessments.reduce((sum, a) => sum + (a.maxScore || 0), 0);
  const postMidtermTotal = postMidtermAssessments.reduce((sum, a) => sum + (a.maxScore || 0), 0);
  const totalFormativeMax = preMidtermTotal + postMidtermTotal;
  const grandTotalMax = totalFormativeMax + midtermMax + finalMax;

  const preWidth = 5 * COL_WIDTHS.SCORE_ITEM;
  const postWidth = 5 * COL_WIDTHS.SCORE_ITEM;
  const formativeSectionWidth = preWidth + postWidth + COL_WIDTHS.SCORE_SUM;

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

      <View style={styles.table}>
        <View style={styles.headerContainer}>
          <FullHeightHeader text="เลขที่" width={COL_WIDTHS.NO} vertical={true} />
          <FullHeightHeader text="เลขประจำตัว" width={COL_WIDTHS.ID} vertical={true} />
          <FullHeightHeader text="ชื่อ - สกุล" width={COL_WIDTHS.NAME} />

          <View style={{ width: formativeSectionWidth, flexDirection: 'column', height: '100%', borderColor: '#000', borderRightWidth: 1 }}>
            <View style={styles.subHeaderTop}>
              <Text style={[styles.cellText, { fontSize: 10 }]}>คะแนนระหว่างเรียน วิชา{currentCourse?.title || ''} (ภาคเรียนที่ {termToDisplay})</Text>
            </View>
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

          <VerticalHeader text="คะแนนกลางภาค" width={COL_WIDTHS.MIDTERM} max={midtermMax} />
          <VerticalHeader text="คะแนนปลายภาค" width={COL_WIDTHS.FINAL} max={finalMax} />
          <VerticalHeader text={`รวมภาคเรียนที่ ${termToDisplay}`} width={COL_WIDTHS.TOTAL_SEM} max={grandTotalMax} />
          <VerticalHeader text="ระดับผลการเรียน" width={COL_WIDTHS.GRADE} />
          <VerticalHeader text="หมายเหตุ" width={COL_WIDTHS.NOTE} />
        </View>

        {studentChunk.map((s) => {
          const preScore = preMidtermAssessments.reduce((sum, a) => sum + (grades[s.id]?.formativeDetails?.[a.id] || 0), 0);
          const postScore = postMidtermAssessments.reduce((sum, a) => sum + (grades[s.id]?.formativeDetails?.[a.id] || 0), 0);
          const totalFormative = preScore + postScore;

          return (
            <View key={s.id} style={styles.row}>
              <View style={[styles.cell, { width: COL_WIDTHS.NO }]}>
                <Text style={styles.cellText}>{s.studentNumber}</Text>
              </View>
              <View style={[styles.cell, { width: COL_WIDTHS.ID }]}>
                <Text style={styles.cellText}>{s.studentId}</Text>
              </View>
              <View style={[styles.cell, { width: COL_WIDTHS.NAME, alignItems: 'flex-start' }]}>
                <Text style={styles.cellTextLeft}>
                  {s.title ? formatPrefix(s.title) : ''}{s.firstName} {s.lastName}
                </Text>
              </View>

              {preSlots.map((_, i) => {
                const a = preMidtermAssessments[i];
                return (
                  <View key={`pre-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM }, !a ? styles.bgGray : {}]}>
                    <Text style={styles.cellText}>{a ? (grades[s.id]?.formativeDetails?.[a.id] ?? '') : ''}</Text>
                  </View>
                );
              })}
              {postSlots.map((_, i) => {
                const a = postMidtermAssessments[i];
                return (
                  <View key={`post-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM }, !a ? styles.bgGray : {}]}>
                    <Text style={styles.cellText}>{a ? (grades[s.id]?.formativeDetails?.[a.id] ?? '') : ''}</Text>
                  </View>
                );
              })}

              <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUM }]}>
                <Text style={styles.cellText}>{totalFormative}</Text>
              </View>
              <View style={[styles.cell, { width: COL_WIDTHS.MIDTERM }]}>
                <Text style={styles.cellText}>{grades[s.id]?.midterm ?? ''}</Text>
              </View>
              <View style={[styles.cell, { width: COL_WIDTHS.FINAL }]}>
                <Text style={styles.cellText}>{grades[s.id]?.final ?? ''}</Text>
              </View>
              <View style={[styles.cell, { width: COL_WIDTHS.TOTAL_SEM }]}>
                <Text style={styles.cellText}>{grades[s.id]?.total ?? ''}</Text>
              </View>
              <View style={[styles.cell, { width: COL_WIDTHS.GRADE }]}>
                <Text style={styles.cellText}>{grades[s.id]?.grade ?? ''}</Text>
              </View>
              <View style={[styles.cell, { width: COL_WIDTHS.NOTE }]}>
                <Text style={styles.cellText}></Text>
              </View>
            </View>
          );
        })}

        {Array.from({ length: Math.max(0, 25 - studentChunk.length) }).map((_, index) => (
          <View key={`empty-${index}`} style={styles.row}>
            <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text style={styles.cellText}></Text></View>
            <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text style={styles.cellText}></Text></View>
            <View style={[styles.cell, { width: COL_WIDTHS.NAME, alignItems: 'flex-start' }]}><Text style={styles.cellTextLeft}></Text></View>
            {preSlots.map((_, i) => (<View key={`empty-pre-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM }, !preMidtermAssessments[i] ? styles.bgGray : {}]} />))}
            {postSlots.map((_, i) => (<View key={`empty-post-${i}`} style={[styles.cell, { width: COL_WIDTHS.SCORE_ITEM }, !postMidtermAssessments[i] ? styles.bgGray : {}]} />))}
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

export default PrimaryExamSummaryPage;