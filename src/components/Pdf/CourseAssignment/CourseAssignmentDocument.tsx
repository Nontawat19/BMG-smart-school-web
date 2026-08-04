import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { getGroupPersonnel } from '@/utils/schoolUtils';
import type { SchoolSettingsState } from '@/store/slices/schoolSettingsSlice';

try {
    Font.register({
        family: 'TH Sarabun PSK',
        fonts: [
            { src: '/fonts/THSarabunNew.ttf' },
            { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' }
        ]
    });
    // Prevents react-pdf from breaking Thai words mid-syllable when a line wraps.
    Font.registerHyphenationCallback((word) => [word]);
} catch (e) {
    console.error('Font registration failed:', e);
}

export interface CourseAssignmentPdfCourseRow {
    courseTitle: string;
    courseCode: string;
    levelLabel: string;
    credits: string;
    weeklyPeriods: number;
    groupsCount: number;
    totalSemesterHours: number;
    roomCodes: string;
}

export interface CourseAssignmentPdfTeacherGroup {
    teacherCode: string;
    teacherName: string;
    rows: CourseAssignmentPdfCourseRow[];
}

interface CourseAssignmentPdfFlatRow extends CourseAssignmentPdfCourseRow {
    teacherCode: string;
    teacherName: string;
    rowType: 'course' | 'summary';
    summaryLabel?: string;
    displayNo?: number;
}

interface CourseAssignmentDocumentProps {
    teacherGroups: CourseAssignmentPdfTeacherGroup[];
    schoolInfo: Partial<SchoolSettingsState>;
    subjectGroupLabel: string;
    academicYear: string;
    semesterLabel: string;
    subjectGroupHeadName?: string;
    subjectGroupHeadGroupLabel?: string;
    showSubjectGroupSignature?: boolean;
}

const parseCreditsValue = (credits: string) => {
    const value = Number(credits);
    return Number.isFinite(value) ? value : 0;
};

const formatCreditsValue = (credits: number) => {
    if (Number.isInteger(credits)) {
        return String(credits);
    }

    return credits.toFixed(1).replace(/\.0$/, '');
};

// Styled to match /academic/student-attendance-date-selection's PDF report: same font,
// margins, thin top rule, gray table-header, and page-number footer.
const styles = StyleSheet.create({
    page: {
        paddingTop: 30,
        paddingLeft: 44,
        paddingRight: 36,
        paddingBottom: 28,
        fontFamily: 'TH Sarabun PSK',
        fontSize: 14,
        color: '#000',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 0.8,
        borderBottomColor: '#5f5f5f',
        paddingBottom: 2,
        marginBottom: 4,
    },
    topText: { fontSize: 10.5, fontWeight: 'bold' },
    header: {
        position: 'relative',
        minHeight: 40,
        marginBottom: 6,
        justifyContent: 'center',
    },
    logoBox: {
        position: 'absolute',
        left: 0,
        top: -2,
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: { width: 38, height: 38, objectFit: 'contain' },
    titleBlock: { alignItems: 'center', paddingLeft: 44, paddingRight: 28, lineHeight: 1.15 },
    reportTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 1, textAlign: 'center' },
    reportSubtitle: { fontSize: 12.5, marginBottom: 1, textAlign: 'center' },
    table: { marginTop: 4 },
    row: { flexDirection: 'row', minHeight: 15.05 },
    headerRow: { backgroundColor: '#e5e5e5', minHeight: 16.6 },
    summaryRow: { backgroundColor: '#f2f2f2', minHeight: 15.5 },
    cell: {
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#000',
        justifyContent: 'center',
        paddingHorizontal: 2.25,
        paddingVertical: 1.2,
    },
    firstCell: {
        borderLeftWidth: 1,
        borderLeftColor: '#000',
    },
    topCell: {
        borderTopWidth: 1,
        borderTopColor: '#000',
    },
    centerCell: { alignItems: 'center', textAlign: 'center' },
    leftCell: { alignItems: 'flex-start', textAlign: 'left' },
    headerText: { fontSize: 11.2, fontWeight: 'bold', textAlign: 'center', lineHeight: 1.03 },
    bodyText: { fontSize: 10.95, lineHeight: 1.03 },
    summaryText: { fontSize: 10.95, lineHeight: 1.03, fontWeight: 'bold' },
    colNo: { width: '3%' },
    colTeacherCode: { width: '6%' },
    colTeacherName: { width: '16%' },
    colCourseTitle: { width: '24%' },
    colCourseCode: { width: '8%' },
    colLevel: { width: '7%' },
    colCredits: { width: '6%' },
    colWeekly: { width: '7%' },
    colGroups: { width: '7%' },
    colTotal: { width: '9%' },
    colRoom: { width: '7%' },
    pageNumber: { position: 'absolute', bottom: 10, right: 36, fontSize: 9.2 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 },
    signatureBlockThree: { width: '33.33%', alignItems: 'center', paddingHorizontal: 8 },
    signatureBlockTwo: { width: '45%', alignItems: 'center', paddingHorizontal: 8 },
    signaturePlaceholder: { fontSize: 12, color: '#000', textAlign: 'center', lineHeight: 1.2, marginTop: 10, marginBottom: 4 },
    signatureText: { fontSize: 12, color: '#000', textAlign: 'center', lineHeight: 1.4 },
});

export const CourseAssignmentDocument = ({
    teacherGroups,
    schoolInfo,
    subjectGroupLabel,
    academicYear,
    semesterLabel,
    subjectGroupHeadName,
    subjectGroupHeadGroupLabel,
    showSubjectGroupSignature = true
}: CourseAssignmentDocumentProps) => {
    // Keep each teacher block together so react-pdf can move the whole block to a new page
    // when the remaining space is not enough, instead of splitting the next teacher across pages.
    let runningNo = 0;
    const teacherBlocks = teacherGroups.map(group => {
        const rows: CourseAssignmentPdfFlatRow[] = group.rows.map((row, rowIndex) => {
            runningNo += 1;
            return {
                ...row,
                teacherCode: rowIndex === 0 ? group.teacherCode : '',
                teacherName: rowIndex === 0 ? group.teacherName : '',
                rowType: 'course',
                displayNo: runningNo,
            };
        });

        const summaryWeekly = group.rows.reduce((sum, row) => sum + row.weeklyPeriods, 0);
        const summaryGroups = group.rows.reduce((sum, row) => sum + row.groupsCount, 0);
        const summarySemesterHours = group.rows.reduce((sum, row) => sum + row.totalSemesterHours, 0);
        const summaryCredits = group.rows.reduce((sum, row) => sum + parseCreditsValue(row.credits), 0);

        const summaryRow: CourseAssignmentPdfFlatRow = {
            courseTitle: '',
            courseCode: '',
            levelLabel: '',
            credits: formatCreditsValue(summaryCredits),
            weeklyPeriods: summaryWeekly,
            groupsCount: summaryGroups,
            totalSemesterHours: summarySemesterHours,
            roomCodes: '',
            teacherCode: '',
            teacherName: '',
            rowType: 'summary',
            summaryLabel: `รวม ${group.teacherName || group.teacherCode || 'ครูผู้สอน'}`,
        };

        return {
            rows,
            summaryRow,
        };
    });

    const courseOnlyRows = teacherBlocks.flatMap(block => block.rows);
    const totalCredits = courseOnlyRows.reduce((sum, row) => sum + parseCreditsValue(row.credits), 0);
    const totalWeekly = courseOnlyRows.reduce((sum, r) => sum + r.weeklyPeriods, 0);
    const totalGroups = courseOnlyRows.reduce((sum, r) => sum + r.groupsCount, 0);
    const totalSemesterHours = courseOnlyRows.reduce((sum, r) => sum + r.totalSemesterHours, 0);
    const academicPersonnel = getGroupPersonnel(schoolInfo, 'academic');
    const schoolName = schoolInfo.schoolName || '';
    const isAllSubjectGroups = subjectGroupLabel.trim() === 'ทั้งหมด';
    const subjectGroupSuffix = isAllSubjectGroups ? '' : ` - กลุ่มสาระการเรียนรู้ ${subjectGroupLabel}`;
    const subjectGroupReportLine = isAllSubjectGroups
        ? `ภาคเรียนที่ ${semesterLabel} ปีการศึกษา ${academicYear}`
        : `กลุ่มสาระการเรียนรู้ ${subjectGroupLabel}   ภาคเรียนที่ ${semesterLabel} ปีการศึกษา ${academicYear}`;
    // Prefer the caller-resolved group label (works even when the export was narrowed by
    // picking one teacher rather than the subject-group filter); fall back to subjectGroupLabel.
    const resolvedSubjectGroupLabel = (subjectGroupHeadGroupLabel && subjectGroupHeadGroupLabel.trim())
        || (isAllSubjectGroups ? '' : subjectGroupLabel);
    const subjectGroupHeadLabel = resolvedSubjectGroupLabel
        ? `หัวหน้ากลุ่มสาระการเรียนรู้${resolvedSubjectGroupLabel}`
        : 'หัวหน้ากลุ่มสาระการเรียนรู้';
    const signatureBlockStyle = showSubjectGroupSignature ? styles.signatureBlockThree : styles.signatureBlockTwo;

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page} wrap>
                <View style={styles.topBar} fixed>
                    <Text style={styles.topText}>{schoolName}</Text>
                    <Text style={styles.topText}>
                        แผนการเปิดการจัดการเรียนการสอน{subjectGroupSuffix} ภาคเรียนที่ {semesterLabel} ปีการศึกษา {academicYear}
                    </Text>
                </View>

                <View style={styles.header}>
                    {schoolInfo.logoUrl && (
                        <View style={styles.logoBox}>
                            <Image src={schoolInfo.logoUrl} style={styles.logo} />
                        </View>
                    )}
                    <View style={styles.titleBlock}>
                        <Text style={styles.reportTitle}>แผนการเปิดการจัดการเรียนการสอน</Text>
                        <Text style={styles.reportSubtitle}>
                            {schoolName}{schoolInfo.affiliation ? ` ${schoolInfo.affiliation}` : ''}
                        </Text>
                        <Text style={styles.reportSubtitle}>
                            {subjectGroupReportLine}
                        </Text>
                    </View>
                </View>

                <View style={styles.table}>
                    <View style={[styles.row, styles.headerRow]} fixed>
                        <View style={[styles.cell, styles.firstCell, styles.topCell, styles.centerCell, styles.colNo]}><Text style={styles.headerText}>ที่</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colTeacherCode]}><Text style={styles.headerText}>รหัสครู</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colTeacherName]}><Text style={styles.headerText}>ชื่อ-สกุล (ครูผู้สอน)</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colCourseTitle]}><Text style={styles.headerText}>รายวิชา</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colCourseCode]}><Text style={styles.headerText}>รหัสวิชา</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colLevel]}><Text style={styles.headerText}>ชั้น/กลุ่ม</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colCredits]}><Text style={styles.headerText}>หน่วยกิต</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colWeekly]}><Text style={styles.headerText}>คาบ/สัปดาห์</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colGroups]}><Text style={styles.headerText}>จำนวนห้อง</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colTotal]}><Text style={styles.headerText}>รวมคาบที่สอน</Text></View>
                        <View style={[styles.cell, styles.topCell, styles.centerCell, styles.colRoom]}><Text style={styles.headerText}>รหัสห้อง</Text></View>
                    </View>

                    {teacherBlocks.map((block, blockIndex) => (
                        <View key={`teacher-block-${blockIndex}`} wrap={false}>
                            {block.rows.map((row, rowIndex) => (
                                <View key={`course-${row.courseCode}-${blockIndex}-${rowIndex}`} style={styles.row} wrap={false}>
                                    <View style={[styles.cell, styles.firstCell, styles.centerCell, styles.colNo]}><Text style={styles.bodyText}>{row.displayNo}</Text></View>
                                    <View style={[styles.cell, styles.centerCell, styles.colTeacherCode]}><Text style={styles.bodyText}>{row.teacherCode || ''}</Text></View>
                                    <View style={[styles.cell, styles.leftCell, styles.colTeacherName]}><Text style={styles.bodyText}>{row.teacherName || ''}</Text></View>
                                    <View style={[styles.cell, styles.leftCell, styles.colCourseTitle]}><Text style={styles.bodyText}>{row.courseTitle}</Text></View>
                                    <View style={[styles.cell, styles.centerCell, styles.colCourseCode]}><Text style={styles.bodyText}>{row.courseCode}</Text></View>
                                    <View style={[styles.cell, styles.centerCell, styles.colLevel]}><Text style={styles.bodyText}>{row.levelLabel}</Text></View>
                                    <View style={[styles.cell, styles.centerCell, styles.colCredits]}><Text style={styles.bodyText}>{row.credits}</Text></View>
                                    <View style={[styles.cell, styles.centerCell, styles.colWeekly]}><Text style={styles.bodyText}>{row.weeklyPeriods}</Text></View>
                                    <View style={[styles.cell, styles.centerCell, styles.colGroups]}><Text style={styles.bodyText}>{row.groupsCount}</Text></View>
                                    <View style={[styles.cell, styles.centerCell, styles.colTotal]}><Text style={styles.bodyText}>{row.totalSemesterHours}</Text></View>
                                    <View style={[styles.cell, styles.centerCell, styles.colRoom]}><Text style={styles.bodyText}>{row.roomCodes || '—'}</Text></View>
                                </View>
                            ))}

                            <View style={[styles.row, styles.summaryRow]} wrap={false}>
                                <View style={[styles.cell, styles.firstCell, styles.centerCell, { width: '64%' }]}>
                                    <Text style={styles.summaryText}>{block.summaryRow.summaryLabel}</Text>
                                </View>
                                <View style={[styles.cell, styles.centerCell, styles.colCredits]}><Text style={styles.summaryText}>{block.summaryRow.credits}</Text></View>
                                <View style={[styles.cell, styles.centerCell, styles.colWeekly]}><Text style={styles.summaryText}>{block.summaryRow.weeklyPeriods}</Text></View>
                                <View style={[styles.cell, styles.centerCell, styles.colGroups]}><Text style={styles.summaryText}>{block.summaryRow.groupsCount}</Text></View>
                                <View style={[styles.cell, styles.centerCell, styles.colTotal]}><Text style={styles.summaryText}>{block.summaryRow.totalSemesterHours}</Text></View>
                                <View style={[styles.cell, styles.centerCell, styles.colRoom]}><Text style={styles.summaryText}></Text></View>
                            </View>
                        </View>
                    ))}

                    <View style={[styles.row, styles.headerRow]} wrap={false}>
                        <View style={[styles.cell, styles.firstCell, styles.centerCell, { width: '64%' }]}><Text style={styles.headerText}>รวมทั้งสิ้น ({courseOnlyRows.length} รายการ)</Text></View>
                        <View style={[styles.cell, styles.centerCell, styles.colCredits]}><Text style={styles.headerText}>{formatCreditsValue(totalCredits)}</Text></View>
                        <View style={[styles.cell, styles.centerCell, styles.colWeekly]}><Text style={styles.headerText}>{totalWeekly}</Text></View>
                        <View style={[styles.cell, styles.centerCell, styles.colGroups]}><Text style={styles.headerText}>{totalGroups}</Text></View>
                        <View style={[styles.cell, styles.centerCell, styles.colTotal]}><Text style={styles.headerText}>{totalSemesterHours}</Text></View>
                        <View style={[styles.cell, styles.centerCell, styles.colRoom]}><Text style={styles.headerText}></Text></View>
                    </View>
                </View>

                <View style={styles.footer} wrap={false}>
                    <View style={signatureBlockStyle}>
                        <Text style={styles.signaturePlaceholder}>(........................................)</Text>
                        <Text style={styles.signatureText}>({academicPersonnel.name || '........................................'})</Text>
                        <Text style={[styles.signatureText, { fontWeight: 'bold' }]}>{academicPersonnel.label}</Text>
                    </View>
                    {showSubjectGroupSignature && (
                        <View style={signatureBlockStyle}>
                            <Text style={styles.signaturePlaceholder}>(........................................)</Text>
                            <Text style={styles.signatureText}>({subjectGroupHeadName || '........................................'})</Text>
                            <Text style={[styles.signatureText, { fontWeight: 'bold' }]}>{subjectGroupHeadLabel}</Text>
                        </View>
                    )}
                    <View style={signatureBlockStyle}>
                        <Text style={styles.signaturePlaceholder}>(........................................)</Text>
                        <Text style={styles.signatureText}>({schoolInfo.directorName || '........................................'})</Text>
                        <Text style={[styles.signatureText, { fontWeight: 'bold' }]}>ผู้อำนวยการโรงเรียน{schoolName}</Text>
                    </View>
                </View>

                <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`} fixed />
            </Page>
        </Document>
    );
};

export default CourseAssignmentDocument;
