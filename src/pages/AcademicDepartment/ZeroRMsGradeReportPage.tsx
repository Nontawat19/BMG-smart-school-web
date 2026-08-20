import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import {
    AlertTriangle,
    Users,
    GraduationCap,
    Loader2,
    User,
    AlertCircle,
    Download,
    RefreshCw,
    ListChecks,
    History
} from 'lucide-react';
import BackButton from "@/components/Shared/BackButton";
import SkeletonLoader from '@/components/SkeletonLoader';
import Select from 'react-select';
import { CLASSES, CLASS_FULL_NAMES, getClassLevelRank } from '@/utils/schoolUtils';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import {
    LearnerActivityTeacherScope,
    buildLearnerActivityEvaluationDocId,
    deriveTeacherScopesFromCourse,
} from '@/utils/learnerActivityUtils';

Font.register({
    family: 'TH Sarabun PSK',
    fonts: [
        { src: '/fonts/THSarabunNew.ttf' },
        { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' }
    ]
});

type FlagType = '0' | 'ร' | 'มส' | 'มผ';
const FLAG_TYPES: FlagType[] = ['0', 'ร', 'มส', 'มผ'];

const THAI_FULL_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// วันที่ออกเอกสาร ใช้วันที่ ณ ตอนสร้าง/ส่งออก PDF จริง ไม่ใช่ช่องว่างให้กรอกเอง
const getThaiExportDateLabel = () => {
    const now = new Date();
    return `วันที่ ${now.getDate()} เดือน ${THAI_FULL_MONTHS[now.getMonth()]} พ.ศ. ${now.getFullYear() + 543}`;
};

interface Course {
    id: string;
    code: string;
    title: string;
    isActive?: boolean;
    classId?: string | string[];
    credits?: number;
}

interface EnrollmentRecord {
    studentId: string;
    courseId: string;
    academicYear: string;
    semester: string;
}

interface FlaggedCourse {
    courseId: string;
    courseCode: string;
    courseTitle: string;
    credits: number;
    grade: FlagType;
    academicYear: string;
    semester: string;
    teacherName: string;
}

interface StudentFlagRow {
    id: string;
    studentCode: string;
    number: string;
    name: string;
    classLevel: string;
    room: string;
    flags: FlaggedCourse[];
}

// รหัสรายวิชาที่ขึ้นต้นด้วย "ก" คือกิจกรรมพัฒนาผู้เรียน (ชุมนุม, ลูกเสือ-เนตรนารี, แนะแนว, สาธารณประโยชน์ ฯลฯ)
// ซึ่งประเมินผ่าน/ไม่ผ่าน (มผ) ผ่านระบบ "ประเมินกิจกรรมพัฒนาผู้เรียน" ไม่ใช่เกรด 0/ร/มส เหมือนรายวิชาปกติ
const isActivityCourseCode = (code?: string) => String(code || '').trim().charAt(0) === 'ก';

const JUNIOR_HIGH_IDS = ['m1', 'm2', 'm3', 'junior_high', 'ม.ต้น', 'ม.1', 'ม.2', 'ม.3'];
const SENIOR_HIGH_IDS = ['m4', 'm5', 'm6', 'senior_high', 'ม.ปลาย', 'ม.4', 'ม.5', 'ม.6'];
const THAI_LEVEL_MAPPING: Record<string, string[]> = {
    m1: ['ม.1'], m2: ['ม.2'], m3: ['ม.3'], m4: ['ม.4'], m5: ['ม.5'], m6: ['ม.6'],
    p1: ['ป.1'], p2: ['ป.2'], p3: ['ป.3'], p4: ['ป.4'], p5: ['ป.5'], p6: ['ป.6'],
    k1: ['อ.1', 'อนุบาล 1'], k2: ['อ.2', 'อนุบาล 2'], k3: ['อ.3', 'อนุบาล 3']
};

const matchesClassLevel = (studentClassLevel: string | undefined, selectedValue: string): boolean => {
    if (selectedValue === 'all') return true;
    if (!studentClassLevel) return false;
    const cid = String(studentClassLevel).toLowerCase().trim();
    const sid = selectedValue.toLowerCase().trim();
    if (cid === sid) return true;
    if (THAI_LEVEL_MAPPING[sid]?.some(label => label.toLowerCase() === cid)) return true;
    if (sid === 'junior_high' || sid === 'ม.ต้น') return JUNIOR_HIGH_IDS.some(v => v.toLowerCase() === cid);
    if (sid === 'senior_high' || sid === 'ม.ปลาย') return SENIOR_HIGH_IDS.some(v => v.toLowerCase() === cid);
    return false;
};

// ข้อมูลนักเรียนจริงเก็บ classLevel เป็น "ป้ายชื่อย่อ" ภาษาไทย (เช่น "ม.2") ไม่ใช่รหัส (เช่น "m2")
// จึงต้องแปลงกลับเป็นรหัสก่อน เพื่อ lookup ชื่อเต็มจาก CLASS_FULL_NAMES ได้ถูกต้อง
const SHORT_LABEL_TO_CODE: Record<string, string> = Object.fromEntries(Object.entries(CLASSES).map(([code, label]) => [label, code]));

const getFullClassLabel = (classLevel: string, room: string) => {
    const code = SHORT_LABEL_TO_CODE[classLevel] || classLevel;
    const fullLevel = CLASS_FULL_NAMES[code] || CLASSES[classLevel] || classLevel || 'ไม่ระบุห้อง';
    return room ? `${fullLevel}/${room}` : fullLevel;
};

const flagColor: Record<FlagType, string> = {
    '0': 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-rose-200 dark:border-rose-500/20',
    'ร': 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    'มส': 'bg-slate-700 text-white dark:bg-slate-600 border-slate-700 dark:border-slate-600',
    'มผ': 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400 border-purple-200 dark:border-purple-500/20',
};

// ─── PDF Document ───────────────────────────────────────────────
const pdfStyles = StyleSheet.create({
    page: { paddingTop: 40, paddingRight: 40, paddingBottom: 46, paddingLeft: 40, fontFamily: 'TH Sarabun PSK', fontSize: 12, color: '#000' },
    header: { alignItems: 'center', marginBottom: 2 },
    logo: { width: 60, height: 60, objectFit: 'contain', marginBottom: 6 },
    reportTitle: { fontSize: 15, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
    schoolTitle: { fontSize: 13.5, fontWeight: 'bold', textAlign: 'center' },
    roomTitle: { marginTop: 8, marginBottom: 4, fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
    table: { width: '100%', borderTopWidth: 0.8, borderLeftWidth: 0.8, borderColor: '#000' },
    row: { flexDirection: 'row', minHeight: 18 },
    headerRow: { minHeight: 22, backgroundColor: '#f3f4f6' },
    cell: { borderRightWidth: 0.8, borderBottomWidth: 0.8, borderColor: '#000', paddingHorizontal: 3, paddingVertical: 2, justifyContent: 'center' },
    headerText: { fontSize: 9, fontWeight: 'bold', textAlign: 'center', lineHeight: 1.2 },
    bodyTextCenter: { fontSize: 9.5, textAlign: 'center' },
    bodyTextLeft: { fontSize: 9.5, textAlign: 'left' },
    colIndex: { width: '5%' },
    colStudentId: { width: '9%' },
    colName: { width: '15%' },
    colTerm: { width: '7%' },
    colCourse: { width: '32%' },
    colCredit: { width: '6%' },
    colGrade: { width: '6%' },
    colTeacher: { width: '20%' },
    signSection: { marginTop: 30, alignItems: 'center' },
    signRow: { flexDirection: 'row', alignItems: 'flex-end', width: 260, justifyContent: 'center' },
    signPrefix: { fontSize: 11 },
    signDotsCol: { width: 120 },
    signDotsLine: { borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'dotted', height: 12 },
    signName: { fontSize: 11, marginTop: 4, textAlign: 'center' },
    signRole: { fontSize: 11, marginTop: 2, textAlign: 'center' },
    signDate: { fontSize: 11, marginTop: 2, textAlign: 'center' },
    pageNumber: { position: 'absolute', right: 40, bottom: 26, fontSize: 10 }
});

interface PdfRow {
    showStudentInfo: boolean;
    showTerm: boolean;
    number: string;
    studentCode: string;
    name: string;
    term: string;
    courseLabel: string;
    credits: number;
    grade: FlagType;
    teacherName: string;
}

interface PdfRoomGroup {
    title: string;
    rows: PdfRow[];
}

const ZeroRMsPdfDocument: React.FC<{
    groups: PdfRoomGroup[];
    schoolName: string;
    logoUrl?: string;
    directorName: string;
}> = ({ groups, schoolName, logoUrl, directorName }) => {
    const logoSrc = logoUrl || '/pwa-512x512.png';
    return (
        <Document>
            <Page size="A4" style={pdfStyles.page}>
                <View style={pdfStyles.header}>
                    <Image src={logoSrc} style={pdfStyles.logo} />
                    <Text style={pdfStyles.reportTitle}>ประกาศผลการเรียน 0 ร มส มผ</Text>
                    <Text style={pdfStyles.schoolTitle}>{schoolName}</Text>
                </View>

                {groups.map((group, gIdx) => (
                    <View key={gIdx} wrap={false}>
                        <Text style={pdfStyles.roomTitle}>{group.title}</Text>
                        <View style={pdfStyles.table}>
                            <View style={[pdfStyles.row, pdfStyles.headerRow]}>
                                <View style={[pdfStyles.cell, pdfStyles.colIndex]}><Text style={pdfStyles.headerText}>เลขที่</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colStudentId]}><Text style={pdfStyles.headerText}>เลขประจำตัว</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colName]}><Text style={pdfStyles.headerText}>ชื่อ นามสกุล</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colTerm]}><Text style={pdfStyles.headerText}>ปี/เทอม</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colCourse]}><Text style={pdfStyles.headerText}>รหัส วิชา</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colCredit]}><Text style={pdfStyles.headerText}>นก.</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colGrade]}><Text style={pdfStyles.headerText}>เกรด</Text></View>
                                <View style={[pdfStyles.cell, pdfStyles.colTeacher]}><Text style={pdfStyles.headerText}>ผู้สอน</Text></View>
                            </View>

                            {group.rows.map((r, rIdx) => (
                                <View key={rIdx} style={pdfStyles.row} wrap={false}>
                                    <View style={[pdfStyles.cell, pdfStyles.colIndex]}><Text style={pdfStyles.bodyTextCenter}>{r.showStudentInfo ? r.number : ''}</Text></View>
                                    <View style={[pdfStyles.cell, pdfStyles.colStudentId]}><Text style={pdfStyles.bodyTextCenter}>{r.showStudentInfo ? r.studentCode : ''}</Text></View>
                                    <View style={[pdfStyles.cell, pdfStyles.colName]}><Text style={pdfStyles.bodyTextLeft}>{r.showStudentInfo ? r.name : ''}</Text></View>
                                    <View style={[pdfStyles.cell, pdfStyles.colTerm]}><Text style={pdfStyles.bodyTextCenter}>{r.showTerm ? r.term : ''}</Text></View>
                                    <View style={[pdfStyles.cell, pdfStyles.colCourse]}><Text style={pdfStyles.bodyTextLeft}>{r.courseLabel}</Text></View>
                                    <View style={[pdfStyles.cell, pdfStyles.colCredit]}><Text style={pdfStyles.bodyTextCenter}>{r.credits}</Text></View>
                                    <View style={[pdfStyles.cell, pdfStyles.colGrade]}><Text style={pdfStyles.bodyTextCenter}>{r.grade}</Text></View>
                                    <View style={[pdfStyles.cell, pdfStyles.colTeacher]}><Text style={pdfStyles.bodyTextLeft}>{r.teacherName}</Text></View>
                                </View>
                            ))}

                            {group.rows.length === 0 && (
                                <View style={pdfStyles.row}>
                                    <View style={[pdfStyles.cell, { width: '100%' }]}><Text style={pdfStyles.bodyTextCenter}>ไม่พบข้อมูล</Text></View>
                                </View>
                            )}
                        </View>
                    </View>
                ))}

                <View style={pdfStyles.signSection} wrap={false}>
                    <View style={pdfStyles.signRow}>
                        <Text style={pdfStyles.signPrefix}>ลงชื่อ</Text>
                        <View style={pdfStyles.signDotsCol}><View style={pdfStyles.signDotsLine} /></View>
                        <Text style={pdfStyles.signPrefix}></Text>
                    </View>
                    <Text style={pdfStyles.signName}>( {directorName || '.........................................'} )</Text>
                    <Text style={pdfStyles.signRole}>ผู้อำนวยการ</Text>
                    <Text style={pdfStyles.signDate}>{getThaiExportDateLabel()}</Text>
                </View>

                <Text fixed style={pdfStyles.pageNumber} render={({ pageNumber, totalPages }) => `หน้าที่ ${pageNumber} จาก ${totalPages} หน้า`} />
            </Page>
        </Document>
    );
};

const buildPdfGroups = (students: StudentFlagRow[]): PdfRoomGroup[] => {
    const groupsMap = new Map<string, StudentFlagRow[]>();
    students.forEach(s => {
        const key = `${s.classLevel}|${s.room}`;
        if (!groupsMap.has(key)) groupsMap.set(key, []);
        groupsMap.get(key)!.push(s);
    });

    const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
        const [levelA, roomA] = a.split('|');
        const [levelB, roomB] = b.split('|');
        const rankDiff = getClassLevelRank(levelA) - getClassLevelRank(levelB);
        if (rankDiff !== 0) return rankDiff;
        return (Number(roomA) || 999) - (Number(roomB) || 999);
    });

    return sortedKeys.map(key => {
        const [levelKey, roomKey] = key.split('|');
        const groupStudents = groupsMap.get(key)!;
        const rows: PdfRow[] = [];
        groupStudents.forEach(s => {
            let lastTerm = '';
            s.flags.forEach((f, idx) => {
                const term = `${f.academicYear}/${f.semester}`;
                rows.push({
                    showStudentInfo: idx === 0,
                    showTerm: term !== lastTerm,
                    number: s.number || '-',
                    studentCode: s.studentCode,
                    name: s.name,
                    term,
                    courseLabel: `${f.courseCode} ${f.courseTitle}`,
                    credits: f.credits,
                    grade: f.grade,
                    teacherName: f.teacherName,
                });
                lastTerm = term;
            });
        });
        return { title: `ชั้น${getFullClassLabel(levelKey, '')}  ห้องที่ ${roomKey || '-'}`, rows };
    });
};

// ─── Page Component ───────────────────────────────────────────────
const SummaryCard = ({ title, value, unit, icon, color }: { title: string, value: string | number, unit?: string, icon: React.ReactNode, color: string }) => {
    const variants: Record<string, string> = {
        indigo: "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100/50 dark:border-indigo-500/20",
        rose: "text-rose-500 bg-rose-50 dark:bg-rose-500/10 border-rose-100/50 dark:border-rose-500/20",
        amber: "text-amber-500 bg-amber-50 dark:bg-amber-500/10 border-amber-100/50 dark:border-amber-500/20",
        slate: "text-slate-500 bg-slate-50 dark:bg-slate-500/10 border-slate-100/50 dark:border-slate-500/20",
        purple: "text-purple-500 bg-purple-50 dark:bg-purple-500/10 border-purple-100/50 dark:border-purple-500/20",
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

const ZeroRMsGradeReportPage: React.FC = () => {
    const { user: currentUser } = usePermissions();
    const schoolId = (currentUser as any)?.schoolId;
    const dispatch = useDispatch<AppDispatch>();
    const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
    const teacherMap = useSelector((state: RootState) => (state as any).userMap?.teachers || {});

    const [loading, setLoading] = useState(false);
    const [pdfGenerating, setPdfGenerating] = useState(false);

    const [selectedClassLevel, setSelectedClassLevel] = useState<any>(() => {
        const saved = sessionStorage.getItem('zrm_classLevel');
        return saved ? JSON.parse(saved) : { value: 'all', label: 'ทุกระดับชั้น' };
    });
    const [selectedRoom, setSelectedRoom] = useState<any>(() => {
        const saved = sessionStorage.getItem('zrm_room');
        return saved ? JSON.parse(saved) : { value: 'all', label: 'ทุกห้องเรียน' };
    });
    const [activeFlagTypes, setActiveFlagTypes] = useState<Set<FlagType>>(new Set(FLAG_TYPES));

    const [flaggedStudents, setFlaggedStudents] = useState<StudentFlagRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));

    useEffect(() => {
        if (selectedClassLevel) sessionStorage.setItem('zrm_classLevel', JSON.stringify(selectedClassLevel));
        if (selectedRoom) sessionStorage.setItem('zrm_room', JSON.stringify(selectedRoom));
    }, [selectedClassLevel, selectedRoom]);

    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') setIsDarkMode(document.documentElement.classList.contains('dark'));
            });
        });
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (schoolId) dispatch(fetchTeachersMap(schoolId));
    }, [schoolId, dispatch]);

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
        menu: (base: any) => ({ ...base, backgroundColor: isDarkMode ? '#1a1b1e' : '#fff', borderRadius: '1rem', zIndex: 50, border: isDarkMode ? '1px solid #374151' : '1px solid #e2e8f0' }),
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

    const classLevelOptions = useMemo(() => {
        const availableClassOptions = schoolSettings?.availableClassOptions || [];
        const classKeys: string[] = schoolSettings?.classKeys || [];
        const options: { value: string; label: string }[] = [{ value: 'all', label: 'ทุกระดับชั้น' }];

        availableClassOptions.forEach(([key, label]: [string, string]) => {
            options.push({ value: key, label });
            if (key === 'm3') options.push({ value: 'junior_high', label: 'ม.ต้น' });
            if (key === 'm6') options.push({ value: 'senior_high', label: 'ม.ปลาย' });
        });

        const hasJunior = classKeys.some(k => ['m1', 'm2', 'm3'].includes(k));
        const hasSenior = classKeys.some(k => ['m4', 'm5', 'm6'].includes(k));
        if (hasJunior && !options.some(o => o.value === 'junior_high')) options.push({ value: 'junior_high', label: 'ม.ต้น' });
        if (hasSenior && !options.some(o => o.value === 'senior_high')) options.push({ value: 'senior_high', label: 'ม.ปลาย' });

        return options;
    }, [schoolSettings]);

    const getTeacherDisplayName = (teacherId?: string, fallbackName?: string) => {
        if (fallbackName) return `ครู${fallbackName}`;
        const t = teacherId ? teacherMap[teacherId] : null;
        if (t?.firstName) return `ครู${t.firstName}`;
        if (t?.name) return t.name;
        return '-';
    };

    const handleFetchData = async () => {
        if (!schoolId) return;
        setLoading(true);
        setError(null);
        try {
            // 1. รายชื่อนักเรียนเป้าหมาย — ดึงทั้งหมดแล้วกรองระดับชั้นฝั่ง client ด้วย matchesClassLevel
            // (ห้ามใช้ where('classLevel','==',...) เทียบกับ selectedClassLevel.value ตรงๆ เพราะ
            // ค่า classLevel ที่บันทึกจริงในเอกสารนักเรียนเป็น "ป้ายชื่อ" ภาษาไทย เช่น "ม.2"
            // ไม่ใช่ "รหัส" เช่น "m2" ที่ตัวกรองในหน้านี้ใช้ — เทียบแบบ equality ตรงๆ จะได้ผลลัพธ์ว่างเปล่าเสมอ)
            const studentsRef = collection(db, 'school-settings', schoolId, 'students');
            const studentSnap = await getDocs(studentsRef);

            const studentInfoMap: Record<string, { code: string; name: string; number: string; classLevel: string; room: string }> = {};
            studentSnap.docs.forEach(sDoc => {
                const sData: any = sDoc.data();
                if (!matchesClassLevel(sData.classLevel, selectedClassLevel.value)) return;
                const name = sData.firstName
                    ? `${sData.title || sData.prefix || ''}${sData.firstName} ${sData.lastName || ''}`.trim()
                    : (sData.name || 'ไม่พบข้อมูลนักเรียน');
                studentInfoMap[sDoc.id] = {
                    code: String(sData.studentCode || sData.studentId || sData.code || sData['รหัสนักเรียน'] || '-'),
                    name,
                    number: String(sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '').trim(),
                    classLevel: sData.classLevel || '',
                    room: sData.room || '',
                };
            });
            const studentIds = Object.keys(studentInfoMap);

            if (studentIds.length === 0) {
                setFlaggedStudents([]);
                setLoading(false);
                return;
            }

            // 2. ข้อมูลอ้างอิง: รายวิชา, มอบหมายครู, ชุมนุม, กิจกรรมพัฒนาผู้เรียน (ดึงทั้งหมดครั้งเดียว)
            const [courseSnap, assignmentSnap, clubSnap, learnerActivitySnap] = await Promise.all([
                getDocs(collection(db, 'school-settings', schoolId, 'courses')),
                getDocs(collection(db, 'school-settings', schoolId, 'course_assignments')),
                getDocs(collection(db, 'school-settings', schoolId, 'clubs')),
                getDocs(collection(db, 'school-settings', schoolId, 'learner-activities')),
            ]);

            const courseMap: Record<string, Course> = {};
            const courseCodeToId: Record<string, string> = {};
            courseSnap.docs.forEach(d => {
                const data: any = d.data();
                courseMap[d.id] = { id: d.id, code: data.code || '', title: data.title || '', classId: data.classId, credits: data.credits, isActive: data.isActive ?? true };
                if (data.code) courseCodeToId[data.code] = d.id;
            });

            const assignmentsByCourse: Record<string, any[]> = {};
            assignmentSnap.docs.forEach(d => {
                const data: any = d.data();
                if (!data.courseId) return;
                if (!assignmentsByCourse[data.courseId]) assignmentsByCourse[data.courseId] = [];
                assignmentsByCourse[data.courseId].push(data);
            });

            const clubDocByCourseId: Record<string, string> = {};
            clubSnap.docs.forEach(d => {
                const data: any = d.data();
                const linked = data.linkedCourseId || data.courseId;
                if (linked) clubDocByCourseId[linked] = d.id;
                if (courseMap[d.id]) clubDocByCourseId[d.id] = d.id; // course-based: doc id === course id
            });

            const activityDocByCourseId: Record<string, string> = {};
            learnerActivitySnap.docs.forEach(d => {
                const data: any = d.data();
                const linked = data.courseId;
                if (linked) activityDocByCourseId[linked] = d.id;
                if (courseMap[d.id]) activityDocByCourseId[d.id] = d.id; // course-based: doc id === course id
            });

            // 3. ดึงประวัติการลงทะเบียนทั้งหมดของนักเรียนกลุ่มเป้าหมาย (ทุกปี/ทุกเทอมที่เคยเรียนมา)
            const enrollRef = collection(db, 'school-settings', schoolId, 'enrollments');
            const enrollments: EnrollmentRecord[] = [];
            const batchSize = 30;
            for (let i = 0; i < studentIds.length; i += batchSize) {
                const batchIds = studentIds.slice(i, i + batchSize);
                const eSnap = await getDocs(query(enrollRef, where('studentId', 'in', batchIds)));
                eSnap.forEach(eDoc => {
                    const data: any = eDoc.data();
                    const courseId = data.courseId || (data.courseCode ? courseCodeToId[data.courseCode] : undefined);
                    if (!courseId || !courseMap[courseId]) return;
                    if (!data.academicYear || !data.semester) return;
                    enrollments.push({ studentId: data.studentId, courseId, academicYear: String(data.academicYear), semester: String(data.semester) });
                });
            }

            const regularEnrollments = enrollments.filter(e => !isActivityCourseCode(courseMap[e.courseId]?.code));
            const activityEnrollments = enrollments.filter(e => isActivityCourseCode(courseMap[e.courseId]?.code));

            // 4. เกรด 0/ร/มส ของวิชาปกติ — อ่าน grades subcollection ของทุกวิชาที่เกี่ยวข้องเพียงครั้งเดียว
            const uniqueRegularCourseIds = Array.from(new Set(regularEnrollments.map(e => e.courseId)));
            const regularGradeSnaps = await Promise.all(
                uniqueRegularCourseIds.map(cid => getDocs(collection(db, 'school-settings', schoolId, 'courses', cid, 'grades')))
            );
            const gradesByCourse: Record<string, Record<string, string>> = {};
            uniqueRegularCourseIds.forEach((cid, idx) => {
                const map: Record<string, string> = {};
                regularGradeSnaps[idx].forEach(gDoc => {
                    const value = String((gDoc.data() as any).grade || '').trim();
                    if (value) map[gDoc.id] = value;
                });
                gradesByCourse[cid] = map;
            });

            const getTeacherForAssignment = (courseId: string, academicYear: string, semester: string) => {
                const matches = (assignmentsByCourse[courseId] || []).filter(a => String(a.academicYear) === academicYear && String(a.semester) === semester);
                const firstAssignment = matches[0]?.teacherAssignments?.[0];
                if (!firstAssignment) return '-';
                return getTeacherDisplayName(firstAssignment.teacherId, firstAssignment.teacherName);
            };

            const flaggedByStudent: Record<string, FlaggedCourse[]> = {};
            const addFlag = (studentId: string, flag: FlaggedCourse) => {
                if (!flaggedByStudent[studentId]) flaggedByStudent[studentId] = [];
                flaggedByStudent[studentId].push(flag);
            };

            regularEnrollments.forEach(e => {
                const grade = gradesByCourse[e.courseId]?.[e.studentId];
                if (grade !== '0' && grade !== 'ร' && grade !== 'มส') return;
                const course = courseMap[e.courseId];
                addFlag(e.studentId, {
                    courseId: e.courseId,
                    courseCode: course.code,
                    courseTitle: course.title,
                    credits: course.credits ?? 0,
                    grade: grade as FlagType,
                    academicYear: e.academicYear,
                    semester: e.semester,
                    teacherName: getTeacherForAssignment(e.courseId, e.academicYear, e.semester),
                });
            });

            // 5. ผลประเมิน "มผ" ของวิชากิจกรรมพัฒนาผู้เรียน — รวบรวม path เอกสารประเมินที่ต้องอ่านแบบไม่ซ้ำก่อน แล้วค่อยอ่านพร้อมกัน
            const evalDocPaths = new Map<string, { collectionName: string; activityDocId: string; evalDocId: string }>();
            const activityTermKey = (courseId: string, year: string, semester: string) => `${courseId}|${year}|${semester}`;
            const scopesByTermKey: Record<string, LearnerActivityTeacherScope[]> = {};

            activityEnrollments.forEach(e => {
                const courseId = e.courseId;
                const clubDocId = clubDocByCourseId[courseId];
                const activityDocId = activityDocByCourseId[courseId];

                if (clubDocId) {
                    const evalDocId = `${e.academicYear}_${e.semester}`;
                    evalDocPaths.set(`clubs/${clubDocId}/${evalDocId}`, { collectionName: 'clubs', activityDocId: clubDocId, evalDocId });
                } else if (activityDocId) {
                    const termKey = activityTermKey(courseId, e.academicYear, e.semester);
                    if (!scopesByTermKey[termKey]) {
                        const assignment = (assignmentsByCourse[courseId] || []).find(a => String(a.academicYear) === e.academicYear && String(a.semester) === e.semester);
                        scopesByTermKey[termKey] = deriveTeacherScopesFromCourse({}, { id: courseId, classId: courseMap[courseId]?.classId, teacherAssignments: assignment?.teacherAssignments || [] }, teacherMap);
                    }
                    const scopes = scopesByTermKey[termKey];
                    const candidateKeys = scopes.length > 0 ? scopes.map(s => s.key) : [undefined];
                    candidateKeys.forEach(scopeKey => {
                        const evalDocId = buildLearnerActivityEvaluationDocId(e.academicYear, e.semester, scopeKey);
                        evalDocPaths.set(`learner-activities/${activityDocId}/${evalDocId}`, { collectionName: 'learner-activities', activityDocId, evalDocId });
                    });
                }
            });

            const evalPathList = Array.from(evalDocPaths.entries());
            const evalDocs = await Promise.all(
                evalPathList.map(([, info]) => getDoc(doc(db, 'school-settings', schoolId, info.collectionName, info.activityDocId, 'evaluations', info.evalDocId)))
            );
            const evalResultsByPath: Record<string, Record<string, { status: string }>> = {};
            evalPathList.forEach(([pathKey], idx) => {
                const snap = evalDocs[idx];
                if (snap.exists()) evalResultsByPath[pathKey] = (snap.data() as any).results || {};
            });

            activityEnrollments.forEach(e => {
                const courseId = e.courseId;
                const course = courseMap[courseId];
                const clubDocId = clubDocByCourseId[courseId];
                const activityDocId = activityDocByCourseId[courseId];
                let failed = false;
                let teacherName = '-';

                if (clubDocId) {
                    const evalDocId = `${e.academicYear}_${e.semester}`;
                    const results = evalResultsByPath[`clubs/${clubDocId}/${evalDocId}`];
                    failed = results?.[e.studentId]?.status === 'failed';
                    teacherName = getTeacherForAssignment(courseId, e.academicYear, e.semester);
                } else if (activityDocId) {
                    const termKey = activityTermKey(courseId, e.academicYear, e.semester);
                    const scopes = scopesByTermKey[termKey] || [];
                    const candidateKeys = scopes.length > 0 ? scopes.map(s => s.key) : [undefined];
                    for (const scopeKey of candidateKeys) {
                        const evalDocId = buildLearnerActivityEvaluationDocId(e.academicYear, e.semester, scopeKey);
                        const results = evalResultsByPath[`learner-activities/${activityDocId}/${evalDocId}`];
                        if (results?.[e.studentId]) {
                            failed = results[e.studentId].status === 'failed';
                            const matchedScope = scopes.find(s => s.key === scopeKey);
                            teacherName = getTeacherDisplayName(matchedScope?.teacherId, matchedScope?.teacherName) !== '-'
                                ? getTeacherDisplayName(matchedScope?.teacherId, matchedScope?.teacherName)
                                : getTeacherForAssignment(courseId, e.academicYear, e.semester);
                            break;
                        }
                    }
                } else {
                    return; // ไม่พบระบบประเมินที่เชื่อมโยงกับวิชานี้ — ข้าม (ไม่สร้างข้อมูลเดา)
                }

                if (!failed || !course) return;
                addFlag(e.studentId, {
                    courseId,
                    courseCode: course.code,
                    courseTitle: course.title,
                    credits: course.credits ?? 0,
                    grade: 'มผ',
                    academicYear: e.academicYear,
                    semester: e.semester,
                    teacherName,
                });
            });

            const list: StudentFlagRow[] = Object.keys(flaggedByStudent).map(sid => {
                const info = studentInfoMap[sid];
                const flags = [...flaggedByStudent[sid]].sort((a, b) => {
                    if (a.academicYear !== b.academicYear) return a.academicYear.localeCompare(b.academicYear);
                    if (a.semester !== b.semester) return a.semester.localeCompare(b.semester);
                    return a.courseCode.localeCompare(b.courseCode, 'th', { numeric: true });
                });
                return {
                    id: sid,
                    studentCode: info?.code || '-',
                    number: info?.number || '',
                    name: info?.name || 'ไม่พบข้อมูลนักเรียน',
                    classLevel: info?.classLevel || '',
                    room: info?.room || '',
                    flags,
                };
            });

            setFlaggedStudents(list);
        } catch (err: any) {
            console.error('Error fetching 0/ร/มส/มผ report:', err);
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
    }, [schoolId, selectedClassLevel]);

    const roomOptions = useMemo(() => {
        const fixedRooms = Array.from({ length: 20 }, (_, i) => String(i + 1));
        const activeRooms = new Set<string>();
        flaggedStudents.forEach(s => { if (s.room) activeRooms.add(String(s.room)); });
        const combinedRooms = new Set([...fixedRooms, ...Array.from(activeRooms)]);
        const sortedList = Array.from(combinedRooms).sort((a, b) => Number(a) - Number(b));
        return [{ value: 'all', label: 'ทุกห้องเรียน' }, ...sortedList.map(r => ({ value: r, label: `ห้อง ${r}` }))];
    }, [flaggedStudents]);

    const toggleFlagType = (type: FlagType) => {
        setActiveFlagTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                if (next.size === 1) return next; // ต้องเปิดอย่างน้อย 1 ประเภทเสมอ
                next.delete(type);
            } else {
                next.add(type);
            }
            return next;
        });
    };

    const filteredStudents = useMemo(() => {
        const list = flaggedStudents
            .filter(s => selectedRoom.value === 'all' || String(s.room) === String(selectedRoom.value))
            .filter(s => matchesClassLevel(s.classLevel, selectedClassLevel.value))
            .map(s => ({ ...s, flags: s.flags.filter(f => activeFlagTypes.has(f.grade)) }))
            .filter(s => s.flags.length > 0);

        return list.sort((a, b) => {
            const rankA = getClassLevelRank(a.classLevel);
            const rankB = getClassLevelRank(b.classLevel);
            if (rankA !== rankB) return rankA - rankB;
            const roomA = Number(a.room) || 999;
            const roomB = Number(b.room) || 999;
            if (roomA !== roomB) return roomA - roomB;
            const numA = parseInt(a.number) || 999;
            const numB = parseInt(b.number) || 999;
            if (numA !== numB) return numA - numB;
            return a.name.localeCompare(b.name, 'th');
        });
    }, [flaggedStudents, selectedRoom, selectedClassLevel, activeFlagTypes]);

    const totalStats = useMemo(() => {
        let zeroCount = 0, rCount = 0, msCount = 0, mpCount = 0;
        filteredStudents.forEach(s => s.flags.forEach(f => {
            if (f.grade === '0') zeroCount++;
            else if (f.grade === 'ร') rCount++;
            else if (f.grade === 'มส') msCount++;
            else mpCount++;
        }));
        return { studentCount: filteredStudents.length, zeroCount, rCount, msCount, mpCount };
    }, [filteredStudents]);

    const generateAndSavePdf = async (students: StudentFlagRow[], fileName: string) => {
        const groups = buildPdfGroups(students);
        const pdfDoc = (
            <ZeroRMsPdfDocument
                groups={groups}
                schoolName={schoolSettings.schoolName || 'โรงเรียน'}
                logoUrl={schoolSettings.logoUrl}
                directorName={[schoolSettings.directorPrefix, schoolSettings.directorName].filter(Boolean).join(' ')}
            />
        );
        const blob = await pdf(pdfDoc).toBlob();
        saveAs(blob, fileName);
    };

    const handleExportPdf = async () => {
        setPdfGenerating(true);
        try {
            await generateAndSavePdf(filteredStudents, `ประกาศผลการเรียน_0_ร_มส_มผ.pdf`);
        } catch (err) {
            console.error('Error exporting 0/ร/มส/มผ report PDF:', err);
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
                                <BackButton to="/academic/hub/evaluation" />
                                <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-2xl shadow-sm border border-rose-100 dark:border-rose-500/20">
                                    <AlertTriangle className="text-rose-600 dark:text-rose-400" size={24} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                        รายงานการติด 0 ร มส มผ
                                    </h1>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold pt-0.5 flex items-center gap-1.5">
                                        <History size={12} /> สะสมทุกภาคเรียนที่ผ่านมา จนถึงปัจจุบัน
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
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
                                disabled={filteredStudents.length === 0 || pdfGenerating}
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
                            <div className="lg:col-span-4 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <GraduationCap size={12} /> ระดับชั้น
                                </span>
                                <Select options={classLevelOptions} value={selectedClassLevel} onChange={setSelectedClassLevel} styles={selectStyles} isSearchable={false} />
                            </div>
                            <div className="lg:col-span-3 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <Users size={12} /> ห้องเรียน
                                </span>
                                <Select options={roomOptions} value={selectedRoom} onChange={setSelectedRoom} styles={selectStyles} isSearchable={false} />
                            </div>
                            <div className="lg:col-span-5 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <ListChecks size={12} /> แสดงเฉพาะผล
                                </span>
                                <div className="flex gap-2">
                                    {FLAG_TYPES.map(type => (
                                        <button
                                            key={type}
                                            onClick={() => toggleFlagType(type)}
                                            className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-black border transition-all ${activeFlagTypes.has(type)
                                                ? flagColor[type]
                                                : 'bg-gray-50 dark:bg-white/5 text-gray-300 dark:text-gray-700 border-gray-200 dark:border-gray-800'}`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                        <SummaryCard title="นักเรียนที่ติด" value={totalStats.studentCount} icon={<Users size={20} />} unit="คน" color="indigo" />
                        <SummaryCard title="ติด 0" value={totalStats.zeroCount} icon={<AlertTriangle size={20} />} unit="ครั้ง" color="rose" />
                        <SummaryCard title="ติด ร" value={totalStats.rCount} icon={<AlertTriangle size={20} />} unit="ครั้ง" color="amber" />
                        <SummaryCard title="ติด มส" value={totalStats.msCount} icon={<AlertTriangle size={20} />} unit="ครั้ง" color="slate" />
                        <SummaryCard title="ติด มผ" value={totalStats.mpCount} icon={<AlertTriangle size={20} />} unit="ครั้ง" color="purple" />
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
                                            <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-28">ชั้น/ห้อง</th>
                                            <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest min-w-[300px]">รายวิชาที่ติด (ปี/เทอม)</th>
                                            <th className="px-4 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-20">รวม</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                        {filteredStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-20 text-center">
                                                    <div className="flex flex-col items-center gap-3 opacity-30">
                                                        <Users size={48} />
                                                        <p className="font-bold text-sm">ไม่พบนักเรียนที่ติด 0 ร มส มผ ตามเงื่อนไขที่เลือก</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : filteredStudents.map((s) => (
                                            <tr key={s.id} className="group hover:bg-gray-50/50 dark:hover:bg-indigo-500/[0.02] transition-colors align-top">
                                                <td className="px-4 py-4 text-center">
                                                    <span className="text-sm font-black text-gray-400 dark:text-gray-700 group-hover:text-indigo-600 transition-colors tabular-nums">{s.number || '-'}</span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 shadow-sm">
                                                            <User size={18} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-bold truncate text-gray-900 dark:text-white">{s.name}</p>
                                                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-600 tracking-tight italic">รหัส: {s.studentCode}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <span className="text-[12px] font-bold text-gray-500 dark:text-gray-400">{getFullClassLabel(s.classLevel, s.room)}</span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {s.flags.map((f, i) => (
                                                            <div key={`${f.courseId}-${f.academicYear}-${f.semester}-${i}`} className="flex items-center gap-2">
                                                                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black border ${flagColor[f.grade]}`}>{f.grade}</span>
                                                                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate" title={f.courseTitle}>{f.courseCode} {f.courseTitle}</span>
                                                                <span className="shrink-0 text-[10px] font-bold text-gray-400 dark:text-gray-600">{f.academicYear}/{f.semester}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <span className="text-sm font-black tabular-nums text-rose-600 dark:text-rose-400">{s.flags.length}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default ZeroRMsGradeReportPage;
