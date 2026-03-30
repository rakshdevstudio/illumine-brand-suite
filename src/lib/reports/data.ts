import { supabase } from "@/integrations/supabase/client";
import { safeQuery } from "@/lib/safeQuery";
import type {
  AggregatedBranchReportRow,
  AggregatedInventoryReportRow,
  BranchReportDailyRow,
  BranchReportFilters,
  BranchTopProductRow,
  DimensionOption,
  GstReportFilters,
  GstReportRow,
  InventoryAuditRow,
  InventoryReportDailyRow,
  InventoryReportFilters,
  ReportStatusFilter,
  SalesReportFilters,
  SalesItemReportRow,
  SalesReportRow,
} from "@/lib/reports/types";

const PAGE_SIZE = 1000;
const db = supabase as any;

const toNumber = (value: unknown) => Number(value || 0);
const toBoolean = (value: unknown) => Boolean(value);

const normalizeSalesItemRow = (row: any): SalesItemReportRow => ({
  order_id: String(row.order_id),
  order_id_text: String(row.order_id_text),
  order_date: String(row.order_date),
  order_created_at: String(row.order_created_at),
  customer_name: String(row.customer_name || ""),
  phone: String(row.phone || ""),
  school_id: row.school_id ? String(row.school_id) : null,
  school_name: String(row.school_name || "Unassigned School"),
  branch_id: row.branch_id ? String(row.branch_id) : null,
  branch_name: String(row.branch_name || "Unassigned Branch"),
  product_id: String(row.product_id || ""),
  product_name: String(row.product_name || "Product"),
  variant_id: String(row.variant_id || ""),
  variant_size: String(row.variant_size || "Default"),
  sku: row.sku ? String(row.sku) : null,
  quantity: toNumber(row.quantity),
  unit_price: row.unit_price ? toNumber(row.unit_price) : row.quantity ? toNumber(row.line_amount) / toNumber(row.quantity) : toNumber(row.line_amount),
  line_amount: toNumber(row.line_amount),
  taxable_amount: toNumber(row.order_taxable_amount ?? row.taxable_amount),
  gst_amount: toNumber(row.order_gst_amount ?? row.gst_amount),
  gst_number: row.gst_number ? String(row.gst_number) : null,
  is_gst_order: toBoolean(row.is_gst_order),
  status: String(row.status || "PLACED"),
  payment_mode: String(row.payment_mode || "UNKNOWN"),
  discount_amount: toNumber(row.discount_amount),
  revenue_share: toNumber(row.revenue_share),
});

const normalizeSalesRow = (row: any): SalesReportRow => ({
  order_id: String(row.order_id),
  order_id_text: String(row.order_id_text),
  order_date: String(row.order_date),
  order_created_at: String(row.order_created_at),
  customer_name: String(row.customer_name || ""),
  phone: String(row.phone || ""),
  school_id: row.school_id ? String(row.school_id) : null,
  school_name: String(row.school_name || "Unassigned School"),
  branch_id: row.branch_id ? String(row.branch_id) : null,
  branch_name: String(row.branch_name || "Unassigned Branch"),
  items: String(row.items || ""),
  total_quantity: toNumber(row.total_quantity),
  total_amount: toNumber(row.total_amount),
  taxable_amount: toNumber(row.taxable_amount),
  gst_amount: toNumber(row.gst_amount),
  gst_number: row.gst_number ? String(row.gst_number) : null,
  is_gst_order: toBoolean(row.is_gst_order),
  status: String(row.status || "PLACED"),
  payment_mode: String(row.payment_mode || "UNKNOWN"),
  search_text: String(row.search_text || ""),
});

const normalizeGstRow = (row: any): GstReportRow => ({
  order_id: String(row.order_id),
  order_id_text: String(row.order_id_text),
  order_date: String(row.order_date),
  order_created_at: String(row.order_created_at),
  customer_name: String(row.customer_name || ""),
  phone: String(row.phone || ""),
  school_id: row.school_id ? String(row.school_id) : null,
  school_name: String(row.school_name || "Unassigned School"),
  branch_id: row.branch_id ? String(row.branch_id) : null,
  branch_name: String(row.branch_name || "Unassigned Branch"),
  taxable_amount: toNumber(row.taxable_amount),
  gst_amount: toNumber(row.gst_amount),
  total_amount: toNumber(row.total_amount),
  gst_number: String(row.gst_number || ""),
  status: String(row.status || "PLACED"),
  payment_mode: String(row.payment_mode || "UNKNOWN"),
});

const normalizeInventoryDailyRow = (row: any): InventoryReportDailyRow => ({
  movement_date: String(row.movement_date),
  branch_id: String(row.branch_id),
  branch_name: String(row.branch_name || "Unknown Branch"),
  variant_id: String(row.variant_id),
  product_id: String(row.product_id),
  product_name: String(row.product_name || "Product"),
  variant_size: String(row.variant_size || "Default"),
  opening_stock: toNumber(row.opening_stock),
  stock_in: toNumber(row.stock_in),
  stock_out: toNumber(row.stock_out),
  adjustments: toNumber(row.adjustments),
  closing_stock: toNumber(row.closing_stock),
  current_stock: toNumber(row.current_stock),
  negative_stock_detected: toBoolean(row.negative_stock_detected),
  movement_count: toNumber(row.movement_count),
  first_movement_at: String(row.first_movement_at || ""),
  last_movement_at: String(row.last_movement_at || ""),
});

const normalizeBranchDailyRow = (row: any): BranchReportDailyRow => ({
  report_date: String(row.report_date),
  branch_id: String(row.branch_id),
  branch_name: String(row.branch_name || "Unknown Branch"),
  status: String(row.status || "PLACED"),
  total_orders: toNumber(row.total_orders),
  total_revenue: toNumber(row.total_revenue),
  gst_revenue: toNumber(row.gst_revenue),
});

const normalizeBranchTopProductRow = (row: any): BranchTopProductRow => ({
  order_date: String(row.order_date),
  branch_id: row.branch_id ? String(row.branch_id) : null,
  branch_name: String(row.branch_name || "Unknown Branch"),
  product_id: String(row.product_id),
  product_name: String(row.product_name || "Product"),
  quantity: toNumber(row.quantity),
  status: String(row.status || "PLACED"),
});

const normalizeInventoryAuditRow = (row: any): InventoryAuditRow => ({
  id: String(row.id),
  branch_id: String(row.branch_id),
  variant_id: String(row.variant_id),
  type: row.type,
  quantity: toNumber(row.quantity),
  before_stock: toNumber(row.before_stock),
  after_stock: toNumber(row.after_stock),
  reason: row.reason ? String(row.reason) : null,
  reference_type: row.reference_type,
  reference_id: row.reference_id ? String(row.reference_id) : null,
  created_at: String(row.created_at),
  branch_name: String(row.branches?.name || "Unknown Branch"),
  product_name: String(row.product_variants?.products?.name || "Product"),
  variant_size: String(row.product_variants?.size || "Default"),
});

async function fetchAllRows<T>(buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  let from = 0;
  const rows: T[] = [];

  while (true) {
    const { data } = await safeQuery<T[]>(() => buildQuery(from, from + PAGE_SIZE - 1), "reports/fetchAllRows");
    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

const applyIdFilter = (query: any, column: string, ids: string[]) => (ids.length ? query.in(column, ids) : query);

const applyStatusFilter = (query: any, status: ReportStatusFilter) => {
  if (status === "active") return query.neq("status", "CANCELLED");
  if (status === "all") return query;
  return query.eq("status", status);
};

const isRelationMissingError = (error: any) => {
  const code = (error?.code || "").toString();
  const message = (error?.message || "").toLowerCase();
  return code === "PGRST301" || message.includes("not found") || message.includes("does not exist");
};

const buildSalesRowFromOrder = (order: any): SalesReportRow => {
  const items = (order.order_items ?? [])
    .map((item: any) => {
      const name = item.products?.name ?? "Item";
      const size = item.product_variants?.size ? ` (${item.product_variants.size})` : "";
      return `${name}${size} x${item.quantity}`;
    })
    .join(", ");

  const totalQuantity = (order.order_items ?? []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
  const totalAmount = Number(order.total_amount || 0);
  const taxableAmount = order.gst_number ? totalAmount / 1.18 : totalAmount;
  const gstAmount = order.gst_number ? totalAmount - taxableAmount : 0;

  const schoolName = Array.isArray(order.schools) ? order.schools[0]?.name : order.schools?.name;
  const branchName = Array.isArray(order.branches) ? order.branches[0]?.name : order.branches?.name;

  const searchText = `${order.id} ${order.customer_name} ${order.phone} ${order.gst_number || ""} ${schoolName || ""} ${branchName || ""}`.trim();

  return {
    order_id: String(order.id),
    order_id_text: String(order.id),
    order_date: String((order.created_at || "").slice(0, 10)),
    order_created_at: String(order.created_at || ""),
    customer_name: String(order.customer_name || ""),
    phone: String(order.phone || ""),
    school_id: order.school_id ? String(order.school_id) : null,
    school_name: schoolName || "Unassigned School",
    branch_id: order.branch_id ? String(order.branch_id) : null,
    branch_name: branchName || "Unassigned Branch",
    items,
    total_quantity: totalQuantity,
    total_amount: totalAmount,
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    gst_number: order.gst_number ? String(order.gst_number) : null,
    is_gst_order: Boolean(order.is_gst_order),
    status: String(order.status || "PLACED"),
    payment_mode: String(order.payment_mode || "UNKNOWN"),
    search_text: searchText,
  };
};

export const fetchBranchOptions = async (): Promise<DimensionOption[]> => {
  const { data } = await safeQuery<any[]>(() => db.from("branches").select("id, name, location").order("name"), "reports/fetchBranchOptions");
  return (data ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name), secondary: row.location || null }));
};

export const fetchSchoolOptions = async (): Promise<DimensionOption[]> => {
  const { data } = await safeQuery<any[]>(() => db.from("schools").select("id, name, code").order("name"), "reports/fetchSchoolOptions");
  return (data ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name), secondary: row.code || null }));
};

export const fetchProductOptions = async (): Promise<DimensionOption[]> => {
  const { data } = await safeQuery<any[]>(() => db.from("products").select("id, name, category").order("name"), "reports/fetchProductOptions");
  return (data ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name), secondary: row.category || null }));
};

export const fetchSalesReportRows = async (filters: SalesReportFilters): Promise<SalesReportRow[]> => {
  const search = filters.search.trim();

  try {
    const rows = await fetchAllRows<any>((from, to) => {
      let query = db
        .from("sales_report_view")
        .select("*")
        .gte("order_date", filters.dateRange.from)
        .lte("order_date", filters.dateRange.to)
        .order("order_created_at", { ascending: false })
        .range(from, to);

      query = applyIdFilter(query, "branch_id", filters.branchIds);
      query = applyIdFilter(query, "school_id", filters.schoolIds);
      query = applyStatusFilter(query, filters.status);

      if (filters.gstOnly) {
        query = query.eq("is_gst_order", true);
      }

      if (filters.paymentMode !== "all") {
        query = query.eq("payment_mode", filters.paymentMode);
      }

      if (search) {
        query = query.ilike("search_text", `%${search}%`);
      }

      return query;
    });

    return rows.map(normalizeSalesRow);
  } catch (error: any) {
    if (!isRelationMissingError(error)) throw error;

    // Fallback: derive rows directly from orders/order_items when the view is unavailable.
    const { data } = await safeQuery<any[]>(
      () =>
        db
          .from("orders")
          .select(
            "id, created_at, customer_name, phone, school_id, branch_id, total_amount, gst_number, is_gst_order, status, payment_mode, " +
              "order_items(id, product_id, quantity, price, product_variants(size), products(name)), schools(name), branches(name)"
          )
          .gte("created_at", `${filters.dateRange.from}T00:00:00`)
          .lte("created_at", `${filters.dateRange.to}T23:59:59`)
          .order("created_at", { ascending: false }),
      "reports/fetchSalesReportRows/fallback"
    );

    let rows = (data ?? []).map(buildSalesRowFromOrder);

    if (filters.branchIds.length) rows = rows.filter((row) => row.branch_id && filters.branchIds.includes(row.branch_id));
    if (filters.schoolIds.length) rows = rows.filter((row) => row.school_id && filters.schoolIds.includes(row.school_id));
    if (filters.status !== "all") rows = rows.filter((row) => (filters.status === "active" ? row.status !== "CANCELLED" : row.status === filters.status));
    if (filters.gstOnly) rows = rows.filter((row) => row.is_gst_order || row.gst_number);
    if (filters.paymentMode !== "all") rows = rows.filter((row) => row.payment_mode === filters.paymentMode);
    if (search) {
      const needle = search.toLowerCase();
      rows = rows.filter((row) => row.search_text.toLowerCase().includes(needle));
    }

    return rows;
  }
};

export const fetchSalesItemReportRows = async (filters: SalesReportFilters): Promise<SalesItemReportRow[]> => {
  const search = filters.search.trim();

  try {
    const rows = await fetchAllRows<any>((from, to) => {
      let query = db
        .from("sales_item_report_view")
        .select("*")
        .gte("order_date", filters.dateRange.from)
        .lte("order_date", filters.dateRange.to)
        .order("order_created_at", { ascending: false })
        .range(from, to);

      query = applyIdFilter(query, "branch_id", filters.branchIds);
      query = applyIdFilter(query, "school_id", filters.schoolIds);
      query = applyStatusFilter(query, filters.status);

      if (filters.gstOnly) {
        query = query.eq("is_gst_order", true);
      }

      if (filters.paymentMode !== "all") {
        query = query.eq("payment_mode", filters.paymentMode);
      }

      if (search) {
        query = query.ilike("customer_name", `%${search}%`);
      }

      return query;
    });

    return rows.map(normalizeSalesItemRow);
  } catch (error: any) {
    if (!isRelationMissingError(error)) throw error;

    const { data } = await safeQuery<any[]>(
      () =>
        db
          .from("orders")
          .select(
            "id, created_at, customer_name, phone, school_id, branch_id, total_amount, gst_number, is_gst_order, status, payment_mode, " +
              "order_items(id, product_id, variant_id, quantity, price, discount, product_variants(size, sku), products(name)), schools(name), branches(name)"
          )
          .gte("created_at", `${filters.dateRange.from}T00:00:00`)
          .lte("created_at", `${filters.dateRange.to}T23:59:59`)
          .order("created_at", { ascending: false }),
      "reports/fetchSalesItemReportRows/fallback"
    );

    let rows: SalesItemReportRow[] = [];

    (data ?? []).forEach((order: any) => {
      const schoolName = Array.isArray(order.schools) ? order.schools[0]?.name : order.schools?.name;
      const branchName = Array.isArray(order.branches) ? order.branches[0]?.name : order.branches?.name;
      const taxableAmount = order.gst_number ? Number(order.total_amount || 0) / 1.18 : Number(order.total_amount || 0);
      const gstAmount = order.gst_number ? Number(order.total_amount || 0) - taxableAmount : 0;

      (order.order_items ?? []).forEach((item: any) => {
        rows.push({
          order_id: String(order.id),
          order_id_text: String(order.id),
          order_date: String((order.created_at || "").slice(0, 10)),
          order_created_at: String(order.created_at || ""),
          customer_name: String(order.customer_name || ""),
          phone: String(order.phone || ""),
          school_id: order.school_id ? String(order.school_id) : null,
          school_name: schoolName || "Unassigned School",
          branch_id: order.branch_id ? String(order.branch_id) : null,
          branch_name: branchName || "Unassigned Branch",
          product_id: String(item.product_id || ""),
          product_name: String(item.products?.name || "Product"),
          variant_id: String(item.variant_id || ""),
          variant_size: String(item.product_variants?.size || "Default"),
          sku: item.product_variants?.sku ? String(item.product_variants.sku) : null,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.price || 0),
          line_amount: Number(item.price || 0) * Number(item.quantity || 0),
          taxable_amount: taxableAmount,
          gst_amount: gstAmount,
          gst_number: order.gst_number ? String(order.gst_number) : null,
          is_gst_order: Boolean(order.is_gst_order),
          status: String(order.status || "PLACED"),
          payment_mode: String(order.payment_mode || "UNKNOWN"),
          discount_amount: Number(item.discount || 0),
          revenue_share: 0,
        });
      });
    });

    if (filters.branchIds.length) rows = rows.filter((row) => row.branch_id && filters.branchIds.includes(row.branch_id));
    if (filters.schoolIds.length) rows = rows.filter((row) => row.school_id && filters.schoolIds.includes(row.school_id));
    if (filters.status !== "all") rows = rows.filter((row) => (filters.status === "active" ? row.status !== "CANCELLED" : row.status === filters.status));
    if (filters.gstOnly) rows = rows.filter((row) => row.is_gst_order || row.gst_number);
    if (filters.paymentMode !== "all") rows = rows.filter((row) => row.payment_mode === filters.paymentMode);
    if (search) {
      const needle = search.toLowerCase();
      rows = rows.filter((row) => `${row.customer_name} ${row.phone} ${row.order_id}`.toLowerCase().includes(needle));
    }

    return rows;
  }
};

export const fetchGstReportRows = async (filters: GstReportFilters): Promise<GstReportRow[]> => {
  try {
    const rows = await fetchAllRows<any>((from, to) => {
      let query = db
        .from("gst_report_view")
        .select("*")
        .gte("order_date", filters.dateRange.from)
        .lte("order_date", filters.dateRange.to)
        .order("order_created_at", { ascending: false })
        .range(from, to);

      query = applyIdFilter(query, "branch_id", filters.branchIds);
      query = applyIdFilter(query, "school_id", filters.schoolIds);

      return query;
    });

    return rows.map(normalizeGstRow);
  } catch (error: any) {
    if (!isRelationMissingError(error)) throw error;

    const { data } = await safeQuery<any[]>(
      () =>
        db
          .from("orders")
          .select(
            "id, created_at, customer_name, phone, school_id, branch_id, total_amount, gst_number, status, payment_mode, " +
              "order_items(quantity, price), schools(name), branches(name)"
          )
          .not("gst_number", "is", null)
          .gte("created_at", `${filters.dateRange.from}T00:00:00`)
          .lte("created_at", `${filters.dateRange.to}T23:59:59`)
          .order("created_at", { ascending: false }),
      "reports/fetchGstReportRows/fallback"
    );

    let rows = (data ?? []).map((order: any) => {
      const taxable = Number(order.total_amount || 0) / 1.18;
      const gst = Number(order.total_amount || 0) - taxable;
      return normalizeGstRow({
        order_id: order.id,
        order_id_text: order.id,
        order_date: (order.created_at || "").slice(0, 10),
        order_created_at: order.created_at,
        customer_name: order.customer_name,
        phone: order.phone,
        school_id: order.school_id,
        school_name: Array.isArray(order.schools) ? order.schools[0]?.name : order.schools?.name,
        branch_id: order.branch_id,
        branch_name: Array.isArray(order.branches) ? order.branches[0]?.name : order.branches?.name,
        taxable_amount: taxable,
        gst_amount: gst,
        total_amount: Number(order.total_amount || 0),
        gst_number: order.gst_number,
        status: order.status,
        payment_mode: order.payment_mode || "UNKNOWN",
      });
    });

    if (filters.branchIds.length) rows = rows.filter((row) => row.branch_id && filters.branchIds.includes(row.branch_id));
    if (filters.schoolIds.length) rows = rows.filter((row) => row.school_id && filters.schoolIds.includes(row.school_id));

    return rows;
  }
};

export const fetchInventoryReportRows = async (filters: InventoryReportFilters): Promise<InventoryReportDailyRow[]> => {
  const rows = await fetchAllRows<any>((from, to) => {
    let query = db
      .from("inventory_report_view")
      .select("*")
      .gte("movement_date", filters.dateRange.from)
      .lte("movement_date", filters.dateRange.to)
      .order("movement_date", { ascending: false })
      .range(from, to);

    query = applyIdFilter(query, "branch_id", filters.branchIds);
    query = applyIdFilter(query, "product_id", filters.productIds);

    return query;
  });

  const normalized = rows.map(normalizeInventoryDailyRow);
  if (!filters.negativeOnly) return normalized;
  return normalized.filter((row) => row.negative_stock_detected || row.closing_stock < 0 || row.current_stock < 0);
};

export const fetchInventoryAuditRows = async (branchId: string, variantId: string): Promise<InventoryAuditRow[]> => {
  const rows = await fetchAllRows<any>((from, to) =>
    db
      .from("inventory_movements")
      .select("id, branch_id, variant_id, type, quantity, before_stock, after_stock, reason, reference_type, reference_id, created_at, branches(name), product_variants(size, products(name))")
      .eq("branch_id", branchId)
      .eq("variant_id", variantId)
      .order("created_at", { ascending: false })
      .range(from, to),
  );

  return rows.map(normalizeInventoryAuditRow);
};

export const fetchBranchDailyRows = async (filters: BranchReportFilters): Promise<BranchReportDailyRow[]> => {
  const rows = await fetchAllRows<any>((from, to) => {
    let query = db
      .from("branch_report_view")
      .select("*")
      .gte("report_date", filters.dateRange.from)
      .lte("report_date", filters.dateRange.to)
      .order("report_date", { ascending: true })
      .range(from, to);

    query = applyIdFilter(query, "branch_id", filters.branchIds);
    query = applyStatusFilter(query, filters.status);

    return query;
  });

  return rows.map(normalizeBranchDailyRow);
};

export const fetchBranchTopProductRows = async (filters: BranchReportFilters): Promise<BranchTopProductRow[]> => {
  const rows = await fetchAllRows<any>((from, to) => {
    let query = db
      .from("sales_item_report_view")
      .select("order_date, branch_id, branch_name, product_id, product_name, quantity, status")
      .gte("order_date", filters.dateRange.from)
      .lte("order_date", filters.dateRange.to)
      .not("branch_id", "is", null)
      .range(from, to);

    query = applyIdFilter(query, "branch_id", filters.branchIds);
    query = applyStatusFilter(query, filters.status);

    return query;
  });

  return rows.map(normalizeBranchTopProductRow);
};

export const aggregateInventoryRows = (rows: InventoryReportDailyRow[]): AggregatedInventoryReportRow[] => {
  const grouped = new Map<string, AggregatedInventoryReportRow>();

  rows
    .slice()
    .sort((left, right) => left.movement_date.localeCompare(right.movement_date) || left.last_movement_at.localeCompare(right.last_movement_at))
    .forEach((row) => {
      const key = `${row.branch_id}:${row.variant_id}`;
      const current = grouped.get(key);

      if (!current) {
        grouped.set(key, {
          key,
          branch_id: row.branch_id,
          branch_name: row.branch_name,
          variant_id: row.variant_id,
          product_id: row.product_id,
          product_name: row.product_name,
          variant_size: row.variant_size,
          opening_stock: row.opening_stock,
          stock_in: row.stock_in,
          stock_out: row.stock_out,
          adjustments: row.adjustments,
          closing_stock: row.closing_stock,
          current_stock: row.current_stock,
          negative_stock_detected: row.negative_stock_detected || row.closing_stock < 0 || row.current_stock < 0,
          movement_count: row.movement_count,
          first_movement_at: row.first_movement_at,
          last_movement_at: row.last_movement_at,
        });
        return;
      }

      current.stock_in += row.stock_in;
      current.stock_out += row.stock_out;
      current.adjustments += row.adjustments;
      current.closing_stock = row.closing_stock;
      current.current_stock = row.current_stock;
      current.negative_stock_detected = current.negative_stock_detected || row.negative_stock_detected || row.closing_stock < 0 || row.current_stock < 0;
      current.movement_count += row.movement_count;
      current.last_movement_at = row.last_movement_at;
    });

  return [...grouped.values()].sort((left, right) => {
    if (left.negative_stock_detected !== right.negative_stock_detected) {
      return left.negative_stock_detected ? -1 : 1;
    }

    if (left.branch_name !== right.branch_name) {
      return left.branch_name.localeCompare(right.branch_name);
    }

    return left.product_name.localeCompare(right.product_name);
  });
};

export const aggregateBranchRows = (
  currentRows: BranchReportDailyRow[],
  previousRows: BranchReportDailyRow[],
  topProducts: BranchTopProductRow[],
): AggregatedBranchReportRow[] => {
  const previousMap = new Map<string, { revenue: number }>();

  previousRows.forEach((row) => {
    const current = previousMap.get(row.branch_id) ?? { revenue: 0 };
    current.revenue += row.total_revenue;
    previousMap.set(row.branch_id, current);
  });

  const previousRankMap = (() => {
    const totals = new Map<string, number>();
    previousRows.forEach((row) => {
      const current = totals.get(row.branch_id) ?? 0;
      totals.set(row.branch_id, current + row.total_revenue);
    });
    return new Map(
      [...totals.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([branchId], index) => [branchId, index + 1]),
    );
  })();

  const productTotals = new Map<string, { branchId: string; product: string; units: number }>();
  topProducts.forEach((row) => {
    if (!row.branch_id) return;
    const key = `${row.branch_id}:${row.product_id}`;
    const current = productTotals.get(key) ?? { branchId: row.branch_id, product: row.product_name, units: 0 };
    current.units += row.quantity;
    productTotals.set(key, current);
  });

  const topProductMap = new Map<string, { product: string; units: number }>();
  productTotals.forEach((row) => {
    const current = topProductMap.get(row.branchId);
    if (!current || row.units > current.units) {
      topProductMap.set(row.branchId, { product: row.product, units: row.units });
    }
  });

  const grouped = new Map<string, Omit<AggregatedBranchReportRow, "rank">>();
  currentRows.forEach((row) => {
    const current = grouped.get(row.branch_id) ?? {
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      total_orders: 0,
      total_revenue: 0,
      average_order_value: 0,
      gst_revenue: 0,
      top_selling_product: "-",
      growth_pct: null,
    };

    current.total_orders += row.total_orders;
    current.total_revenue += row.total_revenue;
    current.gst_revenue += row.gst_revenue;
    grouped.set(row.branch_id, current);
  });

  const rows = [...grouped.values()].map((row) => {
    const previousRevenue = previousMap.get(row.branch_id)?.revenue ?? 0;
    const topProduct = topProductMap.get(row.branch_id);
    const growthPct = previousRevenue > 0
      ? ((row.total_revenue - previousRevenue) / previousRevenue) * 100
      : row.total_revenue > 0
        ? null
        : 0;

    return {
      ...row,
      average_order_value: row.total_orders > 0 ? row.total_revenue / row.total_orders : 0,
      top_selling_product: topProduct?.product || "-",
      growth_pct: growthPct,
    };
  });

  const totalRevenue = rows.reduce((sum, row) => sum + row.total_revenue, 0) || 1;

  return rows
    .sort((left, right) => right.total_revenue - left.total_revenue)
    .map((row, index) => {
      const rank = index + 1;
      const previousRank = previousRankMap.get(row.branch_id) ?? null;
      const rank_delta = previousRank ? previousRank - rank : null;
      return {
        ...row,
        rank,
        previous_rank: previousRank,
        rank_delta,
        contribution_pct: (row.total_revenue / totalRevenue) * 100,
      };
    });
};
