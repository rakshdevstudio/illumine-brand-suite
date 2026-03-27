export type ReportRow = {
  order_id: string;
  customer_name: string;
  school_name: string;
  branch_name: string;
  product_name: string;
  variant: string;
  quantity: number;
  unit_price: number;
  line_amount: number;
  discount_amount?: number;
  payment_mode?: string;
  gst_number?: string | null;
  status: string;
  created_at: string;
};

export type SmartInsight = {
  id: string;
  type: "info" | "warning" | "success";
  message: string;
};

export type ReportExportConfig = {
  filename: string;
  columns: string[];
  rows: any[][];
};
