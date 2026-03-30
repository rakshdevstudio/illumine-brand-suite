import { supabase } from "@/integrations/supabase/client";

export type BranchInventorySnapshot = {
  branch_id: string;
  variant_id: string;
  stock: number;
};

const normalizeRows = (rows: any[]): BranchInventorySnapshot[] =>
  (rows ?? []).map((row) => ({
    branch_id: String(row.branch_id),
    variant_id: String(row.variant_id),
    stock: Number(row.stock ?? 0),
  }));

export const fetchGlobalStockByVariants = async (variantIds: string[]) => {
  if (!variantIds.length) {
    return { stockByVariant: new Map<string, number>(), rows: [] as BranchInventorySnapshot[] };
  }

  const { data, error } = await (supabase as any)
    .from("branch_inventory")
    .select("branch_id, variant_id, stock")
    .in("variant_id", variantIds);

  if (error) throw error;

  const rows = normalizeRows(data ?? []);
  const stockByVariant = new Map<string, number>();

  rows.forEach((row) => {
    stockByVariant.set(row.variant_id, (stockByVariant.get(row.variant_id) ?? 0) + row.stock);
  });

  return { stockByVariant, rows };
};

export const ensureGlobalStock = (
  stockByVariant: Map<string, number>,
  requirements: Array<{ variantId: string; quantity: number }>,
) => {
  const insufficient = requirements.filter(({ variantId, quantity }) => (stockByVariant.get(variantId) ?? 0) < quantity);
  return insufficient;
};

export const deductStockAcrossBranches = async (
  variantId: string,
  productId: string,
  quantity: number,
  orderId?: string,
) => {
  if (quantity <= 0) return;

  const { data, error } = await (supabase as any)
    .from("branch_inventory")
    .select("branch_id, variant_id, stock")
    .eq("variant_id", variantId)
    .order("stock", { ascending: false });

  if (error) throw error;

  const rows = normalizeRows(data ?? []);
  const total = rows.reduce((sum, row) => sum + row.stock, 0);
  if (total < quantity) {
    throw new Error("Insufficient global stock for variant");
  }

  let remaining = quantity;

  for (const row of rows) {
    if (remaining <= 0) break;
    const available = Math.max(0, row.stock);
    if (available === 0) continue;

    const toDeduct = Math.min(remaining, available);
    const { data: movementData, error: movementError } = await (supabase as any).rpc("apply_inventory_movement", {
      p_branch_id: row.branch_id,
      p_variant_id: variantId,
      p_type: "OUT",
      p_quantity: toDeduct,
      p_reference_type: "ORDER",
      p_reference_id: orderId ?? null,
      p_reason: "Global checkout deduction",
    });

    if (movementError) throw movementError;

    const beforeStock = Number(movementData?.before_stock ?? row.stock);
    const afterStock = Number(movementData?.after_stock ?? Math.max(0, beforeStock - toDeduct));

    await supabase.from("inventory_logs").insert({
      product_id: productId,
      variant_id: variantId,
      change_type: "order",
      quantity_change: -toDeduct,
      previous_stock: beforeStock,
      new_stock: afterStock,
      order_id: orderId ?? null,
    });

    remaining -= toDeduct;
  }
};
