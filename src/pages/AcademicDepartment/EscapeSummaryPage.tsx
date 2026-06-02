import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Loader2, Minus, Plus, Printer, RefreshCw, Search } from 'lucide-react';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
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

interface StudentProfile {
    id: string;
    studentCode: string;
    studentName: string;
    studentNumber: string;
    classLabel: string;
}

interface PdfSubjectGroup {
    key: string;
    subjectText: string;
    records: EscapeRecord[];
}

interface PdfClassSection {
    classLabel: string;
    fullClassLabel: string;
    escapedCount: number;
    subjectGroups: PdfSubjectGroup[];
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

const getStudentClassLabel = (studentData: any) => {
    const level = String(
        studentData?.classLevel ||
        studentData?.level ||
        studentData?.grade ||
        studentData?.className ||
        ''
    ).trim();
    const room = String(
        studentData?.roomNumber ||
        studentData?.room ||
        studentData?.classRoom ||
        ''
    ).trim();

    if (!level) return 'ไม่ระบุห้อง';
    if (!room || level.includes('/')) return level;
    return `${level}/${room}`;
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

const getSubjectGroupKey = (record: EscapeRecord) => {
    return [
        record.subjectCode || '',
        record.subjectName || '',
        record.teacherName || record.checkedByName || '',
        record.period ?? ''
    ].join('__');
};

const getPdfSubjectText = (records: EscapeRecord[]) => {
    const first = records[0] || {};
    const subjectName = first.subjectName || first.subjectCode || '-';
    const teacherName = first.teacherName || first.checkedByName || first.checkedBy || '-';
    const periods = Array.from(new Set(records.map((record) => record.period).filter((period) => period !== undefined && period !== null)))
        .sort((a, b) => Number(a) - Number(b))
        .join(', ');
    const studentCount = uniqueRecordsByStudent(records).length;
    return `${subjectName} / ครูผู้สอน: ${teacherName} (คาบที่ ${periods || '-'}) - จำนวนนักเรียนที่หนีเรียน: ${studentCount} คน`;
};

const classSortRank = (classLabel: string) => {
    const [level, room] = String(classLabel || '').split('/');
    const levelOrder = ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
    const levelRank = levelOrder.indexOf(level);
    const roomRank = Number(room || 0);
    return `${String(levelRank >= 0 ? levelRank : 999).padStart(3, '0')}-${String(Number.isFinite(roomRank) ? roomRank : 999).padStart(3, '0')}-${classLabel}`;
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
        paddingTop: 42,
        paddingRight: 56,
        paddingBottom: 44,
        paddingLeft: 56,
        fontFamily: 'TH Sarabun PSK',
        fontSize: 13,
        color: '#000'
    },
    topLine: {
        position: 'absolute',
        top: 34,
        left: 56,
        right: 56,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 0.7,
        borderBottomColor: '#777',
        paddingBottom: 3,
        fontSize: 12
    },
    firstHeader: {
        marginTop: 16,
        minHeight: 82,
        marginBottom: 10,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
    },
    logo: {
        position: 'absolute',
        left: 8,
        top: 4,
        width: 54,
        height: 54,
        objectFit: 'contain'
    },
    title: {
        fontSize: 17,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 2
    },
    subTitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 1
    },
    reportTable: {
        width: '100%',
        borderLeftWidth: 0.8,
        borderTopWidth: 0.8,
        borderColor: '#000'
    },
    classHeader: {
        minHeight: 20,
        justifyContent: 'center',
        paddingHorizontal: 8,
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        backgroundColor: '#f2f2f2'
    },
    classHeaderText: {
        fontSize: 13,
        fontWeight: 'bold'
    },
    noDataRow: {
        minHeight: 21,
        justifyContent: 'center',
        alignItems: 'center',
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000'
    },
    noDataText: {
        fontSize: 13
    },
    subjectRow: {
        minHeight: 21,
        justifyContent: 'center',
        paddingHorizontal: 18,
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000'
    },
    subjectText: {
        fontSize: 13
    },
    studentTable: {
        marginHorizontal: 6,
        marginVertical: 8,
        borderTopWidth: 0.8,
        borderLeftWidth: 0.8,
        borderColor: '#000'
    },
    studentRow: {
        flexDirection: 'row',
        minHeight: 20
    },
    studentHeaderRow: {
        flexDirection: 'row',
        minHeight: 22
    },
    cell: {
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        paddingHorizontal: 6,
        justifyContent: 'center'
    },
    cellCenter: {
        textAlign: 'center'
    },
    headerCellText: {
        fontSize: 13,
        fontWeight: 'bold',
        textAlign: 'center'
    },
    bodyCellText: {
        fontSize: 13
    },
    colCode: { width: '11%' },
    colName: { width: '58%' },
    colDate: { width: '16%' },
    colStatus: { width: '15%' },
    totalRow: {
        flexDirection: 'row',
        minHeight: 21,
        backgroundColor: '#e7f4ff'
    },
    totalLabelCell: {
        width: '13%',
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        justifyContent: 'center',
        paddingHorizontal: 8
    },
    totalValueCell: {
        flex: 1,
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        justifyContent: 'center',
        paddingHorizontal: 8
    },
    footerBlock: {
        marginTop: 28
    },
    proposeLine: {
        borderTopWidth: 0.7,
        borderTopColor: '#777',
        paddingTop: 6,
        textAlign: 'center',
        fontSize: 13,
        marginBottom: 48
    },
    signatureRow: {
        flexDirection: 'row',
        justifyContent: 'space-between'
    },
    signatureBox: {
        width: '31%',
        alignItems: 'center'
    },
    dotLine: {
        fontSize: 13,
        marginBottom: 5
    },
    signatureTitle: {
        fontSize: 13,
        marginTop: 2
    }
});

const EscapeSummaryPdfDocument = ({
    sections,
    schoolName,
    logoUrl,
    academicYear,
    semester,
    selectedDate,
    directorName,
    deputyName
}: {
    sections: PdfClassSection[];
    schoolName: string;
    logoUrl?: string;
    academicYear: string;
    semester: string;
    selectedDate: string;
    directorName?: string;
    deputyName?: string;
}) => {
    const logoSrc = logoUrl || '/school-logo.png';
    const total = new Set(
        sections.flatMap((section) =>
            section.subjectGroups.flatMap((subjectGroup) =>
                subjectGroup.records.map(getStudentKey).filter(Boolean)
            )
        )
    ).size;

    return (
        <Document>
            <Page size="A4" style={pdfStyles.page}>
                <View fixed style={pdfStyles.topLine}>
                    <Text>{schoolName}</Text>
                    <Text>รายงานสรุปยอดรวมนักเรียนที่หนีเรียนตามรายวิชา</Text>
                </View>

                <View style={pdfStyles.firstHeader}>
                    <Image src={logoSrc} style={pdfStyles.logo} />
                    <Text style={pdfStyles.title}>รายงานสรุปยอดรวมนักเรียนที่หนีเรียนตามรายวิชา</Text>
                    <Text style={pdfStyles.subTitle}>{schoolName} ปีการศึกษา {semester}/{academicYear}</Text>
                    <Text style={pdfStyles.subTitle}>ประจำวันที่ {formatDateThai(selectedDate)}</Text>
                </View>

                <View style={pdfStyles.reportTable}>
                    {sections.map((section) => (
                        <View key={section.classLabel}>
                            <View style={pdfStyles.classHeader}>
                                <Text style={pdfStyles.classHeaderText}>{section.fullClassLabel} (จำนวนนักเรียนที่หนีเรียน: {section.escapedCount} คน)</Text>
                            </View>

                            {section.subjectGroups.length === 0 ? (
                                <View style={pdfStyles.noDataRow}>
                                    <Text style={pdfStyles.noDataText}>ไม่พบข้อมูลการหนีเรียน</Text>
                                </View>
                            ) : (
                                section.subjectGroups.map((subjectGroup) => (
                                    <View key={subjectGroup.key}>
                                        <View style={pdfStyles.subjectRow}>
                                            <Text style={pdfStyles.subjectText}>{subjectGroup.subjectText}</Text>
                                        </View>
                                        <View style={pdfStyles.studentTable}>
                                            <View style={pdfStyles.studentHeaderRow}>
                                                <View style={[pdfStyles.cell, pdfStyles.colCode]}><Text style={pdfStyles.headerCellText}>รหัสนักเรียน</Text></View>
                                                <View style={[pdfStyles.cell, pdfStyles.colName]}><Text style={pdfStyles.headerCellText}>ชื่อ-นามสกุล</Text></View>
                                                <View style={[pdfStyles.cell, pdfStyles.colDate]}><Text style={pdfStyles.headerCellText}>วันที่</Text></View>
                                                <View style={[pdfStyles.cell, pdfStyles.colStatus]}><Text style={pdfStyles.headerCellText}>สถานะ</Text></View>
                                            </View>
                                            {subjectGroup.records.map((record) => (
                                                <View key={`${subjectGroup.key}-${record.studentId}-${record.studentName}`} style={pdfStyles.studentRow}>
                                                    <View style={[pdfStyles.cell, pdfStyles.colCode]}><Text style={pdfStyles.bodyCellText}>{record.studentId || '-'}</Text></View>
                                                    <View style={[pdfStyles.cell, pdfStyles.colName]}><Text style={pdfStyles.bodyCellText}>{record.studentName || '-'}</Text></View>
                                                    <View style={[pdfStyles.cell, pdfStyles.colDate]}><Text style={[pdfStyles.bodyCellText, pdfStyles.cellCenter]}>{formatDateThai(record.date)}</Text></View>
                                                    <View style={[pdfStyles.cell, pdfStyles.colStatus]}><Text style={[pdfStyles.bodyCellText, pdfStyles.cellCenter]}>หนีเรียน</Text></View>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    ))}
                    <View style={pdfStyles.totalRow} wrap={false}>
                        <View style={pdfStyles.totalLabelCell}><Text>รวมทั้งหมด:</Text></View>
                        <View style={pdfStyles.totalValueCell}><Text>{total} คน</Text></View>
                    </View>
                </View>

                <View style={pdfStyles.footerBlock} wrap={false}>
                    <Text style={pdfStyles.proposeLine}>เสนอ ผู้อำนวยการ{schoolName} เพื่อทราบ</Text>
                    <View style={pdfStyles.signatureRow}>
                        <View style={pdfStyles.signatureBox}>
                            <Text style={pdfStyles.dotLine}>........................................................</Text>
                            <Text>(........................................................)</Text>
                            <Text style={pdfStyles.signatureTitle}>ผู้รวบรวมข้อมูล</Text>
                        </View>
                        <View style={pdfStyles.signatureBox}>
                            <Text style={pdfStyles.dotLine}>........................................................</Text>
                            <Text>({deputyName || '........................................................'})</Text>
                            <Text style={pdfStyles.signatureTitle}>รองผู้อำนวยการกลุ่มบริหารงานบุคคลฯ</Text>
                        </View>
                        <View style={pdfStyles.signatureBox}>
                            <Text style={pdfStyles.dotLine}>........................................................</Text>
                            <Text>({directorName || '........................................................'})</Text>
                            <Text style={pdfStyles.signatureTitle}>ผู้อำนวยการโรงเรียน</Text>
                        </View>
                    </View>
                </View>
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
    const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
    const [escapeRecords, setEscapeRecords] = useState<EscapeRecord[]>([]);
    const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
    const [academicYear, setAcademicYear] = useState(() => reduxAcademicYear);
    const [semester, setSemester] = useState('1');
    const [selectedDate, setSelectedDate] = useState(() => sessionStorage.getItem('escape_report_date') || toInputDate(new Date()));
    const [selectedSchool, setSelectedSchool] = useState<any>(null);
    const [selectedGroupBy, setSelectedGroupBy] = useState<'class' | 'subject'>(() => (sessionStorage.getItem('escape_report_group_by') as 'class' | 'subject') || 'class');
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const selectStyles = useMemo(() => getClassicSelectStyles(isDarkMode), [isDarkMode]);

    useEffect(() => {
        sessionStorage.setItem('escape_report_date', selectedDate);
        sessionStorage.setItem('escape_report_group_by', selectedGroupBy);
    }, [selectedDate, selectedGroupBy]);

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
            const studentsSnapshot = await getDocs(collection(db, 'school-settings', schoolId, 'students'));
            const students = studentsSnapshot.docs.map((studentDoc) => ({
                id: studentDoc.id,
                data: studentDoc.data() as any
            }));
            setAllStudents(students.map((student) => ({
                id: student.id,
                studentCode: getDisplayStudentCode(student.data, {} as EscapeRecord, student.id),
                studentName: `${student.data?.title || student.data?.prefix || ''}${student.data?.firstName || ''} ${student.data?.lastName || ''}`.trim(),
                studentNumber: String(student.data?.studentNumber || student.data?.number || student.data?.no || student.data?.['เลขที่'] || '').trim(),
                classLabel: getStudentClassLabel(student.data)
            })));

            const records: EscapeRecord[] = [];
            for (const studentChunk of chunkArray(students, 20)) {
                const attendanceSnapshots = await Promise.all(
                    studentChunk.map((student) =>
                        getDocs(collection(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance'))
                            .then((snapshot) => ({ student, snapshot }))
                    )
                );

                attendanceSnapshots.forEach(({ student, snapshot }) => {
                    snapshot.docs.forEach((attendanceDoc) => {
                        const data = attendanceDoc.data() as EscapeRecord;
                        if (data.status !== 'escape') return;

                        const studentData = student.data;
                        const displayStudentCode = getDisplayStudentCode(studentData, data, student.id);
                        records.push({
                            ...data,
                            studentId: displayStudentCode,
                            studentName: data.studentName || `${studentData.title || studentData.prefix || ''}${studentData.firstName || ''} ${studentData.lastName || ''}`.trim(),
                            studentNumber: data.studentNumber || studentData.studentNumber || studentData.number || studentData.no || studentData['เลขที่'] || '',
                        });
                    });
                });
            }

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
    }, [schoolId]);

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
            const key = selectedGroupBy === 'class'
                ? `${classLabel}__${subjectLabel}`
                : `${subjectLabel}__${classLabel}`;
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
                const primaryA = selectedGroupBy === 'class' ? a.className : a.subjectLabel;
                const primaryB = selectedGroupBy === 'class' ? b.className : b.subjectLabel;
                return primaryA.localeCompare(primaryB, 'th', { numeric: true });
            });
    }, [filteredRecords, selectedGroupBy]);

    const totalStudents = useMemo(() => new Set(filteredRecords.map(getStudentKey).filter(Boolean)).size, [filteredRecords]);

    const pdfSections = useMemo<PdfClassSection[]>(() => {
        const classLabels = new Set<string>();
        allStudents.forEach((student) => {
            if (student.classLabel) classLabels.add(student.classLabel);
        });
        filteredRecords.forEach((record) => classLabels.add(getClassLabel(record)));

        return Array.from(classLabels)
            .sort((a, b) => classSortRank(a).localeCompare(classSortRank(b), 'th', { numeric: true }))
            .map((classLabel) => {
                const classRecords = filteredRecords.filter((record) => getClassLabel(record) === classLabel);
                const subjectMap = new Map<string, EscapeRecord[]>();
                classRecords.forEach((record) => {
                    const key = getSubjectGroupKey(record);
                    subjectMap.set(key, [...(subjectMap.get(key) || []), record]);
                });

                const subjectGroups = Array.from(subjectMap.entries())
                    .map(([key, records]) => {
                        const uniqueRecords = uniqueRecordsByStudent(records);
                        return {
                            key,
                            subjectText: getPdfSubjectText(records),
                            records: uniqueRecords
                        };
                    })
                    .sort((a, b) => a.subjectText.localeCompare(b.subjectText, 'th', { numeric: true }));

                return {
                    classLabel,
                    fullClassLabel: getFullClassLabel(classLabel),
                    escapedCount: new Set(classRecords.map(getStudentKey).filter(Boolean)).size,
                    subjectGroups
                };
            });
    }, [allStudents, filteredRecords]);

    const toggleRow = (key: string) => {
        setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleExportPdf = async () => {
        setPdfGenerating(true);
        try {
            const document = (
                <EscapeSummaryPdfDocument
                    sections={pdfSections}
                    schoolName={schoolDisplayName}
                    logoUrl={schoolSettings.logoUrl}
                    academicYear={academicYear}
                    semester={semester}
                    selectedDate={selectedDate}
                    directorName={`${schoolSettings.directorPrefix || ''}${schoolSettings.directorName || ''}`.trim()}
                    deputyName={`${schoolSettings.deputyPrefix || ''}${schoolSettings.deputyName || ''}`.trim()}
                />
            );
            const blob = await pdf(document).toBlob();
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
                    <div className="mb-3 flex items-center gap-4 print:hidden">
                        <BackButton to="/academic/hub/registration" />
                        <span className="font-medium text-gray-500 dark:text-gray-400">กลับไปหน้าบริหารงานวิชาการ</span>
                    </div>

                    <div className="rounded-sm border border-[#d6dbe0] bg-white shadow-sm transition-colors dark:border-slate-700 dark:bg-[#171922]">
                    <div className="flex items-center justify-between border-b border-[#d6dbe0] px-4 py-2.5 dark:border-slate-700">
                        <h1 className="text-[15px] font-medium text-slate-950 dark:text-slate-100">รายงานสรุปยอดรวมนักเรียนที่หนีเรียนตามรายวิชา</h1>
                        <div className="flex items-center gap-1.5 print:hidden">
                            <button
                                type="button"
                                onClick={fetchEscapeData}
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
                        </div>
                    </div>

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

                        <div className="md:col-span-2">
                            <div className="inline-flex overflow-hidden rounded border border-[#d9dee3] text-[12px] dark:border-slate-600">
                                <button
                                    type="button"
                                    onClick={() => setSelectedGroupBy('class')}
                                    className={`px-3 py-1.5 ${selectedGroupBy === 'class' ? 'bg-sky-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                                >
                                    จัดกลุ่มตามห้องเรียน
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedGroupBy('subject')}
                                    className={`border-l border-[#d9dee3] px-3 py-1.5 dark:border-slate-600 ${selectedGroupBy === 'subject' ? 'bg-sky-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                                >
                                    จัดกลุ่มตามรายวิชา
                                </button>
                            </div>
                        </div>
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
                            <table className="w-full min-w-[820px] border-collapse text-[12px]">
                                <thead>
                                    <tr className="bg-[#e9eef2] text-left text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                                        <th className="w-[72px] border-r border-[#d6dbe0] px-3 py-3 text-center font-semibold dark:border-slate-700">#</th>
                                        <th className="border-r border-[#d6dbe0] px-3 py-3 font-semibold dark:border-slate-700">ห้องเรียน/รายวิชา</th>
                                        <th className="w-[160px] border-r border-[#d6dbe0] px-3 py-3 font-semibold dark:border-slate-700">คาบที่</th>
                                        <th className="w-[48%] px-3 py-3 font-semibold">ข้อมูลนักเรียน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportGroups.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-3 py-12 text-center text-[13px] text-slate-600 dark:text-slate-400">
                                                {loading ? 'กำลังโหลดข้อมูล...' : 'ไม่พบข้อมูลการหนีเรียน'}
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
                                                            <div>{selectedGroupBy === 'class' ? group.className : group.subjectLabel}</div>
                                                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                                {selectedGroupBy === 'class' ? group.subjectLabel : group.className}
                                                            </div>
                                                        </td>
                                                        <td className="border-r border-[#d6dbe0] px-3 py-3 dark:border-slate-700">{group.periods}</td>
                                                        <td className="px-3 py-3 font-medium">จำนวนนักเรียนที่หนีเรียน: {group.uniqueStudentCount} คน</td>
                                                    </tr>
                                                    {isOpen && (
                                                        <tr className="border-t border-[#d6dbe0] bg-white dark:border-slate-700 dark:bg-[#171922]">
                                                            <td className="border-r border-[#d6dbe0] dark:border-slate-700" />
                                                            <td colSpan={3} className="px-3 py-0">
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
        </MainLayout>
    );
};

export default EscapeSummaryPage;
