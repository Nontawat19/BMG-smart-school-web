import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Register Thai Font
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
    console.error("Font registration failed in TeacherLeaveRequestPdfDocument", e);
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
        paddingTop: 42, // 1.5 ซม. 
        paddingBottom: 56,
        paddingLeft: 85, // 3 ซม.
        paddingRight: 56, // 2 ซม.
        fontFamily: 'TH Sarabun PSK',
        fontSize: 16,
        lineHeight: 1.4, // ลดลงเพื่อให้กระชับในหน้าเดียว
    },
    center: {
        textAlign: 'center',
        alignItems: 'center',
    },
    right: {
        textAlign: 'right',
    },
    logo: {
        width: 48, // ลดขนาดลงอีกเล็กน้อยเพื่อช่วยให้เนื้อหาขยับขึ้น
        height: 'auto',
        marginBottom: 2,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
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
        textIndent: 30,
        textAlign: 'justify',
    },
    spacer: {
        height: 8, // กระชับระยะห่าง
    },
    signatureSection: {
        marginTop: 20, // ลดลงเล็กน้อย
        alignSelf: 'flex-end',
        alignItems: 'center',
        width: '50%',
    },
    opinionSection: {
        marginTop: 20, // ลดลงเพื่อให้อยู่ในหน้าเดียว
        borderTop: 1,
        borderColor: '#000',
        paddingTop: 10,
    },
    opinionTitle: {
        fontWeight: 'bold',
        marginBottom: 8,
    },
    approvalSignatures: {
        marginTop: 56, // ขยับลงมาประมาณ 4 บรรทัดเพื่อให้มีพื้นที่เซ็นชื่อ
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    approvalSignatureBox: {
        alignItems: 'center',
        width: '48%',
    },
    bold: {
        fontWeight: 'bold',
    }
});

interface TeacherLeaveRequestPdfProps {
    data: {
        teacherName: string;
        leaveType: string;
        reason: string;
        startDate: string;
        endDate: string;
        returnDate: string;
        schoolName: string;
        directorName: string;
        supervisorName?: string;
        supervisorLabel?: string;
        logoUrl?: string;
    };
    today: {
        day: number;
        month: string;
        year: number;
    }
}

const TeacherLeaveRequestPdfDocument: React.FC<TeacherLeaveRequestPdfProps> = ({ data, today }) => {
    const mainText = thaiJustify(
        `ด้วยข้าพเจ้า ${data.teacherName} ตำแหน่งครู มีความประสงค์ขอ${data.leaveType} เนื่องจาก ${data.reason} ตั้งแต่วันที่ ${data.startDate} ถึงวันที่ ${data.endDate} และจะกลับมาปฏิบัติงานตามปกติในวันที่ ${data.returnDate}`
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
                    <Text style={styles.title}>ใบลาครูและบุคลากร</Text>
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
                    <Text>เรียน ผู้อำนวยการ{data.schoolName}</Text>
                </View>

                <View style={styles.spacer} />

                {/* Body Content */}
                <View style={styles.section}>
                    <Text style={styles.paragraph} hyphenationCallback={(word) => [word]}>
                        {mainText}
                    </Text>
                    <Text style={{ textIndent: 30, marginTop: 8 }}>จึงเรียนมาเพื่อโปรดพิจารณาอนุญาต</Text>
                </View>

                {/* Requester Signature */}
                <View style={styles.signatureSection}>
                    <Text>ลงชื่อ ........................................</Text>
                    <Text style={{ marginTop: 8 }}>( {data.teacherName} )</Text>
                    <Text style={{ marginTop: 4 }}>ผู้ขอลา</Text>
                </View>

                {/* Director Opinion */}
                <View style={styles.opinionSection}>
                    <Text style={styles.opinionTitle}>ความเห็นของผู้บังคับบัญชา</Text>
                    <Text style={{ width: '100%', marginBottom: 4 }}>...................................................................................................................................................................</Text>
                    <Text style={{ width: '100%', marginBottom: 4 }}>...................................................................................................................................................................</Text>
                    <Text style={{ width: '100%' }}>...................................................................................................................................................................</Text>
                    <View style={styles.approvalSignatures}>
                        <View style={styles.approvalSignatureBox}>
                            <Text>ลงชื่อ ........................................</Text>
                            <Text style={{ marginTop: 8 }}>( {data.supervisorName || "........................................"} )</Text>
                            <Text style={{ marginTop: 4 }}>{data.supervisorLabel || "ผู้บังคับบัญชา"}</Text>
                        </View>
                        <View style={styles.approvalSignatureBox}>
                            <Text>ลงชื่อ ........................................</Text>
                            <Text style={{ marginTop: 8 }}>( {data.directorName} )</Text>
                            <Text style={{ marginTop: 4 }}>ผู้อำนวยการ{data.schoolName}</Text>
                        </View>
                    </View>
                </View>
            </Page>
        </Document>
    );
};

export default TeacherLeaveRequestPdfDocument;
