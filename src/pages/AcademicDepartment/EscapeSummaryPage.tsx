import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { collection, collectionGroup, documentId, getDocs, query, where } from 'firebase/firestore';
import { Loader2, Minus, Plus, Printer, RefreshCw, Search, X, FileDown } from 'lucide-react';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf, PDFViewer } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import Select from 'react-select';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { getCurrentAcademicYear } from '@/utils/academicYearUtils';
import BackButton from '@/components/Shared/BackButton';

Font.register({
    family: 'TH Sarabun PSK',
    fonts: [
        { src: '/fonts/THSarabunNew.ttf' },
        { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' }
    ]
});

interface EscapeRecord {
    studentId: string;
    studentName?: string;
    studentNumber?: string;
    classId?: string;
    className?: string;
    room?: string | number;
    subjectCode?: string;
    subjectName?: string;
    teacherName?: string;
    status?: string;
    date: any;
    period?: number;
    academicYear?: string;
    semester?: string;
    checkedBy?: string;
    checkedByName?: string;
}

interface ReportGroup {
    key: string;
    className: string;
    subjectLabel: string;
    periods: string;
    records: EscapeRecord[];
    uniqueStudentCount: number;
}

const thaiShortMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const CLASS_FULL_LABELS: Record<string, string> = {
    'อ.1': 'อนุบาลปีที่ 1',
    'อ.2': 'อนุบาลปีที่ 2',
    'อ.3': 'อนุบาลปีที่ 3',
    'ป.1': 'ประถมศึกษาปีที่ 1',
    'ป.2': 'ประถมศึกษาปีที่ 2',
    'ป.3': 'ประถมศึกษาปีที่ 3',
    'ป.4': 'ประถมศึกษาปีที่ 4',
    'ป.5': 'ประถมศึกษาปีที่ 5',
    'ป.6': 'ประถมศึกษาปีที่ 6',
    'ม.1': 'มัธยมศึกษาปีที่ 1',
    'ม.2': 'มัธยมศึกษาปีที่ 2',
    'ม.3': 'มัธยมศึกษาปีที่ 3',
    'ม.4': 'มัธยมศึกษาปีที่ 4',
    'ม.5': 'มัธยมศึกษาปีที่ 5',
    'ม.6': 'มัธยมศึกษาปีที่ 6',
};

const toDate = (value: any): Date | null => {
    if (!value) return null;
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const toInputDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateThai = (value: any) => {
    const date = typeof value === 'string' ? new Date(value) : toDate(value);
    if (!date || Number.isNaN(date.getTime())) return '-';
    return `${date.getDate()} ${thaiShortMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
};

const isSameInputDate = (recordDate: any, inputDate: string) => {
    if (!inputDate) return true;
    const date = toDate(recordDate);
    return date ? toInputDate(date) === inputDate : false;
};

const getClassLabel = (record: EscapeRecord) => {
    const className = String(record.className || record.classId || 'ไม่ระบุห้อง').trim();
    const room = record.room === undefined || record.room === null ? '' : String(record.room).trim();
    if (!room || className.includes('/')) return className;
    return `${className}/${room}`;
};

const getStudentKey = (record: EscapeRecord) => record.studentId || record.studentName || '';

const getFullClassLabel = (classLabel: string) => {
    const [level, room] = String(classLabel || '').split('/');
    const fullLevel = CLASS_FULL_LABELS[level] || level || 'ไม่ระบุห้อง';
    return room ? `${fullLevel}/${room}` : fullLevel;
};

const getDisplayStudentCode = (studentData: any, attendanceData: EscapeRecord, studentDocId: string) => {
    const code = String(
        studentData?.studentCode ||
        studentData?.studentId ||
        studentData?.code ||
        studentData?.student_code ||
        studentData?.['รหัสนักเรียน'] ||
        ''
    ).trim();

    if (code) return code;

    const attendanceStudentId = String(attendanceData.studentId || '').trim();
    return attendanceStudentId && attendanceStudentId !== studentDocId ? attendanceStudentId : '';
};

const getSchoolDisplayCode = (schoolSettings: any, currentUser: any, fallbackSchoolId: string) => {
    const fallbackLooksLikeCode = /^\d+$/.test(String(fallbackSchoolId || '').trim());
    return String(
        schoolSettings?.schoolCode ||
        currentUser?.schoolCode ||
        currentUser?.schoolCodeId ||
        currentUser?.schoolNumber ||
        (fallbackLooksLikeCode ? fallbackSchoolId : '') ||
        ''
    ).trim();
};

const chunkArray = <T,>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};

const uniqueRecordsByStudent = (records: EscapeRecord[]) => {
    const map = new Map<string, EscapeRecord>();
    records.forEach((record) => {
        const key = getStudentKey(record);
        if (!key || !map.has(key)) map.set(key || `${record.studentName}-${record.period}`, record);
    });
    return Array.from(map.values()).sort((a, b) => String(a.studentId || '').localeCompare(String(b.studentId || ''), 'th', { numeric: true }));
};

const getTeacherLabel = (records: EscapeRecord[]) => {
    const names = Array.from(new Set(
        records
            .map((record) => record.teacherName || record.checkedByName || record.checkedBy || '')
            .map((name) => String(name).trim())
            .filter(Boolean)
    ));
    return names.join(', ') || '-';
};

const getStudentListText = (records: EscapeRecord[]) => {
    const uniqueRecords = uniqueRecordsByStudent(records);
    const names = uniqueRecords.map((record, index) => {
        const number = record.studentNumber ? `เลขที่ ${record.studentNumber} ` : '';
        const code = record.studentId ? ` (${record.studentId})` : '';
        return `${index + 1}. ${number}${record.studentName || '-'}${code}`;
    });

    return [
        `จำนวนนักเรียนที่หนีเรียน: ${uniqueRecords.length} คน`,
        ...names
    ].join('\n');
};

const getGroupNote = (records: EscapeRecord[]) => {
    const dates = Array.from(new Set(records.map((record) => formatDateThai(record.date)).filter((date) => date !== '-')));
    return dates.length > 0 ? dates.join(', ') : '-';
};

const getClassicSelectStyles = (isDarkMode: boolean) => ({
    control: (base: any) => ({
        ...base,
        minHeight: 32,
        borderRadius: 4,
        backgroundColor: isDarkMode ? '#111827' : '#fff',
        borderColor: isDarkMode ? '#475569' : '#d9dee3',
        boxShadow: 'none',
        fontSize: 13,
        color: isDarkMode ? '#e5e7eb' : '#111827',
        '&:hover': { borderColor: isDarkMode ? '#64748b' : '#b9c2cc' }
    }),
    valueContainer: (base: any) => ({ ...base, padding: '0 8px' }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base: any) => ({ ...base, padding: 6, color: isDarkMode ? '#94a3b8' : '#64748b' }),
    menu: (base: any) => ({
        ...base,
        zIndex: 50,
        fontSize: 13,
        backgroundColor: isDarkMode ? '#111827' : '#fff',
        border: isDarkMode ? '1px solid #334155' : '1px solid #d9dee3'
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected ? '#3182ce' : state.isFocused ? (isDarkMode ? '#1e293b' : '#edf2f7') : 'transparent',
        color: state.isSelected ? '#fff' : isDarkMode ? '#e5e7eb' : '#1f2937',
        cursor: 'pointer'
    }),
    singleValue: (base: any) => ({
        ...base,
        color: isDarkMode ? '#e5e7eb' : '#1f2937'
    }),
    input: (base: any) => ({
        ...base,
        color: isDarkMode ? '#e5e7eb' : '#1f2937'
    }),
    placeholder: (base: any) => ({
        ...base,
        color: isDarkMode ? '#94a3b8' : '#64748b'
    })
});

const pdfStyles = StyleSheet.create({
    page: {
        paddingTop: 46,
        paddingRight: 48,
        paddingBottom: 44,
        paddingLeft: 48,
        fontFamily: 'TH Sarabun PSK',
        fontSize: 12,
        color: '#000'
    },
    header: {
        minHeight: 116,
        position: 'relative',
        alignItems: 'center',
        marginBottom: 6
    },
    logo: {
        position: 'absolute',
        left: 26,
        top: 4,
        width: 62,
        height: 62,
        objectFit: 'contain'
    },
    schoolTitle: {
        marginTop: 8,
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center'
    },
    reportTitle: {
        marginTop: 4,
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center'
    },
    reportMeta: {
        marginTop: 3,
        fontSize: 13,
        textAlign: 'center'
    },
    subjectLine: {
        marginTop: 6,
        fontSize: 13,
        textAlign: 'center'
    },
    teacherLine: {
        marginTop: 6,
        fontSize: 13,
        width: '100%',
        paddingLeft: 116
    },
    table: {
        width: '100%',
        borderTopWidth: 0.8,
        borderLeftWidth: 0.8,
        borderColor: '#000'
    },
    row: {
        flexDirection: 'row',
        minHeight: 24
    },
    headerRow: {
        minHeight: 26
    },
    cell: {
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        paddingHorizontal: 5,
        paddingVertical: 3,
        justifyContent: 'center'
    },
    headerText: {
        fontSize: 12,
        fontWeight: 'bold',
        textAlign: 'center'
    },
    bodyText: {
        fontSize: 11.5,
        lineHeight: 1.25
    },
    bodyTextCenter: {
        fontSize: 11.5,
        textAlign: 'center'
    },
    subjectText: {
        fontSize: 11.5,
        lineHeight: 1.2
    },
    studentInfoText: {
        fontSize: 11,
        lineHeight: 1.18
    },
    colIndex: { width: '5%' },
    colSubject: { width: '25%' },
    colPeriod: { width: '8%' },
    colStudents: { width: '34%' },
    colTeacher: { width: '15%' },
    colNote: { width: '13%' },
    summaryRow: {
        flexDirection: 'row',
        minHeight: 24
    },
    summaryCell: {
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        paddingHorizontal: 6,
        paddingVertical: 3,
        justifyContent: 'center',
        fontWeight: 'bold'
    },
    pageNumber: {
        position: 'absolute',
        right: 48,
        bottom: 26,
        fontSize: 11
    }
});

const EscapeSummaryPdfDocument = ({
    groups,
    schoolName,
    logoUrl,
    academicYear,
    semester,
    selectedDate,
}: {
    groups: ReportGroup[];
    schoolName: string;
    logoUrl?: string;
    academicYear: string;
    semester: string;
    selectedDate: string;
}) => {
    const logoSrc = logoUrl || '/pwa-512x512.png';
    const total = new Set(groups.flatMap((group) => group.records.map(getStudentKey).filter(Boolean))).size;

    return (
        <Document>
            <Page size="A4" style={pdfStyles.page}>
                <View style={pdfStyles.header}>
                    <Image src={logoSrc} style={pdfStyles.logo} />
                    <Text style={pdfStyles.schoolTitle}>{schoolName}</Text>
                    <Text style={pdfStyles.reportTitle}>รายงานสรุปยอดรวมนักเรียนที่หนีเรียนตามรายวิชา</Text>
                    <Text style={pdfStyles.reportMeta}>ปีการศึกษา {academicYear} ภาคเรียนที่ {semester} วันที่ {formatDateThai(selectedDate)}</Text>
                    <Text style={pdfStyles.subjectLine}>วิชา ....................................................................................</Text>
                    <Text style={pdfStyles.teacherLine}>ครูผู้สอน / ผู้ตรวจสอบ : ........................................................</Text>
                </View>

                <View style={pdfStyles.table}>
                    <View style={[pdfStyles.row, pdfStyles.headerRow]} fixed>
                        <View style={[pdfStyles.cell, pdfStyles.colIndex]}><Text style={pdfStyles.headerText}>#</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colSubject]}><Text style={pdfStyles.headerText}>ห้องเรียน/รายวิชา</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colPeriod]}><Text style={pdfStyles.headerText}>คาบที่</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colStudents]}><Text style={pdfStyles.headerText}>ข้อมูลนักเรียน</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colTeacher]}><Text style={pdfStyles.headerText}>ครูผู้สอน</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colNote]}><Text style={pdfStyles.headerText}>หมายเหตุ</Text></View>
                    </View>

                    {groups.length === 0 ? (
                        <View style={pdfStyles.row}>
                            <View style={[pdfStyles.cell, { width: '100%' }]}>
                                <Text style={pdfStyles.bodyTextCenter}>ไม่พบข้อมูลการหนีเรียน</Text>
                            </View>
                        </View>
                    ) : (
                        groups.map((group, index) => (
                            <View key={group.key} style={pdfStyles.row} wrap={false}>
                                <View style={[pdfStyles.cell, pdfStyles.colIndex]}><Text style={pdfStyles.bodyTextCenter}>{index + 1}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colSubject]}>
                                    <Text style={pdfStyles.subjectText}>{getFullClassLabel(group.className)}</Text>
                                    <Text style={pdfStyles.subjectText}>{group.subjectLabel || '-'}</Text>
                                </View>
                                <View style={[pdfStyles.cell, pdfStyles.colPeriod]}><Text style={pdfStyles.bodyTextCenter}>{group.periods}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colStudents]}><Text style={pdfStyles.studentInfoText}>{getStudentListText(group.records)}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colTeacher]}><Text style={pdfStyles.bodyText}>{getTeacherLabel(group.records)}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colNote]}><Text style={pdfStyles.bodyTextCenter}>{getGroupNote(group.records)}</Text></View>
                            </View>
                        ))
                    )}

                    <View style={pdfStyles.summaryRow} wrap={false}>
                        <View style={[pdfStyles.summaryCell, { width: '38%' }]}><Text>รวม</Text></View>
                        <View style={[pdfStyles.summaryCell, { width: '62%' }]}>
                            <Text>จำนวนนักเรียนที่หนีเรียนรวม {total} คน จาก {groups.length} ห้องเรียน/รายวิชา</Text>
                        </View>
                    </View>
                </View>

                <Text
                    fixed
                    style={pdfStyles.pageNumber}
                    render={({ pageNumber, totalPages }) => `หน้าที่ ${pageNumber} จาก ${totalPages} หน้า`}
                />
            </Page>
        </Document>
    );
};

const EscapeSummaryPage: React.FC = () => {
    const { user: currentUser } = usePermissions();
    const schoolId = (currentUser as any)?.schoolId;
    const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
    const schoolName = schoolSettings.schoolName || (currentUser as any)?.schoolName || '';
    const schoolDisplayCode = getSchoolDisplayCode(schoolSettings, currentUser, schoolId);
    const schoolDisplayName = schoolName || 'โรงเรียน';
    const schoolSelectLabel = [schoolDisplayCode, schoolName].filter(Boolean).join('-') || schoolDisplayName;
    const reduxAcademicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const calendarTerms = useSelector((state: RootState) => state.calendar.terms);

    const [loading, setLoading] = useState(false);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
    const [escapeRecords, setEscapeRecords] = useState<EscapeRecord[]>([]);
    const [academicYear, setAcademicYear] = useState(() => reduxAcademicYear);
    const [semester, setSemester] = useState('1');
    const [selectedDate, setSelectedDate] = useState(() => sessionStorage.getItem('escape_report_date') || toInputDate(new Date()));
    const [selectedSchool, setSelectedSchool] = useState<any>(null);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const selectStyles = useMemo(() => getClassicSelectStyles(isDarkMode), [isDarkMode]);

    useEffect(() => {
        sessionStorage.setItem('escape_report_date', selectedDate);
    }, [selectedDate]);

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDarkMode(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!schoolId) return;

        let isMounted = true;
        getCurrentAcademicYear(db, schoolId).then((calendarInfo) => {
            if (!isMounted) return;
            setAcademicYear(calendarInfo.academicYear || reduxAcademicYear);
            setSemester(calendarInfo.currentTerm || '1');
        });

        return () => {
            isMounted = false;
        };
    }, [schoolId, reduxAcademicYear]);

    const currentYearTermOptions = useMemo(() => {
        const termIds = calendarTerms
            .map((term) => term.id === 'term1' ? '1' : term.id === 'term2' ? '2' : String(term.id).replace(/\D/g, ''))
            .filter((termId): termId is string => termId === '1' || termId === '2');
        const uniqueTermIds = Array.from(new Set(termIds.length > 0 ? termIds : ['1', '2']));

        return uniqueTermIds.map((termId) => ({
            value: `${termId}/${academicYear}`,
            label: `${schoolDisplayName}-${termId}/${academicYear}`
        }));
    }, [academicYear, calendarTerms, schoolDisplayName]);

    useEffect(() => {
        if (schoolId) {
            setSelectedSchool({
                value: schoolId,
                label: schoolSelectLabel
            });
        }
    }, [schoolId, schoolSelectLabel]);

    const fetchEscapeData = async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            // สแกนเฉพาะ record สถานะ 'escape' ของปี/ภาคเรียนที่เลือกผ่าน collectionGroup query
            // (แทนการโหลดนักเรียนทั้งโรงเรียน + ประวัติเช็คชื่อทุกวันทุกปีของทุกคนมาแล้วค่อยกรองฝั่ง client)
            const escapeQuery = query(
                collectionGroup(db, 'ClassroomAttendance'),
                where('schoolId', '==', schoolId),
                where('status', '==', 'escape'),
                where('academicYear', '==', academicYear),
                where('semester', '==', semester)
            );
            const attendanceSnapshot = await getDocs(escapeQuery);
            const rawRecords = attendanceSnapshot.docs.map((attendanceDoc) => ({
                studentDocId: attendanceDoc.ref.parent.parent?.id || '',
                data: attendanceDoc.data() as EscapeRecord,
            }));

            // ดึงข้อมูลนักเรียนเฉพาะคนที่มี record หนีเรียนจริง (ไม่ใช่ทั้งโรงเรียน) มาเสริมชื่อ/เลขที่
            const studentIds = Array.from(new Set(rawRecords.map((r) => r.studentDocId).filter(Boolean)));
            const studentDataMap = new Map<string, any>();
            for (const idChunk of chunkArray(studentIds, 30)) {
                if (idChunk.length === 0) continue;
                const studentsSnapshot = await getDocs(query(
                    collection(db, 'school-settings', schoolId, 'students'),
                    where(documentId(), 'in', idChunk)
                ));
                studentsSnapshot.forEach((studentDoc) => {
                    studentDataMap.set(studentDoc.id, studentDoc.data());
                });
            }

            const records: EscapeRecord[] = rawRecords.map(({ studentDocId, data }) => {
                const studentData = studentDataMap.get(studentDocId) || {};
                const displayStudentCode = getDisplayStudentCode(studentData, data, studentDocId);
                return {
                    ...data,
                    studentId: displayStudentCode,
                    studentName: data.studentName || `${studentData.title || studentData.prefix || ''}${studentData.firstName || ''} ${studentData.lastName || ''}`.trim(),
                    studentNumber: data.studentNumber || studentData.studentNumber || studentData.number || studentData.no || studentData['เลขที่'] || '',
                };
            });

            setEscapeRecords(records);
            setExpandedRows({});
        } catch (error) {
            console.error('Error fetching escape records:', error);
            Swal.fire('ดึงข้อมูลล้มเหลว', 'ไม่สามารถดึงข้อมูลรายงานการหนีเรียนได้', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEscapeData();
    }, [schoolId, academicYear, semester]);

    const filteredRecords = useMemo(() => {
        return escapeRecords.filter((record) => {
            if (String(record.academicYear || '') !== String(academicYear)) return false;
            if (String(record.semester || '') !== String(semester)) return false;
            return isSameInputDate(record.date, selectedDate);
        });
    }, [escapeRecords, academicYear, semester, selectedDate]);

    const reportGroups = useMemo<ReportGroup[]>(() => {
        const map = new Map<string, EscapeRecord[]>();

        filteredRecords.forEach((record) => {
            const classLabel = getClassLabel(record);
            const subjectLabel = `${record.subjectCode || '-'} ${record.subjectName || ''}`.trim();
            const key = `${classLabel}__${subjectLabel}`;
            map.set(key, [...(map.get(key) || []), record]);
        });

        return Array.from(map.entries())
            .map(([key, records]) => {
                const first = records[0];
                const periods = Array.from(new Set(records.map((record) => record.period).filter((period) => period !== undefined && period !== null)))
                    .sort((a, b) => Number(a) - Number(b))
                    .join(', ');

                return {
                    key,
                    className: getClassLabel(first),
                    subjectLabel: `${first.subjectCode || '-'} ${first.subjectName || ''}`.trim(),
                    periods: periods || '-',
                    records: records.sort((a, b) => String(a.studentNumber || '').localeCompare(String(b.studentNumber || ''), 'th', { numeric: true })),
                    uniqueStudentCount: new Set(records.map(getStudentKey).filter(Boolean)).size
                };
            })
            .sort((a, b) => {
                const classCompare = a.className.localeCompare(b.className, 'th', { numeric: true });
                if (classCompare !== 0) return classCompare;
                return a.subjectLabel.localeCompare(b.subjectLabel, 'th', { numeric: true });
            });
    }, [filteredRecords]);

    const totalStudents = useMemo(() => new Set(filteredRecords.map(getStudentKey).filter(Boolean)).size, [filteredRecords]);

    const toggleRow = (key: string) => {
        setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const buildEscapeSummaryPdfDocument = () => (
        <EscapeSummaryPdfDocument
            groups={reportGroups}
            schoolName={schoolDisplayName}
            logoUrl={schoolSettings.logoUrl}
            academicYear={academicYear}
            semester={semester}
            selectedDate={selectedDate}
        />
    );

    const openPdfPreview = () => {
        if (reportGroups.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลสำหรับสร้างรายงาน PDF', 'info');
            return;
        }
        setShowPdfPreview(true);
    };

    const handleExportPdf = async () => {
        setPdfGenerating(true);
        try {
            const blob = await pdf(buildEscapeSummaryPdfDocument()).toBlob();
            saveAs(blob, `รายงานสรุปยอดรวมนักเรียนที่หนีเรียน_${academicYear}_${semester}_${selectedDate}.pdf`);
        } catch (error) {
            console.error('Error exporting escape summary PDF:', error);
            Swal.fire('สร้าง PDF ไม่สำเร็จ', 'ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง', 'error');
        } finally {
            setPdfGenerating(false);
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-[#eef0f4] px-2 py-4 text-slate-900 transition-colors dark:bg-[#0f1117] dark:text-slate-100 print:bg-white">
                <div className="mx-auto max-w-[1080px]">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300 print:hidden">
                        <div className="space-y-1 text-left">
                            <div className="flex items-center gap-3">
                                <BackButton to="/academic/hub/registration" />
                                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
                                    <Search className="text-indigo-600 dark:text-indigo-400" size={24} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                        สรุปยอดการหนีเรียน
                                    </h1>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold pt-0.5">
                                        รายงานสรุปยอดรวมนักเรียนที่หนีเรียนตามรายวิชา
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 self-start md:self-center">
                            <button
                                type="button"
                                onClick={fetchEscapeData}
                                disabled={loading}
                                title="รีเฟรชข้อมูล"
                                className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/80 shadow-sm transition disabled:opacity-60"
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            </button>
                            <button
                                type="button"
                                onClick={openPdfPreview}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold shadow-sm transition disabled:opacity-60"
                            >
                                <Printer size={16} />
                                สร้างรายงาน
                            </button>
                        </div>
                    </div>

                    <div className="rounded-sm border border-[#d6dbe0] bg-white shadow-sm transition-colors dark:border-slate-700 dark:bg-[#171922]">

                    <div className="grid grid-cols-1 gap-x-12 gap-y-3 px-7 py-4 md:grid-cols-2 print:hidden">
                        <label className="block">
                            <span className="mb-1 block text-[13px] font-semibold">โรงเรียน</span>
                            <Select
                                value={selectedSchool}
                                onChange={setSelectedSchool}
                                options={selectedSchool ? [selectedSchool] : []}
                                styles={selectStyles}
                                isSearchable={false}
                                placeholder="กำลังโหลดข้อมูลโรงเรียน..."
                            />
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
                                {currentYearTermOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block md:col-span-2">
                            <span className="mb-1 block text-[13px] font-semibold">วันที่ต้องการค้นหา</span>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(event) => setSelectedDate(event.target.value)}
                                    className="h-[31px] w-full rounded border border-[#cfd6dd] bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 sm:max-w-[840px] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                />
                                <button
                                    type="button"
                                    onClick={() => setExpandedRows({})}
                                    className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded bg-[#3182ce] px-4 text-[12px] font-semibold text-white hover:bg-[#2b6cb0] sm:h-[42px]"
                                >
                                    <Search size={14} />
                                    ค้นหารายการ
                                </button>
                            </div>
                            <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">วันที่เลือก: {formatDateThai(selectedDate)}</div>
                        </label>

                    </div>

                    <div className="px-3 pb-5">
                        <div className="mb-2 hidden text-center print:block">
                            <div className="text-base font-semibold">รายงานสรุปยอดรวมนักเรียนที่หนีเรียนตามรายวิชา</div>
                            <div className="text-sm">{schoolName || selectedSchool?.label || ''} ภาคเรียนที่ {semester}/{academicYear} วันที่ {formatDateThai(selectedDate)}</div>
                        </div>

                        <div className="mb-2 flex items-center justify-between text-[12px] text-slate-600 dark:text-slate-400">
                            <span>พบนักเรียนที่หนีเรียนรวม {totalStudents} คน จากรายการทั้งหมด {filteredRecords.length} รายการ</span>
                            {loading && <span className="inline-flex items-center gap-1 text-sky-600"><Loader2 size={13} className="animate-spin" /> กำลังโหลดข้อมูล...</span>}
                        </div>

                        <div className="overflow-x-auto border border-[#d6dbe0] dark:border-slate-700">
                            <table className="w-full min-w-[1080px] border-collapse text-[12px]">
                                <thead>
                                    <tr className="bg-[#e9eef2] text-left text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                                        <th className="w-[70px] border-r border-[#d6dbe0] px-3 py-3 text-center font-semibold dark:border-slate-700">#</th>
                                        <th className="w-[30%] border-r border-[#d6dbe0] px-3 py-3 font-semibold dark:border-slate-700">ห้องเรียน/รายวิชา</th>
                                        <th className="w-[110px] border-r border-[#d6dbe0] px-3 py-3 font-semibold dark:border-slate-700">คาบที่</th>
                                        <th className="w-[31%] border-r border-[#d6dbe0] px-3 py-3 font-semibold dark:border-slate-700">ข้อมูลนักเรียน</th>
                                        <th className="w-[16%] border-r border-[#d6dbe0] px-3 py-3 font-semibold dark:border-slate-700">ครูผู้สอน</th>
                                        <th className="w-[13%] px-3 py-3 font-semibold">หมายเหตุ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(6)].map((_, i) => (
                                            <tr key={`skeleton-${i}`}>
                                                <td className="border-r border-[#d6dbe0] px-3 py-3 dark:border-slate-700"><div className="h-3.5 w-6 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="border-r border-[#d6dbe0] px-3 py-3 dark:border-slate-700"><div className="h-3.5 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="border-r border-[#d6dbe0] px-3 py-3 dark:border-slate-700"><div className="h-3.5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="border-r border-[#d6dbe0] px-3 py-3 dark:border-slate-700"><div className="h-3.5 w-40 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="border-r border-[#d6dbe0] px-3 py-3 dark:border-slate-700"><div className="h-3.5 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                                <td className="px-3 py-3"><div className="h-3.5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                                            </tr>
                                        ))
                                    ) : reportGroups.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-12 text-center text-[13px] text-slate-600 dark:text-slate-400">
                                                ไม่พบข้อมูลการหนีเรียน
                                            </td>
                                        </tr>
                                    ) : (
                                        reportGroups.map((group, index) => {
                                            const isOpen = expandedRows[group.key] ?? index < 2;
                                            return (
                                                <React.Fragment key={group.key}>
                                                    <tr className="border-t border-[#d6dbe0] bg-white align-top hover:bg-slate-50 dark:border-slate-700 dark:bg-[#171922] dark:hover:bg-slate-800/60">
                                                        <td className="border-r border-[#d6dbe0] px-2 py-3 text-center dark:border-slate-700">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <span className="min-w-5 text-[13px] font-semibold text-slate-800 dark:text-slate-100">{index + 1}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleRow(group.key)}
                                                                    className="inline-flex h-5 w-5 items-center justify-center text-sky-500 hover:text-sky-700 print:hidden"
                                                                    title={isOpen ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด'}
                                                                >
                                                                    {isOpen ? <Minus size={17} strokeWidth={3} /> : <Plus size={17} strokeWidth={3} />}
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="border-r border-[#d6dbe0] px-3 py-3 font-medium dark:border-slate-700">
                                                            <div>{getFullClassLabel(group.className)}</div>
                                                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                                {group.subjectLabel || '-'}
                                                            </div>
                                                        </td>
                                                        <td className="border-r border-[#d6dbe0] px-3 py-3 text-center dark:border-slate-700">{group.periods}</td>
                                                        <td className="border-r border-[#d6dbe0] px-3 py-3 font-medium dark:border-slate-700">
                                                            <div>จำนวนนักเรียนที่หนีเรียน: {group.uniqueStudentCount} คน</div>
                                                            <div className="mt-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">กด + เพื่อดูรายชื่อนักเรียน</div>
                                                        </td>
                                                        <td className="border-r border-[#d6dbe0] px-3 py-3 dark:border-slate-700">{getTeacherLabel(group.records)}</td>
                                                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{getGroupNote(group.records)}</td>
                                                    </tr>
                                                    {isOpen && (
                                                        <tr className="border-t border-[#d6dbe0] bg-white dark:border-slate-700 dark:bg-[#171922]">
                                                            <td className="border-r border-[#d6dbe0] dark:border-slate-700" />
                                                            <td colSpan={5} className="px-3 py-0">
                                                                {group.records.length === 0 ? (
                                                                    <div className="py-3 text-center text-slate-600 dark:text-slate-400">ไม่พบข้อมูลการหนีเรียน</div>
                                                                ) : (
                                                                    <table className="w-full border-collapse text-[12px]">
                                                                        <tbody>
                                                                            {group.records.map((record, studentIndex) => (
                                                                                <tr key={`${group.key}-${record.studentId}-${record.period}-${studentIndex}`} className="border-b border-[#edf0f2] last:border-b-0 dark:border-slate-700">
                                                                                    <td className="w-[70px] py-2 text-slate-500 dark:text-slate-400">เลขที่ {record.studentNumber || '-'}</td>
                                                                                    <td className="py-2 font-medium">{record.studentName || '-'}</td>
                                                                                    <td className="w-[140px] py-2 text-slate-600 dark:text-slate-300">รหัส {record.studentId || '-'}</td>
                                                                                    <td className="w-[90px] py-2 text-slate-600 dark:text-slate-300">คาบ {record.period ?? '-'}</td>
                                                                                    <td className="w-[160px] py-2 text-slate-500 dark:text-slate-400">{record.checkedByName || record.checkedBy || record.teacherName || '-'}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
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

            {showPdfPreview && (
                <div
                    className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowPdfPreview(false)}
                >
                    <div
                        className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                            <h2 className="text-base font-bold text-gray-900 dark:text-white">
                                ตัวอย่างเอกสาร — สรุปยอดการหนีเรียน
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleExportPdf}
                                    disabled={pdfGenerating}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {pdfGenerating ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                                    {pdfGenerating ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowPdfPreview(false)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                                    title="ปิด"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-gray-900">
                            <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                                {buildEscapeSummaryPdfDocument()}
                            </PDFViewer>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

export default EscapeSummaryPage;
