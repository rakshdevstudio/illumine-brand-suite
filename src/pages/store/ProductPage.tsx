import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { getDisplayImage } from "@/lib/product-images";

const LOW_STOCK_THRESHOLD = 10;

const ProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const addItem = useCart((s) => s.addItem);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), schools(*), product_images(*), classes(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const selectedVariant = product?.product_variants?.find(
    (v: any) => v.size === selectedSize
  );
  const maxQty = selectedVariant ? Math.max(1, Math.min(10, selectedVariant.stock)) : 1;
  const basePrice = (product as any)?.base_price ?? product?.price ?? 0;

  // Build image gallery
  const galleryImages: string[] = [];
  if (product) {
    const imgs = (product as any).product_images ?? [];
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
      price: basePrice,
      schoolName: (product as any).schools?.name ?? "",
      className: (product as any).classes?.name ?? "",
      gender: (product as any).gender ?? "Unisex",
      imageUrl: galleryImages[0] || null,
      quantity,
    });
    toast("Added to bag", { icon: <Check className="h-4 w-4" /> });
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
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

  if (!product) return null;

  const schoolSlug = (product as any).schools?.slug;
  const handleBack = () => {
    if (schoolSlug) {
      navigate(`/store/school/${schoolSlug}`);
      return;
    }
    navigate(-1);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 pb-28 md:pb-12">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-2 text-xs tracking-[0.2em] text-muted-foreground uppercase mb-12 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
        Back
      </button>

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
          <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-1">
            {(product as any).schools?.name}
          </p>
          {(product as any).classes?.name && (
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-1">
              {(product as any).classes.name}
            </p>
          )}
          <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-3">
            {(product as any).gender || "Unisex"}
          </p>
          <h1 className="text-2xl font-extralight tracking-wide mb-2">
            {product.name}
          </h1>
          <p className="text-lg font-light mb-8">{formatPrice(basePrice)}</p>

          {/* Size selector */}
          <div className="mb-8">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-4">
              Size
            </p>
            <div className="flex gap-3">
              {product.product_variants
                ?.sort((a: any, b: any) => parseInt(a.size) - parseInt(b.size))
                .map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedSize(v.size);
                      setQuantity(1);
                    }}
                    disabled={v.stock === 0}
                    className={`w-12 h-12 border text-sm transition-all duration-200 ${
                      selectedSize === v.size
                        ? "border-foreground bg-primary text-primary-foreground"
                        : v.stock === 0
                        ? "border-border text-muted-foreground/30 cursor-not-allowed"
                        : "border-border hover:border-foreground"
                    }`}
                  >
                    {v.size}
                  </button>
                ))}
            </div>
            {selectedVariant && selectedVariant.stock > 0 && selectedVariant.stock <= LOW_STOCK_THRESHOLD && (
              <p className="text-red-500 text-sm mt-2">
                ⚠ Only {selectedVariant.stock} left in stock
              </p>
            )}
            {selectedVariant?.stock === 0 && (
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

          <Button
            onClick={handleAddToCart}
            disabled={!selectedVariant || selectedVariant.stock === 0}
            className="w-full h-12 text-xs tracking-[0.2em] uppercase hidden md:inline-flex"
          >
            {selectedVariant?.stock === 0 ? "Out of Stock" : "Add to Bag"}
          </Button>

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
              Size Guide
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select your regular school uniform size. If between two sizes, choose the larger size for a comfortable fit.
            </p>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-4">
              Shipping Information
            </p>
            <p className="text-sm text-muted-foreground">
              Free delivery within 5–7 business days. Express delivery available at checkout.
            </p>
          </div>
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background px-4 py-3 z-30">
        <Button
          onClick={handleAddToCart}
          disabled={!selectedVariant || selectedVariant.stock === 0}
          className="w-full h-12 text-xs tracking-[0.2em] uppercase"
        >
          {selectedVariant?.stock === 0 ? "Out of Stock" : "Add to Bag"}
        </Button>
      </div>
    </div>
  );
};

export default ProductPage;
