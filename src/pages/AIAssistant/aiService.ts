import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firestore as db, auth, functions } from '@/firebase';

// ผู้ช่วย AI ในระบบนี้เป็นแบบ rule-based (จับคำถามด้วย keyword matching ใน functions/index.js)
// ไม่เรียก LLM ภายนอกใดๆ จึงไม่มี API key/provider ให้ตั้งค่า — มีแค่เปิด/ปิดใช้งานเท่านั้น
export interface AIConfig {
  enabled: boolean;
}

const DEFAULT_CONFIG: AIConfig = { enabled: false };

const configRef = () => doc(db, 'ai_config', 'settings');

// ผู้ใช้ที่ล็อกอินจริงทุกคนอ่านเอกสารนี้ได้ (ไม่มีข้อมูลลับอยู่ในนี้) เพื่อให้ปุ่มลอย AI
// รู้ว่าควรแสดงหรือไม่ — ดูกติกาใน firestore.rules (ai_config/settings)
export const useAIConfig = () => {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      configRef(),
      (snap) => {
        setConfig(snap.exists() ? { ...DEFAULT_CONFIG, ...(snap.data() as Partial<AIConfig>) } : DEFAULT_CONFIG);
        setLoading(false);
      },
      () => {
        // นักเรียน/ผู้ปกครอง (session แบบ local) หรือผู้ใช้ที่ยังไม่ล็อกอินผ่าน Firebase Auth
        // จะอ่านเอกสารนี้ไม่ได้ตาม rules — ถือว่าปิดใช้งานสำหรับ session นั้นไปเลย
        setConfig(DEFAULT_CONFIG);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { ...config, loading };
};

export const saveAIConfig = async (enabled: boolean) => {
  const uid = auth.currentUser?.uid || null;
  await setDoc(configRef(), { enabled, updatedAt: serverTimestamp(), updatedByUid: uid });
};

export const sendAIAssistantMessage = async (message: string): Promise<string> => {
  const callable = httpsCallable<{ message: string }, { reply: string }>(functions, 'aiAssistantChat');
  const result = await callable({ message });
  return result.data.reply;
};
