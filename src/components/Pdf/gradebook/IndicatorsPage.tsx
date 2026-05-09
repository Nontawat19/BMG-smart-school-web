import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import PdfPage from './PdfPage';

interface IndicatorsPageProps {
    currentCourse: any;
    allItems: string[];
    label: string;
    selectedClass: string;
    termToDisplay: string;
    CLASSES: Record<string, string>;
    academicYear: string;
    selectedRoom?: string;
    curriculumClassDisplay: string;
    curriculumRoomDisplay: string;
}

const styles = StyleSheet.create({
    header: {
        position: 'absolute',
        top: '10mm',
        left: '25mm',
        right: '15mm',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    title: { fontSize: 18, fontWeight: 'bold' },
    pageNumberText: { fontSize: 14, fontFamily: 'TH Sarabun PSK', fontWeight: 'bold' },
    subHeader: {
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 8,
        fontSize: 15,
        paddingBottom: 4
    },
    contentBox: {
        borderWidth: 1.2,
        borderColor: 'black',
        padding: '10 18 12 18',
        flexGrow: 1
    },
    content: { fontSize: 15 },
    contentTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
        textDecoration: 'underline'
    },
    indicatorList: {
        display: 'flex',
        flexDirection: 'column'
    },
    indicatorItem: {
        flexDirection: 'row',
        marginBottom: 3, // ระยะห่างที่คำนวณแล้วว่าใส่ได้ 25 ข้อพอดี
        alignItems: 'flex-start',
        minPresenceAhead: 20
    },
    indicatorNumber: {
        width: 30,
        textAlign: 'left',
        fontWeight: 'bold'
    },
    indicatorText: {
        flex: 1,
        lineHeight: 1.2,
        textAlign: 'justify'
    },
    noData: {
        color: '#666',
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: 50
    }
});

const IndicatorsPage: React.FC<IndicatorsPageProps> = ({
    currentCourse,
    allItems,
    label,
    selectedClass,
    termToDisplay,
    CLASSES,
    academicYear,
    selectedRoom,
    curriculumClassDisplay,
    curriculumRoomDisplay,
}) => {

    const formatClassName = (className: string) => {
        if (!className) return "";
        let formatted = className;
        if (formatted.includes("ม.")) {
            formatted = formatted.replace("ม.", "มัธยมศึกษาปีที่ ");
        } else if (formatted.includes("ป.")) {
            formatted = formatted.replace("ป.", "ประถมศึกษาปีที่ ");
        }
        return formatted;
    };

    const fullClassName = formatClassName(CLASSES[selectedClass] || selectedClass);

    return (
        <PdfPage>
            {/* Header: เริ่มนับหน้าที่ 1 เสมอ */}
            <View style={styles.header} fixed>
                <View style={{ width: 80 }} />
                <Text style={styles.title}>ตัวชี้วัด</Text>
                <View style={{ width: 80 }} />
            </View>

            {/* ข้อมูลรายวิชา: บรรทัดเดียว ไม่มีเครื่องหมาย : */}
            <View style={styles.subHeader}>
                <Text>
                    <Text style={{ fontWeight: 'bold' }}>รายวิชา</Text> {currentCourse?.title}
                    {"   "}<Text style={{ fontWeight: 'bold' }}>รหัสวิชา</Text> {currentCourse?.code}
                    {"   "}<Text style={{ fontWeight: 'bold' }}>ชั้น</Text> {curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''}
                    {"   "}<Text style={{ fontWeight: 'bold' }}>ภาคเรียนที่</Text> {termToDisplay}
                    {"   "}<Text style={{ fontWeight: 'bold' }}>ปีการศึกษา</Text> {academicYear}
                </Text>
            </View>

            <View style={styles.contentBox}>
                <View style={styles.content}>
                    {/* แสดงชื่อวิชาในกล่องเนื้อหาเฉพาะหน้าแรก (หน้า 1) */}
                    <Text
                        style={styles.contentTitle}
                        render={({ pageNumber }) => (pageNumber === 2 ? `${label} รายวิชา ${currentCourse?.title}` : '')}
                    />

                    <View style={styles.indicatorList}>
                        {allItems && allItems.length > 0 ? (
                            allItems.map((item, idx) => (
                                <View key={idx} style={styles.indicatorItem} wrap={false}>
                                    <Text style={styles.indicatorNumber}>
                                        {idx + 1}.
                                    </Text>
                                    <Text style={styles.indicatorText}>{item}</Text>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.noData}>-- ไม่พบข้อมูล {label} ในระบบ --</Text>
                        )}
                    </View>
                </View>
            </View>
        </PdfPage>
    );
};

export default IndicatorsPage;