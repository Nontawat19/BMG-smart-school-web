import React from 'react';

interface ProfileAvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  className?: string;
  imageClassName?: string;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  src,
  alt = '',
  className = 'h-10 w-10',
  imageClassName = '',
  ...imgProps
}) => (
  <div className={`shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 ${className}`}>
    <img
      src={src}
      alt={alt}
      {...imgProps}
      className={`h-full w-full object-cover object-[center_20%] ${imageClassName}`}
    />
  </div>
);

export default ProfileAvatar;
