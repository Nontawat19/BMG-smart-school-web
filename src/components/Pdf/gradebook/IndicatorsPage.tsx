import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import PdfPage from './PdfPage';
import { buildJustifiedLines } from '../shared/thaiPdfTextUtils';

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

// ความกว้างที่ใช้ได้จริงของคอลัมน์ข้อความตัวชี้วัด (pt) คำนวณจาก:
// A4 (595.28pt) - padding หน้า (10mm ขวา, 15mm ซ้าย) - padding กล่องเนื้อหา (18pt x2) - คอลัมน์เลขข้อ (30pt)
const INDICATOR_TEXT_WIDTH_PT = 458.41;
const INDICATOR_FONT_SIZE = 15;

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
    // กรอบเส้นขอบตกแต่ง วาดเป็น fixed element แยกจากเนื้อหา เพื่อให้แสดงกรอบสมบูรณ์ครบทุกด้านในทุกหน้าเสมอ
    // (ถ้าใส่ borderWidth ไว้ที่กล่องเนื้อหาโดยตรง react-pdf จะตัดเส้นขอบบน/ล่างออกเมื่อเนื้อหาล้นไปหน้าถัดไปอัตโนมัติ)
    decorativeBorder: {
        position: 'absolute',
        top: '25mm',
        left: '15mm',
        right: '10mm',
        bottom: '20mm',
        borderWidth: 1.2,
        borderColor: 'black'
    },
    // ข้อมูลรายวิชา: อยู่นอกกรอบตาราง ใต้ข้อความ "ตัวชี้วัด" — เป็น fixed/absolute เหมือนหัวข้อ
    // เพื่อให้อยู่ตำแหน่งเดิมทุกหน้า (นอกกรอบเสมอ ไม่ถูกดันเข้าไปในตารางเมื่อขึ้นหน้าใหม่)
    subHeader: {
        position: 'absolute',
        top: '17mm',
        left: '15mm',
        right: '10mm',
        textAlign: 'center',
        fontSize: 14
    },
    contentBox: {
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
        // ใช้ marginTop (แทน paddingTop ที่กล่องแม่) เพราะ react-pdf จะรีเซ็ต paddingTop/marginTop
        // ของ "กล่องที่ถูกตัดขึ้นหน้าใหม่" เป็น 0 เสมอเมื่อเนื้อหาล้นไปหน้าถัดไปอัตโนมัติ ทำให้ข้อแรกของ
        // หน้าใหม่ชิดเส้นกรอบด้านบนพอดี — แต่ margin ของ "รายการย่อยแต่ละอัน" (ที่ไม่ถูกตัดเพราะ wrap={false})
        // จะไม่ถูกรีเซ็ต จึงให้ระยะห่างที่สม่ำเสมอทั้งต้นหน้าและระหว่างข้อ
        marginTop: 10,
        marginBottom: 3,
        alignItems: 'flex-start'
    },
    indicatorNumber: {
        width: 30,
        textAlign: 'left',
        fontWeight: 'bold'
    },
    indicatorTextContainer: {
        flex: 1,
        flexDirection: 'column'
    },
    indicatorText: {
        lineHeight: 1.35
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
    termToDisplay,
    academicYear,
    curriculumClassDisplay,
    curriculumRoomDisplay,
}) => {
    return (
        <PdfPage style={{ padding: '25mm 10mm 20mm 15mm' }}>
            {/* padding ตามระเบียบงานสารบรรณ: บน 2.5 ซม. (เผื่อพื้นที่หัวกระดาษ "ตัวชี้วัด"/เลขหน้าไม่ให้ทับเนื้อหา), ล่าง 2 ซม. */}

            {/* Header: เริ่มนับหน้าที่ 1 เสมอ */}
            <View style={styles.header} fixed>
                <View style={{ width: 80 }} />
                <Text style={styles.title}>ตัวชี้วัด</Text>
                <View style={{ width: 80 }} />
            </View>

            {/* ข้อมูลรายวิชา: อยู่นอกตาราง ใต้ข้อความ "ตัวชี้วัด" แสดงทุกหน้า */}
            <View style={styles.subHeader} fixed>
                <Text>
                    <Text style={{ fontWeight: 'bold' }}>รายวิชา</Text> {currentCourse?.title}
                    {"   "}<Text style={{ fontWeight: 'bold' }}>รหัสวิชา</Text> {currentCourse?.code}
                    {"   "}<Text style={{ fontWeight: 'bold' }}>ชั้น</Text> {curriculumClassDisplay}{curriculumRoomDisplay ? ` ห้อง ${curriculumRoomDisplay}` : ''}
                    {"   "}<Text style={{ fontWeight: 'bold' }}>ภาคเรียนที่</Text> {termToDisplay}
                    {"   "}<Text style={{ fontWeight: 'bold' }}>ปีการศึกษา</Text> {academicYear}
                </Text>
            </View>

            {/* กรอบเส้นขอบ: fixed เต็มพื้นที่เนื้อหาของหน้า แสดงครบทุกด้านในทุกหน้าที่พิมพ์ */}
            <View style={styles.decorativeBorder} fixed />

            <View style={styles.contentBox}>
                <View style={styles.content}>
                    {/* แสดงชื่อวิชาในกล่องเนื้อหาเฉพาะหน้าแรก (หน้า 1) */}
                    <Text
                        style={styles.contentTitle}
                        render={({ pageNumber }) => (pageNumber === 2 ? `${label} รายวิชา ${currentCourse?.title}` : '')}
                    />

                    <View style={styles.indicatorList}>
                        {allItems && allItems.length > 0 ? (
                            allItems.map((item, idx) => {
                                const justifiedLines = buildJustifiedLines(item, INDICATOR_TEXT_WIDTH_PT, INDICATOR_FONT_SIZE);
                                return (
                                    <View key={idx} style={styles.indicatorItem} wrap={false}>
                                        <Text style={styles.indicatorNumber}>
                                            {idx + 1}.
                                        </Text>
                                        <View style={styles.indicatorTextContainer}>
                                            {justifiedLines.map((l, lineIdx) => (
                                                <Text
                                                    key={lineIdx}
                                                    style={[styles.indicatorText, { letterSpacing: l.letterSpacing }]}
                                                >
                                                    {l.line}
                                                </Text>
                                            ))}
                                        </View>
                                    </View>
                                );
                            })
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
