import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

type SearchResult = {
  id: string;
  label: string;
  subtitle: string;
  route: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const AdminCommandPalette = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<SearchResult[]>([]);
  const [products, setProducts] = useState<SearchResult[]>([]);
  const [variants, setVariants] = useState<SearchResult[]>([]);
  const [schools, setSchools] = useState<SearchResult[]>([]);
  const [customers, setCustomers] = useState<SearchResult[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const search = query.trim();
    if (search.length < 2) {
      setOrders([]);
      setProducts([]);
      setVariants([]);
      setSchools([]);
      setCustomers([]);
      setLoading(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);

      const [ordersTextRes, ordersPhoneExactRes, ordersRecentRes, productsRes, variantsRes, schoolsRes, customersRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, customer_name, phone, total_amount")
          .or(`customer_name.ilike.%${search}%,phone.ilike.%${search}%`)
          .order("created_at", { ascending: false })
          .limit(10),
        /^\d+$/.test(search)
          ? supabase
              .from("orders")
              .select("id, customer_name, phone, total_amount")
              .eq("phone", search)
              .order("created_at", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [], error: null } as any),
        search.length >= 6
          ? supabase
              .from("orders")
              .select("id, customer_name, phone, total_amount")
              .order("created_at", { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("products")
          .select("id, name")
          .ilike("name", `%${search}%`)
          .limit(10),
        supabase
          .from("product_variants")
          .select("id, size, sku, products(id, name)")
          .ilike("sku", `%${search}%`)
          .limit(10),
        supabase
          .from("schools")
          .select("id, name, code")
          .or(`name.ilike.%${search}%,code.ilike.%${search}%`)
          .limit(10),
        supabase
          .from("customers")
          .select("id, name, phone, email")
          .or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
          .limit(10),
      ]);

      if (!ordersTextRes.error) {
        const normalizedSearch = search.toLowerCase().replace(/-/g, "");
        const fallbackById = (ordersRecentRes.data ?? []).filter((o: any) => {
          const idNoDash = String(o.id || "").toLowerCase().replace(/-/g, "");
          return idNoDash.includes(normalizedSearch) || String(o.id || "").toLowerCase().includes(search.toLowerCase());
        });

        const mergedOrders = [...(ordersTextRes.data ?? []), ...(ordersPhoneExactRes.data ?? []), ...fallbackById]
          .reduce((acc: any[], item: any) => {
            if (!acc.some((x) => x.id === item.id)) acc.push(item);
            return acc;
          }, [])
          .slice(0, 10);

        setOrders(
          mergedOrders.map((o) => ({
            id: o.id,
            label: `Order #${o.id.slice(0, 8).toUpperCase()} — ${o.customer_name}`,
            subtitle: `${o.phone} • ${formatCurrency(Number(o.total_amount || 0))}`,
            route: `/admin/orders/${o.id}`,
          }))
        );
      } else {
        setOrders([]);
      }

      if (!productsRes.error) {
        setProducts(
          (productsRes.data ?? []).map((p) => ({
            id: p.id,
            label: p.name,
            subtitle: "Product",
            route: "/admin/products",
          }))
        );
      }

      if (!variantsRes.error) {
        setVariants(
          (variantsRes.data ?? []).map((v: any) => ({
            id: v.id,
            label: `${v.products?.name ?? "Product"} (${v.size || "default"})`,
            subtitle: `SKU: ${v.sku || "—"}`,
            route: "/admin/inventory",
          }))
        );
      }

      if (!schoolsRes.error) {
        setSchools(
          (schoolsRes.data ?? []).map((s) => ({
            id: s.id,
            label: s.name,
            subtitle: s.code ? `Code: ${s.code}` : "School",
            route: "/admin/schools",
          }))
        );
      }

      if (!customersRes.error) {
        setCustomers(
          (customersRes.data ?? []).map((c) => ({
            id: c.id,
            label: c.name || c.email || c.phone || "Customer",
            subtitle: [c.phone, c.email].filter(Boolean).join(" • "),
            route: `/admin/orders?search=${encodeURIComponent(c.phone || c.email || c.name || "")}`,
          }))
        );
      }

      setLoading(false);
    }, 220);

    return () => clearTimeout(timeout);
  }, [query, open]);

  const hasResults = useMemo(
    () => orders.length + products.length + variants.length + schools.length + customers.length > 0,
    [orders, products, variants, schools, customers]
  );

  const onSelect = (route: string) => {
    setOpen(false);
    setQuery("");
    navigate(route);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 border border-border rounded-lg px-3 h-8 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Search
        <CommandShortcut>⌘K</CommandShortcut>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search orders, products, schools, customers..." value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>{loading ? "Searching..." : "No results found"}</CommandEmpty>

          {!hasResults && query.trim().length < 2 && (
            <div className="px-3 py-4 text-xs text-muted-foreground">Type at least 2 characters to search</div>
          )}

          {orders.length > 0 && (
            <CommandGroup heading="Orders">
              {orders.map((item) => (
                <CommandItem key={`order-${item.id}`} onSelect={() => onSelect(item.route)} className="py-2">
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {products.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Products">
                {products.map((item) => (
                  <CommandItem key={`product-${item.id}`} onSelect={() => onSelect(item.route)} className="py-2">
                    <div className="flex flex-col">
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {variants.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Product Variants">
                {variants.map((item) => (
                  <CommandItem key={`variant-${item.id}`} onSelect={() => onSelect(item.route)} className="py-2">
                    <div className="flex flex-col">
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {schools.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Schools">
                {schools.map((item) => (
                  <CommandItem key={`school-${item.id}`} onSelect={() => onSelect(item.route)} className="py-2">
                    <div className="flex flex-col">
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {customers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Customers">
                {customers.map((item) => (
                  <CommandItem key={`customer-${item.id}`} onSelect={() => onSelect(item.route)} className="py-2">
                    <div className="flex flex-col">
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default AdminCommandPalette;
