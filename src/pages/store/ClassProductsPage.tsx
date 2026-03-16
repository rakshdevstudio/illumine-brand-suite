import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getDisplayImage } from "@/lib/product-images";
import { useStudentProfile } from "@/lib/student-profile";

const INTERACTION_EASE = [0.22, 1, 0.36, 1] as const;

const getProductGalleryImages = (product: any) => {
  const images = [...((product?.product_images as any[]) ?? [])].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const urls = images.map((image) => image.image_url).filter(Boolean);
  if (urls.length === 0) {
    urls.push(getDisplayImage(product));
  }

  return urls;
};

const ClassProductsPage = () => {
  const { slug, classSlug, gender } = useParams<{ slug: string; classSlug: string; gender: string }>();
  const [searchParams] = useSearchParams();
  const setProfile = useStudentProfile((s) => s.setProfile);
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

  // Persist selection so Smart School Detection can redirect on next visit
  useEffect(() => {
    if (!school || !cls || !slug || !classSlug || !gender) return;
    const g = gender as "boys" | "girls" | "unisex";
    const gLabel = g === "boys" ? "Boys" : g === "girls" ? "Girls" : "Unisex";
    setProfile({
      schoolId: school.id,
      schoolName: school.name,
      schoolSlug: school.slug,
      classId: cls.id,
      className: cls.name,
      classSlug: cls.slug,
      gender: g,
      genderLabel: gLabel,
    });
  }, [school, cls, slug, classSlug, gender, setProfile]);

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
    <div className="max-w-7xl mx-auto px-6 py-14 md:py-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-muted-foreground mb-14 flex-wrap">
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

      <h1 className="text-3xl md:text-4xl font-extralight tracking-[0.12em] uppercase mb-3">
        {cls?.name ?? "…"} — {genderLabel}
      </h1>
      <p className="text-sm text-muted-foreground mb-16 md:mb-20">{school?.name ?? ""}</p>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-14 md:gap-y-16">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border/70 bg-background p-5">
              <div className="aspect-[4/5] rounded-xl bg-secondary mb-6" />
              <div className="h-4 rounded bg-secondary w-3/4 mb-3" />
              <div className="h-5 rounded bg-secondary w-1/3" />
            </div>
          ))}
        </div>
      ) : !products || products.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-muted-foreground">No products available for this selection</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-14 md:gap-y-16">
          {products.map((product, index) => {
            const totalStock = product.product_variants?.reduce(
              (s: number, v: any) => s + v.stock, 0
            ) ?? 0;
            const galleryImages = getProductGalleryImages(product as any);
            const primaryImage = galleryImages[0] || "/placeholder.svg";
            const secondaryImage = galleryImages[1] && galleryImages[1] !== primaryImage ? galleryImages[1] : null;
            const sizes = Array.from(
              new Set(
                (product.product_variants ?? [])
                  .map((variant: any) => variant.size)
                  .filter((size: string | null) => Boolean(size))
              )
            ) as string[];
            const isLowStock = totalStock > 0 && totalStock < 10;
            const stockLabel = totalStock <= 0
              ? "Out of stock"
              : isLowStock
                ? "Low stock — only few left"
                : "In stock";

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.52,
                  delay: index * 0.1,
                  ease: INTERACTION_EASE,
                }}
                style={{ willChange: "transform, opacity" }}
              >
                <Link to={`/store/product/${product.id}`} className="block">
                  <motion.article
                    initial="rest"
                    animate="rest"
                    whileHover="hover"
                    className="group relative overflow-hidden rounded-2xl border border-border/75 bg-white p-5"
                    variants={{
                      rest: {
                        scale: 1,
                        boxShadow: "0 8px 22px rgba(0,0,0,0.04)",
                      },
                      hover: {
                        scale: 1.03,
                        boxShadow: "0 24px 50px rgba(0,0,0,0.10)",
                      },
                    }}
                    transition={{ duration: 0.3, ease: INTERACTION_EASE }}
                    style={{ willChange: "transform, opacity" }}
                  >
                    <div className="relative mb-6 overflow-hidden rounded-2xl bg-secondary aspect-[4/5]">
                      {isLowStock && (
                        <div className="absolute top-3 left-3 z-10 rounded-md bg-red-500/90 px-2.5 py-1 text-[10px] tracking-[0.12em] uppercase text-white">
                          Low Stock
                        </div>
                      )}

                      <motion.div
                        className="absolute inset-0"
                        variants={{
                          rest: { scale: 1 },
                          hover: { scale: 1.08 },
                        }}
                        transition={{ duration: 0.4, ease: INTERACTION_EASE }}
                        style={{ willChange: "transform" }}
                      >
                        <motion.img
                          src={primaryImage}
                          alt={product.name}
                          className="absolute inset-0 h-full w-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg";
                          }}
                          variants={secondaryImage ? {
                            rest: { opacity: 1 },
                            hover: { opacity: 0 },
                          } : {
                            rest: { opacity: 1 },
                            hover: { opacity: 1 },
                          }}
                          transition={{ duration: 0.3, ease: INTERACTION_EASE }}
                          style={{ willChange: "opacity" }}
                        />

                        {secondaryImage && (
                          <motion.img
                            src={secondaryImage}
                            alt=""
                            className="absolute inset-0 h-full w-full object-contain"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder.svg";
                            }}
                            variants={{
                              rest: { opacity: 0 },
                              hover: { opacity: 1 },
                            }}
                            transition={{ duration: 0.3, ease: INTERACTION_EASE }}
                            style={{ willChange: "opacity" }}
                          />
                        )}
                      </motion.div>

                      <motion.div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/38 via-black/12 to-transparent"
                        variants={{
                          rest: { opacity: 0.48 },
                          hover: { opacity: 0.8 },
                        }}
                        transition={{ duration: 0.3, ease: INTERACTION_EASE }}
                        style={{ willChange: "opacity" }}
                      />

                      <motion.div
                        className="absolute left-4 right-4 bottom-4"
                        variants={{
                          rest: { opacity: 0, y: 20 },
                          hover: { opacity: 1, y: 0 },
                        }}
                        transition={{ duration: 0.3, ease: INTERACTION_EASE }}
                        style={{ willChange: "transform, opacity" }}
                      >
                        {sizes.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {sizes.slice(0, 6).map((size) => (
                              <span
                                key={size}
                                className="rounded-full border border-white/65 bg-white/20 px-2.5 py-1 text-[10px] tracking-[0.12em] uppercase text-white"
                              >
                                {size}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="w-full rounded-md bg-black px-3 py-2.5 text-center text-[11px] tracking-[0.16em] uppercase text-white">
                          Add to Cart
                        </div>
                      </motion.div>
                    </div>

                    <div className="space-y-1.5 px-1">
                      <h3 className="text-[15px] font-medium tracking-wide leading-snug">
                        {product.name}
                      </h3>
                      <p className="text-lg font-normal tracking-wide">{formatPrice((product as any).base_price ?? product.price)}</p>
                      <p className={`text-xs ${isLowStock ? "text-red-500" : "text-muted-foreground"}`}>
                        {stockLabel}
                      </p>
                    </div>
                  </motion.article>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClassProductsPage;
