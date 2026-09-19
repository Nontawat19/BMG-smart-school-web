import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import SkeletonLoader from "@/components/SkeletonLoader";
import { firestore } from "@/firebase";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { formatNotificationTime } from "@/utils/dateUtils";
import { MessagesSquare, Inbox } from "lucide-react";
import AttendanceNotificationCard, { AttendanceNotificationPayload } from "./AttendanceNotificationCard";
import { purgeExpiredAttendanceNotifications } from "./purgeExpiredAttendanceNotifications";
import { getChatSchoolId } from "@/pages/Chat/chatConstants";

interface AttendanceNotificationItem {
  id: string;
  path: string;
  createdAt: Timestamp;
  attendance: AttendanceNotificationPayload;
}

const getBangkokDateString = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const getParentSession = (): { children: { studentDocId: string }[] } | null => {
  try {
    const raw = localStorage.getItem("parentSession");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const ClassroomChatPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const userType = localStorage.getItem("currentUserType");
  const isParentSession = userType === "parent";
  const schoolId = getChatSchoolId(useEffectiveSchoolId());
  const bottomRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<AttendanceNotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [homeroomLabel, setHomeroomLabel] = useState<string>("");

  // ดึงชื่อห้อง (grade/room) ของครูคนนี้มาโชว์เป็นหัวข้อ ถ้าตั้งค่าเป็นครูประจำชั้นไว้ (ไม่เกี่ยวกับผู้ปกครอง)
  useEffect(() => {
    if (isParentSession || !schoolId || !currentUser?.uid) return;
    const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", currentUser.uid);
    getDoc(teacherRef).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.isHomeroomTeacher && data.homeroomGrade) {
        setHomeroomLabel(`${data.homeroomGrade}${data.homeroomRoom ? `/${data.homeroomRoom}` : ""}`);
      }
    }).catch((error) => console.error("Error loading teacher homeroom info:", error));
  }, [isParentSession, schoolId, currentUser?.uid]);

  // ครู/เจ้าหน้าที่: ฟังจาก collectionGroup "notifications" (userId == uid จริงจาก Firebase Auth)
  useEffect(() => {
    if (isParentSession || !currentUser?.uid) {
      if (!isParentSession) setIsLoading(false);
      return;
    }

    // เรียงเก่า → ใหม่ (ascending) ให้เอาไปเรนเดอร์จากบนลงล่างแล้วรายการใหม่สุดจะอยู่ล่างสุด
    // เหมือนห้องแชทจริง (LINE/แชททั่วไป) แทนที่จะเป็นแบบ inbox ที่ใหม่สุดอยู่บนสุด
    const q = query(
      collectionGroup(firestore, "notifications"),
      where("userId", "==", currentUser.uid),
      where("type", "==", "attendance"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const todayStr = getBangkokDateString(new Date());
      const allDocs = snapshot.docs.map((notificationDoc) => ({
        path: notificationDoc.ref.path,
        type: notificationDoc.data().type as string | undefined,
        createdAt: notificationDoc.data().createdAt as Timestamp | undefined,
        attendance: notificationDoc.data().attendance as AttendanceNotificationPayload | undefined,
      }));

      // แสดงเฉพาะของ "วันนี้" (ตามเขตเวลาไทย) — ข้ามวันแล้วให้เก็บกวาดทิ้ง ไม่โชว์ค้างอยู่
      const todayItems = allDocs
        .filter((d) => d.attendance && d.createdAt && getBangkokDateString(d.createdAt.toDate()) === todayStr)
        .map((d) => ({ id: d.path, path: d.path, createdAt: d.createdAt as Timestamp, attendance: d.attendance as AttendanceNotificationPayload }));

      setItems(todayItems);
      setIsLoading(false);

      // ลบของที่ข้ามวันไปแล้วทิ้งจาก Firestore เป็น side effect เบื้องหลัง กันฐานข้อมูลบวม
      purgeExpiredAttendanceNotifications(allDocs);
    }, (error) => {
      console.error("Error listening to classroom chat notifications:", error);
      setIsLoading(false);
    });

    return () => unsub();
  }, [isParentSession, currentUser?.uid]);

  // ผู้ปกครอง: เก็บไว้คนละที่จากครู (school-settings/{schoolId}/students/{studentId}/parentNotifications
  // — ดู comment ที่ notifyParentInApp ใน AttendanceInAppNotify.ts ว่าทำไมแยกจากของครู) ฟังทีละคนต่อบุตร
  // 1 คน (ไม่ใช้ collectionGroup ข้ามนักเรียนทุกคนในโรงเรียน กันเปิดช่องให้เดา query ข้ามสิทธิ์เข้าถึง)
  // และไม่เรียก purgeExpiredAttendanceNotifications เพราะผู้ปกครอง (anonymous) ไม่มีสิทธิ์ลบเอกสาร
  useEffect(() => {
    if (!isParentSession || !schoolId) return;
    const session = getParentSession();
    const children = session?.children || [];
    if (children.length === 0) {
      setIsLoading(false);
      return;
    }

    const perChildItems = new Map<string, AttendanceNotificationItem[]>();
    const unsubs = children.map((child) => {
      const q = query(
        collection(firestore, "school-settings", schoolId, "students", child.studentDocId, "parentNotifications"),
        orderBy("createdAt", "asc")
      );
      return onSnapshot(q, (snapshot) => {
        const todayStr = getBangkokDateString(new Date());
        const todayItems = snapshot.docs
          .map((d) => ({
            id: d.ref.path,
            path: d.ref.path,
            createdAt: d.data().createdAt as Timestamp,
            attendance: d.data().attendance as AttendanceNotificationPayload,
          }))
          .filter((d) => d.attendance && d.createdAt && getBangkokDateString(d.createdAt.toDate()) === todayStr);

        perChildItems.set(child.studentDocId, todayItems);
        const merged = Array.from(perChildItems.values())
          .flat()
          .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
        setItems(merged);
        setIsLoading(false);
      }, (error) => {
        console.error("Error listening to parent attendance notifications:", error);
        setIsLoading(false);
      });
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [isParentSession, schoolId]);

  const isInitialLoadRef = useRef(true);
  const prevCountRef = useRef(0);

  // เลื่อนไปข้อความล่าสุด (ล่างสุด) อัตโนมัติ: โหลดครั้งแรกให้ไปล่างสุดทันทีโดยไม่เลื่อนผ่านตา (instant) เมื่อมีข้อความใหม่ค่อยเลื่อนนุ่มนวล
  useEffect(() => {
    if (isLoading || items.length === 0) return;
    if (isInitialLoadRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      isInitialLoadRef.current = false;
      prevCountRef.current = items.length;
      return;
    }
    if (items.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      prevCountRef.current = items.length;
    }
  }, [items, isLoading]);

  return (
    <MainLayout>
      <div className="min-h-[calc(100vh-60px)] bg-gray-50 p-4 text-gray-900 dark:bg-[#1e1f21] dark:text-white sm:p-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <header>
            <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f]">
              <BackButton to={isParentSession ? "/profile" : "/notifications"} />
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white">
                <MessagesSquare size={22} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight">ห้องแชทรายชั้น</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isParentSession
                    ? "เหตุการณ์ลงเวลาวันนี้ของบุตรหลาน"
                    : (homeroomLabel ? `ครูประจำชั้น ${homeroomLabel} — เหตุการณ์ลงเวลาวันนี้ของนักเรียนทั้งห้อง` : "เหตุการณ์ลงเวลาวันนี้ของนักเรียนที่คุณดูแล")}
                </p>
              </div>
            </div>
          </header>

          <div className="space-y-4">
            {isLoading ? (
              <>
                <SkeletonLoader height="220px" borderRadius="16px" />
                <SkeletonLoader height="220px" borderRadius="16px" />
              </>
            ) : items.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-400 shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f]">
                <Inbox size={54} strokeWidth={1.5} />
                <h2 className="mt-4 text-lg font-bold text-gray-700 dark:text-gray-200">ยังไม่มีเหตุการณ์ลงเวลาวันนี้</h2>
                <p className="mt-1 text-sm">พอมีนักเรียนในห้องลงเวลา จะขึ้นแสดงที่นี่แบบเรียลไทม์ (เก็บไว้แค่ 1 วัน)</p>
              </div>
            ) : (
              <>
                {items.map((item) => (
                  <div key={item.id}>
                    <AttendanceNotificationCard attendance={item.attendance} />
                    <p className="mt-1.5 px-1 text-xs font-medium text-gray-400">
                      {formatNotificationTime(item.createdAt.toDate())}
                    </p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ClassroomChatPage;
