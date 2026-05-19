import { motion, AnimatePresence } from 'framer-motion';
import { FoundUser } from './types';

interface LatestUsersProps {
  latestUsers: FoundUser[];
}

const LatestUsers: React.FC<LatestUsersProps & { vertical?: boolean }> = ({ latestUsers, vertical = false }) => {
  return (
    <div className={`bg-[#fafbfc] dark:bg-[#2a2b2f] rounded-3xl p-6 text-gray-900 dark:text-white shadow-sm dark:shadow-none overflow-hidden border border-gray-200/50 dark:border-none ${vertical ? 'h-full flex flex-col' : ''}`}>
      <h2 className="text-2xl font-extrabold mb-4 text-gray-900 dark:text-white flex items-center gap-3">
        <span className="w-3 h-10 bg-indigo-500 rounded-full"></span>
        ผู้ลงเวลาล่าสุด
      </h2>

      {latestUsers.length > 0 ? (
        <div className={`${vertical ? 'flex flex-col space-y-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar' : 'flex justify-center overflow-x-auto space-x-4 pb-4 -mx-6 px-6'}`}>
          <AnimatePresence initial={false}>
            {latestUsers.slice(0, 5).map((user, index) => (
              <motion.div
                key={`${user.id}-${user.latestActionTime}`}
                layout
                initial={{ opacity: 0, y: -50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{
                  duration: 0.4,
                  type: "spring",
                  stiffness: 260,
                  damping: 20
                }}
                className={`${vertical ? 'w-full transform transition-all duration-200 hover:bg-[#f0f2f6] dark:hover:bg-gray-800 rounded-xl' : 'flex-shrink-0 w-40 text-center transform transition-transform duration-200 hover:-translate-y-1'}`}
              >
                <div className={`bg-[#f0f2f6] dark:bg-[#1e1f21] rounded-[1.5rem] p-4 shadow-sm border border-gray-200/50 dark:border-gray-700/50 flex ${vertical ? 'flex-row items-center gap-4 text-left' : 'flex-col items-center h-full'}`}>
                  <div className="relative flex-shrink-0">
                    <img
                      src={user.profileImageUrl || `https://ui-avatars.com/api/?name=${user.name}&background=random&color=fff`}
                      className={`${vertical ? 'w-24 h-24' : 'w-24 h-24'} rounded-[1rem] border-2 object-cover ${user.status === 'มา' ? 'border-green-500 shadow-lg shadow-green-500/20' :
                        user.status === 'สาย' ? 'border-yellow-500 shadow-lg shadow-yellow-500/20' :
                          user.status === 'ล' ? 'border-blue-500 shadow-lg shadow-blue-500/20' :
                            user.status === 'กลับก่อน' ? 'border-orange-500 shadow-lg shadow-orange-500/20' :
                              'border-gray-300 dark:border-gray-600'
                        }`}
                      alt={user.name}
                    />
                    <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-lg border-[3px] border-white dark:border-[#1e1f21] flex items-center justify-center text-[8px] text-white
                    ${user.status === 'มา' ? 'bg-green-500' :
                        user.status === 'สาย' ? 'bg-yellow-500' :
                          user.status === 'ล' ? 'bg-blue-500' :
                            user.status === 'กลับก่อน' ? 'bg-orange-500' : 'bg-gray-400'
                      }`}
                    >
                      {/* Status Dot */}
                    </div>
                  </div>

                  <div className={`${vertical ? 'flex-grow min-w-0' : 'w-full mt-4'}`}>
                    <h3 className={`font-black tracking-tight truncate text-gray-900 dark:text-white ${vertical ? 'text-xl mb-1' : 'text-xl'}`} title={user.name}>{user.name}</h3>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider border ${user.type === "student" ? "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-white border-slate-200 dark:border-slate-700" : "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-white border-emerald-100 dark:border-emerald-800"}`}>
                          {(() => {
                            if (user.type !== "student") {
                              if (user.grade) {
                                const g = user.grade.trim();
                                let formattedGrade = "";
                                if (g.startsWith('ม.') || g.startsWith('ป.')) {
                                  formattedGrade = g;
                                } else {
                                  const num = g.replace(/[^0-9]/g, '');
                                  formattedGrade = num ? `ม.${num}` : g;
                                }
                                return `ครูประจำชั้น ${formattedGrade}${user.room ? `/${user.room}` : ""}`;
                              }
                              return user.position || "ครู";
                            }
                            
                            let display = "นักเรียน";
                            if (user.grade) {
                              const g = user.grade.trim();
                              if (g.startsWith('ม.')) display += `ชั้นมัธยมศึกษาปีที่ ${g.substring(2).trim()}`;
                              else if (g.startsWith('ป.')) display += `ชั้นประถมศึกษาปีที่ ${g.substring(2).trim()}`;
                              else display += ` ${g}`;
                              
                              if (user.room) {
                                display += `/${user.room}`;
                              }
                            }
                            return display;
                          })()}
                        </span>
                      </div>
                      <span className="text-lg text-slate-500 dark:text-white font-mono font-black">
                        {user.latestActionTime}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <style>{`
            /* Hide scrollbar for Chrome, Safari and Opera */
            .custom-scrollbar::-webkit-scrollbar {
              display: none;
            }
            /* Hide scrollbar for IE, Edge and Firefox */
            .custom-scrollbar {
              -ms-overflow-style: none;  /* IE and Edge */
              scrollbar-width: none;  /* Firefox */
            }
            .dark .custom-scrollbar::-webkit-scrollbar-thumb {
              background-color: transparent;
            }
            .overflow-x-auto::-webkit-scrollbar {
              height: 8px;
            }
            .overflow-x-auto::-webkit-scrollbar-thumb {
              background-color: #4a5568;
              border-radius: 4px;
            }
          `}</style>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center opacity-50">
          <div className="w-16 h-16 bg-[#edf0f4] dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">รอข้อมูลการลงเวลา...</p>
        </div>
      )}
    </div>
  );
};

export default LatestUsers;