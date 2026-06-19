import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { isLowStock } from "@/lib/inventory";
import { extractOrderStudentMeta } from "@/lib/portal-dashboard";
import { logger } from "@/lib/logger";
import { fetchGlobalStockByVariants } from "@/lib/global-inventory";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderNoteRow = Database["public"]["Tables"]["order_notes"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductAssignmentRow = Database["public"]["Tables"]["product_assignments"]["Row"];
type ProductVariantRow = Database["public"]["Tables"]["product_variants"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

type SchoolOrderBaseRow = Pick<
  OrderRow,
  | "id"
  | "customer_name"
  | "phone"
  | "total_amount"
  | "status"
  | "created_at"
  | "school_id"
  | "student_name"
  | "alternate_phone"
  | "address"
  | "city"
  | "pincode"
> & {
  grade: string | null;
  student_class: string | null;
};

export type SchoolTimeFilter = "all" | "today" | "week";

export interface SchoolPortalOrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  quantity: number;
  price: number;
  product: Pick<ProductRow, "id" | "name" | "school_id" | "class_id" | "status"> | null;
  variant: Pick<ProductVariantRow, "id" | "product_id" | "size" | "stock" | "low_stock_threshold" | "status"> | null;
  className: string | null;
}

export interface SchoolPortalOrder extends SchoolOrderBaseRow {
  order_notes: Pick<OrderNoteRow, "id" | "note" | "created_at">[];
  order_items: SchoolPortalOrderItem[];
  resolvedStudentName: string | null;
  resolvedClass: string;
  resolvedAlternatePhone: string | null;
}

export interface SchoolLowStockItem {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  remainingStock: number;
  threshold: number;
}

export interface SchoolPortalData {
  orders: SchoolPortalOrder[];
  productCount: number;
  lowStockItems: SchoolLowStockItem[];
  classes: Pick<ClassRow, "id" | "name">[];
}

const readNullableString = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

const normalizeOrderStatus = (value: unknown) => {
  const status = String(value ?? "").toUpperCase();
  switch (status) {
    case "PLACED":
    case "PACKED":
    case "DISPATCHED":
    case "DELIVERED":
    case "CANCELLED":
      return status;
    case "PENDING":
      return "PLACED";
    case "CONFIRMED":
      return "PACKED";
    case "SHIPPED":
      return "DISPATCHED";
    default:
      return "PLACED";
  }
};

const parseOrderRows = (rows: Array<Partial<OrderRow> & { [key: string]: unknown }> | null): SchoolOrderBaseRow[] =>
  (rows ?? []).map((row: any) => ({
    id: typeof row.id === "string" ? row.id : "",
    customer_name: typeof row.customer_name === "string" ? row.customer_name : "Unknown customer",
    phone: typeof row.phone === "string" ? row.phone : "",
    total_amount: Number(row.total_amount ?? 0),
    status: normalizeOrderStatus(row.status),
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    school_id: readNullableString(row.school_id),
    student_name: readNullableString(row.student_name),
    alternate_phone: readNullableString(row.alternate_phone),
    address: typeof row.address === "string" ? row.address : "",
    city: readNullableString(row.city),
    pincode: readNullableString(row.pincode),
    grade: readNullableString(row.grade),
    student_class: readNullableString(row.student_class) ?? readNullableString(row.grade),
  }));

const buildOrdersQuery = (schoolId: string, mode: "direct" | "legacy") => {
  let query = (supabase as any)
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  query = mode === "direct" ? query.eq("school_id", schoolId) : query.is("school_id", null);
  return query;
};

const fetchScopedOrderRows = async (schoolId: string, mode: "direct" | "legacy") => {
  const { data, error } = await buildOrdersQuery(schoolId, mode);

  if (error) throw error;
  return parseOrderRows(data ?? null);
};

const dedupeById = <T extends { id: string }>(items: T[]) => {
  const map = new Map<string, T>();
  items.forEach((item) => map.set(item.id, item));
  return [...map.values()];
};

const orderMatchesSchool = (
  order: SchoolOrderBaseRow,
  schoolId: string,
  schoolMatchProductIds: Set<string>,
  items: SchoolPortalOrderItem[],
) => {
  if (order.school_id === schoolId) {
    return true;
  }

  return items.some((item) => schoolMatchProductIds.has(item.productId) || item.product?.school_id === schoolId);
};

export const isWithinSchoolTimeFilter = (dateValue: string, filter: SchoolTimeFilter) => {
  if (filter === "all") return true;

  const target = new Date(dateValue);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (filter === "today") {
    return target >= startOfToday && target <= now;
  }

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 6);
  return target >= startOfWeek && target <= now;
};

export const fetchSchoolPortalData = async (schoolId: string): Promise<SchoolPortalData> => {
  const [
    directOrders,
    legacyOrders,
    { data: directProducts, error: directProductsError },
    { data: productAssignments, error: productAssignmentsError },
    { data: classes, error: classesError },
  ] = await Promise.all([
    fetchScopedOrderRows(schoolId, "direct"),
    fetchScopedOrderRows(schoolId, "legacy"),
    supabase
      .from("products")
      .select("id, name, school_id, class_id, status")
      .eq("school_id", schoolId),
    supabase
      .from("product_assignments")
      .select("product_id, class_id, school_id")
      .eq("school_id", schoolId),
    supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("name"),
  ]);

  if (directProductsError) throw directProductsError;
  if (productAssignmentsError) throw productAssignmentsError;
  if (classesError) throw classesError;

  const classNameById = new Map<string, string>(
    (classes ?? [])
      .map((entry) => [entry.id, entry.name] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"),
  );

  const classNameByProductId = new Map<string, string>();
  (productAssignments ?? []).forEach((assignment) => {
    const className = classNameById.get(assignment.class_id);
    if (className && !classNameByProductId.has(assignment.product_id)) {
      classNameByProductId.set(assignment.product_id, className);
    }
  });

  const directProductMap = new Map<string, Pick<ProductRow, "id" | "name" | "school_id" | "class_id" | "status">>(
    (directProducts ?? []).map((product) => [product.id, product]),
  );

  const assignedProductIds = [
    ...new Set(
      (productAssignments ?? [])
        .map((assignment: ProductAssignmentRow) => assignment.product_id)
        .filter((productId): productId is string => typeof productId === "string"),
    ),
  ];

  const missingAssignedProductIds = assignedProductIds.filter((productId) => !directProductMap.has(productId));
  const { data: assignedProducts, error: assignedProductsError } = missingAssignedProductIds.length
    ? await supabase
        .from("products")
        .select("id, name, school_id, class_id, status")
        .in("id", missingAssignedProductIds)
    : { data: [] as Pick<ProductRow, "id" | "name" | "school_id" | "class_id" | "status">[], error: null };

  if (assignedProductsError) throw assignedProductsError;

  const orderCandidates = dedupeById([...directOrders, ...legacyOrders]).sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
  );
  const orderIds = orderCandidates.map((order) => order.id);

  let orderNotes: Pick<OrderNoteRow, "id" | "order_id" | "note" | "created_at">[] = [];
  if (orderIds.length) {
    const { data, error } = await supabase
      .from("order_notes")
      .select("id, order_id, note, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });

    if (error) {
      logger.warn("School portal could not load order notes", error.message);
    } else {
      orderNotes = data ?? [];
    }
  }

  let rawOrderItems: Pick<OrderItemRow, "id" | "order_id" | "product_id" | "variant_id" | "quantity" | "price">[] = [];
  if (orderIds.length) {
    const { data, error } = await supabase
      .from("order_items")
      .select("id, order_id, product_id, variant_id, quantity, price")
      .in("order_id", orderIds);

    if (error) {
      logger.warn("School portal could not load order items", error.message);
    } else {
      rawOrderItems = data ?? [];
    }
  }

  const orderedProductIds = [
    ...new Set(
      rawOrderItems
        .map((item) => item.product_id)
        .filter((productId): productId is string => typeof productId === "string"),
    ),
  ];
  const orderedVariantIds = [
    ...new Set(
      rawOrderItems
        .map((item) => item.variant_id)
        .filter((variantId): variantId is string => typeof variantId === "string"),
    ),
  ];

  let orderedProducts: Pick<ProductRow, "id" | "name" | "school_id" | "class_id" | "status">[] = [];
  if (orderedProductIds.length) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, school_id, class_id, status")
      .in("id", orderedProductIds);

    if (error) {
      logger.warn("School portal could not load ordered products", error.message);
    } else {
      orderedProducts = data ?? [];
    }
  }

  let orderedVariants: Pick<ProductVariantRow, "id" | "product_id" | "size" | "stock" | "low_stock_threshold" | "status">[] = [];
  if (orderedVariantIds.length) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, product_id, size, low_stock_threshold, status")
      .in("id", orderedVariantIds);

    if (error) {
      logger.warn("School portal could not load ordered variants", error.message);
    } else {
      orderedVariants = (data ?? []).map(v => ({ ...v, stock: 0 }));
    }
  }

  const scopedProducts = dedupeById([
    ...(directProducts ?? []),
    ...(assignedProducts ?? []),
    ...orderedProducts.filter((product) => product.school_id === schoolId),
  ]);
  const activeScopedProductIds = new Set(
    scopedProducts
      .filter((product) => product.status === "active")
      .map((product) => product.id),
  );
  const schoolMatchProductIds = new Set<string>([
    ...(directProducts ?? []).map((product) => product.id),
    ...assignedProductIds,
  ]);

  let inventoryVariants: Pick<ProductVariantRow, "id" | "product_id" | "size" | "stock" | "low_stock_threshold" | "status">[] = [];
  if (activeScopedProductIds.size) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, product_id, size, low_stock_threshold, status")
      .in("product_id", [...activeScopedProductIds]);

    if (error) {
      logger.warn("School portal could not load low stock variants", error.message);
    } else {
      inventoryVariants = (data ?? []).map(v => ({ ...v, stock: 0 }));
    }
  }

  const allVariantIds = Array.from(
    new Set(
      [...orderedVariants, ...inventoryVariants]
        .map((variant) => variant.id)
        .filter((variantId): variantId is string => typeof variantId === "string" && variantId.length > 0),
    ),
  );

  const { stockByVariant } = await fetchGlobalStockByVariants(allVariantIds);

  const productById = new Map<string, Pick<ProductRow, "id" | "name" | "school_id" | "class_id" | "status">>(
    dedupeById([
      ...(directProducts ?? []),
      ...(assignedProducts ?? []),
      ...orderedProducts,
    ]).map((product) => [product.id, product]),
  );

  const variantById = new Map<string, Pick<ProductVariantRow, "id" | "product_id" | "size" | "stock" | "low_stock_threshold" | "status">>(
    dedupeById([
      ...orderedVariants,
      ...inventoryVariants,
    ]).map((variant) => [
      variant.id,
      {
        ...variant,
        stock: Number(stockByVariant.get(variant.id) ?? 0),
      },
    ]),
  );

  const notesByOrderId = orderNotes.reduce((map, note) => {
    const current = map.get(note.order_id) ?? [];
    current.push(note);
    map.set(note.order_id, current);
    return map;
  }, new Map<string, Pick<OrderNoteRow, "id" | "note" | "created_at">[]>());

  const itemsByOrderId = rawOrderItems.reduce((map, item) => {
    const current = map.get(item.order_id) ?? [];
    const product = productById.get(item.product_id) ?? null;
    const className =
      classNameByProductId.get(item.product_id) ??
      (product?.class_id ? classNameById.get(product.class_id) ?? null : null) ??
      null;

    current.push({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      variantId: item.variant_id,
      quantity: Number(item.quantity ?? 0),
      price: Number(item.price ?? 0),
      product,
      variant: variantById.get(item.variant_id) ?? null,
      className,
    });
    map.set(item.order_id, current);
    return map;
  }, new Map<string, SchoolPortalOrderItem[]>());

  const orders = orderCandidates
    .map((order) => {
      const notes = notesByOrderId.get(order.id) ?? [];
      const items = itemsByOrderId.get(order.id) ?? [];
      const parsedMeta = extractOrderStudentMeta(notes);
      const inferredClass =
        items
          .map((item) => item.className)
          .find((value): value is string => typeof value === "string" && value.length > 0) ??
        null;

      return {
        ...order,
        order_notes: notes,
        order_items: items,
        resolvedStudentName: order.student_name ?? parsedMeta.studentName ?? null,
        resolvedClass: order.student_class ?? order.grade ?? parsedMeta.grade ?? inferredClass ?? "Unassigned",
        resolvedAlternatePhone: order.alternate_phone ?? parsedMeta.alternatePhone ?? null,
      };
    })
    .filter((order) => orderMatchesSchool(order, schoolId, schoolMatchProductIds, order.order_items));

  const lowStockItems = [...variantById.values()]
    .filter((variant) => variant.status === "active")
    .filter((variant) => isLowStock(Number(variant.stock ?? 0), variant.low_stock_threshold))
    .map((variant) => {
      const product = productById.get(variant.product_id);
      return {
        variantId: variant.id,
        productId: variant.product_id,
        productName: product?.name ?? "Product",
        variantLabel: variant.size,
        remainingStock: Number(variant.stock ?? 0),
        threshold: Number(variant.low_stock_threshold ?? 5),
      };
    })
    .sort((a, b) => a.remainingStock - b.remainingStock);

  return {
    orders,
    productCount: activeScopedProductIds.size,
    lowStockItems,
    classes: classes ?? [],
  };
};
