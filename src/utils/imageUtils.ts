export const compressImage = (
  file: File,
  maxWidth: number = 800,
  quality: number = 0.8,
  outputFormat: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/webp'
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context is null'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            // Change extension based on format
            const extMap = {
              'image/jpeg': 'jpg',
              'image/png': 'png',
              'image/webp': 'webp'
            };
            const ext = extMap[outputFormat] || 'jpg';
            const newName = file.name.substring(0, file.name.lastIndexOf('.')) + '.' + ext;

            const newFile = new File([blob], newName, {
              type: outputFormat,
              lastModified: Date.now(),
            });
            resolve(newFile);
          } else {
            reject(new Error('Canvas to Blob failed'));
          }
        }, outputFormat, quality);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};