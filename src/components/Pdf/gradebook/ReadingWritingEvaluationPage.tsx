import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { Student, ReadingWritingCriteria, GradeRecord } from './types';
import PdfPage from './PdfPage';

interface ReadingWritingEvaluationPageProps {
    academicYear: string;
    selectedClass: string;
    termToDisplay: string;
    CLASSES: Record<string, string>; // e.g. { m1: 'ม.1' }
    studentChunk: Student[];
    readingWritingCriteria: ReadingWritingCriteria[];
    grades: Record<string, GradeRecord>;
    getRWScore: (studentId: string, criteriaId: string, indicatorIndex: number) => number | undefined;
    getRWSummary: (studentId: string) => { total: number; level: number; result: string };
    formatPrefix: (prefix?: string) => string;
    schoolInfo?: any;
    FULL_CLASSES?: Record<string, string>; // e.g. { m1: 'มัธยมศึกษาปีที่ 1' }
    selectedRoom?: string;
    curriculumClassDisplay: string;
    curriculumRoomDisplay: string;
}

// กำหนดความกว้างคอลัมน์
const COL_WIDTHS = {
<<<<<<< HEAD
    NO: 22,
    ID: 38,
    NAME: 'auto',
    SCORE_SUB: 24,
    SCORE_FULL: 24,
    TOTAL: 27,
    LEVEL: 34,
    RESULT: 43,
=======
    NO: 20,
    ID: 35,
    NAME: 'auto',
    SCORE_SUB: 18,  // ความกว้างช่องย่อย
    SCORE_FULL: 18, // ความกว้างช่องเต็ม
    TOTAL: 25,
    LEVEL: 30,
    RESULT: 35,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
};

const styles = StyleSheet.create({
    headerContainer: {
<<<<<<< HEAD
        marginBottom: 6,
        marginTop: 22,
=======
        marginBottom: 5,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
<<<<<<< HEAD
        fontSize: 15,
=======
        fontSize: 16,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        fontWeight: 'bold',
        textAlign: 'center',
        flex: 1,
    },
    pageNumber: {
        fontSize: 10,
        position: 'absolute',
        right: 0,
        top: 0,
    },
    subtitle: {
        textAlign: 'center',
<<<<<<< HEAD
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 6,
=======
        fontSize: 12,
        marginBottom: 5,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    },
    bold: {
        fontWeight: 'bold',
    },
    // --- Table Styles ---
    table: {
        width: '100%',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#000',
        flexDirection: 'column',
        flexGrow: 1,
    },
    row: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#000',
        alignItems: 'stretch',
<<<<<<< HEAD
        minHeight: 18,
=======
        flexGrow: 1,
        minHeight: 22,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    },
    cell: {
        borderRightWidth: 1,
        borderColor: '#000',
<<<<<<< HEAD
        padding: 1,
=======
        padding: 2,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        textAlign: 'center',
        justifyContent: 'center',
        alignItems: 'center',
    },
    verticalTextContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        overflow: 'hidden',
    },
    verticalText: {
        transform: 'rotate(-90deg)',
<<<<<<< HEAD
        width: 96,
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: 12,
    },
    studentNameCell: {
        textAlign: 'left',
        paddingLeft: 5,
=======
        width: 100,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    studentNameCell: {
        textAlign: 'left',
        paddingLeft: 4,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerText: {
<<<<<<< HEAD
        fontSize: 12,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    bodyText: {
        fontSize: 12,
        lineHeight: 1,
    },
    bodyTextBold: {
        fontSize: 12,
        lineHeight: 1,
        fontWeight: 'bold',
    },
    groupBorder: {
        borderRightWidth: 1.6,
    },
    thickRight: {
        borderRightWidth: 1.6,
    },
    thickLeft: {
        borderLeftWidth: 1.6,
    },
=======
        fontSize: 11,
        fontWeight: 'bold',
        textAlign: 'center',
    }
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
});

const ReadingWritingEvaluationPage: React.FC<ReadingWritingEvaluationPageProps> = ({
    academicYear,
    selectedClass,
    termToDisplay,
    CLASSES,
    studentChunk,
    readingWritingCriteria,
    getRWScore,
    getRWSummary,
    formatPrefix,
    schoolInfo,
    FULL_CLASSES,
    selectedRoom,
    curriculumClassDisplay,
    curriculumRoomDisplay,
}) => {

    return (
        <PdfPage orientation="portrait">
            {/* Header Document */}
            <View style={styles.headerContainer} fixed>
                <View style={styles.header}>
                    <Text style={styles.title}>ผลการประเมินอ่าน คิดวิเคราะห์ และเขียนสื่อความหมาย</Text>
                </View>
                <View style={styles.subtitle}>
                    <Text>
                        ชั้น {curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''} ภาคเรียนที่ {termToDisplay} ปีการศึกษา {academicYear}
                    </Text>
                </View>
            </View>

            {/* Table Header */}
            <View style={styles.table}>
<<<<<<< HEAD
                <View style={[styles.row, { height: 88 }]} fixed>
=======
                <View style={[styles.row, { height: 100 }]} fixed>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                    {/* 1. เลขที่ */}
                    <View style={[styles.cell, { width: COL_WIDTHS.NO }]}>
                        <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>เลขที่</Text></View>
                    </View>

                    {/* 2. เลขประจำตัว */}
                    <View style={[styles.cell, { width: COL_WIDTHS.ID }]}>
                        <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>เลขประจำตัว</Text></View>
                    </View>

                    {/* 3. ชื่อ - สกุล */}
<<<<<<< HEAD
                    <View style={[styles.cell, styles.thickRight, { flex: 1, height: '100%' }]}>
=======
                    <View style={[styles.cell, { flex: 1, height: '100%' }]}>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        <Text style={styles.headerText}>ชื่อ - สกุล</Text>
                    </View>

                    {/* 4. กลุ่มคะแนนประเมิน */}
<<<<<<< HEAD
                    <View style={{ flexDirection: 'column', width: COL_WIDTHS.SCORE_SUB * 8, height: '100%' }}>
                        <View style={[styles.cell, { height: 20, borderBottomWidth: 1, width: '100%' }]}>
                            <Text style={styles.headerText}>ผลประเมินอ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย</Text>
                        </View>
                        <View style={{ flexDirection: 'row', height: 24 }}>
                            {readingWritingCriteria.map((criteria, cIdx) => {
                                const columnSpan = cIdx === 2 ? 2 : 3;
                                return (
                                    <View key={criteria.id || cIdx} style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB * columnSpan, borderBottomWidth: 1 }, cIdx < 2 ? styles.thickRight : {}]}>
                                        <Text style={styles.headerText}>{cIdx + 1}. {cIdx === 1 ? 'การคิดวิเคราะห์' : criteria.standard}</Text>
                                    </View>
                                );
                            })}
                        </View>
                        <View style={{ flexDirection: 'row', height: 22 }}>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>1.1</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>1.2</Text></View>
                            <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>เต็ม</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>2.1</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>2.2</Text></View>
                            <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>เต็ม</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>3.1</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>เต็ม</Text></View>
                        </View>
                        <View style={{ flexDirection: 'row', height: 22 }}>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.headerText}>3</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.headerText}>3</Text></View>
                            <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.headerText}>6</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.headerText}>3</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.headerText}>3</Text></View>
                            <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.headerText}>6</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.headerText}>3</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.headerText}>3</Text></View>
                        </View>
                    </View>

                    {/* 5. รวมทั้งหมด */}
                    <View style={{ flexDirection: 'column', width: COL_WIDTHS.TOTAL, height: '100%' }}>
                        <View style={[styles.cell, { width: '100%', height: 66, borderBottomWidth: 1 }]}>
                            <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>รวมทั้งหมด</Text></View>
                        </View>
                        <View style={[styles.cell, { width: '100%', height: 22, borderBottomWidth: 0 }]}>
=======
                    <View style={{ flexDirection: 'column', width: 3 * ((COL_WIDTHS.SCORE_SUB * 2) + COL_WIDTHS.SCORE_FULL), height: '100%' }}>

                        {/* 4.1 หัวข้อหลัก (Layer 1) */}
                        <View style={[styles.cell, { borderRightWidth: 1, height: 25, width: '100%', borderBottomWidth: 1 }]}>
                            <Text style={styles.headerText}>ผลการประเมินอ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย</Text>
                        </View>

                        {/* 4.2 ส่วนย่อย */}
                        <View style={{ flexDirection: 'row', height: 75 }}>

                            {/* Group 1: การอ่าน */}
                            <View style={{ flexDirection: 'column', width: (COL_WIDTHS.SCORE_SUB * 2) + COL_WIDTHS.SCORE_FULL }}>
                                <View style={[styles.cell, { height: 25, borderBottomWidth: 1, width: '100%' }]}><Text style={styles.headerText}>1. การอ่าน</Text></View>
                                <View style={{ flexDirection: 'row', height: 25 }}>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>1.1</Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>1.2</Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, borderBottomWidth: 1 }]}><Text style={styles.headerText}>เต็ม</Text></View>
                                </View>
                                <View style={{ flexDirection: 'row', height: 25 }}>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 0 }]}><Text style={styles.headerText}>3</Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 0 }]}><Text style={styles.headerText}>3</Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, borderBottomWidth: 0 }]}><Text style={styles.headerText}>6</Text></View>
                                </View>
                            </View>

                            {/* Group 2: การคิดวิเคราะห์ */}
                            <View style={{ flexDirection: 'column', width: (COL_WIDTHS.SCORE_SUB * 2) + COL_WIDTHS.SCORE_FULL }}>
                                <View style={[styles.cell, { height: 25, borderBottomWidth: 1, width: '100%' }]}>
                                    <Text style={[styles.headerText, { fontSize: 10 }]}>การคิดวิเคราะห์</Text>
                                </View>
                                <View style={{ flexDirection: 'row', height: 25 }}>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>2.1</Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>2.2</Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, borderBottomWidth: 1 }]}><Text style={styles.headerText}>เต็ม</Text></View>
                                </View>
                                <View style={{ flexDirection: 'row', height: 25 }}>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 0 }]}><Text style={styles.headerText}>3</Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 0 }]}><Text style={styles.headerText}>3</Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, borderBottomWidth: 0 }]}><Text style={styles.headerText}>6</Text></View>
                                </View>
                            </View>

                            {/* Group 3: การเขียน (มีช่องว่างตรงกลาง) */}
                            <View style={{ flexDirection: 'column', width: (COL_WIDTHS.SCORE_SUB * 2) + COL_WIDTHS.SCORE_FULL }}>
                                <View style={[styles.cell, { height: 25, borderBottomWidth: 1, width: '100%' }]}><Text style={styles.headerText}>3. การเขียน</Text></View>
                                <View style={{ flexDirection: 'row', height: 25 }}>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text style={styles.headerText}>3.1</Text></View>
                                    {/* ช่องว่าง */}
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 1 }]}><Text></Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, borderBottomWidth: 1 }]}><Text style={styles.headerText}>เต็ม</Text></View>
                                </View>
                                <View style={{ flexDirection: 'row', height: 25 }}>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 0 }]}><Text style={styles.headerText}>3</Text></View>
                                    {/* ช่องว่าง */}
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, borderBottomWidth: 0 }]}><Text></Text></View>
                                    <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, borderBottomWidth: 0 }]}><Text style={styles.headerText}>3</Text></View>
                                </View>
                            </View>

                        </View>
                    </View>

                    {/* 5. รวมทั้งสิ้น */}
                    <View style={{ flexDirection: 'column', width: COL_WIDTHS.TOTAL, height: '100%' }}>
                        <View style={[styles.cell, { width: '100%', height: 75, borderBottomWidth: 1 }]}>
                            <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>รวมทั้งสิ้น</Text></View>
                        </View>
                        <View style={[styles.cell, { width: '100%', height: 25, borderBottomWidth: 0 }]}>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            <Text style={styles.headerText}>15</Text>
                        </View>
                    </View>

                    {/* 6. ผลการประเมิน */}
                    <View style={{ flexDirection: 'column', width: COL_WIDTHS.LEVEL + COL_WIDTHS.RESULT, height: '100%' }}>
<<<<<<< HEAD
                        <View style={[styles.cell, { height: 24, borderBottomWidth: 1, width: '100%' }]}>
                            <Text style={styles.headerText}>ผลการประเมิน</Text>
                        </View>
                        <View style={{ flexDirection: 'row', height: 64 }}>
=======
                        <View style={[styles.cell, { height: 25, borderBottomWidth: 1, width: '100%' }]}>
                            <Text style={styles.headerText}>ผลการประเมิน</Text>
                        </View>
                        <View style={{ flexDirection: 'row', height: 75 }}>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            <View style={[styles.cell, { width: COL_WIDTHS.LEVEL, borderRightWidth: 1 }]}>
                                <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>ระดับ</Text></View>
                            </View>
                            <View style={[styles.cell, { width: COL_WIDTHS.RESULT, borderRightWidth: 1 }]}>
                                <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>ผล</Text></View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Body Rows */}
<<<<<<< HEAD
                {studentChunk.map((s, index) => {
                    const summary = getRWSummary(s.id);
                    const readingScores = [
                        getRWScore(s.id, readingWritingCriteria[0]?.id, 0) || 0,
                        getRWScore(s.id, readingWritingCriteria[0]?.id, 1) || 0,
                    ];
                    const analysisScores = [
                        getRWScore(s.id, readingWritingCriteria[1]?.id, 0) || 0,
                        getRWScore(s.id, readingWritingCriteria[1]?.id, 1) || 0,
                    ];
                    const writingScore = getRWScore(s.id, readingWritingCriteria[2]?.id, 0) || 0;
                    const readingSum = readingScores.reduce((sum, score) => sum + score, 0);
                    const analysisSum = analysisScores.reduce((sum, score) => sum + score, 0);
                    return (
                        <View key={s.id} style={[styles.row, { height: 20 }]} wrap={false}>
                            <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text style={styles.bodyText}>{index + 1}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text style={styles.bodyTextBold}>{s.studentId}</Text></View>
                            <View style={[styles.cell, styles.studentNameCell, styles.thickRight, { flex: 1 }]}>
                                <Text style={styles.bodyText}>{`${formatPrefix(s.title)}${s.firstName}      ${s.lastName}`}</Text>
                            </View>

                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.bodyTextBold}>{readingScores[0] || ''}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.bodyTextBold}>{readingScores[1] || ''}</Text></View>
                            <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.bodyTextBold}>{readingSum || ''}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.bodyTextBold}>{analysisScores[0] || ''}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.bodyTextBold}>{analysisScores[1] || ''}</Text></View>
                            <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.bodyTextBold}>{analysisSum || ''}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.bodyTextBold}>{writingScore || ''}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text style={styles.bodyTextBold}>{writingScore || ''}</Text></View>

                            {/* Total */}
                            <View style={[styles.cell, { width: COL_WIDTHS.TOTAL, fontWeight: 'bold' }]}><Text style={styles.bodyTextBold}>{summary.total}</Text></View>

                            {/* Result */}
                            <View style={[styles.cell, { width: COL_WIDTHS.LEVEL }]}><Text style={styles.bodyTextBold}>{summary.level}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.RESULT, borderRightWidth: 1 }]}><Text style={styles.bodyText}>{summary.result}</Text></View>
=======
                {studentChunk.map((s) => {
                    const summary = getRWSummary(s.id);
                    const getScore = (cIndex: number, iIndex: number) => {
                        const crit = readingWritingCriteria[cIndex];
                        if (!crit) return '';
                        const val = getRWScore(s.id, crit.id, iIndex);
                        return val !== undefined ? val : '';
                    };

                    const sumRead = (Number(getScore(0, 0)) || 0) + (Number(getScore(0, 1)) || 0);
                    const sumThink = (Number(getScore(1, 0)) || 0) + (Number(getScore(1, 1)) || 0);
                    const sumWrite = (Number(getScore(2, 0)) || 0);

                    return (
                        <View key={s.id} style={styles.row} wrap={false}>
                            <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>{s.studentNumber}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>{s.studentId}</Text></View>
                            <View style={[styles.cell, styles.studentNameCell, { flex: 1 }]}>
                                <Text>{`${formatPrefix(s.title)}${s.firstName}  ${s.lastName}`}</Text>
                            </View>

                            {/* Reading */}
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text>{getScore(0, 0)}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text>{getScore(0, 1)}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, backgroundColor: '#f0f0f0' }]}><Text>{sumRead}</Text></View>

                            {/* Analysis */}
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text>{getScore(1, 0)}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text>{getScore(1, 1)}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, backgroundColor: '#f0f0f0' }]}><Text>{sumThink}</Text></View>

                            {/* Writing (3.1, Blank, Sum) */}
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text>{getScore(2, 0)}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}><Text></Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, backgroundColor: '#f0f0f0' }]}><Text>{sumWrite}</Text></View>

                            {/* Total */}
                            <View style={[styles.cell, { width: COL_WIDTHS.TOTAL, fontWeight: 'bold' }]}><Text>{summary.total}</Text></View>

                            {/* Result */}
                            <View style={[styles.cell, { width: COL_WIDTHS.LEVEL }]}><Text>{summary.level}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.RESULT, borderRightWidth: 1 }]}><Text>{summary.result}</Text></View>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        </View>
                    );
                })}

                {/* Filler Rows */}
                {Array.from({ length: Math.max(0, 25 - studentChunk.length) }).map((_, i) => (
<<<<<<< HEAD
                    <View key={`filler-${i}`} style={[styles.row, { height: 20 }]}>
                        <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, styles.studentNameCell, styles.thickRight, { flex: 1 }]}><Text>&nbsp;</Text></View>
=======
                    <View key={`filler-${i}`} style={styles.row}>
                        <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, styles.studentNameCell, { flex: 1 }]}><Text>&nbsp;</Text></View>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                        {/* Reading */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
<<<<<<< HEAD
                        <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB }]} />
=======
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL }]} />
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                        {/* Analysis */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
<<<<<<< HEAD
                        <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB }]} />
=======
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL }]} />
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                        {/* Writing */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
<<<<<<< HEAD
=======
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL }]} />
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                        {/* Total */}
                        <View style={[styles.cell, { width: COL_WIDTHS.TOTAL }]} />

                        {/* Result */}
                        <View style={[styles.cell, { width: COL_WIDTHS.LEVEL }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.RESULT, borderRightWidth: 1 }]} />
                    </View>
                ))}
            </View>
        </PdfPage>
    );
};

<<<<<<< HEAD
export default ReadingWritingEvaluationPage;
=======
export default ReadingWritingEvaluationPage;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
