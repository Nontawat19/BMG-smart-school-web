import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { TH_SARABUN_ADVANCE_WIDTHS, TH_SARABUN_FALLBACK_WIDTH } from './thSarabunMetrics';

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

// ปิดการตัดคำด้วยเครื่องหมาย "-" ทั้งเอกสาร (ป้องกันข้อความ/จุดไข่ปลายาวๆ ถูกแบ่งกลางคำ)
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
    page: {
        paddingTop: 42, // 1.5 ซม. ตามระเบียบงานสารบรรณ (บันทึกข้อความ)
        paddingBottom: 56, // 2 ซม.
        paddingLeft: 85, // 3 ซม.
        paddingRight: 56, // 2 ซม.
        fontFamily: 'TH Sarabun PSK',
        fontSize: 16,
        lineHeight: 1.0,
    },
    headerContainer: {
        flexDirection: 'row',
        height: 45,
        marginBottom: 5,
        alignItems: 'flex-end',
    },
    garuda: {
        width: 42.5, // ครุฑสูง 1.5 ซม. สำหรับบันทึกข้อความ (หนังสือภายนอกใช้ 3 ซม.)
        height: 42.5,
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
        textAlign: 'left',
        lineHeight: 1.15,
        marginBottom: 0,
        textIndent: 40,
    },
    paragraphContinued: {
        textAlign: 'left',
        lineHeight: 1.15,
        marginBottom: 0,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginLeft: 15,
        marginBottom: 1,
    },
    signatureBlock: {
        marginTop: 20,
        alignItems: 'center',
        alignSelf: 'flex-end',
        width: 250,
        marginRight: 20,
    },
    footerContainer: {
        marginTop: 10,
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
        personnelHeadRoleLabel?: string;
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

// ป้องกันคำว่า "โรงเรียน" ซ้ำติดกัน (เช่น ชื่อโรงเรียนในฐานข้อมูลมีคำว่า "โรงเรียน" นำหน้าอยู่แล้ว
// แล้วโค้ดไปเติม "โรงเรียน" นำหน้าซ้ำอีกที เช่น "โรงเรียนโรงเรียนบ้านแก้วปัดโป่ง")
const dedupeSchoolWord = (text: string) => text.replace(/(โรงเรียน)(?:\1)+/g, '$1');

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
    const yearOffset = 543;
    const year = useThaiNumerals ? toThaiNumerals(date.getFullYear() + yearOffset) : date.getFullYear() + yearOffset;
    return `${day} ${months[date.getMonth()]} ${year}`;
};

// 📌 จัดบรรทัดของย่อหน้าภาษาไทยเอง (แทนการปล่อยให้ @react-pdf/renderer ตัดบรรทัดอัตโนมัติ)
// เหตุผล: @react-pdf/renderer ตัดคำได้เฉพาะที่ช่องว่างจริง (' ') เท่านั้น ถ้าไม่มีช่องว่างพอ (คำไทยส่วนใหญ่ไม่มี
// ช่องว่างระหว่างคำ) มันจะบังคับตัดกลางคำและแทรกเครื่องหมาย "-" ให้เสมอ — เราจึงคำนวณเองว่าแต่ละบรรทัดควร
// ตัดตรงไหนโดยใช้ Intl.Segmenter หาขอบเขตคำที่ถูกต้อง แล้ววัดความกว้างจริงของข้อความด้วยค่า advance width
// ของฟอนต์ TH Sarabun (ดู thSarabunMetrics.ts) เพื่อบรรจุให้แต่ละบรรทัดเต็มพื้นที่ที่สุดโดยไม่ล้น
// ข้อดี: ไม่ต้องแทรกช่องว่างเพิ่มเลย (ตัดที่ตำแหน่งเดิมของข้อความ) จึงไม่เว้นวรรคผิดธรรมชาติ และไม่มี "-"
const measureTextWidth = (text: string, fontSize: number): number => {
    let widthPer1000 = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        widthPer1000 += TH_SARABUN_ADVANCE_WIDTHS[code] ?? TH_SARABUN_FALLBACK_WIDTH;
    }
    return (widthPer1000 / 1000) * fontSize;
};

// เผื่อ margin ของความคลาดเคลื่อนในการวัดความกว้าง (kerning/การจัดวางจริงอาจต่างเล็กน้อย)
const WRAP_SAFETY_FACTOR = 0.97;

const wrapParagraphLines = (
    text: string,
    maxWidthPt: number,
    firstLineIndentPt: number,
    fontSize: number,
): string[] => {
    if (!text) return [];

    // @ts-ignore
    if (typeof Intl === 'undefined' || !Intl.Segmenter) return [text];

    let segments: string[];
    try {
        // @ts-ignore
        const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
        // @ts-ignore
        segments = Array.from(segmenter.segment(text)).map((s) => s.segment);
    } catch (e) {
        console.warn("Intl.Segmenter error:", e);
        return [text];
    }

    const safeMaxWidth = maxWidthPt * WRAP_SAFETY_FACTOR;
    const widthForLine = (lineIndex: number) => (lineIndex === 0 ? safeMaxWidth - firstLineIndentPt : safeMaxWidth);

    // เครื่องหมายเปิด (เช่น " ' ( [ ) ต้องไม่ค้างอยู่ท้ายบรรทัดตามลำพัง — ให้ย้ายไปอยู่ต้นบรรทัดถัดไปแทน
    const OPENING_PUNCTUATION = new Set(['"', "'", '(', '[', '“', '‘']);

    const lines: string[] = [];
    let current = "";

    // คืนค่าอักขระเปิดวงเล็บ/อัญประกาศที่ค้างท้ายบรรทัด เพื่อนำไปต่อกับบรรทัดถัดไป
    const pushLine = (): string => {
        let finalized = current.replace(/\s+$/, '');
        let carry = '';
        while (finalized.length > 0 && OPENING_PUNCTUATION.has(finalized[finalized.length - 1])) {
            carry = finalized[finalized.length - 1] + carry;
            finalized = finalized.slice(0, -1).replace(/\s+$/, '');
        }
        lines.push(finalized);
        current = "";
        return carry;
    };

    for (const seg of segments) {
        const isSpace = seg.trim() === '';
        const candidate = current + seg;

        if (current.length > 0 && measureTextWidth(candidate, fontSize) > widthForLine(lines.length)) {
            const carry = pushLine();
            current = isSpace ? carry : carry + seg;
            continue;
        }

        current = candidate;

        // คำเดี่ยวยาวเกินกว่าจะอยู่ได้แม้ขึ้นบรรทัดใหม่ (กรณีสุดโต่ง) — บรรจุให้เต็มบรรทัดเท่าที่จะทำได้
        if (measureTextWidth(current, fontSize) > widthForLine(lines.length) && current.length > 1) {
            // ถอยกลับทีละตัวอักษรจนกว่าจะพอดี แล้วดันส่วนที่เหลือไปบรรทัดถัดไป
            let cut = current.length;
            while (cut > 1 && measureTextWidth(current.slice(0, cut), fontSize) > widthForLine(lines.length)) {
                cut--;
            }
            const remainder = current.slice(cut);
            current = current.slice(0, cut);
            const carry = pushLine();
            current = carry + remainder;
        }
    }

    if (current.trim().length > 0 || lines.length === 0) {
        lines.push(current.replace(/\s+$/, ''));
    }

    return lines;
};

// 📌 คำนวณ letterSpacing ให้แต่ละบรรทัด (ยกเว้นบรรทัดสุดท้ายของย่อหน้า) "ยืด" ตัวอักษรให้เต็มเสมอกับ
// ระยะขอบกระดาษที่ตั้งไว้พอดี (แบบเดียวกับ "การกระจายแบบไทย" ใน Word) แทนการเว้นวรรคระหว่างคำเพิ่ม
const justifyLetterSpacing = (line: string, targetWidthPt: number, fontSize: number): number => {
    if (line.length <= 1) return 0;
    const extra = targetWidthPt - measureTextWidth(line, fontSize);
    if (extra <= 0) return 0;
    return extra / (line.length - 1);
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
    const rawDocNo = data.docNo || (data.id ? `${data.id.substring(0, 4)}/${getCurrentThaiYear()}` : ".......................................");
    const docNo = toThaiNumerals(rawDocNo);
    const currentDate = formatThaiDate(new Date().toISOString().split('T')[0]);
    const requesterName = data.requesterName || "....................................";
    const position = toThaiNumerals(data.position || ".......................");
    const department = toThaiNumerals(data.department || ".......................");
    const schoolAffiliation = toThaiNumerals(data.schoolAffiliation || "");
    const subject = data.subject || "ขออนุญาตไปราชการ";
    const rawTo = dedupeSchoolWord(data.to || `ผู้อำนวยการโรงเรียน${schoolName}`);
    const to = rawTo.startsWith("เรียน") ? rawTo.replace("เรียน", "").trim() : rawTo;

    const specificSubject = toThaiNumerals(data.reason || "..........................................................................");
    const location = toThaiNumerals(data.location || "...................................");
    const refDoc = data.refDocument ? toThaiNumerals(data.refDocument) : " - ";
    const refDate = data.refDate ? formatThaiDate(data.refDate) : " - ";
    const coAdventurerNames = data.coAdventurers && data.coAdventurers.length > 0
        ? toThaiNumerals(data.coAdventurers.map(p => p.name).join(', '))
        : "";

    // 📌 จัดเตรียมข้อความย่อหน้าหลัก แล้วตัดบรรทัดเอง (ดูเหตุผลที่ wrapParagraphLines ด้านบน)
    const mainContentRaw =
        `ด้วย ข้าพเจ้า ${requesterName} ตำแหน่ง ${position} ` +
        `สังกัด ${department}${coAdventurerNames ? ` พร้อมด้วย ${coAdventurerNames}` : ""} ` +
        `มีความประสงค์จะขออนุญาตไปราชการ เรื่อง ${specificSubject} ` +
        `สถานที่ ณ ${location} ตามหนังสือ/คำสั่งที่ ${refDoc} ลว. ${refDate} ` +
        `ตั้งแต่วันที่ ${formatThaiDate(data.startDate)} ถึงวันที่ ${formatThaiDate(data.endDate)}`;

    const paragraphWidthPt = 595.28 - styles.page.paddingLeft - styles.page.paddingRight;
    const mainContentLines = wrapParagraphLines(mainContentRaw, paragraphWidthPt, styles.paragraph.textIndent, styles.page.fontSize);
    const mainContentRows = mainContentLines.map((line, idx) => {
        const isLast = idx === mainContentLines.length - 1;
        const lineMaxWidth = idx === 0 ? paragraphWidthPt - styles.paragraph.textIndent : paragraphWidthPt;
        const letterSpacing = isLast ? 0 : justifyLetterSpacing(line, lineMaxWidth, styles.page.fontSize);
        return { line, letterSpacing };
    });

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
                    <Text style={{ fontSize: 16, top: 1 }}>{dedupeSchoolWord(`โรงเรียน${schoolName}`)} {schoolAffiliation && `สังกัด${schoolAffiliation}`}</Text>
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
                    {mainContentRows.map(({ line, letterSpacing }, idx) => (
                        <Text
                            key={idx}
                            wrap={false}
                            style={[
                                idx === 0 ? styles.paragraph : styles.paragraphContinued,
                                letterSpacing > 0 ? { letterSpacing } : {},
                            ]}
                        >
                            {line}
                        </Text>
                    ))}
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
                            <Text>อื่น ๆ {isBudgetOther ? toThaiNumerals(data.budgetDetail || '') : '.....................................................................................................................................'}</Text>
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
                    <Text style={{ marginTop: 6 }}>จึงเรียนมาเพื่อโปรดทราบ</Text>
                </View>

                {/* 📌 ตัวถ่วงยืดหยุ่น: ดันส่วนลงชื่อ/ความเห็นลงไปให้สมดุลกับพื้นที่หน้ากระดาษที่เหลือ
                    ไม่ว่าเนื้อหาด้านบนจะสั้นหรือยาว (ถ้าเนื้อหายาวจนไม่เหลือพื้นที่ ตัวถ่วงนี้จะยุบเหลือ 0 อัตโนมัติ) */}
                <View style={{ flexGrow: 1, maxHeight: 90 }} />

                {/* Requester Signature */}
                <View style={styles.signatureBlock} wrap={false}>
                    <View style={{ alignItems: 'center' }}>
                        <Text>(ลงชื่อ)...........................................................</Text>
                        <Text style={{ marginTop: 6 }}>( {requesterName} )</Text>
                        <Text style={{ marginTop: 4 }}>ตำแหน่ง {position}</Text>
                    </View>
                </View>

                {/* Footer Columns */}
                <View style={[styles.footerContainer, { height: 'auto', alignItems: 'stretch', justifyContent: 'space-between' }]} wrap={false}>
                    {/* Col 1: Admin Head */}
                    <View style={[styles.footerColumn, { width: '33%', borderRightWidth: 1, borderColor: '#000', paddingHorizontal: 5 }]}>
                        <Text style={{ textDecoration: 'underline', fontWeight: 'bold', marginBottom: 4, fontSize: 13, textAlign: 'center' }}>ความเห็น{data.personnelHeadRoleLabel || "หัวหน้ากลุ่มบริหารงานบุคคล"}</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>

                        <View style={{ marginTop: 8, alignItems: 'center' }}>
                            <Text style={{ fontSize: 13 }}>(ลงชื่อ)...........................................</Text>
                            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 1.2, textAlign: 'center' }}>( {data.personnelHeadName || "..........................................."} )</Text>
                            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 1.2, textAlign: 'center' }}>{data.personnelHeadRoleLabel || "หัวหน้ากลุ่มบริหารงานบุคคล"}</Text>
                        </View>
                    </View>

                    {/* Col 2: Deputy */}
                    <View style={[styles.footerColumn, { width: '33%', borderRightWidth: 1, borderColor: '#000', paddingHorizontal: 5 }]}>
                        <Text style={{ textDecoration: 'underline', fontWeight: 'bold', marginBottom: 4, fontSize: 13, textAlign: 'center' }}>ความเห็นรองผู้อำนวยการ</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>
                        <Text style={{ fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 0.8 }}>......................................................</Text>

                        <View style={{ marginTop: 8, alignItems: 'center' }}>
                            <Text style={{ fontSize: 13 }}>(ลงชื่อ)...........................................</Text>
                            {/* ถ้าโรงเรียนไม่มีรองผู้อำนวยการ ให้เว้นว่างไว้ ไม่ต้องใส่จุดไข่ปลาแทนชื่อ */}
                            {data.deputyName && (
                                <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 1.2, textAlign: 'center' }}>( {data.deputyName} )</Text>
                            )}
                            <Text style={{ marginTop: 4, textAlign: 'center', fontSize: 13, lineHeight: 1.2 }}>{dedupeSchoolWord(`รองผู้อำนวยการ${schoolName}`)}</Text>
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

                        <View style={{ marginTop: 8, alignItems: 'center' }}>
                            <Text style={{ fontSize: 13 }}>(ลงชื่อ)...........................................</Text>
                            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 1.2, textAlign: 'center' }}>( {data.directorName || "..........................................."} )</Text>
                            <Text style={{ marginTop: 4, textAlign: 'center', fontSize: 13, lineHeight: 1.2 }}>{dedupeSchoolWord(`ผู้อำนวยการ${schoolName}`)}</Text>
                        </View>
                    </View>
                </View>

            </Page>
        </Document>
    );
};

export default OfficialTravelPdfDocument;
