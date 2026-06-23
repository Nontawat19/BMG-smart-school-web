import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { getEffectivePeriodEnd, getScheduleSlotCandidates, getTimetableDisplayPeriods } from '@/utils/scheduleDisplayUtils';

/* ===================== TYPES ===================== */
export interface Teacher {
    id: string;
    name: string;
    teacherId?: string;
    displayName?: string;
    isHomeroomTeacher?: boolean;
    homeroomGrade?: string;
    homeroomRoom?: string;
    preferences?: {
        unavailableSlots?: string[];
    };
}

export interface Club {
    id: string;
    name: string;
    responsibleTeacherIds: string[];
}

export interface Course {
    id: string;
    title: string;
    code: string;
    room?: string[];
    isCombined?: boolean;
    groupNumber?: number;
    teacherPeriodLabel?: string;
}

export interface ScheduleEntry {
    course: Course;
    className: string;
    roomDisplay?: string;
}

export interface SchoolInfo {
    schoolName?: string;
    subDistrict?: string;
    district?: string;
    province?: string;
    affiliation?: string;
    directorName?: string;
    academicHeadName?: string;
    logoUrl?: string;
}

export interface SpecialPeriod {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    day?: string;
    linkedPeriodId?: string;
    isTeachingLoad?: boolean;
    countAsTeachingPeriod?: boolean;
}

export interface PeriodSetting {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
    isTeachingPeriod: boolean;
    isFixed?: boolean;
}

export type Schedule = Record<string, ScheduleEntry | null>;

const getScheduleEntry = (schedule: Schedule, dayKey: string, period: PeriodSetting, periodIndex: number) => {
    const candidates = getScheduleSlotCandidates(dayKey, period, periodIndex);
    const slot = candidates.find(key => schedule[key]);
    return { slot: slot || candidates[0] || `${dayKey}-${periodIndex}`, entry: slot ? schedule[slot] : undefined };
};

/* ===================== CONSTANTS ===================== */
const DAYS: Record<string, string> = {
    mon: 'จันทร์',
    tue: 'อังคาร',
    wed: 'พุธ',
    thu: 'พฤหัสบดี',
    fri: 'ศุกร์',
};

// Map abbreviations to full names if needed
const FULL_CLASS_NAMES: Record<string, string> = {
    'อ.1': 'อนุบาลปีที่ 1', 'อ.2': 'อนุบาลปีที่ 2', 'อ.3': 'อนุบาลปีที่ 3',
    'ป.1': 'ประถมศึกษาปีที่ 1', 'ป.2': 'ประถมศึกษาปีที่ 2', 'ป.3': 'ประถมศึกษาปีที่ 3',
    'ป.4': 'ประถมศึกษาปีที่ 4', 'ป.5': 'ประถมศึกษาปีที่ 5', 'ป.6': 'ประถมศึกษาปีที่ 6',
    'ม.1': 'มัธยมศึกษาปีที่ 1', 'ม.2': 'มัธยมศึกษาปีที่ 2', 'ม.3': 'มัธยมศึกษาปีที่ 3',
    'ม.4': 'มัธยมศึกษาปีที่ 4', 'ม.5': 'มัธยมศึกษาปีที่ 5', 'ม.6': 'มัธยมศึกษาปีที่ 6',
};

/* ===================== PDF STYLES ===================== */
Font.register({
    family: 'TH Sarabun New',
    fonts: [
        { src: '/fonts/THSarabunNew.ttf' },
        { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' }
    ]
});

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: 'TH Sarabun New',
        fontSize: 14,
        // Removed justifyContent: 'center' to allow content to flow/break naturally
    },
    header: {
        marginBottom: 10,
        position: 'relative',
        minHeight: 60,
        justifyContent: 'center', // Vertically center if single line, but auto height handles multiline
    },
    headerLogoContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 60,
        height: 60,
        alignItems: 'center',
    },
    headerContent: {
        marginLeft: 70, // Push text to the right of the logo
        paddingRight: 10,
        textAlign: 'center',
    },
    logo: {
        width: 50,
        height: 50,
    },
    headerText: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    subHeaderText: {
        fontSize: 16,
        marginBottom: 2
    },
    affiliationText: {
        fontSize: 16,
        marginBottom: 2,
    },
    table: {
        width: '100%',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#000',
    },
    row: {
        flexDirection: 'row',
        borderColor: '#000',
        minHeight: 44, // Reduced from 48 to ensure everything fits on one page
        alignItems: 'stretch',
    },
    headerRow: {
        backgroundColor: '#f0f0f0',
        minHeight: 35,
    },
    cell: {
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#000',
        padding: 1,
        textAlign: 'center',
        justifyContent: 'center',
        fontSize: 14,
    },
    dayCell: { width: '8%', fontWeight: 'bold' },
    periodCell: { width: '8.7%' }, // Default width, will be overridden inline
    lunchCell: { width: '5%', padding: 0, alignItems: 'center', justifyContent: 'center' },

    // Content inside cells
    courseTitle: { fontWeight: 'bold', fontSize: 11, marginBottom: 1, paddingHorizontal: 2, lineHeight: 1.1 },
    teacherPeriodLabel: { fontSize: 9, color: '#c2410c', fontWeight: 'bold', marginBottom: 1 },
    courseCode: { fontSize: 10, marginBottom: 1, color: '#333' },
    className: { fontSize: 10, color: '#444', marginBottom: 1 },
    roomDisplay: { fontSize: 11, color: '#000', fontWeight: 'bold', marginBottom: 1, paddingHorizontal: 2, lineHeight: 1.1 },
    emptyText: { color: '#999', fontSize: 14, fontWeight: 'bold', opacity: 0.6, textAlign: 'center' },
    emptyCell: { backgroundColor: '#f2f2f2' },

    // Summary Table Styles
    summaryTable: {
        marginTop: 5,
        width: '100%',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#e2e8f0',
        // Removed overflow: hidden and borderRadius to support pagination
    },
    summaryRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#e2e8f0',
        minHeight: 28, // Reduced from 35 to fit more items on one page
        alignItems: 'stretch',
    },
    summaryHeader: {
        backgroundColor: '#f1f5f9',
        color: '#000000',
        minHeight: 40,
    },
    summaryCell: {
        padding: 4, // Reduced from 5
        fontSize: 12, // Increased from 10
        textAlign: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#e2e8f0',
    },
    summaryCellLast: {
        borderRightWidth: 0,
    },
    colNo: { width: '8%' },
    colCourseTitle: { width: '27%', textAlign: 'center' },
    colCourseCode: { width: '15%', textAlign: 'center' },
    colClass: { width: '25%' },
    colPeriods: { width: '12.5%' },
    colCredits: { width: '12.5%' },

    // Footer
    footer: {
        position: 'absolute',
        bottom: 85,
        left: 40,
        right: 40,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    signatureBlock: {
        width: '30%',
        alignItems: 'center',
    },
    signatureLine: {
        marginTop: 15, // Reduced from 20
        marginBottom: 3, // Reduced from 5
        borderBottomWidth: 1,
        borderBottomColor: '#94a3b8', // Slate-400
        borderStyle: 'dotted',
        width: '100%',
        height: 1,
    },
    signatureText: {
        fontSize: 12,
        color: '#475569', // Slate-600
        textAlign: 'center',
        lineHeight: 1.4,
    },
    totalPeriods: {
        position: 'absolute',
        bottom: 55,
        right: 45,
        textAlign: 'right',
        fontSize: 12,
        fontWeight: 'bold',
    }
});

/* ===================== PROPS TYPES ===================== */
interface TeacherSchedulePDFProps {
    schedule: Schedule;
    periodSettings: PeriodSetting[];
    schoolInfo: SchoolInfo;
    teacher: Teacher | null;
    academicYear: string;
    currentTerm: string;
    specialPeriods: SpecialPeriod[];
    totalPeriods: number;
    clubs?: Club[];
}

interface BulkTeacherSchedulePDFProps {
    data: Array<{
        teacher: Teacher;
        schedule: Schedule;
        totalPeriods: number;
    }>;
    periodSettings: PeriodSetting[];
    schoolInfo: SchoolInfo;
    academicYear: string;
    currentTerm: string;
    specialPeriods: SpecialPeriod[];
    clubs?: Club[];
}

interface CourseSummary {
    code: string;
    title: string;
    classes: string[];
    periods: number;
    credits: number;
}

const TeacherRoleText = ({ teacher }: { teacher: Teacher | null }) => {
    if (!teacher) return <Text></Text>;
    
    if (teacher.isHomeroomTeacher && teacher.homeroomGrade) {
        const isM = teacher.homeroomGrade.startsWith('ม');
        const role = isM ? 'ครูที่ปรึกษา' : 'ครูประจำชั้น';
        
        let gradeDisplay = FULL_CLASS_NAMES[teacher.homeroomGrade] || teacher.homeroomGrade;
        if (teacher.homeroomRoom && !teacher.homeroomGrade.includes('/')) {
            gradeDisplay += `/${teacher.homeroomRoom}`;
        }
        return <Text style={{ fontWeight: 'bold', fontSize: 14 }}>{role}{gradeDisplay}</Text>;
    }
    
    return <Text style={{ fontWeight: 'bold', fontSize: 14 }}>ครูผู้สอน</Text>;
};

const TeacherRoleWithGradeText = ({ teacher }: { teacher: Teacher | null }) => {
    if (!teacher || !teacher.isHomeroomTeacher || !teacher.homeroomGrade) return <Text></Text>;
    
    const isM = teacher.homeroomGrade.startsWith('ม');
    const role = isM ? 'ครูที่ปรึกษาชั้น' : 'ครูประจำชั้น';
    
    let gradeDisplay = FULL_CLASS_NAMES[teacher.homeroomGrade] || teacher.homeroomGrade;
    if (teacher.homeroomRoom && !teacher.homeroomGrade.includes('/')) {
        gradeDisplay += `/${teacher.homeroomRoom}`;
    }
    
    return <Text>{` ${role}${gradeDisplay}`}</Text>;
}

/* ===================== HELPERS ===================== */
export const generateCourseSummary = (
    schedule: Schedule, 
    teacher?: Teacher | null, 
    clubs?: Club[], 
    specialPeriods: SpecialPeriod[] = [], 
    periodSettings: PeriodSetting[] = []
): CourseSummary[] => {
    const summaryMap: Record<string, CourseSummary> = {};

    Object.values(schedule).forEach(entry => {
        if (!entry) return;
        const { course, className } = entry;
        const groupNumber = course.groupNumber || 1;
        const key = `${course.id || `${course.code}-${course.title}`}-${groupNumber}`;

        if (!summaryMap[key]) {
            summaryMap[key] = {
                code: course.code,
                title: course.title,
                classes: [],
                periods: 0,
                credits: 0
            };
        }

        const classList = className.split(',').map(s => s.trim());
        classList.forEach(cls => {
            if (cls) {
                const cleanClsName = cls.split(' (กลุ่ม')[0];
                if (!summaryMap[key].classes.includes(cleanClsName)) {
                    summaryMap[key].classes.push(cleanClsName);
                }
            }
        });

        summaryMap[key].periods += 1;
    });

    const summaryList = Object.values(summaryMap).map(item => ({
        ...item,
        classes: item.classes.sort(),
        credits: item.periods / 2 
    })).sort((a, b) => a.code.localeCompare(b.code));

    // Special Periods that count as teaching load — counted regardless of linkedPeriodId
    if (specialPeriods.length > 0) {
        const specialLoadMap: Record<string, number> = {};
        const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];

        specialPeriods.filter(sp => sp.countAsTeachingPeriod).forEach(sp => {
            if (sp.linkedPeriodId && periodSettings.length > 0) {
                // Linked to a period slot: one count per matching weekday
                weekdays.forEach(day => {
                    if ((!sp.day || sp.day === day || sp.day === 'all') &&
                        periodSettings.some(p => p.id === sp.linkedPeriodId)) {
                        specialLoadMap[sp.title] = (specialLoadMap[sp.title] || 0) + 1;
                    }
                });
            } else {
                // Custom time (กำหนดเอง): count by day setting
                const occurrences = (!sp.day || sp.day === 'all')
                    ? 5
                    : weekdays.includes(sp.day) ? 1 : 0;
                if (occurrences > 0) {
                    specialLoadMap[sp.title] = (specialLoadMap[sp.title] || 0) + occurrences;
                }
            }
        });

        Object.entries(specialLoadMap).forEach(([title, count]) => {
            summaryList.push({
                code: 'กิจกรรม',
                title: title,
                classes: ['-'],
                periods: count,
                credits: 0
            });
        });
    }

    // Specific Clubs are now excluded to avoid double counting with generic 'Club' special periods

    return summaryList;
};

const CourseSummaryPage = ({
    summary,
    schoolInfo,
    teacher,
    academicYear,
    currentTerm,
    totalPeriods
}: {
    summary: CourseSummary[],
    schoolInfo: SchoolInfo,
    teacher: Teacher | null,
    academicYear: string,
    currentTerm: string,
    totalPeriods: number
}) => {
    const teacherName = teacher?.name || '';
    const teacherDisplayName = teacher?.displayName || teacherName;

    return (
        <Page size="A4" orientation="portrait" style={styles.page}>
            <View style={[styles.header, { marginBottom: 5 }]}>
                <View style={styles.headerLogoContainer}>
                    {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} style={styles.logo} />}
                </View>
                <View style={styles.headerContent}>
                    <Text style={styles.headerText}>
                        สรุปภาระงานสอน
                    </Text>
                    <Text style={styles.subHeaderText}>
                        {teacherName}
                        {currentTerm && academicYear && ` ภาคเรียนที่ ${currentTerm} ปีการศึกษา ${academicYear}`}
                    </Text>
                    <Text style={styles.subHeaderText}>
                        {schoolInfo.schoolName || ''}{schoolInfo.affiliation ? ` ${schoolInfo.affiliation}` : ' สังกัด...'}
                    </Text>
                </View>
            </View>
            <View style={styles.summaryTable}>
                {/* Header */}
                <View style={[styles.summaryRow, styles.summaryHeader]} fixed>
                    <View style={[styles.summaryCell, styles.colNo, { borderColor: '#e2e8f0' }]}><Text>ที่</Text></View>
                    <View style={[styles.summaryCell, styles.colCourseTitle, { borderColor: '#e2e8f0' }]}><Text>ชื่อวิชา</Text></View>
                    <View style={[styles.summaryCell, styles.colCourseCode, { borderColor: '#e2e8f0' }]}><Text>รหัสวิชา</Text></View>
                    <View style={[styles.summaryCell, styles.colClass, { borderColor: '#e2e8f0' }]}><Text>ระดับชั้น</Text></View>
                    <View style={[styles.summaryCell, styles.colPeriods, { borderColor: '#e2e8f0' }]}><Text>จำนวนคาบ</Text></View>
                    <View style={[styles.summaryCell, styles.colCredits, styles.summaryCellLast, { borderColor: '#e2e8f0' }]}><Text>หน่วยกิต</Text></View>
                </View>

                {/* Rows */}
                {summary.map((item, index) => (
                    <View key={index} style={[styles.summaryRow, { backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }]}>
                        <View style={[styles.summaryCell, styles.colNo]}><Text>{index + 1}</Text></View>
                        <View style={[styles.summaryCell, styles.colCourseTitle]}>
                            <Text>{item.title}</Text>
                        </View>
                        <View style={[styles.summaryCell, styles.colCourseCode]}>
                            <Text>{item.code}</Text>
                        </View>
                        <View style={[styles.summaryCell, styles.colClass]}>
                            <Text>{item.classes.join(', ')}</Text>
                        </View>
                        <View style={[styles.summaryCell, styles.colPeriods]}><Text>{item.periods}</Text></View>
                        <View style={[styles.summaryCell, styles.colCredits, styles.summaryCellLast]}><Text>{item.credits}</Text></View>
                    </View>
                ))}

                {/* Total Row */}
                <View style={[styles.summaryRow, { backgroundColor: '#f1f5f9', borderBottomWidth: 0 }]}>
                    <View style={[styles.summaryCell, { width: '75%', textAlign: 'center', borderRightWidth: 1, borderRightColor: '#e2e8f0' }]}><Text style={{ fontWeight: 'bold', fontSize: 13 }}>รวมทั้งสิ้น</Text></View>
                    <View style={[styles.summaryCell, styles.colPeriods]}><Text style={{ fontWeight: 'bold' }}>{totalPeriods}</Text></View>
                    <View style={[styles.summaryCell, styles.colCredits, styles.summaryCellLast]}><Text style={{ fontWeight: 'bold' }}>{summary.reduce((sum, item) => sum + item.credits, 0)}</Text></View>
                </View>
            </View>

            {/* Footer */}
            <View style={[styles.footer, { position: 'relative', bottom: 0, left: 0, right: 0, marginTop: 71, width: '100%' }]}>
                    <View style={styles.signatureBlock}>
                        <View style={styles.signatureLine} />
                        <Text style={styles.signatureText}>({teacherName || '........................................'})</Text>
                        <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>ครูผู้สอน</Text>
                    </View>
                <View style={styles.signatureBlock}>
                    <View style={styles.signatureLine} />
                    <Text style={styles.signatureText}>({schoolInfo.academicHeadName || '........................................'})</Text>
                    <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>หัวหน้าวิชาการ</Text>
                </View>
                <View style={styles.signatureBlock}>
                    <View style={styles.signatureLine} />
                    <Text style={styles.signatureText}>({schoolInfo.directorName || '........................................'})</Text>
                    <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>ผู้อำนวยการโรงเรียน{schoolInfo.schoolName || ''}</Text>
                </View>
            </View>
        </Page>
    );
};


/* ===================== COMPONENT ===================== */
export const TeacherSchedulePDF = ({
    schedule,
    periodSettings,
    schoolInfo,
    teacher,
    academicYear,
    currentTerm,
    specialPeriods,
    totalPeriods,
    clubs = []
}: TeacherSchedulePDFProps) => {
    const teacherName = teacher?.name || '';
    const teacherDisplayName = teacher?.displayName || teacherName;
    const summary = generateCourseSummary(schedule, teacher, clubs, specialPeriods, periodSettings);
    const displayPeriods = getTimetableDisplayPeriods(periodSettings);
    
    // Recalculate total periods to include special load periods
    const calculatedTotalPeriods = summary.reduce((sum, item) => sum + item.periods, 0);

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>

                <View style={styles.header}>
                    <View style={styles.headerLogoContainer}>
                        {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} style={styles.logo} />}
                    </View>
                    <View style={styles.headerContent}>
                        <Text style={styles.headerText}>
                            ตารางสอน {teacherName}
                            {currentTerm && academicYear && ` ภาคเรียนที่ ${currentTerm} ปีการศึกษา ${academicYear}`}
                        </Text>
                        <Text style={styles.subHeaderText}>
                            {schoolInfo.schoolName || ''}{schoolInfo.affiliation ? ` ${schoolInfo.affiliation}` : ' สังกัด...'}
                        </Text>
                    </View>
                </View>



                <View style={styles.table}>
                    {/* Header Row */}
                    {(() => {
                        const lunchCount = displayPeriods.filter(p => p.id === 'lunch').length;
                        const teachingCount = displayPeriods.length - lunchCount;
                        const teachingWidth = (100 - 8 - (lunchCount * 5)) / teachingCount;

                        return (
                            <View style={[styles.row, styles.headerRow]}>
                                <View style={[styles.cell, styles.dayCell]}><Text>วัน / เวลา</Text></View>
                                {displayPeriods.map((p, index) => {
                                    const effectiveEnd = getEffectivePeriodEnd(displayPeriods, p, index);
                                    return (
                                    <View key={p.id} style={[styles.cell, p.id === 'lunch' ? styles.lunchCell : styles.periodCell, p.id !== 'lunch' ? { width: `${teachingWidth}%` } : {}]}>
                                        {p.id === 'lunch' ? (
                                            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ fontWeight: 'bold', fontSize: 10 }}>{p.label}</Text>
                                                <Text style={{ fontSize: 8 }}>{p.startTime} - {effectiveEnd}</Text>
                                            </View>
                                        ) : (
                                            <>
                                                <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{p.label}</Text>
                                                <Text style={{ fontSize: 10 }}>{p.startTime} - {effectiveEnd}</Text>
                                            </>
                                        )}
                                    </View>
                                    );
                                })}
                            </View>
                        );
                    })()}

                    {/* Data Rows */}
                    {Object.entries(DAYS).map(([dayKey, dayName], dayIndex) => {
                        const rowSpans = [];
                        for (let i = 0; i < displayPeriods.length; i++) {
                            const period = displayPeriods[i];
                            
                            // For fixed periods like lunch, don't merge
                            if (period.id === 'lunch') {
                                rowSpans.push({ type: 'lunch', period, span: 1 });
                                continue;
                            }

                            const { slot, entry } = getScheduleEntry(schedule, dayKey, period, i);
                            
                            const getSpecialPeriod = (day: string, periodSetting: PeriodSetting) => {
                                const { id } = periodSetting;
                                return specialPeriods.find(sp =>
                                    sp.linkedPeriodId === id && (!sp.day || sp.day === 'all' || sp.day === day)
                                );
                            };
                            const special = getSpecialPeriod(dayKey, period);
                            const specialTitle = special?.title;
                            const isUnavailable = slot && teacher?.preferences?.unavailableSlots?.includes(slot);

                            // Find how many consecutive periods are identical
                            let span = 1;
                            while (i + 1 < displayPeriods.length) {
                                const nextPeriod = displayPeriods[i + 1];
                                if (nextPeriod.id === 'lunch') break;

                                const { slot: nextSlot, entry: nextEntry } = getScheduleEntry(schedule, dayKey, nextPeriod, i + 1);
                                const nextSpecial = getSpecialPeriod(dayKey, nextPeriod);
                                const nextSpecialTitle = nextSpecial?.title;
                                const nextIsUnavailable = nextSlot && teacher?.preferences?.unavailableSlots?.includes(nextSlot);

                                // Logic for merging:
                                // 1. Both have same course entry
                                const sameEntry = entry && nextEntry && 
                                                 entry.course.id === nextEntry.course.id && 
                                                 entry.course.groupNumber === nextEntry.course.groupNumber &&
                                                 entry.course.teacherPeriodLabel === nextEntry.course.teacherPeriodLabel &&
                                                 entry.className === nextEntry.className;
                                
                                // 2. Both have same special title
                                const sameSpecial = !entry && !nextEntry && specialTitle && nextSpecialTitle && specialTitle === nextSpecialTitle;
                                
                                // 3. Both are empty and teaching periods (optional, maybe don't merge empty ones to keep grid look?)
                                // Let's only merge if they are the same course or same special title.

                                if (sameEntry || sameSpecial) {
                                    span++;
                                    i++;
                                } else {
                                    break;
                                }
                            }

                            rowSpans.push({ 
                                type: entry ? 'course' : (specialTitle ? 'special' : 'empty'),
                                period, 
                                span, 
                                entry, 
                                specialTitle,
                                isUnavailable,
                                slot
                            });
                        }

                        return (
                            <View key={dayKey} style={styles.row}>
                                <View style={[styles.cell, styles.dayCell]}><Text>{dayName}</Text></View>
                                {(() => {
                                const lunchCount = displayPeriods.filter(p => p.id === 'lunch').length;
                                const teachingCount = displayPeriods.length - lunchCount;
                                    const teachingWidth = (100 - 8 - (lunchCount * 5)) / teachingCount;

                                    return rowSpans.map((item, sIndex) => {
                                        if (item.type === 'lunch') {
                                            const isLastRow = dayIndex === Object.keys(DAYS).length - 1;
                                            return (
                                                <View key="lunch" style={[styles.cell, styles.lunchCell, { borderBottomWidth: isLastRow ? 1 : 0 }]}>
                                                    {dayIndex === 2 && (
                                                        <Text style={{ transform: 'rotate(-90deg)', width: 80, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>
                                                            พักกลางวัน
                                                        </Text>
                                                    )}
                                                </View>
                                            );
                                        }

                                        const { type, span, entry, specialTitle, isUnavailable, period, slot } = item;
                                        const showEmptyBox = type === 'empty' && period.isTeachingPeriod;

                                        let displayText = specialTitle || period.label || '';
                                        if (displayText.startsWith('กิจกรรม') && displayText.length > 8) {
                                            displayText = displayText.replace('กิจกรรม', 'กิจกรรม\n');
                                        }
                                        const isMultiLine = displayText.includes('\n');
                                        const fontSize = isMultiLine ? 12 : (displayText.length > 15 ? 12 : 14);

                                        return (
                                            <View key={sIndex} style={[styles.cell, styles.periodCell, { width: `${teachingWidth * span}%` }, (showEmptyBox || isUnavailable) ? styles.emptyCell : {}]}>
                                                {entry ? (
                                                    <>
                                                        {entry.course.teacherPeriodLabel && <Text style={styles.teacherPeriodLabel}>{entry.course.teacherPeriodLabel}</Text>}
                                                        <Text style={styles.courseTitle}>{entry.course.title}</Text>
                                                        <Text style={styles.courseCode}>{entry.course.code}</Text>
                                                        <Text style={styles.className}>{entry.className?.split(' (กลุ่ม')[0]}</Text>
                                                        {entry.roomDisplay && <Text style={styles.roomDisplay}>{entry.roomDisplay}</Text>}
                                                    </>
                                                ) : (showEmptyBox || isUnavailable) ? (
                                                    <Text style={styles.emptyText}>คาบว่าง</Text>
                                                ) : specialTitle || !period.isTeachingPeriod ? (
                                                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 2 }}>
                                                        <Text style={{
                                                            fontWeight: 'bold',
                                                            fontSize: fontSize,
                                                            textAlign: 'center',
                                                            lineHeight: 1.1,
                                                        }}>
                                                            {displayText}
                                                        </Text>
                                                        {teacher?.teacherId && (
                                                            <Text style={{ fontSize: 9, marginTop: 1, color: '#444' }}>
                                                                {teacher.teacherId}
                                                            </Text>
                                                        )}
                                                    </View>
                                                ) : null}
                                            </View>
                                        );
                                    });
                                })()}
                            </View>
                        );
                    })}
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <View style={styles.signatureBlock}>
                        <View style={styles.signatureLine} />
                        <Text style={styles.signatureText}>({teacherName || '........................................'})</Text>
                        <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>ครูผู้สอน</Text>
                    </View>
                    <View style={styles.signatureBlock}>
                        <View style={styles.signatureLine} />
                        <Text style={styles.signatureText}>({schoolInfo.academicHeadName || '........................................'})</Text>
                        <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>หัวหน้าวิชาการ</Text>
                    </View>
                    <View style={styles.signatureBlock}>
                        <View style={styles.signatureLine} />
                        <Text style={styles.signatureText}>({schoolInfo.directorName || '........................................'})</Text>
                        <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>ผู้อำนวยการโรงเรียน{schoolInfo.schoolName || ''}</Text>
                    </View>
                </View>

                <Text style={styles.totalPeriods}>จำนวน {totalPeriods} คาบ / สัปดาห์</Text>
            </Page>

            {/* Page 2: Course Summary */}
            <CourseSummaryPage
                summary={summary}
                schoolInfo={schoolInfo}
                teacher={teacher}
                academicYear={academicYear}
                currentTerm={currentTerm}
                totalPeriods={calculatedTotalPeriods}
            />
        </Document>
    );
};

export const BulkTeacherSchedulePDF = ({
    data,
    periodSettings,
    schoolInfo,
    academicYear,
    currentTerm,
    specialPeriods,
    clubs = []
}: BulkTeacherSchedulePDFProps) => {
    return (
        <Document>
            {data.map((item, index) => {
                const summary = generateCourseSummary(item.schedule, item.teacher, clubs, specialPeriods, periodSettings);
                const calculatedTotalPeriods = summary.reduce((sum, s) => sum + s.periods, 0);
                const displayPeriods = getTimetableDisplayPeriods(periodSettings);
                return (
                    <React.Fragment key={index}>
                        <Page size="A4" orientation="landscape" style={styles.page}>
                            <View style={styles.header}>
                                <View style={styles.headerLogoContainer}>
                                    {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} style={styles.logo} />}
                                </View>
                                <View style={styles.headerContent}>
                                    <Text style={styles.headerText}>
                                        ตารางสอน {item.teacher.name}
                                        {currentTerm && academicYear && ` ภาคเรียนที่ ${currentTerm} ปีการศึกษา ${academicYear}`}
                                    </Text>
                                    <Text style={styles.subHeaderText}>
                                        {schoolInfo.schoolName || ''}{schoolInfo.affiliation ? ` ${schoolInfo.affiliation}` : ' สังกัด...'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.table} wrap={false}>
                                {(() => {
                                    const lunchCount = displayPeriods.filter(p => p.id === 'lunch').length;
                                    const teachingCount = displayPeriods.length - lunchCount;
                                    const teachingWidth = (100 - 8 - (lunchCount * 5)) / teachingCount;

                                    return (
                                        <View style={[styles.row, styles.headerRow]}>
                                            <View style={[styles.cell, styles.dayCell]}><Text>วัน / เวลา</Text></View>
                                            {displayPeriods.map((p, index) => {
                                                const effectiveEnd = getEffectivePeriodEnd(displayPeriods, p, index);
                                                return (
                                                <View key={p.id} style={[styles.cell, p.id === 'lunch' ? styles.lunchCell : styles.periodCell, p.id !== 'lunch' ? { width: `${teachingWidth}%` } : {}]}>
                                                    {p.id === 'lunch' ? (
                                                        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                                            <Text style={{ fontWeight: 'bold', fontSize: 10 }}>{p.label}</Text>
                                                            <Text style={{ fontSize: 8 }}>{p.startTime} - {effectiveEnd}</Text>
                                                        </View>
                                                    ) : (
                                                        <>
                                                            <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{p.label}</Text>
                                                            <Text style={{ fontSize: 10 }}>{p.startTime} - {effectiveEnd}</Text>
                                                        </>
                                                    )}
                                                </View>
                                                );
                                            })}
                                        </View>
                                    );
                                })()}

                                {Object.entries(DAYS).map(([dayKey, dayName], dayIndex) => {
                                    const rowSpans = [];
                                    for (let i = 0; i < displayPeriods.length; i++) {
                                        const period = displayPeriods[i];
                                        
                                        if (period.id === 'lunch') {
                                            rowSpans.push({ type: 'lunch', period, span: 1 });
                                            continue;
                                        }

                                        const { slot, entry } = getScheduleEntry(item.schedule, dayKey, period, i);
                                        
                                        const getSpecialPeriod = (day: string, periodSetting: PeriodSetting) => {
                                            const { id } = periodSetting;
                                            return specialPeriods.find(sp =>
                                                sp.linkedPeriodId === id && (!sp.day || sp.day === 'all' || sp.day === day)
                                            );
                                        };
                                        const special = getSpecialPeriod(dayKey, period);
                                        const specialTitle = special?.title;
                                        const isUnavailable = slot && item.teacher?.preferences?.unavailableSlots?.includes(slot);

                                        let span = 1;
                                        while (i + 1 < displayPeriods.length) {
                                            const nextPeriod = displayPeriods[i + 1];
                                            if (nextPeriod.id === 'lunch') break;

                                            const { slot: nextSlot, entry: nextEntry } = getScheduleEntry(item.schedule, dayKey, nextPeriod, i + 1);
                                            const nextSpecial = getSpecialPeriod(dayKey, nextPeriod);
                                            const nextSpecialTitle = nextSpecial?.title;

                                            const sameEntry = entry && nextEntry && 
                                                             entry.course.id === nextEntry.course.id && 
                                                             entry.course.groupNumber === nextEntry.course.groupNumber &&
                                                             entry.course.teacherPeriodLabel === nextEntry.course.teacherPeriodLabel &&
                                                             entry.className === nextEntry.className;
                                            
                                            const sameSpecial = !entry && !nextEntry && specialTitle && nextSpecialTitle && specialTitle === nextSpecialTitle;

                                            if (sameEntry || sameSpecial) {
                                                span++;
                                                i++;
                                            } else {
                                                break;
                                            }
                                        }

                                        rowSpans.push({ 
                                            type: entry ? 'course' : (specialTitle ? 'special' : 'empty'),
                                            period, 
                                            span, 
                                            entry, 
                                            specialTitle,
                                            isUnavailable,
                                            slot
                                        });
                                    }

                                    return (
                                        <View key={dayKey} style={styles.row}>
                                            <View style={[styles.cell, styles.dayCell]}><Text>{dayName}</Text></View>
                                            {(() => {
                                                const lunchCount = displayPeriods.filter(p => p.id === 'lunch').length;
                                                const teachingCount = displayPeriods.length - lunchCount;
                                                const teachingWidth = (100 - 8 - (lunchCount * 5)) / teachingCount;

                                                return rowSpans.map((rowItem, sIndex) => {
                                                    if (rowItem.type === 'lunch') {
                                                        const isLastRow = dayIndex === Object.keys(DAYS).length - 1;
                                                        return (
                                                            <View key="lunch" style={[styles.cell, styles.lunchCell, { borderBottomWidth: isLastRow ? 1 : 0 }]}>
                                                                {dayIndex === 2 && (
                                                                    <Text style={{ transform: 'rotate(-90deg)', width: 100, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>
                                                                        พักกลางวัน
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        );
                                                    }

                                                    const { type, span, entry, specialTitle, isUnavailable, period } = rowItem;
                                                    const showEmptyBox = type === 'empty' && period.isTeachingPeriod;

                                                    let displayText = specialTitle || period.label || '';
                                                    if (displayText.startsWith('กิจกรรม') && displayText.length > 8) {
                                                        displayText = displayText.replace('กิจกรรม', 'กิจกรรม\n');
                                                    }
                                                    const isMultiLine = displayText.includes('\n');
                                                    const fontSize = isMultiLine ? 12 : (displayText.length > 15 ? 12 : 14);

                                                    return (
                                                        <View key={sIndex} style={[styles.cell, styles.periodCell, { width: `${teachingWidth * span}%` }, (showEmptyBox || isUnavailable) ? styles.emptyCell : {}]}>
                                                            {entry ? (
                                                                <>
                                                                    {entry.course.teacherPeriodLabel && <Text style={styles.teacherPeriodLabel}>{entry.course.teacherPeriodLabel}</Text>}
                                                                    <Text style={styles.courseTitle}>{entry.course.title}</Text>
                                                                    <Text style={styles.courseCode}>{entry.course.code}</Text>
                                                                    <Text style={styles.className}>{entry.className?.split(' (กลุ่ม')[0]}</Text>
                                                                    {entry.roomDisplay && <Text style={styles.roomDisplay}>{entry.roomDisplay}</Text>}
                                                                </>
                                                            ) : (showEmptyBox || isUnavailable) ? (
                                                                <Text style={styles.emptyText}>คาบว่าง</Text>
                                                            ) : specialTitle || !period.isTeachingPeriod ? (
                                                                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 2 }}>
                                                                    <Text style={{
                                                                        fontWeight: 'bold',
                                                                        fontSize: fontSize,
                                                                        textAlign: 'center',
                                                                        lineHeight: 1.1,
                                                                    }}>
                                                                        {displayText}
                                                                    </Text>
                                                                    {item.teacher?.teacherId && (
                                                                        <Text style={{ fontSize: 9, marginTop: 1, color: '#444' }}>
                                                                            {item.teacher.teacherId}
                                                                        </Text>
                                                                    )}
                                                                </View>
                                                            ) : null}
                                                        </View>
                                                    );
                                                });
                                            })()}
                                        </View>
                                    );
                                })}
                            </View>

                            <View style={styles.footer}>
                                <View style={styles.signatureBlock}>
                                    <View style={styles.signatureLine} />
                                    <Text style={styles.signatureText}>({item.teacher.name || '........................................'})</Text>
                                    <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 12 }]}>ครูผู้สอน</Text>
                                </View>
                                <View style={styles.signatureBlock}>
                                    <View style={styles.signatureLine} />
                                    <Text style={styles.signatureText}>({schoolInfo.academicHeadName || '........................................'})</Text>
                                    <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 14 }]}>หัวหน้าวิชาการ</Text>
                                </View>
                                <View style={styles.signatureBlock}>
                                    <View style={styles.signatureLine} />
                                    <Text style={styles.signatureText}>({schoolInfo.directorName || '........................................'})</Text>
                                    <Text style={[styles.signatureText, { fontWeight: 'bold', fontSize: 14 }]}>ผู้อำนวยการโรงเรียน{schoolInfo.schoolName || ''}</Text>
                                </View>
                            </View>

                            <Text style={styles.totalPeriods}>จำนวน {item.totalPeriods} คาบ / สัปดาห์</Text>
                        </Page>
                        <CourseSummaryPage
                            summary={summary}
                            schoolInfo={schoolInfo}
                            teacher={item.teacher}
                            academicYear={academicYear}
                            currentTerm={currentTerm}
                            totalPeriods={calculatedTotalPeriods}
                        />
                    </React.Fragment>
                );
            })}
        </Document>
    );
};
