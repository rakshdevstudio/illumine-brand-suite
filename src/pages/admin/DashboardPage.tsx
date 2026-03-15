import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isLowStock } from "@/lib/inventory";
import { IndianRupee, ShoppingBag, TrendingUp, AlertTriangle, ArrowRight, Medal } from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

type OrderStatus =
  | "pending"
  | "confirmed"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:   "bg-gray-100 text-gray-700",
  confirmed: "bg-blue-100 text-blue-700",
  packed:    "bg-yellow-100 text-yellow-700",
  shipped:   "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const statusStyle = (s: string) =>
  STATUS_STYLES[(s as OrderStatus)] ?? "bg-gray-100 text-gray-700";

// ── KPI card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
}

const KpiCard = ({ label, value, icon, sub }: KpiCardProps) => (
  <Card className="rounded-xl border border-border shadow-sm bg-white">
    <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5">
      <CardTitle className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground font-normal">
        {label}
      </CardTitle>
      <span className="text-muted-foreground/60">{icon}</span>
    </CardHeader>
    <CardContent className="px-5 pb-5">
      <p className="text-3xl font-extralight tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

// ── main ─────────────────────────────────────────────────────────────────────

const DashboardPage = () => {
  // Today's orders
  const { data: todayOrders } = useQuery({
    queryKey: ["dash-today-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount")
        .gte("created_at", todayStart())
        .neq("status", "cancelled");
      if (error) throw error;
      return data ?? [];
    },
  });

  // This month's orders
  const { data: monthOrders } = useQuery({
    queryKey: ["dash-month-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount")
        .gte("created_at", monthStart())
        .neq("status", "cancelled");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recent 5 orders
  const { data: recentOrders } = useQuery({
    queryKey: ["dash-recent-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, total_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Top selling products via order_items
  const { data: orderItems } = useQuery({
    queryKey: ["dash-order-items-top"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("quantity, product_id, products(id, name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Low stock
  const { data: lowStockVariants } = useQuery({
    queryKey: ["dash-low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, stock, size, low_stock_threshold, products(name)")
        .order("stock", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []).filter((v: any) =>
        isLowStock(v.stock, v.low_stock_threshold)
      );
    },
  });

  // ── computed ──

  const todayRevenue = useMemo(
    () => (todayOrders ?? []).reduce((s, o) => s + Number(o.total_amount || 0), 0),
    [todayOrders]
  );

  const monthRevenue = useMemo(
    () => (monthOrders ?? []).reduce((s, o) => s + Number(o.total_amount || 0), 0),
    [monthOrders]
  );

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number }>();
    (orderItems ?? []).forEach((item: any) => {
      const id = item.product_id ?? item.products?.id;
      const name = item.products?.name ?? "Unknown";
      if (!id) return;
      const prev = map.get(id) ?? { name, qty: 0 };
      map.set(id, { name, qty: prev.qty + Number(item.quantity || 0) });
    });
    return [...map.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [orderItems]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-light tracking-[0.1em] uppercase mb-1">Dashboard</h1>
        <p className="text-xs text-muted-foreground tracking-wide">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Today's Revenue"
          value={fmt(todayRevenue)}
          icon={<IndianRupee className="h-4 w-4" strokeWidth={1.5} />}
          sub={`${todayOrders?.length ?? 0} orders`}
        />
        <KpiCard
          label="Orders Today"
          value={todayOrders?.length ?? 0}
          icon={<ShoppingBag className="h-4 w-4" strokeWidth={1.5} />}
        />
        <KpiCard
          label="Revenue This Month"
          value={fmt(monthRevenue)}
          icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
          sub={`${monthOrders?.length ?? 0} orders`}
        />
        <KpiCard
          label="Low Stock Items"
          value={lowStockVariants?.length ?? 0}
          icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.5} />}
          sub={(lowStockVariants?.length ?? 0) > 0 ? "Needs attention" : "All good"}
        />
      </div>

      {/* Content row */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Top Selling Products */}
        <Card className="rounded-xl border border-border shadow-sm bg-white lg:col-span-1">
          <CardHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground font-normal">
                Top Selling Products
              </CardTitle>
              <Medal className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.5} />
            </div>
          </CardHeader>
          <CardContent className="px-6 py-4">
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No orders yet</p>
            ) : (
              <ol className="space-y-3">
                {topProducts.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-3">
                    <span className="text-[10px] tracking-[0.15em] text-muted-foreground/60 w-4 text-right shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{p.qty} sold</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="rounded-xl border border-border shadow-sm bg-white lg:col-span-2">
          <CardHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground font-normal">
                Recent Orders
              </CardTitle>
              <Link
                to="/admin/orders"
                className="flex items-center gap-1 text-[10px] tracking-[0.15em] uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!recentOrders || recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No orders yet</p>
            ) : (
              <div className="divide-y divide-border">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-secondary/30 transition-colors"
                  >
                    <span className="text-[11px] font-mono text-muted-foreground w-20 shrink-0">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="flex-1 text-sm truncate">{order.customer_name}</span>
                    <span className="text-sm font-light shrink-0">{fmt(order.total_amount)}</span>
                    <span
                      className={`text-[10px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-full shrink-0 ${statusStyle(order.status)}`}
                    >
                      {order.status}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                      {fmtDate(order.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts (only if any) */}
      {(lowStockVariants?.length ?? 0) > 0 && (
        <Card className="rounded-xl border border-red-200 shadow-sm bg-red-50/50">
          <CardHeader className="px-6 pt-5 pb-3 border-b border-red-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] tracking-[0.28em] uppercase text-red-600/80 font-normal flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
                Low Stock Alerts
              </CardTitle>
              <Link
                to="/admin/inventory"
                className="text-[10px] tracking-[0.15em] uppercase text-red-400 hover:text-red-600 transition-colors flex items-center gap-1"
              >
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-6 py-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {lowStockVariants?.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between text-sm bg-white border border-red-100 rounded-lg px-3 py-2"
                >
                  <span className="truncate text-red-800">
                    {v.products?.name ?? "Product"}{" "}
                    <span className="text-red-400 text-xs">· {v.size}</span>
                  </span>
                  <span className="text-red-500 font-medium ml-2 shrink-0">{v.stock} left</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;