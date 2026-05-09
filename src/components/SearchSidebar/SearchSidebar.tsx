import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft, FaSearch, FaUserGraduate, FaChalkboardTeacher, FaSpinner, FaTimes, FaHistory, FaChevronRight, FaTasks, FaFileAlt, FaFilter } from "react-icons/fa";
import { useNavigate, useParams } from 'react-router-dom';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { firestore } from '@/firebase';
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// --- Sub-component: PdfThumbnail (ดึงหน้าแรกของ PDF มาแสดง) ---
const PdfThumbnail: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const renderPage = async () => {
      if (!url || !canvasRef.current) return;
      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        if (isCancelled) return;

        const page = await pdf.getPage(1);
        // ปรับ scale ให้เหมาะสมกับขนาด thumbnail เล็กๆ ใน Sidebar
        const viewport = page.getViewport({ scale: 0.3 });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (canvas && context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas
          }).promise;

          if (!isCancelled) setLoading(false);
        }
      } catch (err) {
        console.error("PDF Preview Error:", err);
        if (!isCancelled) setLoading(false);
      }
    };

    renderPage();
    return () => { isCancelled = true; };
  }, [url]);

  return (
    <div className={`relative overflow-hidden bg-white dark:bg-gray-700 flex items-center justify-center ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse">
          <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
    </div>
  );
};

// --- Sub-component: ResultItem (จัดการการแสดงผลแต่ละรายการและ Error ของรูปภาพ) ---
const ResultItem: React.FC<{ item: any; onClose: () => void; navigate: any }> = ({ item, onClose, navigate }) => {
  const [imageError, setImageError] = useState(false);

  const handleNavigate = () => {
    navigate(item.url);
    onClose();
  };

  let icon;
  let iconBgColor;
  let badgeIcon;
  let badgeBgColor;

  switch (item.type) {
    case 'student':
      icon = <FaUserGraduate size={20} />;
      iconBgColor = 'bg-gradient-to-br from-indigo-400 to-blue-500';
      badgeIcon = <FaUserGraduate />;
      badgeBgColor = 'bg-indigo-500';
      break;
    case 'teacher':
      icon = <FaChalkboardTeacher size={20} />;
      iconBgColor = 'bg-gradient-to-br from-emerald-400 to-teal-500';
      badgeIcon = <FaChalkboardTeacher />;
      badgeBgColor = 'bg-emerald-500';
      break;
    case 'assignment':
      icon = <FaTasks size={20} />;
      iconBgColor = 'bg-gradient-to-br from-orange-400 to-amber-500';
      badgeIcon = <FaTasks />;
      badgeBgColor = 'bg-orange-500';
      break;

    default:
      icon = <FaFileAlt size={20} />;
      iconBgColor = 'bg-gray-400';
      badgeIcon = <FaFileAlt />;
      badgeBgColor = 'bg-gray-500';
  }

  return (
    <div onClick={handleNavigate} className="group flex items-center gap-4 p-3 sm:p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-all border border-transparent hover:border-gray-100 dark:hover:border-gray-700 mb-2">
      <div className="relative flex-shrink-0">
        <div className={`${item.type === 'assignment' ? 'w-12 h-16 rounded-lg' : 'w-12 h-12 rounded-full'} flex items-center justify-center text-white shadow-sm ${iconBgColor}`}>
          {icon}
        </div>
        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-[#1e1f21] flex items-center justify-center text-[10px] text-white ${badgeBgColor}`}>
          {badgeIcon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {item.name}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {item.sub}
        </p>
      </div>
      <FaChevronRight className="text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors text-xs" />
    </div>
  );
};

interface SearchSidebarProps {
  onClose: () => void;
  history: { id: number; name: string }[];
  schoolId?: string | null;
}

const SearchSidebar: React.FC<SearchSidebarProps> = ({ onClose, history, schoolId: propSchoolId }) => {
  const { schoolId: paramSchoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // พยายามดึง schoolId จาก URL หรือ localStorage
  const schoolId = propSchoolId || paramSchoolId || localStorage.getItem('selectedSchoolId');

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (!searchTerm.trim() || !schoolId) {
        setSearchResults([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const term = searchTerm.trim();
      const resultsMap = new Map();

      try {
        // 1. ค้นหานักเรียน (Students)
        const studentsRef = collection(firestore, "school-settings", schoolId, "students");
        const studentQueries = [
          getDocs(query(studentsRef, where('firstName', '>=', term), where('firstName', '<=', term + '\uf8ff'), limit(5))),
          getDocs(query(studentsRef, where('lastName', '>=', term), where('lastName', '<=', term + '\uf8ff'), limit(5)))
        ];
        if (/^\d+$/.test(term)) {
          studentQueries.push(getDocs(query(studentsRef, where('studentId', '>=', term), where('studentId', '<=', term + '\uf8ff'), limit(5))));
        }
        const studentSnapshots = await Promise.all(studentQueries);
        studentSnapshots.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!resultsMap.has(doc.id)) {
              resultsMap.set(doc.id, {
                id: doc.id,
                name: `${data.title || ''}${data.firstName} ${data.lastName}`,
                sub: `นักเรียน (${data.studentId}) - ${data.classLevel}/${data.room}`,
                type: 'student',
                image: data.profileImageUrl,
                url: `/school/${schoolId}/students/view/${doc.id}`
              });
            }
          });
        });

        // 2. ค้นหาครู (Teachers)
        const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
        const teacherQueries = [
          getDocs(query(teachersRef, where('firstName', '>=', term), where('firstName', '<=', term + '\uf8ff'), limit(5))),
          getDocs(query(teachersRef, where('lastName', '>=', term), where('lastName', '<=', term + '\uf8ff'), limit(5)))
        ];
        if (/^\d+$/.test(term)) {
          teacherQueries.push(getDocs(query(teachersRef, where('teacherId', '>=', term), where('teacherId', '<=', term + '\uf8ff'), limit(5))));
        }
        const teacherSnapshots = await Promise.all(teacherQueries);
        teacherSnapshots.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!resultsMap.has(doc.id)) {
              resultsMap.set(doc.id, {
                id: doc.id,
                name: `${data.title || ''}${data.firstName} ${data.lastName}`,
                sub: `ครู/บุคลากร (${data.teacherId || '-'}) - ${data.position || '-'}`,
                type: 'teacher',
                image: data.profileImageUrl,
                url: `/school/${schoolId}/teachers/view/${doc.id}`
              });
            }
          });
        });

        // 3. ค้นหางานที่มอบหมาย (Assignments)
        const assignmentsRef = collection(firestore, "school-settings", schoolId, "director_assignments");
        const qAssignment = query(assignmentsRef, where('title', '>=', term), where('title', '<=', term + '\uf8ff'), limit(5));
        const assignmentSnap = await getDocs(qAssignment);

        assignmentSnap.forEach(doc => {
          const data = doc.data();
          if (!resultsMap.has(doc.id)) {
            resultsMap.set(doc.id, {
              id: doc.id,
              name: data.title,
              sub: `งานมอบหมาย - ${data.status || 'รอดำเนินการ'}`,
              type: 'assignment',
              image: null, // Assignments don't have images
              url: `/director/assigned-work` // ลิงก์ไปยังหน้ารายการงานที่ได้รับมอบหมาย
            });
          }
        });



        setSearchResults(Array.from(resultsMap.values()));
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 600); // Debounce 600ms

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, schoolId]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-start" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity animate-fadeIn" onClick={onClose} />
      <div className="relative w-full sm:w-[480px] md:w-[520px] bg-white dark:bg-[#1e1f21] shadow-2xl flex flex-col h-full border-r border-gray-200 dark:border-gray-800 transform transition-all duration-300 animate-slideInLeft">

        <div className="flex flex-col gap-4 p-5 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-[#1e1f21]/95 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <FaSearch className="text-indigo-600 dark:text-indigo-400" />
              ค้นหาข้อมูล
            </h2>
            <button onClick={onClose} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-all">
              <FaTimes />
            </button>
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <FaSearch className="text-gray-400 group-focus-within:text-indigo-500 transition-colors text-lg" />
            </div>
            <input
              type="text"
              className="block w-full pl-12 pr-10 py-3.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl text-base text-gray-900 dark:text-white placeholder-gray-400 transition-all outline-none shadow-sm"
              placeholder="พิมพ์ชื่อ, รหัส, หรือคำค้นหา..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <FaTimes className="bg-gray-200 dark:bg-gray-700 rounded-full p-0.5 w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {searchTerm ? (
            <>
              <div className="flex items-center justify-between mb-3 px-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผลการค้นหา</span>
                {isLoading && <FaSpinner className="animate-spin text-indigo-500" />}
              </div>
              {searchResults.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <FaSearch className="text-gray-300 dark:text-gray-600 text-2xl" />
                  </div>
                  <p>ไม่พบข้อมูลที่ค้นหา</p>
                </div>
              )}
              {searchResults.map((item) => (
                <ResultItem key={item.id} item={item} onClose={onClose} navigate={navigate} />
              ))}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 px-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ค้นหาล่าสุด</span>
                {history.length > 0 && <button className="text-xs text-indigo-500 hover:text-indigo-600 font-medium">ล้างประวัติ</button>}
              </div>

              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
                  <FaHistory className="text-4xl mb-3 opacity-20" />
                  <span className="text-sm">ไม่มีประวัติการค้นหา</span>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="group flex items-center gap-3 p-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700">
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-indigo-500 transition-colors flex-shrink-0">
                      <FaHistory />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{item.name}</span>
                    </div>
                    <button className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all opacity-0 group-hover:opacity-100">
                      <FaTimes size={12} />
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default SearchSidebar;
