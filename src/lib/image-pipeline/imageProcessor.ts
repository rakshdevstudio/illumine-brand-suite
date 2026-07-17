import { ProcessedImage, ProcessingOptions } from "./types";

const DEFAULT_MAX_WIDTH = 2000;
const DEFAULT_QUALITY = 0.82;

/**
 * Loads a File into an HTMLImageElement
 */
const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    
    img.src = url;
  });
};

/**
 * Processes an image using the Canvas API.
 * This performs:
 * 1. Resizing (if width > maxWidth and preserveOriginalSize is false)
 * 2. EXIF data stripping (inherent to drawing on canvas)
 * 3. WebP conversion
 * 4. Compression
 */
export async function processImage(
  file: File,
  options: ProcessingOptions = {}
): Promise<ProcessedImage> {
  const maxWidth = options.maxWidth || DEFAULT_MAX_WIDTH;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const preserveOriginalSize = options.preserveOriginalSize || false;

  const img = await loadImage(file);
  
  let targetWidth = img.width;
  let targetHeight = img.height;

  // Calculate new dimensions while preserving aspect ratio
  if (!preserveOriginalSize && targetWidth > maxWidth) {
    const ratio = maxWidth / targetWidth;
    targetWidth = maxWidth;
    targetHeight = Math.round(targetHeight * ratio);
  }

  // Set up canvas
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2d canvas context");
  }

  // Draw image to canvas (this also strips EXIF data)
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Convert to WebP blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob failed"));
          return;
        }
        
        resolve({
          blob,
          width: targetWidth,
          height: targetHeight,
          originalSize: file.size,
          processedSize: blob.size,
        });
      },
      "image/webp",
      quality
    );
  });
}
