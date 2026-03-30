import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import type { DateRange, GroupedRevenuePoint, SalesReportRow, SalesGroupBy } from "@/lib/reports/types";

export const REPORT_PAGE_SIZE = 25;

export const ORDER_STATUS_OPTIONS = [
  { value: "active", label: "Active Orders" },
  { value: "all", label: "All Statuses" },
  { value: "PLACED", label: "Placed" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "PACKED", label: "Packed" },
  { value: "DISPATCHED", label: "Dispatched" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const PAYMENT_MODE_OPTIONS = [
  { value: "all", label: "All Modes" },
  { value: "ONLINE", label: "Online" },
  { value: "UPI", label: "UPI" },
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "UNKNOWN", label: "Unknown" },
] as const;

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

export const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

export const formatPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "New";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}%`;
};

export const formatTightPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(1)}%`;
};

export const formatInputDate = (value: Date) => format(value, "yyyy-MM-dd");

export const formatDisplayDate = (value: string) => {
  if (!value) return "-";
  return format(parseISO(`${value}T00:00:00`), "dd MMM yyyy");
};

export const formatDateTime = (value: string) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const getDefaultDateRange = (days = 30): DateRange => ({
  from: formatInputDate(subDays(new Date(), days - 1)),
  to: formatInputDate(new Date()),
});

export const getPreviousDateRange = (range: DateRange): DateRange => {
  const from = parseISO(`${range.from}T00:00:00`);
  const to = parseISO(`${range.to}T00:00:00`);
  const span = Math.max(differenceInCalendarDays(to, from), 0) + 1;
  const previousTo = subDays(from, 1);
  const previousFrom = subDays(previousTo, span - 1);

  return {
    from: formatInputDate(previousFrom),
    to: formatInputDate(previousTo),
  };
};

export const getRangeSpanDays = (range: DateRange) => {
  const from = parseISO(`${range.from}T00:00:00`);
  const to = parseISO(`${range.to}T00:00:00`);
  return Math.max(differenceInCalendarDays(to, from), 0) + 1;
};

export const clampPage = (page: number, totalItems: number, pageSize = REPORT_PAGE_SIZE) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(page, 1), totalPages);
};

export const paginateRows = <T,>(rows: T[], page: number, pageSize = REPORT_PAGE_SIZE) => {
  const safePage = clampPage(page, rows.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    rows: rows.slice(start, start + pageSize),
  };
};

export const buildReportFilename = (reportName: string, extension: "csv" | "xlsx") => {
  const today = format(new Date(), "yyyyMMdd");
  return `${reportName}_${today}.${extension}`;
};

export const normalizeStatusLabel = (status: string) => {
  const normalized = String(status || "").toUpperCase();
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
};

export const getStatusBadgeClassName = (status: string) => {
  const normalized = String(status || "").toUpperCase();
  switch (normalized) {
    case "DELIVERED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "DISPATCHED":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "PACKED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ASSIGNED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "CANCELLED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-stone-200 bg-stone-50 text-stone-700";
  }
};

export const getGrowthBadgeClassName = (value: number | null) => {
  if (value === null) return "border-stone-200 bg-stone-50 text-stone-700";
  if (value > 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value < 0) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-stone-200 bg-stone-50 text-stone-700";
};

export const toGroupedRevenuePoints = (rows: SalesReportRow[], groupBy: SalesGroupBy): GroupedRevenuePoint[] => {
  const map = new Map<string, GroupedRevenuePoint>();

  rows.forEach((row) => {
    const key = groupBy === "school" ? row.school_id || "unassigned-school" : row.order_date;

    const label = groupBy === "school" ? row.school_name : formatDisplayDate(row.order_date);

    const current = map.get(key) ?? { key, label, revenue: 0, orders: 0 };
    current.revenue += Number(row.total_amount || 0);
    current.orders += 1;
    map.set(key, current);
  });

  const values = [...map.values()];
  if (groupBy === "date") {
    return values.sort((left, right) => left.key.localeCompare(right.key));
  }

  return values.sort((left, right) => right.revenue - left.revenue).slice(0, 8);
};
