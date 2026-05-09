import React from 'react';

export const ScheduleCardSkeleton = () => (
    <div className="p-5 rounded-2xl bg-white dark:bg-[#34353a] border border-gray-100 dark:border-gray-700 flex justify-between items-center animate-pulse mb-4">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700"></div>
            <div className="space-y-2">
                <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 rounded"></div>
            </div>
        </div>
        <div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 rounded-full"></div>
    </div>
);

export const StudentCardSkeleton = () => (
    <div className="rounded-2xl p-6 bg-white dark:bg-[#34353a] border border-gray-100 dark:border-gray-700 animate-pulse">
        <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700"></div>
            <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 rounded"></div>
            <div className="grid grid-cols-4 gap-2 w-full mt-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-8 bg-gray-50 dark:bg-gray-800 rounded-lg"></div>
                ))}
            </div>
        </div>
    </div>
);
