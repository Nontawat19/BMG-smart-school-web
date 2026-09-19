import React, { useState } from "react";
import { STICKER_CATEGORIES, stickerFileUrl } from "./stickerConstants";

interface Props {
  onSelect: (stickerId: string) => void;
}

/**
 * แผงเลือกสติกเกอร์ — ใช้ชุด Fluent Emoji (3D) ของ Microsoft ซึ่งเป็นสัญญาอนุญาต MIT (ฟรีเชิงพาณิชย์)
 * เก็บไฟล์ทั้งหมดไว้ใน public/stickers/fluent-emoji-3d ไม่มีการยิง API ภายนอกตอนเปิดแผง
 */
const StickerPicker: React.FC<Props> = ({ onSelect }) => {
  const [activeCategory, setActiveCategory] = useState(STICKER_CATEGORIES[0].key);
  const category = STICKER_CATEGORIES.find((c) => c.key === activeCategory) || STICKER_CATEGORIES[0];

  return (
    <div className="flex h-[330px] flex-col bg-white select-none dark:bg-[#23272a]">
      {/* Category Tabs with clean horizontal scroll and hidden scrollbar */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-200/80 bg-gray-50/70 p-2 scrollbar-hide no-scrollbar dark:border-gray-700/60 dark:bg-black/20">
        {STICKER_CATEGORIES.map((cat) => {
          const isActive = cat.key === activeCategory;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/50"
                  : "bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200/80 dark:bg-white/5 dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/10"
              }`}
            >
              <span className="text-sm leading-none">{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                className={`ml-0.5 rounded-full px-1 text-[10px] leading-tight ${
                  isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                }`}
              >
                {cat.stickers.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stickers Grid */}
      <div className="grid flex-1 grid-cols-4 gap-2 overflow-y-auto p-2.5 custom-scrollbar">
        {category.stickers.map((sticker) => (
          <button
            key={sticker.id}
            onClick={() => onSelect(sticker.id)}
            title={sticker.label}
            className="group relative flex aspect-square items-center justify-center rounded-2xl p-1.5 transition-all duration-150 hover:bg-indigo-50/70 hover:shadow-sm active:scale-95 dark:hover:bg-white/10"
          >
            <img
              src={stickerFileUrl(sticker.id)}
              alt={sticker.label}
              className="h-full w-full object-contain drop-shadow-sm transition-transform duration-150 group-hover:scale-110"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default StickerPicker;
