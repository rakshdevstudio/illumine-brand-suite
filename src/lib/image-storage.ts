/**
 * @deprecated Use @/lib/image-pipeline instead.
 * This file is kept only for backward compatibility for any remaining imports.
 */
import { uploadImage, deleteImage, getPublicUrl as getPipelineUrl } from "./image-pipeline";

export async function uploadProductImage(storagePath: string, file: File) {
  const parts = storagePath.split("/");
  // Heuristic: products/schoolSlug/productId/filename or just schoolSlug/productId/filename
  // Since this is deprecated, we try to preserve the existing behavior as much as possible
  
  const result = await uploadImage(file, {
    category: "products",
    folder: parts.slice(0, -1).join("/"),
  });
  
  return {
    storagePath: result.storagePath,
    publicUrl: result.publicUrl,
  };
}

export async function deleteProductImage(storagePath: string) {
  return deleteImage(storagePath);
}

export function getImageUrl(storagePath: string) {
  return getPipelineUrl(storagePath);
}
