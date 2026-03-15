import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isLowStock } from "@/lib/inventory";
import { logActivity } from "@/lib/activity-log";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";

const InventoryPage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAdjust, setBulkAdjust] = useState(0);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), schools(name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const handleAdjustStock = async (variant: any, productId: string) => {
    if (adjustAmount === 0) return;
    const newStock = Math.max(0, variant.stock + adjustAmount);

    try {
      await supabase
        .from("product_variants")
        .update({ stock: newStock })
        .eq("id", variant.id);

      await supabase.from("inventory_logs").insert({
        product_id: productId,
        variant_id: variant.id,
        change_type: adjustAmount > 0 ? "restock" : "adjustment",
        quantity_change: adjustAmount,
        previous_stock: variant.stock,
        new_stock: newStock,
      });

      await logActivity({
        actionType: "INVENTORY_ADJUSTED",
        entityType: "inventory",
        entityId: variant.id,
        description: `Stock adjusted for ${variant.productName ?? "product"} ${variant.size ? variant.size : ""} from ${variant.stock} → ${newStock}`,
        performedBy: user?.id,
        fieldChanged: "stock",
        oldValue: String(variant.stock),
        newValue: String(newStock),
      });

      queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
      toast.success("Stock updated");
      setAdjusting(null);
      setAdjustAmount(0);
    } catch {
      toast.error("Failed to update stock");
    }
  };

  // Flatten products into rows per variant
  const rows = products?.flatMap((p) =>
    (p.product_variants ?? []).map((v: any) => ({
      ...v,
      productName: p.name,
      schoolName: (p as any).schools?.name,
      category: p.category,
      price: p.price,
      productId: p.id,
    }))
  ) ?? [];

  const allIds = rows.map((r: any) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(Array.from(new Set([...selectedIds, ...allIds])));
      return;
    }
    setSelectedIds([]);
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
  };

  const runBulkAdjust = async () => {
    if (bulkAdjust === 0 || selectedIds.length === 0) return;

    const selectedRows = rows.filter((r: any) => selectedIds.includes(r.id));
    const updates = selectedRows.map((row: any) => ({
      id: row.id,
      stock: Math.max(0, Number(row.stock || 0) + bulkAdjust),
    }));

    const { error: updateErr } = await supabase
      .from("product_variants")
      .upsert(updates, { onConflict: "id" });
    if (updateErr) {
      toast.error("Bulk stock update failed");
      return;
    }

    const logs = selectedRows.map((row: any) => ({
      product_id: row.productId,
      variant_id: row.id,
      change_type: bulkAdjust > 0 ? "restock" : "adjustment",
      quantity_change: bulkAdjust,
      previous_stock: row.stock,
      new_stock: Math.max(0, Number(row.stock || 0) + bulkAdjust),
    }));

    await supabase.from("inventory_logs").insert(logs);

    toast.success(`Adjusted stock for ${selectedIds.length} variants`);
    setBulkConfirmOpen(false);
    setSelectedIds([]);
    setBulkAdjust(0);
    queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
  };

  const exportSelectedInventory = () => {
    const selectedRows = rows.filter((r: any) => selectedIds.includes(r.id));
    const header = ["Variant ID", "Product", "School", "Category", "Size", "Stock", "Price"];
    const lines = selectedRows.map((row: any) =>
      [row.id, row.productName, row.schoolName, row.category, row.size, row.stock, row.price]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );

    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Inventory</h1>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) => toggleSelectAll(Boolean(value))}
                  aria-label="Select all variants"
                />
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
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
                  No products
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(row.id)}
                      onCheckedChange={(value) => toggleSelectOne(row.id, Boolean(value))}
                      aria-label={`Select variant ${row.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-sm">{row.productName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.schoolName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>
                  <TableCell className="text-sm">{row.size}</TableCell>
                  <TableCell className="text-sm font-medium">{row.stock}</TableCell>
                  <TableCell className="text-sm">{formatPrice(row.price)}</TableCell>
                  <TableCell>
                    {row.stock === 0 ? (
                      <Badge className="bg-red-600 text-white border-transparent">Out of Stock</Badge>
                    ) : isLowStock(row.stock, row.low_stock_threshold) ? (
                      <Badge className="bg-red-200 text-red-900 border-transparent">Low Stock</Badge>
                    ) : (
                      <Badge className="border-border bg-background text-foreground">In Stock</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Dialog
                      open={adjusting === row.id}
                      onOpenChange={(open) => {
                        if (!open) {
                          setAdjusting(null);
                          setAdjustAmount(0);
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setAdjusting(row.id)}
                        >
                          Adjust
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm" aria-describedby={undefined}>
                        <DialogHeader>
                          <DialogTitle className="text-sm font-light tracking-wide">
                            Adjust Stock — {row.productName} (Size {row.size})
                          </DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                          <p className="text-sm text-muted-foreground mb-4">
                            Current stock: {row.stock}
                          </p>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setAdjustAmount((a) => a - 1)}
                              className="w-10 h-10 border border-border flex items-center justify-center hover:border-foreground transition-colors"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <Input
                              type="number"
                              value={adjustAmount}
                              onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)}
                              className="w-24 text-center h-10"
                            />
                            <button
                              onClick={() => setAdjustAmount((a) => a + 1)}
                              className="w-10 h-10 border border-border flex items-center justify-center hover:border-foreground transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            New stock: {Math.max(0, row.stock + adjustAmount)}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleAdjustStock(row, row.productId)}
                          disabled={adjustAmount === 0}
                          className="w-full h-10 text-xs tracking-[0.2em] uppercase"
                        >
                          Update Stock
                        </Button>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-black text-white rounded-lg px-4 py-3 shadow-lg flex flex-wrap items-center gap-2">
          <span className="text-xs tracking-wide mr-2">{selectedIds.length} items selected</span>
          <Input
            type="number"
            value={bulkAdjust}
            onChange={(e) => setBulkAdjust(parseInt(e.target.value || "0") || 0)}
            className="h-8 w-24 text-xs bg-white text-black"
            placeholder="±Stock"
          />
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => setBulkConfirmOpen(true)}>
            Adjust Stock
          </Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={exportSelectedInventory}>
            Export
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-white hover:text-white" onClick={() => setSelectedIds([])}>
            Clear
          </Button>
        </div>
      )}

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adjust Stock</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to adjust stock by {bulkAdjust} for {selectedIds.length} selected variants?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBulkAdjust} disabled={bulkAdjust === 0}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InventoryPage;
