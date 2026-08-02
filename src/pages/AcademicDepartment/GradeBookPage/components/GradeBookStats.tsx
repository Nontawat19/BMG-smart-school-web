import React from 'react';
import { Users, CheckCircle2, Calculator, Star, BookOpen } from 'lucide-react';
import { Student, GradeRecord } from '../types';

interface GradeBookStatsProps {
    students: Student[];
    grades: Record<string, GradeRecord>;
    completenessDisplay: { percentage: number; filled: number; total: number };
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
}

const GradeBookStats: React.FC<GradeBookStatsProps> = ({ students, grades, completenessDisplay, activeTab }) => {
    const totalStudents = students.length;

    const displayPercentage = completenessDisplay?.percentage || 0;
    const displayRatio = `${completenessDisplay?.filled || 0}/${completenessDisplay?.total || 0}`;

    const averageGrade = (() => {
        // นักเรียนที่ได้สถานะ "ร"/"มส" ไม่นับรวมในเกรดเฉลี่ย เพราะไม่ใช่ผลการเรียนเป็นตัวเลข
        const validGrades = Object.values(grades).filter(g => !isNaN(parseFloat(g.grade)) && g.status !== 'ร' && g.status !== 'มส');
        return (validGrades.length > 0 ? (validGrades.reduce((acc, curr) => acc + parseFloat(curr.grade), 0) / validGrades.length) : 0).toFixed(2);
    })();

    // คะแนนเฉลี่ยของแท็บประเมิน (คุณลักษณะฯ / อ่าน-คิด-เขียน) — สลับตาม activeTab และนับเฉลี่ยเฉพาะ
    // นักเรียนที่มีคะแนนกรอกแล้วจริง ไม่รวมคนที่ยังไม่มีคะแนนเข้าไปในตัวหารเพื่อไม่ให้ค่าเฉลี่ยต่ำเกินจริง
    const isRWTab = activeTab === 'readingWriting';
    const evalAverage = (() => {
        const scores: number[] = [];
        Object.values(grades).forEach(g => {
            const scoreMap = isRWTab ? g.readingWritingScores : g.characteristicsScores;
            const values = Object.values(scoreMap || {});
            if (values.length > 0) scores.push(values.reduce((a, b) => a + b, 0) / values.length);
        });
        return scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '0.00';
    })();

    const stats = [
        {
            label: 'นักเรียนทั้งหมด',
            value: `${totalStudents}`,
            unit: 'คน',
            icon: Users,
            color: 'text-blue-600',
            bg: 'bg-blue-500/10',
            border: 'border-blue-100/50'
        },
        {
            label: 'ความคืบหน้าการกรอก',
            value: `${displayPercentage}%`,
            unit: displayRatio,
            icon: CheckCircle2,
            color: 'text-emerald-600',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-100/50'
        },
        {
            label: 'เกรดเฉลี่ยรวม',
            value: averageGrade,
            unit: 'GPA',
            icon: Calculator,
            color: 'text-indigo-600',
            bg: 'bg-indigo-500/10',
            border: 'border-indigo-100/50'
        },
        {
            label: isRWTab ? 'คะแนนเฉลี่ยอ่าน/คิด/เขียน' : 'คะแนนเฉลี่ยคุณลักษณะฯ',
            value: evalAverage,
            unit: 'คะแนน',
            icon: Star,
            color: 'text-purple-600',
            bg: 'bg-purple-500/10',
            border: 'border-purple-100/50'
        },
        {
            label: 'สถานะวิชาที่สอน',
            value: 'พร้อมบันทึก',
            unit: 'ระบบปกติ',
            icon: BookOpen,
            color: 'text-amber-600',
            bg: 'bg-amber-500/10',
            border: 'border-amber-100/50'
        }
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
            {stats.map((stat, idx) => (
                <div key={idx} className={`flex items-center gap-2.5 bg-white/60 dark:bg-[#1a1b1e]/60 px-3 py-2.5 rounded-xl border ${stat.border} dark:border-gray-800 backdrop-blur-xl shadow-sm transition-all hover:shadow-md`}>
                    <div className={`p-2 rounded-xl flex-shrink-0 ${stat.bg} ${stat.color}`}>
                        <stat.icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">{stat.label}</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-black text-gray-900 dark:text-white tracking-tight leading-tight">{stat.value}</span>
                            <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">{stat.unit}</span>
                        </div>
                        {stat.label === 'ความคืบหน้าการกรอก' && (
                            <div className="mt-1 w-full h-0.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${displayPercentage}%` }} />
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default GradeBookStats;
