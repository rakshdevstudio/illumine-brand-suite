import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getDisplayImage } from "@/lib/product-images";

const ClassProductsPage = () => {
  const { slug, classSlug, gender } = useParams<{ slug: string; classSlug: string; gender: string }>();
  const [searchParams] = useSearchParams();
  const debugMode = searchParams.get("debug") === "true";

  const genderLabel = gender === "boys" ? "Boys" : gender === "girls" ? "Girls" : "Unisex";
  const genderDb = gender === "boys" ? "Male" : gender === "girls" ? "Female" : "Unisex";

  const { data: school } = useQuery({
    queryKey: ["school", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").eq("slug", slug!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: cls } = useQuery({
    queryKey: ["class", school?.id, classSlug],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", school!.id)
        .eq("slug", classSlug!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["class-products", school?.id, cls?.id, genderDb],
    enabled: !!school?.id && !!cls?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_assignments")
        .select(`
          id,
          display_order,
          is_required,
          gender,
          products!inner(*, product_variants(*), product_images(*))
        `)
        .eq("school_id", school!.id)
        .eq("class_id", cls!.id)
        .in("gender", [genderDb, "Unisex"])
        .eq("products.status", "active")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((assignment: any) => ({
        ...(assignment.products ?? {}),
        assignment_id: assignment.id,
        assignment_gender: assignment.gender,
        is_required: assignment.is_required,
        display_order: assignment.display_order,
      }));
    },
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-muted-foreground mb-12 flex-wrap">
        <Link to="/store" className="hover:text-foreground transition-colors">All Schools</Link>
        <span>/</span>
        <Link to={`/store/school/${slug}`} className="hover:text-foreground transition-colors">{school?.name ?? "…"}</Link>
        <span>/</span>
        <Link to={`/store/school/${slug}/class/${classSlug}`} className="hover:text-foreground transition-colors">{cls?.name ?? "…"}</Link>
        <span>/</span>
        <span className="text-foreground">{genderLabel}</span>
      </nav>

      {debugMode && (
        <div className="mb-8 border border-border p-4 bg-secondary/30 text-xs space-y-1">
          <p className="text-[10px] tracking-[0.15em] uppercase font-medium text-muted-foreground mb-2">Debug Panel</p>
          <p><span className="text-muted-foreground">School:</span> {school?.name ?? "…"}</p>
          <p><span className="text-muted-foreground">Class:</span> {cls?.name ?? "…"}</p>
          <p><span className="text-muted-foreground">Gender:</span> {genderLabel}</p>
          <p><span className="text-muted-foreground">Products Found:</span> {products?.length ?? 0}</p>
        </div>
      )}

      <h1 className="text-2xl md:text-3xl font-extralight tracking-[0.1em] uppercase mb-2">
        {cls?.name ?? "…"} — {genderLabel}
      </h1>
      <p className="text-sm text-muted-foreground mb-12">{school?.name ?? ""}</p>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-secondary mb-4" />
              <div className="h-4 bg-secondary w-3/4 mb-2" />
              <div className="h-4 bg-secondary w-1/4" />
            </div>
          ))}
        </div>
      ) : !products || products.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-muted-foreground">No products available for this selection</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
          {products.map((product) => {
            const totalStock = product.product_variants?.reduce(
              (s: number, v: any) => s + v.stock, 0
            ) ?? 0;

            return (
              <Link key={product.id} to={`/store/product/${product.id}`} className="group block">
                <div className="aspect-square bg-secondary mb-5 overflow-hidden border border-border transition-all duration-300 group-hover:border-foreground group-hover:-translate-y-0.5">
                  <img
                    src={getDisplayImage(product as any)}
                    alt={product.name}
                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
                  />
                </div>
                <h3 className="text-sm font-light tracking-wide mb-1 group-hover:opacity-70 transition-opacity">
                  {product.name}
                </h3>
                <p className="text-base font-light">{formatPrice((product as any).base_price ?? product.price)}</p>
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

export default ClassProductsPage;
