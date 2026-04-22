import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOW_STOCK_LIMIT, getLowStockThreshold, isLowStock } from "@/lib/inventory";

const ALL_FILTER_VALUE = "all";

const getStatusBadgeClass = (status: string) => {
  if (status === "Critical") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "Low") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
};

const isMissingRpcError = (error: any) => {
  const message = String(error?.message ?? "").toLowerCase();
  const details = String(error?.details ?? "").toLowerCase();
  const hint = String(error?.hint ?? "").toLowerCase();

  return (
    error?.code === "PGRST202" ||
    message.includes("could not find the function") ||
    details.includes("could not find the function") ||
    hint.includes("perhaps you meant")
  );
};

const InventoryAlertsPage = () => {
  const db = supabase as any;
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [thresholdColumnForcedUnavailable, setThresholdColumnForcedUnavailable] = useState(false);
  const [schoolFilter, setSchoolFilter] = useState(ALL_FILTER_VALUE);
  const [classFilter, setClassFilter] = useState(ALL_FILTER_VALUE);
  const [genderFilter, setGenderFilter] = useState(ALL_FILTER_VALUE);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const { data: schools = [] } = useQuery({
    queryKey: ["inventory-alerts-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["inventory-alerts-classes", schoolFilter],
    queryFn: async () => {
      let query = supabase.from("classes").select("id, name, school_id").order("sort_order");
      if (schoolFilter !== ALL_FILTER_VALUE) {
        query = query.eq("school_id", schoolFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const genderOptions = [
    { label: "Boys", value: "Male" },
    { label: "Girls", value: "Female" },
    { label: "Unisex", value: "Unisex" },
  ];

  const { data: variants, isLoading, isError, error } = useQuery({
    queryKey: ["admin-inventory-alerts", schoolFilter, classFilter, genderFilter],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_inventory_alerts", {
        p_school_id: schoolFilter === ALL_FILTER_VALUE ? null : schoolFilter,
        p_class_id: classFilter === ALL_FILTER_VALUE ? null : classFilter,
        p_gender: genderFilter === ALL_FILTER_VALUE ? null : genderFilter,
      });

      if (!error) return data ?? [];

      if (!isMissingRpcError(error)) {
        throw error;
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          low_stock_threshold,
          status,
          products!inner(
            id,
            name,
            school_id,
            class_id,
            gender,
            schools(name),
            classes(name),
            product_assignments(
              school_id,
              class_id,
              gender,
              schools(name),
              classes(name)
            )
          ),
          branch_inventory(stock)
        `)
        .eq("status", "active");

      if (fallbackError) {
        throw fallbackError;
      }

      const normalized = (fallbackData ?? [])
        .flatMap((variant: any) => {
          const currentStock = Number((variant.branch_inventory ?? []).reduce((sum: number, row: any) => sum + Number(row.stock ?? 0), 0));
          const alertThreshold = Number(variant.low_stock_threshold ?? LOW_STOCK_LIMIT);
          const status = currentStock <= 0 ? "Critical" : currentStock <= alertThreshold ? "Low" : "Healthy";

          const assignments = variant.products?.product_assignments ?? [];
          const contexts = assignments.length > 0 ? assignments : [null];

          return contexts.map((assignment: any) => ({
            variant_id: variant.id,
            product_name: variant.products?.name ?? "Product",
            size: variant.size ?? "Default",
            school_id: assignment?.school_id ?? variant.products?.school_id ?? null,
            school: assignment?.schools?.name ?? variant.products?.schools?.name ?? "Unassigned School",
            class_id: assignment?.class_id ?? variant.products?.class_id ?? null,
            class: assignment?.classes?.name ?? variant.products?.classes?.name ?? "Unassigned Class",
            gender: assignment?.gender ?? variant.products?.gender ?? "Unassigned Gender",
            current_stock: currentStock,
            alert_threshold: alertThreshold,
            status,
          }));
        })
        .filter((row: any) => schoolFilter === ALL_FILTER_VALUE || row.school_id === schoolFilter)
        .filter((row: any) => classFilter === ALL_FILTER_VALUE || row.class_id === classFilter)
        .filter((row: any) => genderFilter === ALL_FILTER_VALUE || String(row.gender).toLowerCase() === String(genderFilter).toLowerCase())
        .sort((a: any, b: any) => {
          const rank = (status: string) => {
            if (status === "Critical") return 0;
            if (status === "Low") return 1;
            return 2;
          };
          const statusRankDiff = rank(String(a.status)) - rank(String(b.status));
          if (statusRankDiff !== 0) return statusRankDiff;
          if (a.current_stock !== b.current_stock) return a.current_stock - b.current_stock;
          return String(a.product_name).localeCompare(String(b.product_name));
        });

      return normalized;
    },
    retry: false,
  });

  const rows = variants ?? [];
  const getRowKey = (variant: any) =>
    `${variant.variant_id}:${variant.school_id ?? "na"}:${variant.class_id ?? "na"}:${variant.gender ?? "na"}`;

  const visibleRowKeys = useMemo(() => rows.map((variant: any) => getRowKey(variant)), [rows]);
  const selectedVisibleCount = useMemo(
    () => visibleRowKeys.filter((key) => selectedRowKeys.includes(key)).length,
    [visibleRowKeys, selectedRowKeys],
  );
  const allVisibleSelected = visibleRowKeys.length > 0 && selectedVisibleCount === visibleRowKeys.length;
  const headerCheckboxState: boolean | "indeterminate" =
    selectedVisibleCount > 0 && !allVisibleSelected ? "indeterminate" : allVisibleSelected;

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) {
      setSelectedRowKeys((current) => Array.from(new Set([...current, ...visibleRowKeys])));
      return;
    }

    setSelectedRowKeys((current) => current.filter((key) => !visibleRowKeys.includes(key)));
  };

  const toggleSelectOne = (rowKey: string, checked: boolean) => {
    setSelectedRowKeys((current) =>
      checked ? Array.from(new Set([...current, rowKey])) : current.filter((key) => key !== rowKey),
    );
  };

  const thresholdColumnAvailable = !thresholdColumnForcedUnavailable && (
    rows.length === 0 || rows.some((variant: any) => Object.prototype.hasOwnProperty.call(variant, "alert_threshold"))
  );

  const getDraftValue = (variant: any) => {
    const key = variant.variant_id;
    if (drafts[key] !== undefined) return drafts[key];
    return String(getLowStockThreshold(variant.alert_threshold));
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
          Context-rich low stock alerts with school, class, and gender metadata for immediate action.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 mb-6">
        <Select
          value={schoolFilter}
          onValueChange={(value) => {
            setSchoolFilter(value);
            setClassFilter(ALL_FILTER_VALUE);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Schools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All Schools</SelectItem>
            {schools.map((school: any) => (
              <SelectItem key={school.id} value={school.id}>{school.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger>
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All Classes</SelectItem>
            {classes.map((schoolClass: any) => (
              <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger>
            <SelectValue placeholder="All Genders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All Genders</SelectItem>
            {genderOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {selectedVisibleCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="text-xs tracking-[0.14em] uppercase text-muted-foreground">
            {selectedVisibleCount} row{selectedVisibleCount === 1 ? "" : "s"} selected
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setSelectedRowKeys((current) => current.filter((key) => !visibleRowKeys.includes(key)))}
          >
            Clear Selection
          </Button>
        </div>
      )}

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={headerCheckboxState}
                  onCheckedChange={(value) => toggleSelectAllVisible(Boolean(value))}
                  aria-label="Select all visible inventory alerts"
                />
              </TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Product</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Size</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">School</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Class</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Gender</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Current Stock</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Alert Threshold</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-sm text-destructive">
                  {(error as Error)?.message || "Failed to load inventory alerts"}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">
                  No variants found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((variant: any) => {
                const rowKey = getRowKey(variant);
                const threshold = getLowStockThreshold(variant.alert_threshold);
                const lowStock = isLowStock(variant.current_stock, variant.alert_threshold);
                const draftValue = getDraftValue(variant);
                const isDirty = draftValue !== String(threshold);

                return (
                  <TableRow key={rowKey} className={lowStock ? "bg-red-50" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRowKeys.includes(rowKey)}
                        onCheckedChange={(value) => toggleSelectOne(rowKey, Boolean(value))}
                        aria-label={`Select ${variant.product_name || "product"} ${variant.size || "variant"}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm font-medium">{variant.product_name || "Product"}</TableCell>
                    <TableCell className="text-sm">{variant.size}</TableCell>
                    <TableCell className="text-sm">{variant.school}</TableCell>
                    <TableCell className="text-sm">{variant.class}</TableCell>
                    <TableCell className="text-sm">{variant.gender}</TableCell>
                    <TableCell className={lowStock ? "text-red-600 font-medium" : "text-sm font-medium"}>
                      {variant.current_stock}
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
                      <Badge className={getStatusBadgeClass(String(variant.status || "Low"))}>{variant.status}</Badge>
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
