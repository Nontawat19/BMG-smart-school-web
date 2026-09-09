import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { TranscriptRow } from '@/utils/remediationUtils';

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
    console.error('Font registration failed in RemediationRequestPdfDocument', e);
}

const styles = StyleSheet.create({
    // react-pdf ใช้ paddingTop เดียวกันทุกหน้า — ตั้งไว้ที่ระยะมาตรฐานของ "หน้าถัดไป" ตามงานสารบรรณ (80pt)
    // เพื่อให้ตารางในหน้า 2 เป็นต้นไปไม่ไปทับเลขหน้า แล้วชดเชยให้หน้าแรก (ที่มีโลโก้/หัวเรื่องอยู่แล้ว
    // ไม่ต้องการ padding เยอะขนาดนี้) ด้วย marginTop ติดลบที่ตัวบล็อกโลโก้ (ดูที่ styles.center) แทน
    page: {
        paddingTop: 80,
        paddingBottom: 56,
        paddingLeft: 56,
        paddingRight: 56,
        fontFamily: 'TH Sarabun PSK',
        fontSize: 15,
        lineHeight: 1.4,
        color: '#000',
    },
    // marginTop ติดลบ = ชดเชย paddingTop ของ page ที่เพิ่มไว้สำหรับหน้าถัดไป ให้หน้าแรก (บล็อกนี้อยู่บนสุด
    // ของหน้าแรกเสมอ) ยังคงอยู่ตำแหน่งเดิมเป๊ะ ไม่ขยับตามไปด้วย — ต้องตรงกับส่วนต่าง paddingTop เก่ากับใหม่
    center: { textAlign: 'center', alignItems: 'center', marginTop: -38 },
    logo: { width: 55, height: 55, objectFit: 'contain', marginBottom: 2 },
    title: { fontSize: 17, fontWeight: 'bold' },
    schoolLine: { fontSize: 14, marginTop: 2 },
    dateLine: { textAlign: 'right', marginTop: 10 },
    section: { marginTop: 4 },
    fieldRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
    dotted: { borderBottom: '0.5pt dashed #000', paddingHorizontal: 2 },
    // ไม่ใส่ border รอบ tableWrap เอง — View ที่มีเส้นขอบแล้วเนื้อหาข้างในไหลข้ามหน้า จะทำให้ react-pdf
    // ลากเส้นซ้าย/ขวาต่อเลยไปจนสุดหน้าแม้ไม่มีแถวข้อมูลเหลือแล้ว (เส้นเลย/ค้าง) ให้แต่ละแถวปิดกรอบ
    // ของตัวเอง (บน-ล่าง-ซ้าย-ขวา) แทน จะได้ไม่มีอะไรเลยข้ามหน้าไปโดยไม่มีเนื้อหา
    tableWrap: { marginTop: 8 },
    termHeaderRow: { flexDirection: 'row', backgroundColor: '#ffffff', borderTop: '0.75pt solid #000', borderLeft: '0.75pt solid #000', borderRight: '0.75pt solid #000', borderBottom: '0.5pt solid #000' },
    termHeaderCell: { padding: 2, fontWeight: 'bold', fontSize: 12.5 },
    tableHeaderRow: { flexDirection: 'row', backgroundColor: '#e5e5e5', borderTop: '0.75pt solid #000', borderBottom: '0.75pt solid #000' },
    tableRow: { flexDirection: 'row', borderBottom: '0.5pt solid #000' },
    th: { padding: 2, fontWeight: 'bold', fontSize: 12.5, textAlign: 'center', borderLeft: '0.75pt solid #000', borderRight: '0.5pt solid #000' },
    td: { padding: 2, fontSize: 12.5, textAlign: 'center', borderLeft: '0.75pt solid #000', borderRight: '0.5pt solid #000' },
    tdLeft: { padding: 2, fontSize: 12.5, textAlign: 'left', borderLeft: '0.75pt solid #000', borderRight: '0.5pt solid #000' },
    totalLabelCell: { padding: 2, fontSize: 12.5, fontWeight: 'bold', textAlign: 'left', borderLeft: '0.75pt solid #000', borderRight: '0.5pt solid #000' },
    pageNumber: { position: 'absolute', top: 36, left: 0, width: '100%', textAlign: 'center', fontSize: 13 },
    signatureSection: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
    signatureBlock: { alignItems: 'center', width: '48%', marginBottom: 8 },
    dots: { fontSize: 14 },
    approvalRow: { marginTop: 8 },
    approvalLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
});

// รหัสวิชา (คีย์นก) 10% | วิชา 27% | นก. 6% | ปกติ 8% | แก้ตัว 8% | เรียนซ้ำ 8% | เกรด 8% | ผู้สอน 25%
const colW = { code: '10%', title: '27%', credits: '6%', normal: '8%', pass: '8%', repeat: '8%', grade: '8%', teacher: '25%' };

const classLevelHeader = (classLevel: string, semester: string, academicYear: string) => {
    const level = String(classLevel || '');
    let prefix = 'มัธยมศึกษาปีที่';
    let value = level;
    if (level.startsWith('ป')) {
        prefix = 'ประถมศึกษาปีที่';
        value = level.replace(/^ป\.?\s?/, '');
    } else if (level.startsWith('ม')) {
        value = level.replace(/^ม\.?\s?/, '');
    }
    return `${prefix} ${value || '-'}: ภาคเรียนที่ ${semester}/${academicYear}`;
};

interface StudentInfo {
    name: string;
    code: string;
    classLevel: string;
    room: string;
    number: string;
}

interface RemediationRequestPdfProps {
    student: StudentInfo;
    guardianName?: string;
    schoolInfo: any;
    requestDate: { day: string; month: string; year: string };
    requestAcademicYear: string;
    requestSemester: string;
    rows: TranscriptRow[];
    advisorNames: string[];
    directorName: string;
    principalPosition?: string;
}

// เนื้อหา 1 หน้า/นักเรียน 1 คน — แยกออกมาจาก <Document> เพื่อให้ทั้งพิมพ์ทีละคน (RemediationRequestPdfDocument)
// และพิมพ์รวมหลายคนในไฟล์เดียว (RemediationRequestPdfBulkDocument) ใช้ชุดเดียวกันได้ ไม่ต้อง duplicate โครงหน้า
export const RemediationRequestPdfPage: React.FC<RemediationRequestPdfProps> = ({
    student,
    guardianName,
    schoolInfo,
    requestDate,
    requestAcademicYear,
    requestSemester,
    rows,
    advisorNames,
    directorName,
    principalPosition = 'ผู้อำนวยการโรงเรียน',
}) => {
    const rawSchoolName = schoolInfo?.schoolName || 'โรงเรียน................................';
    const schoolName = rawSchoolName.startsWith('โรงเรียน') ? rawSchoolName : `โรงเรียน${rawSchoolName}`;

    const classLevelText = student.classLevel || '';
    let levelPrefix = 'มัธยมศึกษาปีที่';
    let levelValue = classLevelText;
    if (classLevelText.startsWith('ป')) {
        levelPrefix = 'ประถมศึกษาปีที่';
        levelValue = classLevelText.replace(/^ป\.?\s?/, '');
    } else if (classLevelText.startsWith('ม')) {
        levelValue = classLevelText.replace(/^ม\.?\s?/, '');
    }

    // จัดกลุ่มตาม ชั้น/ภาคเรียน/ปีการศึกษา ตามลำดับที่ fetchStudentTranscript เรียงมาให้แล้ว (เก่า -> ใหม่)
    const groups: { header: string; rows: TranscriptRow[] }[] = [];
    rows.forEach(r => {
        const header = classLevelHeader(r.classLevel, r.semester, r.academicYear);
        const last = groups[groups.length - 1];
        if (last && last.header === header) last.rows.push(r);
        else groups.push({ header, rows: [r] });
    });

    const totalCredits = rows.reduce((sum, r) => sum + (Number(r.credits) || 0), 0);
    const advisor1 = advisorNames[0] || '';
    const advisor2 = advisorNames[1] || '';

    return (
            <Page size="A4" style={styles.page} wrap>
                <Text
                    style={styles.pageNumber}
                    fixed
                    render={({ pageNumber }) => (pageNumber > 1 ? `- ${pageNumber} -` : '')}
                />
                <View style={styles.center}>
                    {schoolInfo?.logoUrl ? <Image src={schoolInfo.logoUrl} style={styles.logo} /> : null}
                    <Text style={styles.title}>คำร้องขอแก้ไขผลการเรียน</Text>
                </View>

                <View style={styles.dateLine}>
                    <Text>เขียนที่ {schoolName}</Text>
                    <View style={[styles.fieldRow, { justifyContent: 'flex-end', marginTop: 2 }]}>
                        <Text>วันที่ </Text>
                        <Text style={[styles.dotted, { width: 26, textAlign: 'center' }]}>{requestDate.day || ''}</Text>
                        <Text> เดือน </Text>
                        <Text style={[styles.dotted, { width: 85, textAlign: 'center' }]}>{requestDate.month || ''}</Text>
                        <Text> พ.ศ. </Text>
                        <Text style={[styles.dotted, { width: 55, textAlign: 'center' }]}>{requestDate.year || ''}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text>เรื่อง ขอแก้ไขผลการเรียน</Text>
                    <Text>เรียน ผู้อำนวยการ{schoolName}</Text>
                </View>

                <View style={[styles.section, { marginTop: 8 }]}>
                    <View style={[styles.fieldRow, { marginLeft: 40 }]}>
                        <Text>ข้าพเจ้า </Text>
                        <Text style={[styles.dotted, { width: 220, textAlign: 'center' }]}>{student.name || ''}</Text>
                        <Text> นักเรียนชั้น{levelPrefix} {levelValue || '-'} ห้องที่ {student.room || '-'} เลขที่ {student.number || '-'}</Text>
                    </View>
                    <View style={[styles.fieldRow, { marginTop: 4 }]}>
                        <Text>เลขประจำตัว </Text>
                        <Text style={[styles.dotted, { width: 90, textAlign: 'center' }]}>{student.code || ''}</Text>
                        <Text> มีความประสงค์ขอแก้ไขผลการเรียนในภาคเรียนที่ {requestSemester || '-'} ปีการศึกษา {requestAcademicYear || '-'}</Text>
                    </View>
                    <Text style={{ marginTop: 6 }}>
                        ดังนั้น จึงขอความกรุณาทางโรงเรียนได้โปรดพิจารณาให้ข้าพเจ้าแก้ไขผลการเรียน ในรายวิชาดังต่อไปนี้
                    </Text>
                </View>

                <View style={styles.tableWrap}>
                    <View style={styles.tableHeaderRow} fixed>
                        <Text style={[styles.th, { width: colW.code, textAlign: 'left' }]}>รหัสวิชา</Text>
                        <Text style={[styles.th, { width: colW.title, textAlign: 'left' }]}>วิชา</Text>
                        <Text style={[styles.th, { width: colW.credits }]}>นก.</Text>
                        <Text style={[styles.th, { width: colW.normal }]}>ปกติ</Text>
                        <Text style={[styles.th, { width: colW.pass }]}>แก้ตัว</Text>
                        <Text style={[styles.th, { width: colW.repeat }]}>เรียนซ้ำ</Text>
                        <Text style={[styles.th, { width: colW.grade }]}>เกรด</Text>
                        <Text style={[styles.th, { width: colW.teacher, textAlign: 'left' }]}>ผู้สอน</Text>
                    </View>

                    {groups.length === 0 ? (
                        <View style={styles.tableRow}>
                            <Text style={[styles.td, { width: '100%' }]}>— ไม่พบประวัติผลการเรียน —</Text>
                        </View>
                    ) : groups.map((g, gIdx) => (
                        <View key={gIdx}>
                            <View style={styles.termHeaderRow}>
                                <Text style={[styles.termHeaderCell, { width: '100%' }]}>{g.header}</Text>
                            </View>
                            {g.rows.map(row => (
                                <View key={row.key} style={styles.tableRow} wrap={false}>
                                    <Text style={[styles.tdLeft, { width: colW.code }]}>{row.courseCode}</Text>
                                    <Text style={[styles.tdLeft, { width: colW.title }]}>{row.courseTitle}</Text>
                                    <Text style={[styles.td, { width: colW.credits }]}>{row.credits ? row.credits.toFixed(1) : ''}</Text>
                                    <Text style={[styles.td, { width: colW.normal }]}>{row.grade !== '-' ? row.grade : ''}</Text>
                                    <Text style={[styles.td, { width: colW.pass }]}>{row.passMark || ''}</Text>
                                    <Text style={[styles.td, { width: colW.repeat }]}>{row.repeatMark || ''}</Text>
                                    <Text style={[styles.td, { width: colW.grade }]}>{row.finalGrade !== '-' ? row.finalGrade : ''}</Text>
                                    <Text style={[styles.tdLeft, { width: colW.teacher }]}>{row.teacherName}</Text>
                                </View>
                            ))}
                        </View>
                    ))}

                    <View style={styles.tableRow} wrap={false}>
                        <Text style={[styles.totalLabelCell, { width: colW.code }]}></Text>
                        <Text style={[styles.totalLabelCell, { width: colW.title }]}>รวมจำนวนหน่วยกิต</Text>
                        <Text style={[styles.td, { width: colW.credits, fontWeight: 'bold' }]}>{totalCredits > 0 ? totalCredits.toFixed(1) : ''}</Text>
                        <Text style={[styles.td, { width: colW.normal }]}></Text>
                        <Text style={[styles.td, { width: colW.pass }]}></Text>
                        <Text style={[styles.td, { width: colW.repeat }]}></Text>
                        <Text style={[styles.td, { width: colW.grade }]}></Text>
                        <Text style={[styles.td, { width: colW.teacher }]}></Text>
                    </View>
                </View>

                <View style={styles.signatureSection}>
                    <View style={styles.signatureBlock}>
                        <Text style={styles.dots}>ลงชื่อ ............................................. นักเรียน</Text>
                        <Text style={[styles.dots, { marginTop: 2 }]}>
                            ( {student.name || '............................................................'} )
                        </Text>
                    </View>
                    <View style={styles.signatureBlock}>
                        <Text style={styles.dots}>ลงชื่อ .......................................... ผู้ปกครอง</Text>
                        <Text style={[styles.dots, { marginTop: 2 }]}>
                            ( {guardianName || '............................................................'} )
                        </Text>
                    </View>
                </View>

                <View style={styles.approvalRow} wrap={false}>
                    <Text>
                        ได้ตรวจสอบรายวิชาที่นักเรียนยื่นคำร้องขอแก้ไขผลการเรียน ถูกต้องครบถ้วนทุกรายวิชา ตามเอกสารที่งานวัดผลมอบให้แล้ว
                    </Text>
                    {/* ส่วนลงนามครูที่ปรึกษา */}
                    {advisor2 ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                            <View style={{ width: '48%', alignItems: 'center' }}>
                                <Text style={styles.dots}>ลงชื่อ ...................................... ครูที่ปรึกษา</Text>
                                <Text style={[styles.dots, { marginTop: 2 }]}>
                                    ( {advisor1 || '............................................................'} )
                                </Text>
                            </View>
                            <View style={{ width: '48%', alignItems: 'center' }}>
                                <Text style={styles.dots}>ลงชื่อ ...................................... ครูที่ปรึกษา</Text>
                                <Text style={[styles.dots, { marginTop: 2 }]}>
                                    ( {advisor2} )
                                </Text>
                            </View>
                        </View>
                    ) : (
                        <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
                            <View style={{ width: 250, alignItems: 'center' }}>
                                <Text style={styles.dots}>ลงชื่อ ...................................... ครูที่ปรึกษา</Text>
                                <Text style={[styles.dots, { marginTop: 2 }]}>
                                    ( {advisor1 || '............................................................'} )
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={{ marginTop: 12 }}>
                        <Text>ความเห็นผู้อำนวยการ ...........................................................................................................................................................</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginTop: 24 }}>
                        <View style={{ width: 250, alignItems: 'center' }}>
                            <Text style={styles.dots}>ลงชื่อ ............................................................</Text>
                            <Text style={[styles.dots, { marginTop: 2 }]}>
                                ( {directorName || '........................................................'} )
                            </Text>
                            <Text style={[styles.dots, { marginTop: 2 }]}>{principalPosition}</Text>
                            <Text style={[styles.dots, { marginTop: 2 }]}>
                                วันที่ ........... {requestDate.month} {requestDate.year}
                            </Text>
                        </View>
                    </View>
                </View>
            </Page>
    );
};

const RemediationRequestPdfDocument: React.FC<RemediationRequestPdfProps> = (props) => (
    <Document>
        <RemediationRequestPdfPage {...props} />
    </Document>
);

export const RemediationRequestPdfBulkDocument: React.FC<{ entries: RemediationRequestPdfProps[] }> = ({ entries }) => (
    <Document>
        {entries.map((entry, idx) => (
            <RemediationRequestPdfPage key={`${entry.student.code}-${idx}`} {...entry} />
        ))}
    </Document>
);

export default RemediationRequestPdfDocument;
