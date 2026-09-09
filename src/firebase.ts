// src/firebase.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setLogLevel } from "firebase/firestore"; // เปลี่ยนจาก database เป็น firestore
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

setLogLevel("silent");

export const auth = getAuth(app);
export const firestore = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
}); // export firestore แทน database — persistentLocalCache เก็บ pending writes ใน IndexedDB
export const storage = getStorage(app);

// Cloud Functions — ทุกไฟล์ที่เรียก getFunctions() (ไม่ระบุ region) จะได้ instance เดียวกันนี้
// เปิดใช้ emulator เฉพาะตอนตั้งค่า VITE_USE_FUNCTIONS_EMULATOR=true ใน .env.local เท่านั้น
// (Auth/Firestore ยังคงต่อกับโปรเจกต์จริงตามปกติ — ใช้สำหรับทดสอบแก้ functions/index.js โดยไม่ต้อง deploy)
export const functions = getFunctions(app);
if (import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  console.warn("[firebase] Cloud Functions ต่อกับ Emulator ที่ 127.0.0.1:5001 (VITE_USE_FUNCTIONS_EMULATOR=true)");
}

// FCM messaging — only available in secure contexts with service worker support
export const getFirebaseMessaging = async () => {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
};
