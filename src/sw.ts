/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { initializeApp } from 'firebase/app';
import { onBackgroundMessage, getMessaging } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

// ── VitePWA: skipWaiting + clientsClaim ──────────────────────────────────────
self.addEventListener('install', () => (self as any).skipWaiting());
clientsClaim();

// ── Workbox precache (manifest injected by VitePWA at build time) ─────────────
precacheAndRoute((self as any).__WB_MANIFEST || []);
cleanupOutdatedCaches();

// ── Firebase config ───────────────────────────────────────────────────────────
const firebaseApp = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

const messaging = getMessaging(firebaseApp);

// ── Background push handler ───────────────────────────────────────────────────
// เราเอา onBackgroundMessage ออก เพราะถ้าส่ง payload แบบมี notification 
// Firebase SDK จะแสดงแจ้งเตือนให้อัตโนมัติอยู่แล้ว 
// การเรียก showNotification ซ้ำใน onBackgroundMessage จะทำให้แจ้งเตือนเด้ง 2 อันซ้อนกัน

// ── Notification click → เปิด PWA ไม่ใช่ Chrome ─────────────────────────────
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  if ((event as any).action === 'dismiss') return;

  // link มาจาก notification.data.link หรือ absolute URL จาก fcm_options
  // Firebase Web SDK เก็บ data ไว้ใน event.notification.data.FCM_MSG.data
  const fcmData = (event.notification.data as any)?.FCM_MSG?.data;
  const rawLink: string =
    (event.notification.data as Record<string, string>)?.link ??
    fcmData?.link ??
    self.location.origin + '/notifications';

  // ถ้าเป็น relative path ให้เติม origin
  const url = rawLink.startsWith('http')
    ? rawLink
    : self.location.origin + rawLink;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // ถ้าแอปเปิดอยู่แล้ว → focus + navigate (ใน PWA window เดิม)
        for (const client of clientList) {
          if ('focus' in client) {
            (client as WindowClient).focus();
            (client as WindowClient).navigate(url);
            return;
          }
        }
        // ถ้าแอปปิดอยู่ → เปิด PWA window ใหม่
        return self.clients.openWindow(url);
      }),
  );
});
