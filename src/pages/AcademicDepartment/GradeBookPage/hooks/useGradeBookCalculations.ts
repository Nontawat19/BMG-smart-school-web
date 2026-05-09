import { useMemo } from 'react';
import { GradeRecord, CharacteristicCriteria, ReadingWritingCriteria, Student, Course } from '../types';

export const useGradeBookCalculations = (
    grades: Record<string, GradeRecord>,
    students: Student[],
    characteristicsCriteria: CharacteristicCriteria[],
    readingWritingCriteria: ReadingWritingCriteria[],
    activeTab: 'grades' | 'characteristics' | 'readingWriting'
) => {

    const getCriteriaScore = (studentId: string, criteria: CharacteristicCriteria) => {
        const record = grades[studentId];
        if (!record?.characteristicsScores) return null;

        const indicators = criteria.indicators || [];
        let totalScore = 0;
        let count = 0;

        indicators.forEach((_, idx) => {
            const score = record.characteristicsScores![`${criteria.id}_${idx}`];
            if (score !== undefined) {
                totalScore += score;
                count++;
            }
        });

        if (count === 0) return null;
        return Math.round(totalScore / count);
    };

    const getOverallQuality = (studentId: string) => {
        const record = grades[studentId];
        if (!record?.characteristicsScores) return null;
        const scores = Object.values(record.characteristicsScores);
        if (scores.length === 0) return null;
        return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    };

    const getRWScore = (studentId: string, criteriaId: string, indicatorIndex: number) => {
        const record = grades[studentId];
        return record?.readingWritingScores?.[`${criteriaId}_${indicatorIndex}`] || 0;
    };

    const getRWSummary = (studentId: string): { total: number; level: number; result: string } => {
        const record = grades[studentId];
        if (!record?.readingWritingScores || Object.keys(record.readingWritingScores).length === 0) {
            return { total: 0, level: 0, result: 'ปรับปรุง' };
        }

        let totalScore = 0;
        let totalItems = 0;

        readingWritingCriteria.forEach(c => {
            (c.indicators || []).forEach((_, idx) => {
                totalScore += record.readingWritingScores![`${c.id}_${idx}`] || 0;
                totalItems++;
            });
        });

        if (totalItems === 0) return { total: 0, level: 0, result: 'ปรับปรุง' };

        const level = Math.round(totalScore / totalItems);
        const resultText = level === 3 ? 'ดีเยี่ยม' : level === 2 ? 'ดี' : level === 1 ? 'ผ่าน' : 'ปรับปรุง';

        return { total: totalScore, level, result: resultText };
    };

    const calculateGrade = (total: number): string => {
        if (total >= 80) return "4";
        if (total >= 75) return "3.5";
        if (total >= 70) return "3";
        if (total >= 65) return "2.5";
        if (total >= 60) return "2";
        if (total >= 55) return "1.5";
        if (total >= 50) return "1";
        return "0";
    };

    const gradeDistribution = useMemo(() => {
        const dist = { '4': 0, '3.5': 0, '3': 0, '2.5': 0, '2': 0, '1.5': 0, '1': 0, '0': 0, 'ร': 0, 'มส': 0 };
        Object.values(grades).forEach(record => {
            if (record.grade && record.grade in dist) {
                dist[record.grade as keyof typeof dist]++;
            }
        });
        return dist;
    }, [grades]);

    const assessmentSummary = useMemo(() => {
        const summary = { char: { '3': 0, '2': 0, '1': 0, '0': 0 }, rw: { '3': 0, '2': 0, '1': 0, '0': 0 } };
        Object.values(grades).forEach(r => {
            const cScores = Object.values(r.characteristicsScores || {});
            if (cScores.length > 0) {
                const avg = Math.round(cScores.reduce((a, b) => a + b, 0) / cScores.length);
                if (avg >= 0 && avg <= 3) summary.char[avg.toString() as keyof typeof summary.char]++;
            }
            const rwScores = Object.values(r.readingWritingScores || {});
            if (rwScores.length > 0) {
                const avg = Math.round(rwScores.reduce((a, b) => a + b, 0) / rwScores.length);
                if (avg >= 0 && avg <= 3) summary.rw[avg.toString() as keyof typeof summary.rw]++;
            }
        });
        return summary;
    }, [grades]);

    const scoreDistribution = useMemo(() => {
        const dist: Record<string | number, number> = {
            '4': 0, '3.5': 0, '3': 0, '2.5': 0, '2': 0, '1.5': 0, '1': 0, '0': 0,
            'ผ': 0, 'มผ': 0, 'ร': 0, 'มส': 0,
        };

        if (activeTab === 'grades') {
            Object.values(grades).forEach(record => {
                if (record.grade && dist[record.grade] !== undefined) {
                    dist[record.grade]++;
                }
            });
        } else if (activeTab === 'characteristics') {
            const distChar = { 3: 0, 2: 0, 1: 0, 0: 0 };
            students.forEach(s => {
                const quality = getOverallQuality(s.id);
                if (quality !== null && quality >= 0 && quality <= 3) {
                    distChar[quality as keyof typeof distChar]++;
                }
            });
            return distChar;
        } else if (activeTab === 'readingWriting') {
            const distRW = { 3: 0, 2: 0, 1: 0, 0: 0 };
            students.forEach(s => {
                const summary = getRWSummary(s.id);
                if (summary.level >= 0 && summary.level <= 3) {
                    distRW[summary.level as keyof typeof distRW]++;
                }
            });
            return distRW;
        }
        return dist;
    }, [grades, activeTab, students]);

    return {
        calculateGrade,
        gradeDistribution,
        assessmentSummary,
        getCriteriaScore,
        getOverallQuality,
        getRWScore,
        getRWSummary,
        scoreDistribution
    };
};
