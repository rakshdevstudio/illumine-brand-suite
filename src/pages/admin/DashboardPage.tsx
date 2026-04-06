import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { isLowStock } from "@/lib/inventory";
import { safeQuery } from "@/lib/safeQuery";
import { useRequireAuth } from "@/hooks/useRequireAuth";
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
  d.setDate(d.getDate() - 30); // rolling 30-day window to keep prior-month revenue visible early in month
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

type OrderStatus =
  | "PLACED"
  | "PACKED"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELLED";

const STATUS_STYLES: Record<OrderStatus, string> = {
  PLACED: "bg-gray-100 text-gray-700",
  PACKED: "bg-yellow-100 text-yellow-700",
  DISPATCHED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const statusStyle = (value: string) => {
  const status = String(value || "").toUpperCase();
  const normalized = status === "PENDING" ? "PLACED" : status === "CONFIRMED" ? "PACKED" : status === "SHIPPED" ? "DISPATCHED" : status;
  return STATUS_STYLES[(normalized as OrderStatus)] ?? "bg-gray-100 text-gray-700";
};

const parseStudentFieldsFromNotes = (notes: Array<{ note?: string | null } | null | undefined> | undefined) => {
  const result = {
    student_name: null as string | null,
    grade: null as string | null,
    alternate_phone: null as string | null,
  };

  if (!notes?.length) return result;

  for (const entry of notes) {
    const note = entry?.note || "";
    if (!note) continue;

    const studentNameMatch = note.match(/Student Name:\s*(.+)/i);
    const gradeMatch = note.match(/Grade:\s*(.+)/i);
    const alternateMatch = note.match(/Alternate Phone:\s*(.+)/i);

    if (studentNameMatch?.[1] && !result.student_name) result.student_name = studentNameMatch[1].trim();
    if (gradeMatch?.[1] && !result.grade) result.grade = gradeMatch[1].trim();
    if (alternateMatch?.[1] && !result.alternate_phone) result.alternate_phone = alternateMatch[1].trim();

    if (result.student_name && result.grade && result.alternate_phone) break;
  }

  return result;
};

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
  const { isChecking } = useRequireAuth();

  // Today's orders
  const { data: todayOrders, error: todayOrdersError, isLoading: todayOrdersLoading } = useQuery({
    queryKey: ["dash-today-orders"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () =>
          supabase
            .from("orders")
            .select("id, total_amount")
            .gte("created_at", todayStart())
            .neq("status", "CANCELLED"),
        "admin-dashboard/today-orders"
      );
      return data ?? [];
    },
  });

  // This month's orders
  const { data: monthOrders, error: monthOrdersError, isLoading: monthOrdersLoading } = useQuery({
    queryKey: ["dash-month-orders"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () =>
          supabase
            .from("orders")
            .select("id, total_amount")
            .gte("created_at", monthStart())
            .neq("status", "CANCELLED"),
        "admin-dashboard/month-orders"
      );
      return data ?? [];
    },
  });

  // Recent 5 orders
  const { data: recentOrders, error: recentOrdersError, isLoading: recentOrdersLoading } = useQuery({
    queryKey: ["dash-recent-orders"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () =>
          supabase
            .from("orders")
            .select("id, customer_name, phone, total_amount, status, created_at, order_notes(note, created_at)")
            .order("created_at", { ascending: false })
            .limit(5),
        "admin-dashboard/recent-orders"
      );
      return (data ?? []).map((order: any) => ({
        ...order,
        ...parseStudentFieldsFromNotes(order.order_notes),
      }));
    },
  });

  // Top selling products via order_items
  const { data: orderItems, error: orderItemsError, isLoading: orderItemsLoading } = useQuery({
    queryKey: ["dash-order-items-top"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () =>
          supabase
            .from("order_items")
            .select("quantity, product_id, products(id, name)"),
        "admin-dashboard/order-items"
      );
      return data ?? [];
    },
  });

  // Low stock
  const { data: lowStockVariants, error: lowStockError, isLoading: lowStockLoading } = useQuery({
    queryKey: ["dash-low-stock"],
    queryFn: async () => {
      const { data } = await safeQuery(
        () =>
          supabase
            .from("branch_inventory")
            .select("id, stock, product_variants(size, low_stock_threshold, products(name))")
            .order("stock", { ascending: true })
            .limit(100),
        "admin-dashboard/low-stock"
      );
      return (data ?? []).filter((v: any) =>
        isLowStock(v.stock, v.product_variants?.low_stock_threshold)
      );
    },
  });

  const hasError = Boolean(todayOrdersError || monthOrdersError || recentOrdersError || orderItemsError || lowStockError);
  const isLoading =
    isChecking ||
    todayOrdersLoading ||
    monthOrdersLoading ||
    recentOrdersLoading ||
    orderItemsLoading ||
    lowStockLoading;

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

  if (isLoading) {
    return (
      <div className="min-h-[220px] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  if (hasError) {
    return <ErrorState message="Session expired. Please login again." />;
  }

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
          label="Revenue (Last 30 Days)"
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{order.customer_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Student: {order.student_name || "—"} · Grade: {order.grade || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        Phone: {order.phone || "—"} · Alt: {(order as any).alternate_phone || "—"}
                      </p>
                    </div>
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
                    {v.product_variants?.products?.name ?? "Product"}{" "}
                    <span className="text-red-400 text-xs">· {v.product_variants?.size}</span>
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
