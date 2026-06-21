import React, { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
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

    const fetchPdfPayload = async () => {
        const visitsCol = collection(firestore, "school-settings", schoolId, "students", student.id, "home-visits");
        const qVisit = query(visitsCol, orderBy("createdAt", "desc"), limit(1));
        const visitSnapshot = await getDocs(qVisit);

        if (visitSnapshot.empty) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่พบข้อมูลการเยี่ยม',
                text: 'กรุณาบันทึกข้อมูลการเยี่ยมบ้านก่อนพิมพ์ PDF',
                background: '#2a2b2f',
                color: '#ffffff'
            });
            return null;
        }

        const visitDoc = visitSnapshot.docs[0];
        const rawVisitData = visitDoc.data() as any;
        const visitData = rawVisitData as HomeVisitData;
        const familyMembers = (rawVisitData.familyMembers || []) as FamilyMember[];

        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        const schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
        const schoolName = schoolData.schoolName || schoolData.name || "";
        const educationArea = schoolData.affiliation || schoolData.educationArea || schoolData.serviceArea || schoolData.areaOffice || "";

        const teachersCol = collection(firestore, "school-settings", schoolId, "teachers");
        const qTeachers = query(
            teachersCol,
            where("isHomeroomTeacher", "==", true)
        );
        const teacherSnapshot = await getDocs(qTeachers);
        const teachers = teacherSnapshot.docs
            .map(snapshot => ({
                id: snapshot.id,
                ...snapshot.data()
            } as any))
            .filter(t => {
                const tGrade = t.homeroomGrade?.toString().trim();
                const sGrade = student.classLevel?.toString().trim();
                const tRoom = t.homeroomRoom?.toString().trim();
                const sRoom = student.room?.toString().trim();
                return tGrade === sGrade && tRoom === sRoom;
            })
            .slice(0, 2);

        return {
            visitData,
            familyMembers,
            teachers,
            schoolName,
            educationArea,
        };
    };

    const handleDownload = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const payload = await fetchPdfPayload();
            if (!payload) return;

            const pdfDocument = (
                <HomeVisitDocument
                    student={student}
                    visit={payload.visitData}
                    familyMembers={payload.familyMembers}
                    teacherName={teacherName || ''}
                    teacherPosition={teacherPosition}
                    teachers={payload.teachers}
                    schoolName={payload.schoolName}
                    educationArea={payload.educationArea}
                />
            );

            const blob = await pdf(pdfDocument).toBlob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `แบบฟอร์มบันทึกการเยี่ยมบ้าน_${student.firstName}_${student.lastName}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error("Error generating visit PDF:", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถสร้างไฟล์ PDF ได้',
                background: '#2a2b2f',
                color: '#ffffff'
            });
        } finally {
            setLoading(false);
        }
    };

    const baseClass = "p-3 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md hover:shadow-blue-500/5 shrink-0 active:scale-90 border";
    const resolvedClassName = className
        ? className
        : `${baseClass} bg-blue-50/60 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30 hover:bg-blue-100/80 hover:text-blue-700 dark:hover:text-blue-300 hover:shadow-blue-500/5`;

    return (
        <button
            type="button"
            onClick={handleDownload}
            disabled={loading}
            className={resolvedClassName}
            title="ดาวน์โหลด PDF แบบฟอร์มมาตรฐาน 4 หน้า"
        >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
        </button>
    );
};

export default HomeVisitPdfButton;
