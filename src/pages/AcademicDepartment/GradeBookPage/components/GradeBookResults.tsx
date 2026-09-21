import React from 'react';
import GradeBookStats from './GradeBookStats';
import GradeBookTable from './GradeBookTable';
import GradeBookLegend from './GradeBookLegend';
import GradeBookSummary from './GradeBookSummary';
import { Student, GradeRecord, CharacteristicCriteria, ReadingWritingCriteria, MaxScores, Course } from '../types';
import SkeletonLoader from '@/components/SkeletonLoader';
import Swal from 'sweetalert2';

interface GradeBookResultsProps {
    loading: boolean;
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
    students: Student[];
    grades: Record<string, GradeRecord>;
    completenessStats: any;
    completenessDisplay: { percentage: number; filled: number; total: number };
    characteristicsCriteria: CharacteristicCriteria[];
    readingWritingCriteria: ReadingWritingCriteria[];
    maxScores: MaxScores;
    selectedClass: string;
    selectedCourse: string;
    selectedRoom?: string;
    effectiveSemester?: string;
    currentCourse?: Course;
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
    completenessDisplay,
    characteristicsCriteria,
    readingWritingCriteria,
    maxScores,
    selectedClass,
    selectedCourse,
    selectedRoom,
    effectiveSemester,
    currentCourse,
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
                title: 'ข้อมูลครบถ้วนพร้อมสำหรับพิมพ์ ปพ.5 แล้ว'
            });
        }
    }, [completenessStats?.isReadyForPdf]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <SkeletonLoader key={i} height="80px" className="rounded-2xl" />
                    ))}
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
                completenessDisplay={completenessDisplay}
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
                    selectedRoom={selectedRoom}
                    effectiveSemester={effectiveSemester}
                    currentCourse={currentCourse}
                    sdqMap={sdqMap}
                    formatPrefix={formatPrefix}
                    handleScoreChange={handleScoreChange}
                    handleBulkFillColumn={handleBulkFillColumn}
                    handleSyncSDQColumn={handleSyncSDQColumn}
                    getOverallQuality={getOverallQuality}
                />
            </div>

            <GradeBookLegend selectedCourse={selectedCourse} scoreDistribution={scoreDistribution} activeTab={activeTab} />
            <GradeBookSummary selectedCourse={selectedCourse} activeTab={activeTab} completenessDisplay={completenessDisplay} students={students} grades={grades} />
        </div>
    );
};

export default GradeBookResults;
