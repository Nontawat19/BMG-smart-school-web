import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { RootState } from "../../store";
import { firestore } from "@/firebase";
import {
    collection,
    doc,
    getDoc,
    setDoc,
    getDocs,
    query,
    where,
    increment,
    Timestamp,
    serverTimestamp,
    onSnapshot,
    collectionGroup,
    orderBy,
    limit,
    runTransaction
} from "firebase/firestore";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import Swal from "sweetalert2";
import { useTheme } from "../../ThemeContext";
import MainLayout from "@/layouts/MainLayout";
import { useNavigate, useSearchParams } from "react-router-dom";
import ThaiDatePicker from "../../components/Common/ThaiDatePicker";
import { isNonOfficialHoliday } from "../../utils/calendarUtils";
import { getThaiYear, getCurrentThaiYear } from "@/utils/dateUtils";
import { FaPaperPlane, FaArrowLeft, FaHistory, FaUsers, FaHashtag, FaMapMarkerAlt, FaFileAlt, FaCalendarAlt, FaSpinner, FaLayerGroup, FaTimes } from "react-icons/fa";
import Select from "react-select";
import OfficialTravelPdfButton from "@/components/Pdf/OfficialTravel/OfficialTravelPdfButton";
import BackButton from "@/components/Shared/BackButton";

interface TravelRequest {
    id?: string;
    subject: string;
    to: string;
    requesterName: string;
    position: string;
    department: string;
    reason: string;
    location: string;
    refDocument: string;
    refDate?: string;
    startDate: Timestamp;
    endDate: Timestamp;
    budgetType: 'none' | 'school' | 'specific' | 'other';
    budgetDetail?: string; // สำหรับ 'other' หรือข้อมูลเพิ่มเติม
    specificExpenses?: {
        vehicle: boolean;
        fuel: boolean;
        allowance: boolean;
        accommodation: boolean;
    } | null;
    transportType: 'public' | 'school_vehicle' | 'private_vehicle' | 'other';
    transportDetail?: string;
    requiresSubstitute?: boolean;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: Timestamp;
    requesterId: string;
    requesterType: 'teacher' | 'student';
    coAdventurers?: { name: string; position: string; id: string; type?: 'student' | 'teacher' }[]; // List of people going with
    uid?: string;
    docNo?: string;
    academicYear?: string;
    schoolId?: string;
    schoolAffiliation?: string;
    teacherDocId?: string | null;
}

interface UserOption {
    value: string; // Doc ID usually
    label: string; // Display Name
    type: 'teacher' | 'student';
    data: any; // Full user doc data
}

interface StudentSelectorModalProps {
    schoolId: string | undefined;
    onClose: () => void;
    onSelect: (students: any[]) => void;
}

const StudentSelectorModal: React.FC<StudentSelectorModalProps> = ({ schoolId, onClose, onSelect }) => {
    const [classLevel, setClassLevel] = useState("");
    const [room, setRoom] = useState("");
    const [students, setStudents] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);

    // Fetch students when Class/Room changes
    useEffect(() => {
        if (!schoolId || !classLevel) {
            setStudents([]);
            return;
        }

        const fetchStudents = async () => {
            setLoading(true);
            try {
                let q = query(
                    collection(firestore, 'school-settings', schoolId, 'students'),
                    where('classLevel', '==', classLevel),
                    where('status', '==', 'studying') // Active students only
                );

                if (room) {
                    q = query(q, where('room', '==', room));
                }

                // Limit just in case, but usually a class is < 50
                q = query(q, limit(100));

                const snap = await getDocs(q);
                const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Sort by Number or Name
                list.sort((a: any, b: any) => {
                    const numA = parseInt(a.number || a.studentNumber || '0');
                    const numB = parseInt(b.number || b.studentNumber || '0');
                    return numA - numB;
                });

                setStudents(list);
            } catch (err) {
                console.error("Error fetching students for selector", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStudents();
    }, [schoolId, classLevel, room]);

    const handleToggle = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleSelectAll = (select: boolean) => {
        if (select) {
            const allIds = students.map(s => s.id);
            setSelectedIds(new Set(allIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleConfirm = () => {
        const selectedStudents = students.filter(s => selectedIds.has(s.id));
        onSelect(selectedStudents);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1e1f21] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FaLayerGroup className="text-indigo-500" /> เลือกนักเรียนเข้าร่วม
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500 transition-colors">
                        <FaTimes size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Filters */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">ระดับชั้น</label>
                            <select
                                value={classLevel}
                                onChange={e => { setClassLevel(e.target.value); setRoom(""); setSelectedIds(new Set()); }}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">เลือกชั้นปี...</option>
                                {['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'].map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">ห้อง</label>
                            <select
                                value={room}
                                onChange={e => setRoom(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">ทุกห้อง</option>
                                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(r => (
                                    <option key={r} value={r}>ห้อง {r}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* List */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col h-[400px]">
                        <div className="bg-gray-50 dark:bg-[#2a2b2f] px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                            <span>รายชื่อนักเรียน ({students.length})</span>
                            {students.length > 0 && (
                                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === students.length && students.length > 0}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                        className="rounded text-indigo-500 focus:ring-indigo-500"
                                    /> เลือกทั้งหมด
                                </label>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {loading ? (
                                <div className="flex justify-center items-center h-full text-gray-400 gap-2">
                                    <FaSpinner className="animate-spin" /> กำลังโหลด...
                                </div>
                            ) : students.length === 0 ? (
                                <div className="flex justify-center items-center h-full text-gray-400">
                                    {classLevel ? 'ไม่พบนักเรียนในชั้นเรียนนี้' : 'กรุณาเลือกระดับชั้นเพื่อแสดงรายชื่อ'}
                                </div>
                            ) : (
                                students.map(s => (
                                    <label key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedIds.has(s.id) ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'border-transparent hover:bg-gray-50 dark:hover:bg-[#2a2b2f]'}`}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(s.id)}
                                            onChange={() => handleToggle(s.id)}
                                            className="rounded text-indigo-500 w-4 h-4 focus:ring-offset-0 focus:ring-0"
                                        />
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                                                {s.number || s.studentNumber || '?'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    {s.prefix}{s.firstName} {s.lastName}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    รหัส: {s.studentId} | ชั้น {s.classLevel}/{s.room}
                                                </p>
                                            </div>
                                        </div>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50/50 dark:bg-[#1e1f21]">
                    <span className="text-sm text-gray-500 flex items-center mr-auto">
                        เลือกแล้ว {selectedIds.size} คน
                    </span>
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm font-semibold">
                        ยกเลิก
                    </button>
                    <button onClick={handleConfirm} disabled={selectedIds.size === 0} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg shadow-indigo-500/30 transition-all transform active:scale-95 disabled:bg-gray-300 disabled:shadow-none font-semibold text-sm">
                        เพิ่มรายชื่อ
                    </button>
                </div>
            </div>
        </div>
    );
};

const OfficialTravelRequestPage: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requesterType = (searchParams.get("type") as 'teacher' | 'student') || 'teacher';

    const { user } = useSelector((state: RootState) => state.auth);
    const schoolId = user?.schoolId;
    const { isDarkMode } = useTheme();

    // Redux Calendar State
    const calendarState = useSelector((state: RootState) => state.calendar);
    const reduxRawData = calendarState.rawData;

    useEffect(() => {
        if (schoolId) {
            dispatch(fetchCalendar(schoolId) as any);
        }
    }, [schoolId, dispatch]);

    // Form State
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

    // Checkbox groups
    // Budget State
    const [budgetType, setBudgetType] = useState<'none' | 'school' | 'specific' | 'other'>('none');
    const [budgetOther, setBudgetOther] = useState("");
    const [specificExpenses, setSpecificExpenses] = useState({
        vehicle: false,
        fuel: false,
        allowance: false,
        accommodation: false
    });

    const [transportType, setTransportType] = useState<'public' | 'school_vehicle' | 'private_vehicle' | 'other'>('school_vehicle');
    const [transportDetail, setTransportDetail] = useState("");
    const [requiresSubstitute, setRequiresSubstitute] = useState(false); // 📌 เพิ่มสถานะการสอนแทน
    const academicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [docNo, setDocNo] = useState(""); // 📌 เพิ่มเลขที่เอกสาร
    const [schoolAffiliation, setSchoolAffiliation] = useState(""); // 📌 เพิ่มสังกัดโรงเรียน


    // Multi-Select State
    const [userOptions, setUserOptions] = useState<UserOption[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<any[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
    const [schoolInfo, setSchoolInfo] = useState<{ schoolName: string; directorName: string; deputyName: string; personnelHeadName: string; affiliation: string }>({
        schoolName: "",
        directorName: "",
        deputyName: "",
        personnelHeadName: "",
        affiliation: ""
    });
    const [isSaved, setIsSaved] = useState(false);
    const [savedData, setSavedData] = useState<any>(null);
    const [isStudentSelectorOpen, setIsStudentSelectorOpen] = useState(false);

    // Fetch User Info (Current Requester)
    useEffect(() => {
        const fetchUserInfo = async () => {
            if (!schoolId || !user) return;
            try {
                if (requesterType === 'teacher') {
                    const q = query(collection(firestore, 'school-settings', schoolId, 'teachers'), where('uid', '==', user.uid));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        const docData = snapshot.docs[0].data();
                        setRequesterName(`${docData.title || ''}${docData.firstName || ''} ${docData.lastName || ''}`);
                        setPosition(docData.position || "ครู");
                        // 📌 ไม่เอาค่าจากโปรไฟล์ แต่จะไปเติมใน useEffect ด้านล่างที่ดึงจาก SchoolInfo แทน
                    }
                } else {
                    const q = query(collection(firestore, 'school-settings', schoolId, 'students'), where('uid', '==', user.uid));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        const docData = snapshot.docs[0].data();
                        setRequesterName(`${docData.title || ''}${docData.firstName || ''} ${docData.lastName || ''}`);
                        setPosition(`นักเรียนชั้น ${docData.classLevel || ''}/${docData.room || ''}`);
                    }
                }
            } catch (error) {
                console.error("Error fetching user info:", error);
            }
        };
        fetchUserInfo();
    }, [schoolId, user, requesterType]);

    // 📌 อัปเดตสังกัดในฟอร์มอัตโนมัติด้วยข้อมูล "สังกัด" ของโรงเรียน (จาก SchoolInfo)
    useEffect(() => {
        if (schoolAffiliation) {
            setDepartment(schoolAffiliation);
        }
    }, [schoolAffiliation]);

    // Fetch All Users for Multi-Select
    useEffect(() => {
        const fetchAllUsers = async () => {
            if (!schoolId) return;
            try {
                const options: UserOption[] = [];

                // Fetch Teachers with Limit for Speed
                const teachersSnap = await getDocs(query(
                    collection(firestore, 'school-settings', schoolId, 'teachers'),
                    limit(100)
                ));
                teachersSnap.forEach(doc => {
                    const d = doc.data();
                    const name = `${d.title || ''}${d.firstName || ''} ${d.lastName || ''}`;
                    options.push({
                        value: doc.id,
                        label: `[ครู] ${name}`,
                        type: 'teacher',
                        data: d
                    });
                });

                // Fetch Students with Limit for Speed
                const studentsSnap = await getDocs(query(
                    collection(firestore, 'school-settings', schoolId, 'students'),
                    limit(100)
                ));
                studentsSnap.forEach(doc => {
                    const d = doc.data();
                    const name = `${d.title || ''}${d.firstName || ''} ${d.lastName || ''}`;
                    options.push({
                        value: doc.id,
                        label: `[นักเรียน] ${name}`,
                        type: 'student',
                        data: d
                    });
                });

                setUserOptions(options);

            } catch (error) {
                console.error("Error fetching users list:", error);
            }
        };
        fetchAllUsers();
    }, [schoolId]);


    // Styles for React Select (Dark Mode support)
    const customSelectStyles = {
        control: (provided: any) => ({
            ...provided,
            backgroundColor: isDarkMode ? '#1e1f21' : '#f9fafb',
            borderColor: isDarkMode ? '#374151' : '#e5e7eb',
            color: isDarkMode ? 'white' : 'black',
        }),
        menu: (provided: any) => ({
            ...provided,
            backgroundColor: isDarkMode ? '#1e1f21' : 'white',
        }),
        option: (provided: any, state: any) => ({
            ...provided,
            backgroundColor: state.isFocused ? (isDarkMode ? '#374151' : '#e5e7eb') : 'transparent',
            color: isDarkMode ? 'white' : 'black',
        }),
        singleValue: (provided: any) => ({
            ...provided,
            color: isDarkMode ? 'white' : 'black',
        }),
        multiValue: (provided: any) => ({
            ...provided,
            backgroundColor: isDarkMode ? '#374151' : '#e5e7eb',
        }),
        multiValueLabel: (provided: any) => ({
            ...provided,
            color: isDarkMode ? 'white' : 'black',
        }),
    };

    // Fetch School Info for "To" field and PDF
    useEffect(() => {
        const fetchSchoolInfo = async () => {
            if (!schoolId) return;
            try {
                const schoolRef = doc(firestore, 'school-settings', schoolId);
                const schoolSnap = await getDoc(schoolRef);
                if (schoolSnap.exists()) {
                    const schoolData = schoolSnap.data();
                    const name = schoolData.schoolName || "";
                    // Auto-set the "To" field with dynamic school name
                    setTo(`ผู้อำนวยการโรงเรียน${name}`);
                    setSchoolInfo({
                        schoolName: name,
                        directorName: schoolData.directorName || "",
                        deputyName: (schoolData.deputyPrefix || "") + (schoolData.deputyName || ""),
                        personnelHeadName: (schoolData.personnelHeadPrefix || "") + (schoolData.personnelHeadName || ""),
                        affiliation: schoolData.affiliation || ""
                    });
                }
            } catch (error) {
                console.error("Error fetching school info:", error);
            }
        };
        fetchSchoolInfo();
    }, [schoolId]);

    // Fetch calendar data
    useEffect(() => {
        if (!schoolId) return;

        if (calendarState.status === 'succeeded' && reduxRawData.events) {
            setCalendarEvents(reduxRawData.events);
        } else {
            const docRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');
            const unsubscribe = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().events) {
                    setCalendarEvents(docSnap.data().events);
                }
            });
            return () => unsubscribe();
        }
    }, [schoolId, calendarState.status, reduxRawData.events]);

    // Fetch Running Number and School Info
    useEffect(() => {
        const fetchDocNoAndAffiliation = async () => {
            if (!schoolId || !academicYear) return;
            try {
                // 1. Fetch Affiliation
                const calendarRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');
                const calendarSnap = await getDoc(calendarRef);
                if (calendarSnap.exists()) {
                    const calendarData = calendarSnap.data();
                    if (calendarData.affiliation) {
                        setSchoolAffiliation(calendarData.affiliation);
                    } else {
                        const schoolRef = doc(firestore, 'school-settings', schoolId);
                        const schoolSnap = await getDoc(schoolRef);
                        if (schoolSnap.exists()) {
                            setSchoolAffiliation(schoolSnap.data().affiliation || "");
                        }
                    }
                }

                // 2. Fetch Running Number (From Counters)
                try {
                    const counterRef = doc(firestore, 'school-settings', schoolId, 'counters', `official_travel_${academicYear}`);
                    const counterSnap = await getDoc(counterRef);

                    if (counterSnap.exists()) {
                        const nextNumber = (counterSnap.data().lastNumber || 0) + 1;
                        setDocNo(`${nextNumber}/${academicYear}`);
                    } else {
                        setDocNo(`1/${academicYear}`);
                    }
                } catch (err) {
                    console.error("Error fetching doc number:", err);
                    setDocNo(`1/${academicYear}`);
                }
            } catch (error) {
                console.error("Error fetching academic info:", error);
            }
        };

        fetchDocNoAndAffiliation();
    }, [schoolId, academicYear]);





    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason || !location || !startDate || !endDate) {
            Swal.fire({
                icon: "warning",
                title: "ข้อมูลไม่ครบถ้วน",
                text: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน",
                background: isDarkMode ? "#2a2b2f" : "#fff",
                color: isDarkMode ? "#ffffff" : "#111827",
            });
            return;
        }

        if (!schoolId || !user) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'User validation failed' });
            return;
        }

        setIsLoading(true);

        try {
            // 1. Resolve Requester Doc ID
            let requesterRef = null;
            let finalRequesterId = "";

            if (requesterType === 'teacher') {
                const q = query(collection(firestore, 'school-settings', schoolId, 'teachers'), where('uid', '==', user.uid));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    requesterRef = snapshot.docs[0].ref;
                    finalRequesterId = snapshot.docs[0].id;
                }
            } else {
                const q = query(collection(firestore, 'school-settings', schoolId, 'students'), where('uid', '==', user.uid));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    requesterRef = snapshot.docs[0].ref;
                    finalRequesterId = snapshot.docs[0].id;
                }
            }

            if (!requesterRef || !finalRequesterId) {
                throw new Error("Could not find user profile document.");
            }

            // Map selected users to store basic info
            const coAdventurersList = selectedUsers.map((opt: UserOption) => ({
                id: opt.value,
                name: opt.label.replace(/\[.*\]\s/, ''), // Remove [Type] prefix
                position: opt.data.position || (opt.type === 'student' ? 'นักเรียน' : 'ครู'),
                type: opt.type
            }));

            // 1.5 Handle Document Number with Atomic Increment (Transaction)
            let finalDocNo = docNo;
            const counterRef = doc(firestore, 'school-settings', schoolId, 'counters', `official_travel_${academicYear}`);

            const counterSnapCheck = await getDoc(counterRef);

            await runTransaction(firestore, async (transaction: any) => {
                const counterSnap = await transaction.get(counterRef);
                let nextNum = 1;

                if (counterSnap.exists()) {
                    nextNum = (counterSnap.data().lastNumber || 0) + 1;
                } else {
                    nextNum = 1; // Default to 1 if first time
                }

                finalDocNo = `${nextNum}/${academicYear}`;
                transaction.set(counterRef, { lastNumber: nextNum }, { merge: true });

                // 2. Prepare Data (Inside transaction or with the result)
                const travelDataToSave: TravelRequest = {
                    subject,
                    to,
                    requesterName,
                    position,
                    department,
                    reason,
                    location,
                    refDocument,
                    refDate,
                    startDate: Timestamp.fromDate(new Date(startDate)),
                    endDate: Timestamp.fromDate(new Date(endDate)),
                    budgetType,
                    budgetDetail: budgetType === 'other' ? budgetOther : "",
                    specificExpenses: budgetType === 'specific' ? specificExpenses : null,
                    transportType,
                    transportDetail,
                    requiresSubstitute,
                    status: 'pending',
                    createdAt: Timestamp.now(),
                    requesterId: finalRequesterId,
                    requesterType,
                    uid: user.uid,
                    coAdventurers: coAdventurersList,
                    docNo: finalDocNo,
                    academicYear: academicYear,
                    schoolId: schoolId,
                    schoolAffiliation: schoolAffiliation, // 📌 เพิ่มสังกัด (อ้างอิงจากหน้าข้อมูลโรงเรียน)
                    teacherDocId: requesterType === 'teacher' ? finalRequesterId : null, // 📌 เพิ่มเพื่อให้ SubstituteManagementPage ใช้งานได้
                };

                // 3. Save to Sub-collection: {userType}/{id}/travel_summary (same level as Weeksummary, Monthsummary, etc.)
                const requestRef = doc(collection(requesterRef, "travel_summary"));
                transaction.set(requestRef, travelDataToSave);
                setSavedData(travelDataToSave); // Store for PDF
            });

            setIsSaved(true);

            Swal.fire({
                icon: "success",
                title: "บันทึกสำเร็จ",
                text: "ยื่นคำขอไปราชการสำเร็จ (รอฝ่ายบุคคลอนุมัติ)",
                background: isDarkMode ? "#2a2b2f" : "#fff",
                color: isDarkMode ? "#ffffff" : "#111827",
                confirmButtonText: "ตกลง",
                confirmButtonColor: "#4f46e5",
            });

            // navigate(-1); // Don't navigate away yet

        } catch (error) {
            console.error("Error submitting:", error);
            Swal.fire({
                icon: "error",
                title: "เกิดข้อผิดพลาด",
                text: "ไม่สามารถบันทึกข้อมูลได้: " + (error as Error).message,
                background: isDarkMode ? "#2a2b2f" : "#fff",
                color: isDarkMode ? "#ffffff" : "#111827",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <MainLayout>
            <div className="p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300 min-h-screen">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <BackButton />
                        <div className="flex gap-2">
                            <button
                                onClick={() => navigate(`/school/${schoolId}/official-travel-history`)}
                                className="group flex items-center gap-2 px-5 py-2.5 bg-white/80 dark:bg-[#1e1f21]/80 backdrop-blur-md text-gray-600 dark:text-gray-300 rounded-xl hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all active:scale-95"
                            >
                                <FaHistory className="text-sm transition-transform group-hover:rotate-[-20deg]" />
                                <span className="font-bold text-sm">ประวัติการขอ</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-8 shadow-sm dark:shadow-none border border-gray-100 dark:border-gray-800">


                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:shadow-md">
                                <div className="md:col-span-3">
                                    <label className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                        <FaHashtag className="text-indigo-500" /> ที่ (No.)
                                    </label>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={docNo}
                                            onChange={e => setDocNo(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-indigo-600 dark:text-indigo-400"
                                            placeholder="เลขที่เอกสาร..."
                                        />
                                        <p className="text-[10px] font-medium text-gray-400 mt-1.5 flex flex-wrap items-center gap-2">
                                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> ปีการศึกษา {academicYear}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="md:col-span-5">
                                    <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">เรื่อง (Subject)</label>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={subject}
                                            onChange={e => setSubject(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                            placeholder="เช่น ขออนุญาตไปราชการ"
                                        />
                                    </div>
                                </div>
                                <div className="md:col-span-4">
                                    <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">เรียน (To)</label>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={to}
                                            onChange={e => setTo(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Requester Info */}
                            <div className="p-6 bg-gray-50/50 dark:bg-[#1e1f21]/30 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-5 flex items-center gap-2 uppercase tracking-wide">
                                    <FaUsers className="text-indigo-500" /> ข้อมูลผู้ขอ (Requester Information)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400 uppercase">ชื่อ-สกุล</label>
                                        <input type="text" value={requesterName} onChange={e => setRequesterName(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="นาย/นาง/นางสาว..." />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400 uppercase">ตำแหน่ง</label>
                                        <input type="text" value={position} onChange={e => setPosition(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="เช่น ครู คศ.1" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold mb-1.5 text-gray-500 dark:text-gray-400 uppercase">สังกัด</label>
                                        <input type="text" value={department} onChange={e => setDepartment(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="ต้นสังกัดจากโรงเรียน..." />
                                    </div>
                                </div>
                            </div>

                            {/* Multi-Select: Accompanied By */}
                            <div>
                                <label className="text-sm font-medium mb-1 text-gray-700 dark:text-gray-300 flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2"><FaUsers className="text-indigo-500" /> พร้อมด้วย (Accompanied by)</span>
                                    <button
                                        type="button"
                                        onClick={() => setIsStudentSelectorOpen(true)}
                                        className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 font-semibold"
                                    >
                                        <FaLayerGroup /> เลือกนักเรียนยกห้อง
                                    </button>
                                </label>
                                <Select
                                    isMulti
                                    options={userOptions}
                                    value={selectedUsers}
                                    onChange={(val) => setSelectedUsers(val as any[])}
                                    styles={customSelectStyles}
                                    placeholder="ค้นหาชื่อ ครู หรือ นักเรียน..."
                                    noOptionsMessage={() => "ไม่พบข้อมูล"}
                                />
                                <p className="text-xs text-gray-400 mt-1">สามารถเลือกได้หลายคน หรือกดปุ่ม "เลือกนักเรียนยกห้อง" เพื่อเลือกเป็นกลุ่ม</p>
                            </div>

                            {/* Student Iterator Modal */}
                            {isStudentSelectorOpen && (
                                <StudentSelectorModal
                                    schoolId={schoolId || undefined}
                                    onClose={() => setIsStudentSelectorOpen(false)}
                                    onSelect={(students) => {
                                        // Merge unique students
                                        const newOptions = students.map(s => ({
                                            value: s.id,
                                            label: `[นักเรียน] ${s.title || ''}${s.firstName} ${s.lastName}`,
                                            type: 'student',
                                            data: s
                                        }));

                                        setSelectedUsers(prev => {
                                            const existingIds = new Set(prev.map(p => p.value));
                                            const filteredNew = newOptions.filter(n => !existingIds.has(n.value));
                                            return [...prev, ...filteredNew];
                                        });
                                        setIsStudentSelectorOpen(false);
                                    }}
                                />
                            )}

                            {/* Travel Details */}
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">มีความประสงค์จะขออนุญาตไปราชการ เรื่อง (Request Detail)</label>
                                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ระบุรายละเอียดการไปราชการ..." required />
                            </div>

                            {/* Location & Reference Section */}
                            <div className="p-6 bg-indigo-50/20 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 space-y-6">
                                <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 uppercase tracking-wider">
                                    <FaMapMarkerAlt className="text-xs" /> สถานที่และเอกสารอ้างอิง (Location & Reference)
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                    {/* Location - Full width on this row */}
                                    <div className="md:col-span-12">
                                        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">สถานที่ ณ (Location)</label>
                                        <div className="relative group">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 transition-colors group-focus-within:bg-indigo-500 group-focus-within:text-white">
                                                <FaMapMarkerAlt size={14} />
                                            </div>
                                            <input
                                                type="text"
                                                value={location}
                                                onChange={e => setLocation(e.target.value)}
                                                className="w-full pl-14 pr-4 py-3 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                                placeholder="ระบุสถานที่..."
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Ref No - 8 cols */}
                                    <div className="md:col-span-8">
                                        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">ตามหนังสือ/คำสั่งที่ (Ref No.)</label>
                                        <div className="relative group flex-1">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-400 group-focus-within:bg-indigo-500 group-focus-within:text-white transition-colors">
                                                <FaFileAlt size={14} />
                                            </div>
                                            <input
                                                type="text"
                                                value={refDocument}
                                                onChange={e => setRefDocument(e.target.value)}
                                                className="w-full pl-14 pr-4 py-3 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                                placeholder="ระบุเลขที่หนังสืออ้างอิง..."
                                            />
                                        </div>
                                    </div>

                                    {/* Ref Date - 4 cols */}
                                    <div className="md:col-span-4">
                                        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">ลงวันที่ (Date)</label>
                                        <div className="relative group">
                                            <ThaiDatePicker value={refDate} onChange={setRefDate} placeholder="เลือกวันที่..." />
                                        </div>
                                    </div>
                                </div>
                            </div>



                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                        <FaCalendarAlt className="text-indigo-500 text-xs" /> ตั้งแต่วันที่ (Start Date)
                                    </label>
                                    <ThaiDatePicker value={startDate} onChange={setStartDate} events={calendarEvents} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                        <FaCalendarAlt className="text-indigo-500 text-xs" /> ถึงวันที่ (End Date)
                                    </label>
                                    <ThaiDatePicker value={endDate} onChange={setEndDate} events={calendarEvents} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 bg-gray-50 dark:bg-indigo-900/5 rounded-2xl border border-gray-200/50 dark:border-indigo-900/20 shadow-inner">
                                {/* Budget */}
                                <div className="space-y-4">
                                    <label className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span> การเบิกค่าใช้จ่าย (Budget)
                                    </label>
                                    <div className="space-y-4">
                                        {[
                                            { id: 'none', label: 'ไม่ขอเบิกค่าใช้จ่าย' },
                                            { id: 'school', label: 'ขอเบิกค่าใช้จ่ายตามสิทธิ์ (งบโรงเรียน)' },
                                            { id: 'specific', label: 'ขอเบิกเฉพาะค่าใช้จ่าย (ระบุ)' },
                                            { id: 'other', label: 'อื่นๆ (ระบุข้อมูล)' }
                                        ].map(item => (
                                            <div key={item.id} className="space-y-4">
                                                <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${budgetType === item.id ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'bg-white dark:bg-[#1e1f21] border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-indigo-200 dark:hover:border-indigo-500/30'}`}>
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${budgetType === item.id ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                                        {budgetType === item.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                                    </div>
                                                    <input type="radio" name="budget" checked={budgetType === item.id} onChange={() => setBudgetType(item.id as any)} className="hidden" />
                                                    <span className="text-sm font-bold">{item.label}</span>
                                                </label>

                                                {/* Specific Expenses Options */}
                                                {item.id === 'specific' && budgetType === 'specific' && (
                                                    <div className="grid grid-cols-2 gap-3 pl-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                                        {[
                                                            { key: 'vehicle', label: 'ค่าพาหนะเดินทาง' },
                                                            { key: 'fuel', label: 'ค่าน้ำมัน' },
                                                            { key: 'allowance', label: 'ค่าเบี้ยเลี้ยง' },
                                                            { key: 'accommodation', label: 'ค่าที่พัก' }
                                                        ].map(exp => (
                                                            <label key={exp.key} className="flex items-center gap-2 cursor-pointer group">
                                                                <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${specificExpenses[exp.key as keyof typeof specificExpenses] ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 dark:border-gray-600 group-hover:border-indigo-400'}`}>
                                                                    {specificExpenses[exp.key as keyof typeof specificExpenses] && (
                                                                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </div>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={specificExpenses[exp.key as keyof typeof specificExpenses]}
                                                                    onChange={() => setSpecificExpenses(prev => ({ ...prev, [exp.key]: !prev[exp.key as keyof typeof specificExpenses] }))}
                                                                    className="hidden"
                                                                />
                                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 group-hover:text-indigo-500 transition-colors uppercase">{exp.label}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Other Input */}
                                                {item.id === 'other' && budgetType === 'other' && (
                                                    <div className="pl-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <textarea
                                                            value={budgetOther}
                                                            onChange={e => setBudgetOther(e.target.value)}
                                                            className="w-full px-4 py-3 text-sm bg-white dark:bg-[#1e1f21] border border-indigo-200 dark:border-indigo-500/30 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm min-h-[80px]"
                                                            placeholder="กรุณาระบุรายละเอียดเพิ่มเติมสำหรับงบประมาณ..."
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Transport */}
                                <div className="space-y-4">
                                    <label className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span> การเดินทาง (Transportation)
                                    </label>
                                    <div className="space-y-3">
                                        {[
                                            { id: 'school_vehicle', label: 'รถยนต์ราชการ' },
                                            { id: 'private_vehicle', label: 'รถยนต์ส่วนตัว' },
                                            { id: 'public', label: 'รถโดยสารประจำทาง' },
                                            { id: 'other', label: 'อื่นๆ (ระบุ)' }
                                        ].map(item => (
                                            <div key={item.id} className="space-y-3">
                                                <label className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${transportType === item.id ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'bg-white dark:bg-[#1e1f21] border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-indigo-200 dark:hover:border-indigo-500/30'}`}>
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${transportType === item.id ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                                        {transportType === item.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                                    </div>
                                                    <input type="radio" name="transport" checked={transportType === item.id} onChange={() => setTransportType(item.id as any)} className="hidden" />
                                                    <span className="text-sm font-bold">{item.label}</span>
                                                </label>
                                                {(item.id === 'private_vehicle' && transportType === 'private_vehicle') && (
                                                    <div className="pl-4">
                                                        <input type="text" value={transportDetail} onChange={e => setTransportDetail(e.target.value)} className="w-full px-4 py-3 text-sm bg-white dark:bg-[#1e1f21] border border-indigo-200 dark:border-indigo-500/30 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm" placeholder="ระบุหมายเลขทะเบียนรถ..." />
                                                    </div>
                                                )}
                                                {(item.id === 'other' && transportType === 'other') && (
                                                    <div className="pl-4">
                                                        <input type="text" value={transportDetail} onChange={e => setTransportDetail(e.target.value)} className="w-full px-4 py-3 text-sm bg-white dark:bg-[#1e1f21] border border-indigo-200 dark:border-indigo-500/30 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm" placeholder="ระบุวิธีเดินทาง..." />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Substitute Teaching Toggle */}
                            <div className="mt-8 p-6 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm mb-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${requiresSubstitute ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-200 dark:bg-gray-800 text-gray-400'}`}>
                                            <FaUsers size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">ต้องการการสอนแทน (Substitute Teaching)</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">ระบบจะส่งข้อมูลไปยังฝ่ายวิชาการเพื่อจัดหาครูสอนแทน</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white dark:bg-[#1e1f21] p-1.5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm self-start md:self-center">
                                        <button
                                            type="button"
                                            onClick={() => setRequiresSubstitute(true)}
                                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${requiresSubstitute ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                        >
                                            ต้องการ
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRequiresSubstitute(false)}
                                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${!requiresSubstitute ? 'bg-red-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                        >
                                            ไม่ต้องการ
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-3">
                                    {isSaved && savedData && (
                                        <div className="flex flex-col sm:flex-row items-center gap-4 animate-in fade-in zoom-in-95 duration-700">
                                            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-full border border-emerald-500/20 uppercase tracking-[0.1em] shadow-sm">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                บันทึกสำเร็จ
                                            </div>
                                            <OfficialTravelPdfButton
                                                data={savedData}
                                                schoolName={schoolInfo.schoolName}
                                                schoolAffiliation={schoolInfo.affiliation}
                                                directorName={schoolInfo.directorName}
                                                deputyName={schoolInfo.deputyName}
                                                personnelHeadName={schoolInfo.personnelHeadName}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                    {isSaved ? (
                                        <button
                                            type="button"
                                            onClick={() => navigate(-1)}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white dark:bg-[#1e1f21] hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold py-3.5 px-8 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm transition-all active:scale-95"
                                        >
                                            <FaArrowLeft className="text-sm" />
                                            <span>กลับหน้าประวัติ</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="group relative w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white font-bold py-3.5 px-10 rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all active:scale-95 disabled:grayscale disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
                                            {isLoading ? (
                                                <>
                                                    <FaSpinner className="animate-spin text-sm" />
                                                    <span>กำลังบันทึก...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <FaPaperPlane className="text-sm transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                                                    <span>บันทึกและสร้างคำขอ</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default OfficialTravelRequestPage;
