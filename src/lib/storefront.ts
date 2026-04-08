import type { URLSearchParamsInit } from "react-router-dom";

export const ALL_FILTER_VALUE = "all";

export type StoreGenderSlug = "boys" | "girls" | "unisex";
export type CatalogGender = "Male" | "Female" | "Unisex";

export type StoreBrowseContext = {
  schoolSlug?: string | null;
  classSlug?: string | null;
  gender?: StoreGenderSlug | null;
};

export type StorefrontVariant = {
  id: string;
  productId: string;
  size: string;
  sku: string | null;
  effectivePrice: number;
  availableStock: number;
  lowStockThreshold: number | null;
  status: string;
};

export type StorefrontProduct = {
  id: string;
  schoolId: string | null;
  schoolName: string | null;
  schoolSlug: string | null;
  classId: string | null;
  className: string | null;
  classSlug: string | null;
  name: string;
  category: string | null;
  gender: CatalogGender;
  price: number;
  basePrice: number;
  description: string | null;
  status: string;
  archived: boolean;
  shippingMode: string | null;
  shippingFee: number | null;
  freeShippingThreshold: number | null;
  etaMinBusinessDays: number | null;
  etaMaxBusinessDays: number | null;
  shippingNote: string | null;
  productImages: Array<Record<string, unknown>>;
  productVariants: StorefrontVariant[];
};

export const toCatalogGender = (value: string | null | undefined): CatalogGender => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["male", "boys", "boy", "m"].includes(normalized)) return "Male";
  if (["female", "girls", "girl", "f"].includes(normalized)) return "Female";
  return "Unisex";
};

export const toStoreGenderSlug = (value: string | null | undefined): StoreGenderSlug => {
  const gender = toCatalogGender(value);
  if (gender === "Male") return "boys";
  if (gender === "Female") return "girls";
  return "unisex";
};

export const toCatalogGenderFromSlug = (value: string | null | undefined): CatalogGender => {
  if (value === "boys") return "Male";
  if (value === "girls") return "Female";
  return "Unisex";
};

export const getStoreGenderLabel = (value: string | null | undefined) => {
  const gender = typeof value === "string" && ["boys", "girls", "unisex"].includes(value)
    ? toCatalogGenderFromSlug(value)
    : toCatalogGender(value);

  if (gender === "Male") return "Boys";
  if (gender === "Female") return "Girls";
  return "Unisex";
};

export const sortSizes = (left: string | null | undefined, right: string | null | undefined) => {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();
  const aNum = Number(a);
  const bNum = Number(b);

  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum;
  }

  if (a.toLowerCase() === "default") return -1;
  if (b.toLowerCase() === "default") return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

export const getStoreBrowseSearchParams = (context: StoreBrowseContext): URLSearchParamsInit => {
  const entries = Object.entries(context).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0);
  return Object.fromEntries(entries);
};

export const resolveStoreBrowseContext = (searchParams: URLSearchParams): StoreBrowseContext => ({
  schoolSlug: searchParams.get("schoolSlug"),
  classSlug: searchParams.get("classSlug"),
  gender: (() => {
    const value = searchParams.get("gender");
    return value === "boys" || value === "girls" || value === "unisex" ? value : null;
  })(),
});

export const buildStoreBrowseHref = (context: StoreBrowseContext) => {
  const params = new URLSearchParams();
  const entries = Object.entries(context).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0);
  entries.forEach(([key, value]) => params.set(key, value));
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const getBrowseBackPath = (context: StoreBrowseContext) => {
  if (context.schoolSlug && context.classSlug && context.gender) {
    return `/store/school/${context.schoolSlug}/class/${context.classSlug}/gender/${context.gender}`;
  }

  if (context.schoolSlug && context.classSlug) {
    return `/store/school/${context.schoolSlug}/class/${context.classSlug}`;
  }

  if (context.schoolSlug) {
    return `/store/school/${context.schoolSlug}`;
  }

  return "/store";
};

const normalizeVariant = (variant: any, fallbackPrice: number): StorefrontVariant => ({
  id: String(variant?.id ?? ""),
  productId: String(variant?.product_id ?? variant?.productId ?? ""),
  size: String(variant?.size ?? "default"),
  sku: typeof variant?.sku === "string" ? variant.sku : null,
  effectivePrice: Number(variant?.effective_price ?? variant?.effectivePrice ?? variant?.price_override ?? fallbackPrice ?? 0),
  availableStock: Math.max(0, Number(variant?.available_stock ?? variant?.availableStock ?? 0)),
  lowStockThreshold: typeof variant?.low_stock_threshold === "number" ? variant.low_stock_threshold : null,
  status: String(variant?.status ?? "active"),
});

export const normalizeStorefrontProduct = (product: any): StorefrontProduct => {
  const basePrice = Number(product?.base_price ?? product?.price ?? 0);
  const price = Number(product?.price ?? basePrice);

  return {
    id: String(product?.id ?? ""),
    schoolId: typeof product?.school_id === "string" ? product.school_id : null,
    schoolName: typeof product?.school_name === "string" ? product.school_name : product?.schools?.name ?? null,
    schoolSlug: typeof product?.school_slug === "string" ? product.school_slug : product?.schools?.slug ?? null,
    classId: typeof product?.class_id === "string" ? product.class_id : null,
    className: typeof product?.class_name === "string" ? product.class_name : product?.classes?.name ?? null,
    classSlug: typeof product?.class_slug === "string" ? product.class_slug : product?.classes?.slug ?? null,
    name: String(product?.name ?? "Product"),
    category: typeof product?.category === "string" ? product.category : null,
    gender: toCatalogGender(product?.gender),
    price,
    basePrice,
    description: typeof product?.description === "string" ? product.description : null,
    status: String(product?.status ?? "active"),
    archived: Boolean(product?.archived),
    shippingMode: typeof product?.shipping_mode === "string" ? product.shipping_mode : null,
    shippingFee: product?.shipping_fee === null || product?.shipping_fee === undefined ? null : Number(product.shipping_fee),
    freeShippingThreshold:
      product?.free_shipping_threshold === null || product?.free_shipping_threshold === undefined
        ? null
        : Number(product.free_shipping_threshold),
    etaMinBusinessDays:
      product?.eta_min_business_days === null || product?.eta_min_business_days === undefined
        ? null
        : Number(product.eta_min_business_days),
    etaMaxBusinessDays:
      product?.eta_max_business_days === null || product?.eta_max_business_days === undefined
        ? null
        : Number(product.eta_max_business_days),
    shippingNote: typeof product?.shipping_note === "string" ? product.shipping_note : null,
    productImages: Array.isArray(product?.product_images) ? product.product_images : [],
    productVariants: (Array.isArray(product?.product_variants) ? product.product_variants : [])
      .map((variant: any) => normalizeVariant(variant, price))
      .filter((variant) => variant.id.length > 0)
      .sort((left, right) => sortSizes(left.size, right.size)),
  };
};

export const getProductContextSummary = (product: Pick<StorefrontProduct, "schoolName" | "className" | "gender">) =>
  [product.schoolName, product.className, product.gender === "Male" ? "Boys" : product.gender === "Female" ? "Girls" : "Unisex"]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" • ");
