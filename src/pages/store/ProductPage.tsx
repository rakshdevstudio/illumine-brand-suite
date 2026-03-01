import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

const ProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const addItem = useCart((s) => s.addItem);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), schools(*)")
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

  const handleAddToCart = () => {
    if (!selectedVariant || !product) return;
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      name: product.name,
      size: selectedVariant.size,
      price: product.price,
      schoolName: (product as any).schools?.name ?? "",
      imageUrl: product.image_url,
    });
    toast("Added to bag", { icon: <Check className="h-4 w-4" /> });
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-16">
          <div className="aspect-[3/4] bg-secondary animate-pulse" />
          <div className="space-y-4">
            <div className="h-6 bg-secondary w-3/4" />
            <div className="h-5 bg-secondary w-1/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <Link
        to={`/store/school/${(product as any).schools?.slug ?? ""}`}
        className="inline-flex items-center gap-2 text-xs tracking-[0.2em] text-muted-foreground uppercase mb-12 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
        Back
      </Link>

      <div className="grid md:grid-cols-2 gap-16">
        {/* Image */}
        <div>
          <div className="aspect-[3/4] bg-secondary border border-border flex items-center justify-center">
            <span className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
              {product.category}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col">
          <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-2">
            {(product as any).schools?.name}
          </p>
          <h1 className="text-2xl font-extralight tracking-wide mb-2">
            {product.name}
          </h1>
          <p className="text-lg font-light mb-8">{formatPrice(product.price)}</p>

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
                    onClick={() => setSelectedSize(v.size)}
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
            {selectedVariant && selectedVariant.stock <= 10 && (
              <p className="text-xs text-muted-foreground mt-2">
                Only {selectedVariant.stock} left
              </p>
            )}
          </div>

          <Button
            onClick={handleAddToCart}
            disabled={!selectedVariant || selectedVariant.stock === 0}
            className="w-full h-12 text-xs tracking-[0.2em] uppercase"
          >
            Add to Bag
          </Button>

          {/* Description */}
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-4">
              Details
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-4">
              Shipping
            </p>
            <p className="text-sm text-muted-foreground">
              Free delivery within 5–7 business days. Express delivery available at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
