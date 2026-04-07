import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Minus } from "lucide-react";
import { safeQuery } from "@/lib/safeQuery";
import { ErrorState } from "@/components/ui/error-state";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { logActivity } from "@/lib/activity-log";
import { useAuth } from "@/hooks/use-auth";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import BulkActionBar from "@/components/admin/BulkActionBar";

const chunk = <T,>(items: T[], size = 25) => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

const ProductVariantsPage = () => {
  const { session, isChecking } = useRequireAuth();
  const { isAdmin, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [adjusting, setAdjusting] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustBranchId, setAdjustBranchId] = useState("");
  const [bulkAction, setBulkAction] = useState<"enable" | "disable" | "delete" | "stock" | "price" | "clear-price" | null>(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkStockDelta, setBulkStockDelta] = useState(0);
  const [bulkStockReason, setBulkStockReason] = useState("");
  const [bulkStockBranchId, setBulkStockBranchId] = useState("");
  const [bulkPriceOverride, setBulkPriceOverride] = useState("");
  const [form, setForm] = useState({ product_id: "", size: "", stock: "0", price_override: "" });
  const { selectedIds, selectedCount, isSelected, clearSelection, toggleOne, toggleMany, pruneMissing, getHeaderState } = useBulkSelection();

  // Filters
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");

  const { data: variants, isLoading, error: variantsError } = useQuery({
    queryKey: ["admin-variants"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () =>
          supabase
            .from("product_variants")
            .select("*, products(name, price, school_id, class_id, schools(name), classes(name))")
            .order("created_at", { ascending: false }),
        "admin-product-variants/list"
      );
      return data ?? [];
    },
  });

  const { data: schools, error: schoolsError } = useQuery({
    queryKey: ["admin-schools-select"],
    queryFn: async () => {
      const { data } = await safeQuery(() => supabase.from("schools").select("id, name").order("name"), "admin-product-variants/schools");
      return data ?? [];
    },
  });

  const { data: classes, error: classesError } = useQuery({
    queryKey: ["admin-classes-select"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () => supabase.from("classes").select("id, name, school_id").eq("status", "active").order("sort_order"),
        "admin-product-variants/classes"
      );
      return data ?? [];
    },
  });

  const { data: products, error: productsError } = useQuery({
    queryKey: ["admin-products-select"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () => supabase.from("products").select("id, name, school_id, class_id, schools(name)").order("name"),
        "admin-product-variants/products"
      );
      return data ?? [];
    },
  });

  const { data: branches, error: branchesError } = useQuery({
    queryKey: ["admin-branches-select"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () => supabase.from("branches").select("id, name, is_active").order("name"),
        "admin-product-variants/branches"
      );
      return data ?? [];
    },
  });

  const { data: branchInventoryRows, error: branchInventoryError } = useQuery({
    queryKey: ["admin-variant-stock-totals"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () => supabase.from("branch_inventory").select("variant_id, stock"),
        "admin-product-variants/branch-inventory"
      );
      return data ?? [];
    },
  });

  const variantStockMap = useMemo(() => {
    const totals = new Map<string, number>();
    (branchInventoryRows ?? []).forEach((row: any) => {
      const current = totals.get(row.variant_id) ?? 0;
      totals.set(row.variant_id, current + Number(row.stock ?? 0));
    });
    return totals;
  }, [branchInventoryRows]);

  // Cascading filter logic
  const filteredClassesForFilter = useMemo(() => {
    if (!classes) return [];
    if (schoolFilter === "all") return classes;
    return classes.filter((c: any) => c.school_id === schoolFilter);
  }, [classes, schoolFilter]);

  const filteredProductsForFilter = useMemo(() => {
    if (!products) return [];
    let filtered = products as any[];
    if (schoolFilter !== "all") filtered = filtered.filter((p) => p.school_id === schoolFilter);
    if (classFilter !== "all") filtered = filtered.filter((p) => p.class_id === classFilter);
    return filtered;
  }, [products, schoolFilter, classFilter]);

  const filteredVariants = useMemo(() => {
    if (!variants) return [];
    let filtered = variants as any[];
    if (schoolFilter !== "all") filtered = filtered.filter((v) => v.products?.school_id === schoolFilter);
    if (classFilter !== "all") filtered = filtered.filter((v) => v.products?.class_id === classFilter);
    if (productFilter !== "all") filtered = filtered.filter((v) => v.product_id === productFilter);
    return filtered;
  }, [variants, schoolFilter, classFilter, productFilter]);

  const allVariantIds = useMemo(() => (variants ?? []).map((variant: any) => variant.id), [variants]);
  const visibleVariantIds = useMemo(() => filteredVariants.map((variant: any) => variant.id), [filteredVariants]);
  const headerCheckboxState = useMemo(() => getHeaderState(visibleVariantIds), [getHeaderState, visibleVariantIds]);

  useEffect(() => {
    pruneMissing(allVariantIds);
  }, [allVariantIds, pruneMissing]);

  if (isChecking) {
    return (
      <div className="min-h-[220px] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading variants...</p>
      </div>
    );
  }

  if (variantsError || schoolsError || classesError || productsError || branchesError || branchInventoryError) {
    return <ErrorState message="Session expired. Please login again." />;
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const refreshVariantQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-variants"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
    ]);
  };

  const canDelete = isAdmin || isSuperAdmin;

  const runBulkStatusUpdate = async (nextStatus: "active" | "inactive") => {
    if (selectedIds.length === 0 || bulkAction) return;
    setBulkAction(nextStatus === "active" ? "enable" : "disable");

    const previousVariants = queryClient.getQueryData<any[]>(["admin-variants"]);
    queryClient.setQueryData<any[]>(["admin-variants"], (old = []) =>
      old.map((variant: any) => (selectedIds.includes(variant.id) ? { ...variant, status: nextStatus } : variant))
    );

    try {
      const { error } = await supabase.from("product_variants").update({ status: nextStatus }).in("id", selectedIds);
      if (error) throw error;

      await logActivity({
        actionType: nextStatus === "active" ? "VARIANT_ENABLED" : "VARIANT_DISABLED",
        entityType: "product_variant",
        entityId: selectedIds[0],
        description: `Bulk ${nextStatus === "active" ? "enable" : "disable"} executed for ${selectedIds.length} variants`,
        performedBy: session?.user?.id,
      });

      toast.success(`${selectedIds.length} variants ${nextStatus === "active" ? "enabled" : "disabled"}`);
      clearSelection();
      await refreshVariantQueries();
    } catch (error: any) {
      if (previousVariants) queryClient.setQueryData(["admin-variants"], previousVariants);
      toast.error(error?.message || "Bulk status update failed");
    } finally {
      setBulkAction(null);
    }
  };

  const runBulkDelete = async () => {
    if (selectedIds.length === 0 || bulkAction || !canDelete) return;
    setBulkAction("delete");

    try {
      const { data: deletedRows, error } = await supabase
        .from("product_variants")
        .delete()
        .in("id", selectedIds)
        .select("id");

      if (error) throw error;

      const deletedCount = deletedRows?.length ?? 0;
      if (deletedCount === 0) {
        throw new Error("Delete was blocked by database policy. Confirm admin RLS permissions.");
      }

      await logActivity({
        actionType: "VARIANT_DELETED",
        entityType: "product_variants",
        entityId: selectedIds[0],
        description: `Bulk delete executed for ${deletedCount} variants`,
        performedBy: session?.user?.id,
      });

      toast.success(`${deletedCount} variants deleted`);
      clearSelection();
      setBulkDeleteConfirmOpen(false);
      await refreshVariantQueries();
    } catch (error: any) {
      toast.error(error?.message || "Bulk delete failed");
    } finally {
      setBulkAction(null);
    }
  };

  const runBulkStockAdjust = async () => {
    if (selectedIds.length === 0 || bulkAction) return;
    if (!bulkStockBranchId) {
      toast.error("Select a branch for bulk stock update");
      return;
    }
    if (bulkStockDelta === 0) {
      toast.error("Bulk stock delta cannot be zero");
      return;
    }
    if (!bulkStockReason.trim()) {
      toast.error("Reason is required for bulk stock update");
      return;
    }

    const movementType = bulkStockDelta > 0 ? "IN" : "ADJUSTMENT";
    setBulkAction("stock");

    try {
      for (const batch of chunk(selectedIds, 20)) {
        const results = await Promise.all(
          batch.map(async (variantId) => {
            const { error } = await (supabase as any).rpc("apply_inventory_movement", {
              p_branch_id: bulkStockBranchId,
              p_variant_id: variantId,
              p_type: movementType,
              p_quantity: bulkStockDelta,
              p_reference_type: "MANUAL",
              p_reason: bulkStockReason.trim(),
            });
            if (error) throw error;
            return variantId;
          })
        );

        if (results.length !== batch.length) {
          throw new Error("Bulk stock update failed for one or more variants");
        }
      }

      await logActivity({
        actionType: "VARIANT_UPDATED",
        entityType: "product_variant",
        entityId: selectedIds[0],
        description: `Bulk stock adjustment (${bulkStockDelta > 0 ? "+" : ""}${bulkStockDelta}) for ${selectedIds.length} variants on selected branch`,
        performedBy: session?.user?.id,
      });

      toast.success(`Stock updated for ${selectedIds.length} variants`);
      clearSelection();
      setBulkStockDelta(0);
      setBulkStockReason("");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-variants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-branch-inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-variant-stock-totals"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-inventory-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
      ]);
    } catch (error: any) {
      toast.error(error?.message || "Bulk stock update failed");
    } finally {
      setBulkAction(null);
    }
  };

  const runBulkPriceOverride = async (clear = false) => {
    if (selectedIds.length === 0 || bulkAction) return;
    if (!clear) {
      const parsed = Number(bulkPriceOverride);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Enter a valid non-negative price override");
        return;
      }
    }

    const payload = clear ? { price_override: null } : { price_override: Number(bulkPriceOverride) };
    setBulkAction(clear ? "clear-price" : "price");

    try {
      const { error } = await supabase.from("product_variants").update(payload).in("id", selectedIds);
      if (error) throw error;

      await logActivity({
        actionType: "VARIANT_UPDATED",
        entityType: "product_variant",
        entityId: selectedIds[0],
        description: clear
          ? `Bulk cleared price override for ${selectedIds.length} variants`
          : `Bulk set price override to ${formatPrice(Number(bulkPriceOverride))} for ${selectedIds.length} variants`,
        performedBy: session?.user?.id,
      });

      toast.success(clear ? `Cleared override for ${selectedIds.length} variants` : `Updated override for ${selectedIds.length} variants`);
      clearSelection();
      setBulkPriceOverride("");
      await refreshVariantQueries();
    } catch (error: any) {
      toast.error(error?.message || "Bulk price override failed");
    } finally {
      setBulkAction(null);
    }
  };

  const handleSave = async () => {
    if (!form.product_id || !form.size) {
      toast.error("Product and size are required");
      return;
    }
    try {
      const payload: any = {
        product_id: form.product_id,
        size: form.size,
        stock: 0,
      };
      if (form.price_override) payload.price_override = parseFloat(form.price_override);
      
      if (editing) {
        const { error } = await supabase.from("product_variants").update(payload).eq("id", editing.id);
        if (error) throw error;

        const selectedProduct = (products ?? []).find((p: any) => p.id === payload.product_id);
        const currentPriceOverride = editing.price_override ?? null;
        const nextPriceOverride = payload.price_override ?? null;
        const changes = [
          {
            field: "product_id",
            oldValue: editing.product_id ?? null,
            newValue: payload.product_id ?? null,
            oldLabel: editing.products?.name ?? "Unknown product",
            newLabel: selectedProduct?.name ?? "Unknown product",
          },
          {
            field: "size",
            oldValue: editing.size ?? null,
            newValue: payload.size ?? null,
            oldLabel: editing.size ?? "-",
            newLabel: payload.size ?? "-",
          },
          {
            field: "price_override",
            oldValue: currentPriceOverride,
            newValue: nextPriceOverride,
            oldLabel: currentPriceOverride === null ? "base price" : formatPrice(Number(currentPriceOverride)),
            newLabel: nextPriceOverride === null ? "base price" : formatPrice(Number(nextPriceOverride)),
          },
        ].filter((change) => String(change.oldValue ?? "") !== String(change.newValue ?? ""));

        if (changes.length === 0) {
          await logActivity({
            actionType: "VARIANT_UPDATED",
            entityType: "product_variant",
            entityId: editing.id,
            description: `Variant ${payload.size} update submitted for ${editing.products?.name ?? "product"} (no field changes detected)`,
            performedBy: session?.user?.id,
          });
        } else {
          await Promise.all(
            changes.map((change) =>
              logActivity({
                actionType: "VARIANT_UPDATED",
                entityType: "product_variant",
                entityId: editing.id,
                description: `Variant ${payload.size} updated for ${selectedProduct?.name ?? editing.products?.name ?? "product"}: ${change.field} ${change.oldLabel} -> ${change.newLabel}`,
                performedBy: session?.user?.id,
                fieldChanged: change.field,
                oldValue: String(change.oldLabel),
                newValue: String(change.newLabel),
              })
            )
          );
        }

        toast.success("Variant updated");
      } else {
        const { data: created, error } = await supabase
          .from("product_variants")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;

        if (created?.id) {
          const selectedProduct = (products ?? []).find((p: any) => p.id === form.product_id);
          await logActivity({
            actionType: "VARIANT_CREATED",
            entityType: "product_variant",
            entityId: created.id,
            description: `Variant ${payload.size} created for ${selectedProduct?.name ?? "product"}`,
            performedBy: session?.user?.id,
          });
        }

        toast.success("Variant created");
      }
      await refreshVariantQueries();
      setDialogOpen(false);
      setEditing(null);
      setForm({ product_id: "", size: "", stock: "0", price_override: "" });
    } catch (error: any) {
      console.error("Failed to save variant", error);
      toast.error(error?.message || "Failed to save variant");
    }
  };

  const handleAdjustStock = async () => {
    if (!adjusting) return;
    if (adjustAmount === 0) {
      toast.error("Adjustment amount is required");
      return;
    }
    if (!adjustBranchId) {
      toast.error("Select a branch");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("Adjustment reason is required");
      return;
    }

    try {
      const movementType = adjustAmount > 0 ? "IN" : "ADJUSTMENT";
      const { error } = await (supabase as any).rpc("apply_inventory_movement", {
        p_branch_id: adjustBranchId,
        p_variant_id: adjusting.id,
        p_type: movementType,
        p_quantity: adjustAmount,
        p_reference_type: "MANUAL",
        p_reason: adjustReason.trim(),
      });

      if (error) throw error;

      toast.success("Stock adjusted");
      setAdjusting(null);
      setAdjustAmount(0);
      setAdjustReason("");
      setAdjustBranchId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-variants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-branch-inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-variant-stock-totals"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-inventory-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
      ]);
    } catch (error: any) {
      console.error("Failed to adjust stock", error);
      toast.error(error?.message || "Failed to adjust stock");
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const variant = (variants ?? []).find((v: any) => v.id === id);

    try {
      const { error } = await supabase.from("product_variants").update({ status: newStatus }).eq("id", id);
      if (error) throw error;

      await logActivity({
        actionType: newStatus === "active" ? "VARIANT_ENABLED" : "VARIANT_DISABLED",
        entityType: "product_variant",
        entityId: id,
        description: `Variant ${variant?.size ?? ""} ${newStatus === "active" ? "enabled" : "disabled"} for ${variant?.products?.name ?? "product"}`,
        performedBy: session?.user?.id,
      });

      await refreshVariantQueries();
      toast.success(`Variant ${newStatus === "active" ? "enabled" : "disabled"}`);
    } catch (error: any) {
      console.error("Failed to toggle variant status", error);
      toast.error(error?.message || "Failed to update variant status");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !session?.user?.id) {
      toast.error("Authenticated admin user is required");
      return;
    }

    try {
      const { data: deletedRow, error } = await supabase
        .from("product_variants")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!deletedRow?.id) {
        throw new Error("Delete was blocked by database policy. Apply latest migrations.");
      }

      await logActivity({
        actionType: "VARIANT_DELETED",
        entityType: "product_variants",
        entityId: deleteTarget.id,
        description: `Variant ${deleteTarget.size} deleted for ${deleteTarget.products?.name ?? "product"}`,
        performedBy: session.user.id,
      });

      setDeleteTarget(null);
      await refreshVariantQueries();
      toast.success("Variant deleted");
    } catch (error: any) {
      console.error("Failed to delete variant", error);
      toast.error(error?.message || "Failed to delete variant");
    }
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

      {/* Cascading Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">School</span>
          <Select value={schoolFilter} onValueChange={(v) => { setSchoolFilter(v); setClassFilter("all"); setProductFilter("all"); }}>
            <SelectTrigger className="w-48 h-9 text-xs">
              <SelectValue placeholder="All Schools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Schools</SelectItem>
              {schools?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Class</span>
          <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setProductFilter("all"); }}>
            <SelectTrigger className="w-48 h-9 text-xs">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {filteredClassesForFilter.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Product</span>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-48 h-9 text-xs">
              <SelectValue placeholder="All Products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {filteredProductsForFilter.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={headerCheckboxState}
                  onCheckedChange={(value) => toggleMany(visibleVariantIds, Boolean(value))}
                  aria-label="Select visible variants"
                />
              </TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Product</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">School</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Class</TableHead>
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
                <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : filteredVariants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">No variants</TableCell>
              </TableRow>
            ) : (
              filteredVariants.map((v: any) => {
                const effectivePrice = v.price_override ?? v.products?.price;
                const liveStock = variantStockMap.get(v.id) ?? Number(v.stock ?? 0);
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected(v.id)}
                        onCheckedChange={(value) => toggleOne(v.id, Boolean(value))}
                        aria-label={`Select variant ${v.size}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{v.products?.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.products?.schools?.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.products?.classes?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{v.size}</TableCell>
                    <TableCell className="text-sm font-medium">{liveStock}</TableCell>
                    <TableCell className="text-sm">
                      {formatPrice(effectivePrice)}
                      {v.price_override && <span className="text-xs text-muted-foreground ml-1">(override)</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                        v.status === "inactive"
                          ? "border-destructive text-destructive"
                          : liveStock === 0
                          ? "border-destructive text-destructive"
                          : liveStock <= 10
                          ? "border-border text-muted-foreground"
                          : "border-border text-foreground"
                      }`}>
                        {v.status === "inactive" ? "Inactive" : liveStock === 0 ? "Out of Stock" : liveStock <= 10 ? "Low Stock" : "In Stock"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(v)}>Edit</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setAdjusting(v);
                            setAdjustAmount(0);
                            setAdjustReason("");
                            const firstActiveBranchId = (branches ?? []).find((b: any) => b.is_active !== false)?.id ?? "";
                            setAdjustBranchId(firstActiveBranchId);
                          }}
                        >
                          Adjust
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs"
                          onClick={() => handleStatusToggle(v.id, v.status || "active")}>
                          {v.status === "inactive" ? "Enable" : "Disable"}
                        </Button>
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs text-destructive border-destructive/30 hover:text-destructive"
                            onClick={() => setDeleteTarget(v)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <BulkActionBar selectedCount={selectedCount} onClear={clearSelection} isBusy={Boolean(bulkAction)}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => runBulkStatusUpdate("active")}
          disabled={selectedCount === 0 || Boolean(bulkAction)}
        >
          Enable
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => runBulkStatusUpdate("inactive")}
          disabled={selectedCount === 0 || Boolean(bulkAction)}
        >
          Disable
        </Button>
        {canDelete && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs text-destructive border-destructive/40 hover:text-destructive"
            onClick={() => setBulkDeleteConfirmOpen(true)}
            disabled={selectedCount === 0 || Boolean(bulkAction)}
          >
            Delete
          </Button>
        )}
        <Select value={bulkStockBranchId} onValueChange={setBulkStockBranchId}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            {(branches ?? []).map((branch: any) => (
              <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          value={bulkStockDelta}
          onChange={(event) => setBulkStockDelta(parseInt(event.target.value || "0", 10) || 0)}
          placeholder="± Stock"
          className="h-8 w-24 text-xs"
          disabled={Boolean(bulkAction)}
        />
        <Input
          value={bulkStockReason}
          onChange={(event) => setBulkStockReason(event.target.value)}
          placeholder="Stock reason"
          className="h-8 w-36 text-xs"
          disabled={Boolean(bulkAction)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={runBulkStockAdjust}
          disabled={selectedCount === 0 || Boolean(bulkAction)}
        >
          Bulk Stock
        </Button>
        <Input
          type="number"
          min={0}
          value={bulkPriceOverride}
          onChange={(event) => setBulkPriceOverride(event.target.value)}
          placeholder="Price override"
          className="h-8 w-28 text-xs"
          disabled={Boolean(bulkAction)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => runBulkPriceOverride(false)}
          disabled={selectedCount === 0 || Boolean(bulkAction)}
        >
          Set Price
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => runBulkPriceOverride(true)}
          disabled={selectedCount === 0 || Boolean(bulkAction)}
        >
          Clear Price
        </Button>
      </BulkActionBar>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
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
      <Dialog
        open={!!adjusting}
        onOpenChange={(open) => {
          if (!open) {
            setAdjusting(null);
            setAdjustAmount(0);
            setAdjustReason("");
            setAdjustBranchId("");
          }
        }}
      >
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide">
              Adjust Branch Stock
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="mb-4">
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Branch</label>
              <Select value={adjustBranchId} onValueChange={setAdjustBranchId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {(branches ?? []).map((branch: any) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <div className="mt-4">
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Reason</label>
              <Input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="h-10"
                placeholder="Manual stock correction"
              />
            </div>
          </div>
          <Button onClick={handleAdjustStock} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            Apply Adjustment
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Variants</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedCount} selected variants. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkAction === "delete"}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBulkDelete} disabled={bulkAction === "delete"}>
              {bulkAction === "delete" ? "Deleting..." : "Delete Selected"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProductVariantsPage;