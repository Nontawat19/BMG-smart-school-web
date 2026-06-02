import React from 'react';

interface SearchPanelProps {
  handleSearch: (e: React.FormEvent) => void;
  searchId: string;
  setSearchId: (id: string) => void;
  error: string | null;
  currentTime: string;
  calendarEvents: Record<string, any>;
  getTodayString: () => string;
  studentLateTime: string;
  studentCheckoutTime: string;
  teacherLateTime: string;
  teacherCheckoutTime: string;
  canScanStudents?: boolean;
  canScanTeachers?: boolean;
  hideInput?: boolean;
  className?: string;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
  handleSearch,
  searchId,
  setSearchId,
  error,
  currentTime,
  calendarEvents,
  getTodayString,
  studentLateTime,
  studentCheckoutTime,
  teacherLateTime,
  teacherCheckoutTime,
  canScanStudents = true,
  canScanTeachers = true,
  hideInput = false,
  className = "lg:col-span-3",
}) => {
  const todayStr = getTodayString();
  const todayEvent = calendarEvents[todayStr];
  const dayOfWeek = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' });
  const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
  const isHoliday = (todayEvent?.type === 'specialHoliday') ||
    (todayEvent?.type === 'holiday') ||
    (isWeekend && todayEvent?.type !== 'schoolDay');

  return (
    <div className={`${className} bg-[#fafbfc] dark:bg-[#2a2b2f] rounded-3xl p-10 text-gray-900 dark:text-white flex flex-col justify-center shadow-sm dark:shadow-none h-full border border-gray-200/50 dark:border-none`}>
      <div className="flex-grow flex flex-col justify-evenly gap-8">
        {!hideInput && (
          <form onSubmit={handleSearch}>
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="แตะบัตร RFID หรือกรอกรหัสเพื่อลงเวลา"
              className="w-full bg-[#f0f2f6] dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-2xl px-8 py-5 text-2xl text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-xl"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </form>
        )}

        {!hideInput && (
          <div className="text-center">
            <p className="text-6xl 2xl:text-7xl font-black text-gray-900 dark:text-white tracking-tight">{currentTime}</p>
          </div>
        )}

        {!hideInput && !isHoliday && (
          <div className={`grid gap-10 pt-8 border-t border-gray-100 dark:border-gray-700 ${canScanStudents && canScanTeachers ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 text-center'}`}>
            {canScanStudents && (
              <div className="text-center">
                <p className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-3">นักเรียน</p>
                <div className="flex justify-center gap-6 text-xl">
                  <div>
                    <span className="block text-xs text-gray-400 uppercase tracking-widest mb-1">เข้าสาย</span>
                    <span className="font-bold text-3xl text-indigo-600 dark:text-indigo-400">{studentLateTime}</span>
                  </div>
                  <div className="w-0.5 bg-gray-200 dark:bg-gray-700 h-12 self-center"></div>
                  <div>
                    <span className="block text-xs text-gray-400 uppercase tracking-widest mb-1">เลิกเรียน</span>
                    <span className="font-bold text-3xl text-indigo-600 dark:text-indigo-400">{studentCheckoutTime}</span>
                  </div>
                </div>
              </div>
            )}
            {canScanTeachers && (
              <div className="text-center">
                <p className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-3">ครู/บุคลากร</p>
                <div className="flex justify-center gap-6 text-xl">
                  <div>
                    <span className="block text-xs text-gray-400 uppercase tracking-widest mb-1">เข้าสาย</span>
                    <span className="font-bold text-3xl text-emerald-600 dark:text-emerald-400">{teacherLateTime}</span>
                  </div>
                  <div className="w-0.5 bg-gray-200 dark:bg-gray-700 h-12 self-center"></div>
                  <div>
                    <span className="block text-xs text-gray-400 uppercase tracking-widest mb-1">เลิกงาน</span>
                    <span className="font-bold text-3xl text-emerald-600 dark:text-emerald-400">{teacherCheckoutTime}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;
