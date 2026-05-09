import React, { useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { firestore } from '@/firebase';
import { collection, query, orderBy, getDocs, limit, where } from 'firebase/firestore';
import { Printer, Loader2 } from 'lucide-react';
import HomeVisitDocument from './HomeVisitDocument';
import { HomeVisitData, Student, FamilyMember } from './types';
import Swal from 'sweetalert2';

interface Props {
    student: Student;
    schoolId: string;
    teacherName?: string;
}

const HomeVisitPdfButton: React.FC<Props> = ({ student, schoolId, teacherName }) => {
    const [loading, setLoading] = useState(false);
    const [visitData, setVisitData] = useState<HomeVisitData | null>(null);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [teachers, setTeachers] = useState<any[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1.ดึงข้อมูลการเยี่ยมล่าสุด
            const visitsCol = collection(firestore, "school-settings", schoolId, "students", student.id, "home-visits");
            const qVisit = query(visitsCol, orderBy("visitDate", "desc"), limit(1));
            const visitSnapshot = await getDocs(qVisit);

            let newVisitData: HomeVisitData | null = null;
            let newFamilyMembers: FamilyMember[] = [];
            if (!visitSnapshot.empty) {
                const data = visitSnapshot.docs[0].data();
                newVisitData = data as HomeVisitData;
                newFamilyMembers = data.familyMembers || [];
            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'ไม่พบข้อมูลการเยี่ยม',
                    text: 'กรุณาบันทึกข้อมูลการเยี่ยมบ้านก่อนพิมพ์ PDF',
                    background: '#2a2b2f',
                    color: '#ffffff'
                });
                setLoading(false);
                return;
            }

            // 2.ดึงข้อมูลครูประจำชั้น (Query กว้างขึ้นเพื่อความชัวร์)
            const teachersCol = collection(firestore, "school-settings", schoolId, "teachers");
            const qTeachers = query(
                teachersCol,
                where("isHomeroomTeacher", "==", true)
            );
            const teacherSnapshot = await getDocs(qTeachers);
            const teacherList = teacherSnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as any))
                .filter(t => {
                    const tGrade = t.homeroomGrade?.toString().trim();
                    const sGrade = student.classLevel?.toString().trim();
                    const tRoom = t.homeroomRoom?.toString().trim();
                    const sRoom = student.room?.toString().trim();

                    return tGrade === sGrade && tRoom === sRoom;
                })
                .slice(0, 2);

            // อัปเดต state ทั้งหมดพร้อมกัน
            setVisitData(newVisitData);
            setFamilyMembers(newFamilyMembers);
            setTeachers(teacherList);

        } catch (error) {
            console.error("Error fetching visit data for PDF:", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถดึงข้อมูลสำหรับพิมพ์ PDF ได้',
                background: '#2a2b2f',
                color: '#ffffff'
            });
        } finally {
            setLoading(false);
        }
    };

    if (!visitData) {
        return (
            <button
                onClick={fetchData}
                disabled={loading}
                className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl hover:bg-blue-200 dark:hover:bg-blue-800 transition-all flex items-center justify-center"
                title="เตรียมไฟล์ PDF"
            >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />}
            </button>
        );
    }

    return (
        <PDFDownloadLink
            document={
                <HomeVisitDocument
                    student={student}
                    visit={visitData}
                    familyMembers={familyMembers}
                    teacherName={teacherName || ''}
                    teachers={teachers}
                />
            }
            fileName={`รายงานการเยี่ยมบ้าน_${student.firstName}_${student.lastName}.pdf`}
            className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-2xl hover:bg-green-200 dark:hover:bg-green-800 transition-all flex items-center justify-center"
        >
            {({ loading: pdfLoading }) => (
                pdfLoading ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />
            )}
        </PDFDownloadLink>
    );
};

export default HomeVisitPdfButton;
