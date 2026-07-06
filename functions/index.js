const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

exports.deleteUser = functions.region("us-central1").https.onCall(async (data, context) => {
    // เปิดการเช็คสิทธิ์ (คุณอาจต้องการให้แค่ role บางอย่างทำได้ ให้เขียนเพิ่มที่นี่)
    // if (!context.auth) {
    //   throw new functions.https.HttpsError(
    //     "unauthenticated",
    //     "ต้องเข้าสู่ระบบเพื่อใช้งานฟังก์ชันนี้"
    //   );
    // }

    const userId = data.userId;
    if (!userId) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "กรุณาระบุ userId ที่ต้องการลบ"
        );
    }

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
    // optional permission check
    const userId = data.userId;
    const newEmail = data.email;

    if (!userId || !newEmail) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "กรุณาระบุ userId และ email"
        );
    }

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
