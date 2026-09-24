import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { X, FileDown, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { firestore } from '@/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import {
  PorBor5SubmissionMemoPdfDocument,
  PorBor5SubmissionMemoPdfProps,
} from './PorBor5SubmissionMemoPdfDocument';
import { archiveGeneratedPdf } from '@/utils/pdfArchiveUtils';
import ThaiDatePicker from '@/components/Common/ThaiDatePicker';

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** "2026-09-24" → "24 กันยายน 2569" (ปี พ.ศ.) ตามรูปแบบวันที่ในหนังสือราชการ */
const formatThaiLongDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pdfProps: PorBor5SubmissionMemoPdfProps;
  schoolId?: string;
  createdBy?: string;
}

export const PorBor5SubmissionMemoPdfModal: React.FC<Props> = ({
  isOpen,
  onClose,
  pdfProps,
  schoolId,
  createdBy,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [docNo, setDocNo] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [dateIso, setDateIso] = useState('');
  const [targetPercentage, setTargetPercentage] = useState('');
  const [isSavedToRegistry, setIsSavedToRegistry] = useState(false);

  // Debounced values for PDFViewer to keep input typing smooth at 60fps
  const [debouncedDocNo, setDebouncedDocNo] = useState('');
  const [debouncedDateStr, setDebouncedDateStr] = useState('');
  const [debouncedTargetPercentage, setDebouncedTargetPercentage] = useState('');
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Initialize date format
  useEffect(() => {
    if (isOpen) {
      setDocNo('');
      setDebouncedDocNo('');
      setIsSavedToRegistry(false);
      setTargetPercentage('');
      setDebouncedTargetPercentage('');

      const now = new Date();
      const thaiMonths = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
      ];
      const day = now.getDate();
      const month = thaiMonths[now.getMonth()];
      const year = now.getFullYear() + 543;
      const formattedDate = `${day} ${month} ${year}`;
      setDateStr(formattedDate);
      setDebouncedDateStr(formattedDate);
    }
  }, [isOpen]);

  // Debounce user input updates by 500ms before sending to PDFViewer
  useEffect(() => {
    if (!isOpen) return;
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedDocNo(docNo);
      setDebouncedDateStr(dateStr);
      setDebouncedTargetPercentage(targetPercentage);
      setIsDebouncing(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [docNo, dateStr, targetPercentage, isOpen]);

  const semSlug =
    pdfProps.semester === '1'
      ? 'เทอม1'
      : pdfProps.semester === '2'
      ? 'เทอม2'
      : 'ตลอดปี';

  const teacherSlug = pdfProps.teacherName ? `_${pdfProps.teacherName.replace(/\s+/g, '_')}` : '';
  const fileName = `บันทึกข้อความ_รายงานผลสัมฤทธิ์ทางการเรียน${teacherSlug}_ปี${pdfProps.academicYear}_${semSlug}.pdf`;

  // Use debounced values for the in-modal preview
  const previewPdfProps = useMemo<PorBor5SubmissionMemoPdfProps>(() => ({
    ...pdfProps,
    docNo: debouncedDocNo.trim(),
    dateStr: debouncedDateStr.trim(),
    targetPercentage: debouncedTargetPercentage.trim(),
  }), [pdfProps, debouncedDocNo, debouncedDateStr, debouncedTargetPercentage]);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Use latest real-time values for download
      const downloadPdfProps: PorBor5SubmissionMemoPdfProps = {
        ...pdfProps,
        docNo: docNo.trim(),
        dateStr: dateStr.trim(),
        targetPercentage: targetPercentage.trim(),
      };

      const blob = await pdf(<PorBor5SubmissionMemoPdfDocument {...downloadPdfProps} />).toBlob();
      saveAs(blob, fileName);

      // บันทึกลงระบบสารบรรณโรงเรียน school-settings/{schoolId}/memos
      if (schoolId) {
        try {
          let pdfUrl: string | undefined;
          let storagePath: string | undefined;
          try {
            const archived = await archiveGeneratedPdf(schoolId, 'porbor5-submission-memos', blob, fileName);
            pdfUrl = archived.url;
            storagePath = archived.storagePath;
          } catch (archiveErr) {
            console.warn('Could not archive memo PDF:', archiveErr);
          }

          const subject = `รายงานผลสัมฤทธิ์ทางการเรียน ภาคเรียนที่ ${pdfProps.semester} ปีการศึกษา ${pdfProps.academicYear}`;
          await addDoc(collection(firestore, 'school-settings', schoolId, 'memos'), {
            memoNo: docNo.trim() || 'ยังไม่ระบุเลขที่',
            subject,
            to: pdfProps.directorName || 'ผู้อำนวยการโรงเรียน',
            sender: pdfProps.teacherName,
            notes: `รายงานผลสัมฤทธิ์ทางการเรียน จำนวน ${pdfProps.courses.length} รายวิชา/ห้อง`,
            academicYear: pdfProps.academicYear,
            semester: pdfProps.semester,
            createdBy: createdBy || pdfProps.teacherName || 'ระบบ',
            createdAt: Timestamp.now(),
            ...(pdfUrl ? { pdfUrl, storagePath } : {}),
          });
          setIsSavedToRegistry(true);
        } catch (regErr) {
          console.error('Error saving memo to registry:', regErr);
        }
      }
    } catch (err) {
      console.error('Error generating PorBor5 submission memo PDF:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  // พื้นหลังมืด/เบลอเริ่มที่ขอบบนสุดของจอและอยู่ "ใต้" Navbar (Navbar z-[9999] ทึบกว่า) จึงชิด Navbar พอดีเสมอไม่ว่า Navbar สูงเท่าไร
  // ส่วนตัวหน้าต่างเว้นด้านบน 76px ให้พ้น Navbar — render ผ่าน portal ไปที่ body เพื่อไม่ให้ container ของหน้า (transform/overflow)
  // ทำให้ตำแหน่ง fixed เพี้ยน; คลิกพื้นหลังเพื่อปิด รูปแบบหัวหน้าต่างเหมือนหน้า /academic/teacher-schedule-view
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pb-4 pt-[76px] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[calc(100vh-92px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-900 dark:text-white">
              ตัวอย่างเอกสาร — บันทึกข้อความรายงานผลสัมฤทธิ์ทางการเรียน
            </h2>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {pdfProps.teacherName} • ประจำภาคเรียนที่ {pdfProps.semester} ปีการศึกษา {pdfProps.academicYear} ({pdfProps.courses.length} รายวิชา)
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              {isDownloading ? 'กำลังบันทึก...' : 'ดาวน์โหลด'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Action Controls & Input Fields */}
        <div className="px-5 py-3 bg-gray-50/50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-end gap-3 text-xs">
          <div className="flex-1 min-w-[140px] max-w-[200px]">
            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
              เลขที่บันทึกข้อความ
            </label>
            <input
              type="text"
              value={docNo}
              onChange={(e) => setDocNo(e.target.value)}
              placeholder="เช่น ศธ 04.../..."
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none dark:text-white"
            />
          </div>

          <div className="flex-1 min-w-[140px] max-w-[200px]">
            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
              วันที่ในบันทึกข้อความ
            </label>
            <div className="flex items-center gap-1.5">
              <ThaiDatePicker
                value={dateIso || null}
                placeholder="เลือกวันที่จากปฏิทิน"
                onChange={(iso) => {
                  setDateIso(iso);
                  setDateStr(formatThaiLongDate(iso));
                }}
                className="text-xs [&>div:first-child]:min-h-[32px] [&>div:first-child]:py-1.5 [&>div:first-child]:px-2.5"
              />
              {dateIso ? (
                <button
                  type="button"
                  onClick={() => {
                    setDateIso('');
                    setDateStr('');
                  }}
                  title="ล้างวันที่ (ปล่อยเป็นเส้นจุดไข่ปลาให้เขียนเอง)"
                  className="shrink-0 rounded-lg border border-gray-300 px-2 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  ล้าง
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex-1 min-w-[160px] max-w-[220px]">
            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
              ค่าเป้าหมายผลการเรียนระดับดี (ร้อยละ)
            </label>
            <input
              type="text"
              value={targetPercentage}
              onChange={(e) => setTargetPercentage(e.target.value)}
              placeholder="เช่น 70"
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none dark:text-white"
            />
          </div>

          {isDebouncing && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 py-2">
              <Loader2 size={13} className="animate-spin" />
              <span>กำลังอัปเดตตัวอย่าง...</span>
            </div>
          )}

        </div>

        {isSavedToRegistry && (
          <div className="px-5 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 size={14} />
            <span>ดาวน์โหลดสำเร็จ พร้อมบันทึกลงสู่ทะเบียนบันทึกข้อความของโรงเรียนเรียบร้อยแล้ว</span>
          </div>
        )}

        {/* PDF Viewer */}
        <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-[#1e1f21]">
          <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
            <PorBor5SubmissionMemoPdfDocument {...previewPdfProps} />
          </PDFViewer>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PorBor5SubmissionMemoPdfModal;
