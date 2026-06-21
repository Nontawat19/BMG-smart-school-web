import { useEffect, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseMessaging } from '@/firebase';
import { firestore } from '@/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

async function saveFcmToken(uid: string, token: string) {
  try {
    await setDoc(
      doc(firestore, 'users', uid, 'fcm_tokens', token),
      { token, updatedAt: serverTimestamp(), platform: 'web' },
      { merge: true },
    );
    console.log('[FCM] ✅ บันทึก token แล้ว');
  } catch (err) {
    console.error('[FCM] ❌ บันทึก token ล้มเหลว:', err);
  }
}

export function useFcmNotification(uid: string | null | undefined) {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!uid || registeredRef.current) return;
    if (!VAPID_KEY) {
      console.warn('[FCM] ⚠️ VITE_FIREBASE_VAPID_KEY ยังไม่ได้ตั้งค่า');
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[FCM] ⚠️ browser ไม่รองรับ push notification');
      return;
    }

    let unsubForeground: (() => void) | undefined;

    const setup = async () => {
      try {
        const messaging = await getFirebaseMessaging();
        if (!messaging) {
          console.warn('[FCM] ⚠️ Firebase Messaging ไม่รองรับบน browser นี้');
          return;
        }

        // ขอ permission — ถ้าถูกปฏิเสธแล้วจะไม่ถามซ้ำ
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('[FCM] ⚠️ ผู้ใช้ไม่อนุญาต notification:', permission);
          return;
        }

        // รอ VitePWA's SW พร้อม (ไม่ต้อง register แยก — SW เดียวรวม workbox + FCM)
        const swReg = await navigator.serviceWorker.ready;
        console.log('[FCM] SW พร้อมแล้ว:', swReg.scope);

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (!token) {
          console.error('[FCM] ❌ ไม่ได้รับ token — ตรวจสอบ VAPID key และ Firebase Console');
          return;
        }

        await saveFcmToken(uid, token);
        registeredRef.current = true;
        console.log('[FCM] ✅ ลงทะเบียน push notification สำเร็จ');

        // Foreground handler — เมื่อแอปเปิดอยู่และมีการแจ้งเตือนเข้า
        unsubForeground = onMessage(messaging, (payload) => {
          const title = payload.notification?.title ?? 'BMG Smart School';
          const body = payload.notification?.body ?? '';
          const icon = payload.notification?.icon ?? '/pwa-192x192.png';
          if (Notification.permission === 'granted') {
            new Notification(title, {
              body,
              icon,
              badge: '/pwa-192x192.png',
              data: payload.data,
            });
          }
        });
      } catch (err) {
        console.error('[FCM] ❌ setup ล้มเหลว:', err);
      }
    };

    setup();

    return () => {
      if (unsubForeground) unsubForeground();
    };
  }, [uid]);
}
