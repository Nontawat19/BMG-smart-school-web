import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, firestore as db } from "@/firebase";
import { RootState } from "@/store";
import { FaShieldAlt, FaSignOutAlt, FaCheck, FaExternalLinkAlt } from "react-icons/fa";
import { PRIVACY_POLICY_VERSION, TERMS_OF_USE_VERSION } from "@/constants/legalVersions";
import { privacyPolicySections } from "@/pages/Legal/PrivacyPolicyPage";
import { termsOfUseSections } from "@/pages/Legal/TermsOfUsePage";
import { LegalSection } from "@/pages/Legal/LegalPageLayout";

import { getOrFetchAcademicYear } from "@/utils/academicYearUtils";
import LoadingScreen from "./LoadingScreen";

interface ConsentIdentity {
  consentKey: string;
  schoolId: string | null;
  userType: "teacher" | "student" | "parent";
  refId: string | null;
  academicYear: string;
}

/**
 * ระบุตัวตนผู้ใช้และสร้าง Consent Key ที่ผูกกับตัวตนจริง + ปีการศึกษา
 * เพื่อให้ผู้ปกครองและนักเรียนคลิกยอมรับเพียง "ปีการศึกษาละ 1 ครั้ง"
 * แม้จะออกจากระบบหรือเข้าใหม่ (Anonymous Auth UID เปลี่ยน) ก็จะไม่ต้องกดซ้ำ
 */
// ปีการศึกษาต้องอ่านจาก Firestore ก่อนถึงจะรู้ consentKey — แต่ตอนเข้าเว็บครั้งถัดๆ ไปผู้ใช้เคยยอมรับแล้ว
// (localStorage) จึงเก็บปีล่าสุดไว้เพื่อตัดสินได้ทันทีโดยไม่ต้องรอ network (cachedOnly) แล้วค่อยยืนยันซ้ำเบื้องหลัง
const getAcademicYearForConsent = async (schoolId: string | null, cachedOnly: boolean): Promise<string | null> => {
  const cacheKey = `consent_academic_year_${schoolId || "none"}`;
  if (cachedOnly) {
    try { return localStorage.getItem(cacheKey); } catch { return null; }
  }
  const year = await getOrFetchAcademicYear(db, schoolId);
  try { localStorage.setItem(cacheKey, year); } catch { /* ignore */ }
  return year;
};

const resolveConsentIdentity = async (
  reduxSchoolId: string | null | undefined,
  firebaseUid: string | undefined,
  cachedOnly = false
): Promise<ConsentIdentity | null> => {
  const userType = localStorage.getItem("currentUserType");

  if (userType === "student") {
    try {
      const raw = localStorage.getItem("studentSession");
      if (raw) {
        const { schoolId, studentId } = JSON.parse(raw);
        if (schoolId && studentId) {
          const academicYear = await getAcademicYearForConsent(schoolId, cachedOnly);
          if (!academicYear) return null;
          return {
            consentKey: `student_${schoolId}_${studentId}_${academicYear}`,
            schoolId,
            userType: "student",
            refId: studentId,
            academicYear,
          };
        }
      }
    } catch {
      // ignore
    }
  } else if (userType === "parent") {
    try {
      const raw = localStorage.getItem("parentSession");
      if (raw) {
        const parsed = JSON.parse(raw);
        const { children, phone } = parsed;
        const first = Array.isArray(children) ? children[0] : null;
        const schoolId = first?.schoolId || null;
        const parentId = phone || first?.studentDocId || "default";
        if (schoolId) {
          const academicYear = await getAcademicYearForConsent(schoolId, cachedOnly);
          if (!academicYear) return null;
          return {
            consentKey: `parent_${schoolId}_${parentId}_${academicYear}`,
            schoolId,
            userType: "parent",
            refId: parentId,
            academicYear,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // ครู/แอดมิน ที่มีบัญชี Firebase จริง
  const schoolId = reduxSchoolId || null;
  const uid = firebaseUid || "anonymous";
  const academicYear = await getAcademicYearForConsent(schoolId, cachedOnly);
  if (!academicYear) return null;
  return {
    consentKey: `teacher_${uid}_${academicYear}`,
    schoolId,
    userType: "teacher",
    refId: uid,
    academicYear,
  };
};

type Status = "checking" | "needed" | "granted";

// เรนเดอร์เนื้อหาเอกสารฉบับเต็มจริง (ชุดเดียวกับ PrivacyPolicyPage/TermsOfUsePage) ไว้ในกล่องเลื่อนอ่าน
// นี้ตรงๆ — ไม่ใช่สรุปย่อ ป้องกันความเสี่ยงที่สรุปกับฉบับจริงจะไม่ตรงกันในอนาคต
const FullDocument: React.FC<{ title: string; href: string; sections: LegalSection[] }> = ({ title, href, sections }) => (
  <div>
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-xs font-black text-gray-700 dark:text-gray-200">{title}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline dark:text-indigo-400"
      >
        เปิดเป็นหน้าเต็ม
        <FaExternalLinkAlt size={9} />
      </a>
    </div>
    <div className="space-y-4">
      {sections.map((section, index) => (
        <div key={section.id}>
          <p className="mb-1 font-bold text-gray-800 dark:text-gray-100">
            {index + 1}. {section.title}
          </p>
          <div className="space-y-2 [&_a]:font-bold [&_a]:text-indigo-600 [&_a]:underline [&_a]:dark:text-indigo-400 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4">
            {section.content}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ConsentGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const reduxSchoolId = useSelector((state: RootState) => state.auth.user?.schoolId || state.auth.user?.homeSchoolId || null);
  const [status, setStatus] = useState<Status>("checking");
  const [consentIdentity, setConsentIdentity] = useState<ConsentIdentity | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [hasReadToEnd, setHasReadToEnd] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const checkScrolledToEnd = (el: HTMLDivElement) => {
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setHasReadToEnd(true);
  };

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // ทางลัด: เคยยอมรับแล้ว (มีปีการศึกษาและ flag ในเครื่อง) → ปลดล็อกทันทีโดยไม่รอ Firestore
      const fastIdentity = await resolveConsentIdentity(reduxSchoolId, firebaseUser?.uid, true);
      if (fastIdentity && localStorage.getItem(`consent_accepted_${fastIdentity.consentKey}`) === "true") {
        if (isMounted) {
          setConsentIdentity(fastIdentity);
          setStatus("granted");
        }
        // ยืนยันปีการศึกษาล่าสุดเบื้องหลัง — ถ้าเปลี่ยนปีจนคีย์ต่างไป ค่อยเช็กสิทธิ์ใหม่ตามปกติ
        const freshIdentity = await resolveConsentIdentity(reduxSchoolId, firebaseUser?.uid);
        if (!freshIdentity || freshIdentity.consentKey === fastIdentity.consentKey) return;
        await evaluateConsent(freshIdentity, firebaseUser);
        return;
      }

      const identity = await resolveConsentIdentity(reduxSchoolId, firebaseUser?.uid);
      if (!identity) return;
      await evaluateConsent(identity, firebaseUser);
    });

    const evaluateConsent = async (identity: ConsentIdentity, firebaseUser: import("firebase/auth").User | null) => {
      if (!identity.consentKey) {
        if (isMounted) setStatus("granted");
        return;
      }

      if (isMounted) {
        setConsentIdentity(identity);
      }

      // 1. ตรวจสอบจาก Local Cache ก่อนเพื่อความรวดเร็ว
      const localAccepted = localStorage.getItem(`consent_accepted_${identity.consentKey}`);
      if (localAccepted === "true") {
        if (isMounted) setStatus("granted");
        return;
      }

      try {
        // 2. ตรวจสอบจาก Firestore consents/{consentKey}
        const snap = await getDoc(doc(db, "consents", identity.consentKey));
        let data = snap.exists() ? snap.data() : null;

        // Backward compatibility สำหรับครูที่เคยกดยอมรับใน consents/{firebaseUid}
        if (!data && firebaseUser?.uid && identity.userType === "teacher") {
          const legacySnap = await getDoc(doc(db, "consents", firebaseUser.uid));
          if (legacySnap.exists()) {
            const legacyData = legacySnap.data();
            if (
              legacyData?.privacyPolicyVersion === PRIVACY_POLICY_VERSION &&
              legacyData?.termsOfUseVersion === TERMS_OF_USE_VERSION &&
              (legacyData?.academicYear === identity.academicYear || !legacyData?.academicYear)
            ) {
              data = legacyData;
            }
          }
        }

        const hasCurrentConsent =
          data?.privacyPolicyVersion === PRIVACY_POLICY_VERSION &&
          data?.termsOfUseVersion === TERMS_OF_USE_VERSION;

        if (hasCurrentConsent) {
          localStorage.setItem(`consent_accepted_${identity.consentKey}`, "true");
          if (isMounted) setStatus("granted");
        } else {
          if (isMounted) setStatus("needed");
        }
      } catch (error) {
        console.error("Error checking consent status:", error);
        // fail-open: อย่าให้ปัญหาเครือข่ายชั่วคราวล็อกผู้ใช้ทั้งระบบออกจากระบบพร้อมกัน
        if (isMounted) setStatus("granted");
      }
    };

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [reduxSchoolId]);

  // เนื้อหาสั้นกว่ากล่อง (ไม่มีสกอร์ลให้เลื่อน เช่นจอสูง) ถือว่าเห็นครบตั้งแต่แรกแล้ว — เช็คใหม่ทุกครั้งที่
  // กล่องนี้ถูก mount (status เปลี่ยนเป็น "needed") เพราะ ref ยังไม่มีตัวจริงตอน status เป็น "checking"
  useEffect(() => {
    if (status !== "needed") return;
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) {
      setHasReadToEnd(true);
    }
  }, [status]);

  const handleAccept = async () => {
    if (!consentIdentity || !accepted || isSaving) return;
    setIsSaving(true);
    try {
      const { consentKey, schoolId, userType, refId, academicYear } = consentIdentity;
      await setDoc(
        doc(db, "consents", consentKey),
        {
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          termsOfUseVersion: TERMS_OF_USE_VERSION,
          academicYear,
          acceptedAt: serverTimestamp(),
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          schoolId,
          userType,
          refId,
          authUid: auth.currentUser?.uid || null,
        },
        { merge: true }
      );
      localStorage.setItem(`consent_accepted_${consentKey}`, "true");
      setStatus("granted");
    } catch (error) {
      console.error("Error saving consent:", error);
      window.alert("ไม่สามารถบันทึกการยอมรับได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem("currentUserType");
      localStorage.removeItem("studentSession");
      localStorage.removeItem("parentSession");
      await auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  };

  if (status === "checking") {
    return (
      <>
        {children}
        <LoadingScreen />
      </>
    );
  }

  if (status === "needed") {
    return (
      <>
        {/* เรนเดอร์หน้าจริง (เช่น HomePage) ไว้เป็นฉากหลังด้วย — ไม่งั้น overlay จะลอยอยู่บนพื้นเทาเปล่าๆ
            ไม่เห็นหน้าเว็บจริงด้านหลังเลย ผู้ใช้คลิกทะลุไปโดนของด้านหลังไม่ได้อยู่แล้วเพราะ div ล่างนี้
            fixed คลุมเต็มจอและอยู่บนสุด — ต้องสูงกว่า z-[9999] ของ Navbar.tsx (แถบเมนูบนสุดของแอป) ไม่งั้น
            navbar จะลอยทับกล่องนี้ตามที่เจอ (ค่าเดิม z-[100] แพ้ navbar) */}
        {children}
        {/* pt-20 กันไม่ให้กล่องไปชิด/แอบใต้ navbar สูง 60px ของแอป (Navbar.tsx) เผื่อระยะห่างไว้ด้วย —
            max-h-[75vh] (เดิม 90vh) ให้กล่องดูกะทัดรัดขึ้น ไม่สูงเต็มจอจนรู้สึกอึดอัด */}
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/70 px-4 pb-4 pt-20 backdrop-blur-sm">
          {/* max-h-[75vh] + flex-col คุมให้ทั้งกล่องไม่มีวันสูงเกินจอ — ส่วนที่เลื่อนได้จริงมีแค่เนื้อหา
              เอกสารตรงกลาง (flex-1 min-h-0) ส่วนหัว/checkbox/ปุ่มกดถูก pin ไว้บน-ล่างเสมอ ไม่ต้องเลื่อน
              ทั้งหน้าเพื่อหาปุ่มกด — แพทเทิร์นมาตรฐานของ dialog แบบ "ต้องอ่านก่อนกด" ทั่วไป */}
          <div className="flex max-h-[75vh] w-full max-w-lg flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#242529]">
          {/* Header — fixed */}
          <div className="shrink-0 p-5 pb-3 sm:p-6 sm:pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <FaShieldAlt size={18} />
              </span>
              <div>
                <h1 className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  ข้อกำหนดการใช้บริการและนโยบายความเป็นส่วนตัว
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">กรุณาอ่านเอกสารด้านล่างโดยละเอียด และยืนยันการยอมรับก่อนดำเนินการใช้งานระบบต่อไป</p>
              </div>
            </div>
          </div>

          {/* Document — the only scrollable region */}
          <div
            ref={scrollRef}
            onScroll={(e) => checkScrolledToEnd(e.currentTarget)}
            className="min-h-0 flex-1 space-y-6 overflow-y-auto border-y border-gray-100 px-5 py-4 text-[12.5px] leading-6 text-gray-600 dark:border-gray-800 dark:text-gray-300 sm:px-6"
          >
            <FullDocument title="นโยบายความเป็นส่วนตัว" href="/privacy-policy" sections={privacyPolicySections} />
            <hr className="border-gray-300 dark:border-gray-600" />
            <FullDocument title="ข้อกำหนดและเงื่อนไขการใช้บริการ" href="/terms-of-use" sections={termsOfUseSections} />
            <p className="pt-1 text-center text-[11px] font-bold text-gray-400 dark:text-gray-500">— สิ้นสุดเอกสารทั้งสองฉบับ —</p>
          </div>

          {/* Footer — fixed */}
          <div className="shrink-0 p-5 pt-3 sm:p-6 sm:pt-4">
            <label
              className={`flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3.5 dark:border-gray-700 dark:bg-[#1e1f21] ${
                hasReadToEnd ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              }`}
            >
              <input
                type="checkbox"
                checked={accepted}
                disabled={!hasReadToEnd}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                ข้าพเจ้าได้อ่านเอกสารข้างต้นแล้ว และยอมรับ{" "}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-600 underline dark:text-indigo-400">
                  นโยบายความเป็นส่วนตัว
                </a>{" "}
                และ{" "}
                <a href="/terms-of-use" target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-600 underline dark:text-indigo-400">
                  ข้อกำหนดและเงื่อนไขการใช้บริการ
                </a>
                {!hasReadToEnd && (
                  <span className="mt-0.5 block text-[11px] font-normal text-amber-600 dark:text-amber-400">
                    เลื่อนอ่านเอกสารด้านบนให้ถึงล่างสุดก่อน จึงจะติ๊กยอมรับได้
                  </span>
                )}
              </span>
            </label>

            <button
              type="button"
              onClick={handleAccept}
              disabled={!accepted || isSaving}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-black text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-white/10"
            >
              {isSaving ? "กำลังบันทึก..." : (
                <>
                  <FaCheck size={13} />
                  ยอมรับและเข้าใช้งานระบบ
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 text-xs font-bold text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-300"
            >
              <FaSignOutAlt size={11} />
              ไม่ยอมรับ / ออกจากระบบ
            </button>
          </div>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
};

export default ConsentGate;
