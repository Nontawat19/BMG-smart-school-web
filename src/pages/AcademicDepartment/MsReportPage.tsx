import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import {
    collection,
    query,
    where,
    getDocs,
    collectionGroup,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp
} from 'firebase/firestore';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import {
    FileWarning,
    Users,
    BookOpen,
    Loader2,
    User,
    AlertCircle,
    Download,
    RefreshCw,
    Percent
} from 'lucide-react';
import BackButton from "@/components/Shared/BackButton";
import SkeletonLoader from '@/components/SkeletonLoader';
import Select from 'react-select';
import { CLASSES, CLASS_FULL_NAMES, getGroupPersonnel } from '@/utils/schoolUtils';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { getCurrentAcademicYear } from '@/utils/academicYearUtils';
import { classifyLeaveSubType } from '@/utils/periodSummaryUtils';

Font.register({
    family: 'TH Sarabun PSK',
    fonts: [
        { src: '/fonts/THSarabunNew.ttf' },
        { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' }
    ]
});

interface Course {
    id: string;
    code: string;
    title: string;
    credits?: number;
    hoursPerWeek?: number;
    semester?: string;
    isActive?: boolean;
}

interface AttendanceRecord {
    studentId: string;
    status: 'present' | 'absent' | 'late' | 'leave' | 'escape';
    date: any;
}

interface LeavePeriod {
    startDate: any;
    endDate: any;
    leaveType: string;
}

interface StudentStats {
    id: string;
    enrollId: string;
    studentCode: string;
    number: string;
    name: string;
    classLevel: string;
    room: string;
    late: number;
    sick: number;
    personal: number;
    absent: number;
    escape: number;
    total: number;
    percentage: number;
    evaluation: 'มส.' | 'ปกติ';
    manualEvaluation?: 'มส.' | 'ปกติ' | null;
}

const toDate = (value: any): Date | null => {
    if (!value) return null;
    const d = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const isDateWithinRange = (target: any, start: any, end: any) => {
    const t = toDate(target);
    const s = toDate(start);
    const e = toDate(end);
    if (!t || !s || !e) return false;
    const tt = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const ss = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
    const ee = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
    return tt >= ss && tt <= ee;
};

const chunkArray = <T,>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
};

const getTotalPeriods = (course?: Course | null) => {
    if (!course) return 40;
    if (course.credits !== undefined && course.credits !== null && course.credits !== 0) {
        return Math.round(Number(course.credits) * 40);
    }
    if (course.hoursPerWeek) return Math.round(Number(course.hoursPerWeek) * 20);
    return 40;
};

const getFullClassLabel = (classLevel: string, room: string) => {
    const fullLevel = CLASS_FULL_NAMES[classLevel] || CLASSES[classLevel] || classLevel || 'ไม่ระบุห้อง';
    return room ? `${fullLevel}/${room}` : fullLevel;
};

// ─── PDF Document ───────────────────────────────────────────────
const pdfStyles = StyleSheet.create({
    page: {
        paddingTop: 40,
        paddingRight: 40,
        paddingBottom: 46,
        paddingLeft: 40,
        fontFamily: 'TH Sarabun PSK',
        fontSize: 12,
        color: '#000'
    },
    header: {
        minHeight: 100,
        position: 'relative',
        alignItems: 'center',
        marginBottom: 6
    },
    logo: {
        position: 'absolute',
        left: 20,
        top: 2,
        width: 56,
        height: 56,
        objectFit: 'contain'
    },
    schoolTitle: { marginTop: 6, fontSize: 15, fontWeight: 'bold', textAlign: 'center' },
    reportTitle: { marginTop: 4, fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
    reportMeta: { marginTop: 3, fontSize: 12.5, textAlign: 'center' },
    subjectLine: { marginTop: 3, fontSize: 12.5, textAlign: 'center', fontWeight: 'bold' },
    table: {
        width: '100%',
        borderTopWidth: 0.8,
        borderLeftWidth: 0.8,
        borderColor: '#000',
        marginTop: 8
    },
    row: { flexDirection: 'row', minHeight: 20 },
    headerRow: { minHeight: 36, backgroundColor: '#f3f4f6' },
    cell: {
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        paddingHorizontal: 3,
        paddingVertical: 2,
        justifyContent: 'center'
    },
    headerText: { fontSize: 8.5, fontWeight: 'bold', textAlign: 'center', lineHeight: 1.25 },
    bodyTextCenter: { fontSize: 10.5, textAlign: 'center' },
    bodyTextLeft: { fontSize: 10.5, textAlign: 'left' },
    colIndex: { width: '5%' },
    colCode: { width: '10%' },
    colName: { width: '20%' },
    colLate: { width: '7%' },
    colSick: { width: '7%' },
    colPersonal: { width: '7%' },
    colAbsent: { width: '14%' },
    colEscape: { width: '9%' },
    colPercent: { width: '6%' },
    colEval: { width: '15%' },
    summaryRow: { flexDirection: 'row', minHeight: 22, backgroundColor: '#f9fafb' },
    summaryCell: {
        borderRightWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        paddingHorizontal: 4,
        paddingVertical: 3,
        justifyContent: 'center',
        fontWeight: 'bold'
    },
    msText: { color: '#b91c1c', fontWeight: 'bold' },
    signSection: { marginTop: 26, flexDirection: 'row', justifyContent: 'space-around' },
    signBlock: { width: 220, alignItems: 'center' },
    signRow: { flexDirection: 'row', alignItems: 'flex-end', width: '100%' },
    signPrefix: { fontSize: 11 },
    signDotsCol: { flex: 1 },
    signDotsLine: { borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'dotted', height: 12 },
    signName: { fontSize: 11, marginTop: 4, textAlign: 'center' },
    signRole: { fontSize: 11, marginTop: 2, textAlign: 'center' },
    pageNumber: { position: 'absolute', right: 40, bottom: 26, fontSize: 10 }
});

const MsReportPdfDocument: React.FC<{
    students: StudentStats[];
    schoolName: string;
    logoUrl?: string;
    academicYear: string;
    semester: string;
    classLabel: string;
    subjectLabel: string;
    signerName: string;
    academicHeadName: string;
    academicHeadRoleLabel: string;
}> = ({ students, schoolName, logoUrl, academicYear, semester, classLabel, subjectLabel, signerName, academicHeadName, academicHeadRoleLabel }) => {
    const logoSrc = logoUrl || '/pwa-512x512.png';
    const totals = students.reduce(
        (acc, s) => {
            acc.late += s.late;
            acc.sick += s.sick;
            acc.personal += s.personal;
            acc.absent += s.absent;
            acc.escape += s.escape;
            acc.percentSum += s.percentage;
            acc.msCount += s.evaluation === 'มส.' ? 1 : 0;
            return acc;
        },
        { late: 0, sick: 0, personal: 0, absent: 0, escape: 0, percentSum: 0, msCount: 0 }
    );
    const avgPercent = students.length > 0 ? Math.round((totals.percentSum / students.length) * 100) / 100 : 0;

    return (
        <Document>
            <Page size="A4" style={pdfStyles.page}>
                <View style={pdfStyles.header}>
                    <Image src={logoSrc} style={pdfStyles.logo} />
                    <Text style={pdfStyles.schoolTitle}>{schoolName}</Text>
                    <Text style={pdfStyles.reportTitle}>รายงานการสรุปการเช็คขาดคาบตามรายวิชาที่เลือกรายชั้นเรียน</Text>
                    <Text style={pdfStyles.reportMeta}>ปีการศึกษา {semester}/{academicYear}   ระดับชั้น {classLabel}</Text>
                    <Text style={pdfStyles.subjectLine}>รายวิชา {subjectLabel}</Text>
                </View>

                <View style={pdfStyles.table}>
                    <View style={[pdfStyles.row, pdfStyles.headerRow]} fixed>
                        <View style={[pdfStyles.cell, pdfStyles.colIndex]}><Text style={pdfStyles.headerText}>{'ลำดับ\nที่'}</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colCode]}><Text style={pdfStyles.headerText}>{'รหัส\nนักเรียน'}</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colName]}><Text style={pdfStyles.headerText}>ชื่อ-นามสกุล</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colLate]}><Text style={pdfStyles.headerText}>{'ยอดรวม\nสาย'}</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colSick]}><Text style={pdfStyles.headerText}>{'ยอดรวม\nลาป่วย'}</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colPersonal]}><Text style={pdfStyles.headerText}>{'ยอดรวม\nลากิจ'}</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colAbsent]}><Text style={pdfStyles.headerText}>{'ยอดรวม\nยังไม่บันทึก/ขาด'}</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colEscape]}><Text style={pdfStyles.headerText}>{'ยอดรวม\nหนีเรียน'}</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colPercent]}><Text style={pdfStyles.headerText}>ร้อยละ</Text></View>
                        <View style={[pdfStyles.cell, pdfStyles.colEval]}><Text style={pdfStyles.headerText}>{'ผลการ\nเข้าเรียน'}</Text></View>
                    </View>

                    {students.length === 0 ? (
                        <View style={pdfStyles.row}>
                            <View style={[pdfStyles.cell, { width: '100%' }]}>
                                <Text style={pdfStyles.bodyTextCenter}>ไม่พบข้อมูลนักเรียน</Text>
                            </View>
                        </View>
                    ) : (
                        students.map((s, index) => (
                            <View key={s.id} style={pdfStyles.row} wrap={false}>
                                <View style={[pdfStyles.cell, pdfStyles.colIndex]}><Text style={pdfStyles.bodyTextCenter}>{index + 1}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colCode]}><Text style={pdfStyles.bodyTextCenter}>{s.studentCode}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colName]}><Text style={pdfStyles.bodyTextLeft}>{s.name}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colLate]}><Text style={pdfStyles.bodyTextCenter}>{s.late || ''}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colSick]}><Text style={pdfStyles.bodyTextCenter}>{s.sick || ''}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colPersonal]}><Text style={pdfStyles.bodyTextCenter}>{s.personal || ''}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colAbsent]}><Text style={pdfStyles.bodyTextCenter}>{s.absent || ''}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colEscape]}><Text style={pdfStyles.bodyTextCenter}>{s.escape || ''}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colPercent]}><Text style={pdfStyles.bodyTextCenter}>{s.percentage}</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colEval]}>
                                    <Text style={s.evaluation === 'มส.' ? [pdfStyles.bodyTextCenter, pdfStyles.msText] : pdfStyles.bodyTextCenter}>
                                        {s.evaluation === 'มส.' ? 'มส.' : ''}
                                    </Text>
                                </View>
                            </View>
                        ))
                    )}

                    <View style={pdfStyles.summaryRow} wrap={false}>
                        <View style={[pdfStyles.summaryCell, { width: '35%' }]}><Text>รวม ({students.length} คน, มส. {totals.msCount} คน)</Text></View>
                        <View style={[pdfStyles.summaryCell, pdfStyles.colLate]}><Text>{totals.late || ''}</Text></View>
                        <View style={[pdfStyles.summaryCell, pdfStyles.colSick]}><Text>{totals.sick || ''}</Text></View>
                        <View style={[pdfStyles.summaryCell, pdfStyles.colPersonal]}><Text>{totals.personal || ''}</Text></View>
                        <View style={[pdfStyles.summaryCell, pdfStyles.colAbsent]}><Text>{totals.absent || ''}</Text></View>
                        <View style={[pdfStyles.summaryCell, pdfStyles.colEscape]}><Text>{totals.escape || ''}</Text></View>
                        <View style={[pdfStyles.summaryCell, pdfStyles.colPercent]}><Text>{avgPercent}</Text></View>
                        <View style={[pdfStyles.summaryCell, pdfStyles.colEval]}><Text>{totals.msCount}</Text></View>
                    </View>
                </View>

                <View style={pdfStyles.signSection}>
                    <View style={pdfStyles.signBlock}>
                        <View style={pdfStyles.signRow}>
                            <Text style={pdfStyles.signPrefix}>ลงชื่อ</Text>
                            <View style={pdfStyles.signDotsCol}><View style={pdfStyles.signDotsLine} /></View>
                            <Text style={pdfStyles.signPrefix}>ครูผู้สอน</Text>
                        </View>
                        <Text style={pdfStyles.signName}>({signerName || '.........................................'})</Text>
                        <Text style={pdfStyles.signRole}>ครูผู้สอนประจำวิชา</Text>
                    </View>
                    <View style={pdfStyles.signBlock}>
                        <View style={pdfStyles.signRow}>
                            <Text style={pdfStyles.signPrefix}>ลงชื่อ</Text>
                            <View style={pdfStyles.signDotsCol}><View style={pdfStyles.signDotsLine} /></View>
                            <Text style={pdfStyles.signPrefix}>ผู้รับรอง</Text>
                        </View>
                        <Text style={pdfStyles.signName}>({academicHeadName || '.........................................'})</Text>
                        <Text style={pdfStyles.signRole}>{academicHeadRoleLabel}</Text>
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

// ─── Page Component ───────────────────────────────────────────────
const SummaryCard = ({ title, value, unit, icon, color }: { title: string, value: string | number, unit?: string, icon: React.ReactNode, color: string }) => {
    const variants: Record<string, string> = {
        emerald: "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100/50 dark:border-emerald-500/20",
        blue: "text-blue-500 bg-blue-50 dark:bg-blue-500/10 border-blue-100/50 dark:border-blue-500/20",
        indigo: "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100/50 dark:border-indigo-500/20",
        rose: "text-rose-500 bg-rose-50 dark:bg-rose-500/10 border-rose-100/50 dark:border-rose-500/20",
    };

    return (
        <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md hover:-translate-y-0.5 group">
            <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl border ${variants[color] || variants.indigo} flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm`}>
                    {icon}
                </div>
                <div>
                    <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{title}</h3>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">{value}</span>
                        {unit && <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{unit}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MsReportPage: React.FC = () => {
    const { user: currentUser } = usePermissions();
    const schoolId = (currentUser as any)?.schoolId;
    const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
    const reduxAcademicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());

    const [loading, setLoading] = useState(false);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [academicYear, setAcademicYear] = useState<string>(() => sessionStorage.getItem('ms_year') || reduxAcademicYear);
    const [semester, setSemester] = useState<string>(() => sessionStorage.getItem('ms_semester') || '1');
    const [academicHeadName, setAcademicHeadName] = useState('');
    const [academicHeadRoleLabel, setAcademicHeadRoleLabel] = useState('หัวหน้างานทะเบียนและวัดผล');

    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<any>(() => {
        const saved = sessionStorage.getItem('ms_course');
        return saved ? JSON.parse(saved) : null;
    });
    const [selectedRoom, setSelectedRoom] = useState<any>(() => {
        const saved = sessionStorage.getItem('ms_room');
        return saved ? JSON.parse(saved) : { value: 'all', label: 'ทุกห้องเรียน' };
    });

    const [studentsInCourse, setStudentsInCourse] = useState<any[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
    const [leaveMap, setLeaveMap] = useState<Record<string, LeavePeriod[]>>({});
    const [assignedCourseIds, setAssignedCourseIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));

    useEffect(() => {
        if (academicYear) sessionStorage.setItem('ms_year', academicYear);
        if (semester) sessionStorage.setItem('ms_semester', semester);
        if (selectedCourse) sessionStorage.setItem('ms_course', JSON.stringify(selectedCourse));
        else sessionStorage.removeItem('ms_course');
        if (selectedRoom) sessionStorage.setItem('ms_room', JSON.stringify(selectedRoom));
    }, [academicYear, semester, selectedCourse, selectedRoom]);

    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setIsDarkMode(document.documentElement.classList.contains('dark'));
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!schoolId) return;
        let isMounted = true;
        getCurrentAcademicYear(db, schoolId).then((calendarInfo) => {
            if (!isMounted) return;
            if (!sessionStorage.getItem('ms_year')) setAcademicYear(calendarInfo.academicYear || reduxAcademicYear);
            if (!sessionStorage.getItem('ms_semester')) setSemester(calendarInfo.currentTerm || '1');
        });
        getDoc(doc(db, 'school-settings', schoolId)).then((snap) => {
            if (!isMounted || !snap.exists()) return;
            const data: any = snap.data();
            const academicPersonnel = getGroupPersonnel(data, 'academic', false, 'หัวหน้างานทะเบียนและวัดผล');
            setAcademicHeadName(academicPersonnel.name);
            setAcademicHeadRoleLabel(academicPersonnel.label);
        });
        return () => { isMounted = false; };
    }, [schoolId, reduxAcademicYear]);

    const selectStyles = useMemo(() => ({
        control: (base: any, state: any) => ({
            ...base,
            backgroundColor: isDarkMode ? '#2a2b2f' : '#f8fafc',
            borderColor: state.isFocused ? '#6366f1' : isDarkMode ? '#374151' : '#e2e8f0',
            borderRadius: '0.75rem',
            padding: '2px 4px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: 'none',
            color: isDarkMode ? '#fff' : '#1e293b',
            '&:hover': { borderColor: '#6366f1' },
        }),
        menu: (base: any) => ({
            ...base,
            backgroundColor: isDarkMode ? '#1a1b1e' : '#fff',
            borderRadius: '1rem',
            zIndex: 50,
            border: isDarkMode ? '1px solid #374151' : '1px solid #e2e8f0',
        }),
        option: (base: any, state: any) => ({
            ...base,
            backgroundColor: state.isSelected ? '#6366f1' : state.isFocused ? (isDarkMode ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)') : 'transparent',
            color: state.isSelected ? '#fff' : isDarkMode ? '#e2e8f0' : '#475569',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
        }),
        singleValue: (base: any) => ({ ...base, color: isDarkMode ? '#fff' : '#1e293b' }),
        dropdownIndicator: (base: any) => ({ ...base, color: isDarkMode ? '#4b5563' : '#94a3b8' })
    }), [isDarkMode]);

    const fetchCourses = async () => {
        if (!schoolId) return;
        try {
            const q = query(collection(db, 'school-settings', schoolId, 'courses'));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data(), isActive: (d.data() as any).isActive ?? true } as Course));
            setCourses(list.filter(c => c.isActive));
        } catch (err) {
            console.error('Error fetching courses:', err);
        }
    };

    useEffect(() => {
        fetchCourses();
    }, [schoolId]);

    // รายวิชาที่แสดงในดร็อปดาวน์ต้องตรงกับที่ลงทะเบียนไว้ในหน้า /academic/course-assignment
    // (มีการมอบหมายครู/ห้องเรียนจริงในปีการศึกษา/ภาคเรียนที่เลือก) ไม่ใช่ทุกวิชาที่ isActive
    useEffect(() => {
        if (!schoolId || !academicYear || !semester) {
            setAssignedCourseIds(new Set());
            return;
        }
        const assignmentRef = collection(db, 'school-settings', schoolId, 'course_assignments');
        const q = query(
            assignmentRef,
            where('academicYear', '==', academicYear),
            where('semester', '==', semester)
        );
        getDocs(q).then(snap => {
            const ids = new Set<string>();
            snap.docs.forEach(d => {
                const courseId = (d.data() as any).courseId;
                if (courseId) ids.add(String(courseId));
            });
            setAssignedCourseIds(ids);
        }).catch(err => {
            console.error('Error fetching course assignments:', err);
            setAssignedCourseIds(new Set());
        });
    }, [schoolId, academicYear, semester]);

    const courseOptions = useMemo(() => {
        const filtered = courses.filter(c => assignedCourseIds.has(c.id));
        const sorted = [...filtered].sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'th', { numeric: true }));
        const options = sorted.map(c => ({ value: c.code, label: `${c.code} - ${c.title}` }));

        if (options.length > 0 && !selectedCourse) setSelectedCourse(options[0]);
        else if (selectedCourse && options.length > 0) {
            const isStillValid = options.some(opt => opt.value === selectedCourse.value);
            if (!isStillValid) setSelectedCourse(options[0]);
        } else if (selectedCourse && options.length === 0) {
            setSelectedCourse(null);
        }
        return options;
    }, [courses, assignedCourseIds, selectedCourse]);

    const selectedCourseData = useMemo(
        () => courses.find(c => c.code === selectedCourse?.value) || null,
        [courses, selectedCourse]
    );
    const totalPeriods = useMemo(() => getTotalPeriods(selectedCourseData), [selectedCourseData]);

    const handleFetchData = async () => {
        if (!schoolId || !academicYear || !semester || !selectedCourse) return;
        setLoading(true);
        setError(null);
        try {
            const enrollRef = collection(db, 'school-settings', schoolId, 'enrollments');
            const enrollQ = query(
                enrollRef,
                where('courseCode', '==', selectedCourse.value),
                where('academicYear', '==', academicYear),
                where('semester', '==', semester)
            );
            const enrollSnap = await getDocs(enrollQ);

            const getNo = (data: any) => {
                const val = data.studentNumber ?? data.number ?? data.no ?? data.classNumber ?? data.class_number ?? data.sequence ?? data.rollNumber ?? data.index ?? data['เลขที่'] ?? data['เลขที่ในห้อง'] ?? '';
                const sVal = String(val).trim();
                return (sVal === 'undefined' || sVal === 'null' || sVal === '-' || sVal === '0') ? '' : sVal;
            };

            const enrollmentStudents = enrollSnap.docs.map(d0 => {
                const d = d0.data();
                return {
                    id: d.studentId,
                    enrollId: d0.id,
                    studentCode: d.studentCode || '',
                    name: d.studentName || d.name || '',
                    number: getNo(d),
                    classLevel: d.classLevel || '',
                    room: d.room || '',
                    manualEvaluation: d.manualEvaluation || null,
                };
            });

            const studentIds = enrollmentStudents.map(s => s.id);
            if (studentIds.length > 0) {
                try {
                    const batchSize = 30;
                    const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                    for (let i = 0; i < studentIds.length; i += batchSize) {
                        const batch = studentIds.slice(i, i + batchSize);
                        const sSnap = await getDocs(query(studentsRef, where('__name__', 'in', batch)));
                        sSnap.forEach(sDoc => {
                            const sData = sDoc.data();
                            const student = enrollmentStudents.find(s => s.id === sDoc.id);
                            if (student) {
                                const actualNo = sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '';
                                if (actualNo && String(actualNo).trim() !== '-' && String(actualNo).trim() !== '0') {
                                    student.number = String(actualNo).trim();
                                }
                                if (!student.name && sData.firstName) {
                                    student.name = `${sData.title || sData.prefix || ''}${sData.firstName} ${sData.lastName || ''}`;
                                }
                                const actualCode = sData.studentCode || sData.studentId || sData.code || sData.student_code || sData['รหัสนักเรียน'] || '';
                                if (actualCode) {
                                    student.studentCode = String(actualCode).trim();
                                }
                            }
                        });
                    }
                } catch (err) {
                    console.error('Error deep syncing student data:', err);
                }
            }

            setStudentsInCourse(enrollmentStudents);

            const attRef = collectionGroup(db, 'ClassroomAttendance');
            const attQ = query(
                attRef,
                where('schoolId', '==', schoolId),
                where('subjectCode', '==', selectedCourse.value),
                where('academicYear', '==', academicYear),
                where('semester', '==', semester)
            );
            const attSnap = await getDocs(attQ);
            const records: AttendanceRecord[] = attSnap.docs.map(d => d.data() as AttendanceRecord);
            setAttendanceRecords(records);

            const leaveStudentIds = Array.from(new Set(records.filter(r => r.status === 'leave').map(r => r.studentId).filter(Boolean)));
            const newLeaveMap: Record<string, LeavePeriod[]> = {};
            for (const idChunk of chunkArray(leaveStudentIds, 20)) {
                await Promise.all(idChunk.map(async (sid) => {
                    const leavesRef = collection(db, 'school-settings', schoolId, 'students', sid, 'leave_summary');
                    const leaveQ = query(leavesRef, where('status', '==', 'approved'));
                    const leaveSnap = await getDocs(leaveQ);
                    newLeaveMap[sid] = leaveSnap.docs.map(ld => {
                        const ldata: any = ld.data();
                        return { startDate: ldata.startDate, endDate: ldata.endDate, leaveType: ldata.leaveType };
                    });
                }));
            }
            setLeaveMap(newLeaveMap);
        } catch (err: any) {
            console.error('Error fetching data:', err);
            if (err.code === 'failed-precondition' || err.message?.includes('index')) {
                setError('ระบบต้องการการตั้งค่าดัชนี (Index) กรุณาคลิกลิงก์ใน Console เพื่อสร้าง Index');
            } else {
                setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleFetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId, academicYear, semester, selectedCourse]);

    const roomOptions = useMemo(() => {
        const fixedRooms = Array.from({ length: 20 }, (_, i) => String(i + 1));
        const activeRooms = new Set<string>();
        studentsInCourse.forEach(s => { if (s.room) activeRooms.add(String(s.room)); });
        const combinedRooms = new Set([...fixedRooms, ...Array.from(activeRooms)]);
        const sortedList = Array.from(combinedRooms).sort((a, b) => Number(a) - Number(b));
        return [
            { value: 'all', label: 'ทุกห้องเรียน' },
            ...sortedList.map(r => ({ value: r, label: `ห้อง ${r}` }))
        ];
    }, [studentsInCourse]);

    const studentSummary = useMemo<StudentStats[]>(() => {
        const statsMap: Record<string, StudentStats> = {};
        studentsInCourse.forEach(s => {
            statsMap[s.id] = {
                id: s.id,
                enrollId: s.enrollId,
                studentCode: s.studentCode || '-',
                name: s.name,
                number: s.number,
                classLevel: s.classLevel,
                room: s.room,
                late: 0,
                sick: 0,
                personal: 0,
                absent: 0,
                escape: 0,
                total: totalPeriods,
                percentage: 0,
                evaluation: 'ปกติ',
                manualEvaluation: s.manualEvaluation
            };
        });

        attendanceRecords.forEach(rec => {
            const s = statsMap[rec.studentId];
            if (!s) return;
            if (rec.status === 'late') s.late++;
            else if (rec.status === 'absent') s.absent++;
            else if (rec.status === 'escape') s.escape++;
            else if (rec.status === 'leave') {
                const periods = leaveMap[rec.studentId] || [];
                const match = periods.find(p => isDateWithinRange(rec.date, p.startDate, p.endDate));
                const subType = classifyLeaveSubType(match?.leaveType);
                if (subType === 'sick') s.sick++;
                else s.personal++;
            }
        });

        Object.values(statsMap).forEach(s => {
            const deduction = s.absent + s.escape;
            const rawPct = totalPeriods > 0 ? Math.round(((totalPeriods - deduction) / totalPeriods) * 100) : 0;
            s.percentage = Math.max(0, Math.min(100, rawPct));
            const autoEval: 'มส.' | 'ปกติ' = s.percentage < 80 ? 'มส.' : 'ปกติ';
            s.evaluation = s.manualEvaluation || autoEval;
        });

        let list = Object.values(statsMap);
        if (selectedRoom && selectedRoom.value !== 'all') {
            const ids = studentsInCourse.filter(s => String(s.room) === String(selectedRoom.value)).map(s => s.id);
            list = list.filter(item => ids.includes(item.id));
        }

        return list.sort((a, b) => {
            const numA = parseInt(a.number) || 999;
            const numB = parseInt(b.number) || 999;
            if (numA !== numB) return numA - numB;
            return a.name.localeCompare(b.name, 'th');
        });
    }, [attendanceRecords, studentsInCourse, leaveMap, totalPeriods, selectedRoom]);

    const classLabelDisplay = useMemo(() => {
        const pool = selectedRoom.value === 'all'
            ? studentsInCourse
            : studentsInCourse.filter(s => String(s.room) === String(selectedRoom.value));
        const sample = pool[0];
        if (!sample) return '-';
        return getFullClassLabel(sample.classLevel, sample.room);
    }, [studentsInCourse, selectedRoom]);

    const totalStats = useMemo(() => {
        const stats = { count: studentSummary.length, msCount: 0, avgPercent: 0 };
        let percentSum = 0;
        studentSummary.forEach(s => {
            if (s.evaluation === 'มส.') stats.msCount++;
            percentSum += s.percentage;
        });
        stats.avgPercent = studentSummary.length > 0 ? Math.round((percentSum / studentSummary.length) * 10) / 10 : 0;
        return stats;
    }, [studentSummary]);

    const handleToggleStatus = async (studentId: string, enrollId: string, currentStatus: string) => {
        if (!schoolId || !enrollId) return;
        const newStatus = currentStatus === 'มส.' ? 'ปกติ' : 'มส.';
        try {
            const enrollRef = doc(db, 'school-settings', schoolId, 'enrollments', enrollId);
            await updateDoc(enrollRef, { manualEvaluation: newStatus, updatedAt: serverTimestamp() });
            setStudentsInCourse(prev => prev.map(s => s.id === studentId ? { ...s, manualEvaluation: newStatus } : s));
            Swal.fire({ title: 'สำเร็จ!', text: `เปลี่ยนสถานะเป็น ${newStatus} เรียบร้อยแล้ว`, icon: 'success', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
        } catch (err) {
            console.error('Error updating status:', err);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเปลี่ยนสถานะได้', 'error');
        }
    };

    const handleExportPdf = async () => {
        if (!selectedCourse) return;
        setPdfGenerating(true);
        try {
            const subjectLabel = selectedCourseData ? `${selectedCourseData.code} ${selectedCourseData.title}` : selectedCourse.label;
            const pdfDoc = (
                <MsReportPdfDocument
                    students={studentSummary}
                    schoolName={schoolSettings.schoolName || 'โรงเรียน'}
                    logoUrl={schoolSettings.logoUrl}
                    academicYear={academicYear}
                    semester={semester}
                    classLabel={classLabelDisplay}
                    subjectLabel={subjectLabel}
                    signerName={String((currentUser as any)?.fullName || '').trim()}
                    academicHeadName={academicHeadName}
                    academicHeadRoleLabel={academicHeadRoleLabel}
                />
            );
            const blob = await pdf(pdfDoc).toBlob();
            saveAs(blob, `รายงาน_มส_${selectedCourse.value}_${academicYear}_${semester}.pdf`);
        } catch (err) {
            console.error('Error exporting ms report PDF:', err);
            Swal.fire('สร้าง PDF ไม่สำเร็จ', 'ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง', 'error');
        } finally {
            setPdfGenerating(false);
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-[#f8fafc] dark:bg-[#131417] transition-colors duration-500">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
                        <div className="space-y-1 text-left">
                            <div className="flex items-center gap-3">
                                <BackButton to="/academic/hub/registration" />
                                <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-2xl shadow-sm border border-rose-100 dark:border-rose-500/20">
                                    <FileWarning className="text-rose-600 dark:text-rose-400" size={24} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                        รายงาน มส.
                                    </h1>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold pt-0.5">
                                        สรุปการเช็คขาดคาบตามรายวิชาที่เลือกรายชั้นเรียน (เกณฑ์เวลาเรียนไม่น้อยกว่า 80%)
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <div className="flex flex-1 md:flex-none bg-gray-50 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-gray-800 items-center px-4 shadow-inner">
                                <div className="flex items-baseline gap-1 py-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">ปี</span>
                                    <span className="text-[13px] font-black text-gray-900 dark:text-white">{academicYear || '...'}</span>
                                </div>
                                <div className="w-[1.5px] h-3 bg-gray-200 dark:bg-gray-700 mx-3"></div>
                                <select
                                    className="bg-transparent border-none text-[12px] font-black focus:ring-0 dark:text-white px-1 py-0.5 cursor-pointer outline-none appearance-none hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                    value={semester}
                                    onChange={(e) => setSemester(e.target.value)}
                                >
                                    <option value="1" className="dark:bg-[#1a1b1e]">เทอม 1</option>
                                    <option value="2" className="dark:bg-[#1a1b1e]">เทอม 2</option>
                                </select>
                            </div>
                            <button
                                onClick={handleFetchData}
                                disabled={loading}
                                title="รีเฟรชข้อมูล"
                                className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/80 shadow-sm transition disabled:opacity-60"
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            </button>
                            <button
                                onClick={handleExportPdf}
                                disabled={!selectedCourse || studentSummary.length === 0 || pdfGenerating}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-slate-900 dark:bg-indigo-500 dark:hover:bg-white dark:hover:text-black text-white px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/10 transition-all font-black text-xs group disabled:opacity-60"
                            >
                                {pdfGenerating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                <span>PDF</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative">
                    <div className="bg-white dark:bg-[#1a1b1e] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 items-end">
                            <div className="lg:col-span-8 space-y-1.5">
                                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <BookOpen size={12} /> เลือกรหัสรายวิชา
                                </span>
                                <Select options={courseOptions} value={selectedCourse} onChange={setSelectedCourse} placeholder="พิมพ์ค้นหารหัสวิชา..." styles={selectStyles} isClearable />
                            </div>
                            <div className="lg:col-span-4 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <Users size={12} /> ห้องเรียน
                                </span>
                                <Select options={roomOptions} value={selectedRoom} onChange={setSelectedRoom} styles={selectStyles} isSearchable={false} />
                            </div>
                        </div>
                        {selectedCourseData && (
                            <p className="mt-3 ml-1 text-[11px] font-bold text-gray-400 dark:text-gray-500">
                                ระดับชั้น {classLabelDisplay} • หน่วยกิต {selectedCourseData.credits ?? '-'} • ฐานคำนวณ {totalPeriods} คาบ/ภาคเรียน
                            </p>
                        )}
                    </div>

                    {!selectedCourse ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center bg-white dark:bg-[#1a1b1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="bg-gradient-to-tr from-rose-500 to-indigo-600 p-10 rounded-2xl shadow-xl">
                                <FileWarning size={64} className="text-white" />
                            </div>
                            <div className="mt-8 space-y-2 px-6">
                                <h3 className="text-2xl font-black text-gray-900 dark:text-white">พร้อมเริ่มการตรวจสอบแล้ว</h3>
                                <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-sm font-medium leading-relaxed">กรุณาเลือกรายวิชาด้านบนเพื่อเข้าถึงข้อมูลสถิติและรายงาน มส.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <SummaryCard title="จำนวนนักเรียน" value={totalStats.count} icon={<Users size={20} />} unit="คน" color="indigo" />
                                <SummaryCard title="ตกเกณฑ์ (มส.)" value={totalStats.msCount} icon={<AlertCircle size={20} />} unit="คน" color="rose" />
                                <SummaryCard title="ค่าเฉลี่ยการมาเรียน" value={totalStats.avgPercent} icon={<Percent size={20} />} unit="%" color="emerald" />
                            </div>

                            {error && (
                                <div className="bg-rose-50 border border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 p-4 rounded-xl flex items-center gap-3">
                                    <AlertCircle size={20} className="shrink-0" />
                                    <p className="font-bold text-sm">{error}</p>
                                </div>
                            )}

                            <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                                {loading ? (
                                    <div className="p-8 space-y-6">
                                        <div className="flex gap-4"><SkeletonLoader className="h-4 w-12 rounded-full" /><SkeletonLoader className="h-4 w-48 rounded-full" /></div>
                                        {[1, 2, 3, 4, 5].map(i => <SkeletonLoader key={i} className="h-12 w-full rounded-xl" />)}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-gray-800">
                                                    <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-12">เลขที่</th>
                                                    <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest min-w-[220px]">ข้อมูลนักเรียน</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-amber-500 uppercase tracking-widest text-center w-14">สาย</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-blue-500 uppercase tracking-widest text-center w-16">ลาป่วย</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-sky-500 uppercase tracking-widest text-center w-16">ลากิจ</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-rose-500 uppercase tracking-widest text-center w-20">ยังไม่บันทึก/ขาด</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-red-600 uppercase tracking-widest text-center w-16">หนีเรียน</th>
                                                    <th className="px-2 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-16">ร้อยละ</th>
                                                    <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-28">ผลการเข้าเรียน</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                                {studentSummary.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={9} className="py-20 text-center">
                                                            <div className="flex flex-col items-center gap-3 opacity-30">
                                                                <Users size={48} />
                                                                <p className="font-bold text-sm">ไม่พบข้อมูลนักเรียน</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : studentSummary.map((s) => {
                                                    const isMS = s.evaluation === 'มส.';
                                                    return (
                                                        <tr key={s.id} className="group hover:bg-gray-50/50 dark:hover:bg-indigo-500/[0.02] transition-colors">
                                                            <td className="px-4 py-4 text-center">
                                                                <span className="text-sm font-black text-gray-400 dark:text-gray-700 group-hover:text-indigo-600 transition-colors tabular-nums">{s.number || '-'}</span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isMS ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 shadow-sm' : 'bg-gray-100 dark:bg-white/5 text-gray-400 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                                                                        <User size={18} />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <p className={`text-[13px] font-bold truncate ${isMS ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>{s.name}</p>
                                                                            {isMS && <span className="shrink-0 bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm">มส.</span>}
                                                                        </div>
                                                                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-600 tracking-tight italic">รหัส: {s.studentCode}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.late > 0 ? 'text-amber-500' : 'text-gray-200 dark:text-gray-800'}`}>{s.late || '-'}</span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.sick > 0 ? 'text-blue-500' : 'text-gray-200 dark:text-gray-800'}`}>{s.sick || '-'}</span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.personal > 0 ? 'text-sky-500' : 'text-gray-200 dark:text-gray-800'}`}>{s.personal || '-'}</span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.absent > 0 ? 'text-rose-600' : 'text-gray-200 dark:text-gray-800'}`}>{s.absent || '-'}</span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.escape > 0 ? 'text-red-600' : 'text-gray-200 dark:text-gray-800'}`}>{s.escape || '-'}</span>
                                                            </td>
                                                            <td className="px-2 py-4 text-center">
                                                                <span className={`text-sm font-black tabular-nums ${s.percentage < 80 ? 'text-rose-600' : 'text-emerald-600'}`}>{s.percentage}%</span>
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <button
                                                                    onClick={() => handleToggleStatus(s.id, s.enrollId, s.evaluation)}
                                                                    className={`min-w-[70px] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${isMS
                                                                        ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20 hover:bg-rose-600 hover:text-white"
                                                                        : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-600 hover:text-white"}`}
                                                                >
                                                                    {s.evaluation}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default MsReportPage;
