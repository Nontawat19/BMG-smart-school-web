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
  totalCourseHours: number; // จำนวนชั่วโมงเต็ม (เช่น 60)
  studentAttendanceSummaries: Record<string, StudentAttendanceSummary>; // ข้อมูลสรุปเวลาเรียน
  attendancePages: any[]; // ข้อมูลการแบ่งหน้า
  studentCourseDailyStatus: Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave' | 'escape'>>;
  selectedRoom?: string;
  curriculumClassDisplay: string;
  curriculumRoomDisplay: string;
}

// กำหนดความกว้างคอลัมน์ (ปรับให้เหมาะสมกับ A4)
const COL_WIDTHS = {
  NO: 18,
  ID: 40,
  NAME: 75,
  SUMMARY: 45, // ความกว้างส่วนสรุป (มาเรียน + ร้อยละ)
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'TH Sarabun PSK',
    padding: '10mm 15mm 20mm 25mm', // ปรับขอบล่างเป็น 2 เซนติเมตร
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
    position: 'relative', // สำคัญสำหรับ Overlay
  },
  tableRow: {
    flexDirection: 'row',
    width: '100%',
  },

  // --- Cells ---
  cell: {
    borderRightWidth: 1, // เส้นขวาต้องมีเสมอ
    borderBottomWidth: 1, // เส้นล่างต้องมีเสมอ
    borderColor: '#000',
    borderStyle: 'solid',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 1,
    overflow: 'hidden',
  },

  // Header Data
  headerDataRow: { flex: 1, flexDirection: 'row' },

  // --- Vertical Text Logic ---
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
  studentRow: { minHeight: 20, flexGrow: 1 },
  headerHeight: { height: 100 }, // ความสูงส่วนหัวรวม 5 แถว x 20px
  rowHeight: { height: 20 },

  // Events/Holidays Colors
  holidayCell: { backgroundColor: '#ffcdd2' },         // แดงอ่อน
  specialHolidayCell: { backgroundColor: '#ffcc80' },  // ส้มอ่อน
  makeupDayCell: { backgroundColor: '#e3f2fd' },       // ฟ้าอ่อน
  presentText: { color: 'black', fontWeight: 'bold', fontSize: 12 },
  absentText: { color: 'red', fontWeight: 'bold', fontSize: 12 },
  lateText: { color: 'orange', fontWeight: 'bold', fontSize: 12 },
  leaveText: { color: 'blue', fontWeight: 'bold', fontSize: 12 },
  termBreakCell: { backgroundColor: '#e0e0e0' },       // เทาอ่อน

  // --- FIX: Styles สำหรับข้อความแนวตั้งใน Overlay (เหมือนของประถม) ---
  rotatedTextContainer: {
    height: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotatedText: {
    transform: 'rotate(-90deg)',
    width: 140, // กว้างกว่าความสูงคอลัมน์เพื่อให้ข้อความยาวๆ เป็นบรรทัดเดียว
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 'bold',
  }
});

const SecondaryAttendanceRecordPage: React.FC<AttendanceRecordPageProps> = ({
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

  const HeaderInfo = ({ term }: { term: string }) => (
    <View style={styles.headerContainer}>
      <Text style={styles.title}>บันทึกเวลาเรียน ภาคเรียนที่ {term || '1'}</Text>
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

  // Helper function สำหรับตัดคำ (ใช้ ฯ แทน ...)
  const truncateText = (text: string | undefined | null, limit: number) => {
    if (!text) return '';
    return text.length > limit ? text.substring(0, limit) + 'ฯ' : text;
  };

  return (
    <React.Fragment>
      {attendancePages.flatMap((page: any, pIdx: number) => {
        const isLastPageOfTerm = page.isLastPageOfTerm;

        return studentChunks.map((studentChunk: any[], sIdx: number) => {
          const term = page.term;
          const termTotalHours = page.termTotalHours;

          return (
            <PdfPage key={`attendance-page-${pIdx}-${sIdx}`} orientation="portrait" style={styles.page}>
              <HeaderInfo term={term} />

              {/* Main Table */}
              <View style={styles.table}>

                {/* --- Header Rows --- */}
                <View style={[styles.tableRow, styles.headerHeight]}>

                  {/* 1. คอลัมน์ซ้ายคงที่ (เลขที่, รหัส, ชื่อ) */}
                  <View style={[styles.cell, { width: COL_WIDTHS.NO }, styles.verticalCell]}>
                    <View style={styles.verticalTextWrapper}><Text>เลขที่</Text></View>
                  </View>
                  <View style={[styles.cell, { width: COL_WIDTHS.ID }, styles.verticalCell]}>
                    <View style={styles.verticalTextWrapper}><Text>เลขประจำตัว</Text></View>
                  </View>
                  <View style={[styles.cell, { width: COL_WIDTHS.NAME }, { alignItems: 'center' }]}>
                    <Text>ชื่อ - นามสกุล</Text>
                  </View>

                  {/* 2. คอลัมน์กลาง (สัปดาห์/เดือน/วัน...) */}
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

                  {/* 3. คอลัมน์ขวาสรุป */}
                  {isLastPageOfTerm && (
                    <View style={{ width: COL_WIDTHS.SUMMARY, height: 100, flexDirection: 'column' }}>

                      {/* ส่วนที่ 1: ผสานแถวสัปดาห์และเดือน (สูง 40px) */}
                      <View style={[styles.cell, { width: '100%', height: 40, borderBottomWidth: 1, padding: 0, flexDirection: 'column' }]}>
                        <Text style={{ fontSize: 9 }}>เวลาเรียน</Text>
                        <Text style={{ fontSize: 9 }}>ทั้งหมด</Text>
                      </View>

                      {/* ส่วนที่ 2: ชั่วโมง (อยู่ในแถวของ "วัน") (สูง 20px) */}
                      <View style={[styles.cell, { width: '100%', height: 20, borderBottomWidth: 1 }]}>
                        <Text>{termTotalHours || 0} ชั่วโมง</Text>
                      </View>

                      {/* ส่วนที่ 3: ผสานแถววันที่และชั่วโมง (สูง 40px) สำหรับหัวข้อแนวตั้ง */}
                      <View style={{ flex: 1, flexDirection: 'row', height: 40 }}>
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
                  let percentage = "0";

                  if (isLastPageOfTerm && studentAttendanceSummaries[s.id || s.studentId]) {
                    const studentSummary = studentAttendanceSummaries[s.id || s.studentId];
                    const termKey = page.term === '2' ? 'term2' : 'term1';
                    const termSummary = studentSummary[termKey as 'term1' | 'term2'];
                    totalAttended = termSummary.present + termSummary.late + termSummary.leave;
                    percentage = termSummary.totalPossibleHours > 0 ? ((totalAttended / termSummary.totalPossibleHours) * 100).toFixed(0) : "0";
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
                            // ถ้าชื่อแรกเริ่มด้วยคำนำหน้าอยู่แล้ว ไม่ต้องเติมซ้ำ
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
                          // Logic สีพื้นหลัง
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
                                case 'absent': attendanceMark = 'ข';
                                  textStyle = styles.absentText;
                                  break;
                                case 'late': attendanceMark = 'ส';
                                  textStyle = styles.lateText;
                                  break;
                                case 'leave': attendanceMark = 'ล';
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
                            <View
                              key={dIdx}
                              style={[styles.cell, { flex: 1 }, cellStyle]} // Apply background style first
                            ><Text style={textStyle}>{attendanceMark}</Text>
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
                            <Text>{percentage}</Text>
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
                    ใช้เทคนิคเดียวกับของประถม
                    ====================================================
                */}
                <View style={{
                  position: 'absolute',
                  top: 100, // เริ่มใต้ Header (100px)
                  left: COL_WIDTHS.NO + COL_WIDTHS.ID + COL_WIDTHS.NAME + 30,
                  right: isLastPageOfTerm ? COL_WIDTHS.SUMMARY : 0,
                  bottom: 0,
                  flexDirection: 'row',
                  overflow: 'hidden' // ป้องกันข้อความล้น
                }}>
                  {page.days.map((d: AttendanceDay | null, dIdx: number) => (
                    <View key={`overlay-${dIdx}`} style={{ flex: 1, flexDirection: 'column', justifyContent: 'space-around', alignItems: 'center' }}>

                      {/* ข้อความวันหยุด */}
                      {d?.isHoliday && !d.hourLabel && d.eventType !== 'schoolDay' && (
                        Array.from({ length: 5 }).map((_, i) => (
                          <View key={i} style={styles.rotatedTextContainer}>
                            <Text style={[styles.rotatedText, { color: d.holidayName === 'ปิดภาคเรียน' || d.holidayName === 'วันหยุดเสาร์-อาทิตย์' ? '#555' : (d.eventType === 'specialHoliday' ? '#c85a00' : '#b71c1c'), opacity: 0.7, }]}>
                              {truncateText(d.holidayName, 25)}
                            </Text>
                          </View>
                        ))
                      )}

                      {/* ข้อความสอนชดเชย */}
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
        });
      })}
    </React.Fragment>
  );
};

export default SecondaryAttendanceRecordPage;