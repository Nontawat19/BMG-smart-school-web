import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { firestore as db } from '../../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import MainLayout from "@/layouts/MainLayout";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Swal from 'sweetalert2';
import { PlusCircle, Trash2, ClipboardList, Edit2, X, Check, ListPlus, Star, Info, LayoutGrid, ChevronDown, ChevronUp } from 'lucide-react';
import BackButton from '@/components/Shared/BackButton';

interface DesiredCharacteristic {
  id: string;
  title: string;
  indicators?: string[];
  createdAt: any;
}

const AddDesiredCharacteristicsPage: React.FC = () => {
  const [title, setTitle] = useState('');
  const [indicators, setIndicators] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [characteristics, setCharacteristics] = useState<DesiredCharacteristic[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  
  const formRef = useRef<HTMLDivElement>(null);
  
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  const fetchCharacteristics = useCallback(async () => {
    if (!schoolId) return;
    try {
      const q = query(
        collection(db, 'school-settings', schoolId, 'desired-characteristics'),
        orderBy('createdAt', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DesiredCharacteristic[];
      setCharacteristics(list);
    } catch (error) {
      console.error("Error fetching characteristics:", error);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchCharacteristics();
  }, [schoolId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!title) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'กรุณากรอกหัวข้อคุณลักษณะ', background: '#2a2b2f', color: '#ffffff' });
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        title,
        indicators: indicators.filter(ind => ind.trim() !== ''),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'school-settings', schoolId, 'desired-characteristics', editingId), data);
      } else {
        await addDoc(collection(db, 'school-settings', schoolId, 'desired-characteristics'), {
          ...data,
          createdAt: serverTimestamp(),
        });
      }
      
      Swal.fire({ 
        icon: 'success', 
        title: editingId ? 'อัปเดตสำเร็จ!' : 'บันทึกสำเร็จ!', 
        background: '#2a2b2f', 
        color: '#ffffff', 
        timer: 1500, 
        showConfirmButton: false 
      });
      
      resetForm();
      fetchCharacteristics();
    } catch (error) {
      console.error('Error adding characteristic: ', error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้', background: '#2a2b2f', color: '#ffffff' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setIndicators(['']);
    setEditingId(null);
  };

  const addIndicator = () => {
    setIndicators(prev => [...prev, '']);
    // เลื่อนไปโฟกัสที่ช่องใหม่ (Optional: สามารถเพิ่ม ref เพื่อ focus ได้)
    setTimeout(() => {
      const textareas = document.querySelectorAll('textarea');
      (textareas[textareas.length - 1] as HTMLElement)?.focus();
    }, 0);
  };

  const updateIndicator = (index: number, value: string) => {
    const newIndicators = [...indicators];
    newIndicators[index] = value;
    setIndicators(newIndicators);
  };

  const removeIndicator = (index: number) => {
    setIndicators(indicators.filter((_, i) => i !== index));
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleEdit = (item: DesiredCharacteristic) => {
    setEditingId(item.id);
    setTitle(item.title);
    setIndicators(item.indicators && item.indicators.length > 0 ? item.indicators : ['']);
    setExpandedIds(prev => ({ ...prev, [item.id]: true }));
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const cancelEdit = () => {
    resetForm();
  };

  const getCharacteristicIndex = () => {
    if (editingId) {
      const index = characteristics.findIndex(c => c.id === editingId);
      return index !== -1 ? index + 1 : characteristics.length + 1;
    }
    return characteristics.length + 1;
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: "คุณต้องการลบคุณลักษณะนี้ใช่หรือไม่?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ลบเลย',
      cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f',
      color: '#ffffff'
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'school-settings', schoolId, 'desired-characteristics', id));
        fetchCharacteristics();
        Swal.fire({ title: 'ลบสำเร็จ!', icon: 'success', background: '#2a2b2f', color: '#ffffff' });
      } catch (error) {
        Swal.fire({ title: 'เกิดข้อผิดพลาด', icon: 'error', background: '#2a2b2f', color: '#ffffff' });
      }
    }
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-8 text-gray-900 dark:text-white transition-colors duration-300">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-gray-200 dark:border-gray-700 pb-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs uppercase tracking-widest mb-1">
              <Star size={16} fill="currentColor" />
              <span>ฝ่ายบริหารงานวิชาการ</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              คุณลักษณะที่พึงประสงค์
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-base">
              กำหนดเกณฑ์มาตรฐานและพฤติกรรมบ่งชี้สำหรับการประเมินนักเรียนตามหลักสูตร
            </p>
          </div>
          <BackButton to="/academic/hub/evaluation" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Section (Left) */}
          <div className="lg:col-span-5 sticky top-24" ref={formRef}>
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${editingId ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'} dark:bg-opacity-20`}>
                    {editingId ? <Edit2 size={20} /> : <PlusCircle size={20} />}
                  </div>
                  {editingId ? 'แก้ไขข้อมูลคุณลักษณะ' : 'เพิ่มคุณลักษณะใหม่'}
                </h2>
                {editingId && (
                  <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded uppercase tracking-wider">โหมดแก้ไข</span>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 ml-1 uppercase tracking-widest">หัวข้อคุณลักษณะหลัก</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xl border border-gray-200 dark:border-gray-600">
                      {getCharacteristicIndex()}
                    </div>
                    <input 
                      type="text" 
                      value={title} 
                      onChange={(e) => setTitle(e.target.value)} 
                      className="flex-grow bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-3 outline-none transition-all font-semibold text-base" 
                      placeholder="เช่น รักชาติ ศาสน์ กษัตริย์" 
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <label className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400 mb-4 ml-1 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                      <ListPlus size={16} className="text-indigo-500" /> พฤติกรรมบ่งชี้รายข้อ
                    </div>
                    <span className="text-[9px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded tracking-widest">AUTO-NUMBERING</span>
                  </label>
                  
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                    {indicators.map((ind, idx) => (
                      <div key={idx} className="flex items-start gap-3 group animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <span className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg font-bold text-xs border border-gray-200 dark:border-gray-600 group-focus-within:border-indigo-500 group-focus-within:text-indigo-600 transition-all">
                          {getCharacteristicIndex()}.{idx + 1}
                        </span>
                        <div className="flex-grow relative">
                          <textarea 
                            value={ind} 
                            onChange={(e) => updateIndicator(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                addIndicator();
                              }
                            }}
                            rows={1}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-none overflow-hidden font-medium" 
                            placeholder="ระบุพฤติกรรมบ่งชี้..."
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = `${target.scrollHeight}px`;
                            }}
                          />
                          {indicators.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => removeIndicator(idx)} 
                              className="absolute -right-2 -top-2 bg-white dark:bg-gray-700 text-gray-400 hover:text-red-500 p-1 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button 
                    type="button" 
                    onClick={addIndicator}
                    className="w-full mt-4 py-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 hover:text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
                  >
                    <PlusCircle size={16} /> เพิ่มพฤติกรรมบ่งชี้
                  </button>
                </div>

                <div className="flex gap-3 pt-4">
                  {editingId && (
                    <button type="button" onClick={cancelEdit} className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                      ยกเลิก
                    </button>
                  )}
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className={`flex-[2] ${editingId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-bold py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]`}
                  >
                    {isSubmitting ? 'กำลังบันทึก...' : editingId ? <><Check size={20} /> อัปเดตข้อมูล</> : <><PlusCircle size={20} /> บันทึกข้อมูล</>}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* List Section (Right) */}
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-6 px-1">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <LayoutGrid className="text-indigo-500" size={22} />
                รายการคุณลักษณะปัจจุบัน
                <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700">{characteristics.length}</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {characteristics.length === 0 ? (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-16 text-center border border-dashed border-gray-300 dark:border-gray-700">
                  <Star className="text-gray-200 dark:text-gray-700 mx-auto mb-4" size={48} />
                  <h3 className="text-lg font-bold text-gray-400 dark:text-gray-500">ยังไม่มีข้อมูลในระบบ</h3>
                  <p className="text-gray-400 dark:text-gray-600 mt-1 text-sm">เริ่มต้นสร้างคุณลักษณะที่พึงประสงค์ได้จากฟอร์มด้านซ้าย</p>
                </div>
              ) : (
                characteristics.map((item, idx) => (
                  <div key={item.id} className="group bg-white dark:bg-[#2a2b2f] p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start gap-4 transition-all hover:shadow-md border-l-4 border-l-emerald-500 relative">
                    <div className="flex-grow">
                      <div className={`flex items-start justify-between gap-4 ${expandedIds[item.id] ? 'mb-4' : 'mb-0'}`}>
                        <h3 className="font-bold text-xl text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {idx + 1}. {item.title}
                        </h3>
                        {item.indicators && item.indicators.length > 0 && (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            className="flex-shrink-0 p-1.5 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-indigo-500 rounded-lg transition-all border border-gray-200 dark:border-gray-700"
                            title={expandedIds[item.id] ? "พับเก็บ" : "แสดงรายละเอียด"}
                          >
                            {expandedIds[item.id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        )}
                      </div>
                      
                      {item.indicators && item.indicators.length > 0 && expandedIds[item.id] && (
                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          {item.indicators.map((ind, i) => (
                            <div key={i} className="flex items-start gap-3 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                              <span className="font-bold text-indigo-500/80 min-w-[2rem] text-xs">{idx + 1}.{i + 1}</span>
                              <span className="leading-relaxed font-medium text-sm">{ind}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.indicators && item.indicators.length > 0 && !expandedIds[item.id] && (
                        <p className="text-xs text-gray-400 italic ml-8">มีพฤติกรรมบ่งชี้ {item.indicators.length} รายการ</p>
                      )}
                    </div>
                    <div className="flex sm:flex-col gap-2 self-end sm:self-start opacity-0 group-hover:opacity-100 transition-all duration-200">
                      <button onClick={() => handleEdit(item)} className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-600 hover:text-white transition-all" title="แก้ไข">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-2.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition-all" title="ลบ">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default AddDesiredCharacteristicsPage;