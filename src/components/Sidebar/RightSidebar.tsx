import React from "react";

const RightSidebar: React.FC = () => {
  return (
    <aside className="w-[280px] fixed top-[60px] right-0 h-[calc(100vh-60px)] bg-white dark:bg-[#18191a] text-gray-900 dark:text-[#e4e6eb] p-5 overflow-y-auto hidden xl:block border-l border-gray-200 dark:border-none scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-gray-100 dark:scrollbar-track-gray-900">
      {/* โฆษณา */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold mb-3 text-gray-500 dark:text-gray-400">โฆษณา</h4>
        <div className="space-y-3">
          <img
            src="https://placehold.co/240x120/374151/9ca3af?text=Ad+Space"
            alt="ad"
            className="w-full rounded-md shadow"
          />
          <img
            src="https://placehold.co/240x120/374151/9ca3af?text=Ad+Space"
            alt="ad"
            className="w-full rounded-md shadow"
          />
        </div>
      </div>

      {/* วันเกิด */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold mb-2 text-gray-500 dark:text-gray-400">วันเกิด</h4>
        <p className="text-sm leading-relaxed">
          วันนี้เป็นวันเกิดของ <strong>MarTae Phuengpheng</strong> 🎂
        </p>
      </div>

      {/* ผู้ติดต่อ */}
      <div>
        <h4 className="text-lg font-semibold mb-2 text-gray-500 dark:text-gray-400">ผู้ติดต่อ</h4>
        <ul className="space-y-1 text-sm">
          <li>Thanakorn Rawi</li>
          <li>Kit Ti</li>
          <li>Phakphum TN</li>
        </ul>
      </div>
    </aside>
  );
};

export default RightSidebar;
