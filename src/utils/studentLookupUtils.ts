// src/utils/studentLookupUtils.ts
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/firebase";

/**
 * สร้างกุญแจสำหรับใช้ในคอลเลกชัน student-lookups
 * @param idCardNumber เลขบัตรประชาชน
 * @param studentId รหัสนักเรียน
 * @returns SHA-256 hash string
 */
export async function generateStudentLookupKey(idCardNumber: string, studentId: string): Promise<string> {
    const cleanIdCard = idCardNumber.trim().replace(/\s/g, '');
    const cleanStudentId = studentId.trim().replace(/\s/g, '');
    
    // รูปแบบข้อมูลที่จะนำไป Hash: cleanIdCard_cleanStudentId
    const data = `${cleanIdCard}_${cleanStudentId}`;
    
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}

/**
 * อัปเดตข้อมูลใน student-lookups
 * @param idCardNumber เลขบัตรประชาชน
 * @param studentId รหัสนักเรียน
 * @param schoolId รหัสโรงเรียน
 * @param studentDocId ID ของเอกสารนักเรียนในโรงเรียนนั้น
 */
export async function updateStudentLookup(
    idCardNumber: string,
    studentId: string,
    schoolId: string,
    studentDocId: string
): Promise<void> {
    if (!idCardNumber || !studentId || !schoolId || !studentDocId) return;
    
    const lookupKey = await generateStudentLookupKey(idCardNumber, studentId);
    const lookupRef = doc(firestore, "student-lookups", lookupKey);
    
    await setDoc(lookupRef, {
        schoolId,
        studentDocId,
        updatedAt: serverTimestamp()
    }, { merge: true });
}
