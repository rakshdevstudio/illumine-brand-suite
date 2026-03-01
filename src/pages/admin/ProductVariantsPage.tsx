import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Minus } from "lucide-react";

const ProductVariantsPage = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [adjusting, setAdjusting] = useState<any>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [form, setForm] = useState({ product_id: "", size: "", stock: "0", price_override: "" });

  const { data: variants, isLoading } = useQuery({
    queryKey: ["admin-variants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("*, products(name, price, school_id, schools(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["admin-products-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, schools(name)").order("name");
      if (error) throw error;
      return data;
    },
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const handleSave = async () => {
    if (!form.product_id || !form.size) {
      toast.error("Product and size are required");
      return;
    }
    try {
      const payload: any = {
        product_id: form.product_id,
        size: form.size,
        stock: parseInt(form.stock) || 0,
      };
      if (form.price_override) payload.price_override = parseFloat(form.price_override);
      
      if (editing) {
        await supabase.from("product_variants").update(payload).eq("id", editing.id);
        toast.success("Variant updated");
      } else {
        await supabase.from("product_variants").insert(payload);
        toast.success("Variant created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-variants"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ product_id: "", size: "", stock: "0", price_override: "" });
    } catch {
      toast.error("Failed to save variant");
    }
  };

  const handleAdjustStock = async () => {
    if (!adjusting || adjustAmount === 0) return;
    const newStock = Math.max(0, adjusting.stock + adjustAmount);
    try {
      await supabase.from("product_variants").update({ stock: newStock }).eq("id", adjusting.id);
      await supabase.from("inventory_logs").insert({
        product_id: adjusting.product_id,
        variant_id: adjusting.id,
        change_type: adjustAmount > 0 ? "restock" : "adjustment",
        quantity_change: adjustAmount,
        previous_stock: adjusting.stock,
        new_stock: newStock,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-variants"] });
      toast.success("Stock updated");
      setAdjusting(null);
      setAdjustAmount(0);
    } catch {
      toast.error("Failed to update stock");
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await supabase.from("product_variants").update({ status: newStatus }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-variants"] });
    toast.success(`Variant ${newStatus === "active" ? "enabled" : "disabled"}`);
  };

  const openEdit = (variant: any) => {
    setEditing(variant);
    setForm({
      product_id: variant.product_id,
      size: variant.size,
      stock: String(variant.stock),
      price_override: variant.price_override ? String(variant.price_override) : "",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ product_id: "", size: "", stock: "0", price_override: "" });
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Product Variants</h1>
        <Button onClick={openCreate} className="text-xs tracking-[0.2em] uppercase h-10 px-6">
          <Plus className="h-3 w-3 mr-2" /> Add Variant
        </Button>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">Product</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">School</TableHead>
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
                <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : variants?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No variants</TableCell>
              </TableRow>
            ) : (
              variants?.map((v: any) => {
                const effectivePrice = v.price_override ?? v.products?.price;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm">{v.products?.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.products?.schools?.name}</TableCell>
                    <TableCell className="text-sm">{v.size}</TableCell>
                    <TableCell className="text-sm font-medium">{v.stock}</TableCell>
                    <TableCell className="text-sm">
                      {formatPrice(effectivePrice)}
                      {v.price_override && <span className="text-xs text-muted-foreground ml-1">(override)</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                        v.status === "inactive"
                          ? "border-destructive text-destructive"
                          : v.stock === 0
                          ? "border-destructive text-destructive"
                          : v.stock <= 10
                          ? "border-border text-muted-foreground"
                          : "border-border text-foreground"
                      }`}>
                        {v.status === "inactive" ? "Inactive" : v.stock === 0 ? "Out of Stock" : v.stock <= 10 ? "Low Stock" : "In Stock"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(v)}>Edit</Button>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => { setAdjusting(v); setAdjustAmount(0); }}>
                          Adjust
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs"
                          onClick={() => handleStatusToggle(v.id, v.status || "active")}>
                          {v.status === "inactive" ? "Enable" : "Disable"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">
              {editing ? "Edit Variant" : "Add Variant"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Product</label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {p.schools?.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Size</label>
              <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="h-10" placeholder="30" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Initial Stock</label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="h-10" placeholder="100" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Price Override (optional)</label>
              <Input type="number" value={form.price_override} onChange={(e) => setForm({ ...form, price_override: e.target.value })} className="h-10" placeholder="Leave empty to use base price" />
            </div>
          </div>
          <Button onClick={handleSave} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            {editing ? "Update Variant" : "Create Variant"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={!!adjusting} onOpenChange={(open) => { if (!open) { setAdjusting(null); setAdjustAmount(0); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide">
              Adjust Stock — {adjusting?.products?.name} (Size {adjusting?.size})
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">Current stock: {adjusting?.stock}</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setAdjustAmount((a) => a - 1)}
                className="w-10 h-10 border border-border flex items-center justify-center hover:border-foreground transition-colors">
                <Minus className="h-3 w-3" />
              </button>
              <Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)} className="w-24 text-center h-10" />
              <button onClick={() => setAdjustAmount((a) => a + 1)}
                className="w-10 h-10 border border-border flex items-center justify-center hover:border-foreground transition-colors">
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              New stock: {adjusting ? Math.max(0, adjusting.stock + adjustAmount) : 0}
            </p>
          </div>
          <Button onClick={handleAdjustStock} disabled={adjustAmount === 0} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            Update Stock
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductVariantsPage;
