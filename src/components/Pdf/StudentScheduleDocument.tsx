import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { getEffectivePeriodEnd, getScheduleSlotCandidates, getTimetableDisplayPeriods } from '@/utils/scheduleDisplayUtils';

// Register Thai Font (Sarabun)
// Register Thai Font (Sarabun)
Font.register({
    family: 'TH Sarabun New',
    fonts: [
        { src: '/fonts/THSarabunNew.ttf' },
        { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' }
    ]
});

export interface Course {
    id: string;
    title: string;
    code: string;
    room?: string[];
}

export interface ScheduleEntry {
    course: Course;
    teacherName: string;
    roomCode?: string;
}

export interface SpecialPeriod {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    day?: string;
    linkedPeriodId?: string;
}

export interface PeriodSetting {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
    isTeachingPeriod: boolean;
    isFixed?: boolean;
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

export interface StudentSchedulePDFProps {
    schedule: Record<string, ScheduleEntry | null>;
    schoolInfo: SchoolInfo;
    className: string;
    academicYear: string;
    term: string;
    homeroomTeacher: string;
    totalPeriods: number;
    specialPeriods: SpecialPeriod[];
    periodSettings: PeriodSetting[];
    roomName?: string;
    groupName?: string;
}

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: 'TH Sarabun New',
        fontSize: 12,
    },
    header: {
        marginBottom: 10,
        position: 'relative',
        minHeight: 60,
        justifyContent: 'center',
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
        marginLeft: 70,
        paddingRight: 10,
        textAlign: 'center',
    },
    logo: {
        width: 50,
        height: 50,
    },
    headerText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    subHeaderText: {
        fontSize: 14,
        marginBottom: 2
    },
    affiliationText: {
        fontSize: 14,
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
        minHeight: 80,
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
        fontSize: 12,
    },
    dayCell: { width: '8%', fontWeight: 'bold' },
    periodCell: { width: '8.7%' }, // Default width, will be overridden inline
    lunchCell: { width: '5%', padding: 0, alignItems: 'center', justifyContent: 'center' },

    // Content inside cells
    courseTitle: { fontWeight: 'bold', fontSize: 11, marginBottom: 1, paddingHorizontal: 2, lineHeight: 1.1 },
    courseCode: { fontSize: 9, marginBottom: 1, color: '#333' },
    teacherName: { fontSize: 9, color: '#444', marginBottom: 1 },
    roomCode: { fontSize: 9, color: '#000000', fontWeight: 'bold' },

    // Footer

});

const DAYS = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };

const getCourseTitleFontSize = (title: string): number => {
    const len = title.length;
    if (len > 24) return 7;
    if (len > 18) return 8;
    if (len > 12) return 9.5;
    return 11;
};

const StudentSchedulePageContent = ({
    schedule,
    schoolInfo,
    className,
    academicYear,
    term,
    homeroomTeacher,
    totalPeriods,
    specialPeriods,
    periodSettings,
    roomName,
    groupName
}: StudentSchedulePDFProps) => {
    const displayPeriods = getTimetableDisplayPeriods(periodSettings);

    return (
        <Page size="A4" orientation="landscape" style={styles.page}>
            <View style={styles.header}>
                <View style={styles.headerLogoContainer}>
                    {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} style={styles.logo} />}
                </View>
                <View style={styles.headerContent}>
                    <Text style={styles.headerText}>
                        ตารางเรียน {className}{roomName ? `/${roomName}` : ''}{groupName && groupName !== 'all' ? ` (กลุ่ม ${groupName})` : ''} ภาคเรียนที่ {term || '...'} ปีการศึกษา {academicYear || '...'}
                    </Text>
                    <Text style={styles.subHeaderText}>
                        {schoolInfo.schoolName ? `โรงเรียน${schoolInfo.schoolName} ` : ''}
                        {schoolInfo.affiliation ? `${schoolInfo.affiliation}` : ''}
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
                                            <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{p.label}</Text>
                                            <Text style={{ fontSize: 6 }}>{p.startTime} - {effectiveEnd}</Text>
                                        </View>
                                    ) : (
                                        <>
                                            <Text style={{ fontWeight: 'bold', fontSize: 10 }}>{p.label}</Text>
                                            <Text style={{ fontSize: 8 }}>{p.startTime} - {effectiveEnd}</Text>
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
                        
                        if (period.id === 'lunch') {
                            rowSpans.push({ type: 'lunch', period, span: 1 });
                            continue;
                        }

                        const slot = getScheduleSlotCandidates(dayKey, period, i).find(key => schedule[key]) || `${dayKey}-${period.index ?? i}`;
                        const entry = schedule[slot];
                        
                        const getSpecialPeriod = (day: string, periodSetting: PeriodSetting) => {
                            const { id, startTime, endTime } = periodSetting;
                            return specialPeriods.find(sp =>
                                (sp.linkedPeriodId === id && (!sp.day || sp.day === 'all' || sp.day === day)) ||
                                (sp.startTime === startTime && sp.endTime === endTime && (!sp.day || sp.day === 'all' || sp.day === day))
                            );
                        };
                        const special = getSpecialPeriod(dayKey, period);
                        const specialTitle = special?.title;

                        let span = 1;
                        while (i + 1 < displayPeriods.length) {
                            const nextPeriod = displayPeriods[i + 1];
                            if (nextPeriod.id === 'lunch') break;

                            const nextSlot = getScheduleSlotCandidates(dayKey, nextPeriod, i + 1).find(key => schedule[key]) || `${dayKey}-${nextPeriod.index ?? (i + 1)}`;
                            const nextEntry = schedule[nextSlot];
                            const nextSpecial = getSpecialPeriod(dayKey, nextPeriod);
                            const nextSpecialTitle = nextSpecial?.title;

                            const sameEntry = entry && nextEntry && 
                                             entry.course.code === nextEntry.course.code && 
                                             entry.teacherName === nextEntry.teacherName;
                            
                            const sameSpecial = !entry && !nextEntry && specialTitle && nextSpecialTitle && specialTitle === nextSpecialTitle;

                            if (sameEntry || sameSpecial) {
                                span++;
                                i++;
                            } else {
                                break;
                            }
                        }

                        rowSpans.push({ 
                            type: entry ? 'course' : (specialTitle ? 'special' : (period.isTeachingPeriod ? 'empty' : 'fixed')),
                            period, 
                            span, 
                            entry, 
                            specialTitle,
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
                                                    <Text style={{ transform: 'rotate(-90deg)', width: 80, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>
                                                        พักกลางวัน
                                                    </Text>
                                                )}
                                            </View>
                                        );
                                    }

                                    const { type, span, entry, specialTitle, period } = rowItem;
                                    const isHomeroom = period.id === 'homeroom';

                                    let displayText = specialTitle || period.label || '';
                                    if (displayText.startsWith('กิจกรรม') && displayText.length > 8) {
                                        displayText = displayText.replace('กิจกรรม', 'กิจกรรม\n');
                                    }
                                    const isMultiLine = displayText.includes('\n');
                                    const fontSize = isMultiLine ? 10 : (displayText.length > 15 ? 10 : 12);

                                    return (
                                        <View key={sIndex} style={[styles.cell, styles.periodCell, { width: `${teachingWidth * span}%` }]}>
                                            {entry ? (
                                                <>
                                                    <Text style={[styles.courseTitle, { fontSize: getCourseTitleFontSize(entry.course.title) }]}>{entry.course.title}</Text>
                                                    <Text style={styles.courseCode}>{entry.course.code}</Text>
                                                    <Text style={styles.teacherName}>{entry.teacherName}</Text>
                                                    {entry.roomCode && <Text style={styles.roomCode}>{entry.roomCode}</Text>}
                                                </>
                                            ) : specialTitle ? (
                                                <Text style={{
                                                    fontWeight: 'bold',
                                                    fontSize: fontSize,
                                                    textAlign: 'center',
                                                    lineHeight: 1.1,
                                                    paddingHorizontal: 0,
                                                }}>
                                                    {displayText + ' '}
                                                </Text>
                                            ) : type === 'fixed' || !period.isTeachingPeriod ? (
                                                <View style={{ justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{displayText}</Text>
                                                    {isHomeroom && homeroomTeacher && (
                                                        <Text style={{ fontSize: 10 }}>({homeroomTeacher})</Text>
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


        </Page>
    );
};

export const StudentSchedulePDF = (props: StudentSchedulePDFProps) => {
    return (
        <Document>
            <StudentSchedulePageContent {...props} />
        </Document>
    );
};

interface BulkStudentData {
    className: string;
    room: string;
    schedule: Record<string, ScheduleEntry | null>;
    homeroomTeacher: string;
    totalPeriods: number;
}

interface BulkStudentSchedulePDFProps {
    data: BulkStudentData[];
    schoolInfo: SchoolInfo;
    academicYear: string;
    term: string;
    specialPeriods: SpecialPeriod[];
    periodSettings: PeriodSetting[];
    groupName?: string;
}

export const BulkStudentSchedulePDF = ({
    data,
    schoolInfo,
    academicYear,
    term,
    specialPeriods,
    periodSettings,
    groupName
}: BulkStudentSchedulePDFProps) => {
    return (
        <Document>
            {data.map((item, index) => (
                <StudentSchedulePageContent
                    key={`${item.className}-${item.room}-${index}`}
                    schedule={item.schedule}
                    schoolInfo={schoolInfo}
                    className={item.className}
                    roomName={item.room}
                    academicYear={academicYear}
                    term={term}
                    homeroomTeacher={item.homeroomTeacher}
                    totalPeriods={item.totalPeriods}
                    specialPeriods={specialPeriods}
                    periodSettings={periodSettings}
                    groupName={groupName}
                />
            ))}
        </Document>
    );
};
