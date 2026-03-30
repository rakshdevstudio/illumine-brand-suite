import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
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
import { fetchBranchOptions, fetchGstReportRows, fetchSchoolOptions } from "@/lib/reports/data";
import { formatCurrency, formatDisplayDate, formatNumber, formatTightPercent, getDefaultDateRange, paginateRows } from "@/lib/reports/format";
import type { GstReportFilters, ReportAlert, SmartInsight } from "@/lib/reports/types";
import type { ReportExportConfig } from "@/types/reports";
import { ErrorState } from "@/components/ui/error-state";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const GstReportPage = () => {
  const { isChecking } = useRequireAuth();
  const [filters, setFilters] = useState<GstReportFilters>({
    dateRange: getDefaultDateRange(30),
    branchIds: [],
    schoolIds: [],
  });
  const [page, setPage] = useState(1);

  const { data: branches = [], error: branchesError } = useQuery({
    queryKey: ["report-branches"],
    queryFn: fetchBranchOptions,
    staleTime: 5 * 60_000,
  });

  const { data: schools = [], error: schoolsError } = useQuery({
    queryKey: ["report-schools"],
    queryFn: fetchSchoolOptions,
    staleTime: 5 * 60_000,
  });

  const { data: rows = [], isLoading, error: rowsError } = useQuery({
    queryKey: ["report-gst", filters],
    queryFn: () => fetchGstReportRows(filters),
  });

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const slabForRow = (row: any) => {
    const rate = row.taxable_amount > 0 ? Math.round((row.gst_amount / row.taxable_amount) * 100) : 0;
    if (rate <= 6) return "5%";
    if (rate <= 15) return "12%";
    return "18%";
  };

  const summary = useMemo(() => {
    const aggregates = rows.reduce(
      (accumulator, row) => {
        const slab = slabForRow(row);
        accumulator.taxable += row.taxable_amount;
        accumulator.gst += row.gst_amount;
        accumulator.total += row.total_amount;
        accumulator.invoices += 1;
        accumulator.slabs[slab] = (accumulator.slabs[slab] ?? 0) + row.gst_amount;
        if (!/^[0-9A-Z]{15}$/.test(row.gst_number ?? "")) {
          accumulator.invalid += 1;
        }
        return accumulator;
      },
      { taxable: 0, gst: 0, total: 0, invoices: 0, slabs: {} as Record<string, number>, invalid: 0 },
    );
    return aggregates;
  }, [rows]);

  const paginated = useMemo(() => paginateRows(rows, page), [page, rows]);

  const filtersLabel = useMemo(() => {
    const branchLabel = filters.branchIds.length ? `${filters.branchIds.length} branches` : "All branches";
    const schoolLabel = filters.schoolIds.length ? `${filters.schoolIds.length} schools` : "All schools";
    return `${filters.dateRange.from} to ${filters.dateRange.to} | ${branchLabel} | ${schoolLabel}`;
  }, [filters]);

  const exportColumns = useMemo(
    () => ["Customer Name", "GST Number", "Order ID", "Taxable Amount", "GST Amount", "Total Amount", "Date", "School", "Branch", "GST Slab"],
    [],
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => [
        row.customer_name,
        row.gst_number ?? "",
        row.order_id_text,
        row.taxable_amount,
        row.gst_amount,
        row.total_amount,
        row.order_date,
        row.school_name,
        row.branch_name,
        slabForRow(row),
      ]),
    [rows],
  );

  const exportConfig = useMemo<ReportExportConfig>(
    () => ({
      filename: "gst_report",
      columns: exportColumns,
      rows: exportRows,
    }),
    [exportColumns, exportRows],
  );

  const exportWorkbook = useMemo(
    () => ({
      filename: "gst_report",
      sheets: [
        {
          name: "Summary",
          rows: [
            ["Filters", filtersLabel],
            [],
            ["Total GST", summary.gst],
            ["Total Taxable", summary.taxable],
            ["Invoice Value", summary.total],
            ["GST Invoices", summary.invoices],
            ["Invalid GST Numbers", summary.invalid],
          ],
        },
        {
          name: "GST Invoices",
          rows: [exportColumns, ...exportRows],
        },
      ],
    }),
    [exportColumns, exportRows, filtersLabel, summary.gst, summary.invoices, summary.invalid, summary.taxable, summary.total],
  );

  const insights = useMemo<SmartInsight[]>(() => {
    if (!rows.length) return [];
    const gstShare = summary.total > 0 ? (summary.gst / summary.total) * 100 : 0;
    const messages: SmartInsight[] = [
      {
        id: "gst-share",
        type: "info",
        message: `${formatTightPercent(gstShare)} of invoice value is GST; monitor compliance mix.`,
      },
    ];
    if (summary.invalid > 0) {
      messages.push({
        id: "invalid-gst",
        type: "warning",
        message: `${summary.invalid} GST numbers look invalid; verify before filing.`,
      });
    }
    return messages;
  }, [rows.length, summary.gst, summary.invalid, summary.total]);

  const alerts = useMemo<ReportAlert[]>(() => {
    const items: ReportAlert[] = [];
    if (summary.invalid > 0) {
      items.push({ id: "invalid", title: "Potential invalid GST numbers found", severity: "warning", hint: "Correct GSTINs before export to avoid filing errors." });
    }
    if (summary.gst === 0 && rows.length > 0) {
      items.push({ id: "zero-gst", title: "GST amounts are zero", severity: "info", hint: "Check if orders are marked GST or amounts missing." });
    }
    return items;
  }, [rows.length, summary.gst, summary.invalid]);

  const resetFilters = () => {
    setFilters({
      dateRange: getDefaultDateRange(30),
      branchIds: [],
      schoolIds: [],
    });
  };

  if (isChecking) {
    return (
      <div className="min-h-[220px] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading report...</p>
      </div>
    );
  }

  if (branchesError || schoolsError || rowsError) {
    return <ErrorState message="Session expired. Please login again." />;
  }

  return (
    <ReportPageFrame
      title="GST Report"
      description="Accountant-friendly GST visibility with taxable value, calculated GST, invoice counts, and export-ready fields sourced from GST orders only."
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
          <FilterField label="Schools">
            <FilterMultiSelect label="Schools" options={schools} selectedValues={filters.schoolIds} onChange={(schoolIds) => setFilters((current) => ({ ...current, schoolIds }))} placeholder="All schools" />
          </FilterField>
        </div>
      </ReportFiltersPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <ReportMetricSkeleton key={index} />)
        ) : (
          <>
            <ReportMetricCard label="Total GST Collected" value={formatCurrency(summary.gst)} helper="Calculated from GST orders" />
            <ReportMetricCard label="GST Invoices" value={formatNumber(summary.invoices)} helper="Orders with GST number" />
            <ReportMetricCard label="Taxable Amount" value={formatCurrency(summary.taxable)} helper="Net of GST" />
            <ReportMetricCard label="Invoice Value" value={formatCurrency(summary.total)} helper="Gross order total" />
          </>
        )}
      </div>

      <SmartInsightsPanel insights={insights ?? []} loading={isLoading ?? false} />

      <Card className="border border-border/70 bg-white/95 shadow-sm">
        <CardHeader className="border-b border-border/70">
          <div>
            <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">GST Invoices</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Every row is sourced from a GST order and ready for accountant handoff or spreadsheet reconciliation.</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5">
              <ReportTableSkeleton columns={5} rows={7} />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <ReportEmptyState title="No GST invoices match these filters" description="Expand the date range or include more branches and schools to review GST activity." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>GST Number</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead className="text-right">Taxable Amount</TableHead>
                      <TableHead className="text-right">GST Amount</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead>GST Slab</TableHead>
                      <TableHead>Valid?</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Branch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.rows.map((row) => (
                      <TableRow key={row.order_id}>
                        <TableCell>{row.customer_name}</TableCell>
                        <TableCell className="font-mono text-xs uppercase tracking-[0.14em]">{row.gst_number}</TableCell>
                        <TableCell className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          <a href={`/admin/orders/${row.order_id}`} className="underline decoration-dashed">
                            {row.order_id_text.slice(0, 8)}
                          </a>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.taxable_amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.gst_amount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(row.total_amount)}</TableCell>
                        <TableCell>{slabForRow(row)}</TableCell>
                        <TableCell>
                          {/^[0-9A-Z]{15}$/.test(row.gst_number ?? "") ? (
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Valid</span>
                          ) : (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Check</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDisplayDate(row.order_date)}</TableCell>
                        <TableCell>{row.school_name}</TableCell>
                        <TableCell>{row.branch_name}</TableCell>
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

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <AlertsPanel alerts={alerts ?? []} />
        <div />
      </div>

      <ReportExportPanel
        description="Exports preserve the active filters, include GST summary rows, and keep the accountant-facing column order intact."
        onExportCsv={() => exportReportCsv(exportConfig)}
        onExportXlsx={() => exportReportXlsx(exportWorkbook)}
      />
    </ReportPageFrame>
  );
};

export default GstReportPage;
