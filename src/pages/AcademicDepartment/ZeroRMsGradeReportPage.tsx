import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, setDoc, updateDoc, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf, PDFViewer } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import {
    AlertTriangle,
    Users,
    GraduationCap,
    Loader2,
    AlertCircle,
    Download,
    RefreshCw,
    History,
    X,
    FileDown,
    Upload,
    FileWarning,
    Search,
    Pencil,
    Clock,
    CheckCircle2,
    MessageSquare,
    Plus
} from 'lucide-react';
import BackButton from "@/components/Shared/BackButton";
import AcademicYearSemesterFilter from "@/components/Shared/AcademicYearSemesterFilter";
import SkeletonLoader from '@/components/SkeletonLoader';
import Select from 'react-select';
import { CLASSES, CLASS_FULL_NAMES, getClassLevelRank } from '@/utils/schoolUtils';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import {
    FlagType,
    FlaggedCourse,
    StudentFlagRow,
    fetchFlaggedStudents,
    isActivityCourseCode,
    fetchAvailableAcademicYears,
    calculateRemediationGrade,
    getMinistryRemediationGradeOptions,
} from '@/utils/remediationUtils';

Font.register({
    family: 'TH Sarabun PSK',
    fonts: [
        { src: '/fonts/THSarabunNew.ttf' },
        { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' }
    ]
});

const THAI_FULL_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// วันที่ออกเอกสาร ใช้วันที่ ณ ตอนสร้าง/ส่งออก PDF จริง ไม่ใช่ช่องว่างให้กรอกเอง
const getThaiExportDateLabel = () => {
    const now = new Date();
    return `วันที่ ${now.getDate()} เดือน ${THAI_FULL_MONTHS[now.getMonth()]} พ.ศ. ${now.getFullYear() + 543}`;
};

// ─── ตารางรายชื่อนักเรียนทั้งหมดต่อวิชา (ออกแบบตามหน้าจอ "ผลการเรียน" ของ SGS เดิม) ───────
interface AssessmentItem {
    id?: string;
    name?: string;
    maxScore?: number;
}

interface CourseConfig {
    id: string;
    code: string;
    title: string;
    classId?: string | string[];
    room?: string[];
    formativeAssessments?: AssessmentItem[];
    midtermWeight?: number;
    finalWeight?: number;
}

interface GradeRecord {
    midterm?: number | string;
    final?: number | string;
    status?: string;
    grade?: string;
    remark?: string;
    total?: number;
    formativeDetails?: Record<string, number | string>;
}

// สูตรตัดเกรดจากคะแนนรวม — เหมือนกับ SgsExportPage.tsx/PostMidtermScoreEntryPage.tsx/GradeBookPage.tsx
const calculateGrade = (total: number): string => {
    if (total >= 80) return '4';
    if (total >= 75) return '3.5';
    if (total >= 70) return '3';
    if (total >= 65) return '2.5';
    if (total >= 60) return '2';
    if (total >= 55) return '1.5';
    if (total >= 50) return '1';
    return '0';
};

// รวมคะแนนดิบของนักเรียนคนหนึ่งในวิชาปกติ (คะแนนเก็บทุกรายการที่ตั้งค่าไว้จริงใน formativeAssessments +
// กลางภาค + ปลายภาค) ใช้ร่วมกันทั้งตอนโหลดตารางรายชื่อ (loadRoster) และตอนคำนวณเกรดใหม่หลังลบ Remark "ร"
// (handleSetRemark) — ต้อง key คะแนนเก็บด้วย assessment.id || assessment.name แบบเดียวกับ getAssessmentKey
// ใน FormativeScoreEntryPage.tsx/PostMidtermScoreEntryPage.tsx/GradeBookPage.tsx (getConfiguredFormativeTotal)
// ทุกตัวอักษร ห้ามกรองด้วย pattern "S{เลข}" เหมือนเดิม เพราะรายการคะแนนเก็บจริงไม่ได้บังคับตั้งชื่อ/id
// แบบนั้นเสมอไป (ใช้ assessment.term แยก pre/post-midterm แทน) — ถ้ากรองด้วย pattern จะได้ total ต่ำกว่าจริง
// ต่ำกว่าที่ 3 หน้านั้นแสดง ทำให้ตัดเกรดผิดจากคะแนนจริงที่ครูกรอกไว้
const computeCourseTotal = (course: CourseConfig, record: GradeRecord): number => {
    if (typeof record.total === 'number' && !isNaN(record.total) && record.total > 0) {
        return record.total;
    }
    const details = record.formativeDetails || {};
    const formativeTotal = (course.formativeAssessments || []).reduce((sum, a) => {
        const key = a.id || a.name;
        if (!key) return sum;
        const raw = details[key];
        return sum + (raw === undefined || raw === '' ? 0 : Number(raw) || 0);
    }, 0);
    const midterm = Number(record.midterm) || 0;
    const final = Number(record.final) || 0;
    return formativeTotal + midterm + final;
};

interface RosterRow {
    key: string;
    studentId: string;
    studentCode: string;
    name: string;
    classLevel: string;
    room: string;
    number: string;
    isActivity: boolean;
    // คะแนนย่อยรายสัปดาห์ (S1-S18) — '' แปลว่าวิชานี้ไม่ได้ตั้งค่าคาบประเมินสัปดาห์นั้นไว้ใน score-configuration
    weeklyPre?: (number | '')[]; // 1-9 (ก่อนกลางภาค)
    weeklyPost?: (number | '')[]; // 10-18 (หลังกลางภาค)
    preMidtermSubtotal?: number;
    postMidtermSubtotal?: number;
    midterm?: number;
    final?: number;
    total?: number;
    percent?: number;
    grade: string; // ตัวเลขเกรด, '0'/'ร'/'มส' หรือ 'ผ่าน'/'มผ' (กิจกรรม)
    isFlagged: boolean;
    teacherName: string;
    responsibleTeacherIds: string[];
    // address สำหรับเขียนผลใหม่กลับ (เฉพาะกิจกรรม)
    activityCollectionName?: 'clubs' | 'learner-activities' | 'guidance-evaluations';
    activityDocId?: string;
    evalDocId?: string;
    teacherScopeKey?: string;
    // ประเภทกิจกรรมจริงตามที่ fetchFlaggedStudents (remediationUtils.ts) จำแนกไว้ — ต้องใช้ค่านี้ตรงๆ ตอนเขียน
    // remediation_requests.flagType เสมอ ห้าม hardcode เป็น 'learner-activity' เฉยๆ ไม่งั้นชมรม/แนะแนวจะถูกบันทึก
    // flagType ผิดประเภท ทำให้หน้าอื่น (RemediationRequestsPage ฯลฯ) resolve เอกสารกลับไปผิด collection
    flagKind?: 'club' | 'learner-activity' | 'guidance';
    requestId?: string;
    requestStatus: 'no_request' | 'pending' | 'resolved';
    newResult?: string;
    // หมายเหตุประกอบผล มส/ร/มผ — ถ้ามีค่า จะซ่อนการแสดงเกรดไว้จนกว่าจะลบหมายเหตุออก
    remark?: string;
    originalFlag?: string;
}

// แถวที่จะบันทึกจริงตอนนำเข้าไฟล์ School MIS — เก็บเฉพาะเซลล์ที่แมตช์เป็น 0/ร/มส เท่านั้น
interface ImportPreviewRow {
    studentDocId: string;
    studentCode: string;
    studentName: string;
    classLevel: string;
    room: string;
    courseId: string;
    courseCode: string;
    courseTitle: string;
    grade: '0' | 'ร' | 'มส';
    // ตรวจซ้ำ: วิชาเดียวกัน + นักเรียนคนเดียวกัน (ปีการศึกษา/ภาคเรียนเดียวกันอยู่แล้วในตัวเพราะแยก courseId
    // ตามปี/เทอมเป็นเอกสารคนละใบ) — ถ้าเคยมีเกรดบันทึกไว้แล้วในคอร์สนี้ ให้ทำเครื่องหมายไว้เตือนก่อนทับข้อมูลเดิม
    isDuplicate?: boolean;
    existingGrade?: string;
}

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
    const navigate = useNavigate();
    const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
    const teacherMap = useSelector((state: RootState) => (state as any).userMap?.teachers || {});

    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [showPdfPreview, setShowPdfPreview] = useState(false);

    // นำเข้าข้อมูลจากไฟล์ School MIS (ดาวน์โหลดจาก /academic/sgs-export?misSemester=1)
    const calendarAcademicYear = useSelector((state: RootState) => state.calendar.academicYear);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importAcademicYear, setImportAcademicYear] = useState('');
    const [importYearOptions, setImportYearOptions] = useState<string[]>([]);
    const [importSemester, setImportSemester] = useState<'1' | '2'>('1');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isParsingImport, setIsParsingImport] = useState(false);
    const [importPreview, setImportPreview] = useState<ImportPreviewRow[] | null>(null);
    const [importSkippedColumns, setImportSkippedColumns] = useState<string[]>([]);
    const [importSkippedCodes, setImportSkippedCodes] = useState<string[]>([]);
    const [skipDuplicateImports, setSkipDuplicateImports] = useState(true);
    const [isSavingImport, setIsSavingImport] = useState(false);
    const [isDraggingImport, setIsDraggingImport] = useState(false);
    const importFileInputRef = React.useRef<HTMLInputElement>(null);
    const importDuplicateCount = useMemo(() => importPreview?.filter((p) => p.isDuplicate).length || 0, [importPreview]);
    const importEffectiveSaveCount = (importPreview?.length || 0) - (skipDuplicateImports ? importDuplicateCount : 0);

    const [selectedClassLevel, setSelectedClassLevel] = useState<any>(() => {
        const saved = sessionStorage.getItem('zrm_classLevel');
        return saved ? JSON.parse(saved) : { value: 'all', label: 'ทุกระดับชั้น' };
    });
    // ห้องเรียนตอนนี้ใช้กรอง "รายชื่อในวิชาที่เลือก" ไม่ใช่กรองรายชื่อที่ติดทั้งโรงเรียนแบบเดิม
    const [selectedRoom, setSelectedRoom] = useState<any>(() => {
        const saved = sessionStorage.getItem('zrm_room');
        return saved ? JSON.parse(saved) : { value: 'all', label: 'ทุกห้องเรียน' };
    });

    // ปีการศึกษา/ภาคเรียนที่ต้องการย้อนดู — ค่าเริ่มต้นเป็นปีการศึกษาปัจจุบัน (ทั้งปี) อ้างอิงจากหน้า
    // /academic/school-calendar เลือก "ทุกปีการศึกษา" เพื่อดูสะสมทุกภาคเรียนแบบเดิมได้
    const [selectedTermYear, setSelectedTermYear] = useState<string>(() => sessionStorage.getItem('zrm_termYear') ?? '');
    const [selectedTermSemester, setSelectedTermSemester] = useState<string>(() => sessionStorage.getItem('zrm_termSemester') || '');

    // ── รายชื่อนักเรียน "ทั้งหมด" ในวิชาที่เลือก (ไม่เฉพาะคนติด 0/ร/มส/มผ) ──
    const [courses, setCourses] = useState<CourseConfig[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    // วิชาที่ "ถูกลงทะเบียนจริง" แล้วเท่านั้น (ผ่าน course-assignment/course-assignment-2 ที่มีครูมอบหมายจริง
    // หรือ course-enrollment ที่มีนักเรียนลงทะเบียนแล้ว) — courses/{courseId} เป็นแค่รายวิชาหลักสูตรกลาง อาจมี
    // วิชาที่สร้างไว้แต่ยังไม่เคยมอบหมาย/ลงทะเบียนเลยก็ได้ ดรอปดาวน์นี้จึงต้องกรองซ้ำอีกชั้น (แนวทางเดียวกับ SgsExportPage.tsx)
    const [registeredCourseIds, setRegisteredCourseIds] = useState<Set<string> | null>(null);
    const [rosterSearch, setRosterSearch] = useState('');
    const [rosterRows, setRosterRows] = useState<RosterRow[]>([]);
    const [rosterLoading, setRosterLoading] = useState(false);
    const [correctingKey, setCorrectingKey] = useState<string | null>(null);
    const [remarkSavingKey, setRemarkSavingKey] = useState<string | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));

    useEffect(() => {
        if (selectedClassLevel) sessionStorage.setItem('zrm_classLevel', JSON.stringify(selectedClassLevel));
        if (selectedRoom) sessionStorage.setItem('zrm_room', JSON.stringify(selectedRoom));
    }, [selectedClassLevel, selectedRoom]);

    useEffect(() => {
        sessionStorage.setItem('zrm_termYear', selectedTermYear);
        sessionStorage.setItem('zrm_termSemester', selectedTermSemester);
    }, [selectedTermYear, selectedTermSemester]);

    // ค่าเริ่มต้นครั้งแรกที่ยังไม่เคยเลือกไว้ (ไม่มีใน sessionStorage) = ปีการศึกษาปัจจุบันจาก Redux
    useEffect(() => {
        if (sessionStorage.getItem('zrm_termYear') === null && calendarAcademicYear) {
            setSelectedTermYear(calendarAcademicYear);
        }
    }, [calendarAcademicYear]);

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

    // รายชื่อวิชาทั้งหมด (ทั้งวิชาปกติและกิจกรรม) — โหลดครั้งเดียว ใช้ทำ dropdown "วิชา"
    useEffect(() => {
        if (!schoolId) return;
        getDocs(collection(db, 'school-settings', schoolId, 'courses')).then(snap => {
            const list: CourseConfig[] = snap.docs.map(d => {
                const data: any = d.data();
                return {
                    id: d.id,
                    code: data.code || '',
                    title: data.title || '',
                    classId: data.classId,
                    room: data.room,
                    formativeAssessments: data.formativeAssessments,
                    midtermWeight: data.midtermWeight,
                    finalWeight: data.finalWeight,
                };
            });
            setCourses(list);
        }).catch(err => console.error('Error loading courses:', err));
    }, [schoolId]);

    // วิชาที่ผ่าน course-assignment (มีครูมอบหมายจริง ไม่ใช่แค่มีเอกสารว่างๆ) หรือ course-enrollment
    // (มีนักเรียนลงทะเบียนแล้ว) เท่านั้น — ถ้าเลือก "ทุกปีการศึกษา" ไว้ จะรวมทุกปีที่เคยมอบหมาย/ลงทะเบียนมา
    useEffect(() => {
        if (!schoolId) { setRegisteredCourseIds(null); return; }
        let cancelled = false;
        const fetchRegisteredCourseIds = async () => {
            try {
                const yearConstraint = selectedTermYear ? [where('academicYear', '==', selectedTermYear)] : [];
                const [assignmentSnap, enrollmentSnap] = await Promise.all([
                    getDocs(query(collection(db, 'school-settings', schoolId, 'course_assignments'), ...yearConstraint)),
                    getDocs(query(collection(db, 'school-settings', schoolId, 'enrollments'), ...yearConstraint)),
                ]);
                const ids = new Set<string>();
                assignmentSnap.docs.forEach(d => {
                    const data: any = d.data();
                    if (Array.isArray(data.teacherAssignments) && data.teacherAssignments.length > 0 && data.courseId) ids.add(data.courseId);
                });
                enrollmentSnap.docs.forEach(d => {
                    const courseId = (d.data() as any)?.courseId;
                    if (courseId) ids.add(courseId);
                });
                if (!cancelled) setRegisteredCourseIds(ids);
            } catch (err) {
                console.error('Error loading registered course ids:', err);
                if (!cancelled) setRegisteredCourseIds(new Set());
            }
        };
        fetchRegisteredCourseIds();
        return () => { cancelled = true; };
    }, [schoolId, selectedTermYear]);

    const courseOptions = useMemo(() => {
        const filterVal = selectedClassLevel.value;
        const matchesLevel = (classId?: string | string[]) => {
            if (filterVal === 'all') return true;
            const ids = Array.isArray(classId) ? classId : classId ? [classId] : [];
            if (ids.includes(filterVal)) return true;
            if (filterVal === 'junior_high') return ids.some(i => ['m1', 'm2', 'm3'].includes(i));
            if (filterVal === 'senior_high') return ids.some(i => ['m4', 'm5', 'm6'].includes(i));
            return false;
        };
        if (!registeredCourseIds) return [];
        // รวมวิชากิจกรรมพัฒนาผู้เรียนด้วย (รหัสขึ้นต้นด้วย "ก" — ชุมนุม, ลูกเสือ-เนตรนารี/รด., แนะแนว ฯลฯ)
        // ให้เลือกดูได้จากดรอปดาวน์เดียวกัน — ตารางจะสลับไปแสดงเฉพาะคนที่ "มผ" เท่านั้นเมื่อเลือกวิชากิจกรรม
        // (isActivityCourseCode เรียงไว้ก่อนวิชาอื่นตามลำดับตัวอักษรไทยอยู่แล้วเพราะ "ก" ขึ้นต้น)
        // ⚠️ วิชากิจกรรมไม่ใช้เกณฑ์ "registeredCourseIds" (course_assignments/enrollments) แบบวิชาปกติ เพราะ
        // การมอบหมายครู/ลงทะเบียนกิจกรรมจริงอยู่ใน collection แยก (clubs/learner-activities/guidance-evaluations)
        // ตามที่ fetchFlaggedStudents ใน remediationUtils.ts ใช้ตรวจจับอยู่แล้ว — ถ้ากรองด้วย registeredCourseIds
        // เหมือนวิชาปกติ วิชากิจกรรมแทบทั้งหมดจะถูกกรองออกไปหมดเพราะไม่เคยมี course_assignments/enrollments เอง
        return courses
            .filter(c => matchesLevel(c.classId) && (isActivityCourseCode(c.code) || registeredCourseIds.has(c.id)))
            .sort((a, b) => a.code.localeCompare(b.code, 'th', { numeric: true }))
            .map(c => ({ value: c.id, label: `${c.code} ${c.title}` }));
    }, [courses, selectedClassLevel, registeredCourseIds]);

    useEffect(() => {
        if (courseOptions.length === 0) { setSelectedCourseId(''); return; }
        if (!selectedCourseId || !courseOptions.some(o => o.value === selectedCourseId)) {
            setSelectedCourseId(courseOptions[0].value);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseOptions]);

    const requestDedupKey = (studentId: string, idValue: string, academicYear: string, semester: string) =>
        `${studentId}|${idValue}|${academicYear}|${semester}`;

    // วิชาปกติ: แสดงนักเรียน "ทั้งหมด" ที่ลงทะเบียนวิชาที่เลือก พร้อมคำนวณ Total/%/Grade — ตามที่ตกลงกันว่า
    // จะแสดงทุกคนในวิชา ไม่ใช่เฉพาะคนติดผลการเรียน
    // วิชากิจกรรม (รหัสขึ้นต้น "ก"): แสดงเฉพาะคนที่ "มผ" เท่านั้น (ดูฟังก์ชัน fetchFlaggedStudents ด้านล่าง)
    // เพราะหน้านี้คือรายงานคนติดผลการเรียน การโชว์คนที่ผ่านกิจกรรมทุกคนไม่มีประโยชน์กับรายงานนี้
    const loadRoster = async () => {
        if (!schoolId || !selectedCourseId) { setRosterRows([]); return; }
        const course = courses.find(c => c.id === selectedCourseId);
        if (!course) { setRosterRows([]); return; }

        setRosterLoading(true);
        setError(null);
        try {
            const isActivity = isActivityCourseCode(course.code);

            const enrollConstraints = [where('courseId', '==', selectedCourseId)];
            if (selectedTermYear) enrollConstraints.push(where('academicYear', '==', selectedTermYear));
            if (selectedTermYear && selectedTermSemester) enrollConstraints.push(where('semester', '==', selectedTermSemester));
            const enrollSnap = await getDocs(query(collection(db, 'school-settings', schoolId, 'enrollments'), ...enrollConstraints));

            // เอาปี/เทอมล่าสุดต่อนักเรียน 1 คน กันซ้ำ กรณีเลือก "ทุกปีการศึกษา" แล้วมีหลายเทอม
            const enrollByStudent = new Map<string, { academicYear: string; semester: string }>();
            enrollSnap.forEach(d => {
                const data: any = d.data();
                const sid = String(data.studentId || '');
                if (!sid) return;
                const y = String(data.academicYear || '');
                const s = String(data.semester || '');
                const prev = enrollByStudent.get(sid);
                if (!prev || y > prev.academicYear || (y === prev.academicYear && s > prev.semester)) {
                    enrollByStudent.set(sid, { academicYear: y, semester: s });
                }
            });
            const studentIds = Array.from(enrollByStudent.keys());
            if (studentIds.length === 0) { setRosterRows([]); return; }

            const studentInfoMap: Record<string, any> = {};
            for (let i = 0; i < studentIds.length; i += 30) {
                const chunk = studentIds.slice(i, i + 30);
                const snap = await getDocs(query(collection(db, 'school-settings', schoolId, 'students'), where('__name__', 'in', chunk)));
                snap.forEach(d => { studentInfoMap[d.id] = d.data(); });
            }

            const assignSnap = await getDocs(query(collection(db, 'school-settings', schoolId, 'course_assignments'), where('courseId', '==', selectedCourseId)));
            let teacherIds: string[] = [];
            assignSnap.forEach(d => {
                const data: any = d.data();
                if (selectedTermYear && String(data.academicYear) !== selectedTermYear) return;
                if (selectedTermYear && selectedTermSemester && String(data.semester) !== selectedTermSemester) return;
                (data.teacherAssignments || []).forEach((ta: any) => { if (ta.teacherId) teacherIds.push(ta.teacherId); });
            });
            teacherIds = Array.from(new Set(teacherIds));
            const teacherName = teacherIds
                .map(id => (teacherMap?.[id]?.firstName ? `ครู${teacherMap[id].firstName}` : teacherMap?.[id]?.name))
                .filter(Boolean)
                .join(', ') || '-';

            const buildName = (sData: any) => sData.firstName
                ? `${sData.title || sData.prefix || ''}${sData.firstName} ${sData.lastName || ''}`.trim()
                : (sData.name || 'ไม่พบข้อมูลนักเรียน');

            const rows: RosterRow[] = [];

            if (!isActivity) {
                const gradeSnap = await getDocs(collection(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades'));
                const gradeMap: Record<string, GradeRecord> = {};
                gradeSnap.forEach(d => { gradeMap[d.id] = d.data() as GradeRecord; });

                const maxTotal = (() => {
                    const formativeMax = (course.formativeAssessments || []).reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0);
                    const total = formativeMax + (Number(course.midtermWeight) || 0) + (Number(course.finalWeight) || 0);
                    return total > 0 ? total : 100;
                })();

                // แผนที่สัปดาห์ (S1..S18) -> การตั้งค่าคาบประเมิน (จากหน้า score-configuration) เพื่อรู้ว่า
                // สัปดาห์ไหนถูกเปิดใช้งานจริง — เหมือน SgsExportPage.tsx ทุกประการ
                const assessmentByWeek: Record<number, AssessmentItem> = {};
                (course.formativeAssessments || []).forEach(a => {
                    const key = a.id || a.name;
                    const match = /^S(\d{1,2})$/.exec(key || '');
                    if (match) assessmentByWeek[Number(match[1])] = a;
                });

                studentIds.forEach(sid => {
                    const sData = studentInfoMap[sid];
                    if (!sData) return;
                    const term = enrollByStudent.get(sid)!;
                    const record = gradeMap[sid] || {};
                    const details = record.formativeDetails || {};

                    const weekValue = (n: number): number | '' => {
                        const assessment = assessmentByWeek[n];
                        if (!assessment || !(Number(assessment.maxScore) > 0)) return '';
                        const raw = details[`S${n}`];
                        return raw === undefined || raw === '' ? 0 : Number(raw) || 0;
                    };

                    const weeklyPre = Array.from({ length: 9 }, (_, i) => weekValue(i + 1));
                    const weeklyPost = Array.from({ length: 9 }, (_, i) => weekValue(i + 10));
                    const preMidtermSubtotal = weeklyPre.reduce((sum: number, v) => sum + (v === '' ? 0 : v), 0);
                    const postMidtermSubtotal = weeklyPost.reduce((sum: number, v) => sum + (v === '' ? 0 : v), 0);
                    const midterm = Number(record.midterm) || 0;
                    const final = Number(record.final) || 0;
                    const total = computeCourseTotal(course, record);
                    const percent = Math.round((total / maxTotal) * 10000) / 100;
                    // ทุกจุดที่บันทึกเกรดในระบบ (ปุ่มแก้ไขตรง/นำเข้าไฟล์/หน้าคำร้องขอแก้ตัว) เขียนลงฟิลด์ "grade"
                    // เสมอ ไม่เคยเขียน "status" — เช็ค record.grade ก่อน ไม่งั้นเกรดที่บันทึก/แก้ไขไว้แล้วจะถูกมองข้าม
                    // กลายเป็นคำนวณจากคะแนนดิบ (ซึ่งถ้ายังไม่กรอกคะแนนเลยจะได้ total=0 = "0" ทุกคนโดยไม่จำเป็น)
                    const grade = record.grade || record.status || calculateGrade(total);
                    const isFlagged = grade === '0' || grade === 'ร' || grade === 'มส';
                    const rawStatus = (record as any).originalGrade || record.status || record.grade;
                    const originalFlag = (rawStatus === '0' || rawStatus === 'ร' || rawStatus === 'มส')
                        ? rawStatus
                        : (isFlagged ? grade : undefined);

                    rows.push({
                        key: requestDedupKey(sid, selectedCourseId, term.academicYear, term.semester),
                        studentId: sid,
                        studentCode: String(sData.studentCode || sData.studentId || sid),
                        name: buildName(sData),
                        classLevel: sData.classLevel || '',
                        room: String(sData.room || ''),
                        number: String(sData.studentNumber || sData.number || '').trim(),
                        isActivity: false,
                        weeklyPre, weeklyPost, preMidtermSubtotal, postMidtermSubtotal, midterm, final,
                        total, percent, grade, isFlagged, originalFlag,
                        teacherName, responsibleTeacherIds: teacherIds,
                        requestStatus: 'no_request',
                        remark: record.remark || '',
                    });
                });
            } else {
                const flagRows = await fetchFlaggedStudents(schoolId, teacherMap, {
                    studentIds, academicYear: selectedTermYear || undefined, semester: selectedTermSemester || undefined,
                });
                const failedByStudent = new Map<string, FlaggedCourse>();
                flagRows.forEach(sr => {
                    sr.flags.forEach(f => {
                        if (f.courseId === selectedCourseId && f.flagKind !== 'course') failedByStudent.set(sr.id, f);
                    });
                });

                studentIds.forEach(sid => {
                    const sData = studentInfoMap[sid];
                    if (!sData) return;
                    const term = enrollByStudent.get(sid)!;
                    const failedFlag = failedByStudent.get(sid);
                    // วิชากิจกรรมแสดงเฉพาะคนที่ "มผ" เท่านั้น (ไม่แสดงคนที่ "ผ่าน" เหมือนวิชาปกติที่โชว์ทุกคน)
                    // เพราะหน้านี้คือรายงานคนติดผลการเรียน ไม่ใช่รายชื่อทั้งหมดของกิจกรรม
                    if (!failedFlag) return;

                    rows.push({
                        key: requestDedupKey(sid, failedFlag.activityDocId || selectedCourseId, term.academicYear, term.semester),
                        studentId: sid,
                        studentCode: String(sData.studentCode || sData.studentId || sid),
                        name: buildName(sData),
                        classLevel: sData.classLevel || '',
                        room: String(sData.room || ''),
                        number: String(sData.studentNumber || sData.number || '').trim(),
                        isActivity: true,
                        grade: 'มผ',
                        isFlagged: true,
                        originalFlag: 'มผ',
                        teacherName: failedFlag.teacherName || teacherName,
                        responsibleTeacherIds: failedFlag.responsibleTeacherIds?.length ? failedFlag.responsibleTeacherIds : teacherIds,
                        activityCollectionName: failedFlag.activityCollectionName,
                        activityDocId: failedFlag.activityDocId,
                        evalDocId: failedFlag.evalDocId,
                        teacherScopeKey: failedFlag.teacherScopeKey,
                        flagKind: failedFlag.flagKind as 'club' | 'learner-activity' | 'guidance',
                        requestStatus: 'no_request',
                        remark: failedFlag.remark || '',
                    });
                });
            }

            // เช็คคำร้องขอแก้ตัวที่มีอยู่แล้ว (ทำครั้งเดียวทั้ง collection เหมือนหน้าภาพรวม/คำร้อง) เพื่อโชว์ badge
            // แทนปุ่มถ้ามีคำร้องค้างอยู่/เสร็จแล้ว
            const requestSnap = await getDocs(collection(db, 'school-settings', schoolId, 'remediation_requests'));
            const requestMap: Record<string, { id: string; status: string; newResult?: string; originalGrade?: string }> = {};
            requestSnap.forEach(d => {
                const data: any = d.data();
                if (data.status === 'cancelled') return;
                const idValue = data.flagType === 'course' ? data.courseId : data.activityId;
                const key = requestDedupKey(data.studentId, idValue, data.academicYear, data.semester);
                if (!requestMap[key] || data.status === 'resolved') {
                    requestMap[key] = { id: d.id, status: data.status, newResult: data.newResult, originalGrade: data.originalGrade };
                }
            });
            rows.forEach(r => {
                const req = requestMap[r.key];
                if (req) {
                    r.requestId = req.id;
                    r.requestStatus = req.status as 'pending' | 'resolved';
                    r.newResult = req.newResult;
                    if (req.originalGrade) {
                        r.originalFlag = req.originalGrade;
                    }
                }
            });

            rows.sort((a, b) => {
                const roomA = Number(a.room) || 999, roomB = Number(b.room) || 999;
                if (roomA !== roomB) return roomA - roomB;
                const numA = parseInt(a.number) || 999, numB = parseInt(b.number) || 999;
                if (numA !== numB) return numA - numB;
                return a.name.localeCompare(b.name, 'th');
            });

            setRosterRows(rows);
        } catch (err: any) {
            console.error('Error loading course roster:', err);
            if (err.code === 'failed-precondition' || err.message?.includes('index')) {
                setError('ระบบต้องการการตั้งค่าดัชนี (Index) กรุณาคลิกลิงก์ใน Console เพื่อสร้าง Index');
            } else {
                setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
            }
        } finally {
            setRosterLoading(false);
        }
    };

    const resetImportState = () => {
        setImportFile(null);
        setImportPreview(null);
        setImportSkippedColumns([]);
        setImportSkippedCodes([]);
        setSkipDuplicateImports(true);
    };

    const openImportModal = async () => {
        const defaultYear = calendarAcademicYear || String(new Date().getFullYear() + 543);
        setImportAcademicYear(defaultYear);
        setImportSemester('1');
        resetImportState();
        setShowImportModal(true);
        // ดึงรายชื่อปีการศึกษาที่ตั้งค่าไว้แล้วที่ /academic/school-calendar มาให้เลือกผ่านดร็อปดาวน์
        // (แทนที่จะให้พิมพ์เอง) เพื่อกันพิมพ์ผิด/ปีที่ไม่มีอยู่จริงในระบบ
        if (schoolId) {
            try {
                const years = await fetchAvailableAcademicYears(schoolId);
                const merged = Array.from(new Set([defaultYear, ...years]))
                    .sort((a, b) => Number(b) - Number(a))
                    .slice(0, 10);
                setImportYearOptions(merged);
            } catch (err) {
                console.error('Error loading academic years for import:', err);
                setImportYearOptions([defaultYear]);
            }
        }
    };

    const closeImportModal = () => {
        if (isParsingImport || isSavingImport) return;
        setShowImportModal(false);
        resetImportState();
    };

    // อ่านไฟล์ CSV/Excel ที่ export มาจากหน้า sgs-export (แท็บ School MIS) แล้วเก็บเฉพาะเซลล์ที่
    // ค่าเป็น 0/ร/มส ไว้แสดงพรีวิว — โครงสร้างไฟล์: #, รหัสนักเรียน, ชื่อ-สกุล, {รหัสวิชา} {ชื่อวิชา}, ...
    // รองรับ 2 รูปแบบไฟล์ที่ส่งออกได้จากหน้า sgs-export:
    // 1) แท็บ "ไฟล์ Excel" (SGS) — .xlsx จริง ตาม SGS_HEADERS 38 คอลัมน์ 1 แถว = นักเรียน 1 คน "ของวิชาที่ระบุใน
    //    คอลัมน์ วิชา" (ไฟล์ 1 ไฟล์ = 1 วิชา) ค่า 0/ร/มส อยู่ในคอลัมน์ "Grade"
    // 2) แท็บ "ไฟล์ CSV" (School MIS) — 1 แถว = นักเรียน 1 คน, 1 คอลัมน์ = 1 วิชา (หัวคอลัมน์ "{รหัส} {ชื่อวิชา}")
    // ตรวจจับอัตโนมัติจากหัวตาราง ไม่ต้องให้ผู้ใช้เลือกเอง
    const processImportFile = async (file: File) => {
        if (!schoolId) return;

        setImportFile(file);
        setIsParsingImport(true);
        setImportPreview(null);
        setImportSkippedColumns([]);
        setImportSkippedCodes([]);

        // ห้ามเชื่อแค่นามสกุลไฟล์ (.xls/.xlsx/.csv) ว่าจะเป็นไฟล์ไบนารีจริง — ระบบ School MIS/SGS รุ่นเก่าหลาย
        // ระบบ "export เป็น .xls" จริงๆ แล้วเขียนเป็นไฟล์ข้อความ/HTML ธรรมดาแล้วตั้งนามสกุลปลอมเป็น .xls เอง
        // (พบเคสจริง: "TblTranscripts (1).xls" ที่จับคู่วิชา/รหัสนักเรียนไม่เจอเลยทั้งที่มีข้อมูลอยู่จริง)
        // จึงต้องดู "magic bytes"/เนื้อหาไฟล์จริงๆ ก่อน แทนที่จะเชื่อนามสกุล:
        // 1) ไฟล์ .xlsx จริง = ZIP (PK\x03\x04) และไฟล์ .xls ไบนารีจริง = OLE2 Compound File (D0 CF 11 E0)
        //    → อ่านแบบ readAsBinaryString + type:'binary' ตามเดิม (ไม่มีปัญหาเรื่องตัวอักษรไทย)
        // 2) ถ้าไม่ใช่ 2 แบบข้างบน แปลว่าเป็นไฟล์ข้อความ (CSV/TSV) หรือ HTML table ปลอมเป็น .xls/.xlsx
        //    ต้องถอดรหัสเป็น UTF-8 text ก่อนเสมอ ไม่งั้นตัวอักษรไทย (multi-byte UTF-8) จะถูกตีความเป็น
        //    Latin-1 ทีละไบต์ กลายเป็นตัวอักษรเพี้ยน (mojibake) ทำให้จับคู่รหัสวิชา/รหัสนักเรียนไม่เจอเลย
        //    2a) ถ้าเนื้อหาที่ถอดแล้วเป็น HTML (ขึ้นต้นด้วย < หรือมี <table>) — SheetJS type:'string' อ่าน
        //        เป็น CSV ไม่ใช่ HTML จึงต้องใช้ DOMParser ดึงแถว/คอลัมน์จาก <table> เอง
        //    2b) ถ้าไม่ใช่ HTML ก็เป็น CSV/TSV ธรรมดา ใช้ type:'string' ได้ตามปกติ
        const headerBuf = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        const isZip = headerBuf[0] === 0x50 && headerBuf[1] === 0x4B && headerBuf[2] === 0x03 && headerBuf[3] === 0x04; // .xlsx จริง
        const isOle2 = headerBuf[0] === 0xD0 && headerBuf[1] === 0xCF && headerBuf[2] === 0x11 && headerBuf[3] === 0xE0; // .xls ไบนารีจริง
        const isRealBinaryFile = isZip || isOle2;

        try {
            const rows: any[][] = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const raw = evt.target?.result;
                        if (isRealBinaryFile) {
                            const wb = XLSX.read(raw, { type: 'binary' });
                            const ws = wb.Sheets[wb.SheetNames[0]];
                            resolve(XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]);
                            return;
                        }
                        const text = String(raw || '');
                        const looksLikeHtml = /^\s*<(!doctype|html|table)/i.test(text) || /<table[\s>]/i.test(text);
                        if (looksLikeHtml) {
                            const table = new DOMParser().parseFromString(text, 'text/html').querySelector('table');
                            if (!table) { reject(new Error('ไม่พบตารางข้อมูลในไฟล์ HTML')); return; }
                            const htmlRows = Array.from(table.querySelectorAll('tr')).map(tr =>
                                Array.from(tr.querySelectorAll('td,th')).map(td => (td.textContent || '').trim())
                            );
                            resolve(htmlRows);
                            return;
                        }
                        const wb = XLSX.read(text, { type: 'string' });
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        resolve(XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
                if (isRealBinaryFile) reader.readAsBinaryString(file);
                else reader.readAsText(file, 'UTF-8');
            });

            if (!rows || rows.length < 2) {
                Swal.fire({ icon: 'warning', title: 'ไฟล์ไม่มีข้อมูล', text: 'กรุณาตรวจสอบไฟล์อีกครั้ง' });
                return;
            }

            const header = rows[0].map((h: any) => String(h ?? '').trim());

            // สร้างแผนที่ รหัสวิชา -> วิชา (query ครั้งเดียวทั้งโรงเรียน ใช้ร่วมกันทั้ง 2 รูปแบบไฟล์)
            const coursesSnap = await getDocs(collection(db, 'school-settings', schoolId, 'courses'));
            const courseByCode = new Map<string, { id: string; code: string; title: string }>();
            coursesSnap.forEach((d) => {
                const data = d.data() as any;
                const code = String(data.code || '').trim();
                if (code && !courseByCode.has(code)) {
                    courseByCode.set(code, { id: d.id, code, title: data.title || '' });
                }
            });

            // สร้างแผนที่ นักเรียน (รหัสนักเรียน/รหัสประจำตัว/docId -> ข้อมูลนักเรียน) ทั้งโรงเรียน
            // ตัดเลข 0 นำหน้าออกด้วยเพื่อจับคู่ให้ตรงในกรณีที่ studentCode ในฐานข้อมูลเก็บเป็นชนิด "ตัวเลข"
            // (Number) จริงๆ ทำให้ 0 นำหน้าหายไปตอนแปลงเป็น string (เช่น 3686 กลายเป็น "3686" แต่ไฟล์เก่า
            // เก็บเป็น "03686") ถ้าไม่ตัดเทียบ จะจับคู่รหัสนักเรียนจากไฟล์เก่าไม่เจอทั้งที่มีอยู่จริงในระบบ
            const stripLeadingZeros = (code: string) => code.replace(/^0+(?=\d)/, '');
            const studentsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'students'));
            const studentByCode = new Map<string, { docId: string; studentCode: string; name: string; classLevel: string; room: string }>();
            studentsSnap.forEach((d) => {
                const data = d.data() as any;
                const code = String(data.studentCode || data.studentId || d.id || '').trim();
                const name = `${data.title || ''}${data.firstName || ''} ${data.lastName || ''}`.trim();
                const rec = { docId: d.id, studentCode: code, name, classLevel: data.classLevel || '', room: String(data.room || '') };
                if (code) {
                    studentByCode.set(code, rec);
                    const stripped = stripLeadingZeros(code);
                    if (stripped !== code && !studentByCode.has(stripped)) studentByCode.set(stripped, rec);
                }
                studentByCode.set(d.id, rec);
            });
            const lookupStudentByCode = (rawCode: string) =>
                studentByCode.get(rawCode) || studentByCode.get(stripLeadingZeros(rawCode));

            const preview: ImportPreviewRow[] = [];
            const skippedCols: string[] = [];
            const skippedCodes: string[] = [];

            const isSgsExcelFormat = header.includes('วิชา') && header.includes('Grade');

            if (isSgsExcelFormat) {
                // รูปแบบ SGS (.xlsx 38 คอลัมน์): วิชาเดียวกันทุกแถวในไฟล์ ค่า 0/ร/มส อยู่คอลัมน์ "Grade"
                // ใช้คอลัมน์ "เลขประจำตัว" (เดี่ยว ไม่ใช่คอลัมน์รวม "เลขประจำตัว ชื่อ-นามสกุล") อ่านรหัสนักเรียนตรงๆ
                const subjectIdx = header.indexOf('วิชา');
                const studentCodeIdx = header.indexOf('เลขประจำตัว');
                const gradeIdx = header.indexOf('Grade');
                const unmatchedSubjects = new Set<string>();

                for (let r = 1; r < rows.length; r++) {
                    const row = rows[r];
                    if (!row || row.length === 0) continue;

                    // เซลล์ "วิชา" ในไฟล์จริงบางไฟล์เก็บเป็น "รหัสวิชา ชื่อวิชา" รวมกัน (เช่น "ท21101 ภาษาไทยพื้นฐาน 1")
                    // ไม่ใช่แค่รหัสล้วนๆ — ต้องตัดเอาแค่ token แรก (รหัสวิชาไม่มีช่องว่างในตัวเอง) มาจับคู่ให้ตรง
                    // ไม่งั้นจะจับคู่กับ courseByCode ไม่เจอเลยแม้รหัสวิชาจะมีอยู่จริงในระบบ (เหมือนที่ฝั่ง School MIS
                    // ทำอยู่แล้วตอนดึงรหัสจากหัวคอลัมน์ "รหัสวิชา ชื่อวิชา") — เก็บข้อความเต็มไว้แสดงตอนข้ามด้วย
                    const rawSubjectCell = String(row[subjectIdx] ?? '').trim();
                    const subjectCode = rawSubjectCell.split(/\s+/)[0] || '';
                    const rawCode = String(row[studentCodeIdx] ?? '').trim();
                    const gradeValue = String(row[gradeIdx] ?? '').trim();
                    if (!rawCode || !subjectCode) continue;
                    if (gradeValue !== '0' && gradeValue !== 'ร' && gradeValue !== 'มส') continue;

                    const course = courseByCode.get(subjectCode);
                    if (!course) {
                        unmatchedSubjects.add(rawSubjectCell);
                        continue;
                    }

                    const student = lookupStudentByCode(rawCode);
                    if (!student) {
                        skippedCodes.push(rawCode);
                        continue;
                    }

                    preview.push({
                        studentDocId: student.docId,
                        studentCode: student.studentCode,
                        studentName: student.name,
                        classLevel: student.classLevel,
                        room: student.room,
                        courseId: course.id,
                        courseCode: course.code,
                        courseTitle: course.title,
                        grade: gradeValue as '0' | 'ร' | 'มส',
                    });
                }
                skippedCols.push(...Array.from(unmatchedSubjects));
            } else {
                // รูปแบบ School MIS (.csv): #, รหัสนักเรียน, ชื่อ-สกุล, แล้วค่อยเป็นคอลัมน์วิชา ({รหัส} {ชื่อวิชา})
                const subjectColStart = 3;
                const subjectHeaders = header.slice(subjectColStart);

                const subjectColMap: { index: number; course: { id: string; code: string; title: string } }[] = [];
                subjectHeaders.forEach((h, idx) => {
                    const trimmed = String(h || '').trim();
                    if (!trimmed) return;
                    const code = trimmed.split(/\s+/)[0];
                    const course = courseByCode.get(code);
                    if (course) {
                        subjectColMap.push({ index: subjectColStart + idx, course });
                    } else {
                        skippedCols.push(trimmed);
                    }
                });

                for (let r = 1; r < rows.length; r++) {
                    const row = rows[r];
                    if (!row || row.length === 0) continue;
                    const rawCode = String(row[1] ?? '').trim();
                    if (!rawCode) continue;

                    const student = lookupStudentByCode(rawCode);
                    if (!student) {
                        skippedCodes.push(rawCode);
                        continue;
                    }

                    subjectColMap.forEach(({ index, course }) => {
                        const cellValue = String(row[index] ?? '').trim();
                        if (cellValue === '0' || cellValue === 'ร' || cellValue === 'มส') {
                            preview.push({
                                studentDocId: student.docId,
                                studentCode: student.studentCode,
                                studentName: student.name,
                                classLevel: student.classLevel,
                                room: student.room,
                                courseId: course.id,
                                courseCode: course.code,
                                courseTitle: course.title,
                                grade: cellValue as '0' | 'ร' | 'มส',
                            });
                        }
                    });
                }
            }

            // ตรวจข้อมูลซ้ำ: วิชาเดียวกัน + นักเรียนคนเดียวกัน (courses/{courseId}/grades/{studentId} มีเอกสารเดียว
            // ต่อคู่นี้อยู่แล้ว จึงเช็คแค่ว่ามีเกรดบันทึกไว้ก่อนหน้านี้หรือยัง — ปีการศึกษา/ภาคเรียนแยกกันอยู่แล้ว
            // เพราะแต่ละปี/เทอมเป็นคนละ courseId เสมอ ไม่มีทางชนกันข้ามปีได้)
            const uniqueCourseIdsForDup = Array.from(new Set(preview.map((p) => p.courseId)));
            const existingGradeByCourse: Record<string, Map<string, string>> = {};
            await Promise.all(uniqueCourseIdsForDup.map(async (courseId) => {
                const gradesSnap = await getDocs(collection(db, 'school-settings', schoolId, 'courses', courseId, 'grades'));
                const m = new Map<string, string>();
                gradesSnap.forEach((d) => {
                    const g = String((d.data() as any)?.grade || '').trim();
                    if (g) m.set(d.id, g);
                });
                existingGradeByCourse[courseId] = m;
            }));
            const previewWithDup = preview.map((p) => {
                const existing = existingGradeByCourse[p.courseId]?.get(p.studentDocId);
                return existing ? { ...p, isDuplicate: true, existingGrade: existing } : p;
            });

            setImportPreview(previewWithDup);
            setImportSkippedColumns(Array.from(new Set(skippedCols)));
            setImportSkippedCodes(Array.from(new Set(skippedCodes)));
        } catch (err) {
            console.error('Error parsing import file:', err);
            Swal.fire({ icon: 'error', title: 'ไม่สามารถอ่านไฟล์ได้', text: 'กรุณาตรวจสอบว่าเป็นไฟล์ที่ได้จากหน้า sgs-export' });
        } finally {
            setIsParsingImport(false);
        }
    };

    const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) processImportFile(file);
    };

    const handleImportDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingImport(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
            Swal.fire({ icon: 'warning', title: 'ไฟล์ไม่ถูกต้อง', text: 'กรุณาอัปโหลดไฟล์ .csv, .xlsx หรือ .xls เท่านั้น' });
            return;
        }
        processImportFile(file);
    };

    // บันทึกจริง — ตรรกะเดียวกับ handleMisSave ในหน้า sgs-export: สร้าง enrollment ที่ยังไม่มี
    // แล้วเขียน courses/{courseId}/grades/{studentId}.grade แบบ batch (merge:true)
    const handleConfirmImport = async () => {
        if (!schoolId || !importPreview || importPreview.length === 0 || importAcademicYear.length !== 4) return;
        // ถ้าเลือก "ข้ามรายการที่ซ้ำ" ไว้ (ค่าเริ่มต้น) ตัดแถวที่ตรวจพบว่ามีเกรดบันทึกไว้แล้วออกก่อนบันทึกจริง
        const rowsToSave = skipDuplicateImports ? importPreview.filter((p) => !p.isDuplicate) : importPreview;
        if (rowsToSave.length === 0) {
            Swal.fire({ icon: 'info', title: 'ไม่มีรายการให้บันทึก', text: 'รายการทั้งหมดถูกข้ามเพราะซ้ำกับข้อมูลที่มีอยู่แล้ว' });
            return;
        }
        setIsSavingImport(true);
        try {
            const courseIdsInvolved = Array.from(new Set(rowsToSave.map((p) => p.courseId)));
            const existingEnrollmentsByCourse: Record<string, Set<string>> = {};
            await Promise.all(courseIdsInvolved.map(async (courseId) => {
                const snap = await getDocs(query(
                    collection(db, 'school-settings', schoolId, 'enrollments'),
                    where('courseId', '==', courseId),
                    where('academicYear', '==', importAcademicYear)
                ));
                existingEnrollmentsByCourse[courseId] = new Set(snap.docs.map((d) => d.data().studentId));
            }));

            const seenPairs = new Set<string>();
            const enrollmentsToCreate: ImportPreviewRow[] = [];
            rowsToSave.forEach((p) => {
                const pairKey = `${p.courseId}__${p.studentDocId}`;
                if (seenPairs.has(pairKey)) return;
                seenPairs.add(pairKey);
                if (!existingEnrollmentsByCourse[p.courseId]?.has(p.studentDocId)) {
                    enrollmentsToCreate.push(p);
                }
            });

            await Promise.all(enrollmentsToCreate.map((p) => addDoc(collection(db, 'school-settings', schoolId, 'enrollments'), {
                studentId: p.studentDocId,
                courseId: p.courseId,
                courseCode: p.courseCode,
                courseTitle: p.courseTitle,
                academicYear: importAcademicYear,
                semester: importSemester,
                classLevel: p.classLevel,
                room: p.room,
                createdAt: serverTimestamp(),
            })));

            for (let i = 0; i < rowsToSave.length; i += 400) {
                const chunk = rowsToSave.slice(i, i + 400);
                const batch = writeBatch(db);
                chunk.forEach((p) => {
                    const ref = doc(db, 'school-settings', schoolId, 'courses', p.courseId, 'grades', p.studentDocId);
                    batch.set(ref, {
                        grade: p.grade,
                        updatedAt: serverTimestamp(),
                        updatedBy: (currentUser as any)?.displayName || (currentUser as any)?.email || 'import',
                    }, { merge: true });
                });
                await batch.commit();
            }

            const skippedCount = importPreview.length - rowsToSave.length;
            Swal.fire({
                icon: 'success', title: 'นำเข้าข้อมูลสำเร็จ',
                text: skippedCount > 0 ? `บันทึก ${rowsToSave.length} รายการ (ข้ามรายการซ้ำ ${skippedCount} รายการ)` : `บันทึก ${rowsToSave.length} รายการ`,
                timer: 2500, showConfirmButton: false,
            });
            setShowImportModal(false);
            resetImportState();
            // สลับตัวกรองปี/เทอม/วิชาของหน้าหลักไปยังข้อมูลที่เพิ่งนำเข้าให้อัตโนมัติ — เดิมเรียก loadRoster()
            // เฉยๆ ซึ่งยังใช้ค่าตัวกรองเดิมค้างอยู่ ถ้านำเข้าข้อมูลปีย้อนหลังที่ไม่ตรงกับปีที่กำลังดูอยู่
            // (เช่น เปิดหน้าค้างที่ปีปัจจุบัน แต่เพิ่งนำเข้าข้อมูลปีเก่า) วิชาที่เพิ่งนำเข้าจะไม่โผล่ในดรอปดาวน์เลย
            // เพราะ registeredCourseIds ยังผูกกับปีเดิมอยู่ — การเซ็ตค่าที่นี่จะไปกระตุ้น useEffect ที่ผูกกับ
            // selectedTermYear ให้ดึง registeredCourseIds ของปีใหม่มาใหม่ ทำให้วิชาที่นำเข้าโผล่ขึ้นมาให้เลือกได้ทันที
            setSelectedTermYear(importAcademicYear);
            setSelectedTermSemester(importSemester);
            if (courseIdsInvolved.length > 0) setSelectedCourseId(courseIdsInvolved[0]);
            loadRoster();
        } catch (err) {
            console.error('Error saving import:', err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการบันทึก' });
        } finally {
            setIsSavingImport(false);
        }
    };

    useEffect(() => {
        loadRoster();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId, selectedCourseId, selectedTermYear, selectedTermSemester]);

    // ห้องเรียน — กรอง "รายชื่อในวิชาที่เลือก" (roster) เท่านั้น ไม่ใช่กรองรายชื่อที่ติดทั้งโรงเรียนแบบเดิม
    const roomOptions = useMemo(() => {
        const activeRooms = new Set<string>();
        rosterRows.forEach(r => { if (r.room) activeRooms.add(String(r.room)); });
        const sortedList = Array.from(activeRooms).sort((a, b) => Number(a) - Number(b));
        return [{ value: 'all', label: 'ทุกห้องเรียน' }, ...sortedList.map(r => ({ value: r, label: `ห้อง ${r}` }))];
    }, [rosterRows]);

    const filteredRosterRows = useMemo(() => {
        const kw = rosterSearch.trim().toLowerCase();
        return rosterRows.filter(r => {
            if (selectedRoom.value !== 'all' && String(r.room) !== String(selectedRoom.value)) return false;
            if (!kw) return true;
            return `${r.name} ${r.studentCode}`.toLowerCase().includes(kw);
        });
    }, [rosterRows, selectedRoom, rosterSearch]);

    const rosterSummary = useMemo(() => {
        let normalCount = 0, flaggedCount = 0;
        filteredRosterRows.forEach(r => { if (r.isFlagged) flaggedCount++; else normalCount++; });
        return { total: filteredRosterRows.length, normalCount, flaggedCount };
    }, [filteredRosterRows]);

    // ── ส่งออก PDF: ประกาศผลรายชื่อที่ติด 0/ร/มส/มผ "ทั้งโรงเรียน" ตามระดับชั้น/ปี/เทอมที่เลือกไว้ด้านบน
    // (คนละชุดข้อมูลกับตาราง roster ที่กำลังดูอยู่ ซึ่งเป็นรายวิชาเดียว) — โหลดสดตอนกดปุ่มเพื่อไม่ต้อง
    // ดึงข้อมูลทั้งโรงเรียนซ้ำซ้อนทุกครั้งที่หน้าโหลด
    const [pdfStudents, setPdfStudents] = useState<StudentFlagRow[]>([]);
    const [pdfLoading, setPdfLoading] = useState(false);

    const buildZeroRMsPdfDocument = () => {
        const groups = buildPdfGroups(pdfStudents);
        return (
            <ZeroRMsPdfDocument
                groups={groups}
                schoolName={schoolSettings.schoolName || 'โรงเรียน'}
                logoUrl={schoolSettings.logoUrl}
                directorName={[schoolSettings.directorPrefix, schoolSettings.directorName].filter(Boolean).join(' ')}
            />
        );
    };

    const openPdfPreview = async () => {
        if (!schoolId) return;
        setPdfLoading(true);
        try {
            const list = await fetchFlaggedStudents(schoolId, teacherMap, {
                classLevelFilter: selectedClassLevel.value,
                academicYear: selectedTermYear || undefined,
                semester: selectedTermSemester || undefined,
            });
            setPdfStudents(list);
            setShowPdfPreview(true);
        } catch (err) {
            console.error('Error loading data for PDF export:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลสำหรับสร้าง PDF ได้', 'error');
        } finally {
            setPdfLoading(false);
        }
    };

    const handleExportPdf = async () => {
        setPdfGenerating(true);
        try {
            const blob = await pdf(buildZeroRMsPdfDocument()).toBlob();
            saveAs(blob, `ประกาศผลการเรียน_0_ร_มส_มผ.pdf`);
        } catch (err) {
            console.error('Error exporting 0/ร/มส/มผ report PDF:', err);
            Swal.fire('สร้าง PDF ไม่สำเร็จ', 'ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง', 'error');
        } finally {
            setPdfGenerating(false);
        }
    };

    // ── บันทึกผลแก้ตัวตรงจากตารางรายชื่อ (เก็บเข้าระบบคำร้องขอแก้ตัวที่มีอยู่แล้วเสมอ status:'resolved'
    // เหมือนปุ่ม "แก้ไขผลโดยตรง" ในหน้าภาพรวม/บันทึก 0 ร มส) ───
    const GRADE_OPTIONS = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0'];

    const handleCorrect = async (row: RosterRow) => {
        if (!schoolId || !row.isFlagged) return;

        let newValue: string | undefined;
        if (!row.isActivity) {
            if (row.grade === 'ร') {
                const course = courses.find(c => c.id === selectedCourseId);
                const freshSnap = await getDoc(doc(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades', row.studentId));
                const freshRecord = (freshSnap.exists() ? freshSnap.data() : {}) as GradeRecord;
                const freshTotal = course ? computeCourseTotal(course, freshRecord) : (row.total || 0);
                const resolvedGrade = calculateGrade(freshTotal);

                const confirm = await Swal.fire({
                    icon: 'question',
                    title: `แก้ไข ร ของ${row.name}`,
                    html: `
                        <div style="text-align:left;font-size:14px;line-height:1.6;margin-top:8px">
                            นักเรียน: <b>${row.name}</b> (${row.studentCode})<br/>
                            คะแนนรวมในสมุดคะแนน (TOTAL): <b style="color:#4f46e5">${freshTotal} คะแนน</b><br/>
                            เกรดสุทธิที่จะได้รับจาก GradeBook: <b style="color:#16a34a;font-size:17px">${resolvedGrade}</b>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: `บันทึกเกรด (${resolvedGrade})`,
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#4f46e5',
                });
                if (!confirm.isConfirmed) return;
                newValue = resolvedGrade;
            } else {
                const gradeOptions = getMinistryRemediationGradeOptions(row.grade);
                const { value } = await Swal.fire({
                    title: 'แก้ไขผลการเรียนโดยตรง (ตามระเบียบ ศธ.)',
                    html: `<div style="text-align:left;font-size:13px;margin-bottom:8px">${row.name} (${row.studentCode})<br/>ผลเดิม: <b>${row.grade}</b></div>`,
                    input: 'select',
                    inputOptions: gradeOptions,
                    inputPlaceholder: 'เลือกผลการเรียนใหม่',
                    showCancelButton: true,
                    confirmButtonText: 'บันทึก',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#4f46e5',
                });
                if (!value) return;
                newValue = value;
            }
        } else {
            const { value } = await Swal.fire({
                title: 'แก้ไขผลการประเมินโดยตรง',
                html: `<div style="text-align:left;font-size:13px;margin-bottom:8px">${row.name} (${row.studentCode})<br/>ผลเดิม: <b>มผ</b></div>`,
                input: 'select',
                inputOptions: { passed: 'ผ่าน', failed: 'ไม่ผ่าน' },
                inputPlaceholder: 'เลือกผลการประเมินใหม่',
                showCancelButton: true,
                confirmButtonText: 'บันทึก',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#4f46e5',
            });
            if (!value) return;
            newValue = value;
        }

        setCorrectingKey(row.key);
        try {
            const term = row.key.split('|');
            const academicYear = term[2], semester = term[3];

            const autoRemark = row.grade === 'ร' ? `เกรด ${newValue}` : undefined;
            if (!row.isActivity) {
                const updatePayload: Record<string, any> = {
                    grade: newValue,
                    status: deleteField(),
                    originalGrade: row.originalFlag || row.grade,
                };
                if (autoRemark) updatePayload.remark = autoRemark;
                await setDoc(doc(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades', row.studentId), updatePayload, { merge: true });
            } else {
                // guidance-evaluations เป็น collection ระดับบนสุด (ไม่ใช่ subcollection ของ activityDocId เหมือน clubs/learner-activities)
                const evalRef = row.activityCollectionName === 'guidance-evaluations'
                    ? doc(db, 'school-settings', schoolId, 'guidance-evaluations', row.evalDocId!)
                    : doc(db, 'school-settings', schoolId, row.activityCollectionName!, row.activityDocId!, 'evaluations', row.evalDocId!);
                const evalSnap = await getDoc(evalRef);
                const data: any = evalSnap.exists() ? evalSnap.data() : {};
                const results: Record<string, any> = { ...(data.results || {}) };
                results[row.studentId] = { ...(results[row.studentId] || {}), status: newValue };
                const summary = Object.values(results).reduce((acc: any, r: any) => {
                    const s = r?.status || 'pending';
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                }, { pending: 0, passed: 0, failed: 0 });
                await setDoc(evalRef, { results, summary, updatedAt: serverTimestamp(), updatedBy: (currentUser as any)?.uid || '' }, { merge: true });
            }

            const displayValue = row.isActivity ? (newValue === 'passed' ? 'ผ่าน' : 'ไม่ผ่าน') : newValue;

            if (row.requestId) {
                await updateDoc(doc(db, 'school-settings', schoolId, 'remediation_requests', row.requestId), {
                    status: 'resolved',
                    resolvedAt: serverTimestamp(),
                    resolvedBy: (currentUser as any)?.uid || '',
                    resolvedByName: (currentUser as any)?.fullName || '',
                    newResult: displayValue,
                });
            } else {
                const course = courses.find(c => c.id === selectedCourseId);
                const payload: Record<string, any> = {
                    studentId: row.studentId,
                    studentCode: row.studentCode,
                    studentName: row.name,
                    classLevel: row.classLevel,
                    room: row.room,
                    // ต้องใช้ row.flagKind ตรงๆ ห้าม hardcode 'learner-activity' — ชมรม/แนะแนวต้องได้ flagType
                    // เป็น 'club'/'guidance' ตามจริง ไม่งั้นหน้า RemediationRequestsPage ฯลฯ จะ resolve
                    // เอกสารกลับไปผิด collection (ดู evalRef ด้านบนที่แยกตาม activityCollectionName)
                    flagType: row.isActivity ? row.flagKind : 'course',
                    originalGrade: row.grade,
                    academicYear, semester,
                    responsibleTeacherIds: row.responsibleTeacherIds || [],
                    responsibleTeacherNames: row.teacherName ? [row.teacherName] : [],
                    status: 'resolved',
                    requestedAt: serverTimestamp(),
                    requestedBy: (currentUser as any)?.uid || '',
                    requestNote: 'บันทึกโดยฝ่ายวิชาการ (ไม่ผ่านขั้นตอนคำร้อง)',
                    resolvedAt: serverTimestamp(),
                    resolvedBy: (currentUser as any)?.uid || '',
                    resolvedByName: (currentUser as any)?.fullName || '',
                    newResult: displayValue,
                };
                if (!row.isActivity) {
                    payload.courseId = selectedCourseId;
                    payload.courseCode = course?.code || '';
                    payload.courseTitle = course?.title || '';
                } else {
                    payload.activityId = row.activityDocId;
                    payload.activityName = course?.title || course?.code || '';
                    payload.evalDocId = row.evalDocId;
                    if (row.teacherScopeKey) payload.teacherScopeKey = row.teacherScopeKey;
                }
                await addDoc(collection(db, 'school-settings', schoolId, 'remediation_requests'), payload);
            }

            Swal.fire({ icon: 'success', title: 'บันทึกผลสำเร็จ', timer: 1500, showConfirmButton: false });
            await loadRoster();
        } catch (err) {
            console.error('Error correcting grade:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกผลได้', 'error');
        } finally {
            setCorrectingKey(null);
        }
    };

    // ── Remark ประกอบผล มส/ร (เฉพาะวิชาปกติ) — ตราบใดที่มีข้อความอยู่ในหมายเหตุ จะไม่แสดงเกรดในตาราง
    // จนกว่าจะลบหมายเหตุออก (พิมพ์ว่างแล้วกดบันทึก) เกรดถึงจะกลับมาแสดงตามปกติ
    const handleSetRemark = async (row: RosterRow) => {
        if (!schoolId || row.isActivity || !selectedCourseId) return;

        const { value, isConfirmed } = await Swal.fire({
            title: row.remark ? 'แก้ไข Remark' : 'เพิ่ม Remark',
            html: `<div style="text-align:left;font-size:13px;margin-bottom:8px">${row.name} (${row.studentCode})<br/>ผล: <b>${row.grade}</b></div>`,
            input: 'text',
            inputValue: row.remark || '',
            inputPlaceholder: 'ระบุหมายเหตุ เช่น เหตุผลที่ติด มส/ร (ลบข้อความให้ว่างเพื่อแสดงเกรดกลับคืน)',
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
        });
        if (!isConfirmed) return;

        const newRemark = String(value || '').trim();
        // กรณีติด "ร" แล้วลบ Remark ออก (แปลว่างานที่ค้างส่งครบแล้ว) ให้คำนวณเกรดใหม่จากคะแนนรวมทันที
        // แทนที่จะปล่อยให้ค้างเป็น "ร" ต่อไป — คะแนนถึง 50 ขึ้นไปให้ตัดเกรดตามปกติ ต่ำกว่า 50 ให้เป็น "0"
        const shouldRecalculateGrade = !newRemark && row.grade === 'ร';

        setRemarkSavingKey(row.key);
        try {
            let recalculatedGrade: string | null = null;
            if (shouldRecalculateGrade) {
                // อ่านเอกสารคะแนนสดจาก Firestore ตอนนี้เลย ไม่ใช้ row.total ที่มาจากตอนโหลดหน้าครั้งก่อน —
                // กันกรณีครูเพิ่งไปกรอกคะแนนที่ค้าง (สมุดคะแนน/คะแนนเก็บ/คะแนนปลายภาค) เสร็จในแท็บอื่นแล้ว
                // ยังไม่ได้กลับมารีเฟรชหน้านี้ ถ้าใช้ค่าเก่าจะคำนวณเกรดผิดจากคะแนนที่ล้าสมัยไปแล้ว
                const course = courses.find(c => c.id === selectedCourseId);
                const freshSnap = await getDoc(doc(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades', row.studentId));
                const freshRecord = (freshSnap.exists() ? freshSnap.data() : {}) as GradeRecord;
                const freshTotal = course ? computeCourseTotal(course, freshRecord) : (row.total || 0);
                recalculatedGrade = calculateRemediationGrade(row.grade, freshTotal);
            }

            const updateData: Record<string, any> = { remark: newRemark };
            if (recalculatedGrade) {
                updateData.grade = recalculatedGrade;
                updateData.status = deleteField();
                updateData.originalGrade = row.originalFlag || row.grade;
            }
            await setDoc(doc(db, 'school-settings', schoolId, 'courses', selectedCourseId, 'grades', row.studentId), updateData, { merge: true });
            setRosterRows(prev => prev.map(r => (r.key === row.key
                ? { ...r, remark: newRemark, ...(recalculatedGrade ? { grade: recalculatedGrade, isFlagged: recalculatedGrade === '0' } : {}) }
                : r)));
        } catch (err) {
            console.error('Error saving remark:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึก Remark ได้', 'error');
        } finally {
            setRemarkSavingKey(null);
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-[#f8fafc] dark:bg-[#131417] transition-colors duration-500">
                <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
                        <div className="space-y-1 text-left">
                            <div className="flex items-center gap-3">
                                <BackButton to="/academic/hub/zero-r-ms" />
                                <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-2xl shadow-sm border border-rose-100 dark:border-rose-500/20">
                                    <AlertTriangle className="text-rose-600 dark:text-rose-400" size={24} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                        รายงานการติด 0 ร มส มผ
                                    </h1>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold pt-0.5 flex items-center gap-1.5">
                                        <History size={12} />
                                        {selectedTermYear
                                            ? `ปีการศึกษา ${selectedTermYear}${selectedTermSemester ? ` / ภาคเรียนที่ ${selectedTermSemester}` : ' (ตลอดปีการศึกษา)'}`
                                            : 'สะสมทุกภาคเรียนที่ผ่านมา จนถึงปัจจุบัน'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <button
                                onClick={loadRoster}
                                disabled={rosterLoading}
                                title="รีเฟรชข้อมูล"
                                className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/80 shadow-sm transition disabled:opacity-60"
                            >
                                {rosterLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            </button>
                            <button
                                onClick={openImportModal}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/10 transition-all font-black text-xs group"
                            >
                                <Upload size={14} />
                                <span>นำเข้าข้อมูล</span>
                            </button>
                            <button
                                onClick={openPdfPreview}
                                disabled={pdfLoading}
                                title="ออกรายงานประกาศผล 0/ร/มส/มผ ทั้งโรงเรียนตามระดับชั้น/ปี/เทอมที่เลือกไว้"
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-slate-900 dark:bg-indigo-500 dark:hover:bg-white dark:hover:text-black text-white px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/10 transition-all font-black text-xs group disabled:opacity-60"
                            >
                                {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                <span>PDF</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 relative">
                    <div className="bg-white dark:bg-[#1a1b1e] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                        <div className="mb-4">
                            <AcademicYearSemesterFilter
                                schoolId={schoolId}
                                academicYear={selectedTermYear}
                                onAcademicYearChange={setSelectedTermYear}
                                semester={selectedTermSemester}
                                onSemesterChange={setSelectedTermSemester}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 items-end">
                            <div className="lg:col-span-3 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <GraduationCap size={12} /> ระดับชั้น
                                </span>
                                <Select options={classLevelOptions} value={selectedClassLevel} onChange={setSelectedClassLevel} styles={selectStyles} isSearchable={false} />
                            </div>
                            <div className="lg:col-span-4 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <AlertTriangle size={12} /> วิชา
                                </span>
                                <select
                                    value={selectedCourseId}
                                    onChange={(e) => setSelectedCourseId(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {courseOptions.length === 0 && <option value="">ไม่พบวิชา</option>}
                                    {courseOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div className="lg:col-span-2 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    <Users size={12} /> ห้องเรียน
                                </span>
                                <Select options={roomOptions} value={selectedRoom} onChange={setSelectedRoom} styles={selectStyles} isSearchable={false} />
                            </div>
                            <div className="lg:col-span-3 space-y-1.5">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                    ค้นหาจาก
                                </span>
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={rosterSearch}
                                        onChange={(e) => setRosterSearch(e.target.value)}
                                        placeholder="เลขประจำตัว ชื่อ นามสกุล"
                                        className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <SummaryCard title="นักเรียนในวิชานี้" value={rosterSummary.total} icon={<Users size={20} />} unit="คน" color="indigo" />
                        <SummaryCard title="ผลปกติ" value={rosterSummary.normalCount} icon={<Users size={20} />} unit="คน" color="slate" />
                        <SummaryCard title="ติดผลการเรียน" value={rosterSummary.flaggedCount} icon={<AlertTriangle size={20} />} unit="คน" color="rose" />
                    </div>

                    {error && (
                        <div className="bg-rose-50 border border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 p-4 rounded-xl flex items-center gap-3">
                            <AlertCircle size={20} className="shrink-0" />
                            <p className="font-bold text-sm">{error}</p>
                        </div>
                    )}

                    <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                        {rosterLoading ? (
                            <div className="p-8 space-y-6">
                                <div className="flex gap-4"><SkeletonLoader className="h-4 w-12 rounded-full" /><SkeletonLoader className="h-4 w-48 rounded-full" /></div>
                                {[1, 2, 3, 4, 5].map(i => <SkeletonLoader key={i} className="h-12 w-full rounded-xl" />)}
                            </div>
                        ) : (
                            <div>
                                <table className="w-full table-fixed text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-gray-800">
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-[4%]">ห้อง/เลขที่</th>
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest w-[11%]">ข้อมูลนักเรียน</th>
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest w-[6%]">ผู้สอน</th>
                                            {Array.from({ length: 9 }, (_, i) => (
                                                <th key={`h-pre-${i}`} className="px-0.5 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 text-center w-[2%]">{i + 1}</th>
                                            ))}
                                            <th className="px-0.5 py-3 text-[8px] font-black text-gray-400 dark:text-gray-500 text-center w-[4%] leading-tight">ก่อน<br />กลางภาค</th>
                                            {Array.from({ length: 9 }, (_, i) => (
                                                <th key={`h-post-${i}`} className="px-0.5 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 text-center w-[2%]">{i + 10}</th>
                                            ))}
                                            <th className="px-0.5 py-3 text-[8px] font-black text-gray-400 dark:text-gray-500 text-center w-[4%] leading-tight">หลัง<br />กลางภาค</th>
                                            <th className="px-0.5 py-3 text-[8px] font-black text-gray-400 dark:text-gray-500 text-center w-[4%] leading-tight">รวม<br />ตลอดภาค</th>
                                            <th className="px-0.5 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 text-center w-[4%]">กลางภาค</th>
                                            <th className="px-0.5 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 text-center w-[4%]">ปลายภาค</th>
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-[4%]">Total</th>
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-[3%]">%</th>
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-[3%]">ปกติ</th>
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-[4%]">Grade</th>
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-[7%]">แก้ตัว</th>
                                            <th className="px-1 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center w-[8%]">Remark</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                        {filteredRosterRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={29} className="py-20 text-center">
                                                    <div className="flex flex-col items-center gap-3 opacity-30">
                                                        <Users size={48} />
                                                        <p className="font-bold text-sm">{courseOptions.length === 0 ? 'ไม่พบวิชาตามเงื่อนไขที่เลือก' : 'ไม่พบนักเรียนในวิชานี้'}</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : filteredRosterRows.map((r) => (
                                            <tr key={r.key} className={`group hover:bg-gray-50/50 dark:hover:bg-indigo-500/[0.02] transition-colors align-top ${r.isFlagged ? 'bg-rose-50/30 dark:bg-rose-500/[0.03]' : ''}`}>
                                                <td className="px-1 py-3 text-center">
                                                    <span className="text-xs font-black text-gray-400 dark:text-gray-600 tabular-nums">{r.room || '-'}/{r.number || '-'}</span>
                                                </td>
                                                <td className="px-1 py-3">
                                                    <p className="text-[11px] font-bold truncate text-gray-900 dark:text-white">{r.name}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-600 tracking-tight">{r.studentCode}</p>
                                                </td>
                                                <td className="px-1 py-3">
                                                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 truncate block">{r.teacherName}</span>
                                                </td>
                                                {Array.from({ length: 9 }, (_, i) => (
                                                    <td key={`pre-${i}`} className="px-1 py-3 text-center">
                                                        <span className="text-[11px] font-bold tabular-nums text-gray-500 dark:text-gray-400">{r.weeklyPre?.[i] === '' || r.weeklyPre?.[i] === undefined ? '-' : r.weeklyPre[i]}</span>
                                                    </td>
                                                ))}
                                                <td className="px-1 py-3 text-center bg-gray-50/60 dark:bg-white/[0.02]">
                                                    <span className="text-[11px] font-black tabular-nums text-gray-600 dark:text-gray-300">{r.isActivity ? '-' : r.preMidtermSubtotal}</span>
                                                </td>
                                                {Array.from({ length: 9 }, (_, i) => (
                                                    <td key={`post-${i}`} className="px-1 py-3 text-center">
                                                        <span className="text-[11px] font-bold tabular-nums text-gray-500 dark:text-gray-400">{r.weeklyPost?.[i] === '' || r.weeklyPost?.[i] === undefined ? '-' : r.weeklyPost[i]}</span>
                                                    </td>
                                                ))}
                                                <td className="px-1 py-3 text-center bg-gray-50/60 dark:bg-white/[0.02]">
                                                    <span className="text-[11px] font-black tabular-nums text-gray-600 dark:text-gray-300">{r.isActivity ? '-' : r.postMidtermSubtotal}</span>
                                                </td>
                                                <td className="px-1 py-3 text-center bg-indigo-50/50 dark:bg-indigo-500/[0.04]">
                                                    <span className="text-[11px] font-black tabular-nums text-indigo-600 dark:text-indigo-400">
                                                        {r.isActivity ? '-' : (r.preMidtermSubtotal ?? 0) + (r.postMidtermSubtotal ?? 0)}
                                                    </span>
                                                </td>
                                                <td className="px-1 py-3 text-center">
                                                    <span className="text-[11px] font-bold tabular-nums text-gray-500 dark:text-gray-400">{r.isActivity ? '-' : r.midterm}</span>
                                                </td>
                                                <td className="px-1 py-3 text-center">
                                                    <span className="text-[11px] font-bold tabular-nums text-gray-500 dark:text-gray-400">{r.isActivity ? '-' : r.final}</span>
                                                </td>
                                                <td className="px-1 py-3 text-center">
                                                    <span className="text-xs font-black tabular-nums text-gray-700 dark:text-gray-300">{r.isActivity ? '-' : r.total}</span>
                                                </td>
                                                <td className="px-1 py-3 text-center">
                                                    <span className="text-xs font-black tabular-nums text-gray-700 dark:text-gray-300">{r.isActivity ? '-' : r.percent}</span>
                                                </td>
                                                <td className="px-1 py-3 text-center whitespace-nowrap">
                                                    {r.originalFlag ? (
                                                        <span className={`inline-flex items-center justify-center text-[10px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap ${r.originalFlag === '0' ? 'text-rose-600 bg-rose-50 dark:bg-rose-500/10' : r.originalFlag === 'ร' ? 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' : r.originalFlag === 'มส' ? 'text-slate-700 bg-slate-100 dark:bg-slate-700 dark:text-slate-300' : 'text-purple-600 bg-purple-50 dark:bg-purple-500/10'}`}>
                                                            ติด {r.originalFlag}
                                                        </span>
                                                    ) : r.isFlagged ? (
                                                        <span className="inline-flex items-center justify-center text-[10px] font-black px-1.5 py-0.5 rounded-md text-rose-600 bg-rose-50 dark:bg-rose-500/10 whitespace-nowrap">
                                                            ติด {r.grade}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">ปกติ</span>
                                                    )}
                                                </td>
                                                <td className="px-1 py-3 text-center">
                                                    <span
                                                        className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-black border ${r.isFlagged ? (flagColor[r.grade as FlagType] || flagColor['0']) : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20'}`}
                                                        title={r.remark ? `Remark: ${r.remark}` : undefined}
                                                    >
                                                        {r.grade}
                                                    </span>
                                                </td>
                                                <td className="px-1 py-3 text-center">
                                                    {r.requestStatus === 'resolved' ? (
                                                        <span className="inline-flex items-center justify-center font-black text-emerald-600 dark:text-emerald-400 text-sm" title="แก้ตัวเรียบร้อยแล้ว">
                                                            ✓
                                                        </span>
                                                    ) : !r.isFlagged ? (
                                                        <span className="text-xs text-gray-300 dark:text-gray-700">-</span>
                                                    ) : r.requestStatus === 'pending' ? (
                                                        <button
                                                            onClick={() => handleCorrect(r)}
                                                            disabled={correctingKey === r.key}
                                                            className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-all"
                                                        >
                                                            {correctingKey === r.key ? <RefreshCw size={11} className="animate-spin" /> : <Clock size={11} />}
                                                            มีคำร้อง
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleCorrect(r)}
                                                            disabled={correctingKey === r.key}
                                                            className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50"
                                                        >
                                                            {correctingKey === r.key ? <RefreshCw size={11} className="animate-spin" /> : <Pencil size={11} />}
                                                            แก้ตัว
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="px-1 py-3 text-center">
                                                    {r.remark ? (
                                                        <button
                                                            onClick={() => handleSetRemark(r)}
                                                            disabled={remarkSavingKey === r.key}
                                                            title={r.remark}
                                                            className="inline-flex w-full max-w-[150px] justify-center items-center gap-1 rounded-lg bg-amber-100 px-1.5 py-1 text-[10px] font-bold text-amber-700 transition-all hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                                        >
                                                            {remarkSavingKey === r.key ? <RefreshCw size={11} className="animate-spin shrink-0" /> : <MessageSquare size={11} className="shrink-0" />}
                                                            <span className="truncate">{r.remark}</span>
                                                        </button>
                                                    ) : !r.isActivity && r.total !== undefined ? (
                                                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                                                            เกรด {calculateGrade(r.total)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-300 dark:text-gray-700">-</span>
                                                    )}
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
                                ตัวอย่างเอกสาร — รายงานการติด 0 ร มส มผ
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleExportPdf}
                                    disabled={pdfGenerating}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                                {buildZeroRMsPdfDocument()}
                            </PDFViewer>
                        </div>
                    </div>
                </div>
            )}

            {showImportModal && (
                <div
                    className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={closeImportModal}
                >
                    <div
                        className="flex h-[calc(100vh-100px)] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                            <h2 className="text-base font-bold text-gray-900 dark:text-white">
                                นำเข้าข้อมูล 0/ร/มส จากไฟล์ SGS / School MIS
                            </h2>
                            <button
                                type="button"
                                onClick={closeImportModal}
                                disabled={isParsingImport || isSavingImport}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-50"
                                title="ปิด"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                ใช้ไฟล์ที่ดาวน์โหลดจากหน้า <span className="font-bold text-gray-700 dark:text-gray-300">รายงานคะแนน</span> ในเมนู sgs-export ได้ทั้งแท็บ "ไฟล์ Excel" (SGS) และแท็บ "ไฟล์ CSV" (School MIS) — ระบบจะตรวจจับรูปแบบไฟล์ให้อัตโนมัติ และดึงเฉพาะเซลล์ที่มีค่าเป็น 0, ร, หรือ มส มาบันทึก ค่าคะแนนปกติจะไม่ถูกนำเข้า
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300">ปีการศึกษาของไฟล์นี้</label>
                                    <select
                                        value={importAcademicYear}
                                        onChange={(e) => setImportAcademicYear(e.target.value)}
                                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {importYearOptions.length === 0 && (
                                            <option value={importAcademicYear}>ปีการศึกษา {importAcademicYear}</option>
                                        )}
                                        {importYearOptions.map(y => (
                                            <option key={y} value={y}>ปีการศึกษา {y}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-gray-400">
                                        ไม่เจอปีที่ต้องการ?{' '}
                                        <button
                                            type="button"
                                            onClick={() => navigate('/academic/school-calendar')}
                                            className="font-bold text-indigo-500 hover:underline"
                                        >
                                            ไปเพิ่มปีการศึกษาที่หน้าปฏิทิน
                                        </button>
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300">ภาคเรียนของไฟล์นี้</label>
                                    <select
                                        value={importSemester}
                                        onChange={(e) => setImportSemester(e.target.value as '1' | '2')}
                                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="1">ภาคเรียนที่ 1</option>
                                        <option value="2">ภาคเรียนที่ 2</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">ไฟล์ (.csv / .xlsx / .xls)</label>
                                <div
                                    onClick={() => !isParsingImport && importFileInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); if (!isParsingImport) setIsDraggingImport(true); }}
                                    onDragLeave={() => setIsDraggingImport(false)}
                                    onDrop={isParsingImport ? undefined : handleImportDrop}
                                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all ${isParsingImport ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isDraggingImport
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                                        : importFile
                                            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-500/5'
                                            : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 hover:border-indigo-400 dark:hover:border-indigo-500'
                                        }`}
                                >
                                    <input
                                        ref={importFileInputRef}
                                        type="file"
                                        accept=".csv,.xlsx,.xls"
                                        onChange={handleImportFileChange}
                                        disabled={isParsingImport}
                                        className="hidden"
                                    />
                                    <Upload size={22} className={isDraggingImport ? 'text-indigo-500' : 'text-gray-400 dark:text-gray-500'} />
                                    {importFile ? (
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{importFile.name}</p>
                                    ) : (
                                        <>
                                            <p className="text-sm font-bold text-gray-600 dark:text-gray-300">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500">รองรับไฟล์จากหน้า sgs-export ทั้งแท็บ "ไฟล์ Excel" (SGS) และ "ไฟล์ CSV" (School MIS)</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {isParsingImport && (
                                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                    <Loader2 className="animate-spin" size={16} /> กำลังอ่านไฟล์และตรวจสอบข้อมูล...
                                </div>
                            )}

                            {importPreview && !isParsingImport && (
                                <>
                                    <div className="grid grid-cols-4 gap-3">
                                        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 p-3 text-center">
                                            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">{importPreview.length}</div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">รายการที่จะบันทึก</div>
                                        </div>
                                        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-3 text-center">
                                            <div className="text-xl font-black text-amber-600 dark:text-amber-400">{importSkippedColumns.length}</div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">วิชาที่ไม่พบในระบบ</div>
                                        </div>
                                        <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 p-3 text-center">
                                            <div className="text-xl font-black text-rose-600 dark:text-rose-400">{importSkippedCodes.length}</div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">รหัสนักเรียนที่ไม่พบ</div>
                                        </div>
                                        <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 p-3 text-center">
                                            <div className="text-xl font-black text-orange-600 dark:text-orange-400">{importDuplicateCount}</div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">รายการที่ซ้ำ (มีอยู่แล้ว)</div>
                                        </div>
                                    </div>

                                    {importDuplicateCount > 0 && (
                                        <label className="flex items-start gap-2 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/40 p-3 text-xs text-orange-700 dark:text-orange-400 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={skipDuplicateImports}
                                                onChange={(e) => setSkipDuplicateImports(e.target.checked)}
                                                className="mt-0.5 h-4 w-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500"
                                            />
                                            <span>
                                                <span className="font-bold">ข้ามรายการที่ซ้ำ (มีข้อมูลอยู่แล้ว)</span>
                                                <br />
                                                เปรียบเทียบจากวิชาเดียวกัน + นักเรียนคนเดียวกันในปีการศึกษา/ภาคเรียนนี้ ถ้าเคยบันทึกเกรดไว้แล้วจะไม่ทับข้อมูลเดิม (ถ้าไม่ติ๊ก ระบบจะบันทึกทับด้วยค่าใหม่ที่นำเข้า)
                                            </span>
                                        </label>
                                    )}

                                    {(importSkippedColumns.length > 0 || importSkippedCodes.length > 0) && (
                                        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                                            <div className="flex items-center gap-1.5 font-bold">
                                                <FileWarning size={14} /> รายการที่ข้ามไป (ไม่ตรงกับข้อมูลในระบบ)
                                            </div>
                                            {importSkippedColumns.length > 0 && (
                                                <p>วิชาที่ไม่พบ: {importSkippedColumns.join(', ')}</p>
                                            )}
                                            {importSkippedCodes.length > 0 && (
                                                <p>รหัสนักเรียนที่ไม่พบ: {importSkippedCodes.join(', ')}</p>
                                            )}
                                        </div>
                                    )}

                                    {importPreview.length > 0 ? (
                                        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                                <thead className="bg-gray-50 dark:bg-gray-800">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400">นักเรียน</th>
                                                        <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400">ชั้น/ห้อง</th>
                                                        <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400">วิชา</th>
                                                        <th className="px-4 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400">ค่าที่จะบันทึก</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                    {importPreview.map((p, idx) => (
                                                        <tr key={`${p.courseId}-${p.studentDocId}-${idx}`} className={p.isDuplicate ? 'bg-orange-50/60 dark:bg-orange-900/10' : undefined}>
                                                            <td className="px-4 py-2 whitespace-nowrap text-gray-900 dark:text-gray-200">
                                                                {p.studentName} <span className="text-gray-400 text-xs">({p.studentCode})</span>
                                                            </td>
                                                            <td className="px-4 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">{p.classLevel}/{p.room}</td>
                                                            <td className="px-4 py-2 whitespace-nowrap text-gray-900 dark:text-gray-200">{p.courseCode} {p.courseTitle}</td>
                                                            <td className="px-4 py-2 text-center">
                                                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                                                                    {p.grade}
                                                                </span>
                                                                {p.isDuplicate && (
                                                                    <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" title="มีเกรดบันทึกไว้แล้วในระบบ">
                                                                        ซ้ำ (เดิม: {p.existingGrade})
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">ไม่พบรายการ 0/ร/มส ในไฟล์นี้</div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={closeImportModal}
                                disabled={isSavingImport}
                                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 px-4 text-sm font-bold text-gray-600 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmImport}
                                disabled={!importPreview || importPreview.length === 0 || importAcademicYear.length !== 4 || isSavingImport}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSavingImport ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                                {isSavingImport ? "กำลังบันทึก..." : `ยืนยันบันทึก ${importEffectiveSaveCount} รายการ`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

export default ZeroRMsGradeReportPage;
