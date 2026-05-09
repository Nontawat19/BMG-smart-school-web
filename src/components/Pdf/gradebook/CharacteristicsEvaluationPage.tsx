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
    NO: 25,
    ID: 35,
    CRITERIA: 22,      // 8 ช่อง x 22 = 176
    SUMMARY_LEVEL: 35,
    SUMMARY_RES: 45,
};

const NAME_WIDTH = 224; // พื้นที่เหลือสำหรับชื่อ
const CRITERIA_GROUP_WIDTH = COL_WIDTHS.CRITERIA * 8;
const SUMMARY_GROUP_WIDTH = COL_WIDTHS.SUMMARY_LEVEL + COL_WIDTHS.SUMMARY_RES;

const styles = StyleSheet.create({
    // --- Header Document Info ---
    headerContainer: {
        textAlign: 'center',
        marginBottom: 5,
        height: 50,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
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
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#000',
        flexGrow: 1,
    },
    tableRow: {
        flexDirection: 'row',
        width: '100%',
        borderBottomWidth: 1,
        borderColor: '#000',
        alignItems: 'stretch',
        flexGrow: 1,
        minHeight: 22,
    },
    cell: {
        borderRightWidth: 1,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 2,
    },

    // --- Header Specific ---
    headerRow: {
        height: 120, // เพิ่มความสูงรวมเป็น 120 เพื่อให้มีที่พอสำหรับแนวตั้ง
        backgroundColor: '#f0f0f0',
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
        width: 100, // เพิ่มความกว้างหลอก (ซึ่งจะเป็นความสูงเมื่อหมุน)
        textAlign: 'center',
        fontSize: 12, // ขนาดตัวอักษรแนวตั้ง
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
                    <View style={[styles.cell, { width: NAME_WIDTH }]}>
                        <Text style={styles.bold}>ชื่อ - สกุล</Text>
                    </View>

                    {/* 4. กลุ่มคะแนน (Nested 3 Layers) */}
                    <View style={[styles.nestedColumn, { width: CRITERIA_GROUP_WIDTH }]}>

                        {/* Layer 1: Title + Subtitle (Height 60) */}
                        <View style={[
                            styles.cell,
                            {
                                width: '100%',
                                height: 60, // ครึ่งหนึ่งของ 120
                                borderRightWidth: 1,
                                borderBottomWidth: 1,
                                flexDirection: 'column',
                                justifyContent: 'center',
                                gap: 2
                            }
                        ]}>
                            <Text style={[styles.bold, { fontSize: 13 }]}>ผลประเมินคุณลักษณะอันพึงประสงค์</Text>
                            <Text style={[styles.bold, { fontSize: 12 }]}>ข้อ/คะแนน</Text>
                        </View>

                        {/* Layer 2: Numbers 1-8 (Height 30) */}
                        <View style={{ flexDirection: 'row', height: 30, width: '100%' }}>
                            {Array.from({ length: 8 }).map((_, idx) => (
                                <View key={idx} style={[styles.cell, { width: COL_WIDTHS.CRITERIA, borderBottomWidth: 1 }]}>
                                    <Text style={styles.bold}>{idx + 1}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Layer 3: Score 3 (Height 30) */}
                        {/* ใช้ borderBottomWidth: 0 เพราะเป็นแถวล่างสุดของ Header */}
                        <View style={{ flexDirection: 'row', height: 30, width: '100%' }}>
                            {Array.from({ length: 8 }).map((_, idx) => (
                                <View key={`score-3-${idx}`} style={[styles.cell, { width: COL_WIDTHS.CRITERIA, borderBottomWidth: 0 }]}>
                                    <Text style={styles.bold}>3</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* 5. กลุ่มสรุปผล (Nested) */}
                    <View style={[styles.nestedColumn, { width: SUMMARY_GROUP_WIDTH }]}>
                        {/* Title Row (Height 60 - เท่ากับ Layer 1 ของกลุ่มคะแนน) */}
                        <View style={[styles.cell, { width: '100%', height: 60, borderRightWidth: 1, borderBottomWidth: 1 }]}>
                            <Text style={styles.bold}>ผลการประเมิน</Text>
                        </View>

                        {/* Split Columns (Vertical Text) - Fill remaining height (60) */}
                        <View style={{ flexDirection: 'row', flex: 1, width: '100%' }}>
                            {/* ระดับการประเมิน */}
                            <View style={[styles.cell, styles.verticalCell, { width: COL_WIDTHS.SUMMARY_LEVEL, borderBottomWidth: 0 }]}>
                                <View style={styles.verticalTextContainer}>
                                    <Text style={[styles.verticalText, { fontSize: 11 }]}>ระดับการประเมิน</Text>
                                </View>
                            </View>
                            {/* ผลการประเมิน */}
                            <View style={[styles.cell, styles.verticalCell, { width: COL_WIDTHS.SUMMARY_RES, borderBottomWidth: 0 }]}>
                                <View style={styles.verticalTextContainer}>
                                    <Text style={[styles.verticalText, { fontSize: 11 }]}>ผลการประเมิน</Text>
                                </View>
                            </View>
                        </View>
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
                        <View key={s.id} style={styles.tableRow} wrap={false}>
                            <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>{s.studentNumber}</Text></View>
                            <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>{s.studentId}</Text></View>
                            <View style={[styles.cell, styles.studentNameCell, { width: NAME_WIDTH }]}>
                                <Text>{(s.title ? formatPrefix(s.title) : '') + s.firstName + ' ' + s.lastName}</Text>
                            </View>

                            {Array.from({ length: 8 }).map((_, idx) => {
                                const criteria = characteristicsCriteria[idx];
                                const score = criteria ? getCriteriaScore(s.id, criteria) : null;
                                return (
                                    <View key={idx} style={[styles.cell, { width: COL_WIDTHS.CRITERIA }]}>
                                        <Text>{score !== null ? score : ''}</Text>
                                    </View>
                                );
                            })}

                            <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_LEVEL }]}>
                                <Text>{quality !== null ? quality : ''}</Text>
                            </View>
                            <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_RES }]}>
                                <Text style={{ fontSize: 11 }}>{qualityText}</Text>
                            </View>
                        </View>
                    );
                })}

                {/* ================= FILLER ROWS ================= */}
                {Array.from({ length: Math.max(0, 25 - studentChunk.length) }).map((_, i) => (
                    <View key={`filler-${i}`} style={styles.tableRow}>
                        <View style={[styles.cell, { width: COL_WIDTHS.NO }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, { width: COL_WIDTHS.ID }]}><Text>&nbsp;</Text></View>
                        <View style={[styles.cell, { width: NAME_WIDTH }]}><Text>&nbsp;</Text></View>
                        {Array.from({ length: 8 }).map((_, idx) => (
                            <View key={idx} style={[styles.cell, { width: COL_WIDTHS.CRITERIA }]} />
                        ))}
                        <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_LEVEL }]} />
                        <View style={[styles.cell, { width: COL_WIDTHS.SUMMARY_RES }]} />
                    </View>
                ))}

            </View>
        </PdfPage>
    );
};

export default CharacteristicsEvaluationPage;