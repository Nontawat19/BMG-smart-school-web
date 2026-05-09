import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import { firestore, auth, storage } from "@/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp, GeoPoint } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
    ArrowLeft,
    Save,
    MapPin,
    Camera,
    User,
    Home,
    FileText,
    Users,
    Activity,
    ShieldAlert,
    X,
    Loader2,
    ChevronRight,
    ChevronLeft,
    Plus,
    Trash2,
    Clock,
    DollarSign,
    Heart,
    Info,
    CheckCircle2,
    ExternalLink,
    Eye,
    Navigation,
    RefreshCw,
    CheckCircle,
    Map,
    Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Swal from "sweetalert2";

interface Student {
    id: string;
    studentId: string;
    title: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    room: string;
    schoolId: string;
    profileImageUrl?: string;
    nickname?: string;
}

interface FamilyMember {
    id: string;
    name: string;
    age: string;
    education: string;
    occupation: string;
    income: string;
}

const NewHomeVisit: React.FC = () => {
    const { studentId } = useParams<{ studentId: string }>();
    const navigate = useNavigate();
    const [student, setStudent] = useState<Student | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
    const [gettingGps, setGettingGps] = useState(false);

    // Photos state
    const [photosInternal, setPhotosInternal] = useState<File[]>([]);
    const [photosExternal, setPhotosExternal] = useState<File[]>([]);
    const [previewsInternal, setPreviewsInternal] = useState<string[]>([]);
    const [previewsExternal, setPreviewsExternal] = useState<string[]>([]);

    // Specific Photos state
    const [exteriorPhoto, setExteriorPhoto] = useState<File | null>(null);
    const [interiorPhoto, setInteriorPhoto] = useState<File | null>(null);
    const [schoolSignPhoto, setSchoolSignPhoto] = useState<File | null>(null);
    const [sketchMapPhoto, setSketchMapPhoto] = useState<File | null>(null);
    const [exteriorPreview, setExteriorPreview] = useState<string | null>(null);
    const [interiorPreview, setInteriorPreview] = useState<string | null>(null);
    const [schoolSignPreview, setSchoolSignPreview] = useState<string | null>(null);
    const [sketchMapPreview, setSketchMapPreview] = useState<string | null>(null);

    // Family Members list
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([
        { id: '1', name: '', age: '', education: '', occupation: '', income: '' }
    ]);

    const [formData, setFormData] = useState({
        // Page 1: ข้อมูลเบื้องต้น (อ้างอิงภาพที่ 1)
        visitNo: "1",
        semester: "1",
        academicYear: "2568",
        visitStatus: "เยี่ยมแล้ว", // เยี่ยมแล้ว, ยังไม่ได้เยี่ยม
        visitType: "เดินทางไปที่พักอาศัยของนักเรียน", // เดินทางไปที่พักอาศัยของนักเรียน, Online
        visitDate: new Date().toISOString().split('T')[0],
        startTime: "09:00",
        endTime: "10:00",
        visitorNameBySide: "",
        relationshipWithStudent: "บิดามารดา",
        bothParentsDeceased: false,
        oneParentDeceased: false,
        parentsSeparated: false,
        notLivingWithParents: false,


        // ข้อมูลการติดต่อนักเรียน
        studentNickname: "",
        studentPhone: "",
        studentLineId: "",
        studentFacebook: "",

        // รายละเอียดการเดินทาง (อ้างอิงภาพที่ 1)
        travelDistance: "", // กิโลเมตร
        travelTimeHours: "",
        travelTimeMinutes: "",
        travelMethod: "ผู้ปกครองมาส่ง", // ผู้ปกครองมาส่ง, เดินทางด้วยตนเอง โดย...

        // 1. สภาพที่อยู่อาศัย (อ้างอิงภาพที่ 1)
        housingType: "บ้านตนเอง", // บ้านของตนเอง, บ้านเช่า/หอพัก, อาศัยอยู่กับผู้อื่น, บ้านพักของหน่วยงาน, บ้านญาติ, อื่นๆ
        housingCondition: "ดี", // ดี, พอใช้, เก่าทรุดโทรม, พื้นที่คับแคบ, ไม่มีความเป็นสัดส่วน
        housingCleanliness: "สะอาดมีระเบียบ", // สะอาดมีระเบียบ, ไม่ค่อยสะอาด, สกปรกไม่มีระเบียบ, อื่นๆ
        utilitiesElectricity: "มี",
        utilitiesWater: "มี",
        utilitiesToilet: "มี",
        environmentNear: "", // ระบุสภาพแวดล้อมรอบที่อยู่อาศัย

        // Page 2: ข้อมูลครอบครัวเชิงสถิติ (อ้างอิงภาพที่ 1)
        familyMaleCount: "",
        familyFemaleCount: "",
        familyTotalCount: "",
        siblingSameParentsMale: "",
        siblingSameParentsFemale: "",
        siblingDifferentParentsMale: "",
        siblingDifferentParentsFemale: "",
        specialNeedHelpCount: "",

        // 4.5 ความสัมพันธ์ในครอบครัว (อ้างอิงภาพที่ 2)
        familyAtmosphere: "รักใคร่กันดี", // รักใคร่กันดี, ขัดแย้งทะเลาะกันบางครั้ง/บ่อยครั้ง, ห่างเหิน, ขัดแย้งและทำร้ายร่างกาย...
        relationships: {
            father: "สนิทสนม", // สนิทสนม, เฉยๆ, ห่างเหิน, ขัดแย้ง
            mother: "สนิทสนม",
            brother: "เฉยๆ",
            sister: "เฉยๆ",
            grandparents: "เฉยๆ",
            relatives: "เฉยๆ",
            others: "เฉยๆ"
        },
        hoursTogetherPerDay: "",
        studentResponsibility: "",
        studentHobby: "",
        caregiverWhenParentsAway: "",

        // 5. รายได้ (อ้างอิงภาพที่ 2)
        familyMonthlyIncome: "",
        expensePayer: "บิดามารดา",
        studentWorkingExtra: "ไม่ได้ทำงาน",
        extraJobDetail: "",
        extraIncome: "",
        studentAllowancePerDay: "",

        // 6. ความเสี่ยง (6 ด้าน + ด้านสังคมในภาพที่ 2)
        healthRisk: [] as string[],
        welfareRisk: [] as string[], // รวมถึงความปลอดภัยเชิงสังคม
        drugRisk: [] as string[],
        violenceRisk: [] as string[],
        sexualRisk: [] as string[],
        gameRisk: [] as string[],
        internetUsage: "ปกติ",

        // Page 5: สรุปผลและข้อเสนอแนะ (อ้างอิงภาพที่ 3-4)
        parentConcerns: "",
        schoolAssistanceNeeded: [] as string[],
        schoolAssistanceNeededDetail: "",
        assistanceHistory: "ปานกลาง",
        visitSummary: "ปกติ", // ปกติ, ควรส่งเสริมด้าน, ช่วยเหลือด่วน
        visitSummaryPromoteDetail: "",
        visitSummaryUrgentDetail: "",
        teacherComments: "",
        suggestionForUse: "",
        obstacles: "",
        overallSuggestions: "",

        // New OBEC fields (Risk & Behavior)
        studentResponsibilities: [] as string[],
        studentHobbies: [] as string[],
        computerAccess: "",
        electronicUsage: "",

        // Photo permissions
        parentHousePhotoPermission: "อนุญาต", // อนุญาต, ไม่อนุญาต

        // Specific details for "Other" options
        housingTypeOther: "",
        travelMethodDetail: "",
        housingCleanlinessOther: "",
        specialNeedDetail: "",
    });

    useEffect(() => {
        const fetchStudentData = async () => {
            if (!studentId) return;
            try {
                const user = auth.currentUser;
                if (!user) return;
                const userDoc = await getDoc(doc(firestore, "users", user.uid));
                const schoolId = userDoc.data()?.schoolId;

                if (schoolId) {
                    const studentDoc = await getDoc(doc(firestore, "school-settings", schoolId, "students", studentId));
                    if (studentDoc.exists()) {
                        const studentData = studentDoc.data() as Student;
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { id: _, ...dataWithoutId } = studentData;
                        setStudent({ id: studentDoc.id, ...dataWithoutId } as Student);

                        // Pre-fill nickname in formData if available
                        if (studentData.nickname) {
                            setFormData(prev => ({ ...prev, studentNickname: studentData.nickname || "" }));
                        }
                    }
                }
            } catch (err) {
                console.error("Error fetching student:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchStudentData();
        getCurrentLocation();
    }, [studentId]);

    const getCurrentLocation = () => {
        setGettingGps(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setGps({ lat: position.coords.latitude, lng: position.coords.longitude });
                    setGettingGps(false);
                },
                () => setGettingGps(false),
                { enableHighAccuracy: true }
            );
        } else {
            setGettingGps(false);
        }
    };

    // Auto-sum family members
    useEffect(() => {
        const male = parseInt(formData.familyMaleCount) || 0;
        const female = parseInt(formData.familyFemaleCount) || 0;
        const total = male + female;
        if (total.toString() !== formData.familyTotalCount) {
            setFormData(prev => ({ ...prev, familyTotalCount: total.toString() }));
        }
    }, [formData.familyMaleCount, formData.familyFemaleCount]);

    const handleSinglePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'exterior' | 'interior' | 'schoolSign' | 'sketchMap') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            if (type === 'exterior') {
                setExteriorPhoto(file);
                setExteriorPreview(reader.result as string);
            } else if (type === 'interior') {
                setInteriorPhoto(file);
                setInteriorPreview(reader.result as string);
            } else if (type === 'schoolSign') {
                setSchoolSignPhoto(file);
                setSchoolSignPreview(reader.result as string);
            } else if (type === 'sketchMap') {
                setSketchMapPhoto(file);
                setSketchMapPreview(reader.result as string);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const toggleCheckbox = (arrayName: keyof typeof formData, value: string) => {
        setFormData(prev => {
            const current = (prev[arrayName] as string[]) || [];
            if (current.includes(value)) {
                return { ...prev, [arrayName]: current.filter(v => v !== value) };
            } else {
                return { ...prev, [arrayName]: [...current, value] };
            }
        });
    };

    const addFamilyMember = () => {
        setFamilyMembers([...familyMembers, { id: Date.now().toString(), name: '', age: '', education: '', occupation: '', income: '' }]);
    };

    const removeFamilyMember = (id: string) => {
        if (familyMembers.length > 1) {
            setFamilyMembers(familyMembers.filter(m => m.id !== id));
        }
    };

    const handleFamilyMemberChange = (id: string, field: keyof FamilyMember, value: string) => {
        setFamilyMembers(familyMembers.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'internal' | 'external') => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const urls = files.map(f => URL.createObjectURL(f));
            if (type === 'internal') {
                setPhotosInternal([...photosInternal, ...files]);
                setPreviewsInternal([...previewsInternal, ...urls]);
            } else {
                setPhotosExternal([...photosExternal, ...files]);
                setPreviewsExternal([...previewsExternal, ...urls]);
            }
        }
    };

    const handleSubmit = async () => {
        if (!student || !auth.currentUser) return;
        setSubmitting(true);
        try {
            const userDoc = await getDoc(doc(firestore, "users", auth.currentUser.uid));
            const schoolId = userDoc.data()?.schoolId;
            if (!schoolId) throw new Error("School ID not found");

            // Upload Photos
            const uploadPhotos = async (files: File[], folder: string) => {
                const urls = await Promise.all(files.map(async (file) => {
                    const storageRef = ref(storage, `home-visits/${schoolId}/${student.id}/${Date.now()}_${file.name}`);
                    const snapshot = await uploadBytes(storageRef, file);
                    return getDownloadURL(snapshot.ref);
                }));
                return urls;
            };

            const uploadSinglePhoto = async (file: File | null, fieldName: string) => {
                if (!file) return null;
                const storageRef = ref(storage, `home-visits/${schoolId}/${student.id}/${Date.now()}_${fieldName}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                return getDownloadURL(snapshot.ref);
            };

            const [internalUrls, externalUrls, exteriorUrl, interiorUrl, schoolSignUrl, sketchMapUrl] = await Promise.all([
                uploadPhotos(photosInternal, 'internal'),
                uploadPhotos(photosExternal, 'external'),
                uploadSinglePhoto(exteriorPhoto, 'exterior'),
                uploadSinglePhoto(interiorPhoto, 'interior'),
                uploadSinglePhoto(schoolSignPhoto, 'schoolSign'),
                uploadSinglePhoto(sketchMapPhoto, 'sketchMap')
            ]);

            // Combine all data for Firestore
            const finalData = {
                ...formData,
                familyMembers,
                gps: gps ? new GeoPoint(gps.lat, gps.lng) : null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                teacherId: auth.currentUser.uid,
                studentId: student.id,
                studentInfo: {
                    name: `${student.firstName} ${student.lastName}`,
                    classLevel: student.classLevel,
                    room: student.room,
                    studentId: student.studentId
                },
                photos: {
                    internal: internalUrls,
                    external: externalUrls,
                    exterior: exteriorUrl,
                    interior: interiorUrl,
                    schoolSign: schoolSignUrl,
                    sketchMap: sketchMapUrl
                }
            };

            await addDoc(collection(firestore, "school-settings", schoolId, "students", student.id, "home-visits"), finalData);

            Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ (มาตรฐาน สพฐ.)',
                text: 'ข้อมูลการเยี่ยมบ้านทั้งหมดถูกจัดเก็บลงระบบเรียบร้อยแล้ว',
                confirmButtonColor: '#4f46e5',
                customClass: {
                    popup: 'rounded-[2rem] font-bold p-10',
                }
            });
            navigate("/student-support/home-visit");
        } catch (err) {
            console.error("Submission error:", err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง' });
        } finally {
            setSubmitting(false);
        }
    };

    const steps = [
        { title: "ข้อมูลบ้าน", desc: "ที่อยู่อาศัยและทำเล", icon: Home },
        { title: "สภาพแวดล้อม", desc: "ความเป็นอยู่รอบบ้าน", icon: Eye },
        { title: "ความเสี่ยง", desc: "การประเมินรอบด้าน", icon: ShieldAlert },
        { title: "พิกัดและรูปภาพ", desc: "ตำแหน่งและหลักฐาน", icon: Camera },
        { title: "สรุปผลการเยี่ยม", desc: "บันทึกและข้อเสนอแนะ", icon: FileText }
    ];

    if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-blue-600" /></div>;

    const Label = ({ children, required }: { children: React.ReactNode, required?: boolean }) => (
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
            {children}
            {required && <span className="text-red-500 text-sm">*</span>}
        </label>
    );

    const RadioGroup = ({ name, options, value, onChange }: { name: string, options: string[], value: string, onChange: any }) => (
        <div className="flex flex-wrap gap-2">
            {options.map(opt => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => onChange({ target: { name, value: opt } })}
                    className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all
                        ${value === opt
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                    {opt}
                </button>
            ))}
        </div>
    );

    const renderStepContent = () => {
        switch (currentStep) {
            case 0: // Step 1: Basic & Location
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        {/* 1.1 สภาพที่อยู่อาศัยและการเดินทาง */}
                        <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-8">
                                    <div className="bg-blue-50/50 dark:bg-blue-900/10 p-5 rounded-2xl border border-blue-100/50 dark:border-blue-800/20 space-y-5">
                                        <h3 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                            <User size={14} className="text-blue-500" /> ข้อมูลผู้ให้ข้อมูล (Interviewee)
                                        </h3>
                                        <div className="grid grid-cols-1 gap-5">
                                            <div className="space-y-2">
                                                <Label required>การเยี่ยมบ้านครั้งนี้สนทนากับ ชื่อ-สกุล</Label>
                                                <input
                                                    type="text"
                                                    name="visitorNameBySide"
                                                    value={formData.visitorNameBySide}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold shadow-sm dark:text-white"
                                                    placeholder="กรุณากรอกชื่อผู้ให้ข้อมูล..."
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <Label required>เกี่ยวข้องกับนักเรียนเป็น</Label>
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {["บิดา", "มารดา", "ปู่/ย่า", "ตา/ยาย", "ลุง/ป้า", "น้า/อา", "ผู้ปกครอง"].map((rel) => (
                                                        <button
                                                            key={rel}
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({ ...prev, relationshipWithStudent: rel }))}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${formData.relationshipWithStudent === rel
                                                                ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-500/20"
                                                                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600"
                                                                }`}
                                                        >
                                                            {rel}
                                                        </button>
                                                    ))}
                                                </div>
                                                <input
                                                    type="text"
                                                    name="relationshipWithStudent"
                                                    value={formData.relationshipWithStudent}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold shadow-sm dark:text-white"
                                                    placeholder="อื่นๆ ระบุเอง..."
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                                            <Home size={16} /> รายละเอียดที่อยู่อาศัย
                                        </h3>
                                        <div className="space-y-3">
                                            <Label required>ลักษณะที่อยู่อาศัย</Label>
                                            <RadioGroup name="housingType" options={["บ้านของตนเอง", "บ้านเช่า/หอพัก", "อาศัยอยู่กับผู้อื่น", "บ้านพักหน่วยงาน", "บ้านญาติ", "อื่นๆ"]} value={formData.housingType} onChange={handleInputChange} />
                                            {formData.housingType === "อื่นๆ" && (
                                                <input type="text" name="housingTypeOther" value={formData.housingTypeOther} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-sm font-bold outline-none mt-2 dark:text-white" placeholder="ระบุประเภทที่อยู่อาศัย..." />
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            <Label required>สภาพที่อยู่อาศัย</Label>
                                            <RadioGroup name="housingCondition" options={["ดี มั่นคง", "พอใช้", "เก่าทรุดโทรม", "พื้นที่คับแคบ", "ไม่เป็นสัดส่วน"]} value={formData.housingCondition} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                                        <Navigation size={16} /> รายละเอียดการเดินทาง
                                    </h3>
                                    <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 space-y-5">
                                        <div className="flex flex-wrap items-center gap-4">
                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ระยะทางจากบ้าน-โรงเรียน:</span>
                                            <div className="flex items-center gap-2">
                                                <input type="number" name="travelDistance" value={formData.travelDistance} onChange={handleInputChange} className="w-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-bold px-2 py-1.5 rounded-lg outline-none dark:text-white" placeholder="0" />
                                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">กม.</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4">
                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ใช้เวลาเดินทาง:</span>
                                            <div className="flex items-center gap-2">
                                                <input type="number" name="travelTimeHours" value={formData.travelTimeHours} onChange={handleInputChange} className="w-14 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-bold px-2 py-1.5 rounded-lg outline-none dark:text-white" placeholder="0" />
                                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">ชม.</span>
                                                <input type="number" name="travelTimeMinutes" value={formData.travelTimeMinutes} onChange={handleInputChange} className="w-14 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-bold px-2 py-1.5 rounded-lg outline-none dark:text-white" placeholder="0" />
                                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">นาที</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3 pt-2">
                                            <Label required>การเดินทางมาโรงเรียน</Label>
                                            <RadioGroup name="travelMethod" options={["ผู้ปกครองมาส่ง", "รถโดยสารประจำทาง", "รถจักรยานยนต์", "รถโรงเรียน", "รถยนต์", "รถจักรยาน", "เดิน", "อื่นๆ"]} value={formData.travelMethod} onChange={handleInputChange} />
                                            {formData.travelMethod === "อื่นๆ" && (
                                                <input type="text" name="travelMethodDetail" value={formData.travelMethodDetail} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-sm font-bold outline-none mt-2 dark:text-white" placeholder="ระบุการเดินทาง..." />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <Label required>ความสะอาด/ความเป็นระเบียบ</Label>
                                        <RadioGroup name="housingCleanliness" options={["สะอาดมีระเบียบ", "ไม่ค่อยสะอาด", "สกปรกไม่มีระเบียบ", "อื่นๆ"]} value={formData.housingCleanliness} onChange={handleInputChange} />
                                        {formData.housingCleanliness === "อื่นๆ" && (
                                            <input type="text" name="housingCleanlinessOther" value={formData.housingCleanlinessOther} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-sm font-bold outline-none mt-2 dark:text-white" placeholder="ระบุความสะอาด..." />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <Label required>ไฟฟ้า</Label>
                                            <select name="utilitiesElectricity" value={formData.utilitiesElectricity} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white">
                                                <option value="มี">มี</option>
                                                <option value="ไม่มี">ไม่มี</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label required>น้ำประปา</Label>
                                            <select name="utilitiesWater" value={formData.utilitiesWater} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white">
                                                <option value="มี">มี</option>
                                                <option value="ไม่มี">ไม่มี</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label required>ส้วม</Label>
                                            <select name="utilitiesToilet" value={formData.utilitiesToilet} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white">
                                                <option value="มี">มี</option>
                                                <option value="ไม่มี">ไม่มี</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 1.2 ข้อมูลการเยี่ยมบ้านเบื้องต้น */}
                        <section className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
                            <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                <FileText size={16} /> ข้อมูลการเยี่ยมบ้านเบื้องต้น
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                <div className="space-y-1.5">
                                    <Label required>เยี่ยมครั้งที่</Label>
                                    <input type="text" name="visitNo" value={formData.visitNo} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold dark:text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label required>ภาคเรียนที่</Label>
                                    <input type="text" name="semester" value={formData.semester} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold dark:text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label required>ปีการศึกษา</Label>
                                    <input type="text" name="academicYear" value={formData.academicYear} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold dark:text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label required>สถานะการเยี่ยม</Label>
                                    <select name="visitStatus" value={formData.visitStatus} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white">
                                        <option value="เยี่ยมแล้ว">เยี่ยมแล้ว</option>
                                        <option value="ยังไม่ได้เยี่ยม">ยังไม่ได้เยี่ยม</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label required>วันที่ออกเยี่ยม</Label>
                                    <input type="date" name="visitDate" value={formData.visitDate} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label required>เวลาที่เริ่ม</Label>
                                    <input type="time" name="startTime" value={formData.startTime} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label required>เวลาที่สิ้นสุด</Label>
                                    <input type="time" name="endTime" value={formData.endTime} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" />
                                </div>
                            </div>
                            <div className="space-y-3 pt-2">
                                <Label required>รูปแบบการเยี่ยมบ้าน</Label>
                                <RadioGroup name="visitType" options={["เดินทางไปที่พักอาศัยของนักเรียน", "เยี่ยมผ่านออนไลน์/โทรศัพท์"]} value={formData.visitType} onChange={handleInputChange} />
                            </div>

                            <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">ช่องทางติดต่อเพิ่มเติม (หากไม่มีไม่ต้องกรอก)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                    <div className="space-y-1.5">
                                        <Label>ชื่อเล่น</Label>
                                        <input type="text" name="studentNickname" value={formData.studentNickname} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="..." />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>เบอร์โทรศัพท์</Label>
                                        <input type="text" name="studentPhone" value={formData.studentPhone} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="08x-xxx-xxxx" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>ID Line</Label>
                                        <input type="text" name="studentLineId" value={formData.studentLineId} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="..." />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Facebook</Label>
                                        <input type="text" name="studentFacebook" value={formData.studentFacebook} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="..." />
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 1: // Step 2: Family & Environment
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        {/* 2.1 จำนวนสมาชิก */}
                        <section className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
                            <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                <Users size={16} /> ข้อมูลจำนวนสมาชิกในครอบครัว
                            </h3>

                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-800 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-blue-500/5 group">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                                            <User size={24} />
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <p className="text-[10px] font-black text-blue-600/60 dark:text-blue-400/60 uppercase tracking-widest">สมาชิกชาย</p>
                                            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                <input type="number" name="familyMaleCount" value={formData.familyMaleCount} onChange={handleInputChange} className="w-full bg-transparent border-none p-0 text-xl font-black text-blue-700 dark:text-blue-400 outline-none placeholder:text-blue-200" placeholder="0" />
                                                <span className="text-xs font-black text-blue-400">คน</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-rose-50/50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/50 p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-rose-500/5 group">
                                        <div className="w-12 h-12 rounded-2xl bg-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/30 group-hover:scale-110 transition-transform">
                                            <User size={24} />
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <p className="text-[10px] font-black text-rose-600/60 dark:text-rose-400/60 uppercase tracking-widest">สมาชิกหญิง</p>
                                            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 px-3 py-1.5 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-rose-500/20 transition-all">
                                                <input type="number" name="familyFemaleCount" value={formData.familyFemaleCount} onChange={handleInputChange} className="w-full bg-transparent border-none p-0 text-xl font-black text-rose-700 dark:text-rose-400 outline-none placeholder:text-rose-200" placeholder="0" />
                                                <span className="text-xs font-black text-rose-400">คน</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-900 dark:bg-white border border-slate-800 dark:border-slate-200 p-4 rounded-2xl flex items-center gap-4 shadow-xl shadow-slate-900/10 dark:shadow-white/10 group overflow-hidden relative">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Users size={64} />
                                        </div>
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-lg relative z-10">
                                            <Users size={24} />
                                        </div>
                                        <div className="flex-1 space-y-1 relative z-10">
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">รวมสมาชิกทั้งหมด</p>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-2xl font-black text-white dark:text-slate-900">{formData.familyTotalCount || "0"}</span>
                                                <span className="text-xs font-bold text-slate-500">คน</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <Label>ข้อมูลพี่น้อง (หากไม่มีไม่ต้องกรอก)</Label>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                                        <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-3">บิดามารดาเดียวกัน</p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">ชาย:</span>
                                                <div className="flex items-center gap-2">
                                                    <input type="number" name="siblingSameParentsMale" value={formData.siblingSameParentsMale} onChange={handleInputChange} className="w-14 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-bold px-2 py-1 rounded-md outline-none dark:text-white" />
                                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">คน</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">หญิง:</span>
                                                <div className="flex items-center gap-2">
                                                    <input type="number" name="siblingSameParentsFemale" value={formData.siblingSameParentsFemale} onChange={handleInputChange} className="w-14 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-bold px-2 py-1 rounded-md outline-none dark:text-white" />
                                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">คน</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-2 mb-3">ต่างบิดา หรือ ต่างมารดา</p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">ชาย:</span>
                                                <div className="flex items-center gap-2">
                                                    <input type="number" name="siblingDifferentParentsMale" value={formData.siblingDifferentParentsMale} onChange={handleInputChange} className="w-14 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-bold px-2 py-1 rounded-md outline-none dark:text-white" />
                                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">คน</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">หญิง:</span>
                                                <div className="flex items-center gap-2">
                                                    <input type="number" name="siblingDifferentParentsFemale" value={formData.siblingDifferentParentsFemale} onChange={handleInputChange} className="w-14 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-bold px-2 py-1 rounded-md outline-none dark:text-white" />
                                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">คน</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800/50 flex flex-col justify-center items-center text-center space-y-2">
                                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">สมาชิกที่ต้องการดูแลพิเศษ</span>
                                            <div className="flex items-center gap-3">
                                                <input type="number" name="specialNeedHelpCount" value={formData.specialNeedHelpCount} onChange={handleInputChange} className="w-16 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 text-center font-black text-amber-600 px-2 py-1.5 rounded-lg outline-none" placeholder="0" />
                                                <span className="text-xs font-bold text-amber-600/70">คน</span>
                                            </div>
                                            {parseInt(formData.specialNeedHelpCount) > 0 && (
                                                <input type="text" name="specialNeedDetail" value={formData.specialNeedDetail} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none mt-1" placeholder="ระบุรายละเอียด (เช่น พ่อ-ป่วยเรื้อรัง)..." />
                                            )}
                                            <p className="text-[9px] font-bold text-amber-500/70">(พิการ, ป่วยเรื้อรัง, ชรา)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 2.2 รายละเอียดรายบุคคล */}
                        <section className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                    <Users size={16} /> รายละเอียดสมาชิกแต่ละท่าน
                                </h3>
                                <button onClick={addFamilyMember} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-sm">
                                    <Plus size={14} /> เพิ่มรายชื่อสมาชิก
                                </button>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {familyMembers.map((member, idx) => (
                                    <div key={member.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 relative group overflow-hidden">
                                        <div className="absolute top-4 right-4 flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">ลำดับ {idx + 1}</span>
                                            <button onClick={() => removeFamilyMember(member.id)} className="p-1.5 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="space-y-4 pt-4">
                                            <div className="space-y-1.5">
                                                <Label>ชื่อ-นามสกุล / ความสัมพันธ์</Label>
                                                <input type="text" value={member.name} onChange={(e) => handleFamilyMemberChange(member.id, 'name', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-bold outline-none" placeholder="..." />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label>อายุ (ปี)</Label>
                                                    <input type="number" value={member.age} onChange={(e) => handleFamilyMemberChange(member.id, 'age', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-bold text-center outline-none" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>รายรับ (บาท/เดือน)</Label>
                                                    <input type="number" value={member.income} onChange={(e) => handleFamilyMemberChange(member.id, 'income', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-black text-blue-600 outline-none" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 2.3 สัมพันธภาพ */}
                        <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
                            <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                <Heart size={16} /> สัมพันธภาพและบรรยากาศในครอบครัว
                            </h3>
                            <div className="space-y-4">
                                <Label>สถานะบิดามารดา (สำหรับการสรุปรายงาน)</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {[
                                        { id: 'bothParentsDeceased', label: 'บิดาและมารดาเสียชีวิต' },
                                        { id: 'oneParentDeceased', label: 'บิดาหรือมารดาเสียชีวิต' },
                                        { id: 'parentsSeparated', label: 'บิดาและมารดาแยกทางกัน/เลิกร้าง' },
                                        { id: 'notLivingWithParents', label: 'มิได้อาศัยอยู่กับบิดาหรือมารดา' },
                                    ].map(item => (
                                        <label key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                            ${(formData as any)[item.id]
                                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                : 'bg-slate-50 dark:bg-slate-900 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                            <input
                                                type="checkbox"
                                                checked={(formData as any)[item.id]}
                                                onChange={() => setFormData(prev => ({ ...prev, [item.id]: !(prev as any)[item.id] }))}
                                                className="w-4 h-4 accent-blue-600"
                                            />
                                            <span className="text-xs font-bold">{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <Label>บรรยากาศโดยรวมในครอบครัว</Label>
                                <RadioGroup name="familyAtmosphere" options={["รักใคร่กันดี", "ขัดแย้งบ้างบางครั้ง", "ห่างเหินกัน", "มีการทำร้ายร่างกาย"]} value={formData.familyAtmosphere} onChange={handleInputChange} />
                            </div>

                            <div className="table-responsive rounded-lg border border-slate-100 dark:border-slate-800">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left">ความสัมพันธ์</th>
                                            {["สนิทสนม", "เฉยๆ", "ห่างเหิน", "ขัดแย้ง"].map(q => <th key={q} className="px-2 py-3 text-center">{q}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {[
                                            { id: 'father', label: 'กับบิดา' },
                                            { id: 'mother', label: 'กับมารดา' },
                                            { id: 'brother', label: 'กับพี่ชาย/น้องชาย' },
                                            { id: 'sister', label: 'กับพี่สาว/น้องสาว' },
                                            { id: 'grandparents', label: 'กับปู่ย่า/ตายาย' }
                                        ].map(m => (
                                            <tr key={m.id}>
                                                <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">{m.label}</td>
                                                {["สนิทสนม", "เฉยๆ", "ห่างเหิน", "ขัดแย้ง"].map(q => (
                                                    <td key={q} className="px-2 py-3 text-center">
                                                        <input type="radio" checked={(formData.relationships as any)[m.id] === q} onChange={() => setFormData(p => ({ ...p, relationships: { ...p.relationships, [m.id]: q } }))} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                );
            case 2: { // Step 3: Risk Assessment
                const riskGroups = [
                    { id: 'healthRisk', label: '6.1 สุขภาพ', color: 'blue', options: ['ร่างกายไม่แข็งแรง', 'มีโรคประจำตัวหรือเจ็บป่วยบ่อย', 'มีภาวะทุพโภชนาการ', 'ป่วยเป็นโรคร้ายแรง/เรื้อรัง', 'สมรรถภาพร่างกายต่ำ'] },
                    { id: 'welfareRisk', label: '6.2 สวัสดิการหรือความปลอดภัย', color: 'blue', options: ['พ่อแม่แยกทางกันหรือแต่งงานใหม่', 'เล่นการพนัน', 'มีบุคคลในครอบครัวเจ็บป่วยด้วยโรคร้ายแรง/เรื้อรัง/ติดต่อ', 'บุคคลในครอบครัวติดสารเสพติด', 'บุคคลในครอบครัวเล่นการพนัน', 'มีความขัดแย้ง/ทะเลาะกันในครอบครัว', 'ความขัดแย้งและมีการใช้ความรุนแรงในครอบครัว', 'ไม่มีผู้ดูแล', 'ถูกทารุณ/ทำร้ายจากบุคคลในครอบครัว/เพื่อนบ้าน', 'ถูกล่วงละเมิดทางเพศ'] },
                    { id: 'studentResponsibilities', label: '6.5 ภาระงานความรับผิดชอบ', color: 'blue', options: ['ช่วยงานบ้าน', 'ช่วยดูแลคนเจ็บป่วย/พิการ', 'ช่วยค้าขายเล็กๆ น้อยๆ', 'ทำงานพิเศษแถวบ้าน', 'ช่วยงานในนาไร่', 'อื่นๆ'] },
                    { id: 'studentHobbies', label: '6.6 กิจกรรมยามว่างหรืออดีเรก', color: 'blue', options: ['ดูโทรทัศน์/ฟังเพลง', 'ไปเที่ยวห้าง/ดูหนัง', 'อ่านหนังสือ', 'ไปบ้านเพื่อน/เพื่อน', 'แว้น/สก๊อย', 'เล่นเกม คอมพิวเตอร์/มือถือ', 'ไปสวนสาธารณะ', 'เล่นดนตรี', 'เรียนพิเศษ', 'อื่นๆ'] },
                    { id: 'drugRisk', label: '6.7 พฤติกรรมการใช้สารเสพติด', color: 'blue', options: ['คบเพื่อนในกลุ่มที่ใช้สารเสพติด', 'สมาชิกในครอบครัวข้องเกี่ยวกับยาเสพติด', 'อยู่ในสภาพแวดล้อมที่ใช้สารเสพติด', 'ปัจจุบันเกี่ยวข้องกับสารเสพติด', 'เป็นผู้จำหน่าย สุรา หรือการใช้สารเสพติดอื่นๆ'] },
                    { id: 'violenceRisk', label: '6.8 พฤติกรรมการใช้ความรุนแรง', color: 'blue', options: ['มีการทะเลาะวิวาท', 'ก้าวร้าว เกเร', 'ทะเลาะวิวาทเป็นประจำ', 'ทำร้ายร่างกายผู้อื่น', 'ทำร้ายร่างกายตนเอง', 'อื่นๆ'] },
                    { id: 'sexualRisk', label: '6.9 พฤติกรรมทางเพศ', color: 'blue', options: ['อยู่ในกลุ่มขายบริการ', 'ใช้เครื่องมือสื่อสารที่เกี่ยวข้องกับด้านเพศเป็นเวลานานและบ่อยครั้ง', 'ขายบริการทางเพศ', 'หมกมุ่นในการใช้เครื่องมือสื่อสารที่เกี่ยวข้องทางเพศ', 'มีการมั่วสุมทางเพศ', 'ตั้งครรภ์'] },
                    { id: 'gameRisk', label: '6.10 การติดเกม', color: 'blue', options: ['เล่นเกมเกินวันละ 1 ชั่วโมง', 'ขาดจินตนาการและความคิดสร้างสรรค์', 'เก็บตัว แยกตัวจากกลุ่มเพื่อน', 'ใช้จ่ายเงินผิดปกติ', 'อยู่ในกลุ่มเพื่อนติดเกม', 'ร้านเกมอยู่ใกล้บ้านหรือโรงเรียน', 'เล่นเกมเกินวันละ 2 ชั่วโมง', 'หมกมุ่น จริงจังในการเล่นเกม', 'ใช้เงินสิ้นเปลือง โกหก ลักขโมยเพื่อเล่นเกม', 'อื่นๆ'] },
                ];

                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-xl border border-blue-100 dark:border-blue-800/50 flex gap-4 items-start">
                            <Info className="text-blue-600 shrink-0 mt-0.5" size={20} />
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300">คำแนะนำการประเมินตามมาตรฐาน สพฐ.</h4>
                                <p className="text-xs text-blue-700/70 dark:text-blue-400/70 leading-relaxed font-bold">
                                    โปรดพิจารณาความสอดคล้องจากสภาพความเป็นจริงที่พบ และข้อมูลจากการสัมภาษณ์ (เลือกหัวข้อที่พบพฤติกรรมหรือความเสี่ยง)
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {riskGroups.map(group => (
                                <div key={group.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <ShieldAlert size={16} className="text-blue-600" /> {group.label}
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">เลือกได้มากกว่า 1 ข้อ</span>
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {group.options.map(opt => {
                                            const isChecked = (formData[group.id as keyof typeof formData] as string[]).includes(opt);
                                            return (
                                                <label key={opt} className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-all border
                                                    ${isChecked
                                                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
                                                        : 'bg-slate-50 dark:bg-slate-900/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700'}`}>
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all mt-0.5 shrink-0
                                                        ${isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}>
                                                        {isChecked && <Check size={10} strokeWidth={4} />}
                                                        <input type="checkbox" className="hidden" checked={isChecked} onChange={() => toggleCheckbox(group.id as keyof typeof formData, opt)} />
                                                    </div>
                                                    <span className={`text-[11px] font-bold leading-tight ${isChecked ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`}>
                                                        {opt}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            {/* Special Radio Sections for 6.11 and 6.12 */}
                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-5">
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                        <Activity size={16} className="text-blue-600" /> 6.11 การเข้าถึงคอมพิวเตอร์และอินเทอร์เน็ต
                                    </h4>
                                    <div className="space-y-2">
                                        {[
                                            'สามารถเข้าถึงอินเทอร์เน็ตได้จากที่อยู่อาศัย',
                                            'ไม่สามารถเข้าถึงอินเทอร์เน็ตได้จากที่อยู่อาศัย'
                                        ].map(opt => (
                                            <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                                ${formData.computerAccess === opt
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                    : 'bg-slate-50 dark:bg-slate-900/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                                <input type="radio" checked={formData.computerAccess === opt} onChange={() => setFormData(p => ({ ...p, computerAccess: opt }))} className="w-4 h-4 accent-blue-600" />
                                                <span className="text-xs font-bold">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-5">
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                        <Activity size={16} className="text-blue-600" /> 6.12 การใช้เครื่องมือสื่อสารอิเล็กทรอนิกส์
                                    </h4>
                                    <div className="space-y-2">
                                        {[
                                            'ใช้โซเชียลมีเดีย/เกม (ไม่เกินวันละ 3 ชั่วโมง)',
                                            'ใช้โซเชียลมีเดีย/เกม (วันละ 3 ชั่วโมงขึ้นไป)'
                                        ].map(opt => (
                                            <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                                ${formData.electronicUsage === opt
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                    : 'bg-slate-50 dark:bg-slate-900/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                                <input type="radio" checked={formData.electronicUsage === opt} onChange={() => setFormData(p => ({ ...p, electronicUsage: opt }))} className="w-4 h-4 accent-blue-600" />
                                                <span className="text-xs font-bold">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
            case 3: // Step 4: GPS & Photos
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* GPS Card - Professional */}
                            <div className="bg-slate-900 rounded-2xl p-8 text-white shadow-xl flex flex-col justify-between min-h-[300px] relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10">
                                    <MapPin size={120} />
                                </div>
                                <div className="relative z-10 space-y-4">
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Geolocation System</span>
                                    </div>
                                    <h4 className="text-2xl font-black">พิกัดตำแหน่งบ้าน</h4>
                                    <p className="text-slate-400 text-sm font-bold leading-relaxed max-w-xs">ระบุตำแหน่งที่ตั้งบ้านของนักเรียนเพื่อใช้ในการวางแผนการดูแลและช่วยเหลือ</p>
                                </div>

                                <div className="relative z-10 space-y-6">
                                    <div className="text-4xl font-mono font-black text-blue-500 tracking-tighter">
                                        {gps ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : "---.------, ---.------"}
                                    </div>
                                    <button
                                        onClick={getCurrentLocation}
                                        disabled={gettingGps}
                                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                                    >
                                        {gettingGps ? <Loader2 className="animate-spin" size={20} /> : <MapPin size={20} />}
                                        {gps ? "อัปเดตตำแหน่งปัจจุบัน" : "ดึงพิกัดตำแหน่งปัจจุบัน"}
                                    </button>
                                </div>
                            </div>

                            {/* Photo Upload Section */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 space-y-6 flex flex-col">
                                <div className="flex justify-between items-center">
                                    <div className="space-y-1">
                                        <h4 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            <Camera size={20} className="text-blue-600" /> ภาพถ่ายขณะเยี่ยมบ้าน
                                        </h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold italic">* ถ่ายภาพนักเรียนร่วมกับครูและผู้ดูแล</p>
                                    </div>
                                    <label className="cursor-pointer bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                                        <Plus size={14} /> เลือกรูปภาพ
                                        <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handlePhotoChange(e, 'external')} />
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-grow min-h-[200px]">
                                    {previewsExternal.map((p, idx) => (
                                        <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 group">
                                            <img src={p} className="w-full h-full object-cover" alt="Home Visit" />
                                            <button
                                                onClick={() => {
                                                    setPhotosExternal(prev => prev.filter((_, i) => i !== idx));
                                                    setPreviewsExternal(prev => prev.filter((_, i) => i !== idx));
                                                }}
                                                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 shadow-lg"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {previewsExternal.length === 0 && (
                                        <div className="col-span-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl py-10">
                                            <Camera size={48} strokeWidth={1} />
                                            <span className="text-xs font-bold mt-2">ยังไม่มีรูปถ่าย</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* New Advanced Photo Sections */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-8">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">การขออนุญาตถ่ายภาพบริเวณที่พักอาศัย</h4>
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">ระบุการขอความยินยอมจากผู้ปกครองในการบันทึกภาพสภาพทางกายภาพของบ้าน</p>
                                </div>
                                <div className="flex bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                                    {['อนุญาต', 'ไม่อนุญาต'].map(status => (
                                        <button
                                            key={status}
                                            onClick={() => setFormData(prev => ({ ...prev, parentHousePhotoPermission: status }))}
                                            className={`px-6 py-2 rounded-lg text-xs font-black transition-all
                                                ${formData.parentHousePhotoPermission === status
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                                    : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {formData.parentHousePhotoPermission === 'อนุญาต' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Exterior Photo */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end">
                                            <div className="space-y-1">
                                                <Label>ภาพถ่ายเห็นหลังคาบ้าน (ลักษณะภายนอก)</Label>
                                                <span className="text-[10px] text-slate-400 font-bold italic">(เลือกหรือไม่เลือกก็ได้)</span>
                                            </div>
                                            {exteriorPreview && (
                                                <button onClick={() => { setExteriorPhoto(null); setExteriorPreview(null); }} className="text-[10px] font-bold text-rose-500 hover:text-rose-600">ลบรูปภาพ</button>
                                            )}
                                        </div>
                                        <label className={`relative h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all overflow-hidden bg-white dark:bg-slate-900
                                            ${exteriorPreview ? 'border-blue-500' : 'border-slate-200 dark:border-slate-800 hover:border-blue-400'}`}>
                                            {exteriorPreview ? (
                                                <img src={exteriorPreview} className="w-full h-full object-cover" alt="Exterior" />
                                            ) : (
                                                <>
                                                    <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                                        <Home size={24} />
                                                    </div>
                                                    <span className="text-xs font-black text-slate-400 tracking-widest uppercase">ถ่ายรูปหลังคาบ้าน</span>
                                                </>
                                            )}
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleSinglePhotoChange(e, 'exterior')} />
                                        </label>
                                    </div>

                                    {/* Interior Photo */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end">
                                            <div className="space-y-1">
                                                <Label>ภาพถ่ายเห็นข้างในบ้าน (สภาพความเป็นอยู่)</Label>
                                                <span className="text-[10px] text-slate-400 font-bold italic">(เลือกหรือไม่เลือกก็ได้)</span>
                                            </div>
                                            {interiorPreview && (
                                                <button onClick={() => { setInteriorPhoto(null); setInteriorPreview(null); }} className="text-[10px] font-bold text-rose-500 hover:text-rose-600">ลบรูปภาพ</button>
                                            )}
                                        </div>
                                        <label className={`relative h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all overflow-hidden bg-white dark:bg-slate-900
                                            ${interiorPreview ? 'border-blue-500' : 'border-slate-200 dark:border-slate-800 hover:border-blue-400'}`}>
                                            {interiorPreview ? (
                                                <img src={interiorPreview} className="w-full h-full object-cover" alt="Interior" />
                                            ) : (
                                                <>
                                                    <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                                        <Eye size={24} />
                                                    </div>
                                                    <span className="text-xs font-black text-slate-400 tracking-widest uppercase">ถ่ายรูปในบ้าน</span>
                                                </>
                                            )}
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleSinglePhotoChange(e, 'interior')} />
                                        </label>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 border-2 border-dashed border-blue-200 dark:border-blue-900/30 rounded-3xl bg-blue-50/50 dark:bg-blue-950/20 text-center space-y-6">
                                    <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 mx-auto">
                                        <Info size={32} />
                                    </div>
                                    <div className="space-y-2 max-w-sm mx-auto">
                                        <h5 className="font-black text-blue-900 dark:text-blue-300">ถ่ายรูปคู่กับป้ายโรงเรียนทดแทน</h5>
                                        <p className="text-xs font-bold text-blue-700/60 dark:text-blue-400/60 leading-relaxed">
                                            เมื่อผู้ปกครองไม่ประสงค์ให้บันทึกภาพในบ้าน ให้ครูถ่ายภาพนักเรียนคู่กับป้ายหน้าโรงเรียน หรือสถานที่ราชการในชุมชนทดแทนได้
                                        </p>
                                    </div>
                                    <label className={`relative h-56 max-w-md mx-auto border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all overflow-hidden bg-white dark:bg-slate-800
                                        ${schoolSignPreview ? 'border-blue-500' : 'border-slate-200 dark:border-slate-700 hover:border-blue-400'}`}>
                                        {schoolSignPreview ? (
                                            <img src={schoolSignPreview} className="w-full h-full object-cover" alt="School Sign" />
                                        ) : (
                                            <>
                                                <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
                                                    <Save size={32} />
                                                </div>
                                                <span className="text-xs font-black text-blue-600 tracking-widest uppercase">อัปโหลดรูปป้ายโรงเรียน</span>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleSinglePhotoChange(e, 'schoolSign')} />
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="pt-8 border-t border-slate-100 dark:border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <Label>แผนที่สังเขป (Sketch Map)</Label>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">(ไม่บังคับ)</span>
                                    {sketchMapPreview && (
                                        <button onClick={() => { setSketchMapPhoto(null); setSketchMapPreview(null); }} className="text-[10px] font-bold text-rose-500 hover:text-rose-600">ลบแผนที่</button>
                                    )}
                                </div>
                            </div>
                            <label className={`w-full h-48 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center gap-4 cursor-pointer transition-all overflow-hidden bg-white dark:bg-slate-900/50 group/map
                                ${sketchMapPreview ? 'border-indigo-500' : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400'}`}>
                                {sketchMapPreview ? (
                                    <img src={sketchMapPreview} className="w-full h-full object-cover shadow-inner" alt="Sketch Map" />
                                ) : (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover/map:text-indigo-500 transition-colors">
                                            <Map size={32} />
                                        </div>
                                        <div className="text-center">
                                            <span className="text-xs font-black text-slate-500 dark:text-slate-400 tracking-widest uppercase block">อัปโหลดแผนที่ทางอากาศ/สังเขป</span>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 italic">รองรับไฟล์ภาพ JPG, PNG</p>
                                        </div>
                                    </>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleSinglePhotoChange(e, 'sketchMap')} />
                            </label>
                        </div>
                    </div>
                );
            case 4: // Step 5: Final Summary
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 space-y-6">
                                <div className="space-y-2">
                                    <Label>7. ข้อห่วงใยของผู้ปกครองที่มีต่อนักเรียน <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">(หากไม่มีไม่ต้องกรอก)</span></Label>
                                    <textarea name="parentConcerns" value={formData.parentConcerns} onChange={handleInputChange} className="w-full px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold min-h-[120px] text-sm" placeholder="ระบุรายละเอียดสิ่งที่ผู้ปกครองกังวล..." />
                                </div>
                                <div className="space-y-4">
                                    <Label>8. สิ่งที่ผู้ปกครองต้องการให้โรงเรียนช่วยเหลือ <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">(หากไม่มีไม่ต้องกรอก)</span></Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {['ด้านการเรียน', 'ด้านพฤติกรรม', 'ด้านเศรษฐกิจ(เช่น ขอรับทุน)', 'อื่นๆ'].map(item => (
                                            <label key={item} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                                ${formData.schoolAssistanceNeeded.includes(item)
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                    : 'bg-slate-50 dark:bg-slate-900 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                                <input type="checkbox" checked={formData.schoolAssistanceNeeded.includes(item)} onChange={() => toggleCheckbox('schoolAssistanceNeeded', item)} className="w-4 h-4 accent-blue-600" />
                                                <span className="text-xs font-bold">{item}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {formData.schoolAssistanceNeeded.includes('อื่นๆ') && (
                                        <input
                                            type="text"
                                            name="schoolAssistanceNeededDetail"
                                            value={formData.schoolAssistanceNeededDetail}
                                            onChange={handleInputChange}
                                            placeholder="โปรดระบุรายละเอียดเพิ่มเติม..."
                                            className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm"
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 space-y-6">
                                <div className="space-y-3">
                                    <Label>9. ความช่วยเหลือที่ครอบครัวเคยได้รับจากหน่วยงานหรือต้องการได้รับความช่วยเหลือ</Label>
                                    <RadioGroup name="assistanceHistory" options={["มากที่สุด", "มาก", "ปานกลาง", "น้อย", "ไม่จำเป็น"]} value={formData.assistanceHistory} onChange={handleInputChange} />
                                </div>
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                                    <div className="space-y-2">
                                        <Label>หมายเหตุ/ข้อเสนอแนะเพิ่มเติมจากครูผู้เยี่ยม <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">(หากไม่มีไม่ต้องกรอก)</span></Label>
                                        <textarea name="teacherComments" value={formData.teacherComments} onChange={handleInputChange} className="w-full px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold min-h-[100px] text-sm" placeholder="..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>อุปสรรคที่พบในการเยี่ยมบ้านครั้งนี้ <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">(หากไม่มีไม่ต้องกรอก)</span></Label>
                                        <input type="text" name="obstacles" value={formData.obstacles} onChange={handleInputChange} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" placeholder="..." />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 10. การสรุปผลระดับนโยบาย */}
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-8">
                            <div className="text-center space-y-1">
                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/40 px-3 py-1 rounded-full">สรุปสถานะการเยี่ยมบ้าน</span>
                                <h4 className="text-xl font-black text-slate-800 dark:text-white">10. สรุปผลการเยี่ยมบ้านนักเรียนโดยรวมพบว่า</h4>
                            </div>

                            <div className="flex flex-col gap-6 max-w-2xl mx-auto">
                                <div className="grid grid-cols-1 gap-4">
                                    <button
                                        onClick={() => setFormData(prev => ({ ...prev, visitSummary: 'ปกติ' }))}
                                        className={`px-6 py-4 rounded-xl font-bold text-sm transition-all border-2 text-left flex items-center gap-4
                                            ${formData.visitSummary === 'ปกติ'
                                                ? `bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30`
                                                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-300 hover:border-blue-200'}`}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.visitSummary === 'ปกติ' ? 'border-white' : 'border-slate-300'}`}>
                                            {formData.visitSummary === 'ปกติ' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                                        </div>
                                        ปกติ
                                    </button>

                                    <div className="space-y-3">
                                        <button
                                            onClick={() => setFormData(prev => ({ ...prev, visitSummary: 'ควรส่งเสริม' }))}
                                            className={`w-full px-6 py-4 rounded-xl font-bold text-sm transition-all border-2 text-left flex items-center gap-4
                                                ${formData.visitSummary === 'ควรส่งเสริม'
                                                    ? `bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/30`
                                                    : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-300 hover:border-amber-200'}`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.visitSummary === 'ควรส่งเสริม' ? 'border-white' : 'border-slate-300'}`}>
                                                {formData.visitSummary === 'ควรส่งเสริม' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                                            </div>
                                            ควรส่งเสริมด้าน...
                                        </button>
                                        {formData.visitSummary === 'ควรส่งเสริม' && (
                                            <input
                                                type="text"
                                                name="visitSummaryPromoteDetail"
                                                value={formData.visitSummaryPromoteDetail}
                                                onChange={handleInputChange}
                                                placeholder="ระบุรายละเอียดการส่งเสริม..."
                                                className="w-full px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 outline-none font-bold text-sm text-amber-900 dark:text-amber-200 placeholder:text-amber-300"
                                            />
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        <button
                                            onClick={() => setFormData(prev => ({ ...prev, visitSummary: 'ช่วยเหลือด่วน' }))}
                                            className={`w-full px-6 py-4 rounded-xl font-bold text-sm transition-all border-2 text-left flex items-center gap-4
                                                ${formData.visitSummary === 'ช่วยเหลือด่วน'
                                                    ? `bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/30`
                                                    : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-300 hover:border-rose-200'}`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.visitSummary === 'ช่วยเหลือด่วน' ? 'border-white' : 'border-slate-300'}`}>
                                                {formData.visitSummary === 'ช่วยเหลือด่วน' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                                            </div>
                                            ควรช่วยเหลืออย่างเร่งด่วน ด้าน...
                                        </button>
                                        {formData.visitSummary === 'ช่วยเหลือด่วน' && (
                                            <input
                                                type="text"
                                                name="visitSummaryUrgentDetail"
                                                value={formData.visitSummaryUrgentDetail}
                                                onChange={handleInputChange}
                                                placeholder="ระบุรายละเอียดความช่วยเหลือเร่งด่วน..."
                                                className="w-full px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-900/30 outline-none font-bold text-sm text-rose-900 dark:text-rose-200 placeholder:text-rose-300"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Save Actions */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-5 px-8 rounded-2xl bg-blue-600 text-white font-black text-lg border-b-4 border-blue-800 shadow-lg hover:brightness-110 active:scale-[0.98] active:border-b-0 transition-all flex items-center justify-center gap-4">
                                {submitting ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
                                บันทึกข้อมูลการเยี่ยมบ้าน
                            </button>
                            <button onClick={() => navigate(-1)} className="px-8 py-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-500 dark:text-slate-400 hover:text-rose-500 transition-all text-sm">
                                ยกเลิก
                            </button>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-500">
                <div className="max-w-6xl mx-auto px-4 py-8">
                    {/* Header Banner - Professional & Clean */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div className="flex items-center gap-5">
                                <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm bg-slate-50">
                                    <img
                                        src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName}+${student?.lastName}&background=1e40af&color=fff`}
                                        className="w-full h-full object-cover"
                                        alt="profile"
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <button
                                            onClick={() => navigate("/student-support/home-visit")}
                                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 transition-colors"
                                        >
                                            <ArrowLeft size={14} /> กลับ
                                        </button>
                                        <span className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full font-bold uppercase tracking-wider">
                                            สพฐ. เยี่ยมบ้าน-3
                                        </span>
                                    </div>
                                    <h1 className="text-2xl font-black text-slate-800 dark:text-white">
                                        {student ? `${student.title}${student.firstName} ${student.lastName}` : "กำลังโหลดข้อมูล..."}
                                    </h1>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">
                                        เลขประจำตัว: {student?.studentId} • ชั้น {student?.classLevel}/{student?.room}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="text-right hidden sm:block">
                                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">ปีการศึกษา</p>
                                    <p className="text-lg font-black text-slate-700 dark:text-slate-200">2568 / ภาคเรียนที่ 1</p>
                                </div>
                                <div className="h-10 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2 hidden sm:block"></div>
                                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                                    <CheckCircle2 size={16} />
                                    <span className="text-xs font-bold font-['Sarabun']">แบบฟอร์มมาตรฐาน</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Form Container */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                        {/* Professional Stepper */}
                        <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
                            <div className="flex items-center justify-between max-w-4xl mx-auto table-responsive gap-4 custom-scrollbar pb-2 md:pb-0">
                                {steps.map((s, idx) => (
                                    <div key={idx} className="flex items-center shrink-0">
                                        <button
                                            onClick={() => setCurrentStep(idx)}
                                            className="flex items-center gap-3 group transition-all"
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs transition-all
                                                ${idx === currentStep
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                                    : idx < currentStep
                                                        ? 'bg-emerald-500 text-white'
                                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
                                            >
                                                {idx < currentStep ? <Check size={14} /> : idx + 1}
                                            </div>
                                            <div className="text-left">
                                                <p className={`text-[11px] font-black uppercase tracking-wider transition-colors
                                                    ${idx === currentStep ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-600'}`}>
                                                    {s.title}
                                                </p>
                                            </div>
                                        </button>
                                        {idx < steps.length - 1 && (
                                            <div className="w-8 md:w-16 h-[1px] bg-slate-200 dark:bg-slate-800 mx-4 shrink-0" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Step content with standard padding */}
                        <div className="p-6 md:p-10 min-h-[500px]">
                            {renderStepContent()}
                        </div>

                        {/* Professional Footer Controls */}
                        <div className="bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 px-8 py-5 flex justify-between items-center">
                            <button
                                onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                                disabled={currentStep === 0}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
                                    ${currentStep === 0
                                        ? 'opacity-0 pointer-events-none'
                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm'}`}
                            >
                                <ChevronLeft size={16} /> ย้อนกลับ
                            </button>

                            <div className="flex gap-2">
                                {steps.map((_, i) => (
                                    <div key={i} className={`h-1.5 rounded-full transition-all duration-300
                                        ${i === currentStep ? 'w-6 bg-blue-600' : 'w-1.5 bg-slate-300 dark:bg-slate-700'}`} />
                                ))}
                            </div>

                            {currentStep < steps.length - 1 ? (
                                <button
                                    onClick={() => setCurrentStep(prev => Math.min(steps.length - 1, prev + 1))}
                                    className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
                                >
                                    ขั้นตอนถัดไป <ChevronRight size={16} />
                                </button>
                            ) : <div></div>}
                        </div>
                    </div>
                </div>

                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { height: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { @apply bg-slate-200 dark:bg-slate-800 rounded-full; }
                `}</style>
            </div>
        </MainLayout>
    );
};

const HistoryLink = ({ studentId }: { studentId?: string }) => (
    <span className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors cursor-pointer group">
        <ExternalLink size={14} />
        <span>ดูประวัติ</span>
    </span>
);

export default NewHomeVisit;
