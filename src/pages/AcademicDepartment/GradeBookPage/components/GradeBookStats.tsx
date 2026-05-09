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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {stats.map((stat, idx) => (
                <div key={idx} className={`relative overflow-hidden bg-white/60 dark:bg-[#1a1b1e]/60 p-4 rounded-3xl border ${stat.border} dark:border-gray-800 backdrop-blur-xl shadow-lg shadow-gray-200/30 dark:shadow-none transition-all hover:scale-[1.02] hover:shadow-xl group`}>
                    {/* Decorative Background Icon */}
                    <stat.icon className={`absolute -right-4 -bottom-4 w-24 h-24 ${stat.color} opacity-[0.03] group-hover:scale-110 transition-transform duration-500`} />
                    
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2.5 rounded-2xl ${stat.bg} ${stat.color}`}>
                            <stat.icon size={20} />
                        </div>
                        <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">{stat.label}</p>
                    </div>

                    <div className="flex items-baseline gap-1">
                        <h4 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">{stat.value}</h4>
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{stat.unit}</span>
                    </div>
                    
                    {/* Progress indicator bar for percentage card */}
                    {stat.label === 'ความคืบหน้าการกรอก' && (
                        <div className="mt-3 w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-emerald-500 rounded-full transition-all duration-1000" 
                                style={{ width: `${displayPercentage}%` }}
                            />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default GradeBookStats;
