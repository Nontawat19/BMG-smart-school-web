import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { RootState } from "../../store";
import { firestore } from "@/firebase";
import {
    collection, doc, getDoc, getDocs, query, where,
    Timestamp, onSnapshot, limit, runTransaction
} from "firebase/firestore";
import Swal from "sweetalert2";
import { useTheme } from "../../ThemeContext";
import MainLayout from "@/layouts/MainLayout";
import { useNavigate, useSearchParams } from "react-router-dom";
import ThaiDatePicker from "../../components/Common/ThaiDatePicker";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import Select from "react-select";
import OfficialTravelPdfButton from "@/components/Pdf/OfficialTravel/OfficialTravelPdfButton";
import BackButton from "@/components/Shared/BackButton";
import {
    Send, History, Users, Hash, MapPin, FileText, CalendarDays,
    Wallet, Car, BookUser, Loader2, Plane, Layers, X, Check,
    UserCheck, CheckCircle2
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

/* ── Main Component ── */
const OfficialTravelRequestPage: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requesterType = (searchParams.get("type") as 'teacher' | 'student') || 'teacher';
    const { user } = useSelector((state: RootState) => state.auth);
    const schoolId = user?.schoolId;
    const { isDarkMode } = useTheme();
    const calendarState = useSelector((state: RootState) => state.calendar);
    const reduxRawData = calendarState.rawData;

    useEffect(() => { if (schoolId) dispatch(fetchCalendar(schoolId) as any); }, [schoolId, dispatch]);

    const [subject, setSubject] = useState("ขออนุญาตไปราชการ");
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
    const [schoolInfo, setSchoolInfo] = useState({ schoolName: "", directorName: "", deputyName: "", personnelHeadName: "", affiliation: "" });
    const [isSaved, setIsSaved] = useState(false);
    const [savedData, setSavedData] = useState<any>(null);
    const [isStudentSelectorOpen, setIsStudentSelectorOpen] = useState(false);

    useEffect(() => {
        if (!schoolId || !user) return;
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
    }, [schoolId, user, requesterType]);

    useEffect(() => {
        if (!schoolId) return;
        (async () => {
            try {
                const opts: UserOption[] = [];
                const tSnap = await getDocs(query(collection(firestore, 'school-settings', schoolId, 'teachers'), limit(100)));
                tSnap.forEach(d => opts.push({ value: d.id, label: `${d.data().title || ''}${d.data().firstName || ''} ${d.data().lastName || ''}`, type: 'teacher', data: d.data() }));
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
                    setTo(`ผู้อำนวยการโรงเรียน${d.schoolName || ""}`);
                    setSchoolInfo({ schoolName: d.schoolName || "", directorName: d.directorName || "", deputyName: `${d.deputyPrefix || ""}${d.deputyName || ""}`, personnelHeadName: `${d.personnelHeadPrefix || ""}${d.personnelHeadName || ""}`, affiliation: d.affiliation || "" });
                }
            } catch { }
        })();
    }, [schoolId]);

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
                const cSnap = await getDoc(doc(firestore, 'school-settings', schoolId, 'counters', `official_travel_${academicYear}`));
                setDocNo(cSnap.exists() ? `${(cSnap.data().lastNumber || 0) + 1}/${academicYear}` : `1/${academicYear}`);
            } catch { setDocNo(`1/${academicYear}`); }
        })();
    }, [schoolId, academicYear]);

    const handleSubmit = async () => {
        if (!reason || !location || !startDate || !endDate) {
            Swal.fire({ icon: "warning", title: "ข้อมูลไม่ครบ", text: "กรุณากรอกเหตุผล สถานที่ และวันที่", background: isDarkMode ? "#111827" : "#fff", color: isDarkMode ? "#f9fafb" : "#111827" });
            return;
        }
        if (!schoolId || !user) return;
        setIsLoading(true);
        try {
            const col = requesterType === 'teacher' ? 'teachers' : 'students';
            const snap = await getDocs(query(collection(firestore, 'school-settings', schoolId, col), where('uid', '==', user.uid)));
            if (snap.empty) throw new Error("ไม่พบข้อมูลผู้ใช้");
            const requesterRef = snap.docs[0].ref;
            const finalRequesterId = snap.docs[0].id;
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
                    requesterId: finalRequesterId, requesterType, uid: user.uid, coAdventurers: coAdventurersList,
                    docNo: finalDocNo, academicYear, schoolId, schoolAffiliation, teacherDocId: requesterType === 'teacher' ? finalRequesterId : null,
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

    const fi = "w-full px-2.5 py-[7px] text-xs bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-400/20 transition-colors";
    const fl = "block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5";
    const div = "border-t border-gray-100 dark:border-gray-800";

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
        control: (p: any) => ({ ...p, backgroundColor: isDarkMode ? 'rgba(31,41,55,0.8)' : 'white', borderColor: isDarkMode ? '#374151' : '#e5e7eb', borderRadius: '0.5rem', minHeight: '32px', boxShadow: 'none', fontSize: '12px', '&:hover': { borderColor: '#818cf8' } }),
        valueContainer: (p: any) => ({ ...p, padding: '2px 8px' }),
        menu: (p: any) => ({ ...p, backgroundColor: isDarkMode ? '#111827' : 'white', borderRadius: '0.5rem', border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`, zIndex: 60, fontSize: '12px' }),
        option: (p: any, s: any) => ({ ...p, backgroundColor: s.isFocused ? (isDarkMode ? '#374151' : '#eef2ff') : 'transparent', color: isDarkMode ? '#f3f4f6' : '#111827', padding: '6px 10px' }),
        multiValue: (p: any) => ({ ...p, backgroundColor: isDarkMode ? '#312e81' : '#eef2ff', borderRadius: '4px' }),
        multiValueLabel: (p: any) => ({ ...p, color: isDarkMode ? '#c7d2fe' : '#4338ca', fontSize: '11px', padding: '1px 4px' }),
        multiValueRemove: (p: any) => ({ ...p, color: isDarkMode ? '#a5b4fc' : '#6366f1', '&:hover': { backgroundColor: '#ef4444', color: 'white' } }),
        placeholder: (p: any) => ({ ...p, color: isDarkMode ? '#6b7280' : '#9ca3af', fontSize: '12px' }),
        input: (p: any) => ({ ...p, color: isDarkMode ? '#f3f4f6' : '#111827', margin: 0, padding: 0 }),
        dropdownIndicator: (p: any) => ({ ...p, padding: '4px' }),
        clearIndicator: (p: any) => ({ ...p, padding: '4px' }),
    };

    const Pill = ({ label, active, color, onClick }: { id: string; label: string; active: boolean; color: string; onClick: () => void }) => (
        <button type="button" onClick={onClick}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${active
                ? `${color} text-white shadow-sm border-transparent`
                : 'bg-white dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}>
            {label}
        </button>
    );

    return (
        <MainLayout>
            <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>

                {/* ── Top Bar ── */}
                <div className="shrink-0 h-11 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 px-4 lg:pl-12 lg:pr-5">
                    <BackButton />
                    <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
                        <Plane size={11} className="text-white" />
                    </div>
                    <h1 className="text-sm font-bold text-gray-900 dark:text-white flex-1">ขออนุญาตไปราชการ</h1>
                    {docNo && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                            <Hash size={9} className="text-gray-400" />
                            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{docNo}</span>
                        </div>
                    )}
                    <button onClick={() => navigate(`/school/${schoolId}/official-travel-history`)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all">
                        <History size={11} /> ประวัติ
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-950 p-3 lg:px-12">
                    <div className="h-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col">

                        {/* ── R1: เลขที่ | เรื่อง | เรียน ── */}
                        <div className="shrink-0 px-5 pt-3 pb-2.5 rounded-t-xl">
                            <div className="grid grid-cols-12 gap-3">
                                <div className="col-span-2">
                                    <label className={fl}><FileText size={9} className="inline mr-1 text-indigo-400" />เลขที่</label>
                                    <input value={docNo} onChange={e => setDocNo(e.target.value)} className={fi} placeholder="อัตโนมัติ" />
                                </div>
                                <div className="col-span-4">
                                    <label className={fl}>เรื่อง *</label>
                                    <input value={subject} onChange={e => setSubject(e.target.value)} className={fi} />
                                </div>
                                <div className="col-span-6">
                                    <label className={fl}>เรียน</label>
                                    <input value={to} onChange={e => setTo(e.target.value)} className={fi} />
                                </div>
                            </div>
                        </div>

                        <div className={div} />

                        {/* ── R2: ผู้ขออนุญาต ── */}
                        <div className="shrink-0 px-5 py-2.5">
                            <div className="grid grid-cols-12 gap-3">
                                <div className="col-span-4">
                                    <label className={fl}><BookUser size={9} className="inline mr-1 text-sky-400" />ชื่อ-สกุล *</label>
                                    <input value={requesterName} onChange={e => setRequesterName(e.target.value)} className={fi} />
                                </div>
                                <div className="col-span-3">
                                    <label className={fl}>ตำแหน่ง</label>
                                    <input value={position} onChange={e => setPosition(e.target.value)} className={fi} />
                                </div>
                                <div className="col-span-5">
                                    <label className={fl}>สังกัด</label>
                                    <input value={department} onChange={e => setDepartment(e.target.value)} className={fi} />
                                </div>
                            </div>
                        </div>

                        <div className={div} />

                        {/* ── R2.5: ผู้ร่วมเดินทาง | การสอนแทน ── */}
                        <div className="shrink-0 px-5 py-2">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 shrink-0">
                                    <Users size={10} className="text-emerald-500" />
                                    <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap">ผู้ร่วมเดินทาง</span>
                                    {selectedUsers.length > 0 && (
                                        <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold rounded-full whitespace-nowrap">
                                            {selectedUsers.length} คน
                                        </span>
                                    )}
                                    <button type="button" onClick={() => setIsStudentSelectorOpen(true)}
                                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all">
                                        <Layers size={9} /> ยกห้อง
                                    </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <Select isMulti options={userOptions} value={selectedUsers}
                                        onChange={v => setSelectedUsers(v as UserOption[])}
                                        styles={selectStyles} placeholder="ค้นหาและเพิ่มผู้ร่วมเดินทาง..."
                                        noOptionsMessage={() => "ไม่พบ"} />
                                </div>

                            </div>
                        </div>

                        <div className={div} />

                        {/* ── R3: รายละเอียด/เหตุผล ── */}
                        <div className="shrink-0 px-5 py-2.5">
                            <label className={fl}><MapPin size={9} className="inline mr-1 text-amber-400" />รายละเอียด / เหตุผล *</label>
                            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                                className={`${fi} resize-none`}
                                placeholder="ระบุรายละเอียดการไปราชการ เช่น เข้าร่วมประชุม อบรม สัมมนา..." />
                        </div>

                        <div className={div} />

                        {/* ── R4: สถานที่ | วันที่ | อ้างอิง ── */}
                        <div className="flex-1 flex flex-col px-5 py-2.5 gap-2.5 min-h-0">
                            {/* Sub-row 1: สถานที่ + ช่วงวันที่ */}
                            <div className="grid grid-cols-12 gap-3 items-end">
                                <div className="col-span-5">
                                    <label className={fl}><MapPin size={9} className="inline mr-1 text-rose-400" />สถานที่ ณ *</label>
                                    <textarea value={location} onChange={e => setLocation(e.target.value)} className={`${fi} resize-none`} rows={2} placeholder="ระบุสถานที่..." />
                                </div>
                                <div className="col-span-3">
                                    <label className={fl}><CalendarDays size={9} className="inline mr-1 text-amber-400" />ตั้งแต่วันที่ *</label>
                                    <ThaiDatePicker value={startDate} onChange={setStartDate} events={calendarEvents} />
                                </div>
                                <div className="col-span-4">
                                    <label className={fl}>ถึงวันที่ *</label>
                                    <ThaiDatePicker value={endDate} onChange={setEndDate} events={calendarEvents} />
                                </div>
                            </div>
                            {/* Sub-row 2: อ้างอิง + ลงวันที่ */}
                            <div className="grid grid-cols-12 gap-3 items-end">
                                <div className="col-span-8">
                                    <label className={fl}>ตามหนังสือ / คำสั่งที่</label>
                                    <input value={refDocument} onChange={e => setRefDocument(e.target.value)} className={fi} placeholder="เลขที่อ้างอิง..." />
                                </div>
                                <div className="col-span-4">
                                    <label className={fl}>ลงวันที่</label>
                                    <ThaiDatePicker value={refDate} onChange={setRefDate} placeholder="วันที่..." />
                                </div>
                            </div>
                        </div>

                        <div className={div} />

                        {/* ── R5: งบประมาณ | การเดินทาง | สอนแทน ── */}
                        <div className="shrink-0 px-5 py-3">
                            <div className="grid grid-cols-12 gap-3">

                                {/* งบประมาณ */}
                                <div className="col-span-5 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3.5 py-2.5">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Wallet size={9} className="text-violet-400" />
                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">งบประมาณ</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {budgets.map(b => (
                                            <Pill key={b.id} id={b.id} label={b.label} active={budgetType === b.id}
                                                color="bg-violet-600" onClick={() => setBudgetType(b.id as any)} />
                                        ))}
                                    </div>
                                    {budgetType === 'other' && (
                                        <input value={budgetOther} onChange={e => setBudgetOther(e.target.value)}
                                            className={`${fi} mt-2`} placeholder="ระบุ..." />
                                    )}
                                    {budgetType === 'specific' && (
                                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                            <span className="text-[9px] text-gray-400 block mb-1.5">เบิกค่าใช้จ่าย</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {[{ k: 'vehicle', l: 'ค่าพาหนะ' }, { k: 'fuel', l: 'ค่าน้ำมัน' }, { k: 'allowance', l: 'ค่าเบี้ยเลี้ยง' }, { k: 'accommodation', l: 'ค่าที่พัก' }].map(e => (
                                                    <label key={e.k} className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all ${specificExpenses[e.k as keyof typeof specificExpenses] ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-violet-300'}`}>
                                                        <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${specificExpenses[e.k as keyof typeof specificExpenses] ? 'bg-white border-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                                            {specificExpenses[e.k as keyof typeof specificExpenses] && <Check size={7} className="text-violet-600" strokeWidth={3} />}
                                                        </div>
                                                        <input type="checkbox" checked={specificExpenses[e.k as keyof typeof specificExpenses]}
                                                            onChange={() => setSpecificExpenses(p => ({ ...p, [e.k]: !p[e.k as keyof typeof specificExpenses] }))} className="hidden" />
                                                        {e.l}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* การเดินทาง */}
                                <div className="col-span-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3.5 py-2.5">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Car size={9} className="text-rose-400" />
                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">การเดินทาง</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {transports.map(t => (
                                            <Pill key={t.id} id={t.id} label={t.label} active={transportType === t.id}
                                                color="bg-rose-500" onClick={() => setTransportType(t.id as any)} />
                                        ))}
                                    </div>
                                    {(transportType === 'private_vehicle' || transportType === 'other') && (
                                        <input value={transportDetail} onChange={e => setTransportDetail(e.target.value)}
                                            className={`${fi} mt-2`}
                                            placeholder={transportType === 'private_vehicle' ? 'ทะเบียนรถ / ยี่ห้อ...' : 'ระบุวิธีการเดินทาง...'} />
                                    )}
                                </div>

                                {/* สอนแทน */}
                                <div className="col-span-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3.5 py-2.5 flex flex-col items-center justify-center gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <UserCheck size={9} className="text-teal-500" />
                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">สอนแทน</span>
                                    </div>
                                    <div className="flex items-center bg-white dark:bg-gray-800 rounded-full p-0.5 border border-gray-200 dark:border-gray-700 w-fit">
                                        <button type="button" onClick={() => setRequiresSubstitute(true)}
                                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap ${requiresSubstitute ? 'bg-teal-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                                            ต้องการ
                                        </button>
                                        <button type="button" onClick={() => setRequiresSubstitute(false)}
                                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap ${!requiresSubstitute ? 'bg-gray-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                                            ไม่ต้องการ
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {isSaved && savedData && (
                            <>
                                <div className={div} />
                                <div className="shrink-0 px-5 py-2 flex items-center gap-2">
                                    <CheckCircle2 size={13} className="text-emerald-500" />
                                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">บันทึกสำเร็จ · เลขที่ {savedData.docNo}</span>
                                    <OfficialTravelPdfButton data={savedData} schoolName={schoolInfo.schoolName}
                                        schoolAffiliation={schoolInfo.affiliation} directorName={schoolInfo.directorName}
                                        deputyName={schoolInfo.deputyName} personnelHeadName={schoolInfo.personnelHeadName} />
                                </div>
                            </>
                        )}

                        {/* ── Submit ── */}
                        <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 px-5 py-3 flex items-center gap-4 bg-gray-50/60 dark:bg-gray-800/20 rounded-b-xl">
                            {isSaved ? (
                                <>
                                    <button type="button" onClick={() => navigate(-1)}
                                        className="px-5 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 transition-all">
                                        กลับ
                                    </button>
                                    <p className="text-xs text-gray-500">
                                        เลขที่เอกสาร: <span className="font-bold text-gray-900 dark:text-white">{savedData?.docNo}</span>
                                    </p>
                                </>
                            ) : (
                                <button type="button" onClick={handleSubmit} disabled={isLoading}
                                    className="flex items-center gap-2 px-7 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-50">
                                    {isLoading ? <><Loader2 size={14} className="animate-spin" /> กำลังบันทึก...</> : <><Send size={14} /> บันทึกและส่งคำขอ</>}
                                </button>
                            )}
                        </div>
                    </div>
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
        </MainLayout>
    );
};

export default OfficialTravelRequestPage;
