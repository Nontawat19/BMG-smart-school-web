import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { parseStudentBirthDateParts } from '@/utils/birthDateUtils';

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
    console.error("Font registration failed in PorBor7Document", e);
}

const styles = StyleSheet.create({
    page: {
        position: 'relative',
        fontFamily: 'TH Sarabun PSK',
        fontSize: 16.5,
        lineHeight: 1.12,
        color: '#000',
    },
    krutContainer: {
        position: 'absolute',
        top: 88,
        left: 0,
        width: '100%',
        alignItems: 'center',
    },
    krut: {
        width: 61,
        height: 70,
        objectFit: 'contain',
    },
    title: {
        position: 'absolute',
        top: 173,
        left: 0,
        width: '100%',
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    schoolInfoContainer: {
        position: 'absolute',
        top: 213,
        left: 357,
        width: 180,
        textAlign: 'left',
    },
    schoolName: {
        fontSize: 16.5,
        marginBottom: 3,
    },
    schoolAddress: {
        fontSize: 16.5,
    },
    textLine: {
        position: 'absolute',
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 20,
    },
    lineText: {
        fontSize: 15.5,
        lineHeight: 1,
    },
    boldText: {
        fontSize: 15.5,
        fontWeight: 'bold',
        lineHeight: 1,
    },
    labelText: {
        fontSize: 15.5,
        lineHeight: 1,
        paddingBottom: 2,
    },
    field: {
        height: 18,
        borderBottom: '0.5pt dotted #000',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 1,
    },
    fieldText: {
        fontSize: 15.5,
        lineHeight: 1,
    },
    compactFieldText: {
        fontSize: 14,
        lineHeight: 1,
    },
    centerLine: {
        position: 'absolute',
        left: 0,
        width: '100%',
        textAlign: 'center',
        fontSize: 15.5,
        lineHeight: 1,
    },
    photoContainer: {
        position: 'absolute',
        top: 475,
        left: 86,
        width: 86,
        height: 112,
        border: '0.75pt solid #000',
    },
    studentPhoto: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    signatureBlock: {
        position: 'absolute',
        top: 532,
        left: 350,
        width: 175,
        alignItems: 'center',
    },
    leftSignatureArea: {
        position: 'absolute',
        top: 655,
        left: 55,
        width: 190,
        alignItems: 'center',
    },
    signatureName: {
        fontSize: 16.5,
        marginBottom: 1,
    },
    signaturePosition: {
        fontSize: 16.5,
    },
    footer: {
        position: 'absolute',
        bottom: 35,
        left: 0,
        width: '100%',
        textAlign: 'center',
    },
    footerNote: {
        fontSize: 16,
    },
});

interface PorBor7Props {
    student: any;
    schoolInfo: any;
    academicYear: string;
    issueDate: {
        day: number;
        month: string;
        year: number;
    };
    principalName: string;
    principalPosition?: string;
    headOfDeptName?: string;
    headOfDeptPosition?: string;
    refNo?: string;
}

const PorBor7Document: React.FC<PorBor7Props> = ({
    student,
    schoolInfo,
    academicYear,
    issueDate,
    principalName,
    principalPosition = "ผู้อำนวยการโรงเรียน",
    headOfDeptName = "นางรุ่งทิพย์ นามมีฤทธิ์",
    headOfDeptPosition = "หัวหน้ากลุ่มงานบริหารงานทั่วไป",
}) => {
    const fullName = `${student.title || ''}${student.firstName || ''} ${student.lastName || ''}`.trim();

    const birthDateParts = parseStudentBirthDateParts(student.birthDate);
    const birthDateGregorianYear = birthDateParts && birthDateParts.year >= 2400 ? birthDateParts.year - 543 : birthDateParts?.year;
    const birthDateMonth = birthDateParts && birthDateGregorianYear
        ? new Date(birthDateGregorianYear, birthDateParts.month - 1, birthDateParts.day).toLocaleDateString('th-TH', { month: 'long' })
        : null;
    const day = birthDateParts?.day || '.......';
    const month = birthDateMonth || '....................';
    const year = birthDateParts ? (birthDateParts.year >= 2400 ? birthDateParts.year : birthDateParts.year + 543) : '...........';

    const classLevelText = student.classLevel || '';
    let levelPrefix = 'มัธยมศึกษาปีที่';
    let levelValue = '';

    if (classLevelText.startsWith('ป')) {
        levelPrefix = 'ประถมศึกษาปีที่';
        levelValue = classLevelText.replace(/^[ป]\.?\s?/, '');
    } else {
        levelValue = classLevelText.replace(/^[ม]\.?\s?/, '');
    }

    if (student.room) {
        levelValue = `${levelValue}/${student.room}`;
    }

    const fatherFullName = student.fatherFirstName
        ? `${student.fatherTitle || ''}${student.fatherFirstName} ${student.fatherLastName || ''}`.trim()
        : '......................................................';
    const motherFullName = student.motherFirstName
        ? `${student.motherTitle || ''}${student.motherFirstName} ${student.motherLastName || ''}`.trim()
        : '......................................................';

    const district = schoolInfo?.district || '....................';
    const province = schoolInfo?.province || '....................';
    const postalCode = schoolInfo?.postalCode || '..........';
    const rawSchoolName = schoolInfo?.schoolName || 'โรงเรียน................................';
    const schoolName = rawSchoolName.startsWith('โรงเรียน') ? rawSchoolName : `โรงเรียน${rawSchoolName}`;
    const studentPhotoSrc = student.profileImageDataUrl || student.profileImageUrl || '';
    const fieldTextStyle = (value: string) => (
        value.length > 24 ? styles.compactFieldText : styles.fieldText
    );

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.krutContainer}>
                    <Image src="/assets/images/garuda_official.jpg" style={styles.krut} />
                </View>

                <Text style={styles.title}>หนังสือรับรองความประพฤติ</Text>

                <View style={styles.schoolInfoContainer}>
                    <Text style={styles.schoolName}>{schoolName}</Text>
                    <Text style={styles.schoolAddress}>อำเภอ{district} จังหวัด{province} {postalCode}</Text>
                </View>

                <View style={[styles.textLine, { top: 278, left: 158, width: 320 }]}>
                    <Text style={styles.labelText}>ขอรับรองว่า</Text>
                    <View style={[styles.field, { width: 165, marginLeft: 24 }]}>
                        <Text style={[styles.boldText, fieldTextStyle(fullName)]}>{fullName || '......................................................'}</Text>
                    </View>
                </View>

                <View style={[styles.textLine, { top: 301, left: 72, width: 500 }]}>
                    <Text style={styles.labelText}>เลขประจำตัว</Text>
                    <View style={[styles.field, { width: 58, marginLeft: 11 }]}>
                        <Text style={styles.fieldText}>{student.studentId || '..........'}</Text>
                    </View>
                    <Text style={[styles.labelText, { marginLeft: 18 }]}>เกิดวันที่</Text>
                    <View style={[styles.field, { width: 35, marginLeft: 10 }]}>
                        <Text style={styles.fieldText}>{day}</Text>
                    </View>
                    <Text style={[styles.labelText, { marginLeft: 18 }]}>เดือน</Text>
                    <View style={[styles.field, { width: 70, marginLeft: 10 }]}>
                        <Text style={styles.fieldText}>{month}</Text>
                    </View>
                    <Text style={[styles.labelText, { marginLeft: 18 }]}>พ.ศ.</Text>
                    <View style={[styles.field, { width: 48, marginLeft: 10 }]}>
                        <Text style={styles.fieldText}>{year}</Text>
                    </View>
                </View>

                <View style={[styles.textLine, { top: 323, left: 72, width: 500 }]}>
                    <Text style={styles.labelText}>บิดาชื่อ</Text>
                    <View style={[styles.field, { width: 145, marginLeft: 18 }]}>
                        <Text style={fieldTextStyle(fatherFullName)}>{fatherFullName}</Text>
                    </View>
                    <Text style={[styles.labelText, { marginLeft: 20 }]}>มารดาชื่อ</Text>
                    <View style={[styles.field, { width: 162, marginLeft: 10 }]}>
                        <Text style={fieldTextStyle(motherFullName)}>{motherFullName}</Text>
                    </View>
                </View>

                <View style={[styles.textLine, { top: 345, left: 72, width: 500 }]}>
                    <Text style={styles.labelText}>กำลังศึกษาอยู่ชั้น{levelPrefix}</Text>
                    <View style={[styles.field, { width: 44, marginLeft: 10 }]}>
                        <Text style={styles.fieldText}>{levelValue || '.........'}</Text>
                    </View>
                    <Text style={[styles.labelText, { marginLeft: 28 }]}>ปีการศึกษา</Text>
                    <View style={[styles.field, { width: 70, marginLeft: 10 }]}>
                        <Text style={styles.fieldText}>{academicYear}</Text>
                    </View>
                </View>

                <Text style={[styles.lineText, { position: 'absolute', top: 368, left: 72, width: 485 }]}>
                    {schoolName} อำเภอ{district} จังหวัด{province} เป็นผู้มีความประพฤติ เรียบร้อย
                </Text>

                <Text style={[styles.centerLine, { top: 413 }]}>
                    ออกให้  ณ  วันที่      {issueDate.day}      เดือน     {issueDate.month}     พ.ศ.      {issueDate.year}
                </Text>

                <View style={styles.photoContainer}>
                    {studentPhotoSrc ? <Image src={studentPhotoSrc} style={styles.studentPhoto} /> : null}
                </View>

                <View style={styles.signatureBlock}>
                    <Text style={styles.signatureName}>(  {principalName}  )</Text>
                    <Text style={styles.signaturePosition}>{principalPosition}</Text>
                </View>

                <View style={styles.leftSignatureArea}>
                    <Text style={styles.signatureName}>(  {headOfDeptName}  )</Text>
                    <Text style={styles.signaturePosition}>{headOfDeptPosition}</Text>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerNote}>( ใบรับรองนี้กำหนดหมดอายุ 120 วัน นับตั้งแต่ออกให้ )</Text>
                </View>
            </Page>
        </Document>
    );
};

export default PorBor7Document;
