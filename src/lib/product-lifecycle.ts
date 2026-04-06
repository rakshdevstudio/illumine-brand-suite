import { supabase } from "@/integrations/supabase/client";

type ProductLifecycleInput = {
  productId: string;
  actorId: string;
};

const ensureActor = (actorId?: string | null) => {
  if (!actorId) {
    throw new Error("Authenticated admin user is required");
  }
  return actorId;
};

export const archiveProduct = async ({ productId, actorId }: ProductLifecycleInput) => {
  const response = await supabase.rpc("archive_product_cascade", {
    p_product_id: productId,
    p_deleted_at: new Date().toISOString(),
    p_deleted_by: ensureActor(actorId),
  });
  console.log("RPC response", response);
  if (response.error) throw response.error;
  return response.data;
};

export const restoreProduct = async ({ productId, actorId }: ProductLifecycleInput) => {
  const response = await supabase.rpc("restore_product_cascade", {
    p_product_id: productId,
    p_actor: ensureActor(actorId),
  });
  console.log("RPC response", response);
  if (response.error) throw response.error;
  return response.data;
};

export const hardDeleteProduct = async ({ productId, actorId }: ProductLifecycleInput) => {
  const response = await supabase.rpc("hard_delete_product_cascade", {
    p_product_id: productId,
    p_actor: ensureActor(actorId),
  });
  console.log("RPC response", response);
  if (response.error) throw response.error;
  return response.data;
};
