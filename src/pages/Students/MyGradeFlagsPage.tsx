import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import ProfileAvatar from '@/components/Shared/ProfileAvatar';
import { firestore as db } from '@/firebase';
import {
    collection, doc, getDoc, getDocs, addDoc, query, where, limit, serverTimestamp,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import { AlertTriangle, AlertCircle, RefreshCw, Send, Clock, CheckCircle2, XCircle, ClipboardX, ClipboardList } from 'lucide-react';
import {
    FlaggedCourse, StudentFlagRow, RemediationWindowConfig,
    fetchFlaggedStudents, isRemediationWindowOpen,
} from '@/utils/remediationUtils';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';

interface RemediationRequestLite {
    id: string;
    flagKind: 'course' | 'club' | 'learner-activity' | 'guidance';
    courseId: string;
    academicYear: string;
    semester: string;
    status: 'pending' | 'resolved' | 'cancelled';
    newResult?: string;
}

const requestDedupKey = (flagKind: string, idValue: string, academicYear: string, semester: string) =>
    `${flagKind}|${idValue}|${academicYear}|${semester}`;
const flagKeyId = (flag: FlaggedCourse) => flag.flagKind === 'course' ? flag.courseId : (flag.activityDocId || flag.courseId);

const MyGradeFlagsPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const teacherMap = useSelector((state: RootState) => (state as any).userMap?.teachers || {});
    const dispatch = useDispatch<AppDispatch>();
    const isPwaMode = usePwaMode();

    const sessionSchoolId = (() => {
        const userType = localStorage.getItem('currentUserType');
        if (userType === 'parent') {
            try {
                const parentSessionRaw = localStorage.getItem('parentSession');
                if (parentSessionRaw) {
                    const session = JSON.parse(parentSessionRaw);
                    if (session && session.children && session.children.length > 0) {
                        return session.children[0].schoolId;
                    }
                }
            } catch (_) {}
        }
        if (userType === 'student') {
            try {
                const studentSessionRaw = localStorage.getItem('studentSession');
                if (studentSessionRaw) {
                    const session = JSON.parse(studentSessionRaw);
                    if (session && session.schoolId) {
                        return session.schoolId;
                    }
                }
            } catch (_) {}
        }
        return null;
    })();

    const schoolId = (currentUser as any)?.schoolId || sessionSchoolId;

    // ต้องโหลด teacherMap เอง ไม่พึ่งว่าหน้าอื่น (เช่น ProfilePage) เคยโหลดไว้ก่อนแล้ว — ไม่งั้นถ้า
    // นักเรียน/ผู้ปกครองเข้าหน้านี้ตรงๆ โดยไม่ผ่านโปรไฟล์ก่อน fetchFlaggedStudents จะหาชื่อครูไม่เจอเลย
    // (teachers/{id} เปิด read ให้ทุกคนอยู่แล้วใน firestore.rules ไม่มีเหตุผลด้านสิทธิ์ที่ต้องข้าม)
    useEffect(() => {
        if (schoolId) {
            dispatch(fetchTeachersMap(schoolId) as any);
        }
    }, [schoolId, dispatch]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [studentDocId, setStudentDocId] = useState<string | null>(null);
    const [flagRow, setFlagRow] = useState<StudentFlagRow | null>(null);
    const [windowConfig, setWindowConfig] = useState<RemediationWindowConfig | null>(null);
    const [requestsByKey, setRequestsByKey] = useState<Record<string, RemediationRequestLite>>({});
    const [submittingKey, setSubmittingKey] = useState<string | null>(null);

    const resolveStudentDocId = useCallback(async (): Promise<string | null> => {
        const userType = localStorage.getItem('currentUserType');
        if (userType === 'parent') {
            try {
                const parentSessionRaw = localStorage.getItem('parentSession');
                if (parentSessionRaw) {
                    const session = JSON.parse(parentSessionRaw);
                    if (session && session.children && session.children.length > 0) {
                        return session.children[0].studentDocId;
                    }
                }
            } catch (err) {
                console.error('Error parsing parentSession:', err);
            }
        }
        if (userType === 'student') {
            try {
                const studentSessionRaw = localStorage.getItem('studentSession');
                if (studentSessionRaw) {
                    const session = JSON.parse(studentSessionRaw);
                    if (session && session.studentId) {
                        return session.studentId;
                    }
                }
            } catch (err) {
                console.error('Error parsing studentSession:', err);
            }
        }

        if (!currentUser || !schoolId) return null;
        const baseRef = collection(db, 'school-settings', schoolId, 'students');

        const directSnap = await getDoc(doc(db, 'school-settings', schoolId, 'students', currentUser.uid));
        if (directSnap.exists()) return directSnap.id;

        const byUidSnap = await getDocs(query(baseRef, where('uid', '==', currentUser.uid), limit(1)));
        if (!byUidSnap.empty) return byUidSnap.docs[0].id;

        if (currentUser.email) {
            const byEmailSnap = await getDocs(query(baseRef, where('email', '==', currentUser.email), limit(1)));
            if (!byEmailSnap.empty) return byEmailSnap.docs[0].id;
        }

        return null;
    }, [currentUser, schoolId]);

    const loadData = useCallback(async () => {
        if (!schoolId) return;
        setLoading(true);
        setError(null);
        try {
            const sid = await resolveStudentDocId();
            if (!sid) {
                setError('ไม่พบข้อมูลนักเรียนที่เชื่อมโยงกับบัญชีนี้');
                setLoading(false);
                return;
            }
            setStudentDocId(sid);

            const [rows, configSnap, requestSnap] = await Promise.all([
                fetchFlaggedStudents(schoolId, teacherMap, { studentIds: [sid] }),
                getDoc(doc(db, 'school-settings', schoolId, 'configs', 'remediation_settings')),
                getDocs(query(collection(db, 'school-settings', schoolId, 'remediation_requests'), where('studentId', '==', sid))),
            ]);

            setFlagRow(rows[0] || null);
            setWindowConfig(configSnap.exists() ? (configSnap.data() as RemediationWindowConfig) : null);

            const map: Record<string, RemediationRequestLite> = {};
            requestSnap.docs.forEach(d => {
                const data: any = d.data();
                if (data.status === 'cancelled') return;
                const key = requestDedupKey(data.flagType, data.courseId || data.activityId, data.academicYear, data.semester);
                if (!map[key] || data.status === 'resolved') {
                    map[key] = {
                        id: d.id, flagKind: data.flagType, courseId: data.courseId || data.activityId,
                        academicYear: data.academicYear, semester: data.semester,
                        status: data.status, newResult: data.newResult,
                    };
                }
            });
            setRequestsByKey(map);
        } catch (err) {
            console.error('Error loading grade flags:', err);
            setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
        } finally {
            setLoading(false);
        }
    }, [schoolId, teacherMap, resolveStudentDocId]);

    useEffect(() => { loadData(); }, [loadData]);

    const windowOpen = isRemediationWindowOpen(windowConfig);

    const handleSubmitRequest = async (flag: FlaggedCourse) => {
        if (!schoolId || !studentDocId || !flagRow) return;
        const key = requestDedupKey(flag.flagKind, flagKeyId(flag), flag.academicYear, flag.semester);
        if (requestsByKey[key]) return;

        const { value: note, isConfirmed } = await Swal.fire({
            title: 'ยื่นคำร้องขอแก้ตัว',
            html: `<div style="text-align:left;font-size:13px;margin-bottom:8px">
                รายวิชา: <b>${flag.courseTitle || flag.courseCode}</b><br/>
                ผลการเรียน: <b>${flag.grade}</b> (${flag.academicYear}/${flag.semester})
            </div>`,
            input: 'textarea',
            inputPlaceholder: 'หมายเหตุ (ไม่บังคับ)',
            showCancelButton: true,
            confirmButtonText: 'ยื่นคำร้อง',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
        });
        if (!isConfirmed) return;

        setSubmittingKey(key);
        try {
            const dupCheckField = flag.flagKind === 'course' ? 'courseId' : 'activityId';
            const dupCheckValue = flag.flagKind === 'course' ? flag.courseId : flag.activityDocId;
            const dupSnap = await getDocs(query(
                collection(db, 'school-settings', schoolId, 'remediation_requests'),
                where('studentId', '==', studentDocId),
                where('flagType', '==', flag.flagKind),
                where(dupCheckField, '==', dupCheckValue),
                where('academicYear', '==', flag.academicYear),
                where('semester', '==', flag.semester),
            ));
            const existing = dupSnap.docs.find(d => d.data().status !== 'cancelled');
            if (existing) {
                await loadData();
                return;
            }

            const payload: Record<string, any> = {
                studentId: studentDocId,
                studentCode: flagRow.studentCode,
                studentName: flagRow.name,
                classLevel: flagRow.classLevel,
                room: flagRow.room,
                flagType: flag.flagKind,
                originalGrade: flag.grade,
                academicYear: flag.academicYear,
                semester: flag.semester,
                responsibleTeacherIds: flag.responsibleTeacherIds || [],
                responsibleTeacherNames: flag.teacherName ? [flag.teacherName] : [],
                status: 'pending',
                requestedAt: serverTimestamp(),
                requestedBy: currentUser?.uid || null,
                requestNote: note || '',
            };
            if (flag.flagKind === 'course') {
                payload.courseId = flag.courseId;
                payload.courseCode = flag.courseCode;
                payload.courseTitle = flag.courseTitle;
            } else {
                payload.activityId = flag.activityDocId;
                payload.activityName = flag.courseTitle || flag.courseCode;
                payload.evalDocId = flag.evalDocId;
                if (flag.teacherScopeKey) payload.teacherScopeKey = flag.teacherScopeKey;
            }

            await addDoc(collection(db, 'school-settings', schoolId, 'remediation_requests'), payload);
            Swal.fire({ icon: 'success', title: 'ยื่นคำร้องสำเร็จ', timer: 1500, showConfirmButton: false });
            await loadData();
        } catch (err) {
            console.error('Error submitting remediation request:', err);
            Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'ไม่สามารถยื่นคำร้องได้ กรุณาลองใหม่' });
        } finally {
            setSubmittingKey(null);
        }
    };

    const renderStatusBadge = (req?: RemediationRequestLite) => {
        if (!req) return null;
        if (req.status === 'resolved') {
            return (
                <span className="inline-flex items-center gap-1 text-[11px] font-black px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <CheckCircle2 size={12} /> แก้ตัวสำเร็จ{req.newResult ? ` (ผลใหม่: ${req.newResult})` : ''}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-black px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                <Clock size={12} /> รอครูบันทึกผล
            </span>
        );
    };

    const total = flagRow?.flags?.length || 0;
    const resolvedCount = flagRow?.flags?.filter(flag => {
        const key = requestDedupKey(flag.flagKind, flagKeyId(flag), flag.academicYear, flag.semester);
        return requestsByKey[key]?.status === 'resolved';
    }).length || 0;
    const pendingCount = flagRow?.flags?.filter(flag => {
        const key = requestDedupKey(flag.flagKind, flagKeyId(flag), flag.academicYear, flag.semester);
        return requestsByKey[key]?.status === 'pending';
    }).length || 0;

    return (
        <MainLayout>
            <div className="w-full px-2 sm:px-6 lg:px-8 py-2 sm:py-5 text-gray-900 dark:text-white">
                <div className="max-w-4xl mx-auto">
                    <section className="bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-3 sm:p-6 space-y-5">
                        
                        {/* Header Section */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-gray-200 dark:border-gray-700">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
                                    <BackButton to="/profile" className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
                                    <AlertTriangle size={22} />
                                    <span className="text-sm font-bold">ผลการเรียนและระบบแก้ตัว</span>
                                </div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                    ผลการเรียนที่ต้องแก้ไข (0/ร/มส/มผ)
                                </h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    ดูรายวิชา/กิจกรรมที่ติดผลการเรียน และยื่นคำร้องขอแก้ตัวได้ที่นี่
                                </p>
                            </div>
                        </div>

                        {/* ── SUMMARY STATS ROW ── */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex items-center gap-3 shadow-sm">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                                    <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">ทั้งหมด</p>
                                    <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white leading-none mt-0.5">{total}</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">รายการ</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex items-center gap-3 shadow-sm">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                                    <Clock size={18} className="text-amber-600 dark:text-amber-400" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">รอดำเนินการ</p>
                                    <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 leading-none mt-0.5">{pendingCount}</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">รอตรวจ</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex items-center gap-3 shadow-sm">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                                    <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">แก้ตัวสำเร็จ</p>
                                    <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none mt-0.5">{resolvedCount}</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">ผ่านแล้ว</p>
                                </div>
                            </div>
                        </div>

                        {/* Window Closed Warning Banner */}
                        {!windowOpen && (
                            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 flex items-start gap-3 text-amber-850 dark:text-amber-400 shadow-sm">
                                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-black text-sm">ขณะนี้ระบบปิดรับคำร้องขอแก้ตัว</h3>
                                    <p className="text-xs font-semibold mt-0.5 opacity-90 leading-relaxed">
                                        ขออภัย ระบบรับคำร้องออนไลน์ปิดอยู่ชั่วคราว คุณยังคงเห็นรายการผลการเรียนที่ต้องแก้ไขได้ แต่จะไม่สามารถยื่นส่งคำร้องใหม่ในเวลานี้
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Student Info Banner */}
                        {flagRow && (
                            <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center gap-3">
                                <ProfileAvatar
                                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(flagRow.name)}&background=random&color=fff&bold=true`}
                                    alt={flagRow.name}
                                    className="h-10 w-10 shrink-0"
                                />
                                <div className="min-w-0">
                                    <p className="font-black text-sm text-slate-900 dark:text-white leading-tight">
                                        {flagRow.name}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 text-[10px] font-black">
                                            รหัสประจำตัว: {flagRow.studentCode}
                                        </span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                                            ชั้น {flagRow.classLevel}/{flagRow.room}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── FLAG LIST ── */}
                        {loading ? (
                            <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center space-y-3 shadow-sm">
                                <RefreshCw size={24} className="animate-spin text-indigo-500" />
                                <p className="text-slate-400 dark:text-slate-500 text-xs font-black">กำลังโหลดข้อมูลผลการเรียน...</p>
                            </div>
                        ) : error ? (
                            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl p-4 flex items-start gap-3 text-rose-800 dark:text-rose-400 shadow-sm">
                                <XCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-black text-sm">พบข้อผิดพลาดในการโหลดข้อมูล</h3>
                                    <p className="text-xs font-semibold mt-0.5 opacity-90">{error}</p>
                                </div>
                            </div>
                        ) : !flagRow || flagRow.flags.length === 0 ? (
                            <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-12 flex flex-col items-center justify-center text-center shadow-sm">
                                <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
                                    <CheckCircle2 size={26} className="text-emerald-500" />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-white text-sm">ไม่พบข้อมูลผลการเรียนที่ต้องแก้ไข</h3>
                                <p className="text-slate-400/80 text-xs mt-1 max-w-sm">
                                    ยินดีด้วย! คุณไม่มีผลการเรียนที่ติด 0, ร, มส, หรือ มผ ในระบบในขณะนี้
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                                {/* Table header bar */}
                                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-white/[0.02]">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400">
                                        <ClipboardList size={15} className="text-indigo-500" />
                                        <span>วิชา / กิจกรรมที่ต้องแก้ไข</span>
                                    </div>
                                    <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                                        {total} รายการ
                                    </span>
                                </div>

                                {/* Column headers (desktop) */}
                                <div className="hidden md:grid grid-cols-[1fr_120px_180px_180px] gap-4 px-5 py-2.5 bg-slate-50 dark:bg-white/[0.015] border-b border-slate-200 dark:border-slate-700">
                                    {["วิชา / กิจกรรม", "ผลการเรียนเดิม", "อาจารย์ผู้สอน", "การจัดการ / สถานะ"].map((h) => (
                                        <span key={h} className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{h}</span>
                                    ))}
                                </div>

                                {/* Rows */}
                                <div className="divide-y divide-slate-250 dark:divide-slate-700">
                                    {flagRow.flags.map((flag, idx) => {
                                        const key = requestDedupKey(flag.flagKind, flagKeyId(flag), flag.academicYear, flag.semester);
                                        const req = requestsByKey[key];
                                        
                                        const rowBg = {
                                            resolved: "border-l-4 border-l-emerald-500 bg-emerald-50/10 dark:bg-emerald-500/[0.01]",
                                            pending: "border-l-4 border-l-amber-500 bg-amber-50/10 dark:bg-amber-500/[0.01]",
                                            none: "border-l-4 border-l-slate-200 dark:border-l-slate-750",
                                        }[req?.status === 'resolved' ? 'resolved' : (req?.status === 'pending' ? 'pending' : 'none')];

                                        return (
                                            <div
                                                key={`${key}-${idx}`}
                                                className={`grid grid-cols-1 md:grid-cols-[1fr_120px_180px_180px] gap-3 md:gap-4 px-4 md:px-5 py-3.5 items-center transition-colors ${rowBg} hover:bg-slate-50/60 dark:hover:bg-white/[0.02]`}
                                            >
                                                {/* วิชา / กิจกรรม */}
                                                <div className="min-w-0">
                                                    <p className="font-black text-sm text-slate-900 dark:text-white leading-tight">
                                                        {flag.courseTitle || flag.courseCode}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 text-[10px] font-black">
                                                            {flag.courseCode}
                                                        </span>
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                                                            ปีการศึกษา {flag.academicYear}/{flag.semester}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* ผลการเรียนเดิม */}
                                                <div className="flex items-center gap-2">
                                                    <span className="md:hidden text-[9px] font-black uppercase text-slate-400">ผลการเรียนเดิม:</span>
                                                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20 text-xs font-black">
                                                        {flag.grade}
                                                    </span>
                                                </div>

                                                {/* อาจารย์ผู้สอน */}
                                                <div className="flex items-center gap-2">
                                                    <span className="md:hidden text-[9px] font-black uppercase text-slate-400">อาจารย์ผู้สอน:</span>
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                                        {flag.teacherName || '-'}
                                                    </span>
                                                </div>

                                                {/* การจัดการ / สถานะ */}
                                                <div className="flex items-center gap-2 md:justify-end">
                                                    <span className="md:hidden text-[9px] font-black uppercase text-slate-450 font-black">การจัดการ:</span>
                                                    {req ? (
                                                        renderStatusBadge(req)
                                                    ) : windowOpen ? (
                                                        <button
                                                            onClick={() => handleSubmitRequest(flag)}
                                                            disabled={submittingKey === key}
                                                            className="w-full md:w-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 px-3 text-xs font-black shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                                                        >
                                                            {submittingKey === key ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                                                            ยื่นคำร้องแก้ตัว
                                                        </button>
                                                    ) : (
                                                        <span className="text-[11px] font-black text-slate-400">ปิดรับคำร้อง</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </MainLayout>
    );
};

export default MyGradeFlagsPage;
