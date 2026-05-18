import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { firestore as db } from '../../firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import Swal from 'sweetalert2';
import { Save, Clock, Plus, Trash2, Lock } from 'lucide-react';
import { normalizePeriodSettings } from '@/utils/scheduleDisplayUtils';

interface PeriodSetting {
  id: string; // e.g., 'homeroom', 'period-1', 'lunch'
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
  isFixed?: boolean; // To mark periods like homeroom/lunch as non-editable
}

const DEFAULT_PERIODS: (PeriodSetting & { index: number })[] = [
  { id: 'homeroom', label: 'โฮมรูม', startTime: '08.30', endTime: '08.40', isTeachingPeriod: false, index: 0 },
  { id: 'period-1', label: 'คาบที่ 1', startTime: '08.40', endTime: '09.30', isTeachingPeriod: true, index: 1 },
  { id: 'period-2', label: 'คาบที่ 2', startTime: '09.30', endTime: '10.20', isTeachingPeriod: true, index: 2 },
  { id: 'period-3', label: 'คาบที่ 3', startTime: '10.20', endTime: '11.10', isTeachingPeriod: true, index: 3 },
  { id: 'period-4', label: 'คาบที่ 4', startTime: '11.10', endTime: '12.00', isTeachingPeriod: true, index: 4 },
  { id: 'lunch', label: 'พักกลางวัน', startTime: '12.00', endTime: '13.00', isTeachingPeriod: false, index: 5 },
  { id: 'period-5', label: 'คาบที่ 5', startTime: '13.00', endTime: '13.50', isTeachingPeriod: true, index: 6 },
  { id: 'period-6', label: 'คาบที่ 6', startTime: '13.50', endTime: '14.40', isTeachingPeriod: true, index: 7 },
  { id: 'period-7', label: 'คาบที่ 7', startTime: '14.40', endTime: '15.30', isTeachingPeriod: true, index: 8 },
  { id: 'period-8', label: 'คาบที่ 8', startTime: '15.30', endTime: '16.00', isTeachingPeriod: true, index: 9 },
];

const PeriodSettingsPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  const [periods, setPeriods] = useState<PeriodSetting[]>(DEFAULT_PERIODS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [schoolStartTime, setSchoolStartTime] = useState('08.40');
  const [durationPreset, setDurationPreset] = useState<string>('custom');

  const fetchSettings = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const docRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.periods) {
          setPeriods(normalizePeriodSettings(data.periods));
        }
        // Load saved quick settings
        setSchoolStartTime(data.schoolStartTime || '08:40');
        setDurationPreset(data.durationPreset || 'custom');
      } else {
        setPeriods(normalizePeriodSettings(DEFAULT_PERIODS)); // Set default if not found
      }
    } catch (error) {
      console.error("Error fetching period settings: ", error);
      Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลการตั้งค่าคาบเรียนได้' });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handlePeriodChange = (index: number, field: keyof PeriodSetting, value: string | boolean) => {
    const newPeriods = [...periods];
    (newPeriods[index] as any)[field] = value;
    setPeriods(newPeriods);
  };

  const handleTimeBlur = (value: string, setter: (val: string) => void) => {
    let normalized = value.replace(':', '.');
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

  const handlePeriodTimeBlur = (index: number, field: 'startTime' | 'endTime', value: string) => {
    let normalized = value.replace(':', '.');
    const parts = normalized.split('.');
    if (parts.length === 2) {
      const h = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const hNum = parseInt(h);
      const mNum = parseInt(m);
      if (!isNaN(hNum) && !isNaN(mNum) && hNum >= 0 && hNum < 24 && mNum >= 0 && mNum < 60) {
        normalized = `${h}.${m}`;
      }
    }
    handlePeriodChange(index, field, normalized);
    if (durationPreset !== 'custom') {
      setDurationPreset('custom');
    }
  };

  const calculatePeriods = (startTime: string, preset: string) => {
    const duration = parseInt(preset, 10);
    if (isNaN(duration)) return null;

    const newPeriods: PeriodSetting[] = [];
    let periodCount = 1;

    // Helper to add minutes
    const addMinutes = (time: string, minutes: number): string => {
      const [hours, mins] = time.replace('.', ':').split(':').map(Number);
      const date = new Date();
      date.setHours(hours, mins + minutes, 0, 0);
      const newHours = String(date.getHours()).padStart(2, '0');
      const newMins = String(date.getMinutes()).padStart(2, '0');
      return `${newHours}.${newMins}`;
    };

    // Helper to check time order
    const isTimeAfterOrEqual = (time1: string, time2: string): boolean => {
      const [h1, m1] = time1.replace('.', ':').split(':').map(Number);
      const [h2, m2] = time2.replace('.', ':').split(':').map(Number);
      return (h1 * 60 + m1) >= (h2 * 60 + m2);
    };

    const isAfter1600 = (time: string): boolean => {
      return isTimeAfterOrEqual(time, '16.01');
    };

    // 1. Homeroom (Fixed relative to start, or Fixed 08:30-08:40? Default said 08:30-08:40)
    // User requirement: "Change from PeriodSettingsPage... 60 mins/period... calculations change".
    // Usually Homeroom is fixed. Let's keep it fixed at 08.30-08.40 as per default, 
    // BUT the user might change schoolStartTime.
    // If schoolStartTime is 08.40 (default), then P1 starts at 08.40.
    // Let's assume Homeroom is always there as the first item, fixed.

    newPeriods.push({
      id: 'homeroom',
      label: 'โฮมรูม',
      startTime: '08.30',
      endTime: '08.40',
      isTeachingPeriod: false
    });

    let currentTime = startTime.replace(':', '.');

    // 2. Morning Session (Until 12.00)
    const LUNCH_START = '12.00';
    const LUNCH_END = '13.00';

    while (true) {
      if (isAfter1600(currentTime)) break; // Safety break
      if (isTimeAfterOrEqual(currentTime, LUNCH_START)) break; // Reached lunch

      const endTime = addMinutes(currentTime, duration);

      // Check if this period would exceed lunch start significantly? 
      // Or just cut it off? Usually periods fit. 
      // If endTime > 12.00, should we allow it? 
      // Let's Start strict: If start is before 12.00, it's a morning period.
      // But if endTime goes way past 12.00 (e.g. 12.30), maybe it shouldn't exist or should be lunch?
      // User said "Lunch is fixed".
      // Let's assume if it overlaps Lunch, we stop morning session.

      if (isTimeAfterOrEqual(endTime, '12.01') && !isTimeAfterOrEqual(currentTime, '12.00')) {
        // Overlaps into lunch drastically? 
        // If it ends exactly at 12.00 or slightly before, it's fine.
        // If it ends at 12.10, that eats into lunch.
        // Let's stop adding periods if the NEXT period would end after 12.00.
        // WAIT, strict constraint: Lunch starts at 12.00.
        if (isTimeAfterOrEqual(endTime, '12.01')) {
          break;
        }
      }

      newPeriods.push({
        id: `period-${periodCount}`,
        label: `คาบที่ ${periodCount}`,
        startTime: currentTime,
        endTime: endTime,
        isTeachingPeriod: true
      });

      currentTime = endTime;
      periodCount++;
    }

    // 3. Lunch (Fixed)
    newPeriods.push({
      id: 'lunch',
      label: 'พักกลางวัน',
      startTime: LUNCH_START,
      endTime: LUNCH_END,
      isTeachingPeriod: false
    });

    currentTime = LUNCH_END;

    // 4. Afternoon Session (Until 16.00)
    while (true) {
      if (isAfter1600(currentTime)) break;

      const endTime = addMinutes(currentTime, duration);

      if (isAfter1600(endTime)) {
        // If it exceeds 16.00, do we add it and cap it? or discard?
        // "Cannot exceed 16.00".
        // If we cap it, the duration is shorter. 
        // If we discard it, we have a gap?
        // Usually we discard if it doesn't fit a full period or major part of it.
        // Let's discard if it exceeds 16.00 to strictly follow "not exceed 16.00".
        break;
      }

      newPeriods.push({
        id: `period-${periodCount}`,
        label: `คาบที่ ${periodCount}`,
        startTime: currentTime,
        endTime: endTime,
        isTeachingPeriod: true
      });

      currentTime = endTime;
      periodCount++;
    }

    const finalPeriods = newPeriods.map((p, idx) => ({ ...p, index: idx }));
    return finalPeriods;
  };

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      setDurationPreset('custom');
      return;
    }

    // Capture previous selection implicitly by not setting it yet
    Swal.fire({
      title: 'ยืนยันการเปลี่ยนระยะเวลา?',
      html: `
            <div class="text-left text-sm">
                <p class="mb-2">การเปลี่ยนระยะเวลาคาบเรียนจะทำการ <b>"สร้างรายการคาบเรียนใหม่ทั้งหมด"</b></p>
                <p class="mb-2 text-red-500 font-bold">⚠️ ผลกระทบที่อาจเกิดขึ้น:</p>
                <ul class="list-disc pl-5 mb-2">
                    <li>คาบเรียนพิเศษที่มีอยู่เดิมอาจมีเวลาคาลาดเคลื่อน</li>
                    <li>ตารางสอนครูและนักเรียนอาจแสดงผลผิดพลาด</li>
                </ul>
                <p>กรุณาตรวจสอบความถูกต้องของ "คาบเรียนพิเศษ" และ "ตารางสอน" หลังจากกดบันทึก</p>
            </div>
        `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#d33',
      confirmButtonText: 'เข้าใจและยืนยัน',
      cancelButtonText: 'ยกเลิก'
    }).then((result) => {
      if (result.isConfirmed) {
        setDurationPreset(preset); // Update state on confirm
        const newPeriods = calculatePeriods(schoolStartTime, preset);
        if (newPeriods) {
          setPeriods(newPeriods);
          // setIsDirty(true); // State not defined, removing
          Swal.fire({
            title: 'คำนวณคาบเรียนใหม่แล้ว',
            text: 'อย่าลืมกด "บันทึกการตั้งค่า" เพื่อยืนยันการเปลี่ยนแปลงลงฐานข้อมูล',
            icon: 'success',
            timer: 3000
          });
        }
      }
    });
  };

  // Effect to recalculate periods when schoolStartTime changes (if preset is active)
  useEffect(() => {
    if (durationPreset !== 'custom') {
      const newPeriods = calculatePeriods(schoolStartTime, durationPreset);
      if (newPeriods) setPeriods(newPeriods);
    }
  }, [schoolStartTime]);

  const addPeriod = () => {
    // Find the max period number to ensure unique IDs
    let maxIdNum = 0;
    periods.forEach(p => {
      if (p.id.startsWith('period-')) {
        const num = parseInt(p.id.replace('period-', ''));
        if (!isNaN(num) && num > maxIdNum) {
          maxIdNum = num;
        }
      }
    });

    const nextNum = maxIdNum + 1;
    const teachingPeriodsCount = periods.filter(p => p.isTeachingPeriod).length;

    setPeriods([...periods, {
      id: `period-${nextNum}`,
      label: `คาบที่ ${teachingPeriodsCount + 1}`, // Label can be sequential based on count
      startTime: '',
      endTime: '',
      isTeachingPeriod: true,
    }]);
    if (durationPreset !== 'custom') {
      setDurationPreset('custom');
    }
  };

  const removePeriod = (index: number) => {
    if (periods.length <= 1) {
      Swal.fire('ไม่สามารถลบได้', 'ต้องมีอย่างน้อย 1 คาบเรียน', 'warning');
      return;
    }
    const newPeriods = periods.filter((_, i) => i !== index);
    setPeriods(newPeriods);
    if (durationPreset !== 'custom') {
      setDurationPreset('custom');
    }
  };

  const handleSave = async () => {
    if (!schoolId) return;

    // No time limit validation requested

    setIsSubmitting(true);
    try {
      const indexedPeriods = normalizePeriodSettings(periods).map((p, idx) => ({
        ...p,
        index: idx,
        order: idx,
        isTeachingPeriod: !!p.isTeachingPeriod,
        isTeaching: !!p.isTeachingPeriod,
      }));
      const docRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
      await setDoc(docRef, {
        periods: indexedPeriods,
        schoolStartTime,
        durationPreset,
        updatedAt: serverTimestamp()
      });

      // --- Cascade Update: Sync Linked Special Periods ---
      // 1. Get all special periods that have a linkedPeriodId
      const specialPeriodsRef = collection(db, 'school-settings', schoolId, 'special-periods');
      // We can't query by != null easily in simpler queries, so let's get all and filter in memory or query if possible.
      // Or just get all. Special periods shouldn't be too many.
      const specialPeriodsSnap = await getDocs(specialPeriodsRef);

      if (!specialPeriodsSnap.empty) {
        const batch = writeBatch(db);
        let updateCount = 0;

        specialPeriodsSnap.forEach(doc => {
          const data = doc.data();
          if (data.linkedPeriodId) {
            // Find the new settings for this linked period
            const newPeriodSetting = periods.find(p => p.id === data.linkedPeriodId);
            if (newPeriodSetting) {
              // Check if times are different
              if (data.startTime !== newPeriodSetting.startTime || data.endTime !== newPeriodSetting.endTime) {
                batch.update(doc.ref, {
                  startTime: newPeriodSetting.startTime,
                  endTime: newPeriodSetting.endTime
                });
                updateCount++;
              }
            }
          }
        });

        if (updateCount > 0) {
          await batch.commit();
          console.log(`Updated ${updateCount} linked special periods.`);
        }
      }
      // --------------------------------------------------

      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'ตั้งค่าคาบเรียนเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error("Error saving period settings: ", error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกการตั้งค่าได้' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <BackButton to="/academic/hub/settings" />
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <Clock size={32} />
                </div>
                ตั้งค่าคาบเรียน
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg">กำหนดช่วงเวลาของแต่ละคาบเรียนสำหรับโรงเรียนของคุณ</p>
            </div>
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:bg-gray-400 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
            >
              <Save size={20} />
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Quick Settings & Info */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 sticky top-24">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                  ตั้งค่าด่วน
                </h3>

                <div className="space-y-5">
                  <div>
                    <label htmlFor="school-start-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">เวลาเริ่มเรียนคาบแรก (08.40)</label>
                    <input
                      id="school-start-time"
                      type="text"
                      placeholder="08.40"
                      value={schoolStartTime}
                      onChange={(e) => setSchoolStartTime(e.target.value)}
                      onBlur={(e) => handleTimeBlur(e.target.value, setSchoolStartTime)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label htmlFor="duration-preset" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">กำหนดระยะเวลาการสอน</label>
                    <select
                      id="duration-preset"
                      value={durationPreset}
                      onChange={(e) => handlePresetChange(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="custom">-- กำหนดเอง --</option>
                      <option value="40">40 นาที / คาบ</option>
                      <option value="50">50 นาที / คาบ</option>
                      <option value="60">60 นาที / คาบ</option>
                    </select>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                    <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">
                      <span className="font-bold">Tip:</span> การเลือกตัวเลือก "กำหนดระยะเวลาอัตโนมัติ" จะช่วยคำนวณเวลาสิ้นสุดของแต่ละคาบให้โดยอัตโนมัติ โดยเริ่มนับจากเวลาเริ่มเรียนคาบแรก
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Period List */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                  <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                  รายการคาบเรียน
                </h3>

                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse"></div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {periods.map((period, index) => {

                      return (
                        <div
                          key={index}
                          className={`group relative p-5 rounded-2xl border transition-all duration-200 ${period.id === 'lunch'
                            ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800/30'
                            : period.id === 'homeroom'
                              ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30'
                              : 'bg-white dark:bg-[#2a2b2f] border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md'
                            }`}
                        >

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                            <div className="sm:col-span-5">
                              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">ชื่อคาบ</label>
                              <input
                                type="text"
                                value={period.label}
                                onChange={(e) => handlePeriodChange(index, 'label', e.target.value)}
                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              />
                            </div>

                            <div className="sm:col-span-3">
                              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">เริ่ม</label>
                              <input
                                type="text"
                                placeholder="00.00"
                                value={period.startTime}
                                onChange={(e) => handlePeriodChange(index, 'startTime', e.target.value)}
                                onBlur={(e) => handlePeriodTimeBlur(index, 'startTime', e.target.value)}
                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-2 py-2.5 text-sm text-center font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              />
                            </div>

                            <div className="sm:col-span-3">
                              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">สิ้นสุด</label>
                              <input
                                type="text"
                                placeholder="00.00"
                                value={period.endTime}
                                onChange={(e) => handlePeriodChange(index, 'endTime', e.target.value)}
                                onBlur={(e) => handlePeriodTimeBlur(index, 'endTime', e.target.value)}
                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-2 py-2.5 text-sm text-center font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              />
                            </div>

                            <div className="sm:col-span-1 flex justify-center sm:justify-end pb-1">
                                <button
                                  type="button"
                                  onClick={() => removePeriod(index)}
                                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                  title="ลบคาบเรียน"
                                >
                                  <Trash2 size={18} />
                                </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={addPeriod}
                      className="w-full mt-6 py-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all flex items-center justify-center gap-2 font-bold group"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30 flex items-center justify-center transition-colors">
                        <Plus size={18} />
                      </div>
                      เพิ่มคาบเรียนใหม่
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default PeriodSettingsPage;
