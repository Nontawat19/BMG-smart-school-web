import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { firestore } from '@/firebase';
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import liff from '@line/liff';
import Swal from 'sweetalert2';
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Users,
  Briefcase,
  Loader2,
  Phone,
  Link2,
  IdCard,
  Building2,
} from 'lucide-react';

interface SchoolData {
  id: string;
  schoolName: string;
  liffId?: string;
}

const findLineOASettingsLiffId = (lineOASettings: any) => {
  if (!lineOASettings || typeof lineOASettings !== 'object') return '';
  return Object.values(lineOASettings)
    .map((config: any) => config?.liffId)
    .find((value) => typeof value === 'string' && value.trim()) as string | undefined || '';
};

const LineRegisterPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'parent' | 'teacher'>('parent');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');

  // LINE Profile & LIFF State
  const [liffError, setLiffError] = useState<string | null>(null);
  const [lineUser, setLineUser] = useState<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
  } | null>(null);

  // Manual fallback for developer/testing
  const [manualLineUserId, setManualLineUserId] = useState('');
  const [isManualMode, setIsManualMode] = useState(false);

  // Parent form fields
  const [studentId, setStudentId] = useState('');
  const [studentIdCard, setStudentIdCard] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentRelationship, setParentRelationship] = useState('พ่อ');

  // Teacher form fields
  const [teacherId, setTeacherId] = useState('');
  const [teacherIdCard, setTeacherIdCard] = useState('');

  // Initial LIFF school resolution. The user no longer selects a school;
  // school identity is resolved from the matched student/teacher record.
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const urlSchoolId = searchParams.get('schoolId') || searchParams.get('s');
        
        // Load school settings only to resolve the LIFF ID; the form itself does not show a school selector.
        const schoolColl = collection(firestore, 'school-settings');
        const snap = await getDocs(schoolColl);
        const schoolList: SchoolData[] = await Promise.all(snap.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let liffId =
            data.lineOASettings?.school?.liffId ||
            data.lineOASettings?.classroom?.liffId ||
            findLineOASettingsLiffId(data.lineOASettings);

          if (!liffId) {
            const teacherSnap = await getDocs(collection(firestore, 'school-settings', docSnap.id, 'teachers'));
            liffId = teacherSnap.docs
              .map((teacherDoc) => teacherDoc.data()?.liffId)
              .find((value) => typeof value === 'string' && value.trim()) || '';
          }

          return {
            id: docSnap.id,
            schoolName: data.schoolName || 'โรงเรียนนิรนาม',
            liffId,
          };
        }));

        setSchools(schoolList);

        if (urlSchoolId) {
          const matched = schoolList.find((s) => s.id === urlSchoolId);
          if (matched) {
            setSelectedSchoolId(matched.id);
          }
        } else {
          const schoolsWithLiff = schoolList.filter((s) => Boolean(s.liffId));
          if (schoolsWithLiff.length === 1) {
            setSelectedSchoolId(schoolsWithLiff[0].id);
          } else {
            setIsManualMode(true);
            setLiffError('กรุณาเปิดลิงก์ลงทะเบียนจาก LINE OA ของโรงเรียน เพื่อยืนยันตัวตน LINE อัตโนมัติ');
          }
        }
      } catch (err: any) {
        console.error('Error fetching schools:', err);
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: 'ไม่สามารถโหลดข้อมูลโรงเรียนได้',
          background: '#2a2b2f',
          color: '#ffffff',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSchools();
  }, [searchParams]);

  // Handle LIFF initialization based on selected school configuration
  useEffect(() => {
    if (!selectedSchoolId) {
      setLineUser(null);
      setLoading(false);
      return;
    }

    const initLiff = async () => {
      setLoading(true);
      setLiffError(null);
      setLineUser(null);

      // Find the liffId for the selected school
      const school = schools.find((s) => s.id === selectedSchoolId);
      if (!school) {
        setLiffError('ไม่พบข้อมูลโรงเรียนที่เลือก');
        setLoading(false);
        return;
      }
      if (!school.liffId) {
        setLiffError('โรงเรียนนี้ยังไม่ได้ตั้งค่า LINE LIFF ID ในระบบ');
        setIsManualMode(true);
        setLoading(false);
        return;
      }

      try {
        console.log(`Initializing LIFF with ID: ${school.liffId}`);
        await liff.init({ liffId: school.liffId });

        if (!liff.isLoggedIn()) {
          console.log('User not logged in to LIFF, redirecting to login...');
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        setLineUser({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });
        setIsManualMode(false);
      } catch (err: any) {
        console.error('LIFF Initialization Error:', err);
        setLiffError(
          `ไม่สามารถเชื่อมต่อ LINE LIFF ได้ (${err.message || err}). ระบบจะให้ระบุ LINE User ID เองเพื่อการทดสอบ`
        );
        setIsManualMode(true);
      } finally {
        setLoading(false);
      }
    };

    initLiff();
  }, [selectedSchoolId, schools]);

  const activeUserId = (isManualMode ? manualLineUserId : lineUser?.userId)?.trim();

  const digitsOnly = (value: string) => value.replace(/\D/g, '');

  const getSchoolIdFromSnapshot = (docPath: string) => {
    const parts = docPath.split('/');
    const schoolSettingsIndex = parts.indexOf('school-settings');
    return schoolSettingsIndex >= 0 ? parts[schoolSettingsIndex + 1] : '';
  };

  const getResolvedSchool = async (schoolId: string) => {
    const cached = schools.find((school) => school.id === schoolId);
    if (cached) return cached;

    const schoolSnap = await getDoc(doc(firestore, 'school-settings', schoolId));
    if (!schoolSnap.exists()) {
      return { id: schoolId, schoolName: 'ไม่พบชื่อโรงเรียน' };
    }

    const data = schoolSnap.data();
    let liffId =
      data.lineOASettings?.school?.liffId ||
      data.lineOASettings?.classroom?.liffId ||
      findLineOASettingsLiffId(data.lineOASettings);

    if (!liffId) {
      const teacherSnap = await getDocs(collection(firestore, 'school-settings', schoolId, 'teachers'));
      liffId = teacherSnap.docs
        .map((teacherDoc) => teacherDoc.data()?.liffId)
        .find((value) => typeof value === 'string' && value.trim()) || '';
    }

    return {
      id: schoolId,
      schoolName: data.schoolName || 'ไม่ระบุชื่อโรงเรียน',
      liffId,
    };
  };

  const handleParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'กรุณาเข้าสู่ระบบด้วย LINE หรือกรอก LINE User ID สำหรับทดสอบ',
        background: '#2a2b2f',
        color: '#ffffff',
      });
      return;
    }
    const normalizedStudentId = studentId.trim();
    const normalizedIdCard = digitsOnly(studentIdCard);

    if (!normalizedStudentId || !normalizedIdCard || !parentRelationship) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วน', background: '#2a2b2f', color: '#ffffff' });
      return;
    }
    if (normalizedIdCard.length !== 13) {
      Swal.fire({ icon: 'warning', title: 'เลขบัตรไม่ถูกต้อง', text: 'กรุณากรอกเลขประจำตัวประชาชนนักเรียน 13 หลัก', background: '#2a2b2f', color: '#ffffff' });
      return;
    }

    setSubmitting(true);
    try {
      const studentsRef = selectedSchoolId
        ? collection(firestore, 'school-settings', selectedSchoolId, 'students')
        : collectionGroup(firestore, 'students');
      const q = query(studentsRef, where('studentId', '==', normalizedStudentId));
      let querySnap = await getDocs(q);

      if (querySnap.empty && normalizedStudentId.length === 4) {
        querySnap = await getDocs(query(studentsRef, where('studentId', '==', `0${normalizedStudentId}`)));
      }

      const matchedStudentDoc = querySnap.docs.find((docSnap) => digitsOnly(String(docSnap.data().idCardNumber || '')) === normalizedIdCard);

      if (!matchedStudentDoc) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบข้อมูลนักเรียน',
          text: 'รหัสนักเรียนหรือเลขบัตรประจำตัวประชาชนไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
          background: '#2a2b2f',
          color: '#ffffff',
        });
        setSubmitting(false);
        return;
      }

      const studentDoc = matchedStudentDoc;
      const studentData = studentDoc.data();
      const studentName = `${studentData.title || ''}${studentData.firstName} ${studentData.lastName}`;
      const resolvedSchoolId = getSchoolIdFromSnapshot(studentDoc.ref.path);
      const resolvedSchool = await getResolvedSchool(resolvedSchoolId);

      // Update student document
      const updateData: any = {
        parentLineUserIds: arrayUnion(activeUserId),
      };

      // Add parent info if entered
      if (parentName.trim()) {
        const nameParts = parentName.trim().split(/\s+/);
        updateData.guardianFirstName = nameParts[0] || '';
        updateData.guardianLastName = nameParts.slice(1).join(' ') || '';
      }
      if (parentPhone.trim()) {
        updateData.guardianPhone = parentPhone.trim();
      }
      if (parentRelationship) {
        updateData.guardianRelationship = parentRelationship;
      }

      await updateDoc(studentDoc.ref, updateData);

      Swal.fire({
        icon: 'success',
        title: 'ลงทะเบียนสำเร็จ!',
        html: `<p class="text-gray-300">ผูกข้อมูลผู้ปกครองกับนักเรียน <b class="text-white">${studentName}</b><br/>${resolvedSchool.schoolName} เรียบร้อยแล้ว</p>`,
        background: '#2a2b2f',
        color: '#ffffff',
        confirmButtonColor: '#4f46e5',
      });

      // Clear Form
      setStudentId('');
      setStudentIdCard('');
      setParentName('');
      setParentPhone('');
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'ข้อผิดพลาด',
        text: `เกิดข้อผิดพลาดในการลงทะเบียน: ${err.message}`,
        background: '#2a2b2f',
        color: '#ffffff',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'กรุณาเข้าสู่ระบบด้วย LINE หรือกรอก LINE User ID สำหรับทดสอบ',
        background: '#2a2b2f',
        color: '#ffffff',
      });
      return;
    }
    const normalizedTeacherId = teacherId.trim();
    const normalizedTeacherIdCard = digitsOnly(teacherIdCard);

    if (!normalizedTeacherId || !normalizedTeacherIdCard) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วน', background: '#2a2b2f', color: '#ffffff' });
      return;
    }
    if (normalizedTeacherIdCard.length !== 13) {
      Swal.fire({ icon: 'warning', title: 'เลขบัตรไม่ถูกต้อง', text: 'กรุณากรอกเลขประจำตัวประชาชนคุณครู 13 หลัก', background: '#2a2b2f', color: '#ffffff' });
      return;
    }

    setSubmitting(true);
    try {
      const teachersRef = selectedSchoolId
        ? collection(firestore, 'school-settings', selectedSchoolId, 'teachers')
        : collectionGroup(firestore, 'teachers');
      const q = query(teachersRef, where('teacherId', '==', normalizedTeacherId));
      const querySnap = await getDocs(q);
      const matchedTeacherDoc = querySnap.docs.find((docSnap) => digitsOnly(String(docSnap.data().idCardNumber || '')) === normalizedTeacherIdCard);

      if (!matchedTeacherDoc) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบข้อมูลคุณครู',
          text: 'รหัสประจำตัวครูหรือเลขบัตรประจำตัวประชาชนไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
          background: '#2a2b2f',
          color: '#ffffff',
        });
        setSubmitting(false);
        return;
      }

      const teacherDoc = matchedTeacherDoc;
      const teacherData = teacherDoc.data();
      const teacherName = `${teacherData.title || ''}${teacherData.firstName} ${teacherData.lastName}`;
      const teacherUid = teacherDoc.id;
      const resolvedSchoolId = getSchoolIdFromSnapshot(teacherDoc.ref.path);
      const resolvedSchool = await getResolvedSchool(resolvedSchoolId);

      // Update teacher document
      await updateDoc(teacherDoc.ref, {
        lineUserId: activeUserId,
      });

      // Update corresponding user document if it exists
      try {
        const userDocRef = doc(firestore, 'users', teacherUid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          await updateDoc(userDocRef, {
            lineUserId: activeUserId,
          });
        }
      } catch (userErr) {
        console.warn('Failed to update users collection profile for lineUserId:', userErr);
      }

      Swal.fire({
        icon: 'success',
        title: 'ลงทะเบียนสำเร็จ!',
        html: `<p class="text-gray-300">ผูกข้อมูล LINE กับคุณครู <b class="text-white">${teacherName}</b><br/>${resolvedSchool.schoolName} เรียบร้อยแล้ว</p>`,
        background: '#2a2b2f',
        color: '#ffffff',
        confirmButtonColor: '#4f46e5',
      });

      // Clear Form
      setTeacherId('');
      setTeacherIdCard('');
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'ข้อผิดพลาด',
        text: `เกิดข้อผิดพลาดในการลงทะเบียน: ${err.message}`,
        background: '#2a2b2f',
        color: '#ffffff',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && schools.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin text-indigo-500 mx-auto" size={48} />
          <p className="text-gray-400 font-semibold">กำลังโหลดข้อมูลระบบ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-5 border-b border-slate-300 pb-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">BMS SmartSchool</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">ลงทะเบียนรับแจ้งเตือนผ่าน LINE OA</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                ระบบจะตรวจสอบโรงเรียนจากข้อมูลประจำตัวที่กรอกโดยอัตโนมัติ ไม่จำเป็นต้องเลือกโรงเรียนก่อนลงทะเบียน
              </p>
            </div>
          </div>
        </section>

        <div className="grid flex-1 gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Link2 size={16} className="text-emerald-700" />
                สถานะการเชื่อมต่อ LINE
              </p>

              {loading ? (
                <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <Loader2 className="animate-spin text-emerald-700" size={18} />
                  กำลังเชื่อมต่อบริการ LINE LIFF...
                </div>
              ) : lineUser ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center gap-3">
                    {lineUser.pictureUrl ? (
                      <img
                        src={lineUser.pictureUrl}
                        alt={lineUser.displayName}
                        className="h-12 w-12 rounded-full border border-emerald-200 bg-white"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-white font-bold text-emerald-700">
                        {lineUser.displayName[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-950">{lineUser.displayName}</p>
                        <CheckCircle2 size={15} className="shrink-0 text-emerald-700" />
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-slate-500">UID: {lineUser.userId}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {liffError && (
                    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{liffError}</span>
                    </div>
                  )}

                  {isManualMode && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-600">
                        LINE User ID สำหรับทดสอบระบบ
                      </label>
                      <input
                        type="text"
                        value={manualLineUserId}
                        onChange={(e) => setManualLineUserId(e.target.value)}
                        placeholder="Uxxxxxxxxxxxxxxxx"
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Building2 size={16} className="text-slate-600" />
                วิธีตรวจสอบข้อมูล
              </p>
              <div className="space-y-3 text-sm leading-6 text-slate-600">
                <p>กรอกข้อมูลประจำตัวให้ตรงกับทะเบียนของโรงเรียน ระบบจะค้นหาโรงเรียนและผูกบัญชี LINE ให้อัตโนมัติ</p>
                <p>หากเปิดจากลิงก์ LINE OA ของโรงเรียน ระบบจะยืนยัน LINE ให้ทันทีโดยไม่ต้องกรอกข้อมูลเพิ่มเติม</p>
              </div>
            </div>
          </aside>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('parent')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                  activeTab === 'parent'
                    ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <Users size={16} /> ผู้ปกครอง
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('teacher')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                  activeTab === 'teacher'
                    ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <Briefcase size={16} /> คุณครู
              </button>
            </div>

            {activeTab === 'parent' && (
              <form onSubmit={handleParentSubmit} className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">ข้อมูลนักเรียน</h2>
                  <p className="mt-1 text-sm text-slate-500">ใช้สำหรับค้นหาข้อมูลนักเรียนจากทุกโรงเรียนในระบบ</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      รหัสนักเรียน <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <IdCard className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                      <input
                        type="text"
                        required
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        placeholder="เช่น 12345"
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 pl-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      เลขประจำตัวประชาชนนักเรียน <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={13}
                      value={studentIdCard}
                      onChange={(e) => setStudentIdCard(digitsOnly(e.target.value))}
                      placeholder="กรอกเลข 13 หลัก"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <h3 className="text-base font-bold text-slate-950">ข้อมูลผู้ปกครอง</h3>
                  <p className="mt-1 text-sm text-slate-500">ข้อมูลส่วนนี้ใช้ปรับปรุงทะเบียนผู้ปกครองของนักเรียน</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">ความสัมพันธ์</label>
                    <select
                      value={parentRelationship}
                      onChange={(e) => setParentRelationship(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="พ่อ">พ่อ</option>
                      <option value="แม่">แม่</option>
                      <option value="ผู้ปกครอง">ผู้ปกครอง</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                      <Phone size={14} /> เบอร์โทรศัพท์
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      placeholder="08xxxxxxxx"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">ชื่อ-นามสกุลผู้ปกครอง</label>
                  <input
                    type="text"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    placeholder="เช่น สมชาย ใจดี"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !activeUserId}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      กำลังบันทึกข้อมูล...
                    </>
                  ) : (
                    <>ลงทะเบียนผู้ปกครอง</>
                  )}
                </button>
              </form>
            )}

            {activeTab === 'teacher' && (
              <form onSubmit={handleTeacherSubmit} className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">ข้อมูลคุณครู</h2>
                  <p className="mt-1 text-sm text-slate-500">ใช้รหัสประจำตัวและเลขบัตรประชาชนเพื่อค้นหาข้อมูลในระบบ</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      รหัสประจำตัวคุณครู <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={teacherId}
                      onChange={(e) => setTeacherId(e.target.value)}
                      placeholder="กรอกรหัสคุณครู"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      เลขประจำตัวประชาชนคุณครู <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={13}
                      value={teacherIdCard}
                      onChange={(e) => setTeacherIdCard(digitsOnly(e.target.value))}
                      placeholder="กรอกเลข 13 หลัก"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !activeUserId}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      กำลังบันทึกข้อมูล...
                    </>
                  ) : (
                    <>ลงทะเบียนคุณครู</>
                  )}
                </button>
              </form>
            )}
          </section>
        </div>

        <footer className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          Powered by BMS SmartSchool Hub
        </footer>
      </main>
    </div>
  );
};

export default LineRegisterPage;
