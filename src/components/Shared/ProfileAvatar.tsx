import React from 'react';

interface ProfileAvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  thumbSrc?: string;
  className?: string;
  imageClassName?: string;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  src,
  thumbSrc,
  alt = '',
  className = 'h-10 w-10',
  imageClassName = '',
  loading = 'lazy',
  ...imgProps
}) => (
  <div className={`${className} aspect-square shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700`}>
    <img
      src={thumbSrc || src}
      alt={alt}
      loading={loading}
      {...imgProps}
      className={`h-full w-full rounded-full object-cover object-[center_20%] ${imageClassName}`}
    />
  </div>
);

export default ProfileAvatar;
