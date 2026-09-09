const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

// เวลาปัจจุบันจากนาฬิกาเซิร์ฟเวอร์ Google (NTP-synced) — ใช้เป็นแหล่งเวลาแท้จริงสำหรับระบบลงเวลา
// แทนการอ้างอิงนาฬิกาเครื่อง kiosk หรือ third-party API ภายนอกที่ถูกบล็อก/cache ได้ง่าย
exports.getServerTime = functions.region("us-central1").https.onCall(async () => {
    return { now: Date.now() };
});

exports.deleteUser = functions.region("us-central1").https.onCall(async (data, context) => {
    const userId = data.userId;
    if (!userId) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "กรุณาระบุ userId ที่ต้องการลบ"
        );
    }

    await assertUserManagementAccess(context, userId);

    try {
        console.log(`กำลังลบผู้ใช้: ${userId}`);

        // ลบผู้ใช้จาก Firebase Auth
        await admin.auth().deleteUser(userId);

        // ลบข้อมูลผู้ใช้จาก Firestore collection "users"
        await admin.firestore().collection("users").doc(userId).delete();

        console.log(`ลบผู้ใช้สำเร็จ: ${userId}`);
        return { success: true, message: `ลบผู้ใช้ ${userId} สำเร็จ` };

    } catch (error) {
        console.error(`เกิดข้อผิดพลาดในการลบผู้ใช้ ${userId}:`, error);

        // โยน Error ไปให้ Client รับได้พบบั๊กที่แท้จริง
        throw new functions.https.HttpsError(
            "internal",
            `ไม่สามารถลบผู้ใช้ได้: ${error.message}`
        );
    }
});

exports.updateUserEmail = functions.region("us-central1").https.onCall(async (data, context) => {
    const userId = data.userId;
    const newEmail = data.email;

    if (!userId || !newEmail) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "กรุณาระบุ userId และ email"
        );
    }

    await assertUserManagementAccess(context, userId);

    try {
        console.log(`กำลังอัปเดตอีเมลของผู้ใช้ ${userId} เป็น ${newEmail}`);

        // อัปเดตอีเมลใน Firebase Auth
        await admin.auth().updateUser(userId, { email: newEmail });

        // อัปเดตอีเมลใน Firestore collection "users"
        await admin.firestore().collection("users").doc(userId).update({ email: newEmail });

        console.log(`อัปเดตอีเมลสำเร็จ: ${userId}`);
        return { success: true, message: `อัปเดตอีเมลของผู้ใช้ ${userId} สำเร็จ` };
    } catch (error) {
        console.error(`เกิดข้อผิดพลาดในการอัปเดตอีเมลผู้ใช้ ${userId}:`, error);
        throw new functions.https.HttpsError(
            "internal",
            `ไม่สามารถอัปเดตอีเมลได้: ${error.message}`
        );
    }
});

exports.updateUserPassword = functions.region("us-central1").https.onCall(async (data, context) => {
    const userId = data.userId;
    const newPassword = data.password;

    if (!userId || !newPassword) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "กรุณาระบุ userId และ password"
        );
    }

    await assertUserManagementAccess(context, userId);

    try {
        console.log(`กำลังอัปเดตรหัสผ่านของผู้ใช้ ${userId}`);

        // อัปเดตรหัสผ่านใน Firebase Auth
        await admin.auth().updateUser(userId, { password: newPassword });

        console.log(`อัปเดตรหัสผ่านสำเร็จ: ${userId}`);
        return { success: true, message: `อัปเดตรหัสผ่านของผู้ใช้ ${userId} สำเร็จ` };
    } catch (error) {
        console.error(`เกิดข้อผิดพลาดในการอัปเดตรหัสผ่านผู้ใช้ ${userId}:`, error);
        throw new functions.https.HttpsError(
            "internal",
            `ไม่สามารถอัปเดตรหัสผ่านได้: ${error.message}`
        );
    }
});

exports.sendLineMulticast = functions.region("us-central1").https.onCall(async (data, context) => {
    const token = data?.lineChannelAccessToken;
    const recipients = Array.isArray(data?.recipientUserIds) ? data.recipientUserIds : [];
    const messages = Array.isArray(data?.messages) ? data.messages : [];

    const uniqueRecipients = Array.from(new Set(
        recipients
            .map((item) => String(item || "").trim())
            .filter(Boolean)
    ));

    if (!token) {
        throw new functions.https.HttpsError("invalid-argument", "Missing LINE channel access token");
    }
    if (uniqueRecipients.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Missing LINE recipients");
    }
    if (messages.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Missing LINE messages");
    }

    const response = await fetch("https://api.line.me/v2/bot/message/multicast", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
            to: uniqueRecipients,
            messages,
        }),
    });

    const responseText = await response.text();
    if (!response.ok) {
        console.error("LINE multicast failed:", response.status, responseText);
        throw new functions.https.HttpsError(
            "internal",
            `LINE multicast failed: ${response.status} ${responseText}`
        );
    }

    console.log(`LINE multicast sent successfully to ${uniqueRecipients.length} recipients.`);
    return {
        success: true,
        recipientCount: uniqueRecipients.length,
        lineResponse: responseText || null,
    };
});

// ─── Web Push Notification ───────────────────────────────────────────────────
// ถูกเรียกจากฝั่ง Client ผ่าน httpsCallable ทันทีที่มีการบันทึก notification ลง Firestore
exports.processPushNotification = functions.region("us-central1").https.onCall(async (data, context) => {
    // data = { userId, message, link, source, schoolId, notificationId }
    const { userId, message, link, source, schoolId, notificationId } = data;
    if (!userId || !message) return { success: false, error: "Missing parameters" };

    // 1. ดึง FCM token ทุกเครื่องของผู้รับ
    const tokensSnap = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .collection("fcm_tokens")
      .get();

    const tokens = tokensSnap.docs
      .map((d) => d.data().token)
      .filter(Boolean);

    if (tokens.length === 0) {
      console.log(`[Push] ไม่พบ FCM token สำหรับ userId=${userId}`);
      return { success: false, error: "No tokens found" };
    }

    // 2. ดึงข้อมูลโรงเรียน (ชื่อ + โลโก้)
    let schoolName = "BMG Smart School";
    let logoUrl = null;
    if (schoolId) {
        const schoolSnap = await admin
        .firestore()
        .doc(`school-settings/${schoolId}`)
        .get();
        const school = schoolSnap.data() || {};
        schoolName = school.schoolName || schoolName;
        logoUrl = school.logoUrl || null;
    }

    // 3. กำหนด title ตาม source
    const sourceTitle = {
      "substitute": "การสอนแทน",
      "leave": "การลา",
      "club-request": "คำขอชุมนุม",
      "general_affairs": "งานธุรการ",
      "remediation": "สอบแก้ตัว",
    };
    const notificationTitle = sourceTitle[source] || schoolName;

    // 4. ส่ง FCM พร้อม rich notification payload
    const appOrigin = "https://bmg-smartschool.web.app";
    const absoluteLink = link
      ? (link.startsWith("http") ? link : `${appOrigin}${link}`)
      : `${appOrigin}/notifications`;

    const fcmPayload = {
      tokens,
      webpush: {
        notification: {
          title: notificationTitle,
          body: message,
          icon: logoUrl || `${appOrigin}/pwa-192x192.png`,
          ...(logoUrl ? { image: logoUrl } : {}),
          requireInteraction: true,
          tag: `bmg-${notificationId || 'push'}`,
          renotify: true,
          actions: [
            { action: "view", title: "ดูรายละเอียด" },
            { action: "dismiss", title: "ปิด" },
          ],
        },
        data: {
          link: absoluteLink,
          notificationId: String(notificationId || ''),
          schoolId: String(schoolId || ''),
          title: notificationTitle,
          body: message,
        }
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(fcmPayload);
      console.log(
        `[Push] ส่งสำเร็จ ${response.successCount}/${tokens.length} เครื่อง`
      );

      // 5. ลบ token ที่ไม่ valid ออกจาก Firestore
      const invalidTokenDocs = [];
      response.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error?.code;
          if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
          ) {
            invalidTokenDocs.push(tokensSnap.docs[i]);
          }
        }
      });

      if (invalidTokenDocs.length > 0) {
        const batch = admin.firestore().batch();
        invalidTokenDocs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        console.log(`[Push] ลบ token หมดอายุ ${invalidTokenDocs.length} รายการ`);
      }

      return { success: true, sent: response.successCount };
    } catch (err) {
      console.error("[Push] ส่ง FCM ล้มเหลว:", err);
      return { success: false, error: err.message };
    }
});
// ─────────────────────────────────────────────────────────────────────────────

exports.cleanupFaceScanSnapshots = functions
    .region("us-central1")
    .pubsub.schedule("every 24 hours")
    .timeZone("Asia/Bangkok")
    .onRun(async () => {
        const bucket = admin.storage().bucket();
        const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
        let checkedCount = 0;
        let deletedCount = 0;

        const [files] = await bucket.getFiles({ prefix: "school-settings/" });
        const snapshotFiles = files.filter((file) =>
            file.name.includes("/face-scan-snapshots/")
        );

        await Promise.all(snapshotFiles.map(async (file) => {
            checkedCount += 1;
            const [metadata] = await file.getMetadata();
            const createdAt = metadata.timeCreated
                ? new Date(metadata.timeCreated).getTime()
                : 0;

            if (!createdAt || createdAt > cutoffMs) return;

            try {
                await file.delete();
                deletedCount += 1;
            } catch (error) {
                if (error?.code !== 404) {
                    console.error("Failed to delete old face scan snapshot:", file.name, error);
                }
            }
        }));

        console.log(`Face scan snapshot cleanup checked ${checkedCount} files, deleted ${deletedCount} files.`);
        return { checkedCount, deletedCount };
    });

// ─── MA Expiry Notification ──────────────────────────────────────────────────
// แจ้งเตือนผู้ดูแลระบบสูงสุด (super_admin) เมื่อเหลือ <= 30 วันก่อนหมด MA ของแต่ละโรงเรียน
// ข้อมูล MA เก็บแยกที่ school-settings/{schoolId}/summaries/license (อ่านได้เฉพาะ SUPER_ADMIN)
exports.notifyMaExpiringSoon = functions
    .region("us-central1")
    .pubsub.schedule("every 24 hours")
    .timeZone("Asia/Bangkok")
    .onRun(async () => {
        const MA_WARNING_DAYS = 30;
        const db = admin.firestore();

        const schoolsSnap = await db.collection("school-settings").get();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const expiringSchools = [];
        for (const schoolDoc of schoolsSnap.docs) {
            const licenseSnap = await db
                .doc(`school-settings/${schoolDoc.id}/summaries/license`)
                .get();
            if (!licenseSnap.exists) continue;

            const license = licenseSnap.data();
            if (!license.maExpiryDate) continue;

            const expiry = new Date(license.maExpiryDate);
            if (Number.isNaN(expiry.getTime())) continue;
            expiry.setHours(0, 0, 0, 0);
            const daysLeft = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            const alreadyNotified = license.maNotifiedForDate === license.maExpiryDate;
            if (daysLeft >= 0 && daysLeft <= MA_WARNING_DAYS && !alreadyNotified) {
                expiringSchools.push({
                    schoolId: schoolDoc.id,
                    schoolName: schoolDoc.data().schoolName || schoolDoc.id,
                    maExpiryDate: license.maExpiryDate,
                    daysLeft,
                    licenseRef: licenseSnap.ref,
                });
            }
        }

        if (expiringSchools.length === 0) {
            console.log("[MA Notify] ไม่มีโรงเรียนที่ MA ใกล้หมดอายุวันนี้");
            return { notifiedSchools: 0 };
        }

        // หา user ที่เป็น super_admin ทั้งแบบ role เป็น string และ array
        const [stringRoleSnap, arrayRoleSnap] = await Promise.all([
            db.collection("users").where("role", "==", "super_admin").get(),
            db.collection("users").where("role", "array-contains", "super_admin").get(),
        ]);
        const superAdminIds = new Set([
            ...stringRoleSnap.docs.map((d) => d.id),
            ...arrayRoleSnap.docs.map((d) => d.id),
        ]);

        if (superAdminIds.size === 0) {
            console.warn("[MA Notify] ไม่พบผู้ใช้ role super_admin ที่จะแจ้งเตือน");
            return { notifiedSchools: 0, notifiedUsers: 0 };
        }

        const message = `🔔 แจ้งเตือน MA ใกล้หมดอายุ:\n${expiringSchools
            .map((s) => `- ${s.schoolName}: เหลือ ${s.daysLeft} วัน (ถึง ${s.maExpiryDate})`)
            .join("\n")}`;

        let sentCount = 0;
        for (const userId of superAdminIds) {
            const tokensSnap = await db
                .collection("users")
                .doc(userId)
                .collection("fcm_tokens")
                .get();
            const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
            if (tokens.length === 0) continue;

            try {
                const response = await admin.messaging().sendEachForMulticast({
                    tokens,
                    webpush: {
                        notification: {
                            title: "MA ใกล้หมดอายุ",
                            body: message,
                            requireInteraction: true,
                        },
                        data: { link: "/owner/schools" },
                    },
                });
                sentCount += response.successCount;
            } catch (error) {
                console.error(`[MA Notify] ส่งแจ้งเตือนไปยัง ${userId} ล้มเหลว:`, error);
            }
        }

        // มาร์คว่าแจ้งเตือนแล้วสำหรับวันหมดอายุนี้ ป้องกันแจ้งซ้ำทุกวันจนกว่า MA จะถูกต่ออายุ (maExpiryDate เปลี่ยน)
        await Promise.all(
            expiringSchools.map((s) =>
                s.licenseRef.set({ maNotifiedForDate: s.maExpiryDate }, { merge: true })
            )
        );

        console.log(`[MA Notify] แจ้งเตือน ${expiringSchools.length} โรงเรียน ส่งถึง ${sentCount} อุปกรณ์`);
        return { notifiedSchools: expiringSchools.length, notifiedDevices: sentCount };
    });

// ════════════════════════════════════════════════════════════════════════
// AI Assistant — ตอบคำถามจากข้อมูลในระบบเท่านั้น ผ่าน tool-calling ที่จำกัดสิทธิ์
// ตามสิทธิ์ (role) ของผู้ใช้ที่ล็อกอินอยู่ เหมือนหน้าเว็บหน้าอื่นๆ ในระบบ (ดู
// src/constants/permissions.ts) — AI ไม่มีสิทธิ์อ่าน Firestore เองนอกเหนือจาก
// tools ที่กำหนดไว้ด้านล่าง และทุก tool ถูกจำกัดเฉพาะโรงเรียนของผู้เรียกเท่านั้น
// ════════════════════════════════════════════════════════════════════════

const AI_ROLES = {
    SUPER_ADMIN: "super_admin",
    SCHOOL_ADMIN: "school_admin",
    DIRECTOR: "director",
    DEPT_HEAD: "dept_head",
    ACADEMIC_ADMIN: "academic_admin",
    STUDENT_AFFAIRS: "student_affairs",
    TEACHER: "teacher",
    STUDENT_ATTENDANCE: "student_attendance",
    TEACHER_ATTENDANCE: "teacher_attendance",
    SCHOOL_ATTENDANCE: "school_attendance",
};

// เทียบเท่า STUDENT_ATTENDANCE_REPORT_ACCESS ใน src/constants/permissions.ts
const AI_ATTENDANCE_REPORT_ROLES = [
    AI_ROLES.SCHOOL_ADMIN, AI_ROLES.DIRECTOR, AI_ROLES.ACADEMIC_ADMIN, AI_ROLES.DEPT_HEAD,
    AI_ROLES.STUDENT_AFFAIRS, AI_ROLES.STUDENT_ATTENDANCE, AI_ROLES.TEACHER_ATTENDANCE, AI_ROLES.SCHOOL_ATTENDANCE,
];
// เทียบเท่าสิทธิ์เข้าหน้า "คะแนนพฤติกรรมนักเรียน" (STUDENT_AFFAIRS_ACCESS + TEACHER)
const AI_BEHAVIOR_ROLES = [...AI_ATTENDANCE_REPORT_ROLES, AI_ROLES.TEACHER];
// เทียบเท่า TEACHER_OPERATIONAL ใน src/constants/permissions.ts — ใช้กับหน้าทะเบียนวัดผล/บันทึกคะแนน
const AI_TEACHER_OPERATIONAL_ROLES = [
    AI_ROLES.TEACHER, AI_ROLES.STUDENT_AFFAIRS, AI_ROLES.SCHOOL_ADMIN, AI_ROLES.DIRECTOR,
    AI_ROLES.DEPT_HEAD, AI_ROLES.ACADEMIC_ADMIN,
];
// บุคลากรทั่วไป (นักเรียน/ผู้ปกครองใช้ session แบบ local ไม่ได้ล็อกอินผ่าน Firebase Auth
// จึงไม่มี context.auth และเรียกฟังก์ชันนี้ไม่ได้อยู่แล้วตั้งแต่ระดับ callable)
const AI_STAFF_ROLES = [
    AI_ROLES.SCHOOL_ADMIN, AI_ROLES.DIRECTOR, AI_ROLES.DEPT_HEAD, AI_ROLES.ACADEMIC_ADMIN, AI_ROLES.STUDENT_AFFAIRS,
    AI_ROLES.TEACHER, AI_ROLES.STUDENT_ATTENDANCE, AI_ROLES.TEACHER_ATTENDANCE, AI_ROLES.SCHOOL_ATTENDANCE,
];

// เทียบเท่า ARCHIVED_STUDENT_STATUSES ใน src/utils/studentStatusUtils.ts
const AI_ARCHIVED_STUDENT_STATUSES = [
    "ย้าย", "ลาออก", "จำหน่าย", "จำหน่ายชื่อออก", "สำเร็จการศึกษา", "รออนุมัติจบ", "ซ้ำชั้น",
    "graduated", "exited", "pending_grad", "repeat",
];
function aiIsActiveStudent(student) {
    const raw = String(student.status || student.studentStatus || "").trim().toLowerCase();
    if (!raw) return true;
    return !AI_ARCHIVED_STUDENT_STATUSES.some((s) => s.toLowerCase() === raw);
}

async function aiGetCallerContext(uid) {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const rawRoles = Array.isArray(data.role) ? data.role : data.role ? [data.role] : [];
    return {
        uid,
        roles: rawRoles.map((r) => String(r).toLowerCase()),
        schoolId: data.homeSchoolId || data.schoolId || null,
        displayName: data.displayName || data.name || data.email || "ผู้ใช้งาน",
    };
}

function aiHasAccess(caller, allowedRoles) {
    return caller.roles.includes(AI_ROLES.SUPER_ADMIN) || caller.roles.some((r) => allowedRoles.includes(r));
}

// สิทธิ์จัดการผู้ใช้ (ลบ/แก้อีเมล/แก้รหัสผ่าน) — ต้องตรงกับ allowedRoles ของหน้า
// /owner/users และ /school/:schoolId/teachers ใน src/App.tsx (SUPER_ADMIN + ADMIN_ACCESS + ACADEMIC_ACCESS)
const USER_MANAGEMENT_ROLES = [
    AI_ROLES.SUPER_ADMIN, AI_ROLES.SCHOOL_ADMIN, AI_ROLES.DIRECTOR, AI_ROLES.DEPT_HEAD, AI_ROLES.ACADEMIC_ADMIN,
];

// ตรวจสิทธิ์ผู้เรียกก่อนอนุญาตให้ลบ/แก้ไขบัญชีผู้ใช้อื่น — SUPER_ADMIN จัดการได้ทุกโรงเรียน
// ส่วน role อื่นจัดการได้เฉพาะผู้ใช้ในโรงเรียนเดียวกับตนเอง (กันไม่ให้ admin โรงเรียนหนึ่งลบ/แก้ผู้ใช้โรงเรียนอื่น)
async function assertUserManagementAccess(context, targetUserId) {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "ต้องเข้าสู่ระบบเพื่อใช้งานฟังก์ชันนี้");
    }
    const caller = await aiGetCallerContext(context.auth.uid);
    if (!caller || !caller.roles.some((r) => USER_MANAGEMENT_ROLES.includes(r))) {
        throw new functions.https.HttpsError("permission-denied", "คุณไม่มีสิทธิ์จัดการผู้ใช้งานนี้");
    }
    if (!caller.roles.includes(AI_ROLES.SUPER_ADMIN) && targetUserId) {
        const targetSnap = await admin.firestore().collection("users").doc(targetUserId).get();
        const targetData = targetSnap.exists ? targetSnap.data() : {};
        const targetSchoolId = targetData.homeSchoolId || targetData.schoolId || null;
        if (!targetSchoolId || targetSchoolId !== caller.schoolId) {
            throw new functions.https.HttpsError("permission-denied", "คุณไม่มีสิทธิ์จัดการผู้ใช้งานนอกโรงเรียนของคุณ");
        }
    }
    return caller;
}

// ค้นหานักเรียนตาม studentCode (ตรงตัว) หรือ studentName (ค้นแบบใกล้เคียงในชื่อ-นามสกุล) ใช้ร่วมกัน
// ทุก tool ที่ต้องระบุตัวนักเรียน — คืนรายการ QueryDocumentSnapshot (อาจมีมากกว่า 1 ถ้าชื่อไม่ชัดเจนพอ)
async function aiFindStudentCandidates(db, schoolId, { studentCode, studentName }) {
    const studentsRef = db.collection("school-settings").doc(schoolId).collection("students");
    if (studentCode) {
        const snap = await studentsRef.where("studentId", "==", String(studentCode)).limit(5).get();
        if (snap.docs.length > 0) return snap.docs;
    }
    if (studentName) {
        const nameLower = String(studentName).trim().toLowerCase();
        const snap = await studentsRef.get();
        return snap.docs
            .filter((d) => {
                const s = d.data();
                const full = `${s.title || ""}${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
                return nameLower && full.includes(nameLower);
            })
            .slice(0, 6);
    }
    return [];
}

function aiStudentLabel(s) {
    return `${s.title || ""}${s.firstName || ""} ${s.lastName || ""}`;
}

function aiDisambiguationResult(candidates) {
    return {
        needsDisambiguation: true,
        candidates: candidates.map((d) => {
            const s = d.data();
            return { studentCode: s.studentId, name: aiStudentLabel(s), classLevel: s.classLevel, room: s.room };
        }),
    };
}

async function aiRunTool(name, args, caller) {
    const db = admin.firestore();
    if (!caller.schoolId) {
        return { error: "ไม่พบโรงเรียนของผู้ใช้งานนี้ในระบบ จึงไม่สามารถดึงข้อมูลได้" };
    }
    const schoolId = caller.schoolId;
    const safeArgs = args || {};

    if (name === "get_school_student_count") {
        if (!aiHasAccess(caller, AI_STAFF_ROLES)) return { error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
        const snap = await db.collection("school-settings").doc(schoolId).collection("students").get();
        const byClassLevel = {};
        let total = 0;
        snap.forEach((d) => {
            const s = d.data();
            if (!aiIsActiveStudent(s)) return;
            if (safeArgs.classLevel && s.classLevel !== safeArgs.classLevel) return;
            total += 1;
            const key = s.classLevel || "ไม่ระบุชั้น";
            byClassLevel[key] = (byClassLevel[key] || 0) + 1;
        });
        return { totalActiveStudents: total, byClassLevel };
    }

    if (name === "get_today_attendance_summary") {
        if (!aiHasAccess(caller, AI_ATTENDANCE_REPORT_ROLES)) return { error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
        const groupSnap = await db.collectionGroup("flag_ceremony_summary").where("date", "==", todayStr).get();
        const schoolPrefix = `school-settings/${schoolId}/students/`;
        const byStatus = {};
        let total = 0;
        groupSnap.forEach((d) => {
            if (!d.ref.path.includes(schoolPrefix)) return;
            const status = String(d.data().status || "ไม่ระบุ");
            byStatus[status] = (byStatus[status] || 0) + 1;
            total += 1;
        });
        return {
            date: todayStr,
            totalRecorded: total,
            byStatus,
            note: "นับเฉพาะนักเรียนที่ครูบันทึกการเช็คชื่อเข้าแถวเคารพธงชาติแล้วในวันนี้ ยังไม่รวมนักเรียนที่ยังไม่ถูกบันทึก",
        };
    }

    if (name === "get_student_behavior_summary") {
        if (!aiHasAccess(caller, AI_BEHAVIOR_ROLES)) return { error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
        const candidates = await aiFindStudentCandidates(db, schoolId, safeArgs);
        if (candidates.length === 0) {
            return { error: "ไม่พบนักเรียนที่ตรงกับข้อมูลที่ระบุ กรุณาระบุชื่อหรือรหัสนักเรียนให้ชัดเจนขึ้น" };
        }
        if (candidates.length > 1) return aiDisambiguationResult(candidates);

        const studentDoc = candidates[0];
        const s = studentDoc.data();
        const logsSnap = await studentDoc.ref.collection("behavior_logs").orderBy("createdAt", "desc").limit(15).get();
        const recentBehaviorLogs = logsSnap.docs.map((d) => {
            const l = d.data();
            return {
                date: l.createdAt?.toDate ? l.createdAt.toDate().toISOString().slice(0, 10) : null,
                title: l.title || l.category || "-",
                points: typeof l.points === "number" ? l.points : null,
                notes: l.notes || null,
            };
        });
        return {
            studentCode: s.studentId,
            name: aiStudentLabel(s),
            classLevel: s.classLevel,
            room: s.room,
            currentBehaviorScore: s.behaviorScore ?? 100,
            recentBehaviorLogs,
        };
    }

    if (name === "get_student_grades") {
        if (!aiHasAccess(caller, AI_TEACHER_OPERATIONAL_ROLES)) return { error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
        const candidates = await aiFindStudentCandidates(db, schoolId, safeArgs);
        if (candidates.length === 0) {
            return { error: "ไม่พบนักเรียนที่ตรงกับข้อมูลที่ระบุ กรุณาระบุชื่อหรือรหัสนักเรียนให้ชัดเจนขึ้น" };
        }
        if (candidates.length > 1) return aiDisambiguationResult(candidates);

        const studentDoc = candidates[0];
        const s = studentDoc.data();

        const enrollSnap = await db
            .collection("school-settings").doc(schoolId).collection("enrollments")
            .where("studentId", "==", studentDoc.id)
            .limit(40) // กันโหลดเกินสำหรับนักเรียนที่มีประวัติลงทะเบียนสะสมมาก — 40 รายวิชาเพียงพอสำหรับใช้งานจริง
            .get();

        if (enrollSnap.empty) {
            return { studentCode: s.studentId, name: aiStudentLabel(s), classLevel: s.classLevel, room: s.room, subjects: [], note: "ไม่พบรายวิชาที่ลงทะเบียนไว้" };
        }

        const enrollments = enrollSnap.docs.map((d) => d.data());
        const subjects = await Promise.all(
            enrollments.map(async (en) => {
                if (!en.courseId) return null;
                const [courseSnap, gradeSnap] = await Promise.all([
                    db.collection("school-settings").doc(schoolId).collection("courses").doc(en.courseId).get(),
                    db.collection("school-settings").doc(schoolId).collection("courses").doc(en.courseId)
                        .collection("grades").doc(studentDoc.id).get(),
                ]);
                const course = courseSnap.exists ? courseSnap.data() : {};
                if (safeArgs.subjectCode && course.code !== safeArgs.subjectCode) return null;
                const grade = gradeSnap.exists ? gradeSnap.data() : {};
                return {
                    subjectCode: course.code || null,
                    subjectTitle: course.title || null,
                    academicYear: en.academicYear || null,
                    semester: en.semester || null,
                    formativeScores: grade.formativeDetails || null,
                    midtermScore: grade.midterm ?? null,
                    finalScore: grade.final ?? null,
                    grade: grade.grade ?? null,
                    status: grade.status || null,
                    remark: grade.remark || null,
                };
            })
        );

        return {
            studentCode: s.studentId,
            name: aiStudentLabel(s),
            classLevel: s.classLevel,
            room: s.room,
            subjects: subjects.filter(Boolean),
        };
    }

    if (name === "get_report_document_link") {
        if (!aiHasAccess(caller, AI_TEACHER_OPERATIONAL_ROLES)) return { error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
        const links = {
            porbor5: { label: "ทะเบียนวัดผล (ปพ.5)", path: "/academic/grade-book" },
            porbor7: { label: "ออกใบรับรอง (ปพ.7)", path: "/academic/porbor-7" },
            behavior_report: { label: "รายงานคะแนนความประพฤติ", path: "/academic/student-behavior-class-report" },
            attendance_report: { label: "รายงานการมาเรียน (นักเรียน)", path: "/academic/students-attendance-summary" },
        };
        const picked = links[safeArgs.documentType];
        if (!picked) {
            return { error: `ไม่รู้จักประเภทเอกสาร "${safeArgs.documentType}" ตัวเลือกที่มี: ${Object.keys(links).join(", ")}` };
        }
        // หน้าปลายทางยังไม่รองรับ query param สำหรับเลือกวิชา/ชั้น/ห้องล่วงหน้า (ตรวจสอบแล้ว) จึงบอก
        // ผู้ใช้ให้ไปเลือกเองในหน้านั้นแทนการอ้างว่าลิงก์นี้กรองให้อัตโนมัติ — เพื่อไม่ให้เข้าใจผิด
        const filterParts = [];
        if (safeArgs.subjectCode) filterParts.push(`วิชา ${safeArgs.subjectCode}`);
        if (safeArgs.classLevel) filterParts.push(`ชั้น ${safeArgs.classLevel}`);
        if (safeArgs.room) filterParts.push(`ห้อง ${safeArgs.room}`);
        const filterNote = filterParts.length
            ? ` พอเข้าหน้านี้แล้วเลือก ${filterParts.join(" ")} อีกทีนะครับ`
            : "";
        return {
            label: picked.label,
            path: picked.path,
            note: `กดลิงก์นี้เพื่อไปหน้าที่ใช้พิมพ์/ดาวน์โหลดเอกสารได้เลยครับ (ผมสร้างไฟล์ PDF ให้ในแชทตรงๆ ไม่ได้ครับ)${filterNote}`,
        };
    }

    if (name === "get_my_teaching_today") {
        if (!aiHasAccess(caller, AI_TEACHER_OPERATIONAL_ROLES)) return { error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
        if (!caller.uid) return { error: "ไม่พบข้อมูลผู้ใช้งาน" };

        const teacherSnap = await db.collection("school-settings").doc(schoolId).collection("teachers")
            .where("uid", "==", caller.uid).limit(1).get();
        if (teacherSnap.empty) {
            return { error: "ไม่พบข้อมูลครูของบัญชีนี้ในระบบ (ไม่มีเอกสารครูที่ผูกกับผู้ใช้นี้)" };
        }
        const teacherId = teacherSnap.docs[0].id;

        const nowBangkok = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        const dayAbbrev = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][nowBangkok.getDay()];
        const dayLabelMap = { mon: "จันทร์", tue: "อังคาร", wed: "พุธ", thu: "พฤหัสบดี", fri: "ศุกร์", sat: "เสาร์", sun: "อาทิตย์" };
        const dayLabel = dayLabelMap[dayAbbrev];

        if (dayAbbrev === "sat" || dayAbbrev === "sun") {
            return { dayLabel, periods: [], note: "วันนี้เป็นวันหยุดสุดสัปดาห์ ไม่มีคาบสอนตามตารางปกติ" };
        }

        const { academicYear, semester } = await aiGetCurrentAcademicYearAndSemester(db, schoolId);

        const settingsSnap = await db.collection("school-settings").doc(schoolId).collection("configs").doc("schedule_settings").get();
        const periods = (settingsSnap.exists ? settingsSnap.data().periods : []) || [];
        const teachingPeriods = periods.filter((p) => p.isTeachingPeriod === true);

        const scheduleDocId = `${teacherId}__${academicYear}__${semester}`;
        const scheduleSnap = await db.collection("school-settings").doc(schoolId).collection("schedules").doc(scheduleDocId).get();
        const scheduleMap = scheduleSnap.exists ? scheduleSnap.data().schedule || {} : {};

        const nowMinutes = nowBangkok.getHours() * 60 + nowBangkok.getMinutes();
        const toMinutes = (t) => {
            const [h, m] = String(t || "0:0").replace(".", ":").split(":").map((n) => parseInt(n, 10) || 0);
            return h * 60 + m;
        };

        const todaysPeriods = teachingPeriods
            .map((p) => {
                const courses = scheduleMap[`${dayAbbrev}-${p.index}`] || [];
                return {
                    label: p.label || `คาบ ${p.index}`,
                    startTime: p.startTime,
                    endTime: p.endTime,
                    isNow: nowMinutes >= toMinutes(p.startTime) && nowMinutes <= toMinutes(p.endTime),
                    courses: courses.map((c) => ({
                        title: c.title || c.subjectName || null,
                        code: c.code || c.subjectCode || null,
                        classId: Array.isArray(c.classId) ? c.classId.join(", ") : c.classId || null,
                        room: Array.isArray(c.room) ? c.room.join(", ") : c.room || null,
                    })),
                };
            })
            .filter((p) => p.courses.length > 0);

        if (todaysPeriods.length === 0) {
            // ช่วยวินิจฉัยสาเหตุที่แท้จริงตรงๆ แทนข้อความกลางๆ — จุดที่มักผิดคือรูปแบบคีย์
            // ตารางสอน (dayAbbrev-periodIndex) ไม่ตรงกับที่ระบบเขียนจริง หรือปี/เทอมไม่ตรง
            let reason;
            if (!settingsSnap.exists || teachingPeriods.length === 0) {
                reason = "ยังไม่ได้ตั้งค่าคาบเรียนของโรงเรียน (หน้า \"ตั้งค่าคาบเรียน\")";
            } else if (!scheduleSnap.exists) {
                reason = `ไม่พบตารางสอนของครูคนนี้สำหรับปีการศึกษา ${academicYear} ภาคเรียนที่ ${semester}`;
            } else if (Object.keys(scheduleMap).length === 0) {
                reason = "พบเอกสารตารางสอนแต่ยังไม่มีการจัดคาบเรียนเลย";
            } else {
                reason = `พบตารางสอนแล้วแต่ไม่มีคาบที่ตรงกับวัน${dayLabel} (คีย์ตัวอย่างในตาราง: ${Object.keys(scheduleMap).slice(0, 5).join(", ")})`;
            }
            return { dayLabel, academicYear, semester, periods: [], note: reason };
        }

        return {
            dayLabel,
            academicYear,
            semester,
            periods: todaysPeriods,
            attendancePagePath: "/academic/classroom-attendance",
            note: "ไปเลือกวิชาที่ต้องการเช็คชื่อในหน้านั้นได้เลยครับ",
        };
    }

    return { error: `ไม่รู้จักเครื่องมือ ${name}` };
}

// หาปีการศึกษา/ภาคเรียนปัจจุบันจากปฏิทินที่ตั้งไว้ที่หน้า "ปฏิทินการศึกษา" — ใช้หาตารางสอนวันนี้ให้ตรงภาคเรียน
async function aiGetCurrentAcademicYearAndSemester(db, schoolId) {
    const fallbackYear = String(new Date().getFullYear() + 543);
    const snap = await db.collection("school-settings").doc(schoolId).collection("main_calendar").doc("default").get();
    if (!snap.exists) return { academicYear: fallbackYear, semester: "1" };
    const data = snap.data() || {};
    const academicYear = data.academicYear || fallbackYear;
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
    const terms = data.terms || {};
    let semester = "1";
    if (terms.term2?.startDate && terms.term2?.endDate && todayStr >= terms.term2.startDate && todayStr <= terms.term2.endDate) {
        semester = "2";
    }
    return { academicYear, semester };
}

// ══════════════════════════════════════════════════════════════════════
// ผู้ช่วย AI แบบ "จับคำถามในระบบ" (rule-based) — ไม่เรียก API ภายนอกใดๆ ทั้งสิ้น ไม่มี API key
// จับคำถามด้วย keyword/pattern matching แล้วดึงข้อมูลจริงผ่าน aiRunTool ด้านบน จากนั้นแปลงผลลัพธ์
// เป็นข้อความภาษาไทยตามรูปแบบที่กำหนดไว้ล่วงหน้า — ข้อดี: ไม่มีค่าใช้จ่าย ตอบได้เฉพาะเรื่องที่
// โปรแกรมไว้เท่านั้นโดยธรรมชาติ (ไม่ต้องมีตัวกรองขอบเขตแยกต่างหากแบบตอนใช้ LLM ภายนอก)
// ข้อจำกัด: เข้าใจเฉพาะรูปแบบคำถามที่ตรงกับ pattern ด้านล่าง ไม่ใช่ AI สนทนาอิสระเหมือน Gemini/GPT
// ══════════════════════════════════════════════════════════════════════

const aiContainsAny = (text, keywords) => keywords.some((kw) => text.includes(kw));

function aiExtractClassLevel(text) {
    const m = text.match(/([มป])\.?\s?([1-6])(?!\d)/);
    return m ? `${m[1]}.${m[2]}` : null;
}

// จับทั้งชั้นและห้องถ้าพิมพ์ติดกันแบบ "ม.1/2" — ห้อง (room) จะเป็น null ถ้าพิมพ์แค่ชั้นเดี่ยวๆ
function aiExtractClassLevelAndRoom(text) {
    const m = text.match(/([มป])\.?\s?([1-6])(?:\s?\/\s?(\d{1,2}))?(?!\d)/);
    if (!m) return { classLevel: null, room: null };
    return { classLevel: `${m[1]}.${m[2]}`, room: m[3] || null };
}

function aiExtractSubjectCode(text) {
    const m = text.match(/[ก-๙]{1,4}\d{4,6}/);
    return m ? m[0] : null;
}

// คำลงท้ายแบบพูดคุยทั่วไปที่มักติดมากับชื่อที่ดักได้ ตัดออกให้เหลือใกล้เคียงชื่อจริงที่สุด
const AI_NAME_TRAILING_WORDS = [
    "หน่อยครับ", "หน่อยค่ะ", "หน่อย", "ด้วยครับ", "ด้วยค่ะ", "ด้วย", "ค่ะ", "ครับ",
    "ให้หน่อย", "ให้", "ที", "นะ", "หรือยัง", "เป็นอย่างไรบ้าง", "เป็นยังไงบ้าง", "เป็นไง",
];

function aiExtractStudentQuery(text) {
    const codeMatch = text.match(/\b\d{4,10}\b/);
    const studentCode = codeMatch ? codeMatch[0] : null;

    const nameMatch = text.match(/(?:ของ|ชื่อว่า|ชื่อ)\s*([ก-๙a-zA-Z.\s]{2,40})/);
    let studentName = nameMatch ? nameMatch[1].trim() : null;
    if (studentName) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const w of AI_NAME_TRAILING_WORDS) {
                if (studentName.endsWith(w)) {
                    studentName = studentName.slice(0, studentName.length - w.length).trim();
                    changed = true;
                }
            }
        }
        studentName = studentName || null;
    }
    return { studentCode, studentName };
}

function aiDetectDocumentType(text) {
    if (/ปพ\.?\s?7|ใบรับรอง/.test(text)) return "porbor7";
    if (aiContainsAny(text, ["พฤติกรรม", "ความประพฤติ"])) return "behavior_report";
    if (aiContainsAny(text, ["มาเรียน", "เช็คชื่อ", "เข้าแถว", "การมาเรียน"])) return "attendance_report";
    return "porbor5"; // ปพ.5 / เกรด / ทะเบียนวัดผล — ค่าเริ่มต้นเมื่อขอ "ดาวน์โหลดเกรด" เฉยๆ
}

const AI_HELP_MESSAGE = [
    "ผมเป็นผู้ช่วยในระบบ ตอบได้เฉพาะเรื่องข้อมูลในระบบโรงเรียนนี้เท่านั้น ลองถามแบบนี้ได้ครับ:",
    '- "วันนี้นักเรียนมากี่คน"',
    '- "นักเรียนชั้น ม.1 มีกี่คน"',
    '- "ขอดูพฤติกรรมของ [ชื่อนักเรียน]"',
    '- "ขอดูเกรดของ [ชื่อนักเรียน]"',
    '- "ขอลิงก์พิมพ์ ปพ.5" หรือ "ขอดาวน์โหลด ปพ.7" (ระบุวิชา/ชั้น/ห้องเพิ่มได้)',
    '- "วันนี้สอนอะไรบ้าง" (สำหรับครู เช็คตารางสอนวันนี้)',
].join("\n");

const AI_FALLBACK_MESSAGE =
    'ขอโทษครับ ยังไม่เข้าใจคำถามนี้ ลองพิมพ์ "ช่วยอะไรได้บ้าง" เพื่อดูตัวอย่างคำถามที่ถามได้ครับ';

// ต่อท้ายผล error/needsDisambiguation จาก aiRunTool ให้เป็นประโยคที่อ่านจบในตัว — คืน null ถ้าไม่มีปัญหา
function aiFormatToolProblem(result) {
    if (result.error) return result.error;
    if (result.needsDisambiguation) {
        const lines = result.candidates.map((c) => `- ${c.name} (รหัส ${c.studentCode}, ชั้น ${c.classLevel || "-"}/${c.room || "-"})`);
        return `พบนักเรียนหลายคนที่ตรงกับที่ระบุ กรุณาถามใหม่พร้อมระบุรหัสนักเรียนให้ชัดเจน:\n${lines.join("\n")}`;
    }
    return null;
}

function aiFormatStudentCount(result, classLevel) {
    const problem = aiFormatToolProblem(result);
    if (problem) return problem;
    if (classLevel) return `นักเรียนชั้น ${classLevel} มีทั้งหมด ${result.totalActiveStudents} คน`;
    const lines = Object.entries(result.byClassLevel)
        .sort(([a], [b]) => a.localeCompare(b, "th"))
        .map(([level, count]) => `- ${level}: ${count} คน`);
    return `นักเรียนที่กำลังศึกษาอยู่ทั้งหมด ${result.totalActiveStudents} คน\n${lines.join("\n")}`;
}

function aiFormatAttendanceSummary(result) {
    const problem = aiFormatToolProblem(result);
    if (problem) return problem;
    const lines = Object.entries(result.byStatus).map(([status, count]) => `- ${status}: ${count} คน`);
    return `สรุปการเช็คชื่อเข้าแถววันนี้ (${result.date})\nบันทึกแล้วทั้งหมด ${result.totalRecorded} คน\n${lines.join("\n")}\n\n${result.note}`;
}

function aiFormatBehavior(result) {
    const problem = aiFormatToolProblem(result);
    if (problem) return problem;
    const header = `${result.name} (รหัส ${result.studentCode}, ชั้น ${result.classLevel || "-"}/${result.room || "-"})\nคะแนนความประพฤติปัจจุบัน: ${result.currentBehaviorScore} คะแนน`;
    if (!result.recentBehaviorLogs || result.recentBehaviorLogs.length === 0) {
        return `${header}\n\nยังไม่มีประวัติการปรับคะแนน`;
    }
    const lines = result.recentBehaviorLogs.slice(0, 8).map((l) => {
        const sign = typeof l.points === "number" && l.points > 0 ? "+" : "";
        return `- ${l.date || "-"}: ${l.title}${l.points != null ? ` (${sign}${l.points} คะแนน)` : ""}${l.notes ? ` — ${l.notes}` : ""}`;
    });
    return `${header}\n\nประวัติล่าสุด:\n${lines.join("\n")}`;
}

function aiFormatGrades(result) {
    const problem = aiFormatToolProblem(result);
    if (problem) return problem;
    const header = `${result.name} (รหัส ${result.studentCode}, ชั้น ${result.classLevel || "-"}/${result.room || "-"})`;
    if (!result.subjects || result.subjects.length === 0) {
        return `${header}\n\n${result.note || "ไม่พบรายวิชาที่ตรงกับที่ระบุ"}`;
    }
    const lines = result.subjects.map((s) => {
        const gradeText = s.grade != null && s.grade !== "" ? `เกรด ${s.grade}` : "ยังไม่มีผลการเรียน";
        const scoreParts = [];
        if (s.midtermScore != null) scoreParts.push(`กลางภาค ${s.midtermScore}`);
        if (s.finalScore != null) scoreParts.push(`ปลายภาค ${s.finalScore}`);
        const scoreText = scoreParts.length ? ` (${scoreParts.join(", ")})` : "";
        return `- ${s.subjectTitle || "-"} (${s.subjectCode || "-"}): ${gradeText}${scoreText}`;
    });
    return `${header}\n\n${lines.join("\n")}`;
}

function aiFormatDocumentLink(result) {
    const problem = aiFormatToolProblem(result);
    if (problem) return problem;
    return `${result.note}\n\n${result.label}: ${result.path}`;
}

function aiFormatTeachingToday(result) {
    const problem = aiFormatToolProblem(result);
    if (problem) return problem;
    if (!result.periods || result.periods.length === 0) {
        return `วันนี้ (${result.dayLabel}) ${result.note || "ไม่มีคาบสอนในตารางครับ"}`;
    }
    const lines = result.periods.map((p) => {
        const nowTag = p.isNow ? " ← กำลังสอนอยู่ตอนนี้" : "";
        const courseText = p.courses
            .map((c) => `${c.title || "-"}${c.code ? ` (${c.code})` : ""} ห้อง ${c.classId || "-"}${c.room ? "/" + c.room : ""}`)
            .join(", ");
        return `- ${p.label} (${p.startTime}-${p.endTime}): ${courseText}${nowTag}`;
    });
    return `ตารางสอนวันนี้ (${result.dayLabel})\n${lines.join("\n")}\n\nไปหน้าเช็คชื่อรายวิชาได้ที่: ${result.attendancePagePath}\n${result.note}`;
}

// ตัวจับ intent หลัก — เช็คคำเฉพาะเจาะจงสุดก่อน (ขอเอกสาร) ตามด้วยเกรด พฤติกรรม เช็คชื่อวันนี้
// และจำนวนนักเรียนตามลำดับ ถ้าไม่ตรง pattern ไหนเลยจะตอบ AI_FALLBACK_MESSAGE เสมอ — ด้วยเหตุนี้
// บอทตัวนี้จึงตอบนอกเรื่องระบบไม่ได้อยู่แล้วโดยธรรมชาติของการทำงาน ไม่ต้องมีตัวกรองขอบเขตแยก
async function aiHandleMessage(message, caller) {
    const text = message.trim();

    if (aiContainsAny(text, ["สวัสดี", "หวัดดี", "ช่วยอะไรได้บ้าง", "ทำอะไรได้บ้าง", "คุณคือใคร", "คุณคืออะไร", "help"])) {
        return AI_HELP_MESSAGE;
    }

    if (aiContainsAny(text, ["ดาวน์โหลด", "พิมพ์เอกสาร", "ขอไฟล์", "pdf", "ปพ.5", "ปพ 5", "ปพ.7", "ปพ 7", "ใบรับรอง"])) {
        const { classLevel, room } = aiExtractClassLevelAndRoom(text);
        const result = await aiRunTool(
            "get_report_document_link",
            { documentType: aiDetectDocumentType(text), subjectCode: aiExtractSubjectCode(text), classLevel, room },
            caller
        );
        return aiFormatDocumentLink(result);
    }

    if (aiContainsAny(text, ["สอนอะไร", "วันนี้สอน", "ตารางสอนวันนี้", "สอนวันนี้", "คาบนี้สอน", "ตอนนี้สอน", "ตารางสอนของฉัน"])) {
        const result = await aiRunTool("get_my_teaching_today", {}, caller);
        return aiFormatTeachingToday(result);
    }

    if (aiContainsAny(text, ["เกรด", "ผลการเรียน", "คะแนนเก็บ", "คะแนนสอบ"])) {
        const { studentCode, studentName } = aiExtractStudentQuery(text);
        if (!studentCode && !studentName) {
            return 'กรุณาระบุชื่อหรือรหัสนักเรียนที่ต้องการดูเกรดด้วยครับ เช่น "ขอดูเกรดของ สมชาย ใจดี"';
        }
        const result = await aiRunTool("get_student_grades", { studentCode, studentName, subjectCode: aiExtractSubjectCode(text) }, caller);
        return aiFormatGrades(result);
    }

    if (aiContainsAny(text, ["พฤติกรรม", "ความประพฤติ"])) {
        const { studentCode, studentName } = aiExtractStudentQuery(text);
        if (!studentCode && !studentName) {
            return 'กรุณาระบุชื่อหรือรหัสนักเรียนที่ต้องการดูพฤติกรรมด้วยครับ เช่น "ขอดูพฤติกรรมของ สมชาย ใจดี"';
        }
        const result = await aiRunTool("get_student_behavior_summary", { studentCode, studentName }, caller);
        return aiFormatBehavior(result);
    }

    // เช็คชื่อ/มาเรียน — เช็คคำว่า "เช็คชื่อ"/"เข้าแถว" เดี่ยวๆ ได้เลย (มักหมายถึงเข้าแถวประจำวันอยู่แล้ว)
    // ส่วนกรณีอื่นต้องมี "วันนี้" ประกบด้วย เพราะคำเดี่ยวๆ อย่าง "มา"/"ขาด"/"สาย" กว้างเกินไป
    // และใช้ containsAny แบบไม่ยึดคำติดกัน เพราะประโยคจริงมักมีคำอื่นแทรกกลาง
    // (เช่น "วันนี้นักเรียนมากี่คน" ไม่มี "วันนี้มากี่คน" ติดกันเป็นคำเดียว)
    if (
        aiContainsAny(text, ["เช็คชื่อ", "เข้าแถว"]) ||
        (text.includes("วันนี้") && aiContainsAny(text, ["มากี่คน", "มาเรียน", "ขาดเรียน", "มาสาย"]))
    ) {
        const result = await aiRunTool("get_today_attendance_summary", {}, caller);
        return aiFormatAttendanceSummary(result);
    }

    if (aiContainsAny(text, ["กี่คน", "จำนวนนักเรียน", "นักเรียนทั้งหมด"])) {
        const classLevel = aiExtractClassLevel(text);
        const result = await aiRunTool("get_school_student_count", { classLevel }, caller);
        return aiFormatStudentCount(result, classLevel);
    }

    return AI_FALLBACK_MESSAGE;
}

exports.aiAssistantChat = functions.region("us-central1").https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "กรุณาเข้าสู่ระบบก่อนใช้งานผู้ช่วย AI");
    }

    const message = String(data?.message || "").trim();
    if (!message) {
        throw new functions.https.HttpsError("invalid-argument", "กรุณาพิมพ์คำถาม");
    }

    // ครอบด้วย try/catch เดียว — กัน exception ดิบๆ ที่ไม่ใช่ HttpsError หลุดออกไปโดยไม่แปลง
    // ซึ่งจะถูก Cloud Functions มาสก์เป็น "internal" เฉยๆ (บางสภาพแวดล้อมทำให้ response ไม่มี
    // CORS header จนเบราว์เซอร์ฟ้องเป็น CORS error แทนที่จะเห็นสาเหตุจริง)
    try {
        const caller = await aiGetCallerContext(context.auth.uid);
        if (!caller) {
            throw new functions.https.HttpsError("permission-denied", "ไม่พบข้อมูลผู้ใช้งานนี้ในระบบ (users/{uid} ไม่มีอยู่)");
        }
        if (!caller.schoolId) {
            throw new functions.https.HttpsError("failed-precondition", "ไม่พบโรงเรียนของผู้ใช้งานนี้ในระบบ");
        }

        const configSnap = await admin.firestore().collection("ai_config").doc("settings").get();
        const config = configSnap.exists ? configSnap.data() : null;
        if (!config || config.enabled !== true) {
            throw new functions.https.HttpsError("failed-precondition", "ผู้ดูแลระบบยังไม่ได้เปิดใช้งานผู้ช่วย AI");
        }

        const reply = await aiHandleMessage(message, caller);
        return { reply };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error; // ข้อความที่ตั้งใจสื่อสารให้ผู้ใช้อยู่แล้ว ส่งต่อตามเดิม ไม่ต้อง mask ซ้ำ
        }
        console.error("[aiAssistantChat] Unexpected error:", error);
        throw new functions.https.HttpsError("internal", `เกิดข้อผิดพลาดที่ไม่คาดคิด: ${error?.message || "unknown"}`);
    }
});

