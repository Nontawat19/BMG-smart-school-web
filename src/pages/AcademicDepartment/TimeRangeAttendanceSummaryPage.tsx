import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { FileSpreadsheet, Loader2, Printer, RefreshCw, Search } from 'lucide-react';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import BackButton from '@/components/Shared/BackButton';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import { CLASS_FULL_NAMES, CLASSES } from '@/utils/schoolUtils';
import { getCurrentAcademicYear } from '@/utils/academicYearUtils';
import { isCurrentStudent } from '@/utils/studentStatusUtils';

const HOMEROOM_SUBJECT_CODE = 'HOMEROOM';

Font.register({
    family: 'TH Sarabun PSK',
    fonts: [
        { src: '/fonts/THSarabunNew.ttf' },
        { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
    ],
});

type AttendanceStatus = 'present' | 'late' | 'leave' | 'absent' | 'escape';

interface StudentRow {
    id: string;
    firstName: string;
    lastName: string;
    prefix?: string;
    number: string;
    studentCode: string;
    room?: string;
    classLevel?: string;
}

interface AttendanceDay {
    iso: string;
    label: string;
    docDateId: string;
}

const statusText: Record<AttendanceStatus, string> = {
    present: 'ป',
    late: 'ส',
    leave: 'ล',
    absent: 'ข',
    escape: 'ข',
};

const statusColor: Record<AttendanceStatus, string> = {
    present: 'text-green-600 dark:text-green-400',
    late: 'text-amber-600 dark:text-amber-400',
    leave: 'text-sky-600 dark:text-sky-400',
    absent: 'text-slate-900 dark:text-slate-100',
    escape: 'text-slate-900 dark:text-slate-100',
};

const pdfStatusText: Record<AttendanceStatus, string> = {
    present: 'ป',
    late: 'ส',
    leave: 'ล',
    absent: 'ข',
    escape: 'ข',
};

const summaryLabels = ['ยอดรวมปกติ', 'ยอดรวมมาสาย', 'ยอดรวมขาด', 'ยอดรวมลา', 'ยอดรวมทั้งหมด'];

const toInputDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toDocDateId = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-');
    return `${day}-${month}-${year}`;
};

const formatThaiDate = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return `${day}/${month}/${year}`;
};

const formatSelectedDateThai = (isoDate: string) => {
    if (!isoDate) return '-';
    const date = new Date(`${isoDate}T12:00:00`);
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatPdfDateThai = (isoDate: string) => {
    if (!isoDate) return '-';
    const date = new Date(`${isoDate}T12:00:00`);
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};

const normalizeDateToIso = (value: any) => {
    if (!value) return '';
    const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return toInputDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
};

const normalizeRoom = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? String(numeric) : raw.toLowerCase();
};

const getClassKeyFromLevel = (classLevel: string) => {
    const value = String(classLevel || '').trim();
    return Object.entries(CLASSES).find(([, label]) => label === value)?.[0] ||
        Object.entries(CLASS_FULL_NAMES).find(([, label]) => label === value)?.[0] ||
        value;
};

const getFullClassLabel = (classLevel: string, room?: string) => {
    const classKey = getClassKeyFromLevel(classLevel);
    const base = CLASS_FULL_NAMES[classKey] || classLevel;
    return room ? `${base}/${room}` : base;
};

const getDailyStatusPriority = (status?: string) => {
    switch (status) {
        case 'present': return 5;
        case 'late': return 4;
        case 'leave': return 3;
        case 'absent':
        case 'escape': return 2;
        default: return 0;
    }
};

const chooseDailyStatus = (current: AttendanceStatus | undefined, next: AttendanceStatus) => {
    return getDailyStatusPriority(next) >= getDailyStatusPriority(current) ? next : current;
};

const matchesClassroomAttendanceClass = (data: any, selectedClassLevel: string) => {
    const classKey = getClassKeyFromLevel(selectedClassLevel);
    const candidates = [
        data.classId,
        data.className,
        data.classLevel,
    ].map((value) => String(value || '').trim()).filter(Boolean);

    return candidates.length === 0 ||
        candidates.includes(classKey) ||
        candidates.includes(selectedClassLevel) ||
        candidates.includes(CLASSES[classKey]) ||
        candidates.includes(CLASS_FULL_NAMES[classKey]);
};

const matchesClassroomAttendanceRecord = (
    data: any,
    selectedClassLevel: string,
    selectedRoom: string,
    academicYear: string,
    semester: string
) => {
    if (!matchesClassroomAttendanceClass(data, selectedClassLevel)) return false;
    if (selectedRoom) {
        const selected = normalizeRoom(selectedRoom);
        const roomCandidates = [
            data.room,
            data.roomNumber,
            data.groupNumber,
            ...(Array.isArray(data.roomIds) ? data.roomIds : []),
        ].map(normalizeRoom).filter(Boolean);
        if (roomCandidates.length > 0 && !roomCandidates.includes(selected) && !roomCandidates.includes('all')) {
            return false;
        }
    }

    const recordYear = String(data.academicYear || '');
    const recordSemester = String(data.semester || '');
    if (recordYear && academicYear && recordYear !== academicYear) return false;
    if (recordSemester && semester && recordSemester !== semester) return false;

    return true;
};

const getDateRange = (startDate: string, endDate: string): AttendanceDay[] => {
    if (!startDate || !endDate || startDate > endDate) return [];

    const dates: AttendanceDay[] = [];
    const current = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);

    while (current <= end) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) {
            const iso = toInputDate(current);
            dates.push({
                iso,
                label: formatThaiDate(iso),
                docDateId: toDocDateId(iso),
            });
        }
        current.setDate(current.getDate() + 1);
    }

    return dates;
};

const summarizeAttendance = (
    studentId: string,
    dates: AttendanceDay[],
    attendanceMap: Record<string, Record<string, AttendanceStatus>>
) => {
    return dates.reduce((acc, day) => {
        const status = attendanceMap[studentId]?.[day.iso];
        if (status === 'present') acc.present += 1;
        if (status === 'late') acc.late += 1;
        if (status === 'leave') acc.leave += 1;
        if (status === 'absent' || status === 'escape') acc.absent += 1;
        if (status) acc.total += 1;
        return acc;
    }, { present: 0, late: 0, leave: 0, absent: 0, escape: 0, total: 0 });
};

const pdfStyles = StyleSheet.create({
    page: {
        paddingTop: 34,
        paddingHorizontal: 44,
        paddingBottom: 26,
        fontFamily: 'TH Sarabun PSK',
        fontSize: 12,
        color: '#000',
        backgroundColor: '#fff',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 0.8,
        borderBottomColor: '#5f5f5f',
        paddingBottom: 2,
        marginBottom: 8,
    },
    topText: {
        fontSize: 12.5,
        fontWeight: 'bold',
    },
    logo: {
        position: 'absolute',
        top: 55,
        left: 48,
        width: 45,
        height: 52,
        objectFit: 'contain',
    },
    titleBlock: {
        alignItems: 'center',
        marginTop: 26,
        marginBottom: 24,
        lineHeight: 1.2,
    },
    reportTitle: {
        fontSize: 19,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    reportSubtitle: {
        fontSize: 14.5,
        marginBottom: 2,
    },
    table: {
        borderTopWidth: 0.9,
        borderLeftWidth: 0.9,
        borderColor: '#111',
    },
    row: {
        flexDirection: 'row',
        minHeight: 18.4,
    },
    headerRow: {
        minHeight: 78,
        backgroundColor: '#cfcfcf',
    },
    cell: {
        borderRightWidth: 0.75,
        borderBottomWidth: 0.75,
        borderColor: '#111',
        justifyContent: 'center',
        paddingHorizontal: 2,
    },
    centerCell: {
        alignItems: 'center',
        textAlign: 'center',
    },
    leftCell: {
        alignItems: 'flex-start',
        textAlign: 'left',
        paddingLeft: 5,
    },
    headerText: {
        fontSize: 13,
        fontWeight: 'bold',
    },
    bodyText: {
        fontSize: 11.6,
        lineHeight: 1.1,
    },
    boldText: {
        fontSize: 12.8,
        fontWeight: 'bold',
    },
    rotatedText: {
        width: 74,
        fontSize: 10.5,
        fontWeight: 'bold',
        textAlign: 'center',
        transform: 'rotate(-90deg)',
    },
    nameBodyText: {
        fontSize: 11.8,
        lineHeight: 1.1,
        textAlign: 'center',
    },
});

const TimeRangeAttendancePdfDocument = ({
    schoolName,
    logoUrl,
    academicYear,
    semester,
    classLabel,
    startDate,
    endDate,
    students,
    dates,
    attendanceMap,
}: {
    schoolName: string;
    logoUrl?: string;
    academicYear: string;
    semester: string;
    classLabel: string;
    startDate: string;
    endDate: string;
    students: StudentRow[];
    dates: AttendanceDay[];
    attendanceMap: Record<string, Record<string, AttendanceStatus>>;
}) => {
    const pageContentWidth = 754;
    const indexWidth = 28;
    const codeWidth = 68;
    const summaryWidth = 35;
    const staticWidth = indexWidth + codeWidth + 184 + (summaryWidth * 5);
    const dateWidth = Math.max(18, Math.min(29, (pageContentWidth - staticWidth) / Math.max(dates.length, 1)));
    const nameWidth = pageContentWidth - indexWidth - codeWidth - (dateWidth * Math.max(dates.length, 1)) - (summaryWidth * 5);

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={pdfStyles.page}>
                <View style={pdfStyles.topBar} fixed>
                    <Text style={pdfStyles.topText}>{schoolName}</Text>
                    <Text style={pdfStyles.topText}>รายงานเช็คมาเรียนรายห้อง</Text>
                </View>

                {logoUrl ? <Image src={logoUrl} style={pdfStyles.logo} /> : null}

                <View style={pdfStyles.titleBlock}>
                    <Text style={pdfStyles.reportTitle}>รายงานเช็คมาเรียนรายห้อง</Text>
                    <Text style={pdfStyles.reportSubtitle}>{schoolName}</Text>
                    <Text style={pdfStyles.reportSubtitle}>ปีการศึกษา {semester}/{academicYear}     ระดับชั้น {classLabel}</Text>
                    <Text style={pdfStyles.reportSubtitle}>ช่วงระหว่างวันที่ {formatPdfDateThai(startDate)} - {formatPdfDateThai(endDate)}</Text>
                </View>

                <View style={pdfStyles.table}>
                    <View style={[pdfStyles.row, pdfStyles.headerRow]} fixed>
                        <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: indexWidth }]}>
                            <Text style={pdfStyles.headerText}>#</Text>
                        </View>
                        <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: codeWidth }]}>
                            <Text style={pdfStyles.headerText}>รหัสนักเรียน</Text>
                        </View>
                        <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: nameWidth }]}>
                            <Text style={pdfStyles.headerText}>ชื่อ-นามสกุล</Text>
                        </View>
                        {dates.map(day => (
                            <View key={day.iso} style={[pdfStyles.cell, pdfStyles.centerCell, { width: dateWidth }]}>
                                <Text style={pdfStyles.rotatedText}>{formatPdfDateThai(day.iso)}</Text>
                            </View>
                        ))}
                        {summaryLabels.map(label => (
                            <View key={label} style={[pdfStyles.cell, pdfStyles.centerCell, { width: summaryWidth }]}>
                                <Text style={pdfStyles.rotatedText}>{label}</Text>
                            </View>
                        ))}
                    </View>

                    {students.length === 0 ? (
                        <View style={[pdfStyles.row, { minHeight: 28 }]}>
                            <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: pageContentWidth }]}>
                                <Text style={pdfStyles.bodyText}>ไม่พบข้อมูลการมาเรียน</Text>
                            </View>
                        </View>
                    ) : (
                        students.map((student, index) => {
                            const stats = summarizeAttendance(student.id, dates, attendanceMap);
                            return (
                                <View key={student.id} style={pdfStyles.row} wrap={false}>
                                    <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: indexWidth }]}>
                                        <Text style={pdfStyles.bodyText}>{index + 1}</Text>
                                    </View>
                                    <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: codeWidth }]}>
                                        <Text style={pdfStyles.bodyText}>{student.studentCode || '-'}</Text>
                                    </View>
                                    <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: nameWidth }]}>
                                        <Text style={pdfStyles.nameBodyText}>{`${student.prefix || ''}${student.firstName} ${student.lastName}`.trim() || '-'}</Text>
                                    </View>
                                    {dates.map(day => {
                                        const status = attendanceMap[student.id]?.[day.iso];
                                        return (
                                            <View key={day.iso} style={[pdfStyles.cell, pdfStyles.centerCell, { width: dateWidth }]}>
                                                <Text style={pdfStyles.bodyText}>{status ? pdfStatusText[status] : '-'}</Text>
                                            </View>
                                        );
                                    })}
                                    {[stats.present, stats.late, stats.absent, stats.leave, stats.total].map((value, valueIndex) => (
                                        <View key={valueIndex} style={[pdfStyles.cell, pdfStyles.centerCell, { width: summaryWidth }]}>
                                            <Text style={pdfStyles.boldText}>{value}</Text>
                                        </View>
                                    ))}
                                </View>
                            );
                        })
                    )}
                </View>
            </Page>
        </Document>
    );
};

const TimeRangeAttendanceSummaryPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
    const schoolId = (currentUser as any)?.schoolId;

    const today = useMemo(() => new Date(), []);
    const defaultStartDate = useMemo(() => {
        const date = new Date(today);
        date.setDate(date.getDate() - 14);
        return toInputDate(date);
    }, [today]);

    const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear() + 543));
    const [semester, setSemester] = useState('1');
    const [selectedClassLevel, setSelectedClassLevel] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(toInputDate(today));
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, AttendanceStatus>>>({});
    const [loading, setLoading] = useState(false);
    const [pdfGenerating, setPdfGenerating] = useState(false);

    const schoolLabel = useMemo(() => {
        const schoolSettingsData = schoolSettings as any;
        const code = schoolSettingsData.schoolCode || (currentUser as any)?.schoolCode || '';
        const name = schoolSettings.schoolName || (currentUser as any)?.schoolName || '';
        return [code, name].filter(Boolean).join('-') || name || code || 'โรงเรียน';
    }, [currentUser, schoolSettings]);

    const availableLevels = useMemo(() => (
        (schoolSettings.availableClassOptions || []).map(([, label]) => label).filter(Boolean)
    ), [schoolSettings.availableClassOptions]);

    const roomOptions = useMemo(() => Array.from({ length: 20 }, (_, index) => String(index + 1)), []);

    const termOptions = useMemo(() => ([
        { value: `1/${academicYear}`, label: `${schoolSettings.schoolName || 'โรงเรียน'}-1/${academicYear}` },
        { value: `2/${academicYear}`, label: `${schoolSettings.schoolName || 'โรงเรียน'}-2/${academicYear}` },
    ]), [academicYear, schoolSettings.schoolName]);

    const dates = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

    useEffect(() => {
        if (!selectedClassLevel && availableLevels.length > 0) {
            setSelectedClassLevel(availableLevels[0]);
        }
    }, [availableLevels, selectedClassLevel]);

    useEffect(() => {
        const loadCurrentYear = async () => {
            if (!schoolId) return;

            try {
                const current = await getCurrentAcademicYear(db, schoolId);
                setAcademicYear(current.academicYear);
                setSemester(current.currentTerm || '1');
            } catch (error) {
                console.error('Error loading current academic year:', error);
            }
        };

        loadCurrentYear();
    }, [schoolId]);

    const fetchReport = useCallback(async () => {
        if (!schoolId || !selectedClassLevel) return;
        if (!startDate || !endDate || startDate > endDate) {
            Swal.fire('ช่วงวันที่ไม่ถูกต้อง', 'กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุดให้ถูกต้อง', 'warning');
            return;
        }

        setLoading(true);
        try {
            const studentSnap = await getDocs(query(
                collection(db, 'school-settings', schoolId, 'students'),
                where('classLevel', '==', selectedClassLevel)
            ));

            const studentList = studentSnap.docs
                .map(studentDoc => {
                    const data = studentDoc.data() as any;
                    return {
                        id: studentDoc.id,
                        firstName: data.firstName || '',
                        lastName: data.lastName || '',
                        prefix: data.title || data.prefix || '',
                        number: data.studentNumber || data.number || '',
                        studentCode: data.studentId || data.studentCode || data.code || '',
                        room: data.room || data.roomNumber || '',
                        classLevel: data.classLevel || '',
                        status: data.status,
                        studentStatus: data.studentStatus,
                    } as StudentRow & { status?: string; studentStatus?: string };
                })
                .filter(isCurrentStudent)
                .filter(student => !selectedRoom || normalizeRoom(student.room) === normalizeRoom(selectedRoom))
                .sort((a, b) => {
                    const numberA = parseInt(a.number || '9999', 10) || 9999;
                    const numberB = parseInt(b.number || '9999', 10) || 9999;
                    if (numberA !== numberB) return numberA - numberB;
                    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'th');
                });

            const rangeDates = getDateRange(startDate, endDate);
            const rangeDateSet = new Set(rangeDates.map(day => day.iso));
            const nextAttendanceMap: Record<string, Record<string, AttendanceStatus>> = {};

            await Promise.all(studentList.map(async (student) => {
                const studentAttendance: Record<string, AttendanceStatus> = {};

                const attendanceSnap = await getDocs(collection(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance'));
                attendanceSnap.forEach(attendanceDoc => {
                    const data = attendanceDoc.data();
                    if (!matchesClassroomAttendanceRecord(data, selectedClassLevel, selectedRoom, academicYear, semester)) return;

                    const isoDate = normalizeDateToIso(data.date);
                    const status = data.status;
                    if (rangeDateSet.has(isoDate) && ['present', 'late', 'leave', 'absent', 'escape'].includes(status)) {
                        studentAttendance[isoDate] = chooseDailyStatus(studentAttendance[isoDate], status as AttendanceStatus) as AttendanceStatus;
                    }
                });

                const leaveSnap = await getDocs(query(
                    collection(db, 'school-settings', schoolId, 'students', student.id, 'leave_summary'),
                    where('status', '==', 'approved')
                ));
                leaveSnap.forEach(leaveDoc => {
                    const leave = leaveDoc.data();
                    const leaveStart = normalizeDateToIso(leave.startDate);
                    const leaveEnd = normalizeDateToIso(leave.endDate);
                    if (!leaveStart || !leaveEnd) return;

                    rangeDates.forEach(day => {
                        if (day.iso < leaveStart || day.iso > leaveEnd || studentAttendance[day.iso]) return;
                        studentAttendance[day.iso] = leave.leaveType === 'ไปราชการ/กิจกรรม' ? 'present' : 'leave';
                    });
                });

                nextAttendanceMap[student.id] = studentAttendance;
            }));

            setStudents(studentList);
            setAttendanceMap(nextAttendanceMap);
        } catch (error) {
            console.error('Error fetching time range attendance summary:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลรายงานได้', 'error');
        } finally {
            setLoading(false);
        }
    }, [academicYear, endDate, schoolId, selectedClassLevel, selectedRoom, semester, startDate]);

    useEffect(() => {
        if (schoolId && selectedClassLevel) {
            fetchReport();
        }
    }, [fetchReport, schoolId, selectedClassLevel]);

    const getStats = useCallback((studentId: string) => {
        return summarizeAttendance(studentId, dates, attendanceMap);
    }, [attendanceMap, dates]);

    const reportTotals = useMemo(() => {
        return students.reduce((acc, student) => {
            const stats = getStats(student.id);
            acc.present += stats.present;
            acc.late += stats.late;
            acc.leave += stats.leave;
            acc.absent += stats.absent;
            acc.escape += stats.escape;
            acc.total += stats.total;
            return acc;
        }, { present: 0, late: 0, leave: 0, absent: 0, escape: 0, total: 0 });
    }, [getStats, students]);

    const handleExportExcel = () => {
        if (students.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่มีข้อมูลสำหรับส่งออก', 'warning');
            return;
        }

        const rows = students.map((student, index) => {
            const stats = getStats(student.id);
            const row: Record<string, string | number> = {
                '#': index + 1,
                'รหัสนักเรียน': student.studentCode,
                'ชื่อ-นามสกุล': `${student.prefix || ''}${student.firstName} ${student.lastName}`.trim(),
                'ชั้น': getFullClassLabel(selectedClassLevel, selectedRoom || student.room),
            };

            dates.forEach(day => {
                const status = attendanceMap[student.id]?.[day.iso];
                row[day.label] = status ? statusText[status] : '';
            });

            row[summaryLabels[0]] = stats.present;
            row[summaryLabels[1]] = stats.late;
            row[summaryLabels[2]] = stats.absent;
            row[summaryLabels[3]] = stats.leave;
            row[summaryLabels[4]] = stats.total;
            return row;
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Attendance');
        XLSX.writeFile(workbook, `สรุปมาเรียนตามช่วงเวลา_${selectedClassLevel}_${selectedRoom || 'all'}_${startDate}_${endDate}.xlsx`);
    };

    const selectedClassLabel = getFullClassLabel(selectedClassLevel, selectedRoom);

    const handleExportPdf = async () => {
        if (students.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่มีข้อมูลสำหรับสร้าง PDF', 'warning');
            return;
        }

        setPdfGenerating(true);
        try {
            const document = (
                <TimeRangeAttendancePdfDocument
                    schoolName={schoolSettings.schoolName || schoolLabel}
                    logoUrl={schoolSettings.logoUrl}
                    academicYear={academicYear}
                    semester={semester}
                    classLabel={selectedClassLabel}
                    startDate={startDate}
                    endDate={endDate}
                    students={students}
                    dates={dates}
                    attendanceMap={attendanceMap}
                />
            );
            const blob = await pdf(document).toBlob();
            saveAs(blob, `รายงานเช็คมาเรียนรายห้อง_${selectedClassLevel}_${selectedRoom || 'all'}_${startDate}_${endDate}.pdf`);
        } catch (error) {
            console.error('Error exporting time range attendance PDF:', error);
            Swal.fire('สร้าง PDF ไม่สำเร็จ', 'ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง', 'error');
        } finally {
            setPdfGenerating(false);
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-[#eef0f4] px-2 py-4 text-slate-900 transition-colors dark:bg-[#0f1117] dark:text-slate-100 print:bg-white print:text-black">
                <div className="mx-auto max-w-[1120px]">
                    <div className="mb-3 flex items-center gap-4 print:hidden">
                        <BackButton to="/academic/hub/students" />
                        <span className="font-medium text-gray-500 dark:text-gray-400">กลับไปหน้าข้อมูลนักเรียน</span>
                    </div>

                    <div className="rounded-sm border border-[#d6dbe0] bg-white shadow-sm transition-colors dark:border-slate-700 dark:bg-[#171922] print:border-none print:shadow-none">
                        <div className="flex items-center justify-between border-b border-[#d6dbe0] px-4 py-2.5 dark:border-slate-700 print:hidden">
                            <h1 className="text-[15px] font-medium text-slate-950 dark:text-slate-100">รายงานเช็คมาเรียนรายห้องตามช่วงเวลา</h1>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={fetchReport}
                                    disabled={loading}
                                    title="รีเฟรชข้อมูล"
                                    className="inline-flex h-[30px] w-[34px] items-center justify-center rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
                                >
                                    {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportPdf}
                                    disabled={pdfGenerating || loading}
                                    className="inline-flex h-[30px] items-center gap-1.5 rounded bg-sky-500 px-3 text-[12px] font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
                                >
                                    {pdfGenerating ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                                    PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportExcel}
                                    className="inline-flex h-[30px] items-center gap-1.5 rounded bg-blue-500 px-3 text-[12px] font-semibold text-white hover:bg-blue-600"
                                >
                                    <FileSpreadsheet size={14} />
                                    Excel
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-x-12 gap-y-3 px-7 py-4 md:grid-cols-2 print:hidden">
                            <label className="block">
                                <span className="mb-1 block text-[13px] font-semibold">โรงเรียน</span>
                                <select
                                    value={schoolId || ''}
                                    disabled
                                    className="h-8 w-full rounded border border-[#d9dee3] bg-white px-3 text-[13px] text-slate-900 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                >
                                    <option value={schoolId || ''}>{schoolLabel}</option>
                                </select>
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-[13px] font-semibold">ภาคเรียน</span>
                                <select
                                    value={`${semester}/${academicYear}`}
                                    onChange={(event) => {
                                        const [nextSemester, nextYear] = event.target.value.split('/');
                                        setSemester(nextSemester);
                                        setAcademicYear(nextYear);
                                    }}
                                    className="h-8 w-full rounded border border-[#d9dee3] bg-white px-3 text-[13px] text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                >
                                    {termOptions.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="block md:col-span-2">
                                <span className="mb-1 block text-[13px] font-semibold">ชั้นเรียน</span>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
                                    <select
                                        value={selectedClassLevel}
                                        onChange={(event) => {
                                            setSelectedClassLevel(event.target.value);
                                            setSelectedRoom('');
                                        }}
                                        className="h-8 w-full rounded border border-[#d9dee3] bg-white px-3 text-[13px] text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                    >
                                        {availableLevels.map((level) => (
                                            <option key={level} value={level}>{`${schoolSettings.schoolName || 'โรงเรียน'}-${getFullClassLabel(level)}`}</option>
                                        ))}
                                    </select>

                                    <select
                                        value={selectedRoom}
                                        onChange={(event) => setSelectedRoom(event.target.value)}
                                        className="h-8 w-full rounded border border-[#d9dee3] bg-white px-3 text-[13px] text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                    >
                                        <option value="">ทุกห้อง</option>
                                        {roomOptions.map(room => (
                                            <option key={room} value={room}>ห้อง {room}</option>
                                        ))}
                                    </select>
                                </div>
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-[13px] font-semibold">วันเริ่มต้น</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(event) => setStartDate(event.target.value)}
                                    className="h-[31px] w-full rounded border border-[#cfd6dd] bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                />
                                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{formatSelectedDateThai(startDate)}</div>
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-[13px] font-semibold">วันสิ้นสุด</span>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                    <div className="flex-1">
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(event) => setEndDate(event.target.value)}
                                            className="h-[31px] w-full rounded border border-[#cfd6dd] bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                        />
                                        <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{formatSelectedDateThai(endDate)}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={fetchReport}
                                        disabled={loading}
                                        className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded bg-[#3182ce] px-4 text-[12px] font-semibold text-white hover:bg-[#2b6cb0] disabled:opacity-60"
                                    >
                                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                                        ค้นหารายการ
                                    </button>
                                </div>
                            </label>
                        </div>

                        <div className="px-3 pb-5 print:px-0">
                            <div className="mb-3 hidden text-center print:block">
                                <div className="text-base font-semibold">รายงานเช็คมาเรียนรายห้องตามช่วงเวลา</div>
                                <div className="text-sm">{schoolSettings.schoolName || schoolLabel} ภาคเรียนที่ {semester}/{academicYear}</div>
                                <div className="text-sm">{selectedClassLabel} วันที่ {formatSelectedDateThai(startDate)} ถึง {formatSelectedDateThai(endDate)}</div>
                            </div>

                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-600 dark:text-slate-400 print:hidden">
                                <span>พบข้อมูลนักเรียน {students.length} คน จำนวนวันเรียน {dates.length} วัน</span>
                                <span>
                                    มา {reportTotals.present} | สาย {reportTotals.late} | ขาด {reportTotals.absent} | ลา {reportTotals.leave}
                                </span>
                            </div>

                            <div className="overflow-x-auto border border-[#d6dbe0] dark:border-slate-700 print:overflow-visible">
                                <table className="w-full min-w-[980px] border-collapse text-[12px] print:min-w-0 print:text-[10px]">
                                    <thead>
                                        <tr className="bg-[#e9eef2] text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                                            <th className="h-[96px] w-[46px] border-r border-[#d6dbe0] px-2 py-3 text-center align-middle font-semibold dark:border-slate-700">#</th>
                                            <th className="h-[96px] w-[90px] border-r border-[#d6dbe0] px-2 py-3 text-center align-middle font-semibold leading-tight dark:border-slate-700">รหัส<br />นักเรียน</th>
                                            <th className="h-[96px] min-w-[220px] border-r border-[#d6dbe0] px-3 py-3 text-center align-middle font-semibold dark:border-slate-700">ชื่อ-นามสกุล</th>
                                            <th className="h-[96px] w-[160px] border-r border-[#d6dbe0] px-3 py-3 text-center align-middle font-semibold dark:border-slate-700">ชั้น</th>
                                            {dates.map(day => (
                                                <th key={day.iso} className="h-[96px] w-[34px] border-r border-[#d6dbe0] p-0 text-center align-middle font-semibold dark:border-slate-700">
                                                    <span className="mx-auto flex h-[92px] w-[32px] items-center justify-center">
                                                        <span className="block origin-center -rotate-90 whitespace-nowrap text-[11px] leading-none print:text-[8px]">{day.label}</span>
                                                    </span>
                                                </th>
                                            ))}
                                            {summaryLabels.map((label, labelIndex) => (
                                                <th key={label} className={`h-[96px] w-[42px] p-0 text-center align-middle font-semibold ${labelIndex < 4 ? 'border-r border-[#d6dbe0] dark:border-slate-700' : ''}`}>
                                                    <span className="mx-auto flex h-[92px] w-[40px] items-center justify-center">
                                                        <span className="block origin-center -rotate-90 whitespace-nowrap text-[12px] leading-none print:text-[8px]">{label}</span>
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.length === 0 ? (
                                            <tr>
                                                <td colSpan={9 + dates.length} className="px-3 py-12 text-center text-[13px] text-slate-600 dark:text-slate-400">
                                                    {loading ? 'กำลังโหลดข้อมูล...' : 'ไม่พบข้อมูลการมาเรียน'}
                                                </td>
                                            </tr>
                                        ) : (
                                            students.map((student, index) => {
                                                const stats = getStats(student.id);
                                                return (
                                                    <tr key={student.id} className="border-t border-[#d6dbe0] bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-[#171922] dark:hover:bg-slate-800/60">
                                                        <td className="border-r border-[#d6dbe0] px-2 py-2 text-center font-semibold dark:border-slate-700">{index + 1}</td>
                                                        <td className="border-r border-[#d6dbe0] px-2 py-2 text-center dark:border-slate-700">{student.studentCode || '-'}</td>
                                                        <td className="border-r border-[#d6dbe0] px-3 py-2 dark:border-slate-700">{`${student.prefix || ''}${student.firstName} ${student.lastName}`.trim() || '-'}</td>
                                                        <td className="border-r border-[#d6dbe0] px-3 py-2 text-center font-medium dark:border-slate-700">{getFullClassLabel(selectedClassLevel, selectedRoom || student.room)}</td>
                                                        {dates.map(day => {
                                                            const status = attendanceMap[student.id]?.[day.iso];
                                                            return (
                                                                <td key={day.iso} className={`border-r border-[#d6dbe0] px-1 py-2 text-center font-black dark:border-slate-700 ${status ? statusColor[status] : 'text-slate-300 dark:text-slate-600'}`}>
                                                                    {status ? statusText[status] : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="border-r border-[#d6dbe0] px-1 py-2 text-center dark:border-slate-700">{stats.present}</td>
                                                        <td className="border-r border-[#d6dbe0] px-1 py-2 text-center dark:border-slate-700">{stats.late}</td>
                                                        <td className="border-r border-[#d6dbe0] px-1 py-2 text-center dark:border-slate-700">{stats.absent}</td>
                                                        <td className="border-r border-[#d6dbe0] px-1 py-2 text-center dark:border-slate-700">{stats.leave}</td>
                                                        <td className="px-1 py-2 text-center">{stats.total}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default TimeRangeAttendanceSummaryPage;
