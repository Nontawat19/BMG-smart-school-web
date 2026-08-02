import React from 'react';
import {
    GradeRecord,
    Student
} from '../types';

interface GradeBookSummaryProps {
    selectedCourse: string;
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
    completenessDisplay: { percentage: number; filled: number; total: number };
    students: Student[];
    grades: Record<string, GradeRecord>;
}

const GradeBookSummary: React.FC<GradeBookSummaryProps> = ({
    selectedCourse,
    activeTab,
    completenessDisplay,
    students,
    grades
}) => {
    if (!selectedCourse) return null;

    const isGradeTab = activeTab === 'grades';

    // Calculate stats for assessments if not grades tab
    const assessmentStats = React.useMemo(() => {
        if (isGradeTab) return null;

        // ไม่ปัดเศษค่าเฉลี่ยรายคนก่อนนำไปเฉลี่ยรวม เพื่อให้ตรงกับสูตรใน GradeBookStats.tsx
        const scores: number[] = [];
        Object.values(grades).forEach(g => {
            if (activeTab === 'characteristics') {
                const charScores = Object.values(g.characteristicsScores || {});
                if (charScores.length > 0) scores.push(charScores.reduce((a, b) => a + b, 0) / charScores.length);
            } else {
                const rwScores = Object.values(g.readingWritingScores || {});
                if (rwScores.length > 0) scores.push(rwScores.reduce((a, b) => a + b, 0) / rwScores.length);
            }
        });

        const total = scores.length;
        if (total === 0) return { avg: 0, count: 0 };
        const avg = scores.reduce((a, b) => a + b, 0) / total;
        return { avg: avg.toFixed(2), count: total };
    }, [grades, activeTab, isGradeTab]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {/* Student Count Card */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md group">
                <div className="text-gray-400 dark:text-gray-500 text-xs font-black uppercase tracking-widest mb-1">นักเรียนทั้งหมด</div>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">{students.length}</span>
                    <span className="text-sm font-bold text-gray-400">คน</span>
                </div>
            </div>

            {/* Progress Card */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md group">
                <div className="text-gray-400 dark:text-gray-500 text-xs font-black uppercase tracking-widest mb-1">ความคืบหน้าการกรอก</div>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-emerald-500">
                        {Math.round(completenessDisplay?.percentage || 0)}%
                    </span>
                    <span className="text-sm font-bold text-gray-400">({completenessDisplay?.filled || 0}/{completenessDisplay?.total || 0})</span>
                </div>
            </div>

            {/* Grade Avg / Assessment Avg Card */}
            {isGradeTab ? (
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md group">
                    <div className="text-gray-400 dark:text-gray-500 text-xs font-black uppercase tracking-widest mb-1">เกรดเฉลี่ยรวม</div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                            {(() => {
                                const validGrades = Object.values(grades).filter(g => !isNaN(parseFloat(g.grade)) && g.status !== 'ร' && g.status !== 'มส');
                                if (validGrades.length === 0) return '0.00';
                                const sum = validGrades.reduce((a, b) => a + parseFloat(b.grade), 0);
                                return (sum / validGrades.length).toFixed(2);
                            })()}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md group">
                    <div className="text-gray-400 dark:text-gray-500 text-xs font-black uppercase tracking-widest mb-1">คะแนนเฉลี่ย{activeTab === 'characteristics' ? 'คุณลักษณะ' : 'การอ่านฯ'}</div>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-3xl font-black ${activeTab === 'characteristics' ? 'text-purple-600' : 'text-amber-600'}`}>
                            {assessmentStats?.avg || '0.00'}
                        </span>
                    </div>
                </div>
            )}

            {/* Status Card */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md group">
                <div className="text-gray-400 dark:text-gray-500 text-xs font-black uppercase tracking-widest mb-1">วิชาที่สอน</div>
                <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-gray-700 dark:text-gray-300">พร้อมบันทึก</span>
                </div>
            </div>
        </div>
    );
};

export default GradeBookSummary;
