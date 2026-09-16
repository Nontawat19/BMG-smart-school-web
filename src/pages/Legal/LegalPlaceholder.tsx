import React from "react";

// เครื่องหมายจุดที่ต้องให้ผู้บริหาร/ฝ่ายกฎหมายของแต่ละโรงเรียนกรอกข้อมูลจริงก่อนเผยแพร่ (ชื่อนิติบุคคล,
// ที่อยู่, อีเมลติดต่อ, ระยะเวลาเก็บข้อมูล ฯลฯ) — ขึ้นเหลืองเด่นชัดกันหลุดไปเผยแพร่ทั้งที่ยังเป็น draft
export const LegalPlaceholder: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <mark
    className="rounded bg-amber-200/70 px-1.5 py-0.5 font-mono text-[12px] font-bold text-amber-900 dark:bg-amber-500/25 dark:text-amber-200"
    title="ต้องระบุข้อมูลจริงของโรงเรียน/ผู้ให้บริการก่อนเผยแพร่เอกสารนี้"
  >
    {children}
  </mark>
);

// เน้นคำนิยามทางกฎหมายที่ถูกกำหนดไว้ในหมวด "คำนิยาม" ของเอกสาร
export const DefTerm: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <strong className="font-bold text-gray-900 dark:text-white">{children}</strong>
);
