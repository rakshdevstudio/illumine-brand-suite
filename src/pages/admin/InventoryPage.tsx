import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { isLowStock } from "@/lib/inventory";

type BranchInventoryRow = {
  id: string;
  branch_id: string;
  product_id: string;
  variant_id: string;
  stock: number;
  updated_at: string;
};

type VariantMeta = {
  id: string;
  size?: string | null;
  low_stock_threshold?: number | null;
  products?: { name?: string; category?: string; price?: number; schools?: { name?: string } | null } | null;
};

type AggregatedInventoryRow = {
  key: string;
  variant_id: string;
  product_id: string;
  stock: number;
  primary_branch_id: string | null;
  product_variants?: {
    size?: string | null;
    low_stock_threshold?: number | null;
    products?: { name?: string; category?: string; price?: number; schools?: { name?: string } | null } | null;
  } | null;
};

type InventoryMovementRow = {
  id: string;
  branch_id: string;
  variant_id: string;
  type: "IN" | "OUT" | "ADJUSTMENT" | "TRANSFER";
  quantity: number;
  before_stock: number;
  after_stock: number;
  reason?: string | null;
  reference_type: "ORDER" | "MANUAL" | "SYSTEM";
  created_at: string;
  branches?: { name?: string } | null;
  product_variants?: { size?: string | null; products?: { name?: string } | null } | null;
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

const InventoryPage = () => {
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAdjust, setBulkAdjust] = useState(0);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [adjustReason, setAdjustReason] = useState("");
  const [bulkReason, setBulkReason] = useState("");

  const { data: branches } = useQuery({
    queryKey: ["admin-branches-filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name, location, is_active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: variantsCount } = useQuery({
    queryKey: ["admin-product-variants-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("product_variants")
        .select("id", { head: true, count: "exact" });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: branchInventoryCount } = useQuery({
    queryKey: ["admin-branch-inventory-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("branch_inventory")
        .select("id", { head: true, count: "exact" });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-branch-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_inventory")
        .select("id, branch_id, product_id, variant_id, stock, updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as BranchInventoryRow[];
    },
  });

  const { data: variantMetaRows } = useQuery({
    queryKey: ["admin-inventory-variant-meta"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, low_stock_threshold, products(name, category, price, schools(name))");

      if (error) throw error;
      return (data ?? []) as VariantMeta[];
    },
  });

  const variantMetaMap = useMemo(() => {
    const map = new Map<string, VariantMeta>();
    (variantMetaRows ?? []).forEach((row) => {
      map.set(row.id, row);
    });
    return map;
  }, [variantMetaRows]);

  const { data: movements, isLoading: loadingMovements } = useQuery({
    queryKey: ["admin-inventory-movements"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("inventory_movements")
        .select("id, branch_id, variant_id, type, quantity, before_stock, after_stock, reason, reference_type, created_at, branches(name), product_variants(size, products(name))")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as InventoryMovementRow[];
    },
  });

  const initializeInventory = async () => {
    setInitializing(true);
    const { data, error } = await (supabase as any).rpc("initialize_branch_inventory");
    setInitializing(false);

    if (error) {
      toast.error(error.message || "Failed to initialize inventory");
      return;
    }

    const inserted = Number(data?.rowsInserted ?? 0);
    toast.success(inserted > 0 ? `Initialized inventory (${inserted} rows added)` : "Inventory already initialized");

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-branches-filter"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-branch-inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-branch-inventory-count"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-product-variants-count"] }),
    ]);
  };

  const aggregatedRows = useMemo<AggregatedInventoryRow[]>(() => {
    if (!rows) return [];
    const grouped = new Map<string, AggregatedInventoryRow>();

    rows.forEach((row) => {
      const key = row.variant_id;
      const existing = grouped.get(key);
      if (!existing) {
        const meta = variantMetaMap.get(row.variant_id);
        grouped.set(key, {
          key,
          variant_id: row.variant_id,
          product_id: row.product_id,
          stock: Number(row.stock ?? 0),
          primary_branch_id: row.branch_id ?? null,
          product_variants: meta
            ? {
                size: meta.size,
                low_stock_threshold: meta.low_stock_threshold,
                products: meta.products,
              }
            : null,
        });
        return;
      }

      existing.stock += Number(row.stock ?? 0);
      const currentPrimaryStock = rows.find((r) => r.branch_id === existing.primary_branch_id && r.variant_id === row.variant_id)?.stock ?? 0;
      if (Number(row.stock ?? 0) > Number(currentPrimaryStock ?? 0)) {
        existing.primary_branch_id = row.branch_id ?? existing.primary_branch_id;
      }
    });

    return [...grouped.values()].sort((a, b) => b.stock - a.stock);
  }, [rows, variantMetaMap]);

  const visibleRows = aggregatedRows;

  const allIds = visibleRows.map((row) => row.key);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((prev) => prev.filter((id) => !allIds.includes(id)));
      return;
    }
    setSelectedIds(Array.from(new Set([...selectedIds, ...allIds])));
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
  };

  const handleAdjustStock = async (row: AggregatedInventoryRow) => {
    if (adjustAmount === 0) return;
    if (!adjustReason.trim()) {
      toast.error("Adjustment reason is required");
      return;
    }

    if (!row.primary_branch_id) {
      toast.error("No branch inventory row available for this variant");
      return;
    }

    const movementType = adjustAmount > 0 ? "IN" : "ADJUSTMENT";
    const { error } = await (supabase as any).rpc("apply_inventory_movement", {
      p_branch_id: row.primary_branch_id,
      p_variant_id: row.variant_id,
      p_type: movementType,
      p_quantity: adjustAmount,
      p_reference_type: "MANUAL",
      p_reason: adjustReason.trim(),
    });

    if (error) {
      toast.error("Failed to update stock");
      return;
    }

    toast.success("Branch stock updated");
    setAdjustAmount(0);
    setAdjustReason("");
    setAdjusting(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-branch-inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-inventory-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
    ]);
  };

  const runBulkAdjust = async () => {
    if (bulkAdjust === 0 || selectedIds.length === 0) return;
    if (!bulkReason.trim()) {
      toast.error("Adjustment reason is required for bulk actions");
      return;
    }

    const selectedRows = visibleRows.filter((row) => selectedIds.includes(row.key));
    const movementType = bulkAdjust > 0 ? "IN" : "ADJUSTMENT";

    for (const row of selectedRows) {
      if (!row.primary_branch_id) continue;
      const { error } = await (supabase as any).rpc("apply_inventory_movement", {
        p_branch_id: row.primary_branch_id,
        p_variant_id: row.variant_id,
        p_type: movementType,
        p_quantity: bulkAdjust,
        p_reference_type: "MANUAL",
        p_reason: bulkReason.trim(),
      });
      if (error) {
        toast.error(`Failed for ${row.product_variants?.products?.name ?? "item"}`);
        return;
      }
    }

    toast.success(`Adjusted stock for ${selectedRows.length} variants`);
    setBulkAdjust(0);
    setBulkReason("");
    setSelectedIds([]);
    setBulkConfirmOpen(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-branch-inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-inventory-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
    ]);
  };

  const exportSelectedInventory = () => {
    const selectedRows = visibleRows.filter((row) => selectedIds.includes(row.key));
    const header = ["Product", "School", "Category", "Size", "Stock", "Price"];

    const lines = selectedRows.map((row) => {
      const product = row.product_variants?.products;
      const values = [
        product?.name ?? "",
        product?.schools?.name ?? "",
        product?.category ?? "",
        row.product_variants?.size ?? "",
        row.stock,
        product?.price ?? 0,
      ];

      return values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
    });

    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `branch-inventory-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Inventory</h1>
        <Button
          variant="outline"
          className="h-10 text-xs tracking-[0.12em] uppercase"
          onClick={initializeInventory}
          disabled={initializing}
        >
          {initializing ? "Initializing..." : "Initialize Inventory"}
        </Button>
      </div>

      <div className="mb-4 border border-border bg-muted/30 px-4 py-3 text-xs tracking-wide uppercase flex flex-wrap gap-4">
        <span>Branches: {(branches ?? []).length}</span>
        <span>Variants: {variantsCount ?? 0}</span>
        <span>Branch Inventory Rows: {branchInventoryCount ?? 0}</span>
      </div>

      {(branches ?? []).length === 0 && (
        <div className="mb-4 border border-amber-600/40 bg-amber-600/5 px-4 py-3 text-sm text-amber-800">
          No branches found. Add a branch in Branches management, then run Initialize Inventory.
        </div>
      )}

      {(branches ?? []).length > 0 && (rows ?? []).length === 0 && !isLoading && (
        <div className="mb-4 border border-amber-600/40 bg-amber-600/5 px-4 py-3 text-sm text-amber-800">
          No branch inventory rows found. Click Initialize Inventory to seed missing rows for active branches.
        </div>
      )}

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={(value) => toggleSelectAll(Boolean(value))} />
              </TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Product</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">School</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Category</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Size</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Stock</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Price</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell></TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">No branch inventory rows found</TableCell></TableRow>
            ) : (
              visibleRows.map((row) => {
                const product = row.product_variants?.products;
                const stock = Number(row.stock ?? 0);
                const threshold = Number(row.product_variants?.low_stock_threshold ?? 5);
                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <Checkbox checked={selectedIds.includes(row.key)} onCheckedChange={(value) => toggleSelectOne(row.key, Boolean(value))} />
                    </TableCell>
                    <TableCell className="text-sm">{product?.name ?? "Product"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{product?.schools?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{product?.category ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.product_variants?.size ?? "default"}</TableCell>
                    <TableCell className="text-sm font-medium">{stock}</TableCell>
                    <TableCell className="text-sm">{formatPrice(Number(product?.price ?? 0))}</TableCell>
                    <TableCell>
                      {stock === 0 ? (
                        <Badge className="bg-red-600 text-white border-transparent">Out of Stock</Badge>
                      ) : isLowStock(stock, threshold) ? (
                        <Badge className="bg-red-200 text-red-900 border-transparent">Low Stock</Badge>
                      ) : (
                        <Badge className="border-border bg-background text-foreground">In Stock</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Dialog
                        open={adjusting === row.key}
                        onOpenChange={(open) => {
                          if (!open) {
                            setAdjusting(null);
                            setAdjustAmount(0);
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjusting(row.key)}>
                            Adjust
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm" aria-describedby={undefined}>
                          <DialogHeader>
                            <DialogTitle className="text-sm font-light tracking-wide">
                              Adjust Stock — {product?.name ?? "Product"}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="py-4">
                            <p className="text-sm text-muted-foreground mb-4">Current stock: {stock}</p>
                            <div className="flex items-center gap-3">
                              <button onClick={() => setAdjustAmount((a) => a - 1)} className="w-10 h-10 border border-border flex items-center justify-center hover:border-foreground transition-colors"><Minus className="h-3 w-3" /></button>
                              <Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)} className="w-24 text-center h-10" />
                              <button onClick={() => setAdjustAmount((a) => a + 1)} className="w-10 h-10 border border-border flex items-center justify-center hover:border-foreground transition-colors"><Plus className="h-3 w-3" /></button>
                            </div>
                            <Input
                              value={adjustReason}
                              onChange={(e) => setAdjustReason(e.target.value)}
                              placeholder="Reason (required)"
                              className="mt-3 h-10"
                            />
                            <p className="text-xs text-muted-foreground mt-2">New stock: {Math.max(0, stock + adjustAmount)}</p>
                          </div>
                          <Button onClick={() => handleAdjustStock(row)} disabled={adjustAmount === 0 || !adjustReason.trim()} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
                            Update Stock
                          </Button>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-black text-white rounded-lg px-4 py-3 shadow-lg flex flex-wrap items-center gap-2">
          <span className="text-xs tracking-wide mr-2">{selectedIds.length} items selected</span>
          <Input type="number" value={bulkAdjust} onChange={(e) => setBulkAdjust(parseInt(e.target.value || "0") || 0)} className="h-8 w-24 text-xs bg-white text-black" placeholder="±Stock" />
          <Input value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} className="h-8 w-44 text-xs bg-white text-black" placeholder="Reason" />
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => setBulkConfirmOpen(true)}>Adjust Stock</Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={exportSelectedInventory}>Export</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-white hover:text-white" onClick={() => setSelectedIds([])}>Clear</Button>
        </div>
      )}

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adjust Branch Stock</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to adjust stock by {bulkAdjust} for {selectedIds.length} selected branch inventory rows?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBulkAdjust} disabled={bulkAdjust === 0 || !bulkReason.trim()}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-8 border border-border">
        <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-[0.12em]">Recent Inventory Movements</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">Time</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Branch</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Product</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Size</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Type</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Delta</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Before → After</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingMovements ? (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">Loading movement history...</TableCell></TableRow>
            ) : (movements ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">No inventory movements found</TableCell></TableRow>
            ) : (
              (movements ?? []).map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(movement.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{movement.branches?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{movement.product_variants?.products?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{movement.product_variants?.size ?? "default"}</TableCell>
                  <TableCell className="text-xs uppercase tracking-wide">{movement.type}</TableCell>
                  <TableCell className="text-sm font-medium">{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</TableCell>
                  <TableCell className="text-sm">{movement.before_stock} → {movement.after_stock}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{movement.reason || movement.reference_type}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default InventoryPage;
