import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { getDisplayImage } from "@/lib/product-images";

const SchoolPage = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: school } = useQuery({
    queryKey: ["school", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("*")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*)")
        .eq("school_id", school!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <Link
        to="/store"
        className="inline-flex items-center gap-2 text-xs tracking-[0.2em] text-muted-foreground uppercase mb-12 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
        All Schools
      </Link>

      {school && (
        <h1 className="text-2xl md:text-3xl font-extralight tracking-[0.1em] uppercase mb-12">
          {school.name}
        </h1>
      )}

      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-secondary mb-4" />
              <div className="h-4 bg-secondary w-3/4 mb-2" />
              <div className="h-4 bg-secondary w-1/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          {products?.map((product) => {
            const totalStock = product.product_variants?.reduce(
              (s: number, v: any) => s + v.stock, 0
            ) ?? 0;

            return (
              <Link
                key={product.id}
                to={`/store/product/${product.id}`}
                className="group"
              >
                <div className="aspect-square bg-secondary mb-4 overflow-hidden border border-border">
                  <img
                    src={getDisplayImage(product)}
                    alt={product.name}
                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
                  />
                </div>
                <h3 className="text-sm font-light tracking-wide mb-1 group-hover:opacity-60 transition-opacity">
                  {product.name}
                </h3>
                <p className="text-sm text-muted-foreground">{formatPrice(product.price)}</p>
                {totalStock <= 10 && totalStock > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Low stock</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SchoolPage;
