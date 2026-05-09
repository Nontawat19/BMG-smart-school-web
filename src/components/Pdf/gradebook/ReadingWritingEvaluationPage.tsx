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
    NO: 20,
    ID: 35,
    NAME: 'auto',
    SCORE_SUB: 18,  // ความกว้างช่องย่อย
    SCORE_FULL: 18, // ความกว้างช่องเต็ม
    TOTAL: 25,
    LEVEL: 30,
    RESULT: 35,
};

const styles = StyleSheet.create({
    headerContainer: {
        marginBottom: 5,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
        fontSize: 16,
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
        fontSize: 12,
        marginBottom: 5,
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
        flexGrow: 1,
        minHeight: 22,
    },
    cell: {
        borderRightWidth: 1,
        borderColor: '#000',
        padding: 2,
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
        width: 100,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    studentNameCell: {
        textAlign: 'left',
        paddingLeft: 4,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerText: {
        fontSize: 11,
        fontWeight: 'bold',
        textAlign: 'center',
    }
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
                <View style={[styles.row, { height: 100 }]} fixed>

                    {/* 1. เลขที่ */}
                    <View style={[styles.cell, { width: COL_WIDTHS.NO }]}>
                        <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>เลขที่</Text></View>
                    </View>

                    {/* 2. เลขประจำตัว */}
                    <View style={[styles.cell, { width: COL_WIDTHS.ID }]}>
                        <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>เลขประจำตัว</Text></View>
                    </View>

                    {/* 3. ชื่อ - สกุล */}
                    <View style={[styles.cell, { flex: 1, height: '100%' }]}>
                        <Text style={styles.headerText}>ชื่อ - สกุล</Text>
                    </View>

                    {/* 4. กลุ่มคะแนนประเมิน (Dynamic) */}
                    {readingWritingCriteria.map((criteria, cIdx) => (
                        <View key={criteria.id || cIdx} style={{ flexDirection: 'column', width: (criteria.indicators?.length || 0) * COL_WIDTHS.SCORE_SUB + COL_WIDTHS.SCORE_FULL, height: '100%' }}>
                            <View style={[styles.cell, { height: 25, borderBottomWidth: 1, width: '100%' }]}>
                                <Text style={[styles.headerText, { fontSize: 9 }]}>{cIdx + 1}. {criteria.standard}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', height: 75 }}>
                                {(criteria.indicators || []).map((_, iIdx) => (
                                    <View key={iIdx} style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB, height: '100%' }]}>
                                        <View style={styles.verticalTextContainer}>
                                            <Text style={[styles.verticalText, { fontSize: 9 }]}>{cIdx + 1}.{iIdx + 1}</Text>
                                        </View>
                                    </View>
                                ))}
                                <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, height: '100%' }]}>
                                    <View style={styles.verticalTextContainer}>
                                        <Text style={[styles.verticalText, { fontSize: 9 }]}>รวม</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    ))}

                    {/* 5. รวมทั้งสิ้น */}
                    <View style={{ flexDirection: 'column', width: COL_WIDTHS.TOTAL, height: '100%' }}>
                        <View style={[styles.cell, { width: '100%', height: 75, borderBottomWidth: 1 }]}>
                            <View style={styles.verticalTextContainer}><Text style={styles.verticalText}>รวมทั้งสิ้น</Text></View>
                        </View>
                        <View style={[styles.cell, { width: '100%', height: 25, borderBottomWidth: 0 }]}>
                            <Text style={styles.headerText}>15</Text>
                        </View>
                    </View>

                    {/* 6. ผลการประเมิน */}
                    <View style={{ flexDirection: 'column', width: COL_WIDTHS.LEVEL + COL_WIDTHS.RESULT, height: '100%' }}>
                        <View style={[styles.cell, { height: 25, borderBottomWidth: 1, width: '100%' }]}>
                            <Text style={styles.headerText}>ผลการประเมิน</Text>
                        </View>
                        <View style={{ flexDirection: 'row', height: 75 }}>
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
                {studentChunk.map((s) => {
                    const summary = getRWSummary(s.id);
                    return (
                        <View key={s.id} style={styles.row} wrap={false}>
                            <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>{s.studentNumber}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>{s.studentId}</Text></View>
                            <View style={[styles.cell, styles.studentNameCell, { flex: 1 }]}>
                                <Text>{`${formatPrefix(s.title)}${s.firstName}  ${s.lastName}`}</Text>
                            </View>

                            {/* Dynamic Scores */}
                            {readingWritingCriteria.map((criteria) => {
                                let criteriaSum = 0;
                                return (
                                    <React.Fragment key={criteria.id}>
                                        {(criteria.indicators || []).map((_, iIdx) => {
                                            const score = getRWScore(s.id, criteria.id, iIdx) || 0;
                                            criteriaSum += score;
                                            return (
                                                <View key={iIdx} style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]}>
                                                    <Text>{score || ''}</Text>
                                                </View>
                                            );
                                        })}
                                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL, backgroundColor: '#f0f0f0' }]}>
                                            <Text>{criteriaSum || ''}</Text>
                                        </View>
                                    </React.Fragment>
                                );
                            })}

                            {/* Total */}
                            <View style={[styles.cell, { width: COL_WIDTHS.TOTAL, fontWeight: 'bold' }]}><Text>{summary.total}</Text></View>

                            {/* Result */}
                            <View style={[styles.cell, { width: COL_WIDTHS.LEVEL }]}><Text>{summary.level}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.RESULT, borderRightWidth: 1 }]}><Text>{summary.result}</Text></View>
                        </View>
                    );
                })}

                {/* Filler Rows */}
                {Array.from({ length: Math.max(0, 25 - studentChunk.length) }).map((_, i) => (
                    <View key={`filler-${i}`} style={styles.row}>
                        <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, styles.studentNameCell, { flex: 1 }]}><Text>&nbsp;</Text></View>

                        {/* Reading */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL }]} />

                        {/* Analysis */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL }]} />

                        {/* Writing */}
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_SUB }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SCORE_FULL }]} />

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