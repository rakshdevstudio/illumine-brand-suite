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

export type ReportStatusFilter = "active" | "all" | "PLACED" | "PACKED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
export type PaymentModeFilter = "all" | "ONLINE" | "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "UNKNOWN";
export type SalesGroupBy = "date" | "school";
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
  schoolIds: string[];
  status: ReportStatusFilter;
  paymentMode: PaymentModeFilter;
  search: string;
};

export type InventoryReportFilters = {
  dateRange: DateRange;
  productIds: string[];
  schoolIds: string[];
  classIds: string[];
  genders: string[];
  negativeOnly: boolean;
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
  status: string;
  payment_mode: string;
  revenue_share?: number;
  discount_amount?: number;
};

export type InventoryReportDailyRow = {
  movement_date: string;
  branch_id: string;
  branch_name: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  school_id: string | null;
  school_name: string;
  class_id: string | null;
  class_name: string;
  gender: string;
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
  school_id: string | null;
  school_name: string;
  class_id: string | null;
  class_name: string;
  gender: string;
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
