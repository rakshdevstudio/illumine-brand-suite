import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Globe } from "lucide-react";
import { getDisplayImage } from "@/lib/product-images";
import ProductImageUploader from "@/components/admin/ProductImageUploader";

const defaultCategories = ["Shirt", "Pant", "Blazer", "Tie", "Skirt", "Sweater"];
const genders = ["Male", "Female", "Unisex"];

const ProductsPage = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    category: "",
    price: "",
    description: "",
    school_id: "",
    class_id: "",
    gender: "Unisex",
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, schools(name, slug), classes(name), product_images(*)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: schools } = useQuery({
    queryKey: ["admin-schools-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name, slug").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["admin-classes-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name, school_id").eq("status", "active").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const filteredClasses = classes?.filter((c: any) => c.school_id === form.school_id) ?? [];

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const categoryOptions = useMemo(() => {
    const fromProducts = (products ?? [])
      .map((p: any) => p.category)
      .filter(Boolean);
    return Array.from(new Set([...defaultCategories, ...fromProducts])).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const handleSave = async () => {
    if (!form.name || !form.category || !form.price) {
      toast.error("Please fill all required fields");
      return;
    }
    const parsedPrice = parseFloat(form.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Please enter a valid base price");
      return;
    }

    try {
      const payload: any = {
        name: form.name.trim(),
        school_id: form.school_id || null,
        class_id: form.class_id || null,
        category: form.category.trim(),
        gender: form.gender,
        price: parsedPrice,
        base_price: parsedPrice,
        description: form.description.trim() || null,
        is_universal: true,
      };
      let savedProductId: string | null = editing?.id ?? null;

      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Product updated");
      } else {
        const { data: created, error } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        savedProductId = created?.id ?? null;

        if (savedProductId) {
          const { error: variantError } = await supabase.from("product_variants").insert({
            product_id: savedProductId,
            size: "default",
            stock: 0,
            price_override: null,
          });

          if (variantError) throw variantError;
        }

        toast.success("Product created");
      }

      if (savedProductId && form.school_id && form.class_id) {
        const { error: assignErr } = await supabase
          .from("product_assignments")
          .upsert(
            {
              product_id: savedProductId,
              school_id: form.school_id,
              class_id: form.class_id,
              gender: form.gender,
              is_required: false,
              display_order: 0,
            },
            { onConflict: "product_id,school_id,class_id,gender" }
          );

        if (!assignErr) {
          toast.success("Initial assignment added");
        }
      }

      queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inventory-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-low-stock-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-variants"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ name: "", category: "", price: "", description: "", school_id: "", class_id: "", gender: "Unisex" });
    } catch (err: any) {
      console.error("Failed to save product:", err);
      toast.error(err?.message || "Failed to save product");
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await supabase.from("products").update({ status: newStatus }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
    toast.success(`Product ${newStatus === "active" ? "enabled" : "disabled"}`);
  };

  const openEdit = (product: any) => {
    setEditing(product);
    setForm({
      name: product.name,
      category: product.category,
      price: String((product as any).base_price ?? product.price),
      description: product.description || "",
      school_id: product.school_id ?? "",
      class_id: product.class_id ?? "",
      gender: product.gender ?? "Unisex",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", category: "", price: "", description: "", school_id: "", class_id: "", gender: "Unisex" });
    setDialogOpen(true);
  };

  const getSchoolSlug = (schoolId: string | null) => {
    if (!schoolId) return "general";
    return schools?.find((s) => s.id === schoolId)?.slug ?? "general";
  };

  const refreshImages = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Products</h1>
        <Button onClick={openCreate} className="text-xs tracking-[0.2em] uppercase h-10 px-6">
          <Plus className="h-3 w-3 mr-2" /> Add Product
        </Button>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase w-16">Image</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Product Name</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">School</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Class</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Gender</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Category</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Base Price</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : products?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">No products</TableCell>
              </TableRow>
            ) : (
              products?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="w-12 h-12 border border-border overflow-hidden bg-secondary">
                      <img
                        src={getDisplayImage(product as any)}
                        alt={product.name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{product.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{(product as any).schools?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{(product as any).classes?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{(product as any).gender ?? "Unisex"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{product.category}</TableCell>
                  <TableCell className="text-sm">{formatPrice((product as any).base_price ?? product.price)}</TableCell>
                  <TableCell>
                    <span className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                      product.status === "inactive"
                        ? "border-destructive text-destructive"
                        : "border-border text-foreground"
                    }`}>
                      {product.status || "active"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(product)}>Edit</Button>
                      <Button variant="outline" size="sm" className="text-xs"
                        onClick={() => handleStatusToggle(product.id, product.status || "active")}>
                        {product.status === "inactive" ? "Enable" : "Disable"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">
              {editing ? "Edit Product" : "Add Product"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground tracking-wide">
              Select school/class/gender for initial mapping. Product remains a single catalog item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Product Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" placeholder="DPS Shirt" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Category</label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="h-10"
                placeholder="Select or type category"
                list="product-category-options"
              />
              <datalist id="product-category-options">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">School</label>
              <Select value={form.school_id} onValueChange={(v) => setForm({ ...form, school_id: v, class_id: "" })}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select school" />
                </SelectTrigger>
                <SelectContent>
                  {schools?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Class</label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={form.school_id ? "Select class" : "Select school first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredClasses.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Gender</label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {genders.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Base Price (₹)</label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="h-10" placeholder="1200" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full min-h-[96px] border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-vertical"
                placeholder="Optional description"
              />
            </div>

            {/* Image uploader - only for existing products */}
            {editing && (
              <ProductImageUploader
                productId={editing.id}
                schoolSlug={getSchoolSlug(editing.school_id)}
                images={(editing as any).product_images ?? []}
                onImagesChange={refreshImages}
              />
            )}
          </div>
          <Button onClick={handleSave} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            {editing ? "Update Product" : "Create Product"}
          </Button>
          {!editing && (
            <p className="text-[10px] text-muted-foreground text-center">
              Save product first, then edit to upload images
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductsPage;
