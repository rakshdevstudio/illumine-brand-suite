import type { ReportExportConfig, ReportRow, SmartInsight } from "@/types/reports";

export type DateRange = {
  from: string;
  to: string;
};

export type DimensionOption = {
  id: string;
  name: string;
  secondary?: string | null;
};

export type ReportStatusFilter = "active" | "all" | "PLACED" | "ASSIGNED" | "PACKED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
export type PaymentModeFilter = "all" | "ONLINE" | "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "UNKNOWN";
export type SalesGroupBy = "date" | "branch" | "school";
export type SalesViewMode = "order" | "item";

export type InsightSeverity = "positive" | "warning" | "negative" | "info";

export type ReportAlert = {
  id: string;
  title: string;
  severity: InsightSeverity;
  hint?: string;
};

export type { ReportRow, SmartInsight, ReportExportConfig };

export type SalesReportFilters = {
  dateRange: DateRange;
  branchIds: string[];
  schoolIds: string[];
  status: ReportStatusFilter;
  gstOnly: boolean;
  paymentMode: PaymentModeFilter;
  search: string;
};

export type GstReportFilters = {
  dateRange: DateRange;
  branchIds: string[];
  schoolIds: string[];
};

export type InventoryReportFilters = {
  dateRange: DateRange;
  branchIds: string[];
  productIds: string[];
  negativeOnly: boolean;
};

export type BranchReportFilters = {
  dateRange: DateRange;
  branchIds: string[];
  status: ReportStatusFilter;
};

export type SalesReportRow = {
  order_id: string;
  order_id_text: string;
  order_date: string;
  order_created_at: string;
  customer_name: string;
  phone: string;
  school_id: string | null;
  school_name: string;
  branch_id: string | null;
  branch_name: string;
  items: string;
  total_quantity: number;
  total_amount: number;
  taxable_amount: number;
  gst_amount: number;
  gst_number: string | null;
  is_gst_order: boolean;
  status: string;
  payment_mode: string;
  search_text: string;
};

export type SalesItemReportRow = {
  order_id: string;
  order_id_text: string;
  order_date: string;
  order_created_at: string;
  customer_name: string;
  phone: string;
  school_id: string | null;
  school_name: string;
  branch_id: string | null;
  branch_name: string;
  product_id: string;
  product_name: string;
  variant_id: string;
  variant_size: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  line_amount: number;
  taxable_amount: number;
  gst_amount: number;
  gst_number: string | null;
  is_gst_order: boolean;
  status: string;
  payment_mode: string;
  revenue_share?: number;
  discount_amount?: number;
};

export type GstReportRow = {
  order_id: string;
  order_id_text: string;
  order_date: string;
  order_created_at: string;
  customer_name: string;
  phone: string;
  school_id: string | null;
  school_name: string;
  branch_id: string | null;
  branch_name: string;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  gst_number: string;
  status: string;
  payment_mode: string;
};

export type InventoryReportDailyRow = {
  movement_date: string;
  branch_id: string;
  branch_name: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_size: string;
  opening_stock: number;
  stock_in: number;
  stock_out: number;
  adjustments: number;
  closing_stock: number;
  current_stock: number;
  negative_stock_detected: boolean;
  movement_count: number;
  first_movement_at: string;
  last_movement_at: string;
};

export type InventoryAuditRow = {
  id: string;
  branch_id: string;
  variant_id: string;
  type: "IN" | "OUT" | "ADJUSTMENT" | "TRANSFER";
  quantity: number;
  before_stock: number;
  after_stock: number;
  reason: string | null;
  reference_type: "ORDER" | "MANUAL" | "SYSTEM";
  reference_id: string | null;
  created_at: string;
  branch_name: string;
  product_name: string;
  variant_size: string;
};

export type AggregatedInventoryReportRow = {
  key: string;
  branch_id: string;
  branch_name: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_size: string;
  opening_stock: number;
  stock_in: number;
  stock_out: number;
  adjustments: number;
  closing_stock: number;
  current_stock: number;
  negative_stock_detected: boolean;
  movement_count: number;
  first_movement_at: string;
  last_movement_at: string;
};

export type BranchReportDailyRow = {
  report_date: string;
  branch_id: string;
  branch_name: string;
  status: string;
  total_orders: number;
  total_revenue: number;
  gst_revenue: number;
};

export type BranchTopProductRow = {
  order_date: string;
  branch_id: string | null;
  branch_name: string;
  product_id: string;
  product_name: string;
  quantity: number;
  status: string;
};

export type AggregatedBranchReportRow = {
  rank: number;
  previous_rank?: number | null;
  branch_id: string;
  branch_name: string;
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
  gst_revenue: number;
  top_selling_product: string;
  growth_pct: number | null;
  contribution_pct?: number;
  rank_delta?: number | null;
};

export type ReportSummaryCard = {
  label: string;
  value: string;
  helper?: string;
};

export type GroupedRevenuePoint = {
  key: string;
  label: string;
  revenue: number;
  orders: number;
};
