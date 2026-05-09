import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { firestore as db } from '../../firebase';
import { collection, addDoc } from 'firebase/firestore';
import MainLayout from "@/layouts/MainLayout";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Swal from 'sweetalert2';

const DAYS = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };
const PERIODS = Array.from({ length: 8 }, (_, i) => i + 1);

const AddTeacherPage: React.FC = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [unavailableSlots, setUnavailableSlots] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  
  const handleUnavailableSlotChange = (slotId: string) => {
    setUnavailableSlots(prev =>
      prev.includes(slotId) ? prev.filter(s => s !== slotId) : [...prev, slotId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!schoolId) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่พบรหัสโรงเรียน ไม่สามารถบันทึกข้อมูลได้', background: '#2a2b2f', color: '#ffffff' });
      return;
    }

    setIsSubmitting(true);

    try {
      const teacherData = {
        firstName,
        lastName,
        title,
        email,
        createdAt: new Date(),
        schedulingPreferences: {
          unavailableSlots: unavailableSlots,
        },
      };

      await addDoc(collection(db, 'school-settings', schoolId, 'teachers'), teacherData);
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มข้อมูลครูสำเร็จ!',
        background: '#2a2b2f',
        color: '#ffffff',
        timer: 2000,
        showConfirmButton: false,
      });
      navigate(`/school/${schoolId}/teachers`);
    } catch (error) {
      console.error('Error adding teacher: ', error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'เกิดข้อผิดพลาดในการเพิ่มข้อมูลครู', background: '#2a2b2f', color: '#ffffff' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex justify-center p-4 text-gray-900 dark:text-white transition-colors duration-300">
      <div className="w-full max-w-4xl">
        <div className="mb-6">
          <Link to={schoolId ? `/school/${schoolId}/teachers` : '/academic-admin'} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300">
            &larr; กลับไปหน้ารายชื่อครู
          </Link>
        </div>

        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm dark:shadow-none">
          <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">เพิ่มข้อมูลครู</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Teacher Info Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">คำนำหน้า</label>
                    <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"/>
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อจริง</label>
                        <input type="text" id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"/>
                    </div>
                    <div>
                        <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">นามสกุล</label>
                        <input type="text" id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"/>
                    </div>
                </div>
            </div>
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">อีเมล</label>
                <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"/>
            </div>

            {/* Scheduling Preferences */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">การตั้งค่าตารางสอน (ไม่บังคับ)</label>
              <div className="bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">คลิกเลือกคาบที่ต้องการกำหนดให้เป็น "คาบว่าง" หรือคาบที่ไม่สะดวกสอน</p>
                <div className="table-responsive">
                  <table className="w-full border-collapse text-center text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 border-b border-gray-300 dark:border-gray-700 font-normal text-gray-600 dark:text-gray-400">วัน/คาบ</th>
                        {PERIODS.map(period => (
                          <th key={period} className="p-2 border-b border-gray-300 dark:border-gray-700 font-normal text-gray-600 dark:text-gray-400">{period}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(DAYS).map(([dayKey, dayName]) => (
                        <tr key={dayKey}>
                          <td className="p-2 font-semibold border-r border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white">{dayName}</td>
                          {PERIODS.map(period => {
                            const slotId = `${dayKey}-${period}`;
                            const isSelected = unavailableSlots.includes(slotId);
                            return (
                              <td key={slotId} className="p-1">
                                <div onClick={() => handleUnavailableSlotChange(slotId)} className={`w-full h-10 rounded-md cursor-pointer flex items-center justify-center transition-colors ${isSelected ? 'bg-yellow-500 text-black' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                                  {isSelected && 'ว่าง'}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-300 disabled:bg-gray-500"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูลครู'}
              </button>
            </div>
          </form>
        </div>
      </div>
      </div>
    </MainLayout>
  );
};

export default AddTeacherPage;