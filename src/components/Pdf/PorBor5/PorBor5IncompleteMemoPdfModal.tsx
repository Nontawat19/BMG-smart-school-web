import React, { useEffect, useState } from 'react';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { X, FileDown, Loader2, FileText } from 'lucide-react';
import { firestore } from '@/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import PorBor5IncompleteMemoPdfDocument, {
  PorBor5MemoPdfProps,
} from './PorBor5IncompleteMemoPdfDocument';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pdfProps: PorBor5MemoPdfProps;
  schoolId?: string;
  createdBy?: string;
}

export const PorBor5IncompleteMemoPdfModal: React.FC<Props> = ({
  isOpen,
  onClose,
  pdfProps,
  schoolId,
  createdBy,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [docNo, setDocNo] = useState('');

  // ล้างค่าเลขที่หนังสือทุกครั้งที่เปิด modal ใหม่ (ไม่เอาเลขเดิมจากรอบก่อนค้างไว้)
  useEffect(() => {
    if (isOpen) setDocNo('');
  }, [isOpen]);

  if (!isOpen) return null;

  const semSlug =
    pdfProps.semester === '1'
      ? 'เทอม1'
      : pdfProps.semester === '2'
      ? 'เทอม2'
      : 'ตลอดปีการศึกษา';
  const fileName = `บันทึกข้อความ_รายงานติดตามปพ5_ปี${pdfProps.academicYear}_${semSlug}.pdf`;

  const periodText =
    pdfProps.semester === '1'
      ? `ประจำภาคเรียนที่ 1 ปีการศึกษา ${pdfProps.academicYear}`
      : pdfProps.semester === '2'
      ? `ประจำภาคเรียนที่ 2 ปีการศึกษา ${pdfProps.academicYear}`
      : `ประจำปีการศึกษา ${pdfProps.academicYear}`;

  const effectivePdfProps = { ...pdfProps, docNo: docNo.trim() || pdfProps.docNo };

  const handleDownload = async () => {
    if (!docNo.trim()) return;
    setIsDownloading(true);
    try {
      const blob = await pdf(<PorBor5IncompleteMemoPdfDocument {...effectivePdfProps} />).toBlob();
      saveAs(blob, fileName);

      // 📌 บันทึกลงทะเบียนบันทึกข้อความ (school-settings/{schoolId}/memos) เพื่อให้ดูย้อนหลังได้ที่
      // หน้า /general-affairs/registry — ใช้เลขที่ผู้ใช้กรอกเองเป็นเลขทะเบียน ไม่สร้างเลขอัตโนมัติ
      // เพราะเลขหนังสือจริงต้องอ้างอิงทะเบียนสารบรรณของโรงเรียน ไม่ใช่ตัวนับในระบบ
      if (schoolId) {
        try {
          await addDoc(collection(firestore, 'school-settings', schoolId, 'memos'), {
            memoNo: docNo.trim(),
            subject: `รายงานผลการติดตามการจัดทำสมุดบันทึกผลการเรียนรู้รายวิชา (ปพ.5) ${periodText}`,
            to: pdfProps.directorName || 'ผู้อำนวยการโรงเรียน',
            notes: `รายวิชาที่ยังไม่เสร็จสมบูรณ์ ${pdfProps.items.length} รายวิชา`,
            academicYear: pdfProps.academicYear,
            createdBy: createdBy || 'ระบบ',
            createdAt: Timestamp.now(),
          });
        } catch (regErr) {
          // ไม่ block การดาวน์โหลดไฟล์ที่ผู้ใช้ได้ไปแล้ว แม้บันทึกทะเบียนไม่สำเร็จ
          console.error('Error saving memo to registry:', regErr);
        }
      }
    } catch (err) {
      console.error('Error generating PorBor5 Memo PDF:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[calc(100vh-80px)] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-700 bg-white dark:bg-[#1e1f21] rounded-t-2xl gap-4">
          {/* ฝั่งซ้าย: ไอคอนเอกสาร และชื่อหัวข้อเอกสารที่ชัดเจน อ่านง่าย ไม่ตัดคำมั่ว */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 shadow-xs">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                ตัวอย่างเอกสาร — บันทึกข้อความรายงานติดตาม ปพ.๕
              </h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                  {periodText}
                </span>
                <span className="hidden sm:inline-block truncate max-w-[220px] md:max-w-xs text-slate-400 dark:text-slate-500" title={fileName}>
                  {fileName}
                </span>
              </div>
            </div>
          </div>

          {/* ฝั่งขวา: กลุ่มเครื่องมือ (ช่องกรอกเลขที่หนังสือ, ปุ่มดาวน์โหลด, ปุ่มปิด) จัดกึ่งกลางบรรทัดเดียวกันเสมอ ไม่ตกบรรทัด */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* ช่องกรอกเลขที่หนังสือ ดีไซน์เรียบหรูเป็นชุดเดียวกัน */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20 transition-all">
              <label htmlFor="porbor5-memo-docno" className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                เลขที่หนังสือ <span className="text-red-500">*</span>
              </label>
              <input
                id="porbor5-memo-docno"
                type="text"
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="เช่น กป 0001/2569"
                className="h-7 w-32 sm:w-36 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none font-medium"
              />
            </div>

            {/* ปุ่มดาวน์โหลด PDF */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading || !docNo.trim()}
              title={!docNo.trim() ? 'กรุณากรอกเลขที่หนังสือก่อนดาวน์โหลด' : undefined}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              <span>{isDownloading ? 'กำลังบันทึก...' : 'ดาวน์โหลด'}</span>
            </button>

            {/* เส้นคั่นแนวตั้ง */}
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

            {/* ปุ่มปิด Modal ยึดตำแหน่งขวาสุดอย่างมั่นคง */}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition"
              title="ปิด"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-b-2xl bg-slate-100 dark:bg-slate-900">
          <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
            <PorBor5IncompleteMemoPdfDocument {...effectivePdfProps} />
          </PDFViewer>
        </div>
      </div>
    </div>
  );
};

export default PorBor5IncompleteMemoPdfModal;
