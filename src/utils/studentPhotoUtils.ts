import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let loadingPromise: Promise<boolean> | null = null;

/**
 * Loads the Tiny Face Detector and Face Landmark 68 models from `/models`.
 */
export async function loadFaceLandmarkModels(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (modelsLoaded) return true;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      ]);
      modelsLoaded = true;
      return true;
    } catch (err) {
      console.warn('Unable to load face-api models from /models:', err);
      modelsLoaded = false;
      return false;
    }
  })();

  return loadingPromise;
}

/**
 * Loads an image URL into an HTMLImageElement with crossOrigin support.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export interface SmartCropOptions {
  targetWidth?: number;
  targetHeight?: number;
}

/**
 * Analyzes facial landmarks (ears, eyes, nose, mouth, chin) using face-api
 * and crops the student photo to a standardized 3:4 official student portrait
 * (1.5-inch / official school registration regulation).
 * 
 * Guarantees:
 * - Proper headroom above the hair (never cuts off the head / "ไม่ให้หัวขาด")
 * - Centered horizontally based on facial symmetry (nose bridge, eyes, ears)
 * - Proportional upper torso/shoulders showing school uniform
 * - Smooth fallback if face detection is unavailable or no face is found
 */
export async function autoCropStudentPhoto(
  imageSrc: string,
  options: SmartCropOptions = {}
): Promise<string> {
  if (typeof window === 'undefined' || !imageSrc) return imageSrc;

  const targetW = options.targetWidth || 360;
  const targetH = options.targetHeight || 480; // 3:4 ratio

  let img: HTMLImageElement;
  try {
    img = await loadImage(imageSrc);
  } catch {
    // If CORS or fetch fails, return original src
    return imageSrc;
  }

  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (!naturalW || !naturalH) return imageSrc;

  // Try loading models if not already loaded
  const hasModels = await loadFaceLandmarkModels();

  let cropX = 0;
  let cropY = 0;
  let cropW = naturalW;
  let cropH = naturalH;
  let detected = false;

  if (hasModels) {
    try {
      const detection = await faceapi
        .detectSingleFace(
          img,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 })
        )
        .withFaceLandmarks();

      if (detection && detection.landmarks) {
        const landmarks = detection.landmarks;
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const nose = landmarks.getNose();
        const jaw = landmarks.getJawOutline(); // index 0 (left ear), 16 (right ear), 8 (chin)

        // 1. Eyes & Center
        const avgLeftEye = {
          x: leftEye.reduce((acc, p) => acc + p.x, 0) / leftEye.length,
          y: leftEye.reduce((acc, p) => acc + p.y, 0) / leftEye.length,
        };
        const avgRightEye = {
          x: rightEye.reduce((acc, p) => acc + p.x, 0) / rightEye.length,
          y: rightEye.reduce((acc, p) => acc + p.y, 0) / rightEye.length,
        };
        const eyeLevelY = (avgLeftEye.y + avgRightEye.y) / 2;
        const noseBridge = nose[0] || { x: (avgLeftEye.x + avgRightEye.x) / 2 };
        const faceCenterX = (avgLeftEye.x + avgRightEye.x + noseBridge.x) / 3;

        // 2. Chin & Face Height
        const chin = jaw[8] || { y: eyeLevelY + 100, x: faceCenterX };
        const chinY = chin.y;
        const eyeToChinDistance = Math.max(30, chinY - eyeLevelY);

        // 3. Headroom & Crown estimation:
        // Top of the hair is typically ~1.15 to 1.25 of eyeToChin above the eye level.
        // Regulations require ~10-15% headroom above the hair to ensure no clipping ("ไม่ให้หัวขาด").
        const estimatedCrownY = eyeLevelY - eyeToChinDistance * 1.2;
        const headroom = eyeToChinDistance * 0.35;
        let targetTop = estimatedCrownY - headroom;

        // 4. Chest / Shoulders (showing uniform collar and upper torso)
        // Extends down to upper chest ~1.2x eyeToChin below chin
        const chestBelowChin = eyeToChinDistance * 1.3;
        let targetBottom = chinY + chestBelowChin;

        // 5. Enforce 3:4 Aspect Ratio
        let targetHeight = targetBottom - targetTop;
        let targetWidth = targetHeight * 0.75; // 3:4

        // If targetHeight exceeds original image height, scale down
        if (targetHeight > naturalH) {
          targetHeight = naturalH;
          targetWidth = targetHeight * 0.75;
          targetTop = 0;
        }

        // Prevent top clipping: If targetTop < 0, shift down so headroom touches 0 (or at least crown is never cut)
        if (targetTop < 0) {
          targetTop = 0;
          targetBottom = targetTop + targetHeight;
        }

        // Clamp targetBottom if it exceeds image height
        if (targetBottom > naturalH) {
          targetBottom = naturalH;
          targetTop = Math.max(0, targetBottom - targetHeight);
        }

        // Calculate horizontal bounds centered on faceCenterX
        let targetLeft = faceCenterX - targetWidth / 2;
        if (targetLeft < 0) {
          targetLeft = 0;
        } else if (targetLeft + targetWidth > naturalW) {
          targetLeft = Math.max(0, naturalW - targetWidth);
        }

        cropX = targetLeft;
        cropY = targetTop;
        cropW = targetWidth;
        cropH = targetHeight;
        detected = true;
      }
    } catch (err) {
      console.warn('Face detection error during student photo smart crop:', err);
    }
  }

  // Fallback if no face detected: top-anchored 3:4 crop to preserve the head/hair
  if (!detected) {
    const idealHeightFromWidth = naturalW / 0.75;
    if (naturalH >= idealHeightFromWidth) {
      // Image is taller than 3:4: crop height, anchor at top (with slight 2% margin)
      cropW = naturalW;
      cropH = idealHeightFromWidth;
      cropX = 0;
      cropY = Math.min(naturalH - cropH, naturalH * 0.02);
    } else {
      // Image is wider than 3:4: crop width, center horizontally, anchor at top
      cropH = naturalH;
      cropW = naturalH * 0.75;
      cropX = Math.max(0, (naturalW - cropW) / 2);
      cropY = 0;
    }
  }

  // Draw into high-resolution 3:4 canvas
  try {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageSrc;

    // Optional: sample background color from top edge in case of padding
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (err) {
    console.warn('Canvas export error during smart crop:', err);
    return imageSrc;
  }
}

/**
 * Pre-processes an array of students to crop their profile images
 * according to official student photo regulations with facial landmark alignment.
 */
export async function prepareStudentsWithSmartPhotos<T extends Record<string, any>>(
  students: T[],
  onProgress?: (current: number, total: number) => void
): Promise<T[]> {
  const result: T[] = [];
  const total = students.length;

  for (let i = 0; i < total; i++) {
    const student = students[i];
    const rawPhoto = student.profileImageDataUrl || student.profileImageUrl;

    if (rawPhoto && typeof rawPhoto === 'string' && rawPhoto.startsWith('http')) {
      try {
        const croppedDataUrl = await autoCropStudentPhoto(rawPhoto);
        result.push({
          ...student,
          profileImageDataUrl: croppedDataUrl,
        });
      } catch {
        result.push(student);
      }
    } else {
      result.push(student);
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return result;
}
