import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProductAssignmentRow = {
  product_id: string | null;
};

type BranchInventoryRow = {
  variant_id: string | null;
  branch_id: string | null;
  stock: number | null;
};

type VariantRow = {
  id: string;
  product_id: string | null;
  size: string | null;
  sku: string | null;
  stock: number | null;
  price_override: number | string | null;
  branch_inventory?: BranchInventoryRow[] | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  image_url: string | null;
  price: number | string | null;
  product_variants?: VariantRow[] | null;
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

type ErrorBody = {
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
    } satisfies ErrorBody,
    status,
  );

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const buildSupabaseAdmin = () => {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      },
    },
  );
};

const isValidUuid = (value: string) => UUID_REGEX.test(value);

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const fetchAssignedProductIds = async (
  supabase: ReturnType<typeof createClient>,
  schoolId: string,
  requestId: string,
) => {
  try {
    const { data, error } = await supabase
      .from("product_assignments")
      .select("product_id")
      .eq("school_id", schoolId);

    if (error) {
      console.error("[FETCH_PRODUCTS_ERROR]", {
        request_id: requestId,
        source: "product_assignments",
        school_id: schoolId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }

    return [...new Set(
      ((data ?? []) as ProductAssignmentRow[])
        .map((row) => row.product_id)
        .filter((productId): productId is string => typeof productId === "string" && productId.length > 0),
    )];
  } catch (error) {
    console.error("[FETCH_PRODUCTS_ERROR]", {
      request_id: requestId,
      source: "product_assignments",
      school_id: schoolId,
      error,
    });
    return null;
  }
};

const resolveFallbackBranchId = async (
  supabase: ReturnType<typeof createClient>,
  requestId: string,
) => {
  try {
    const { data: mainBranch, error: mainBranchError } = await supabase
      .from("branches")
      .select("id")
      .ilike("name", "Main Branch")
      .ilike("location", "Head Office")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (mainBranchError) {
      console.error("[RESOLVE_BRANCH_ERROR]", {
        request_id: requestId,
        source: "branches_main",
        code: mainBranchError.code,
        message: mainBranchError.message,
        details: mainBranchError.details,
        hint: mainBranchError.hint,
      });
    } else if (typeof mainBranch?.id === "string" && mainBranch.id.length > 0) {
      return mainBranch.id;
    }

    const { data: activeBranch, error: activeBranchError } = await supabase
      .from("branches")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (activeBranchError) {
      console.error("[RESOLVE_BRANCH_ERROR]", {
        request_id: requestId,
        source: "branches_active",
        code: activeBranchError.code,
        message: activeBranchError.message,
        details: activeBranchError.details,
        hint: activeBranchError.hint,
      });
    } else if (typeof activeBranch?.id === "string" && activeBranch.id.length > 0) {
      return activeBranch.id;
    }

    const { data: anyBranch, error: anyBranchError } = await supabase
      .from("branches")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (anyBranchError) {
      console.error("[RESOLVE_BRANCH_ERROR]", {
        request_id: requestId,
        source: "branches_any",
        code: anyBranchError.code,
        message: anyBranchError.message,
        details: anyBranchError.details,
        hint: anyBranchError.hint,
      });
      return null;
    }

    return typeof anyBranch?.id === "string" && anyBranch.id.length > 0
      ? anyBranch.id
      : null;
  } catch (error) {
    console.error("[RESOLVE_BRANCH_ERROR]", {
      request_id: requestId,
      source: "branches_fallback",
      error,
    });
    return null;
  }
};

const resolveBranchIdForSchool = async (
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  schoolId?: string,
) => {
  if (!schoolId) {
    return await resolveFallbackBranchId(supabase, requestId);
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("branch_id")
      .eq("school_id", schoolId)
      .not("branch_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[RESOLVE_BRANCH_ERROR]", {
        request_id: requestId,
        source: "orders",
        school_id: schoolId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    } else if (typeof data?.branch_id === "string" && data.branch_id.length > 0) {
      return data.branch_id;
    }
  } catch (error) {
    console.error("[RESOLVE_BRANCH_ERROR]", {
      request_id: requestId,
      source: "orders",
      school_id: schoolId,
      error,
    });
  }

  return await resolveFallbackBranchId(supabase, requestId);
};

const fetchProducts = async (
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  schoolId?: string,
  branchId?: string | null,
) => {
  try {
    let productIdsFilter: string[] | null = null;

    if (schoolId) {
      productIdsFilter = await fetchAssignedProductIds(supabase, schoolId, requestId);

      if (productIdsFilter === null) {
        return [];
      }

      if (productIdsFilter.length === 0) {
        return [];
      }
    }

    let query = supabase
      .from("products")
      .select(`
        id,
        name,
        category,
        image_url,
        price,
        product_variants!left(
          id,
          product_id,
          size,
          sku,
          stock,
          price_override,
          branch_inventory!branch_inventory_variant_id_fkey(
            variant_id,
            branch_id,
            stock
          )
        )
      `)
      .order("name", { ascending: true })
      .order("size", { foreignTable: "product_variants", ascending: true });

    if (productIdsFilter) {
      query = query.in("id", productIdsFilter);
    }
    void branchId;

    const { data, error } = await query;

    if (error) {
      console.error("[FETCH_PRODUCTS_ERROR]", {
        request_id: requestId,
        source: "products",
        school_id: schoolId ?? null,
        branch_id: branchId ?? null,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return [];
    }

    return (data ?? []) as ProductRow[];
  } catch (error) {
    console.error("[FETCH_PRODUCTS_ERROR]", {
      request_id: requestId,
      source: "products",
      school_id: schoolId ?? null,
      branch_id: branchId ?? null,
      error,
    });
    return [];
  }
};

const getVariantStock = (
  variant: VariantRow,
  branchId?: string | null,
) => {
  const inventoryRows = Array.isArray(variant.branch_inventory)
    ? variant.branch_inventory
    : [];

  const inventoryRow = branchId
    ? inventoryRows.find((row) => normalizeString(row?.branch_id) === branchId) ?? null
    : inventoryRows[0] ?? null;

  if (inventoryRow) {
    return Math.max(0, normalizeNumber(inventoryRow.stock, 0));
  }

  return Math.max(0, normalizeNumber(variant.stock, 0));
};

const mapResponse = (
  products: ProductRow[],
  branchId?: string | null,
): PosProduct[] => {
  const response: PosProduct[] = [];
  const seenProductIds = new Set<string>();

  for (const product of products) {
    if (typeof product.id !== "string" || product.id.length === 0 || seenProductIds.has(product.id)) {
      continue;
    }

    const productVariants: PosVariant[] = [];
    const seenVariantIds = new Set<string>();

    for (const variant of product.product_variants ?? []) {
      if (typeof variant.id !== "string" || variant.id.length === 0) {
        continue;
      }

      if (typeof variant.product_id !== "string" || variant.product_id.length === 0) {
        continue;
      }

      if (seenVariantIds.has(variant.id)) {
        continue;
      }

      productVariants.push({
        id: variant.id,
        name: normalizeString(variant.size) || "Default",
        barcode: normalizeString(variant.sku),
        price: Math.max(0, normalizeNumber(variant.price_override, 0)),
        stock: getVariantStock(variant, branchId),
      });

      seenVariantIds.add(variant.id);
    }

    for (const variant of productVariants) {
      if (variant.price <= 0) {
        variant.price = Math.max(0, normalizeNumber(product.price, 0));
      }
    }

    productVariants.sort((left, right) => left.name.localeCompare(right.name));

    response.push({
      id: product.id,
      name: normalizeString(product.name),
      category: normalizeString(product.category),
      image_url: normalizeString(product.image_url),
      variants: productVariants,
    });

    seenProductIds.add(product.id);
  }

  response.sort((left, right) => left.name.localeCompare(right.name));
  return response;
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return createErrorResponse(405, "method_not_allowed", "Method not allowed", requestId);
  }

  const schoolId = new URL(req.url).searchParams.get("school_id")?.trim() ?? "";

  console.info("[GET_PRODUCTS_REQUEST]", {
    request_id: requestId,
    school_id: schoolId || null,
  });

  if (schoolId && !isValidUuid(schoolId)) {
    return createErrorResponse(400, "invalid_school_id", "school_id must be a valid UUID", requestId);
  }

  try {
    const supabase = buildSupabaseAdmin();
    const branchId = await resolveBranchIdForSchool(
      supabase,
      requestId,
      schoolId || undefined,
    );
    const products = await fetchProducts(
      supabase,
      requestId,
      schoolId || undefined,
      branchId,
    );
    const payload = mapResponse(products, branchId);

    console.info("[GET_PRODUCTS_RESULT]", {
      request_id: requestId,
      school_id: schoolId || null,
      branch_id: branchId ?? null,
      product_count: payload.length,
      variant_count: payload.reduce((sum, product) => sum + product.variants.length, 0),
    });

    return createJsonResponse(payload, 200);
  } catch (error) {
    console.error("[GET_PRODUCTS_ERROR]", {
      request_id: requestId,
      school_id: schoolId || null,
      error,
    });
    return createJsonResponse([], 200);
  }
});
