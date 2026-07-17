import { supabase } from "@/integrations/supabase/client";

const R2_PUBLIC_URL = String(import.meta.env.R2_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
const IMAGE_STORAGE_FUNCTION = "product-image-storage";

const buildAuthHeaders = async () => {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  return accessToken
    ? {
        Authorization: `Bearer ${accessToken}`,
      }
    : undefined;
};

/**
 * Uploads a WebP blob to Cloudflare R2 via the edge function
 */
export async function uploadToR2(storagePath: string, blob: Blob): Promise<{ storagePath: string; publicUrl: string }> {
  const formData = new FormData();
  formData.append("action", "upload");
  formData.append("storagePath", storagePath);
  
  // We specify the filename as 'image.webp' to ensure the FormData includes it as a File
  formData.append("file", blob, "image.webp");

  const { data, error } = await supabase.functions.invoke(IMAGE_STORAGE_FUNCTION, {
    body: formData,
    headers: await buildAuthHeaders(),
  });

  if (error) throw error;

  return {
    storagePath: String(data?.storagePath ?? storagePath),
    publicUrl: String(data?.publicUrl ?? getPublicUrl(storagePath)),
  };
}

/**
 * Deletes an image from Cloudflare R2
 */
export async function deleteFromR2(storagePath: string): Promise<void> {
  const { error } = await supabase.functions.invoke(IMAGE_STORAGE_FUNCTION, {
    body: {
      action: "delete",
      storagePath,
    },
    headers: await buildAuthHeaders(),
  });

  if (error) throw error;
}

/**
 * Generates the public URL for an R2 storage path
 */
export function getPublicUrl(storagePath: string): string {
  const normalizedPath = String(storagePath ?? "").replace(/^\/+/, "");
  if (!R2_PUBLIC_URL) {
    return normalizedPath;
  }
  return `${R2_PUBLIC_URL}/${normalizedPath}`;
}
