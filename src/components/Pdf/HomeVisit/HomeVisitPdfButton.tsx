import React, { useMemo, useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { firestore } from '@/firebase';
import { collection, query, orderBy, getDocs, limit, where, doc, getDoc } from 'firebase/firestore';
import { Printer, Loader2 } from 'lucide-react';
import { HomeVisitData, Student, FamilyMember } from './types';
import Swal from 'sweetalert2';
import HomeVisitDocument from './HomeVisitDocument';
interface Props {
    student: Student;
    schoolId: string;
    teacherName?: string;
    teacherPosition?: string;
    className?: string;
}

const HomeVisitPdfButton: React.FC<Props> = ({ student, schoolId, teacherName, teacherPosition, className }) => {
    const [loading, setLoading] = useState(false);
    const [visitData, setVisitData] = useState<HomeVisitData | null>(null);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [teachers, setTeachers] = useState<any[]>([]);
    const [schoolName, setSchoolName] = useState("");
    const [educationArea, setEducationArea] = useState("");

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

            const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
            if (schoolSnap.exists()) {
                const schoolData = schoolSnap.data();
                setSchoolName(schoolData.schoolName || schoolData.name || "");
                setEducationArea(schoolData.affiliation || schoolData.educationArea || schoolData.serviceArea || schoolData.areaOffice || "");
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

    const baseClass = "p-3 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md hover:shadow-blue-500/5 shrink-0 active:scale-90 border";
    
    // Intelligent theme transition for the custom class passed
    const getDynamicClass = (status: 'pending' | 'success') => {
        if (className) {
            if (status === 'success') {
                return className
                    .replace(/bg-slate-50|bg-blue-50/g, 'bg-emerald-50')
                    .replace(/dark:bg-\[#272930\]/g, 'dark:bg-emerald-950/20')
                    .replace(/text-slate-500|text-slate-600/g, 'text-emerald-600')
                    .replace(/dark:text-slate-300|dark:text-slate-400/g, 'dark:text-emerald-400')
                    .replace(/border-slate-200|border-blue-200/g, 'border-emerald-100')
                    .replace(/dark:border-slate-700/g, 'dark:border-emerald-900/40')
                    .replace(/hover:bg-slate-100|hover:bg-blue-50/g, 'hover:bg-emerald-100/80')
                    .replace(/hover:text-blue-600/g, 'hover:text-emerald-700')
                    .replace(/hover:border-blue-200/g, 'hover:border-emerald-200')
                    .replace(/dark:hover:bg-slate-800/g, 'dark:hover:bg-emerald-950/40')
                    .replace(/dark:hover:text-blue-400/g, 'dark:hover:text-emerald-300')
                    .replace(/dark:hover:border-blue-900/g, 'dark:hover:border-emerald-800/60');
            }
            return className;
        }
        
        return status === 'success'
            ? `${baseClass} bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100/80 hover:text-emerald-700 dark:hover:text-emerald-300 hover:shadow-emerald-500/5`
            : `${baseClass} bg-blue-50/60 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30 hover:bg-blue-100/80 hover:text-blue-700 dark:hover:text-blue-300 hover:shadow-blue-500/5`;
    };

    if (!visitData) {
        return (
            <button
                onClick={fetchData}
                disabled={loading}
                className={getDynamicClass('pending')}
                title="เตรียมไฟล์ PDF รายงานการเยี่ยมบ้าน"
            >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
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
                    teacherPosition={teacherPosition}
                    teachers={teachers}
                    schoolName={schoolName}
                    educationArea={educationArea}
                />
            }
            fileName={`แบบฟอร์มบันทึกการเยี่ยมบ้าน_${student.firstName}_${student.lastName}.pdf`}
            className={getDynamicClass('success')}
            title="ดาวน์โหลด PDF แบบฟอร์มมาตรฐาน 4 หน้า"
        >
            {({ loading: pdfLoading }) => (
                pdfLoading ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />
            )}
        </PDFDownloadLink>
    );
};

export default HomeVisitPdfButton;
