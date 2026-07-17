import { validateFile } from "./validation";
import { processImage } from "./imageProcessor";
import { uploadToR2, deleteFromR2 as rawDeleteFromR2 } from "./r2Storage";
import { ImageCategory, ProcessingOptions, ProgressCallback, UploadResult } from "./types";
import { logger } from "@/lib/logger";

interface UploadOptions extends ProcessingOptions {
  category: ImageCategory;
  /** Sub-folder path to organize the image (e.g., "school_slug/product_id") */
  folder: string;
  onProgress?: ProgressCallback;
}

/**
 * Generates a collision-resistant filename
 */
const generateFilename = (originalName: string): string => {
  // Convert "My Photo.jpg" -> "my-photo"
  const slug = originalName
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const uuidPart = crypto.randomUUID().split("-")[0];
  const timestamp = Date.now();
  
  const baseName = slug ? `${slug}-` : "image-";
  return `${baseName}${uuidPart}-${timestamp}.webp`;
};

/**
 * Single entry point for all image uploads.
 * Orchestrates validation, processing, and uploading.
 */
export async function uploadImage(
  file: File,
  options: UploadOptions
): Promise<UploadResult> {
  const { category, folder, onProgress, ...processingOptions } = options;

  try {
    // 1. Validation
    onProgress?.({ stage: "validating", message: "Validating file..." });
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid file");
    }

    // 2. Processing (resize, WebP, etc.)
    onProgress?.({ stage: "processing", message: "Optimizing image..." });
    const processed = await processImage(file, processingOptions);
    
    logger.info("Image processed successfully", {
      originalSize: processed.originalSize,
      processedSize: processed.processedSize,
      savings: `${(100 - (processed.processedSize / processed.originalSize) * 100).toFixed(1)}%`,
    });

    // 3. Uploading
    onProgress?.({ stage: "uploading", message: "Uploading to storage..." });
    const fileName = generateFilename(file.name);
    
    // Clean up folder path (remove leading/trailing slashes)
    const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
    const storagePath = `${category}/${cleanFolder}/${fileName}`;
    
    const result = await uploadToR2(storagePath, processed.blob);

    // 4. Done
    onProgress?.({ stage: "done", message: "Upload complete" });
    return result;

  } catch (error) {
    onProgress?.({ 
      stage: "error", 
      message: error instanceof Error ? error.message : "Upload failed" 
    });
    throw error;
  }
}

/**
 * Deletes an image from storage
 */
export async function deleteImage(storagePath: string): Promise<void> {
  try {
    await rawDeleteFromR2(storagePath);
  } catch (error) {
    logger.error("Failed to delete image", error);
    throw error;
  }
}
