import React, { useMemo } from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { Student, GradeRecord } from './types';
import PdfPage from './PdfPage';

interface FormativeScoresPageProps {
    academicYear: string;
    selectedClass: string;
    termToDisplay: string;
    CLASSES: Record<string, string>;
    FULL_CLASSES?: Record<string, string>;
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
}

// --- CONSTANTS ---
const ROWS_PER_PAGE = 25; // บังคับ 25 แถว
const ROW_HEIGHT = 22;    // ความสูงแถว

// Column Widths (Portrait)
const SCORE_COL_WIDTH = 13;
const TOTAL_COL_WIDTH = 18;
const NO_COL_WIDTH = 18;
const ID_COL_WIDTH = 32;

const SECTION_WIDTH_6 = (SCORE_COL_WIDTH * 6) + TOTAL_COL_WIDTH;
const SECTION_WIDTH_4 = (SCORE_COL_WIDTH * 4) + TOTAL_COL_WIDTH;

const borderColor = '#000000';

const styles = StyleSheet.create({
    headerSection: {
        textAlign: 'center',
        marginBottom: 5,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
    },
    bold: {
        fontWeight: 'bold',
    },
    pageNumber: {
        position: 'absolute',
        top: 0,
        right: 0,
        fontSize: 10,
    },
    table: {
        width: '100%',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: borderColor,
        fontSize: 9,
        flexDirection: 'column',
        flexGrow: 1,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'stretch',
        flexGrow: 1,
        minHeight: ROW_HEIGHT,
    },
    cell: {
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: borderColor,
        textAlign: 'center',
        justifyContent: 'center',
        padding: 0.5,
    },
    colNo: { width: NO_COL_WIDTH },
    colId: { width: ID_COL_WIDTH },
    colName: { flex: 1, textAlign: 'left', paddingLeft: 4, justifyContent: 'center' },
    colScore: { width: SCORE_COL_WIDTH },
    colTotal: { width: TOTAL_COL_WIDTH },
    bgGray: { backgroundColor: '#D1D5DB' },
    verticalTextContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
    },
    verticalText: {
        transform: 'rotate(-90deg)',
    },
});

const FormativeScoresPage: React.FC<FormativeScoresPageProps> = ({
    academicYear,
    selectedClass,
    termToDisplay,
    CLASSES,
    FULL_CLASSES,
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
}) => {

    // 1. เรียงลำดับนักเรียนตามเลขที่ (Numeric Sort) ก่อนแสดงผล
    const sortedStudents = useMemo(() => {
        return [...studentChunk].sort((a, b) => {
            const numA = parseInt(a.studentNumber || '0', 10);
            const numB = parseInt(b.studentNumber || '0', 10);
            return numA - numB;
        });
    }, [studentChunk]);

    // 2. คำนวณแถวว่างเพื่อให้ครบ 25 แถวเสมอ
    const emptyRowsCount = Math.max(0, ROWS_PER_PAGE - sortedStudents.length);
    const emptyRows = Array.from({ length: emptyRowsCount });

    return (
        <PdfPage>

            {/* Header */}
            <View style={styles.headerSection} fixed>
                <Text style={styles.title}>คะแนนระหว่างเรียน</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                    <Text style={styles.subtitle}>
                        ชั้น {curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''} ภาคเรียนที่ {termToDisplay} ปีการศึกษา {academicYear}
                    </Text>
                </View>
            </View>

            {/* Table */}
            <View style={styles.table}>

                {/* --- HEADER --- */}
                <View style={[styles.row, { height: 60 }]} fixed>
                    <View style={[styles.cell, styles.colNo]}>
                        <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>เลขที่</Text></View>
                    </View>
                    <View style={[styles.cell, styles.colId]}>
                        <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>เลขประจำตัว</Text></View>
                    </View>
                    <View style={[styles.cell, styles.colName, { alignItems: 'center', paddingLeft: 0 }]}>
                        <Text>ชื่อ - สกุล</Text>
                    </View>

                    <View style={{ flexDirection: 'column' }}>
                        {/* Row 1: Categories */}
                        <View style={[styles.row, { height: 20 }]}>
                            <View style={[styles.cell, { width: SECTION_WIDTH_6 }]}>
                                <Text>ก่อนกลางภาค ({preMidtermTotal})</Text>
                            </View>
                            <View style={[styles.cell, { width: SECTION_WIDTH_6 }]}>
                                <Text>กลางภาค ({midtermMax})</Text>
                            </View>
                            <View style={[styles.cell, { width: SECTION_WIDTH_6 }]}>
                                <Text>หลังกลางภาค ({postMidtermTotal})</Text>
                            </View>
                            <View style={[styles.cell, { width: SECTION_WIDTH_4 }]}>
                                <Text>ปลายภาค ({finalMax})</Text>
                            </View>
                        </View>

                        {/* Row 2: Sub-indices */}
                        <View style={[styles.row, { height: 20 }]}>
                            {[1, 2, 3, 4, 5, 6].map(i => <View key={`p-${i}`} style={[styles.cell, styles.colScore]}><Text>{i}</Text></View>)}
                            <View style={[styles.cell, styles.colTotal]}><Text>รวม</Text></View>
                            {[1, 2, 3, 4, 5, 6].map(i => <View key={`m-${i}`} style={[styles.cell, styles.colScore]}><Text>{i}</Text></View>)}
                            <View style={[styles.cell, styles.colTotal]}><Text>รวม</Text></View>
                            {[1, 2, 3, 4, 5, 6].map(i => <View key={`po-${i}`} style={[styles.cell, styles.colScore]}><Text>{i}</Text></View>)}
                            <View style={[styles.cell, styles.colTotal]}><Text>รวม</Text></View>
                            {[1, 2, 3, 4].map(i => <View key={`f-${i}`} style={[styles.cell, styles.colScore]}><Text>{i}</Text></View>)}
                            <View style={[styles.cell, styles.colTotal]}><Text>รวม</Text></View>
                        </View>

                        {/* Row 3: Max Scores */}
                        <View style={[styles.row, { height: 20 }]}>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <View key={`pm-${i}`} style={[styles.cell, styles.colScore, !preMidtermAssessments[i] ? styles.bgGray : {}]}>
                                    <Text>{preMidtermAssessments[i]?.maxScore || ''}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.colTotal]}><Text>{preMidtermTotal}</Text></View>

                            {Array.from({ length: 6 }).map((_, i) => (
                                <View key={`mm-${i}`} style={[styles.cell, styles.colScore, i !== 0 ? styles.bgGray : {}]}>
                                    <Text>{i === 0 ? midtermMax : ''}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.colTotal]}><Text>{midtermMax}</Text></View>

                            {Array.from({ length: 6 }).map((_, i) => (
                                <View key={`pom-${i}`} style={[styles.cell, styles.colScore, !postMidtermAssessments[i] ? styles.bgGray : {}]}>
                                    <Text>{postMidtermAssessments[i]?.maxScore || ''}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.colTotal]}><Text>{postMidtermTotal}</Text></View>

                            {Array.from({ length: 4 }).map((_, i) => (
                                <View key={`fm-${i}`} style={[styles.cell, styles.colScore, i !== 0 ? styles.bgGray : {}]}>
                                    <Text>{i === 0 ? finalMax : ''}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.colTotal]}><Text>{finalMax}</Text></View>
                        </View>
                    </View>
                </View>

                {/* --- BODY: REAL STUDENTS (SORTED) --- */}
                {sortedStudents.map((s) => {
                    const preTotal = preMidtermAssessments.reduce((sum, a) => sum + (grades[s.id]?.formativeDetails?.[a.id] || 0), 0);
                    const postTotal = postMidtermAssessments.reduce((sum, a) => sum + (grades[s.id]?.formativeDetails?.[a.id] || 0), 0);

                    return (
                        <View key={s.id} style={styles.row}>
                            <View style={[styles.cell, styles.colNo]}><Text>{s.studentNumber}</Text></View>
                            <View style={[styles.cell, styles.colId]}><Text>{s.studentId}</Text></View>
                            <View style={[styles.cell, styles.colName]}><Text>{formatPrefix(s.title) + s.firstName + ' ' + s.lastName}</Text></View>

                            {Array.from({ length: 6 }).map((_, i) => (
                                <View key={`ps-${i}`} style={[styles.cell, styles.colScore, !preMidtermAssessments[i] ? styles.bgGray : {}]}>
                                    <Text>{preMidtermAssessments[i] ? (grades[s.id]?.formativeDetails?.[preMidtermAssessments[i].id] || '') : ''}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.colTotal]}><Text>{preTotal || ''}</Text></View>

                            {Array.from({ length: 6 }).map((_, i) => (
                                <View key={`ms-${i}`} style={[styles.cell, styles.colScore, i !== 0 ? styles.bgGray : {}]}>
                                    <Text>{i === 0 ? (grades[s.id]?.midterm || '') : ''}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.colTotal]}><Text>{grades[s.id]?.midterm || ''}</Text></View>

                            {Array.from({ length: 6 }).map((_, i) => (
                                <View key={`pos-${i}`} style={[styles.cell, styles.colScore, !postMidtermAssessments[i] ? styles.bgGray : {}]}>
                                    <Text>{postMidtermAssessments[i] ? (grades[s.id]?.formativeDetails?.[postMidtermAssessments[i].id] || '') : ''}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.colTotal]}><Text>{postTotal || ''}</Text></View>

                            {Array.from({ length: 4 }).map((_, i) => (
                                <View key={`fs-${i}`} style={[styles.cell, styles.colScore, i !== 0 ? styles.bgGray : {}]}>
                                    <Text>{i === 0 ? (grades[s.id]?.final || '') : ''}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.colTotal]}><Text>{grades[s.id]?.final || ''}</Text></View>
                        </View>
                    );
                })}

                {/* --- BODY: EMPTY ROWS (Fill up to 25) --- */}
                {emptyRows.map((_, index) => (
                    <View key={`empty-${index}`} style={styles.row}>
                        <View style={[styles.cell, styles.colNo]}><Text></Text></View>
                        <View style={[styles.cell, styles.colId]}><Text></Text></View>
                        <View style={[styles.cell, styles.colName]}><Text></Text></View>

                        {/* Empty Score Cells with Gray for unused slots */}
                        {Array.from({ length: 6 }).map((_, i) => <View key={`e-p-${i}`} style={[styles.cell, styles.colScore, !preMidtermAssessments[i] ? styles.bgGray : {}]} />)}
                        <View style={[styles.cell, styles.colTotal]} />

                        {Array.from({ length: 6 }).map((_, i) => <View key={`e-m-${i}`} style={[styles.cell, styles.colScore, i !== 0 ? styles.bgGray : {}]} />)}
                        <View style={[styles.cell, styles.colTotal]} />

                        {Array.from({ length: 6 }).map((_, i) => <View key={`e-po-${i}`} style={[styles.cell, styles.colScore, !postMidtermAssessments[i] ? styles.bgGray : {}]} />)}
                        <View style={[styles.cell, styles.colTotal]} />

                        {Array.from({ length: 4 }).map((_, i) => <View key={`e-f-${i}`} style={[styles.cell, styles.colScore, i !== 0 ? styles.bgGray : {}]} />)}
                        <View style={[styles.cell, styles.colTotal]} />
                    </View>
                ))}

            </View>
        </PdfPage>
    );
};

export default FormativeScoresPage;