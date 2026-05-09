import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { Student, AttendanceDay, StudentAttendanceSummary } from './types';
import PdfPage from './PdfPage';

// Interface Definition
interface AttendanceRecordPageProps {
  academicYear: string;
  selectedClass: string;
  CLASSES: Record<string, string>;
  FULL_CLASSES?: Record<string, string>;
  selectedRoom?: string;
  studentChunks: Student[][];
  formatPrefix: (prefix?: string) => string;
  totalCourseHours: number;
  studentAttendanceSummaries: Record<string, StudentAttendanceSummary>;
  attendancePages: any[];
  curriculumClassDisplay: string;
  curriculumRoomDisplay: string;
}
// กำหนดความกว้างคอลัมน์
const COL_WIDTHS = {
  NO: 18,
  ID: 40,
  NAME: 120,
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'TH Sarabun PSK',
    padding: '10mm 15mm 8mm 25mm',
    fontSize: 10,
  },
  // --- Header ---
  headerContainer: {
    marginBottom: 5,
    textAlign: 'center',
    height: 45,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  title: { fontSize: 16, fontWeight: 'bold' },
  subtitle: {
    fontSize: 11,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 2
  },
  pageNumber: { position: 'absolute', top: 0, right: 0, fontSize: 9 },
  bold: { fontWeight: 'bold' },

  // --- Table Structure ---
  table: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    flexGrow: 1,
  },
  tableRow: {
    flexDirection: 'row',
    width: '100%',
  },

  // --- Cells ---
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#000',
    borderStyle: 'solid',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 1,
    overflow: 'hidden',
  },

  // Header Data
  headerDataRow: { flex: 1, flexDirection: 'row' },

  // --- Vertical Text Logic (เลขที่, รหัส) ---
  verticalCell: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    overflow: 'hidden',
  },
  verticalTextWrapper: {
    width: 80,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    transform: 'rotate(-90deg)',
  },

  // Rows
  studentRow: { minHeight: 18, flexGrow: 1 }, // ให้แถวขยายเต็มพื้นที่
  headerHeight: { height: 100 },
  rowHeight: { height: 20 },
  holidayCell: { backgroundColor: '#ffcdd2' },
  termBreakCell: { backgroundColor: '#e0e0e0' }, // Grey for term breaks

  // --- NEW STYLES FOR SUMMARY PAGE ---
  summaryContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  summarySection: {
    flexDirection: 'column',
    borderRightWidth: 1,
    borderColor: '#000',
    textAlign: 'center',
  },
  summarySectionHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    padding: 2,
    borderBottomWidth: 1,
    borderColor: '#000',
    height: 40, // Height for term headers
    justifyContent: 'center',
    alignItems: 'center',
  },
  summarySubHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#000',
    height: 60, // Height for sub-headers like "มา", "ขาด"
  },
  summarySubHeaderCell: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: '#000',
    justifyContent: 'flex-end', // Align text to bottom
    alignItems: 'center',
    paddingBottom: 2,
  },
  summarySubHeaderLast: {
    borderRightWidth: 0,
  },
  summaryStudentCell: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: '#000',
  }
});

const AttendanceRecordPage: React.FC<AttendanceRecordPageProps> = ({
  academicYear,
  selectedClass,
  CLASSES,
  FULL_CLASSES,
  selectedRoom,
  curriculumClassDisplay,
  curriculumRoomDisplay,
  studentChunks,
  formatPrefix,
  totalCourseHours,
  studentAttendanceSummaries, // Destructure new prop
  attendancePages,
}) => {

  const HeaderInfo = ({ term }: { term: string }) => (
    <View style={styles.headerContainer}>
      <Text style={styles.title}>บันทึกเวลาเรียน</Text>
      <View style={styles.subtitle}>
        <Text>
          <Text style={styles.bold}>ชั้น </Text>
          <Text>{curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''}   </Text>
          <Text style={styles.bold}>ภาคเรียนที่ </Text>
          <Text>{term || '1'}   </Text>
          <Text style={styles.bold}>ปีการศึกษา </Text>
          <Text>{academicYear}</Text>
        </Text>
      </View>
    </View>
  );

  const termSummaryColumns = ['มา', 'ขาด', 'ลา', 'สาย', 'รวม'];

  return (
    <React.Fragment>
      {attendancePages.flatMap((page: any, pIdx: number) =>
        studentChunks.map((studentChunk: any[], sIdx: number) => {
          const isLastPage = pIdx === attendancePages.length - 1 && sIdx === studentChunks.length - 1;
          const term = page.term;

          if (isLastPage) {
            return (
              <PdfPage key={`attendance-page-${pIdx}-${sIdx}`} orientation="portrait" style={styles.page}>
                <HeaderInfo term={term} />
                <View style={styles.table}>
                  {/* --- Summary Header --- */}
                  <View style={[styles.tableRow, styles.headerHeight]}>
                    <View style={[styles.cell, { width: COL_WIDTHS.NO }, styles.verticalCell]}>
                      <View style={styles.verticalTextWrapper}><Text>เลขที่</Text></View>
                    </View>
                    <View style={[styles.cell, { width: COL_WIDTHS.ID }, styles.verticalCell]}>
                      <View style={styles.verticalTextWrapper}><Text>เลขประจำตัว</Text></View>
                    </View>
                    <View style={[styles.cell, { width: COL_WIDTHS.NAME }, { alignItems: 'center' }]}>
                      <Text>ชื่อ - นามสกุล</Text>
                    </View>

                    {/* Summary Columns Header */}
                    <View style={styles.summaryContainer}>
                      {/* Term 1 */}
                      <View style={[styles.summarySection, { flex: 5 }]}>
                        <View style={styles.summarySectionHeader}><Text>สรุปเวลาเรียนภาคเรียนที่ 1</Text></View>
                        <View style={styles.summarySubHeaderRow}>
                          {termSummaryColumns.map((col, i) => (
                            <View key={i} style={[styles.summarySubHeaderCell, i === termSummaryColumns.length - 1 ? styles.summarySubHeaderLast : {}]}>
                              <View style={styles.verticalTextWrapper}><Text>{col}</Text></View>
                            </View>
                          ))}
                        </View>
                      </View>
                      {/* Term 2 */}
                      <View style={[styles.summarySection, { flex: 5 }]}>
                        <View style={styles.summarySectionHeader}><Text>สรุปเวลาเรียนภาคเรียนที่ 2</Text></View>
                        <View style={styles.summarySubHeaderRow}>
                          {termSummaryColumns.map((col, i) => (
                            <View key={i} style={[styles.summarySubHeaderCell, i === termSummaryColumns.length - 1 ? styles.summarySubHeaderLast : {}]}>
                              <View style={styles.verticalTextWrapper}><Text>{col}</Text></View>
                            </View>
                          ))}
                        </View>
                      </View>
                      {/* Year Total */}
                      <View style={[styles.summarySection, { flex: 3, borderRightWidth: 0 }]}>
                        <View style={styles.summarySectionHeader}><Text>รวมเวลาเรียน</Text></View>
                        <View style={styles.summarySubHeaderRow}>
                          <View style={styles.summarySubHeaderCell}><View style={styles.verticalTextWrapper}><Text>มา</Text></View></View>
                          <View style={styles.summarySubHeaderCell}><View style={styles.verticalTextWrapper}><Text>ร้อยละ</Text></View></View>
                          <View style={[styles.summarySubHeaderCell, styles.summarySubHeaderLast]}><View style={styles.verticalTextWrapper}><Text>ผลการประเมิน</Text></View></View>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* --- Student Rows for Summary --- */}
                  {studentChunk.map((s, index) => (
                    <View key={s.id || index} style={[styles.tableRow, styles.studentRow]}>
                      <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>{s.studentNumber}</Text></View>
                      <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>{s.studentId}</Text></View>
                      <View style={[styles.cell, { width: COL_WIDTHS.NAME, alignItems: 'flex-start', paddingLeft: 3, justifyContent: 'center' }]}>
                        <Text>{`${s.title ? formatPrefix(s.title) : ''}${s.firstName} ${s.lastName}`}</Text>
                      </View>
                      <View style={styles.summaryContainer}>
                        {/* Term 1 Cells */}
                        {Array.from({ length: 5 }).map((_, i) => <View key={`t1-${i}`} style={[styles.cell, styles.summaryStudentCell, i === 4 ? styles.summarySubHeaderLast : {}]} />)}
                        {/* Term 2 Cells */}
                        {Array.from({ length: 5 }).map((_, i) => <View key={`t2-${i}`} style={[styles.cell, styles.summaryStudentCell, i === 4 ? styles.summarySubHeaderLast : {}]} />)}
                        {/* Total Cells */}
                        <View style={[styles.cell, styles.summaryStudentCell]} />
                        <View style={[styles.cell, styles.summaryStudentCell]} />
                        <View style={[styles.cell, styles.summaryStudentCell, styles.summarySubHeaderLast]} />
                      </View>
                    </View>
                  ))}

                  {/* --- Filler Rows --- */}
                  {Array.from({ length: Math.max(0, 25 - studentChunk.length) }).map((_, i) => (
                    <View key={`empty-${i}`} style={[styles.tableRow, styles.studentRow]}>
                      <View style={[styles.cell, { width: COL_WIDTHS.NO }]} />
                      <View style={[styles.cell, { width: COL_WIDTHS.ID }]} />
                      <View style={[styles.cell, { width: COL_WIDTHS.NAME }]} />
                      <View style={styles.summaryContainer}>
                        {Array.from({ length: 13 }).map((_, j) => <View key={`empty-cell-${j}`} style={[styles.cell, styles.summaryStudentCell, [4, 9, 12].includes(j) ? styles.summarySubHeaderLast : {}]} />)}
                      </View>
                    </View>
                  ))}
                </View>
              </PdfPage>
            );
          }

          return (
            <PdfPage key={`attendance-page-${pIdx}-${sIdx}`} orientation="portrait" style={styles.page}>
              <HeaderInfo term={term} />

              {/* Main Table */}
              <View style={styles.table}>

                {/* --- Header Rows --- */}
                <View style={[styles.tableRow, styles.headerHeight]}>

                  <View style={[styles.cell, { width: COL_WIDTHS.NO }, styles.verticalCell]}>
                    <View style={styles.verticalTextWrapper}><Text>เลขที่</Text></View>
                  </View>
                  <View style={[styles.cell, { width: COL_WIDTHS.ID }, styles.verticalCell]}>
                    <View style={styles.verticalTextWrapper}><Text>เลขประจำตัว</Text></View>
                  </View>
                  <View style={[styles.cell, { width: COL_WIDTHS.NAME }, { alignItems: 'center' }]}>
                    <Text>ชื่อ - นามสกุล</Text>
                  </View>

                  <View style={{ flex: 1, flexDirection: 'column' }}>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 32 }]}><Text>สัปดาห์</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.weeks.map((w: number, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{w}</Text></View>)}
                      </View>
                    </View>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 32 }]}><Text>เดือน</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.months.map((m: string, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{m}</Text></View>)}
                      </View>
                    </View>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 32 }]}><Text>วัน</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.days.map((d: AttendanceDay | null, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{d ? d.weekdayLabel : ''}</Text></View>)}
                      </View>
                    </View>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 32 }]}><Text>วันที่</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.days.map((d: AttendanceDay | null, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{d ? d.dayOfMonth : ''}</Text></View>)}
                      </View>
                    </View>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 32 }]}><Text>ชั่วโมงที่</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.days.map((d: AttendanceDay | null, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{d ? d.hourLabel : ''}</Text></View>)}
                      </View>
                    </View>
                  </View>
                </View>

                {/* --- Body Rows (Students) --- */}
                {studentChunk.map((s, index) => (
                  <View key={s.id || index} style={[styles.tableRow, styles.studentRow]}>
                    <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>{s.studentNumber}</Text></View>
                    <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>{s.studentId}</Text></View>
                    <View style={[styles.cell, { width: COL_WIDTHS.NAME, alignItems: 'flex-start', paddingLeft: 3, justifyContent: 'center' }]}>
                      <Text>{`${s.title ? formatPrefix(s.title) : ''}${s.firstName} ${s.lastName}`}</Text>
                    </View>

                    <View style={[styles.cell, { width: 32 }]} />

                    {/* Attendance Data Grid */}
                    <View style={styles.headerDataRow}>
                      {page.days.map((d: AttendanceDay | null, dIdx: number) => (
                        <View
                          key={dIdx}
                          style={[
                            styles.cell,
                            { flex: 1 },
                            d?.holidayName === 'ปิดภาคเรียน' ? styles.termBreakCell : (d?.isHoliday ? styles.holidayCell : {})
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ))}

                {/* --- Filler Rows (แถวว่าง) --- */}
                {Array.from({ length: Math.max(0, 25 - studentChunk.length) }).map((_, i) => (
                  <View key={`empty-${i}`} style={[styles.tableRow, styles.studentRow]}>
                    <View style={[styles.cell, { width: COL_WIDTHS.NO }]} />
                    <View style={[styles.cell, { width: COL_WIDTHS.ID }]} />
                    <View style={[styles.cell, { width: COL_WIDTHS.NAME }]} />
                    <View style={[styles.cell, { width: 32 }]} />

                    <View style={styles.headerDataRow}>
                      {page.days.map((d: AttendanceDay | null, dIdx: number) => (
                        <View
                          key={dIdx}
                          style={[
                            styles.cell,
                            { flex: 1 },
                            d?.holidayName === 'ปิดภาคเรียน' ? styles.termBreakCell : (d?.isHoliday ? styles.holidayCell : {})
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ))}

              </View>
            </PdfPage>
          );
        })
      )}
    </React.Fragment>
  );
};

export default AttendanceRecordPage;