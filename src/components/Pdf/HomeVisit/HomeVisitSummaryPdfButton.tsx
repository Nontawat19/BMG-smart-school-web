import React, { useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download, Loader2 } from 'lucide-react';
import HomeVisitSummaryDocument from './HomeVisitSummaryDocument';
import { Student, HomeVisitSummaryStats } from './types';
import { firestore } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface Props {
    students: Student[];
    visits: any[];
    schoolName: string;
    teacherName: string;
    schoolId: string;
    academicYear?: string;
    semester?: string;
    classLevel?: string;
    room?: string;
}

const HomeVisitSummaryPdfButton: React.FC<Props> = ({
    students, visits, schoolName, teacherName, schoolId,
    academicYear = "2568", semester = "1",
    classLevel = "", room = ""
}) => {
    const [generating, setGenerating] = useState(false);
    const [teachers, setTeachers] = useState<any[]>([]);

    const fetchTeachers = async () => {
        if (!schoolId || !classLevel) return;
        try {
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
                    const sGrade = classLevel?.toString().trim();
                    const tRoom = t.homeroomRoom?.toString().trim();
                    const sRoom = room?.toString().trim();

                    return tGrade === sGrade && tRoom === sRoom;
                })
                .slice(0, 2);
            setTeachers(teacherList);
        } catch (error) {
            console.error("Error fetching teachers for summary:", error);
        }
    };

    React.useEffect(() => {
        fetchTeachers();
    }, [schoolId, classLevel, room]);

    const calculateStats = (): HomeVisitSummaryStats => {
        const totalStudents = students.length;
        const visitedTotal = Array.from(new Set(visits.map(v => v.studentId))).length;

        // Find visited students to get their details
        const visitedStudentIds = new Set(visits.map(v => v.studentId));
        const visitedStudents = students.filter(s => visitedStudentIds.has(s.id));

        const isMale = (title: string) => ['เด็กชาย', 'นาย'].includes(title);
        const isFemale = (title: string) => ['เด็กหญิง', 'นางสาว', 'นาง'].includes(title);

        const visitedMale = visitedStudents.filter(s => isMale(s.title)).length;
        const visitedFemale = visitedStudents.filter(s => isFemale(s.title)).length;

        // Use the latest visit for each student to calculate stats
        const latestVisitsMap = new Map();
        visits.forEach(v => {
            if (!latestVisitsMap.has(v.studentId) || v.visitDate > latestVisitsMap.get(v.studentId).visitDate) {
                latestVisitsMap.set(v.studentId, v);
            }
        });
        const latestVisits = Array.from(latestVisitsMap.values());

        const getRiskCount = (field: string) => latestVisits.filter(v => v[field]?.length > 0).length;

        const visitDates = latestVisits.map(v => v.visitDate).filter(Boolean).sort();

        return {
            totalStudents,
            visitedTotal,
            visitedMale,
            visitedFemale,
            notVisitedTotal: totalStudents - visitedTotal,
            notVisitedReason: "",
            familyWarm: latestVisits.filter(v => v.familyAtmosphere === 'รักใคร่กันดี').length,
            familyBroken: latestVisits.filter(v => ['ขัดแย้งบ้างบางครั้ง', 'ขัดแย้งบ่อยครั้ง', 'ห่างเหินกัน', 'มีการทำร้ายร่างกาย'].includes(v.familyAtmosphere)).length,
            bothParentsDeceased: latestVisits.filter(v => v.bothParentsDeceased).length,
            oneParentDeceased: latestVisits.filter(v => v.oneParentDeceased).length,
            parentsSeparated: latestVisits.filter(v => v.parentsSeparated).length,
            notLivingWithParents: latestVisits.filter(v => v.notLivingWithParents).length,
            learningRisk: latestVisits.filter(v => v.visitSummary === 'กลุ่มเสี่ยง' && v.schoolAssistanceNeeded?.includes('ด้านการเรียน')).length,
            healthRisk: getRiskCount('healthRisk'),
            behaviorRisk: {
                health: getRiskCount('healthRisk'),
                drug: getRiskCount('drugRisk'),
                violence: getRiskCount('violenceRisk'),
                travel: latestVisits.filter(v => v.travelMethod !== 'ปกติ' && v.travelMethod).length,
                sexual: getRiskCount('sexualRisk'),
                game: getRiskCount('gameRisk'),
                others: 0,
            },
            economicRisk: latestVisits.filter(v => v.visitSummary === 'กลุ่มเสี่ยง' && v.schoolAssistanceNeeded?.includes('ทุนการศึกษา')).length,
            otherRisk: 0,
            otherRiskDetail: "",
            urgentTotal: latestVisits.filter(v => v.visitSummary === 'ช่วยเหลือด่วน').length,
            urgentDetail: latestVisits.filter(v => v.visitSummary === 'ช่วยเหลือด่วน').map(v => v.visitSummaryUrgentDetail).filter(Boolean).join(', '),
            agenciesJoined: "",
            dataUsage: "นำมาใช้ในการคัดกรองนักเรียนตามระบบดูแลช่วยเหลือนักเรียน",
            parentConcernsSummary: "",
            obstaclesSummary: "",
            suggestionsSummary: "",
        };
    };

    const stats = calculateStats();
    const visitDates = visits.map(v => v.visitDate).filter(Boolean).sort();
    const visitStartDate = visitDates[0] || '';
    const visitEndDate = visitDates[visitDates.length - 1] || '';

    return (
        <PDFDownloadLink
            document={
                <HomeVisitSummaryDocument
                    schoolName={schoolName}
                    academicYear={academicYear}
                    semester={semester}
                    classLevel={classLevel}
                    room={room}
                    visitStartDate={visitStartDate}
                    visitEndDate={visitEndDate}
                    stats={stats}
                    teacherName={teacherName}
                    teachers={teachers}
                />
            }
            fileName={`สรุปรายงานการเยี่ยมบ้าน_${classLevel}_${room}.pdf`}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95"
        >
            {({ loading }) => (
                loading ? (
                    <>
                        <Loader2 size={20} className="animate-spin" />
                        <span>กำลังเตรียมไฟล์...</span>
                    </>
                ) : (
                    <>
                        <Download size={20} />
                        <span>ดาวน์โหลดรายงานสรุป (สพฐ.)</span>
                    </>
                )
            )}
        </PDFDownloadLink>
    );
};

export default HomeVisitSummaryPdfButton;
