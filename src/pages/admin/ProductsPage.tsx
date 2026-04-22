import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Globe } from "lucide-react";
import { getDisplayImage } from "@/lib/product-images";
import ProductImageUploader from "@/components/admin/ProductImageUploader";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity-log";
import { archiveProduct, hardDeleteProduct, restoreProduct } from "@/lib/product-lifecycle";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { logger } from "@/lib/logger";

const defaultCategories = ["Shirt", "Pant", "Blazer", "Tie", "Skirt", "Sweater"];
const genders = ["Male", "Female", "Unisex"];

type VariantDraft = {
  tempId: string;
  size: string;
  initialStock: string;
  lowStockThreshold: string;
  priceOverride: string;
};

type ProductFormState = {
  name: string;
  category: string;
  price: string;
  description: string;
  school_id: string;
  class_id: string;
  gender: string;
};

const createVariantDraft = (): VariantDraft => ({
  tempId: crypto.randomUUID(),
  size: "",
  initialStock: "0",
  lowStockThreshold: "5",
  priceOverride: "",
});

const fieldLabels: Record<string, string> = {
  name: "Name",
  category: "Category",
  price: "Price",
  description: "Description",
  school_id: "School",
  class_id: "Class",
  gender: "Gender",
  status: "Status",
};

const isMissingColumnError = (error: any, columnName: string) => {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "PGRST204" || message.includes(columnName.toLowerCase());
};

const ProductsPage = () => {
  const queryClient = useQueryClient();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { session } = useRequireAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkActionLabel, setBulkActionLabel] = useState("");
  const [bulkMode, setBulkMode] = useState<"restore" | "archive" | "price" | null>(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<any>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState<ProductFormState>({
    name: "",
    category: "",
    price: "",
    description: "",
    school_id: "",
    class_id: "",
    gender: "",
  });
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([createVariantDraft()]);
  const [inventoryBranchId, setInventoryBranchId] = useState("");

  const { data: products, isLoading } = useQuery<any[]>({
    queryKey: ["admin-products-list", viewMode],
    queryFn: async () => {
      const client = supabase as any;
      const baseQuery = () =>
        client
          .from("products")
          .select("*, schools(name, slug), classes(name), product_images(*)")
          .order("name");

      const deletedAtAttempt = viewMode === "archived"
        ? await baseQuery().not("deleted_at", "is", null)
        : await baseQuery().is("deleted_at", null);

      if (!deletedAtAttempt.error) {
        return deletedAtAttempt.data ?? [];
      }

      if (!isMissingColumnError(deletedAtAttempt.error, "deleted_at")) {
        throw deletedAtAttempt.error;
      }

      logger.warn("Products query fallback: deleted_at column missing, using is_active lifecycle field", {
        viewMode,
        error: deletedAtAttempt.error,
      });

      const isActiveAttempt = await baseQuery()
        .eq("is_active", viewMode !== "archived");

      if (!isActiveAttempt.error) {
        return isActiveAttempt.data ?? [];
      }

      throw isActiveAttempt.error;
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

  const { data: branches } = useQuery({
    queryKey: ["admin-branches-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
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

  const schoolOptions = useMemo(() => {
    const schoolIds = Array.from(new Set((products ?? []).map((product: any) => product.school_id).filter(Boolean)));

    return schoolIds
      .map((schoolId) => ({
        value: String(schoolId),
        label: schools?.find((school) => school.id === schoolId)?.name ?? String(schoolId),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products, schools]);

  const classOptions = useMemo(() => {
    const classIds = Array.from(new Set((products ?? []).map((product: any) => product.class_id).filter(Boolean)));

    return classIds
      .map((classId) => ({
        value: String(classId),
        label: classes?.find((classItem: any) => classItem.id === classId)?.name ?? String(classId),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products, classes]);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return (products ?? []).filter((product: any) => {
      const productName = String(product.name ?? "").toLowerCase();
      const productSku = String(product.sku ?? "").toLowerCase();
      const productCategory = String(product.category ?? "");
      const productStatus = String(product.status ?? (product.archived ? "archived" : "")).toLowerCase();
      const productStock = typeof product.stock === "number" ? product.stock : null;
      const isProductActive = productStock !== null
        ? productStock > 0
        : productStatus === "active" || (!productStatus && !product.archived);
      const isProductOutOfStock = productStock !== null
        ? productStock <= 0
        : ["out_of_stock", "out-of-stock", "inactive", "archived"].includes(productStatus);

      if (query && !productName.includes(query) && !productSku.includes(query)) {
        return false;
      }

      if (schoolFilter !== "all" && String(product.school_id ?? "") !== schoolFilter) {
        return false;
      }

      if (classFilter !== "all" && String(product.class_id ?? "") !== classFilter) {
        return false;
      }

      if (categoryFilter !== "all" && productCategory !== categoryFilter) {
        return false;
      }

      if (statusFilter === "active" && !isProductActive) {
        return false;
      }

      if (statusFilter === "out-of-stock" && !isProductOutOfStock) {
        return false;
      }

      return true;
    });
  }, [products, searchTerm, schoolFilter, classFilter, categoryFilter, statusFilter]);

  const getSchoolName = (schoolId: string | null) => {
    if (!schoolId) return "None";
    return schools?.find((s) => s.id === schoolId)?.name ?? schoolId;
  };

  const getClassName = (classId: string | null) => {
    if (!classId) return "None";
    return classes?.find((c: any) => c.id === classId)?.name ?? classId;
  };

  const formatFieldValue = (field: string, value: any) => {
    if (field === "price") return formatPrice(Number(value || 0));
    if (field === "school_id") return getSchoolName(value ?? null);
    if (field === "class_id") return getClassName(value ?? null);
    if (field === "description") return value || "Empty";
    if (field === "status") return String(value || "active").toUpperCase();
    return value ?? "—";
  };

  const refreshProductAndLogQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-products-list"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
    ]);
  };

  const resetProductForm = () => {
    setForm({
      name: "",
      category: "",
      price: "",
      description: "",
      school_id: "",
      class_id: "",
      gender: "",
    });
    setVariantDrafts([createVariantDraft()]);
    setInventoryBranchId((branches ?? []).find((branch: any) => branch.is_active !== false)?.id ?? "");
  };

  const handleSave = async () => {
    if (!form.name || !form.category) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!form.price) {
      toast.error("Price is required");
      return;
    }

    if (!form.school_id) {
      toast.error("School is required");
      return;
    }

    if (!form.class_id) {
      toast.error("Class is required");
      return;
    }

    if (!form.gender) {
      toast.error("Gender is required");
      return;
    }

    const parsedPrice = parseFloat(form.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Please enter a valid base price");
      return;
    }

    if (!editing) {
      const normalizedDrafts = variantDrafts
        .map((draft) => ({
          ...draft,
          size: draft.size.trim(),
        }))
        .filter((draft) => draft.size.length > 0);

      if (normalizedDrafts.length === 0) {
        toast.error("Add at least one size to create a product");
        return;
      }

      const duplicateSizes = normalizedDrafts.filter(
        (draft, index, drafts) =>
          drafts.findIndex((current) => current.size.toLowerCase() === draft.size.toLowerCase()) !== index,
      );

      if (duplicateSizes.length > 0) {
        toast.error("Each size can only be added once");
        return;
      }

      const requiresInventoryBranch = normalizedDrafts.some((draft) => Number(draft.initialStock || 0) > 0);
      if (requiresInventoryBranch && !inventoryBranchId) {
        toast.error("Select the branch that should receive the initial stock");
        return;
      }
    }

    try {
      const payload: any = {
        name: form.name.trim(),
        school_id: form.school_id || null,
        class_id: form.class_id || null,
        category: form.category.trim(),
        gender: form.gender,
        price: Number(parsedPrice),
        base_price: Number(parsedPrice),
        description: form.description.trim() || null,
      };

      let savedProductId: string | null = editing?.id ?? null;

      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;

        const changes = [
          { field: "name", oldValue: editing.name, newValue: payload.name },
          { field: "category", oldValue: editing.category, newValue: payload.category },
          { field: "price", oldValue: Number((editing as any).base_price ?? editing.price), newValue: payload.price },
          { field: "description", oldValue: editing.description ?? null, newValue: payload.description ?? null },
          { field: "school_id", oldValue: editing.school_id ?? null, newValue: payload.school_id ?? null },
          { field: "class_id", oldValue: editing.class_id ?? null, newValue: payload.class_id ?? null },
          { field: "gender", oldValue: editing.gender ?? "-", newValue: payload.gender },
        ].filter((change) => String(change.oldValue ?? "") !== String(change.newValue ?? ""));

        await Promise.all(
          changes.map((change) =>
            logActivity({
              actionType: "PRODUCT_EDITED",
              entityType: "product",
              entityId: editing.id,
              description: `${fieldLabels[change.field]} updated for ${payload.name}: ${formatFieldValue(change.field, change.oldValue)} → ${formatFieldValue(change.field, change.newValue)}`,
              performedBy: user?.id,
              fieldChanged: change.field,
              oldValue: String(formatFieldValue(change.field, change.oldValue)),
              newValue: String(formatFieldValue(change.field, change.newValue)),
            })
          )
        );

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
          const normalizedDrafts = variantDrafts
            .map((draft) => ({
              size: draft.size.trim(),
              initialStock: Math.max(0, Number(draft.initialStock || 0)),
              lowStockThreshold: Math.max(0, Number(draft.lowStockThreshold || 0)),
              priceOverride: draft.priceOverride.trim() ? Number(draft.priceOverride) : null,
            }))
            .filter((draft) => draft.size.length > 0);

          const { data: createdVariants, error: variantError } = await supabase
            .from("product_variants")
            .insert(
              normalizedDrafts.map((draft) => ({
                product_id: savedProductId,
                size: draft.size,
                price_override: draft.priceOverride,
                low_stock_threshold: draft.lowStockThreshold,
              })),
            )
            .select("id, size");

          if (variantError) throw variantError;

          for (const draft of normalizedDrafts) {
            if (!inventoryBranchId || draft.initialStock <= 0) continue;
            const createdVariant = (createdVariants ?? []).find((variant: any) => variant.size === draft.size);
            if (!createdVariant?.id) continue;

            const { error: stockError } = await (supabase as any).rpc("adjust_inventory", {
              p_branch_id: inventoryBranchId,
              p_variant_id: createdVariant.id,
              p_quantity: draft.initialStock,
              p_reason: "Initial stock seeded during product creation",
              p_reference_id: null,
            });

            if (stockError) throw stockError;
          }

          await logActivity({
            actionType: "PRODUCT_CREATED",
            entityType: "product",
            entityId: savedProductId,
            description: `Admin created product "${payload.name}" with ${normalizedDrafts.length} size option${normalizedDrafts.length === 1 ? "" : "s"}`,
            performedBy: user?.id,
          });
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

      await refreshProductAndLogQueries();
      queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inventory-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-low-stock-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-variants"] });
      setDialogOpen(false);
      setEditing(null);
      resetProductForm();
    } catch (err: any) {
      logger.error("Failed to save product", err);
      toast.error(err?.message || "Failed to save product");
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) {
      return;
    }

    try {
      if (!archiveTarget.archived) {
        await archiveProduct({ productId: archiveTarget.id });
        toast.success("Product archived");
      } else {
        await restoreProduct({ productId: archiveTarget.id });
        toast.success("Product restored");
      }
      setArchiveTarget(null);
      await refreshProductAndLogQueries();
    } catch (err: any) {
      logger.error("Failed to update product lifecycle", err);
      toast.error(err?.message || "Failed to update product");
    }
  };

  const handleHardDeleteConfirm = async () => {
    if (!hardDeleteTarget) {
      return;
    }

    if (!session?.user?.id) {
      toast.error("Authenticated admin user is required");
      return;
    }

    try {
      await hardDeleteProduct({ productId: hardDeleteTarget.id });
      await logActivity({
        actionType: "PRODUCT_DELETED",
        entityType: "products",
        entityId: hardDeleteTarget.id,
        description: `Product ${hardDeleteTarget.name} deleted permanently`,
        performedBy: session.user.id,
      });
      toast.success("Product deleted permanently");
      setHardDeleteTarget(null);
      await refreshProductAndLogQueries();
    } catch (err: any) {
      logger.error("Failed to hard delete product", err);
      toast.error(err?.message || "Failed to permanently delete product");
    }
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
      gender: product.gender ?? "",
    });
    setVariantDrafts([createVariantDraft()]);
    setInventoryBranchId((branches ?? []).find((branch: any) => branch.is_active !== false)?.id ?? "");
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    resetProductForm();
    setDialogOpen(true);
  };

  const getSchoolSlug = (schoolId: string | null) => {
    if (!schoolId) return "general";
    return schools?.find((s) => s.id === schoolId)?.slug ?? "general";
  };

  const refreshImages = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
  };

  const canDelete = isAdmin || isSuperAdmin;

  const allIds = filteredProducts.map((p) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const clearFilters = () => {
    setSearchTerm("");
    setSchoolFilter("all");
    setClassFilter("all");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

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

  const openBulkConfirm = (mode: "restore" | "archive" | "price", label: string) => {
    setBulkMode(mode);
    setBulkActionLabel(label);
    setBulkConfirmOpen(true);
  };

  const runBulkAction = async () => {
    if (selectedIds.length === 0 || !bulkMode) return;

    if (bulkMode === "restore" || bulkMode === "archive") {
      try {
        await Promise.all(
          selectedIds.map((productId) =>
            bulkMode === "archive"
              ? archiveProduct({ productId })
              : restoreProduct({ productId })
          )
        );
        toast.success(`${bulkMode === "archive" ? "Archived" : "Restored"} ${selectedIds.length} products`);
      } catch (err: any) {
        logger.error("Bulk lifecycle action failed", err);
        toast.error(err?.message || "Bulk update failed");
        return;
      }
    }

    if (bulkMode === "price") {
      const parsed = parseFloat(bulkPrice);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Enter a valid price");
        return;
      }
      const { error } = await supabase
        .from("products")
        .update({ price: parsed, base_price: parsed })
        .in("id", selectedIds);
      if (error) {
        toast.error("Failed to update price");
        return;
      }
      toast.success(`Updated price for ${selectedIds.length} products`);
    }

    setBulkConfirmOpen(false);
    setBulkMode(null);
    setSelectedIds([]);
    await refreshProductAndLogQueries();
  };

  const exportSelectedProducts = () => {
    const selectedProducts = (products ?? []).filter((p) => selectedIds.includes(p.id));
    const header = ["Product ID", "Name", "School", "Class", "Category", "Price", "Status"];
    const lines = selectedProducts.map((p: any) =>
      [
        p.id,
        p.name,
        p.schools?.name ?? "",
        p.classes?.name ?? "",
        p.category,
        (p as any).base_price ?? p.price,
        p.status ?? "active",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Products</h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-border bg-white p-1">
            <button
              type="button"
              onClick={() => {
                setSelectedIds([]);
                setViewMode("active");
              }}
              className={`h-8 px-3 text-xs tracking-[0.16em] uppercase transition-colors ${viewMode === "active" ? "bg-black text-white" : "text-muted-foreground"}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedIds([]);
                setViewMode("archived");
              }}
              className={`h-8 px-3 text-xs tracking-[0.16em] uppercase transition-colors ${viewMode === "archived" ? "bg-black text-white" : "text-muted-foreground"}`}
            >
              Archived
            </button>
          </div>
          <Button onClick={openCreate} className="text-xs tracking-[0.2em] uppercase h-10 px-6">
            <Plus className="h-3 w-3 mr-2" /> Add Product
          </Button>
        </div>
      </div>

      <div className="mb-4 border border-border bg-background p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products..."
            className="h-10 lg:col-span-2"
          />
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All schools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              {schoolOptions.map((school) => (
                <SelectItem key={school.value} value={school.value}>{school.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classOptions.map((classItem) => (
                <SelectItem key={classItem.value} value={classItem.value}>{classItem.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="out-of-stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            Clear Filters
          </Button>
          {searchTerm && <span className="rounded-full border border-border bg-muted px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Search: {searchTerm}</span>}
          {schoolFilter !== "all" && <span className="rounded-full border border-border bg-muted px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">School: {schoolOptions.find((school) => school.value === schoolFilter)?.label ?? schoolFilter}</span>}
          {classFilter !== "all" && <span className="rounded-full border border-border bg-muted px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Class: {classOptions.find((classItem) => classItem.value === classFilter)?.label ?? classFilter}</span>}
          {categoryFilter !== "all" && <span className="rounded-full border border-border bg-muted px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Category: {categoryFilter}</span>}
          {statusFilter !== "all" && <span className="rounded-full border border-border bg-muted px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Status: {statusFilter === "active" ? "Active" : "Out of Stock"}</span>}
        </div>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) => toggleSelectAll(Boolean(value))}
                  aria-label="Select all products"
                />
              </TableHead>
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
                <TableCell colSpan={11} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-sm text-muted-foreground">No products match the current filters</TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(product.id)}
                      onCheckedChange={(value) => toggleSelectOne(product.id, Boolean(value))}
                      aria-label={`Select product ${product.name}`}
                    />
                  </TableCell>
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
                  <TableCell className="text-sm text-muted-foreground">{(product as any).gender ?? "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{product.category}</TableCell>
                  <TableCell className="text-sm">{formatPrice((product as any).base_price ?? product.price)}</TableCell>
                  <TableCell>
                    <span className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                      product.archived
                        ? "border-amber-200 text-amber-700"
                        : "border-border text-foreground"
                    }`}>
                      {product.archived ? "archived" : "active"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(product)}>Edit</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setArchiveTarget(product)}
                      >
                        {product.archived ? "Restore" : "Archive"}
                      </Button>
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-destructive border-destructive/30 hover:text-destructive"
                          onClick={() => setHardDeleteTarget(product)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
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
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={() => openBulkConfirm(viewMode === "active" ? "archive" : "restore", viewMode === "active" ? "Archive Products" : "Restore Products")}
          >
            {viewMode === "active" ? "Archive" : "Restore"}
          </Button>
          <Input
            placeholder="Price"
            value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)}
            className="h-8 w-24 text-xs bg-white text-black"
          />
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => openBulkConfirm("price", "Update Price")}>Update Price</Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={exportSelectedProducts}>Export</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-white hover:text-white" onClick={() => setSelectedIds([])}>Clear</Button>
        </div>
      )}

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkActionLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to apply this action to {selectedIds.length} selected products?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBulkAction}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archiveTarget?.archived ? "Restore Product" : "Archive Product"}</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.archived
                ? "This will restore the product, its variants, and school mappings."
                : "Are you sure you want to archive this product?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>
              {archiveTarget?.archived ? "Restore" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(hardDeleteTarget)} onOpenChange={(open) => { if (!open) setHardDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the product and related variant catalog data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleHardDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); resetProductForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">
              {editing ? "Edit Product" : "Add Product"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground tracking-wide">
              Keep product details, size options, and initial inventory in one place.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-8 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-4">
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
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
              <div className="grid gap-4 md:grid-cols-2">
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
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Price (₹)</label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="h-10" placeholder="1200" />
                </div>
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

            {!editing ? (
              <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
                <div>
                  <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sizes and Inventory</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create every size here and seed its starting stock into one branch. Inventory remains the only stock source after creation.
                  </p>
                </div>

                <div>
                  <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Initial Stock Branch</label>
                  <Select value={inventoryBranchId} onValueChange={setInventoryBranchId}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select active branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {(branches ?? [])
                        .filter((branch: any) => branch.is_active !== false)
                        .map((branch: any) => (
                          <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  {variantDrafts.map((variantDraft, index) => (
                    <div key={variantDraft.tempId} className="rounded-xl border border-border bg-background p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Size {index + 1}</p>
                        {variantDrafts.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setVariantDrafts((current) => current.filter((draft) => draft.tempId !== variantDraft.tempId))}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Size</label>
                          <Input
                            value={variantDraft.size}
                            onChange={(e) => setVariantDrafts((current) => current.map((draft) => draft.tempId === variantDraft.tempId ? { ...draft, size: e.target.value } : draft))}
                            className="h-10"
                            placeholder="28, 30, S"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Initial Stock</label>
                          <Input
                            type="number"
                            min={0}
                            value={variantDraft.initialStock}
                            onChange={(e) => setVariantDrafts((current) => current.map((draft) => draft.tempId === variantDraft.tempId ? { ...draft, initialStock: e.target.value } : draft))}
                            className="h-10"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Low Stock Threshold</label>
                          <Input
                            type="number"
                            min={0}
                            value={variantDraft.lowStockThreshold}
                            onChange={(e) => setVariantDrafts((current) => current.map((draft) => draft.tempId === variantDraft.tempId ? { ...draft, lowStockThreshold: e.target.value } : draft))}
                            className="h-10"
                            placeholder="5"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Price Override</label>
                          <Input
                            type="number"
                            min={0}
                            value={variantDraft.priceOverride}
                            onChange={(e) => setVariantDrafts((current) => current.map((draft) => draft.tempId === variantDraft.tempId ? { ...draft, priceOverride: e.target.value } : draft))}
                            className="h-10"
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full text-xs uppercase tracking-[0.18em]"
                  onClick={() => setVariantDrafts((current) => [...current, createVariantDraft()])}
                >
                  Add Another Size
                </Button>
              </div>
            ) : null}
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
