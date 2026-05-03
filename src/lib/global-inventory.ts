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

const BATCH_SIZE = 40;

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const fetchGlobalStockByVariants = async (variantIds: string[]) => {
  if (!variantIds.length) {
    return { stockByVariant: new Map<string, number>(), rows: [] as BranchInventorySnapshot[] };
  }

  const uniqueVariantIds = [...new Set(variantIds)];
  const batchedVariantIds = chunk(uniqueVariantIds, BATCH_SIZE);
  const rows: BranchInventorySnapshot[] = [];

  const fetchRowsAdaptive = async (ids: string[]): Promise<BranchInventorySnapshot[]> => {
    const { data, error } = await (supabase as any)
      .from("branch_inventory")
      .select("branch_id, variant_id, stock")
      .in("variant_id", ids);

    if (!error) {
      return normalizeRows(data ?? []);
    }

    const errorText = String(error.message ?? error.details ?? error.hint ?? "").toLowerCase();
    const shouldSplit =
      ids.length > 1 &&
      (errorText.includes("bad request") ||
        errorText.includes("uri") ||
        errorText.includes("too long") ||
        errorText.includes("failed to parse"));

    if (!shouldSplit) {
      throw error;
    }

    const midpoint = Math.floor(ids.length / 2);
    const left = await fetchRowsAdaptive(ids.slice(0, midpoint));
    const right = await fetchRowsAdaptive(ids.slice(midpoint));
    return [...left, ...right];
  };

  for (const ids of batchedVariantIds) {
    rows.push(...(await fetchRowsAdaptive(ids)));
  }

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
    const { error: movementError } = await (supabase as any).rpc("reserve_checkout_inventory_movement", {
      p_branch_id: row.branch_id,
      p_variant_id: variantId,
      p_type: "OUT",
      p_quantity: toDeduct,
      p_reference_type: "ORDER",
      p_reference_id: orderId ?? null,
      p_reason: "Global checkout deduction",
    });

    if (movementError) throw movementError;
    void productId;

    remaining -= toDeduct;
  }
};
