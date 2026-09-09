import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { firestore, auth } from "@/firebase";
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from "firebase/firestore";
import { FaFilePdf, FaUserCheck, FaCommentDots, FaBuilding, FaCalendarCheck, FaSearch, FaImage, FaLayerGroup, FaBook, FaCogs, FaChartPie, FaUserFriends, FaWindowClose, FaQrcode, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Swal from "sweetalert2";
import SkeletonLoader from "@/components/SkeletonLoader";
import DocumentCardSkeleton from "@/components/DocumentCardSkeleton";

// --- Interfaces ---
interface AssignedDocument {
  id: string;
  receiveNo: string;
  subject?: string;
  qrCodeUrl?: string;
  qrCodeUrls?: { page: number; url: string }[]; // 📌 QR Code ที่ตรวจพบในแต่ละหน้า (แบบแบนราบ เพราะ Firestore ไม่รองรับ nested array)
  dueDate?: Timestamp;
  urgency?: 'normal' | 'urgent' | 'very_urgent' | 'most_urgent';
  pdfUrl: string;
  previewImageUrl?: string;
  status: 'approved';
  approvedAt?: Timestamp;
  assignments?: {
    academic?: boolean;
    general?: boolean;
    budget?: boolean;
    personnel?: boolean;
    assignee?: string;
    comment?: string;
  };
}

type Department = "all" | "academic" | "general" | "budget" | "personnel";

const departmentMap: Record<Department, string> = {
  all: "ทั้งหมด",
  academic: "ฝ่ายวิชาการ",
  general: "ฝ่ายบริหารทั่วไป",
  budget: "ฝ่ายงบประมาณ",
  personnel: "ฝ่ายบุคคล",
};

const departmentIcons: Record<Department, React.ReactElement> = {
  all: <FaLayerGroup />,
  academic: <FaBook />,
  general: <FaCogs />,
  budget: <FaChartPie />,
  personnel: <FaUserFriends />,
};

// --- PDF Worker Configuration ---
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
// เอกสารสแกนบางไฟล์ฝังรูปด้วย JPEG2000 (JPX) ซึ่ง pdf.js ต้องใช้ตัวถอดรหัส WASM นี้
// ถ้าไม่ระบุ wasmUrl หน้าที่มีรูปแบบ JPX จะเรนเดอร์ออกมาว่างเปล่าโดยไม่มี error แจ้งผู้ใช้
const PDFJS_WASM_URL = "/pdfjs-wasm/";

// --- Sub-component: PdfThumbnail (ดึงหน้าแรกของ PDF มาแสดง) ---
const PdfThumbnail: React.FC<{ url: string }> = ({ url }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const renderPage = async () => {
      if (!url || !canvasRef.current) return;
      try {
        // โหลดเอกสาร PDF
        const loadingTask = pdfjsLib.getDocument({ url, wasmUrl: PDFJS_WASM_URL });
        const pdf = await loadingTask.promise;
        if (isCancelled) return;

        // ดึงหน้าแรก (Page 1)
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 }); // ปรับความคมชัด
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (canvas && context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          // แก้ไข TypeScript Error: ส่งค่า canvas เข้าไปด้วย
          await page.render({ 
            canvasContext: context, 
            viewport: viewport,
            canvas: canvas 
          }).promise;
          
          if (!isCancelled) setLoading(false);
        }
      } catch (err) {
        console.error("PDF Preview Error:", err);
        if (!isCancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };

    renderPage();
    return () => { isCancelled = true; };
  }, [url]);

  if (error) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400">
      <FaFilePdf size={24} className="mb-1 opacity-50" />
      <span className="text-[10px]">Preview Fail</span>
    </div>
  );

  return (
    <div className="relative w-full h-full bg-white dark:bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 animate-pulse">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
    </div>
  );
};

// --- PDF Viewer Modal Component ---
const PdfViewerModal: React.FC<{ doc: AssignedDocument; onClose: () => void }> = ({ doc, onClose }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc.pdfUrl) {
      setError("ไม่พบ URL ของเอกสาร");
    } else {
      setError(null);
    }
  }, [doc.pdfUrl]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col items-center z-50 p-4 backdrop-blur-sm">
      <div className="w-full flex justify-between items-center p-2 mb-4 flex-shrink-0">
        <h2 className="text-xl font-bold text-white truncate max-w-[calc(100vw-150px)]">
          {doc.subject || `เอกสารเลขรับ ${doc.receiveNo}`}
        </h2>
        <button onClick={onClose} className="text-white text-3xl hover:text-red-500 transition-colors" aria-label="Close PDF viewer">
          <FaWindowClose />
        </button>
      </div>
      <div className="flex-1 w-full max-w-5xl h-full bg-gray-500 rounded-lg">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400">
            <FaFilePdf size={40} />
            <p className="mt-4">{error}</p>
          </div>
        ) : (
          <iframe
            src={doc.pdfUrl}
            className="w-full h-full border-0 rounded-lg"
            title={doc.subject || `เอกสารเลขรับ ${doc.receiveNo}`}
          >
            <p>เบราว์เซอร์ของคุณไม่รองรับการแสดง PDF ในหน้านี้</p>
          </iframe>
        )}
      </div>
    </div>
  );
};

// --- Skeleton Loader Component ---
const AssignedWorkPageSkeleton: React.FC = () => {
  return (
    <>
      {/* Header and Search Skeleton */}
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 animate-pulse">
        <div>
          <SkeletonLoader className="h-10 w-64 rounded-lg mb-3" />
          <SkeletonLoader className="h-5 w-80 rounded-md" />
        </div>
        <div className="relative w-full md:w-80">
          <SkeletonLoader className="w-full h-[58px] rounded-2xl" />
        </div>
      </div>

      {/* Department Filters Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-10 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <SkeletonLoader key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* Document Cards Skeleton */}
      <div className="space-y-6">
        <DocumentCardSkeleton />
        <DocumentCardSkeleton />
        <DocumentCardSkeleton />
      </div>
    </>
  );
};

// --- Main Component ---
const AssignedWorkPage: React.FC = () => {
  const location = useLocation();
  const [documents, setDocuments] = useState<AssignedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Department>("all");
  const [filterId, setFilterId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    if (id) {
      setFilterId(id);
      setActiveTab("all");
    } else {
      setFilterId(null);
    }
  }, [location.search]);

  // State for PDF Viewer Modal
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<AssignedDocument | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(firestore, "users", user.uid));
          if (userDoc.exists()) setSchoolId(userDoc.data().schoolId);
        } catch (error) {
          console.error("Auth error:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchDocuments = async () => {
      if (!schoolId) return;
      setIsLoading(true);
      try {
        const docsRef = collection(firestore, "school-settings", schoolId, "stampedDocuments");
        const q = query(docsRef, where("status", "==", "approved"));
        const querySnapshot = await getDocs(q);

        const docsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as AssignedDocument[];

        docsData.sort((a, b) => (b.approvedAt?.toMillis() || 0) - (a.approvedAt?.toMillis() || 0));
        setDocuments(docsData);
      } catch (error) {
        console.error("Fetch error:", error);
        Swal.fire({ icon: 'error', title: 'ดึงข้อมูลไม่สำเร็จ', confirmButtonColor: '#4f46e5' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchDocuments();
  }, [schoolId]);

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      if (filterId) {
        return doc.id === filterId;
      }
      const matchTab = activeTab === "all" || doc.assignments?.[activeTab] === true;
      const matchSearch = (doc.subject?.toLowerCase().includes(searchTerm.toLowerCase())) || 
                          (doc.receiveNo?.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchTab && matchSearch;
    });
  }, [documents, activeTab, searchTerm, filterId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, itemsPerPage]);

  const handleOpenViewer = (doc: AssignedDocument) => {
    setSelectedDoc(doc);
    setIsViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setIsViewerOpen(false);
    setSelectedDoc(null);
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredDocuments.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredDocuments.length / itemsPerPage);

  const renderDocumentCard = (item: AssignedDocument) => {
    // สีป้ายแผนกชุดเดียวกับหน้าทะเบียนหนังสือ (DocumentRegistryPage) ให้ดูสอดคล้องกันทั้งระบบงานธุรการ
    const deptBadges = [
      item.assignments?.academic && { label: "ฝ่ายวิชาการ", style: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
      item.assignments?.general && { label: "บริหารทั่วไป", style: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
      item.assignments?.budget && { label: "งบประมาณ", style: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
      item.assignments?.personnel && { label: "งานบุคคล", style: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
    ].filter(Boolean) as { label: string; style: string }[];

    const getUrgencyInfo = (urgency: AssignedDocument['urgency']) => {
      switch (urgency) {
        case 'urgent': // ด่วน
          return { text: 'ด่วน', className: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800' };
        case 'very_urgent': // ด่วนมาก
          return { text: 'ด่วนมาก', className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800' };
        case 'most_urgent':
          return { text: 'ด่วนที่สุด', className: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800' };
        default:
          return null; // กรณีไม่มีค่า (สำหรับเอกสารเก่า) หรือเป็นค่าที่ไม่รู้จัก
      }
    };

    const urgencyInfo = getUrgencyInfo(item.urgency);

    // 📌 รวม QR Code ที่พบในแต่ละหน้า (1 หน้าอาจมีได้หลายอัน, เอกสารเก่าที่ยังไม่มี qrCodeUrls จะ fallback ไปใช้ qrCodeUrl เดี่ยว)
    const qrCountByPage: Record<number, number> = {};
    (item.qrCodeUrls || []).forEach(({ page }) => { qrCountByPage[page] = (qrCountByPage[page] || 0) + 1; });
    const seenIndexByPage: Record<number, number> = {};
    const pageQrCodes = (item.qrCodeUrls || []).map(({ page, url }) => {
      const qrIdx = seenIndexByPage[page] || 0;
      seenIndexByPage[page] = qrIdx + 1;
      return { page, qrIdx, url, multipleOnPage: qrCountByPage[page] > 1 };
    });
    const qrLinks = pageQrCodes.length > 0
      ? pageQrCodes
      : (item.qrCodeUrl ? [{ page: 0, qrIdx: 0, url: item.qrCodeUrl, multipleOnPage: false }] : []);

    return (
      <div key={item.id} className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all duration-300">
        <div className="flex flex-col md:flex-row gap-6">
          
          {/* ช่อง Preview: แสดงหน้าแรกของเอกสาร */}
          <div className="flex-shrink-0 w-full md:w-32 h-44 bg-gray-50 dark:bg-[#1e1f21] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 shadow-inner">
            {item.pdfUrl ? (
              <PdfThumbnail url={item.pdfUrl} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <FaImage className="text-3xl" />
              </div>
            )}
          </div>

          {/* ข้อมูลเอกสาร */}
          <div className="flex-1 space-y-3">
            <div className="flex justify-between items-start gap-2">
              <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 leading-snug">
                {item.subject || `เอกสารเลขรับ ${item.receiveNo}`}
              </h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                {urgencyInfo && (
                  <div className={`text-[10px] px-2 py-1 rounded-full border font-bold uppercase tracking-wider ${urgencyInfo.className}`}>
                    {urgencyInfo.text}
                  </div>
                )}
                <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-1 rounded-full border border-emerald-100 dark:border-emerald-800 font-bold uppercase tracking-wider">
                  มอบหมายแล้ว
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-4 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                เลขรับ: {item.receiveNo}
              </span>
              <span className="flex items-center gap-1.5">
                <FaCalendarCheck className="text-gray-400" />
                {item.approvedAt ? item.approvedAt.toDate().toLocaleDateString('th-TH') : '-'}
              </span>
            </div>

            {item.dueDate && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-800/30 w-fit">
                <FaCalendarCheck />
                <span>กำหนดส่ง: {item.dueDate.toDate().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}

            <div className="pt-3 border-t border-gray-50 dark:border-gray-700/50 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <FaBuilding className="text-blue-500 opacity-70" />
                <span className="font-medium">ฝ่ายงานที่ได้รับมอบหมาย:</span>
                {deptBadges.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {deptBadges.map((d) => (
                      <span key={d.label} className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${d.style}`}>
                        {d.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400">ยังไม่ระบุ</span>
                )}
              </div>

              {item.assignments?.assignee && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <FaUserCheck className="text-indigo-500 opacity-70" />
                  <span className="font-medium">ผู้รับผิดชอบ:</span>
                  <span className="text-gray-500 dark:text-gray-400">{item.assignments.assignee}</span>
                </div>
              )}
            </div>

            {item.assignments?.comment && (
              <div className="mt-3 bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-xl border border-indigo-100/50 dark:border-indigo-800/30 flex gap-3">
                <FaCommentDots className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed italic">
                  "{item.assignments.comment}"
                </p>
              </div>
            )}
          </div>

          {/* ปุ่มเปิดเอกสาร */}
          <div className="flex items-end">
            <div className="flex flex-col gap-2 w-full md:w-auto">
                {qrLinks.map(({ page, qrIdx, url, multipleOnPage }) => (
                    <a
                        key={`${page}-${qrIdx}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full md:w-auto flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold transition-all transform active:scale-95"
                        title={`เปิดลิงก์จาก QR Code${page > 0 ? ` ในหน้า ${page + 1}` : ''}`}
                    >
                        <FaQrcode />
                        <span>
                          {qrLinks.length > 1
                            ? `QR หน้า ${page + 1}${multipleOnPage ? ` (${qrIdx + 1})` : ''}`
                            : 'ลิงก์ต้นฉบับ'}
                        </span>
                    </a>
                ))}
                <button
                  onClick={() => handleOpenViewer(item)}
                  className="w-full md:w-auto flex items-center justify-center gap-2 bg-gray-900 dark:bg-indigo-600 hover:bg-black dark:hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all transform active:scale-95 shadow-lg shadow-indigo-200/20 dark:shadow-none"
                >
                  <FaFilePdf />
                  <span>เปิดเอกสาร</span>
                </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-[#f8f9fb] dark:bg-[#151618] transition-colors duration-300 pb-20">
        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#111318]/95 backdrop-blur border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton to="/general-affairs/home" />
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">งานธุรการ</p>
              <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">งานที่ได้รับมอบหมาย</h1>
            </div>
          </div>
        </div>

        {isViewerOpen && selectedDoc && (
          <PdfViewerModal doc={selectedDoc} onClose={handleCloseViewer} />
        )}

        <div className="max-w-5xl mx-auto px-4 pt-10">
          {isLoading ? (
            <AssignedWorkPageSkeleton />
          ) : (
            <>
              <div className="bg-white dark:bg-[#212226] rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <div className="bg-emerald-600 px-6 py-3 flex items-center gap-2">
                  <FaLayerGroup className="text-white/80" size={14} />
                  <h2 className="text-sm font-black text-white">ธุรการมอบหมายแล้ว ({filteredDocuments.length} รายการ)</h2>
                </div>
              </div>

              <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">ติดตามสถานะและตรวจสอบเอกสารสั่งการ</p>
                </div>

                <div className="relative w-full md:w-80 group">
                  <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="ค้นหาชื่อเรื่องหรือเลขที่..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-[#212226] border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 dark:focus:ring-indigo-500/20 transition-all dark:text-white font-medium" 
                  />
                </div>
              </div>

              {/* Department Filters */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-10">
                {(Object.keys(departmentMap) as Department[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex flex-col items-center justify-center text-center p-4 rounded-2xl border-2 transition-all duration-300 transform hover:-translate-y-1 ${
                      activeTab === tab
                        ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/30'
                        : 'bg-white dark:bg-[#212226] border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-500 dark:hover:text-indigo-400'
                    }`}
                  >
                    <div className="text-2xl mb-2">{departmentIcons[tab]}</div>
                    <span className="font-bold text-sm">{departmentMap[tab]}</span>
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="space-y-6">
                {currentItems.length > 0 ? (
                  currentItems.map(renderDocumentCard)
                ) : (
                  <div className="text-center py-32 bg-white dark:bg-[#212226] rounded-[2rem] border-2 border-dashed border-gray-100 dark:border-gray-800">
                    <div className="bg-gray-50 dark:bg-gray-800 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <FaFilePdf className="text-gray-300 text-3xl" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">ไม่พบเอกสาร</h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">ยังไม่มีรายการที่ถูกมอบหมายในหมวดหมู่นี้</p>
                  </div>
                )}
              </div>

              {/* Pagination Controls */}
              {filteredDocuments.length > 0 && (
                <div className="flex flex-col md:flex-row justify-between items-center mt-8 gap-4 bg-white dark:bg-[#212226] p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <span>แสดง</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => setItemsPerPage(Number(e.target.value))}
                      className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span>รายการต่อหน้า</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <FaChevronLeft />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Logic to show limited page numbers with ellipsis
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold transition-all ${
                              currentPage === page
                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30"
                                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return <span key={page} className="px-1 text-gray-400">...</span>;
                      }
                      return null;
                    })}

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <FaChevronRight />
                    </button>
                  </div>

                  <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    หน้า {currentPage} จาก {totalPages} ({filteredDocuments.length} รายการ)
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default AssignedWorkPage;