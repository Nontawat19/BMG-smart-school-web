import React from 'react';
import GradeBookStats from './GradeBookStats';
import GradeBookTable from './GradeBookTable';
import GradeBookLegend from './GradeBookLegend';
import GradeBookSummary from './GradeBookSummary';
import { Student, GradeRecord, CharacteristicCriteria, ReadingWritingCriteria } from '../types';
import SkeletonLoader from '@/components/SkeletonLoader';
import Swal from 'sweetalert2';

interface GradeBookResultsProps {
    loading: boolean;
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
    students: Student[];
    grades: Record<string, GradeRecord>;
    completenessStats: any;
    characteristicsCriteria: CharacteristicCriteria[];
    readingWritingCriteria: ReadingWritingCriteria[];
    maxScores: { formative: number; midterm: number; final: number };
    selectedClass: string;
    selectedCourse: string;
    sdqMap: Record<string, any>;
    scoreDistribution: any;
    formatPrefix: (prefix?: string) => string;
    handleScoreChange: (studentId: string, field: string, value: string, criteriaId?: string) => void;
    handleBulkFillColumn: (value: string, key: string, isCharOrRW?: boolean, criteriaId?: string) => void;
    handleSyncSDQColumn: (criteriaTitle: string, criteriaId: string) => void;
    getOverallQuality: (studentId: string) => number | string | null;
}

const GradeBookResults: React.FC<GradeBookResultsProps> = ({
    loading,
    activeTab,
    students,
    grades,
    completenessStats,
    characteristicsCriteria,
    readingWritingCriteria,
    maxScores,
    selectedClass,
    selectedCourse,
    sdqMap,
    scoreDistribution,
    formatPrefix,
    handleScoreChange,
    handleBulkFillColumn,
    handleSyncSDQColumn,
    getOverallQuality
}) => {
    // Show notification when data is complete
    React.useEffect(() => {
        if (completenessStats?.isReadyForPdf) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 5000,
                timerProgressBar: true,
                icon: 'success',
                title: 'ข้อมูลสำคัญครบถ้วนแล้ว!',
                text: 'คุณสามารถออกไฟล์ PDF ได้ทันที',
                background: '#f0fdf4',
                color: '#166534',
                iconColor: '#22c55e',
                didOpen: (toast) => {
                    toast.addEventListener('mouseenter', Swal.stopTimer);
                    toast.addEventListener('mouseleave', Swal.resumeTimer);
                }
            });
        }
    }, [completenessStats?.isReadyForPdf, selectedCourse]);

    if (loading) {
        return (
            <div className="p-6 space-y-4 bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700">
                <SkeletonLoader height="100px" className="rounded-2xl" />
                <div className="grid grid-cols-5 gap-3">
                    {[...Array(5)].map((_, i) => <SkeletonLoader key={i} height="80px" className="rounded-xl" />)}
                </div>
                <SkeletonLoader height="400px" className="rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 space-y-4">

            <GradeBookStats 
                students={students} 
                grades={grades} 
                completenessStats={completenessStats}
                activeTab={activeTab}
            />

            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <GradeBookTable
                    activeTab={activeTab}
                    filteredStudents={students}
                    grades={grades}
                    characteristicsCriteria={characteristicsCriteria}
                    readingWritingCriteria={readingWritingCriteria}
                    maxScores={maxScores}
                    selectedClass={selectedClass}
                    selectedCourse={selectedCourse}
                    sdqMap={sdqMap}
                    formatPrefix={formatPrefix}
                    handleScoreChange={handleScoreChange}
                    handleBulkFillColumn={handleBulkFillColumn}
                    handleSyncSDQColumn={handleSyncSDQColumn}
                    getOverallQuality={getOverallQuality}
                />
            </div>

            <GradeBookLegend selectedCourse={selectedCourse} scoreDistribution={scoreDistribution} activeTab={activeTab} />
            <GradeBookSummary selectedCourse={selectedCourse} activeTab={activeTab} scoreDistribution={scoreDistribution} students={students} grades={grades} />
        </div>
    );
};

export default GradeBookResults;
