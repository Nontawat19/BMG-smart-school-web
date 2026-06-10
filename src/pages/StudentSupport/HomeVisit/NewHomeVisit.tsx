import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, auth, storage } from "@/firebase";
import { compressImage } from "@/utils/imageUtils";
import { doc, getDoc, collection, addDoc, serverTimestamp, GeoPoint, query, orderBy, limit, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";
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
    idCardNumber?: string;
    title: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    room: string;
    schoolId: string;
    profileImageUrl?: string;
    nickname?: string;
    parentsMaritalStatus?: string;
    fatherIdNumber?: string;
    fatherTitle?: string;
    fatherFirstName?: string;
    fatherLastName?: string;
    fatherOccupation?: string;
    fatherMonthlyIncome?: string;
    fatherPhone?: string;
    motherIdNumber?: string;
    motherTitle?: string;
    motherFirstName?: string;
    motherLastName?: string;
    motherOccupation?: string;
    motherMonthlyIncome?: string;
    motherPhone?: string;
    guardianRelationship?: string;
    guardianIdNumber?: string;
    guardianTitle?: string;
    guardianFirstName?: string;
    guardianLastName?: string;
    guardianOccupation?: string;
    guardianMonthlyIncome?: string;
    guardianPhone?: string;
}

interface FamilyMember {
    id: string;
    name: string;
    relationship?: string;
    age: string;
    education: string;
    occupation: string;
    income: string;
    disability?: string;
    wageIncome?: string;
    agricultureIncome?: string;
    businessIncome?: string;
    welfareIncome?: string;
    otherIncome?: string;
    totalIncome?: string;
}

const compactName = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(" ").trim();

const getCurrentAcademicFallback = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const beYear = now.getFullYear() + 543;
    if (month >= 5 && month <= 10) return { academicYear: String(beYear), semester: "1" };
    if (month >= 11) return { academicYear: String(beYear), semester: "2" };
    return { academicYear: String(beYear - 1), semester: "2" };
};

const currentAcademic = getCurrentAcademicFallback();

const getStudentGuardianInfo = (student: Student) => {
    const guardianName = compactName(student.guardianTitle, student.guardianFirstName, student.guardianLastName);
    if (guardianName || student.guardianPhone || student.guardianIdNumber || student.guardianOccupation) {
        return {
            firstName: compactName(student.guardianTitle, student.guardianFirstName),
            lastName: student.guardianLastName || "",
            phone: student.guardianPhone || "",
            idNumber: student.guardianIdNumber || "",
            occupation: student.guardianOccupation || "",
            relationship: student.guardianRelationship || "ผู้ปกครอง",
        };
    }

    const fatherName = compactName(student.fatherTitle, student.fatherFirstName, student.fatherLastName);
    if (fatherName || student.fatherPhone || student.fatherIdNumber || student.fatherOccupation) {
        return {
            firstName: compactName(student.fatherTitle, student.fatherFirstName),
            lastName: student.fatherLastName || "",
            phone: student.fatherPhone || "",
            idNumber: student.fatherIdNumber || "",
            occupation: student.fatherOccupation || "",
            relationship: "บิดา",
        };
    }

    return {
        firstName: compactName(student.motherTitle, student.motherFirstName),
        lastName: student.motherLastName || "",
        phone: student.motherPhone || "",
        idNumber: student.motherIdNumber || "",
        occupation: student.motherOccupation || "",
        relationship: student.motherFirstName || student.motherLastName ? "มารดา" : "",
    };
};

const buildFamilyMembersFromStudent = (student: Student): FamilyMember[] => {
    const members: FamilyMember[] = [];
    if (student.fatherFirstName || student.fatherLastName || student.fatherMonthlyIncome) {
        members.push({
            id: "father",
            relationship: "บิดา",
            name: compactName(student.fatherTitle, student.fatherFirstName, student.fatherLastName),
            age: "",
            education: "",
            occupation: student.fatherOccupation || "",
            income: student.fatherMonthlyIncome || "",
            disability: "-",
            wageIncome: student.fatherMonthlyIncome || "",
            agricultureIncome: "",
            businessIncome: "",
            welfareIncome: "",
            otherIncome: "",
            totalIncome: student.fatherMonthlyIncome || "",
        });
    }
    if (student.motherFirstName || student.motherLastName || student.motherMonthlyIncome) {
        members.push({
            id: "mother",
            relationship: "มารดา",
            name: compactName(student.motherTitle, student.motherFirstName, student.motherLastName),
            age: "",
            education: "",
            occupation: student.motherOccupation || "",
            income: student.motherMonthlyIncome || "",
            disability: "-",
            wageIncome: student.motherMonthlyIncome || "",
            agricultureIncome: "",
            businessIncome: "",
            welfareIncome: "",
            otherIncome: "",
            totalIncome: student.motherMonthlyIncome || "",
        });
    }
    const guardianName = compactName(student.guardianTitle, student.guardianFirstName, student.guardianLastName);
    if (guardianName && !["บิดา", "มารดา"].includes(student.guardianRelationship || "")) {
        members.push({
            id: "guardian",
            relationship: student.guardianRelationship || "ผู้ปกครอง",
            name: guardianName,
            age: "",
            education: "",
            occupation: student.guardianOccupation || "",
            income: student.guardianMonthlyIncome || "",
            disability: "-",
            wageIncome: student.guardianMonthlyIncome || "",
            agricultureIncome: "",
            businessIncome: "",
            welfareIncome: "",
            otherIncome: "",
            totalIncome: student.guardianMonthlyIncome || "",
        });
    }
    return members;
};

const NewHomeVisit: React.FC = () => {
    const { studentId } = useParams<{ studentId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const shouldCopy = searchParams.get("copy") === "true";
    const [student, setStudent] = useState<Student | null>(null);
    const [previousVisit, setPreviousVisit] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
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
        { id: '1', name: '', relationship: '', age: '', education: '', occupation: '', income: '', disability: '', wageIncome: '', agricultureIncome: '', businessIncome: '', welfareIncome: '', otherIncome: '', totalIncome: '' }
    ]);

    const [formData, setFormData] = useState({
        schoolName: "",
        educationArea: "",
        // Page 1: ข้อมูลเบื้องต้น (อ้างอิงภาพที่ 1)
        visitNo: "1",
        semester: currentAcademic.semester,
        academicYear: currentAcademic.academicYear,
        visitStatus: "เยี่ยมแล้ว", // เยี่ยมแล้ว, ยังไม่ได้เยี่ยม
        visitType: "เดินทางไปที่พักอาศัยของนักเรียน", // เดินทางไปที่พักอาศัยของนักเรียน, Online
        visitDate: new Date().toISOString().split('T')[0],
        startTime: "09:00",
        endTime: "10:00",
        visitorNameBySide: "",
        relationshipWithStudent: "บิดามารดา",
        parentFirstName: "",
        parentLastName: "",
        parentPhone: "",
        parentOccupation: "",
        parentEducation: "",
        parentCitizenId: "",
        parentNoGuardian: false,
        parentNoCitizenId: false,
        parentWelfareRegistered: false,
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
        travelMethod: "ผู้ปกครองมาส่ง",

        // 1. สภาพที่อยู่อาศัย (อ้างอิงภาพที่ 1)
        housingType: "บ้านของตนเอง",
        housingCondition: "",
        housingCleanliness: "",
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
        householdDependency: [] as string[],
        vehiclePrivateCar: "",
        vehiclePickup: "",
        vehicleFarmMachine: "",
        farmlandStatus: [] as string[],

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
        caregiverWhenParentsAwayOther: "",

        // 5. รายได้ (อ้างอิงภาพที่ 2)
        familyMonthlyIncome: "",
        householdIncomeAverage: "",
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
        internetUsage: "",

        // ข้อมูลหน้า 2-4 ตามแบบมาตรฐาน 4 หน้า
        parentConcerns: "",
        schoolAssistanceNeeded: [] as string[],
        schoolAssistanceNeededDetail: "",
        assistanceReceived: [] as string[],
        assistanceReceivedOther: "",
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
        electronicUsage: [] as string[],

        // Photo permissions
        parentHousePhotoPermission: "อนุญาต", // อนุญาต, ไม่อนุญาต
        informantRelationship: "",
        teacherPosition: "ครู",

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
                const userData = userDoc.data();
                const schoolId = userData?.schoolId;

                if (schoolId) {
                    const academicInfo = await getCurrentAcademicYear(firestore, schoolId);
                    setFormData(prev => ({
                        ...prev,
                        academicYear: academicInfo.academicYear || currentAcademic.academicYear,
                        semester: academicInfo.currentTerm || currentAcademic.semester
                    }));

                    const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
                    if (schoolSnap.exists()) {
                        const schoolData = schoolSnap.data();
                        setFormData(prev => ({
                            ...prev,
                            schoolName: prev.schoolName || schoolData.schoolName || schoolData.name || "",
                            educationArea: prev.educationArea || schoolData.affiliation || schoolData.educationArea || schoolData.serviceArea || schoolData.areaOffice || ""
                        }));
                    }

                    const studentDoc = await getDoc(doc(firestore, "school-settings", schoolId, "students", studentId));
                    if (studentDoc.exists()) {
                        const studentData = studentDoc.data() as Student;
                        
                        // Check if teacher is regular teacher and shouldn't view other classrooms
                        const roles = Array.isArray(userData?.role) ? userData.role : [userData?.role || ""];
                        const isPower = roles.some((r: string) =>
                            r === 'admin' ||
                            r === 'school_admin' ||
                            r === 'super_admin' ||
                            r === 'academic' ||
                            r === 'academic_admin' ||
                            r === 'director'
                        );
                        
                        if (!isPower) {
                            const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", user.uid);
                            const teacherSnap = await getDoc(teacherRef);
                            if (teacherSnap.exists()) {
                                const tData = teacherSnap.data();
                                const hrGrade = tData.homeroomGrade || "";
                                const hrRoom = tData.homeroomRoom || "";
                                
                                if (studentData.classLevel !== hrGrade || studentData.room !== hrRoom) {
                                    // Not authorized! Redirect to home visit dashboard
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'ปฏิเสธการเข้าถึง',
                                        text: 'คุณไม่มีสิทธิ์เข้าถึงหรือบันทึกข้อมูลนักเรียนนอกห้องเรียนประจำชั้นที่รับผิดชอบ',
                                        confirmButtonColor: '#e11d48'
                                    });
                                    navigate("/student-support/home-visit");
                                    return;
                                }
                            } else {
                                Swal.fire({
                                    icon: 'error',
                                    title: 'ปฏิเสธการเข้าถึง',
                                    text: 'บัญชีผู้สอนของคุณไม่ระบุระดับชั้นประจำปีการศึกษา',
                                    confirmButtonColor: '#e11d48'
                                });
                                navigate("/student-support/home-visit");
                                return;
                            }
                        }

                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { id: _, ...dataWithoutId } = studentData;
                        setStudent({ id: studentDoc.id, ...dataWithoutId } as Student);

                        // Pre-fill nickname in formData if available
                        if (studentData.nickname) {
                            setFormData(prev => ({ ...prev, studentNickname: studentData.nickname || "" }));
                        }

                        const guardian = getStudentGuardianInfo({ id: studentDoc.id, ...dataWithoutId } as Student);
                        setFormData(prev => ({
                            ...prev,
                            parentFirstName: prev.parentFirstName || guardian.firstName,
                            parentLastName: prev.parentLastName || guardian.lastName,
                            parentPhone: prev.parentPhone || guardian.phone,
                            parentOccupation: prev.parentOccupation || guardian.occupation,
                            parentCitizenId: prev.parentCitizenId || guardian.idNumber,
                            relationshipWithStudent: prev.relationshipWithStudent === "บิดามารดา" ? (guardian.relationship || prev.relationshipWithStudent) : prev.relationshipWithStudent,
                            visitorNameBySide: prev.visitorNameBySide || compactName(guardian.firstName, guardian.lastName),
                            informantRelationship: prev.informantRelationship || guardian.relationship,
                            studentPhone: prev.studentPhone || guardian.phone,
                            parentsSeparated: prev.parentsSeparated || studentData.parentsMaritalStatus === "แยกกันอยู่" || studentData.parentsMaritalStatus === "หย่าร้าง",
                        }));

                        const studentFamilyMembers = buildFamilyMembersFromStudent({ id: studentDoc.id, ...dataWithoutId } as Student);
                        if (studentFamilyMembers.length > 0) {
                            setFamilyMembers(current => {
                                const hasUserInput = current.some(member =>
                                    member.name ||
                                    member.relationship ||
                                    member.age ||
                                    member.income ||
                                    member.totalIncome ||
                                    member.wageIncome ||
                                    member.agricultureIncome ||
                                    member.businessIncome ||
                                    member.welfareIncome ||
                                    member.otherIncome
                                );
                                return hasUserInput ? current : studentFamilyMembers;
                            });
                        }

                        // Fetch previous home visit to enable copy feature
                        const visitsCol = collection(firestore, "school-settings", schoolId, "students", studentId, "home-visits");
                        const q = query(visitsCol, orderBy("createdAt", "desc"), limit(1));
                        const querySnapshot = await getDocs(q);
                        if (!querySnapshot.empty) {
                            setPreviousVisit(querySnapshot.docs[0].data());
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

    // Automatically copy data if shouldCopy is true
    useEffect(() => {
        if (shouldCopy && previousVisit) {
            setFormData(prev => {
                const nextData = { ...prev };
                
                const fieldsToCopy = [
                    'schoolName',
                    'educationArea',
                    'visitorNameBySide',
                    'relationshipWithStudent',
                    'parentFirstName',
                    'parentLastName',
                    'parentPhone',
                    'parentOccupation',
                    'parentEducation',
                    'parentCitizenId',
                    'parentNoGuardian',
                    'parentNoCitizenId',
                    'parentWelfareRegistered',
                    'bothParentsDeceased',
                    'oneParentDeceased',
                    'parentsSeparated',
                    'notLivingWithParents',
                    'studentNickname',
                    'studentPhone',
                    'studentLineId',
                    'studentFacebook',
                    'travelDistance',
                    'travelTimeHours',
                    'travelTimeMinutes',
                    'travelMethod',
                    'housingType',
                    'housingCondition',
                    'housingCleanliness',
                    'utilitiesElectricity',
                    'utilitiesWater',
                    'utilitiesToilet',
                    'environmentNear',
                    'familyMaleCount',
                    'familyFemaleCount',
                    'familyTotalCount',
                    'siblingSameParentsMale',
                    'siblingSameParentsFemale',
                    'siblingDifferentParentsMale',
                    'siblingDifferentParentsFemale',
                    'specialNeedHelpCount',
                    'vehiclePrivateCar',
                    'vehiclePickup',
                    'vehicleFarmMachine',
                    'familyAtmosphere',
                    'hoursTogetherPerDay',
                    'studentResponsibility',
                    'studentHobby',
                    'caregiverWhenParentsAway',
                    'caregiverWhenParentsAwayOther',
                    'familyMonthlyIncome',
                    'householdIncomeAverage',
                    'expensePayer',
                    'studentWorkingExtra',
                    'extraJobDetail',
                    'extraIncome',
                    'studentAllowancePerDay',
                    'internetUsage',
                    'parentConcerns',
                    'schoolAssistanceNeededDetail',
                    'assistanceReceivedOther',
                    'assistanceHistory',
                    'visitSummaryPromoteDetail',
                    'visitSummaryUrgentDetail',
                    'teacherComments',
                    'suggestionForUse',
                    'overallSuggestions',
                    'studentResponsibilities',
                    'studentHobbies',
                    'computerAccess',
                    'electronicUsage',
                    'parentHousePhotoPermission',
                    'informantRelationship',
                    'teacherPosition',
                    'housingTypeOther',
                    'travelMethodDetail',
                    'housingCleanlinessOther',
                    'specialNeedDetail'
                ];

                fieldsToCopy.forEach(field => {
                    if (previousVisit[field] !== undefined) {
                        (nextData as any)[field] = previousVisit[field];
                    }
                });

                if (previousVisit.relationships) {
                    nextData.relationships = {
                        ...prev.relationships,
                        ...previousVisit.relationships
                    };
                }

                if (Array.isArray(previousVisit.healthRisk)) nextData.healthRisk = [...previousVisit.healthRisk];
                if (Array.isArray(previousVisit.welfareRisk)) nextData.welfareRisk = [...previousVisit.welfareRisk];
                if (Array.isArray(previousVisit.drugRisk)) nextData.drugRisk = [...previousVisit.drugRisk];
                if (Array.isArray(previousVisit.violenceRisk)) nextData.violenceRisk = [...previousVisit.violenceRisk];
                if (Array.isArray(previousVisit.sexualRisk)) nextData.sexualRisk = [...previousVisit.sexualRisk];
                if (Array.isArray(previousVisit.gameRisk)) nextData.gameRisk = [...previousVisit.gameRisk];
                if (Array.isArray(previousVisit.schoolAssistanceNeeded)) nextData.schoolAssistanceNeeded = [...previousVisit.schoolAssistanceNeeded];
                if (Array.isArray(previousVisit.householdDependency)) nextData.householdDependency = [...previousVisit.householdDependency];
                if (Array.isArray(previousVisit.farmlandStatus)) nextData.farmlandStatus = [...previousVisit.farmlandStatus];
                if (Array.isArray(previousVisit.assistanceReceived)) nextData.assistanceReceived = [...previousVisit.assistanceReceived];
                if (Array.isArray(previousVisit.electronicUsage)) nextData.electronicUsage = [...previousVisit.electronicUsage];
                else if (typeof previousVisit.electronicUsage === 'string' && previousVisit.electronicUsage) nextData.electronicUsage = [previousVisit.electronicUsage];

                return nextData;
            });

            if (Array.isArray(previousVisit.familyMembers) && previousVisit.familyMembers.length > 0) {
                setFamilyMembers(previousVisit.familyMembers.map((m: any) => ({
                    id: m.id || Date.now().toString() + Math.random().toString(),
                    name: m.name || '',
                    relationship: m.relationship || '',
                    age: m.age || '',
                    education: m.education || '',
                    occupation: m.occupation || '',
                    income: m.income || '',
                    disability: m.disability || '',
                    wageIncome: m.wageIncome || '',
                    agricultureIncome: m.agricultureIncome || '',
                    businessIncome: m.businessIncome || '',
                    welfareIncome: m.welfareIncome || '',
                    otherIncome: m.otherIncome || '',
                    totalIncome: m.totalIncome || ''
                })));
            }

            Swal.fire({
                icon: 'success',
                title: 'ดึงข้อมูลการเยี่ยมบ้านครั้งก่อนให้เรียบร้อยแล้ว!',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
                customClass: {
                    popup: 'rounded-xl font-bold'
                }
            });
        }
    }, [shouldCopy, previousVisit]);

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

    const getCopyBadgeText = () => {
        if (!previousVisit) return null;
        
        const prevYear = previousVisit.academicYear || "";
        const prevSem = previousVisit.semester || "";
        const prevClass = previousVisit.studentInfo?.classLevel || "";
        
        const currYear = formData.academicYear;
        const currSem = formData.semester;
        const currClass = student?.classLevel || "";

        if (currYear === prevYear && currSem === "2" && prevSem === "1") {
            return `พบข้อมูลการเยี่ยมบ้าน ภาคเรียนที่ 1/${prevYear} (สามารถคัดลอกมาใช้ต่อใน ภาคเรียนที่ 2 ของปีนี้ได้เลย)`;
        }
        
        if (currSem === "1" && prevYear && currYear && parseInt(currYear) > parseInt(prevYear)) {
            return `พบข้อมูลการเยี่ยมบ้าน ปีการศึกษา ${prevYear} (ตอนชั้น ${prevClass}) (สามารถคัดลอกมาใช้ต่อสำหรับการเลื่อนชั้นขึ้น ชั้น ${currClass} ในปีนี้ได้เลย)`;
        }

        return `พบข้อมูลการเยี่ยมบ้านครั้งล่าสุดเมื่อ ${previousVisit.visitDate ? new Date(previousVisit.visitDate).toLocaleDateString("th-TH") : ""}`;
    };

    const handleCopyPreviousVisit = () => {
        if (!previousVisit) return;
        
        Swal.fire({
            title: 'ดึงข้อมูลจากการเยี่ยมบ้านครั้งก่อน?',
            text: 'ข้อมูลเดิมในฟอร์มนี้ (อาทิ ข้อมูลครอบครัว ความสัมพันธ์ ความเสี่ยง) จะถูกเขียนทับด้วยข้อมูลจากการเยี่ยมบ้านครั้งล่าสุด แต่จะไม่กระทบต่อวันที่ เวลา พิกัด GPS และรูปภาพของวิสิทใหม่นี้',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ใช่, ดึงข้อมูลเดิม',
            cancelButtonText: 'ยกเลิก',
            customClass: {
                popup: 'rounded-[2rem] font-bold p-8',
            }
        }).then((result) => {
            if (result.isConfirmed) {
                // Copy values from previousVisit
                setFormData(prev => {
                    const nextData = { ...prev };
                    
                    const fieldsToCopy = [
                        'schoolName',
                        'educationArea',
                        'visitorNameBySide',
                        'relationshipWithStudent',
                        'parentFirstName',
                        'parentLastName',
                        'parentPhone',
                        'parentOccupation',
                        'parentEducation',
                        'parentCitizenId',
                        'parentNoGuardian',
                        'parentNoCitizenId',
                        'parentWelfareRegistered',
                        'bothParentsDeceased',
                        'oneParentDeceased',
                        'parentsSeparated',
                        'notLivingWithParents',
                        'studentNickname',
                        'studentPhone',
                        'studentLineId',
                        'studentFacebook',
                        'travelDistance',
                        'travelTimeHours',
                        'travelTimeMinutes',
                        'travelMethod',
                        'housingType',
                        'housingCondition',
                        'housingCleanliness',
                        'utilitiesElectricity',
                        'utilitiesWater',
                        'utilitiesToilet',
                        'environmentNear',
                        'familyMaleCount',
                        'familyFemaleCount',
                        'familyTotalCount',
                        'siblingSameParentsMale',
                        'siblingSameParentsFemale',
                        'siblingDifferentParentsMale',
                        'siblingDifferentParentsFemale',
                        'specialNeedHelpCount',
                        'vehiclePrivateCar',
                        'vehiclePickup',
                        'vehicleFarmMachine',
                        'familyAtmosphere',
                        'hoursTogetherPerDay',
                        'studentResponsibility',
                        'studentHobby',
                        'caregiverWhenParentsAway',
                        'caregiverWhenParentsAwayOther',
                        'familyMonthlyIncome',
                        'householdIncomeAverage',
                        'expensePayer',
                        'studentWorkingExtra',
                        'extraJobDetail',
                        'extraIncome',
                        'studentAllowancePerDay',
                        'internetUsage',
                        'parentConcerns',
                        'schoolAssistanceNeededDetail',
                        'assistanceReceivedOther',
                        'assistanceHistory',
                        'visitSummaryPromoteDetail',
                        'visitSummaryUrgentDetail',
                        'teacherComments',
                        'suggestionForUse',
                        'overallSuggestions',
                        'studentResponsibilities',
                        'studentHobbies',
                        'computerAccess',
                        'electronicUsage',
                        'parentHousePhotoPermission',
                        'informantRelationship',
                        'teacherPosition',
                        'housingTypeOther',
                        'travelMethodDetail',
                        'housingCleanlinessOther',
                        'specialNeedDetail'
                    ];

                    fieldsToCopy.forEach(field => {
                        if (previousVisit[field] !== undefined) {
                            (nextData as any)[field] = previousVisit[field];
                        }
                    });

                    // Handle nested relationships specifically
                    if (previousVisit.relationships) {
                        nextData.relationships = {
                            ...prev.relationships,
                            ...previousVisit.relationships
                        };
                    }

                    // Handle arrays specifically to ensure safe copy
                    if (Array.isArray(previousVisit.healthRisk)) nextData.healthRisk = [...previousVisit.healthRisk];
                    if (Array.isArray(previousVisit.welfareRisk)) nextData.welfareRisk = [...previousVisit.welfareRisk];
                    if (Array.isArray(previousVisit.drugRisk)) nextData.drugRisk = [...previousVisit.drugRisk];
                    if (Array.isArray(previousVisit.violenceRisk)) nextData.violenceRisk = [...previousVisit.violenceRisk];
                    if (Array.isArray(previousVisit.sexualRisk)) nextData.sexualRisk = [...previousVisit.sexualRisk];
                    if (Array.isArray(previousVisit.gameRisk)) nextData.gameRisk = [...previousVisit.gameRisk];
                    if (Array.isArray(previousVisit.schoolAssistanceNeeded)) nextData.schoolAssistanceNeeded = [...previousVisit.schoolAssistanceNeeded];
                    if (Array.isArray(previousVisit.householdDependency)) nextData.householdDependency = [...previousVisit.householdDependency];
                    if (Array.isArray(previousVisit.farmlandStatus)) nextData.farmlandStatus = [...previousVisit.farmlandStatus];
                    if (Array.isArray(previousVisit.assistanceReceived)) nextData.assistanceReceived = [...previousVisit.assistanceReceived];
                    if (Array.isArray(previousVisit.electronicUsage)) nextData.electronicUsage = [...previousVisit.electronicUsage];
                    else if (typeof previousVisit.electronicUsage === 'string' && previousVisit.electronicUsage) nextData.electronicUsage = [previousVisit.electronicUsage];

                    return nextData;
                });

                // Copy familyMembers if present and is a non-empty array
                if (Array.isArray(previousVisit.familyMembers) && previousVisit.familyMembers.length > 0) {
                    setFamilyMembers(previousVisit.familyMembers.map((m: any) => ({
                        id: m.id || Date.now().toString() + Math.random().toString(),
                        name: m.name || '',
                        relationship: m.relationship || '',
                        age: m.age || '',
                        education: m.education || '',
                        occupation: m.occupation || '',
                        income: m.income || '',
                        disability: m.disability || '',
                        wageIncome: m.wageIncome || '',
                        agricultureIncome: m.agricultureIncome || '',
                        businessIncome: m.businessIncome || '',
                        welfareIncome: m.welfareIncome || '',
                        otherIncome: m.otherIncome || '',
                        totalIncome: m.totalIncome || ''
                    })));
                }

                Swal.fire({
                    icon: 'success',
                    title: 'ดึงข้อมูลสำเร็จ',
                    text: 'คัดลอกข้อมูลการเยี่ยมบ้านครั้งก่อนเข้ามาในแบบฟอร์มแล้ว คุณสามารถตรวจสอบและปรับปรุงข้อมูลเพิ่มเติมให้เป็นปัจจุบันได้ทันที',
                    confirmButtonColor: '#2563eb',
                    customClass: {
                        popup: 'rounded-[2rem] font-bold p-8',
                    }
                });
            }
        });
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

    const handleSinglePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'exterior' | 'interior' | 'schoolSign' | 'sketchMap') => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            Swal.fire({ icon: 'error', title: 'ไฟล์ไม่ถูกต้อง', text: 'รองรับเฉพาะไฟล์ JPG และ PNG เท่านั้น' });
            return;
        }

        try {
            const compressedFile = await compressImage(file, 1280, 0.75, 'image/jpeg');
            const previewUrl = URL.createObjectURL(compressedFile);
            if (type === 'exterior') {
                setExteriorPhoto(compressedFile);
                setExteriorPreview(previewUrl);
            } else if (type === 'interior') {
                setInteriorPhoto(compressedFile);
                setInteriorPreview(previewUrl);
            } else if (type === 'schoolSign') {
                setSchoolSignPhoto(compressedFile);
                setSchoolSignPreview(previewUrl);
            } else if (type === 'sketchMap') {
                setSketchMapPhoto(compressedFile);
                setSketchMapPreview(previewUrl);
            }
        } catch (error) {
            console.error("Error compressing home visit image:", error);
            Swal.fire({ icon: 'error', title: 'บีบอัดรูปภาพไม่สำเร็จ', text: 'กรุณาลองเลือกรูปใหม่อีกครั้ง' });
        }
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
        setFamilyMembers([...familyMembers, { id: Date.now().toString(), name: '', relationship: '', age: '', education: '', occupation: '', income: '', disability: '', wageIncome: '', agricultureIncome: '', businessIncome: '', welfareIncome: '', otherIncome: '', totalIncome: '' }]);
    };

    const removeFamilyMember = (id: string) => {
        if (familyMembers.length > 1) {
            setFamilyMembers(familyMembers.filter(m => m.id !== id));
        }
    };

    const handleFamilyMemberChange = (id: string, field: keyof FamilyMember, value: string) => {
        setFamilyMembers(familyMembers.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'internal' | 'external') => {
        if (e.target.files) {
            const files = Array.from(e.target.files).filter(file => ['image/jpeg', 'image/png'].includes(file.type));
            if (files.length !== e.target.files.length) {
                Swal.fire({ icon: 'warning', title: 'ข้ามบางไฟล์', text: 'ระบบรองรับเฉพาะไฟล์ JPG และ PNG เท่านั้น' });
            }
            try {
                const compressedFiles = await Promise.all(files.map(file => compressImage(file, 1280, 0.75, 'image/jpeg')));
                const urls = compressedFiles.map(f => URL.createObjectURL(f));
                if (type === 'internal') {
                    setPhotosInternal(prev => [...prev, ...compressedFiles]);
                    setPreviewsInternal(prev => [...prev, ...urls]);
                } else {
                    setPhotosExternal(prev => [...prev, ...compressedFiles]);
                    setPreviewsExternal(prev => [...prev, ...urls]);
                }
            } catch (error) {
                console.error("Error compressing home visit images:", error);
                Swal.fire({ icon: 'error', title: 'บีบอัดรูปภาพไม่สำเร็จ', text: 'กรุณาลองเลือกรูปใหม่อีกครั้ง' });
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
        { title: "หน้า 1", desc: "ข้อมูลนักเรียน ครัวเรือน และที่อยู่อาศัย", icon: FileText },
        { title: "หน้า 2", desc: "ความสัมพันธ์ รายได้ ความช่วยเหลือ และความเสี่ยงเบื้องต้น", icon: Users },
        { title: "หน้า 3", desc: "พฤติกรรม ความเสี่ยง และผู้ให้ข้อมูลนักเรียน", icon: ShieldAlert },
        { title: "หน้า 4", desc: "รูปถ่ายบ้านและผู้รับรองข้อมูล", icon: Camera },
        { title: "สรุปท้าย", desc: "ข้อห่วงใย ความช่วยเหลือ และผู้รับรองภาพถ่าย", icon: Info }
    ];

    if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-blue-600" /></div>;

    const Label = ({ children, required }: { children: React.ReactNode, required?: boolean }) => (
        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
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

    const progressPercent = Math.round(((currentStep + 1) / steps.length) * 100);
    const CurrentStepIcon = steps[currentStep]?.icon || FileText;
    const academicYearNumber = Number(formData.academicYear || currentAcademic.academicYear);
    const academicYearOptions = Array.from(
        new Set([
            academicYearNumber + 1,
            academicYearNumber,
            academicYearNumber - 1,
            academicYearNumber - 2
        ].filter(Boolean).map(String))
    );

    const PhotoActionButton = ({
        label,
        mode,
        multiple = false,
        onChange
    }: {
        label: string;
        mode: "camera" | "upload";
        multiple?: boolean;
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    }) => (
        <label
            className={`min-h-11 flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition-all cursor-pointer border active:scale-[0.98] ${
                mode === "camera"
                    ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 hover:bg-blue-700"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
        >
            {mode === "camera" ? <Camera size={16} /> : <Plus size={16} />}
            {label}
            <input
                type="file"
                multiple={multiple}
                accept="image/jpeg,image/png,image/*"
                capture={mode === "camera" ? "environment" : undefined}
                className="hidden"
                onChange={onChange}
            />
        </label>
    );

    const SinglePhotoField = ({
        title,
        hint,
        preview,
        type,
        icon: Icon,
        onClear,
        accent = "blue"
    }: {
        title: string;
        hint?: string;
        preview: string | null;
        type: 'exterior' | 'interior' | 'schoolSign' | 'sketchMap';
        icon: React.ElementType;
        onClear: () => void;
        accent?: "blue" | "indigo";
    }) => (
        <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <Label>{title}</Label>
                    {hint && <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 leading-relaxed">{hint}</p>}
                </div>
                {preview && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="shrink-0 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[11px] font-black text-rose-600 dark:text-rose-300"
                    >
                        ลบ
                    </button>
                )}
            </div>
            <div className={`relative h-52 sm:h-60 rounded-2xl border-2 border-dashed overflow-hidden flex flex-col items-center justify-center gap-3 ${
                preview
                    ? accent === "indigo" ? "border-indigo-500" : "border-blue-500"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40"
            }`}>
                {preview ? (
                    <img src={preview} className="w-full h-full object-cover" alt={title} />
                ) : (
                    <>
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                            accent === "indigo" ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500" : "bg-blue-50 dark:bg-blue-950/30 text-blue-500"
                        }`}>
                            <Icon size={28} />
                        </div>
                        <p className="px-4 text-center text-xs font-black text-slate-500 dark:text-slate-400">{title}</p>
                    </>
                )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <PhotoActionButton label="ถ่ายภาพ" mode="camera" onChange={(e) => handleSinglePhotoChange(e, type)} />
                <PhotoActionButton label="อัปโหลดจากเครื่อง" mode="upload" onChange={(e) => handleSinglePhotoChange(e, type)} />
            </div>
        </div>
    );

    const renderStepContent = () => {
        switch (currentStep) {
            case 0: // Step 1: Basic & Location
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
                            <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                <FileText size={16} /> ข้อมูลหน้า 1 ตามแบบบันทึกการเยี่ยมบ้าน
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <Label>โรงเรียน</Label>
                                    <input type="text" name="schoolName" value={formData.schoolName} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="ชื่อโรงเรียน" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>สพป./สพม.</Label>
                                    <input type="text" name="educationArea" value={formData.educationArea} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="เขตพื้นที่การศึกษา" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="space-y-1.5">
                                    <Label>ชื่อผู้ปกครอง</Label>
                                    <input type="text" name="parentFirstName" value={formData.parentFirstName} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="ชื่อ" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>นามสกุลผู้ปกครอง</Label>
                                    <input type="text" name="parentLastName" value={formData.parentLastName} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="นามสกุล" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>เบอร์โทรศัพท์ผู้ปกครอง</Label>
                                    <input type="text" name="parentPhone" value={formData.parentPhone} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" placeholder="08x-xxx-xxxx" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>ความสัมพันธ์กับนักเรียน</Label>
                                    <input type="text" name="relationshipWithStudent" value={formData.relationshipWithStudent} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>อาชีพผู้ปกครอง</Label>
                                    <input type="text" name="parentOccupation" value={formData.parentOccupation} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>การศึกษาสูงสุด</Label>
                                    <input type="text" name="parentEducation" value={formData.parentEducation} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold dark:text-white" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <Label>เลขที่บัตรประชาชนผู้ปกครอง</Label>
                                    <input type="text" name="parentCitizenId" value={formData.parentCitizenId} onChange={handleInputChange} maxLength={13} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none font-bold tracking-widest dark:text-white" placeholder="13 หลัก" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {[
                                        { id: 'parentNoGuardian', label: 'ไม่มีผู้ปกครอง' },
                                        { id: 'parentNoCitizenId', label: 'ไม่มีบัตรประชาชน' },
                                        { id: 'parentWelfareRegistered', label: 'ลงทะเบียนสวัสดิการแห่งรัฐ' },
                                    ].map(item => (
                                        <label key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${(formData as any)[item.id] ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                            <input type="checkbox" checked={(formData as any)[item.id]} onChange={() => setFormData(prev => ({ ...prev, [item.id]: !(prev as any)[item.id] }))} className="w-4 h-4 accent-blue-600" />
                                            <span className="text-xs font-bold">{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </section>

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
                                            <RadioGroup name="housingType" options={["บ้านของตนเอง", "บ้านเช่า", "อาศัยอยู่กับผู้อื่น", "บ้านของญาติ", "บ้านหรือที่พักประเภท วัด มูลนิธิ หอพัก โรงงาน อยู่กับนายจ้าง", "อื่นๆ"]} value={formData.housingType} onChange={handleInputChange} />
                                            {formData.housingType === "อื่นๆ" && (
                                                <input type="text" name="housingTypeOther" value={formData.housingTypeOther} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-sm font-bold outline-none mt-2 dark:text-white" placeholder="ระบุประเภทที่อยู่อาศัย..." />
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            <Label required>สภาพที่อยู่อาศัย</Label>
                                            <RadioGroup name="housingCondition" options={["สภาพบ้านชำรุดทรุดโทรม หรือ บ้านทำจากวัสดุพื้นบ้าน เช่น ไม้ไผ่ ใบจากหรือวัสดุเหลือใช้", "ไม่มีห้องส้วมในที่อยู่อาศัยและบริเวณ", "ไม่มีปัญหา"]} value={formData.housingCondition} onChange={handleInputChange} />
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
                                        <Label required>ความสะอาด/ความเป็นระเบียบ (ใช้เป็นบันทึกเพิ่มเติม ไม่แสดงในแม่แบบ 4 หน้า)</Label>
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
                        <section className="bg-white dark:bg-slate-900 p-4 sm:p-5 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <h3 className="text-sm font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                    <FileText size={16} /> ข้อมูลการเยี่ยมบ้านเบื้องต้น
                                </h3>
                                <div className="inline-flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs font-black text-blue-700 dark:text-blue-300">
                                    <Clock size={14} />
                                    {formData.academicYear} / ภาคเรียนที่ {formData.semester}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
                                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 p-4 space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400">
                                        <FileText size={14} className="text-blue-500" /> รอบการเยี่ยม
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4 gap-4">
                                        <div className="space-y-1.5">
                                            <Label required>เยี่ยมครั้งที่</Label>
                                            <input type="text" name="visitNo" value={formData.visitNo} onChange={handleInputChange} className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold dark:text-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label required>ภาคเรียนที่</Label>
                                            <select name="semester" value={formData.semester} onChange={handleInputChange} className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold dark:text-white">
                                                <option value="1">1</option>
                                                <option value="2">2</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label required>ปีการศึกษา</Label>
                                            <select name="academicYear" value={formData.academicYear} onChange={handleInputChange} className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold dark:text-white">
                                                {academicYearOptions.map(year => (
                                                    <option key={year} value={year}>{year}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label required>สถานะการเยี่ยม</Label>
                                            <select name="visitStatus" value={formData.visitStatus} onChange={handleInputChange} className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm outline-none font-bold dark:text-white">
                                                <option value="เยี่ยมแล้ว">เยี่ยมแล้ว</option>
                                                <option value="ยังไม่ได้เยี่ยม">ยังไม่ได้เยี่ยม</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 p-4 space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400">
                                        <Clock size={14} className="text-blue-500" /> วันและเวลา
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="space-y-1.5 sm:col-span-3 lg:col-span-1 xl:col-span-3 2xl:col-span-1">
                                            <Label required>วันที่ออกเยี่ยม</Label>
                                            <input type="date" name="visitDate" value={formData.visitDate} onChange={handleInputChange} className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm outline-none font-bold dark:text-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label required>เวลาที่เริ่ม</Label>
                                            <input type="time" name="startTime" value={formData.startTime} onChange={handleInputChange} className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm outline-none font-bold dark:text-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label required>เวลาที่สิ้นสุด</Label>
                                            <input type="time" name="endTime" value={formData.endTime} onChange={handleInputChange} className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm outline-none font-bold dark:text-white" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label required>รูปแบบการเยี่ยมบ้าน</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {["เดินทางไปที่พักอาศัยของนักเรียน", "เยี่ยมผ่านออนไลน์/โทรศัพท์"].map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, visitType: type }))}
                                            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                                                formData.visitType === type
                                                    ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 shadow-sm"
                                                    : "bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-200 dark:hover:border-blue-900"
                                            }`}
                                        >
                                            <span className="text-sm font-black">{type}</span>
                                            <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                                                formData.visitType === type ? "bg-blue-600 border-blue-600 text-white" : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                                            }`}>
                                                {formData.visitType === type && <Check size={12} strokeWidth={4} />}
                                            </span>
                                        </button>
                                    ))}
                                </div>
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

                        <section className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6">
                            <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                <Home size={16} /> สถานะของครัวเรือนตามแบบคัดกรอง
                            </h3>
                            <div className="space-y-3">
                                <Label>4.1 ครัวเรือนมีภาระพึ่งพิง</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {['มีคนพิการ', 'มีผู้สูงอายุเกิน 60 ปี', 'เป็นพ่อ/แม่เลี้ยงเดี่ยว', 'มีคนอายุ 15-65 ปีว่างงาน'].map(item => (
                                        <label key={item} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${formData.householdDependency.includes(item) ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                            <input type="checkbox" checked={formData.householdDependency.includes(item)} onChange={() => toggleCheckbox('householdDependency', item)} className="w-4 h-4 accent-blue-600" />
                                            <span className="text-xs font-bold">{item}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                {[
                                    { name: 'vehiclePrivateCar', label: 'รถยนต์ส่วนบุคคล' },
                                    { name: 'vehiclePickup', label: 'รถปิกอัพ/รถบรรทุกเล็ก/รถตู้' },
                                    { name: 'vehicleFarmMachine', label: 'รถไถ/เกี่ยวข้าว/รถอีแต๋น/รถอื่นๆ' },
                                ].map(item => (
                                    <div key={item.name} className="space-y-2">
                                        <Label>{item.label}</Label>
                                        <RadioGroup name={item.name} options={["มี", "ไม่มี"]} value={(formData as any)[item.name]} onChange={handleInputChange} />
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-3">
                                <Label>4.5 เป็นเกษตรกร มีที่ดินทำกิน (รวมเช่า)</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {['ไม่เกิน 1 ไร่', 'ไม่มีที่ดินเป็นของตนเอง'].map(item => (
                                        <label key={item} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${formData.farmlandStatus.includes(item) ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                            <input type="checkbox" checked={formData.farmlandStatus.includes(item)} onChange={() => toggleCheckbox('farmlandStatus', item)} className="w-4 h-4 accent-blue-600" />
                                            <span className="text-xs font-bold">{item}</span>
                                        </label>
                                    ))}
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
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label>ความสัมพันธ์กับนักเรียน</Label>
                                                    <input type="text" value={member.relationship || ''} onChange={(e) => handleFamilyMemberChange(member.id, 'relationship', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-bold outline-none" placeholder="เช่น บิดา, มารดา, ตา" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>ชื่อ-นามสกุล (อ้างอิงภายในระบบ)</Label>
                                                    <input type="text" value={member.name} onChange={(e) => handleFamilyMemberChange(member.id, 'name', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-bold outline-none" placeholder="..." />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label>อายุ (ปี)</Label>
                                                    <input type="number" value={member.age} onChange={(e) => handleFamilyMemberChange(member.id, 'age', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-bold text-center outline-none" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>ความพิการ (✓ หรือ -)</Label>
                                                    <input type="text" value={member.disability || ''} onChange={(e) => handleFamilyMemberChange(member.id, 'disability', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-bold text-center outline-none" placeholder="-" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>รายได้รวมเฉลี่ยต่อเดือน</Label>
                                                    <input type="number" value={member.totalIncome || member.income} onChange={(e) => handleFamilyMemberChange(member.id, 'totalIncome', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-black text-blue-600 outline-none" />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 items-end">
                                                {[
                                                    { field: 'wageIncome', label: 'ค่าจ้าง/เงินเดือน' },
                                                    { field: 'agricultureIncome', label: 'เกษตร หลังหักค่าใช้จ่าย' },
                                                    { field: 'businessIncome', label: 'ธุรกิจส่วนตัว หลังหักค่าใช้จ่าย' },
                                                    { field: 'welfareIncome', label: 'สวัสดิการรัฐ/เอกชน' },
                                                    { field: 'otherIncome', label: 'รายได้จากแหล่งอื่น' },
                                                ].map(item => (
                                                    <div key={item.field} className="flex min-h-[76px] flex-col justify-end gap-1.5">
                                                        <label className="min-h-[34px] flex items-end text-[11px] font-black leading-tight text-slate-500 dark:text-slate-400">
                                                            {item.label}
                                                        </label>
                                                        <input type="number" value={(member as any)[item.field] || ''} onChange={(e) => handleFamilyMemberChange(member.id, item.field as keyof FamilyMember, e.target.value)} className="w-full h-10 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm font-bold outline-none dark:text-white" placeholder="0" />
                                                    </div>
                                                ))}
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

                            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    <div className="space-y-1.5">
                                        <Label>5.1 สมาชิกในครอบครัวมีเวลาอยู่ร่วมกัน</Label>
                                        <div className="flex items-center gap-2">
                                            <input type="number" name="hoursTogetherPerDay" value={formData.hoursTogetherPerDay} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold outline-none dark:text-white" placeholder="0" />
                                            <span className="text-xs font-bold text-slate-400">ชม./วัน</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>5.4 รายได้ครัวเรือนเฉลี่ยต่อคน</Label>
                                        <input type="number" name="householdIncomeAverage" value={formData.householdIncomeAverage} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold outline-none dark:text-white" placeholder="บาท" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>นักเรียนได้เงินมาโรงเรียนวันละ</Label>
                                        <input type="number" name="studentAllowancePerDay" value={formData.studentAllowancePerDay} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold outline-none dark:text-white" placeholder="บาท" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <Label>5.3 กรณีที่ผู้ปกครองไม่อยู่บ้าน ฝากเด็กนักเรียนอยู่บ้านกับใคร</Label>
                                    <RadioGroup name="caregiverWhenParentsAway" options={["ญาติ", "เพื่อนบ้าน", "นักเรียนอยู่บ้านด้วยตนเอง", "อื่นๆ"]} value={formData.caregiverWhenParentsAway} onChange={handleInputChange} />
                                    {formData.caregiverWhenParentsAway === "อื่นๆ" && (
                                        <input type="text" name="caregiverWhenParentsAwayOther" value={formData.caregiverWhenParentsAwayOther} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold outline-none dark:text-white" placeholder="ระบุผู้ดูแล" />
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    <div className="space-y-1.5">
                                        <Label>5.5 นักเรียนได้รับค่าใช้จ่ายจาก</Label>
                                        <input type="text" name="expensePayer" value={formData.expensePayer} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold outline-none dark:text-white" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>นักเรียนทำงานหารายได้ อาชีพ</Label>
                                        <input type="text" name="extraJobDetail" value={formData.extraJobDetail} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold outline-none dark:text-white" placeholder="ถ้าไม่มี เว้นว่างได้" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>รายได้วันละ</Label>
                                        <input type="number" name="extraIncome" value={formData.extraIncome} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold outline-none dark:text-white" placeholder="บาท" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <div className="space-y-4">
                                        <Label>5.6 สิ่งที่ผู้ปกครองต้องการให้โรงเรียนช่วยเหลือนักเรียน</Label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {['ด้านการเรียน', 'ด้านพฤติกรรม', 'ด้านเศรษฐกิจ (เช่น ขอรับทุน)', 'อื่นๆ'].map(item => (
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
                                    <div className="space-y-4">
                                        <Label>5.7 ความช่วยเหลือที่ครอบครัวเคยได้รับจากหน่วยงานหรือต้องการได้รับ</Label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            {['เบี้ยผู้สูงอายุ', 'เบี้ยพิการ', 'อื่นๆ'].map(item => (
                                                <label key={item} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${formData.assistanceReceived.includes(item) ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-900 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                                    <input type="checkbox" checked={formData.assistanceReceived.includes(item)} onChange={() => toggleCheckbox('assistanceReceived', item)} className="w-4 h-4 accent-blue-600" />
                                                    <span className="text-xs font-bold">{item}</span>
                                                </label>
                                            ))}
                                        </div>
                                        {formData.assistanceReceived.includes('อื่นๆ') && (
                                            <input
                                                type="text"
                                                name="assistanceReceivedOther"
                                                value={formData.assistanceReceivedOther}
                                                onChange={handleInputChange}
                                                placeholder="โปรดระบุความช่วยเหลืออื่นๆ..."
                                                className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm"
                                            />
                                        )}
                                    </div>
                                    <div className="lg:col-span-2 space-y-2">
                                        <Label>5.8 ข้อห่วงใยของผู้ปกครองที่มีต่อนักเรียน</Label>
                                        <textarea name="parentConcerns" value={formData.parentConcerns} onChange={handleInputChange} className="w-full px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold min-h-[100px] text-sm" placeholder="ระบุรายละเอียด หากไม่มีให้เว้นว่าง" />
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 2: { // Step 3: Risk Assessment
                const riskGroups = [
                    { id: 'healthRisk', label: '6.1 สุขภาพ', color: 'blue', options: ['ร่างกายไม่แข็งแรง', 'มีโรคประจำตัวหรือเจ็บป่วยบ่อย', 'มีภาวะทุพโภชนาการ', 'ป่วยเป็นโรคร้ายแรง/เรื้อรัง', 'สมรรถภาพร่างกายต่ำ'] },
                    { id: 'welfareRisk', label: '6.2 สวัสดิการหรือความปลอดภัย', color: 'blue', options: ['พ่อแม่แยกทางกันหรือแต่งงานใหม่', 'เล่นการพนัน', 'มีบุคคลในครอบครัวเจ็บป่วยด้วยโรคร้ายแรง/เรื้อรัง/ติดต่อ', 'บุคคลในครอบครัวติดสารเสพติด', 'บุคคลในครอบครัวเล่นการพนัน', 'มีความขัดแย้ง/ทะเลาะกันในครอบครัว', 'ความขัดแย้งและมีการใช้ความรุนแรงในครอบครัว', 'ไม่มีผู้ดูแล', 'ถูกทารุณ/ทำร้ายจากบุคคลในครอบครัว/เพื่อนบ้าน', 'ถูกล่วงละเมิดทางเพศ'] },
                    { id: 'studentResponsibilities', label: '6.4 ภาระงานความรับผิดชอบของนักเรียนที่มีต่อครอบครัว', color: 'blue', options: ['ช่วยงานบ้าน', 'ช่วยดูแลคนเจ็บป่วย/พิการ', 'ช่วยค้าขายเล็กๆน้อยๆ', 'ทำงานแถวบ้าน', 'ช่วยงานในนาไร่', 'อื่นๆ'] },
                    { id: 'studentHobbies', label: '6.5 กิจกรรมยามว่างหรืองานอดิเรก', color: 'blue', options: ['ดูทีวี / ฟังเพลง', 'ไปเที่ยวห้าง / ดูหนัง', 'อ่านหนังสือ', 'ไปหาเพื่อน / เพื่อน', 'แว้น / สก๊อย', 'เล่นเกม คอม / มือถือ', 'ไปสวนสาธารณะ', 'ไปร้านสนุกเกอร์', 'อื่นๆ'] },
                    { id: 'drugRisk', label: '6.6 พฤติกรรมการใช้สารเสพติด', color: 'blue', options: ['คบเพื่อนในกลุ่มที่ใช้สารเสพติด', 'สมาชิกในครอบครัวข้องเกี่ยวกับยาเสพติด', 'อยู่ในสภาพแวดล้อมที่ใช้สารเสพติด', 'ปัจจุบันเกี่ยวข้องกับสารเสพติด', 'เป็นผู้ติดบุหรี่ สุรา หรือการใช้สารเสพติดอื่นๆ'] },
                    { id: 'violenceRisk', label: '6.7 พฤติกรรมการใช้ความรุนแรง', color: 'blue', options: ['มีการทะเลาะวิวาท', 'ก้าวร้าว เกเร', 'ทะเลาะวิวาทเป็นประจำ', 'ทำร้ายร่างกายผู้อื่น', 'ทำร้ายร่างกายตนเอง'] },
                    { id: 'sexualRisk', label: '6.8 พฤติกรรมทางเพศ', color: 'blue', options: ['อยู่ในกลุ่มขายบริการ', 'ใช้เครื่องมือสื่อสารที่เกี่ยวข้องกับด้านเพศเป็นเวลานานและบ่อยครั้ง', 'ตั้งครรภ์', 'ขายบริการทางเพศ', 'หมกมุ่นในการใช้เครื่องมือสื่อสารที่เกี่ยวข้องทางเพศ', 'มีการมั่วสุมทางเพศ'] },
                    { id: 'gameRisk', label: '6.9 การติดเกม', color: 'blue', options: ['เล่นเกมเกินวันละ 1 ชั่วโมง', 'ขาดจินตนาการและความคิดสร้างสรรค์', 'เก็บตัว แยกตัวจากกลุ่มเพื่อน', 'ใช้จ่ายเงินผิดปกติ', 'อยู่ในกลุ่มเพื่อนเล่นเกม', 'ร้านเกมอยู่ใกล้บ้านหรือโรงเรียน', 'ใช้เวลาเล่นเกมเกิน 2 ชั่วโมง', 'หมกมุ่น จริงจังในการเล่นเกม', 'ใช้เงินสิ้นเปลือง โกหก ลักขโมยเงินเพื่อเล่นเกม', 'อื่นๆ'] },
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

                            {/* Special Radio Sections for 6.10 and 6.11 */}
                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-5">
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                        <Activity size={16} className="text-blue-600" /> 6.10 การเข้าถึงสื่อคอมพิวเตอร์และอินเทอร์เน็ตที่บ้าน
                                    </h4>
                                    <div className="space-y-2">
                                        {[
                                            'สามารถเข้าถึง Internet ได้จากที่บ้าน',
                                            'ไม่สามารถเข้าถึง Internet ได้จากที่บ้าน'
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
                                        <Activity size={16} className="text-blue-600" /> 6.11 การใช้เครื่องมือสื่อสารอิเล็กทรอนิกส์
                                    </h4>
                                    <div className="space-y-2">
                                        {[
                                            'เคยใช้โทรศัพท์มือถือในระหว่างการเรียน',
                                            'เข้าใช้ line, Facebook, twitter หรือ chat (เกินวันละ 1 ชั่วโมง)',
                                            'ใช้โทรศัพท์มือถือในระหว่างเรียน 2 - 3/วัน',
                                            'เข้าใช้ line, Facebook, twitter หรือ chat (เกินวันละ 2 ชั่วโมง)'
                                        ].map(opt => (
                                            <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                                ${formData.electronicUsage.includes(opt)
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                    : 'bg-slate-50 dark:bg-slate-900/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                                <input type="checkbox" checked={formData.electronicUsage.includes(opt)} onChange={() => toggleCheckbox('electronicUsage', opt)} className="w-4 h-4 rounded accent-blue-600" />
                                                <span className="text-xs font-bold">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                                <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                    <User size={16} className="text-blue-600" /> ผู้ให้ข้อมูลนักเรียน
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                                    {['บิดา', 'มารดา', 'พี่ชาย', 'พี่สาว', 'น้า', 'อา', 'ป้า', 'ลุง', 'ปู่', 'ย่า', 'ตา', 'ยาย', 'ทวด', 'พ่อเลี้ยง', 'แม่เลี้ยง'].map(item => (
                                        <label key={item} className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-all ${
                                            formData.informantRelationship === item
                                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                                : 'bg-slate-50 dark:bg-slate-900/50 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                                        }`}>
                                            <input
                                                type="radio"
                                                checked={formData.informantRelationship === item}
                                                onChange={() => setFormData(prev => ({ ...prev, informantRelationship: item }))}
                                                className="w-4 h-4 accent-blue-600"
                                            />
                                            <span className="text-xs font-bold">{item}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
            case 3: // Step 4: GPS & Photos
                return (
                    <div className="space-y-5 sm:space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-8">
                            {/* GPS Card */}
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 lg:p-6 shadow-sm space-y-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
                                            <MapPin size={24} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">ตำแหน่งบ้านนักเรียน</p>
                                            <h4 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">พิกัดสำหรับการเยี่ยมบ้าน</h4>
                                            <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 leading-relaxed mt-1">ใช้พิกัดจากอุปกรณ์ขณะอยู่บริเวณบ้านนักเรียน</p>
                                        </div>
                                    </div>
                                    <div className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black ${
                                        gps
                                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                    }`}>
                                        <span className={`w-2 h-2 rounded-full ${gps ? "bg-emerald-500" : "bg-slate-400"}`} />
                                        {gps ? "มีพิกัดแล้ว" : "ยังไม่มีพิกัด"}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 p-4">
                                        <p className="text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-500">ละติจูด</p>
                                        <p className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white break-all">{gps ? gps.lat.toFixed(6) : "--.------"}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 p-4">
                                        <p className="text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-500">ลองจิจูด</p>
                                        <p className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white break-all">{gps ? gps.lng.toFixed(6) : "--.------"}</p>
                                    </div>
                                </div>

                                <div>
                                    <button
                                        onClick={getCurrentLocation}
                                        disabled={gettingGps}
                                        className="w-full h-12 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm shadow-blue-500/20 transition-all hover:bg-blue-700 disabled:opacity-50 active:scale-[0.99] flex items-center justify-center gap-2.5"
                                    >
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                                            {gettingGps ? <Loader2 className="animate-spin" size={16} /> : <Navigation size={16} />}
                                        </span>
                                        <span>{gps ? "อัปเดตพิกัด" : "ดึงพิกัดปัจจุบัน"}</span>
                                    </button>
                                </div>

                                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 px-4 py-3">
                                    <p className="text-xs font-bold leading-relaxed text-amber-800 dark:text-amber-200">
                                        ควรกดดึงพิกัดเมื่ออยู่หน้าบ้านหรือบริเวณที่พักจริง เพื่อให้ข้อมูลในรายงานแม่นยำที่สุด
                                    </p>
                                </div>
                            </div>

                            {/* Photo Upload Section */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 lg:p-8 space-y-5 sm:space-y-6 flex flex-col">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                    <div className="space-y-1">
                                        <h4 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                            <Camera size={20} className="text-blue-600" /> ภาพถ่ายขณะเยี่ยมบ้าน
                                        </h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold italic">* ถ่ายภาพนักเรียนร่วมกับครูและผู้ดูแล</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto sm:min-w-[280px]">
                                        <PhotoActionButton label="ถ่ายภาพ" mode="camera" onChange={(e) => handlePhotoChange(e, 'external')} />
                                        <PhotoActionButton label="อัปโหลด" mode="upload" multiple onChange={(e) => handlePhotoChange(e, 'external')} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-grow min-h-[200px]">
                                    {previewsExternal.map((p, idx) => (
                                        <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 group">
                                            <img src={p} className="w-full h-full object-cover" alt="Home Visit" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPhotosExternal(prev => prev.filter((_, i) => i !== idx));
                                                    setPreviewsExternal(prev => prev.filter((_, i) => i !== idx));
                                                }}
                                                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all shadow-lg"
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
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 lg:p-6 space-y-5 sm:space-y-8">
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
                                    <SinglePhotoField
                                        title="ภาพถ่ายเห็นหลังคาบ้าน"
                                        hint="ลักษณะภายนอกของบ้าน เลือกถ่ายจากกล้องหรืออัปโหลดจากเครื่องได้"
                                        preview={exteriorPreview}
                                        type="exterior"
                                        icon={Home}
                                        onClear={() => { setExteriorPhoto(null); setExteriorPreview(null); }}
                                    />
                                    <SinglePhotoField
                                        title="ภาพถ่ายเห็นข้างในบ้าน"
                                        hint="สภาพความเป็นอยู่ภายในบ้าน เลือกถ่ายจากกล้องหรืออัปโหลดจากเครื่องได้"
                                        preview={interiorPreview}
                                        type="interior"
                                        icon={Eye}
                                        onClear={() => { setInteriorPhoto(null); setInteriorPreview(null); }}
                                    />
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
                                    <div className="max-w-md mx-auto text-left">
                                        <SinglePhotoField
                                            title="ภาพนักเรียนกับป้ายโรงเรียน"
                                            hint="ใช้แทนภาพบ้านเมื่อไม่ได้รับอนุญาตให้ถ่ายภาพบริเวณบ้าน"
                                            preview={schoolSignPreview}
                                            type="schoolSign"
                                            icon={Save}
                                            onClear={() => { setSchoolSignPhoto(null); setSchoolSignPreview(null); }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-8 border-t border-slate-100 dark:border-white/5">
                            <SinglePhotoField
                                title="แผนที่สังเขป"
                                hint="ไม่บังคับ สามารถถ่ายภาพแผนที่ที่วาดไว้หรืออัปโหลดภาพจากเครื่อง"
                                preview={sketchMapPreview}
                                type="sketchMap"
                                icon={Map}
                                onClear={() => { setSketchMapPhoto(null); setSketchMapPreview(null); }}
                                accent="indigo"
                            />
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-5">
                            <div className="space-y-1">
                                <h4 className="text-sm font-black text-slate-800 dark:text-white">คำรับรองข้อมูลและภาพถ่ายบ้านของนักเรียน</h4>
                                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">ส่วนนี้จะลงในกรอบคำรับรองท้ายหน้า 4 ของ PDF</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>ตำแหน่งผู้รับรอง</Label>
                                    <input type="text" name="teacherPosition" value={formData.teacherPosition} onChange={handleInputChange} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" placeholder="ครู / ผู้อำนวยการโรงเรียน" />
                                </div>
                                <div className="space-y-2">
                                    <Label>หมายเหตุเพิ่มเติมจากครูผู้เยี่ยม</Label>
                                    <input type="text" name="teacherComments" value={formData.teacherComments} onChange={handleInputChange} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" placeholder="หากไม่มีให้เว้นว่าง" />
                                </div>
                            </div>
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
                                    <Label>5.7 ความช่วยเหลือที่ครอบครัวเคยได้รับจากหน่วยงานหรือต้องการได้รับการช่วยเหลือ</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        {['เบี้ยผู้สูงอายุ', 'เบี้ยพิการ', 'อื่นๆ'].map(item => (
                                            <label key={item} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${formData.assistanceReceived.includes(item) ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-900 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                                <input type="checkbox" checked={formData.assistanceReceived.includes(item)} onChange={() => toggleCheckbox('assistanceReceived', item)} className="w-4 h-4 accent-blue-600" />
                                                <span className="text-xs font-bold">{item}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {formData.assistanceReceived.includes('อื่นๆ') && (
                                        <input
                                            type="text"
                                            name="assistanceReceivedOther"
                                            value={formData.assistanceReceivedOther}
                                            onChange={handleInputChange}
                                            placeholder="โปรดระบุความช่วยเหลืออื่นๆ..."
                                            className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm"
                                        />
                                    )}
                                </div>
                                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <Label>ระดับความจำเป็นในการช่วยเหลือ (ใช้ในรายงานสรุป)</Label>
                                    <RadioGroup name="assistanceHistory" options={["มากที่สุด", "มาก", "ปานกลาง", "น้อย", "ไม่จำเป็น"]} value={formData.assistanceHistory} onChange={handleInputChange} />
                                </div>
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>ผู้ให้ข้อมูลนักเรียน</Label>
                                            <input type="text" name="informantRelationship" value={formData.informantRelationship} onChange={handleInputChange} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" placeholder="เช่น บิดา, มารดา, ยาย" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>ตำแหน่งผู้รับรองภาพถ่ายบ้าน</Label>
                                            <input type="text" name="teacherPosition" value={formData.teacherPosition} onChange={handleInputChange} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" placeholder="ครู / ผู้อำนวยการโรงเรียน" />
                                        </div>
                                    </div>
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
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-500">
                <div className="max-w-[1500px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
                    {/* Header Banner - Professional & Clean */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl lg:rounded-[1.75rem] shadow-sm border border-slate-200 dark:border-slate-800 p-4 sm:p-5 lg:p-6 mb-4 sm:mb-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 lg:gap-6">
                            <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                                <ProfileAvatar
                                    src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName}+${student?.lastName}&background=1e40af&color=fff`}
                                    className="w-12 h-12 sm:w-16 sm:h-16 border border-slate-100 dark:border-slate-800 shadow-sm bg-slate-50 shrink-0"
                                    alt="profile"
                                />
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
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
                                    <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white truncate">
                                        {student ? `${student.title}${student.firstName} ${student.lastName}` : "กำลังโหลดข้อมูล..."}
                                    </h1>
                                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold truncate">
                                        เลขประจำตัว: {student?.studentId} • ชั้น {student?.classLevel}/{student?.room}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap md:flex-nowrap gap-3 w-full md:w-auto">
                                <div className="text-left md:text-right hidden sm:block flex-1 md:flex-none">
                                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">ปีการศึกษา</p>
                                    <p className="text-lg font-black text-slate-700 dark:text-slate-200">{formData.academicYear} / ภาคเรียนที่ {formData.semester}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {previousVisit && (
                        <div className="mb-6 bg-gradient-to-r from-blue-600/10 via-emerald-600/5 to-indigo-600/10 dark:from-blue-500/20 dark:via-emerald-500/10 dark:to-indigo-500/20 p-5 rounded-2xl border border-blue-200/60 dark:border-blue-800/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm backdrop-blur-md">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-500/20">
                                    <RefreshCw size={24} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">มีข้อมูลการเยี่ยมบ้านครั้งก่อน</h4>
                                    <p className="text-xs text-blue-750 dark:text-blue-400 font-bold">
                                        {getCopyBadgeText()}
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                        คุณสามารถคัดลอกข้อมูลประวัติครอบครัว ความเสี่ยง และลักษณะบ้านจากประวัติการเยี่ยมล่าสุดมาใส่ในฟอร์มนี้ได้ทันทีเพื่อความสะดวกรวดเร็ว
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyPreviousVisit}
                                className="w-full md:w-auto px-5 py-3 rounded-xl bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
                            >
                                <RefreshCw size={16} />
                                ดึงข้อมูลเดิมมาใช้งาน
                            </button>
                        </div>
                    )}

                    {/* Main Form Container */}
                    <div className="space-y-4 lg:space-y-5">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-3 sm:p-4">
                            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                                <div className="flex items-center gap-3 lg:w-52 shrink-0">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                                        <CurrentStepIcon size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">ความคืบหน้า</p>
                                            <p className="text-sm font-black text-slate-900 dark:text-white">{progressPercent}%</p>
                                        </div>
                                        <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                            <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                                        </div>
                                    </div>
                                </div>

                                <nav className="flex-1 min-w-0 flex gap-2 overflow-x-auto custom-scrollbar snap-x pb-1 lg:pb-0">
                                {steps.map((s, idx) => {
                                    const Icon = s.icon;
                                    const active = idx === currentStep;
                                    const done = idx < currentStep;
                                    return (
                                        <button
                                            key={s.title}
                                            type="button"
                                            onClick={() => setCurrentStep(idx)}
                                            className={`min-w-[168px] sm:min-w-[190px] lg:min-w-[150px] xl:min-w-0 xl:flex-1 text-left flex items-start gap-2.5 p-3 rounded-xl transition-all snap-start ${
                                                active
                                                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                                                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                            }`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                                active
                                                    ? "bg-white/15 text-white"
                                                    : done
                                                        ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300"
                                                        : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                            }`}>
                                                {done ? <Check size={15} /> : <Icon size={16} />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className={`text-sm font-black ${active ? "text-white" : "text-slate-800 dark:text-slate-200"}`}>{idx + 1}. {s.title}</p>
                                                <p className={`hidden sm:block text-[11px] font-bold leading-snug mt-0.5 ${active ? "text-blue-100" : "text-slate-400 dark:text-slate-500"}`}>{s.desc}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                                </nav>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-2xl lg:rounded-[1.75rem] shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-w-0">
                            <div className="px-4 sm:px-5 md:px-8 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                                            <CurrentStepIcon size={22} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">ขั้นตอนที่ {currentStep + 1} จาก {steps.length}</p>
                                            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">{steps[currentStep].title}</h2>
                                            <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 mt-1">{steps[currentStep].desc}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {steps.map((_, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => setCurrentStep(i)}
                                                className={`h-2 rounded-full transition-all ${i === currentStep ? "w-8 bg-blue-600" : i < currentStep ? "w-4 bg-emerald-500" : "w-2 bg-slate-300 dark:bg-slate-700"}`}
                                                aria-label={`ไปขั้นตอนที่ ${i + 1}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 sm:p-5 md:p-8 min-h-[500px]">
                                {renderStepContent()}
                            </div>

                            <div className="sticky bottom-0 z-20 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-4 sm:px-5 md:px-8 py-3 sm:py-5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                                <button
                                    onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                                    disabled={currentStep === 0}
                                    className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all ${
                                        currentStep === 0
                                            ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400"
                                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm"
                                    }`}
                                >
                                    <ChevronLeft size={16} /> ย้อนกลับ
                                </button>

                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        type="button"
                                        onClick={() => navigate(-1)}
                                        className="flex items-center justify-center px-5 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-500 dark:text-slate-400 hover:text-rose-500 transition-all text-sm"
                                    >
                                        ยกเลิก
                                    </button>
                                    {currentStep < steps.length - 1 ? (
                                        <button
                                            onClick={() => setCurrentStep(prev => Math.min(steps.length - 1, prev + 1))}
                                            className="flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
                                        >
                                            ขั้นตอนถัดไป <ChevronRight size={16} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleSubmit}
                                            disabled={submitting}
                                            className="flex items-center justify-center gap-3 px-8 py-3 bg-blue-600 text-white rounded-xl font-black text-sm shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-60 transition-all active:scale-95"
                                        >
                                            {submitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                                            บันทึกข้อมูลการเยี่ยมบ้าน
                                        </button>
                                    )}
                                </div>
                            </div>
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
