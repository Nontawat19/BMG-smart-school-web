import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import MainLayout from "@/layouts/MainLayout";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { firestore as db } from '@/firebase';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { CLASSES } from '@/utils/schoolUtils';

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
  linkedPeriodId?: string;
}

interface Course {
  id: string;
  title: string;
  code: string;
  classId?: string | string[];
}

interface PeriodSetting {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
}

const ScheduleManagementPage: React.FC = () => {
  const exportRef = useRef<HTMLDivElement>(null);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [schedule, setSchedule] = useState<Record<string, any>>({});
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  useEffect(() => {
    const fetchData = async () => {
      if (!schoolId || !(currentUser as any)?.uid) return;
      try {
        // Fetch Special Periods
        const periodsRef = collection(db, 'school-settings', schoolId, 'special-periods');
        const periodsSnap = await getDocs(periodsRef);
        setSpecialPeriods(periodsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpecialPeriod)));

        // Fetch Schedule Settings
        const settingsRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists() && settingsSnap.data().periods) {
          setPeriodSettings(settingsSnap.data().periods);
        }

        // Fetch Teacher's Actual Schedule
        const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
        const q = query(schedulesRef, where('teacherId', '==', (currentUser as any).uid));
        const schedulesSnap = await getDocs(q);

        const combinedSchedule: Record<string, any> = {};
        schedulesSnap.forEach(doc => {
          const data = doc.data();
          const classSchedule = data.schedule || {};
          Object.keys(classSchedule).forEach(slot => {
            if (classSchedule[slot]) {
              combinedSchedule[slot] = {
                ...classSchedule[slot],
                classId: data.classId
              };
            }
          });
        });
        setSchedule(combinedSchedule);

      } catch (error) {
        console.error("Error fetching data: ", error);
      }
    };

    fetchData();
  }, [schoolId, currentUser]);

  const handleExportImage = async () => {
    if (!exportRef.current) return;

    try {
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });

      const link = document.createElement('a');
      link.download = 'ตารางสอน_ภาคเรียนที่1_2568.png';
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const daysMap: Record<string, string> = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };
  const days = Object.keys(daysMap);

  const displayPeriods = periodSettings.length > 0 ? periodSettings : [
    { id: 'homeroom', label: 'โฮมรูม', startTime: '08:30', endTime: '08:40', isTeachingPeriod: false },
    { id: 'period-1', label: 'คาบที่ 1', startTime: '08.40', endTime: '09.30', isTeachingPeriod: true },
    { id: 'period-2', label: 'คาบที่ 2', startTime: '09.30', endTime: '10.20', isTeachingPeriod: true },
    { id: 'period-3', label: 'คาบที่ 3', startTime: '10.20', endTime: '11.10', isTeachingPeriod: true },
    { id: 'period-4', label: 'คาบที่ 4', startTime: '11.10', endTime: '12.00', isTeachingPeriod: true },
    { id: 'lunch', label: 'พักกลางวัน', startTime: '12.00', endTime: '13.00', isTeachingPeriod: false },
    { id: 'period-5', label: 'คาบที่ 5', startTime: '13.00', endTime: '13.50', isTeachingPeriod: true },
    { id: 'period-6', label: 'คาบที่ 6', startTime: '13.50', endTime: '14.40', isTeachingPeriod: true },
    { id: 'period-7', label: 'คาบที่ 7', startTime: '14.40', endTime: '15.30', isTeachingPeriod: true },
    { id: 'period-8', label: 'คาบที่ 8', startTime: '15.30', endTime: '16.00', isTeachingPeriod: true },
  ];

  const totalTeachingHours = Object.keys(schedule).length;

  const specialPeriodsMap = new Map<string, string>();
  specialPeriods.forEach(p => {
    const key = `${p.startTime.replace(':', '.')} - ${p.endTime.replace(':', '.')}`;
    specialPeriodsMap.set(key, p.title);
  });

  return (
    <MainLayout>
      <div className="p-6 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="flex justify-between mb-6">
          <Link to="/academic/hub/scheduling" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300">
            &larr; กลับหน้าบริหารวิชาการ
          </Link>

          <button
            onClick={handleExportImage}
            className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg"
          >
            ส่งออกรูปภาพตารางสอน
          </button>
        </div>

        <div className="flex justify-center">
          <div
            ref={exportRef}
            className="bg-white text-black p-6"
            style={{ width: '1100px' }}
          >
            <div className="text-right text-sm mb-2">
              16/05/2568
            </div>

            <div className="text-center mb-4 leading-7">
              <div className="font-bold text-lg">
                ตารางสอนคุณครู {(currentUser as any)?.name || ''}
              </div>
              <div>
                ครูที่ปรึกษาชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2568
              </div>
              <div>
                โรงเรียนบ้านแก้งปิง ตำบลไชยบุรี อำเภอท่าคันโท จังหวัดกาฬสินธุ์
              </div>
              <div>
                สำนักงานเขตพื้นที่การศึกษาประถมศึกษากาฬสินธุ์ เขต 2
              </div>
            </div>

            <table className="w-full border border-black text-sm table-fixed">
              <thead>
                <tr>
                  <th className="border border-black p-2 w-[8%] bg-gray-50">วัน / เวลา</th>
                  {displayPeriods.map((p, idx) => (
                    <th key={p.id} className={`border border-black p-1 text-[10px] bg-gray-50 ${idx === 5 || idx === 0 ? 'w-[6%]' : ''}`}>
                      {p.label}<br />{p.startTime} - {p.endTime}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {days.map(dayKey => (
                  <tr key={dayKey}>
                    <td className="border border-black p-2 font-bold bg-gray-50 text-center">
                      {daysMap[dayKey]}
                    </td>
                    {displayPeriods.map((p) => {
                      const periodNum = p.id.replace('period-', '');
                      const slotId = `${dayKey}-${periodNum}`;
                      const course = schedule[slotId];
                      const special = specialPeriods.find(sp =>
                        (sp.linkedPeriodId === p.id && (!sp.day || sp.day === 'all' || sp.day === dayKey)) ||
                        (sp.startTime === p.startTime && sp.endTime === p.endTime && (!sp.day || sp.day === 'all' || sp.day === dayKey))
                      );

                      return (
                        <td key={p.id} className="border border-black p-1 h-20 align-top text-center relative overflow-hidden">
                          {course ? (
                            <div className="flex flex-col h-full justify-between py-1">
                              <div className="font-bold text-[11px] leading-tight">{course.title}</div>
                              <div className="text-[9px] text-gray-600">{course.code}</div>
                              <div className="text-[10px] font-medium bg-gray-100 rounded py-0.5 mt-auto">
                                {Array.isArray(course.classId)
                                  ? course.classId.map((cid: string) => CLASSES[cid] || cid).join(',')
                                  : (CLASSES[course.classId] || course.classId)}
                              </div>
                            </div>
                          ) : special ? (
                            <div className="flex items-center justify-center h-full text-[10px] text-gray-500 font-medium italic">
                              {special.title}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-3 text-center mt-10 text-sm">
              <div>
                (ลงชื่อ)........................................<br />
                ครูผู้สอน
              </div>
              <div>
                (ลงชื่อ)........................................<br />
                หัวหน้าวิชาการ
              </div>
              <div>
                (ลงชื่อ)........................................<br />
                ผู้อำนวยการโรงเรียน
              </div>
            </div>

            <div className="text-right mt-4 text-sm font-bold">
              จำนวน {totalTeachingHours} คาบ / สัปดาห์
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ScheduleManagementPage;
