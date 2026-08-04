import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { firestore as db, storage } from '@/firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
  query,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import Swal from 'sweetalert2';
import MainLayout from '@/layouts/MainLayout';
import { ArrowLeft, BookOpen, FileText, Plus, Pencil, Trash2, Upload, X, Download } from 'lucide-react';

interface ManualDoc {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  createdAt?: any;
  updatedAt?: any;
  uploadedByName?: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const COLLECTION_NAME = 'system-manuals';

const formatFileSize = (bytes: number) => {
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
};

const formatDate = (value: any) => {
  if (!value?.toDate) return '-';
  return value.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const ManualManagementPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [manuals, setManuals] = useState<ManualDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingManual, setEditingManual] = useState<ManualDoc | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setManuals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ManualDoc)));
      setIsLoading(false);
    }, (error) => {
      console.error('Error loading manuals:', error);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const openAddModal = () => {
    setEditingManual(null);
    setTitle('');
    setDescription('');
    setFile(null);
    setIsModalOpen(true);
  };

  const openEditModal = (manual: ManualDoc) => {
    setEditingManual(manual);
    setTitle(manual.title);
    setDescription(manual.description || '');
    setFile(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาเลือกไฟล์ PDF เท่านั้น', 'warning');
      e.target.value = '';
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      Swal.fire('ไฟล์ใหญ่เกินไป', 'ขนาดไฟล์ต้องไม่เกิน 20 MB', 'warning');
      e.target.value = '';
      return;
    }
    setFile(selected);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Swal.fire('กรุณากรอกชื่อคู่มือ', '', 'warning');
      return;
    }
    if (!editingManual && !file) {
      Swal.fire('กรุณาเลือกไฟล์ PDF', '', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      let fileUrl = editingManual?.fileUrl || '';
      let fileName = editingManual?.fileName || '';
      let fileSize = editingManual?.fileSize || 0;

      if (file) {
        const storagePath = `system_manuals/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadResult = await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(uploadResult.ref);
        fileName = file.name;
        fileSize = file.size;

        // ลบไฟล์เก่าทิ้ง หากเป็นการแก้ไขและอัปโหลดไฟล์ใหม่แทนที่
        if (editingManual?.fileUrl) {
          try {
            await deleteObject(ref(storage, editingManual.fileUrl));
          } catch (err) {
            console.warn('ไม่สามารถลบไฟล์เก่าได้:', err);
          }
        }
      }

      if (editingManual) {
        await updateDoc(doc(db, COLLECTION_NAME, editingManual.id), {
          title: title.trim(),
          description: description.trim(),
          fileUrl,
          fileName,
          fileSize,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, COLLECTION_NAME), {
          title: title.trim(),
          description: description.trim(),
          fileUrl,
          fileName,
          fileSize,
          uploadedByName: currentUser?.fullName || currentUser?.email || 'Super Admin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setIsModalOpen(false);
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error('Error saving manual:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกคู่มือได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (manual: ManualDoc) => {
    const result = await Swal.fire({
      title: 'ลบคู่มือนี้หรือไม่?',
      text: `"${manual.title}" จะถูกลบออกจากระบบและผู้ใช้ทุกโรงเรียนจะไม่เห็นอีกต่อไป`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ใช่, ลบเลย',
      cancelButtonText: 'ยกเลิก',
    });
    if (!result.isConfirmed) return;

    try {
      if (manual.fileUrl) {
        try {
          await deleteObject(ref(storage, manual.fileUrl));
        } catch (err) {
          console.warn('ไม่สามารถลบไฟล์จาก Storage ได้:', err);
        }
      }
      await deleteDoc(doc(db, COLLECTION_NAME, manual.id));
      Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1200, showConfirmButton: false });
    } catch (error) {
      console.error('Error deleting manual:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบคู่มือได้', 'error');
    }
  };

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen transition-colors duration-300 bg-gray-50 dark:bg-[#1c1c24]">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div className="flex items-center gap-4">
              <Link
                to="/owner/hub"
                className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                  <BookOpen className="text-teal-500" /> จัดการคู่มือการใช้ระบบ
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">
                  เพิ่ม แก้ไข และลบเอกสารคู่มือ (PDF) — ผู้ใช้งานทุกคนในทุกโรงเรียนจะเห็นรายการเดียวกันนี้
                </p>
              </div>
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm hover:shadow-md active:scale-95 text-sm whitespace-nowrap"
            >
              <Plus size={16} /> เพิ่มคู่มือใหม่
            </button>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm dark:shadow-none">
            {isLoading ? (
              <div className="py-16 text-center text-gray-400 dark:text-gray-500">กำลังโหลดข้อมูล...</div>
            ) : manuals.length === 0 ? (
              <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                ยังไม่มีคู่มือในระบบ กด "เพิ่มคู่มือใหม่" เพื่อเริ่มต้น
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {manuals.map((manual) => (
                  <div
                    key={manual.id}
                    className="group relative bg-gray-50 dark:bg-[#1e1f21] rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-700/50 hover:border-teal-500/40 hover:shadow-md transition-all duration-200 flex items-center gap-3"
                  >
                    <div className="w-11 h-11 rounded-lg bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{manual.title}</p>
                      {manual.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{manual.description}</p>
                      )}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {manual.fileName} · {formatFileSize(manual.fileSize)} · อัปเดตล่าสุด {formatDate(manual.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a
                        href={manual.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        title="เปิดดูไฟล์"
                      >
                        <Download size={16} />
                      </a>
                      <button
                        onClick={() => openEditModal(manual)}
                        className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        title="แก้ไข"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(manual)}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        title="ลบ"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#2a2b2f] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingManual ? 'แก้ไขคู่มือ' : 'เพิ่มคู่มือใหม่'}
              </h3>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  ชื่อคู่มือ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น คู่มือการใช้งานระบบเช็คชื่อ"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  คำอธิบาย (ไม่บังคับ)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="อธิบายเนื้อหาโดยย่อของคู่มือนี้"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm text-gray-900 dark:text-white resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  ไฟล์ PDF {!editingManual && <span className="text-red-500">*</span>}
                </label>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl px-4 py-6 cursor-pointer hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-500/5 transition-colors">
                  <Upload size={18} className="text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {file ? file.name : editingManual ? `ไฟล์ปัจจุบัน: ${editingManual.fileName} (เลือกใหม่เพื่อแทนที่)` : 'คลิกเพื่อเลือกไฟล์ PDF (ไม่เกิน 20 MB)'}
                  </span>
                  <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            </div>
            <div className="p-6 pt-0 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default ManualManagementPage;
