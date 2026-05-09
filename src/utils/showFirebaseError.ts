// src/utils/showFirebaseError.ts
import { toast } from "react-toastify";

export function showFirebaseError(error: any) {
  const code = error.code || "";

  switch (code) {
    case "auth/email-already-in-use":
      toast.error("อีเมลนี้ถูกใช้งานไปแล้วในระบบ");
      break;
    case "auth/invalid-email":
      toast.error("รูปแบบอีเมลไม่ถูกต้อง");
      break;
    case "auth/weak-password":
      toast.error("รหัสผ่านสั้นเกินไป (ต้องมีอย่างน้อย 6 ตัวอักษร)");
      break;
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      toast.error("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      break;
    case "auth/too-many-requests":
      toast.error("ระบบระงับการเข้าใช้งานชั่วคราวเนื่องจากคุณระบุรหัสผิดหลายครั้ง กรุณาลองอีกครั้งในภายหลัง");
      break;
    case "auth/network-request-failed":
      toast.error("การเชื่อมต่อระบบขัดข้อง กรุณาตรวจสอบอินเทอร์เน็ตของคุณ");
      break;
    case "auth/popup-closed-by-user":
      toast.error("หน้าต่างเข้าสู่ระบบถูกปิดลง");
      break;
    case "auth/internal-error":
      toast.error("ระบบขัดข้องชั่วคราว กรุณาลองใหม่ในภายหลัง");
      break;
    default:
      toast.error("เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง");
      break;
  }
}
