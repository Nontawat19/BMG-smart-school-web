import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { getTrendingGifs, isGifPickerConfigured, searchGifs, GifResult } from "./giphy";

interface Props {
  onSelect: (gif: GifResult) => void;
}

/**
 * แผงค้นหา GIF ผ่าน GIPHY API (ตัวแทน Tenor ที่ปิดตัวไปแล้ว) — ต่างจาก StickerPicker ตรงที่ต้อง
 * เรียก network จริง (ไป GIPHY ไม่ใช่ Firebase) ดีบาวซ์การค้นหาไว้ 400ms กันยิง API รัวๆ ตามตัวอักษรที่พิมพ์
 *
 * เงื่อนไขการใช้ GIPHY API ฟรี บังคับให้ต้องแสดงตราสัญลักษณ์ "POWERED BY GIPHY" ในหน้าค้นหา — ห้ามลบออก
 */
const GifPicker: React.FC<Props> = ({ onSelect }) => {
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const configured = isGifPickerConfigured();

  // ดีบาวซ์ 400ms กันยิง GIPHY API รัวๆ ตามทุกตัวอักษรที่พิมพ์
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), 400);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!configured) return;
    setIsLoading(true);
    const load = debouncedTerm.trim() ? searchGifs(debouncedTerm.trim()) : getTrendingGifs();
    load
      .then((results) => setGifs(results))
      .catch((error) => { console.error("Error loading GIFs:", error); setGifs([]); })
      .finally(() => setIsLoading(false));
  }, [debouncedTerm, configured]);

  const handleChange = (value: string) => {
    setTerm(value);
  };

  if (!configured) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-bold text-gray-600 dark:text-gray-300">ยังไม่ได้ตั้งค่า GIF</p>
        <p className="text-xs text-gray-400">
          ผู้ดูแลระบบต้องขอ GIPHY API key ฟรีที่ developers.giphy.com แล้วใส่ใน .env (VITE_GIPHY_API_KEY) ก่อนใช้งานฟีเจอร์นี้
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[320px] flex-col">
      <div className="shrink-0 p-2">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={term}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="ค้นหา GIF..."
            className="w-full rounded-full bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none dark:bg-white/5 dark:text-white"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <p className="py-10 text-center text-xs text-gray-400">กำลังโหลด...</p>
        ) : gifs.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-400">ไม่พบ GIF</p>
        ) : (
          // ใช้ CSS columns แบบ masonry แทนกริดสี่เหลี่ยมจัตุรัส เพราะ GIF แต่ละอันสัดส่วนไม่เท่ากัน
          // การบังคับให้เป็นจัตุรัสแล้ว crop (object-cover) ทำให้เนื้อหาบางส่วนถูกตัดหายไป — วิธีนี้
          // ปล่อยให้แต่ละรูปคงสัดส่วนเดิม แสดงเต็มภาพ ไม่มีส่วนไหนถูกตัด
          <div className="columns-3 gap-1.5">
            {gifs.map((gif) => (
              // พื้นหลังเข้มไว้เพราะ GIF/สติกเกอร์แนวมีมจำนวนมากจาก GIPHY เป็นไฟล์พื้นหลังโปร่งใส
              // ถ้าใช้พื้นขาว/เทาอ่อนแบบเดิม ส่วนที่โปร่งใสจะกลืนกับพื้นหลังจนดูเหมือนภาพขาดหาย
              <button
                key={gif.id}
                onClick={() => onSelect(gif)}
                className="mb-1.5 block w-full break-inside-avoid overflow-hidden rounded-lg bg-gray-800 transition hover:opacity-80"
              >
                <img src={gif.previewUrl} alt={gif.description} className="block w-full" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
      {/* เงื่อนไขบังคับของ GIPHY API (ใช้ฟรี) ต้องแสดงตราสัญลักษณ์นี้เสมอ ห้ามลบ */}
      <p className="shrink-0 border-t border-gray-200 py-1 text-center text-[10px] font-bold tracking-wide text-gray-400 dark:border-gray-700 dark:text-gray-500">
        POWERED BY GIPHY
      </p>
    </div>
  );
};

export default GifPicker;
