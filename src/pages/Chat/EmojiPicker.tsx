import React, { useState } from "react";
import { X } from "lucide-react";

interface Props {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
}

interface EmojiCategory {
  key: string;
  icon: string;
  label: string;
  title: string;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: "popular",
    icon: "⭐",
    label: "ยอดนิยม",
    title: "อีโมจิยอดนิยม",
    emojis: [
      "😂", "🤣", "😊", "😍", "🥰", "🙏", "👍", "❤️", "🔥", "🎉",
      "✨", "👏", "🥺", "😭", "💖", "😁", "😘", "👌", "💯", "🙌",
      "✌️", "😉", "😎", "🥳", "💙", "🌸", "⭐", "💪", "💐", "☕",
      "🎂", "🎁", "🏆", "🎓", "🎒", "📝", "📢", "🔔", "🌟", "💡"
    ],
  },
  {
    key: "smileys",
    icon: "😀",
    label: "รอยยิ้ม",
    title: "รอยยิ้มและอารมณ์",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
      "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
      "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮",
      "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎",
      "🤓", "🧐", "😕", "😟", "🙁", "😮", "😯", "😲", "😳", "🥺",
      "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣",
      "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬"
    ],
  },
  {
    key: "gestures",
    icon: "👍",
    label: "ท่าทาง",
    title: "ท่าทางและสัญลักษณ์มือ",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞",
      "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍",
      "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝",
      "🙏", "✍️", "💅", "🤳", "💪", "👂", "👃", "👀", "👁️", "👅",
      "👄", "🧠", "🫀", "🫁", "🦷", "🦴", "👣"
    ],
  },
  {
    key: "hearts",
    icon: "❤️",
    label: "หัวใจ",
    title: "หัวใจและความรัก",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "💌",
      "💐", "🌸", "💮", "🌹", "🌺", "🌻", "🌼", "🌷", "🌱", "🍀",
      "🍁", "🍂", "🍃", "✨", "💫", "⭐", "🌟"
    ],
  },
  {
    key: "objects",
    icon: "🎉",
    label: "สิ่งของ",
    title: "กิจกรรมและสิ่งของ",
    emojis: [
      "🎉", "🎊", "🎈", "🎂", "🎁", "🏆", "🥇", "🥈", "🥉", "👑",
      "⭐", "🌟", "✨", "💥", "💯", "🔔", "📢", "📌", "📍", "📖",
      "✏️", "📝", "📅", "🕒", "⏰", "💡", "🔑", "🎓", "🎒", "🏫",
      "☕", "🍎", "🍕", "🍰", "🍦", "⚽", "🏀", "🚗", "✈️", "🚀"
    ],
  },
];

const EmojiPicker: React.FC<Props> = ({ onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].key);
  const currentCategory = EMOJI_CATEGORIES.find((c) => c.key === activeCategory) || EMOJI_CATEGORIES[0];

  return (
    <div className="flex h-[290px] flex-col overflow-hidden bg-white shadow-xl dark:bg-[#242526]">
      {/* Header bar: Category Title & Close button */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-gray-50/90 px-3 py-1.5 dark:border-gray-800 dark:bg-[#1e1f21]">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-gray-200">
          <span className="text-base">{currentCategory.icon}</span>
          <span>{currentCategory.title}</span>
          <span className="rounded-full bg-gray-200/80 px-1.5 py-0.2 text-[9.5px] font-normal text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {currentCategory.emojis.length}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
            title="ปิดแผงอีโมจิ"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Segmented Category Tabs - exactly 5 items spanning 100% width, NO horizontal scrollbar ever */}
      <div className="shrink-0 border-b border-gray-100 bg-white p-1.5 dark:border-gray-800 dark:bg-[#242526]">
        <div className="grid grid-cols-5 gap-1 rounded-xl bg-gray-100/90 p-0.5 dark:bg-black/30">
          {EMOJI_CATEGORIES.map((cat) => {
            const isActive = cat.key === activeCategory;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={`flex flex-col items-center justify-center rounded-lg py-1 transition ${
                  isActive
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-[#323336] dark:text-indigo-400"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
                title={cat.title}
              >
                <span className="text-sm leading-none">{cat.icon}</span>
                <span className={`mt-0.5 text-[9.5px] leading-none ${isActive ? "font-bold" : "font-normal"}`}>
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Emoji Grid (8 columns in 320px = ~38px each, perfectly proportioned) */}
      <div
        className="grid flex-1 grid-cols-8 content-start gap-1 overflow-y-auto p-2"
        style={{ scrollbarWidth: "thin" }}
      >
        {currentCategory.emojis.map((emoji, idx) => (
          <button
            key={`${emoji}-${idx}`}
            type="button"
            onClick={() => onSelect(emoji)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-xl transition hover:bg-gray-100 hover:scale-120 active:scale-95 dark:hover:bg-white/10"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

export default EmojiPicker;
