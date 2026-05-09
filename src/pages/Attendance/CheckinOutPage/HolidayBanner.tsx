import React from 'react';
import { CalendarOff, Sparkles, School } from 'lucide-react';

interface HolidayBannerProps {
  calendarEvents: Record<string, any>;
  getTodayString: () => string;
}

const HolidayBanner: React.FC<HolidayBannerProps> = ({ calendarEvents, getTodayString }) => {
  const todayStr = getTodayString();
  const todayEvent = calendarEvents[todayStr];
  const dayOfWeek = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' });
  const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';

  if (todayEvent?.type === 'specialHoliday') {
    return (
      <div className="mt-6 animate-[fadeIn_0.5s_ease-out] relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/90 to-orange-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl animate-pulse"></div>
        <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
          <div className="flex-shrink-0">
            <Sparkles className="w-6 h-6 text-white opacity-90 animate-bounce" />
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
              {todayEvent.description}
            </h3>
            <p className="text-amber-100 text-sm font-medium opacity-90">วันหยุดกรณีพิเศษ</p>
          </div>
        </div>
      </div>
    );
  } else if (todayEvent?.type === 'holiday') {
    return (
      <div className="mt-6 animate-[fadeIn_0.5s_ease-out] relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500/90 to-rose-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl animate-pulse"></div>
        <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
          <div className="flex-shrink-0">
            <CalendarOff className="w-6 h-6 text-white opacity-90 animate-bounce" />
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
              {todayEvent.description}
            </h3>
            <p className="text-red-100 text-sm font-medium opacity-90">วันหยุดราชการ</p>
          </div>
        </div>
      </div>
    );
  } else if (todayEvent?.type === 'schoolDay' && todayEvent.description) {
    return (
      <div className="mt-6 animate-[fadeIn_0.5s_ease-out] relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500/90 to-indigo-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl animate-pulse"></div>
        <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
          <div className="flex-shrink-0">
            <School className="w-6 h-6 text-white opacity-90" />
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
              {todayEvent.description}
            </h3>
            <p className="text-blue-100 text-sm font-medium opacity-90">กิจกรรม / เรียนชดเชย</p>
          </div>
        </div>
      </div>
    );
  } else if (isWeekend && todayEvent?.type !== 'schoolDay') {
    return (
      <div className="mt-6 animate-[fadeIn_0.5s_ease-out] relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/90 to-orange-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl animate-pulse"></div>
        <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
          <div className="flex-shrink-0">
            <Sparkles className="w-6 h-6 text-white opacity-90 animate-bounce" />
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
              วันหยุดประจำสัปดาห์ ({dayOfWeek === 'Sat' ? 'วันเสาร์' : 'วันอาทิตย์'})
            </h3>
            <p className="text-amber-100 text-sm font-medium opacity-90">วันหยุดราชการประจำสัปดาห์</p>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default HolidayBanner;