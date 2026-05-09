// Official Thai SDQ Data

export interface SDQItem {
    id: number;
    text: string;
}

export const SDQ_ITEMS: SDQItem[] = [
    { id: 1, text: "ห่วงใยความรู้สึกคนอื่น" }, // Prosocial
    { id: 2, text: "อยู่ไม่นิ่ง ไม่สุข วอกแวกง่าย" }, // Hyper
    { id: 3, text: "มักจะบ่นว่าปวดศีรษะ ปวดท้อง หรือไม่สบาย" }, // Emotional
    { id: 4, text: "เต็มใจแบ่งปันสิ่งของให้เพื่อน (แลกเปลี่ยน)" }, // Prosocial
    { id: 5, text: "มักจะอาละวาด หรือโมโหร้าย" }, // Conduct
    { id: 6, text: "ค่อนข้างแยกตัว ชอบเล่นคนเดียว" }, // Peer
    { id: 7, text: "เชื่อฟัง ทำตามผู้ใหญ่ดี" }, // Conduct (Reverse)
    { id: 8, text: "ขี้กังวล หรือกังวลใจ" }, // Emotional
    { id: 9, text: "ชอบช่วยเหลือคนอื่น" }, // Prosocial
    { id: 10, text: "อยู่นิ่งไม่ได้ (ยุกยิกไปมา)" }, // Hyper
    { id: 11, text: "มีเพื่อนสนิท" }, // Peer (Reverse)
    { id: 12, text: "มักมีเรื่องทะเลาะวิวาท หรือรังแกเด็กอื่น" }, // Conduct
    { id: 13, text: "ดูไม่มีความสุข ท้อแท้" }, // Emotional
    { id: 14, text: "เป็นที่ขื่นชอบของเพื่อนๆ" }, // Peer (Reverse)
    { id: 15, text: "วอกแวกง่าย สมาธิสั้น" }, // Hyper
    { id: 16, text: "ขี้กลัว หรือประหม่ากังวลได้ง่าย" }, // Emotional
    { id: 17, text: "มีน้ำใจกับเด็กที่อายุน้อยกว่า" }, // Prosocial
    { id: 18, text: "มักโกหก หรือขี้โกง" }, // Conduct
    { id: 19, text: "ถูกเด็กคนอื่นล้อเลียน หรือรังแก" }, // Peer
    { id: 20, text: "มักจะอาสาช่วยเหลือผู้อื่น (พ่อแม่ ครู เด็กคนอื่น)" }, // Prosocial
    { id: 21, text: "คิดก่อนทำ" }, // Hyper (Reverse)
    { id: 22, text: "ขโมยของที่บ้าน ที่โรงเรียน หรือที่อื่น" }, // Conduct
    { id: 23, text: "เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน" }, // Peer
    { id: 24, text: "ขี้กลัวจังเลย ถูมิแพ้ความกลัวง่าย" }, // Emotional (Phrasing might vary, standardized: ขี้กลัว)
    { id: 25, text: "ทำอะไรจนเสร็จ (มีความตั้งใจดี)" } // Hyper (Reverse)
];

// 0 = Emotional, 1 = Conduct, 2 = Hyperactivity, 3 = Peer, 4 = Prosocial
export const DOMAIN_MAP: Record<string, number[]> = {
    emotional: [3, 8, 13, 16, 24],
    conduct: [5, 7, 12, 18, 22],
    hyperactivity: [2, 10, 15, 21, 25],
    peer: [6, 11, 14, 19, 23],
    prosocial: [1, 4, 9, 17, 20]
};

export const REVERSE_ITEMS = [7, 11, 14, 21, 25];

// Cutoff Scores (Department of Mental Health, Thailand)
// Format: [Normal Max, Borderline Max] (Anything above Borderline Max is Abnormal)
// Note: Prosocial is strength, so Logic is swapped later (Low is abnormal)
export const CUTOFFS = {
    student: {
        emotional: [5, 6],
        conduct: [4, 5],
        hyperactivity: [5, 6],
        peer: [3, 4],
        totalDifficulty: [15, 17], // 0-15 Normal, 16-17 Borderline, 18-40 Problem
        prosocial: [6, 5] // >6 Normal, 5-6 Borderline, <5 Abnormal (Swapped logic)
    },
    teacher: {
        emotional: [4, 5],
        conduct: [2, 3],
        hyperactivity: [5, 6],
        peer: [3, 4],
        totalDifficulty: [11, 14], // 0-11 Normal, 12-14 Borderline, 15-40 Problem
        prosocial: [6, 5]
    },
    parent: {
        emotional: [3, 4],
        conduct: [2, 3],
        hyperactivity: [5, 6],
        peer: [2, 3],
        totalDifficulty: [13, 16], // 0-13 Normal, 14-16 Borderline, 17-40 Problem
        prosocial: [6, 5]
    }
};
