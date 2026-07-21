import React from 'react';
import { Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Student, StudentAttendanceSummary } from './types';
import PdfPage from './PdfPage';
import { getGroupPersonnel } from '@/utils/schoolUtils';

interface SummaryPageProps {
    schoolInfo: any;
    academicYear: string;
    termToDisplay: string;
    selectedClass: string;
    CLASSES: Record<string, string>;
    FULL_CLASSES?: Record<string, string>;
    currentCourse: any;
    courseTeacherName: string;
    headOfLearningAreaName?: string;
    resolvedSubjectGroupName?: string;
    headOfAssessmentName?: string;
    homeroomTeacher: any;
    students: Student[];
    studentAttendanceSummaries?: Record<string, StudentAttendanceSummary>;
    gradeDistribution: Record<string, number>;
    assessmentSummary?: {
        char: Record<string, number>;
        rw: Record<string, number>;
    };
    qrCodeDataUrl?: string;
    schoolId: string;
    selectedRoom?: string;
    curriculumClassDisplay: string;
    curriculumRoomDisplay: string;
}

const styles = StyleSheet.create({
    flexCol: { flexDirection: 'column' },
    flexRow: { flexDirection: 'row' },
    flexGrow: { flexGrow: 1 },
    justifyStart: { justifyContent: 'flex-start' },
    justifyEnd: { justifyContent: 'flex-end' },
    justifyBetween: { justifyContent: 'space-between' },
    itemsCenter: { alignItems: 'center' },
    textCenter: { textAlign: 'center' },
    fontBold: { fontWeight: 'bold', fontFamily: 'TH Sarabun PSK' },
    textBase: { fontSize: 12, fontWeight: 'bold' },
    textLg: { fontSize: 22, fontWeight: 'bold', fontFamily: 'TH Sarabun PSK' },
    textMd: { fontSize: 16 },
    wFull: { width: '100%' },
    logo: { width: 65, height: 65, marginBottom: 2, objectFit: 'contain' },
    table: { border: '1px solid black', width: '100%', textAlign: 'center' },
    tableRow: { flexDirection: 'row' },
    tableCell: { border: '1px solid black', padding: 1, alignItems: 'center', justifyContent: 'center' },
    bgGray: { backgroundColor: '#f3f4f6' },
    approvalHeader: { paddingTop: 0, marginTop: 2 },
    approvalBox: {
        marginTop: 5,
        border: '1px solid black',
        padding: '10 15',
        borderRadius: 2,
        backgroundColor: '#ffffff',
        alignSelf: 'center',
        width: '95%'
    },
    checkbox: { width: 14, height: 14, borderWidth: 1, borderColor: 'black', marginRight: 6 },
    percentText: { fontSize: 9 },
    qrContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        border: '0.8px solid #e5e7eb',
        borderRadius: 4,
        backgroundColor: '#ffffff',
        marginLeft: 15
    },
    qrImage: { width: 65, height: 65 }
});

const SummaryPage: React.FC<SummaryPageProps> = ({
    schoolInfo,
    academicYear,
    termToDisplay,
    selectedClass,
    CLASSES,
    FULL_CLASSES,
    currentCourse,
    courseTeacherName,
    headOfLearningAreaName,
    resolvedSubjectGroupName,
    headOfAssessmentName,
    homeroomTeacher,
    students,
    studentAttendanceSummaries,
    gradeDistribution,
    assessmentSummary,
    qrCodeDataUrl,
    schoolId,
    selectedRoom,
    curriculumClassDisplay,
    curriculumRoomDisplay,
}) => {
    const isPrimary = selectedClass.startsWith('p');
    const studentCount = students.length;
    const calcPercent = (val: number) => studentCount > 0 ? ((val / studentCount) * 100).toFixed(2) : '0.00';

    const attendanceStats = React.useMemo(() => {
        if (!studentAttendanceSummaries) return { totalPossible: 0, presentAvg: 0, percentAvg: 0 };
        const summaries = Object.values(studentAttendanceSummaries);
        if (summaries.length === 0) return { totalPossible: 0, presentAvg: 0, percentAvg: 0 };

        const totalPossible = summaries[0].annual.totalPossibleHours;
        const totalPresent = summaries.reduce((acc, s) => acc + s.annual.present + s.annual.late, 0);
        const percentAvg = summaries.reduce((acc, s) => acc + s.annual.percentage, 0) / summaries.length;

        return {
            totalPossible,
            presentAvg: totalPresent / summaries.length,
            percentAvg
        };
    }, [studentAttendanceSummaries]);

    const colWidths = {
        total: '20%',
        grade: '6.8%',
        note: '12%'
    };

    return (
        <PdfPage>
            <View style={[styles.flexCol, styles.flexGrow]}>

                {/* --- ส่วน ปพ.5 (แก้ไขขนาดเป็น 16pt และตัวหนาตามสั่ง) --- */}
                <View style={[styles.flexRow, styles.justifyEnd, styles.wFull]}>
                    <Text style={[styles.textMd, styles.fontBold]}>ปพ.5</Text>
                </View>

                {/* --- ส่วนหัวอื่นๆ คงเดิม 100% --- */}
                <View style={[styles.flexCol, styles.itemsCenter, styles.wFull, { marginTop: -10, marginBottom: 2 }]}>
                    {schoolInfo?.logoUrl ? <Image src={schoolInfo.logoUrl} style={styles.logo} /> : null}<Text style={styles.textLg}>แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน</Text>
                </View>

                <View style={{ width: '100%', gap: 1 }}>
                    <View style={[styles.flexRow, styles.justifyBetween, styles.wFull, { alignItems: 'flex-end' }]}>
                        <Text style={[styles.textMd, styles.fontBold]}>{schoolInfo?.schoolName?.startsWith('โรงเรียน') ? '' : 'โรงเรียน'}{schoolInfo?.schoolName || '................................'}</Text>
                        <Text style={[styles.textMd, styles.fontBold]}><Text style={styles.fontBold}>อำเภอ</Text>&nbsp;{schoolInfo?.district || '................................'} &nbsp;&nbsp; {schoolInfo?.affiliation || '................................'}{schoolInfo?.area ? ` เขต ${schoolInfo.area}` : ''}</Text>
                    </View>
                    <View style={[styles.flexRow, styles.justifyBetween, styles.wFull, styles.textMd, { borderTop: '1px solid #f3f4f6', paddingTop: 2 }]}>
                        <Text>
                            <Text style={styles.fontBold}>ชั้น</Text> &nbsp;&nbsp;&nbsp;&nbsp; {curriculumClassDisplay}{curriculumRoomDisplay && curriculumRoomDisplay !== 'all' ? ` ห้อง ${curriculumRoomDisplay}` : (curriculumRoomDisplay === 'all' || !curriculumRoomDisplay ? ' (ทุกห้อง)' : ` ห้อง ${curriculumRoomDisplay}`)}
                        </Text>
                        {isPrimary ? null : (
                            <Text>
                                <Text style={styles.fontBold}>ภาคเรียนที่</Text> &nbsp;&nbsp;&nbsp;&nbsp; {termToDisplay}
                            </Text>
                        )}
                        <Text>
                            <Text style={styles.fontBold}>ปีการศึกษา</Text> &nbsp;&nbsp;&nbsp;&nbsp; {academicYear}
                        </Text>
                        <Text>
                            <Text style={styles.fontBold}>เวลาเรียน</Text> &nbsp;&nbsp;&nbsp;&nbsp; {currentCourse?.hoursPerWeek} ชม./สัปดาห์
                        </Text>
                    </View>
                    <View style={[styles.flexRow, styles.justifyBetween, styles.wFull, styles.textMd, { borderTop: '1px solid #f3f4f6', paddingTop: 2 }]}>
                        <Text>
                            <Text style={styles.fontBold}>รายวิชา</Text> &nbsp;&nbsp;&nbsp;&nbsp; {currentCourse?.title}
                        </Text>
                        <Text>
                            <Text style={styles.fontBold}>รหัสวิชา</Text> &nbsp;&nbsp;&nbsp;&nbsp; {currentCourse?.code}
                        </Text>
                        <Text>
                            <Text style={styles.fontBold}>หน่วยกิต</Text> &nbsp;&nbsp;&nbsp;&nbsp; {(currentCourse?.hoursPerWeek || 0) / 2} หน่วย
                        </Text>
                    </View>
                    <View style={[styles.flexRow, styles.justifyBetween, styles.wFull, styles.textMd]}>
                        <Text>
                            <Text style={styles.fontBold}>ครูผู้สอน</Text> &nbsp;&nbsp;&nbsp;&nbsp; {courseTeacherName || '............................................................'}
                        </Text>
                        <View style={{ width: 40 }} />
                        <Text style={{ flex: 1, textAlign: 'right' }}>
                            <Text style={styles.fontBold}>ครูที่ปรึกษา</Text> &nbsp;&nbsp;&nbsp;&nbsp; {homeroomTeacher?.name || '................................'}
                        </Text>
                    </View>
                </View>



                {/* --- ตารางสรุปผลการเรียน (เส้นตรงเป๊ะ) --- */}
                <View style={[styles.table, { marginTop: 5, marginBottom: 5 }]}>
                    <View style={styles.tableRow}>
                        <View style={[styles.tableCell, { flex: 1 }]}><Text style={[styles.fontBold, styles.textMd]}>สรุปผลการเรียน</Text></View>
                    </View>
                    <View style={styles.tableRow}>
                        <View style={[styles.tableCell, { width: colWidths.total, minHeight: 38 }]}>
                            <Text style={[styles.fontBold, { fontSize: 13 }]}>จำนวนนักเรียนทั้งหมด</Text>
                        </View>
                        <View style={[styles.flexCol, { flex: 1 }]}>
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, { width: '80%' }]}><Text style={[styles.fontBold, styles.textMd]}>ระดับผลการเรียน</Text></View>
                                <View style={[styles.tableCell, { width: '20%' }]}><Text style={[styles.fontBold, styles.textMd]}>ผลการเรียน</Text></View>
                            </View>
                            <View style={styles.tableRow}>
                                {['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'ร', 'มส'].map(g => (
                                    <View key={g} style={[styles.tableCell, { width: '10%' }]}><Text style={[styles.fontBold, styles.textMd]}>{g}</Text></View>
                                ))}
                            </View>
                        </View>
                        <View style={[styles.tableCell, { width: colWidths.note, minHeight: 38 }]}><Text style={[styles.fontBold, styles.textMd]}>หมายเหตุ</Text></View>
                    </View>
                    <View style={styles.tableRow}>
                        <View style={[styles.tableCell, { width: colWidths.total }]}><Text style={styles.textMd}>{studentCount}</Text></View>
                        {['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'ร', 'มส'].map(g => (
                            <View key={g} style={[styles.tableCell, { width: colWidths.grade }]}><Text style={styles.textMd}>{gradeDistribution[g] || '-'}</Text></View>
                        ))}
                        <View style={[styles.tableCell, { width: colWidths.note }]}></View>
                    </View>
                    <View style={[styles.tableRow, styles.bgGray]}>
                        <View style={[styles.tableCell, { width: colWidths.total }]}><Text style={[styles.fontBold, styles.textMd]}>คิดเป็นร้อยละ</Text></View>
                        {['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'ร', 'มส'].map(g => (
                            <View key={g} style={[styles.tableCell, { width: colWidths.grade }]}><Text style={styles.percentText}>{calcPercent(gradeDistribution[g] || 0)}</Text></View>
                        ))}
                        <View style={[styles.tableCell, { width: colWidths.note }]}></View>
                    </View>
                </View>

                {/* --- ตารางประเมินด้านล่าง --- */}
                <View style={[styles.flexRow, { gap: 6, marginBottom: 4 }]}>
                    <View style={{ flex: 1 }}>
                        <View style={styles.table}>
                            <View style={styles.tableRow}><View style={[styles.tableCell, { flex: 1 }]}><Text style={[styles.fontBold, styles.textMd]}>สรุปผลการประเมินคุณลักษณะอันพึงประสงค์</Text></View></View>
                            <View style={[styles.tableRow, { minHeight: 30 }]}>
                                <View style={[styles.tableCell, { width: '40%' }]}><Text style={[styles.fontBold, { fontSize: 13 }]}>จำนวนนักเรียนทั้งหมด</Text></View>
                                {['ดีเยี่ยม', 'ดี', 'ผ่าน', 'ปรับปรุง'].map(l => <View key={l} style={[styles.tableCell, { flex: 1 }]}><Text style={[styles.fontBold, { fontSize: 11 }]}>{l}</Text></View>)}
                            </View>
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, { width: '40%' }]}><Text style={styles.textMd}>{studentCount}</Text></View>
                                {['3', '2', '1', '0'].map(v => <View key={v} style={[styles.tableCell, { flex: 1 }]}><Text style={styles.textMd}>{assessmentSummary?.char[v] || '-'}</Text></View>)}
                            </View>
                            <View style={[styles.tableRow, styles.bgGray]}>
                                <View style={[styles.tableCell, { width: '40%' }]}><Text style={[styles.fontBold, styles.textMd]}>คิดเป็นร้อยละ</Text></View>
                                {['3', '2', '1', '0'].map(v => <View key={v} style={[styles.tableCell, { flex: 1 }]}><Text style={styles.percentText}>{calcPercent(assessmentSummary?.char[v] || 0)}</Text></View>)}
                            </View>
                        </View>
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={styles.table}>
                            <View style={styles.tableRow}><View style={[styles.tableCell, { flex: 1 }]}><Text style={[styles.fontBold, styles.textMd]}>สรุปผลการประเมินอ่าน คิด วิเคราะห์เขียน</Text></View></View>
                            <View style={[styles.tableRow, { minHeight: 30 }]}>
                                <View style={[styles.tableCell, { width: '40%' }]}><Text style={[styles.fontBold, { fontSize: 13 }]}>จำนวนนักเรียนทั้งหมด</Text></View>
                                {['ดีเยี่ยม', 'ดี', 'ผ่าน', 'ปรับปรุง'].map(l => <View key={l} style={[styles.tableCell, { flex: 1 }]}><Text style={[styles.fontBold, { fontSize: 11 }]}>{l}</Text></View>)}
                            </View>
                            <View style={styles.tableRow}>
                                <View style={[styles.tableCell, { width: '40%' }]}><Text style={styles.textMd}>{studentCount}</Text></View>
                                {['3', '2', '1', '0'].map(v => <View key={v} style={[styles.tableCell, { flex: 1 }]}><Text style={styles.textMd}>{assessmentSummary?.rw[v] || '-'}</Text></View>)}
                            </View>
                            <View style={[styles.tableRow, styles.bgGray]}>
                                <View style={[styles.tableCell, { width: '40%' }]}><Text style={[styles.fontBold, styles.textMd]}>คิดเป็นร้อยละ</Text></View>
                                {['3', '2', '1', '0'].map(v => <View key={v} style={[styles.tableCell, { flex: 1 }]}><Text style={styles.percentText}>{calcPercent(assessmentSummary?.rw[v] || 0)}</Text></View>)}
                            </View>
                        </View>
                    </View>
                </View>

                {/* --- ส่วนลงนาม (Footer) --- */}
                <View style={styles.approvalHeader}>
                    <Text style={[styles.fontBold, { marginBottom: 2, fontSize: 15 }]}>การตรวจสอบและอนุมัติผลการเรียน</Text>
                    <View style={[styles.flexRow, { flexWrap: 'wrap' }]}>
                        <View style={[{ width: '50%' }, styles.textCenter, { marginVertical: 2 }]}>
                            <Text style={styles.textMd}>ลงชื่อ ............................................................</Text>
                            <Text style={styles.textMd}>( {courseTeacherName || '............................................................'} )</Text>
                            <Text style={[styles.fontBold, { fontSize: 15 }]}>ครูผู้สอน</Text>
                        </View>
                        <View style={[{ width: '50%' }, styles.textCenter, { marginVertical: 2 }]}>
                            <Text style={styles.textMd}>ลงชื่อ ............................................................</Text>
                            <Text style={styles.textMd}>( {headOfLearningAreaName || '............................................................'} )</Text>
                            <Text style={[styles.fontBold, { fontSize: 15 }]}>{'หัวหน้ากลุ่มสาระการเรียนรู้'}{resolvedSubjectGroupName ? resolvedSubjectGroupName : ''}</Text>
                        </View>
                        <View style={[{ width: '50%' }, styles.textCenter, { marginVertical: 2 }]}>
                            <Text style={styles.textMd}>ลงชื่อ ............................................................</Text>
                            <Text style={styles.textMd}>( {headOfAssessmentName || '............................................................'} )</Text>
                            <Text style={[styles.fontBold, { fontSize: 15 }]}>หัวหน้างานวัดและประเมินผล</Text>
                        </View>
                        <View style={[{ width: '50%' }, styles.textCenter, { marginVertical: 2 }]}>
                            <Text style={styles.textMd}>ลงชื่อ ............................................................</Text>
                            <Text style={styles.textMd}>( {getGroupPersonnel(schoolInfo, 'academic').name || '............................................................'} )</Text>
                            <Text style={[styles.fontBold, { fontSize: 15 }]}>{getGroupPersonnel(schoolInfo, 'academic').label}</Text>
                        </View>
                    </View>

                    <View style={styles.approvalBox} wrap={false}>
                        <View style={[styles.flexRow, { justifyContent: 'center', gap: 40, marginBottom: 5 }]}>
                            <View style={[styles.flexRow, styles.itemsCenter]}><View style={styles.checkbox} /><Text style={styles.textMd}>อนุมัติ</Text></View>
                            <View style={[styles.flexRow, styles.itemsCenter]}><View style={styles.checkbox} /><Text style={styles.textMd}>ไม่อนุมัติ</Text></View>
                        </View>
                        <View style={[styles.flexRow, styles.itemsCenter, { justifyContent: 'center', paddingRight: 0 }]}>
                            {/* Dummy view for centering signature when QR is present */}
                            {qrCodeDataUrl && <View style={{ width: 80 }} />}

                            <View style={[styles.textCenter, { flex: 1 }]}>
                                <Text style={[styles.textMd, { marginBottom: 2 }]}>ลงชื่อ ............................................................................................</Text>
                                <Text style={[styles.textMd, { marginBottom: 2 }]}>( {`${schoolInfo?.directorPrefix || ''}${schoolInfo?.directorName || ''}`.trim() || '............................................................'} )</Text>
                                <Text style={[styles.fontBold, styles.textMd]}>ผู้อำนวยการโรงเรียน{schoolInfo?.schoolName || '.................'}</Text>
                                <Text style={[styles.textMd, { marginTop: 4 }]}>............ / ............ / ............</Text>
                            </View>

                            {qrCodeDataUrl && (
                                <View style={styles.qrContainer}>
                                    <View style={{ position: 'relative' }}>
                                        <Image src={qrCodeDataUrl} style={styles.qrImage} />
                                        {schoolInfo?.logoUrl && (
                                            <Image 
                                                src={schoolInfo.logoUrl} 
                                                style={{
                                                    position: 'absolute',
                                                    top: 23,
                                                    left: 23,
                                                    width: 19,
                                                    height: 19,
                                                    backgroundColor: 'white',
                                                    padding: 1,
                                                    borderRadius: 2
                                                }} 
                                            />
                                        )}
                                    </View>
                                    <Text style={{ fontSize: 9, marginTop: 4, color: '#374151', fontFamily: 'TH Sarabun PSK', fontWeight: 'bold' }}>ตรวจสอบเอกสาร</Text>
                                    <Text style={{ fontSize: 6, color: '#6b7280', fontFamily: 'TH Sarabun PSK' }}>Digital Reference</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* QR Code section moved above inside approvalBox */}
            </View>
        </PdfPage>
    );
};

export default SummaryPage;