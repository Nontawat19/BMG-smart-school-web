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
  studentChunks: Student[][];
  formatPrefix: (prefix?: string) => string;
  totalCourseHours: number;
  studentAttendanceSummaries: Record<string, StudentAttendanceSummary>;
  attendancePages: any[];
  studentCourseDailyStatus: Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave' | 'escape'>>;
  selectedRoom?: string;
  curriculumClassDisplay: string;
  curriculumRoomDisplay: string;
}

// Configuration
const COL_WIDTHS = {
  NO: 20,
  ID: 45,
  NAME: 90,
  SUMMARY: 45,
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'TH Sarabun PSK',
    padding: '10mm 10mm 10mm 10mm',
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
    marginTop: 2,
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
    position: 'relative', // สำคัญสำหรับ Overlay
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

  headerDataRow: { flex: 1, flexDirection: 'row' },

  verticalCell: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    overflow: 'hidden',
  },
  verticalTextWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    transform: 'rotate(-90deg)',
  },

  // Rows
  studentRow: { minHeight: 20, flexGrow: 1 },
  headerHeight: { height: 90 },
  rowHeight: { height: 20 },

  // Background Colors
  holidayCell: { backgroundColor: '#ffcdd2' },
  specialHolidayCell: { backgroundColor: '#ffcc80' },
  makeupDayCell: { backgroundColor: '#e3f2fd' },
  presentText: { color: 'black', fontWeight: 'bold' },
  absentText: { color: 'red' },
  lateText: { color: 'orange' },
  leaveText: { color: 'blue' },
  termBreakCell: { backgroundColor: '#e0e0e0' },

  // --- FIX: Styles สำหรับข้อความแนวตั้งใน Overlay ---
  rotatedTextContainer: {
    height: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    // ลบ overflow visible ออกเพื่อแก้ error typescript
  },
  rotatedText: {
    transform: 'rotate(-90deg)',
    width: 140, // กว้างกว่าความสูงคอลัมน์เพื่อให้ข้อความยาวๆ เป็นบรรทัดเดียว
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 'bold',
  }
});

const PrimaryAttendanceRecordPage: React.FC<AttendanceRecordPageProps> = ({
  academicYear,
  selectedClass,
  CLASSES,
  FULL_CLASSES,
  studentChunks,
  formatPrefix,
  totalCourseHours,
  studentAttendanceSummaries,
  attendancePages,
  studentCourseDailyStatus,
  selectedRoom,
  curriculumClassDisplay,
  curriculumRoomDisplay,
}) => {

  const HeaderInfo = ({ term, termTotalHours }: { term: string, termTotalHours?: number }) => (
    <View style={styles.headerContainer}>
      <Text style={styles.title}>บันทึกเวลาเรียน ภาคเรียนที่ {term || '1'}</Text>
      <View style={styles.subtitle}>
        <Text>
          <Text style={styles.bold}>ชั้น </Text>
          <Text>{curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''}</Text>
          <Text style={styles.bold}> ภาคเรียนที่ </Text>
          <Text>{term || '1'}</Text>
          <Text style={styles.bold}> ปีการศึกษา </Text>
          <Text>{academicYear}</Text>
        </Text>
      </View>
    </View>
  );

  // Helper function สำหรับตัดคำ (ใช้ ฯ แทน ...)
  const truncateText = (text: string | undefined | null, limit: number) => {
    if (!text) return '';
    // เปลี่ยนจาก ... เป็น ฯ
    return text.length > limit ? text.substring(0, limit) + 'ฯ' : text;
  };

  return (
    <React.Fragment>
      {attendancePages.flatMap((page: any, pIdx: number) =>
        studentChunks.map((studentChunk: any[], sIdx: number) => {
          const isSummaryPage = page.isSummaryPage;
          const isLastPageOfTerm = page.isLastPageOfTerm;
          const term = page.term;
          const termTotalHours = page.termTotalHours;

          return (
            <PdfPage key={`attendance-page-${pIdx}-${sIdx}`} orientation="portrait" style={styles.page}>
              <HeaderInfo term={term} termTotalHours={termTotalHours} />

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
                      <View style={[styles.cell, { width: 30 }]}><Text>สัปดาห์</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.weeks.map((w: number, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{w}</Text></View>)}
                      </View>
                    </View>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 30 }]}><Text>เดือน</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.months.map((m: string, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{m}</Text></View>)}
                      </View>
                    </View>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 30 }]}><Text>วัน</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.days.map((d: AttendanceDay | null, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{d ? d.weekdayLabel : ''}</Text></View>)}
                      </View>
                    </View>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 30 }]}><Text>วันที่</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.days.map((d: AttendanceDay | null, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{d ? d.dayOfMonth : ''}</Text></View>)}
                      </View>
                    </View>
                    <View style={[styles.tableRow, styles.rowHeight]}>
                      <View style={[styles.cell, { width: 30 }]}><Text>ชั่วโมงที่</Text></View>
                      <View style={styles.headerDataRow}>
                        {page.days.map((d: AttendanceDay | null, i: number) => <View key={i} style={[styles.cell, { flex: 1 }]}><Text>{d ? d.hourLabel : ''}</Text></View>)}
                      </View>
                    </View>
                  </View>

                  {/* Summary Column Header */}
                  {isLastPageOfTerm && (
                    <View style={{ width: COL_WIDTHS.SUMMARY, height: 90, flexDirection: 'column' }}>
                      <View style={[styles.cell, { width: '100%', height: 35, borderBottomWidth: 1, padding: 0, flexDirection: 'column' }]}>
                        <Text style={{ fontSize: 9 }}>เวลาเรียน</Text>
                        <Text style={{ fontSize: 9 }}>ทั้งหมด</Text>
                      </View>
                      <View style={[styles.cell, { width: '100%', height: 20, borderBottomWidth: 1 }]}>
                        <Text>{termTotalHours || 0} ชั่วโมง</Text>
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', height: 35 }}>
                        <View style={[styles.cell, { flex: 1, height: '100%', borderRightWidth: 1, borderBottomWidth: 1, padding: 0 }]}>
                          <View style={{ transform: 'rotate(-90deg)' }}><Text>มาเรียน</Text></View>
                        </View>
                        <View style={[styles.cell, { flex: 1, height: '100%', borderBottomWidth: 1, padding: 0 }]}>
                          <View style={{ transform: 'rotate(-90deg)' }}><Text>ร้อยละ</Text></View>
                        </View>
                      </View>
                    </View>
                  )}
                </View>

                {/* --- Body Rows (Students) --- */}
                {studentChunk.map((s, index) => {
                  let totalAttended = 0;
                  let percentage = 0;

                  if (isLastPageOfTerm && studentAttendanceSummaries[s.id || s.studentId]) {
                    const studentSummary = studentAttendanceSummaries[s.id || s.studentId];
                    const termKey = page.term === '2' ? 'term2' : 'term1';
                    const termSummary = studentSummary[termKey as 'term1' | 'term2'];
                    totalAttended = termSummary.present + termSummary.late + termSummary.leave;
                    percentage = termSummary.totalPossibleHours > 0 ? (totalAttended / termSummary.totalPossibleHours) * 100 : 0;
                  }

                  return (
                    <View key={s.id || index} style={[styles.tableRow, styles.studentRow]}>
                      <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>{s.studentNumber}</Text></View>
                      <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>{s.studentId}</Text></View>
                      <View style={[styles.cell, { width: COL_WIDTHS.NAME + 30, alignItems: 'flex-start', paddingLeft: 5, justifyContent: 'center' }]}>
                        <Text>
                          {(() => {
                            const title = s.title ? formatPrefix(s.title) : '';
                            const fullFirst = s.firstName || '';
                            if (title && fullFirst.startsWith(title)) {
                              return `${fullFirst} ${s.lastName || ''}`;
                            }
                            return `${title}${fullFirst} ${s.lastName || ''}`;
                          })()}
                        </Text>
                      </View>

                      {/* Attendance Data Grid */}
                      <View style={styles.headerDataRow}>
                        {page.days.map((d: AttendanceDay | null, dIdx: number) => {
                          let textStyle = {};
                          let attendanceMark = '';
                          let cellStyle = {};
                          if (d) {
                            // Determine attendance mark for the day
                            const status = studentCourseDailyStatus[s.id || s.studentId]?.[d.dateStr];
                            if (status) { // Only show mark if there was a record
                              switch (status) {
                                case 'present':
                                  attendanceMark = '/';
                                  textStyle = styles.presentText;
                                  break;
                                case 'absent':
                                  attendanceMark = 'ข';
                                  textStyle = styles.absentText;
                                  break;
                                case 'late':
                                  attendanceMark = 'ส';
                                  textStyle = styles.lateText;
                                  break;
                                case 'leave':
                                  attendanceMark = 'ล';
                                  textStyle = styles.leaveText;
                                  break;
                                case 'escape':
                                  // Truancy (หนีเรียน) is counted as absent everywhere else in the
                                  // gradebook (term summaries, attendance %) — mark it the same way
                                  // here so the printed grid and the summary numbers agree.
                                  attendanceMark = 'ข';
                                  textStyle = styles.absentText;
                                  break;
                                default: attendanceMark = '';
                                  break;
                              }
                            }

                            if (d.eventType === 'schoolDay') {
                              cellStyle = styles.makeupDayCell;
                            } else if (d.isHoliday && d.eventType !== 'schoolDay') {
                              if (d.holidayName === 'ปิดภาคเรียน' || d.holidayName === 'วันหยุดเสาร์-อาทิตย์') {
                                cellStyle = styles.termBreakCell;
                              } else if (d.eventType === 'specialHoliday') {
                                cellStyle = styles.specialHolidayCell;
                              } else {
                                cellStyle = styles.holidayCell;
                              }
                            }
                          }
                          return (
                            <View key={dIdx} style={[styles.cell, { flex: 1 }, cellStyle]}>
                              <Text style={textStyle}>{attendanceMark}</Text>
                            </View>
                          );
                        })}
                      </View>

                      {/* Summary Data Cells */}
                      {isLastPageOfTerm && (
                        <View style={{ width: COL_WIDTHS.SUMMARY, flexDirection: 'row' }}>
                          <View style={[styles.cell, { flex: 1, fontSize: 9 }]}>
                            <Text>{totalAttended}</Text>
                          </View>
                          <View style={[styles.cell, { flex: 1, fontSize: 9 }]}>
                            <Text>{Math.round(percentage)}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* --- Filler Rows --- */}
                {Array.from({ length: Math.max(0, 25 - studentChunk.length) }).map((_, i) => (
                  <View key={`empty-${i}`} style={[styles.tableRow, styles.studentRow]}>
                    <View style={[styles.cell, { width: COL_WIDTHS.NO }]} />
                    <View style={[styles.cell, { width: COL_WIDTHS.ID }]} />
                    <View style={[styles.cell, { width: COL_WIDTHS.NAME + 30 }]} />
                    <View style={styles.headerDataRow}>
                      {page.days.map((d: AttendanceDay | null, dIdx: number) => {
                        let cellStyle = {};
                        if (d) {
                          if (d.eventType === 'schoolDay') {
                            cellStyle = styles.makeupDayCell;
                          } else if (d.isHoliday && d.eventType !== 'schoolDay') {
                            if (d.holidayName === 'ปิดภาคเรียน' || d.holidayName === 'วันหยุดเสาร์-อาทิตย์') {
                              cellStyle = styles.termBreakCell;
                            } else if (d.eventType === 'specialHoliday') {
                              cellStyle = styles.specialHolidayCell;
                            } else {
                              cellStyle = styles.holidayCell;
                            }
                          }
                        }
                        return <View key={dIdx} style={[styles.cell, { flex: 1 }, cellStyle]} />;
                      })}
                    </View>
                    {isLastPageOfTerm && (
                      <View style={{ width: COL_WIDTHS.SUMMARY, flexDirection: 'row' }}>
                        <View style={[styles.cell, { flex: 1 }]} />
                        <View style={[styles.cell, { flex: 1 }]} />
                      </View>
                    )}
                  </View>
                ))}

                {/* ====================================================
                  FIXED: Holiday/Event Text Overlay (ข้อความแนวตั้ง) 
                  ====================================================
                */}
                <View style={{
                  position: 'absolute',
                  top: 90,
                  left: COL_WIDTHS.NO + COL_WIDTHS.ID + COL_WIDTHS.NAME + 30, // 30 is fixed width columns
                  right: isLastPageOfTerm ? COL_WIDTHS.SUMMARY : 0,
                  bottom: 0,
                  flexDirection: 'row',
                  overflow: 'hidden' // ป้องกันข้อความล้นออกนอกตาราง
                }}>
                  {page.days.map((d: AttendanceDay | null, dIdx: number) => (
                    <View key={`overlay-${dIdx}`} style={{ flex: 1, flexDirection: 'column', justifyContent: 'space-around', alignItems: 'center' }}>

                      {/* กรณีวันหยุด (Holidays) */}
                      {d?.isHoliday && !d.hourLabel && d.eventType !== 'schoolDay' && (
                        Array.from({ length: 5 }).map((_, i) => (
                          <View key={i} style={styles.rotatedTextContainer}>
                            <Text
                              style={[styles.rotatedText, {
                                color: d.holidayName === 'ปิดภาคเรียน' || d.holidayName === 'วันหยุดเสาร์-อาทิตย์' ? '#555' : (d.eventType === 'specialHoliday' ? '#c85a00' : '#b71c1c'),
                                opacity: 0.7,
                              }]}
                            >
                              {truncateText(d.holidayName, 25)}
                            </Text>
                          </View>
                        ))
                      )}

                      {/* กรณีสอนชดเชย (Makeup Days) */}
                      {d?.eventType === 'schoolDay' && (
                        Array.from({ length: 5 }).map((_, i) => (
                          <View key={i} style={styles.rotatedTextContainer}>
                            <Text style={[styles.rotatedText, { color: '#1e88e5', opacity: 0.5 }]}>
                              {truncateText(d.holidayName || 'สอนชดเชย', 25)}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  ))}
                </View>

              </View>
            </PdfPage>
          );
        })
      )}
    </React.Fragment>
  );
};

export default PrimaryAttendanceRecordPage;