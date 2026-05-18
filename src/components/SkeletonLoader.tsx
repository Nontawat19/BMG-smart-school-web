import React from 'react';

interface SkeletonLoaderProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  variant?: 'rect' | 'circle' | 'text';
  className?: string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width,
  height,
  borderRadius,
  variant = 'rect',
  className = '',
}) => {
  const style: React.CSSProperties = {};

  if (width !== undefined) {
    style.width = width;
  }

  if (height !== undefined) {
    style.height = height;
  }

  if (borderRadius !== undefined) {
    style.borderRadius = borderRadius;
  }

  // Fallback to defaults only if no sizing is provided via props or Tailwind classes
  const hasWidthClass = /\bw-([0-9]+|full|auto|screen|\d+\/\d+)\b/.test(className);
  const hasHeightClass = /\bh-([0-9]+|full|auto|screen|\d+\/\d+)\b/.test(className);

  if (!width && !hasWidthClass) {
    style.width = '100%';
  }

  if (!height && !hasHeightClass) {
    style.height = variant === 'text' ? '1rem' : '100%';
  }

  // Premium background base and animations
  const baseClasses = 'bg-gray-200/80 dark:bg-gray-700/60 animate-pulse';

  // Determine shape from variant if not explicitly provided in className
  let shapeClass = '';
  if (!className.includes('rounded')) {
    if (variant === 'circle') shapeClass = 'rounded-full';
    else if (variant === 'text') shapeClass = 'rounded';
    else shapeClass = 'rounded-xl'; // Slightly more rounded for premium rects
  }

  return (
    <div
      style={Object.keys(style).length > 0 ? style : undefined}
      className={`${baseClasses} ${shapeClass} ${className}`.trim()}
    />
  );
};

export default SkeletonLoader;
