import { supabase } from "@/integrations/supabase/client";

type ProductLifecycleInput = {
  productId: string;
};

const getAuthenticatedAdminUser = async () => {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("Authenticated admin user is required");
  }

  return data.user;
};

const ensureProfileExists = async (userId: string) => {
  const { error } = await supabase.from("profiles").upsert(
    { id: userId },
    { onConflict: "id" }
  );

  if (error) {
    console.error("Failed to ensure profile exists for lifecycle logging:", error);
    throw error;
  }
};

const ensureLifecycleActivityLogged = async ({
  actionType,
  productId,
  actorId,
  description,
}: {
  actionType: string;
  productId: string;
  actorId: string;
  description: string;
}) => {
  const fiveSecondsAgo = new Date(Date.now() - 5_000).toISOString();
  const { data: existing, error } = await supabase
    .from("activity_logs")
    .select("id, performed_by")
    .eq("action_type", actionType)
    .eq("entity_type", "product")
    .eq("entity_id", productId)
    .gte("created_at", fiveSecondsAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to verify lifecycle activity log:", error);
  }

  if (existing) {
    if (existing.performed_by !== actorId) {
      const { error: updateError } = await supabase
        .from("activity_logs")
        .update({ performed_by: actorId })
        .eq("id", existing.id);

      if (updateError) {
        console.error("Failed to backfill lifecycle activity log actor:", updateError);
        throw updateError;
      }
    }

    return;
  }

  await ensureProfileExists(actorId);

  const { error: insertError } = await supabase.from("activity_logs").insert({
    action_type: actionType,
    entity_type: "product",
    entity_id: productId,
    description,
    performed_by: actorId,
  });

  if (insertError) {
    console.error("Failed to insert fallback lifecycle activity log:", insertError);
    throw insertError;
  }
};

export const archiveProduct = async ({ productId }: ProductLifecycleInput) => {
  const user = await getAuthenticatedAdminUser();
  console.log("RPC START", { productId, action: "ARCHIVE", actorId: user.id });
  const client = supabase as any;
  const response = await client.rpc("archive_product_cascade", {
    p_product_id: productId,
    p_deleted_at: new Date().toISOString(),
    p_deleted_by: user.id,
  });
  console.log("RPC RESULT", response);
  if (response.error) {
    console.error("RPC ERROR", response.error);
    throw response.error;
  }
  await ensureLifecycleActivityLogged({
    actionType: "ARCHIVE",
    productId,
    actorId: user.id,
    description: "Product archived",
  });
  return response.data;
};

export const restoreProduct = async ({ productId }: ProductLifecycleInput) => {
  const user = await getAuthenticatedAdminUser();
  console.log("RPC START", { productId, action: "RESTORE", actorId: user.id });
  const client = supabase as any;
  const response = await client.rpc("restore_product_cascade", {
    p_product_id: productId,
    p_actor: user.id,
  });
  console.log("RPC RESULT", response);
  if (response.error) {
    console.error("RPC ERROR", response.error);
    throw response.error;
  }
  await ensureLifecycleActivityLogged({
    actionType: "RESTORE",
    productId,
    actorId: user.id,
    description: "Product restored",
  });
  return response.data;
};

export const hardDeleteProduct = async ({ productId }: ProductLifecycleInput) => {
  const user = await getAuthenticatedAdminUser();
  console.log("RPC START", { productId, action: "HARD_DELETE", actorId: user.id });
  const client = supabase as any;
  const response = await client.rpc("hard_delete_product_cascade", {
    p_product_id: productId,
    p_actor: user.id,
  });
  console.log("RPC RESULT", response);
  if (response.error) {
    console.error("RPC ERROR", response.error);
    throw response.error;
  }
  await ensureLifecycleActivityLogged({
    actionType: "HARD_DELETE",
    productId,
    actorId: user.id,
    description: "Product permanently deleted",
  });
  return response.data;
};
