export type ImageCategory =
  | "products"
  | "schools"
  | "collections"
  | "banners"
  | "logos"
  | "misc";

export interface ProcessingOptions {
  /** Maximum width of the output image in pixels. Default: 2000 */
  maxWidth?: number;
  /** Quality of the WebP compression (0.0 to 1.0). Default: 0.82 */
  quality?: number;
  /** If true, skip resizing and just convert to WebP. Default: false */
  preserveOriginalSize?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
}

export interface UploadResult {
  storagePath: string;
  publicUrl: string;
}

export type UploadStage = "idle" | "validating" | "processing" | "uploading" | "done" | "error";

export interface UploadProgress {
  stage: UploadStage;
  progress?: number;
  message?: string;
}

export type ProgressCallback = (progress: UploadProgress) => void;
