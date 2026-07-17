import { ValidationResult } from "./types";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/gif",
]);

/**
 * Validates a file before it enters the image processing pipeline.
 * Ensures it's a valid image type and within size limits.
 */
export function validateFile(file: File): ValidationResult {
  if (!(file instanceof File)) {
    return { valid: false, error: "Invalid file object" };
  }

  // 1. Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 20MB.`,
    };
  }

  // 2. Check basic type
  if (!file.type.startsWith("image/")) {
    return {
      valid: false,
      error: `File type "${file.type || "unknown"}" is not supported. Please upload an image.`,
    };
  }

  // 3. Check allowed mime types
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    // Specifically handle HEIC with a helpful message
    if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
      return {
        valid: false,
        error: "HEIC images are not natively supported in all browsers. Please convert to JPEG or PNG before uploading.",
      };
    }

    return {
      valid: false,
      error: `Image format "${file.type}" is not supported. Allowed formats: JPEG, PNG, WebP, GIF, BMP, TIFF.`,
    };
  }

  return { valid: true };
}
