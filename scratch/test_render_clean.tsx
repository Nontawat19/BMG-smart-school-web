import { pdf, Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import React from 'react';
import fs from 'fs';

try {
  Font.register({
    family: 'TH Sarabun New',
    fonts: [
      { src: './public/fonts/THSarabunNew.ttf' },
      { src: './public/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
    ],
  });
} catch (e) {
  console.error(e);
}
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingHorizontal: 40,
    paddingBottom: 25,
    fontFamily: 'TH Sarabun New',
    fontSize: 11,
    color: '#111',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#555',
  },
  schoolHeader: {
    fontSize: 10,
    color: '#111',
  },
  titleHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#111',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    marginTop: 6,
    marginBottom: 6,
    height: 18,
  },
  statusLabel: {
    fontSize: 10.5,
    color: '#111',
  },
  statusDotted: {
    width: 140,
    height: 16,
    borderBottomWidth: 0.6,
    borderBottomStyle: 'dotted',
    borderBottomColor: '#333',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 1,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  introContainer: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  photoBox: {
    width: 80,
    height: 108,
    marginRight: 14,
    borderWidth: 0.5,
    borderColor: '#aaa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoImg: {
    width: 80,
    height: 108,
    objectFit: 'cover',
    marginRight: 14,
  },
  photoText: {
    fontSize: 9,
    color: '#888',
  },
  introRight: {
    flex: 1,
    justifyContent: 'space-between',
    height: 108,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 20,
  },
  label: {
    fontSize: 11,
    color: '#111',
    paddingBottom: 1,
    flexShrink: 0,
  },
  dottedBox: {
    flex: 1,
    height: 17,
    borderBottomWidth: 0.6,
    borderBottomStyle: 'dotted',
    borderBottomColor: '#222',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
    paddingBottom: 1,
  },
  value: {
    fontSize: 10.5,
    color: '#000',
    lineHeight: 1,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    marginBottom: 2,
  },
  sectionBullet: {
    fontSize: 12,
    marginRight: 4,
    color: '#111',
  },
  sectionTitle: {
    fontSize: 11.5,
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
    fontSize: 8.5,
    color: '#333',
  },
});

type Student = Record<string, any>;
const v = (val: unknown) => val === undefined || val === null || val === '' ? '' : String(val);

const Field = ({
  label,
  value,
  width,
  flex,
  labelWidth,
  align = 'center',
}: {
  label: string;
  value?: unknown;
  width?: number;
  flex?: number;
  labelWidth?: number;
  align?: 'left' | 'center';
}) => (
  <View style={[{ flexDirection: 'row', alignItems: 'flex-end', height: 20 }, width ? { width } : flex ? { flex } : {}]}>
    <Text style={[s.label, labelWidth ? { width: labelWidth } : {}]}>{label} </Text>
    <View style={[s.dottedBox, { alignItems: align === 'left' ? 'flex-start' : 'center' }]}>
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
  return digits.length === 13 ? `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}` : v(value);
};

const thaiDate = (value: unknown) => {
  const sVal = v(value).trim();
  if (!sVal) return '';
  const match = sVal.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return sVal;
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
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

const mockStudent = {
  id: '1',
  studentId: '03868',
  title: 'เด็กหญิง',
  firstName: 'มินรดี',
  lastName: 'ตรีรัตน์',
  classLevel: 'มัธยมศึกษาปีที่ 5',
  room: '1',
  nickname: 'ไม่ระบุ',
  idCardNumber: '1480301237489',
  bloodType: '',
  birthDate: '',
  nationality: 'ไทย',
  ethnicity: 'ไทย',
  studentStatus: 'กำลังศึกษา',
  curHouseNumber: '',
  curMoo: '',
  curSubdistrict: '',
  curDistrict: '',
  curProvince: '',
  curPostalCode: '',
  guardianTitle: 'นาย',
  guardianFirstName: 'นเรศ',
  guardianLastName: 'ชาญวงศ์',
  guardianRelationship: 'ผู้ปกครอง',
  guardianIdCard: '3480300564539',
  guardianPhone: '080-301-1647',
  guardianWorkPhone: '',
};

function ReportPage({ student, rawSchoolName, academicYear, term }: { student: Student; rawSchoolName?: string; academicYear: string; term: string }) {
  const cleanSchool = (rawSchoolName || '').replace(/^โรงเรียน\s*/, '');
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
            <Field label="เลขประจำตัวนักเรียน" value={student.studentId} width={165} />
            <Field label="ปีการศึกษา" value={academicYear} width={130} />
            <Field label="ภาคเรียนที่" value={term} flex={1} />
          </View>
          <View style={s.row}>
            <Field label="ชื่อ" value={name(student.title, student.firstName)} width={155} />
            <Field label="ชื่อสกุล" value={student.lastName} width={145} />
            <Field label="ระดับชั้น" value={classLabel(student)} flex={1} />
          </View>
          <View style={s.row}>
            <Field label="ชื่อเล่น" value={student.nickname} width={155} />
            <Field label="เลขประจำตัวประชาชน" value={citizenId(student.idCardNumber)} flex={1} />
          </View>
          <View style={s.row}>
            <Field label="กรุ๊ปเลือด" value={student.bloodType} width={85} />
            <Field label="วันเกิด" value={thaiDate(student.birthDate)} width={155} />
            <Field label="สัญชาติ" value={student.nationality || 'ไทย'} width={85} />
            <Field label="เชื้อชาติ" value={student.ethnicity || 'ไทย'} flex={1} />
          </View>
        </View>
      </View>

      {/* Address */}
      <SectionHeader title="ข้อมูลที่อยู่ (ที่อยู่ปัจจุบัน)" />
      <FullField label="ที่อยู่" value={address} />
      <View style={s.row}>
        <Field label="แขวง/ตำบล" value={student.curSubdistrict || student.curSubDistrict || student.subdistrict} width={125} />
        <Field label="เขต/อำเภอ" value={student.curDistrict || student.district} width={125} />
        <Field label="จังหวัด" value={student.curProvince || student.province} width={130} />
        <Field label="รหัสไปรษณีย์" value={student.curPostalCode || student.curZipCode || student.postalCode} flex={1} />
      </View>

      {/* Parents (3 blocks) */}
      {parents.map((p, idx) => (
        <View key={idx}>
          <SectionHeader title={p.title} />
          <View style={s.row}>
            <Field label="ชื่อ-นามสกุล" value={p.name} width={285} />
            <Field label="เลขประจำตัวประชาชน" value={p.idCard} flex={1} />
          </View>
          <View style={s.row}>
            <Field label="เบอร์ติดต่อ" value={p.phone} width={285} />
            <Field label="เบอร์ที่ทำงาน" value={p.workPhone} flex={1} />
          </View>
        </View>
      ))}

      {/* Health */}
      <SectionHeader title="ข้อมูลด้านสุขภาพ" />
      <View style={s.row}>
        <Field label="ส่วนสูง(cm)" value={student.height} width={135} />
        <Field label="น้ำหนัก" value={student.weight} width={120} />
        <Field label="การแพ้ยา" value={student.drugAllergy || student.allergy || student.allergicMedicine} flex={1} />
      </View>
      <View style={s.row}>
        <Field label="โรคประจำตัว" value={student.congenitalDisease || student.disease || student.chronicDisease} width={255} />
        <Field label="ยาประจำตัว" value={student.regularMedication || student.medication} flex={1} />
      </View>
      <View style={s.row}>
        <Field label="รอยตำหนิ/จุดสังเกต" value={student.distinguishingMarks || student.bodyMark || student.scar} width={255} />
        <Field label="จำนวนพี่น้อง" value={student.totalSiblings || student.siblingsCount} width={135} />
        <Field label="เป็นบุตรคนที่" value={student.childOrder || student.siblingPosition || student.birthOrder} flex={1} />
      </View>
      <FullField label="ความสามารถพิเศษ" value={student.specialAbility || student.talent || student.skill} />

      {/* Footer */}
      <View style={s.footer} fixed>
        <Text style={s.footerText} render={({ pageNumber }) => `หน้า ${pageNumber}`} />
      </View>
    </Page>
  );
}

const doc = (
  <Document>
    <ReportPage student={mockStudent} rawSchoolName="ไชยบุรีวิทยาคม" academicYear="2568" term="1" />
  </Document>
);

pdf(doc).toBuffer().then(stream => {
  const chunks: Buffer[] = [];
  stream.on('data', c => chunks.push(c));
  stream.on('end', () => {
    fs.writeFileSync('/tmp/test_clean_report.pdf', Buffer.concat(chunks));
    console.log('PDF written successfully to /tmp/test_clean_report.pdf');
  });
});
