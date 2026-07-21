import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Loader2, CheckCircle2, RefreshCw, Info } from 'lucide-react';
import { saveSDQAssessment, getSDQAssessments, SDQAssessment } from '@/services/sdqService';
import SDQAssessmentModal from '@/components/SDQ/SDQAssessmentModal';
import Swal from 'sweetalert2';

interface Props {
    schoolId: string;
    studentId: string;
    student: { title?: string; firstName: string; lastName: string; studentNumber?: string; classLevel?: string; room?: string };
    academicYear: string;
    canAssess: boolean;
}

const getStatusColor = (status: string) => {
    if (status === 'ปกติ') return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
    if (status === 'เสี่ยง') return 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    return 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800';
};

const StudentSDQParentEmbed: React.FC<Props> = ({ schoolId, studentId, student, academicYear, canAssess }) => {
    const [loading, setLoading] = useState(true);
    const [assessment, setAssessment] = useState<SDQAssessment | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchAssessment = useCallback(async () => {
        setLoading(true);
        try {
            const list = await getSDQAssessments(schoolId, studentId, academicYear);
            setAssessment(list.find(a => a.evaluatorType === 'parent') || null);
        } finally {
            setLoading(false);
        }
    }, [schoolId, studentId, academicYear]);

    useEffect(() => {
        if (canAssess && schoolId && studentId && academicYear) fetchAssessment();
        else setLoading(false);
    }, [canAssess, fetchAssessment, schoolId, studentId, academicYear]);

    const handleSave = async (answers: Record<number, number>) => {
        try {
            await saveSDQAssessment(schoolId, {
                studentId,
                evaluatorType: 'parent',
                academicYear,
                term: '1',
                answers,
            });
            setIsModalOpen(false);
            await fetchAssessment();
            Swal.fire({ icon: 'success', title: 'บันทึกผลการประเมินสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch (err) {
            console.error('Error saving parent SDQ assessment:', err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกผลการประเมินได้ กรุณาลองใหม่อีกครั้ง' });
        }
    };

    if (!canAssess) {
        return (
            <div className="text-center py-16">
                <Info className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={40} />
                <p className="text-gray-500 dark:text-gray-400 font-semibold">ไม่สามารถทำแบบประเมินให้นักเรียนคนนี้ได้</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">แบบประเมินนี้ใช้ได้เฉพาะบุตร/หลานของบัญชีผู้ปกครองที่เข้าสู่ระบบเท่านั้น</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {assessment ? (
                <div className={`rounded-2xl border p-5 ${getStatusColor(assessment.interpretation.total)}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 size={22} />
                            <div>
                                <p className="font-bold">ทำแบบประเมินแล้ว</p>
                                <p className="text-sm opacity-80">ผลรวม: {assessment.interpretation.total} ({assessment.totalDifficultyScore}/40)</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 dark:bg-black/20 font-bold text-sm hover:bg-white dark:hover:bg-black/30 transition-colors"
                        >
                            <RefreshCw size={15} /> ประเมินใหม่
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                        {[
                            { label: 'อารมณ์', score: assessment.scores.emotional, status: assessment.interpretation.emotional },
                            { label: 'ความประพฤติ', score: assessment.scores.conduct, status: assessment.interpretation.conduct },
                            { label: 'อยู่ไม่นิ่ง', score: assessment.scores.hyperactivity, status: assessment.interpretation.hyperactivity },
                            { label: 'เพื่อน', score: assessment.scores.peer, status: assessment.interpretation.peer },
                            { label: 'สังคม', score: assessment.scores.prosocial, status: assessment.interpretation.prosocial },
                        ].map(d => (
                            <div key={d.label} className={`p-3 rounded-xl border text-center bg-white/60 dark:bg-black/10 ${getStatusColor(d.status)}`}>
                                <p className="text-xs font-bold">{d.label}</p>
                                <p className="text-lg font-black my-0.5">{d.score}</p>
                                <p className="text-[11px]">{d.status}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-14 bg-gray-50 dark:bg-gray-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                    <ClipboardList className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={40} />
                    <p className="text-gray-600 dark:text-gray-300 font-bold">ยังไม่ได้ทำแบบประเมิน SDQ ในมุมมองผู้ปกครอง</p>
                    <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 mb-5">ใช้เวลาประมาณ 5 นาที ตอบ 25 ข้อ เพื่อประเมินจุดแข็งและจุดที่ควรพัฒนาของบุตรหลาน</p>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        <ClipboardList size={18} /> เริ่มทำแบบประเมิน
                    </button>
                </div>
            )}

            <SDQAssessmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                student={student}
                evaluatorType="parent"
                initialData={assessment}
                onSave={handleSave}
            />
        </div>
    );
};

export default StudentSDQParentEmbed;
