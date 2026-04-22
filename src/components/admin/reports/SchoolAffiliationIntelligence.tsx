import { useEffect, useMemo, useState } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useSpring } from "framer-motion";
import { Building2, CalendarRange, Check, ChevronsUpDown, Landmark, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/reports/format";
import type { DateRange, DimensionOption, SchoolAffiliationSummary } from "@/lib/reports/types";

type SaveState = "idle" | "saving" | "saved" | "error";

const AnimatedCurrency = ({ value, className }: { value: number; className?: string }) => {
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, { stiffness: 120, damping: 24, mass: 0.7 });
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.45,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [motionValue, value]);

  useMotionValueEvent(springValue, "change", (latest) => {
    setDisplayValue(latest);
  });

  return <span className={className}>{formatCurrency(displayValue)}</span>;
};

const AnimatedCount = ({ value, className }: { value: number; className?: string }) => {
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, { stiffness: 110, damping: 20, mass: 0.75 });
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.4,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [motionValue, value]);

  useMotionValueEvent(springValue, "change", (latest) => {
    setDisplayValue(latest);
  });

  return <span className={className}>{formatNumber(displayValue)}</span>;
};

const SaveStatePill = ({ saveState }: { saveState: SaveState }) => {
  if (saveState === "idle") return null;

  const tone =
    saveState === "saved"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700"
      : saveState === "saving"
        ? "border-sky-200/80 bg-sky-50/90 text-sky-700"
        : "border-rose-200/80 bg-rose-50/90 text-rose-700";

  const label = saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Needs attention";

  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-wide", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", saveState === "saved" ? "bg-emerald-500" : saveState === "saving" ? "bg-sky-500 animate-pulse" : "bg-rose-500")} />
      {label}
    </div>
  );
};

const SchoolSelector = ({
  options,
  selectedSchoolId,
  onChange,
}: {
  options: DimensionOption[];
  selectedSchoolId: string | null;
  onChange: (schoolId: string | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === selectedSchoolId) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full justify-between rounded-2xl border-white/60 bg-white/75 px-4 text-left font-normal shadow-sm backdrop-blur-md hover:bg-white"
        >
          <span className="truncate">{selected?.name ?? "All Schools"}</span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] border-white/70 bg-white/95 p-0 shadow-2xl backdrop-blur-xl" align="start">
        <Command>
          <CommandInput placeholder="Search schools" />
          <CommandList>
            <CommandEmpty>No schools found.</CommandEmpty>
            <CommandGroup heading="Schools">
              <CommandItem
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex items-center justify-between gap-3"
              >
                <span>All Schools</span>
                <Check className={cn("h-4 w-4", !selectedSchoolId ? "opacity-100" : "opacity-0")} />
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.name} ${option.secondary || ""}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{option.name}</p>
                      {option.secondary ? <p className="truncate text-xs text-muted-foreground">{option.secondary}</p> : null}
                    </div>
                    <Check className={cn("h-4 w-4 shrink-0", selectedSchoolId === option.id ? "opacity-100" : "opacity-0")} />
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const AffiliationHeroSkeleton = () => (
  <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-xl">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_28%),linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.72))]" />
    <div className="relative grid gap-5 xl:grid-cols-[1.05fr_1.4fr_0.95fr]">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-9 w-56 rounded-xl" />
        <Skeleton className="h-4 w-36 rounded-full" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[24px] border border-white/60 bg-white/70 p-4">
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="mt-4 h-8 w-28 rounded-xl" />
            <Skeleton className="mt-2 h-3 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className="rounded-[28px] border border-white/70 bg-white/78 p-5">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="mt-4 h-12 w-full rounded-2xl" />
        <Skeleton className="mt-6 h-3 w-28 rounded-full" />
        <Skeleton className="mt-3 h-10 w-36 rounded-xl" />
      </div>
    </div>
  </div>
);

export const SchoolAffiliationIntelligence = ({
  schools,
  selectedSchoolId,
  onSchoolChange,
  dateRange,
  onDateRangeChange,
  summary,
  isLoading,
  isRefreshing,
  draftCommissionPercentage,
  parsedCommissionPercentage,
  updateDraftCommissionPercentage,
  commissionPayable,
  validationMessage,
  saveState,
}: {
  schools: DimensionOption[];
  selectedSchoolId: string | null;
  onSchoolChange: (schoolId: string | null) => void;
  dateRange: DateRange;
  onDateRangeChange: (next: DateRange) => void;
  summary: SchoolAffiliationSummary | null;
  isLoading: boolean;
  isRefreshing: boolean;
  draftCommissionPercentage: string;
  parsedCommissionPercentage: number;
  updateDraftCommissionPercentage: (value: string) => void;
  commissionPayable: number;
  validationMessage: string | null;
  saveState: SaveState;
}) => {
  const selectedSchool = useMemo(
    () => schools.find((option) => option.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  const hasMetrics = !!selectedSchoolId;
  const metrics = summary ?? {
    school_id: selectedSchoolId ?? "",
    revenue_incl: 0,
    revenue_excl: 0,
    gst: 0,
    order_count: 0,
  };

  const commissionTone = validationMessage
    ? "border-rose-200/80 focus-visible:ring-rose-200"
    : "border-emerald-200/80 focus-visible:ring-emerald-200";

  return (
    <section className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative overflow-hidden rounded-[32px] border border-black/5 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,250,252,0.82))] p-5 shadow-[0_24px_80px_-42px_rgba(15,23,42,0.42)] backdrop-blur-xl"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.98),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.08),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.16),transparent_60%)]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Affiliation Intelligence
            </div>
            <div>
              <h2 className="text-xl font-light tracking-[0.06em] text-foreground">School-wise Commission Engine</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Inspect invoice-backed revenue, GST, and commission exposure per school partner in one place.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3 xl:min-w-[780px]">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                School
              </p>
              <SchoolSelector options={schools} selectedSchoolId={selectedSchoolId} onChange={onSchoolChange} />
            </div>
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" />
                From Date
              </p>
              <Input
                type="date"
                value={dateRange.from}
                onChange={(event) => onDateRangeChange({ ...dateRange, from: event.target.value })}
                className="h-12 rounded-2xl border-white/60 bg-white/75 shadow-sm backdrop-blur-md"
              />
            </div>
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">To Date</p>
              <Input
                type="date"
                value={dateRange.to}
                onChange={(event) => onDateRangeChange({ ...dateRange, to: event.target.value })}
                className="h-12 rounded-2xl border-white/60 bg-white/75 shadow-sm backdrop-blur-md"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {!hasMetrics ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[32px] border border-dashed border-black/10 bg-[linear-gradient(135deg,rgba(248,250,252,0.92),rgba(255,255,255,0.72))] p-8 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.4)]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.08),transparent_32%)]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">All Schools View</p>
              <h3 className="text-2xl font-light tracking-[0.04em] text-foreground">Select a school to unlock commission intelligence</h3>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Revenue charts and orders already support the full portfolio. Pick a school above to reveal GST, commission rate, and the exact payable amount.
              </p>
            </div>
            <div className="inline-flex items-center gap-3 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm text-muted-foreground shadow-sm">
              <Landmark className="h-4 w-4" />
              Default state: All Schools
            </div>
          </div>
        </motion.div>
      ) : isLoading ? (
        <AffiliationHeroSkeleton />
      ) : (
        <motion.div
          key={selectedSchoolId}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          whileHover={{ y: -2 }}
          className="group relative overflow-hidden rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-xl transition-shadow duration-300 hover:shadow-[0_28px_100px_-38px_rgba(15,23,42,0.42)]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_28%),linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.72))]" />
          <div className="absolute -right-20 top-0 h-44 w-44 rounded-full bg-emerald-200/20 blur-3xl transition-transform duration-500 group-hover:scale-110" />
          <div className="absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-amber-200/20 blur-3xl transition-transform duration-500 group-hover:scale-110" />

          <div className="relative grid gap-5 xl:grid-cols-[1.05fr_1.4fr_0.95fr]">
            <div className="flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/78 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Selected School
                  </div>
                  {isRefreshing ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50/90 px-3 py-1 text-xs text-sky-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                      Refreshing
                    </div>
                  ) : null}
                </div>
                <div>
                  <h3 className="text-3xl font-light tracking-[0.03em] text-foreground">{selectedSchool?.name ?? "Selected School"}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Commission is always calculated on subtotal only, never on GST-inclusive value.
                  </p>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/70 bg-white/72 px-4 py-3 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Orders Count</p>
                <div className="mt-2 flex items-end gap-2">
                  <AnimatedCount value={metrics.order_count} className="text-3xl font-light tracking-tight text-foreground" />
                  <span className="pb-1 text-sm text-muted-foreground">orders in range</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[26px] border border-white/70 bg-white/76 p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Revenue Incl GST</p>
                <div className="mt-4">
                  <AnimatedCurrency value={metrics.revenue_incl} className="text-3xl font-light tracking-tight text-slate-950" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Gross billed invoice total</p>
              </div>

              <div className="rounded-[26px] border border-white/70 bg-white/76 p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Revenue Excl GST</p>
                <div className="mt-4">
                  <AnimatedCurrency value={metrics.revenue_excl} className="text-3xl font-light tracking-tight text-slate-950" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Commission base subtotal</p>
              </div>

              <div className="rounded-[26px] border border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,251,235,0.95),rgba(255,255,255,0.88))] p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.22em] text-amber-700/90">GST Collected</p>
                <div className="mt-4">
                  <AnimatedCurrency value={metrics.gst} className="text-3xl font-light tracking-tight text-amber-700" />
                </div>
                <p className="mt-3 text-xs text-amber-700/80">CGST + SGST</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-emerald-200/70 bg-[linear-gradient(180deg,rgba(240,253,244,0.96),rgba(255,255,255,0.92))] p-5 shadow-[0_18px_40px_-28px_rgba(34,197,94,0.48)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-700/80">Commission Rate</p>
                  <p className="mt-1 text-xs text-emerald-700/70">Debounced auto-save</p>
                </div>
                <SaveStatePill saveState={saveState} />
              </div>

              <div className="mt-5 relative">
                <Input
                  value={draftCommissionPercentage}
                  onChange={(event) => updateDraftCommissionPercentage(event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className={cn(
                    "h-14 rounded-2xl border bg-white/95 pr-12 text-xl font-medium text-foreground shadow-sm",
                    commissionTone,
                  )}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-emerald-700">%</span>
              </div>

              <div className="mt-5 rounded-[24px] border border-emerald-200/80 bg-white/82 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-700/80">Commission Payable</p>
                <div className="mt-3">
                  <AnimatedCurrency value={commissionPayable} className="text-[2.4rem] font-light leading-none tracking-tight text-emerald-700" />
                </div>
                <p className="mt-3 text-xs text-emerald-700/70">
                  {parsedCommissionPercentage.toFixed(2)}% of {formatCurrency(metrics.revenue_excl)}
                </p>
              </div>

              <p className={cn("mt-4 min-h-[20px] text-xs", validationMessage ? "text-rose-600" : "text-emerald-700/70")}>
                {validationMessage ?? (metrics.order_count === 0 ? "No invoices in the selected range yet. Rates still persist for future billing." : "Updates save automatically and reflect instantly in the payable figure.")}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
};
