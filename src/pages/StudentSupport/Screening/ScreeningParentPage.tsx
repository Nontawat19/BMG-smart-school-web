import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ClipboardCheck, ChevronDown, CheckCircle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { getAllScreeningAssessments, ScreeningAssessment } from '@/services/screeningService';
import ScreeningAssessmentModal from '@/components/StudentSupport/Screening/ScreeningAssessmentModal';
import { getSchoolLevels } from '@/services/sdqService';

const ScreeningParentPage: React.FC = () => {
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [selectedRoom, setSelectedRoom] = useState<string>('');
    const [rooms, setRooms] = useState<string[]>([]);
    const [availableLevels, setAvailableLevels] = useState<string[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [assessments, setAssessments] = useState<Record<string, ScreeningAssessment[]>>({});
    const [showModal, setShowModal] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<any>(null);
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;

    const LEVEL_MAP: Record<string, string> = {
        'อ.1': 'k1', 'อ.2': 'k2', 'อ.3': 'k3',
        'ป.1': 'p1', 'ป.2': 'p2', 'ป.3': 'p3', 'ป.4': 'p4', 'ป.5': 'p5', 'ป.6': 'p6',
        'ม.1': 'm1', 'ม.2': 'm2', 'ม.3': 'm3', 'ม.4': 'm4', 'ม.5': 'm5', 'ม.6': 'm6'
    };

    useEffect(() => {
        const fetchLevels = async () => {
            if (schoolId) {
                const levels = await getSchoolLevels(schoolId);
                setAvailableLevels(levels);
                if (!selectedClass && levels.length > 0) setSelectedClass(levels[0]);
            }
        };
        fetchLevels();
    }, [schoolId]);

    useEffect(() => {
        if (students.length > 0) {
            const classStudents = students.filter(s => s.classLevel === selectedClass || s.classLevel === LEVEL_MAP[selectedClass]);
            const uniqueRooms = Array.from(new Set(classStudents.map(s => s.room))).sort();
            setRooms(uniqueRooms);
            if (uniqueRooms.length > 0 && (!selectedRoom || !uniqueRooms.includes(selectedRoom))) {
                setSelectedRoom(uniqueRooms[0]);
            } else if (uniqueRooms.length === 0) setSelectedRoom('');
        }
    }, [students, selectedClass]);

    const fetchStudents = async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const q = query(collection(db, 'school-settings', schoolId, 'students'));
            const snapshot = await getDocs(q);
            const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setStudents(studentList);

            // Fetch assessments
            const asmRef = collection(db, 'school-settings', schoolId, 'screening_assessments');
            const asmSnap = await getDocs(asmRef);
            const asmList = asmSnap.docs.map(d => ({ id: d.id, ...d.data() } as ScreeningAssessment));

            const map: Record<string, ScreeningAssessment[]> = {};
            asmList.forEach(a => {
                if (!map[a.studentId]) map[a.studentId] = [];
                map[a.studentId].push(a);
            });
            setAssessments(map);

        } catch (error) {
            console.error("Error fetching students:", error);
            Swal.fire('Error', 'Failed to load students', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [schoolId]);

    const displayedStudents = students.filter(student => {
        const mappedClass = LEVEL_MAP[selectedClass];
        const matchClass = selectedClass
            ? (student.classLevel === selectedClass || student.classLevel === mappedClass)
            : true;
        const matchRoom = selectedRoom ? student.room === selectedRoom : true;
        return matchClass && matchRoom;
    });

    return (
        <MainLayout>
            <div className="p-4 sm:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
<<<<<<< HEAD
                                <ClipboardCheck className="text-pink-600 dark:text-pink-400" />
                                คัดกรองนักเรียน (ผู้ปกครอง)
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">ผู้ปกครองให้ข้อมูลลูกหลาน (เศรษฐกิจ, ครอบครัว, สุขภาพ)</p>
                        </div>
                        <div className="flex gap-2">
                            <select 
                                value={selectedClass} 
                                onChange={e => setSelectedClass(e.target.value)} 
                                className="p-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                            >
                                {availableLevels.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <select 
                                value={selectedRoom} 
                                onChange={e => setSelectedRoom(e.target.value)} 
                                className="p-2 border rounded-lg min-w-[100px] bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                            >
=======
                                <ClipboardCheck className="text-pink-600" />
                                คัดกรองนักเรียน (ผู้ปกครอง)
                            </h1>
                            <p className="text-sm text-gray-500">ผู้ปกครองให้ข้อมูลลูกหลาน (เศรษฐกิจ, ครอบครัว, สุขภาพ)</p>
                        </div>
                        <div className="flex gap-2">
                            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="p-2 border rounded-lg">
                                {availableLevels.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)} className="p-2 border rounded-lg min-w-[100px]">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                <option value="">ทุกห้อง</option>
                                {rooms.map(r => <option key={r} value={r}>ห้อง {r}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Table */}
<<<<<<< HEAD
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr className="text-gray-700 dark:text-gray-200">
                                    <th className="p-4 font-semibold">เลขที่</th>
                                    <th className="p-4 font-semibold">ชื่อ-นามสกุล</th>
                                    <th className="p-4 text-center font-semibold">สถานะ</th>
                                    <th className="p-4 text-center font-semibold">จัดการ</th>
=======
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="p-4">เลขที่</th>
                                    <th className="p-4">ชื่อ-นามสกุล</th>
                                    <th className="p-4 text-center">สถานะ</th>
                                    <th className="p-4 text-center">จัดการ</th>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {displayedStudents.map(s => {
                                    const studentAsm = assessments[s.id]?.find(a => a.evaluatorType === 'parent');
                                    return (
<<<<<<< HEAD
                                        <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-gray-700 dark:text-gray-300">
                                            <td className="p-4">{s.studentNumber}</td>
                                            <td className="p-4 font-medium">{s.title}{s.firstName} {s.lastName}</td>
                                            <td className="p-4 text-center">
                                                {studentAsm ? (
                                                    <span className="text-green-600 dark:text-green-400 font-bold text-sm">บันทึกแล้ว</span>
                                                ) : <span className="text-gray-400 dark:text-gray-500 text-sm">ยังไม่บันทึก</span>}
=======
                                        <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="p-4">{s.studentNumber}</td>
                                            <td className="p-4">{s.title}{s.firstName} {s.lastName}</td>
                                            <td className="p-4 text-center">
                                                {studentAsm ? (
                                                    <span className="text-green-600 font-bold text-sm">บันทึกแล้ว</span>
                                                ) : <span className="text-gray-400 text-sm">ยังไม่บันทึก</span>}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => { setCurrentStudent(s); setShowModal(true); }}
<<<<<<< HEAD
                                                    className="px-3 py-1 bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors font-medium text-sm"
=======
                                                    className="px-3 py-1 bg-pink-50 text-pink-600 rounded hover:bg-pink-100 font-medium text-sm"
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                                >
                                                    {studentAsm ? 'แก้ไขข้อมูล' : 'ให้ข้อมูล'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <ScreeningAssessmentModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    student={currentStudent}
                    evaluatorType="parent"
                    initialData={currentStudent ? assessments[currentStudent.id]?.find(a => a.evaluatorType === 'parent') : null}
                    onSave={() => { fetchStudents(); }}
                    schoolId={schoolId}
                />
            </div>
        </MainLayout>
    );
};

export default ScreeningParentPage;
