import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Bot, Send, X, Loader2, Minus } from 'lucide-react';
import { auth } from '@/firebase';
import { useAIConfig, sendAIAssistantMessage } from './aiService';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

// จับลิงก์หน้าในระบบที่ AI แนบมาในคำตอบ (เช่นตอนตอบ get_report_document_link) แล้วเปลี่ยนเป็นปุ่มกดได้จริง
// จำกัดเฉพาะ path prefix ที่รู้จักในแอป กันไม่ให้จับพลาดกับตัวเลขแบบ "80/100" ที่ AI อาจพิมพ์ปนมา
const IN_APP_LINK_PATTERN = /(^|\s)(\/(?:academic|school|owner|student-support|attendance|general-affairs|director|administrator)\/[a-zA-Z0-9\-/]+)/g;

const renderMessageWithLinks = (text: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  IN_APP_LINK_PATTERN.lastIndex = 0;
  while ((match = IN_APP_LINK_PATTERN.exec(text))) {
    const [full, leadingSpace, path] = match;
    const matchStart = match.index + leadingSpace.length;
    if (matchStart > lastIndex) nodes.push(text.slice(lastIndex, matchStart));
    nodes.push(
      <Link key={matchStart} to={path} className="underline font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300">
        {path}
      </Link>
    );
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

// ปุ่มลอย AI Assistant — ติดตั้งไว้ใน MainLayout เดียว จึงแสดงทุกหน้าโดยอัตโนมัติ
// แสดงเฉพาะเมื่อผู้ดูแลระบบเปิดใช้งานไว้ (ai_config/settings.enabled) และผู้ใช้ล็อกอินผ่าน
// Firebase Auth จริง (ครู/บุคลากร) — นักเรียน/ผู้ปกครองใช้ session แบบ local จึงไม่มีสิทธิ์เรียก
// Cloud Function นี้ และจะไม่เห็นปุ่มนี้เลย ผู้ช่วยเป็นแบบ rule-based ตอบได้เฉพาะคำถามที่จับรูปแบบได้
// ในระบบเท่านั้น (ดู functions/index.js: aiHandleMessage) ไม่ได้เรียก LLM ภายนอกใดๆ
const AIAssistantWidget: React.FC = () => {
  const { enabled, loading: configLoading } = useAIConfig();
  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setFirebaseUser(user));
    return () => unsub();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isOpen]);

  if (configLoading || !enabled || !firebaseUser) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    try {
      const reply = await sendAIAssistantMessage(text);
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
    } catch (err: any) {
      const errorText = err?.message?.replace(/^firebase:\s*/i, '') || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: 'assistant', text: errorText, error: true }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed z-[9999] bottom-[calc(1.25rem+72px)] right-4 sm:right-6 w-[min(24rem,calc(100vw-2rem))] h-[min(32rem,calc(100vh-8rem))] bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/50 flex flex-col overflow-hidden origin-bottom-right animate-chatPopIn">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-white/15 border-2 border-white/40 flex items-center justify-center">
                  <Bot size={18} />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">ผู้ช่วย AI ระบบโรงเรียน</p>
                <p className="text-[11px] text-white/80">พร้อมใช้งาน</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                aria-label="ย่อหน้าต่างแชท"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                aria-label="ปิด"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-gray-50 dark:bg-[#1e1f21]">
            {messages.length === 0 && (
              <div className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6 px-4">
                ถามได้เฉพาะข้อมูลในระบบโรงเรียน เช่น "วันนี้นักเรียนมากี่คน" หรือ "วิเคราะห์พฤติกรรมนักเรียนคนนี้หน่อย"
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : m.error
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 rounded-bl-sm'
                        : 'bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700/50 rounded-bl-sm'
                  }`}
                >
                  {m.role === 'assistant' && !m.error ? renderMessageWithLinks(m.text) : m.text}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700/50 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
                </div>
              </div>
            )}
          </div>

          <div className="p-2.5 border-t border-gray-200 dark:border-gray-700/50 bg-white dark:bg-[#2a2b2f] shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์คำถามเกี่ยวกับข้อมูลในระบบ..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-h-24"
              />
              <button
                onClick={handleSend}
                disabled={isSending || !input.trim()}
                className="w-9 h-9 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                aria-label="ส่ง"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed z-[9999] bottom-5 right-4 sm:right-6 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center ring-4 ring-white/70 dark:ring-black/20"
        aria-label={isOpen ? 'ปิดผู้ช่วย AI' : 'เปิดผู้ช่วย AI'}
      >
        {isOpen ? <X size={22} /> : <Bot size={24} />}
        {!isOpen && (
          <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white dark:border-[#1e1f21]">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
          </span>
        )}
      </button>
    </>
  );
};

export default AIAssistantWidget;
