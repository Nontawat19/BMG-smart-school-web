import { pdf } from '@react-pdf/renderer';
import React from 'react';
import fs from 'fs';
import StudentDataReportDocument from '../src/components/Pdf/studentdata/StudentDataReportDocument';

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

const doc = React.createElement(StudentDataReportDocument, {
  schoolName: 'ไชยบุรีวิทยาคม',
  academicYear: '2568',
  term: '1',
  students: [mockStudent]
});

pdf(doc as any).toBuffer().then(stream => {
  const chunks: Buffer[] = [];
  stream.on('data', c => chunks.push(c));
  stream.on('end', () => {
    fs.writeFileSync('/tmp/final_student_report.pdf', Buffer.concat(chunks));
    console.log('Final student report PDF generated!');
  });
});
