import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  signOut,
  signInAnonymously,
} from "firebase/auth";
import { auth, firestore } from "../../firebase";
import { collection, collectionGroup, query, where, getDocs, orderBy, doc, getDoc, limit } from "firebase/firestore";
import { ToastContainer, toast } from "react-toastify";
import ToastContent from "../../components/ToastContent";
import { showFirebaseError } from "../../utils/showFirebaseError";
import { FaBookOpen, FaUserTie, FaUserGraduate, FaIdCard, FaLock, FaEnvelope, FaArrowRight, FaCheckCircle, FaPhone, FaUsers } from "react-icons/fa";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginType, setLoginType] = useState<'teacher' | 'student' | 'parent'>('teacher');
  const [studentId, setStudentId] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentNationalId, setParentNationalId] = useState("");
  const [schools, setSchools] = useState<{ id: string; schoolName: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tenantSchool, setTenantSchool] = useState<{ id: string; schoolName: string; logoUrl?: string } | null>(null);

  // เพิ่ม useEffect เพื่อตรวจสอบการล็อกอินของนักเรียนค้างไว้
  // ตรวจสอบ Tenant (โรงเรียน) จาก Slug
  useEffect(() => {
    const fetchTenantData = async () => {
      const tenantId = localStorage.getItem('tenant_school_id');
      if (tenantId) {
        try {
          const docRef = doc(firestore, "school-settings", tenantId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setTenantSchool({ id: docSnap.id, ...docSnap.data() } as any);
          }
        } catch (error) {
          console.error("Error fetching tenant info:", error);
        }
      }
    };
    fetchTenantData();

    // เช็ค session นักเรียน
    const studentSessionRaw = localStorage.getItem('studentSession');
    const userType = localStorage.getItem('currentUserType');

    if (userType === 'student' && studentSessionRaw) {
      try {
        const { schoolId, studentId } = JSON.parse(studentSessionRaw);
        if (schoolId && studentId) {
          navigate(`/school/${schoolId}/students/view/${studentId}`, { replace: true });
        }
      } catch (e) {
        localStorage.removeItem('studentSession');
        localStorage.removeItem('currentUserType');
      }
    }
  }, [navigate]);

  // ดึงรายชื่อโรงเรียนมาแสดงใน Dropdown
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const q = query(collection(firestore, "school-settings"), orderBy("schoolName"));
        const snapshot = await getDocs(q);
        setSchools(snapshot.docs.map((doc) => ({ id: doc.id, schoolName: doc.data().schoolName })));
      } catch (error) {
        console.error("Error fetching schools:", error);
      }
    };
    fetchSchools();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.warn(
        <ToastContent title="ข้อมูลไม่ครบ" message="กรุณากรอกอีเมลและรหัสผ่าน" />
      );
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 1. ตรวจสอบจากคอลเลกชัน 'users' โดยตรง (รวดเร็วและไม่ต้องใช้ index พิเศษ)
      const userDoc = await getDoc(doc(firestore, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const roles = Array.isArray(userData.role) ? userData.role : [userData.role];
        if (isAttendanceEntryOnly(roles)) {
          navigate("/attendance/checkin-out", { replace: true });
          return;
        }

        const isStaff = roles.some((r: any) => 
          ['teacher', 'school_admin', 'academic_admin', 'super_admin', 'owner'].includes(r)
        );
        
        if (isStaff) {
          navigate("/home", { state: { fromLogin: true }, replace: true });
          return;
        }
      }

      // 2. Fallback: กรณีข้อมูลเก่าที่อาจจะไม่มีใน 'users' แต่มีใน 'teachers'
      const teachersQuery = query(
        collectionGroup(firestore, 'teachers'), 
        where('uid', '==', user.uid),
        limit(1)
      );
      const teacherSnapshots = await getDocs(teachersQuery);

      if (teacherSnapshots.empty) {
        // ถ้าไม่พบข้อมูลครู ให้ sign out และแจ้งเตือน
        await signOut(auth);
        toast.error(<ToastContent title="ไม่มีสิทธิ์เข้าใช้งาน" message="บัญชีของคุณไม่ได้รับอนุญาตให้เข้าสู่ระบบในส่วนนี้" />);
        return;
      }

      navigate("/home", { state: { fromLogin: true }, replace: true });
    } catch (error: any) {
      console.error(error);
      showFirebaseError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nationalId || !studentId) {
      toast.warn(
        <ToastContent title="ข้อมูลไม่ครบ" message="กรุณากรอกข้อมูลให้ครบถ้วน" />
      );
      return;
    }

    if (schools.length === 0) {
      toast.error(<ToastContent title="ระบบขัดข้อง" message="ไม่สามารถดึงข้อมูลโรงเรียนได้ กรุณารีเฟรชหน้าเว็บ" />);
      return;
    }

    setIsLoading(true);
    try {
      // ลบขีดหรือเว้นวรรคออกจากเลขบัตรประชาชนเพื่อให้ตรงกับในฐานข้อมูล (เช่น 1-2345... -> 12345...)
      const cleanNationalId = nationalId.replace(/[^0-9]/g, "");

      let foundStudent: any = null;
      let foundSchoolId = "";

      // --- 1. ลองใช้ Lookup Table ก่อนเพื่อประหยัดการอ่าน (Direct Lookup) ---
      try {
        const { generateStudentLookupKey } = await import("../../utils/studentLookupUtils");
        const lookupKey = await generateStudentLookupKey(cleanNationalId, studentId);
        const lookupRef = doc(firestore, "student-lookups", lookupKey);
        const lookupSnap = await getDoc(lookupRef);

        if (lookupSnap.exists()) {
          const { schoolId: lSchoolId, studentDocId } = lookupSnap.data();
          const studentRef = doc(firestore, "school-settings", lSchoolId, "students", studentDocId);
          const studentSnap = await getDoc(studentRef);

          if (studentSnap.exists()) {
            foundStudent = { id: studentSnap.id, ...studentSnap.data() };
            foundSchoolId = lSchoolId;
            console.log("Login via lookup table success");
          }
        }
      } catch (err) {
        console.warn("Lookup failed, falling back to legacy search:", err);
      }

      // --- 2. Fallback: วนลูปค้นหาในทุกโรงเรียน (กรณีข้อมูลเก่ายังไม่มีใน Lookup) ---
      if (!foundStudent) {
        for (const school of schools) {
          const q = query(collection(firestore, 'school-settings', school.id, 'students'), where('idCardNumber', '==', cleanNationalId));
          const querySnapshot = await getDocs(q);

          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.studentId === studentId) {
              foundStudent = { id: doc.id, ...data };
              foundSchoolId = school.id;
            }
          });

          if (foundStudent) {
            // อัปเดตข้อมูลลงใน Lookup Table อัตโนมัติสำหรับครั้งหน้า
            try {
              const { updateStudentLookup } = await import("../../utils/studentLookupUtils");
              await updateStudentLookup(cleanNationalId, studentId, foundSchoolId, foundStudent.id);
            } catch (updErr) {
              console.warn("Failed to update lookup table:", updErr);
            }
            break;
          }
        }
      }

      if (foundStudent) {
        try { await signInAnonymously(auth); } catch (_) {}
        localStorage.setItem('currentUserType', 'student');
        localStorage.setItem('studentSession', JSON.stringify({
          schoolId: foundSchoolId,
          studentId: foundStudent.id
        }));
        toast.success(
          <ToastContent title="เข้าสู่ระบบสำเร็จ" message={`ยินดีต้อนรับ ${foundStudent.title || ''}${foundStudent.firstName} ${foundStudent.lastName}`} />,
          {
            autoClose: 1500,
            onClose: () => navigate(`/school/${foundSchoolId}/students/view/${foundStudent.id}`, { replace: true })
          }
        );
      } else {
        toast.error(<ToastContent title="ไม่พบข้อมูล" message="เลขบัตรประชาชนหรือรหัสนักเรียนไม่ถูกต้อง" />);
      }
    } catch (error: any) {
      console.error(error);
      showFirebaseError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleParentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = parentPhone.replace(/[^0-9]/g, '');
    const cleanNationalId = parentNationalId.replace(/[^0-9]/g, '');

    if (!cleanPhone || !cleanNationalId) {
      toast.warn(<ToastContent title="ข้อมูลไม่ครบ" message="กรุณากรอกเบอร์โทรและเลขบัตรประชาชน" />);
      return;
    }
    if (cleanNationalId.length !== 13) {
      toast.warn(<ToastContent title="เลขบัตรไม่ถูกต้อง" message="กรุณากรอกเลขบัตรประชาชน 13 หลัก" />);
      return;
    }

    setIsLoading(true);
    try {
      const foundChildren: any[] = [];
      const seenDocIds = new Set<string>();

      const addIfMatch = (docSnap: any, schoolId: string, idField: string) => {
        const data = docSnap.data();
        const storedId = (data[idField] || '').replace(/[^0-9]/g, '');
        if (storedId === cleanNationalId && !seenDocIds.has(docSnap.id)) {
          seenDocIds.add(docSnap.id);
          foundChildren.push({
            schoolId,
            studentDocId: docSnap.id,
            name: `${data.title || ''}${data.firstName} ${data.lastName}`,
            classLevel: data.classLevel || '',
            room: data.room || '',
            profileImageUrl: data.profileImageUrl || '',
          });
        }
      };

      // ค้นหาแบบ school-by-school (เหมือน student login) เพื่อให้ผ่าน Firestore rules
      const schoolsToSearch = tenantSchool ? [{ id: tenantSchool.id }] : schools;
      for (const school of schoolsToSearch) {
        const studentsRef = collection(firestore, 'school-settings', school.id, 'students');
        const [snap1, snap2, snap3] = await Promise.all([
          getDocs(query(studentsRef, where('fatherPhone', '==', cleanPhone))),
          getDocs(query(studentsRef, where('motherPhone', '==', cleanPhone))),
          getDocs(query(studentsRef, where('guardianPhone', '==', cleanPhone))),
        ]);
        snap1.docs.forEach(d => addIfMatch(d, school.id, 'fatherIdNumber'));
        snap2.docs.forEach(d => addIfMatch(d, school.id, 'motherIdNumber'));
        snap3.docs.forEach(d => addIfMatch(d, school.id, 'guardianIdNumber'));
      }

      if (foundChildren.length === 0) {
        toast.error(<ToastContent title="ไม่พบข้อมูล" message="เบอร์โทรหรือเลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง" />);
        return;
      }

      try { await signInAnonymously(auth); } catch (_) {}
      localStorage.setItem('currentUserType', 'parent');
      localStorage.setItem('parentSession', JSON.stringify({ children: foundChildren }));

      const first = foundChildren[0];
      toast.success(
        <ToastContent title="เข้าสู่ระบบสำเร็จ" message={`ยินดีต้อนรับ พบบุตร/หลาน ${foundChildren.length} คน`} />,
        { autoClose: 1500, onClose: () => navigate(`/school/${first.schoolId}/students/view/${first.studentDocId}`, { replace: true }) }
      );
    } catch (error: any) {
      console.error(error);
      showFirebaseError(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200 dark:from-gray-900 dark:to-gray-800 p-2 sm:p-4 transition-colors duration-300">
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar />

      <div className="w-full max-w-5xl bg-white dark:bg-[#1f2937] rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row h-auto max-h-full lg:h-auto animate-fadeIn">

        {/* Left Side - Branding (Visible on Desktop) */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 to-blue-500 relative flex-col items-center justify-center p-12 text-white overflow-hidden">
          {/* Abstract Shapes */}
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-white blur-3xl"></div>
            <div className="absolute bottom-10 right-10 w-40 h-40 rounded-full bg-white blur-3xl"></div>
          </div>

          <div className="relative z-10 flex flex-col items-center text-center space-y-8">
            <div className="flex flex-col items-center">
              <div className="p-5 bg-white/20 backdrop-blur-md rounded-2xl shadow-xl mb-6 border border-white/30 transform hover:scale-105 transition-transform duration-300 min-w-[120px] min-h-[120px] flex items-center justify-center">
                {tenantSchool?.logoUrl ? (
                  <img src={tenantSchool.logoUrl} alt="Logo" className="w-20 h-20 object-contain drop-shadow-md" />
                ) : (
                  <FaBookOpen className="w-16 h-16 text-white" />
                )}
              </div>
              <h1 className="text-4xl lg:text-5xl font-black mb-1 tracking-tight text-white drop-shadow-md leading-tight px-4">
                {tenantSchool?.schoolName || "BMG Smart School"}
              </h1>
              {tenantSchool && <p className="text-indigo-100 text-lg font-medium tracking-wide">ยินดีต้อนรับเข้าสู่ระบบ</p>}
              {!tenantSchool && <p className="text-indigo-100 text-xl font-medium tracking-wide">ระบบบริหารสถานศึกษาอัจฉริยะ</p>}
              <div className="mt-3 inline-block px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full border border-white/10">
                <p className="text-indigo-200 text-[10px] font-semibold tracking-widest uppercase">
                  {tenantSchool ? "School Portal Access" : "Powered by BMG Smart School"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full max-w-sm px-4">
              {[
                "ใช้งานง่ายสำหรับครู",
                "เช็คชื่อรายคาบ",
                "จัดการกิจกรรมชุมนุม",
                "สรุปผลการเรียนอัตโนมัติ",
                "ลงเวลา มา-กลับ บุคลากร/นักเรียน",
                "ระบบเช็คแถว",
                "ระบบตารางสอน",
                "สรุปการมาเรียน"
              ].map((text, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/5 hover:bg-white/20 transition-all duration-200 group">
                  <div className="flex-shrink-0 group-hover:scale-110 transition-transform">
                    <FaCheckCircle className="text-emerald-400 text-sm" />
                  </div>
                  <p className="text-white text-[11px] font-medium text-left leading-tight">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-black/10 to-transparent"></div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 p-6 sm:p-8 lg:p-10 flex flex-col justify-center relative">
          {/* Mobile Logo (Visible only on Mobile) */}
          <div className="lg:hidden flex flex-col items-center mb-4 text-center">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-xl flex items-center justify-center mb-2 shadow-lg transform rotate-3">
              <FaBookOpen className="text-white text-2xl" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">BMG Smart School</h2>
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {tenantSchool ? "ลงชื่อเข้าใช้งาน" : "ยินดีต้อนรับ"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tenantSchool ? `เข้าใช้งานระบบ ${tenantSchool.schoolName}` : "กรุณาเลือกประเภทผู้ใช้งานเพื่อเข้าสู่ระบบ"}
            </p>
            {tenantSchool && (
              <button 
                onClick={() => {
                  localStorage.removeItem('tenant_school_id');
                  setTenantSchool(null);
                }}
                className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                ไม่ใช่องค์กรของคุณ? คลิกที่นี่เพื่อเปลี่ยน
              </button>
            )}
          </div>

          {/* Custom Tabs */}
          <div role="tablist" aria-label="ประเภทการเข้าสู่ระบบ" className="grid grid-cols-3 gap-2 mb-6">
            <button
              role="tab"
              aria-selected={loginType === 'teacher'}
              onClick={() => setLoginType('teacher')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${loginType === 'teacher'
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
            >
              <FaUserTie className="text-xl mb-1" aria-hidden="true" />
              <span className="font-semibold text-xs">สำหรับครู</span>
            </button>
            <button
              role="tab"
              aria-selected={loginType === 'student'}
              onClick={() => setLoginType('student')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${loginType === 'student'
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
            >
              <FaUserGraduate className="text-xl mb-1" aria-hidden="true" />
              <span className="font-semibold text-xs">นักเรียน</span>
            </button>
            <button
              role="tab"
              aria-selected={loginType === 'parent'}
              onClick={() => setLoginType('parent')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${loginType === 'parent'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
            >
              <FaUsers className="text-xl mb-1" aria-hidden="true" />
              <span className="font-semibold text-xs">ผู้ปกครอง</span>
            </button>
          </div>

          {/* Forms */}
          <div className="transition-all duration-300">
            {loginType === 'parent' ? (
              <form onSubmit={handleParentLogin} className="space-y-3 lg:space-y-4">
                <div className="space-y-1">
                  <label htmlFor="parent-phone" className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-1">ชื่อผู้ใช้</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FaPhone className="text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                      id="parent-phone"
                      type="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white text-sm"
                      placeholder="ชื่อผู้ใช้"
                      maxLength={10}
                      autoComplete="tel"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="parent-national-id" className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-1">รหัสผ่าน</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FaIdCard className="text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                      id="parent-national-id"
                      type="password"
                      value={parentNationalId}
                      onChange={(e) => setParentNationalId(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white text-sm"
                      placeholder="รหัสผ่าน"
                      maxLength={13}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {isLoading ? 'กำลังตรวจสอบ...' : (
                    <>
                      เข้าสู่ระบบผู้ปกครอง <FaArrowRight className="text-sm" />
                    </>
                  )}
                </button>
              </form>
            ) : loginType === 'teacher' ? (
              <form onSubmit={handleLogin} className="space-y-3 lg:space-y-4">
                <div className="space-y-1">
                  <label htmlFor="teacher-email" className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-1">ชื่อผู้ใช้</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FaEnvelope className="text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                      id="teacher-email"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white text-sm"
                      placeholder="ชื่อผู้ใช้"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center ml-1">
                    <label htmlFor="teacher-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">รหัสผ่าน</label>
                    <button
                      type="button"
                      onClick={() => navigate("/forgot-password")}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer bg-transparent border-0 p-0"
                    >
                      ลืมรหัสผ่าน?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FaLock className="text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                      id="teacher-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white text-sm"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {isLoading ? 'กำลังเข้าสู่ระบบ...' : (
                    <>
                      เข้าสู่ระบบ <FaArrowRight className="text-sm" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleStudentLogin} className="space-y-3 lg:space-y-4">
                <div className="space-y-1">
                  <label htmlFor="student-id" className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-1">ชื่อผู้ใช้</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FaUserGraduate className="text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                      id="student-id"
                      type="text"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white text-sm"
                      placeholder="ชื่อผู้ใช้"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="student-national-id" className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-1">รหัสผ่าน</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FaIdCard className="text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                      id="student-national-id"
                      type="password"
                      value={nationalId}
                      onChange={(e) => setNationalId(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white text-sm"
                      placeholder="รหัสผ่าน"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {isLoading ? 'กำลังตรวจสอบ...' : (
                    <>
                      เข้าสู่ระบบ <FaArrowRight className="text-sm" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Footer Text */}
          <div className="mt-4 lg:mt-6 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              &copy; 2025-{new Date().getFullYear()} BMG Smart School. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
