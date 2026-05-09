import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { firestore as db } from "../../firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import MainLayout from "@/layouts/MainLayout";
import Swal from "sweetalert2";
import BackButton from "@/components/Shared/BackButton";

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
  linkedPeriodId?: string; // Reference to the global period ID (e.g., 'period-1')
}

interface PeriodSetting {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
  isFixed?: boolean;
}

const DAY_OPTIONS = [
  { value: 'all', label: 'ทุกวัน' },
  { value: 'mon', label: 'วันจันทร์' },
  { value: 'tue', label: 'วันอังคาร' },
  { value: 'wed', label: 'วันพุธ' },
  { value: 'thu', label: 'วันพฤหัสบดี' },
  { value: 'fri', label: 'วันศุกร์' },
];

const SpecialPeriodManagementPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
  const [newPeriodTitle, setNewPeriodTitle] = useState("");
  const [newPeriodStartTime, setNewPeriodStartTime] = useState("");
  const [newPeriodEndTime, setNewPeriodEndTime] = useState("");
  const [newPeriodDay, setNewPeriodDay] = useState("all");
  const [selectedPeriodOption, setSelectedPeriodOption] = useState("custom");
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [isSubmittingPeriod, setIsSubmittingPeriod] = useState(false);

  const PERIOD_OPTIONS = useMemo(() => {
    if (periodSettings.length === 0) {
      return [{ value: 'custom', label: 'กำหนดเวลาเอง', start: '', end: '' }];
    }
    const options = periodSettings.map(p => ({
      value: p.id,
      label: `${p.label} (${p.startTime}-${p.endTime})`,
      start: p.startTime,
      end: p.endTime
    }));
    return [{ value: 'custom', label: 'กำหนดเวลาเอง', start: '', end: '' }, ...options];
  }, [periodSettings]);

  useEffect(() => {
    // Only auto-fill time if NOT in edit mode OR if user explicitly changes selection while editing
    // But we need to be careful not to overwrite custom time during edit load.
    // Let's rely on manual set for edit load, and this effect for new selection.
    if (selectedPeriodOption !== 'custom') {
      const option = PERIOD_OPTIONS.find(o => o.value === selectedPeriodOption);
      if (option) {
        setNewPeriodStartTime(option.start);
        setNewPeriodEndTime(option.end);
      }
    }
  }, [selectedPeriodOption, PERIOD_OPTIONS]);

  useEffect(() => {
    const fetchSpecialPeriods = async () => {
      if (!schoolId) return;
      try {
        const periodsCollectionRef = collection(db, 'school-settings', schoolId, 'special-periods');
        const querySnapshot = await getDocs(periodsCollectionRef);
        const periodsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as SpecialPeriod));
        setSpecialPeriods(periodsData);
      } catch (error) {
        console.error("Error fetching special periods: ", error);
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลคาบเรียนพิเศษได้', background: '#2a2b2f', color: '#ffffff' });
      }
    };

    const fetchPeriodSettings = async () => {
      if (!schoolId) return;
      try {
        const docRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().periods) {
          setPeriodSettings(docSnap.data().periods);
        } else {
          // Fallback to a default structure if not set
          const defaultPeriods: PeriodSetting[] = [
            { id: 'homeroom', label: 'โฮมรูม', startTime: '08.30', endTime: '08.40', isTeachingPeriod: false, isFixed: true }, { id: 'period-1', label: 'คาบที่ 1', startTime: '08.40', endTime: '09.30', isTeachingPeriod: true }, { id: 'period-2', label: 'คาบที่ 2', startTime: '09.30', endTime: '10.20', isTeachingPeriod: true }, { id: 'period-3', label: 'คาบที่ 3', startTime: '10.20', endTime: '11.10', isTeachingPeriod: true }, { id: 'period-4', label: 'คาบที่ 4', startTime: '11.10', endTime: '12.00', isTeachingPeriod: true }, { id: 'lunch', label: 'พักกลางวัน', startTime: '12.00', endTime: '13.00', isTeachingPeriod: false, isFixed: true }, { id: 'period-5', label: 'คาบที่ 5', startTime: '13.00', endTime: '13.50', isTeachingPeriod: true }, { id: 'period-6', label: 'คาบที่ 6', startTime: '13.50', endTime: '14.40', isTeachingPeriod: true }, { id: 'period-7', label: 'คาบที่ 7', startTime: '14.40', endTime: '15.30', isTeachingPeriod: true }, { id: 'period-8', label: 'คาบที่ 8', startTime: '15.30', endTime: '16.00', isTeachingPeriod: true },
          ];
          setPeriodSettings(defaultPeriods);
        }
      } catch (error) {
        console.error("Error fetching period settings: ", error);
      }
    };

    fetchSpecialPeriods();
    fetchPeriodSettings();
  }, [schoolId]);

  const handleTimeBlur = (value: string, setter: (val: string) => void) => {
    let normalized = value.replace(':', '.');
    // Basic validation? If user types 8.30 -> 08.30
    const parts = normalized.split('.');
    if (parts.length === 2) {
      const h = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      // Simple validation for ranges
      const hNum = parseInt(h);
      const mNum = parseInt(m);
      if (!isNaN(hNum) && !isNaN(mNum) && hNum >= 0 && hNum < 24 && mNum >= 0 && mNum < 60) {
        normalized = `${h}.${m}`;
      }
    }
    // Only update if it looks like a time. If user cleared it, leave it
    if (normalized.includes('.')) {
      setter(normalized);
    }
  };

  const resetForm = () => {
    setNewPeriodTitle("");
    setNewPeriodStartTime("");
    setNewPeriodEndTime("");
    setNewPeriodDay("all");
    setSelectedPeriodOption("custom");
    setEditingPeriodId(null);
  };

  const handleEditClick = (period: SpecialPeriod) => {
    setEditingPeriodId(period.id);
    setNewPeriodTitle(period.title);
    setNewPeriodStartTime(period.startTime);
    setNewPeriodEndTime(period.endTime);
    setNewPeriodDay(period.day || "all");

    // Check if it's linked
    if (period.linkedPeriodId) {
      setSelectedPeriodOption(period.linkedPeriodId);
    } else {
      setSelectedPeriodOption("custom");
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitSpecialPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPeriod) return;
    if (!newPeriodTitle || !newPeriodStartTime || !newPeriodEndTime) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณากรอกข้อมูลกิจกรรมพิเศษให้ครบถ้วน', background: '#2a2b2f', color: '#ffffff' });
      return;
    }
    setIsSubmittingPeriod(true);

    try {
      const periodData = {
        title: newPeriodTitle,
        startTime: newPeriodStartTime,
        endTime: newPeriodEndTime,
        day: newPeriodDay,
        // Save the link if it's not a custom time
        linkedPeriodId: selectedPeriodOption !== 'custom' ? selectedPeriodOption : (selectedPeriodOption === 'custom' ? null : null), // Ensure null if custom, but actually firestore prefers undefined to delete or null. Let's send null if unlinked.
      };
      // Clean up undefined/null for linkedPeriodId if needed
      if (selectedPeriodOption === 'custom') delete (periodData as any).linkedPeriodId;


      if (editingPeriodId) {
        // Update existing
        const docRef = doc(db, 'school-settings', schoolId, 'special-periods', editingPeriodId);
        await updateDoc(docRef, periodData);

        setSpecialPeriods(prev => prev.map(p => p.id === editingPeriodId ? { ...p, ...periodData, linkedPeriodId: selectedPeriodOption !== 'custom' ? selectedPeriodOption : undefined } : p));
        Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'บันทึกการแก้ไขเรียบร้อยแล้ว', background: '#2a2b2f', color: '#ffffff', timer: 1500, showConfirmButton: false });
      } else {
        // Add new
        const periodsCollectionRef = collection(db, 'school-settings', schoolId, 'special-periods');
        const docRef = await addDoc(periodsCollectionRef, { ...periodData, linkedPeriodId: selectedPeriodOption !== 'custom' ? selectedPeriodOption : undefined });
        setSpecialPeriods([...specialPeriods, { id: docRef.id, ...periodData, linkedPeriodId: selectedPeriodOption !== 'custom' ? selectedPeriodOption : undefined }]);
        Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'เพิ่มกิจกรรมพิเศษเรียบร้อยแล้ว', background: '#2a2b2f', color: '#ffffff', timer: 1500, showConfirmButton: false });
      }

      resetForm();
    } catch (error) {
      console.error("Error saving special period: ", error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้', background: '#2a2b2f', color: '#ffffff' });
    } finally {
      setIsSubmittingPeriod(false);
    }
  };

  const handleDeleteSpecialPeriod = async (periodId: string) => {
    if (editingPeriodId === periodId) {
      resetForm();
    }

    Swal.fire({
      title: 'ต้องการลบกิจกรรมนี้ใช่หรือไม่?',
      text: "การกระทำนี้ไม่สามารถย้อนกลับได้",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ใช่, ลบเลย!',
      cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f',
      color: '#ffffff'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const periodDocRef = doc(db, 'school-settings', schoolId, 'special-periods', periodId);
          await deleteDoc(periodDocRef);
          setSpecialPeriods(specialPeriods.filter(p => p.id !== periodId));
          Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', text: 'กิจกรรมพิเศษถูกลบแล้ว', background: '#2a2b2f', color: '#ffffff', timer: 1500, showConfirmButton: false });
        } catch (error) {
          console.error("Error deleting special period: ", error);
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถลบกิจกรรมพิเศษได้', background: '#2a2b2f', color: '#ffffff' });
        }
      }
    });
  };

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-6xl mx-auto">

          {/* Warning Banner for Synchronization */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 mb-6 rounded-r-lg shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  ข้อควรระวัง: การตั้งค่าคาบเรียน (Period Settings)
                </h3>
                <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  <p>
                    เวลารับ-เลิกของ "คาบเรียนพิเศษ" ที่เชื่อมโยงกับคาบหลัก จะถูกอัปเดตตามการตั้งค่าในหน้า
                    <Link to="/academic/period-settings" className="font-bold underline ml-1 hover:text-amber-900 dark:hover:text-amber-100">
                      ตั้งค่าคาบเรียน
                    </Link>
                  </p>
                  <p className="mt-1">
                    หากมีการปรับเปลี่ยน "ระยะเวลาการสอน" ในหน้านั้น กรุณาตรวจสอบความถูกต้องของเวลาในหน้านี้เสมอ เพื่อป้องกันตารางสอนคลาดเคลื่อน
                    <Link to="/academic/teacher-schedule" className="font-bold underline ml-1 hover:text-amber-900 dark:hover:text-amber-100">
                      ตั้งค่าคาบเรียน
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <BackButton to="/academic/hub/scheduling" />
          </div>

          {/* Special Period Management Section */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm dark:shadow-none border border-gray-100 dark:border-gray-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📅</span> จัดการคาบเรียนพิเศษ
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  กำหนดกิจกรรมที่เกิดขึ้นประจำ เช่น โฮมรูม หรือ พักกลางวัน เพื่อกันเวลาในตารางสอน
                </p>
              </div>
            </div>

            <div className={`bg-gray-50 dark:bg-[#202125] rounded-xl p-5 mb-8 border transition-all duration-300 ${editingPeriodId ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {editingPeriodId ? '✏️ แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมใหม่'}
                </h3>
                {editingPeriodId && (
                  <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    ยกเลิกการแก้ไข
                  </button>
                )}
              </div>
              <form onSubmit={handleSubmitSpecialPeriod} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
                  {/* Title Input */}
                  <div className="lg:col-span-4">
                    <label htmlFor="newPeriodTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ชื่อกิจกรรม</label>
                    <input
                      type="text"
                      id="newPeriodTitle"
                      value={newPeriodTitle}
                      onChange={(e) => setNewPeriodTitle(e.target.value)}
                      className="w-full bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                      placeholder="เช่น โฮมรูม, ประชุมระดับ"
                    />
                  </div>

                  {/* Day Select */}
                  <div className="lg:col-span-2">
                    <label htmlFor="newPeriodDay" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">วัน</label>
                    <select
                      id="newPeriodDay"
                      value={newPeriodDay}
                      onChange={(e) => setNewPeriodDay(e.target.value)}
                      className="w-full bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                    >
                      {DAY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Period Option Select */}
                  <div className="lg:col-span-3">
                    <label htmlFor="periodOption" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ช่วงเวลา</label>
                    <select
                      id="periodOption"
                      value={selectedPeriodOption}
                      onChange={(e) => setSelectedPeriodOption(e.target.value)}
                      className="w-full bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                    >
                      {PERIOD_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Time Inputs */}
                  <div className="lg:col-span-3 grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="newPeriodStartTime" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">เริ่ม</label>
                      <input
                        type="text"
                        placeholder="00.00"
                        id="newPeriodStartTime"
                        value={newPeriodStartTime}
                        onChange={(e) => setNewPeriodStartTime(e.target.value)}
                        onBlur={(e) => handleTimeBlur(e.target.value, setNewPeriodStartTime)}
                        className="w-full bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2.5 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800 transition-colors"
                        disabled={selectedPeriodOption !== 'custom'}
                      />
                    </div>
                    <div>
                      <label htmlFor="newPeriodEndTime" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">สิ้นสุด</label>
                      <input
                        type="text"
                        placeholder="00.00"
                        id="newPeriodEndTime"
                        value={newPeriodEndTime}
                        onChange={(e) => setNewPeriodEndTime(e.target.value)}
                        onBlur={(e) => handleTimeBlur(e.target.value, setNewPeriodEndTime)}
                        className="w-full bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2.5 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800 transition-colors"
                        disabled={selectedPeriodOption !== 'custom'}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 gap-3">
                  {editingPeriodId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      ยกเลิก
                    </button>
                  )}
                  <button
                    type="submit"
                    className={`min-w-[140px] md:w-auto font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${editingPeriodId ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                    disabled={isSubmittingPeriod}
                  >
                    {isSubmittingPeriod ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <>
                        <span>{editingPeriodId ? 'บันทึกการแก้ไข' : '+ เพิ่มกิจกรรม'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                <span>📋</span> รายการกิจกรรมพิเศษ ({specialPeriods.length})
              </h3>

              {specialPeriods.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {specialPeriods.map(period => {
                    const dayLabel = DAY_OPTIONS.find(d => d.value === (period.day || 'all'))?.label;
                    const isAllDays = period.day === 'all' || !period.day;

                    // Dynamic time calculation
                    let displayStartTime = period.startTime;
                    let displayEndTime = period.endTime;

                    if (period.linkedPeriodId) {
                      const linkedPeriod = periodSettings.find(p => p.id === period.linkedPeriodId);
                      if (linkedPeriod) {
                        displayStartTime = linkedPeriod.startTime;
                        displayEndTime = linkedPeriod.endTime;
                      }
                    }

                    return (
                      <div key={period.id} className={`bg-white dark:bg-[#1e1f21] border rounded-xl p-4 shadow-sm hover:shadow-md transition-all relative group ${editingPeriodId === period.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-lg text-gray-800 dark:text-white truncate pr-16">{period.title}</h4>
                          <div className="absolute top-3 right-3 flex gap-1">
                            <button
                              onClick={() => handleEditClick(period)}
                              className="text-gray-400 hover:text-indigo-500 transition-colors p-1.5 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                              title="แก้ไข"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
                            <button
                              onClick={() => handleDeleteSpecialPeriod(period.id)}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="ลบกิจกรรม"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isAllDays ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'}`}>
                            {isAllDays ? '📅 ทุกวัน' : `📅 ${dayLabel}`}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                            ⏰ {displayStartTime} - {displayEndTime}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 bg-gray-50 dark:bg-[#202125] rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400">ยังไม่มีกิจกรรมพิเศษที่ถูกเพิ่ม</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">เริ่มเพิ่มกิจกรรมโดยใช้ฟอร์มด้านบน</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SpecialPeriodManagementPage;