import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { ArrowLeft, Bot, ListChecks, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import MainLayout from '@/layouts/MainLayout';
import { saveAIConfig, sendAIAssistantMessage, useAIConfig } from './aiService';

const EXAMPLE_QUESTIONS = [
  'วันนี้นักเรียนมากี่คน',
  'นักเรียนชั้น ม.1 มีกี่คน',
  'ขอดูพฤติกรรมของ [ชื่อนักเรียน]',
  'ขอดูเกรดของ [ชื่อนักเรียน]',
  'ขอลิงก์พิมพ์ ปพ.5',
];

const AIAssistantSettingsPage: React.FC = () => {
  const { enabled: savedEnabled, loading } = useAIConfig();

  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (loading || hydrated) return;
    setEnabled(savedEnabled);
    setHydrated(true);
  }, [loading, hydrated, savedEnabled]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveAIConfig(enabled);
      Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าเรียบร้อย', timer: 1500, showConfirmButton: false });
    } catch (err) {
      console.error('Error saving AI config:', err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const reply = await sendAIAssistantMessage('ช่วยอะไรได้บ้าง');
      setTestResult({ ok: true, text: reply });
    } catch (err: any) {
      setTestResult({ ok: false, text: err?.message?.replace(/^firebase:\s*/i, '') || 'เกิดข้อผิดพลาด' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen transition-colors duration-300 bg-gray-50 dark:bg-[#1c1c24]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Link
              to="/owner/hub"
              className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                <Bot className="text-fuchsia-500" /> ตั้งค่าผู้ช่วย AI
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">
                ผู้ช่วยในระบบนี้ทำงานภายในระบบทั้งหมด ไม่เรียกใช้ AI จากภายนอก และไม่มีค่าใช้จ่ายเพิ่มเติม
              </p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-8 shadow-sm flex items-center justify-center">
              <Loader2 className="animate-spin text-gray-400" size={28} />
            </div>
          ) : (
            <div className="space-y-5">
              {/* เปิด/ปิดใช้งาน */}
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 shadow-sm dark:shadow-none flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">เปิดใช้งานผู้ช่วย AI</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    เมื่อเปิด ปุ่มลอย AI จะแสดงให้ผู้ใช้ที่ล็อกอินผ่านระบบ (ครู/บุคลากร) เห็นทุกหน้า
                  </p>
                </div>
                <button
                  onClick={() => setEnabled((v) => !v)}
                  className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                  aria-pressed={enabled}
                >
                  <span
                    className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : ''}`}
                  />
                </button>
              </div>

              {/* วิธีทำงาน */}
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 shadow-sm dark:shadow-none space-y-3">
                <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ListChecks size={16} className="text-indigo-500" /> คำถามที่ตอบได้ตอนนี้
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ผู้ช่วยจับคำถามด้วยรูปแบบที่กำหนดไว้ล่วงหน้า (ไม่ใช่ AI สนทนาอิสระ) จึงต้องถามใกล้เคียงตัวอย่างเหล่านี้:
                </p>
                <ul className="space-y-1.5">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <li key={q} className="text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-[#1e1f21] rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700/50">
                      “{q}”
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-sm hover:shadow-md active:scale-95"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  บันทึกการตั้งค่า
                </button>
                <button
                  onClick={handleTest}
                  disabled={isTesting || !enabled}
                  className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 text-gray-700 dark:text-gray-200 px-4 py-3 rounded-xl font-bold transition-all"
                >
                  {isTesting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  ทดสอบการเชื่อมต่อ
                </button>
              </div>

              {testResult && (
                <div
                  className={`rounded-xl px-4 py-3 text-sm ${
                    testResult.ok
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20'
                      : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20'
                  }`}
                >
                  <p className="font-bold mb-1">{testResult.ok ? 'เชื่อมต่อสำเร็จ' : 'เชื่อมต่อไม่สำเร็จ'}</p>
                  <p className="whitespace-pre-wrap">{testResult.text}</p>
                </div>
              )}

              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <p className="font-bold mb-1">ขอบเขตการเข้าถึงข้อมูลของผู้ช่วย AI</p>
                <p>
                  ผู้ช่วย AI ตอบได้เฉพาะข้อมูลที่ดึงผ่านชุดคำสั่งที่กำหนดไว้ล่วงหน้าเท่านั้น (เช่น จำนวนนักเรียนที่มาเรียนวันนี้
                  คะแนนความประพฤติ เกรด/ผลการเรียนของนักเรียนรายบุคคล) และแต่ละคำสั่งจะตรวจสิทธิ์ของผู้ถามก่อนทุกครั้ง — ตรงกับสิทธิ์ที่ผู้ใช้
                  คนนั้นมีอยู่แล้วในเมนูปกติของระบบ ไม่สามารถเข้าถึงข้อมูลนอกโรงเรียนของตนเอง หรือนอกสิทธิ์ที่มีอยู่ได้ และเนื่องจากทำงาน
                  ด้วยการจับรูปแบบคำถามในระบบเท่านั้น (ไม่ได้เชื่อมต่อ AI ภายนอกใดๆ) จึงตอบคำถามนอกเรื่องระบบไม่ได้อยู่แล้วโดยธรรมชาติ
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default AIAssistantSettingsPage;
