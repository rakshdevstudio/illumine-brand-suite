import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SmartVariantSelectorController } from "@/components/admin/purchases/SmartVariantSelector";
import { toast } from "sonner";

const PAGE_SIZE = 12;

type PurchaseRow = {
  id: string;
  purchase_number: string;
  status: string;
  purchase_date: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  vendors: { name: string } | null;
};

type VendorRef = { id: string; name: string; state_code: string | null };

type VariantRef = {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  status?: string | null;
  products: { name: string; school_id?: string | null } | null;
};

type SchoolRef = { id: string; name: string };

type ProductRef = {
  id: string;
  name: string;
  school_id: string | null;
  status?: string | null;
};

type PurchaseLine = {
  selectorInstanceId: string;
  schoolId: string;
  productId: string;
  variantId: string;
  variantIdentity: string;
  quantity: string;
  unitCost: string;
  gstPercentage: string;
};

type BranchRef = { id: string; name: string; state_code: string | null };

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value || 0);

const createEmptyLine = (): PurchaseLine => ({
  selectorInstanceId: crypto.randomUUID(),
  schoolId: "",
  productId: "",
  variantId: "",
  variantIdentity: "",
  quantity: "",
  unitCost: "",
  gstPercentage: "5",
});

const PurchasesPage = () => {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [vendorId, setVendorId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [sellerStateCode, setSellerStateCode] = useState("");
  const [vendorStateCode, setVendorStateCode] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([createEmptyLine()]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["erp-purchases"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("purchases")
        .select("id, purchase_number, status, purchase_date, subtotal, cgst, sgst, total, vendors(name)")
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PurchaseRow[];
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["erp-vendors-ref"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vendors").select("id, name, state_code").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as VendorRef[];
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["erp-purchase-schools-ref"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("schools").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as SchoolRef[];
    },
  });

  const selectedSchoolIds = useMemo(
    () => Array.from(new Set(lines.map((line) => line.schoolId).filter(Boolean))),
    [lines],
  );

  const { data: products = [] } = useQuery({
    queryKey: ["erp-purchase-products-ref", selectedSchoolIds.join("|")],
    enabled: selectedSchoolIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, school_id, status")
        .in("school_id", selectedSchoolIds)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductRef[];
    },
  });

  const selectedProductIds = useMemo(
    () => Array.from(new Set(lines.map((line) => line.productId).filter(Boolean))),
    [lines],
  );

  const { data: variants = [] } = useQuery({
    queryKey: ["erp-purchase-variants-ref", selectedProductIds.join("|")],
    enabled: selectedProductIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_variants")
        .select("id, product_id, sku, size, status, products(name)")
        .in("product_id", selectedProductIds)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VariantRef[];
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["erp-branches-ref"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("branches").select("id, name, state_code").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BranchRef[];
    },
  });

  const selectedBranch = useMemo(() => branches.find((b) => b.id === branchId) || null, [branches, branchId]);
  const selectedVendor = useMemo(() => vendors.find((v) => v.id === vendorId) || null, [vendors, vendorId]);
  const schoolById = useMemo(() => new Map(schools.map((school) => [school.id, school])), [schools]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const variantsByProductId = useMemo(() => {
    const grouped = new Map<string, VariantRef[]>();
    variants.forEach((variant) => {
      const bucket = grouped.get(variant.product_id) ?? [];
      bucket.push(variant);
      grouped.set(variant.product_id, bucket);
    });
    return grouped;
  }, [variants]);

  useEffect(() => {
    if (!branchId && branches.length > 0) {
      setBranchId(branches[0].id);
      setSellerStateCode((branches[0].state_code || "").toUpperCase());
    }
  }, [branchId, branches]);

  useEffect(() => {
    if (selectedBranch?.state_code) {
      setSellerStateCode(selectedBranch.state_code.toUpperCase());
    }
  }, [selectedBranch?.state_code]);

  useEffect(() => {
    if (selectedVendor?.state_code) {
      setVendorStateCode(selectedVendor.state_code.toUpperCase());
    }
  }, [selectedVendor?.state_code]);

  useEffect(() => {
    setLines((current) => {
      let changed = false;
      const next = current.map((line) => {
        let lineChanged = false;
        let schoolId = line.schoolId;
        let productId = line.productId;
        let variantId = line.variantId;

        if (schoolId && !productId) {
          const schoolProducts = products.filter((product) => product.school_id === schoolId);
          if (schoolProducts.length === 1) {
            productId = schoolProducts[0].id;
            lineChanged = true;
            changed = true;
          }
        }

        if (productId && !variantId) {
          const productVariants = variantsByProductId.get(productId) ?? [];
          if (productVariants.length === 1) {
            variantId = productVariants[0].id;
            lineChanged = true;
            changed = true;
          }
        }

        return lineChanged ? { ...line, schoolId, productId, variantId } : line;
      });

      return changed ? next : current;
    });
  }, [products, variantsByProductId]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [row.purchase_number, row.vendors?.name ?? ""].join(" ").toLowerCase().includes(q);
    });
  }, [data, search, status]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage]);

  const createPurchase = useMutation({
    mutationFn: async () => {
      if (!vendorId) throw new Error("Vendor is required");
      const sellerState = (sellerStateCode || selectedBranch?.state_code || "").trim().toUpperCase();
      const vendorState = (vendorStateCode || selectedVendor?.state_code || "").trim().toUpperCase();

      if (!sellerState) throw new Error("Seller state code is required");
      if (!vendorState) throw new Error("Vendor state code is required");

      const parsedItems = lines
        .filter((line) => line.variantId)
        .map((line) => {
          const variant = variants.find((v) => v.id === line.variantId);
          return {
            product_id: variant?.product_id ?? line.productId,
            variant_id: line.variantId,
            quantity: Number(line.quantity || 0),
            unit_cost: Number(line.unitCost || 0),
            gst_percentage: Number(line.gstPercentage || 0),
          };
        });

      if (!parsedItems.length) throw new Error("At least one line item is required");
      if (parsedItems.some((item) => !item.product_id || item.quantity <= 0 || item.unit_cost <= 0)) {
        throw new Error("Please complete valid quantity, product and a positive unit cost for all items");
      }

      const payload = {
        vendor_id: vendorId,
        branch_id: branchId || null,
        seller_state_code: sellerState,
        vendor_state_code: vendorState,
        purchase_date: purchaseDate,
        notes: notes || null,
        status: "received",
        items: parsedItems,
      };

      const { error } = await (supabase as any).rpc("create_purchase_with_ledger", {
        p_payload: payload,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Purchase created with inventory + ledger booking.");
      setVendorId("");
      setVendorStateCode("");
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setNotes("");
      setLines([createEmptyLine()]);
      setCreateOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["erp-purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["erp-ledger-entries"] }),
      ]);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create purchase."),
  });

  const updateLine = (index: number, patch: Partial<PurchaseLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const addLine = () => setLines((prev) => [...prev, createEmptyLine()]);
  const removeLine = (index: number) => {
    setLines((prev) => {
      if (prev.length <= 1) {
        return [createEmptyLine()];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const onExport = () => {
    const headers = ["Purchase #", "Vendor", "Status", "Purchase Date", "Subtotal", "CGST", "SGST", "Total"];
    const lines = rows.map((row) => [
      row.purchase_number,
      row.vendors?.name ?? "",
      row.status,
      row.purchase_date,
      String(row.subtotal),
      String(row.cgst),
      String(row.sgst),
      String(row.total),
    ]);
    const csv = [headers, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchases_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-light tracking-[0.1em] uppercase">Purchases</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{rows.length} records</p>
        </div>
        <Button variant="outline" onClick={onExport} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New Purchase</Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Create Purchase</DialogTitle>
              <DialogDescription>
                Provide vendor and state details so GST regime is computed correctly.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Select value={vendorId} onValueChange={setVendorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Purchase Date</Label>
                  <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Seller State Code</Label>
                  <Input value={sellerStateCode} onChange={(e) => setSellerStateCode(e.target.value.toUpperCase())} placeholder="KA" maxLength={2} />
                </div>
                <div className="space-y-2">
                  <Label>Vendor State Code</Label>
                  <Input value={vendorStateCode} onChange={(e) => setVendorStateCode(e.target.value.toUpperCase())} placeholder="MH" maxLength={2} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>

              <div className="space-y-2">
                <Label>Items</Label>
                <div className="grid gap-2 md:grid-cols-[1.3fr_1.3fr_1.7fr_0.7fr_0.8fr_0.8fr_auto] text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <span>School</span>
                  <span>Product</span>
                  <span>Variant</span>
                  <span>Qty</span>
                  <span>Unit Cost</span>
                  <span>GST %</span>
                  <span>Remove</span>
                </div>
                <div className="space-y-3">
                  {lines.map((line, idx) => (
                    <div key={line.selectorInstanceId} className="grid gap-2 md:grid-cols-[1.3fr_1.3fr_1.7fr_0.7fr_0.8fr_0.8fr_auto]">
                      <div>
                        <Input aria-label="School" value={schoolById.get(line.schoolId)?.name ?? "—"} readOnly placeholder="School" />
                      </div>
                      <div>
                        <Input aria-label="Product" value={productById.get(line.productId)?.name ?? "—"} readOnly placeholder="Product" />
                      </div>
                      <div>
                        <SmartVariantSelectorController
                          selectorInstanceId={line.selectorInstanceId}
                          selectedVariantId={line.variantId}
                          selectedSchoolId={line.schoolId}
                          selectedProductId={line.productId}
                          triggerLabel={line.variantIdentity || "Select variant"}
                          onSelect={({ dto, identity }) => {
                            updateLine(idx, {
                              schoolId: dto.schoolId,
                              productId: dto.productId,
                              variantId: dto.variantId,
                              variantIdentity: `${identity.primary} • ${identity.tertiary}`,
                              gstPercentage: "5",
                            });
                          }}
                        />
                      </div>
                      <div>
                        <Input aria-label="Quantity" type="number" min={1} value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} placeholder="Qty" />
                      </div>
                      <div>
                        <Input aria-label="Unit Cost" type="number" min={0.01} step="0.01" value={line.unitCost} onChange={(e) => updateLine(idx, { unitCost: e.target.value })} placeholder="Unit Cost" />
                      </div>
                      <div>
                        <Input aria-label="GST Percentage" type="number" min={0} step="0.01" value={line.gstPercentage} onChange={(e) => updateLine(idx, { gstPercentage: e.target.value })} placeholder="GST %" />
                      </div>
                      <div>
                        <Button type="button" variant="outline" onClick={() => removeLine(idx)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" onClick={addLine}>
                  Add Line
                </Button>
              </div>

              <Button onClick={() => createPurchase.mutate()} disabled={createPurchase.isPending}>
                {createPurchase.isPending ? "Creating..." : "Create Purchase"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load purchases: {(error as Error).message}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by purchase # or vendor" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Purchase #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Subtotal</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && !paged.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  No purchases found.
                </TableCell>
              </TableRow>
            )}
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  Loading purchases...
                </TableCell>
              </TableRow>
            )}
            {paged.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.purchase_number}</TableCell>
                <TableCell>{row.vendors?.name ?? "-"}</TableCell>
                <TableCell className="capitalize">{row.status}</TableCell>
                <TableCell>{new Date(row.purchase_date).toLocaleDateString("en-IN")}</TableCell>
                <TableCell>{formatCurrency(row.subtotal)}</TableCell>
                <TableCell>{formatCurrency((row.cgst || 0) + (row.sgst || 0))}</TableCell>
                <TableCell>{formatCurrency(row.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Page {currentPage} / {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PurchasesPage;
