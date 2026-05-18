import React from 'react';
import { Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { Student, CharacteristicCriteria, GradeRecord } from './types';
import PdfPage from './PdfPage';

// --- 1. Interface Definitions ---
interface CharacteristicsEvaluationPageProps {
    academicYear: string;
    selectedClass: string;
    termToDisplay: string;
    CLASSES: Record<string, string>;
    FULL_CLASSES?: Record<string, string>;
    studentChunk: Student[];
    characteristicsCriteria: CharacteristicCriteria[];
    grades: Record<string, GradeRecord>;
    getCriteriaScore: (studentId: string, criteria: CharacteristicCriteria) => number | null;
    getOverallQuality: (studentId: string) => number | null;
    formatPrefix: (prefix?: string) => string;
    selectedRoom?: string;
    curriculumClassDisplay: string;
    curriculumRoomDisplay: string;
}

// --- 2. Configuration & Styles ---
const COL_WIDTHS = {
    NO: 22,
    ID: 36,
    CRITERIA: 15,
    SUMMARY_LEVEL: 54,
    SUMMARY_RES: 54,
    NOTE: 54,
};

const NAME_WIDTH = 158;
const CRITERIA_VISIBLE_COUNT = 8;
const CRITERIA_TOTAL_COLUMNS = 10;
const CRITERIA_GROUP_WIDTH = COL_WIDTHS.CRITERIA * CRITERIA_TOTAL_COLUMNS;
const SUMMARY_GROUP_WIDTH = COL_WIDTHS.SUMMARY_LEVEL + COL_WIDTHS.SUMMARY_RES;

const styles = StyleSheet.create({
    // --- Header Document Info ---
    headerContainer: {
        textAlign: 'center',
        marginTop: 30,
        marginBottom: 5,
        height: 58,
    },
    title: {
        fontSize: 15.5,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 13.5,
        flexDirection: 'row',
        justifyContent: 'center',
    },
    bold: {
        fontWeight: 'bold',
    },

    // --- Table Structure ---
    table: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
    },
    tableRow: {
        flexDirection: 'row',
        width: '100%',
        borderLeftWidth: 1.2,
        borderBottomWidth: 1,
        borderColor: '#000',
        alignItems: 'stretch',
        minHeight: 18,
    },
    cell: {
        borderRightWidth: 1,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 1,
    },

    // --- Header Specific ---
    headerRow: {
        height: 92,
        borderTopWidth: 1.2,
        backgroundColor: '#fff',
        fontWeight: 'bold',
    },

    // Vertical Text Styles
    verticalCell: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 0,
        overflow: 'hidden',
    },
    verticalTextContainer: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
    },
    verticalText: {
        transform: 'rotate(-90deg)',
        width: 98,
        textAlign: 'center',
        fontSize: 12.5,
        fontWeight: 'bold',
    },

    nestedColumn: {
        flexDirection: 'column',
        height: '100%',
    },

    // --- Student Row ---
    studentNameCell: {
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingLeft: 5,
        textAlign: 'left',
    },
    headerText: {
        fontSize: 12.5,
        fontWeight: 'bold',
        textAlign: 'center',
        lineHeight: 1.05,
    },
    bodyText: {
        fontSize: 12.3,
        lineHeight: 1,
    },
    bodyTextBold: {
        fontSize: 12.3,
        lineHeight: 1,
        fontWeight: 'bold',
    },
    thickRight: {
        borderRightWidth: 1.4,
    }
});

const CharacteristicsEvaluationPage: React.FC<CharacteristicsEvaluationPageProps> = ({
    academicYear,
    selectedClass,
    termToDisplay,
    CLASSES,
    FULL_CLASSES,
    studentChunk,
    characteristicsCriteria,
    grades,
    getCriteriaScore,
    getOverallQuality,
    formatPrefix,
    selectedRoom,
    curriculumClassDisplay,
    curriculumRoomDisplay,
}) => {

    const HeaderInfo = () => (
        <View style={styles.headerContainer} fixed>
            <Text style={styles.title}>ผลการประเมินคุณลักษณะอันพึงประสงค์</Text>
            <View style={styles.subtitle}>
                <Text>
                    <Text style={styles.bold}>ชั้น </Text>
                    <Text>{curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''}  </Text>
                    <Text style={styles.bold}>ภาคเรียนที่ </Text>
                    <Text>{termToDisplay || '1'}  </Text>
                    <Text style={styles.bold}>ปีการศึกษา</Text>
                    <Text> {academicYear}</Text>
                </Text>
            </View>
        </View>
    );

    return (
        <PdfPage orientation="portrait">
            <HeaderInfo />

            <View style={styles.table}>
                {/* ================= HEADER ROW ================= */}
                <View style={[styles.tableRow, styles.headerRow]} fixed>

                    {/* 1. เลขที่ (Vertical) */}
                    <View style={[styles.cell, styles.verticalCell, { width: COL_WIDTHS.NO }]}>
                        <View style={styles.verticalTextContainer}>
                            <Text style={styles.verticalText}>เลขที่</Text>
                        </View>
                    </View>

                    {/* 2. เลขประจำตัว (Vertical) */}
                    <View style={[styles.cell, styles.verticalCell, { width: COL_WIDTHS.ID }]}>
                        <View style={styles.verticalTextContainer}>
                            <Text style={styles.verticalText}>เลขประจำตัว</Text>
                        </View>
                    </View>

                    {/* 3. ชื่อ - สกุล */}
                    <View style={[styles.cell, styles.thickRight, { width: NAME_WIDTH }]}>
                        <Text style={styles.headerText}>ชื่อ - สกุล</Text>
                    </View>

                    {/* 4. กลุ่มคะแนน (Nested 3 Layers) */}
                    <View style={[styles.nestedColumn, { width: CRITERIA_GROUP_WIDTH }]}>

                        {/* Layer 1: Title + Subtitle */}
                        <View style={[
                            styles.cell,
                            {
                                width: '100%',
                                height: 50,
                                borderBottomWidth: 1,
                                flexDirection: 'column',
                                justifyContent: 'center',
                                gap: 2
                            },
                            styles.thickRight
                        ]}>
                            <Text style={styles.headerText}>ผลประเมินคุณลักษณะอันพึงประสงค์</Text>
                            <Text style={styles.headerText}>ข้อ/คะแนน</Text>
                        </View>

                        {/* Layer 2: Numbers 1-8 + empty columns */}
                        <View style={{ flexDirection: 'row', height: 21, width: '100%' }}>
                            {Array.from({ length: CRITERIA_TOTAL_COLUMNS }).map((_, idx) => (
                                <View
                                    key={idx}
                                    style={[
                                        styles.cell,
                                        { width: COL_WIDTHS.CRITERIA, borderBottomWidth: 1 },
                                        idx === CRITERIA_TOTAL_COLUMNS - 1 ? styles.thickRight : {},
                                    ]}
                                >
                                    <Text style={styles.headerText}>{idx < CRITERIA_VISIBLE_COUNT ? idx + 1 : ''}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Layer 3: Score 3 */}
                        <View style={{ flexDirection: 'row', height: 21, width: '100%' }}>
                            {Array.from({ length: CRITERIA_TOTAL_COLUMNS }).map((_, idx) => (
                                <View
                                    key={`score-3-${idx}`}
                                    style={[
                                        styles.cell,
                                        { width: COL_WIDTHS.CRITERIA, borderBottomWidth: 0 },
                                        idx === CRITERIA_TOTAL_COLUMNS - 1 ? styles.thickRight : {},
                                    ]}
                                >
                                    <Text style={styles.headerText}>{idx < CRITERIA_VISIBLE_COUNT ? '3' : ''}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* 5. กลุ่มสรุปผล (Nested) */}
                    <View style={[styles.nestedColumn, { width: SUMMARY_GROUP_WIDTH }]}>
                        <View style={[styles.cell, { width: '100%', height: 26, borderRightWidth: 1, borderBottomWidth: 1 }]}>
                            <Text style={styles.headerText}>ผลการประเมิน</Text>
                        </View>

                        <View style={{ flexDirection: 'row', height: 66, width: '100%' }}>
                            <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_LEVEL, borderBottomWidth: 0 }]}>
                                <Text style={styles.headerText}>ระดับการ</Text>
                                <Text style={styles.headerText}>ประเมิน</Text>
                            </View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_RES, borderBottomWidth: 0 }]}>
                                <Text style={styles.headerText}>ผลการ</Text>
                                <Text style={styles.headerText}>ประเมิน</Text>
                            </View>
                        </View>
                    </View>

                    {/* 6. หมายเหตุ */}
                    <View style={[styles.cell, { width: COL_WIDTHS.NOTE }]}>
                        <Text style={styles.headerText}>หมายเหตุ</Text>
                    </View>
                </View>

                {/* ================= DATA ROWS ================= */}
                {studentChunk.map((s, index) => {
                    const quality = getOverallQuality(s.id);
                    let qualityText = '';
                    if (quality === 3) qualityText = 'ดีเยี่ยม';
                    else if (quality === 2) qualityText = 'ดี';
                    else if (quality === 1) qualityText = 'ผ่าน';
                    else if (quality === 0) qualityText = 'ไม่ผ่าน';

                    return (
                        <View key={s.id} style={[styles.tableRow, { height: 20 }]} wrap={false}>
                            <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text style={styles.bodyText}>{index + 1}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text style={styles.bodyTextBold}>{s.studentId}</Text></View>
                            <View style={[styles.cell, styles.studentNameCell, styles.thickRight, { width: NAME_WIDTH }]}>
                                <Text style={styles.bodyText}>{(s.title ? formatPrefix(s.title) : '') + s.firstName + '      ' + s.lastName}</Text>
                            </View>

                            {Array.from({ length: CRITERIA_TOTAL_COLUMNS }).map((_, idx) => {
                                const criteria = characteristicsCriteria[idx];
                                const score = criteria ? getCriteriaScore(s.id, criteria) : null;
                                return (
                                    <View
                                        key={idx}
                                        style={[
                                            styles.cell,
                                            { width: COL_WIDTHS.CRITERIA },
                                            idx === CRITERIA_TOTAL_COLUMNS - 1 ? styles.thickRight : {},
                                        ]}
                                    >
                                        <Text style={styles.bodyTextBold}>{idx < CRITERIA_VISIBLE_COUNT && score !== null ? score : ''}</Text>
                                    </View>
                                );
                            })}

                            <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_LEVEL }]}>
                                <Text style={styles.bodyTextBold}>{quality !== null ? quality : ''}</Text>
                            </View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_RES }]}>
                                <Text style={styles.bodyText}>{qualityText}</Text>
                            </View>
                            <View style={[styles.cell, { width: COL_WIDTHS.NOTE }]} />
                        </View>
                    );
                })}

                {/* ================= FILLER ROWS ================= */}
                {Array.from({ length: Math.max(0, 27 - studentChunk.length) }).map((_, i) => (
                    <View key={`filler-${i}`} style={[styles.tableRow, { height: 20 }]}>
                        <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, styles.thickRight, { width: NAME_WIDTH }]}><Text>&nbsp;</Text></View>
                        {Array.from({ length: CRITERIA_TOTAL_COLUMNS }).map((_, idx) => (
                            <View
                                key={idx}
                                style={[
                                    styles.cell,
                                    { width: COL_WIDTHS.CRITERIA },
                                    idx === CRITERIA_TOTAL_COLUMNS - 1 ? styles.thickRight : {},
                                ]}
                            />
                        ))}
                        <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_LEVEL }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_RES }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.NOTE }]} />
                    </View>
                ))}

            </View>
        </PdfPage>
    );
};

export default CharacteristicsEvaluationPage;
