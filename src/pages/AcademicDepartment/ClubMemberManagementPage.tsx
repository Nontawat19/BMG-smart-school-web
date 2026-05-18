import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
<<<<<<< HEAD
import BackButton from "@/components/Shared/BackButton";
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import { firestore as db } from '../../firebase';
import { collection, getDocs, doc, query, where, writeBatch, deleteDoc, onSnapshot, orderBy, addDoc, getDoc } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import Swal from 'sweetalert2';
import { getLevelsByRange } from '@/utils/schoolUtils';
import {
  Users,
  UserPlus,
  Trash2,
<<<<<<< HEAD
=======
  ArrowLeft,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
  Search,
  CheckCircle2,
  AlertCircle,
  Info,
  LayoutGrid,
  UserCheck,
  ChevronRight,
  Bell,
  Check,
  X as XIcon
} from 'lucide-react';
import SkeletonLoader from "@/components/SkeletonLoader";

interface Club {
  id: string;
  name: string;
  capacity: number;
  responsibleTeacherIds: string[];
  imageUrl?: string;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  classLevel: string;
  room: string;
  profileImageUrl?: string;
}

const ClubMemberManagementPage: React.FC = () => {
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClass] = useState<Club | null>(null);
  const [members, setMembers] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();

  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

  // 1. หา ID ของครูในระบบ school-settings
  const currentTeacherId = useMemo(() => {
    if (!teacherMap || !currentUser) return null;
    const teacher = Object.values(teacherMap).find((t: any) => t.uid === currentUser.uid);
    return teacher?.id || null;
  }, [teacherMap, currentUser]);

  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') {
      dispatch(fetchTeachersMap(schoolId) as any);
    }
  }, [schoolId, teacherMapStatus, dispatch]);

  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(db, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levels = getLevelsByRange(data.opportunityExpansionLevel || "");
          setAvailableLevels(levels);
        }
      } catch (error) {
        console.error("Error fetching school levels:", error);
      }
    };
    fetchLevels();
  }, [schoolId]);

  // 2. ดึงข้อมูลชุมนุมที่ครูรับผิดชอบ
  useEffect(() => {
    if (!schoolId || !currentTeacherId) return;

    const fetchMyClubs = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'school-settings', schoolId, 'clubs'),
          where('responsibleTeacherIds', 'array-contains', currentTeacherId)
        );
        const snap = await getDocs(q);
        const clubsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Club));
        setMyClubs(clubsData);
        if (clubsData.length === 1) setSelectedClass(clubsData[0]);
      } catch (error) {
        console.error("Error fetching clubs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyClubs();
  }, [schoolId, currentTeacherId]);

  // 3. ดึงรายชื่อสมาชิกในชุมนุมที่เลือก (Real-time)
  useEffect(() => {
    if (!schoolId || !selectedClub) {
      setMembers([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members'),
      async (snap) => {
        const memberIds = snap.docs.map(doc => doc.id);
        if (memberIds.length === 0) {
          setMembers([]);
          return;
        }

        // ดึงข้อมูลนักเรียนจาก IDs
        const studentsRef = collection(db, 'school-settings', schoolId, 'students');
        const studentSnap = await getDocs(studentsRef); // ในระบบจริงควรใช้ query in แต่ Firestore จำกัด 10 ตัว
        const memberList = studentSnap.docs
          .filter(doc => memberIds.includes(doc.id))
          .map(doc => ({ id: doc.id, ...doc.data() } as Student));

        setMembers(memberList);
      }
    );

    return () => unsub();
  }, [schoolId, selectedClub]);

  // 3.1 ดึงคำขอเข้าชุมนุม (Real-time)
  useEffect(() => {
    if (!schoolId || myClubs.length === 0) return;

    const q = query(
      collection(db, 'school-settings', schoolId, 'club_requests'),
      where('status', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snap) => {
      const clubIds = new Set(myClubs.map(c => c.id));
      const allReqs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      // กรองเฉพาะคำขอที่เกี่ยวข้องกับชุมนุมที่ครูดูแล และครูยังไม่ได้อนุมัติในส่วนของตน
      const filtered = allReqs.filter(req => {
        const isTarget = clubIds.has(req.targetClubId) && req.entryStatus === 'pending';
        const isCurrent = clubIds.has(req.currentClubId) && req.exitStatus === 'pending';
        return isTarget || isCurrent;
      });

      setRequests(filtered);
    });

    return () => unsub();
  }, [schoolId, myClubs]);

  // 4. ดึงรายชื่อนักเรียนทั้งหมดเพื่อใช้ค้นหา
  useEffect(() => {
    if (!schoolId || !selectedClub) return;

    const fetchAllStudents = async () => {
      setStudentsLoading(true);
      try {
        const q = query(collection(db, 'school-settings', schoolId, 'students'), orderBy('firstName'));
        const snap = await getDocs(q);
        setAllStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      } catch (error) {
        console.error("Error fetching students:", error);
      } finally {
        setStudentsLoading(false);
      }
    };

    fetchAllStudents();
  }, [schoolId, selectedClub]);

  const handleAddMember = async (student: Student) => {
    if (!schoolId || !selectedClub) return;

    if (members.length >= selectedClub.capacity) {
      Swal.fire('ชุมนุมเต็มแล้ว', `ชุมนุมนี้รับได้สูงสุด ${selectedClub.capacity} คน`, 'warning');
      return;
    }

    try {
      const memberRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members', student.id);
      await writeBatch(db).set(memberRef, {
        addedAt: new Date(),
        addedBy: currentUser?.uid
      }).commit();

      Swal.fire({ icon: 'success', title: 'เพิ่มสำเร็จ', timer: 800, showConfirmButton: false, toast: true, position: 'top-end' });
    } catch (error) {
      Swal.fire('ผิดพลาด', 'ไม่สามารถเพิ่มนักเรียนได้', 'error');
    }
  };

  const handleRemoveMember = async (studentId: string) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: "ต้องการนำนักเรียนออกจากชุมนุมใช่หรือไม่?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'ลบออก',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed && schoolId && selectedClub) {
      try {
        await deleteDoc(doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members', studentId));
      } catch (error) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถลบได้', 'error');
      }
    }
  };

  const handleProcessRequest = async (request: any, action: 'approve' | 'reject') => {
    if (!schoolId) return;

    const clubIds = new Set(myClubs.map(c => c.id));
    const isExitApprover = clubIds.has(request.currentClubId);
    const isEntryApprover = clubIds.has(request.targetClubId);

    const result = await Swal.fire({
      title: action === 'approve' ? 'ยืนยันการอนุมัติ' : 'ยืนยันการปฏิเสธ',
      text: `คุณต้องการ${action === 'approve' ? 'รับ' : 'ปฏิเสธ'} ${request.studentName} เข้าชุมนุม ${request.targetClubName} ใช่หรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ',
      confirmButtonColor: action === 'approve' ? '#10b981' : '#ef4444'
    });

    if (result.isConfirmed) {
      try {
        const batch = writeBatch(db);
        const requestRef = doc(db, 'school-settings', schoolId, 'club_requests', request.id);

        let newExitStatus = request.exitStatus || 'approved';
        let newEntryStatus = request.entryStatus || 'pending';

        if (action === 'approve') {

          if (request.type === 'transfer') {
            if (isExitApprover) newExitStatus = 'approved';
            if (isEntryApprover) newEntryStatus = 'approved';

            batch.update(requestRef, {
              exitStatus: newExitStatus,
              entryStatus: newEntryStatus
            });
          } else {
            newExitStatus = 'approved';
            newEntryStatus = 'approved';
          }

          if (newExitStatus === 'approved' && newEntryStatus === 'approved') {
            if (request.type === 'transfer' && request.currentClubId) {
              const oldMemberRef = doc(db, 'school-settings', schoolId, 'clubs', request.currentClubId, 'members', request.studentId);
              batch.delete(oldMemberRef);
            }

            const newMemberRef = doc(db, 'school-settings', schoolId, 'clubs', request.targetClubId, 'members', request.studentId);
            batch.set(newMemberRef, { addedAt: new Date(), addedBy: currentUser?.uid, viaRequest: true });
            batch.update(requestRef, { status: 'approved', processedAt: new Date(), processedBy: currentUser?.uid });
          }
        } else {
          batch.update(requestRef, { status: 'rejected', processedAt: new Date(), processedBy: currentUser?.uid });
        }

        // 3. Send Notification to student
        const notiRef = collection(db, 'school-settings', schoolId, 'notifications');
        await addDoc(notiRef, {
          userId: request.studentId,
          message: `คำขอเข้าชุมนุม ${request.targetClubName} ของคุณได้รับการ${action === 'approve' ? 'อนุมัติแล้ว' : 'ปฏิเสธ'}`,
          createdAt: new Date(),
          isRead: false
        });

        await batch.commit();

        if (action === 'approve' && (request.type === 'transfer' && (request.exitStatus === 'pending' || request.entryStatus === 'pending') && !(newExitStatus === 'approved' && newEntryStatus === 'approved'))) {
          const otherParty = isExitApprover ? "ครูผู้รับผิดชอบชุมนุมปลายทาง" : "ครูผู้รับผิดชอบชุมนุมเดิม";
          Swal.fire({
            icon: 'info',
            title: 'อนุมัติส่วนของคุณแล้ว',
            text: `กรุณารอการอนุมัติจาก${otherParty}เพื่อเสร็จสิ้นการย้าย`,
            timer: 2500,
            showConfirmButton: false
          });
        } else {
          Swal.fire({ icon: 'success', title: 'ดำเนินการสำเร็จ', timer: 1500, showConfirmButton: false });
        }
      } catch (error) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถดำเนินการได้', 'error');
      }
    }
  };

  const filteredAvailableStudents = useMemo(() => {
    const memberIds = new Set(members.map(m => m.id));
    return allStudents.filter(s =>
      !memberIds.has(s.id) &&
      (selectedClassLevel ? s.classLevel === selectedClassLevel : true) &&
      (selectedRoom ? s.room === selectedRoom : true) &&
      (`${s.firstName} ${s.lastName} ${s.studentId}`.toLowerCase().includes(studentSearchTerm.toLowerCase()))
    ).slice(0, 20); // แสดงแค่ 20 คนแรกเพื่อประสิทธิภาพ
  }, [allStudents, members, studentSearchTerm, selectedClassLevel, selectedRoom]);

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 max-w-7xl mx-auto text-gray-900 dark:text-white">

        {/* Header */}
        <div className="mb-8">
<<<<<<< HEAD
          <BackButton to="/academic/hub/activities" className="mb-2" />
=======
          <Link to="/academic-admin" className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline mb-2 text-sm font-medium">
            <ArrowLeft size={16} className="mr-1" /> กลับหน้าบริหารวิชาการ
          </Link>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="text-violet-500" size={32} />
            จัดการสมาชิกชุมนุม
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">เพิ่มและจัดการรายชื่อนักเรียนในชุมนุมที่คุณรับผิดชอบ</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <SkeletonLoader height="100px" />
            <SkeletonLoader height="400px" />
          </div>
        ) : myClubs.length === 0 ? (
          <div className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-16 text-center border border-dashed border-gray-300 dark:border-gray-700">
            <AlertCircle className="mx-auto text-amber-500 mb-4" size={48} />
            <h3 className="text-xl font-bold">ไม่พบข้อมูลชุมนุม</h3>
            <p className="text-gray-500 mt-2">คุณยังไม่ได้ถูกกำหนดให้เป็นผู้รับผิดชอบชุมนุมใดๆ กรุณาติดต่อฝ่ายวิชาการ</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Left: Club Selection & Add Member */}
            <div className="lg:col-span-5 space-y-6">
              {/* Pending Requests Section */}
              {requests.length > 0 && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border-2 border-amber-100 dark:border-amber-900/30">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Bell size={20} /> คำขอที่รอดำเนินการ ({requests.length})
                  </h3>
                  <div className="space-y-3">
                    {requests.map(req => (
                      <div key={req.id} className={`p-3 rounded-xl border ${myClubs.some(c => c.id === req.currentClubId) ? 'bg-rose-50 dark:bg-red-900/10 border-rose-100 dark:border-red-800/50' : 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800/50'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{req.studentName}</p>
                            <p className="text-[10px] text-gray-500">
                              ชั้น {req.classLevel}/{req.room} | {req.type === 'transfer' ? `ย้ายจาก: ${req.currentClubName}` : 'สมัครใหม่'}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${myClubs.some(c => c.id === req.currentClubId) ? 'text-rose-600' : 'text-amber-600'}`}>
                              {myClubs.some(c => c.id === req.currentClubId) ? 'ขอย้ายออก' : 'ขอย้ายเข้า'}
                            </span>
                            <p className="text-[9px] text-gray-400">เป้าหมาย: {req.targetClubName}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleProcessRequest(req, 'approve')}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all"
                          >
                            <Check size={14} /> อนุมัติ
                          </button>
                          <button
                            onClick={() => handleProcessRequest(req, 'reject')}
                            className="flex-1 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all"
                          >
                            <XIcon size={14} /> ปฏิเสธ
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">เลือกชุมนุมที่ต้องการจัดการ</label>
                <div className="space-y-2">
                  {myClubs.map(club => (
                    <button
                      key={club.id}
                      onClick={() => setSelectedClass(club)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${selectedClub?.id === club.id ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300' : 'border-gray-100 dark:border-gray-700 hover:border-violet-200'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-800 flex items-center justify-center text-violet-600 dark:text-violet-200">
                          <LayoutGrid size={20} />
                        </div>
                        <span className="font-bold">{club.name}</span>
                      </div>
                      {selectedClub?.id === club.id && <CheckCircle2 size={20} />}
                    </button>
                  ))}
                </div>
              </div>

              {selectedClub && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <UserPlus className="text-emerald-500" size={20} /> เพิ่มนักเรียนเข้าชุมนุม
                  </h3>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <select value={selectedClassLevel} onChange={(e) => setSelectedClassLevel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-violet-500">
                        <option value="">ทุกชั้น</option>
                        {availableLevels.map(level => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-violet-500">
                        <option value="">ทุกห้อง</option>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อ หรือ รหัสนักเรียน..."
                      value={studentSearchTerm}
                      onChange={(e) => setStudentSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {studentsLoading ? (
                      <div className="text-center py-4 text-gray-400 text-sm">กำลังโหลดรายชื่อ...</div>
                    ) : filteredAvailableStudents.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-sm">ไม่พบนักเรียนที่ต้องการ</div>
                    ) : (
                      filteredAvailableStudents.map(student => (
                        <div key={student.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 group hover:border-violet-300 transition-all">
                          <div className="flex items-center gap-3">
                            <img src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}&background=random`} className="w-8 h-8 rounded-full object-cover" alt="" />
                            <div>
                              <p className="text-sm font-bold">{student.firstName} {student.lastName}</p>
                              <p className="text-[10px] text-gray-500">ID: {student.studentId} | ชั้น {student.classLevel}/{student.room}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddMember(student)}
                            className="p-2 bg-white dark:bg-gray-700 text-violet-600 dark:text-violet-400 rounded-lg shadow-sm hover:bg-violet-600 hover:text-white transition-all"
                          >
                            <UserPlus size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Member List */}
            <div className="lg:col-span-7">
              {!selectedClub ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800/20 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12">
                  <Users size={48} className="mb-4 opacity-20" />
                  <p>กรุณาเลือกชุมนุมเพื่อดูรายชื่อสมาชิก</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-violet-50/30 dark:bg-violet-900/10 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-violet-700 dark:text-violet-400">{selectedClub.name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 w-32">
                          <div
                            className={`h-1.5 rounded-full transition-all ${members.length >= selectedClub.capacity ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, (members.length / selectedClub.capacity) * 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-bold text-gray-500">สมาชิก: {members.length} / {selectedClub.capacity} คน</span>
                      </div>
                    </div>
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                      <Users className="text-violet-500" size={24} />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {members.length === 0 ? (
                      <div className="text-center py-20 text-gray-400">
                        <p>ยังไม่มีนักเรียนในชุมนุมนี้</p>
                        <p className="text-sm mt-1">เริ่มเพิ่มนักเรียนจากเมนูด้านซ้าย</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {members.map((member, idx) => (
                          <div key={member.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl hover:shadow-md transition-all group">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-bold text-gray-400 w-4">{idx + 1}</span>
                              <img src={member.profileImageUrl || `https://ui-avatars.com/api/?name=${member.firstName}&background=random`} className="w-10 h-10 rounded-full object-cover" alt="" />
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white">{member.firstName} {member.lastName}</p>
                                <p className="text-xs text-gray-500">รหัส: {member.studentId} | ชั้น {member.classLevel}/{member.room}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveMember(member.id)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; }
      `}</style>
    </MainLayout>
  );
};

export default ClubMemberManagementPage;