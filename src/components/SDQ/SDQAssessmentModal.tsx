import React, { useState, useEffect } from 'react';
import { X, User, Save, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { SDQAssessment, calculateSDQResult } from '@/services/sdqService';
import { SDQ_ITEMS } from '@/data/sdqData';
import Swal from 'sweetalert2';

interface SDQAssessmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    student: any;
    evaluatorType: 'student' | 'teacher' | 'parent';
    initialData?: any;
    onSave: (answers: Record<number, number>) => Promise<void>;
}

const SDQAssessmentModal: React.FC<SDQAssessmentModalProps> = ({
    isOpen,
    onClose,
    student,
    evaluatorType,
    initialData,
    onSave
}) => {
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [currentResult, setCurrentResult] = useState<any>(null);

    useEffect(() => {
        if (isOpen) {
            if (initialData?.answers) {
                setAnswers(initialData.answers);
            } else {
                // Init with default 0 or undefined? Undefined to force user to choose preferably.
                // But for ease, maybe undefined.
                setAnswers({});
            }
        }
    }, [initialData, isOpen]);

    // Real-time calculation for preview
    useEffect(() => {
        if (Object.keys(answers).length > 0) {
            const result = calculateSDQResult(answers, evaluatorType);
            setCurrentResult(result);
        } else {
            setCurrentResult(null);
        }
    }, [answers, evaluatorType]);

    const handleAnswerChange = (itemId: number, value: number) => {
        setAnswers(prev => ({
            ...prev,
            [itemId]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation: All 25 items must be answered
        const unanswered = SDQ_ITEMS.filter(item => answers[item.id] === undefined);
        if (unanswered.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'กรุณาตอบคำถามให้ครบ',
                text: `เหลืออีก ${unanswered.length} ข้อที่ยังไม่ได้ตอบ`,
                confirmButtonColor: '#3085d6'
            });
            return;
        }

        setIsSaving(true);
        await onSave(answers);
        setIsSaving(false);
    };

    if (!isOpen || !student) return null;

    const getStatusColor = (status: string) => {
        if (status === 'ปกติ') return 'text-green-600 bg-green-100 border-green-200';
        if (status === 'เสี่ยง') return 'text-yellow-600 bg-yellow-100 border-yellow-200';
        return 'text-red-600 bg-red-100 border-red-200';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 rounded-t-2xl z-10 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm">25</span>
                            แบบประเมิน SDQ
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            สำหรับ: <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                {evaluatorType === 'student' ? 'นักเรียนประเมินตนเอง' : evaluatorType === 'teacher' ? 'ครูประเมินนักเรียน' : 'ผู้ปกครองประเมินนักเรียน'}
                            </span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900/50">

                    {/* Student Info Card */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 flex items-center gap-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-full">
                            <User size={24} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                                {student.title} {student.firstName} {student.lastName}
                            </h3>
                            <p className="text-sm text-gray-500">
                                เลขที่ {student.studentNumber} | ชั้น {student.classLevel || '-'}
                            </p>
                        </div>
                        {currentResult && (
                            <div className={`ml-auto px-4 py-2 rounded-lg border ${getStatusColor(currentResult.interpretation.total)} flex flex-col items-center min-w-[120px]`}>
                                <span className="text-xs font-semibold opacity-75">ผลการประเมิน</span>
                                <span className="font-bold text-lg">{currentResult.interpretation.total}</span>
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-12 gap-4 bg-gray-100 dark:bg-gray-700/50 p-4 font-semibold text-gray-700 dark:text-gray-200 text-sm hidden sm:grid sticky top-0">
                                <div className="col-span-8">รายการประเมิน (ในช่วง 6 เดือนที่ผ่านมา)</div>
                                <div className="col-span-4 grid grid-cols-3 text-center">
                                    <div>ไม่จริง</div>
                                    <div>จริงบ้าง</div>
                                    <div>จริงแน่นอน</div>
                                </div>
                            </div>

                            {/* Questions */}
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {SDQ_ITEMS.map((item, index) => (
                                    <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors items-center">
                                        <div className="col-span-8 text-gray-800 dark:text-gray-200 font-medium">
                                            <span className="inline-block w-6 text-gray-400 text-sm">{index + 1}.</span>
                                            {item.text}
                                        </div>
                                        <div className="col-span-4 grid grid-cols-3 gap-2">
                                            {[
                                                { label: 'ไม่จริง', value: 0 },
                                                { label: 'จริงบ้าง', value: 1 },
                                                { label: 'จริงแน่นอน', value: 2 },
                                            ].map((choice) => (
                                                <div
                                                    key={choice.value}
                                                    onClick={() => handleAnswerChange(item.id, choice.value)}
                                                    className={`
                            flex sm:flex-col items-center justify-center gap-2 cursor-pointer p-2 rounded-lg transition-all
                            ${answers[item.id] === choice.value
                                                            ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-500/30 ring-1 ring-indigo-500'
                                                            : 'border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'}
                         `}>
                                                    <div className={`
                                w-5 h-5 rounded-full border flex items-center justify-center
                                ${answers[item.id] === choice.value
                                                            ? 'border-indigo-600 bg-indigo-600'
                                                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'}
                             `}>
                                                        {answers[item.id] === choice.value && <div className="w-2 h-2 bg-white rounded-full" />}
                                                    </div>
                                                    <span className="text-xs sm:text-xs font-medium text-gray-600 dark:text-gray-400 block sm:hidden md:block">{choice.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Summary Preview */}
                        {currentResult && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {[
                                    { label: 'อารมณ์', score: currentResult.scores.emotional, status: currentResult.interpretation.emotional },
                                    { label: 'ความประพฤติ', score: currentResult.scores.conduct, status: currentResult.interpretation.conduct },
                                    { label: 'อยู่ไม่นิ่ง', score: currentResult.scores.hyperactivity, status: currentResult.interpretation.hyperactivity },
                                    { label: 'เพื่อน', score: currentResult.scores.peer, status: currentResult.interpretation.peer },
                                    { label: 'สังคม (Strength)', score: currentResult.scores.prosocial, status: currentResult.interpretation.prosocial, isStrength: true },
                                ].map((d) => (
                                    <div key={d.label} className={`p-3 rounded-lg border text-sm flex flex-col items-center justify-center text-center ${getStatusColor(d.status)}`}>
                                        <span className="font-semibold">{d.label}</span>
                                        <div className="text-xl font-bold my-1">{d.score}</div>
                                        <span className="bg-white/50 px-2 py-0.5 rounded text-xs">{d.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl flex justify-between items-center shrink-0 w-full z-10 sticky bottom-0">
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                        <Info size={16} /> <span>คะแนนรวมความยากลำบาก: <strong className="text-gray-900 dark:text-white">{currentResult?.totalDifficultyScore || 0} / 40</strong></span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors">
                            ยกเลิก
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSaving}
                            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save size={18} />
                            {isSaving ? 'กำลังบันทึก...' : 'บันทึกผลการประเมิน'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SDQAssessmentModal;
