import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/firebase";
import imageCompression from "browser-image-compression";

/**
 * อัปโหลดไฟล์ (รองรับ Compression รูปภาพ)
 * @param files Array ของไฟล์ที่ต้องการอัปโหลด
 * @returns Array ของ URL ที่ได้จาก Storage
 */
export const uploadFiles = async (files: File[]): Promise<string[]> => {
  const uploadedUrls: string[] = [];

  for (const file of files) {
    let fileToUpload = file;

    // ถ้าเป็นรูปภาพให้ทำการ Compression ก่อน
    if (file.type.startsWith("image/")) {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };
      fileToUpload = await imageCompression(file, options);
    }

    // กำหนด path ใน storage
    const storageRef = ref(storage, `posts/${Date.now()}_${fileToUpload.name}`);
    const snapshot = await uploadBytes(storageRef, fileToUpload);
    const downloadUrl = await getDownloadURL(snapshot.ref);

    uploadedUrls.push(downloadUrl);
  }

  return uploadedUrls;
};
