import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { firestore as db } from '../../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import MainLayout from "@/layouts/MainLayout";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Swal from 'sweetalert2';
<<<<<<< HEAD
import { PlusCircle, Trash2, Edit2, X, Check, ListPlus, FileText, LayoutGrid, ChevronDown, ChevronUp } from 'lucide-react';
import BackButton from '@/components/Shared/BackButton';
=======
import { ArrowLeft, PlusCircle, Trash2, Edit2, X, Check, ListPlus, FileText, LayoutGrid, ChevronDown, ChevronUp } from 'lucide-react';
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

interface Indicator {
  text: string;
  rubric: {
    3: string; // ดีเยี่ยม
    2: string; // ดี
    1: string; // ผ่านเกณฑ์
    0: string; // ปรับปรุง
  };
}

interface AssessmentCriteria {
  id: string;
  standard: string;
  indicators: Indicator[];
  createdAt: any;
}

const AssessmentReadingThinkingWritingPage: React.FC = () => {
  const [standard, setStandard] = useState('');
  const [indicators, setIndicators] = useState<Indicator[]>([{ text: '', rubric: { 3: '', 2: '', 1: '', 0: '' } }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [criteriaList, setCriteriaList] = useState<AssessmentCriteria[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  
  const formRef = useRef<HTMLDivElement>(null);
  
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  const fetchCriteria = useCallback(async () => {
    if (!schoolId) return;
    try {
      const q = query(
        collection(db, 'school-settings', schoolId, 'reading-thinking-writing'),
        orderBy('createdAt', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AssessmentCriteria[];
      setCriteriaList(list);
    } catch (error) {
      console.error("Error fetching criteria:", error);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchCriteria();
  }, [schoolId, fetchCriteria]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!standard) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'กรุณากรอกมาตรฐานการเรียนรู้', background: '#2a2b2f', color: '#ffffff' });
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        standard,
        indicators: indicators.filter(ind => ind.text.trim() !== ''),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'school-settings', schoolId, 'reading-thinking-writing', editingId), data);
      } else {
        await addDoc(collection(db, 'school-settings', schoolId, 'reading-thinking-writing'), {
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
      fetchCriteria();
    } catch (error) {
      console.error('Error saving criteria: ', error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้', background: '#2a2b2f', color: '#ffffff' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setStandard('');
    setIndicators([{ text: '', rubric: { 3: '', 2: '', 1: '', 0: '' } }]);
    setEditingId(null);
  };

  const addIndicator = () => {
    setIndicators(prev => [...prev, { text: '', rubric: { 3: '', 2: '', 1: '', 0: '' } }]);
  };

  const updateIndicatorText = (index: number, value: string) => {
    const newIndicators = [...indicators];
    newIndicators[index].text = value;
    setIndicators(newIndicators);
  };

  const updateRubric = (indicatorIndex: number, score: keyof Indicator['rubric'], value: string) => {
    const newIndicators = [...indicators];
    newIndicators[indicatorIndex].rubric[score] = value;
    setIndicators(newIndicators);
  };

  const removeIndicator = (index: number) => {
    setIndicators(indicators.filter((_, i) => i !== index));
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleEdit = (item: AssessmentCriteria) => {
    setEditingId(item.id);
    setStandard(item.standard || '');
    setIndicators(item.indicators && item.indicators.length > 0 ? item.indicators : [{ text: '', rubric: { 3: '', 2: '', 1: '', 0: '' } }]);
    setExpandedIds(prev => ({ ...prev, [item.id]: true }));
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getCriteriaIndex = () => {
    if (editingId) {
      const index = criteriaList.findIndex(c => c.id === editingId);
      return index !== -1 ? index + 1 : criteriaList.length + 1;
    }
    return criteriaList.length + 1;
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: "คุณต้องการลบเกณฑ์การประเมินนี้ใช่หรือไม่?",
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
        await deleteDoc(doc(db, 'school-settings', schoolId, 'reading-thinking-writing', id));
        fetchCriteria();
        Swal.fire({ title: 'ลบสำเร็จ!', icon: 'success', background: '#2a2b2f', color: '#ffffff' });
      } catch (error) {
        Swal.fire({ title: 'เกิดข้อผิดพลาด', icon: 'error', background: '#2a2b2f', color: '#ffffff' });
      }
    }
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-8 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-gray-200 dark:border-gray-700 pb-6">
          <div>
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-semibold text-xs uppercase tracking-widest mb-1">
              <FileText size={16} fill="currentColor" />
              <span>ฝ่ายบริหารงานวิชาการ</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">การอ่าน คิดวิเคราะห์ และเขียน</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-base">กำหนดเกณฑ์มาตรฐานและตัวชี้วัดสำหรับการประเมินความสามารถนักเรียน</p>
          </div>
<<<<<<< HEAD
          <BackButton to="/academic/hub/evaluation" />
=======
          <Link to="/academic-admin" className="inline-flex items-center justify-center px-5 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group font-semibold text-gray-700 dark:text-gray-200 text-sm">
            <ArrowLeft size={18} className="mr-2 group-hover:-translate-x-1 transition-transform" /> กลับหน้าบริหารวิชาการ
          </Link>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 sticky top-24" ref={formRef}>
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${editingId ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-100 text-orange-600'} dark:bg-opacity-20`}>
                    {editingId ? <Edit2 size={20} /> : <PlusCircle size={20} />}
                  </div>
                  {editingId ? 'แก้ไขเกณฑ์การประเมิน' : 'เพิ่มเกณฑ์การประเมินใหม่'}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 ml-1 uppercase tracking-widest">มาตรฐานการเรียนรู้</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xl border border-gray-200 dark:border-gray-600">
                      {getCriteriaIndex()}
                    </div>
                    <input 
                      type="text" 
                      value={standard} 
                      onChange={(e) => setStandard(e.target.value)} 
                      className="flex-grow bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-3 outline-none transition-all font-semibold text-base" 
                      placeholder="เช่น มาตรฐานที่ 1 การอ่าน..." 
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <label className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400 mb-4 ml-1 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                      <ListPlus size={16} className="text-indigo-500" /> ตัวชี้วัดรายข้อ
                    </div>
                    <span className="text-[9px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded tracking-widest">AUTO-NUMBERING</span>
                  </label>
                  
                  <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {indicators.map((ind, idx) => (
                      <div key={idx} className="bg-gray-50/50 dark:bg-gray-800/30 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 group animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="flex items-start gap-3 mb-4">
                          <span className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg font-bold text-xs border border-gray-200 dark:border-gray-600 group-focus-within:border-indigo-500 group-focus-within:text-indigo-600 transition-all">
                            {getCriteriaIndex()}.{idx + 1}
                          </span>
                          <div className="flex-grow relative">
                            <textarea 
                              value={ind.text} 
                              onChange={(e) => updateIndicatorText(idx, e.target.value)}
                              rows={1}
                              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-none overflow-hidden font-bold" 
                              placeholder="ระบุตัวชี้วัด..."
                              onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }}
                            />
                            {indicators.length > 1 && (
                              <button type="button" onClick={() => removeIndicator(idx)} className="absolute -right-2 -top-2 bg-white dark:bg-gray-700 text-gray-400 hover:text-red-500 p-1 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm opacity-0 group-hover:opacity-100 transition-all">
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Rubric Inputs */}
                        <div className="grid grid-cols-1 gap-3 pl-12">
                          <div className="flex items-center gap-2">
                            <span className="w-20 text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">3 ดีเยี่ยม</span>
                            <input 
                              type="text" value={ind.rubric[3]} onChange={(e) => updateRubric(idx, 3, e.target.value)}
                              className="flex-grow bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-green-500" placeholder="เกณฑ์สำหรับระดับ 3..."
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-20 text-[10px] font-bold text-yellow-600 dark:text-yellow-400 uppercase">2 ดี</span>
                            <input 
                              type="text" value={ind.rubric[2]} onChange={(e) => updateRubric(idx, 2, e.target.value)}
                              className="flex-grow bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-yellow-500" placeholder="เกณฑ์สำหรับระดับ 2..."
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-20 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">1 ผ่าน</span>
                            <input 
                              type="text" value={ind.rubric[1]} onChange={(e) => updateRubric(idx, 1, e.target.value)}
                              className="flex-grow bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500" placeholder="เกณฑ์สำหรับระดับ 1..."
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-20 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">0 ปรับปรุง</span>
                            <input 
                              type="text" value={ind.rubric[0]} onChange={(e) => updateRubric(idx, 0, e.target.value)}
                              className="flex-grow bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-red-500" placeholder="เกณฑ์สำหรับระดับ 0..."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addIndicator} className="w-full mt-4 py-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 hover:text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest">
                    <PlusCircle size={16} /> เพิ่มตัวชี้วัด
                  </button>
                </div>

                <div className="flex gap-3 pt-4">
                  {editingId && (
                    <button type="button" onClick={() => resetForm()} className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">ยกเลิก</button>
                  )}
                  <button type="submit" disabled={isSubmitting} className={`flex-[2] ${editingId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-orange-600 hover:bg-orange-700'} text-white font-bold py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]`}>
                    {isSubmitting ? 'กำลังบันทึก...' : editingId ? <><Check size={20} /> อัปเดตข้อมูล</> : <><PlusCircle size={20} /> บันทึกข้อมูล</>}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-6 px-1">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <LayoutGrid className="text-indigo-500" size={22} /> รายการเกณฑ์ปัจจุบัน
                <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700">{criteriaList.length}</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {criteriaList.length === 0 ? (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-16 text-center border border-dashed border-gray-300 dark:border-gray-700">
                  <FileText className="text-gray-200 dark:text-gray-700 mx-auto mb-4" size={48} />
                  <h3 className="text-lg font-bold text-gray-400 dark:text-gray-500">ยังไม่มีข้อมูลในระบบ</h3>
                  <p className="text-gray-400 dark:text-gray-600 mt-1 text-sm">เริ่มต้นสร้างเกณฑ์การประเมินได้จากฟอร์มด้านซ้าย</p>
                </div>
              ) : (
                criteriaList.map((item, idx) => (
                  <div key={item.id} className="group bg-white dark:bg-[#2a2b2f] p-6 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start gap-4 transition-all hover:shadow-md border-l-4 border-l-orange-500 relative">
                    <div className="flex-grow">
                      <div className={`flex items-start justify-between gap-4 ${expandedIds[item.id] ? 'mb-4' : 'mb-0'}`}>
                        <h3 className="font-bold text-xl text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{idx + 1}. {item.standard}</h3>
                        {item.indicators && item.indicators.length > 0 && (
                          <button onClick={() => toggleExpand(item.id)} className="flex-shrink-0 p-1.5 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-indigo-500 rounded-lg transition-all border border-gray-200 dark:border-gray-700">
                            {expandedIds[item.id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        )}
                      </div>
                      
                      {item.indicators && item.indicators.length > 0 && expandedIds[item.id] && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                          {item.indicators.map((ind, i) => (
                            <div key={i} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                              <div className="flex items-start gap-3 mb-3">
                                <span className="font-bold text-indigo-500/80 min-w-[2rem] text-xs">{idx + 1}.{i + 1}</span>
                                <span className="leading-relaxed font-bold text-sm">{ind.text}</span>
                              </div>
                              {/* Rubric Table Display */}
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-2">
                                {[3, 2, 1, 0].map((score) => (
                                  <div key={score} className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                                    <div className={`text-[9px] font-black mb-1 uppercase ${score === 3 ? 'text-green-600' : score === 2 ? 'text-yellow-600' : score === 1 ? 'text-blue-600' : 'text-red-600'}`}>
                                      คะแนน {score} {score === 3 ? '(ดีเยี่ยม)' : score === 2 ? '(ดี)' : score === 1 ? '(ผ่าน)' : '(ปรับปรุง)'}
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{ind.rubric[score as keyof Indicator['rubric']] || '-'}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.indicators && item.indicators.length > 0 && !expandedIds[item.id] && (
                        <p className="text-xs text-gray-400 italic ml-8">มีตัวชี้วัด {item.indicators.length} รายการ</p>
                      )}
                    </div>
                    <div className="flex sm:flex-col gap-2 self-end sm:self-start opacity-0 group-hover:opacity-100 transition-all duration-200">
                      <button onClick={() => handleEdit(item)} className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-600 hover:text-white transition-all" title="แก้ไข"><Edit2 size={18} /></button>
                      <button onClick={() => handleDelete(item.id)} className="p-2.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition-all" title="ลบ"><Trash2 size={18} /></button>
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

export default AssessmentReadingThinkingWritingPage;