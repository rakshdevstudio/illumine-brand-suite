import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, X } from "lucide-react";
import { getDisplayImage } from "@/lib/product-images";

const SchoolPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [selectedGender, setSelectedGender] = useState<string>("All");
  const [selectedClass, setSelectedClass] = useState<string>("All");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

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

  const { data: classes } = useQuery({
    queryKey: ["school-classes", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", school!.id)
        .eq("status", "active")
        .order("sort_order");
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
        .select("*, product_variants(*), product_images(*), classes(name)")
        .eq("school_id", school!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Derive available categories from products
  const categories = useMemo(() => {
    if (!products) return [];
    const cats = [...new Set(products.map((p) => p.category))].sort();
    return cats;
  }, [products]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const filteredProducts = products?.filter((p) => {
    const genderMatch = selectedGender === "All" || (p as any).gender === selectedGender;
    const classMatch = selectedClass === "All" || (p as any).class_id === selectedClass;
    const categoryMatch = selectedCategory === "All" || p.category === selectedCategory;
    return genderMatch && classMatch && categoryMatch;
  });

  const activeFilterCount = [selectedClass, selectedGender, selectedCategory].filter((f) => f !== "All").length;

  const clearAllFilters = () => {
    setSelectedClass("All");
    setSelectedGender("All");
    setSelectedCategory("All");
  };

  const PillButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`text-xs tracking-[0.15em] uppercase px-4 py-2 border rounded-full transition-all ${
        active
          ? "border-foreground bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );

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
        <h1 className="text-2xl md:text-3xl font-extralight tracking-[0.1em] uppercase mb-8">
          {school.name}
        </h1>
      )}

      {/* Combined Filters */}
      <div className="space-y-5 mb-12">
        {/* Class Filter */}
        {classes && classes.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase w-16 shrink-0">Class</span>
            <PillButton active={selectedClass === "All"} onClick={() => setSelectedClass("All")}>All</PillButton>
            {classes.map((cls: any) => (
              <PillButton key={cls.id} active={selectedClass === cls.id} onClick={() => setSelectedClass(cls.id)}>
                {cls.name}
              </PillButton>
            ))}
          </div>
        )}

        {/* Gender Filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase w-16 shrink-0">Gender</span>
          {["All", "Male", "Female", "Unisex"].map((g) => (
            <PillButton key={g} active={selectedGender === g} onClick={() => setSelectedGender(g)}>
              {g}
            </PillButton>
          ))}
        </div>

        {/* Category Filter */}
        {categories.length > 1 && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase w-16 shrink-0">Type</span>
            <PillButton active={selectedCategory === "All"} onClick={() => setSelectedCategory("All")}>All</PillButton>
            {categories.map((c) => (
              <PillButton key={c} active={selectedCategory === c} onClick={() => setSelectedCategory(c)}>
                {c}
              </PillButton>
            ))}
          </div>
        )}

        {/* Active filter summary & clear */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              {filteredProducts?.length ?? 0} result{(filteredProducts?.length ?? 0) !== 1 ? "s" : ""}
            </span>
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors ml-2"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
              Clear filters
            </button>
          </div>
        )}
      </div>

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
      ) : filteredProducts?.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground mb-4">No products match your filters</p>
          <button
            onClick={clearAllFilters}
            className="text-xs tracking-[0.2em] uppercase border border-border px-6 py-3 hover:border-foreground transition-colors"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          {filteredProducts?.map((product) => {
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
                    src={getDisplayImage(product as any)}
                    alt={product.name}
                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
                  />
                </div>
                <h3 className="text-sm font-light tracking-wide mb-1 group-hover:opacity-60 transition-opacity">
                  {product.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-0.5">{(product as any).classes?.name}</p>
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
