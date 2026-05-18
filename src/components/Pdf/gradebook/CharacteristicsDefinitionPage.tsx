import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import PdfPage from './PdfPage';
<<<<<<< HEAD
import { DESIRED_CHARACTERISTICS } from './constants';
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

interface CharacteristicCriteria {
    id: string;
    title: string;
    indicators: string[];
}

interface CharacteristicsDefinitionPageProps {
    schoolInfo: any;
    academicYear: string;
    selectedClass: string;
    termToDisplay: string;
    FULL_CLASSES: Record<string, string>;
    criteria: CharacteristicCriteria[];
    selectedRoom?: string;
    curriculumClassDisplay: string;
    curriculumRoomDisplay: string;
}

const styles = StyleSheet.create({
    pageNumberContainer: {
        position: 'absolute',
        top: 15,
        right: 40,
    },
    pageNumberText: {
        fontSize: 12,
    },
    header: {
        textAlign: 'center',
        marginBottom: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    subtitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    table: {
        width: '100%',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: '#000',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#000',
    },
    tableHeader: {
        backgroundColor: '#fff',
        minHeight: 25,
    },
    col1: {
        width: '25%',
        borderRightWidth: 1,
        borderRightColor: '#000',
    },
    col2: {
        width: '75%',
        padding: '4 6 4 3',
    },
    // ส่วนที่ปรับปรุง: จัดเนื้อหาในคอลัมน์แรกให้สมดุล
    tableCol1Content: {
        padding: '6 4',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    charTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 1.1,
        marginBottom: 10,
    },
    // ปรับการจัดวางคะแนนให้อยู่กึ่งกลางคอลัมน์
    scoreContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center', // จัดกึ่งกลางแนวนอน
        alignItems: 'center',     // จัดกึ่งกลางแนวตั้ง
        gap: 15,
        minHeight: 40,            // กำหนดความสูงขั้นต่ำเพื่อให้เห็นความแตกต่างของการจัดวาง
    },
    indicatorItem: {
        flexDirection: 'row',
        marginBottom: 2,
        alignItems: 'flex-start',
    },
    indicatorNumber: {
        width: 25,
        flexShrink: 0,
        fontSize: 14,
    },
    indicatorTextContainer: {
        flex: 1,
    },
    indicatorText: {
        lineHeight: 1.2,
        textAlign: 'left',
        fontSize: 14,
    }
});

const CharacteristicsDefinitionPage: React.FC<CharacteristicsDefinitionPageProps> = ({
    schoolInfo,
    academicYear,
    termToDisplay,
    selectedClass,
    FULL_CLASSES,
    criteria,
    selectedRoom,
    curriculumClassDisplay,
    curriculumRoomDisplay,
}) => {
    const formattedSchoolName = schoolInfo?.schoolName?.startsWith('โรงเรียน')
        ? schoolInfo.schoolName
        : `โรงเรียน${schoolInfo?.schoolName || ''}`;

    return (
        <PdfPage>

            <View style={styles.header} fixed>
                <Text style={styles.title}>คุณลักษณะอันพึงประสงค์</Text>
                <Text style={styles.subtitle}>
                    ชั้น {curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''} ภาคเรียนที่ {termToDisplay} ปีการศึกษา {academicYear}
                </Text>
            </View>

            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]} fixed>
                    <View style={[styles.col1, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 13, fontWeight: 'bold' }}>คุณลักษณะอันพึงประสงค์</Text>
                    </View>
                    <View style={[styles.col2, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 13, fontWeight: 'bold' }}>พฤติกรรมบ่งชี้</Text>
                    </View>
                </View>

<<<<<<< HEAD
                {DESIRED_CHARACTERISTICS.map((item, idx) => (
=======
                {criteria.map((item, idx) => (
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    <View key={item.id} style={styles.tableRow} wrap={false}>
                        {/* คอลัมน์ซ้าย: จัดชื่อหัวข้อไว้บน และคะแนนไว้ตรงกลางพื้นที่ที่เหลือ */}
                        <View style={styles.col1}>
                            <View style={styles.tableCol1Content}>
                                <Text style={styles.charTitle}>
                                    {idx + 1}. {item.title}
                                </Text>
                                <View style={styles.scoreContainer}>
                                    <Text style={{ fontSize: 12, fontWeight: 'bold' }}>(คะแนน)</Text>
                                    <Text style={{ fontSize: 12, fontWeight: 'bold' }}>3</Text>
                                </View>
                            </View>
                        </View>

                        {/* คอลัมน์ขวา: พฤติกรรมบ่งชี้ */}
                        <View style={styles.col2}>
                            {item.indicators.map((indicator, iIdx) => (
                                <View key={iIdx} style={styles.indicatorItem}>
                                    <Text style={styles.indicatorNumber}>
                                        {idx + 1}.{iIdx + 1}
                                    </Text>
                                    <View style={styles.indicatorTextContainer}>
                                        <Text style={styles.indicatorText}>
                                            {indicator}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                ))}
            </View>
        </PdfPage>
    );
};

export default CharacteristicsDefinitionPage;