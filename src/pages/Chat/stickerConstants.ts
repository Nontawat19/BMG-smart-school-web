// สติกเกอร์ในแชท: ใช้ชุด Fluent Emoji (3D) ของ Microsoft ซึ่งเป็นโอเพนซอร์สสัญญาอนุญาต MIT
// (ดูรายละเอียดที่ public/stickers/fluent-emoji-3d/NOTICE.md) — สามารถใช้ในเชิงพาณิชย์ได้ฟรี 100%
// ไฟล์ภาพทั้งหมดบันทึกไว้ใน public/stickers/fluent-emoji-3d โดยตรง ไม่มีการเรียก API ภายนอก จึงไม่มีค่าใช้จ่ายใดๆ
export interface StickerDef {
  id: string;
  label: string;
}

export interface StickerCategory {
  key: string;
  label: string;
  icon?: string;
  stickers: StickerDef[];
}

const STICKER_BASE_PATH = "/stickers/fluent-emoji-3d";

export const stickerFileUrl = (stickerId: string) => `${STICKER_BASE_PATH}/${stickerId}.png`;

export const STICKER_CATEGORIES: StickerCategory[] = [
  {
    key: "faces",
    label: "หน้าตา",
    icon: "😀",
    stickers: [
      { id: "grinning_face", label: "ยิ้มกว้าง" },
      { id: "beaming_face", label: "ยิ้มตาหยี" },
      { id: "joy", label: "หัวเราะจนน้ำตาไหล" },
      { id: "heart_eyes", label: "ตาหัวใจ" },
      { id: "kiss", label: "จูบ" },
      { id: "wink", label: "ขยิบตา" },
      { id: "sunglasses", label: "แว่นกันแดด" },
      { id: "thinking", label: "คิด" },
      { id: "smiling_face_with_halo", label: "เทวดาน้อย" },
      { id: "pleading_face", label: "อ้อนวอน" },
      { id: "hugging_face", label: "กอด" },
      { id: "saluting_face", label: "เคารพ/รับทราบ" },
      { id: "melting_face", label: "ละลาย" },
      { id: "zany_face", label: "กวนๆ" },
      { id: "face_with_hand_over_mouth", label: "อุ๊บส์" },
      { id: "face_savoring_food", label: "อร่อย" },
      { id: "shushing_face", label: "จุ๊ๆ เงียบๆ" },
      { id: "face_with_medical_mask", label: "ใส่แมสก์" },
      { id: "neutral", label: "เฉยๆ" },
      { id: "rolling_eyes", label: "กลอกตา" },
      { id: "sob", label: "ร้องไห้หนัก" },
      { id: "cry", label: "ร้องไห้" },
      { id: "angry", label: "โกรธ" },
      { id: "pouting", label: "งอน" },
      { id: "astonished", label: "ตกใจ" },
      { id: "scream", label: "กรีดร้อง" },
      { id: "sleeping", label: "หลับ" },
      { id: "vomiting", label: "อ้วก" },
      { id: "hot_face", label: "ร้อน" },
      { id: "cold_face", label: "หนาว" },
      { id: "nerd", label: "เนิร์ด" },
      { id: "partying", label: "ปาร์ตี้" },
      { id: "star_struck", label: "ตาเป็นดาว" },
      { id: "exploding_head", label: "หัวระเบิด" },
      { id: "ghost", label: "ผี" },
      { id: "skull", label: "กะโหลก" },
    ],
  },
  {
    key: "hands",
    label: "มือ",
    icon: "👍",
    stickers: [
      { id: "thumbs_up", label: "ไลค์" },
      { id: "thumbs_down", label: "ไม่ไลค์" },
      { id: "finger_heart", label: "มินิฮาร์ท" },
      { id: "love_you_gesture", label: "ไอเลิฟยู" },
      { id: "victory_hand", label: "สู้ๆ/ชูสองนิ้ว" },
      { id: "clap", label: "ปรบมือ" },
      { id: "ok_hand", label: "โอเค" },
      { id: "pray", label: "ไหว้/ขอบคุณ" },
      { id: "wave", label: "โบกมือ" },
      { id: "handshake", label: "จับมือ" },
      { id: "oncoming_fist", label: "ชนหมัด" },
      { id: "crossed_fingers", label: "โชคดี" },
      { id: "point_up", label: "ชี้ขึ้น" },
      { id: "call_me_hand", label: "โทรหา" },
      { id: "raised_hands", label: "ยกมือฉลอง" },
      { id: "muscle", label: "แข็งแรง" },
    ],
  },
  {
    key: "hearts",
    label: "หัวใจ",
    icon: "❤️",
    stickers: [
      { id: "red_heart", label: "หัวใจสีแดง" },
      { id: "two_hearts", label: "หัวใจคู่" },
      { id: "sparkling_heart", label: "หัวใจประกาย" },
      { id: "growing_heart", label: "หัวใจพองโต" },
      { id: "heart_with_ribbon", label: "ของขวัญหัวใจ" },
      { id: "heart_on_fire", label: "ไฟรัก" },
      { id: "orange_heart", label: "หัวใจสีส้ม" },
      { id: "yellow_heart", label: "หัวใจสีเหลือง" },
      { id: "green_heart", label: "หัวใจสีเขียว" },
      { id: "blue_heart", label: "หัวใจสีฟ้า" },
      { id: "purple_heart", label: "หัวใจสีม่วง" },
      { id: "love_letter", label: "จดหมายรัก" },
      { id: "broken_heart", label: "หัวใจสลาย" },
    ],
  },
  {
    key: "school",
    label: "โรงเรียน",
    icon: "🎒",
    stickers: [
      { id: "backpack", label: "กระเป๋านักเรียน" },
      { id: "graduation_cap", label: "หมวกปริญญา" },
      { id: "school", label: "โรงเรียน" },
      { id: "books", label: "หนังสือเรียน" },
      { id: "pencil", label: "ดินสอ" },
      { id: "bell", label: "กระดิ่งโรงเรียน" },
      { id: "tear_off_calendar", label: "ปฏิทิน" },
      { id: "alarm_clock", label: "นาฬิกาปลุก" },
      { id: "medal", label: "เหรียญทอง" },
      { id: "trophy", label: "ถ้วยรางวัล" },
    ],
  },
  {
    key: "animals",
    label: "สัตว์",
    icon: "🐶",
    stickers: [
      { id: "dog_face", label: "ลูกสุนัข" },
      { id: "cat_face", label: "ลูกแมว" },
      { id: "panda", label: "แพนด้า" },
      { id: "rabbit_face", label: "กระต่าย" },
      { id: "bear", label: "หมีน้อย" },
      { id: "tiger_face", label: "เสือ" },
      { id: "unicorn", label: "ยูนิคอร์น" },
      { id: "monkey_face", label: "ลูกลิง" },
      { id: "baby_chick", label: "ลูกเจี๊ยบ" },
      { id: "honeybee", label: "ผึ้งน้อย" },
    ],
  },
  {
    key: "food",
    label: "อาหาร",
    icon: "🧋",
    stickers: [
      { id: "bubble_tea", label: "ชานมไข่มุก" },
      { id: "cupcake", label: "คัพเค้ก" },
      { id: "birthday_cake", label: "เค้กวันเกิด" },
      { id: "pizza", label: "พิซซ่า" },
      { id: "hamburger", label: "เบอร์เกอร์" },
      { id: "french_fries", label: "เฟรนช์ฟรายส์" },
      { id: "doughnut", label: "โดนัท" },
      { id: "cookie", label: "คุกกี้" },
      { id: "ice_cream", label: "ไอศกรีม" },
      { id: "watermelon", label: "แตงโม" },
      { id: "strawberry", label: "สตรอว์เบอร์รี" },
      { id: "red_apple", label: "แอปเปิ้ล" },
    ],
  },
  {
    key: "objects",
    label: "อื่นๆ",
    icon: "🎉",
    stickers: [
      { id: "fire", label: "ไฟ/เจ๋ง" },
      { id: "sparkles", label: "ประกาย" },
      { id: "party_popper", label: "ปาร์ตี้ป๊อป" },
      { id: "confetti_ball", label: "คอนเฟตติ" },
      { id: "balloon", label: "ลูกโป่ง" },
      { id: "gift", label: "ของขวัญ" },
      { id: "star", label: "ดาว" },
      { id: "hundred", label: "เต็มร้อย" },
      { id: "check_mark", label: "ถูกต้อง" },
      { id: "cross_mark", label: "ผิด" },
      { id: "question", label: "คำถาม" },
      { id: "exclamation", label: "ตกใจ!" },
      { id: "eyes", label: "ตา" },
      { id: "rocket", label: "จรวด" },
      { id: "rainbow", label: "รุ้ง" },
      { id: "moon", label: "พระจันทร์" },
    ],
  },
];

export const ALL_STICKER_IDS = new Set(
  STICKER_CATEGORIES.flatMap((cat) => cat.stickers.map((s) => s.id))
);
