import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import BackButton from '@/components/Shared/BackButton';
import { firestore as db } from '@/firebase';
import {
    collection,
    query,
    where,
    getDocs,
    getDoc,
    doc,
    collectionGroup,
    Timestamp
} from 'firebase/firestore';
import {
    Search,
    Download,
    Filter,
    Calendar,
    RefreshCw,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Users,
    BookOpen,
    Clock,
    User,
    ArrowUpDown,
    Info,
    CalendarDays,
    FileSpreadsheet,
    Printer,
    FileText,
    ExternalLink
} from 'lucide-react';
import { usePermissions } from "@/hooks/usePermissions";
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { getScheduleSlotCandidates, getTimetableDisplayPeriods, normalizePeriodSettings } from '@/utils/scheduleDisplayUtils';
import { CLASSES, CLASS_FULL_NAMES, getGroupPersonnel } from '@/utils/schoolUtils';
import Swal from 'sweetalert2';
import {
    Document as PdfDocument,
    Font,
    Image as PdfImage,
    Page as PdfPage,
    StyleSheet as PdfStyleSheet,
    Text as PdfText,
    View as PdfView,
    pdf
} from '@react-pdf/renderer';
import { saveAs } from 'file-saver';

try {
    Font.register({
        family: 'TH Sarabun PSK',
        fonts: [
            { src: '/fonts/THSarabunNew.ttf' },
            { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
        ],
    });
} catch (error) {
    console.warn('Unable to register Thai PDF font', error);
}

interface PeriodSetting {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
    isTeachingPeriod: boolean;
    index?: number;
}

interface AuditSlot {
    id: string; // Composite key or unique id
    classId: string;
    className: string;
    classLevels?: string[]; // 📌 รายการชั้นเรียน/ห้องเรียนที่ได้รับมอบหมายจริง
    subjectCode: string;
    subjectName: string;
    periodIndex: number;
    periodLabel: string;
    startTime: string;
    endTime: string;
    teacherId: string;
    teacherName: string;
    roomName: string;
    status: 'checked' | 'pending' | 'adhoc';
    checkedAt?: Date;
    checkedBy?: string;
    stats?: {
        present: number;
        late: number;
        absent: number;
        leave: number;
        total: number;
    };
    rawDocs?: any[];
}

const THAI_DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const THAI_DAY_BY_KEY: Record<string, string> = {
    sun: 'วันอาทิตย์',
    mon: 'วันจันทร์',
    tue: 'วันอังคาร',
    wed: 'วันพุธ',
    thu: 'วันพฤหัสบดี',
    fri: 'วันศุกร์',
    sat: 'วันเสาร์'
};

const DEFAULT_PERIODS: PeriodSetting[] = [
    { id: 'homeroom', label: 'โฮมรูม', startTime: '08:30', endTime: '08:40', isTeachingPeriod: false, index: 0 },
    { id: 'period-1', label: 'คาบที่ 1', startTime: '08:40', endTime: '09:30', isTeachingPeriod: true, index: 1 },
    { id: 'period-2', label: 'คาบที่ 2', startTime: '09:30', endTime: '10:20', isTeachingPeriod: true, index: 2 },
    { id: 'period-3', label: 'คาบที่ 3', startTime: '10:20', endTime: '11:10', isTeachingPeriod: true, index: 3 },
    { id: 'period-4', label: 'คาบที่ 4', startTime: '11:10', endTime: '12:00', isTeachingPeriod: true, index: 4 },
    { id: 'lunch', label: 'พักกลางวัน', startTime: '12:00', endTime: '13:00', isTeachingPeriod: false, index: 5 },
    { id: 'period-5', label: 'คาบที่ 5', startTime: '13:00', endTime: '13:50', isTeachingPeriod: true, index: 6 },
    { id: 'period-6', label: 'คาบที่ 6', startTime: '13:50', endTime: '14:40', isTeachingPeriod: true, index: 7 },
    { id: 'period-7', label: 'คาบที่ 7', startTime: '14:40', endTime: '15:30', isTeachingPeriod: true, index: 8 },
    { id: 'period-8', label: 'คาบที่ 8', startTime: '15:30', endTime: '16:00', isTeachingPeriod: true, index: 9 },
];

const formatDateThai = (date: Date) => {
    return date.toLocaleDateString('th-TH', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
};

const formatDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatTimeDisplay = (time: string) => {
    if (!time) return '';
    return time.replace('.', ':') + ' น.';
};

const formatClassName = (classId: string) => {
    if (!classId) return '';
    const cleanId = String(classId).trim();
    if (cleanId.includes('-')) {
        const parts = cleanId.split('-');
        const levelKey = parts[0];
        const room = parts[1];
        return `${CLASSES[levelKey] || levelKey}/${room}`;
    }
    if (cleanId.includes('/')) {
        return cleanId;
    }
    return CLASSES[cleanId] || cleanId;
};

// ─── Official PDF Report ───────────────────────────────────────────────
// A4 landscape, ตามระเบียบงานราชการ: ตราสัญลักษณ์/ชื่อโรงเรียนหัวกระดาษ,
// ตารางเส้นขอบครบ, และช่องลงนามผู้ตรวจสอบ/หัวหน้ากลุ่มบริหารวิชาการท้ายรายงาน

const auditPdfStyles = PdfStyleSheet.create({
    page: {
        fontFamily: 'TH Sarabun PSK',
        fontSize: 11,
        paddingHorizontal: 28,
        paddingTop: 22,
        paddingBottom: 40,
        backgroundColor: '#ffffff',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderBottomWidth: 0.8,
        borderBottomColor: '#777',
        paddingBottom: 4,
        marginBottom: 8,
    },
    topText: { fontSize: 11, fontWeight: 'bold' },
    headerBlock: { position: 'relative', minHeight: 58, marginBottom: 6 },
    logo: { position: 'absolute', left: 0, top: 0, width: 54, height: 54, objectFit: 'contain' },
    titleWrap: { alignItems: 'center', paddingTop: 2 },
    mainTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
    mainSubtitle: { fontSize: 12, textAlign: 'center', marginTop: 1 },
    holidayNote: { fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginTop: 1 },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        flexWrap: 'wrap',
        marginTop: 6,
        marginBottom: 8,
        gap: 4,
    },
    summaryItem: { fontSize: 10, marginHorizontal: 8 },
    rowHeader: {
        flexDirection: 'row',
        backgroundColor: '#f3f4f6',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: '#374151',
    },
    row: {
        flexDirection: 'row',
        borderLeftWidth: 1,
        borderColor: '#374151',
    },
    cell: {
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#374151',
        paddingVertical: 3,
        paddingHorizontal: 3,
        fontSize: 9,
        textAlign: 'center',
    },
    cPeriod: { width: '4%' },
    cTime: { width: '8%' },
    cRoom: { width: '8%' },
    cSubject: { width: '18%', textAlign: 'left' },
    cTeacher: { width: '13%', textAlign: 'left' },
    cStatus: { width: '9%' },
    cCheckedAt: { width: '7%' },
    cCheckedBy: { width: '11%', textAlign: 'left' },
    cStat: { width: '4%' },
    cTotal: { width: '5%' },
    signSection: {
        marginTop: 26,
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    signBlock: { width: 220, alignItems: 'center' },
    signRow: { flexDirection: 'row', alignItems: 'flex-end', width: '100%' },
    signPrefix: { fontSize: 11 },
    signDotsCol: { flex: 1 },
    signDotsLine: {
        borderBottomWidth: 1,
        borderBottomColor: '#000',
        borderBottomStyle: 'dotted',
        height: 12,
    },
    signName: { fontSize: 11, marginTop: 4, textAlign: 'center' },
    signRole: { fontSize: 11, marginTop: 2, textAlign: 'center' },
    pageNumber: {
        position: 'absolute',
        bottom: 14,
        right: 28,
        fontSize: 9,
        color: '#555',
    },
});

const STATUS_LABELS: Record<AuditSlot['status'], string> = {
    checked: 'เช็คชื่อแล้ว',
    pending: 'ยังไม่เช็คชื่อ',
    adhoc: 'นอกตาราง (Ad-hoc)'
};

const ClassroomAttendanceAuditPdf: React.FC<{
    schoolName: string;
    logoUrl?: string;
    dateLabel: string;
    holidayNote?: string;
    slots: AuditSlot[];
    metrics: { totalScheduled: number; checkedScheduled: number; pendingScheduled: number; adhocCount: number; overallCheckRate: number };
    signerName: string;
    academicHeadName: string;
    academicHeadRoleLabel: string;
}> = ({ schoolName, logoUrl, dateLabel, holidayNote, slots, metrics, signerName, academicHeadName, academicHeadRoleLabel }) => (
    <PdfDocument>
        <PdfPage size="A4" orientation="landscape" style={auditPdfStyles.page}>
            <PdfView style={auditPdfStyles.topBar} fixed>
                <PdfText style={auditPdfStyles.topText}>{schoolName}</PdfText>
                <PdfText style={auditPdfStyles.topText}>รายงานตรวจสอบการเข้าสอน & การเช็คชื่อ</PdfText>
            </PdfView>

            <PdfView style={auditPdfStyles.headerBlock}>
                {logoUrl ? <PdfImage src={logoUrl} style={auditPdfStyles.logo} /> : null}
                <PdfView style={auditPdfStyles.titleWrap}>
                    <PdfText style={auditPdfStyles.mainTitle}>รายงานตรวจสอบการลงเวลาการเข้าสอนและการเช็คชื่อนักเรียนของครู</PdfText>
                    <PdfText style={auditPdfStyles.mainSubtitle}>{schoolName}</PdfText>
                    <PdfText style={auditPdfStyles.mainSubtitle}>ประจำวันที่ {dateLabel}</PdfText>
                    {holidayNote ? <PdfText style={auditPdfStyles.holidayNote}>({holidayNote})</PdfText> : null}
                </PdfView>
            </PdfView>

            <PdfView style={auditPdfStyles.summaryRow}>
                <PdfText style={auditPdfStyles.summaryItem}>คาบสอนทั้งหมด: {metrics.totalScheduled} คาบ</PdfText>
                <PdfText style={auditPdfStyles.summaryItem}>เช็คชื่อแล้ว: {metrics.checkedScheduled} คาบ ({metrics.overallCheckRate}%)</PdfText>
                <PdfText style={auditPdfStyles.summaryItem}>ยังไม่เช็คชื่อ: {metrics.pendingScheduled} คาบ</PdfText>
                <PdfText style={auditPdfStyles.summaryItem}>นอกตาราง: {metrics.adhocCount} คาบ</PdfText>
            </PdfView>

            <PdfView wrap={false}>
                <PdfView style={auditPdfStyles.rowHeader}>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cPeriod, { fontWeight: 'bold' }]}>คาบ</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cTime, { fontWeight: 'bold' }]}>เวลา</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cRoom, { fontWeight: 'bold' }]}>ระดับชั้น/ห้อง</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cSubject, { fontWeight: 'bold' }]}>วิชา</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cTeacher, { fontWeight: 'bold' }]}>ครูผู้สอน</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStatus, { fontWeight: 'bold' }]}>สถานะ</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cCheckedAt, { fontWeight: 'bold' }]}>เวลาเช็ค</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cCheckedBy, { fontWeight: 'bold' }]}>ผู้เช็คชื่อ</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStat, { fontWeight: 'bold' }]}>มา</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStat, { fontWeight: 'bold' }]}>สาย</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStat, { fontWeight: 'bold' }]}>ขาด</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStat, { fontWeight: 'bold' }]}>ลา</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cTotal, { fontWeight: 'bold' }]}>รวม</PdfText>
                </PdfView>
            </PdfView>

            {slots.map((slot, idx) => (
                <PdfView key={slot.id || idx} style={auditPdfStyles.row} wrap={false}>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cPeriod]}>{slot.periodIndex ?? '-'}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cTime]}>{slot.startTime}-{slot.endTime}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cRoom]}>{slot.className}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cSubject]}>{[slot.subjectCode, slot.subjectName].filter(Boolean).join(' ')}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cTeacher]}>{slot.teacherName || '-'}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStatus]}>{STATUS_LABELS[slot.status]}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cCheckedAt]}>
                        {slot.checkedAt ? new Date(slot.checkedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cCheckedBy]}>{slot.checkedBy || '-'}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStat]}>{slot.stats?.present ?? '-'}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStat]}>{slot.stats?.late ?? '-'}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStat]}>{slot.stats?.absent ?? '-'}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cStat]}>{slot.stats?.leave ?? '-'}</PdfText>
                    <PdfText style={[auditPdfStyles.cell, auditPdfStyles.cTotal]}>{slot.stats?.total ?? '-'}</PdfText>
                </PdfView>
            ))}

            <PdfView style={auditPdfStyles.signSection}>
                <PdfView style={auditPdfStyles.signBlock}>
                    <PdfView style={auditPdfStyles.signRow}>
                        <PdfText style={auditPdfStyles.signPrefix}>ลงชื่อ</PdfText>
                        <PdfView style={auditPdfStyles.signDotsCol}>
                            <PdfView style={auditPdfStyles.signDotsLine} />
                        </PdfView>
                        <PdfText style={auditPdfStyles.signPrefix}>ผู้ตรวจสอบ</PdfText>
                    </PdfView>
                    <PdfText style={auditPdfStyles.signName}>({signerName || '.........................................'})</PdfText>
                    <PdfText style={auditPdfStyles.signRole}>งานทะเบียนและวัดผล</PdfText>
                </PdfView>
                <PdfView style={auditPdfStyles.signBlock}>
                    <PdfView style={auditPdfStyles.signRow}>
                        <PdfText style={auditPdfStyles.signPrefix}>ลงชื่อ</PdfText>
                        <PdfView style={auditPdfStyles.signDotsCol}>
                            <PdfView style={auditPdfStyles.signDotsLine} />
                        </PdfView>
                        <PdfText style={auditPdfStyles.signPrefix}>ผู้รับรอง</PdfText>
                    </PdfView>
                    <PdfText style={auditPdfStyles.signName}>({academicHeadName || '.........................................'})</PdfText>
                    <PdfText style={auditPdfStyles.signRole}>{academicHeadRoleLabel}</PdfText>
                </PdfView>
            </PdfView>

            <PdfText
                style={auditPdfStyles.pageNumber}
                render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`}
                fixed
            />
        </PdfPage>
    </PdfDocument>
);

const ClassroomAttendanceAuditPage: React.FC = () => {
    const dispatch = useDispatch();
    const { user: currentUser } = usePermissions();
    const schoolId = (currentUser as any)?.schoolId;

    const calendarState = useSelector((state: RootState) => state.calendar);
    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
    const { availableClassOptions } = useSelector((state: RootState) => state.schoolSettings);

    const [selectedDate, setSelectedDate] = useState<Date>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    });

    const [loading, setLoading] = useState(false);
    const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>(DEFAULT_PERIODS);
    const [rooms, setRooms] = useState<Record<string, string>>({});
    const [allSlots, setAllSlots] = useState<AuditSlot[]>([]);

    // PDF Report State
    const [schoolName, setSchoolName] = useState('');
    const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
    const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
    const [academicHeadName, setAcademicHeadName] = useState('');
    const [academicHeadRoleLabel, setAcademicHeadRoleLabel] = useState('หัวหน้ากลุ่มบริหารวิชาการ');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Filters State
    const [selectedLevel, setSelectedLevel] = useState<string>('all');
    const [selectedRoom, setSelectedRoom] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [sortBy, setSortBy] = useState<string>('period'); // 'period', 'class', 'status'
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Details Modal State
    const [activeModalSlot, setActiveModalSlot] = useState<AuditSlot | null>(null);
    const [modalStudents, setModalStudents] = useState<any[]>([]);
    const [modalLoading, setModalLoading] = useState(false);

    // Initial load parameters
    useEffect(() => {
        if (schoolId) {
            dispatch(fetchCalendar(schoolId) as any);
            dispatch(fetchTeachersMap(schoolId) as any);
            loadSchoolConfig(schoolId);
        }
    }, [schoolId, dispatch]);

    // Reload audit when date changes
    useEffect(() => {
        if (schoolId && calendarState.status === 'succeeded') {
            fetchAuditData();
        }
    }, [selectedDate, schoolId, calendarState.status, periodSettings]);

    // Convert school logo to base64 so @react-pdf/renderer can embed it reliably
    useEffect(() => {
        if (!logoUrl) {
            setLogoBase64(undefined);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch(logoUrl);
                const blob = await response.blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                if (!cancelled) setLogoBase64(dataUrl);
            } catch (error) {
                console.warn('Unable to inline school logo as base64 for PDF, falling back to direct URL', error);
                // Firebase Storage may block the base64 fetch via CORS — react-pdf can still
                // load the image directly from the URL in most cases, so use it as a fallback
                // rather than dropping the logo entirely.
                if (!cancelled) setLogoBase64(logoUrl);
            }
        })();
        return () => { cancelled = true; };
    }, [logoUrl]);

    const loadSchoolConfig = async (currentSchoolId: string) => {
        try {
            // Load period settings
            const configRef = doc(db, 'school-settings', currentSchoolId, 'configs', 'schedule_settings');
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                const data = configSnap.data();
                if (data.periods) {
                    setPeriodSettings(data.periods.map((p: any, idx: number) => ({
                        ...p,
                        index: typeof p.index === 'number' ? p.index : idx
                    })));
                }
            }

            // Load physical rooms
            const roomsSnap = await getDocs(collection(db, 'school-settings', currentSchoolId, 'physical-rooms'));
            const roomMap: Record<string, string> = {};
            roomsSnap.forEach(d => {
                const data = d.data();
                roomMap[d.id] = data.roomCode || data.roomName || d.id;
            });
            setRooms(roomMap);

            // Load school name/logo & academic head name for the PDF report header/signature
            const schoolSnap = await getDoc(doc(db, 'school-settings', currentSchoolId));
            if (schoolSnap.exists()) {
                const data = schoolSnap.data();
                setSchoolName(String(data.schoolName || data.name || data.schoolThaiName || ''));
                if (data.logoUrl) setLogoUrl(String(data.logoUrl));
                const academicPersonnel = getGroupPersonnel(data, 'academic');
                setAcademicHeadName(academicPersonnel.name);
                setAcademicHeadRoleLabel(academicPersonnel.label);
            }
        } catch (e) {
            console.error("Error loading config:", e);
        }
    };

    const getScheduleYearTerm = (date: Date) => {
        const year = calendarState?.academicYear || String(new Date().getFullYear() + 543);
        let term = '1';
        if (calendarState?.terms && calendarState.terms.length > 0) {
            const dateStr = formatDateKey(date);
            const matchedTerm = calendarState.terms.find((t: any) => dateStr >= t.startDate && dateStr <= t.endDate);
            if (matchedTerm) {
                term = String(matchedTerm.name || matchedTerm.id || '').includes('2') ? '2' : '1';
            } else {
                const term2 = calendarState.terms.find((t: any) => String(t.name || t.id || '').includes('2'));
                if (term2?.startDate && dateStr >= term2.startDate) term = '2';
            }
        }
        return { academicYear: year, semester: term };
    };

    const checkIsHoliday = (dateStr: string) => {
        if (!dateStr) return { isHoliday: false, description: '' };
        const events = calendarState.rawData?.events || {};
        const event = events[dateStr];
        const d = new Date(dateStr);
        const dayOfWeek = d.getDay();

        if (dayOfWeek === 0 || dayOfWeek === 6) {
            if (event?.type === 'schoolDay') return { isHoliday: false, description: event.description || 'วันเรียนชดเชย' };
            if (event?.type === 'holiday') return { isHoliday: true, description: event.description || 'วันหยุดราชการ' };
            if (event?.type === 'specialHoliday') return { isHoliday: true, description: event.description || 'วันหยุดกรณีพิเศษ' };
            return { isHoliday: true, description: 'วันหยุดเสาร์-อาทิตย์' };
        }

        if (event) {
            if (event.type === 'holiday') return { isHoliday: true, description: event.description || 'วันหยุดราชการ' };
            if (event.type === 'specialHoliday') return { isHoliday: true, description: event.description || 'วันหยุดกรณีพิเศษ' };
            if (event.type === 'schoolDay') return { isHoliday: false, description: event.description || 'วันเรียนชดเชย/กิจกรรม' };
        }

        return { isHoliday: false, description: '' };
    };

    const getEffectiveScheduleDay = (date: Date) => {
        const dateString = formatDateKey(date);
        const events = calendarState.rawData?.events || {};
        const event = events[dateString];
        const actualDayKey = DAY_KEYS[date.getDay()];

        if (event?.type === 'schoolDay' && event.scheduleDay && DAY_KEYS.includes(event.scheduleDay)) {
            return {
                actualDayKey,
                scheduleDayKey: event.scheduleDay,
                actualDayName: THAI_DAYS[date.getDay()],
                scheduleDayName: THAI_DAY_BY_KEY[event.scheduleDay] || THAI_DAYS[date.getDay()],
                description: event.description || 'สอนชดเชย',
                isMakeupDay: event.scheduleDay !== actualDayKey,
            };
        }

        return {
            actualDayKey,
            scheduleDayKey: actualDayKey,
            actualDayName: THAI_DAYS[date.getDay()],
            scheduleDayName: THAI_DAYS[date.getDay()],
            description: '',
            isMakeupDay: false,
        };
    };

    const fetchAuditData = async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const dateStr = formatDateKey(selectedDate);
            const { academicYear, semester } = getScheduleYearTerm(selectedDate);
            const effectiveDay = getEffectiveScheduleDay(selectedDate);
            const scheduleDayKey = effectiveDay.scheduleDayKey;

            // 1. Fetch all schedules & course assignments & attendance in parallel
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);

            const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
            const schedulesQuery = query(
                schedulesRef,
                where("academicYear", "==", academicYear),
                where("semester", "==", semester)
            );

            const assignmentsRef = collection(db, 'school-settings', schoolId, 'course_assignments');
            const assignmentsQuery = query(
                assignmentsRef,
                where("academicYear", "==", academicYear),
                where("semester", "==", semester)
            );

            const attendanceQuery = query(
                collectionGroup(db, 'ClassroomAttendance'),
                where('schoolId', '==', schoolId),
                where('date', '>=', Timestamp.fromDate(startOfDay)),
                where('date', '<=', Timestamp.fromDate(endOfDay))
            );

            const [schedulesSnap, assignmentsSnap, attendanceSnap] = await Promise.all([
                getDocs(schedulesQuery),
                getDocs(assignmentsQuery),
                getDocs(attendanceQuery)
            ]);

            // 2. Map course assignments by courseId
            const assignmentMap = new Map<string, any>();
            assignmentsSnap.forEach((doc) => {
                const data = doc.data();
                if (data.courseId) {
                    assignmentMap.set(data.courseId, data);
                }
            });

            // 3. Aggregate ClassroomAttendance documents by session key: `${classId}_${subjectCode}_P${period}`
            const attendanceMap = new Map<string, {
                checked: boolean;
                checkedAt?: Date;
                checkedBy?: string;
                stats: { present: number; late: number; absent: number; leave: number; total: number };
                rawDocs: any[];
            }>();

            const addRecordToMap = (key: string, data: any) => {
                if (!attendanceMap.has(key)) {
                    attendanceMap.set(key, {
                        checked: true,
                        checkedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : undefined),
                        checkedBy: data.teacherName || '',
                        stats: { present: 0, late: 0, absent: 0, leave: 0, total: 0 },
                        rawDocs: []
                    });
                }

                const record = attendanceMap.get(key)!;
                record.rawDocs.push(data);

                // Count stats
                const status = data.status || 'present';
                record.stats.total++;
                if (status === 'present') record.stats.present++;
                else if (status === 'late') record.stats.late++;
                else if (status === 'absent') record.stats.absent++;
                else if (status === 'leave') record.stats.leave++;

                // Keep the latest updatedAt and teacherName
                const docDate = data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : null);
                if (docDate && (!record.checkedAt || docDate > record.checkedAt)) {
                    record.checkedAt = docDate;
                    record.checkedBy = data.teacherName || record.checkedBy;
                }
            };

            attendanceSnap.forEach((doc) => {
                const data = doc.data();
                const isHomeroomAttendance =
                    data.attendanceType === 'homeroom' ||
                    data.courseId === 'homeroom' ||
                    data.subjectCode === 'homeroom' ||
                    data.period === 0;
                if (isHomeroomAttendance) return;

                const classId = data.classId;
                const subjectCode = data.subjectCode;
                const period = data.period;

                // General key
                const generalKey = `${classId}_${subjectCode}_P${period}`;
                addRecordToMap(generalKey, data);

                // Room-specific key if room is provided
                if (data.room && data.room !== 'all') {
                    const roomKey = `${classId}_${data.room}_${subjectCode}_P${period}`;
                    addRecordToMap(roomKey, data);
                }
            });

            // 4. Parse schedules and merge with dynamic Course Assignments
            const parsedSlots: AuditSlot[] = [];
            const scheduledKeys = new Set<string>();
            const normalizedPeriods = normalizePeriodSettings(periodSettings);
            const teachingPeriods = getTimetableDisplayPeriods(normalizedPeriods)
                .filter(period => {
                    const id = String(period.id || '').toLowerCase();
                    const label = String(period.label || '');
                    if (id === 'homeroom' || id === 'lunch' || label === 'โฮมรูม' || label.includes('พัก')) return false;
                    return period.isTeachingPeriod !== false || id.startsWith('period-');
                });
            const getPeriodNumber = (setting: PeriodSetting, fallbackIndex: number) => {
                const idNumber = String(setting.id || '').match(/^period-(\d+)$/)?.[1];
                if (idNumber) return Number(idNumber);

                const labelNumber = String(setting.label || '').match(/\d+/)?.[0];
                if (labelNumber) return Number(labelNumber);

                const stableIndex = Number(setting.index ?? fallbackIndex);
                return Number.isFinite(stableIndex) && stableIndex > 0 ? stableIndex : fallbackIndex + 1;
            };
            const resolveTeachingSlot = (slot: string) => {
                if (!slot.startsWith(`${scheduleDayKey}-`)) return null;

                const exactIndex = teachingPeriods.findIndex((period, periodIndex) =>
                    getScheduleSlotCandidates(scheduleDayKey, period, periodIndex).includes(slot)
                );
                if (exactIndex >= 0) {
                    const setting = teachingPeriods[exactIndex];
                    return {
                        setting,
                        periodNum: getPeriodNumber(setting, exactIndex)
                    };
                }

                const suffix = slot.replace(`${scheduleDayKey}-`, '');
                const legacyIndex = Number(suffix);
                if (Number.isFinite(legacyIndex) && legacyIndex >= 0) {
                    // First: match by period id (handles old format where numeric suffix = period NUMBER)
                    const byPeriodId = normalizedPeriods.find(p => p.id === `period-${legacyIndex}`);
                    if (byPeriodId && byPeriodId.isTeachingPeriod !== false) {
                        return { setting: byPeriodId, periodNum: getPeriodNumber(byPeriodId, legacyIndex) };
                    }
                    // Fallback: use as position in the filtered teaching-periods array
                    if (teachingPeriods[legacyIndex]) {
                        const setting = teachingPeriods[legacyIndex];
                        return { setting, periodNum: getPeriodNumber(setting, legacyIndex) };
                    }
                }

                return null;
            };

            schedulesSnap.forEach((schedDoc) => {
                const data = schedDoc.data();
                const classId = data.classId;
                const scheduleMap = data.schedule || {};

                Object.entries(scheduleMap).forEach(([slot, rawCourse]) => {
                    // Check if slot starts with scheduleDayKey (e.g. mon-1)
                    if (slot.startsWith(`${scheduleDayKey}-`) && rawCourse) {
                        const resolvedSlot = resolveTeachingSlot(slot);
                        if (!resolvedSlot) return;

                        const { setting, periodNum } = resolvedSlot;

                        const courses = Array.isArray(rawCourse) ? rawCourse : [rawCourse].filter(Boolean);
                        
                        courses.forEach((course: any, courseIdx: number) => {
                            if (!course) return;

                            const courseId = course.id || course.courseId || '';
                            const subjectCode = course.code || course.subjectCode || '';
                            const subjectName = course.title || course.subjectName || 'ไม่ระบุวิชา';
                            const groupNum = Number(course.groupNumber || course.group || 1) || 1;
                            
                            // A. Look up course assignment matching courseId and groupNumber
                            const assignmentDoc = assignmentMap.get(courseId);
                            const teacherAssignments = assignmentDoc?.teacherAssignments || [];
                            const matchedAssign = teacherAssignments.find(
                                (a: any) => Number(a.groupNumber || 1) === groupNum
                            );

                            // B. Resolve teacher (override if assigned in CourseAssignmentPage)
                            const teacherId = matchedAssign?.teacherId || course.teacherId || data.teacherId || '';
                            const teacherProfile = teacherMap[teacherId];
                            const teacherName = teacherProfile
                                ? `${teacherProfile.title || 'ครู'}${teacherProfile.firstName || teacherProfile.name || ''} ${teacherProfile.lastName || ''}`.trim()
                                : (course.teacherName || data.teacherName || 'ไม่ระบุชื่อครู');

                            // C. Resolve assigned rooms
                            const roomIds = matchedAssign?.roomIds || (Array.isArray(course.room) ? course.room : (course.room ? [course.room] : []));
                            const roomName = roomIds.length > 0
                                ? roomIds.map((id: string) => rooms[id] || id).join(', ')
                                : (matchedAssign?.room || 'ไม่ระบุสถานที่');

                            // D. Resolve assigned classes/classLevels ("แสดงชั้นเรียนตามที่มอบ")
                            const assignedClassIds = (matchedAssign?.classLevels && matchedAssign.classLevels.length > 0)
                                ? matchedAssign.classLevels
                                : [classId];
                            
                            // แสดงห้องตามที่มอบหมายวิชา เช่น ม.1/5
                            const className = assignedClassIds.map((cId: string) => {
                                const formatted = formatClassName(cId);
                                if (!cId.includes('-') && !cId.includes('/')) {
                                    const roomSuffix = matchedAssign?.room || (Array.isArray(course.room) ? undefined : course.room);
                                    if (roomSuffix && roomSuffix !== 'all') {
                                        return `${formatted}/${roomSuffix}`;
                                    }
                                }
                                return formatted;
                            }).join(', ');

                            // E. Aggregate and match attendance for all assigned classes/classLevels
                            let attRecord: any = null;
                            assignedClassIds.forEach((cId: string) => {
                                const generalKey = `${cId}_${subjectCode}_P${periodNum}`;
                                scheduledKeys.add(generalKey);

                                // Try specific room/group first, fallback to general level key
                                const roomSuffix = matchedAssign?.room || (Array.isArray(course.room) ? undefined : course.room);
                                const roomKey = (roomSuffix && roomSuffix !== 'all') ? `${cId}_${roomSuffix}_${subjectCode}_P${periodNum}` : null;
                                
                                if (roomKey) {
                                    scheduledKeys.add(roomKey);
                                }

                                const record = (roomKey && attendanceMap.has(roomKey))
                                    ? attendanceMap.get(roomKey)
                                    : attendanceMap.get(generalKey);

                                if (record) {
                                    if (!attRecord) {
                                        attRecord = {
                                            checked: true,
                                            checkedAt: record.checkedAt,
                                            checkedBy: record.checkedBy,
                                            stats: { ...record.stats },
                                            rawDocs: [...record.rawDocs]
                                        };
                                    } else {
                                        // Merge records if multiple classes are combined/assigned together
                                        if (record.checkedAt && (!attRecord.checkedAt || record.checkedAt > attRecord.checkedAt)) {
                                            attRecord.checkedAt = record.checkedAt;
                                            attRecord.checkedBy = record.checkedBy || attRecord.checkedBy;
                                        }
                                        attRecord.stats.present += record.stats.present;
                                        attRecord.stats.late += record.stats.late;
                                        attRecord.stats.absent += record.stats.absent;
                                        attRecord.stats.leave += record.stats.leave;
                                        attRecord.stats.total += record.stats.total;
                                        attRecord.rawDocs.push(...record.rawDocs);
                                    }
                                }
                            });

                            // Ensure original slot key is marked so it doesn't duplicate as ad-hoc
                            scheduledKeys.add(`${classId}_${subjectCode}_P${periodNum}`);

                            parsedSlots.push({
                                id: `${schedDoc.id}_${slot}_${courseIdx}`,
                                classId,
                                className,
                                classLevels: assignedClassIds,
                                subjectCode,
                                subjectName,
                                periodIndex: periodNum,
                                periodLabel: setting.label,
                                startTime: setting.startTime,
                                endTime: setting.endTime,
                                teacherId,
                                teacherName,
                                roomName,
                                status: attRecord ? 'checked' : 'pending',
                                checkedAt: attRecord?.checkedAt,
                                checkedBy: attRecord?.checkedBy,
                                stats: attRecord?.stats,
                                rawDocs: attRecord?.rawDocs
                            });
                        });
                    }
                });
            });

            // 5. Append any checked sessions that were NOT in the official schedule (Ad-hoc checks)
            const processedAdHocKeys = new Set<string>();
            attendanceMap.forEach((attRecord, sessionKey) => {
                if (attRecord.rawDocs.length === 0) return;

                const sampleDoc = attRecord.rawDocs[0];
                const classId = sampleDoc.classId;
                const subjectCode = sampleDoc.subjectCode || '';
                const subjectName = sampleDoc.subjectName || 'วิชานอกตารางเรียน';
                const periodNum = sampleDoc.period || 0;
                
                const generalKey = `${classId}_${subjectCode}_P${periodNum}`;
                
                if (scheduledKeys.has(generalKey) || scheduledKeys.has(sessionKey)) {
                    return;
                }

                if (processedAdHocKeys.has(generalKey)) {
                    return;
                }
                processedAdHocKeys.add(generalKey);

                const setting = periodSettings.find(p => {
                    const num = parseInt(p.id.replace('period-', ''));
                    return num === periodNum;
                });

                // For ad-hoc display, use the custom formatting with room if available in sampleDoc
                const roomSuffix = sampleDoc.room || (sampleDoc.groupNumber ? String(sampleDoc.groupNumber) : null);
                let adhocClassName = formatClassName(classId);
                if (roomSuffix && roomSuffix !== 'all' && !classId.includes('-') && !classId.includes('/')) {
                    adhocClassName = `${adhocClassName}/${roomSuffix}`;
                }

                parsedSlots.push({
                    id: `adhoc_${generalKey}`,
                    classId,
                    className: adhocClassName,
                    subjectCode,
                    subjectName,
                    periodIndex: periodNum,
                    periodLabel: setting?.label || `คาบที่ ${periodNum}`,
                    startTime: setting?.startTime || '--.--',
                    endTime: setting?.endTime || '--.--',
                    teacherId: sampleDoc.teacherId || '',
                    teacherName: sampleDoc.teacherName || 'ไม่ระบุชื่อครู',
                    roomName: sampleDoc.room || 'ไม่ระบุสถานที่',
                    status: 'adhoc',
                    checkedAt: attRecord.checkedAt,
                    checkedBy: attRecord.checkedBy,
                    stats: attRecord.stats,
                    rawDocs: attRecord.rawDocs
                });
            });

            setAllSlots(parsedSlots);
        } catch (e) {
            console.error("Error fetching audit data:", e);
            Swal.fire("ข้อผิดพลาด", "ไม่สามารถดึงข้อมูลการตรวจสอบการเข้าสอนได้", "error");
        } finally {
            setLoading(false);
        }
    };

    // Grade levels the school actually teaches (from school-settings.opportunityExpansionLevel),
    // not just whatever happens to be scheduled for the selected day
    const classLevelsList = useMemo(() => {
        return availableClassOptions.map(([, label]) => label);
    }, [availableClassOptions]);

    // Filtered & Sorted Slots
    const filteredResults = useMemo(() => {
        return allSlots
            .filter(slot => {
                // Filter by Class Level
                if (selectedLevel !== 'all') {
                    const formatted = slot.className;
                    const lvl = formatted.includes('/') ? formatted.split('/')[0] : formatted;
                    if (lvl !== selectedLevel) return false;
                }

                // Filter by Room
                if (selectedRoom !== 'all') {
                    const formatted = slot.className;
                    if (!formatted.includes('/') || `/${formatted.split('/')[1]}` !== selectedRoom) return false;
                }

                // Filter by Status
                if (selectedStatus !== 'all') {
                    if (selectedStatus === 'checked' && slot.status !== 'checked') return false;
                    if (selectedStatus === 'pending' && slot.status !== 'pending') return false;
                    if (selectedStatus === 'adhoc' && slot.status !== 'adhoc') return false;
                }

                // Filter by Search Term
                if (searchTerm.trim() !== '') {
                    const searchLower = searchTerm.toLowerCase();
                    const matchSubject = slot.subjectCode.toLowerCase().includes(searchLower) || slot.subjectName.toLowerCase().includes(searchLower);
                    const matchTeacher = slot.teacherName.toLowerCase().includes(searchLower);
                    const matchClass = slot.className.toLowerCase().includes(searchLower);
                    if (!matchSubject && !matchTeacher && !matchClass) return false;
                }

                return true;
            })
            .sort((a, b) => {
                // Sorting logic
                let multiplier = sortDirection === 'asc' ? 1 : -1;
                
                if (sortBy === 'period') {
                    return (a.periodIndex - b.periodIndex) * multiplier;
                }
                
                if (sortBy === 'class') {
                    return a.className.localeCompare(b.className) * multiplier;
                }
                
                if (sortBy === 'status') {
                    return a.status.localeCompare(b.status) * multiplier;
                }

                return 0;
            });
    }, [allSlots, selectedLevel, selectedRoom, selectedStatus, searchTerm, sortBy, sortDirection]);

    // Overall Metrics
    const metrics = useMemo(() => {
        const scheduled = allSlots.filter(s => s.status !== 'adhoc');
        const totalScheduled = scheduled.length;
        const checkedScheduled = scheduled.filter(s => s.status === 'checked').length;
        const pendingScheduled = scheduled.filter(s => s.status === 'pending').length;
        const adhocCount = allSlots.filter(s => s.status === 'adhoc').length;
        const overallCheckRate = totalScheduled > 0 ? Math.round((checkedScheduled / totalScheduled) * 100) : 0;

        return {
            totalScheduled,
            checkedScheduled,
            pendingScheduled,
            adhocCount,
            overallCheckRate
        };
    }, [allSlots]);

    // Handle Sorting
    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDirection('asc');
        }
    };

    // Navigation Controls
    const handlePrevDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() - 1);
        setSelectedDate(d);
    };

    const handleNextDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + 1);
        setSelectedDate(d);
    };

    const handleQuickDate = (type: 'yesterday' | 'today' | 'tomorrow') => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        if (type === 'yesterday') d.setDate(d.getDate() - 1);
        if (type === 'tomorrow') d.setDate(d.getDate() + 1);
        setSelectedDate(d);
    };

    // Load details for student popup modal
    const handleOpenDetails = async (slot: AuditSlot) => {
        if (!slot.rawDocs || slot.rawDocs.length === 0) return;
        setActiveModalSlot(slot);
        setModalLoading(true);
        setModalStudents([]);

        const buildProfile = (sDoc: any) => {
            const sData = sDoc.data();
            const name = `${sData.title || sData.prefix || ''}${sData.firstName || ''} ${sData.lastName || ''}`.trim() || 'ไม่ระบุชื่อ';
            const number = String(sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '-');
            return { name, number, id: sDoc.id };
        };

        try {
            const studentsRef = collection(db, 'school-settings', schoolId, 'students');
            const studentProfilesMap = new Map<string, { name: string; number: string; id: string }>();

            // PRIMARY: fetch directly by Firestore document ID (studentId in attendance records
            // equals the student document ID — avoids classLevel format mismatch entirely)
            const studentIds = Array.from(new Set(
                slot.rawDocs.map((d: any) => String(d.studentId || '')).filter(Boolean)
            ));

            for (let i = 0; i < studentIds.length; i += 30) {
                const batch = studentIds.slice(i, i + 30);
                const snap = await getDocs(query(studentsRef, where('__name__', 'in', batch)));
                snap.forEach(sDoc => {
                    const profile = buildProfile(sDoc);
                    studentProfilesMap.set(sDoc.id, profile);
                    const sid = sDoc.data().studentId;
                    if (sid) studentProfilesMap.set(String(sid), profile);
                });
            }

            // FALLBACK: if no profiles matched, query by classLevel using all format variants
            // (handles cases where studentId in attendance differs from the doc ID)
            if (studentProfilesMap.size === 0) {
                const classIds = slot.classLevels && slot.classLevels.length > 0
                    ? slot.classLevels
                    : [slot.classId];

                const variantSet = new Set<string>();
                classIds.forEach(cId => {
                    const s = String(cId || '').trim();
                    if (!s) return;
                    variantSet.add(s);
                    // English key → Thai label (e.g. "m4" → "ม.4")
                    if (CLASSES[s]) variantSet.add(CLASSES[s]);
                    // Thai label → English key (e.g. "ม.4" → "m4")
                    const engKey = Object.entries(CLASSES).find(([, v]) => v === s)?.[0];
                    if (engKey) variantSet.add(engKey);
                    // Dash format → slash format (e.g. "m4-1" → "m4/1" and "ม.4/1")
                    if (s.includes('-')) {
                        const [level, room] = s.split('-');
                        variantSet.add(`${level}/${room}`);
                        if (CLASSES[level]) variantSet.add(`${CLASSES[level]}/${room}`);
                        // Grade-level only variants
                        variantSet.add(level);
                        if (CLASSES[level]) variantSet.add(CLASSES[level]);
                    }
                });

                const variants = Array.from(variantSet).filter(Boolean);
                const classSnaps = await Promise.all(
                    variants.map(lvlId => getDocs(query(studentsRef, where('classLevel', '==', lvlId))))
                );
                classSnaps.forEach(snap => {
                    snap.forEach(sDoc => {
                        const profile = buildProfile(sDoc);
                        studentProfilesMap.set(sDoc.id, profile);
                        const sid = sDoc.data().studentId;
                        if (sid) studentProfilesMap.set(String(sid), profile);
                    });
                });
            }

            const sortedStudents = slot.rawDocs.map((doc: any) => {
                const profile = studentProfilesMap.get(String(doc.studentId));
                return {
                    studentId: doc.studentId,
                    name: profile?.name || 'ไม่พบข้อมูลนักเรียนในระบบ',
                    number: profile?.number || '-',
                    status: doc.status || 'present'
                };
            }).sort((a: any, b: any) => {
                const numA = parseInt(a.number);
                const numB = parseInt(b.number);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a.number).localeCompare(String(b.number));
            });

            setModalStudents(sortedStudents);
        } catch (e) {
            console.error("Error loading student details modal:", e);
            Swal.fire("ข้อผิดพลาด", "ไม่สามารถดึงรายชื่อนักเรียนได้", "error");
        } finally {
            setModalLoading(false);
        }
    };

    // CSV Exporter
    const handleExportCSV = () => {
        if (filteredResults.length === 0) {
            Swal.fire("ไม่พบข้อมูล", "ไม่มีข้อมูลสำหรับส่งออกในหน้านี้", "info");
            return;
        }

        const headers = [
            'คาบที่',
            'เวลาเรียน',
            'ระดับชั้น/ห้อง',
            'รหัสวิชา',
            'ชื่อวิชา',
            'ครูผู้สอน',
            'สถานะเช็คชื่อ',
            'เวลาที่เช็คชื่อ',
            'ผู้เช็คชื่อ',
            'มาเรียน (คน)',
            'สาย (คน)',
            'ขาด (คน)',
            'ลา (คน)',
            'จำนวนนักเรียนทั้งหมด (คน)'
        ];

        const rows = filteredResults.map(slot => {
            const timeRange = `${slot.startTime} - ${slot.endTime}`;
            let statusText = 'ยังไม่เช็ค';
            if (slot.status === 'checked') statusText = 'เช็คแล้ว';
            else if (slot.status === 'adhoc') statusText = 'เช็คแล้ว (นอกตาราง)';

            return [
                slot.periodLabel || `คาบที่ ${slot.periodIndex}`,
                timeRange,
                slot.className,
                slot.subjectCode,
                slot.subjectName,
                slot.teacherName || 'ไม่ระบุครูผู้สอน',
                statusText,
                slot.checkedAt ? new Date(slot.checkedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '-',
                slot.checkedBy || '-',
                slot.stats?.present ?? '-',
                slot.stats?.late ?? '-',
                slot.stats?.absent ?? '-',
                slot.stats?.leave ?? '-',
                slot.stats?.total ?? '-'
            ];
        });

        // Thai language encoding support with BOM
        const csvContent = "\ufeff" + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const dateStr = formatDateKey(selectedDate);
        link.setAttribute("download", `Classroom_Attendance_Audit_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Generate the official-format PDF report (ตามระเบียบงานราชการ)
    const handleGeneratePdf = async () => {
        if (filteredResults.length === 0) {
            Swal.fire("ไม่พบข้อมูล", "ไม่มีข้อมูลสำหรับสร้างรายงานในหน้านี้", "info");
            return;
        }
        setIsGeneratingPdf(true);
        try {
            const holiday = checkIsHoliday(formatDateKey(selectedDate));
            const blob = await pdf(
                <ClassroomAttendanceAuditPdf
                    schoolName={schoolName}
                    logoUrl={logoBase64}
                    dateLabel={formatDateThai(selectedDate)}
                    holidayNote={holiday.isHoliday ? holiday.description : undefined}
                    slots={filteredResults}
                    metrics={metrics}
                    signerName={String(currentUser?.fullName || '').trim()}
                    academicHeadName={academicHeadName}
                    academicHeadRoleLabel={academicHeadRoleLabel}
                />
            ).toBlob();
            saveAs(blob, `รายงานตรวจสอบการเข้าสอน_${formatDateKey(selectedDate)}.pdf`);
        } catch (e) {
            console.error("Error generating PDF:", e);
            Swal.fire("ข้อผิดพลาด", "ไม่สามารถสร้างรายงาน PDF ได้", "error");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const isTodayHoliday = checkIsHoliday(formatDateKey(selectedDate));

    return (
        <MainLayout>
            <div className="w-full px-2 sm:px-6 lg:px-8 py-2 sm:py-5 text-gray-900 dark:text-white relative">

                <div className="max-w-7xl mx-auto">

                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
                        <div className="space-y-1 text-left">
                            <div className="flex items-center gap-3">
                                <BackButton to="/academic/hub/attendance" />
                                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
                                    <Clock className="text-indigo-600 dark:text-indigo-400" size={24} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                        ตรวจสอบการเข้าสอน & การเช็คชื่อ
                                    </h1>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold pt-0.5">
                                        ตรวจสอบการลงเวลาเช็คชื่อรายวิชาของครูและสถิติในแต่ละคาบเรียนแบบเรียลไทม์
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 self-start md:self-center">
                            <button
                                onClick={handleGeneratePdf}
                                disabled={isGeneratingPdf}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isGeneratingPdf ? <RefreshCw size={16} className="animate-spin text-gray-500 dark:text-gray-400" /> : <Printer size={16} className="text-gray-500 dark:text-gray-400" />}
                                <span>พิมพ์รายงาน (PDF)</span>
                            </button>
                            <button
                                onClick={handleExportCSV}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/50 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/80 shadow-sm transition cursor-pointer"
                            >
                                <FileSpreadsheet size={16} />
                                <span>ส่งออก Excel/CSV</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick Date Navigator Row */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 bg-white dark:bg-[#1a1b1e] p-3 sm:p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        
                        {/* Day switch buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handlePrevDay}
                                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer"
                                title="วันก่อนหน้า"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold text-base sm:text-lg">
                                <Calendar size={18} />
                                <span>{formatDateThai(selectedDate)}</span>
                            </div>
                            <button
                                onClick={handleNextDay}
                                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer"
                                title="วันถัดไป"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        {/* Quick navigators & manual selector */}
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => handleQuickDate('yesterday')}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer"
                            >
                                เมื่อวาน
                            </button>
                            <button
                                onClick={() => handleQuickDate('today')}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer"
                            >
                                วันนี้
                            </button>
                            <button
                                onClick={() => handleQuickDate('tomorrow')}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer"
                            >
                                พรุ่งนี้
                            </button>

                            {/* Native Input Selector */}
                            <div className="relative flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl px-2.5 py-1.5 border border-gray-200 dark:border-gray-700">
                                <input
                                    type="date"
                                    value={formatDateKey(selectedDate)}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            const parts = e.target.value.split('-');
                                            setSelectedDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
                                        }
                                    }}
                                    className="bg-transparent border-none text-sm font-semibold outline-none cursor-pointer text-gray-800 dark:text-gray-200"
                                />
                            </div>

                            <button
                                onClick={fetchAuditData}
                                disabled={loading}
                                className={`p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer ${loading ? 'opacity-50' : ''}`}
                                title="รีเฟรชข้อมูล"
                            >
                                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* Holiday Notification Banner */}
                    {isTodayHoliday.isHoliday && (
                        <div className="flex items-start gap-3 p-4 mb-6 rounded-2xl bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border border-amber-100 dark:border-amber-900/50 shadow-sm">
                            <AlertTriangle size={20} className="shrink-0 text-amber-500 mt-0.5" />
                            <div>
                                <span className="font-bold text-sm sm:text-base">แจ้งเตือนวันหยุดสถาบันการศึกษา</span>
                                <p className="text-xs sm:text-sm mt-0.5 text-amber-700/95 dark:text-amber-400">
                                    วันนี้เป็น **{isTodayHoliday.description}** ระบบจะยังแสดงผลตารางสอนมาตรฐาน แต่อาจไม่มีการบังคับการตรวจเช็คชื่อเป็นพิเศษ เว้นแต่มีการจัดการเรียนการสอนชดเชย
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Summary Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        
                        {/* CARD 1: Total Slots */}
                        <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 sm:p-5 flex items-center justify-between">
                            <div className="min-w-0">
                                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">
                                    คาบสอนทั้งหมดในตาราง
                                </span>
                                <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white leading-none">
                                    {metrics.totalScheduled}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 font-semibold flex items-center gap-1">
                                    <BookOpen size={12} className="text-indigo-500" />
                                    ตามตารางเรียนวิชาปกติ
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 shrink-0">
                                <BookOpen size={24} />
                            </div>
                        </div>

                        {/* CARD 2: Checked Count */}
                        <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 sm:p-5 flex items-center justify-between">
                            <div className="min-w-0">
                                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">
                                    บันทึกการเช็คชื่อแล้ว
                                </span>
                                <h3 className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 leading-none">
                                    {metrics.checkedScheduled}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 font-semibold flex items-center gap-1">
                                    <CheckCircle2 size={12} className="text-emerald-500" />
                                    คิดเป็น {metrics.overallCheckRate}% ของตาราง
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 shrink-0">
                                <CheckCircle2 size={24} />
                            </div>
                        </div>

                        {/* CARD 3: Unchecked Count */}
                        <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 sm:p-5 flex items-center justify-between">
                            <div className="min-w-0">
                                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">
                                    ยังไม่มีการเช็คชื่อ
                                </span>
                                <h3 className={`text-3xl font-extrabold leading-none ${metrics.pendingScheduled > 0 ? 'text-amber-500' : 'text-gray-950 dark:text-white'}`}>
                                    {metrics.pendingScheduled}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 font-semibold flex items-center gap-1">
                                    <XCircle size={12} className="text-amber-500" />
                                    คาบเรียนที่รอผู้สอนมาลงชื่อ
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-amber-50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400 shrink-0">
                                <AlertTriangle size={24} />
                            </div>
                        </div>

                        {/* CARD 4: Ad-hoc Count */}
                        <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 sm:p-5 flex items-center justify-between">
                            <div className="min-w-0">
                                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">
                                    เช็คชื่อนอกตาราง (Ad-hoc)
                                </span>
                                <h3 className="text-3xl font-extrabold text-sky-600 dark:text-sky-400 leading-none">
                                    {metrics.adhocCount}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 font-semibold flex items-center gap-1">
                                    <Info size={12} className="text-sky-500" />
                                    การเช็คชื่อ ad-hoc นอกเหนือตาราง
                                </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 shrink-0">
                                <Info size={24} />
                            </div>
                        </div>
                    </div>

                    {/* Filter & Options Panel */}
                    <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 sm:p-5 mb-6">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3.5 flex items-center gap-2">
                            <Filter size={16} className="text-indigo-500" />
                            <span>ตัวกรองและข้อกำหนดการค้นหา</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                            
                            {/* Class Level Selector */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400">ระดับชั้นเรียน</label>
                                <select
                                    value={selectedLevel}
                                    onChange={(e) => setSelectedLevel(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-[#25262b] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-semibold"
                                >
                                    <option value="all">ทุกระดับชั้นเรียน ({classLevelsList.length})</option>
                                    {classLevelsList.map((lvl) => (
                                        <option key={lvl} value={lvl}>{lvl}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Room Selector */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400">ห้องเรียน</label>
                                <select
                                    value={selectedRoom}
                                    onChange={(e) => setSelectedRoom(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-[#25262b] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-semibold"
                                >
                                    <option value="all">ทุกห้องเรียน</option>
                                    {Array.from({ length: 20 }, (_, i) => i + 1).map((room) => (
                                        <option key={room} value={`/${room}`}>{room}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Selector */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400">สถานะการเช็คชื่อ</label>
                                <select
                                    value={selectedStatus}
                                    onChange={(e) => setSelectedStatus(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-[#25262b] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-semibold"
                                >
                                    <option value="all">ทุกสถานะการลงเวลา</option>
                                    <option value="checked">เช็คชื่อแล้ว (สีเขียว)</option>
                                    <option value="pending">ยังไม่ได้เช็ค (สีส้ม)</option>
                                    <option value="adhoc">เช็คชื่อนอกตาราง (สีฟ้า)</option>
                                </select>
                            </div>

                            {/* Search bar */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400">ค้นหาด่วน</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="รหัสวิชา, วิชา, หรือชื่อครู..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-[#25262b] border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Results Table Container */}
                    <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        
                        {loading ? (
                            <div className="flex flex-col justify-center items-center py-20 text-gray-400">
                                <RefreshCw className="animate-spin text-indigo-500 mb-3" size={32} />
                                <span className="text-sm font-semibold">กำลังดึงข้อมูลการจัดตารางและการเช็คเข้าสอน...</span>
                            </div>
                        ) : filteredResults.length === 0 ? (
                            <div className="flex flex-col justify-center items-center py-20 text-center">
                                <Info className="text-gray-400 mb-3" size={40} />
                                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">ไม่พบตารางสอน/การเช็คชื่อ</h3>
                                <p className="text-sm text-gray-400 max-w-sm mt-1">
                                    ไม่พบข้อมูลที่ตรงกับเงื่อนไขในวันดังกล่าว หรือโรงเรียนยังไม่ได้บันทึกตารางการเรียนการสอนลงในระบบ
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-[#1e1f22] border-b border-gray-100 dark:border-gray-800 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            <th className="py-4 px-4 sm:px-6 cursor-pointer hover:text-indigo-500 select-none" onClick={() => handleSort('period')}>
                                                <div className="flex items-center gap-1">
                                                    <span>คาบที่ / เวลา</span>
                                                    <ArrowUpDown size={12} />
                                                </div>
                                            </th>
                                            <th className="py-4 px-4 cursor-pointer hover:text-indigo-500 select-none" onClick={() => handleSort('class')}>
                                                <div className="flex items-center gap-1">
                                                    <span>ระดับชั้น/ห้อง</span>
                                                    <ArrowUpDown size={12} />
                                                </div>
                                            </th>
                                            <th className="py-4 px-4">รหัส / รายวิชา</th>
                                            <th className="py-4 px-4">ครูผู้สอน</th>
                                            <th className="py-4 px-4 cursor-pointer hover:text-indigo-500 select-none" onClick={() => handleSort('status')}>
                                                <div className="flex items-center gap-1">
                                                    <span>สถานะเข้าสอน</span>
                                                    <ArrowUpDown size={12} />
                                                </div>
                                            </th>
                                            <th className="py-4 px-4 text-center">สถิติมาเรียน</th>
                                            <th className="py-4 px-4 sm:px-6 text-right">ดำเนินการ</th>
                                        </tr>
                                    </thead>
                                    
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                                        {filteredResults.map((slot) => {
                                            const isChecked = slot.status === 'checked' || slot.status === 'adhoc';
                                            
                                            return (
                                                <tr 
                                                    key={slot.id} 
                                                    className={`hover:bg-gray-50/50 dark:hover:bg-[#202124]/40 transition text-sm ${slot.status === 'adhoc' ? 'bg-sky-500/[0.01]' : ''}`}
                                                >
                                                    
                                                    {/* PERIOD / TIME */}
                                                    <td className="py-4 px-4 sm:px-6 font-semibold">
                                                        <div className="flex flex-col">
                                                            <span className="text-gray-900 dark:text-white font-bold">{slot.periodLabel}</span>
                                                            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium flex items-center gap-1 mt-0.5">
                                                                <Clock size={12} />
                                                                {slot.startTime} - {slot.endTime}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* CLASSROOM */}
                                                    <td className="py-4 px-4 font-bold text-gray-900 dark:text-white">
                                                        {slot.className}
                                                    </td>

                                                    {/* SUBJECT */}
                                                    <td className="py-4 px-4">
                                                        <div className="flex flex-col max-w-xs sm:max-w-sm">
                                                            <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wide">
                                                                {slot.subjectCode}
                                                            </span>
                                                            <span className="text-gray-800 dark:text-gray-100 font-bold mt-0.5 truncate" title={slot.subjectName}>
                                                                {slot.subjectName}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* TEACHER */}
                                                    <td className="py-4 px-4 font-medium text-gray-800 dark:text-gray-200">
                                                        {slot.teacherName}
                                                    </td>

                                                    {/* AUDIT STATUS */}
                                                    <td className="py-4 px-4">
                                                        {slot.status === 'checked' && (
                                                            <div className="flex flex-col">
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 w-fit">
                                                                    <CheckCircle2 size={13} />
                                                                    เช็คแล้ว
                                                                </span>
                                                                {slot.checkedAt && (
                                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-1">
                                                                        เช็คเมื่อ {slot.checkedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {slot.status === 'adhoc' && (
                                                            <div className="flex flex-col">
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-100 dark:border-sky-900/40 w-fit">
                                                                    <Info size={13} />
                                                                    เช็คแล้ว (นอกตาราง)
                                                                </span>
                                                                {slot.checkedAt && (
                                                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-1">
                                                                        เช็คเมื่อ {slot.checkedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {slot.status === 'pending' && (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 w-fit">
                                                                <AlertTriangle size={13} />
                                                                ยังไม่เช็ค
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* STATS BREAKDOWN */}
                                                    <td className="py-4 px-4">
                                                        {isChecked && slot.stats ? (
                                                            <div className="flex items-center justify-center gap-1.5 font-bold text-xs select-none">
                                                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" title="มาเรียน">
                                                                    มา {slot.stats.present}
                                                                </span>
                                                                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400" title="สาย">
                                                                    สาย {slot.stats.late}
                                                                </span>
                                                                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400" title="ขาด">
                                                                    ขาด {slot.stats.absent}
                                                                </span>
                                                                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400" title="ลา">
                                                                    ลา {slot.stats.leave}
                                                                </span>
                                                                <span className="text-gray-400 dark:text-gray-600 font-medium">
                                                                    ({slot.stats.total} คน)
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center text-gray-300 dark:text-gray-700">—</div>
                                                        )}
                                                    </td>

                                                    {/* ACTION BUTTON */}
                                                    <td className="py-4 px-4 sm:px-6 text-right">
                                                        {isChecked ? (
                                                            <button
                                                                onClick={() => handleOpenDetails(slot)}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition cursor-pointer"
                                                            >
                                                                <FileText size={13} />
                                                                <span>รายละเอียด</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                disabled
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-gray-50 text-gray-400 dark:bg-[#1a1b1e] dark:text-gray-600 border border-gray-100 dark:border-gray-800 cursor-not-allowed"
                                                            >
                                                                <XCircle size={13} />
                                                                <span>ไม่มีข้อมูล</span>
                                                            </button>
                                                        )}
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

                {/* ========================================================================= */}
                {/* STUDENT DETAIL MODAL POPUP */}
                {/* ========================================================================= */}
                {activeModalSlot && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-[#1c1d21] rounded-3xl border border-gray-100 dark:border-gray-800 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            
                            {/* Modal Header */}
                            <div className="p-5 border-b border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-[#202125]/40 flex items-start justify-between">
                                <div>
                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide block mb-0.5">
                                        {activeModalSlot.subjectCode} • คาบที่ {activeModalSlot.periodIndex} ({activeModalSlot.startTime} - {activeModalSlot.endTime})
                                    </span>
                                    <h3 className="text-xl font-extrabold text-gray-900 dark:text-white leading-tight">
                                        {activeModalSlot.subjectName} ({activeModalSlot.className})
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1 font-semibold">
                                        ครูผู้เช็คชื่อ: {activeModalSlot.checkedBy || activeModalSlot.teacherName} •
                                        เวลา: {activeModalSlot.checkedAt ? new Date(activeModalSlot.checkedAt).toLocaleString('th-TH') : '-'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setActiveModalSlot(null)}
                                    className="p-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer text-gray-500"
                                >
                                    <XCircle size={20} />
                                </button>
                            </div>

                            {/* Modal stats breakdown banner */}
                            {activeModalSlot.stats && (
                                <div className="grid grid-cols-4 border-b border-gray-100 dark:border-gray-800 text-center font-bold text-sm bg-indigo-50/20 dark:bg-indigo-950/10 py-3.5">
                                    <div className="border-r border-gray-100 dark:border-gray-800">
                                        <span className="text-xs text-emerald-600 dark:text-emerald-500 block mb-0.5">มาเรียน</span>
                                        <span className="text-base text-gray-800 dark:text-gray-100">{activeModalSlot.stats.present} คน</span>
                                    </div>
                                    <div className="border-r border-gray-100 dark:border-gray-800">
                                        <span className="text-xs text-amber-500 dark:text-amber-500 block mb-0.5">สาย</span>
                                        <span className="text-base text-gray-800 dark:text-gray-100">{activeModalSlot.stats.late} คน</span>
                                    </div>
                                    <div className="border-r border-gray-100 dark:border-gray-800">
                                        <span className="text-xs text-rose-500 dark:text-rose-500 block mb-0.5">ขาด</span>
                                        <span className="text-base text-gray-800 dark:text-gray-100">{activeModalSlot.stats.absent} คน</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-blue-500 dark:text-blue-500 block mb-0.5">ลา</span>
                                        <span className="text-base text-gray-800 dark:text-gray-100">{activeModalSlot.stats.leave} คน</span>
                                    </div>
                                </div>
                            )}

                            {/* Modal Student List Table */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                                {modalLoading ? (
                                    <div className="flex flex-col justify-center items-center py-16 text-gray-400">
                                        <RefreshCw className="animate-spin text-indigo-500 mb-2.5" size={28} />
                                        <span className="text-xs font-semibold">กำลังดึงข้อมูลรายชื่อและรายละเอียดเข้าชั้นเรียน...</span>
                                    </div>
                                ) : modalStudents.length === 0 ? (
                                    <div className="text-center py-12 text-gray-400">
                                        <Info size={32} className="mx-auto mb-2" />
                                        <span className="text-sm font-semibold">ไม่พบข้อมูลสถิตินักเรียนรายบุคคล</span>
                                    </div>
                                ) : (
                                    <div className="border border-gray-100 dark:border-gray-800/80 rounded-2xl overflow-hidden">
                                        <table className="w-full text-left border-collapse text-xs sm:text-sm">
                                            <thead>
                                                <tr className="bg-gray-50 dark:bg-[#1a1b1f] border-b border-gray-100 dark:border-gray-800 font-bold text-gray-500 dark:text-gray-400 text-xs">
                                                    <th className="py-2.5 px-4 w-16 text-center">เลขที่</th>
                                                    <th className="py-2.5 px-3">ชื่อ-นามสกุล นักเรียน</th>
                                                    <th className="py-2.5 px-4 text-right">สถานะการเช็คชื่อ</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                                                {modalStudents.map((st) => (
                                                    <tr key={st.studentId} className="hover:bg-gray-50/40 dark:hover:bg-[#202124]/20 transition">
                                                        <td className="py-3 px-4 font-bold text-center text-gray-500 dark:text-gray-400">
                                                            {st.number}
                                                        </td>
                                                        <td className="py-3 px-3 font-semibold text-gray-800 dark:text-gray-100">
                                                            {st.name}
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            {st.status === 'present' && (
                                                                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100/30">
                                                                    มาเรียน
                                                                </span>
                                                            )}
                                                            {st.status === 'late' && (
                                                                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-100/30">
                                                                    สาย
                                                                </span>
                                                            )}
                                                            {st.status === 'absent' && (
                                                                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border border-rose-100/30">
                                                                    ขาดเรียน
                                                                </span>
                                                            )}
                                                            {st.status === 'leave' && (
                                                                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100/30">
                                                                    ลาเรียน
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-[#202125]/40 flex justify-end">
                                <button
                                    onClick={() => setActiveModalSlot(null)}
                                    className="px-5 py-2 text-sm font-bold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition rounded-xl text-gray-700 dark:text-gray-300 cursor-pointer"
                                >
                                    ปิดหน้าต่าง
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default ClassroomAttendanceAuditPage;
