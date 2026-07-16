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

export async function uploadProductImage(storagePath: string, file: File) {
  const formData = new FormData();
  formData.append("action", "upload");
  formData.append("storagePath", storagePath);
  formData.append("file", file);

  const { data, error } = await supabase.functions.invoke(IMAGE_STORAGE_FUNCTION, {
    body: formData,
    headers: await buildAuthHeaders(),
  });

  if (error) throw error;

  return {
    storagePath: String(data?.storagePath ?? storagePath),
    publicUrl: String(data?.publicUrl ?? getImageUrl(storagePath)),
  };
}

export async function deleteProductImage(storagePath: string) {
  const { error } = await supabase.functions.invoke(IMAGE_STORAGE_FUNCTION, {
    body: {
      action: "delete",
      storagePath,
    },
    headers: await buildAuthHeaders(),
  });

  if (error) throw error;
}

export function getImageUrl(storagePath: string) {
  const normalizedPath = String(storagePath ?? "").replace(/^\/+/, "");
  if (!R2_PUBLIC_URL) {
    return normalizedPath;
  }
  return `${R2_PUBLIC_URL}/${normalizedPath}`;
}
