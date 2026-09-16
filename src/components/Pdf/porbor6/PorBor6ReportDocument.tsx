import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { PorBor6SubjectRow, PorBor6CreditSummary, SubjectSection } from '@/utils/porBor6Utils';

const isBrowser = typeof window !== 'undefined';
const fontPrefix = isBrowser ? '' : './public';

try {
    Font.register({
        family: 'TH Sarabun PSK',
        fonts: [
            { src: `${fontPrefix}/fonts/THSarabunNew.ttf` },
            { src: `${fontPrefix}/fonts/THSarabunNew-Bold.ttf`, fontWeight: 'bold' },
            { src: `${fontPrefix}/fonts/THSarabunNew Italic.ttf`, fontStyle: 'italic' },
            { src: `${fontPrefix}/fonts/THSarabunNew BoldItalic.ttf`, fontWeight: 'bold', fontStyle: 'italic' },
        ],
    });
} catch (e) {
    console.error('Font registration failed in PorBor6ReportDocument', e);
}

Font.registerHyphenationCallback((word) => [word]);

// ความกว้างคอลัมน์ตารางหลัก (pt) รวม = 522 pt
// แม่แบบ ปพ.6 แยกรหัสวิชาออกจากชื่อวิชาด้วยเส้นตั้งในส่วนเนื้อหาตาราง
// แต่หัวตารางรวมสองช่องนี้เป็นหัวข้อ "วิชา" เดียว
const COL = {
    courseCode: 38,
    subject: 174,
    credit: 26,
    max: 25,
    obtained: 28,
    normal: 26,
    remedial: 26,
    char: 36,
    think: 38,
    teacher: 105,
};

// ความกว้างคอลัมน์กล่องสรุปผลการเรียนด้านล่างซ้าย
const SCOL = {
    label: 55,
    currentStudied: 30,
    currentEarned: 30,
    unit: 20,
    cumStudied: 30,
    cumEarned: 32,
};
const SUMMARY_WIDTH = SCOL.label + SCOL.currentStudied + SCOL.currentEarned + SCOL.unit + SCOL.cumStudied + SCOL.cumEarned; // 197 pt

const styles = StyleSheet.create({
    page: {
        paddingTop: 20,
        paddingBottom: 5,
        paddingHorizontal: 36,
        fontFamily: 'TH Sarabun PSK',
        color: '#000',
        fontSize: 9.5,
    },
    // ── ส่วนหัวเอกสาร ──
    headerArea: {
        flexDirection: 'row',
        alignItems: 'center',
        // เว้นเพียงเล็กน้อยก่อนเริ่มตาราง เพื่อไม่ให้เกิดช่องว่างใต้ชื่อครูที่ปรึกษา
        marginBottom: 8,
    },
    logoBox: {
        width: 48,
        height: 56,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 48,
        height: 56,
        objectFit: 'contain',
    },
    headerRight: {
        flex: 1,
    },
    schoolName: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 1.15,
    },
    reportTitle: {
        fontSize: 10,
        lineHeight: 1.2,
        marginTop: 1.5,
    },
    studentInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        fontSize: 10,
    },
    fieldLabel: {
        fontSize: 10,
    },
    fieldValue: {
        fontSize: 10,
    },
    nameSlot: {
        minWidth: 90,
        paddingHorizontal: 4,
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        borderBottomStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 0.5,
        marginLeft: 6,
    },
    lastNameSlot: {
        minWidth: 80,
        paddingHorizontal: 4,
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        borderBottomStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 0.5,
        marginLeft: 6,
    },
    idSlot: {
        flex: 1,
        paddingLeft: 8,
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        borderBottomStyle: 'dashed',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingBottom: 0.5,
        marginLeft: 6,
    },
    advisorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        fontSize: 10,
    },

    // ── ตารางหลัก ──
    // แม่แบบเว้นพื้นที่ใต้รายวิชาให้มีความสูงคงที่ก่อนถึงตารางสรุป
    // ใช้ minHeight เพื่อให้ข้อมูลที่ยาวกว่าปกติยังไม่ถูกตัดทิ้ง
    tableContainer: {
        borderWidth: 0.8,
        borderColor: '#000',
        width: 522,
        minHeight: 475,
        flexDirection: 'column',
        position: 'relative',
    },
    // เส้นตารางในแม่แบบต้องยาวถึงก้นตาราง แม้รายการวิชายังไม่เต็มพื้นที่
    // จึงวาดเป็นชั้นพื้นหลังแยกจากแถวข้อมูลจริง
    gridLayer: {
        position: 'absolute',
        top: 28,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
    },
    gridColumn: {
        height: '100%',
        borderRightWidth: 0.8,
        borderRightColor: '#000',
    },
    gridColumnLast: {
        height: '100%',
    },
    tableBody: {
        position: 'relative',
        zIndex: 1,
    },
    headerGroup: {
        flexDirection: 'row',
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        height: 28,
        backgroundColor: '#fff',
    },
    headerCell: {
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCellLast: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: {
        fontSize: 9.5,
        textAlign: 'center',
    },
    achievementGroup: {
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        flexDirection: 'column',
    },
    achievementTopCell: {
        height: 14,
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    achievementTopText: {
        fontSize: 9.5,
        textAlign: 'center',
        lineHeight: 1,
    },
    achievementSubRow: {
        flexDirection: 'row',
        height: 14,
    },
    subHeaderCell: {
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    subHeaderCellLast: {
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    subHeaderText: {
        fontSize: 9,
        textAlign: 'center',
    },

    // แถวข้อมูลในตาราง — แต่ละช่องมีเส้นขอบขวาของตัวเอง (ไม่ใช้ overlay absolute) เพื่อให้ตารางสูงตามเนื้อหาจริง
    sectionRow: {
        flexDirection: 'row',
        height: 14.5,
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 9.5,
        fontWeight: 'bold',
    },
    dataRow: {
        flexDirection: 'row',
        height: 14.5,
        alignItems: 'center',
    },
    subjectCell: {
        width: COL.subject,
        height: '100%',
        justifyContent: 'center',
        paddingLeft: 4,
    },
    courseCodeCell: {
        width: COL.courseCode,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerCell: {
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    teacherCell: {
        width: COL.teacher,
        height: '100%',
        justifyContent: 'center',
        paddingLeft: 6,
    },
    bodyText: {
        fontSize: 9.5,
    },

    // ── ส่วนล่าง (ตารางสรุป + ลายเซ็น) ──
    middleSection: {
        flexDirection: 'row',
        marginTop: 6,
        width: 522,
    },
    summaryWrapper: {
        width: SUMMARY_WIDTH,
        borderWidth: 0.8,
        borderColor: '#000',
    },
    sumHeadRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        height: 13.5,
        alignItems: 'center',
    },
    sumSubHeadRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        height: 13,
        alignItems: 'center',
    },
    sumRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: '#000',
        height: 13,
        alignItems: 'center',
    },
    sumRowThickBottom: {
        flexDirection: 'row',
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        height: 13,
        alignItems: 'center',
    },
    sumGpaRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: '#000',
        height: 13.5,
        alignItems: 'center',
    },
    sumRankRow: {
        flexDirection: 'row',
        height: 13,
        alignItems: 'center',
    },
    sumCellLabel: {
        width: SCOL.label,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        height: '100%',
        justifyContent: 'center',
        paddingLeft: 4,
    },
    sumCellNum: {
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sumCellNumLast: {
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sumText: {
        fontSize: 9,
    },

    // เกณฑ์การประเมินในกล่องสรุปผลการเรียน
    evalCriteriaBox: {
        borderTopWidth: 0.8,
        borderTopColor: '#000',
        paddingHorizontal: 4,
        paddingVertical: 2.5,
        fontSize: 7.2,
        lineHeight: 1.15,
        minHeight: 58,
    },
    evalCriteriaTitle: {
        fontSize: 7.5,
        fontWeight: 'bold',
        marginBottom: 1,
    },

    // ลายเซ็น
    signatureArea: {
        flex: 1,
        paddingLeft: 30,
        justifyContent: 'space-between',
        paddingVertical: 1,
    },
    advisorSignBlock: {
        // ให้แนว "ลงชื่อ ... ครูที่ปรึกษา" ชิดแนวขวาเหมือนแม่แบบ
        // และชื่อครูอยู่กึ่งกลางใต้เส้นลายเซ็นเสมอ
        width: 285,
        // เว้นจากขอบล่างของตารางหลักให้เทียบกับแม่แบบ
        marginTop: 30,
        alignItems: 'center',
        alignSelf: 'flex-end',
    },
    directorSignBlock: {
        alignItems: 'center',
        alignSelf: 'flex-end',
        marginRight: 8,
    },
    signRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    signDots: {
        fontSize: 9.5,
    },
    signSubText: {
        fontSize: 9.5,
        marginTop: 1.5,
        textAlign: 'center',
    },
    advisorNames: {
        width: 285,
        fontSize: 8.5,
        marginTop: 3,
        textAlign: 'center',
    },

    // ── กล่องความเห็นผู้ปกครองล่างสุด ──
    parentBox: {
        borderWidth: 0.8,
        borderColor: '#000',
        width: 522,
        marginTop: 13,
        paddingHorizontal: 8,
        paddingVertical: 4,
        flexDirection: 'row',
        height: 65,
    },
    parentLeft: {
        // กล่องด้านในกว้าง 506pt (522 - padding ซ้าย/ขวา 16pt)
        // แบ่งตามแม่แบบ: ความเห็นผู้ปกครอง 263pt | ส่วนรับทราบ 243pt
        width: 263,
        paddingRight: 8,
    },
    parentRight: {
        width: 243,
        alignItems: 'center',
    },
    parentTitle: {
        fontSize: 9,
    },
    parentDotLine: {
        fontSize: 9,
        marginTop: 4,
    },
    parentSignDots: {
        fontSize: 9,
        marginTop: 1,
    },
    parentLabel: {
        fontSize: 8.5,
        marginTop: 1,
        textAlign: 'center',
    },
    parentDateDots: {
        fontSize: 8.5,
        marginTop: 2,
        textAlign: 'center',
    },
});

const formatCredit = (value: number) => Number(value || 0).toFixed(1);
const formatMax = (value: number | null) => (value === null ? '-' : String(Math.round(value)));
const formatObtained = (value: number | null) => (value === null ? '-' : Number(value).toFixed(1));
const formatGrade = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || value === '' || value === undefined) return value || '-';
    return parsed.toFixed(parsed % 1 === 0 ? 0 : 1);
};
const formatGpa = (value: number | null) => (value === null ? '-' : value.toFixed(2));
const formatRank = (value: number | null) => (value === null ? '-' : String(value));
const formatScoreCell = (value: number | null) => (value === null ? '' : String(value));

export interface PorBor6StudentInfo {
    title?: string;
    firstName: string;
    lastName: string;
    studentId?: string;
    classLevel?: string;
    room?: string;
    seatNumber?: string;
}

export interface PorBor6SchoolInfo {
    schoolName?: string;
    logoUrl?: string;
    directorName?: string;
}

export interface PorBor6ReportDocumentProps {
    schoolInfo: PorBor6SchoolInfo;
    student: PorBor6StudentInfo;
    academicYear: string;
    semester: string;
    homeroomTeacherNames: string[];
    subjects: PorBor6SubjectRow[];
    currentSummary: PorBor6CreditSummary;
    cumulativeSummary: PorBor6CreditSummary;
    classRank: number | null;
    gradeLevelRank: number | null;
    issueDate: { day: number; month: string; year: number };
}

const getClassLevelFull = (level?: string): string => {
    const raw = String(level || '').trim();
    if (!raw) return '-';
    if (raw.startsWith('ม.1')) return 'มัธยมศึกษาปีที่ 1';
    if (raw.startsWith('ม.2')) return 'มัธยมศึกษาปีที่ 2';
    if (raw.startsWith('ม.3')) return 'มัธยมศึกษาปีที่ 3';
    if (raw.startsWith('ม.4')) return 'มัธยมศึกษาปีที่ 4';
    if (raw.startsWith('ม.5')) return 'มัธยมศึกษาปีที่ 5';
    if (raw.startsWith('ม.6')) return 'มัธยมศึกษาปีที่ 6';
    return raw;
};

const sectionHeading: Record<SubjectSection, string> = {
    'พื้นฐาน': 'วิชาพื้นฐาน',
    'เพิ่มเติม': 'วิชาเพิ่มเติม',
    'กิจกรรม': 'วิชากิจกรรม',
};

const groupBySection = (subjects: PorBor6SubjectRow[]) => {
    const order: SubjectSection[] = ['พื้นฐาน', 'เพิ่มเติม', 'กิจกรรม'];
    return order.map(section => ({
        section,
        rows: subjects.filter(s => s.section === section),
    })).filter(g => g.rows.length > 0);
};

const PorBor6ReportDocument: React.FC<PorBor6ReportDocumentProps> = ({
    schoolInfo,
    student,
    academicYear,
    semester,
    homeroomTeacherNames,
    subjects,
    currentSummary,
    cumulativeSummary,
    classRank,
    gradeLevelRank,
    issueDate,
}) => {
    const fullNameFirst = `${student.title || ''}${student.firstName || ''}`.trim();
    const groups = groupBySection(subjects);
    const advisorLine = homeroomTeacherNames.length > 0
        ? homeroomTeacherNames.map((name, idx) => `${idx + 1}.${name}`).join(', ')
        : '........................................................................';

    const schoolTitle = schoolInfo.schoolName || '';

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* ── ส่วนหัวเอกสาร ── */}
                <View style={styles.headerArea}>
                    {schoolInfo.logoUrl ? (
                        <View style={styles.logoBox}>
                            <Image src={schoolInfo.logoUrl} style={styles.logo} />
                        </View>
                    ) : null}
                    <View style={styles.headerRight}>
                        <Text style={styles.schoolName}>{schoolTitle}</Text>
                        <Text style={styles.reportTitle}>
                            รายงานผลการเรียน ปลายภาคเรียนที่ {semester} ปีการศึกษา {academicYear}{'  '}
                            {getClassLevelFull(student.classLevel)} ห้อง {student.room || '-'} เลขที่ {student.seatNumber || '-'}
                        </Text>
                        <View style={styles.studentInfoRow}>
                            <Text style={styles.fieldLabel}>ชื่อ</Text>
                            <View style={styles.nameSlot}>
                                <Text style={styles.fieldValue}>{fullNameFirst}</Text>
                            </View>
                            <Text style={[styles.fieldLabel, { marginLeft: 16 }]}>นามสกุล</Text>
                            <View style={styles.lastNameSlot}>
                                <Text style={styles.fieldValue}>{student.lastName || ''}</Text>
                            </View>
                            <Text style={[styles.fieldLabel, { marginLeft: 16 }]}>เลขประจำตัว</Text>
                            <View style={styles.idSlot}>
                                <Text style={styles.fieldValue}>{student.studentId || ''}</Text>
                            </View>
                        </View>
                        <View style={styles.advisorRow}>
                            <Text style={styles.fieldLabel}>ครูที่ปรึกษา  </Text>
                            <Text style={styles.fieldValue}>{advisorLine}</Text>
                        </View>
                    </View>
                </View>

                {/* ── ตารางผลการเรียนหลัก ── */}
                <View style={styles.tableContainer} wrap={false}>
                    <View style={styles.gridLayer}>
                        <View style={[styles.gridColumn, { width: COL.courseCode }]} />
                        <View style={[styles.gridColumn, { width: COL.subject }]} />
                        <View style={[styles.gridColumn, { width: COL.credit }]} />
                        <View style={[styles.gridColumn, { width: COL.max }]} />
                        <View style={[styles.gridColumn, { width: COL.obtained }]} />
                        <View style={[styles.gridColumn, { width: COL.normal }]} />
                        <View style={[styles.gridColumn, { width: COL.remedial }]} />
                        <View style={[styles.gridColumn, { width: COL.char }]} />
                        <View style={[styles.gridColumn, { width: COL.think }]} />
                        <View style={[styles.gridColumnLast, { width: COL.teacher }]} />
                    </View>
                    {/* Header Row */}
                    <View style={styles.headerGroup}>
                        <View style={[styles.headerCell, { width: COL.courseCode + COL.subject }]}>
                            <Text style={styles.headerText}>วิชา</Text>
                        </View>
                        <View style={[styles.headerCell, { width: COL.credit }]}>
                            <Text style={styles.headerText}>หน่วย{'\n'}กิต</Text>
                        </View>
                        <View style={[styles.achievementGroup, { width: COL.max + COL.obtained + COL.normal + COL.remedial }]}>
                            <View style={styles.achievementTopCell}>
                                <Text style={styles.achievementTopText}>การประเมินผลสัมฤทธิ์</Text>
                            </View>
                            <View style={styles.achievementSubRow}>
                                <View style={[styles.subHeaderCell, { width: COL.max }]}>
                                    <Text style={styles.subHeaderText}>เต็ม</Text>
                                </View>
                                <View style={[styles.subHeaderCell, { width: COL.obtained }]}>
                                    <Text style={styles.subHeaderText}>ได้</Text>
                                </View>
                                <View style={[styles.subHeaderCell, { width: COL.normal }]}>
                                    <Text style={styles.subHeaderText}>ปกติ</Text>
                                </View>
                                <View style={[styles.subHeaderCellLast, { width: COL.remedial }]}>
                                    <Text style={styles.subHeaderText}>แก้ตัว</Text>
                                </View>
                            </View>
                        </View>
                        <View style={[styles.headerCell, { width: COL.char }]}>
                            <Text style={styles.headerText}>คุณ{'\n'}ลักษณะ</Text>
                        </View>
                        <View style={[styles.headerCell, { width: COL.think }]}>
                            <Text style={styles.headerText}>คิด{'\n'}วิเคราะห์</Text>
                        </View>
                        <View style={[styles.headerCellLast, { width: COL.teacher }]}>
                            <Text style={styles.headerText}>ครูผู้สอน</Text>
                        </View>
                    </View>

                    {/* รายการวิชา (ไม่มีเส้นขวางระหว่างแถว ตามแม่แบบ 100%) */}
                    <View style={styles.tableBody}>
                        {groups.map(group => (
                            <React.Fragment key={group.section}>
                                <View style={styles.sectionRow}>
                                    <View style={styles.courseCodeCell} />
                                    <View style={styles.subjectCell}>
                                        <Text style={styles.sectionTitle}>{sectionHeading[group.section]}</Text>
                                    </View>
                                    <View style={[styles.centerCell, { width: COL.credit }]} />
                                    <View style={[styles.centerCell, { width: COL.max }]} />
                                    <View style={[styles.centerCell, { width: COL.obtained }]} />
                                    <View style={[styles.centerCell, { width: COL.normal }]} />
                                    <View style={[styles.centerCell, { width: COL.remedial }]} />
                                    <View style={[styles.centerCell, { width: COL.char }]} />
                                    <View style={[styles.centerCell, { width: COL.think }]} />
                                    <View style={{ width: COL.teacher, height: '100%' }} />
                                </View>
                                {group.rows.map((row, idx) => {
                                    const isActivity = row.section === 'กิจกรรม';
                                    const creditDisplay = isActivity ? '20.0' : formatCredit(row.credits);
                                    const maxDisplay = isActivity ? '-' : formatMax(row.maxScore);
                                    const scoreDisplay = isActivity ? '0.0' : formatObtained(row.totalScore);
                                    const gradeDisplay = isActivity ? (row.grade || 'ผ') : formatGrade(row.grade);

                                    return (
                                        <View key={`${group.section}-${row.courseCode}-${idx}`} style={styles.dataRow}>
                                            <View style={styles.courseCodeCell}>
                                                <Text style={styles.bodyText}>{row.courseCode}</Text>
                                            </View>
                                            <View style={styles.subjectCell}>
                                                <Text style={styles.bodyText}>{row.courseTitle}</Text>
                                            </View>
                                            <View style={[styles.centerCell, { width: COL.credit }]}>
                                                <Text style={styles.bodyText}>{creditDisplay}</Text>
                                            </View>
                                            <View style={[styles.centerCell, { width: COL.max }]}>
                                                <Text style={styles.bodyText}>{maxDisplay}</Text>
                                            </View>
                                            <View style={[styles.centerCell, { width: COL.obtained }]}>
                                                <Text style={styles.bodyText}>{scoreDisplay}</Text>
                                            </View>
                                            <View style={[styles.centerCell, { width: COL.normal }]}>
                                                <Text style={styles.bodyText}>{gradeDisplay}</Text>
                                            </View>
                                            <View style={[styles.centerCell, { width: COL.remedial }]}>
                                                <Text style={styles.bodyText}>{row.remedialGrade || ''}</Text>
                                            </View>
                                            <View style={[styles.centerCell, { width: COL.char }]}>
                                                <Text style={styles.bodyText}>{isActivity ? '' : formatScoreCell(row.characteristics)}</Text>
                                            </View>
                                            <View style={[styles.centerCell, { width: COL.think }]}>
                                                <Text style={styles.bodyText}>{isActivity ? '' : formatScoreCell(row.thinking)}</Text>
                                            </View>
                                            <View style={styles.teacherCell}>
                                                <Text style={styles.bodyText}>{row.teacherName}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </View>
                </View>

                {/* ── ส่วนสรุปผลการเรียนและลายเซ็น ── */}
                <View style={styles.middleSection} wrap={false}>
                    {/* กล่องสรุปผลการเรียนด้านซ้าย (พร้อมเกณฑ์การประเมินในกรอบเดียวกัน) */}
                    <View style={styles.summaryWrapper}>
                        {/* Header Row: ผลการเรียน | สะสม */}
                        <View style={styles.sumHeadRow}>
                            <View style={{ width: SCOL.label, borderRightWidth: 0.8, borderRightColor: '#000', height: '100%' }} />
                            <View style={{ width: SCOL.currentStudied + SCOL.currentEarned + SCOL.unit, borderRightWidth: 0.8, borderRightColor: '#000', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                                <Text style={styles.sumText}>ผลการเรียน</Text>
                            </View>
                            <View style={{ width: SCOL.cumStudied + SCOL.cumEarned, height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                                <Text style={styles.sumText}>สะสม</Text>
                            </View>
                        </View>

                        {/* Subheader Row: เรียน | ได้ | [นก.] | เรียน | ได้ */}
                        <View style={styles.sumSubHeadRow}>
                            <View style={{ width: SCOL.label, borderRightWidth: 0.8, borderRightColor: '#000', height: '100%' }} />
                            <View style={[styles.sumCellNum, { width: SCOL.currentStudied }]}>
                                <Text style={styles.sumText}>เรียน</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.currentEarned }]}>
                                <Text style={styles.sumText}>ได้</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.unit }]}>
                                <Text style={styles.sumText} />
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.cumStudied }]}>
                                <Text style={styles.sumText}>เรียน</Text>
                            </View>
                            <View style={[styles.sumCellNumLast, { width: SCOL.cumEarned }]}>
                                <Text style={styles.sumText}>ได้</Text>
                            </View>
                        </View>

                        {/* Row: พื้นฐาน */}
                        <View style={styles.sumRow}>
                            <View style={styles.sumCellLabel}>
                                <Text style={styles.sumText}>พื้นฐาน</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.currentStudied }]}>
                                <Text style={styles.sumText}>{formatCredit(currentSummary.basicStudied)}</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.currentEarned }]}>
                                <Text style={styles.sumText}>{formatCredit(currentSummary.basicEarned)}</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.unit }]}>
                                <Text style={styles.sumText}>นก.</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.cumStudied }]}>
                                <Text style={styles.sumText}>{formatCredit(cumulativeSummary.basicStudied)}</Text>
                            </View>
                            <View style={[styles.sumCellNumLast, { width: SCOL.cumEarned }]}>
                                <Text style={styles.sumText}>{formatCredit(cumulativeSummary.basicEarned)}</Text>
                            </View>
                        </View>

                        {/* Row: เพิ่มเติม */}
                        <View style={styles.sumRow}>
                            <View style={styles.sumCellLabel}>
                                <Text style={styles.sumText}>เพิ่มเติม</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.currentStudied }]}>
                                <Text style={styles.sumText}>{formatCredit(currentSummary.additionalStudied)}</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.currentEarned }]}>
                                <Text style={styles.sumText}>{formatCredit(currentSummary.additionalEarned)}</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.unit }]}>
                                <Text style={styles.sumText}>นก.</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.cumStudied }]}>
                                <Text style={styles.sumText}>{formatCredit(cumulativeSummary.additionalStudied)}</Text>
                            </View>
                            <View style={[styles.sumCellNumLast, { width: SCOL.cumEarned }]}>
                                <Text style={styles.sumText}>{formatCredit(cumulativeSummary.additionalEarned)}</Text>
                            </View>
                        </View>

                        {/* Row: รวม */}
                        <View style={styles.sumRowThickBottom}>
                            <View style={styles.sumCellLabel}>
                                <Text style={styles.sumText}>รวม</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.currentStudied }]}>
                                <Text style={styles.sumText}>{formatCredit(currentSummary.totalStudied)}</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.currentEarned }]}>
                                <Text style={styles.sumText}>{formatCredit(currentSummary.totalEarned)}</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.unit }]}>
                                <Text style={styles.sumText}>นก.</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.cumStudied }]}>
                                <Text style={styles.sumText}>{formatCredit(cumulativeSummary.totalStudied)}</Text>
                            </View>
                            <View style={[styles.sumCellNumLast, { width: SCOL.cumEarned }]}>
                                <Text style={styles.sumText}>{formatCredit(cumulativeSummary.totalEarned)}</Text>
                            </View>
                        </View>

                        {/* Row: ผลการเรียนเฉลี่ย (GPA) */}
                        <View style={styles.sumGpaRow}>
                            <View style={{ width: SCOL.label + SCOL.currentStudied + SCOL.currentEarned + SCOL.unit, borderRightWidth: 0.8, borderRightColor: '#000', height: '100%', justifyContent: 'center', paddingLeft: 4 }}>
                                <Text style={styles.sumText}>ผลการเรียนเฉลี่ย (GPA)</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.cumStudied }]}>
                                <Text style={styles.sumText}>{formatGpa(currentSummary.gpa)}</Text>
                            </View>
                            <View style={[styles.sumCellNumLast, { width: SCOL.cumEarned }]}>
                                <Text style={styles.sumText}>{formatGpa(cumulativeSummary.gpa)}</Text>
                            </View>
                        </View>

                        {/* Row: อันดับที่ของห้อง */}
                        <View style={styles.sumRankRow}>
                            <View style={{ width: SCOL.label + SCOL.currentStudied + SCOL.currentEarned + SCOL.unit, borderRightWidth: 0.8, borderRightColor: '#000', height: '100%', justifyContent: 'center', paddingLeft: 4 }}>
                                <Text style={styles.sumText}>อันดับที่ของห้อง</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.cumStudied }]}>
                                <Text style={styles.sumText}>{formatRank(classRank)}</Text>
                            </View>
                            <View style={[styles.sumCellNumLast, { width: SCOL.cumEarned }]} />
                        </View>

                        {/* Row: อันดับที่ของระดับ */}
                        <View style={styles.sumRankRow}>
                            <View style={{ width: SCOL.label + SCOL.currentStudied + SCOL.currentEarned + SCOL.unit, borderRightWidth: 0.8, borderRightColor: '#000', height: '100%', justifyContent: 'center', paddingLeft: 4 }}>
                                <Text style={styles.sumText}>อันดับที่ของระดับ</Text>
                            </View>
                            <View style={[styles.sumCellNum, { width: SCOL.cumStudied }]}>
                                <Text style={styles.sumText}>{formatRank(gradeLevelRank)}</Text>
                            </View>
                            <View style={[styles.sumCellNumLast, { width: SCOL.cumEarned }]} />
                        </View>

                        {/* เกณฑ์การประเมิน (เชื่อมต่อด้านล่างในกรอบเดียวกัน) */}
                        <View style={styles.evalCriteriaBox}>
                            <Text style={styles.evalCriteriaTitle}>เกณฑ์การประเมิน</Text>
                            <Text>คุณลักษณะอันพึงประสงค์ การอ่าน คิดวิเคราะห์ และเขียน</Text>
                            <Text>3 = ดีเยี่ยม, 2 = ดี, 1 = ผ่านเกณฑ์, 0 = ต้องปรับปรุง</Text>
                            <Text>กิจกรรมพัฒนาผู้เรียน ผ = ผ่าน, มผ = ไม่ผ่าน</Text>
                        </View>
                    </View>

                    {/* พื้นที่ลงลายเซ็นด้านขวา */}
                    <View style={styles.signatureArea}>
                        {/* ลายเซ็นครูที่ปรึกษา */}
                        <View style={styles.advisorSignBlock}>
                            <View style={styles.signRow}>
                                <Text style={styles.fieldLabel}>ลงชื่อ </Text>
                                <Text style={styles.signDots}>....................................................................................</Text>
                                <Text style={styles.fieldLabel}> ครูที่ปรึกษา</Text>
                            </View>
                            <Text style={styles.advisorNames}>( {advisorLine} )</Text>
                        </View>

                        {/* ลายเซ็นผู้อำนวยการ */}
                        <View style={[styles.directorSignBlock, { marginTop: 12 }]}>
                            <View style={styles.signRow}>
                                <Text style={styles.fieldLabel}>ลงชื่อ </Text>
                                <Text style={styles.signDots}>............................................................</Text>
                            </View>
                            <View style={{ width: 200, alignItems: 'center', marginTop: 3 }}>
                                <Text style={styles.signSubText}>(  {schoolInfo.directorName || '............................................................'}  )</Text>
                                <Text style={[styles.signSubText, { marginTop: 1.5 }]}>ผู้อำนวยการ</Text>
                                <Text style={[styles.signSubText, { marginTop: 1.5 }]}>วันที่  {issueDate.day} {issueDate.month} {issueDate.year}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── กล่องความเห็นผู้ปกครองล่างสุด ── */}
                <View style={styles.parentBox} wrap={false}>
                    <View style={styles.parentLeft}>
                        <Text style={styles.parentTitle}>ความเห็นผู้ปกครอง</Text>
                        <Text style={styles.parentDotLine}>...................................................................................................................</Text>
                        <Text style={[styles.parentDotLine, { marginTop: 6 }]}>...................................................................................................................</Text>
                    </View>
                    <View style={styles.parentRight}>
                        <Text style={styles.parentTitle}>ทราบ</Text>
                        <Text style={styles.parentSignDots}>ลงชื่อ....................................................................................</Text>
                        <Text style={styles.parentLabel}>ผู้ปกครอง</Text>
                        <Text style={styles.parentDateDots}>............../................../..............</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
};

export default PorBor6ReportDocument;
