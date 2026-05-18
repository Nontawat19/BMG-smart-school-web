import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ClipboardList, Filter, Search, ChevronDown, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { saveSDQAssessment, getSDQAssessments, SDQAssessment, SDQScore, getSchoolLevels } from '@/services/sdqService';
import SDQAssessmentModal from '@/components/SDQ/SDQAssessmentModal';
import { getCurrentThaiYear } from '@/utils/dateUtils';

const SDQTeacherPage: React.FC = () => {
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [selectedRoom, setSelectedRoom] = useState<string>('');
    const [rooms, setRooms] = useState<string[]>([]);
    const [availableLevels, setAvailableLevels] = useState<string[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [assessments, setAssessments] = useState<Record<string, SDQAssessment[]>>({});
    const [showModal, setShowModal] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<any>(null);
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;

    const reduxAcademicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [academicYear, setAcademicYear] = useState<string>(reduxAcademicYear);
    const [systemYear, setSystemYear] = useState<string>(reduxAcademicYear);

    // Fetch School Settings & Academic Year
    useEffect(() => {
        const fetchSettings = async () => {
            if (schoolId) {
                const levels = await getSchoolLevels(schoolId);
                setAvailableLevels(levels);
                if (!selectedClass && levels.length > 0) setSelectedClass(levels[0]);
                if (!academicYear) {
                    setAcademicYear(reduxAcademicYear);
                    setSystemYear(reduxAcademicYear);
                }
            }
        };
        fetchSettings();
    }, [schoolId, reduxAcademicYear]);

    useEffect(() => {
        if (students.length > 0) {
            const classStudents = students.filter(s => s.classLevel === selectedClass);
            const uniqueRooms = Array.from(new Set(classStudents.map(s => s.room))).sort();
            setRooms(uniqueRooms);
            if (uniqueRooms.length > 0 && (!selectedRoom || !uniqueRooms.includes(selectedRoom))) {
                setSelectedRoom(uniqueRooms[0]);
            } else if (uniqueRooms.length === 0) {
                setSelectedRoom('');
            }
        }
    }, [students, selectedClass]);

    // Level Mapping for DB compatibility
    const LEVEL_MAP: Record<string, string> = {
        'อ.1': 'k1', 'อ.2': 'k2', 'อ.3': 'k3',
        'ป.1': 'p1', 'ป.2': 'p2', 'ป.3': 'p3', 'ป.4': 'p4', 'ป.5': 'p5', 'ป.6': 'p6',
        'ม.1': 'm1', 'ม.2': 'm2', 'ม.3': 'm3', 'ม.4': 'm4', 'ม.5': 'm5', 'ม.6': 'm6'
    };

    const fetchStudents = async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const q = query(collection(db, 'school-settings', schoolId, 'students'));
            const snapshot = await getDocs(q);
            const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setStudents(studentList);

            const newAssessments: Record<string, SDQAssessment[]> = {};
            for (const s of studentList) {
                // Use selected academicYear
                const asm = await getSDQAssessments(schoolId, s.id, academicYear);
                newAssessments[s.id] = asm;
            }
            setAssessments(newAssessments);

        } catch (error) {
            console.error("Error fetching students:", error);
            Swal.fire('Error', 'Failed to load students', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [schoolId, academicYear]); // Re-fetch on year change

    const handleSaveAssessment = async (answers: Record<number, number>) => {
        if (!currentStudent || !schoolId) return;
        try {
            await saveSDQAssessment(schoolId, {
                studentId: currentStudent.id,
                evaluatorType: 'teacher',
                academicYear: academicYear, // Save to selected year
                term: '1',
                answers: answers
            });

            Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ',
                timer: 1500,
                showConfirmButton: false
            });
            setShowModal(false);
            fetchStudents();
        } catch (error) {
            Swal.fire('Error', 'Failed to save assessment', 'error');
        }
    };

    const displayedStudents = students.filter(student => {
        const mappedClass = LEVEL_MAP[selectedClass];
        const matchClass = selectedClass
            ? (student.classLevel === selectedClass || student.classLevel === mappedClass)
            : true;
        const matchRoom = selectedRoom ? student.room === selectedRoom : true;
        return matchClass && matchRoom;
    });

    // Generate Year Options dynamically around the system year
    const yearInt = parseInt(systemYear || '2567');
    const yearOptions = [yearInt - 1, yearInt, yearInt + 1];

    return (
        <MainLayout>
            <div className="p-4 sm:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div>
                            <Link to="/student-support/sdq" className="flex items-center text-sm text-gray-500 hover:text-indigo-600 mb-2">
                                <ClipboardList size={16} className="mr-1" /> ย้อนกลับ
                            </Link>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <ClipboardList className="text-indigo-600" />
                                ครูประเมินนักเรียน (SDQ)
                            </h1>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">
                                ประเมิน SDQ โดยครูที่ปรึกษา
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <div className="relative flex items-center bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-xl text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-100 dark:border-indigo-800">
                                <span>ปีการศึกษา {academicYear || '...'}</span>
                            </div>

                            <div className="relative">
                                <select
                                    value={selectedClass}
                                    onChange={(e) => setSelectedClass(e.target.value)}
                                    className="appearance-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">ทั้งหมด</option>
                                    {availableLevels.map(level => (
                                        <option key={level} value={level}>{level}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            </div>

                            <div className="relative">
                                <select
                                    value={selectedRoom}
                                    onChange={(e) => setSelectedRoom(e.target.value)}
                                    className="appearance-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[100px]"
                                >
                                    <option value="">ทุกห้อง</option>
                                    {rooms.map(r => (
                                        <option key={r} value={r}>ห้อง {r}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="table-responsive">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">
                                        <th className="p-4 rounded-tl-2xl">เลขที่</th>
                                        <th className="p-4">ชื่อ - นามสกุล</th>
                                        <th className="p-4 text-center">สถานะการประเมิน</th>
                                        <th className="p-4 text-center">ผลการประเมิน</th>
                                        <th className="p-4 rounded-tr-2xl text-center">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {displayedStudents.length > 0 ? displayedStudents.map((student) => {
                                        const studentAssessments = assessments[student.id] || [];
                                        const myAssessment = studentAssessments.find(a => a.evaluatorType === 'teacher');
                                        const hasAssessed = !!myAssessment;

                                        return (
                                            <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                <td className="p-4 text-gray-900 dark:text-white font-medium w-20">{student.studentNumber}</td>
                                                <td className="p-4">
                                                    <div className="font-medium text-gray-900 dark:text-white">{student.title} {student.firstName} {student.lastName}</div>
                                                    <div className="text-xs text-gray-500">รหัส: {student.studentId}</div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {hasAssessed ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                                                            <CheckCircle size={12} /> ประเมินแล้ว
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                            <AlertCircle size={12} /> ยังไม่ประเมิน
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {hasAssessed && myAssessment?.interpretation ? (
                                                        <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold 
                                            ${myAssessment.interpretation.total === 'ปกติ' ? 'bg-green-100 text-green-700' :
                                                                myAssessment.interpretation.total === 'เสี่ยง' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}
                                         `}>
                                                            {myAssessment.interpretation.total} ({myAssessment.totalDifficultyScore})
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={() => {
                                                            setCurrentStudent(student);
                                                            setShowModal(true);
                                                        }}
                                                        className="px-4 py-2 rounded-lg bg-indigo-50 text-indigo-600 font-medium text-sm hover:bg-indigo-100 transition-colors"
                                                    >
                                                        {hasAssessed ? 'ประเมินใหม่' : 'เริ่มประเมิน'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-gray-500">
                                                ไม่พบนักเรียนในชั้นเรียนนี้
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <SDQAssessmentModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    student={currentStudent}
                    evaluatorType="teacher"
                    initialData={currentStudent && assessments[currentStudent.id]?.find(a => a.evaluatorType === 'teacher')}
                    onSave={handleSaveAssessment}
                />
            </div>
        </MainLayout>
    );
};

export default SDQTeacherPage;
