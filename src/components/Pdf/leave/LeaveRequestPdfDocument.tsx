import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Register Thai Font
// Note: Matches the fonts already available in the project for other PDFs
try {
    Font.register({
        family: 'TH Sarabun PSK',
        fonts: [
            { src: '/fonts/THSarabunNew.ttf' },
            { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
            { src: '/fonts/THSarabunNew Italic.ttf', fontStyle: 'italic' },
            { src: '/fonts/THSarabunNew BoldItalic.ttf', fontWeight: 'bold', fontStyle: 'italic' },
        ],
    });
} catch (e) {
    console.error("Font registration failed in LeaveRequestPdfDocument", e);
}

const thaiJustify = (text: string) => {
    if (!text) return "";
    // @ts-ignore
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        try {
            // @ts-ignore
            const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
            // @ts-ignore
            const segments = Array.from(segmenter.segment(text));
            // @ts-ignore
            return segments.map(s => s.segment).join('\u200B');
        } catch (e) {
            console.warn("Intl.Segmenter error:", e);
        }
    }
    return text.split('').join('\u200B');
};

const styles = StyleSheet.create({
    page: {
        paddingTop: 42, // 1.5 ซม. ตามระเบียบงานสารบรรณ (บันทึกข้อความ)
        paddingBottom: 56,
        paddingLeft: 85, // 3 ซม. 
        paddingRight: 56, // 2 ซม. 
        fontFamily: 'TH Sarabun PSK',
        fontSize: 16,
        lineHeight: 1.6, // ปรับให้ดูเป็นทางการมากขึ้น
    },
    center: {
        textAlign: 'center',
        alignItems: 'center',
    },
    right: {
        textAlign: 'right',
    },
    logo: {
        width: 68, // เพิ่มขนาด 30% จาก 52 เป็น 68
        height: 'auto',
        marginBottom: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    schoolName: {
        fontSize: 16,
        marginBottom: 0,
    },
    dateContainer: {
        marginTop: 8,
        alignSelf: 'flex-end',
        textAlign: 'right',
        marginBottom: 10,
        paddingRight: 10,
    },
    section: {
        marginBottom: 0,
    },
    paragraph: {
        textIndent: 30, // 2.5em * 12px (approx)
        textAlign: 'justify',
    },
    spacer: {
        height: 24, // เพิ่มระยะห่างระหว่างย่อหน้าเพื่อให้ดูโปร่งขึ้น
    },
    signatureSection: {
        marginTop: 60, // เลื่อนส่วนลงนามลงมาด้านล่างมากขึ้นเพื่อให้ดูสมดุลกับหน้ากระดาษ
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    signatureBlock: {
        alignItems: 'center',
        width: '45%',
    },
    footerNote: {
        position: 'absolute',
        bottom: 30, // ปรับให้อยู่ล่างสุดของหน้า
        left: 85, // ปรับให้ตรงกับแนวเนื้อหาด้านซ้าย (3 ซม.)
        color: 'red',
        fontStyle: 'italic',
        fontSize: 14, // ลดขนาดลงเล็กน้อยเพื่อให้ดูเป็นหมายเหตุ
    },
    bold: {
        fontWeight: 'bold',
    }
});

interface LeaveRequestPdfProps {
    data: {
        studentName: string;
        studentId?: string;
        leaveType: string;
        reason: string;
        startDate: string;
        endDate: string;
        returnDate: string;
        guardianName: string;
        teacherName: string;
        schoolName: string;
        logoUrl?: string;
    };
    today: {
        day: number;
        month: string;
        year: number;
    }
}

const LeaveRequestPdfDocument: React.FC<LeaveRequestPdfProps> = ({ data, today }) => {
    const mainText = thaiJustify(
        `ด้วย ${data.studentName} นักเรียนรหัส ${data.studentId || '-'} มีความประสงค์ขอ${data.leaveType}เนื่องจาก ${data.reason} ตั้งแต่วันที่ ${data.startDate} ถึงวันที่ ${data.endDate} และจะกลับมาเรียนตามปกติในวันที่ ${data.returnDate}`
    );

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Logo & Header */}
                <View style={styles.center}>
                    {data.logoUrl ? (
                        <Image src={data.logoUrl} style={styles.logo} />
                    ) : (
                        <Image src="/school-logo.png" style={styles.logo} />
                    )}
                    <Text style={styles.title}>ใบลานักเรียน</Text>
                    <Text style={styles.schoolName}>{data.schoolName}</Text>
                </View>

                {/* Date */}
                <View style={styles.dateContainer}>
                    <Text>วันที่ {today.day} เดือน {today.month} พ.ศ. {today.year}</Text>
                </View>

                <View style={styles.spacer} />

                {/* Subject & Recipient */}
                <View style={styles.section}>
                    <Text>เรื่อง ขออนุญาต{data.leaveType}</Text>
                    <Text>เรียน ครูที่ปรึกษา / ครูกลุ่มบริหารงานวิชาการ</Text>
                </View>

                <View style={styles.spacer} />

                {/* Body Content */}
                <View style={styles.section}>
                    <Text style={styles.paragraph} hyphenationCallback={(word) => [word]}>
                        {mainText}
                    </Text>
                </View>

                <View style={styles.spacer} />

                <View style={styles.section}>
                    <Text style={{ textIndent: 30 }}>จึงเรียนมาเพื่อโปรดทราบ</Text>
                </View>

                <View style={styles.spacer} />

                {/* Signature Section */}
                <View style={styles.signatureSection}>
                    <View style={styles.signatureBlock}>
                        <Text>ลงชื่อ ........................................</Text>
                        <Text>({data.guardianName})</Text>
                        <Text>ผู้ปกครอง</Text>
                    </View>
                    <View style={styles.signatureBlock}>
                        <Text>ลงชื่อ ........................................</Text>
                        <Text>({data.teacherName})</Text>
                        <Text>ครูที่ปรึกษา</Text>
                    </View>
                </View>

                {/* Footer Note */}
                <Text style={styles.footerNote}>*กรณีลาป่วยติดต่อกันเกิน 5 วัน จะต้องมีใบรับรองแพทย์แนบมาพร้อมกับใบลา*</Text>
            </Page>
        </Document>
    );
};

export default LeaveRequestPdfDocument;
