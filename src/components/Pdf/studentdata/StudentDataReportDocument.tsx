import React from 'react';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const browser = typeof window !== 'undefined';
const prefix = browser ? '' : './public';

try {
  Font.register({
    family: 'TH Sarabun New',
    fonts: [
      { src: `${prefix}/fonts/THSarabunNew.ttf` },
      { src: `${prefix}/fonts/THSarabunNew-Bold.ttf`, fontWeight: 'bold' },
    ],
  });
} catch {
  // already registered during hot reload
}
Font.registerHyphenationCallback((word) => [word]);

// ขนาดตัวอักษรตามมาตรฐานหนังสือราชการไทย (TH Sarabun New/PSK 16pt สำหรับเนื้อหา)
const BODY_SIZE = 16;
const ROW_HEIGHT = 25;
const DOT_HEIGHT = 17;

const s = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingHorizontal: 40,
    paddingBottom: 22,
    fontFamily: 'TH Sarabun New',
    fontSize: BODY_SIZE,
    color: '#111',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#555',
  },
  schoolHeader: {
    fontSize: BODY_SIZE,
    color: '#111',
  },
  titleHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    marginTop: 4,
    marginBottom: 4,
    height: 22,
  },
  statusLabel: {
    fontSize: BODY_SIZE,
    color: '#111',
  },
  statusDotted: {
    width: 160,
    height: DOT_HEIGHT,
    borderBottomWidth: 0.6,
    borderBottomStyle: 'dotted',
    borderBottomColor: '#333',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingLeft: 4,
    paddingBottom: 0,
  },
  statusText: {
    fontSize: BODY_SIZE,
    fontWeight: 'bold',
    lineHeight: 1,
  },
  introContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  photoBox: {
    width: 90,
    height: 120,
    marginRight: 14,
    borderWidth: 0.5,
    borderColor: '#aaa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoImg: {
    width: 90,
    height: 120,
    objectFit: 'cover',
    objectPosition: 'center top',
    marginRight: 14,
  },
  photoText: {
    fontSize: 10,
    color: '#888',
  },
  introRight: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: ROW_HEIGHT,
    marginBottom: 2,
  },
  label: {
    fontSize: BODY_SIZE,
    color: '#111',
    paddingBottom: 1,
    flexShrink: 0,
  },
  dottedBox: {
    flex: 1,
    height: DOT_HEIGHT,
    borderBottomWidth: 0.6,
    borderBottomStyle: 'dotted',
    borderBottomColor: '#222',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
    paddingBottom: 0,
  },
  value: {
    fontSize: BODY_SIZE,
    color: '#000',
    lineHeight: 1,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 2,
  },
  sectionBullet: {
    fontSize: BODY_SIZE,
    marginRight: 4,
    color: '#111',
  },
  sectionTitle: {
    fontSize: BODY_SIZE,
    fontWeight: 'bold',
    color: '#111',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#555',
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  footerText: {
    fontSize: 11,
    color: '#333',
  },
});

type Student = Record<string, any>;
const v = (val: unknown) => (val === undefined || val === null || val === '' ? '' : String(val));

const Field = ({
  label,
  value,
  width,
  flex,
  labelWidth,
  align = 'left',
}: {
  label: string;
  value?: unknown;
  width?: number;
  flex?: number;
  labelWidth?: number;
  align?: 'left' | 'center';
}) => (
  <View style={[{ flexDirection: 'row', alignItems: 'flex-end', height: ROW_HEIGHT }, width ? { width } : flex ? { flex } : {}]}>
    <Text style={[s.label, labelWidth ? { width: labelWidth } : {}]}>{label} </Text>
    <View style={[s.dottedBox, { alignItems: align === 'left' ? 'flex-start' : 'center', paddingLeft: align === 'left' ? 4 : 0 }]}>
      <Text style={[s.value, { textAlign: align }]}>{v(value) || ' '}</Text>
    </View>
  </View>
);

const FullField = ({ label, value, align = 'left' }: { label: string; value?: unknown; align?: 'left' | 'center' }) => (
  <View style={[s.row, { width: '100%' }]}>
    <Text style={s.label}>{label} </Text>
    <View style={[s.dottedBox, { alignItems: align === 'left' ? 'flex-start' : 'center', paddingLeft: align === 'left' ? 4 : 0 }]}>
      <Text style={s.value}>{v(value) || ' '}</Text>
    </View>
  </View>
);

const SectionHeader = ({ title }: { title: string }) => (
  <View style={s.sectionRow}>
    <Text style={s.sectionBullet}>•</Text>
    <Text style={s.sectionTitle}>{title}</Text>
  </View>
);

const citizenId = (value: unknown) => {
  const digits = v(value).replace(/\D/g, '');
  return digits.length === 13
    ? `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`
    : v(value);
};

const thaiDate = (value: unknown) => {
  const sVal = v(value).trim();
  if (!sVal) return '';
  const match = sVal.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return sVal;
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const yearNum = Number(match[1]);
  const year = yearNum < 2400 ? yearNum + 543 : yearNum;
  return `${Number(match[3])} ${months[Number(match[2]) - 1] || ''} ${year}`;
};

const name = (title?: string, first?: string, last?: string) =>
  [v(title), v(first), v(last)].filter(Boolean).join(' ');

const classLabel = (student: Student) => {
  if (!student.classLevel) return '';
  const roomSuffix = student.room ? `/${student.room}` : '';
  return `${student.classLevel}${roomSuffix}`;
};

const getFullAddress = (student: Student) => {
  const parts = [
    student.curHouseNumber || student.curAddressNumber ? `บ้านเลขที่ ${student.curHouseNumber || student.curAddressNumber}` : '',
    student.curMoo ? `หมู่ ${student.curMoo}` : '',
    student.curVillage ? `หมู่บ้าน${student.curVillage}` : '',
    student.curSoi ? `ซอย${student.curSoi}` : '',
    student.curRoad ? `ถนน${student.curRoad}` : '',
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return v(student.curAddress || student.address || '');
};

interface ParentInfo {
  title: string;
  name: string;
  idCard: string;
  phone: string;
  workPhone: string;
}

const getParentList = (student: Student): ParentInfo[] => {
  const fatherName = name(student.fatherTitle, student.fatherFirstName, student.fatherLastName);
  const motherName = name(student.motherTitle, student.motherFirstName, student.motherLastName);
  const guardianName = name(student.guardianTitle, student.guardianFirstName, student.guardianLastName) || v(student.guardian);
  const guardianRel = student.guardianRelationship || student.guardianRelation || 'ผู้ปกครอง';

  const list: ParentInfo[] = [];

  if (fatherName || student.fatherIdCard || student.fatherIdNumber || student.fatherPhone || student.fatherWorkPhone) {
    list.push({
      title: 'ข้อมูลผู้ปกครอง (บิดา)',
      name: fatherName,
      idCard: citizenId(student.fatherIdNumber || student.fatherIdCard),
      phone: v(student.fatherPhone),
      workPhone: v(student.fatherWorkPhone),
    });
  }

  if (motherName || student.motherIdCard || student.motherIdNumber || student.motherPhone || student.motherWorkPhone) {
    list.push({
      title: 'ข้อมูลผู้ปกครอง (มารดา)',
      name: motherName,
      idCard: citizenId(student.motherIdNumber || student.motherIdCard),
      phone: v(student.motherPhone),
      workPhone: v(student.motherWorkPhone),
    });
  }

  const isGuardianSameAsFather = guardianName && fatherName && guardianName === fatherName;
  const isGuardianSameAsMother = guardianName && motherName && guardianName === motherName;

  if (guardianName || student.guardianIdCard || student.guardianIdNumber || student.guardianPhone || student.guardianWorkPhone) {
    if (!isGuardianSameAsFather && !isGuardianSameAsMother) {
      list.push({
        title: `ข้อมูลผู้ปกครอง (${guardianRel})`,
        name: guardianName,
        idCard: citizenId(student.guardianIdNumber || student.guardianIdCard),
        phone: v(student.guardianPhone || student.contact),
        workPhone: v(student.guardianWorkPhone),
      });
    }
  }

  while (list.length < 3) {
    list.push({
      title: 'ข้อมูลผู้ปกครอง (..................................)',
      name: '',
      idCard: '',
      phone: '',
      workPhone: '',
    });
  }

  return list.slice(0, 3);
};

export interface StudentDataReportDocumentProps {
  schoolName?: string;
  academicYear: string;
  term: string;
  students: Student[];
}

const ReportPage = ({
  student,
  schoolName,
  academicYear,
  term,
}: {
  student: Student;
  schoolName?: string;
  academicYear: string;
  term: string;
}) => {
  const cleanSchool = (schoolName || '').replace(/^โรงเรียน\s*/, '');
  const schoolTopDisplay = `โรงเรียน${cleanSchool || '....................................'}`;
  const parents = getParentList(student);
  const address = getFullAddress(student);
  const studentPhotoSrc = student.profileImageDataUrl || student.profileImageUrl || '';

  return (
    <Page size="A4" style={s.page}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <Text style={s.schoolHeader}>{schoolTopDisplay}</Text>
        <Text style={s.titleHeader}>รายงานข้อมูลนักเรียน</Text>
      </View>

      {/* Status */}
      <View style={s.statusRow}>
        <Text style={s.statusLabel}>สถานะ </Text>
        <View style={s.statusDotted}>
          <Text style={s.statusText}>{student.studentStatus || student.status || 'กำลังศึกษา'}</Text>
        </View>
      </View>

      {/* Intro */}
      <View style={s.introContainer}>
        {studentPhotoSrc ? (
          <Image src={studentPhotoSrc} style={s.photoImg} />
        ) : (
          <View style={s.photoBox}>
            <Text style={s.photoText}>รูปถ่าย 1.5 นิ้ว</Text>
          </View>
        )}
        <View style={s.introRight}>
          <FullField label="โรงเรียน" value={cleanSchool} />
          <View style={s.row}>
            <Field label="เลขประจำตัวนักเรียน" value={student.studentId} flex={1.3} />
            <Field label="ภาคเรียนที่/ปีการศึกษา" value={`${term}/${academicYear}`} flex={1} />
          </View>
          <View style={s.row}>
            <Field label="ชื่อ" value={name(student.title, student.firstName)} flex={1.2} />
            <Field label="ชื่อสกุล" value={student.lastName} flex={1} />
          </View>
          <View style={s.row}>
            <Field label="ระดับชั้น" value={classLabel(student)} flex={1} />
            <Field label="ชื่อเล่น" value={student.nickname} flex={1} />
          </View>
          <FullField label="เลขประจำตัวประชาชน" value={citizenId(student.idCardNumber)} />
          <View style={s.row}>
            <Field label="กรุ๊ปเลือด" value={student.bloodType} flex={0.8} />
            <Field label="วันเกิด" value={thaiDate(student.birthDate)} flex={1.2} />
          </View>
          <View style={s.row}>
            <Field label="สัญชาติ" value={student.nationality || 'ไทย'} flex={1} />
            <Field label="เชื้อชาติ" value={student.ethnicity || 'ไทย'} flex={1} />
          </View>
        </View>
      </View>

      {/* Address */}
      <SectionHeader title="ข้อมูลที่อยู่ (ที่อยู่ปัจจุบัน)" />
      <FullField label="ที่อยู่" value={address} />
      <View style={s.row}>
        <Field label="แขวง/ตำบล" value={student.curSubdistrict || student.curSubDistrict || student.subdistrict} flex={1} />
        <Field label="เขต/อำเภอ" value={student.curDistrict || student.district} flex={1} />
      </View>
      <View style={s.row}>
        <Field label="จังหวัด" value={student.curProvince || student.province} flex={1} />
        <Field label="รหัสไปรษณีย์" value={student.curPostalCode || student.curZipCode || student.postalCode} flex={1} />
      </View>

      {/* Parents (3 blocks) */}
      {parents.map((p, idx) => (
        <View key={idx}>
          <SectionHeader title={p.title} />
          <View style={s.row}>
            <Field label="ชื่อ-นามสกุล" value={p.name} flex={1.6} />
            <Field label="เลขประจำตัวประชาชน" value={p.idCard} flex={1} />
          </View>
          <View style={s.row}>
            <Field label="เบอร์ติดต่อ" value={p.phone} flex={1.6} />
            <Field label="เบอร์ที่ทำงาน" value={p.workPhone} flex={1} />
          </View>
        </View>
      ))}

      {/* Health */}
      <SectionHeader title="ข้อมูลด้านสุขภาพ" />
      <View style={s.row}>
        <Field label="ส่วนสูง(cm)" value={student.height} flex={1} />
        <Field label="น้ำหนัก(kg)" value={student.weight} flex={1} />
        <Field label="การแพ้ยา" value={student.drugAllergy || student.allergy || student.allergicMedicine} flex={1.3} />
      </View>
      <View style={s.row}>
        <Field label="โรคประจำตัว" value={student.congenitalDisease || student.disease || student.chronicDisease} flex={1.3} />
        <Field label="ยาประจำตัว" value={student.regularMedication || student.medication} flex={1} />
      </View>
      <FullField label="รอยตำหนิ/จุดสังเกต" value={student.distinguishingMarks || student.bodyMark || student.scar} />
      <View style={s.row}>
        <Field label="จำนวนพี่น้อง" value={student.totalSiblings || student.siblingsCount} flex={1} />
        <Field label="เป็นบุตรคนที่" value={student.childOrder || student.siblingPosition || student.birthOrder} flex={1} />
      </View>
      <FullField label="ความสามารถพิเศษ" value={student.specialAbility || student.talent || student.skill} />

      {/* Footer */}
      <View style={s.footer} fixed>
        <Text style={s.footerText} render={({ pageNumber }) => `หน้า ${pageNumber}`} />
      </View>
    </Page>
  );
};

export default function StudentDataReportDocument({
  schoolName,
  academicYear,
  term,
  students,
}: StudentDataReportDocumentProps) {
  return (
    <Document>
      {students.map((student) => (
        <ReportPage
          key={student.id || student.studentId}
          student={student}
          schoolName={schoolName}
          academicYear={academicYear}
          term={term}
        />
      ))}
    </Document>
  );
}
