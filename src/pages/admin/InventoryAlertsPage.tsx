import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { LOW_STOCK_LIMIT, getLowStockThreshold, isLowStock } from "@/lib/inventory";

const InventoryAlertsPage = () => {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [thresholdColumnForcedUnavailable, setThresholdColumnForcedUnavailable] = useState(false);

  const { data: variants, isLoading, isError, error } = useQuery({
    queryKey: ["admin-inventory-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_inventory")
        .select("id, branch_id, variant_id, stock, product_variants(size, low_stock_threshold, products(name))")
        .order("stock", { ascending: true });

      if (error) throw error;
      return data;
    },
    retry: false,
  });

  const rows = useMemo(() => {
    const source = variants ?? [];
    const grouped = new Map<string, any>();

    source.forEach((variant: any) => {
      const key = variant.variant_id ?? variant.id;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...variant, stock: Number(variant.stock ?? 0) });
        return;
      }
      existing.stock += Number(variant.stock ?? 0);
    });

    return Array.from(grouped.values());
  }, [variants]);
  const thresholdColumnAvailable = !thresholdColumnForcedUnavailable && (
    rows.length === 0 || rows.some((variant: any) => Object.prototype.hasOwnProperty.call(variant.product_variants ?? {}, "low_stock_threshold"))
  );

  const getDraftValue = (variant: any) => {
    const key = variant.variant_id ?? variant.id;
    if (drafts[key] !== undefined) return drafts[key];
    return String(getLowStockThreshold(variant.product_variants?.low_stock_threshold));
  };

  const handleThresholdSave = async (variantId: string) => {
    const rawValue = drafts[variantId];
    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue < 0) {
      toast.error("Threshold must be a whole number of 0 or more");
      return;
    }

    setSavingId(variantId);
    const { error } = await supabase
      .from("product_variants")
      .update({ low_stock_threshold: parsedValue })
      .eq("id", variantId);

    if (error) {
      if (error.message?.toLowerCase().includes("low_stock_threshold")) {
        setThresholdColumnForcedUnavailable(true);
        toast.error("Please run the latest database migration before saving thresholds");
      } else {
        toast.error("Failed to update alert threshold");
      }
      setSavingId(null);
      return;
    }

    toast.success("Alert threshold updated");
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    await queryClient.invalidateQueries({ queryKey: ["admin-inventory-alerts"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-low-stock-alerts"] });
    setSavingId(null);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase mb-2">Inventory Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Configure low stock thresholds per variant without changing inventory deduction logic.
        </p>
      </div>

      {!thresholdColumnAvailable && (
        <div className="mb-6 border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-sm">
            Using the default alert threshold of {LOW_STOCK_LIMIT} because the latest database migration has not been applied yet.
            Saving custom thresholds will remain unavailable until the migration is run.
          </div>
        </div>
      )}

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">Product</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Size</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Current Stock</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Alert Threshold</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-destructive">
                  {(error as Error)?.message || "Failed to load inventory alerts"}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                  No variants found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((variant: any) => {
                const threshold = getLowStockThreshold(variant.product_variants?.low_stock_threshold);
                const lowStock = isLowStock(variant.stock, variant.product_variants?.low_stock_threshold);
                const draftValue = getDraftValue(variant);
                const isDirty = draftValue !== String(threshold);

                return (
                  <TableRow key={variant.variant_id ?? variant.id} className={lowStock ? "bg-red-50" : undefined}>
                    <TableCell className="text-sm font-medium">{variant.product_variants?.products?.name || "Product"}</TableCell>
                    <TableCell className="text-sm">{variant.product_variants?.size}</TableCell>
                    <TableCell className={lowStock ? "text-red-600 font-medium" : "text-sm font-medium"}>
                      {variant.stock}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={draftValue}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [variant.variant_id]: e.target.value,
                          }))
                        }
                        className="h-9 w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={!thresholdColumnAvailable || !isDirty || savingId === variant.variant_id}
                        onClick={() => handleThresholdSave(variant.variant_id)}
                      >
                        {savingId === variant.variant_id ? "Saving..." : "Save"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default InventoryAlertsPage;
