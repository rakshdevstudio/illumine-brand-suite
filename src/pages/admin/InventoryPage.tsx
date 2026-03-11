import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";

const InventoryPage = () => {
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Inventory</h1>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                  No products
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">{row.productName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.schoolName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>
                  <TableCell className="text-sm">{row.size}</TableCell>
                  <TableCell className="text-sm font-medium">{row.stock}</TableCell>
                  <TableCell className="text-sm">{formatPrice(row.price)}</TableCell>
                  <TableCell>
                    <span
                      className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                        row.stock === 0
                          ? "border-destructive text-destructive"
                          : row.stock <= 10
                          ? "border-border text-muted-foreground"
                          : "border-border text-foreground"
                      }`}
                    >
                      {row.stock === 0 ? "Out of Stock" : row.stock <= 10 ? "Low Stock" : "In Stock"}
                    </span>
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
    </div>
  );
};

export default InventoryPage;
