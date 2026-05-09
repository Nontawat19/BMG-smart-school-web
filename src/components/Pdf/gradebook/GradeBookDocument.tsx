import React from 'react';
import { Document, Font } from '@react-pdf/renderer';
import SummaryPage from './SummaryPage';
import IndicatorsPage from './IndicatorsPage';
import CharacteristicsDefinitionPage from './CharacteristicsDefinitionPage';
import ReadingWritingRubricPage from './ReadingWritingRubricPage';
import PrimaryAttendanceRecordPage from './PrimaryAttendanceRecordPage';
import SecondaryAttendanceRecordPage from './SecondaryAttendanceRecordPage';
import CharacteristicsEvaluationPage from './CharacteristicsEvaluationPage';
import ReadingWritingEvaluationPage from './ReadingWritingEvaluationPage';
import FormativeScoresPage from './FormativeScoresPage';
import PrimaryExamSummaryPage from './PrimaryExamSummaryPage';
import SecondaryExamSummaryPage from './SecondaryExamSummaryPage';
import AnnouncementPage from './AnnouncementPage';
import { Student, GradeRecord, CharacteristicCriteria, ReadingWritingCriteria, AttendanceDay } from './types';
import { StudentAttendanceSummary } from './types'; // Import the shared interface
// --- Font Registration ---
// ! สำคัญ: คุณต้องหาไฟล์ฟอนต์ .ttf มาไว้ในโปรเจกต์
// ! และแก้ไข path ให้ถูกต้อง เช่น ไว้ในโฟลเดอร์ /public/fonts/
try {
    Font.register({
        family: 'TH Sarabun PSK',
        fonts: [
            { src: '/fonts/THSarabunNew.ttf' },
            { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
            { src: '/fonts/THSarabunNew Italic.ttf', fontStyle: 'italic' },
            { src: '/fonts/THSarabunNew BoldItalic.ttf', fontWeight: 'bold', fontStyle: 'italic' },
        ],
    });
} catch (e) {
    console.error("Could not register font. Make sure to add font files to /public/fonts/", e);
}

// --- Type Definitions ---
// เพิ่ม Type ที่จำเป็นสำหรับ props เพื่อความชัดเจนและลดข้อผิดพลาด
interface Course {
    id: string;
    title: string;
    code: string;
    classId: string;
    hoursPerWeek: number;
    teacherId?: string;
    formativeWeight?: number;
    midtermWeight?: number;
    formativeAssessments?: { id: string; name: string; maxScore: number; term?: 'pre-midterm' | 'post-midterm' }[];
    indicators?: string[];
    expectedOutcomes?: string[];
    subjectGroup?: string;
    learningArea?: string;
    type?: 'พื้นฐาน' | 'เพิ่มเติม';
}

interface GradeBookDocumentProps {
    schoolInfo: any;
    academicYear: string;
    termToDisplay: string;
    selectedClass: string;
    CLASSES: Record<string, string>;
    FULL_CLASSES: Record<string, string>;
    currentCourse: Course | undefined;
    courseTeacherName: string;
    headOfLearningAreaName: string;
    resolvedSubjectGroupName?: string;
    headOfAssessmentName: string;
    homeroomTeacher: any;
    students: Student[];
    gradeDistribution: Record<string, number>;
    assessmentSummary?: { char: Record<string, number>; rw: Record<string, number>; };
    allIndicators: string[];
    indicatorLabel: string;
    attendancePages: any[];
    studentChunks: Student[][];
    formatPrefix: (prefix?: string) => string;
    totalCourseHours: number;
    characteristicsCriteria: CharacteristicCriteria[];
    grades: Record<string, GradeRecord>;
    getCriteriaScore: (studentId: string, criteria: CharacteristicCriteria) => number | null;
    getOverallQuality: (studentId: string) => number | null;
    readingWritingCriteria: ReadingWritingCriteria[];
    getRWScore: (studentId: string, criteriaId: string, indicatorIndex: number) => number | undefined;
    getRWSummary: (studentId: string) => { total: number; level: number; result: string };
    preMidtermAssessments: any[];
    postMidtermAssessments: any[];
    preMidtermTotal: number;
    postMidtermTotal: number;
    midtermMax: number;
    finalMax: number;
    announcementChunks: Student[][];
    studentAttendanceSummaries: Record<string, StudentAttendanceSummary>; // New prop
    calendarData: any;
    courseSchedule: Record<string, number[]>;
    currentTerm: string;
    specialPeriods: any[];
    checkIsHolidayLocal: (dateStr: string, events: Record<string, any>) => { isHoliday: boolean; description: string };
    studentCourseDailyStatus: Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave'>>;
    qrCodeDataUrl?: string;
    schoolId: string;
    selectedRoom?: string;
    curriculumClassDisplay: string;
    curriculumRoomDisplay: string;
}

const GradeBookDocument = (props: GradeBookDocumentProps) => {
    const {
        schoolInfo,
        academicYear,
        termToDisplay,
        selectedClass,
        CLASSES,
        FULL_CLASSES,
        currentCourse,
        courseTeacherName,
        headOfLearningAreaName,
        resolvedSubjectGroupName,
        headOfAssessmentName,
        homeroomTeacher,
        students,
        gradeDistribution,
        assessmentSummary,
        allIndicators,
        indicatorLabel,
        attendancePages,
        studentChunks,
        formatPrefix,
        totalCourseHours,
        characteristicsCriteria,
        grades,
        getCriteriaScore,
        getOverallQuality,
        readingWritingCriteria,
        getRWScore,
        getRWSummary,
        preMidtermAssessments,
        postMidtermAssessments,
        preMidtermTotal,
        postMidtermTotal,
        midtermMax,
        finalMax,
        announcementChunks,
        studentAttendanceSummaries, // Destructure new prop
        calendarData,
        courseSchedule,
        currentTerm,
        specialPeriods,
        checkIsHolidayLocal,
        studentCourseDailyStatus,
        qrCodeDataUrl,
        schoolId,
        selectedRoom,
        curriculumClassDisplay,
        curriculumRoomDisplay,
    } = props;

    const isPrimary = selectedClass.startsWith('p');
    const lastAttendancePageIndex = isPrimary ? 9 : 4; // 40 weeks -> 10 pages (0-9), 20 weeks -> 5 pages (0-4)
    return (
        <Document>
            <SummaryPage
                schoolInfo={schoolInfo}
                academicYear={academicYear}
                selectedClass={selectedClass}
                CLASSES={CLASSES}
                FULL_CLASSES={FULL_CLASSES}
                termToDisplay={termToDisplay}
                currentCourse={currentCourse}
                courseTeacherName={courseTeacherName}
                headOfLearningAreaName={headOfLearningAreaName}
                resolvedSubjectGroupName={resolvedSubjectGroupName}
                headOfAssessmentName={headOfAssessmentName}
                homeroomTeacher={homeroomTeacher}
                students={students}
                gradeDistribution={gradeDistribution}
                assessmentSummary={assessmentSummary}
                studentAttendanceSummaries={studentAttendanceSummaries}
                qrCodeDataUrl={qrCodeDataUrl}
                schoolId={schoolId}
                selectedRoom={selectedRoom}
                curriculumClassDisplay={curriculumClassDisplay}
                curriculumRoomDisplay={curriculumRoomDisplay}
            />

            <IndicatorsPage
                currentCourse={currentCourse}
                allItems={allIndicators}
                label={indicatorLabel}
                selectedClass={selectedClass}
                CLASSES={CLASSES}
                termToDisplay={termToDisplay}
                academicYear={academicYear}
                selectedRoom={selectedRoom}
                curriculumClassDisplay={curriculumClassDisplay}
                curriculumRoomDisplay={curriculumRoomDisplay}
            />

            <CharacteristicsDefinitionPage
                schoolInfo={schoolInfo}
                academicYear={academicYear}
                selectedClass={selectedClass}
                FULL_CLASSES={FULL_CLASSES}
                termToDisplay={termToDisplay}
                criteria={characteristicsCriteria}
                selectedRoom={selectedRoom}
                curriculumClassDisplay={curriculumClassDisplay}
                curriculumRoomDisplay={curriculumRoomDisplay}
            />

            <ReadingWritingRubricPage
                schoolInfo={schoolInfo}
                academicYear={academicYear}
                termToDisplay={termToDisplay}
                selectedClass={selectedClass}
                FULL_CLASSES={FULL_CLASSES}
                readingWritingCriteria={readingWritingCriteria}
                selectedRoom={selectedRoom}
                curriculumClassDisplay={curriculumClassDisplay}
                curriculumRoomDisplay={curriculumRoomDisplay}
            />

            {isPrimary ? (
                <PrimaryAttendanceRecordPage
                    academicYear={academicYear}
                    selectedClass={selectedClass}
                    CLASSES={CLASSES}
                    FULL_CLASSES={FULL_CLASSES}
                    studentChunks={studentChunks}
                    formatPrefix={formatPrefix}
                    totalCourseHours={totalCourseHours}
                    studentAttendanceSummaries={studentAttendanceSummaries}
                    attendancePages={attendancePages}
                    studentCourseDailyStatus={studentCourseDailyStatus}
                    selectedRoom={selectedRoom}
                    curriculumClassDisplay={curriculumClassDisplay}
                    curriculumRoomDisplay={curriculumRoomDisplay}
                />
            ) : (
                <SecondaryAttendanceRecordPage
                    academicYear={academicYear}
                    selectedClass={selectedClass}
                    CLASSES={CLASSES}
                    FULL_CLASSES={FULL_CLASSES}
                    studentChunks={studentChunks}
                    formatPrefix={formatPrefix}
                    totalCourseHours={totalCourseHours}
                    studentAttendanceSummaries={studentAttendanceSummaries}
                    attendancePages={attendancePages}
                    studentCourseDailyStatus={studentCourseDailyStatus}
                    selectedRoom={selectedRoom}
                    curriculumClassDisplay={curriculumClassDisplay}
                    curriculumRoomDisplay={curriculumRoomDisplay}
                />
            )}

            {studentChunks.map((chunk: any[], sIdx: number) => (
                <CharacteristicsEvaluationPage
                    key={`char-eval-page-${sIdx}`}
                    academicYear={academicYear}
                    selectedClass={selectedClass}
                    CLASSES={CLASSES}
                    FULL_CLASSES={FULL_CLASSES}
                    termToDisplay={termToDisplay}
                    studentChunk={chunk}
                    characteristicsCriteria={characteristicsCriteria}
                    grades={grades}
                    getCriteriaScore={getCriteriaScore}
                    getOverallQuality={getOverallQuality}
                    formatPrefix={formatPrefix}
                    selectedRoom={selectedRoom}
                    curriculumClassDisplay={curriculumClassDisplay}
                    curriculumRoomDisplay={curriculumRoomDisplay}
                />
            ))}

            {studentChunks.map((chunk: any[], sIdx: number) => (
                <ReadingWritingEvaluationPage
                    key={`rw-eval-page-${sIdx}`}
                    academicYear={academicYear}
                    selectedClass={selectedClass}
                    CLASSES={CLASSES}
                    termToDisplay={termToDisplay}
                    studentChunk={chunk}
                    readingWritingCriteria={readingWritingCriteria as ReadingWritingCriteria[]}
                    grades={grades}
                    getRWScore={getRWScore}
                    getRWSummary={getRWSummary}
                    formatPrefix={formatPrefix}
                    schoolInfo={schoolInfo}
                    FULL_CLASSES={FULL_CLASSES}
                    selectedRoom={selectedRoom}
                    curriculumClassDisplay={curriculumClassDisplay}
                    curriculumRoomDisplay={curriculumRoomDisplay}
                />
            ))}

            {studentChunks.map((chunk: any[], sIdx: number) => (
                <FormativeScoresPage
                    key={`formative-page-${sIdx}`}
                    academicYear={academicYear}
                    selectedClass={selectedClass}
                    CLASSES={CLASSES}
                    FULL_CLASSES={FULL_CLASSES}
                    termToDisplay={termToDisplay}
                    studentChunk={chunk}
                    preMidtermAssessments={preMidtermAssessments}
                    postMidtermAssessments={postMidtermAssessments}
                    preMidtermTotal={preMidtermTotal}
                    postMidtermTotal={postMidtermTotal}
                    midtermMax={midtermMax}
                    finalMax={finalMax}
                    grades={grades}
                    formatPrefix={formatPrefix}
                    selectedRoom={selectedRoom}
                    curriculumClassDisplay={curriculumClassDisplay}
                    curriculumRoomDisplay={curriculumRoomDisplay}
                />
            ))}

            {isPrimary ? (
                studentChunks.map((chunk: any[], sIdx: number) => (
                    <PrimaryExamSummaryPage
                        key={`exam-summary-page-${sIdx}`}
                        academicYear={academicYear}
                        selectedClass={selectedClass}
                        CLASSES={CLASSES}
                        FULL_CLASSES={FULL_CLASSES}
                        termToDisplay={termToDisplay}
                        currentCourse={currentCourse}
                        studentChunk={chunk}
                        preMidtermAssessments={preMidtermAssessments}
                        postMidtermAssessments={postMidtermAssessments}
                        preMidtermTotal={preMidtermTotal}
                        postMidtermTotal={postMidtermTotal}
                        midtermMax={midtermMax}
                        finalMax={finalMax}
                        grades={grades}
                        formatPrefix={formatPrefix}
                        schoolInfo={schoolInfo}
                        homeroomTeacher={homeroomTeacher}
                        courseTeacherName={courseTeacherName}
                        selectedRoom={selectedRoom}
                        curriculumClassDisplay={curriculumClassDisplay}
                        curriculumRoomDisplay={curriculumRoomDisplay}
                    />
                ))
            ) : (
                studentChunks.map((chunk: any[], sIdx: number) => (
                    <SecondaryExamSummaryPage
                        key={`exam-summary-page-${sIdx}`}
                        academicYear={academicYear}
                        selectedClass={selectedClass}
                        CLASSES={CLASSES}
                        FULL_CLASSES={FULL_CLASSES}
                        termToDisplay={termToDisplay}
                        currentCourse={currentCourse}
                        studentChunk={chunk}
                        preMidtermAssessments={preMidtermAssessments}
                        postMidtermAssessments={postMidtermAssessments}
                        preMidtermTotal={preMidtermTotal}
                        postMidtermTotal={postMidtermTotal}
                        midtermMax={midtermMax}
                        finalMax={finalMax}
                        grades={grades}
                        formatPrefix={formatPrefix}
                        schoolInfo={schoolInfo}
                        homeroomTeacher={homeroomTeacher}
                        courseTeacherName={courseTeacherName}
                        selectedRoom={selectedRoom}
                        curriculumClassDisplay={curriculumClassDisplay}
                        curriculumRoomDisplay={curriculumRoomDisplay}
                    />
                ))
            )}

            {announcementChunks.map((chunk: any[], sIdx: number) => (
                <AnnouncementPage
                    key={`announcement-page-${sIdx}`}
                    {...props}
                    isLastPage={sIdx === announcementChunks.length - 1}
                    termToDisplay={termToDisplay}
                    announcementChunk={chunk}
                />
            ))}

        </Document>
    );
};

export default GradeBookDocument;
