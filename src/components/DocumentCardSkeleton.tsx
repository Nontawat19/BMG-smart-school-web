import React from 'react';
import SkeletonLoader from './SkeletonLoader';

const DocumentCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Preview Skeleton */}
        <div className="flex-shrink-0 w-full md:w-32 h-44">
          <SkeletonLoader height="100%" className="rounded-xl" />
        </div>

        {/* Info Skeleton */}
        <div className="flex-1 space-y-4">
          <div className="flex justify-between items-start gap-2">
            <SkeletonLoader width="70%" height="1.75rem" />
            <SkeletonLoader width="80px" height="1.25rem" className="rounded-full" />
          </div>
          
          <div className="flex flex-wrap gap-4">
            <SkeletonLoader width="100px" height="0.875rem" />
            <SkeletonLoader width="120px" height="0.875rem" />
          </div>

          <div className="pt-4 border-t border-gray-50 dark:border-gray-700/50 flex flex-col gap-3">
            <SkeletonLoader width="80%" height="1rem" />
            <SkeletonLoader width="60%" height="1rem" />
          </div>

          <div className="mt-3">
            <SkeletonLoader width="90%" height="3rem" className="rounded-xl" />
          </div>
        </div>

        {/* Button Skeleton */}
        <div className="flex items-end">
          <SkeletonLoader width="140px" height="48px" className="rounded-xl" />
        </div>
      </div>
    </div>
  );
};

export default DocumentCardSkeleton;