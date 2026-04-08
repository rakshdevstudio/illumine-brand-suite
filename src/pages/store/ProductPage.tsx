import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { getDisplayImage } from "@/lib/product-images";
import { emitStoreAddToCart, toAnimationRect } from "@/lib/store-interactions";
import { requireSchoolId } from "@/lib/school-context";
import {
  getProductContextSummary,
  normalizeStorefrontProduct,
  resolveStoreBrowseContext,
  sortSizes,
} from "@/lib/storefront";
import { getShippingSummary } from "@/lib/store-shipping";

const isMissingColumnError = (error: any, columnName: string) => {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "PGRST204" || message.includes(columnName.toLowerCase());
};

const LOW_STOCK_THRESHOLD = 10;
const INTERACTION_EASE = [0.22, 1, 0.36, 1] as const;

const ProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const addItem = useCart((s) => s.addItem);
  const desktopAddButtonRef = useRef<HTMLDivElement | null>(null);
  const mobileAddButtonRef = useRef<HTMLDivElement | null>(null);
  const desktopAddControls = useAnimationControls();
  const mobileAddControls = useAnimationControls();
  const browseContext = resolveStoreBrowseContext(searchParams);

  const { data: product, isLoading, isError, error } = useQuery({
    queryKey: ["product", id],
    enabled: Boolean(id),
    retry: 1,
    queryFn: async () => {
      const schoolId = requireSchoolId();
      const client = supabase as any;

      const baseProductQuery = () =>
        client
          .from("products")
          .select("*, schools(name, slug), classes(name, slug), product_images(*)")
          .eq("id", id)
          .eq("status", "active")
          .maybeSingle();

      const deletedSafeProduct = await baseProductQuery().is("deleted_at", null);

      const productResponse = deletedSafeProduct.error && isMissingColumnError(deletedSafeProduct.error, "deleted_at")
        ? await baseProductQuery().eq("is_active", true)
        : deletedSafeProduct;

      if (productResponse.error) {
        throw productResponse.error;
      }

      const productRow = productResponse.data;
      if (!productRow) {
        throw new Error("Product not available for this school");
      }

      let visibleForSchool = productRow.school_id === schoolId || Boolean(productRow.is_universal);
      if (!visibleForSchool) {
        const { data: assignmentRows, error: assignmentError } = await client
          .from("product_assignments")
          .select("id")
          .eq("product_id", id)
          .eq("school_id", schoolId)
          .limit(1);

        if (assignmentError) {
          throw assignmentError;
        }

        visibleForSchool = (assignmentRows ?? []).length > 0;
      }

      if (!visibleForSchool) {
        throw new Error("Product not available for this school");
      }

      const { data: variantRows, error: variantError } = await client
        .from("product_variants")
        .select("id, product_id, size, sku, low_stock_threshold, status, price_override, stock")
        .eq("product_id", id)
        .eq("status", "active");

      if (variantError) throw variantError;

      const variants = variantRows ?? [];
      const variantIds = variants.map((variant: any) => variant.id);

      let stockRows: Array<{ variant_id: string; stock: number }> = [];
      if (variantIds.length > 0) {
        const { data: branchRows, error: stockError } = await client
          .from("branch_inventory")
          .select("variant_id, stock")
          .in("variant_id", variantIds);

        if (stockError) throw stockError;
        stockRows = branchRows ?? [];
      }

      const stockByVariant = new Map<string, number>();
      stockRows.forEach((row) => {
        stockByVariant.set(row.variant_id, (stockByVariant.get(row.variant_id) ?? 0) + Number(row.stock ?? 0));
      });

      const normalized = normalizeStorefrontProduct({
        ...productRow,
        product_variants: variants.map((variant: any) => ({
          ...variant,
          available_stock: stockByVariant.has(variant.id)
            ? stockByVariant.get(variant.id)
            : Math.max(0, Number(variant.stock ?? 0)),
          effective_price: Number(variant.price_override ?? productRow.price ?? 0),
        })),
      });

      if (!normalized?.id) {
        throw new Error("Product not available for this school");
      }

      return normalized;
    },
  });

  const activeVariants = useMemo(
    () =>
      (product?.productVariants ?? []).filter((variant) => String(variant.status ?? "").toLowerCase() === "active"),
    [product]
  );

  useEffect(() => {
    if (!activeVariants.length) {
      setSelectedSize(null);
      return;
    }

    const hasCurrent = activeVariants.some((variant: any) => variant.size === selectedSize);
    if (!hasCurrent) {
      setSelectedSize(activeVariants[0].size ?? null);
      setQuantity(1);
    }
  }, [activeVariants, selectedSize]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const selectedVariant = activeVariants.find(
    (v) => v.size === selectedSize
  );
  const selectedVariantStock = selectedVariant ? Number(selectedVariant.availableStock ?? 0) : 0;
  const maxQty = selectedVariant ? Math.max(1, Math.min(10, selectedVariantStock)) : 1;
  const fallbackMinPrice = useMemo(() => {
    const prices = activeVariants
      .map((v) => Number(v.effectivePrice ?? product?.price ?? 0))
      .filter((n) => Number.isFinite(n) && n >= 0);
    return prices.length ? Math.min(...prices) : Number(product?.price ?? 0);
  }, [activeVariants, product]);
  const effectivePrice = Number(selectedVariant?.effectivePrice ?? product?.price ?? fallbackMinPrice ?? 0);
  const shippingSummary = product ? getShippingSummary(product, effectivePrice * quantity) : null;

  // Build image gallery
  const galleryImages: string[] = [];
  if (product) {
    const imgs = product.productImages ?? [];
    if (imgs.length > 0) {
      const sorted = [...imgs].sort((a: any, b: any) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return a.sort_order - b.sort_order;
      });
      sorted.forEach((img: any) => galleryImages.push(img.image_url));
    } else {
      galleryImages.push(getDisplayImage(product as any));
    }
  }

  const handleAddToCart = () => {
    if (!selectedVariant || !product || quantity < 1) return;
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      name: product.name,
      size: selectedVariant.size,
      price: effectivePrice,
      schoolName: product.schoolName ?? "",
      className: product.className ?? "",
      gender: product.gender,
      imageUrl: galleryImages[0] || null,
      quantity,
    });
    toast("Added to bag", { icon: <Check className="h-4 w-4" /> });
  };

  const triggerAddToCartInteraction = (
    targetRef: React.RefObject<HTMLDivElement>,
    controls: ReturnType<typeof useAnimationControls>
  ) => {
    if (!selectedVariant || !product || quantity < 1) return;

    handleAddToCart();

    void controls.start({
      scale: [1, 0.95, 1],
      transition: {
        duration: 0.28,
        ease: INTERACTION_EASE,
        times: [0, 0.45, 1],
      },
    });

    emitStoreAddToCart({
      sourceRect: toAnimationRect(targetRef.current),
      imageUrl: galleryImages[activeImageIndex] || galleryImages[0] || null,
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div
          onClick={() => navigate(-1)}
          className="mb-6 cursor-pointer text-sm tracking-wide text-gray-500 hover:text-black transition"
        >
          ← Back
        </div>

        <div className="grid md:grid-cols-2 gap-16">
          <div className="aspect-square bg-secondary animate-pulse" />
          <div className="space-y-4">
            <div className="h-6 bg-secondary w-3/4" />
            <div className="h-5 bg-secondary w-1/4" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="store-shell pb-28 md:pb-12">
        <div
          onClick={() => navigate(-1)}
          className="mb-6 cursor-pointer text-sm tracking-wide text-gray-500 hover:text-black transition"
        >
          ← Back
        </div>

        <div className="text-center py-16">
          <p className="text-sm text-destructive">{(error as Error)?.message || "Failed to load product"}</p>
        </div>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="store-shell pb-28 md:pb-12">
      <div
        onClick={() => navigate(-1)}
        className="mb-6 cursor-pointer text-sm tracking-wide text-gray-500 hover:text-black transition"
      >
        ← Back
      </div>

      <div className="grid md:grid-cols-2 gap-16">
        {/* Image Gallery */}
        <div className="space-y-3">
          <div className="aspect-square bg-secondary border border-border overflow-hidden">
            <img
              src={galleryImages[activeImageIndex] || "/placeholder.svg"}
              alt={product.name}
              className="w-full h-full object-contain"
              onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
            />
          </div>
          {galleryImages.length > 1 && (
            <div className="flex gap-2">
              {galleryImages.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImageIndex(i)}
                  className={`w-16 h-16 border overflow-hidden bg-secondary transition-all ${
                    i === activeImageIndex ? "border-foreground" : "border-border hover:border-foreground/50"
                  }`}
                >
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase mb-3">
            {getProductContextSummary(product)}
          </p>
          <h1 className="text-2xl font-extralight tracking-wide mb-2">
            {product.name}
          </h1>
          <div className="mb-8">
            <p className="text-2xl font-light tracking-wide text-foreground">
              {selectedVariant ? formatPrice(effectivePrice) : `Starting from ${formatPrice(fallbackMinPrice)}`}
            </p>
            <p className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground/80 mt-1">
              Inclusive of GST
            </p>
          </div>

          {/* Size selector */}
          <div className="mb-8">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-4">
              Size
            </p>
            <div className="flex gap-3">
              {activeVariants
                ?.sort((a, b) => sortSizes(a.size, b.size))
                .map((v) => {
                  const variantStock = Number(v.availableStock ?? 0);
                  return (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedSize(v.size);
                      setQuantity(1);
                    }}
                    disabled={variantStock <= 0}
                    className={`w-12 h-12 border text-sm transition-all duration-200 ${
                      selectedSize === v.size
                        ? "border-foreground bg-primary text-primary-foreground"
                        : variantStock <= 0
                        ? "border-border text-muted-foreground/30 cursor-not-allowed"
                        : "border-border hover:border-foreground"
                    }`}
                  >
                    {v.size}
                  </button>
                  );
                })}
            </div>
            {selectedVariant && selectedVariantStock > 0 && selectedVariantStock <= LOW_STOCK_THRESHOLD && (
              <p className="text-red-500 text-sm mt-2">
                ⚠ Only {selectedVariantStock} left in stock
              </p>
            )}
            {selectedVariant && selectedVariantStock <= 0 && (
              <p className="text-xs text-red-500 mt-2">Out of stock</p>
            )}
          </div>

          <div className="mb-8">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-4">
              Quantity
            </p>
            <div className="inline-flex items-center border border-border">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={!selectedVariant || quantity <= 1}
                className="w-12 h-12 flex items-center justify-center text-sm hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                -
              </button>
              <span className="w-12 text-center text-sm">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={!selectedVariant || quantity >= maxQty}
                className="w-12 h-12 flex items-center justify-center text-sm hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>

          <motion.div
            ref={desktopAddButtonRef}
            animate={desktopAddControls}
            className="hidden md:block"
            style={{ willChange: "transform" }}
          >
            <Button
              onClick={() => triggerAddToCartInteraction(desktopAddButtonRef, desktopAddControls)}
              disabled={!selectedVariant || selectedVariantStock <= 0}
              className="w-full h-12 text-xs tracking-[0.2em] uppercase md:inline-flex"
            >
              {selectedVariantStock <= 0 ? "Out of Stock" : "Add to Bag"}
            </Button>
          </motion.div>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-4">
              Fabric
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {product.description || "Premium breathable uniform fabric with soft hand feel for all-day comfort and easy care."}
            </p>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-4">
              Shipping Information
            </p>
            {shippingSummary && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{shippingSummary.label}</p>
                <p className="text-sm text-muted-foreground">{shippingSummary.detail}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background px-4 py-3 z-30">
        <motion.div
          ref={mobileAddButtonRef}
          animate={mobileAddControls}
          style={{ willChange: "transform" }}
        >
          <Button
            onClick={() => triggerAddToCartInteraction(mobileAddButtonRef, mobileAddControls)}
            disabled={!selectedVariant || selectedVariantStock <= 0}
            className="w-full h-12 text-xs tracking-[0.2em] uppercase"
          >
            {selectedVariantStock <= 0 ? "Out of Stock" : "Add to Bag"}
          </Button>
        </motion.div>
      </div>

    </div>
  );
};

export default ProductPage;
