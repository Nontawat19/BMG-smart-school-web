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
    NO: 22,
    ID: 38,
    NAME: 'auto',
    SCORE_SUB: 24,
    SCORE_FULL: 24,
    TOTAL: 27,
    LEVEL: 34,
    RESULT: 43,
};

const ROWS_PER_PAGE = 31;

const styles = StyleSheet.create({
    headerContainer: {
        marginBottom: 6,
        marginTop: 22,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
        fontSize: 15,
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
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 6,
    },
    bold: {
        fontWeight: 'bold',
    },
    // --- Table Styles ---
    table: {
        width: '100%',
        flexDirection: 'column',
    },
    row: {
        flexDirection: 'row',
        borderLeftWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#000',
        alignItems: 'stretch',
        minHeight: 18,
    },
    cell: {
        borderRightWidth: 1,
        borderColor: '#000',
        padding: 1,
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
        width: 96,
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: 12,
    },
    studentNameCell: {
        textAlign: 'left',
        paddingLeft: 5,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerText: {
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
                <View style={[styles.row, { height: 88, borderTopWidth: 1 }]} fixed>

                    {/* 1. เลขที่ */}
                    <View style={[styles.cell, { width: COL_WIDTHS.NO }]}>
                        <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>เลขที่</Text></View>
                    </View>

                    {/* 2. เลขประจำตัว */}
                    <View style={[styles.cell, { width: COL_WIDTHS.ID }]}>
                        <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>เลขประจำตัว</Text></View>
                    </View>

                    {/* 3. ชื่อ - สกุล */}
                    <View style={[styles.cell, styles.thickRight, { flex: 1, height: '100%' }]}>
                        <Text style={styles.headerText}>ชื่อ - สกุล</Text>
                    </View>

                    {/* 4. กลุ่มคะแนนประเมิน */}
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
                            <Text style={styles.headerText}>15</Text>
                        </View>
                    </View>

                    {/* 6. ผลการประเมิน */}
                    <View style={{ flexDirection: 'column', width: COL_WIDTHS.LEVEL + COL_WIDTHS.RESULT, height: '100%' }}>
                        <View style={[styles.cell, { height: 24, borderBottomWidth: 1, width: '100%' }]}>
                            <Text style={styles.headerText}>ผลการประเมิน</Text>
                        </View>
                        <View style={{ flexDirection: 'row', height: 64 }}>
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
                            <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text style={styles.bodyText}>{s.studentNumber || (index + 1)}</Text></View>
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
                        </View>
                    );
                })}

                {/* Filler Rows */}
                {Array.from({ length: Math.max(0, ROWS_PER_PAGE - studentChunk.length) }).map((_, i) => (
                    <View key={`filler-${i}`} style={[styles.row, { height: 20 }]}>
                        <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, styles.studentNameCell, styles.thickRight, { flex: 1 }]}><Text>&nbsp;</Text></View>

                        {/* Reading */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB }]} />

                        {/* Analysis */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, styles.thickRight, { width: COL_WIDTHS.SCORE_SUB }]} />

                        {/* Writing */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />

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

export default ReadingWritingEvaluationPage;
