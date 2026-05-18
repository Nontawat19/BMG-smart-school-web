import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';

/* ===================== TYPES ===================== */
export interface Teacher {
    id: string;
    name: string;
    displayName?: string;
    homeroomGrade?: string;
    preferences?: {
        unavailableSlots?: string[];
    };
}

export interface Club {
    id: string;
    name: string;
    responsibleTeacherIds: string[];
}

export interface Course {
    id: string;
    title: string;
    code: string;
    room?: string[];
    isCombined?: boolean;
<<<<<<< HEAD
    groupNumber?: number;
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
}

export interface ScheduleEntry {
    course: Course;
    className: string;
    roomDisplay?: string;
}

export interface SchoolInfo {
    schoolName?: string;
    subDistrict?: string;
    district?: string;
    province?: string;
    affiliation?: string;
    directorName?: string;
    academicHeadName?: string;
    logoUrl?: string;
}

export interface SpecialPeriod {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    day?: string;
    linkedPeriodId?: string;
}

export interface PeriodSetting {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
    isTeachingPeriod: boolean;
    isFixed?: boolean;
}

export type Schedule = Record<string, ScheduleEntry | null>;

/* ===================== CONSTANTS ===================== */
const DAYS: Record<string, string> = {
    mon: 'จันทร์',
    tue: 'อังคาร',
    wed: 'พุธ',
    thu: 'พฤหัสบดี',
    fri: 'ศุกร์',
};

// Map abbreviations to full names if needed
const FULL_CLASS_NAMES: Record<string, string> = {
    'อ.1': 'อนุบาลปีที่ 1', 'อ.2': 'อนุบาลปีที่ 2', 'อ.3': 'อนุบาลปีที่ 3',
    'ป.1': 'ประถมศึกษาปีที่ 1', 'ป.2': 'ประถมศึกษาปีที่ 2', 'ป.3': 'ประถมศึกษาปีที่ 3',
    'ป.4': 'ประถมศึกษาปีที่ 4', 'ป.5': 'ประถมศึกษาปีที่ 5', 'ป.6': 'ประถมศึกษาปีที่ 6',
    'ม.1': 'มัธยมศึกษาปีที่ 1', 'ม.2': 'มัธยมศึกษาปีที่ 2', 'ม.3': 'มัธยมศึกษาปีที่ 3',
    'ม.4': 'มัธยมศึกษาปีที่ 4', 'ม.5': 'มัธยมศึกษาปีที่ 5', 'ม.6': 'มัธยมศึกษาปีที่ 6',
};

/* ===================== PDF STYLES ===================== */
Font.register({
    family: 'TH Sarabun New',
    fonts: [
        { src: '/fonts/THSarabunNew.ttf' },
        { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' }
    ]
});

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: 'TH Sarabun New',
        fontSize: 12,
        // Removed justifyContent: 'center' to allow content to flow/break naturally
    },
    header: {
        marginBottom: 10,
        position: 'relative',
        minHeight: 60,
        justifyContent: 'center', // Vertically center if single line, but auto height handles multiline
    },
    headerLogoContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 60,
        height: 60,
        alignItems: 'center',
    },
    headerContent: {
        marginLeft: 70, // Push text to the right of the logo
        paddingRight: 10,
        textAlign: 'center',
    },
    logo: {
        width: 50,
        height: 50,
    },
    headerText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    subHeaderText: {
        fontSize: 14,
        marginBottom: 2
    },
    affiliationText: {
        fontSize: 14,
        marginBottom: 2,
    },
    table: {
        width: '100%',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#000',
    },
    row: {
        flexDirection: 'row',
        borderColor: '#000',
        minHeight: 52, // Increased from 45 to fit room info
        alignItems: 'stretch',
    },
    headerRow: {
        backgroundColor: '#f0f0f0',
        minHeight: 35,
    },
    cell: {
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#000',
        padding: 1,
        textAlign: 'center',
        justifyContent: 'center',
        fontSize: 12, // Increased from 10
    },
    dayCell: { width: '8%', fontWeight: 'bold' },
    periodCell: { flex: 1 },
    lunchCell: { width: '5%', padding: 0, alignItems: 'center', justifyContent: 'center' },

    // Content inside cells
    courseTitle: { fontWeight: 'bold', fontSize: 10, marginBottom: 1, paddingHorizontal: 2, lineHeight: 1.1 }, // Slightly reduced from 11
    courseCode: { fontSize: 9, marginBottom: 1, color: '#333' }, // Slightly reduced from 10
    className: { fontSize: 8, color: '#444', marginBottom: 1 }, // Slightly reduced from 9
<<<<<<< HEAD
    roomDisplay: { fontSize: 10, color: '#000', fontWeight: 'bold', marginBottom: 1, paddingHorizontal: 2, lineHeight: 1.1 },
=======
    roomDisplay: { fontSize: 8, color: '#10b981', fontWeight: 'bold' }, // Added for room info
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    // Summary Table Styles
    summaryTable: {
        marginTop: 25,
        width: '100%',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#e2e8f0',
        // Removed overflow: hidden and borderRadius to support pagination
    },
    summaryRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#e2e8f0',
        minHeight: 35, // Taller rows
        alignItems: 'stretch',
    },
    summaryHeader: {
        backgroundColor: '#4f46e5', // Indigo-600
        color: '#ffffff',
        minHeight: 40,
    },
    summaryCell: {
        padding: 8,
        fontSize: 10,
        textAlign: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#e2e8f0',
    },
    summaryCellLast: {
        borderRightWidth: 0,
    },
    colNo: { width: '8%' },
    colCourseTitle: { width: '27%', textAlign: 'center' },
    colCourseCode: { width: '15%', textAlign: 'center' },
    colClass: { width: '25%' },
    colPeriods: { width: '12.5%' },
    colCredits: { width: '12.5%' },

    // Footer
    footer: {
        marginTop: 30,
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    signatureBlock: {
        width: '30%',
        alignItems: 'center',
    },
    signatureLine: {
        marginTop: 30,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#94a3b8', // Slate-400
        borderStyle: 'dotted',
        width: '100%',
        height: 1,
    },
    signatureText: {
        fontSize: 10,
        color: '#475569', // Slate-600
        textAlign: 'center',
        lineHeight: 1.4,
    },
    totalPeriods: {
        marginTop: 10,
        textAlign: 'right',
        fontSize: 10,
        fontWeight: 'bold',
        paddingRight: 20,
    }
});

/* ===================== PROPS TYPES ===================== */
interface TeacherSchedulePDFProps {
    schedule: Schedule;
    periodSettings: PeriodSetting[];
    schoolInfo: SchoolInfo;
    teacher: Teacher | null;
    academicYear: string;
    currentTerm: string;
    specialPeriods: SpecialPeriod[];
    totalPeriods: number;
    clubs?: Club[];
}

interface BulkTeacherSchedulePDFProps {
    data: Array<{
        teacher: Teacher;
        schedule: Schedule;
        totalPeriods: number;
    }>;
    periodSettings: PeriodSetting[];
    schoolInfo: SchoolInfo;
    academicYear: string;
    currentTerm: string;
    specialPeriods: SpecialPeriod[];
    clubs?: Club[];
}

interface CourseSummary {
    code: string;
    title: string;
    classes: string[];
    periods: number;
    credits: number;
}

const TeacherRoleText = ({ teacher }: { teacher: Teacher | null }) => {
    if (!teacher) return <Text></Text>;
    const role = teacher.homeroomGrade ? (teacher.homeroomGrade.startsWith('ม') ? 'ครูที่ปรึกษา ' : 'ครูประจำชั้น ') : 'ครูผู้สอน';
    const grade = teacher.homeroomGrade ? (FULL_CLASS_NAMES[teacher.homeroomGrade] || teacher.homeroomGrade) : '';
    return <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{role}{grade}</Text>;
};

const TeacherRoleWithGradeText = ({ teacher }: { teacher: Teacher | null }) => {
    if (!teacher) return <Text></Text>;
    const role = teacher.homeroomGrade ? (teacher.homeroomGrade.startsWith('ม') ? 'ครูที่ปรึกษาชั้น' : 'ครูประจำชั้น') : 'ครูผู้สอน';
    const grade = teacher.homeroomGrade ? (FULL_CLASS_NAMES[teacher.homeroomGrade] || teacher.homeroomGrade) : '';
    return <Text>{teacher.homeroomGrade ? ` ${role}${grade}` : ''}</Text>;
}

/* ===================== HELPERS ===================== */
export const generateCourseSummary = (schedule: Schedule, teacher?: Teacher | null, clubs?: Club[]): CourseSummary[] => {
    const summaryMap: Record<string, CourseSummary> = {};

    Object.values(schedule).forEach(entry => {
        if (!entry) return;
        const { course, className } = entry;
<<<<<<< HEAD
        const groupNumber = course.groupNumber || 1;
        const key = `${course.id || `${course.code}-${course.title}`}-${groupNumber}`;
=======
        const key = `${course.code}-${course.title}`; // Group by code + title to be safe
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

        if (!summaryMap[key]) {
            summaryMap[key] = {
                code: course.code,
                title: course.title,
                classes: [],
                periods: 0,
                credits: 0 // Will calc later
            };
        }

        const classList = className.split(',').map(s => s.trim());
        classList.forEach(cls => {
            if (cls && !summaryMap[key].classes.includes(cls)) {
                summaryMap[key].classes.push(cls);
            }
        });

        summaryMap[key].periods += 1;
    });

    const summaryList = Object.values(summaryMap).map(item => ({
        ...item,
        classes: item.classes.sort(),
        credits: item.periods / 2 // Assumption: 2 periods = 1 credit or 0.5 per period? Usually 1.5 credits = 3 periods/week. Let's stick to user request "2 periods = 1 credit" approx or standard logic.
        // Actually standard Thai school:
        // 40 hours/term = 1.0 credit. (20 weeks * 2 periods/week)
        // So 2 periods/week = 1.0 credit is standard.
    })).sort((a, b) => a.code.localeCompare(b.code));

    // Append Clubs
    if (teacher && clubs) {
        const teacherClubs = clubs.filter(c => c.responsibleTeacherIds.includes(teacher.id));
        teacherClubs.forEach(club => {
            summaryList.push({
                code: 'กิจกรรม',
                title: club.name,
                classes: ['-'], // Or leave empty
                periods: 1, // Assumption per user request
                credits: 0
            });
        });
    }

    return summaryList;
};

const CourseSummaryPage = ({
    summary,
    schoolInfo,
    teacher,
    academicYear,
    currentTerm,
    totalPeriods
}: {
    summary: CourseSummary[],
    schoolInfo: SchoolInfo,
    teacher: Teacher | null,
    academicYear: string,
    currentTerm: string,
    totalPeriods: number
}) => {
    const teacherName = teacher?.name || '';
    const teacherDisplayName = teacher?.displayName || teacherName;

    return (
        <Page size="A4" orientation="portrait" style={styles.page}>
            <View style={styles.header}>
                <View style={styles.headerLogoContainer}>
                    {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} style={styles.logo} />}
                </View>
                <View style={styles.headerContent}>
                    <Text style={styles.headerText}>
                        สรุปภาระงานสอน
                    </Text>
                    <Text style={styles.subHeaderText}>
                        คุณครู {teacherDisplayName}
                        <TeacherRoleWithGradeText teacher={teacher} />
                        {currentTerm && academicYear && ` ภาคเรียนที่ ${currentTerm} ปีการศึกษา ${academicYear}`}
                    </Text>
                    <Text style={styles.affiliationText}>{schoolInfo.affiliation || 'สังกัด...'}</Text>
                </View>
            </View>

            <View style={styles.summaryTable}>
                {/* Header */}
                <View style={[styles.summaryRow, styles.summaryHeader]} fixed>
                    <View style={[styles.summaryCell, styles.colNo, { borderColor: '#6366f1' }]}><Text>ที่</Text></View>
                    <View style={[styles.summaryCell, styles.colCourseTitle, { borderColor: '#6366f1' }]}><Text>ชื่อวิชา</Text></View>
                    <View style={[styles.summaryCell, styles.colCourseCode, { borderColor: '#6366f1' }]}><Text>รหัสวิชา</Text></View>
                    <View style={[styles.summaryCell, styles.colClass, { borderColor: '#6366f1' }]}><Text>ระดับชั้น</Text></View>
                    <View style={[styles.summaryCell, styles.colPeriods, { borderColor: '#6366f1' }]}><Text>จำนวนคาบ</Text></View>
                    <View style={[styles.summaryCell, styles.colCredits, styles.summaryCellLast, { borderColor: '#6366f1' }]}><Text>หน่วยกิต</Text></View>
                </View>

                {/* Rows */}
                {summary.map((item, index) => (
                    <View key={index} style={[styles.summaryRow, { backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }]}>
                        <View style={[styles.summaryCell, styles.colNo]}><Text>{index + 1}</Text></View>
                        <View style={[styles.summaryCell, styles.colCourseTitle]}>
                            <Text>{item.title}</Text>
                        </View>
                        <View style={[styles.summaryCell, styles.colCourseCode]}>
                            <Text>{item.code}</Text>
                        </View>
                        <View style={[styles.summaryCell, styles.colClass]}>
                            <Text>{item.classes.join(', ')}</Text>
                        </View>
                        <View style={[styles.summaryCell, styles.colPeriods]}><Text>{item.periods}</Text></View>
                        <View style={[styles.summaryCell, styles.colCredits, styles.summaryCellLast]}><Text>{item.credits}</Text></View>
                    </View>
                ))}

                {/* Total Row */}
                <View style={[styles.summaryRow, { backgroundColor: '#f1f5f9', borderBottomWidth: 0 }]}>
                    <View style={[styles.summaryCell, { width: '75%', textAlign: 'center', borderRightWidth: 1, borderRightColor: '#e2e8f0' }]}><Text style={{ fontWeight: 'bold', fontSize: 11 }}>รวมทั้งสิ้น</Text></View>
                    <View style={[styles.summaryCell, styles.colPeriods]}><Text style={{ fontWeight: 'bold' }}>{totalPeriods}</Text></View>
                    <View style={[styles.summaryCell, styles.colCredits, styles.summaryCellLast]}><Text style={{ fontWeight: 'bold' }}>{summary.reduce((sum, item) => sum + item.credits, 0)}</Text></View>
                </View>
            </View>


        </Page>
    );
};


/* ===================== COMPONENT ===================== */
export const TeacherSchedulePDF = ({
    schedule,
    periodSettings,
    schoolInfo,
    teacher,
    academicYear,
    currentTerm,
    specialPeriods,
    totalPeriods,
    clubs = []
}: TeacherSchedulePDFProps) => {
    const teacherName = teacher?.name || '';
    const teacherDisplayName = teacher?.displayName || teacherName;
    const summary = generateCourseSummary(schedule, teacher, clubs);

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>

                <View style={styles.header}>
                    <View style={styles.headerLogoContainer}>
                        {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} style={styles.logo} />}
                    </View>
                    <View style={styles.headerContent}>
                        <Text style={styles.headerText}>
                            ตารางสอนคุณครู {teacherDisplayName}
                            <TeacherRoleWithGradeText teacher={teacher} />
                            {currentTerm && academicYear && ` ภาคเรียนที่ ${currentTerm} ปีการศึกษา ${academicYear}`}
                        </Text>
                        <Text style={styles.subHeaderText}>
                            {schoolInfo.schoolName ? `โรงเรียน${schoolInfo.schoolName} ` : ''}
                            {schoolInfo.subDistrict ? `ต.${schoolInfo.subDistrict} ` : ''}
                            {schoolInfo.district ? `อ.${schoolInfo.district} ` : ''}
                            {schoolInfo.province ? `จ.${schoolInfo.province}` : ''}
                        </Text>
                        <Text style={styles.affiliationText}>{schoolInfo.affiliation || 'สังกัด...'}</Text>
                    </View>
                </View>



                {/* Table */}
                <View style={styles.table}>
                    {/* Header Row */}
                    <View style={[styles.row, styles.headerRow]}>
                        <View style={[styles.cell, styles.dayCell]}><Text>วัน / เวลา</Text></View>
                        {periodSettings.map((p) => (
                            <View key={p.id} style={[styles.cell, p.id === 'lunch' ? styles.lunchCell : styles.periodCell]}>
                                {p.id === 'lunch' ? (
                                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{p.label}</Text>
                                        <Text style={{ fontSize: 6 }}>{p.startTime} - {p.endTime}</Text>
                                    </View>
                                ) : (
                                    <>
                                        <Text style={{ fontWeight: 'bold', fontSize: 10 }}>{p.label}</Text>
                                        <Text style={{ fontSize: 8 }}>{p.startTime} - {p.endTime}</Text>
                                    </>
                                )}
                            </View>
                        ))}
                    </View>

                    {/* Data Rows */}
                    {Object.entries(DAYS).map(([dayKey, dayName], dayIndex) => (
                        <View key={dayKey} style={styles.row}>
                            <View style={[styles.cell, styles.dayCell]}><Text>{dayName}</Text></View>
                            {periodSettings.map((period) => {
                                if (period.id === 'lunch') {
                                    const isLastRow = dayIndex === Object.keys(DAYS).length - 1;
                                    return (
                                        <View key="lunch" style={[styles.cell, styles.lunchCell, { borderBottomWidth: isLastRow ? 1 : 0 }]}>
                                            {dayIndex === 2 && (
                                                <Text style={{ transform: 'rotate(-90deg)', width: 80, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>
                                                    พักกลางวัน
                                                </Text>
                                            )}
                                        </View>
                                    );
                                }

                                const teachingPeriodNumber = period.isTeachingPeriod ? parseInt(period.id.replace('period-', '')) : null;
                                const slot = teachingPeriodNumber ? `${dayKey}-${teachingPeriodNumber}` : null;
                                const entry = slot ? schedule[slot] : null;
                                const isUnavailable = slot && teacher?.preferences?.unavailableSlots?.includes(slot);

                                const getSpecialPeriod = (day: string, periodSetting: PeriodSetting) => {
                                    const { id, startTime, endTime } = periodSetting;
                                    return specialPeriods.find(sp =>
                                        (sp.linkedPeriodId === id && (!sp.day || sp.day === 'all' || sp.day === day)) ||
                                        (sp.startTime === startTime && sp.endTime === endTime && (!sp.day || sp.day === 'all' || sp.day === day))
                                    );
                                };
                                const special = getSpecialPeriod(dayKey, period);
                                const specialTitle = special?.title;

                                let displayText = specialTitle || period.label || '';
                                if (displayText.startsWith('กิจกรรม') && displayText.length > 8) {
                                    displayText = displayText.replace('กิจกรรม', 'กิจกรรม\n');
                                }
                                const isMultiLine = displayText.includes('\n');
                                const fontSize = isMultiLine ? 10 : (displayText.length > 15 ? 10 : 12);

                                return (
                                    <View key={slot || `${dayKey}-special`} style={[styles.cell, styles.periodCell, isUnavailable ? { backgroundColor: '#f0f0f0' } : {}]}>
                                        {entry ? (
                                            <>
                                                <Text style={styles.courseTitle}>{entry.course.title}</Text>
                                                <Text style={styles.courseCode}>{entry.course.code}</Text>
                                                <Text style={styles.className}>{entry.className}</Text>
                                                {entry.roomDisplay && <Text style={styles.roomDisplay}>{entry.roomDisplay}</Text>}
                                            </>
                                        ) : isUnavailable ? (
                                            <Text style={{ color: '#888', fontSize: 10 }}>คาบว่าง</Text>
                                        ) : specialTitle || !period.isTeachingPeriod ? (
                                            <Text style={{
                                                fontWeight: 'bold',
                                                fontSize: fontSize,
                                                textAlign: 'center',
                                                lineHeight: 1.1,
                                                paddingHorizontal: 0,
                                            }}>
                                                {displayText + ' '}
                                            </Text>
                                        ) : null}
                                    </View>
                                );
                            })}
                        </View>
                    ))}
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <View style={styles.signatureBlock}>
                        <View style={styles.signatureLine} />
                        <Text style={styles.signatureText}>({teacherName || '........................................'})</Text>
                        <Text style={styles.signatureText}><TeacherRoleText teacher={teacher} /></Text>
                    </View>
                    <View style={styles.signatureBlock}>
                        <View style={styles.signatureLine} />
                        <Text style={styles.signatureText}>({schoolInfo.academicHeadName || '........................................'})</Text>
                        <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>หัวหน้าวิชาการ</Text>
                    </View>
                    <View style={styles.signatureBlock}>
                        <View style={styles.signatureLine} />
                        <Text style={styles.signatureText}>({schoolInfo.directorName || '........................................'})</Text>
                        <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>ผู้อำนวยการโรงเรียน{schoolInfo.schoolName || ''}</Text>
                    </View>
                </View>

                <Text style={styles.totalPeriods}>จำนวน {totalPeriods} คาบ / สัปดาห์</Text>
            </Page>

            {/* Page 2: Course Summary */}
            <CourseSummaryPage
                summary={summary}
                schoolInfo={schoolInfo}
                teacher={teacher}
                academicYear={academicYear}
                currentTerm={currentTerm}
                totalPeriods={totalPeriods}
            />
        </Document>
    );
};

export const BulkTeacherSchedulePDF = ({
    data,
    periodSettings,
    schoolInfo,
    academicYear,
    currentTerm,
    specialPeriods,
    clubs = []
}: BulkTeacherSchedulePDFProps) => {
    return (
        <Document>
            {data.map((item, index) => {
                const summary = generateCourseSummary(item.schedule, item.teacher, clubs);
                return (
                    <React.Fragment key={index}>
                        <Page size="A4" orientation="landscape" style={styles.page}>
                            <View style={styles.header}>
                                <View style={styles.headerLogoContainer}>
                                    {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} style={styles.logo} />}
                                </View>
                                <View style={styles.headerContent}>
                                    <Text style={styles.headerText}>
                                        ตารางสอนคุณครู {item.teacher.displayName || item.teacher.name}
                                        <TeacherRoleWithGradeText teacher={item.teacher} />
                                        {currentTerm && academicYear && ` ภาคเรียนที่ ${currentTerm} ปีการศึกษา ${academicYear}`}
                                    </Text>
                                    <Text style={styles.subHeaderText}>
                                        {schoolInfo.schoolName ? `โรงเรียน${schoolInfo.schoolName} ` : ''}
                                        {schoolInfo.subDistrict ? `ต.${schoolInfo.subDistrict} ` : ''}
                                        {schoolInfo.district ? `อ.${schoolInfo.district} ` : ''}
                                        {schoolInfo.province ? `จ.${schoolInfo.province}` : ''}
                                    </Text>
                                    <Text style={styles.affiliationText}>{schoolInfo.affiliation || 'สังกัด...'}</Text>
                                </View>
                            </View>

                            <View style={styles.table}>
                                <View style={[styles.row, styles.headerRow]}>
                                    <View style={[styles.cell, styles.dayCell]}><Text>วัน / เวลา</Text></View>
                                    {periodSettings.map((p) => (
                                        <View key={p.id} style={[styles.cell, p.id === 'lunch' ? styles.lunchCell : styles.periodCell]}>
                                            {p.id === 'lunch' ? (
                                                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{p.label}</Text>
                                                    <Text style={{ fontSize: 6 }}>{p.startTime} - {p.endTime}</Text>
                                                </View>
                                            ) : (
                                                <>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 10 }}>{p.label}</Text>
                                                    <Text style={{ fontSize: 8 }}>{p.startTime} - {p.endTime}</Text>
                                                </>
                                            )}
                                        </View>
                                    ))}
                                </View>

                                {Object.entries(DAYS).map(([dayKey, dayName], dayIndex) => (
                                    <View key={dayKey} style={styles.row}>
                                        <View style={[styles.cell, styles.dayCell]}><Text>{dayName}</Text></View>
                                        {periodSettings.map((period) => {
                                            if (period.id === 'lunch') {
                                                const isLastRow = dayIndex === Object.keys(DAYS).length - 1;
                                                return (
                                                    <View key="lunch" style={[styles.cell, styles.lunchCell, { borderBottomWidth: isLastRow ? 1 : 0 }]}>
                                                        {dayIndex === 2 && (
                                                            <Text style={{ transform: 'rotate(-90deg)', width: 100, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>
                                                                พักกลางวัน
                                                            </Text>
                                                        )}
                                                    </View>
                                                );
                                            }

                                            const teachingPeriodNumber = period.isTeachingPeriod ? parseInt(period.id.replace('period-', '')) : null;
                                            const slot = teachingPeriodNumber ? `${dayKey}-${teachingPeriodNumber}` : null;
                                            const entry = slot ? item.schedule[slot] : null;
                                            const isUnavailable = slot && item.teacher?.preferences?.unavailableSlots?.includes(slot);

                                            const getSpecialPeriod = (day: string, periodSetting: PeriodSetting) => {
                                                const { id, startTime, endTime } = periodSetting;
                                                return specialPeriods.find(sp =>
                                                    (sp.linkedPeriodId === id && (!sp.day || sp.day === 'all' || sp.day === day)) ||
                                                    (sp.startTime === startTime && sp.endTime === endTime && (!sp.day || sp.day === 'all' || sp.day === day))
                                                );
                                            };
                                            const special = getSpecialPeriod(dayKey, period);
                                            const specialTitle = special?.title;

                                            let displayText = specialTitle || period.label || '';

                                            if (displayText.startsWith('กิจกรรม') && displayText.length > 8) {
                                                displayText = displayText.replace('กิจกรรม', 'กิจกรรม\n');
                                            }

                                            const isMultiLine = displayText.includes('\n');
                                            const fontSize = isMultiLine ? 10 : (displayText.length > 15 ? 10 : 12);

                                            return (
                                                <View key={slot || `${dayKey}-special`} style={[styles.cell, styles.periodCell, isUnavailable ? { backgroundColor: '#f0f0f0' } : {}]}>
                                                    {entry ? (
                                                        <>
                                                            <Text style={styles.courseTitle}>{entry.course.title}</Text>
                                                            <Text style={styles.courseCode}>{entry.course.code}</Text>
                                                            <Text style={styles.className}>{entry.className}</Text>
<<<<<<< HEAD
                                                            {entry.roomDisplay && <Text style={styles.roomDisplay}>{entry.roomDisplay}</Text>}
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                        </>
                                                    ) : isUnavailable ? (
                                                        <Text style={{ color: '#888', fontSize: 10 }}>คาบว่าง</Text>
                                                    ) : specialTitle || !period.isTeachingPeriod ? (
                                                        <Text style={{
                                                            fontWeight: 'bold',
                                                            fontSize: fontSize,
                                                            textAlign: 'center',
                                                            lineHeight: 1.1,
                                                            paddingHorizontal: 0,
                                                        }}>
                                                            {displayText + ' '}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>

                            <View style={styles.footer}>
                                <View style={styles.signatureBlock}>
                                    <View style={styles.signatureLine} />
                                    <Text style={styles.signatureText}>({item.teacher.name || '........................................'})</Text>
                                    <Text style={styles.signatureText}><TeacherRoleText teacher={item.teacher} /></Text>
                                </View>
                                <View style={styles.signatureBlock}>
                                    <View style={styles.signatureLine} />
                                    <Text style={styles.signatureText}>({schoolInfo.academicHeadName || '........................................'})</Text>
                                    <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>หัวหน้าวิชาการ</Text>
                                </View>
                                <View style={styles.signatureBlock}>
                                    <View style={styles.signatureLine} />
                                    <Text style={styles.signatureText}>({schoolInfo.directorName || '........................................'})</Text>
                                    <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>ผู้อำนวยการโรงเรียน{schoolInfo.schoolName || ''}</Text>
                                </View>
                            </View>

                            <Text style={styles.totalPeriods}>จำนวน {item.totalPeriods} คาบ / สัปดาห์</Text>
                        </Page>
                        <CourseSummaryPage
                            summary={summary}
                            schoolInfo={schoolInfo}
                            teacher={item.teacher}
                            academicYear={academicYear}
                            currentTerm={currentTerm}
                            totalPeriods={item.totalPeriods}
                        />
                    </React.Fragment>
                );
            })}
        </Document>)
};
