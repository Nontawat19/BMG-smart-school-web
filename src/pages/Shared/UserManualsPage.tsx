import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { firestore as db } from '@/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import MainLayout from '@/layouts/MainLayout';
import { ArrowLeft, BookOpen, FileText, Search, Eye, X, Download } from 'lucide-react';

interface ManualDoc {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  updatedAt?: any;
}

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

const UserManualsPage: React.FC = () => {
  const [manuals, setManuals] = useState<ManualDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewManual, setPreviewManual] = useState<ManualDoc | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'system-manuals'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setManuals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ManualDoc)));
      setIsLoading(false);
    }, (error) => {
      console.error('Error loading manuals:', error);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredManuals = manuals.filter((manual) =>
    manual.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (manual.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen transition-colors duration-300 bg-gray-50 dark:bg-[#1c1c24]">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div className="flex items-center gap-4">
              <Link
                to="/academic/hub/settings"
                className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                  <BookOpen className="text-sky-500" /> คู่มือการใช้งาน
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">
                  เอกสารคู่มือการใช้งานระบบ ใช้ร่วมกันทุกโรงเรียน
                </p>
              </div>
            </div>
            <div className="relative w-full md:w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="text-gray-400" size={16} />
              </div>
              <input
                type="text"
                placeholder="ค้นหาคู่มือ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2.5 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm dark:shadow-none">
            {isLoading ? (
              <div className="py-16 text-center text-gray-400 dark:text-gray-500">กำลังโหลดข้อมูล...</div>
            ) : filteredManuals.length === 0 ? (
              <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                {manuals.length === 0 ? 'ยังไม่มีคู่มือในระบบ' : 'ไม่พบคู่มือที่ค้นหา'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredManuals.map((manual) => (
                  <button
                    key={manual.id}
                    type="button"
                    onClick={() => setPreviewManual(manual)}
                    className="group relative bg-gray-50 dark:bg-[#1e1f21] rounded-2xl p-4 border border-gray-200 dark:border-gray-700/50 hover:border-sky-500/50 hover:shadow-md transition-all duration-200 flex items-start gap-3 text-left w-full"
                  >
                    <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                      <FileText size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                        {manual.title}
                      </p>
                      {manual.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{manual.description}</p>
                      )}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                        PDF · {formatFileSize(manual.fileSize)} · อัปเดต {formatDate(manual.updatedAt)}
                      </p>
                    </div>
                    <Eye size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-sky-500 transition-colors flex-shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {previewManual && (
        /* z-[10000]: ต้องสูงกว่า Navbar (z-[9999], fixed top-0) ไม่งั้นหัวข้อ modal จะถูกบังบางส่วน */
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#2a2b2f] w-full max-w-4xl h-full max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">{previewManual.title}</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{previewManual.fileName}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <a
                  href={previewManual.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="เปิดในแท็บใหม่ / ดาวน์โหลด"
                >
                  <Download size={18} />
                </a>
                <button
                  onClick={() => setPreviewManual(null)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="ปิด"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-black/30">
              <iframe
                // toolbar=0 ซ่อนแถบเครื่องมือของตัวอ่าน PDF ในเบราว์เซอร์ (ซ้ำกับ header ของเราเอง)
                // navpanes=0 ปิดแผงย่อหน้า/ธัมเนลด้านซ้าย ให้เนื้อหา PDF แสดงเต็มพื้นที่
                src={`${previewManual.fileUrl}#toolbar=0&navpanes=0`}
                title={previewManual.title}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default UserManualsPage;
