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
