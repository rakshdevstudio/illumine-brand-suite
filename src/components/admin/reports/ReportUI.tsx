import { useMemo, useState } from "react";
import { ChevronsUpDown, Check, Download, FileSpreadsheet, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import type { DimensionOption, ReportAlert, SmartInsight } from "@/lib/reports/types";
import { Badge } from "@/components/ui/badge";

type FilterMultiSelectProps = {
  label: string;
  options: DimensionOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
};

export const ReportPageFrame = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-6">
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Reports</p>
      <div>
        <h1 className="text-2xl font-light tracking-[0.08em] uppercase text-foreground">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    {children}
  </div>
);

export const ReportFiltersPanel = ({
  children,
  onReset,
}: {
  children: React.ReactNode;
  onReset: () => void;
}) => (
  <Card className="overflow-hidden border border-border/70 bg-white/95 shadow-sm">
    <CardHeader className="border-b border-border/70 bg-stone-50/80 pb-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Filters</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Refine the report before reviewing metrics, tables, and exports.</p>
        </div>
        <Button type="button" variant="ghost" className="justify-start text-xs uppercase tracking-[0.18em] md:justify-center" onClick={onReset}>
          Reset Filters
        </Button>
      </div>
    </CardHeader>
    <CardContent className="pt-5">{children}</CardContent>
  </Card>
);

export const FilterField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
    {children}
  </div>
);

export const FilterMultiSelect = ({ label, options, selectedValues, onChange, placeholder }: FilterMultiSelectProps) => {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === 1) {
      return options.find((option) => option.id === selectedValues[0])?.name ?? placeholder;
    }
    return `${selectedValues.length} selected`;
  }, [options, placeholder, selectedValues]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selectedValues.filter((current) => current !== value));
      return;
    }

    onChange([...selectedValues, value]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between rounded-2xl border-black/10 bg-white px-4 text-left font-normal hover:bg-white"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup heading={label}>
              <CommandItem onSelect={() => onChange([])} className="flex items-center justify-between gap-2">
                <span>All</span>
                <Check className={cn("h-4 w-4", selectedValues.length === 0 ? "opacity-100" : "opacity-0")} />
              </CommandItem>
              {options.map((option) => {
                const checked = selectedSet.has(option.id);
                return (
                  <CommandItem key={option.id} value={`${option.name} ${option.secondary || ""}`} onSelect={() => toggleValue(option.id)}>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{option.name}</p>
                        {option.secondary ? <p className="text-xs text-muted-foreground">{option.secondary}</p> : null}
                      </div>
                      <Check className={cn("h-4 w-4 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const ReportMetricCard = ({ label, value, helper }: { label: string; value: string; helper?: string }) => (
  <Card className="border border-border/70 bg-white/95 shadow-sm">
    <CardContent className="space-y-2 p-5">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="text-2xl font-light tracking-tight text-foreground">{value}</p>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </CardContent>
  </Card>
);

export const ReportMetricSkeleton = () => (
  <Card className="border border-border/70 bg-white/95 shadow-sm">
    <CardContent className="space-y-3 p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </CardContent>
  </Card>
);

export const SmartInsightsPanel = ({ insights = [], loading = false }: { insights?: SmartInsight[]; loading?: boolean }) => (
  <Card className="border border-border/70 bg-gradient-to-br from-white via-white to-stone-50 shadow-sm">
    <CardHeader className="flex flex-col gap-2 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Smart Insights</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">AI-lite signals that surface anomalies, trends, and risks for the active filters.</p>
      </div>
      <Badge variant="outline" className="rounded-full border-amber-300/70 bg-amber-50 text-xs text-amber-800">
        Live · Filter aware
      </Badge>
    </CardHeader>
    <CardContent className="space-y-3 p-5">
      {loading ? (
        <ReportTableSkeleton columns={1} rows={3} />
      ) : insights.length === 0 ? (
        <ReportEmptyState title="No notable signals" description="Adjust the date range or focus on a branch/product to surface sharper insights." />
      ) : (
        insights.map((insight) => {
          const palette =
            insight.type === "warning"
              ? "border-amber-200/80 bg-amber-50/70 text-amber-900"
              : insight.type === "success"
                ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-900"
                : "border-sky-200/70 bg-sky-50/70 text-sky-900";

          return (
            <div
              key={insight.id}
              className={cn(
                "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
                palette,
              )}
            >
              <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-current opacity-70" />
              <p className="text-sm leading-6">{insight.message}</p>
            </div>
          );
        })
      )}
    </CardContent>
  </Card>
);

export const AlertsPanel = ({ alerts = [] }: { alerts?: ReportAlert[] }) => {
  if (alerts.length === 0) return null;
  return (
    <Card className="border border-border/70 bg-white/95 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/70">
        <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Alerts</CardTitle>
        <Badge className="rounded-full bg-rose-600 px-3 py-1 text-[11px] tracking-wide text-white">{alerts.length}</Badge>
      </CardHeader>
      <CardContent className="divide-y divide-border/70 p-0">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex items-start gap-3 px-4 py-3 hover:bg-rose-50/60">
            <div
              className={cn(
                "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                alert.severity === "negative" ? "bg-rose-600" : alert.severity === "warning" ? "bg-amber-500" : alert.severity === "positive" ? "bg-emerald-500" : "bg-sky-500",
              )}
            />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{alert.title}</p>
              {alert.hint ? <p className="text-xs text-muted-foreground">{alert.hint}</p> : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export const ReportTableSkeleton = ({ columns = 6, rows = 6 }: { columns?: number; rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((__, columnIndex) => (
          <Skeleton key={columnIndex} className="h-10 w-full" />
        ))}
      </div>
    ))}
  </div>
);

export const ReportEmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-3xl border border-dashed border-border bg-stone-50/70 px-6 py-12 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-white">
      <SearchX className="h-5 w-5 text-muted-foreground" />
    </div>
    <h3 className="mt-4 text-base font-medium text-foreground">{title}</h3>
    <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
  </div>
);

export const ReportExportPanel = ({
  description,
  onExportCsv,
  onExportXlsx,
}: {
  description: string;
  onExportCsv: () => void;
  onExportXlsx: () => void;
}) => (
  <Card className="border border-border/70 bg-white/95 shadow-sm">
    <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Export</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={onExportCsv}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        <Button type="button" className="rounded-full" onClick={onExportXlsx}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
        </Button>
      </div>
    </CardContent>
  </Card>
);

export const ReportPagination = ({
  page,
  totalPages,
  totalRows,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (page: number) => void;
}) => {
  if (totalRows === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} · {totalRows} rows
      </p>
      <Pagination className="mx-0 w-auto justify-start md:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (page > 1) onPageChange(page - 1);
              }}
              className={cn(page === 1 && "pointer-events-none opacity-50")}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (page < totalPages) onPageChange(page + 1);
              }}
              className={cn(page === totalPages && "pointer-events-none opacity-50")}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};
