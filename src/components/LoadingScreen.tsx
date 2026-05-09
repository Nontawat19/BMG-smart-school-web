import React from 'react';
import { FaBookOpen } from 'react-icons/fa';

const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gray-50/90 dark:bg-[#1e1f21]/95 backdrop-blur-sm transition-all duration-300">
      <div className="relative flex flex-col items-center p-8 rounded-3xl">
        
        {/* Icon with rings */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping"></div>
          <div className="relative w-24 h-24 bg-white dark:bg-[#2a2b2f] rounded-full flex items-center justify-center shadow-xl border-4 border-indigo-50 dark:border-indigo-900/50">
            <FaBookOpen className="text-4xl text-indigo-600 dark:text-indigo-400 animate-pulse" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center animate-bounce shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full"></div>
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center space-y-3">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">
            กำลังโหลดข้อมูล
          </h2>
          <div className="flex items-center justify-center gap-1">
            <span className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce"></span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
            กรุณารอสักครู่ ระบบกำลังเตรียมความพร้อม
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;