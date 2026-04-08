import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertsPanel,
  FilterField,
  FilterMultiSelect,
  ReportEmptyState,
  ReportExportPanel,
  ReportFiltersPanel,
  ReportMetricCard,
  ReportMetricSkeleton,
  ReportPageFrame,
  ReportPagination,
  ReportTableSkeleton,
  SmartInsightsPanel,
} from "@/components/admin/reports/ReportUI";
import {
  aggregateInventoryRows,
  fetchClassOptions,
  fetchInventoryAuditRows,
  fetchInventoryGenderOptions,
  fetchInventoryReportRows,
  fetchProductOptions,
  fetchSchoolOptions,
} from "@/lib/reports/data";
import { exportReportCsv, exportReportXlsx } from "@/lib/reports/export";
import { formatDateTime, formatNumber, getDefaultDateRange, getRangeSpanDays, paginateRows } from "@/lib/reports/format";
import type { AggregatedInventoryReportRow, InventoryReportFilters, ReportAlert, SmartInsight } from "@/lib/reports/types";
import type { ReportExportConfig } from "@/types/reports";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/error-state";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const InventoryReportPage = () => {
  const { isChecking } = useRequireAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const parseListParam = (value: string | null) =>
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

  const initialFilters = useMemo<InventoryReportFilters>(
    () => ({
      dateRange: {
        from: searchParams.get("from") ?? getDefaultDateRange(30).from,
        to: searchParams.get("to") ?? getDefaultDateRange(30).to,
      },
      productIds: parseListParam(searchParams.get("products")),
      schoolIds: parseListParam(searchParams.get("schools")),
      classIds: parseListParam(searchParams.get("classes")),
      genders: parseListParam(searchParams.get("genders")),
      negativeOnly: searchParams.get("negativeOnly") === "1",
    }),
    [searchParams],
  );

  const [filters, setFilters] = useState<InventoryReportFilters>({
    dateRange: initialFilters.dateRange,
    productIds: initialFilters.productIds,
    schoolIds: initialFilters.schoolIds,
    classIds: initialFilters.classIds,
    genders: initialFilters.genders,
    negativeOnly: initialFilters.negativeOnly,
  });
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<AggregatedInventoryReportRow | null>(null);

  const { data: products = [], error: productsError } = useQuery({
    queryKey: ["report-products"],
    queryFn: fetchProductOptions,
    staleTime: 5 * 60_000,
  });

  const { data: schools = [], error: schoolsError } = useQuery({
    queryKey: ["report-schools"],
    queryFn: fetchSchoolOptions,
    staleTime: 5 * 60_000,
  });

  const { data: classes = [], error: classesError } = useQuery({
    queryKey: ["report-classes"],
    queryFn: fetchClassOptions,
    staleTime: 5 * 60_000,
  });

  const { data: genders = [], error: gendersError } = useQuery({
    queryKey: ["report-inventory-genders"],
    queryFn: fetchInventoryGenderOptions,
    staleTime: 5 * 60_000,
  });

  const { data: dailyRows = [], isLoading, error: dailyRowsError } = useQuery({
    queryKey: ["report-inventory", filters],
    queryFn: () => fetchInventoryReportRows(filters),
  });

  const { data: auditRows = [], isLoading: auditLoading, error: auditRowsError } = useQuery({
    queryKey: ["report-inventory-audit", selectedRow?.variant_id],
    enabled: Boolean(selectedRow),
    queryFn: () => fetchInventoryAuditRows(selectedRow!.variant_id),
  });

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("from", filters.dateRange.from);
    next.set("to", filters.dateRange.to);
    if (filters.productIds.length) next.set("products", filters.productIds.join(","));
    if (filters.schoolIds.length) next.set("schools", filters.schoolIds.join(","));
    if (filters.classIds.length) next.set("classes", filters.classIds.join(","));
    if (filters.genders.length) next.set("genders", filters.genders.join(","));
    if (filters.negativeOnly) next.set("negativeOnly", "1");
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const rows = useMemo(() => aggregateInventoryRows(dailyRows), [dailyRows]);

  const spanDays = useMemo(() => getRangeSpanDays(filters.dateRange), [filters.dateRange]);

  const enrichedRows = useMemo(
    () =>
      rows.map((row) => {
        const velocityPerDay = spanDays > 0 ? row.stock_out / spanDays : 0;
        const daysToStockout = velocityPerDay > 0 ? Math.max(0, Math.round(row.current_stock / velocityPerDay)) : null;
        const health =
          row.current_stock <= 0 ? "Critical" : row.current_stock <= 5 ? "Low" : row.stock_out === 0 && row.current_stock > 20 ? "Dead Stock" : "Healthy";
        const slowMoving = row.stock_out === 0 || row.movement_count === 0;
        const reorderSuggestion = health === "Critical" || health === "Low";
        return {
          ...row,
          health,
          daysToStockout,
          slowMoving,
          reorderSuggestion,
        };
      }),
    [rows, spanDays],
  );

  const paginated = useMemo(() => paginateRows(enrichedRows, page), [enrichedRows, page]);

  const summary = useMemo(() => {
    return enrichedRows.reduce(
      (accumulator, row) => {
        accumulator.opening += row.opening_stock;
        accumulator.closing += row.closing_stock;
        accumulator.stockIn += row.stock_in;
        accumulator.stockOut += row.stock_out;
        accumulator.negativeFlags += row.negative_stock_detected ? 1 : 0;
        accumulator.low += row.reorderSuggestion ? 1 : 0;
        accumulator.dead += row.health === "Dead Stock" ? 1 : 0;
        return accumulator;
      },
      { opening: 0, closing: 0, stockIn: 0, stockOut: 0, negativeFlags: 0, low: 0, dead: 0 },
    );
  }, [enrichedRows]);

  const filtersLabel = useMemo(() => {
    const productLabel = filters.productIds.length ? `${filters.productIds.length} products` : "All products";
    const schoolLabel = filters.schoolIds.length ? `${filters.schoolIds.length} schools` : "All schools";
    const classLabel = filters.classIds.length ? `${filters.classIds.length} classes` : "All classes";
    const genderLabel = filters.genders.length ? filters.genders.join(", ") : "All genders";
    return [
      `${filters.dateRange.from} to ${filters.dateRange.to}`,
      schoolLabel,
      classLabel,
      genderLabel,
      productLabel,
      filters.negativeOnly ? "Negative stock only" : "All stock states",
    ].join(" | ");
  }, [filters]);

  const exportColumns = useMemo(
    () => [
      "Product",
      "School",
      "Class",
      "Gender",
      "Variant",
      "Opening Stock",
      "Stock In",
      "Stock Out",
      "Closing Stock",
      "Current Stock",
      "Health",
    ],
    [],
  );

  const exportRows = useMemo(
    () =>
      enrichedRows.map((row) => [
        row.product_name,
        row.school_name,
        row.class_name,
        row.gender,
        row.variant_size,
        row.opening_stock,
        row.stock_in,
        row.stock_out,
        row.closing_stock,
        row.current_stock,
        row.health,
      ]),
    [enrichedRows],
  );

  const exportConfig = useMemo<ReportExportConfig>(
    () => ({
      filename: "inventory_report",
      columns: exportColumns,
      rows: exportRows,
    }),
    [exportColumns, exportRows],
  );

  const exportWorkbook = useMemo(
    () => ({
      filename: "inventory_report",
      sheets: [
        {
          name: "Summary",
          rows: [
            ["Filters", filtersLabel],
            [],
            ["Rows", enrichedRows.length],
            ["Opening Stock", summary.opening],
            ["Closing Stock", summary.closing],
            ["Stock In", summary.stockIn],
            ["Stock Out", summary.stockOut],
            ["Negative Flags", summary.negativeFlags],
            ["Reorder Needed", summary.low],
            ["Dead Stock", summary.dead],
          ],
        },
        {
          name: "Inventory",
          rows: [exportColumns, ...exportRows],
        },
      ],
    }),
    [enrichedRows.length, exportColumns, exportRows, filtersLabel, summary.closing, summary.dead, summary.low, summary.negativeFlags, summary.opening, summary.stockIn, summary.stockOut],
  );

  const resetFilters = () => {
    setFilters({
      dateRange: getDefaultDateRange(30),
      productIds: [],
      schoolIds: [],
      classIds: [],
      genders: [],
      negativeOnly: false,
    });
  };

  const insights = useMemo<SmartInsight[]>(() => {
    if (!enrichedRows.length) return [];
    const mostCritical = enrichedRows.find((row) => row.reorderSuggestion) ?? enrichedRows[0];
    const slowMoving = enrichedRows.filter((row) => row.slowMoving).slice(0, 1)[0];
    const messages: SmartInsight[] = [];

    if (mostCritical) {
      messages.push({
        id: "reorder",
        type: "warning",
        message: `${mostCritical.product_name} needs replenishment${mostCritical.daysToStockout ? ` in ~${mostCritical.daysToStockout} days` : ""}`,
      });
    }
    if (slowMoving) {
      messages.push({
        id: "slow",
        type: "info",
        message: `${slowMoving.product_name} is slow moving — consider promotion or redistribution.`,
      });
    }
    if (summary.dead > 0) {
      messages.push({
        id: "dead",
        type: "warning",
        message: `${summary.dead} SKUs flagged as dead stock; plan clearance.`,
      });
    }

    return messages;
  }, [enrichedRows, summary.dead]);

  const alerts = useMemo<ReportAlert[]>(() => {
    const items: ReportAlert[] = [];
    if (summary.negativeFlags > 0) {
      items.push({ id: "neg", title: "Negative stock detected", severity: "warning", hint: "Audit movements to reconcile counts." });
    }
    if (summary.low > 0) {
      items.push({ id: "low", title: `${summary.low} SKUs need reorder`, severity: "warning", hint: "Check low days-to-stockout and replenish globally." });
    }
    if (summary.dead > 0) {
      items.push({ id: "dead", title: `${summary.dead} dead-stock SKUs`, severity: "info", hint: "Plan clearance to free cash." });
    }
    return items;
  }, [summary.dead, summary.low, summary.negativeFlags]);

  if (isChecking) {
    return (
      <div className="min-h-[220px] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading report...</p>
      </div>
    );
  }

  if (productsError || schoolsError || classesError || gendersError || dailyRowsError || auditRowsError) {
    return <ErrorState message="Session expired. Please login again." />;
  }

  return (
    <ReportPageFrame
      title="Inventory Report"
      description="Audit-ready stock visibility sourced from inventory movements, with opening and closing stock, movement totals, and drill-through audit trails."
    >
      <ReportFiltersPanel onReset={resetFilters}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <FilterField label="From Date">
            <Input
              type="date"
              value={filters.dateRange.from}
              onChange={(event) => setFilters((current) => ({ ...current, dateRange: { ...current.dateRange, from: event.target.value } }))}
              className="h-11 rounded-2xl border-black/10 bg-white"
              required
            />
          </FilterField>
          <FilterField label="To Date">
            <Input
              type="date"
              value={filters.dateRange.to}
              onChange={(event) => setFilters((current) => ({ ...current, dateRange: { ...current.dateRange, to: event.target.value } }))}
              className="h-11 rounded-2xl border-black/10 bg-white"
              required
            />
          </FilterField>
          <FilterField label="Schools">
            <FilterMultiSelect
              label="Schools"
              options={schools}
              selectedValues={filters.schoolIds}
              onChange={(schoolIds) => setFilters((current) => ({ ...current, schoolIds }))}
              placeholder="All schools"
            />
          </FilterField>
          <FilterField label="Classes">
            <FilterMultiSelect
              label="Classes"
              options={classes}
              selectedValues={filters.classIds}
              onChange={(classIds) => setFilters((current) => ({ ...current, classIds }))}
              placeholder="All classes"
            />
          </FilterField>
          <FilterField label="Gender">
            <FilterMultiSelect
              label="Gender"
              options={genders}
              selectedValues={filters.genders}
              onChange={(genders) => setFilters((current) => ({ ...current, genders }))}
              placeholder="All genders"
            />
          </FilterField>
          <FilterField label="Products">
            <FilterMultiSelect label="Products" options={products} selectedValues={filters.productIds} onChange={(productIds) => setFilters((current) => ({ ...current, productIds }))} placeholder="All products" />
          </FilterField>
          <FilterField label="Negative Detection">
            <div className="flex h-11 items-center justify-between rounded-2xl border border-black/10 bg-white px-4">
              <span className="text-sm text-foreground">Negative only</span>
              <Switch checked={filters.negativeOnly} onCheckedChange={(negativeOnly) => setFilters((current) => ({ ...current, negativeOnly }))} />
            </div>
          </FilterField>
        </div>
      </ReportFiltersPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => <ReportMetricSkeleton key={index} />)
        ) : (
          <>
            <ReportMetricCard label="SKUs" value={formatNumber(enrichedRows.length)} helper="Aggregated globally by variant" />
            <ReportMetricCard label="Opening Stock" value={formatNumber(summary.opening)} helper="At the start of selected period" />
            <ReportMetricCard label="Stock In" value={formatNumber(summary.stockIn)} helper="Inbound movement total" />
            <ReportMetricCard label="Stock Out" value={formatNumber(summary.stockOut)} helper="Outbound movement total" />
            <ReportMetricCard label="Negative Flags" value={formatNumber(summary.negativeFlags)} helper="Movement anomalies detected" />
          </>
        )}
      </div>

      <SmartInsightsPanel insights={insights ?? []} loading={isLoading ?? false} />

      <Card className="border border-border/70 bg-white/95 shadow-sm">
        <CardHeader className="border-b border-border/70">
          <div>
            <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Inventory Rollup</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Click any row to inspect its movement breakdown and full audit trail.</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5">
              <ReportTableSkeleton columns={6} rows={7} />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <ReportEmptyState title="No inventory activity matches these filters" description="Widen the date range or remove product filters to inspect more movement history." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead className="text-right">Opening Stock</TableHead>
                      <TableHead className="text-right">Stock In</TableHead>
                      <TableHead className="text-right">Stock Out</TableHead>
                      <TableHead className="text-right">Closing Stock</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead className="text-right">Audit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>
                          <div className="font-medium">{row.product_name}</div>
                          <div className="text-xs text-muted-foreground">{row.class_name} • {row.gender} • {row.school_name}</div>
                        </TableCell>
                        <TableCell>{row.school_name}</TableCell>
                        <TableCell>{row.class_name}</TableCell>
                        <TableCell>{row.gender}</TableCell>
                        <TableCell>{row.variant_size}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.opening_stock)}</TableCell>
                        <TableCell className="text-right text-emerald-700">{formatNumber(row.stock_in)}</TableCell>
                        <TableCell className="text-right text-rose-700">{formatNumber(row.stock_out)}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.closing_stock)}</TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(row.current_stock)}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                              row.health === "Critical"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : row.health === "Low"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : row.health === "Dead Stock"
                                    ? "border-slate-200 bg-slate-50 text-slate-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700",
                            )}
                          >
                            {row.health}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setSelectedRow(row)}>
                            View Trail →
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ReportPagination page={paginated.page} totalPages={paginated.totalPages} totalRows={enrichedRows.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <ReportExportPanel
        description="Exports preserve filter state, include summary rows, and keep the global inventory rollup ready for audit review."
        onExportCsv={() => exportReportCsv(exportConfig)}
        onExportXlsx={() => exportReportXlsx(exportWorkbook)}
      />

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {selectedRow ? `${selectedRow.product_name} · ${selectedRow.variant_size}` : "Inventory Audit Trail"}
            </DialogTitle>
          </DialogHeader>
          {selectedRow ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {selectedRow?.class_name} • {selectedRow?.gender} • {selectedRow?.school_name}
              </div>
              <div className="grid gap-3 rounded-2xl border border-border/70 bg-stone-50/70 p-4 md:grid-cols-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Opening</p>
                  <p className="mt-1 text-lg font-light">{formatNumber(selectedRow.opening_stock)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Closing</p>
                  <p className="mt-1 text-lg font-light">{formatNumber(selectedRow.closing_stock)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Movement Count</p>
                  <p className="mt-1 text-lg font-light">{formatNumber(selectedRow.movement_count)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Current Stock</p>
                  <p className="mt-1 text-lg font-light">{formatNumber(selectedRow.current_stock)}</p>
                </div>
              </div>
              {auditLoading ? (
                <ReportTableSkeleton columns={5} rows={6} />
              ) : auditRows.length === 0 ? (
                <ReportEmptyState title="No audit movements found" description="This variant has no movement history available to show right now." />
              ) : (
                <div className="max-h-[420px] space-y-4 overflow-auto rounded-2xl border border-border/70 p-4">
                  {auditRows.map((row) => (
                    <div key={row.id} className="relative pl-6">
                      <div className="absolute left-1 top-2 h-full w-[2px] bg-border/80 last:hidden" />
                      <div className="absolute left-0 top-2 h-2.5 w-2.5 rounded-full bg-sky-500" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{formatDateTime(row.created_at)}</div>
                        <span className="rounded-full border border-border px-2 py-1 text-xs">{row.type}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className={cn(row.quantity < 0 ? "text-rose-700" : "text-emerald-700")}>Δ {formatNumber(row.quantity)}</span>
                        <span>Before {formatNumber(row.before_stock)}</span>
                        <span>After {formatNumber(row.after_stock)}</span>
                        <span>Ref {row.reference_type}</span>
                        <span>{row.reason || "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertsPanel alerts={alerts} />
    </ReportPageFrame>
  );
};

export default InventoryReportPage;
