import { firestore } from "@/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth } from "@/firebase";

/**
 * ข้อมูลโพสต์ที่ต้องการสร้าง
 */
interface PostData {
  content: string;
  uploadedMediaUrls: string[];
  externalUrls: string[];
  privacy: "public" | "followers" | "private";
}

/**
 * สร้างโพสต์ใหม่ใน Firestore
 */
export const createPost = async (postData: PostData) => {
  const user = auth.currentUser;
  if (!user) throw new Error("ไม่พบผู้ใช้งาน กรุณาล็อกอินใหม่");

  const postCollection = collection(firestore, "posts");

  await addDoc(postCollection, {
    userId: user.uid,
    content: postData.content,
    uploadedMediaUrls: postData.uploadedMediaUrls,
    externalUrls: postData.externalUrls,
    privacy: postData.privacy,
    createdAt: serverTimestamp(),
  });
};
