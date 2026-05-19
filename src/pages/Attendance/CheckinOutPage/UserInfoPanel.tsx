import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FoundUser } from './types';

interface UserInfoPanelProps {
  displayUser: FoundUser | null;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  affiliation?: string;
}

const UserInfoPanel: React.FC<UserInfoPanelProps> = ({ displayUser, checkinTime, checkoutTime, affiliation }) => {
  return (
    <div className="lg:col-span-2 bg-[#fafbfc] dark:bg-[#2a2b2f] rounded-3xl p-10 text-gray-900 dark:text-white flex flex-col items-center justify-center text-center shadow-sm dark:shadow-none h-full overflow-hidden relative border border-gray-200/50 dark:border-none">
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
            <div className="w-72 h-72 rounded-[3rem] border-[8px] border-[#fafbfc] dark:border-[#323338] shadow-2xl overflow-hidden ring-4 ring-gray-100 dark:ring-gray-700 mx-auto mb-8">
              <img
                src={displayUser.profileImageUrl || `https://ui-avatars.com/api/?name=${displayUser.name}&background=random&color=fff`}
                alt={displayUser.name}
                className="w-full h-full object-cover transform transition-transform duration-500 hover:scale-110"
              />
            </div>
            <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-2">{displayUser.name}</h2>
            <div className="text-2xl text-gray-500 dark:text-gray-400 mb-4">
              <p>{`${displayUser.type === "student" ? "รหัสนักเรียน" : "รหัสครู"}: ${displayUser.displayId}`}</p>
              {affiliation && <p className="text-lg mt-1 text-gray-400 dark:text-gray-500 font-medium">สังกัด: {affiliation}</p>}
            </div>
            
            <div className="flex flex-col items-center gap-2 mb-2">
              <span className={`text-xl px-6 py-2 rounded-2xl font-black uppercase tracking-wider border ${displayUser.type === "student" ? "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-white border-slate-200 dark:border-slate-700" : "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-white border-emerald-100 dark:border-emerald-800"}`}>
                {(() => {
                  if (displayUser.type !== "student") {
                    if (displayUser.grade) {
                      const g = displayUser.grade.trim();
                      let formattedGrade = "";
                      if (g.startsWith('ม.') || g.startsWith('ป.')) {
                        formattedGrade = g;
                      } else {
                        // If it's just a number, default to 'ม.' for secondary school context or try to preserve existing prefix
                        const num = g.replace(/[^0-9]/g, '');
                        formattedGrade = num ? `ม.${num}` : g;
                      }
                      return `ครูประจำชั้น ${formattedGrade}${displayUser.room ? `/${displayUser.room}` : ""}`;
                    }
                    return displayUser.position || "ครู";
                  }
                  
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
            <div className="mt-8 space-y-4 text-xl">
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
            <div className="w-72 h-72 rounded-[3rem] border-[8px] border-dashed border-gray-300 dark:border-gray-700 bg-[#f0f2f6] dark:bg-gray-800/50 flex items-center justify-center mb-8 mx-auto">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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