import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font, Image } from '@react-pdf/renderer';

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
    periodCell: { flex: 1 },
    lunchCell: { width: '5%', padding: 0, alignItems: 'center', justifyContent: 'center' },

    // Content inside cells
    courseTitle: { fontWeight: 'bold', fontSize: 11, marginBottom: 1, paddingHorizontal: 2, lineHeight: 1.1 },
    courseCode: { fontSize: 9, marginBottom: 1, color: '#333' },
    teacherName: { fontSize: 9, color: '#444', marginBottom: 1 },
<<<<<<< HEAD
    roomCode: { fontSize: 10, color: '#000000', fontWeight: 'bold' },
=======
    roomCode: { fontSize: 9, color: '#10b981', fontWeight: 'bold' },
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    // Footer

});

const DAYS = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };

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
    roomName
}: StudentSchedulePDFProps) => {

    return (
        <Page size="A4" orientation="landscape" style={styles.page}>
            <View style={styles.header}>
                <View style={styles.headerLogoContainer}>
                    {schoolInfo.logoUrl && <Image src={schoolInfo.logoUrl} style={styles.logo} />}
                </View>
                <View style={styles.headerContent}>
                    <Text style={styles.headerText}>
<<<<<<< HEAD
                        ตารางเรียน {className}{roomName ? `/${roomName}` : ''} ภาคเรียนที่ {term || '...'} ปีการศึกษา {academicYear || '...'}
=======
                        ตารางเรียน {className} {roomName ? `ห้อง ${roomName}` : ''} ภาคเรียนที่ {term || '...'} ปีการศึกษา {academicYear || '...'}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    </Text>
                    <Text style={styles.subHeaderText}>
                        {schoolInfo.schoolName ? `โรงเรียน${schoolInfo.schoolName} ` : ''}
                        {schoolInfo.subDistrict ? `ต.${schoolInfo.subDistrict} ` : ''}
                        {schoolInfo.district ? `อ.${schoolInfo.district} ` : ''}
                        {schoolInfo.province ? `จ.${schoolInfo.province}` : ''}
                    </Text>
                    <Text style={styles.affiliationText}>{schoolInfo.affiliation || 'สังกัด...'}</Text>
                </View>
            </View>

            <View style={styles.table}>
                {/* Header Row */}
                <View style={[styles.row, styles.headerRow]}>
                    <View style={[styles.cell, styles.dayCell]}><Text>วัน / เวลา</Text></View>
                    {periodSettings.map((p) => (
                        <View key={p.id} style={[styles.cell, p.id === 'lunch' ? styles.lunchCell : styles.periodCell]}>
                            {p.id === 'lunch' ? (
                                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{p.label}</Text>
                                    <Text style={{ fontSize: 6 }}>{p.startTime} - {p.endTime}</Text>
                                </View>
                            ) : (
                                <>
                                    <Text style={{ fontWeight: 'bold', fontSize: 10 }}>{p.label}</Text>
                                    <Text style={{ fontSize: 8 }}>{p.startTime} - {p.endTime}</Text>
                                </>
                            )}
                        </View>
                    ))}
                </View>

                {/* Data Rows */}
                {Object.entries(DAYS).map(([dayKey, dayName], dayIndex) => (
                    <View key={dayKey} style={styles.row}>
                        <View style={[styles.cell, styles.dayCell]}><Text>{dayName}</Text></View>
                        {periodSettings.map((period) => {
                            if (period.id === 'lunch') {
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

                            const teachingPeriodNumber = period.isTeachingPeriod ? parseInt(period.id.replace('period-', '')) : null;
                            const slot = teachingPeriodNumber ? `${dayKey}-${teachingPeriodNumber}` : `${dayKey}-${period.id}`;
                            const entry = teachingPeriodNumber ? schedule[slot] : null;

                            const getSpecialPeriod = (day: string, periodSetting: PeriodSetting) => {
                                const { id, startTime, endTime } = periodSetting;
                                return specialPeriods.find(sp =>
                                    (sp.linkedPeriodId === id && (!sp.day || sp.day === 'all' || sp.day === day)) ||
                                    (sp.startTime === startTime && sp.endTime === endTime && (!sp.day || sp.day === 'all' || sp.day === day))
                                );
                            };
                            const special = getSpecialPeriod(dayKey, period);
                            const specialTitle = special?.title;
                            const isHomeroom = period.id === 'homeroom';

                            let displayText = specialTitle || period.label || '';
                            if (displayText.startsWith('กิจกรรม') && displayText.length > 8) {
                                displayText = displayText.replace('กิจกรรม', 'กิจกรรม\n');
                            }
                            const isMultiLine = displayText.includes('\n');
                            const fontSize = isMultiLine ? 10 : (displayText.length > 15 ? 10 : 12);

                            return (
                                <View key={period.id} style={[styles.cell, styles.periodCell]}>
                                    {entry ? (
                                        <>
                                            <Text style={styles.courseTitle}>{entry.course.title}</Text>
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
                                    ) : !period.isTeachingPeriod ? (
                                        <View style={{ justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                            <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{displayText}</Text>
                                            {isHomeroom && homeroomTeacher && (
                                                <Text style={{ fontSize: 10 }}>({homeroomTeacher})</Text>
                                            )}
                                        </View>
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>
                ))}
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
}

export const BulkStudentSchedulePDF = ({
    data,
    schoolInfo,
    academicYear,
    term,
    specialPeriods,
    periodSettings
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
                />
            ))}
        </Document>
    );
};
