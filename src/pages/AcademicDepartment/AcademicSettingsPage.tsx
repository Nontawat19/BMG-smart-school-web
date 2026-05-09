import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import {
    Settings,
    ChevronLeft,
    Save,
    Clock,
    ShieldCheck,
    Activity,
    AlertCircle,
    Calendar
} from "lucide-react";
import { Link } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore as db } from "@/firebase";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import Swal from "sweetalert2";
import BackButton from "@/components/Shared/BackButton";

const AcademicSettingsPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        allowHistoricalAttendance: true,
        historicalAttendanceStartDate: "",
        historicalAttendanceEndDate: "",
        allowGradeEditAfterTermEnd: false,
        requireAdminApprovalForScheduleChange: false,
        showGradeBookMenu: true,
    });

    useEffect(() => {
        const fetchSettings = async () => {
            if (!schoolId) return;
            try {
                const docRef = doc(db, "school-settings", schoolId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.academicSettings) {
                        setSettings({
                            ...settings,
                            ...data.academicSettings
                        });
                    }
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [schoolId]);

    const handleToggle = (key: keyof typeof settings) => {
        setSettings(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handleInputChange = (key: keyof typeof settings, value: string) => {
        setSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleSave = async () => {
        if (!schoolId) return;
        setSaving(true);
        try {
            const docRef = doc(db, "school-settings", schoolId);
            await updateDoc(docRef, {
                academicSettings: settings,
                updatedAt: new Date()
            });
            Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ',
                text: 'ตั้งค่าระบบงานวิชาการเรียบร้อยแล้ว',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Error saving settings:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <MainLayout>
                <div className="flex items-center justify-center min-h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-[#1a1b1e]">
                <div className="max-w-4xl mx-auto">
                    {/* Breadcrumb & Header */}
                    <div className="mb-8">
                        <div className="flex items-center gap-4 mb-4">
                            <BackButton />
                            <span className="font-medium text-gray-500 dark:text-gray-400">กลับหน้างานวิชาการ</span>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
                                    <Settings size={32} />
                                </div>
                                <div>
                                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">ตั้งค่าระบบงานวิชาการ</h1>
                                    <p className="text-gray-500 dark:text-gray-400">กำหนดพฤติกรรมและข้อกำหนดของฟีเจอร์ต่างๆ</p>
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:-translate-y-1 active:scale-95"
                            >
                                {saving ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <Save size={20} />
                                )}
                                <span>บันทึกการตั้งค่า</span>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {/* Attendance Settings */}
                        <div className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-gray-50 dark:border-gray-800">
                                <Clock className="text-indigo-600 dark:text-indigo-400" size={24} />
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">ระบบเช็คชื่อรายวิชา</h2>
                            </div>

                            <div className="space-y-8">
                                {/* Setting 1: Historical Attendance */}
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            เปิดใช้งานการเช็คชื่อย้อนหลัง
                                        </h3>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-md">
                                            อนุญาตให้ครูผู้สอนสามารถบันทึกหรือแก้ไขข้อมูลการเช็คชื่อในวันที่ผ่านมาได้
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-sm font-bold ${settings.allowHistoricalAttendance ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                                            {settings.allowHistoricalAttendance ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                        </span>
                                        <button
                                            onClick={() => handleToggle('allowHistoricalAttendance')}
                                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ring-2 ring-offset-2 ring-transparent focus:ring-indigo-500 ${settings.allowHistoricalAttendance ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                                                }`}
                                        >
                                            <span
                                                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${settings.allowHistoricalAttendance ? 'translate-x-7' : 'translate-x-1'
                                                    }`}
                                            />
                                        </button>
                                    </div>
                                </div>

                                {settings.allowHistoricalAttendance && (
                                    <div className="bg-indigo-50/50 dark:bg-indigo-500/5 p-6 rounded-2xl border border-indigo-100/50 dark:border-indigo-500/10 space-y-4 animate-in fade-in zoom-in duration-300">
                                        <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                                            <Calendar size={16} /> กำหนดช่วงเวลาที่อนุญาตให้เช็คชื่อย้อนหลัง
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">วันที่เริ่มต้น</label>
                                                <input
                                                    type="date"
                                                    value={settings.historicalAttendanceStartDate}
                                                    onChange={(e) => handleInputChange('historicalAttendanceStartDate', e.target.value)}
                                                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all shadow-sm"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">วันที่สิ้นสุด</label>
                                                <input
                                                    type="date"
                                                    value={settings.historicalAttendanceEndDate}
                                                    onChange={(e) => handleInputChange('historicalAttendanceEndDate', e.target.value)}
                                                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all shadow-sm"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1">
                                            <AlertCircle size={12} /> หมายเหตุ: หากไม่กำหนด จะถือว่าอนุญาตให้เช็คย้อนหลังได้ไม่จำกัดช่วงเวลา
                                        </p>
                                    </div>
                                )}

                                <div className="h-px bg-gray-50 dark:bg-gray-800/50"></div>

                                {/* Information Box */}
                                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-2xl p-4 flex gap-4">
                                    <AlertCircle className="text-amber-600 dark:text-amber-400 shrink-0" size={24} />
                                    <div>
                                        <h4 className="font-bold text-amber-800 dark:text-amber-300 text-sm">ข้อความระวัง</h4>
                                        <p className="text-amber-700 dark:text-amber-400/80 text-xs mt-1 leading-relaxed">
                                            การปิดใช้งานฟีเจอร์บางอย่างอาจส่งผลต่อการทำงานของระบบประเมินผล (ปพ.5) ในส่วนของการสรุปวันมาเรียน หากครูผู้สอนยังบันทึกข้อมูลไม่ครบถ้วน
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Registration & Grading Settings */}
                        <div className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-gray-50 dark:border-gray-800">
                                <ShieldCheck className="text-indigo-600 dark:text-indigo-400" size={24} />
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">ระบบงานทะเบียนและวัดผล</h2>
                            </div>

                            <div className="space-y-8">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            แสดงเมนูสมุดบันทึกผลการเรียน (ปพ.5)
                                        </h3>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-md">
                                            ควบคุมการแสดงเมนูสมุดบันทึกผลการเรียนที่แถบเมนูด้านข้างสำหรับครูผู้สอน
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-sm font-bold ${settings.showGradeBookMenu ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                                            {settings.showGradeBookMenu ? 'เปิดการแสดงผล' : 'ซ่อนเมนู'}
                                        </span>
                                        <button
                                            onClick={() => handleToggle('showGradeBookMenu')}
                                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ring-2 ring-offset-2 ring-transparent focus:ring-indigo-500 ${settings.showGradeBookMenu ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                                                }`}
                                        >
                                            <span
                                                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${settings.showGradeBookMenu ? 'translate-x-7' : 'translate-x-1'
                                                    }`}
                                            />
                                        </button>
                                    </div>
                                </div>

                                <div className="h-px bg-gray-50 dark:bg-gray-800/50"></div>

                                <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-600 dark:text-gray-400">ปิดการแก้ไขเกรดเมื่อสิ้นสุดภาคเรียน</h3>
                                        <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">เร็วๆ นี้</p>
                                    </div>
                                    <div className="bg-gray-200 dark:bg-gray-800 h-8 w-14 rounded-full"></div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 justify-center py-4 text-gray-400 dark:text-gray-600 text-xs font-medium uppercase tracking-widest">
                            <Activity size={14} />
                            <span>Easy School Settings Portal</span>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default AcademicSettingsPage;
