import React, { useEffect, useState } from "react";
import { firestore } from "@/firebase";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { FileText, Search, X, Loader2, ExternalLink, Send } from "lucide-react";
import { formatChatMessageDateTime } from "./chatConstants";

export interface InternalSystemDocument {
  id: string;
  category: "หนังสือรับ/งานมอบหมาย" | "คำสั่งโรงเรียน" | "หนังสือส่ง" | "ประกาศ" | "บันทึกข้อความ";
  no: string;
  subject: string;
  docDate: string;
  pdfUrl: string;
  extra?: string;
}

interface InternalDocumentPickerModalProps {
  schoolId: string;
  onClose: () => void;
  onSelect: (doc: InternalSystemDocument) => void;
}

type TabType = "all" | "stamped" | "orders" | "sent" | "announcements" | "memos";

export const InternalDocumentPickerModal: React.FC<InternalDocumentPickerModalProps> = ({
  schoolId,
  onClose,
  onSelect,
}) => {
  const [tab, setTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<InternalSystemDocument[]>([]);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;

    const fetchDocuments = async () => {
      setLoading(true);
      try {
        const results: InternalSystemDocument[] = [];

        // 1. หนังสือรับ (stampedDocuments)
        if (tab === "all" || tab === "stamped") {
          const snap = await getDocs(
            query(collection(firestore, "school-settings", schoolId, "stampedDocuments"), orderBy("createdAt", "desc"), limit(100))
          );
          snap.docs.forEach((d) => {
            const data = d.data();
            const url = data.pdfUrl || data.fileUrl;
            if (url) {
              results.push({
                id: d.id,
                category: "หนังสือรับ/งานมอบหมาย",
                no: data.docRefNo || data.receiveNo || "-",
                subject: data.subject || "ไม่มีระบุเรื่อง",
                docDate: data.docDate || data.date || "",
                pdfUrl: url,
                extra: data.from || data.assignments?.assignee || "",
              });
            }
          });
        }

        // 2. คำสั่งโรงเรียน (orders)
        if (tab === "all" || tab === "orders") {
          const snap = await getDocs(
            query(collection(firestore, "school-settings", schoolId, "orders"), orderBy("createdAt", "desc"), limit(100))
          );
          snap.docs.forEach((d) => {
            const data = d.data();
            const url = data.fileUrl || data.pdfUrl;
            if (url) {
              results.push({
                id: d.id,
                category: "คำสั่งโรงเรียน",
                no: data.orderNo || "-",
                subject: data.subject || "ไม่มีระบุเรื่อง",
                docDate: data.docDate || "",
                pdfUrl: url,
                extra: data.signedBy || "",
              });
            }
          });
        }

        // 3. หนังสือส่ง (sentDocuments)
        if (tab === "all" || tab === "sent") {
          const snap = await getDocs(
            query(collection(firestore, "school-settings", schoolId, "sentDocuments"), orderBy("createdAt", "desc"), limit(100))
          );
          snap.docs.forEach((d) => {
            const data = d.data();
            const url = data.fileUrl || data.pdfUrl;
            if (url) {
              results.push({
                id: d.id,
                category: "หนังสือส่ง",
                no: data.docRefNo || data.sentNo || "-",
                subject: data.subject || "ไม่มีระบุเรื่อง",
                docDate: data.docDate || "",
                pdfUrl: url,
                extra: data.to || "",
              });
            }
          });
        }

        // 4. ประกาศ (announcements)
        if (tab === "all" || tab === "announcements") {
          const snap = await getDocs(
            query(collection(firestore, "school-settings", schoolId, "announcements"), orderBy("createdAt", "desc"), limit(100))
          );
          snap.docs.forEach((d) => {
            const data = d.data();
            const url = data.fileUrl || data.pdfUrl;
            if (url) {
              results.push({
                id: d.id,
                category: "ประกาศ",
                no: data.announcementNo || "-",
                subject: data.subject || "ไม่มีระบุเรื่อง",
                docDate: data.docDate || "",
                pdfUrl: url,
                extra: data.signedBy || "",
              });
            }
          });
        }

        // 5. บันทึกข้อความ (memos)
        if (tab === "all" || tab === "memos") {
          const snap = await getDocs(
            query(collection(firestore, "school-settings", schoolId, "memos"), orderBy("createdAt", "desc"), limit(100))
          );
          snap.docs.forEach((d) => {
            const data = d.data();
            const url = data.fileUrl || data.pdfUrl;
            if (url) {
              results.push({
                id: d.id,
                category: "บันทึกข้อความ",
                no: data.memoNo || "-",
                subject: data.subject || "ไม่มีระบุเรื่อง",
                docDate: data.docDate || "",
                pdfUrl: url,
                extra: data.from || "",
              });
            }
          });
        }

        if (!cancelled) {
          setDocuments(results);
        }
      } catch (error) {
        console.error("Error loading internal system documents:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDocuments();
    return () => {
      cancelled = true;
    };
  }, [schoolId, tab]);

  const filtered = documents.filter((d) => {
    const kw = search.trim().toLowerCase();
    if (!kw) return true;
    return (
      d.no.toLowerCase().includes(kw) ||
      d.subject.toLowerCase().includes(kw) ||
      (d.extra && d.extra.toLowerCase().includes(kw))
    );
  });

  const tabs: { id: TabType; label: string }[] = [
    { id: "all", label: "ทั้งหมด" },
    { id: "stamped", label: "หนังสือรับ/งานมอบหมาย" },
    { id: "orders", label: "คำสั่ง" },
    { id: "sent", label: "หนังสือส่ง" },
    { id: "announcements", label: "ประกาศ" },
    { id: "memos", label: "บันทึกข้อความ" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh] border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <FileText size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">เลือกส่งเอกสาร PDF ในระบบ</p>
              <p className="text-[11px] text-gray-400">อ้างอิงไฟล์เดิม ไม่ต้องอัปโหลดใหม่ ประหยัดพื้นที่จัดเก็บ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 flex gap-1 overflow-x-auto pb-1 no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                tab === t.id
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-4 py-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขที่, ชื่อเรื่อง หรือผู้ลงนาม/ต้นทาง..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-gray-400 text-xs">
                <Loader2 size={16} className="animate-spin text-indigo-500" /> กำลังโหลดเอกสารในระบบ...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                <FileText size={28} className="mx-auto mb-2 opacity-30" />
                ไม่พบเอกสารที่มีไฟล์ PDF แนบในหมวดนี้
              </div>
            ) : (
              filtered.map((d) => (
                <div
                  key={`${d.category}-${d.id}`}
                  className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                        {d.category}
                      </span>
                      <span className="truncate text-xs font-bold text-gray-900 dark:text-white">
                        {d.no}
                      </span>
                      {d.docDate && (
                        <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                          {d.docDate}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2" title={d.subject}>
                      {d.subject}
                    </p>
                    {d.extra && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">
                        {d.extra}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={d.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700 dark:hover:text-indigo-300 transition"
                      title="เปิดดูตัวอย่าง PDF"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={() => onSelect(d)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition active:scale-95 shadow-xs"
                    >
                      <Send size={12} />
                      ส่งในแชท
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InternalDocumentPickerModal;
