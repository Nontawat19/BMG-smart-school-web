import React, { useLayoutEffect, useRef, useState } from "react";

interface AutoFitHeadingProps extends React.HTMLAttributes<HTMLElement> {
  as?: "h1" | "h2" | "h3" | "h4" | "span" | "div";
  className?: string;
  minFontSizePx?: number;
  children: React.ReactNode;
}

// หัวข้อ/ป้ายบรรทัดเดียวเสมอ: ถ้าข้อความ (เช่นชื่อโรงเรียนหรือชื่อคนยาวๆ) ล้นพื้นที่ที่มี
// จะค่อยๆ ลดขนาดตัวอักษรลงจนพอดี แทนการตัดข้อความทิ้งด้วย "..." (truncate)
const AutoFitHeading: React.FC<AutoFitHeadingProps> = ({
  as = "h1",
  className = "",
  minFontSizePx = 12,
  children,
  ...rest
}) => {
  const Tag = as as React.ElementType;
  const textRef = useRef<HTMLElement | null>(null);
  const [fontSizePx, setFontSizePx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || !el.parentElement) return;

    const fit = () => {
      // รีเซ็ตกลับไปใช้ขนาดตาม Tailwind class ก่อนวัดใหม่ทุกครั้ง
      // เพื่อให้ขยายกลับคืนได้เมื่อข้อความสั้นลงหรือจอกว้างขึ้น
      el.style.fontSize = "";
      const availableWidth = el.parentElement?.clientWidth;
      if (!availableWidth) return;

      let currentSize = parseFloat(window.getComputedStyle(el).fontSize);
      if (!Number.isFinite(currentSize)) return;

      let guard = 0;
      while (el.scrollWidth > availableWidth && currentSize > minFontSizePx && guard < 40) {
        currentSize = Math.max(minFontSizePx, currentSize * 0.95);
        el.style.fontSize = `${currentSize}px`;
        guard += 1;
      }

      setFontSizePx(currentSize);
    };

    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement);

    return () => observer.disconnect();
  }, [children, minFontSizePx]);

  return (
    <Tag
      ref={textRef}
      className={`whitespace-nowrap overflow-hidden ${className}`}
      style={fontSizePx ? { fontSize: `${fontSizePx}px` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
};

export default AutoFitHeading;
