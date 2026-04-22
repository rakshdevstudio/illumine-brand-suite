import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { safeQuery } from "@/lib/safeQuery";
import type {
  AggregatedInventoryReportRow,
  DimensionOption,
  InventoryAuditRow,
  InventoryReportDailyRow,
  InventoryReportFilters,
  ReportStatusFilter,
  SchoolAffiliationRecord,
  SchoolAffiliationSummary,
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
  status: String(row.status || "PLACED"),
  payment_mode: String(row.payment_mode || "UNKNOWN"),
  search_text: String(row.search_text || ""),
});

const normalizeSchoolAffiliationRecord = (row: any): SchoolAffiliationRecord => ({
  id: String(row.id),
  school_id: String(row.school_id),
  commission_percentage: toNumber(row.commission_percentage),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
});

const normalizeSchoolAffiliationSummary = (row: any, schoolId: string): SchoolAffiliationSummary => ({
  school_id: row?.school_id ? String(row.school_id) : schoolId,
  revenue_incl: toNumber(row?.revenue_incl),
  revenue_excl: toNumber(row?.revenue_excl),
  gst: toNumber(row?.gst),
  order_count: toNumber(row?.order_count),
});

const normalizeInventoryDailyRow = (row: any): InventoryReportDailyRow => ({
  movement_date: String(row.movement_date),
  branch_id: String(row.branch_id),
  branch_name: String(row.branch_name || "Unknown Branch"),
  variant_id: String(row.variant_id),
  product_id: String(row.product_id),
  product_name: String(row.product_name || "Product"),
  school_id: (() => {
    if (!row.school_id) {
      throw new Error(`Corrupt product data detected: missing school_id for product ${String(row.product_id || "unknown")}`);
    }
    return String(row.school_id);
  })(),
  school_name: (() => {
    const value = String(row.school_name || "").trim();
    if (!value) {
      throw new Error(`Corrupt product data detected: missing school_name for product ${String(row.product_id || "unknown")}`);
    }
    return value;
  })(),
  class_id: (() => {
    if (!row.class_id) {
      throw new Error(`Corrupt product data detected: missing class_id for product ${String(row.product_id || "unknown")}`);
    }
    return String(row.class_id);
  })(),
  class_name: (() => {
    const value = String(row.class_name || "").trim();
    if (!value) {
      throw new Error(`Corrupt product data detected: missing class_name for product ${String(row.product_id || "unknown")}`);
    }
    return value;
  })(),
  gender: (() => {
    const value = String(row.gender || "").trim();
    if (!value) {
      throw new Error(`Corrupt product data detected: missing gender for product ${String(row.product_id || "unknown")}`);
    }
    return value;
  })(),
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

export const fetchSchoolOptions = async (): Promise<DimensionOption[]> => {
  const { data } = await safeQuery<any[]>(() => db.from("schools").select("id, name, code").order("name"), "reports/fetchSchoolOptions");
  return (data ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name), secondary: row.code || null }));
};

export const fetchClassOptions = async (): Promise<DimensionOption[]> => {
  const { data } = await safeQuery<any[]>(
    () => db.from("classes").select("id, name, school_id, schools(name)").order("name"),
    "reports/fetchClassOptions"
  );
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    secondary: row.schools?.name ? String(row.schools.name) : null,
  }));
};

export const fetchInventoryGenderOptions = async (): Promise<DimensionOption[]> => {
  const { data } = await safeQuery<any[]>(() => db.from("products").select("gender"), "reports/fetchInventoryGenderOptions");
  const values = Array.from(
    new Set(
      (data ?? [])
        .map((row: any) => String(row.gender || "").trim())
        .filter((value) => value.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return values.map((value) => ({ id: value, name: value, secondary: null }));
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

      query = applyIdFilter(query, "school_id", filters.schoolIds);
      query = applyStatusFilter(query, filters.status);

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

    logger.warn("Sales report view unavailable; returning empty dataset to avoid order-based revenue fallback.", {
      context: "reports/fetchSalesReportRows",
      from: filters.dateRange.from,
      to: filters.dateRange.to,
    });
    return [];
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

      query = applyIdFilter(query, "school_id", filters.schoolIds);
      query = applyStatusFilter(query, filters.status);

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

    logger.warn("Sales item report view unavailable; returning empty dataset to avoid order-based revenue fallback.", {
      context: "reports/fetchSalesItemReportRows",
      from: filters.dateRange.from,
      to: filters.dateRange.to,
    });
    return [];
  }
};

export const fetchSchoolAffiliationRecord = async (schoolId: string): Promise<SchoolAffiliationRecord | null> => {
  if (!schoolId) return null;

  const { data } = await safeQuery<any>(
    () =>
      db
        .from("school_affiliations")
        .select("id, school_id, commission_percentage, created_at, updated_at")
        .eq("school_id", schoolId)
        .maybeSingle(),
    "reports/fetchSchoolAffiliationRecord",
  );

  return data ? normalizeSchoolAffiliationRecord(data) : null;
};

export const upsertSchoolAffiliationRecord = async (schoolId: string, commissionPercentage: number): Promise<SchoolAffiliationRecord> => {
  const payload = {
    school_id: schoolId,
    commission_percentage: Number(commissionPercentage.toFixed(2)),
  };

  const { data } = await safeQuery<any>(
    () =>
      db
        .from("school_affiliations")
        .upsert(payload, { onConflict: "school_id" })
        .select("id, school_id, commission_percentage, created_at, updated_at")
        .single(),
    "reports/upsertSchoolAffiliationRecord",
  );

  return normalizeSchoolAffiliationRecord(data);
};

export const fetchSchoolAffiliationSummary = async ({
  schoolId,
  dateRange,
}: {
  schoolId: string;
  dateRange: SalesReportFilters["dateRange"];
}): Promise<SchoolAffiliationSummary> => {
  const { data } = await safeQuery<any[]>(
    () =>
      db.rpc("get_school_affiliation_summary", {
        p_date_from: dateRange.from,
        p_date_to: dateRange.to,
        p_school_id: schoolId,
      }),
    "reports/fetchSchoolAffiliationSummary",
  );

  return normalizeSchoolAffiliationSummary((data ?? [])[0], schoolId);
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

    query = applyIdFilter(query, "product_id", filters.productIds);
    query = applyIdFilter(query, "school_id", filters.schoolIds);
    query = applyIdFilter(query, "class_id", filters.classIds);
    query = applyIdFilter(query, "gender", filters.genders);

    if (filters.negativeOnly) {
      query = query.or("negative_stock_detected.eq.true,closing_stock.lt.0,current_stock.lt.0");
    }

    return query;
  });

  return rows.map(normalizeInventoryDailyRow);
};

export const fetchInventoryAuditRows = async (variantId: string): Promise<InventoryAuditRow[]> => {
  const rows = await fetchAllRows<any>((from, to) =>
    db
      .from("inventory_movements")
      .select("id, branch_id, variant_id, type, quantity, before_stock, after_stock, reason, reference_type, reference_id, created_at, branches(name), product_variants(size, products(name))")
      .eq("variant_id", variantId)
      .order("created_at", { ascending: false })
      .range(from, to),
  );

  return rows.map(normalizeInventoryAuditRow);
};

export const aggregateInventoryRows = (rows: InventoryReportDailyRow[]): AggregatedInventoryReportRow[] => {
  const grouped = new Map<string, AggregatedInventoryReportRow>();

  rows
    .slice()
    .sort((left, right) => left.movement_date.localeCompare(right.movement_date) || left.last_movement_at.localeCompare(right.last_movement_at))
    .forEach((row) => {
      const key = `${row.variant_id}:${row.branch_id}`;
      const current = grouped.get(key);

      if (!current) {
        grouped.set(key, {
          key,
          branch_id: row.branch_id,
          branch_name: row.branch_name,
          variant_id: row.variant_id,
          product_id: row.product_id,
          product_name: row.product_name,
          school_id: row.school_id,
          school_name: row.school_name,
          class_id: row.class_id,
          class_name: row.class_name,
          gender: row.gender,
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

    return left.product_name.localeCompare(right.product_name);
  });
};
