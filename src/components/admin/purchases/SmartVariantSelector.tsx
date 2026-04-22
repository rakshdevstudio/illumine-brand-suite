import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PRODUCT_PAGE_SIZE = 60;
const VARIANT_PAGE_SIZE = 120;
const RECENT_VARIANTS_KEY = "erp:purchase:recent-variants:v1";

type SelectorSchoolRef = { id: string; name: string };
type SelectorClassRef = { id: string; name: string; school_id: string };
type SelectorProductRef = {
  id: string;
  name: string;
  category: string | null;
  school_id: string | null;
  class_id: string | null;
  price: number | null;
  gst_percentage: number | null;
  schools?: { name: string } | null;
  classes?: { name: string } | null;
};

type SelectorVariantRef = {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  status?: string | null;
  price_override?: number | null;
  products?: {
    id: string;
    name: string;
    category: string | null;
    school_id: string | null;
    class_id: string | null;
    price: number | null;
    gst_percentage: number | null;
    schools?: { name: string } | null;
    classes?: { name: string } | null;
  } | null;
};

export type SelectorVariantDTO = {
  variantId: string;
  productId: string;
  productName: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  category: string;
  size: string;
  sku: string;
  price: number;
  gst: number;
};

type SelectorIdentity = {
  primary: string;
  secondary: string;
  tertiary: string;
};

type SmartVariantSelectorControllerProps = {
  selectorInstanceId: string;
  selectedVariantId: string;
  selectedSchoolId: string;
  selectedProductId: string;
  triggerLabel?: string;
  onSelect: (selection: { dto: SelectorVariantDTO; identity: SelectorIdentity }) => void;
};

const WindowedList = <T,>({
  items,
  itemHeight,
  viewportHeight,
  overscan,
  renderItem,
}: {
  items: T[];
  itemHeight: number;
  viewportHeight: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const safeOverscan = overscan ?? 4;
  const totalHeight = items.length * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - safeOverscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / itemHeight) + safeOverscan);
  const topSpacer = start * itemHeight;
  const bottomSpacer = Math.max(0, totalHeight - end * itemHeight);

  return (
    <div className="overflow-y-auto" style={{ maxHeight: viewportHeight }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: topSpacer }} />
      <div className="space-y-1">
        {items.slice(start, end).map((item, localIndex) => renderItem(item, start + localIndex))}
      </div>
      <div style={{ height: bottomSpacer }} />
    </div>
  );
};

type SelectorState = {
  open: boolean;
  activePanel: "search" | "browse";
  searchTerm: string;
  focusedIndex: number;
  lastInteractionType: "keyboard" | "mouse";
  selectionPreviewVariantId: string;
  selectedSchoolId: string;
  selectedClassId: string;
  selectedCategory: string;
  selectedProductId: string;
  compactMode: boolean;
  showFallback: boolean;
  productPage: number;
  variantPage: number;
};

const formatVariantIdentity = (dto: SelectorVariantDTO): SelectorIdentity => ({
  primary: dto.productName || "Product",
  secondary: [dto.schoolName, dto.className, dto.category].filter(Boolean).join(" • "),
  tertiary: `SIZE ${dto.size || "-"} • SKU ${dto.sku || "-"}`,
});

const toDTO = (variant: SelectorVariantRef): SelectorVariantDTO => {
  const product = variant.products;
  const schoolId = String(product?.school_id ?? "");
  const classId = String(product?.class_id ?? "");
  const price = Number(variant.price_override ?? product?.price ?? 0);
  const gst = Number(product?.gst_percentage ?? 18);

  return {
    variantId: variant.id,
    productId: String(variant.product_id ?? ""),
    productName: String(product?.name ?? "Product"),
    schoolId,
    schoolName: String(product?.schools?.name ?? "Unknown School"),
    classId,
    className: String(product?.classes?.name ?? "Unknown Class"),
    category: String(product?.category ?? "General"),
    size: String(variant.size ?? "-"),
    sku: String(variant.sku ?? "-"),
    price,
    gst,
  };
};

const useDebouncedValue = (value: string, delay: number) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [delay, value]);

  return debounced;
};

const useSelectorState = (initialSchoolId: string, initialProductId: string) => {
  const [state, setState] = useState<SelectorState>({
    open: false,
    activePanel: "browse",
    searchTerm: "",
    focusedIndex: 0,
    lastInteractionType: "mouse",
    selectionPreviewVariantId: "",
    selectedSchoolId: initialSchoolId,
    selectedClassId: "all",
    selectedCategory: "all",
    selectedProductId: initialProductId,
    compactMode: false,
    showFallback: false,
    productPage: 1,
    variantPage: 1,
  });

  const update = (patch: Partial<SelectorState>) => setState((current) => ({ ...current, ...patch }));

  return { state, update };
};

const useSelectorData = ({
  open,
  activePanel,
  debouncedSearch,
  selectedSchoolId,
  selectedClassId,
  selectedCategory,
  selectedProductId,
  productPage,
  variantPage,
}: {
  open: boolean;
  activePanel: "search" | "browse";
  debouncedSearch: string;
  selectedSchoolId: string;
  selectedClassId: string;
  selectedCategory: string;
  selectedProductId: string;
  productPage: number;
  variantPage: number;
}) => {
  const hasSearch = debouncedSearch.trim().length >= 2;

  const schoolsQuery = useQuery({
    queryKey: ["selector-schools"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("schools").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as SelectorSchoolRef[];
    },
  });

  const classesQuery = useQuery({
    queryKey: ["selector-classes", selectedSchoolId],
    enabled: open,
    queryFn: async () => {
      let query = (supabase as any).from("classes").select("id, name, school_id").order("sort_order");
      if (selectedSchoolId && selectedSchoolId !== "all") {
        query = query.eq("school_id", selectedSchoolId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SelectorClassRef[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ["selector-products", selectedSchoolId, selectedClassId, selectedCategory, activePanel, debouncedSearch, productPage],
    enabled: open,
    queryFn: async () => {
      let query = (supabase as any)
        .from("products")
        .select("id, name, category, school_id, class_id, price, gst_percentage, schools(name), classes(name)")
        .order("name")
        .range(0, productPage * PRODUCT_PAGE_SIZE - 1);

      if (selectedSchoolId && selectedSchoolId !== "all") query = query.eq("school_id", selectedSchoolId);
      if (selectedClassId && selectedClassId !== "all") query = query.eq("class_id", selectedClassId);
      if (selectedCategory && selectedCategory !== "all") query = query.eq("category", selectedCategory);
      if (activePanel === "search" && hasSearch) query = query.ilike("name", `%${debouncedSearch}%`);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SelectorProductRef[];
    },
  });

  const browseVariantsQuery = useQuery({
    queryKey: ["selector-browse-variants", selectedProductId, variantPage],
    enabled: open && activePanel === "browse" && Boolean(selectedProductId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_variants")
        .select("id, product_id, sku, size, status, price_override, products!inner(id, name, category, school_id, class_id, price, gst_percentage, schools(name), classes(name))")
        .eq("status", "active")
        .eq("product_id", selectedProductId)
        .order("size")
        .range(0, variantPage * VARIANT_PAGE_SIZE - 1);
      if (error) throw error;
      return ((data ?? []) as SelectorVariantRef[]).map(toDTO);
    },
  });

  const searchVariantsQuery = useQuery({
    queryKey: ["selector-search-variants", debouncedSearch, selectedSchoolId, selectedClassId, selectedCategory, variantPage],
    enabled: open && activePanel === "search" && hasSearch,
    queryFn: async () => {
      const clean = debouncedSearch.trim().replace(/[,()]/g, " ");

      const [variantMatch, productMatch] = await Promise.all([
        (supabase as any)
          .from("product_variants")
          .select("id, product_id, sku, size, status, price_override, products!inner(id, name, category, school_id, class_id, price, gst_percentage, schools(name), classes(name))")
          .eq("status", "active")
          .or(`sku.ilike.*${clean}*,size.ilike.*${clean}*`)
          .order("created_at", { ascending: false })
          .range(0, variantPage * VARIANT_PAGE_SIZE - 1),
        (supabase as any)
          .from("products")
          .select("id")
          .ilike("name", `%${clean}%`)
          .range(0, variantPage * VARIANT_PAGE_SIZE - 1),
      ]);

      if (variantMatch.error) throw variantMatch.error;
      if (productMatch.error) throw productMatch.error;

      const productIds = Array.from(new Set((productMatch.data ?? []).map((product: any) => product.id).filter(Boolean)));
      let nameMatches: SelectorVariantRef[] = [];

      if (productIds.length > 0) {
        const { data, error } = await (supabase as any)
          .from("product_variants")
          .select("id, product_id, sku, size, status, price_override, products!inner(id, name, category, school_id, class_id, price, gst_percentage, schools(name), classes(name))")
          .eq("status", "active")
          .in("product_id", productIds)
          .range(0, variantPage * VARIANT_PAGE_SIZE - 1);
        if (error) throw error;
        nameMatches = (data ?? []) as SelectorVariantRef[];
      }

      const merged = [...((variantMatch.data ?? []) as SelectorVariantRef[]), ...nameMatches];
      const deduped = new Map<string, SelectorVariantRef>();
      merged.forEach((variant) => deduped.set(variant.id, variant));

      const filteredByContext = Array.from(deduped.values()).filter((variant) => {
        const product = variant.products;
        if (selectedSchoolId !== "all" && selectedSchoolId && String(product?.school_id ?? "") !== selectedSchoolId) return false;
        if (selectedClassId !== "all" && selectedClassId && String(product?.class_id ?? "") !== selectedClassId) return false;
        if (selectedCategory !== "all" && selectedCategory && String(product?.category ?? "") !== selectedCategory) return false;
        return true;
      });

      return filteredByContext.map(toDTO).slice(0, variantPage * VARIANT_PAGE_SIZE);
    },
  });

  const productRows = productsQuery.data ?? [];
  const variantRows = activePanel === "search" ? (searchVariantsQuery.data ?? []) : (browseVariantsQuery.data ?? []);
  const categoryOptions = Array.from(new Set(productRows.map((product) => product.category).filter(Boolean))) as string[];

  return {
    schools: schoolsQuery.data ?? [],
    classes: classesQuery.data ?? [],
    products: productRows,
    variants: variantRows,
    categories: categoryOptions,
    isLoadingProducts: productsQuery.isLoading,
    isLoadingVariants: activePanel === "search" ? searchVariantsQuery.isLoading : browseVariantsQuery.isLoading,
    hasMoreProducts: productRows.length >= productPage * PRODUCT_PAGE_SIZE,
    hasMoreVariants: variantRows.length >= variantPage * VARIANT_PAGE_SIZE,
  };
};

const readRecentVariants = (): SelectorVariantDTO[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_VARIANTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as SelectorVariantDTO[]) : [];
  } catch {
    return [];
  }
};

const writeRecentVariants = (variants: SelectorVariantDTO[]) => {
  window.localStorage.setItem(RECENT_VARIANTS_KEY, JSON.stringify(variants.slice(0, 10)));
};

const useSelectionActions = () => {
  const [recentVariants, setRecentVariants] = useState<SelectorVariantDTO[]>(() => readRecentVariants());

  const rememberSelection = (dto: SelectorVariantDTO) => {
    setRecentVariants((current) => {
      const next = [dto, ...current.filter((item) => item.variantId !== dto.variantId)].slice(0, 10);
      writeRecentVariants(next);
      return next;
    });
  };

  return { recentVariants, rememberSelection };
};

const SmartVariantSelectorDialog = ({
  open,
  onOpenChange,
  selectorState,
  updateState,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectorState: SelectorState;
  updateState: (patch: Partial<SelectorState>) => void;
  onSelect: (selection: { dto: SelectorVariantDTO; identity: SelectorIdentity }) => void;
}) => {
  const debouncedSearch = useDebouncedValue(selectorState.searchTerm, 300);
  const data = useSelectorData({
    open,
    activePanel: selectorState.activePanel,
    debouncedSearch,
    selectedSchoolId: selectorState.selectedSchoolId,
    selectedClassId: selectorState.selectedClassId,
    selectedCategory: selectorState.selectedCategory,
    selectedProductId: selectorState.selectedProductId,
    productPage: selectorState.productPage,
    variantPage: selectorState.variantPage,
  });
  const { recentVariants, rememberSelection } = useSelectionActions();

  const visibleVariants = useMemo(() => {
    if (selectorState.activePanel === "search") {
      if (debouncedSearch.trim().length >= 2) return data.variants;
      return recentVariants;
    }
    return data.variants;
  }, [data.variants, debouncedSearch, recentVariants, selectorState.activePanel]);

  const previewVariant = visibleVariants.find((variant) => variant.variantId === selectorState.selectionPreviewVariantId)
    ?? visibleVariants[selectorState.focusedIndex]
    ?? null;

  useEffect(() => {
    if (!open) return;
    if (selectorState.activePanel !== "search") return;
    if (debouncedSearch.trim().length < 2) return;

    if (visibleVariants.length === 1) {
      const dto = visibleVariants[0];
      const identity = formatVariantIdentity(dto);
      rememberSelection(dto);
      onSelect({ dto, identity });
      onOpenChange(false);
      return;
    }

    if (visibleVariants.length > 1) {
      updateState({ focusedIndex: 0, selectionPreviewVariantId: visibleVariants[0].variantId });
    }
  }, [debouncedSearch, onOpenChange, onSelect, open, rememberSelection, selectorState.activePanel, updateState, visibleVariants]);

  const commitSelection = (dto: SelectorVariantDTO) => {
    const identity = formatVariantIdentity(dto);
    rememberSelection(dto);
    onSelect({ dto, identity });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
        onKeyDown={(event) => {
          if (!visibleVariants.length) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            updateState({
              focusedIndex: Math.min(selectorState.focusedIndex + 1, visibleVariants.length - 1),
              lastInteractionType: "keyboard",
              selectionPreviewVariantId: visibleVariants[Math.min(selectorState.focusedIndex + 1, visibleVariants.length - 1)]?.variantId ?? "",
            });
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            updateState({
              focusedIndex: Math.max(selectorState.focusedIndex - 1, 0),
              lastInteractionType: "keyboard",
              selectionPreviewVariantId: visibleVariants[Math.max(selectorState.focusedIndex - 1, 0)]?.variantId ?? "",
            });
          }

          if (event.key === "Enter") {
            const candidate = visibleVariants[selectorState.focusedIndex];
            if (!candidate) return;
            event.preventDefault();
            commitSelection(candidate);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Smart Product Selector</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 min-h-0 flex-1 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={selectorState.activePanel === "search" ? "default" : "outline"}
              onClick={() => updateState({ activePanel: "search" })}
            >
              Search-first
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectorState.activePanel === "browse" ? "default" : "outline"}
              onClick={() => updateState({ activePanel: "browse" })}
            >
              Browse-first
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => updateState({ compactMode: !selectorState.compactMode })}
            >
              {selectorState.compactMode ? "Comfortable" : "Compact"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => updateState({ showFallback: !selectorState.showFallback })}
            >
              {selectorState.showFallback ? "Hide fallback" : "Use fallback"}
            </Button>
          </div>

          <div className="flex items-center rounded-md border px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              className="h-11 border-0 px-0 focus-visible:ring-0"
              placeholder="Search product, SKU, size (Ctrl+K)"
              value={selectorState.searchTerm}
              onChange={(event) => {
                const value = event.target.value;
                updateState({
                  searchTerm: value,
                  activePanel: value.trim().length ? "search" : "browse",
                  focusedIndex: 0,
                  variantPage: 1,
                });
              }}
            />
          </div>

          <div className="grid grid-cols-12 gap-3 min-h-0 flex-1 overflow-hidden">
            <div className="col-span-3 space-y-2 rounded-md border p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Filters</p>
              <Select value={selectorState.selectedSchoolId || "all"} onValueChange={(value) => updateState({ selectedSchoolId: value, selectedClassId: "all", selectedProductId: "", productPage: 1 })}>
                <SelectTrigger><SelectValue placeholder="School" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {data.schools.map((school) => <SelectItem key={school.id} value={school.id}>{school.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={selectorState.selectedClassId || "all"} onValueChange={(value) => updateState({ selectedClassId: value, selectedProductId: "", productPage: 1 })}>
                <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {data.classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={selectorState.selectedCategory || "all"} onValueChange={(value) => updateState({ selectedCategory: value, selectedProductId: "", productPage: 1 })}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {data.categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-4 space-y-2 rounded-md border p-3 min-h-0 flex flex-col">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Products</p>
              <div className="space-y-1 min-h-0 flex-1">
                {data.isLoadingProducts ? <p className="text-sm text-muted-foreground">Loading products...</p> : null}
                <WindowedList
                  items={data.products}
                  itemHeight={selectorState.compactMode ? 48 : 60}
                  viewportHeight={320}
                  renderItem={(product) => {
                    const selected = selectorState.selectedProductId === product.id;
                    return (
                      <button
                        type="button"
                        key={product.id}
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left transition",
                          selected ? "border-black bg-black text-white" : "border-border hover:bg-muted/40",
                        )}
                        onClick={() => updateState({ selectedProductId: product.id, activePanel: "browse", variantPage: 1 })}
                      >
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className={cn("text-xs", selected ? "text-white/80" : "text-muted-foreground")}>
                          {(product.schools?.name ?? "Unknown School")} • {(product.classes?.name ?? "Unknown Class")} • {(product.category ?? "General")}
                        </p>
                      </button>
                    );
                  }}
                />
                {data.hasMoreProducts && (
                  <Button type="button" variant="outline" size="sm" onClick={() => updateState({ productPage: selectorState.productPage + 1 })}>
                    Load More Products
                  </Button>
                )}
              </div>
            </div>

            <div className="col-span-5 space-y-2 rounded-md border p-3 min-h-0 flex flex-col">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Variants</p>
              <div className="space-y-1 min-h-0 flex-1">
                {data.isLoadingVariants ? <p className="text-sm text-muted-foreground">Loading variants...</p> : null}
                {!data.isLoadingVariants && visibleVariants.length === 0 ? (
                  <Command>
                    <CommandEmpty>No results. Try SKU, size, product name, or clear a filter.</CommandEmpty>
                  </Command>
                ) : null}
                <WindowedList
                  items={visibleVariants}
                  itemHeight={selectorState.compactMode ? 52 : 78}
                  viewportHeight={320}
                  renderItem={(variant, index) => {
                    const identity = formatVariantIdentity(variant);
                    const focused = index === selectorState.focusedIndex;
                    const previewing = selectorState.selectionPreviewVariantId === variant.variantId;
                    return (
                      <button
                        key={variant.variantId}
                        type="button"
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left transition",
                          focused ? "border-black" : "border-border",
                          previewing ? "bg-muted/50" : "hover:bg-muted/30",
                        )}
                        onMouseEnter={() => updateState({ selectionPreviewVariantId: variant.variantId, lastInteractionType: "mouse" })}
                        onClick={() => commitSelection(variant)}
                      >
                        <p className={cn("text-sm", selectorState.compactMode ? "font-medium" : "font-semibold")}>{identity.primary}</p>
                        <p className="text-xs text-muted-foreground">{identity.secondary}</p>
                        <p className="text-xs text-muted-foreground">{identity.tertiary}</p>
                      </button>
                    );
                  }}
                />
                {data.hasMoreVariants && (
                  <Button type="button" variant="outline" size="sm" onClick={() => updateState({ variantPage: selectorState.variantPage + 1 })}>
                    Load More Variants
                  </Button>
                )}
              </div>
              {previewVariant && (
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Preview</p>
                  <p className="text-sm font-medium">{formatVariantIdentity(previewVariant).primary}</p>
                  <p className="text-xs text-muted-foreground">{formatVariantIdentity(previewVariant).secondary}</p>
                  <p className="text-xs text-muted-foreground">{formatVariantIdentity(previewVariant).tertiary}</p>
                </div>
              )}
            </div>
          </div>

          {selectorState.showFallback && (
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Fallback selector</p>
              <Select onValueChange={(value) => {
                const candidate = visibleVariants.find((variant) => variant.variantId === value);
                if (candidate) commitSelection(candidate);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select variant (fallback)" />
                </SelectTrigger>
                <SelectContent>
                  {visibleVariants.map((variant) => {
                    const identity = formatVariantIdentity(variant);
                    return <SelectItem key={variant.variantId} value={variant.variantId}>{identity.primary} • {identity.tertiary}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const SmartVariantSelectorController = ({
  selectorInstanceId,
  selectedVariantId,
  selectedSchoolId,
  selectedProductId,
  triggerLabel,
  onSelect,
}: SmartVariantSelectorControllerProps) => {
  const { state, update } = useSelectorState(selectedSchoolId, selectedProductId);

  useEffect(() => {
    update({ selectedSchoolId, selectedProductId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchoolId, selectedProductId]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full justify-between px-3 font-normal"
        onClick={() => update({ open: true })}
      >
        <span className="truncate text-left">{triggerLabel || "Select variant"}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Button>

      <SmartVariantSelectorDialog
        key={selectorInstanceId}
        open={state.open}
        onOpenChange={(open) => update({ open })}
        selectorState={state}
        updateState={update}
        onSelect={onSelect}
      />
    </>
  );
};

export { formatVariantIdentity };
