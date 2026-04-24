import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRODUCTS_SELECT = `
  id,
  name,
  category,
  image_url,
  price,
  product_variants!left (
    id,
    size,
    sku,
    stock,
    status,
    price_override
  )
`;

type ProductVariantRow = {
  id: string;
  size: string | null;
  sku: string | null;
  stock: number | null;
  status: string | null;
  price_override: number | string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  image_url: string | null;
  price: number | string | null;
  product_variants: ProductVariantRow[] | null;
};

type ProductAssignmentRow = {
  product_id: string;
};

type BranchInventoryRow = {
  variant_id: string;
  stock: number | null;
};

type PosVariant = {
  id: string;
  name: string;
  barcode: string;
  price: number;
  stock: number;
};

type PosProduct = {
  id: string;
  name: string;
  category: string;
  image_url: string;
  variants: PosVariant[];
};

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
};

const createJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const createErrorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  createJsonResponse(
    {
      error: {
        code,
        message,
        request_id: requestId,
      },
    } satisfies ErrorResponse,
    status,
  );

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const buildSupabaseAdmin = () =>
  createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

const isValidUuid = (value: string) => UUID_REGEX.test(value);

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeVariantName = (value: unknown) => {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : "Default";
};

const fetchAssignedProductIds = async (
  supabase: ReturnType<typeof createClient>,
  schoolId: string,
  requestId: string,
) => {
  const { data, error } = await supabase
    .from("product_assignments")
    .select("product_id")
    .eq("school_id", schoolId);

  if (error) {
    console.error("[GET_PRODUCTS_ASSIGNMENTS_ERROR]", {
      request_id: requestId,
      school_id: schoolId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return [...new Set(
    ((data ?? []) as ProductAssignmentRow[])
      .map((row) => row.product_id)
      .filter((productId) => typeof productId === "string" && productId.length > 0),
  )];
};

const fetchProducts = async (
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  schoolId?: string,
) => {
  let query = supabase
    .from("products")
    .select(PRODUCTS_SELECT)
    .order("name", { ascending: true })
    .order("size", { ascending: true, foreignTable: "product_variants" });

  if (schoolId) {
    const assignedProductIds = await fetchAssignedProductIds(supabase, schoolId, requestId);
    if (assignedProductIds.length === 0) {
      return [] as ProductRow[];
    }
    query = query.in("id", assignedProductIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[GET_PRODUCTS_QUERY_ERROR]", {
      request_id: requestId,
      school_id: schoolId ?? null,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return (data ?? []) as ProductRow[];
};

const fetchBranchId = async (
  supabase: ReturnType<typeof createClient>,
  schoolId: string,
  requestId: string
): Promise<string | null> => {
  const { data, error } = await supabase
    .from("schools")
    .select("branch_id")
    .eq("id", schoolId)
    .single();

  if (error) {
    console.error("[FETCH_BRANCH_ERROR]", {
      request_id: requestId,
      school_id: schoolId,
      error,
    });
    return null;
  }

  return (data as { branch_id?: string } | null)?.branch_id ?? null;
};

const fetchStockByVariant = async (
  supabase: ReturnType<typeof createClient>,
  variantIds: string[],
  requestId: string,
  schoolId?: string,
) => {
  const stockByVariant = new Map<string, number>();

  if (variantIds.length === 0) {
    return stockByVariant;
  }

  let branchId: string | null = null;

  if (schoolId) {
    branchId = await fetchBranchId(supabase, schoolId, requestId);
  }

  let inventoryQuery = supabase
    .from("branch_inventory")
    .select("variant_id, stock")
    .in("variant_id", variantIds);

  if (branchId) {
    inventoryQuery = inventoryQuery.eq("branch_id", branchId);
  }

  // NOTE: branch_inventory does NOT have school_id column.
  // Stock is already scoped by branch_id, so we should NOT filter by school_id here.

  const { data, error } = await inventoryQuery;

  if (error) {
    console.error("[GET_PRODUCTS_INVENTORY_ERROR]", {
      request_id: requestId,
      school_id: schoolId ?? null,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  for (const row of (data ?? []) as BranchInventoryRow[]) {
    stockByVariant.set(
      row.variant_id,
      (stockByVariant.get(row.variant_id) ?? 0) + Math.max(0, normalizeNumber(row.stock, 0)),
    );
  }

  return stockByVariant;
};

const mapProductsToPosResponse = (
  products: ProductRow[],
  stockByVariant: Map<string, number>,
): PosProduct[] => {
  const productsById = new Map<string, PosProduct>();

  for (const product of products) {
    if (!product?.id) {
      continue;
    }

    const existingProduct = productsById.get(product.id) ?? {
      id: product.id,
      name: normalizeString(product.name),
      category: normalizeString(product.category),
      image_url: normalizeString(product.image_url),
      variants: [],
    };

    const seenVariantIds = new Set(existingProduct.variants.map((variant) => variant.id));
    const variants = Array.isArray(product.product_variants) ? product.product_variants : [];

    for (const variant of variants) {
      if (!variant?.id || seenVariantIds.has(variant.id)) {
        continue;
      }

      const fallbackPrice = normalizeNumber(product.price, 0);
      const resolvedPrice = normalizeNumber(variant.price_override, fallbackPrice);
      const inventoryStock = stockByVariant.get(variant.id);
      const fallbackStock = Math.max(0, normalizeNumber(variant.stock, 0));

      existingProduct.variants.push({
        id: variant.id,
        name: normalizeVariantName(variant.size),
        barcode: normalizeString(variant.sku),
        price: Math.max(0, resolvedPrice),
        stock: inventoryStock === undefined ? fallbackStock : Math.max(0, inventoryStock),
      });

      seenVariantIds.add(variant.id);
    }

    existingProduct.variants.sort((left, right) => left.name.localeCompare(right.name));
    productsById.set(product.id, existingProduct);
  }

  return [...productsById.values()].sort((left, right) => left.name.localeCompare(right.name));
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return createErrorResponse(
      405,
      "method_not_allowed",
      "Method not allowed",
      requestId,
    );
  }

  const schoolId = new URL(req.url).searchParams.get("school_id")?.trim() ?? "";
  console.info("[GET_PRODUCTS_REQUEST]", {
    request_id: requestId,
    school_id: schoolId || null,
  });

  if (schoolId && !isValidUuid(schoolId)) {
    return createErrorResponse(
      400,
      "invalid_school_id",
      "school_id must be a valid UUID",
      requestId,
    );
  }

  try {
    const supabase = buildSupabaseAdmin();
    const products = await fetchProducts(supabase, requestId, schoolId || undefined);
    const variantIds = [...new Set(
      products.flatMap((product) =>
        (Array.isArray(product.product_variants) ? product.product_variants : [])
          .map((variant) => variant.id)
          .filter((variantId): variantId is string => typeof variantId === "string" && variantId.length > 0),
      ),
    )];

    const stockByVariant = await fetchStockByVariant(
      supabase,
      variantIds,
      requestId,
      schoolId || undefined,
    );

    const payload = mapProductsToPosResponse(products, stockByVariant);
    const variantCount = payload.reduce((sum, product) => sum + product.variants.length, 0);

    console.info("[GET_PRODUCTS_RESULT]", {
      request_id: requestId,
      school_id: schoolId || null,
      product_count: payload.length,
      variant_count: variantCount,
    });

    return createJsonResponse(payload, 200);
  } catch (error) {
    console.error("[GET_PRODUCTS_ERROR]", {
      request_id: requestId,
      school_id: schoolId || null,
      error,
    });

    return createErrorResponse(
      500,
      "internal_error",
      "Failed to fetch products",
      requestId,
    );
  }
});
