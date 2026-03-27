import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { aggregateBranchRows, fetchBranchDailyRows, fetchBranchOptions, fetchBranchTopProductRows } from "@/lib/reports/data";
import { exportReportCsv, exportReportXlsx } from "@/lib/reports/export";
import {
  ORDER_STATUS_OPTIONS,
  formatCurrency,
  formatPercent,
  formatNumber,
  formatTightPercent,
  getDefaultDateRange,
  getGrowthBadgeClassName,
  getPreviousDateRange,
  paginateRows,
} from "@/lib/reports/format";
import type { BranchReportFilters, ReportAlert, SmartInsight } from "@/lib/reports/types";
import type { ReportExportConfig } from "@/types/reports";
import { cn } from "@/lib/utils";

const BranchPerformanceReportPage = () => {
  const [filters, setFilters] = useState<BranchReportFilters>({
    dateRange: getDefaultDateRange(30),
    branchIds: [],
    status: "active",
  });
  const [showComparison, setShowComparison] = useState(true);
  const [page, setPage] = useState(1);

  const previousRange = useMemo(() => getPreviousDateRange(filters.dateRange), [filters.dateRange]);

  const { data: branches = [] } = useQuery({
    queryKey: ["report-branches"],
    queryFn: fetchBranchOptions,
    staleTime: 5 * 60_000,
  });

  const { data: currentRows = [], isLoading: currentLoading } = useQuery({
    queryKey: ["report-branches-current", filters],
    queryFn: () => fetchBranchDailyRows(filters),
  });

  const { data: previousRows = [], isLoading: previousLoading } = useQuery({
    queryKey: ["report-branches-previous", previousRange, filters.branchIds, filters.status, showComparison],
    enabled: showComparison,
    queryFn: () => fetchBranchDailyRows({ ...filters, dateRange: previousRange }),
  });

  const { data: topProductRows = [], isLoading: topProductsLoading } = useQuery({
    queryKey: ["report-branches-top-products", filters],
    queryFn: () => fetchBranchTopProductRows(filters),
  });

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const rows = useMemo(() => aggregateBranchRows(currentRows, showComparison ? previousRows : [], topProductRows), [currentRows, previousRows, showComparison, topProductRows]);
  const isLoading = currentLoading || (showComparison && previousLoading) || topProductsLoading;
  const paginated = useMemo(() => paginateRows(rows, page), [page, rows]);

  const summary = useMemo(() => {
    return rows.reduce(
      (accumulator, row) => {
        accumulator.revenue += row.total_revenue;
        accumulator.orders += row.total_orders;
        accumulator.gstRevenue += row.gst_revenue;
        return accumulator;
      },
      { revenue: 0, orders: 0, gstRevenue: 0 },
    );
  }, [rows]);

  const leaderboardData = useMemo(
    () => rows.slice(0, 6).map((row) => ({ label: row.branch_name, revenue: row.total_revenue })),
    [rows],
  );

  const filtersLabel = useMemo(() => {
    const branchLabel = filters.branchIds.length ? `${filters.branchIds.length} branches` : "All branches";
    const statusLabel = filters.status === "active" ? "Active Orders" : filters.status;
    return `${filters.dateRange.from} to ${filters.dateRange.to} | ${branchLabel} | ${statusLabel}`;
  }, [filters]);

  const exportColumns = useMemo(
    () => [
      "Rank",
      "Branch Name",
      "Contribution %",
      "Total Orders",
      "Total Revenue",
      "Average Order Value",
      "GST Revenue",
      "Top Selling Product",
      "Growth vs Previous Period",
      "Rank Δ",
    ],
    [],
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => [
        row.rank,
        row.branch_name,
        row.contribution_pct ?? 0,
        row.total_orders,
        row.total_revenue,
        row.average_order_value,
        row.gst_revenue,
        row.top_selling_product,
        row.growth_pct === null ? "New" : row.growth_pct ?? 0,
        row.rank_delta ?? "",
      ]),
    [rows],
  );

  const exportConfig = useMemo<ReportExportConfig>(
    () => ({
      filename: "branch_performance_report",
      columns: exportColumns,
      rows: exportRows,
    }),
    [exportColumns, exportRows],
  );

  const exportWorkbook = useMemo(
    () => ({
      filename: "branch_performance_report",
      sheets: [
        {
          name: "Summary",
          rows: [
            ["Filters", filtersLabel],
            [],
            ["Total Revenue", summary.revenue],
            ["Total Orders", summary.orders],
            ["Average Order Value", summary.orders ? summary.revenue / summary.orders : 0],
            ["GST Revenue", summary.gstRevenue],
            ["Top Branch", rows[0]?.branch_name ?? "-"],
          ],
        },
        {
          name: "Branches",
          rows: [exportColumns, ...exportRows],
        },
      ],
    }),
    [exportColumns, exportRows, filtersLabel, rows, summary.gstRevenue, summary.orders, summary.revenue],
  );

  const insights = useMemo<SmartInsight[]>(() => {
    if (!rows.length) return [];
    const topBranch = rows[0];
    const bottomBranch = rows[rows.length - 1];
    const messages: SmartInsight[] = [];

    if (topBranch) {
      messages.push({
        id: "top",
        type: "success",
        message: `${topBranch.branch_name} leads with ${formatCurrency(topBranch.total_revenue)}`,
      });
    }
    if (bottomBranch) {
      messages.push({
        id: "under",
        type: "warning",
        message: `${bottomBranch.branch_name} is trailing — review staffing, inventory, or campaigns.`,
      });
    }
    if (rows.find((row) => (row.rank_delta ?? 0) > 2)) {
      messages.push({
        id: "riser",
        type: "info",
        message: "A branch jumped ranks this period; replicate what worked.",
      });
    }

    return messages;
  }, [rows]);

  const alerts = useMemo<ReportAlert[]>(() => {
    const items: ReportAlert[] = [];
    const negativeGrowth = rows.filter((row) => (row.growth_pct ?? 0) < -10);
    if (negativeGrowth.length) {
      items.push({ id: "decline", title: `${negativeGrowth.length} branches showing decline`, severity: "warning", hint: "Inspect branch drill-downs for root causes." });
    }
    return items;
  }, [rows]);

  const resetFilters = () => {
    setFilters({
      dateRange: getDefaultDateRange(30),
      branchIds: [],
      status: "active",
    });
  };

  return (
    <ReportPageFrame
      title="Branch Performance Report"
      description="Leaderboard-style branch reporting with growth comparisons versus the previous period, GST contribution, and top-selling products."
    >
      <ReportFiltersPanel onReset={resetFilters}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <FilterField label="Order Status">
            <Select value={filters.status} onValueChange={(status) => setFilters((current) => ({ ...current, status: status as BranchReportFilters["status"] }))}>
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
        </div>
      </ReportFiltersPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <ReportMetricSkeleton key={index} />)
        ) : (
          <>
            <ReportMetricCard label="Total Revenue" value={formatCurrency(summary.revenue)} helper={`${formatNumber(summary.orders)} orders`} />
            <ReportMetricCard label="Total Orders" value={formatNumber(summary.orders)} helper="Across selected branches" />
            <ReportMetricCard label="Average Order Value" value={formatCurrency(summary.orders ? summary.revenue / summary.orders : 0)} helper="Revenue / orders" />
            <ReportMetricCard label="GST Revenue" value={formatCurrency(summary.gstRevenue)} helper="GST order contribution" />
          </>
        )}
      </div>

      <SmartInsightsPanel insights={insights ?? []} loading={isLoading ?? false} />

      <Card className="border border-border/70 bg-white/95 shadow-sm">
        <CardHeader className="border-b border-border/70">
          <div>
            <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Branch Leaderboard</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Branches are ranked by revenue for the current period and compared against the immediately preceding date range.</p>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Compare vs previous</span>
            <Button size="sm" variant={showComparison ? "default" : "outline"} className="rounded-full" onClick={() => setShowComparison((value) => !value)}>
              {showComparison ? "Enabled" : "Disabled"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {isLoading ? (
            <ReportTableSkeleton columns={4} rows={4} />
          ) : leaderboardData.length === 0 ? (
            <ReportEmptyState title="No branch performance data" description="Try a wider date range or include more branches to build the leaderboard." />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaderboardData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis type="number" tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                  <Bar dataKey="revenue" fill="#111827" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/70 bg-white/95 shadow-sm">
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Branch Performance Table</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Growth is measured against {previousRange.from} to {previousRange.to}.</p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full border-border px-3 py-1 text-xs">
              {formatNumber(rows.length)} branches
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5">
              <ReportTableSkeleton columns={6} rows={7} />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <ReportEmptyState title="No branch metrics match these filters" description="Adjust the active filters to compare branch revenue and fulfillment performance." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Branch Name</TableHead>
                      <TableHead className="text-right">Contribution %</TableHead>
                      <TableHead className="text-right">Total Orders</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                      <TableHead className="text-right">Average Order Value</TableHead>
                      <TableHead className="text-right">GST Revenue</TableHead>
                      <TableHead>Top Selling Product</TableHead>
                      <TableHead>Growth</TableHead>
                      <TableHead>Rank Δ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.rows.map((row) => (
                      <TableRow key={row.branch_id}>
                        <TableCell>
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-stone-50 text-xs font-medium">{row.rank}</span>
                        </TableCell>
                        <TableCell className="font-medium cursor-pointer underline decoration-dashed" onClick={() => (window.location.href = `/admin/orders?branch=${row.branch_id}`)}>
                          {row.branch_name}
                        </TableCell>
                        <TableCell className="text-right">{formatTightPercent(row.contribution_pct ?? 0)}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.total_orders)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(row.total_revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.average_order_value)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.gst_revenue)}</TableCell>
                        <TableCell>{row.top_selling_product}</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", getGrowthBadgeClassName(row.growth_pct))}>
                            {formatPercent(row.growth_pct)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {row.rank_delta !== null && row.rank_delta !== undefined ? (
                            <span className="text-xs font-semibold">{row.rank_delta > 0 ? "↑" : row.rank_delta < 0 ? "↓" : "–"} {Math.abs(row.rank_delta)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">n/a</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ReportPagination page={paginated.page} totalPages={paginated.totalPages} totalRows={rows.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <ReportExportPanel
        description="Exports respect the current filters, include summary rows, and preserve branch rankings plus previous-period growth for offline review."
        onExportCsv={() => exportReportCsv(exportConfig)}
        onExportXlsx={() => exportReportXlsx(exportWorkbook)}
      />

      <AlertsPanel alerts={alerts} />
    </ReportPageFrame>
  );
};

export default BranchPerformanceReportPage;
