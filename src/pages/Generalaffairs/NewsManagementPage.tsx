import React, { useState, useEffect, useRef } from 'react';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { firestore as db, storage } from '../../firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import Swal from 'sweetalert2';
import { Edit, Trash2, Plus, ExternalLink, Eye, EyeOff, UploadCloud, X, Image as ImageIcon, Save } from 'lucide-react';
import { compressImage } from '../../utils/imageUtils';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  linkUrl?: string;
  linkText?: string;
  isActive: boolean;
  createdAt: any;
  viewCount?: number;
}

const NewsManagementPage: React.FC = () => {
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentNewsId, setCurrentNewsId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    linkUrl: '',
    linkText: '',
    imageFile: null as File | null,
    previewUrl: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchNews();
  }, [schoolId]);

  const fetchNews = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const newsRef = collection(db, 'school-settings', schoolId, 'news');
      const q = query(newsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem));
      setNewsList(data);
    } catch (error) {
      console.error("Error fetching news:", error);
      Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลข่าวสารได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (newsItem?: NewsItem) => {
    if (!newsItem && newsList.length >= 5) {
      Swal.fire({
        icon: 'warning',
        title: 'สร้างข่าวสารได้สูงสุด 5 เรื่อง',
        text: 'กรุณาลบข่าวสารเก่าออกก่อนเพื่อเพิ่มข่าวสารใหม่',
      });
      return;
    }
    if (newsItem) {
      setCurrentNewsId(newsItem.id);
      setFormData({
        title: newsItem.title,
        content: newsItem.content,
        linkUrl: newsItem.linkUrl || '',
        linkText: newsItem.linkText || '',
        imageFile: null,
        previewUrl: newsItem.imageUrl || ''
      });
    } else {
      setCurrentNewsId(null);
      setFormData({
        title: '',
        content: '',
        linkUrl: '',
        linkText: '',
        imageFile: null,
        previewUrl: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData({
      title: '',
      content: '',
      linkUrl: '',
      linkText: '',
      imageFile: null,
      previewUrl: ''
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData(prev => ({
        ...prev,
        imageFile: file,
        previewUrl: URL.createObjectURL(file)
      }));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        setFormData(prev => ({
          ...prev,
          imageFile: file,
          previewUrl: URL.createObjectURL(file)
        }));
      } else {
        Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น', 'warning');
      }
    }
  };

  const handleSave = async () => {
    if (!formData.title) {
      Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุหัวข้อข่าว', 'warning');
      return;
    }

    setIsUploading(true);
    try {
      let imageUrl = formData.previewUrl;

      // Upload Image if new file selected
      if (formData.imageFile) {
        // [OPTIMIZE] แปลงเป็น WebP ก่อนอัปโหลดเพื่อลดขนาดและเพิ่มความคมชัดไฮ
        const compressedFile = await compressImage(formData.imageFile, 1200, 0.85, 'image/webp');
        const storageRef = ref(storage, `school-settings/${schoolId}/news/${Date.now()}_news.webp`);
        const snapshot = await uploadBytes(storageRef, compressedFile);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      const newsData = {
        title: formData.title,
        content: formData.content,
        imageUrl: imageUrl,
        linkUrl: formData.linkUrl,
        linkText: formData.linkText,
        updatedAt: Timestamp.now(),
      };

      if (currentNewsId) {
        await updateDoc(doc(db, 'school-settings', schoolId, 'news', currentNewsId), newsData);
      } else {
        await addDoc(collection(db, 'school-settings', schoolId, 'news'), {
          ...newsData,
          isActive: true,
          viewCount: 0,
          createdAt: Timestamp.now(),
        });
      }

      Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อย', 'success');
      closeModal();
      fetchNews();
    } catch (error) {
      console.error("Error saving news:", error);
      Swal.fire('Error', 'เกิดข้อผิดพลาดในการบันทึก', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleStatus = async (item: NewsItem) => {
    try {
      await updateDoc(doc(db, 'school-settings', schoolId, 'news', item.id), {
        isActive: !item.isActive
      });
      setNewsList(prev => prev.map(n => n.id === item.id ? { ...n, isActive: !n.isActive } : n));
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบ?',
      text: "คุณต้องการลบข่าวสารนี้ใช่หรือไม่",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      try {
        // Optional: Delete image from storage if needed
        // const item = newsList.find(n => n.id === id);
        // if (item?.imageUrl) { ... delete logic ... }

        await deleteDoc(doc(db, 'school-settings', schoolId, 'news', id));
        setNewsList(prev => prev.filter(n => n.id !== id));
        Swal.fire('ลบสำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว', 'success');
      } catch (error) {
        console.error("Error deleting news:", error);
        Swal.fire('Error', 'ไม่สามารถลบข้อมูลได้', 'error');
      }
    }
  };

  const formatViewCount = (num?: number) => {
    if (!num) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
  };

  const incrementViewCount = async (id: string, currentCount?: number) => {
    if (!schoolId) return;
    try {
      const newCount = (currentCount || 0) + 1;
      // Optimistic update (อัปเดตหน้าจอทันทีโดยไม่ต้องรอโหลดใหม่)
      setNewsList(prev => prev.map(n => n.id === id ? { ...n, viewCount: newCount } : n));

      await updateDoc(doc(db, 'school-settings', schoolId, 'news', id), {
        viewCount: newCount
      });
    } catch (error) {
      console.error("Error incrementing view count:", error);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen transition-colors duration-300">
        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#111318]/95 backdrop-blur border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton to="/general-affairs/home" />
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">งานธุรการ</p>
              <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">จัดการข่าวสารประชาสัมพันธ์</h1>
            </div>
          </div>
          <button
            onClick={() => openModal()}
            disabled={newsList.length >= 5}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 text-xs font-black text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
          >
            <Plus size={16} /> เพิ่มข่าวสาร
          </button>
        </div>

        <div className="p-4 sm:p-8">
        <div className="max-w-6xl mx-auto">

          {loading ? (
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-500">
              กำลังโหลด...
            </div>
          ) : newsList.length === 0 ? (
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-500">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                <ImageIcon size={40} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">ยังไม่มีข่าวสาร</h3>
              <p className="text-sm">กดปุ่ม "เพิ่มข่าวสาร" เพื่อสร้างประกาศใหม่</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {newsList.map((item) => (
                <div key={item.id} className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-md transition-all duration-300 flex flex-col group">
                  {/* Image Area */}
                  <div className="relative h-48 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageIcon size={48} />
                      </div>
                    )}
                    <div className="absolute top-3 right-3">
                      <button
                        onClick={() => toggleStatus(item)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm backdrop-blur-md transition-all ${item.isActive
                            ? 'bg-green-500/90 text-white hover:bg-green-600'
                            : 'bg-gray-500/90 text-white hover:bg-gray-600'
                          }`}
                      >
                        {item.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                        {item.isActive ? 'แสดงผล' : 'ซ่อน'}
                      </button>
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="p-5 flex-grow flex flex-col">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 line-clamp-1" title={item.title}>{item.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mb-4 flex-grow">{item.content}</p>

                    {item.linkUrl && (
                      <a
                        href={item.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => incrementViewCount(item.id, item.viewCount)}
                        className="inline-flex items-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline mb-4"
                      >
                        <ExternalLink size={14} className="mr-1" /> {item.linkText || 'เปิดลิงก์แนบ'}
                      </a>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('th-TH') : 'เพิ่งสร้าง'}</span>
                        <span className="flex items-center gap-1" title="ยอดผู้เข้าชม">
                          <Eye size={14} /> {formatViewCount(item.viewCount)}
                        </span>
                      </div>
                      <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openModal(item)}
                          className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg transition-colors"
                          title="แก้ไข"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg transition-colors"
                          title="ลบ"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
              <div className="flex-shrink-0 flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {currentNewsId ? 'แก้ไขข่าวสาร' : 'เพิ่มข่าวสารใหม่'}
                </h2>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-grow p-6 overflow-y-auto custom-scrollbar">
                <style>{`
                  .custom-scrollbar::-webkit-scrollbar { display: none; }
                  .custom-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                  }
                `}</style>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                  {/* Left Column: Image Upload */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รูปภาพประชาสัมพันธ์</label>
                    <div
                      className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer relative group h-full flex flex-col justify-center
                        ${formData.previewUrl ? 'border-indigo-300 bg-indigo-50/30 dark:border-indigo-500/30 dark:bg-indigo-500/10' : 'border-gray-300 hover:border-indigo-400 dark:border-gray-600 dark:hover:border-indigo-500 hover:bg-gray-50 dark:hover:bg-gray-800'}
                      `}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileChange}
                      />

                      {formData.previewUrl ? (
                        <div className="relative inline-block">
                          <img src={formData.previewUrl} alt="Preview" className="max-h-64 rounded-lg shadow-sm mx-auto" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                            <p className="text-white font-medium flex items-center gap-2"><UploadCloud size={20} /> เปลี่ยนรูปภาพ</p>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8">
                          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ImageIcon size={32} />
                          </div>
                          <p className="text-gray-900 dark:text-white font-medium mb-1">คลิกเพื่อเลือกรูปภาพ</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">หรือลากไฟล์มาวางที่นี่</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Form Fields */}
                  <div className="lg:col-span-3 space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">หัวข้อข่าว <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        placeholder="เช่น ประกาศหยุดเรียน..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">รายละเอียด</label>
                      <textarea
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        rows={5}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                        placeholder="รายละเอียดข่าวสาร..."
                      />
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-5 space-y-5">
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400">ส่วนของปุ่มลิงก์ (Optional)</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">ข้อความบนปุ่ม</label>
                          <input type="text" value={formData.linkText} onChange={(e) => setFormData({ ...formData, linkText: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="เช่น อ่านเพิ่มเติม" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">URL ปลายทาง</label>
                          <input type="text" value={formData.linkUrl} onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="https://..." />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-[#2a2b2f]">
                <button onClick={closeModal} className="px-5 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors">ยกเลิก</button>
                <button onClick={handleSave} disabled={isUploading} className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                  {isUploading ? 'กำลังบันทึก...' : <><Save size={18} /> บันทึกข้อมูล</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default NewsManagementPage;