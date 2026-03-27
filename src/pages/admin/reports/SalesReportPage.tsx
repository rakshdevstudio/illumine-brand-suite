import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { exportReportCsv, exportReportXlsx } from "@/lib/reports/export";
import type { ReportExportConfig } from "@/lib/reports/export";
import { fetchBranchOptions, fetchSalesItemReportRows, fetchSalesReportRows, fetchSchoolOptions } from "@/lib/reports/data";
import {
  PAYMENT_MODE_OPTIONS,
  ORDER_STATUS_OPTIONS,
  formatCurrency,
  formatDisplayDate,
  formatNumber,
  formatTightPercent,
  getDefaultDateRange,
  getStatusBadgeClassName,
  paginateRows,
  toGroupedRevenuePoints,
} from "@/lib/reports/format";
import type { ReportAlert, SalesGroupBy, SalesItemReportRow, SalesReportFilters, SalesReportRow } from "@/lib/reports/types";
import type { SmartInsight } from "@/types/reports";
import { cn } from "@/lib/utils";

const GROUP_OPTIONS: Array<{ value: SalesGroupBy; label: string }> = [
  { value: "date", label: "Date" },
  { value: "branch", label: "Branch" },
  { value: "school", label: "School" },
];

const SalesReportPage = () => {
  const [filters, setFilters] = useState<SalesReportFilters>({
    dateRange: getDefaultDateRange(30),
    branchIds: [],
    schoolIds: [],
    status: "active",
    gstOnly: false,
    paymentMode: "all",
    search: "",
  });
  const [groupBy, setGroupBy] = useState<SalesGroupBy>("date");
  const [viewMode, setViewMode] = useState<"order" | "item">("order");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data: branches = [] } = useQuery({
    queryKey: ["report-branches"],
    queryFn: fetchBranchOptions,
    staleTime: 5 * 60_000,
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["report-schools"],
    queryFn: fetchSchoolOptions,
    staleTime: 5 * 60_000,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-sales", filters],
    queryFn: () => fetchSalesReportRows(filters),
  });

  const { data: itemRows = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["report-sales-items", filters],
    enabled: viewMode === "item",
    queryFn: () => fetchSalesItemReportRows(filters),
  });

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const metrics = useMemo(() => {
    const totals = rows.reduce(
      (accumulator, row) => {
        accumulator.revenue += row.total_amount;
        accumulator.orders += 1;
        if (row.gst_number) {
          accumulator.gstRevenue += row.total_amount;
        } else {
          accumulator.nonGstRevenue += row.total_amount;
        }
        return accumulator;
      },
      { revenue: 0, orders: 0, gstRevenue: 0, nonGstRevenue: 0 },
    );

    const totalCustomers = new Map<string, { spend: number; orders: number }>();
    rows.forEach((row) => {
      const key = row.phone || row.customer_name || row.order_id;
      const current = totalCustomers.get(key) ?? { spend: 0, orders: 0 };
      current.spend += row.total_amount;
      current.orders += 1;
      totalCustomers.set(key, current);
    });

    const repeatCustomers = [...totalCustomers.values()].filter((item) => item.orders > 1).length;

    return {
      totalRevenue: totals.revenue,
      totalOrders: totals.orders,
      averageOrderValue: totals.orders > 0 ? totals.revenue / totals.orders : 0,
      gstRevenue: totals.gstRevenue,
      nonGstRevenue: totals.nonGstRevenue,
      repeatCustomersPct: totalCustomers.size ? (repeatCustomers / totalCustomers.size) * 100 : 0,
      averageItemsPerOrder: totals.orders ? rows.reduce((sum, row) => sum + row.total_quantity, 0) / totals.orders : 0,
      customerMap: totalCustomers,
    };
  }, [rows]);

  const trendData = useMemo(
    () =>
      toGroupedRevenuePoints(rows, "date").map((point) => ({
        label: point.label,
        revenue: point.revenue,
      })),
    [rows],
  );

  const groupedData = useMemo(() => toGroupedRevenuePoints(rows, groupBy), [groupBy, rows]);

  const topCustomers = useMemo(() => {
    const entries = [...metrics.customerMap.entries()].map(([customer, data]) => ({ customer, spend: data.spend, orders: data.orders }));
    return entries.sort((a, b) => b.spend - a.spend).slice(0, 5);
  }, [metrics.customerMap]);

  const tableRows = useMemo<Array<SalesReportRow | SalesItemReportRow>>(
    () => (viewMode === "order" ? rows : itemRows),
    [itemRows, rows, viewMode],
  );

  const paginated = useMemo(() => paginateRows(tableRows, page), [page, tableRows]);

  const filtersLabel = useMemo(() => {
    const branchLabel = filters.branchIds.length ? `${filters.branchIds.length} branches` : "All branches";
    const schoolLabel = filters.schoolIds.length ? `${filters.schoolIds.length} schools` : "All schools";
    return [
      `${filters.dateRange.from} to ${filters.dateRange.to}`,
      branchLabel,
      schoolLabel,
      `Status: ${filters.status === "active" ? "Active Orders" : filters.status}`,
      `Payment: ${filters.paymentMode === "all" ? "All Modes" : filters.paymentMode}`,
      filters.gstOnly ? "GST orders only" : "All GST states",
      filters.search.trim() ? `Search: ${filters.search.trim()}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }, [filters]);

  const orderColumns = useMemo(
    () => ["Order ID", "Order Date", "Customer Name", "School", "Branch", "Items", "Total Quantity", "Total Amount", "GST Number", "Order Status", "Payment Mode"],
    [],
  );

  const itemColumns = useMemo(
    () => ["Order ID", "Date", "Customer", "Branch", "Product", "Variant", "SKU", "Qty", "Unit Price", "Line Amount", "Discount", "Payment", "GST Number"],
    [],
  );

  const orderExportRows = useMemo(
    () =>
      rows.map((row) => [
        row.order_id_text,
        row.order_date,
        row.customer_name,
        row.school_name,
        row.branch_name,
        row.items,
        row.total_quantity,
        row.total_amount,
        row.gst_number ?? "",
        row.status,
        row.payment_mode,
      ]),
    [rows],
  );

  const itemExportRows = useMemo(
    () =>
      itemRows?.map((row) => [
        row.order_id_text,
        row.order_date,
        row.customer_name,
        row.branch_name,
        row.product_name,
        row.variant_size,
        row.sku ?? "",
        row.quantity,
        row.unit_price,
        row.line_amount,
        row.discount_amount ?? 0,
        row.payment_mode,
        row.gst_number ?? "",
      ]) ?? [],
    [itemRows],
  );

  const exportConfig = useMemo<ReportExportConfig>(
    () => ({
      filename: "sales_report",
      columns: viewMode === "order" ? orderColumns : itemColumns,
      rows: viewMode === "order" ? orderExportRows : itemExportRows,
    }),
    [itemColumns, itemExportRows, orderColumns, orderExportRows, viewMode],
  );

  const exportWorkbook = useMemo(
    () => ({
      filename: "sales_report",
      sheets: [
        {
          name: "Summary",
          rows: [
            ["Filters", filtersLabel],
            [],
            ["Total Revenue", metrics.totalRevenue],
            ["Total Orders", metrics.totalOrders],
            ["Average Order Value", metrics.averageOrderValue],
            ["GST Revenue", metrics.gstRevenue],
            ["Non-GST Revenue", metrics.nonGstRevenue],
            ["Repeat Customers %", Number.isFinite(metrics.repeatCustomersPct) ? metrics.repeatCustomersPct : 0],
            ["Avg Items / Order", metrics.averageItemsPerOrder],
          ],
        },
        {
          name: "Orders",
          rows: [orderColumns, ...orderExportRows],
        },
        ...(itemExportRows.length
          ? [
              {
                name: "Items",
                rows: [itemColumns, ...itemExportRows],
              },
            ]
          : []),
      ],
    }),
    [
      filtersLabel,
      itemColumns,
      itemExportRows,
      metrics.averageItemsPerOrder,
      metrics.gstRevenue,
      metrics.nonGstRevenue,
      metrics.repeatCustomersPct,
      metrics.totalOrders,
      metrics.totalRevenue,
      orderColumns,
      orderExportRows,
    ],
  );

  const insights = useMemo<SmartInsight[]>(() => {
    if (!rows.length) return [];
    const total = metrics.totalRevenue || 1;

    const byBranch = new Map<string, number>();
    rows.forEach((row) => {
      if (!row.branch_name) return;
      byBranch.set(row.branch_name, (byBranch.get(row.branch_name) ?? 0) + row.total_amount);
    });
    const topBranch = [...byBranch.entries()].sort((a, b) => b[1] - a[1])[0];

    const gstRatio = metrics.totalRevenue ? (metrics.gstRevenue / metrics.totalRevenue) * 100 : 0;
    const itemTop = itemRows.length ? [...itemRows].sort((a, b) => b.line_amount - a.line_amount)[0] : null;

    const messages: SmartInsight[] = [];
    if (topBranch) {
      messages.push({
        id: "branch-share",
        type: "success",
        message: `${topBranch[0]} generated ${formatTightPercent((topBranch[1] / total) * 100)} of revenue`,
      });
    }
    if (gstRatio < 10) {
      messages.push({
        id: "gst-gap",
        type: "warning",
        message: `Only ${formatTightPercent(gstRatio)} of revenue is GST-linked. Open GST report to investigate.`,
      });
    }
    if (metrics.repeatCustomersPct > 0) {
      messages.push({
        id: "repeat",
        type: metrics.repeatCustomersPct >= 30 ? "success" : "info",
        message: `${formatTightPercent(metrics.repeatCustomersPct)} repeat customers in this window`,
      });
    }
    if (itemTop) {
      messages.push({
        id: "top-item",
        type: "info",
        message: `${itemTop.product_name} (${itemTop.variant_size}) contributed ${formatTightPercent((itemTop.line_amount / total) * 100)} of revenue`,
      });
    }
    return messages;
  }, [itemRows, metrics.gstRevenue, metrics.repeatCustomersPct, metrics.totalRevenue, rows]);

  const alerts = useMemo<ReportAlert[]>(() => {
    const items: ReportAlert[] = [];
    const gstRatio = metrics.totalRevenue ? (metrics.gstRevenue / metrics.totalRevenue) * 100 : 0;
    if (gstRatio < 5 && metrics.totalOrders > 5) {
      items.push({
        id: "alert-gst",
        title: "GST usage is under 5% of revenue",
        severity: "warning",
        hint: "Enable GST toggle to avoid compliance gaps.",
      });
    }
    const recent = rows.slice(0, 3);
    const earlier = rows.slice(3, 9);
    const recentAvg = recent.reduce((sum, row) => sum + row.total_amount, 0) / Math.max(recent.length, 1);
    const earlierAvg = earlier.reduce((sum, row) => sum + row.total_amount, 0) / Math.max(earlier.length, 1);
    if (earlierAvg > 0 && recentAvg < earlierAvg * 0.7) {
      items.push({
        id: "alert-revenue-drop",
        title: "Revenue dipped vs earlier in period",
        severity: "warning",
        hint: "Check branch mix and cancellations for root cause.",
      });
    }
    if (metrics.averageItemsPerOrder > 5) {
      items.push({
        id: "alert-bulk",
        title: "High items per order",
        severity: "info",
        hint: "Verify inventory buffers for bulk orders.",
      });
    }
    return items;
  }, [metrics.averageItemsPerOrder, metrics.gstRevenue, metrics.totalOrders, metrics.totalRevenue, rows]);

  const resetFilters = () => {
    setFilters({
      dateRange: getDefaultDateRange(30),
      branchIds: [],
      schoolIds: [],
      status: "active",
      gstOnly: false,
      paymentMode: "all",
      search: "",
    });
    setGroupBy("date");
  };

  return (
    <ReportPageFrame
      title="Sales Report"
      description="Order-level revenue reporting with branch, school, GST, payment-mode, and customer search controls built for daily business reviews."
    >
      <ReportFiltersPanel onReset={resetFilters}>
        <div className="grid gap-4 xl:grid-cols-6 md:grid-cols-2">
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
          <FilterField label="Branches">
            <FilterMultiSelect label="Branches" options={branches} selectedValues={filters.branchIds} onChange={(branchIds) => setFilters((current) => ({ ...current, branchIds }))} placeholder="All branches" />
          </FilterField>
          <FilterField label="Schools">
            <FilterMultiSelect label="Schools" options={schools} selectedValues={filters.schoolIds} onChange={(schoolIds) => setFilters((current) => ({ ...current, schoolIds }))} placeholder="All schools" />
          </FilterField>
          <FilterField label="Order Status">
            <Select value={filters.status} onValueChange={(status) => setFilters((current) => ({ ...current, status: status as SalesReportFilters["status"] }))}>
              <SelectTrigger className="h-11 rounded-2xl border-black/10 bg-white">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Payment Mode">
            <Select value={filters.paymentMode} onValueChange={(paymentMode) => setFilters((current) => ({ ...current, paymentMode: paymentMode as SalesReportFilters["paymentMode"] }))}>
              <SelectTrigger className="h-11 rounded-2xl border-black/10 bg-white">
                <SelectValue placeholder="Select payment mode" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Search">
            <Input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Customer, phone, or order ID"
              className="h-11 rounded-2xl border-black/10 bg-white"
            />
          </FilterField>
          <FilterField label="GST Orders">
            <div className="flex h-11 items-center justify-between rounded-2xl border border-black/10 bg-white px-4">
              <span className="text-sm text-foreground">GST only</span>
              <Switch checked={filters.gstOnly} onCheckedChange={(gstOnly) => setFilters((current) => ({ ...current, gstOnly }))} />
            </div>
          </FilterField>
        </div>
      </ReportFiltersPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => <ReportMetricSkeleton key={index} />)
        ) : (
          <>
            <ReportMetricCard label="Total Revenue" value={formatCurrency(metrics.totalRevenue)} helper={`${formatNumber(metrics.totalOrders)} orders`} />
            <ReportMetricCard label="Total Orders" value={formatNumber(metrics.totalOrders)} helper="Filtered order count" />
            <ReportMetricCard label="Average Order Value" value={formatCurrency(metrics.averageOrderValue)} helper="Revenue / orders" />
            <ReportMetricCard label="GST Revenue" value={formatCurrency(metrics.gstRevenue)} helper="Orders with GST number" />
            <ReportMetricCard label="Non-GST Revenue" value={formatCurrency(metrics.nonGstRevenue)} helper="Orders without GST number" />
            <ReportMetricCard label="Repeat Customers" value={formatTightPercent(metrics.repeatCustomersPct)} helper="Based on phone matches" />
            <ReportMetricCard label="Avg Items / Order" value={metrics.averageItemsPerOrder.toFixed(2)} helper="Basket depth" />
          </>
        )}
      </div>

      <SmartInsightsPanel insights={insights ?? []} loading={(isLoading || (viewMode === "item" && itemsLoading)) ?? false} />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="border border-border/70 bg-white/95 shadow-sm">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {isLoading ? (
              <div className="h-[240px]">
                <ReportMetricSkeleton />
              </div>
            ) : trendData.length === 0 ? (
              <ReportEmptyState title="No sales found" description="Adjust the report dates or broaden branch and school filters to see a revenue trend." />
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                    <Line type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-white/95 shadow-sm">
          <CardHeader className="border-b border-border/70">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Grouped Revenue</CardTitle>
              <div className="flex flex-wrap gap-2">
                {GROUP_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={groupBy === option.value ? "default" : "outline"}
                    className={cn("rounded-full", groupBy !== option.value && "bg-white")}
                    onClick={() => setGroupBy(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {isLoading ? (
              <div className="h-[240px]">
                <ReportMetricSkeleton />
              </div>
            ) : groupedData.length === 0 ? (
              <ReportEmptyState title="No grouped data" description="Grouped comparisons appear after at least one order matches the active report filters." />
            ) : (
              <div className="space-y-4">
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={groupedData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={groupBy === "date" ? 0 : -10} height={groupBy === "date" ? 30 : 50} />
                      <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                      <Bar dataKey="revenue" fill="#18181b" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {groupedData.slice(0, 5).map((point) => (
                    <div key={point.key} className="flex items-center justify-between rounded-2xl border border-border/70 bg-stone-50/70 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{point.label}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(point.orders)} orders</p>
                      </div>
                      <span className="whitespace-nowrap text-sm text-foreground">{formatCurrency(point.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border/70 bg-white/95 shadow-sm">
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Sales {viewMode === "order" ? "Orders" : "Items"}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {viewMode === "order" ? "One row per order with revenue share per branch or school." : "Item view reveals SKU mix, unit pricing, and discount capture."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-full border border-border/80 bg-stone-50 px-1 py-1">
                {(["order", "item"] as const).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={viewMode === mode ? "default" : "ghost"}
                    className={cn("rounded-full px-3 py-1 text-xs", viewMode !== mode && "bg-transparent text-foreground")}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode === "order" ? "Order View" : "Item View"}
                  </Button>
                ))}
              </div>
              <Badge variant="outline" className="w-fit rounded-full border-border px-3 py-1 text-xs">
                {formatNumber((viewMode === "order" ? rows : itemRows).length)} rows
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading || (viewMode === "item" && itemsLoading) ? (
            <div className="p-5">
              <ReportTableSkeleton columns={6} rows={7} />
            </div>
          ) : (viewMode === "order" ? rows : itemRows).length === 0 ? (
            <div className="p-5">
              <ReportEmptyState title="No sales records match these filters" description="Try broadening the date range, clearing the search term, or including more branches and schools." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Branch</TableHead>
                      {viewMode === "item" ? (
                        <>
                          <TableHead>Product</TableHead>
                          <TableHead>Variant</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Discount</TableHead>
                          <TableHead className="text-right">Line Amount</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>Items</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                        </>
                      )}
                      <TableHead>GST Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Revenue %</TableHead>
                      <TableHead className="text-right">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.rows.map((row: any) => {
                      const revenueShare =
                        viewMode === "order"
                          ? metrics.totalRevenue
                            ? (row.total_amount / metrics.totalRevenue) * 100
                            : 0
                          : metrics.totalRevenue
                            ? (row.line_amount / metrics.totalRevenue) * 100
                            : 0;
                      return (
                        <TableRow key={`${row.order_id}-${viewMode === "item" ? row.product_id : "order"}`}>
                          <TableCell className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">{row.order_id_text.slice(0, 8)}</TableCell>
                          <TableCell>{formatDisplayDate(row.order_date)}</TableCell>
                          <TableCell className="cursor-pointer underline decoration-dashed underline-offset-4" onClick={() => navigate(`/admin/orders/${row.order_id}`)}>
                            {row.customer_name}
                          </TableCell>
                          <TableCell className="cursor-pointer" onClick={() => navigate(`/admin/schools/${row.school_id ?? ""}`)}>{row.school_name}</TableCell>
                          <TableCell className="cursor-pointer" onClick={() => navigate(`/admin/branches/${row.branch_id ?? ""}`)}>{row.branch_name}</TableCell>
                          {viewMode === "item" ? (
                            <>
                              <TableCell className="cursor-pointer" onClick={() => navigate(`/admin/products/${row.product_id}`)}>{row.product_name}</TableCell>
                              <TableCell>{row.variant_size}</TableCell>
                              <TableCell className="font-mono text-xs">{row.sku || "-"}</TableCell>
                              <TableCell className="text-right">{formatNumber(row.quantity)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.unit_price)}</TableCell>
                              <TableCell className="text-right text-amber-700">{formatCurrency(row.discount_amount || 0)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(row.line_amount)}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="max-w-[320px] whitespace-normal text-sm text-muted-foreground">{row.items}</TableCell>
                              <TableCell className="text-right">{formatNumber(row.total_quantity)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(row.total_amount)}</TableCell>
                            </>
                          )}
                          <TableCell className="font-mono text-xs uppercase tracking-[0.14em]">{row.gst_number || "-"}</TableCell>
                          <TableCell>
                            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", getStatusBadgeClassName(row.status))}>
                              {row.status}
                            </span>
                          </TableCell>
                          <TableCell>{row.payment_mode}</TableCell>
                          <TableCell className={cn("text-right text-sm font-semibold", revenueShare > 20 ? "text-emerald-700" : "text-foreground")}>{formatTightPercent(revenueShare)}</TableCell>
                          <TableCell className="text-right">
                            <Button type="button" variant="ghost" size="sm" className="text-xs font-semibold underline" onClick={() => navigate(`/admin/orders/${row.order_id}`)}>
                              View Details →
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <ReportPagination page={paginated.page} totalPages={paginated.totalPages} totalRows={(viewMode === "order" ? rows : itemRows).length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <AlertsPanel alerts={alerts} />
        <Card className="border border-border/70 bg-white/95 shadow-sm">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Top 5 Customers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {topCustomers.length === 0 ? (
              <ReportEmptyState title="No customer ranking yet" description="Once orders appear, top customers will be ranked by spend." />
            ) : (
              topCustomers.map((customer, index) => (
                <div key={customer.customer} className="flex items-center justify-between rounded-2xl border border-border/70 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-foreground">{index + 1}</span>
                    <div>
                      <p className="text-sm font-semibold">{customer.customer}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(customer.orders)} orders</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(customer.spend)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <ReportExportPanel
        description="Exports respect all active filters, include summary rows, and are formatted for business review outside the dashboard."
        onExportCsv={() => exportReportCsv(exportConfig)}
        onExportXlsx={() => exportReportXlsx(exportWorkbook)}
      />
    </ReportPageFrame>
  );
};

export default SalesReportPage;
