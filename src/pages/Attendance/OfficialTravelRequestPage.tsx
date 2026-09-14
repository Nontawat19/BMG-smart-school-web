import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { RootState } from "../../store";
import { firestore } from "@/firebase";
import {
    collection, doc, getDoc, getDocs, query, where, orderBy,
    Timestamp, onSnapshot, limit, runTransaction, updateDoc
} from "firebase/firestore";
import { ROLES } from "@/constants/roles";
import Swal from "sweetalert2";
import { useTheme } from "../../ThemeContext";
import MainLayout from "@/layouts/MainLayout";
import { useNavigate, useSearchParams } from "react-router-dom";
import ThaiDatePicker from "../../components/Common/ThaiDatePicker";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { getCurrentThaiYear, getThaiYear } from "@/utils/dateUtils";
// ชื่อฟังก์ชันบอกว่าไว้ใช้กับวันเกิดนักเรียน แต่จริงๆ เป็น date normalizer ทั่วไป (รับได้ทั้งข้อความไทย
// "๒ กันยายน ๒๕๖๐", ค.ศ./พ.ศ. คละกัน, Firestore Timestamp ฯลฯ คืน ISO ค.ศ. เสมอ) — ใช้ตรงนี้เพื่อความปลอดภัย
// เพราะ docDate ในทะเบียนหนังสือ (stampedDocuments/orders) ถูกกรอกเป็นข้อความอิสระจากหลายจุด ไม่รับประกันรูปแบบ
import { normalizeBirthDateInput as normalizeAnyDateToIso } from "@/utils/birthDateUtils";
import { getGroupPersonnel } from "@/utils/schoolUtils";
import Select from "react-select";
import OfficialTravelPdfButton from "@/components/Pdf/OfficialTravel/OfficialTravelPdfButton";
import BackButton from "@/components/Shared/BackButton";
import {
    Send, History, Layers, X, Check, Loader2, CheckCircle2, BookOpenCheck, Search
} from "lucide-react";

interface TravelRequest {
    id?: string; subject: string; to: string; requesterName: string; position: string; department: string;
    reason: string; location: string; refDocument: string; refDate?: string;
    startDate: Timestamp; endDate: Timestamp;
    budgetType: 'none' | 'school' | 'specific' | 'other'; budgetDetail?: string;
    specificExpenses?: { vehicle: boolean; fuel: boolean; allowance: boolean; accommodation: boolean } | null;
    transportType: 'public' | 'school_vehicle' | 'private_vehicle' | 'other'; transportDetail?: string;
    requiresSubstitute?: boolean; status: 'pending' | 'approved' | 'rejected'; createdAt: Timestamp;
    requesterId: string; requesterType: 'teacher' | 'student';
    coAdventurers?: { name: string; position: string; id: string; type?: 'student' | 'teacher' }[];
    uid?: string; docNo?: string; academicYear?: string; schoolId?: string;
    schoolAffiliation?: string; teacherDocId?: string | null;
}
interface UserOption { value: string; label: string; type: 'teacher' | 'student'; data: any; }

/* ── Student Selector Modal ── */
const StudentSelectorModal: React.FC<{
    schoolId: string | undefined; onClose: () => void; onSelect: (s: any[]) => void;
}> = ({ schoolId, onClose, onSelect }) => {
    const [classLevel, setClassLevel] = useState("");
    const [room, setRoom] = useState("");
    const [students, setStudents] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!schoolId || !classLevel) { setStudents([]); return; }
        const go = async () => {
            setLoading(true);
            try {
                let q = query(collection(firestore, 'school-settings', schoolId, 'students'), where('classLevel', '==', classLevel));
                if (room) q = query(q, where('room', '==', room));
                const snap = await getDocs(q);
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isStudyingStudent);
                list.sort((a: any, b: any) => parseInt(a.number || a.studentNumber || '0') - parseInt(b.number || b.studentNumber || '0'));
                setStudents(list);
            } catch { } finally { setLoading(false); }
        };
        go();
    }, [schoolId, classLevel, room]);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh] border border-gray-200 dark:border-gray-800">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">เลือกนักเรียนยกห้อง</p>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400"><X size={13} /></button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 mb-1">ระดับชั้น</p>
                            <select value={classLevel} onChange={e => { setClassLevel(e.target.value); setRoom(""); setSelectedIds(new Set()); }}
                                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none">
                                <option value="">เลือก...</option>
                                {['อ.1','อ.2','อ.3','ป.1','ป.2','ป.3','ป.4','ป.5','ป.6','ม.1','ม.2','ม.3','ม.4','ม.5','ม.6'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 mb-1">ห้อง</p>
                            <select value={room} onChange={e => setRoom(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none">
                                <option value="">ทุกห้อง</option>
                                {['1','2','3','4','5','6','7','8','9','10'].map(r => <option key={r} value={r}>ห้อง {r}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex justify-between items-center border-b border-gray-100 dark:border-gray-800">
                            <span className="text-[10px] font-bold text-gray-500">{students.length} คน</span>
                            {students.length > 0 && <label className="flex items-center gap-1 cursor-pointer text-[10px] text-gray-400 hover:text-indigo-500 font-bold">
                                <input type="checkbox" checked={selectedIds.size === students.length} onChange={e => setSelectedIds(e.target.checked ? new Set(students.map(s => s.id)) : new Set())} /> ทั้งหมด
                            </label>}
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                            {loading ? <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-xs"><Loader2 size={13} className="animate-spin" />กำลังโหลด...</div>
                                : students.length === 0 ? <p className="text-center py-8 text-xs text-gray-400">{classLevel ? 'ไม่พบนักเรียน' : 'เลือกระดับชั้นก่อน'}</p>
                                : students.map(s => (
                                    <label key={s.id} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${selectedIds.has(s.id) ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}>
                                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selectedIds.has(s.id) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                            {selectedIds.has(s.id) && <Check size={8} className="text-white" strokeWidth={3} />}
                                        </div>
                                        <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => { const n = new Set(selectedIds); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setSelectedIds(n); }} className="hidden" />
                                        <span className="text-[10px] text-gray-500 w-5 shrink-0">{s.number || s.studentNumber || '-'}</span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{s.prefix || s.title}{s.firstName} {s.lastName}</p>
                                            <p className="text-[9px] text-gray-400">{s.studentId} · {s.classLevel}/{s.room}</p>
                                        </div>
                                    </label>
                                ))}
                        </div>
                    </div>
                </div>
                <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 mr-auto">เลือก {selectedIds.size} คน</span>
                    <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">ยกเลิก</button>
                    <button onClick={() => onSelect(students.filter(s => selectedIds.has(s.id)))} disabled={selectedIds.size === 0} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg disabled:opacity-40">เพิ่ม</button>
                </div>
            </div>
        </div>
    );
};

const thaiMonthsShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const formatDocDateShort = (dateStr?: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    return `${d} ${thaiMonthsShort[m - 1]} ${getThaiYear(date)}`;
};

interface RegistryDoc { id: string; no: string; subject: string; docDate: string; extra?: string }

// normalizeAnyDateToIso คืนค่าดิบกลับมาเป็น string เดิมถ้าแปลงไม่สำเร็จ (ไม่ใช่ค่าว่าง) — ต้องเช็คซ้ำว่า
// ผลลัพธ์เป็น ISO จริงๆ ก่อนเชื่อ ไม่งั้นค่าที่ ThaiDatePicker (ซึ่งรับได้เฉพาะ "YYYY-MM-DD") จะพังเป็น
// "undefined undefined NaN" ถ้าข้อมูลในทะเบียนหนังสือเป็นรูปแบบที่แปลงไม่ได้จริงๆ
const safeIsoDate = (raw: unknown): string => {
    const normalized = normalizeAnyDateToIso(raw);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
};

/* ── Document Source Selector Modal (ดึงเลขที่/วันที่จากงานมอบหมาย ผอ. / หนังสือรับ / คำสั่ง) ── */
const DocumentSourceSelectorModal: React.FC<{
    schoolId: string | undefined; onClose: () => void; onSelect: (doc: { no: string; date: string }) => void;
}> = ({ schoolId, onClose, onSelect }) => {
    const [tab, setTab] = useState<'assignment' | 'received' | 'orders'>('assignment');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [docs, setDocs] = useState<RegistryDoc[]>([]);

    useEffect(() => {
        if (!schoolId) { setDocs([]); return; }
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                if (tab === 'orders') {
                    const snap = await getDocs(query(collection(firestore, 'school-settings', schoolId, 'orders'), orderBy('createdAt', 'desc'), limit(300)));
                    if (cancelled) return;
                    setDocs(snap.docs.map(d => {
                        const v = d.data() as any;
                        return { id: d.id, no: v.orderNo || '-', subject: v.subject || '-', docDate: safeIsoDate(v.docDate), extra: v.signedBy || '' };
                    }));
                } else {
                    // งานมอบหมาย (จากเกษียณ ผอ.) และ หนังสือรับ มาจากคอลเลกชันเดียวกัน (stampedDocuments) —
                    // ต่างกันแค่ตัวกรอง: "งานมอบหมาย" คือฉบับที่ ผอ. อนุมัติ/เกษียณสั่งการแล้ว (มี assignments)
                    const snap = await getDocs(query(collection(firestore, 'school-settings', schoolId, 'stampedDocuments'), orderBy('createdAt', 'desc'), limit(300)));
                    if (cancelled) return;
                    const rows = snap.docs.map(d => {
                        const v = d.data() as any;
                        const a = v.assignments;
                        const hasAssignment = !!a && (a.academic || a.general || a.budget || a.personnel || a.assignee || a.comment);
                        return {
                            id: d.id, no: v.docRefNo || '-', subject: v.subject || '-', docDate: safeIsoDate(v.docDate || v.date),
                            extra: a?.assignee || a?.comment || v.from || '', hasAssignment,
                        };
                    });
                    setDocs(tab === 'assignment' ? rows.filter(r => r.hasAssignment) : rows);
                }
            } catch (err) {
                console.error('Error loading document registry for picker:', err);
                if (!cancelled) setDocs([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [schoolId, tab]);

    const filtered = docs.filter(d => {
        const kw = search.trim().toLowerCase();
        if (!kw) return true;
        return d.no.toLowerCase().includes(kw) || d.subject.toLowerCase().includes(kw);
    });

    const tabs: { id: typeof tab; label: string }[] = [
        { id: 'assignment', label: 'งานมอบหมาย (เกษียณ ผอ.)' },
        { id: 'received', label: 'หนังสือรับ' },
        { id: 'orders', label: 'คำสั่ง' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] border border-gray-200 dark:border-gray-800">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <BookOpenCheck size={15} className="text-indigo-500" /> เลือกอ้างอิงจากทะเบียน
                    </p>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400"><X size={13} /></button>
                </div>
                <div className="px-4 pt-3 flex gap-1.5">
                    {tabs.map(t => (
                        <button key={t.id} type="button" onClick={() => setTab(t.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="p-4 space-y-3">
                    <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาเลขที่ / เรื่อง..."
                            className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none" />
                    </div>
                    <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                        <div className="max-h-64 overflow-y-auto">
                            {loading ? <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-xs"><Loader2 size={13} className="animate-spin" />กำลังโหลด...</div>
                                : filtered.length === 0 ? <p className="text-center py-8 text-xs text-gray-400">ไม่พบเอกสาร</p>
                                : filtered.map(d => (
                                    <button key={d.id} type="button"
                                        onClick={() => onSelect({ no: d.no, date: d.docDate })}
                                        className="w-full text-left px-3 py-2 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{d.no}</p>
                                            {d.docDate && <span className="shrink-0 text-[10px] text-gray-400">{formatDocDateShort(d.docDate)}</span>}
                                        </div>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{d.subject}</p>
                                        {d.extra && <p className="text-[9px] text-gray-400 truncate">{d.extra}</p>}
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ── Main Component ── */
const OfficialTravelRequestPage: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requesterType = (searchParams.get("type") as 'teacher' | 'student') || 'teacher';
    // นักเรียนไม่ใช่ข้าราชการ จึงใช้คำว่า "ไปร่วมกิจกรรม" แทน "ไปราชการ" ที่ใช้กับครู/บุคลากร
    const activityLabel = requesterType === 'student' ? 'ไปร่วมกิจกรรม' : 'ไปราชการ';
    const editPath = searchParams.get("editPath");
    const isEditMode = !!editPath;
    const { user } = useSelector((state: RootState) => state.auth);
    const schoolId = user?.schoolId;
    const { isDarkMode } = useTheme();
    const calendarState = useSelector((state: RootState) => state.calendar);
    const reduxRawData = calendarState.rawData;

    useEffect(() => { if (schoolId) dispatch(fetchCalendar(schoolId) as any); }, [schoolId, dispatch]);

    const [subject, setSubject] = useState(`ขออนุญาต${activityLabel}`);
    const [to, setTo] = useState("");
    const [requesterName, setRequesterName] = useState("");
    const [position, setPosition] = useState("");
    const [department, setDepartment] = useState("");
    const [reason, setReason] = useState("");
    const [location, setLocation] = useState("");
    const [refDocument, setRefDocument] = useState("");
    const [refDate, setRefDate] = useState("");
    const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
    const [budgetType, setBudgetType] = useState<'none' | 'school' | 'specific' | 'other'>('school');
    const [budgetOther, setBudgetOther] = useState("");
    const [specificExpenses, setSpecificExpenses] = useState({ vehicle: false, fuel: false, allowance: false, accommodation: false });
    const [transportType, setTransportType] = useState<'public' | 'school_vehicle' | 'private_vehicle' | 'other'>('school_vehicle');
    const [transportDetail, setTransportDetail] = useState("");
    const [requiresSubstitute, setRequiresSubstitute] = useState(false);
    const academicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [docNo, setDocNo] = useState("");
    const [schoolAffiliation, setSchoolAffiliation] = useState("");
    const [userOptions, setUserOptions] = useState<UserOption[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
    const [schoolInfo, setSchoolInfo] = useState({ schoolName: "", directorName: "", deputyName: "", personnelHeadName: "", personnelHeadRoleLabel: "", affiliation: "" });
    const [isSaved, setIsSaved] = useState(false);
    const [savedData, setSavedData] = useState<any>(null);
    const [isStudentSelectorOpen, setIsStudentSelectorOpen] = useState(false);
    const [isDocSelectorOpen, setIsDocSelectorOpen] = useState(false);
    const [onBehalfTeacherOption, setOnBehalfTeacherOption] = useState<UserOption | null>(null);

    const isTeacherRole = Array.isArray(user?.role)
        ? user.role.includes(ROLES.TEACHER)
        : (user as any)?.role === ROLES.TEACHER;

    useEffect(() => {
        if (!schoolId || !user || isEditMode) return;
        (async () => {
            try {
                const col = requesterType === 'teacher' ? 'teachers' : 'students';
                const snap = await getDocs(query(collection(firestore, 'school-settings', schoolId, col), where('uid', '==', user.uid)));
                if (!snap.empty) {
                    const d = snap.docs[0].data();
                    setRequesterName(`${d.title || ''}${d.firstName || ''} ${d.lastName || ''}`);
                    setPosition(requesterType === 'teacher' ? (d.position || "ครู") : `นักเรียนชั้น ${d.classLevel || ''}/${d.room || ''}`);
                }
            } catch { }
        })();
    }, [schoolId, user, requesterType, isEditMode]);

    useEffect(() => {
        if (!schoolId) return;
        (async () => {
            try {
                const opts: UserOption[] = [];
                const tSnap = await getDocs(collection(firestore, 'school-settings', schoolId, 'teachers'));
                tSnap.docs
                    .filter(d => (!d.data().status || String(d.data().status).trim() === 'อยู่') && !isAttendanceEntryOnly(d.data().role))
                    .forEach(d => opts.push({ value: d.id, label: `${d.data().title || ''}${d.data().firstName || ''} ${d.data().lastName || ''}`, type: 'teacher', data: d.data() }));
                const sSnap = await getDocs(collection(firestore, 'school-settings', schoolId, 'students'));
                sSnap.docs.filter(d => isStudyingStudent({ id: d.id, ...d.data() })).forEach(d => opts.push({ value: d.id, label: `${d.data().title || ''}${d.data().firstName || ''} ${d.data().lastName || ''}`, type: 'student', data: d.data() }));
                setUserOptions(opts);
            } catch { }
        })();
    }, [schoolId]);

    useEffect(() => {
        if (!schoolId) return;
        (async () => {
            try {
                const snap = await getDoc(doc(firestore, 'school-settings', schoolId));
                if (snap.exists()) {
                    const d = snap.data();
                    const rawSchoolName = (d.schoolName || "").trim();
                    const schoolNameWithPrefix = rawSchoolName.startsWith("โรงเรียน") ? rawSchoolName : `โรงเรียน${rawSchoolName}`;
                    if (!isEditMode) setTo(`ผู้อำนวยการ${schoolNameWithPrefix}`);
                    const personnelPersonnel = getGroupPersonnel(d, 'personnel');
                    setSchoolInfo({ schoolName: d.schoolName || "", directorName: `${d.directorPrefix || ""}${d.directorName || ""}`, deputyName: `${d.deputyPrefix || ""}${d.deputyName || ""}`, personnelHeadName: personnelPersonnel.name, personnelHeadRoleLabel: personnelPersonnel.label, affiliation: d.affiliation || "" });
                }
            } catch { }
        })();
    }, [schoolId, isEditMode]);

    useEffect(() => {
        if (!schoolId) return;
        if (calendarState.status === 'succeeded' && reduxRawData.events) { setCalendarEvents(reduxRawData.events); return; }
        const unsub = onSnapshot(doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default'), snap => { if (snap.exists() && snap.data().events) setCalendarEvents(snap.data().events); });
        return () => unsub();
    }, [schoolId, calendarState.status, reduxRawData.events]);

    useEffect(() => {
        if (!schoolId || !academicYear) return;
        (async () => {
            try {
                const calSnap = await getDoc(doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default'));
                if (calSnap.exists() && calSnap.data().affiliation) setSchoolAffiliation(calSnap.data().affiliation);
                else { const s = await getDoc(doc(firestore, 'school-settings', schoolId)); if (s.exists()) setSchoolAffiliation(s.data().affiliation || ""); }
                if (!isEditMode) {
                    const cSnap = await getDoc(doc(firestore, 'school-settings', schoolId, 'counters', `official_travel_${academicYear}`));
                    setDocNo(cSnap.exists() ? `${(cSnap.data().lastNumber || 0) + 1}/${academicYear}` : `1/${academicYear}`);
                }
            } catch { if (!isEditMode) setDocNo(`1/${academicYear}`); }
        })();
    }, [schoolId, academicYear, isEditMode]);

    // 📌 โหมดแก้ไข: โหลดข้อมูลคำขอเดิมมาเติมในฟอร์ม (แทนค่า default ทั้งหมดด้านบน)
    const [isEditLoading, setIsEditLoading] = useState(false);
    useEffect(() => {
        if (!editPath) return;
        setIsEditLoading(true);
        (async () => {
            try {
                const snap = await getDoc(doc(firestore, editPath));
                if (!snap.exists()) {
                    Swal.fire({ icon: "error", title: "ไม่พบคำขอที่ต้องการแก้ไข", background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827" });
                    return;
                }
                const d = snap.data() as any;
                const toDateInput = (value: any) => {
                    if (!value) return new Date().toISOString().split("T")[0];
                    const dt = value?.toDate && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
                    return isNaN(dt.getTime()) ? new Date().toISOString().split("T")[0] : dt.toISOString().split("T")[0];
                };
                setSubject(d.subject || "");
                setTo(d.to || "");
                setRequesterName(d.requesterName || "");
                setPosition(d.position || "");
                setDepartment(d.department || "");
                setReason(d.reason || "");
                setLocation(d.location || "");
                setRefDocument(d.refDocument || "");
                setRefDate(d.refDate || "");
                setStartDate(toDateInput(d.startDate));
                setEndDate(toDateInput(d.endDate));
                setBudgetType(d.budgetType || 'school');
                setBudgetOther(d.budgetDetail || "");
                setSpecificExpenses(d.specificExpenses || { vehicle: false, fuel: false, allowance: false, accommodation: false });
                setTransportType(d.transportType || 'school_vehicle');
                setTransportDetail(d.transportDetail || "");
                setRequiresSubstitute(!!d.requiresSubstitute);
                setDocNo(d.docNo || "");
                if (Array.isArray(d.coAdventurers)) {
                    setSelectedUsers(d.coAdventurers.map((c: any) => ({
                        value: c.id, label: c.name, type: c.type || 'teacher', data: { position: c.position },
                    })));
                }
            } catch (e) {
                console.error("Error loading travel request for edit:", e);
                Swal.fire({ icon: "error", title: "โหลดข้อมูลไม่สำเร็จ", background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827" });
            } finally {
                setIsEditLoading(false);
            }
        })();
    }, [editPath]);

    const handleSubmit = async () => {
        if (!reason || !location || !startDate || !endDate) {
            Swal.fire({ icon: "warning", title: "ข้อมูลไม่ครบ", text: "กรุณากรอกเหตุผล สถานที่ และวันที่", background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827" });
            return;
        }
        if (!isEditMode && !isTeacherRole && !onBehalfTeacherOption) {
            Swal.fire({ icon: "warning", title: "ข้อมูลไม่ครบ", text: "กรุณาเลือกครูที่ต้องการยื่นคำขอแทน", background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827" });
            return;
        }
        if (!schoolId || !user) return;

        if (isEditMode && editPath) {
            setIsLoading(true);
            try {
                const coAdventurersList = selectedUsers.map(o => ({ id: o.value, name: o.label, position: o.data?.position || (o.type === 'student' ? 'นักเรียน' : 'ครู'), type: o.type }));
                const data = {
                    subject, to, requesterName, position, department, reason, location, refDocument, refDate,
                    startDate: Timestamp.fromDate(new Date(startDate)), endDate: Timestamp.fromDate(new Date(endDate)),
                    budgetType, budgetDetail: budgetType === 'other' ? budgetOther : "",
                    specificExpenses: budgetType === 'specific' ? specificExpenses : null,
                    transportType, transportDetail, requiresSubstitute,
                    coAdventurers: coAdventurersList,
                    docNo,
                };
                await updateDoc(doc(firestore, editPath), { ...data, updatedAt: Timestamp.now(), updatedBy: user.uid });
                setSavedData(data);
                setIsSaved(true);
                Swal.fire({ icon: "success", title: "บันทึกการแก้ไขสำเร็จ", background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827", confirmButtonColor: "#4f46e5", timer: 2000, showConfirmButton: false });
            } catch (error) {
                Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: (error as Error).message, background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827" });
            } finally { setIsLoading(false); }
            return;
        }

        setIsLoading(true);
        try {
            let requesterRef: any;
            let finalRequesterId: string;
            let teacherUid: string;

            if (isTeacherRole) {
                // ครูยื่นเอง — ค้นหาจาก uid ของตัวเอง
                const col = requesterType === 'teacher' ? 'teachers' : 'students';
                const snap = await getDocs(query(collection(firestore, 'school-settings', schoolId, col), where('uid', '==', user.uid)));
                if (snap.empty) throw new Error("ไม่พบข้อมูลผู้ใช้");
                requesterRef = snap.docs[0].ref;
                finalRequesterId = snap.docs[0].id;
                teacherUid = user.uid;
            } else {
                // admin/บุคคล ยื่นแทนครู — ใช้ teacher doc ID จาก dropdown
                finalRequesterId = onBehalfTeacherOption!.value;
                requesterRef = doc(firestore, 'school-settings', schoolId, 'teachers', finalRequesterId);
                teacherUid = onBehalfTeacherOption!.data?.uid || '';
            }

            const coAdventurersList = selectedUsers.map(o => ({ id: o.value, name: o.label, position: o.data.position || (o.type === 'student' ? 'นักเรียน' : 'ครู'), type: o.type }));
            let finalDocNo = docNo;
            const counterRef = doc(firestore, 'school-settings', schoolId, 'counters', `official_travel_${academicYear}`);
            await runTransaction(firestore, async (tx: any) => {
                const cs = await tx.get(counterRef);
                const n = cs.exists() ? (cs.data().lastNumber || 0) + 1 : 1;
                finalDocNo = `${n}/${academicYear}`;
                tx.set(counterRef, { lastNumber: n }, { merge: true });
                const data: TravelRequest = {
                    subject, to, requesterName, position, department, reason, location, refDocument, refDate,
                    startDate: Timestamp.fromDate(new Date(startDate)), endDate: Timestamp.fromDate(new Date(endDate)),
                    budgetType, budgetDetail: budgetType === 'other' ? budgetOther : "",
                    specificExpenses: budgetType === 'specific' ? specificExpenses : null,
                    transportType, transportDetail, requiresSubstitute, status: 'pending', createdAt: Timestamp.now(),
                    requesterId: finalRequesterId, requesterType: 'teacher', uid: teacherUid,
                    coAdventurers: coAdventurersList,
                    docNo: finalDocNo, academicYear, schoolId, schoolAffiliation, teacherDocId: finalRequesterId,
                    ...(isTeacherRole ? {} : { submittedByUid: user.uid }),
                };
                tx.set(doc(collection(requesterRef, "travel_summary")), data);
                setSavedData(data);
            });
            setIsSaved(true);
            Swal.fire({ icon: "success", title: "บันทึกสำเร็จ", background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827", confirmButtonColor: "#4f46e5", timer: 2000, showConfirmButton: false });
        } catch (error) {
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: (error as Error).message, background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827" });
        } finally { setIsLoading(false); }
    };

    const fi = "w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500";
    const fl = "block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300";

    const budgets = [
        { id: 'none', label: 'ไม่เบิก' },
        { id: 'school', label: 'ตามสิทธิ์' },
        { id: 'specific', label: 'ระบุรายการ' },
        { id: 'other', label: 'อื่นๆ' },
    ];
    const transports = [
        { id: 'school_vehicle', label: 'รถราชการ' },
        { id: 'private_vehicle', label: 'รถส่วนตัว' },
        { id: 'public', label: 'รถโดยสาร' },
        { id: 'other', label: 'อื่นๆ' },
    ];

    const selectStyles = {
        control: (base: any) => ({ ...base, backgroundColor: isDarkMode ? '#1e1f21' : '#fff', borderColor: isDarkMode ? '#4b5563' : '#d1d5db' }),
        menu: (base: any) => ({ ...base, backgroundColor: isDarkMode ? '#2a2b2f' : '#fff' }),
        option: (base: any, { isFocused, isSelected }: any) => ({
            ...base,
            backgroundColor: isSelected ? (isDarkMode ? '#4f46e5' : '#6366f1') : isFocused ? (isDarkMode ? '#374151' : '#eef2ff') : 'transparent',
            color: isSelected ? 'white' : (isDarkMode ? 'white' : '#111827'),
        }),
        multiValue: (base: any) => ({ ...base, backgroundColor: isDarkMode ? '#312e81' : '#eef2ff' }),
        multiValueLabel: (base: any) => ({ ...base, color: isDarkMode ? '#c7d2fe' : '#4338ca' }),
        singleValue: (base: any) => ({ ...base, color: isDarkMode ? 'white' : '#111827' }),
        input: (base: any) => ({ ...base, color: isDarkMode ? 'white' : '#111827' }),
    };

    return (
        <MainLayout>
            <div className="p-3 sm:p-4 text-gray-900 dark:text-white transition-colors duration-300">
                <div className="max-w-6xl mx-auto">

                    {/* ── Header ── */}
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl px-5 py-3.5 mb-3 shadow-sm dark:shadow-none">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <BackButton />
                                <div className="min-w-0">
                                    <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
                                        {isEditMode ? `แก้ไขคำขอ${activityLabel}` : `ขออนุญาต${activityLabel}`}
                                    </h1>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        กรอกแบบฟอร์มเพื่อยื่นคำขออนุญาต{activityLabel}{docNo ? ` · เลขที่ ${docNo}` : ''}
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={() => navigate(`/school/${schoolId}/official-travel-history`)}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all">
                                <History size={15} /> ประวัติ
                            </button>
                        </div>
                    </div>

                    {/* ── Form ── */}
                    <form
                        onSubmit={e => { e.preventDefault(); handleSubmit(); }}
                        className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 space-y-3.5 shadow-sm dark:shadow-none"
                    >
                        {!isTeacherRole && !isEditMode && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg">
                                <label className="block text-sm font-medium mb-1.5 text-amber-700 dark:text-amber-400">
                                    ยื่นแทนครู *
                                </label>
                                <Select
                                    options={userOptions.filter(o => o.type === 'teacher')}
                                    value={onBehalfTeacherOption}
                                    onChange={(opt: any) => {
                                        setOnBehalfTeacherOption(opt);
                                        if (opt) {
                                            const d = opt.data;
                                            setRequesterName(`${d.title || ''}${d.firstName || ''} ${d.lastName || ''}`);
                                            setPosition(d.position || 'ครู');
                                            setDepartment(d.department || d.learningArea || '');
                                        }
                                    }}
                                    styles={selectStyles}
                                    placeholder="ค้นหาและเลือกครูที่ต้องการยื่นคำขอแทน..."
                                    noOptionsMessage={() => "ไม่พบครู"}
                                    isClearable
                                    aria-label="เลือกครูที่ยื่นคำขอแทน"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            <div>
                                <label className={fl}>เลขที่</label>
                                <input value={docNo} onChange={e => setDocNo(e.target.value)} className={fi} placeholder="อัตโนมัติ" />
                            </div>
                            <div>
                                <label className={fl}>เรื่อง *</label>
                                <input value={subject} onChange={e => setSubject(e.target.value)} className={fi} />
                            </div>
                            <div>
                                <label className={fl}>เรียน</label>
                                <input value={to} onChange={e => setTo(e.target.value)} className={fi} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            <div>
                                <label className={fl}>ชื่อ-สกุลผู้ขออนุญาต *</label>
                                <input value={requesterName} onChange={e => setRequesterName(e.target.value)} className={fi} />
                            </div>
                            <div>
                                <label className={fl}>ตำแหน่ง</label>
                                <input value={position} onChange={e => setPosition(e.target.value)} className={fi} />
                            </div>
                            <div>
                                <label className={fl}>สังกัด</label>
                                <input value={department} onChange={e => setDepartment(e.target.value)} className={fi} />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className={`${fl} mb-0`}>
                                    ผู้ร่วมเดินทาง
                                    {selectedUsers.length > 0 && (
                                        <span className="ml-2 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-full">
                                            {selectedUsers.length} คน
                                        </span>
                                    )}
                                </label>
                                <button type="button" onClick={() => setIsStudentSelectorOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all">
                                    <Layers size={13} /> เลือกยกห้อง
                                </button>
                            </div>
                            <Select isMulti options={userOptions} value={selectedUsers}
                                onChange={v => setSelectedUsers(v as UserOption[])}
                                styles={selectStyles} placeholder="ค้นหาและเพิ่มผู้ร่วมเดินทาง..."
                                noOptionsMessage={() => "ไม่พบ"}
                                aria-label="เลือกผู้ร่วมเดินทาง" />
                        </div>

                        <div>
                            <label className={fl}>รายละเอียด / เหตุผล *</label>
                            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                                className={fi}
                                placeholder={requesterType === 'student' ? "ระบุรายละเอียดการไปร่วมกิจกรรม เช่น แข่งขันกีฬา ทัศนศึกษา อบรม..." : "ระบุรายละเอียดการไปราชการ เช่น เข้าร่วมประชุม อบรม สัมมนา..."}
                                aria-label="ระบุรายละเอียด/เหตุผล" />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            <div>
                                <label className={fl}>สถานที่ ณ *</label>
                                <input value={location} onChange={e => setLocation(e.target.value)} className={fi} placeholder="ระบุสถานที่..." />
                            </div>
                            <div>
                                <label className={fl}>ตั้งแต่วันที่ *</label>
                                <ThaiDatePicker value={startDate} onChange={setStartDate} events={calendarEvents} />
                            </div>
                            <div>
                                <label className={fl}>ถึงวันที่ *</label>
                                <ThaiDatePicker value={endDate} onChange={setEndDate} events={calendarEvents} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className={`${fl} mb-0`}>ตามหนังสือ / คำสั่งที่</label>
                                    <button type="button" onClick={() => setIsDocSelectorOpen(true)}
                                        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                                        <BookOpenCheck size={11} /> เลือกจากทะเบียน
                                    </button>
                                </div>
                                <input value={refDocument} onChange={e => setRefDocument(e.target.value)} className={fi} placeholder="เลขที่อ้างอิง..." />
                            </div>
                            <div>
                                <label className={fl}>ลงวันที่</label>
                                <ThaiDatePicker value={refDate} onChange={setRefDate} placeholder="วันที่..." />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            <div>
                                <label className={fl}>งบประมาณ</label>
                                <select value={budgetType} onChange={e => setBudgetType(e.target.value as any)} className={fi} aria-label="เลือกงบประมาณ">
                                    {budgets.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                                </select>
                                {budgetType === 'other' && (
                                    <input value={budgetOther} onChange={e => setBudgetOther(e.target.value)}
                                        className={`${fi} mt-2`} placeholder="ระบุ..." />
                                )}
                                {budgetType === 'specific' && (
                                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                                        {[{ k: 'vehicle', l: 'ค่าพาหนะ' }, { k: 'fuel', l: 'ค่าน้ำมัน' }, { k: 'allowance', l: 'ค่าเบี้ยเลี้ยง' }, { k: 'accommodation', l: 'ค่าที่พัก' }].map(e => (
                                            <label key={e.k} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-600 dark:text-gray-300">
                                                <input type="checkbox" checked={specificExpenses[e.k as keyof typeof specificExpenses]}
                                                    onChange={() => setSpecificExpenses(p => ({ ...p, [e.k]: !p[e.k as keyof typeof specificExpenses] }))}
                                                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500" />
                                                {e.l}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className={fl}>การเดินทาง</label>
                                <select value={transportType} onChange={e => setTransportType(e.target.value as any)} className={fi} aria-label="เลือกการเดินทาง">
                                    {transports.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                                {(transportType === 'private_vehicle' || transportType === 'other') && (
                                    <input value={transportDetail} onChange={e => setTransportDetail(e.target.value)}
                                        className={`${fi} mt-2`}
                                        placeholder={transportType === 'private_vehicle' ? 'ทะเบียนรถ / ยี่ห้อ...' : 'ระบุวิธีการเดินทาง...'} />
                                )}
                            </div>
                            <div>
                                <label className={fl}>ต้องการครูสอนแทน</label>
                                <select value={requiresSubstitute ? '1' : '0'} onChange={e => setRequiresSubstitute(e.target.value === '1')} className={fi} aria-label="เลือกความต้องการครูสอนแทน">
                                    <option value="0">ไม่ต้องการ</option>
                                    <option value="1">ต้องการ</option>
                                </select>
                            </div>
                        </div>

                        {isSaved && savedData && (
                            <div className="flex flex-wrap items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg">
                                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">บันทึกสำเร็จ · เลขที่ {savedData.docNo}</span>
                                <OfficialTravelPdfButton data={savedData} schoolName={schoolInfo.schoolName}
                                    schoolAffiliation={schoolInfo.affiliation} directorName={schoolInfo.directorName}
                                    deputyName={schoolInfo.deputyName} personnelHeadName={schoolInfo.personnelHeadName}
                                    personnelHeadRoleLabel={schoolInfo.personnelHeadRoleLabel} />
                            </div>
                        )}

                        <div className="flex justify-end items-center gap-4">
                            {isSaved ? (
                                <>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        เลขที่เอกสาร: <span className="font-bold text-gray-900 dark:text-white">{savedData?.docNo}</span>
                                    </p>
                                    <button type="button" onClick={() => navigate(-1)}
                                        className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold py-2 px-6 rounded-lg transition-colors duration-200">
                                        กลับ
                                    </button>
                                </>
                            ) : (
                                <button type="submit" disabled={isLoading || isEditLoading}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed">
                                    {isLoading
                                        ? <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</>
                                        : isEditLoading
                                            ? <><Loader2 size={16} className="animate-spin" /> กำลังโหลดข้อมูล...</>
                                            : <><Send size={16} /> {isEditMode ? "บันทึกการแก้ไข" : "บันทึกและส่งคำขอ"}</>}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>

            {isStudentSelectorOpen && (
                <StudentSelectorModal schoolId={schoolId || undefined} onClose={() => setIsStudentSelectorOpen(false)}
                    onSelect={students => {
                        const newOpts = students.map(s => ({
                            value: s.id,
                            label: `${s.title || ''}${s.firstName} ${s.lastName}`,
                            type: 'student' as const,
                            data: s,
                        }));
                        setSelectedUsers(prev => {
                            const ex = new Set(prev.map(p => p.value));
                            return [...prev, ...newOpts.filter(n => !ex.has(n.value))];
                        });
                        setIsStudentSelectorOpen(false);
                    }}
                />
            )}

            {isDocSelectorOpen && (
                <DocumentSourceSelectorModal schoolId={schoolId || undefined} onClose={() => setIsDocSelectorOpen(false)}
                    onSelect={picked => {
                        setRefDocument(picked.no);
                        if (picked.date) {
                            setRefDate(picked.date);
                        } else {
                            Swal.fire({ icon: "info", title: "อ่านวันที่ในเอกสารนี้ไม่ได้", text: "กรุณาเลือกวันที่เองในช่อง \"ลงวันที่\"", background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827", timer: 2500, showConfirmButton: false, toast: true, position: "top-end" });
                        }
                        setIsDocSelectorOpen(false);
                    }}
                />
            )}
        </MainLayout>
    );
};

export default OfficialTravelRequestPage;
