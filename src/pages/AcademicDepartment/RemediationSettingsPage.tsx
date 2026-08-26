import React, { useState, useEffect } from 'react';
import { firestore as db } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import { CalendarClock, Clock, Save, RefreshCw, Settings, Info } from 'lucide-react';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';

const RemediationSettingsPage: React.FC = () => {
    const { user: currentUser } = usePermissions();
    const schoolId = (currentUser as any)?.schoolId;
    const isPwaMode = usePwaMode();

    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [enabled, setEnabled] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [startTime, setStartTime] = useState('00:00');
    const [endTime, setEndTime] = useState('23:59');

    useEffect(() => {
        if (!schoolId) return;
        const load = async () => {
            setLoading(true);
            try {
                const configRef = doc(db, 'school-settings', schoolId, 'configs', 'remediation_settings');
                const snap = await getDoc(configRef);
                if (snap.exists()) {
                    const data = snap.data() as any;
                    setEnabled(Boolean(data.enabled));
                    setStartDate(data.startDate || '');
                    setEndDate(data.endDate || '');
                    setStartTime(data.startTime || '00:00');
                    setEndTime(data.endTime || '23:59');
                }
            } catch (err) {
                console.error('Error loading remediation settings:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [schoolId]);

    const handleSave = async () => {
        if (!schoolId) return;
        setIsSaving(true);
        try {
            const configRef = doc(db, 'school-settings', schoolId, 'configs', 'remediation_settings');
            await setDoc(configRef, {
                enabled,
                startDate,
                endDate,
                startTime,
                endTime,
            }, { merge: true });
            Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch (err) {
            console.error('Error saving remediation settings:', err);
            Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'ไม่สามารถบันทึกการตั้งค่าได้' });
        } finally {
            setIsSaving(false);
        }
    };

    const checkTimeAllowed = (s: string, e: string): boolean => {
        if (!s || !e) return true;
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = e.split(':').map(Number);
        return cur >= sh * 60 + sm && cur <= eh * 60 + em;
    };

    const getStatus = (): { text: string; color: string } => {
        if (!enabled) return { text: 'ปิดรับคำร้อง', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
        const now = new Date();
        const todayOnly = new Date(now); todayOnly.setHours(0, 0, 0, 0);
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (todayOnly < start) return { text: 'ยังไม่เปิด', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
            if (now > end) return { text: 'ปิดรับคำร้อง', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
        }
        if (!checkTimeAllowed(startTime, endTime)) return { text: 'นอกเวลารับคำร้อง', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
        return { text: 'เปิดรับคำร้อง', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
    };

    const status = getStatus();

    return (
        <MainLayout>
            <div className={`text-gray-900 dark:text-white transition-colors duration-300 min-h-screen overflow-x-hidden ${isPwaMode ? 'px-2.5 py-3 pb-6' : 'p-4 sm:p-6 space-y-6'}`}>
                <div className={`${isPwaMode ? 'max-w-full' : 'max-w-3xl'} mx-auto min-w-0 ${isPwaMode ? 'space-y-4' : 'space-y-6'}`}>
                    
                    {/* Top Header Card */}
                    {isPwaMode ? (
                        <div className="mb-3 space-y-1.5">
                            <div className="flex items-center gap-2 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm px-3 py-2 rounded-xl border border-gray-200/50 dark:border-white/5">
                                <BackButton to="/academic/hub/settings" />
                                <div className="p-1 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg shrink-0">
                                    <Settings className="text-indigo-600 dark:text-indigo-400" size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-black text-gray-900 dark:text-white leading-none truncate">ตั้งค่าการยื่นคำร้องขอแก้ตัว</p>
                                    <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-semibold truncate mt-0.5">เปิด-ปิดช่วงเวลาให้นักเรียนยื่นคำร้องแก้ 0/ร/มส/มผ ได้</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
                            <div className="space-y-1 text-left">
                                <div className="flex items-center gap-3">
                                    <BackButton to="/academic/hub/settings" />
                                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
                                        <Settings className="text-indigo-600 dark:text-indigo-400" size={24} />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                            ตั้งค่าการยื่นคำร้องขอแก้ตัว
                                        </h1>
                                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold flex items-center gap-1.5 pt-0.5">
                                            <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">เปิด-ปิดช่วงเวลาให้นักเรียนยื่นคำร้องแก้ 0/ร/มส/มผ ได้</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Main Card */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-3 bg-white dark:bg-[#1e1f23] rounded-3xl border border-gray-100 dark:border-gray-800">
                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
                            <p className="text-gray-400 dark:text-gray-500 text-sm font-bold">กำลังโหลดการตั้งค่า...</p>
                        </div>
                    ) : (
                        <div className={`bg-white dark:bg-[#1e1f23] rounded-3xl shadow-md border border-gray-100 dark:border-gray-800 overflow-hidden ${isPwaMode ? 'p-4 rounded-2xl' : 'p-6'}`}>
                            <h2 className="text-lg font-extrabold text-gray-800 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3 mb-5">
                                <CalendarClock className="h-5 w-5 text-indigo-500" />
                                ช่วงเวลารับคำร้อง
                            </h2>

                            <div className="space-y-6">
                                {/* Toggle switch block */}
                                <div className="flex items-start justify-between gap-4 bg-gray-50/50 dark:bg-white/[0.02] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/40">
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 p-2 rounded-xl shrink-0 ${enabled ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
                                            <CalendarClock size={18} className={enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="font-bold text-sm text-gray-800 dark:text-gray-100">รับคำร้องขอแก้ตัว</h4>
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${status.color}`}>
                                                    ● {status.text}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-0.5">เปิด/ปิดให้นักเรียนยื่นคำร้องขอแก้ 0/ร/มส/มผ ด้วยตนเอง</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setEnabled(!enabled)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                {/* Date & Time Inputs block */}
                                <div className={`space-y-4 transition-all duration-300 ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">วันเปิด</label>
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-850 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold transition text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">วันปิด</label>
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-850 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none font-bold transition text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <Clock size={10} /> เวลาเริ่ม
                                            </label>
                                            <input
                                                type="time"
                                                value={startTime}
                                                onChange={(e) => setStartTime(e.target.value)}
                                                className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-850 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold transition text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <Clock size={10} /> เวลาปิด
                                            </label>
                                            <input
                                                type="time"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-850 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none font-bold transition text-xs"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-2 bg-indigo-500/5 p-3 rounded-xl border border-indigo-500/10 text-indigo-500 text-[11px] font-bold">
                                        <Info size={14} className="shrink-0 mt-0.5" />
                                        <span>เว้นว่างวันเปิด/วันปิด = ไม่จำกัดช่วงวันที่ (ใช้เวลาควบคุมรายวันแทน)</span>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2.5">
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="w-full sm:w-auto px-5 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md shadow-indigo-600/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                                    >
                                        {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                        บันทึกการตั้งค่า
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default RemediationSettingsPage;
