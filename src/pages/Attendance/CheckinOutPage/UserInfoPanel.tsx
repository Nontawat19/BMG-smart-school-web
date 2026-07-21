import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FoundUser } from './types';

interface UserInfoPanelProps {
  displayUser: FoundUser | null;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  isCompact?: boolean;
}

const AutoFitSingleLineText: React.FC<{
  text: string;
  className?: string;
  minSize?: number;
  maxSize?: number;
}> = ({ text, className = "", minSize = 22, maxSize = 32 }) => {
  const textRef = useRef<HTMLHeadingElement>(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const fitText = () => {
      let nextSize = maxSize;
      element.style.fontSize = `${nextSize}px`;

      while (nextSize > minSize && element.scrollWidth > element.clientWidth) {
        nextSize -= 1;
        element.style.fontSize = `${nextSize}px`;
      }

      setFontSize(nextSize);
    };

    fitText();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fitText);
    observer.observe(element);

    return () => observer.disconnect();
  }, [maxSize, minSize, text]);

  return (
    <h2
      ref={textRef}
      className={`w-full whitespace-nowrap px-1 font-extrabold leading-tight text-gray-900 dark:text-white ${className}`}
      style={{ fontSize }}
      title={text}
    >
      {text}
    </h2>
  );
};

const UserInfoPanel: React.FC<UserInfoPanelProps> = ({ displayUser, checkinTime, checkoutTime, isCompact = false }) => {
  const isStudent = displayUser?.type === "student";

  return (
    <div className={`sm:col-span-2 bg-[#fafbfc] dark:bg-[#2a2b2f] rounded-3xl ${isCompact ? 'p-4' : 'p-10'} text-gray-900 dark:text-white flex flex-col items-center justify-center text-center shadow-sm dark:shadow-none h-full overflow-hidden relative border border-gray-200/50 dark:border-none`}>
      <AnimatePresence mode="wait">
        {displayUser ? (
          <motion.div
            key={displayUser.id}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full h-full flex flex-col items-center justify-center"
          >
            <div className={`${isCompact ? 'w-40 h-40' : 'w-72 h-72 2xl:w-80 2xl:h-80'} rounded-[1.75rem] border-[6px] border-[#fafbfc] dark:border-[#323338] shadow-2xl overflow-hidden ring-4 ring-gray-100 dark:ring-gray-700 mx-auto ${isCompact ? 'mb-3' : 'mb-8'}`}>
              <img
                src={displayUser.profileImageUrl || `https://ui-avatars.com/api/?name=${displayUser.name}&background=random&color=fff`}
                alt={displayUser.name}
                className="w-full h-full object-cover object-top transform transition-transform duration-500 hover:scale-110"
              />
            </div>
            <AutoFitSingleLineText text={displayUser.name} className="mb-2" />
            {isStudent && (
              <div className="text-2xl text-gray-500 dark:text-gray-400 mb-4">
                <p>{`รหัสนักเรียน: ${displayUser.displayId}`}</p>
              </div>
            )}
            
            {isStudent && (
              <div className="flex flex-col items-center gap-2 mb-2">
                <span className="text-xl px-6 py-2 rounded-2xl font-black uppercase tracking-wider border bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-white border-slate-200 dark:border-slate-700">
                  {(() => {
                    let display = "นักเรียน";
                    if (displayUser.grade) {
                      const g = displayUser.grade.trim();
                      if (g.startsWith('ม.')) display += `ชั้นมัธยมศึกษาปีที่ ${g.substring(2).trim()}`;
                      else if (g.startsWith('ป.')) display += `ชั้นประถมศึกษาปีที่ ${g.substring(2).trim()}`;
                      else display += ` ${g}`;
                      
                      if (displayUser.room) {
                        display += `/${displayUser.room}`;
                      }
                    }
                    return display;
                  })()}
                </span>
              </div>
            )}
            <div className={`${isCompact ? 'mt-3 space-y-2 text-base' : 'mt-8 space-y-4 text-xl'}`}>
              {checkinTime && (
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center gap-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-6 py-3 rounded-full"
                >
                  <span>ลงเวลาเข้า:</span>
                  <span className="font-bold">{checkinTime}</span>
                </motion.div>
              )}
              {checkoutTime && (
                <motion.div
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center gap-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-6 py-3 rounded-full"
                >
                  <span>ลงเวลาออก:</span>
                  <span className="font-bold">{checkoutTime}</span>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <div className={`${isCompact ? 'w-40 h-40' : 'w-72 h-72 2xl:w-80 2xl:h-80'} rounded-[1.75rem] border-[6px] border-dashed border-gray-300 dark:border-gray-700 bg-[#f0f2f6] dark:bg-gray-800/50 flex items-center justify-center ${isCompact ? 'mb-3' : 'mb-8'} mx-auto`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`${isCompact ? 'h-14 w-14' : 'h-24 w-24'} text-gray-400 dark:text-gray-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-4xl font-extrabold text-gray-400 dark:text-gray-500">รอการลงเวลา...</h2>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserInfoPanel;
