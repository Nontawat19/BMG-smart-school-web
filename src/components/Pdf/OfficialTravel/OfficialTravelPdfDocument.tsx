import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Register Thai Font
Font.register({
    family: 'TH Sarabun PSK',
    src: '/fonts/THSarabunNew.ttf',
    fontWeight: 'normal',
});

Font.register({
    family: 'TH Sarabun PSK',
    src: '/fonts/THSarabunNew-Bold.ttf',
    fontWeight: 'bold',
});

const styles = StyleSheet.create({
    page: {
        paddingTop: 13,
        paddingBottom: 25,
        paddingLeft: 85,
        paddingRight: 56,
        fontFamily: 'TH Sarabun PSK',
        fontSize: 16,
        lineHeight: 1.0,
    },
    headerContainer: {
        flexDirection: 'row',
        height: 73,
        marginBottom: 5,
        alignItems: 'flex-end',
    },
    garuda: {
        width: 77.22,
        height: 77.22,
        position: 'absolute',
        top: 0,
        left: 0,
        objectFit: 'contain',
    },
    headerTitle: {
        fontSize: 29,
        fontWeight: 'bold',
        textAlign: 'center',
        width: '100%',
        marginTop: 0,
        lineHeight: 1.0,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 2,
    },
    label: {
        fontWeight: 'bold',
        fontSize: 16,
    },
    content: {
        marginTop: 4,
        marginBottom: 2,
    },
    paragraph: {
        textAlign: 'justify',
        lineHeight: 1.15,
        marginBottom: 2,
        textIndent: 40,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginLeft: 15,
        marginBottom: 1,
    },
    signatureBlock: {
        marginTop: 42,
        alignItems: 'center',
        alignSelf: 'flex-end',
        width: 250,
        marginRight: 20,
    },
    footerContainer: {
        marginTop: 27,
        flexDirection: 'row',
        justifyContent: 'space-between',
        height: 100,
    },
    footerColumn: {
        width: '32%',
        alignItems: 'center',
    },
    footerLine: {
        borderBottomWidth: 1,
        borderBottomColor: '#000',
        borderBottomStyle: 'dotted',
        width: '90%',
        height: 18,
        marginTop: 4,
    },
});

interface Props {
    data: {
        schoolName?: string;
        schoolAffiliation?: string;
        directorName?: string;
        deputyName?: string;
        personnelHeadName?: string;
        requesterName?: string;
        position?: string;
        department?: string;
        subject?: string;
        to?: string;
        reason?: string;
        location?: string;
        startDate?: any;
        endDate?: any;
        budgetDetail?: string;
        specificExpenses?: {
            vehicle: boolean;
            fuel: boolean;
            allowance: boolean;
            accommodation: boolean;
        };
        transportType?: string;
        budgetType?: string;
        transportDetail?: string;
        refDocument?: string;
        refDate?: string;
        id?: string; // For Document Number
        docNo?: string; // 📌 เพิ่มเลขที่เอกสาร
        coAdventurers?: { name: string; position: string; id: string }[];
        requiresSubstitute?: boolean; // 📌 เพิ่มสถานะการสอนแทน
    };
}

const toThaiNumerals = (num: any) => {
    if (num === null || num === undefined) return "";
    const thaiDigits = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
    return num.toString().replace(/[0-9]/g, (digit: string) => thaiDigits[parseInt(digit)]);
};

const formatThaiDate = (dateStr?: any, useThaiNumerals: boolean = true) => {
    if (!dateStr || dateStr === 'undefined') return "................................";
    let date: Date;
    if (typeof dateStr === 'string') {
        date = new Date(dateStr);
    } else if (dateStr && typeof dateStr.toDate === 'function') {
        date = dateStr.toDate();
    } else {
        date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return "................................";
    const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const day = useThaiNumerals ? toThaiNumerals(date.getDate()) : date.getDate();
    const year = useThaiNumerals ? toThaiNumerals(date.getFullYear() + 543) : date.getFullYear() + 543;
    return `${day} ${months[date.getMonth()]} ${year}`;
};

// 📌 ฟังก์ชันช่วยจัดการช่องว่างในภาษาไทยสำหรับการจัดชิดขอบ (Justify)
// แก้ไข: ใช้ Intl.Segmenter (ถ้ามี) เพื่อตัดคำที่ถูกต้อง หรือ fallback เป็น char split
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

    // Fallback: เดิม (ตัดทุกตัวอักษร)
    return text.split('').join('\u200B');
};

const OfficialTravelPdfDocument: React.FC<Props> = ({ data }) => {
    // Green: Logic for Checkboxes
    const isNoBudget = data.budgetType === 'none';
    const isBudgetSchool = data.budgetType === 'school';
    const isBudgetSpecific = data.budgetType === 'specific';
    const isBudgetOther = data.budgetType === 'other';

    const specific = data.specificExpenses || { vehicle: false, fuel: false, allowance: false, accommodation: false };

    const isSchoolVehicle = data.transportType === 'school_vehicle';
    const isPrivateVehicle = data.transportType === 'private_vehicle';
    const isPublicTransport = data.transportType === 'public';
    const isOtherTransport = data.transportType === 'other';

    // Red: Dynamic Data
    const schoolName = data.schoolName || "...................................................";
    const rawDocNo = data.docNo || (data.id ? `${data.id.substring(0, 4)}/${new Date().getFullYear() + 543}` : ".......................................");
    const docNo = toThaiNumerals(rawDocNo);
    const currentDate = formatThaiDate(new Date().toISOString().split('T')[0]);
    const requesterName = data.requesterName || "....................................";
    const position = toThaiNumerals(data.position || ".......................");
    const department = toThaiNumerals(data.department || ".......................");
    const schoolAffiliation = data.schoolAffiliation || "";
    const subject = data.subject || "ขออนุญาตไปราชการ";
    const rawTo = data.to || `ผู้อำนวยการโรงเรียน${schoolName}`;
    const to = rawTo.startsWith("เรียน") ? rawTo.replace("เรียน", "").trim() : rawTo;

    const specificSubject = data.reason || "..........................................................................";
    const location = data.location || "...................................";
    const refDoc = data.refDocument ? toThaiNumerals(data.refDocument) : " - ";
    const refDate = data.refDate ? formatThaiDate(data.refDate) : " - ";

    // 📌 จัดเตรียมข้อความย่อหน้าหลัก และใช้ thaiJustify เพื่อความสวยงาม 100%
    const mainContent = thaiJustify(
        `ด้วย ข้าพเจ้า ${requesterName} ตำแหน่ง ${position} ` +
        `สังกัด ${department}${data.coAdventurers && data.coAdventurers.length > 0 ? ` พร้อมด้วย ${data.coAdventurers.map(p => p.name).join(', ')}` : ""} ` +
        `มีความประสงค์จะขออนุญาตไปราชการ เรื่อง ${specificSubject} ` +
        `สถานที่ ณ ${location} ตามหนังสือ/คำสั่งที่ ${refDoc} ลว. ${refDate} ` +
        `ตั้งแต่วันที่ ${formatThaiDate(data.startDate)} ถึงวันที่ ${formatThaiDate(data.endDate)}`
    );

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header Section: Garuda Left, Title Center */}
                <View style={styles.headerContainer}>
                    <Image
                        style={styles.garuda}
                        src="/assets/images/garuda_official.jpg"
                    />
                    {/* Yellow: Static Title */}
                    <Text style={styles.headerTitle}>บันทึกข้อความ</Text>
                </View>

                {/* Headings */}
                <View style={styles.metaRow}>
                    {/* Yellow: Static Label */}
                    <Text style={styles.label}>ส่วนราชการ   </Text>
                    {/* Red: Dynamic School Name and Affiliation */}
                    <Text style={{ fontSize: 16, top: 1 }}>โรงเรียน{schoolName} {schoolAffiliation && `สังกัด${schoolAffiliation}`}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', width: '50%', alignItems: 'flex-end' }}>
                        {/* Yellow: Static Label */}
                        <Text style={styles.label}>ที่   </Text>
                        {/* Red: Dynamic Doc No */}
                        <Text style={{ fontSize: 16, top: 1 }}>{docNo}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', width: '50%', alignItems: 'flex-end' }}>
                        {/* Yellow: Static Label */}
                        <Text style={styles.label}>วันที่   </Text>
                        {/* Red: Dynamic Date */}
                        <Text style={{ fontSize: 16, top: 1 }}>{currentDate}</Text>
                    </View>
                </View>

                <View style={styles.metaRow}>
                    {/* Yellow: Static Label */}
                    <Text style={styles.label}>เรื่อง   </Text>
                    {/* Yellow: Dynamic Subject */}
                    <Text style={{ fontSize: 16, top: 1 }}>{toThaiNumerals(subject)}</Text>
                </View>

                <View style={[styles.metaRow, { marginBottom: 8, marginTop: 11 }]}>
                    {/* Yellow: Static Label */}
                    <Text style={styles.label}>เรียน   </Text>
                    {/* Red: Dynamic To */}
                    <Text style={{ fontSize: 16, top: 1 }}>{toThaiNumerals(to)}</Text>
                </View>

                {/* Body Paragraphs */}
                <View style={styles.content}>
                    <Text style={styles.paragraph} hyphenationCallback={(word) => [word]}>
                        {mainContent}
                    </Text>
                </View>

                <View style={{ marginTop: 2 }}>
                    <Text style={{ marginBottom: 4 }}>โดยข้าพเจ้า</Text>
                </View>

                {/* Indented Block: Budget & Closing (Tab 1.5cm) */}
                <View style={{ marginLeft: 42.5 }}>
                    <View style={{ marginTop: 0 }}>
                        <View style={styles.checkboxRow}>
                            <Text style={{ width: 20 }}>{isNoBudget ? '[ / ]' : '[   ]'}</Text>
                            <Text>ไม่ขอเบิกค่าใช้จ่าย</Text>
                        </View>

                        <View style={styles.checkboxRow}>
                            <Text style={{ width: 20 }}>{isBudgetSchool ? '[ / ]' : '[   ]'}</Text>
                            <View style={{ flex: 1 }}>
                                <Text>ขอเบิกค่าใช้จ่ายตามสิทธิ์จากเงินงบประมาณหรือเงินนอกงบประมาณของสถานศึกษา</Text>
                                <Text>(ค่าพาหนะเดินทาง, ค่าเบี้ยเลี้ยง, ค่าที่พัก) ตามระเบียบกระทรวงการคลังว่าด้วยการใช้จ่าย</Text>
                                <Text>ในการเดินทางไปราชการ</Text>
                            </View>
                        </View>

                        <View style={styles.checkboxRow}>
                            <Text style={{ width: 20 }}>{isBudgetSpecific ? '[ / ]' : '[   ]'}</Text>
                            <Text>ขอเบิกเฉพาะค่าใช้จ่าย
                                {` [ ${specific.vehicle ? '/' : ' '} ] ค่าพาหนะเดินทาง`}
                                {` [ ${specific.fuel ? '/' : ' '} ] ค่าน้ำมัน`}
                                {` [ ${specific.allowance ? '/' : ' '} ] ค่าเบี้ยเลี้ยง`}
                                {` [ ${specific.accommodation ? '/' : ' '} ] ค่าที่พัก`}
                            </Text>
                        </View>

                        <View style={styles.checkboxRow}>
                            <Text style={{ width: 20 }}>{isBudgetOther ? '[ / ]' : '[   ]'}</Text>
                            <Text>อื่น ๆ {isBudgetOther ? data.budgetDetail : '.....................................................................................................................................'}</Text>
                        </View>

                        <View style={[styles.checkboxRow, { marginTop: 4 }]}>
                            <Text style={{ width: 20 }}>{' '}</Text>
                            <Text>ไปราชการด้วย
                                {` [ ${isSchoolVehicle ? '/' : ' '} ] รถยนต์ราชการ`}
                                {` [ ${isPrivateVehicle ? '/' : ' '} ] ส่วนตัว ทะเบียน ${data.transportDetail ? toThaiNumerals(data.transportDetail) : '...................'}`}
                                {` [ ${isPublicTransport ? '/' : ' '} ] รถโดยสารประจำทาง`}
                            </Text>
                        </View>
                        <View style={styles.checkboxRow}>
                            <Text style={{ width: 20 }}>{isOtherTransport ? '[ / ]' : '[   ]'}</Text>
                            <Text>อื่น ๆ {isOtherTransport ? toThaiNumerals(data.transportDetail) : '.....................................................................................................................................'}</Text>
                        </View>

                        {/* 📌 ส่วนการสอนแทน (ถ้ามีการเลือกไว้) */}
                        {data.requiresSubstitute && (
                            <View style={[styles.checkboxRow, { marginTop: 4 }]}>
                                <Text style={{ width: 20 }}>[ / ]</Text>
                                <Text style={{ fontWeight: 'bold' }}>ได้จัดสรรผู้สอนแทนเรียบร้อยแล้ว</Text>
                            </View>
                        )}
                    </View>

                    {/* Yellow: Standard Closing */}
                    <Text style={{ marginTop: 10 }}>จึงเรียนมาเพื่อโปรดทราบ</Text>
                    <Text>1. อนุมัติการเดินทางไปราชการตามที่เสนอ</Text>
                    <Text>2. ...................................................................................................................................................</Text>
                </View>

                {/* Requester Signature */}
                <View style={styles.signatureBlock}>
                    <View style={{ alignItems: 'center' }}>
                        <Text>(ลงชื่อ)...........................................................</Text>
                        <Text style={{ marginTop: 8 }}>( {requesterName} )</Text>
                        <Text style={{ marginTop: 4 }}>ตำแหน่ง {position}</Text>
                    </View>
                </View>

                {/* Footer Columns */}
                <View style={[styles.footerContainer, { height: 'auto', alignItems: 'stretch', justifyContent: 'space-between', marginTop: 15 }]}>
                    {/* Col 1: Admin Head */}
                    <View style={[styles.footerColumn, { width: '33%', borderRightWidth: 1, borderColor: '#000', paddingHorizontal: 5 }]}>
                        <Text style={{ textDecoration: 'underline', fontWeight: 'bold', marginBottom: 4, fontSize: 13, textAlign: 'center' }}>ความเห็นหัวหน้ากลุ่มบริหารงาน</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>

                        <View style={{ marginTop: 15, alignItems: 'center' }}>
                            <Text style={{ fontSize: 13 }}>(ลงชื่อ)...........................................</Text>
                            <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 1.2, textAlign: 'center' }}>( {data.personnelHeadName || "..........................................."} )</Text>
                            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 1.2, textAlign: 'center' }}>หัวหน้ากลุ่มบริหารงานบุคคล</Text>
                        </View>
                    </View>

                    {/* Col 2: Deputy */}
                    <View style={[styles.footerColumn, { width: '33%', borderRightWidth: 1, borderColor: '#000', paddingHorizontal: 5 }]}>
                        <Text style={{ textDecoration: 'underline', fontWeight: 'bold', marginBottom: 4, fontSize: 13, textAlign: 'center' }}>ความเห็นรองผู้อำนวยการ</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>

                        <View style={{ marginTop: 15, alignItems: 'center' }}>
                            <Text style={{ fontSize: 13 }}>(ลงชื่อ)...........................................</Text>
                            <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 1.2, textAlign: 'center' }}>( {data.deputyName || "..........................................."} )</Text>
                            <Text style={{ marginTop: 4, textAlign: 'center', fontSize: 13, lineHeight: 1.2 }}>รองผู้อำนวยการ{schoolName}</Text>
                        </View>
                    </View>

                    {/* Col 3: Director */}
                    <View style={[styles.footerColumn, { width: '33%', paddingHorizontal: 5 }]}>
                        <Text style={{ textDecoration: 'underline', fontWeight: 'bold', marginBottom: 4, fontSize: 13, textAlign: 'center' }}>ความเห็นผู้อำนวยการโรงเรียน</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 4 }}>
                            <Text style={{ fontSize: 13 }}>[   ] อนุมัติ    </Text>
                            <Text style={{ fontSize: 13 }}>[   ] ไม่อนุมัติ</Text>
                        </View>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>

                        <View style={{ marginTop: 15, alignItems: 'center' }}>
                            <Text style={{ fontSize: 13 }}>(ลงชื่อ)...........................................</Text>
                            <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 1.2, textAlign: 'center' }}>( {data.directorName || "..........................................."} )</Text>
                            <Text style={{ marginTop: 4, textAlign: 'center', fontSize: 13, lineHeight: 1.2 }}>ผู้อำนวยการ{schoolName}</Text>
                        </View>
                    </View>
                </View>

            </Page>
        </Document>
    );
};

export default OfficialTravelPdfDocument;
