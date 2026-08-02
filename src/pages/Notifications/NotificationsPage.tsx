import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { formatNotificationTime } from "@/utils/dateUtils";
import Swal from "sweetalert2";
import { Bell, Check, ExternalLink, Inbox, X } from "lucide-react";

interface NotificationItem {
  id: string;
  path?: string;
  message: string;
  isRead: boolean;
  createdAt: Timestamp;
  link?: string;
  source?: "system" | "club-request";
  clubRequest?: {
    requestId: string;
    approvalSide: "exit" | "entry";
    approvalClubId: string;
  };
}

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = useEffectiveSchoolId();

  const [systemNotifications, setSystemNotifications] = useState<NotificationItem[]>([]);
  const [clubNotifications, setClubNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);


  useEffect(() => {
    if (!currentUser?.uid) {
      setIsLoading(false);
      return;
    }

    const q = query(
      collectionGroup(firestore, "notifications"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setSystemNotifications(snapshot.docs.map((notificationDoc) => ({
        id: notificationDoc.id,
        path: notificationDoc.ref.path,
        ...(notificationDoc.data() as Omit<NotificationItem, "id" | "path">),
        source: "system",
      })));
      setIsLoading(false);
    }, (error) => {
      console.error("Error listening notifications:", error);
      setIsLoading(false);
    });

    return () => unsub();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid || !schoolId) {
      setClubNotifications([]);
      return;
    }

    let unsubClubs: (() => void) | undefined;
    let unsubRequests: (() => void) | undefined;
    let cancelled = false;

    const subscribe = async () => {
      const teacherSnap = await getDocs(query(
        collection(firestore, "school-settings", schoolId, "teachers"),
        where("uid", "==", currentUser.uid),
        limit(1)
      ));
      const currentTeacherId = teacherSnap.docs[0]?.id || null;
      if (!currentTeacherId) {
        setClubNotifications([]);
        return;
      }

      if (cancelled) return;

      const clubsQuery = query(
        collection(firestore, "school-settings", schoolId, "clubs"),
        where("responsibleTeacherIds", "array-contains", currentTeacherId)
      );

      unsubClubs = onSnapshot(clubsQuery, (clubSnap) => {
        const clubMap = new Map<string, string>();
        clubSnap.docs.forEach((clubDoc) => {
          clubMap.set(clubDoc.id, String(clubDoc.data().name || "ไม่ระบุชื่อชุมนุม"));
        });

        if (unsubRequests) unsubRequests();

        if (clubMap.size === 0) {
          setClubNotifications([]);
          return;
        }

        const clubIdsList = [...clubMap.keys()].slice(0, 30);
        let entryItems: NotificationItem[] = [];
        let exitItems: NotificationItem[] = [];
        let entryUnsub: (() => void) | undefined;
        let exitUnsub: (() => void) | undefined;

        const mergeAndSet = () => {
          const seen = new Set<string>();
          const all: NotificationItem[] = [];
          [...entryItems, ...exitItems].forEach((item) => {
            if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
          });
          setClubNotifications(all);
        };

        const makeItem = (
          requestDoc: any, req: any,
          approvalSide: "exit" | "entry", approvalClubId: string, text: string
        ): NotificationItem => ({
          id: `club-request-${requestDoc.id}-${approvalSide}-${approvalClubId}`,
          message: `${req.studentName || "นักเรียน"} ${text}`,
          isRead: false,
          createdAt: req.createdAt instanceof Timestamp ? req.createdAt : Timestamp.now(),
          link: `/academic/club-members?clubId=${approvalClubId}&requestId=${requestDoc.id}`,
          source: "club-request",
          clubRequest: { requestId: requestDoc.id, approvalSide, approvalClubId },
        });

        // Entry approvals: สมัครใหม่ + ปลายทางของการย้าย
        entryUnsub = onSnapshot(
          query(
            collection(firestore, "school-settings", schoolId, "club_requests"),
            where("targetClubId", "in", clubIdsList),
            where("status", "==", "pending")
          ),
          (snap) => {
            entryItems = [];
            snap.docs.forEach((requestDoc) => {
              const req = requestDoc.data() as any;
              if (!clubMap.has(req.targetClubId) || req.entryStatus !== "pending") return;
              entryItems.push(makeItem(
                requestDoc, req, "entry", req.targetClubId,
                req.type === "transfer"
                  ? `ขอย้ายเข้า ${req.targetClubName || clubMap.get(req.targetClubId) || "ชุมนุมปลายทาง"}`
                  : `ขอสมัครเข้า ${req.targetClubName || clubMap.get(req.targetClubId) || "ชุมนุม"}`
              ));
            });
            mergeAndSet();
          }
        );

        // Exit approvals: ต้นทางของการย้าย
        exitUnsub = onSnapshot(
          query(
            collection(firestore, "school-settings", schoolId, "club_requests"),
            where("currentClubId", "in", clubIdsList),
            where("status", "==", "pending"),
            where("exitStatus", "==", "pending")
          ),
          (snap) => {
            exitItems = [];
            snap.docs.forEach((requestDoc) => {
              const req = requestDoc.data() as any;
              if (!clubMap.has(req.currentClubId)) return;
              exitItems.push(makeItem(
                requestDoc, req, "exit", req.currentClubId,
                `ขอย้ายออกจาก ${req.currentClubName || clubMap.get(req.currentClubId) || "ชุมนุมเดิม"}`
              ));
            });
            mergeAndSet();
          }
        );

        unsubRequests = () => {
          if (entryUnsub) entryUnsub();
          if (exitUnsub) exitUnsub();
        };
      });
    };

    subscribe();

    return () => {
      cancelled = true;
      if (unsubRequests) unsubRequests();
      if (unsubClubs) unsubClubs();
    };
  }, [currentUser?.uid, schoolId]);

  const notifications = useMemo(() => {
    return [...clubNotifications, ...systemNotifications].sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  }, [clubNotifications, systemNotifications]);

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const markAllRead = async () => {
    const batch = writeBatch(firestore);
    systemNotifications.forEach((item) => {
      if (!item.isRead && item.path) batch.update(doc(firestore, item.path), { isRead: true });
    });
    await batch.commit();
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.isRead && item.path) {
      await updateDoc(doc(firestore, item.path), { isRead: true });
    }
    if (item.link) navigate(item.link);
  };

  const processClubRequest = async (item: NotificationItem, action: "approve" | "reject") => {
    if (!schoolId || !item.clubRequest || processingId) return;

    const result = await Swal.fire({
      title: action === "approve" ? "ยืนยันอนุมัติคำขอ?" : "ยืนยันปฏิเสธคำขอ?",
      text: item.message,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: action === "approve" ? "อนุมัติ" : "ปฏิเสธ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: action === "approve" ? "#10b981" : "#ef4444",
    });
    if (!result.isConfirmed) return;

    setProcessingId(item.id);
    try {
      const requestRef = doc(firestore, "school-settings", schoolId, "club_requests", item.clubRequest.requestId);
      const requestSnap = await getDoc(requestRef);
      if (!requestSnap.exists()) {
        Swal.fire("ไม่พบคำขอ", "คำขอนี้อาจถูกดำเนินการไปแล้ว", "info");
        return;
      }

      const request = { id: requestSnap.id, ...requestSnap.data() } as any;
      if (action === "reject") {
        const batch = writeBatch(firestore);
        batch.delete(requestRef);
        await batch.commit();
        await Swal.fire({ icon: "success", title: "ปฏิเสธคำขอแล้ว", timer: 1400, showConfirmButton: false });
        return;
      }

      const newExitStatus = item.clubRequest.approvalSide === "exit" ? "approved" : request.exitStatus;
      const newEntryStatus = item.clubRequest.approvalSide === "entry" ? "approved" : request.entryStatus;

      if (newExitStatus === "approved" && newEntryStatus === "approved") {
        const batch = writeBatch(firestore);
        if (request.currentClubId) {
          batch.delete(doc(firestore, "school-settings", schoolId, "clubs", request.currentClubId, "members", request.studentId));
        }
        batch.set(doc(firestore, "school-settings", schoolId, "clubs", request.targetClubId, "members", request.studentId), {
          addedAt: new Date(),
          addedBy: currentUser?.uid || null,
          requestRef: request.id,
          status: "confirmed",
        });
        batch.delete(requestRef);
        await batch.commit();
      } else {
        await updateDoc(requestRef, {
          exitStatus: newExitStatus,
          entryStatus: newEntryStatus,
          updatedAt: new Date(),
        });
      }

      await Swal.fire({ icon: "success", title: "อนุมัติคำขอแล้ว", timer: 1400, showConfirmButton: false });
    } catch (error) {
      console.error("Error processing club request:", error);
      Swal.fire("ผิดพลาด", "ไม่สามารถดำเนินการคำขอได้", "error");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-[calc(100vh-60px)] bg-slate-50 p-4 text-slate-900 dark:bg-[#0f1117] dark:text-white sm:p-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161a27] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <BackButton to="/home" />
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500 text-white">
                <Bell size={22} />
              </div>
              <div>
                <h1 className="text-xl font-black">การแจ้งเตือนทั้งหมด</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">รายการใหม่ {unreadCount} รายการ</p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600 transition hover:bg-indigo-600 hover:text-white dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500 dark:hover:text-white">
                ทำเครื่องหมายว่าอ่านทั้งหมด
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#161a27]">
            {isLoading ? (
              <div className="space-y-3 p-4">
                <SkeletonLoader height="72px" borderRadius="12px" />
                <SkeletonLoader height="72px" borderRadius="12px" />
                <SkeletonLoader height="72px" borderRadius="12px" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center p-10 text-center text-slate-400">
                <Inbox size={58} strokeWidth={1.5} />
                <h2 className="mt-4 text-lg font-black text-slate-700 dark:text-slate-200">ไม่มีการแจ้งเตือน</h2>
                <p className="mt-1 text-sm">ทุกอย่างดูเรียบร้อยดี</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {notifications.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => openNotification(item)}
                    className={`flex flex-col gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-white/5 sm:flex-row sm:items-center ${item.link ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-indigo-500"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          {item.source === "club-request" && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">ชุมนุม</span>
                          )}
                          <p className={`min-w-0 flex-1 text-sm leading-6 sm:truncate ${item.isRead ? "text-slate-600 dark:text-slate-400" : "font-bold text-slate-900 dark:text-white"}`}>
                            {item.message}
                          </p>
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {formatNotificationTime(item.createdAt.toDate())}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                      {item.source === "club-request" && item.clubRequest ? (
                        <>
                          <button 
                            disabled={processingId === item.id} 
                            onClick={(e) => {
                              e.stopPropagation();
                              processClubRequest(item, "approve");
                            }} 
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Check size={14} /> อนุมัติ
                          </button>
                          <button 
                            disabled={processingId === item.id} 
                            onClick={(e) => {
                              e.stopPropagation();
                              processClubRequest(item, "reject");
                            }} 
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-500 hover:text-white disabled:cursor-wait disabled:opacity-60 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500 dark:hover:text-white"
                          >
                            <X size={14} /> ปฏิเสธ
                          </button>
                        </>
                      ) : item.link ? (
                        <button onClick={() => openNotification(item)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-indigo-600 hover:text-white dark:bg-white/10 dark:text-slate-300">
                          <ExternalLink size={14} /> เปิดดู
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default NotificationsPage;
