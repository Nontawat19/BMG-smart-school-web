import React, { useEffect, useState } from 'react';
import { FaArrowDown, FaSpinner } from 'react-icons/fa';

interface PullToRefreshProps {
  children: React.ReactNode;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ children }) => {
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const threshold = 100; // ระยะพิกเซลที่ต้องดึงเพื่อรีโหลด

  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let startYPos = 0;
    let isActive = false;

    const handleTouchStart = (e: TouchEvent) => {
      // เริ่มจับเมื่ออยู่ที่บนสุดของหน้าจอ และไม่มีการ Refresh อยู่
      if (window.scrollY === 0 && !refreshing) {
        startYPos = e.touches[0].clientY;
        isActive = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isActive || refreshing) return;

      const touchY = e.touches[0].clientY;
      const diff = touchY - startYPos;

      // ทำงานเมื่อลากลงเท่านั้น
      if (diff > 0 && window.scrollY === 0) {
        const pull = Math.min(diff * 0.4, 180);
        setCurrentY(pull);
        setIsDragging(true);

        // ป้องกันการ scroll ปกติของ Browser
        if (pull > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else if (diff < 0) {
        // ถ้าลากขึ้น ให้รีเซ็ต
        isActive = false;
        setCurrentY(0);
        setIsDragging(false);
      }
    };

    const handleTouchEnd = () => {
      if (!isActive) return;

      if (currentY > threshold) {
        setRefreshing(true);
        setCurrentY(threshold);
        // ยกเลิกการรีโหลดหน้าเว็บแบบ Hard Reload ตามคำขอของผู้ใช้
        setTimeout(() => {
          setRefreshing(false);
          setCurrentY(0);
        }, 1000);
      } else {
        setCurrentY(0);
      }

      startYPos = 0;
      isActive = false;
      setIsDragging(false);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [refreshing, currentY, threshold]);

  return (
    <div className="relative min-h-screen bg-[#f9fafb] dark:bg-[#1e1f21] transition-colors duration-300 flex flex-col">
      {/* Refresh Indicator */}
      <div
        className="fixed top-0 left-0 w-full flex justify-center pointer-events-none z-[100]"
        style={{
          transform: `translateY(${currentY > 0 ? currentY - 40 : -100}px)`,
          opacity: currentY > 0 ? 1 : 0,
          transition: refreshing ? 'transform 0.3s ease' : 'none'
        }}
      >
        <div className="bg-white dark:bg-[#2a2b2f] rounded-full p-3 shadow-lg border border-gray-100 dark:border-gray-700 flex items-center justify-center">
          {refreshing ? (
            <FaSpinner className="animate-spin text-indigo-600 dark:text-indigo-400 text-xl" />
          ) : (
            <FaArrowDown
              className="text-indigo-600 dark:text-indigo-400 text-xl transition-transform duration-200"
              style={{ transform: `rotate(${currentY > threshold ? 180 : 0}deg)` }}
            />
          )}
        </div>
      </div>

      {/* Main Content Wrapper */}
      <div
        className="flex-1 flex flex-col"
        style={{
          transform: currentY > 0 ? `translateY(${currentY}px)` : undefined,
          transition: refreshing ? 'transform 0.3s ease' : 'transform 0.2s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;