import React from 'react';
import { Users, CheckCircle2, Calculator, Star, BookOpen } from 'lucide-react';
import { Student, GradeRecord } from '../types';

interface GradeBookStatsProps {
    students: Student[];
    grades: Record<string, GradeRecord>;
    completenessStats: any;
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
}

const GradeBookStats: React.FC<GradeBookStatsProps> = ({ students, grades, completenessStats, activeTab }) => {
    const totalStudents = students.length;
    
    // คำนวณความคืบหน้าแยกตามแท็บที่เปิดอยู่
    let displayPercentage = completenessStats?.percentage || 0;
    let displayRatio = `${completenessStats?.filled || 0}/${completenessStats?.total || 0}`;

    if (activeTab === 'grades') {
        displayPercentage = completenessStats?.percentGrades || 0;
        displayRatio = `${completenessStats?.filledGrades || 0}/${completenessStats?.totalGrades || 0}`;
    } else if (activeTab === 'characteristics') {
        displayPercentage = completenessStats?.percentChar || 0;
        displayRatio = `${completenessStats?.filledChar || 0}/${completenessStats?.totalChar || 0}`;
    } else if (activeTab === 'readingWriting') {
        displayPercentage = completenessStats?.percentRW || 0;
        displayRatio = `${completenessStats?.filledRW || 0}/${completenessStats?.totalRW || 0}`;
    }

    const averageGrade = (() => {
        const numericGrades = Object.values(grades).filter(g => !isNaN(parseFloat(g.grade)));
        return (numericGrades.length > 0 ? (numericGrades.reduce((acc, curr) => acc + parseFloat(curr.grade), 0) / numericGrades.length) : 0).toFixed(2);
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
            label: 'คะแนนเฉลี่ยคุณลักษณะฯ',
            value: (Object.values(grades).reduce((acc, curr) => acc + (Object.values(curr.characteristicsScores || {}).reduce((a, b) => a + b, 0) / (Object.keys(curr.characteristicsScores || {}).length || 1)), 0) / (Object.keys(grades).length || 1)).toFixed(2),
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
