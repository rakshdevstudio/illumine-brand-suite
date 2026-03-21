import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isLowStock } from "@/lib/inventory";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Flame,
  IndianRupee,
  Package,
  ShoppingCart,
  Trophy,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RangeFilter = "today" | "7d" | "30d" | "all";

const RANGE_OPTIONS: { key: RangeFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "all", label: "All Time" },
];

const PIE_COLORS = ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0"];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const sanitizeSchoolDisplayName = (name: string | null | undefined) =>
  (name ?? "Unknown School").trim().replace(/\s+/g, " ");

const getSinceIso = (range: RangeFilter) => {
  if (range === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "today") return d.toISOString();
  d.setDate(d.getDate() - (range === "7d" ? 6 : 29));
  return d.toISOString();
};

const useAnimatedNumber = (target: number, duration = 450) => {
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const from = display;
    const diff = target - from;

    if (Math.abs(diff) < 0.5) {
      setDisplay(target);
      return;
    }

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + diff * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return display;
};

const KpiCard = ({
  title,
  value,
  suffix,
  icon,
}: {
  title: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
}) => {
  const animated = useAnimatedNumber(value);

  return (
    <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm backdrop-blur-sm">
      <CardHeader className="pb-2 pt-5 px-5 flex flex-row items-center justify-between">
        <span className="text-muted-foreground/70">{icon}</span>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <p className="text-3xl md:text-4xl font-extralight tracking-tight">
          {suffix === "currency" ? formatCurrency(Math.round(animated)) : `${Math.round(animated).toLocaleString("en-IN")}${suffix ?? ""}`}
        </p>
        <p className="text-xs mt-1 text-muted-foreground tracking-wide">{title}</p>
      </CardContent>
    </Card>
  );
};

const SalesAnalyticsPage = () => {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<RangeFilter>("30d");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [activity, setActivity] = useState<string[]>([]);

  const { data: branches } = useQuery({
    queryKey: ["analytics-branches"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("branches")
        .select("id, name, location, is_active")
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string; location: string | null; is_active: boolean }>;
    },
  });

  const { data: metrics } = useQuery({
    queryKey: ["sales-metrics", branchFilter],
    queryFn: async () => {
      let ordersQuery = supabase.from("orders").select("id, total_amount, is_gst_order").neq("status", "CANCELLED");
      if (branchFilter !== "all") {
        ordersQuery = ordersQuery.eq("branch_id", branchFilter);
      }

      let itemsQuery = supabase
        .from("order_items")
        .select("quantity, orders!inner(branch_id, status)")
        .neq("orders.status", "CANCELLED");
      if (branchFilter !== "all") {
        itemsQuery = itemsQuery.eq("orders.branch_id", branchFilter);
      }

      const [{ data: orders, error: ordersErr }, { data: items, error: itemsErr }] = await Promise.all([ordersQuery, itemsQuery]);

      if (ordersErr) throw ordersErr;
      if (itemsErr) throw itemsErr;

      const totalRevenue = (orders ?? []).reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const totalOrders = orders?.length ?? 0;
      const totalUnits = (items ?? []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
      const totalGstOrders = (orders ?? []).filter((order: any) => Boolean(order.is_gst_order)).length;
      const gstRevenue = (orders ?? [])
        .filter((order: any) => Boolean(order.is_gst_order))
        .reduce((sum, order: any) => sum + Number(order.total_amount || 0), 0);

      return {
        totalRevenue,
        totalOrders,
        avgOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
        totalUnits,
        totalGstOrders,
        gstRevenue,
      };
    },
    staleTime: 30_000,
  });

  const { data: revenueSeries } = useQuery({
    queryKey: ["sales-revenue-series", range, branchFilter],
    queryFn: async () => {
      const sinceIso = getSinceIso(range);
      let query = supabase
        .from("orders")
        .select("created_at, total_amount")
        .neq("status", "CANCELLED")
        .order("created_at", { ascending: true });

      if (sinceIso) query = query.gte("created_at", sinceIso);
      if (branchFilter !== "all") query = query.eq("branch_id", branchFilter);

      const { data, error } = await query;
      if (error) throw error;

      const grouped = new Map<string, number>();
      (data ?? []).forEach((row) => {
        const key = row.created_at.slice(0, 10);
        grouped.set(key, (grouped.get(key) ?? 0) + Number(row.total_amount || 0));
      });

      return [...grouped.entries()].map(([date, revenue]) => ({
        date,
        revenue,
      }));
    },
    staleTime: 30_000,
  });

  const { data: schoolRevenue } = useQuery({
    queryKey: ["sales-by-school", branchFilter],
    queryFn: async () => {
      let query = supabase
        .from("order_items")
        .select("order_id, quantity, price, orders!inner(id, status, branch_id), products!inner(school_id, schools(name))")
        .neq("orders.status", "CANCELLED")
        .not("products.school_id", "is", null);
      if (branchFilter !== "all") query = query.eq("orders.branch_id", branchFilter);

      const { data, error } = await query;
      if (error) throw error;

      const grouped = new Map<string, { id: string; name: string; revenue: number; orderIds: Set<string> }>();
      (data ?? []).forEach((item: any) => {
        const schoolId = item.products?.school_id;
        if (!schoolId) return;

        const id = String(schoolId);
        const name = sanitizeSchoolDisplayName(
          Array.isArray(item.products?.schools) ? item.products?.schools[0]?.name : item.products?.schools?.name
        );
        const prev = grouped.get(id) ?? { id, name, revenue: 0, orderIds: new Set<string>() };
        const lineRevenue = Number(item.price || 0) * Number(item.quantity || 0);
        if (item.order_id) prev.orderIds.add(String(item.order_id));

        grouped.set(id, {
          id,
          name,
          revenue: prev.revenue + lineRevenue,
          orderIds: prev.orderIds,
        });
      });

      const ranked = [...grouped.values()]
        .map((row) => ({
          id: row.id,
          name: row.name,
          revenue: row.revenue,
          orders: row.orderIds.size,
        }))
        .sort((a, b) => b.revenue - a.revenue);
      const totalRevenue = ranked.reduce((sum, row) => sum + row.revenue, 0);

      return ranked.slice(0, 8).map((row, idx) => ({
        ...row,
        rank: idx + 1,
        contributionPct: totalRevenue > 0 ? Math.round((row.revenue / totalRevenue) * 100) : 0,
        revenueLabel: formatCurrency(row.revenue),
      }));
    },
    staleTime: 30_000,
  });

  const { data: branchSales } = useQuery({
    queryKey: ["sales-by-branch", branchFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("orders")
        .select("id, total_amount, branch_id, branches(name)")
        .not("branch_id", "is", null)
        .neq("status", "CANCELLED");

      if (branchFilter !== "all") {
        query = query.eq("branch_id", branchFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const grouped = new Map<string, { branchId: string; branchName: string; revenue: number; orders: number }>();

      (data ?? []).forEach((order: any) => {
        const branchId = order.branch_id as string;
        const branchName = order.branches?.name ?? "Unknown Branch";
        const prev = grouped.get(branchId) ?? {
          branchId,
          branchName,
          revenue: 0,
          orders: 0,
        };

        grouped.set(branchId, {
          branchId,
          branchName,
          revenue: prev.revenue + Number(order.total_amount || 0),
          orders: prev.orders + 1,
        });
      });

      const list = [...grouped.values()].sort((a, b) => b.revenue - a.revenue);
      const maxRevenue = list[0]?.revenue ?? 1;

      return list.map((row) => ({
        ...row,
        revenuePct: Math.round((row.revenue / maxRevenue) * 100),
      }));
    },
    staleTime: 30_000,
  });

  const { data: topProducts } = useQuery({
    queryKey: ["sales-top-products", branchFilter],
    queryFn: async () => {
      let query = supabase
        .from("order_items")
        .select("quantity, products(name), product_variants(size), orders!inner(branch_id)");
      if (branchFilter !== "all") query = query.eq("orders.branch_id", branchFilter);

      const { data, error } = await query;
      if (error) throw error;

      const grouped = new Map<string, { product: string; units: number }>();
      (data ?? []).forEach((item: any) => {
        const name = item.products?.name ?? "Product";
        const size = item.product_variants?.size ? ` Size ${item.product_variants.size}` : "";
        const key = `${name}${size}`;
        const prev = grouped.get(key) ?? { product: key, units: 0 };
        grouped.set(key, { product: key, units: prev.units + Number(item.quantity || 0) });
      });

      return [...grouped.values()].sort((a, b) => b.units - a.units).slice(0, 5);
    },
    staleTime: 30_000,
  });

  const { data: revenueByCategory } = useQuery({
    queryKey: ["sales-by-category", branchFilter],
    queryFn: async () => {
      let query = supabase
        .from("order_items")
        .select("quantity, price, products(category), orders!inner(branch_id)");
      if (branchFilter !== "all") query = query.eq("orders.branch_id", branchFilter);

      const { data, error } = await query;
      if (error) throw error;

      const grouped = new Map<string, number>();
      (data ?? []).forEach((item: any) => {
        const category = item.products?.category || "Other";
        const revenue = Number(item.price || 0) * Number(item.quantity || 0);
        grouped.set(category, (grouped.get(category) ?? 0) + revenue);
      });

      return [...grouped.entries()].map(([name, value]) => ({ name, value }));
    },
    staleTime: 30_000,
  });

  const { data: lowStock } = useQuery({
    queryKey: ["sales-low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, stock, low_stock_threshold, size, products(name)")
        .order("stock", { ascending: true })
        .limit(50);
      if (error) throw error;

      return (data ?? [])
        .filter((v: any) => isLowStock(v.stock, v.low_stock_threshold))
        .slice(0, 10);
    },
    staleTime: 30_000,
  });

  // ── Inventory Burn Rate ──────────────────────────────────────────────────
  const { data: burnRate } = useQuery({
    queryKey: ["sales-burn-rate"],
    queryFn: async () => {
      const since7d = new Date();
      since7d.setDate(since7d.getDate() - 7);
      since7d.setHours(0, 0, 0, 0);

      // Fetch all product_variants with current stock
      const [{ data: variants, error: vErr }, { data: recentItems, error: iErr }] = await Promise.all([
        supabase
          .from("product_variants")
          .select("id, size, stock, low_stock_threshold, products(name)")
          .gt("stock", 0)
          .limit(200),
        supabase
          .from("order_items")
          .select("variant_id, quantity, orders!inner(created_at)")
          .gte("orders.created_at", since7d.toISOString())
          .limit(2000),
      ]);

      if (vErr) throw vErr;
      if (iErr) throw iErr;

      // Tally units sold per variant in last 7 days
      const soldMap = new Map<string, number>();
      (recentItems ?? []).forEach((item: any) => {
        if (!item.variant_id) return;
        soldMap.set(item.variant_id, (soldMap.get(item.variant_id) ?? 0) + Number(item.quantity || 0));
      });

      return (variants ?? [])
        .map((v: any) => {
          const sold7 = soldMap.get(v.id) ?? 0;
          const dailySales = sold7 / 7;
          const daysRemaining = dailySales > 0 ? v.stock / dailySales : Infinity;
          return {
            id: v.id,
            name: `${v.products?.name ?? "Product"}${v.size ? ` — ${v.size}` : ""}`,
            stock: v.stock,
            sold7,
            dailySales: Math.round(dailySales * 10) / 10,
            daysRemaining: isFinite(daysRemaining) ? Math.round(daysRemaining) : null,
          };
        })
        .filter((v) => v.daysRemaining !== null)
        .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999))
        .slice(0, 5);
    },
    staleTime: 60_000,
  });

  // ── School Leaderboard ───────────────────────────────────────────────────
  const schoolLeaderboard = useMemo(() => {
    const list = (schoolRevenue ?? [])
      .slice()
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    const maxRevenue = list[0]?.revenue ?? 1;
    return list.map((s) => ({ ...s, pct: Math.round((s.revenue / maxRevenue) * 100) }));
  }, [schoolRevenue]);

  const { data: schoolsForTicker } = useQuery({
    queryKey: ["sales-schools-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const schoolMap = useMemo(() => {
    const map = new Map<string, string>();
    (schoolsForTicker ?? []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [schoolsForTicker]);

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["sales-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["sales-revenue-series"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-school"] });
    queryClient.invalidateQueries({ queryKey: ["sales-top-products"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-category"] });
    queryClient.invalidateQueries({ queryKey: ["sales-low-stock"] });
    queryClient.invalidateQueries({ queryKey: ["sales-burn-rate"] });
  };

  useEffect(() => {
    const ordersChannel = supabase
      .channel("admin-sales-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload: any) => {
          const schoolName = schoolMap.get(payload.new.school_id) ?? "Unknown School";
          const amount = formatCurrency(Number(payload.new.total_amount || 0));
          const item = `New Order: ${schoolName} — ${amount}`;
          setActivity((prev) => [item, ...prev].slice(0, 8));
          refetchAll();
        }
      )
      .subscribe();

    const itemsChannel = supabase
      .channel("admin-sales-order-items")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["sales-metrics"] });
          queryClient.invalidateQueries({ queryKey: ["sales-top-products"] });
          queryClient.invalidateQueries({ queryKey: ["sales-by-category"] });
        }
      )
      .subscribe();

    const stockChannel = supabase
      .channel("admin-sales-stock")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "product_variants" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["sales-low-stock"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(stockChannel);
    };
  }, [queryClient, schoolMap]);

  const exportRows = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, customer_name, phone, total_amount, status, created_at, schools(name), order_items(quantity, price, products(name), product_variants(size))"
      )
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) throw error;

    return (data ?? []).map((order: any) => ({
      orderId: order.id,
      customer: order.customer_name,
      phone: order.phone,
      school: order.schools?.name ?? "",
      products: (order.order_items ?? [])
        .map((i: any) => `${i.products?.name ?? "Item"}${i.product_variants?.size ? ` (${i.product_variants.size})` : ""} x${i.quantity}`)
        .join(" | "),
      total: Number(order.total_amount || 0),
      date: new Date(order.created_at).toISOString(),
      status: order.status,
    }));
  };

  const download = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    const rows = await exportRows();
    const header = ["Order ID", "Customer", "Phone", "School", "Products", "Total", "Date", "Status"];
    const lines = rows.map((r) =>
      [r.orderId, r.customer, r.phone, r.school, r.products, r.total, r.date, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    download(`sales-report-${Date.now()}.csv`, [header.join(","), ...lines].join("\n"), "text/csv;charset=utf-8;");
  };

  const handleExportExcel = async () => {
    const rows = await exportRows();
    const header = ["Order ID", "Customer", "Phone", "School", "Products", "Total", "Date", "Status"];
    const tableRows = rows
      .map(
        (r) =>
          `<tr><td>${r.orderId}</td><td>${r.customer}</td><td>${r.phone}</td><td>${r.school}</td><td>${r.products}</td><td>${r.total}</td><td>${r.date}</td><td>${r.status}</td></tr>`
      )
      .join("");

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8" /></head>
      <body>
        <table>
          <tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr>
          ${tableRows}
        </table>
      </body>
      </html>`;

    download(`sales-report-${Date.now()}.xls`, html, "application/vnd.ms-excel;charset=utf-8;");
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-light tracking-[0.08em] uppercase">Sales Analytics</h1>
          <p className="text-xs text-muted-foreground mt-1">Realtime business insights powered by Supabase</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportCsv} className="rounded-lg">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="rounded-lg">
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Total Revenue"
          value={metrics?.totalRevenue ?? 0}
          suffix="currency"
          icon={<IndianRupee className="h-4 w-4" strokeWidth={1.5} />}
        />
        <KpiCard
          title="Total Orders"
          value={metrics?.totalOrders ?? 0}
          icon={<ShoppingCart className="h-4 w-4" strokeWidth={1.5} />}
        />
        <KpiCard
          title="Average Order Value"
          value={metrics?.avgOrderValue ?? 0}
          suffix="currency"
          icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
        />
        <KpiCard
          title="Total Units Sold"
          value={metrics?.totalUnits ?? 0}
          icon={<Package className="h-4 w-4" strokeWidth={1.5} />}
        />
        <KpiCard
          title="Total GST Orders"
          value={metrics?.totalGstOrders ?? 0}
          icon={<ShoppingCart className="h-4 w-4" strokeWidth={1.5} />}
        />
        <KpiCard
          title="GST Revenue"
          value={metrics?.gstRevenue ?? 0}
          suffix="currency"
          icon={<IndianRupee className="h-4 w-4" strokeWidth={1.5} />}
        />
      </div>

      <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground">
              Revenue Over Time
            </CardTitle>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-56 h-9 text-xs">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {(branches ?? []).map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setRange(option.key)}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    range === option.key
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(Number(value)), "Revenue"]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString("en-IN")}
                />
                <Line type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2.2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground">
              Sales by School
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(schoolRevenue?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No school-linked non-cancelled orders found.</p>
            ) : (
              <div className="space-y-4">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={schoolRevenue ?? []} layout="vertical" margin={{ left: 30, right: 28 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, _name, props: any) => [formatCurrency(value), `${props?.payload?.orders ?? 0} orders`]}
                      />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                        {(schoolRevenue ?? []).map((row) => (
                          <Cell key={row.id} fill={row.rank === 1 ? "#0f172a" : "#334155"} />
                        ))}
                        <LabelList dataKey="revenueLabel" position="right" className="fill-muted-foreground text-[10px]" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  {(schoolRevenue ?? []).map((school) => (
                    <div
                      key={school.id}
                      className={`rounded-lg border p-3 ${school.rank === 1 ? "border-foreground/30 bg-secondary/30" : "border-border"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {school.rank}. {school.name}
                        </p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{school.orders} orders</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{school.contributionPct}% of total revenue</p>
                      <p className="text-sm mt-1">{formatCurrency(school.revenue)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground">
              Top Selling Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(topProducts ?? []).map((p, idx) => (
                <div key={p.product} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground w-5">{idx + 1}.</span>
                    <span className="truncate">{p.product}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">{p.units}</span>
                </div>
              ))}
              {(topProducts?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground">
              Sales by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueByCategory ?? []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {(revenueByCategory ?? []).map((entry, idx) => (
                      <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.5} /> Low Stock Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {(lowStock ?? []).map((variant: any) => (
                <div key={variant.id} className="text-sm flex items-center justify-between border border-border rounded-lg px-3 py-2">
                  <span className="truncate pr-2">
                    {variant.products?.name ?? "Product"}
                    {variant.size ? ` Size ${variant.size}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{variant.stock} left</span>
                </div>
              ))}
              {(lowStock?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No risk items</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground">
            Sales by Branch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {(branchSales?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No assigned non-cancelled orders found for this filter.</p>
          ) : (
            <>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {branchSales?.map((row) => (
                  <div key={row.branchId} className="border border-border rounded-lg p-3">
                    <p className="text-sm font-medium truncate">{row.branchName}</p>
                    <p className="text-xs text-muted-foreground mt-1">Revenue</p>
                    <p className="text-base font-light">{formatCurrency(row.revenue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Orders: {row.orders}</p>
                  </div>
                ))}
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchSales} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="branchName" width={180} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number, _name, props: any) => [formatCurrency(value), `${props?.payload?.orders ?? 0} orders`]}
                    />
                    <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                      {(branchSales ?? []).map((row) => (
                        <Cell key={row.branchId} fill="#0f172a" fillOpacity={Math.max(0.45, (row.revenuePct ?? 0) / 100)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Burn Rate + School Leaderboard row */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Inventory Burn Rate */}
        <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" strokeWidth={1.5} />
              Inventory Burn Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(burnRate?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Not enough sales data yet (requires ≥1 sale in last 7 days)</p>
            ) : (
              <div className="space-y-4">
                {burnRate?.map((v) => {
                  const days = v.daysRemaining ?? 0;
                  const risk: "critical" | "warning" | "safe" =
                    days <= 3 ? "critical" : days <= 7 ? "warning" : "safe";
                  const badge = {
                    critical: { label: "Critical", cls: "bg-red-100 text-red-700 border-red-200" },
                    warning:  { label: "Low Stock", cls: "bg-orange-100 text-orange-700 border-orange-200" },
                    safe:     { label: "Healthy",   cls: "bg-green-100 text-green-700 border-green-200" },
                  }[risk];

                  return (
                    <div key={v.id} className="flex flex-col gap-1 border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug truncate">{v.name}</p>
                        <span className={`text-[10px] tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div>
                          <p className="text-xs text-muted-foreground">Stock</p>
                          <p className="text-sm font-light">{v.stock}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Daily Sales</p>
                          <p className="text-sm font-light">{v.dailySales}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Out in</p>
                          <p className={`text-sm font-medium ${
                            risk === "critical" ? "text-red-600" : risk === "warning" ? "text-orange-600" : "text-green-600"
                          }`}>{days}d</p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            risk === "critical" ? "bg-red-500" : risk === "warning" ? "bg-orange-400" : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(100, (v.stock / Math.max(1, (v.sold7 ?? 0))) * 100 * 0.5)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* School Leaderboard */}
        <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" strokeWidth={1.5} />
              School Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(schoolLeaderboard?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No order data yet</p>
            ) : (
              <div className="space-y-3">
                {schoolLeaderboard?.map((school, idx) => (
                  <div
                    key={school.id}
                    className={`rounded-xl p-4 border transition-colors ${
                      idx === 0
                        ? "border-l-4 border-l-foreground border-t-border border-r-border border-b-border bg-secondary/40"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                        <p className="text-sm font-medium truncate">{school.name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{school.orders} orders</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1.5">{formatCurrency(school.revenue)}</p>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground transition-all duration-700"
                        style={{ width: `${school.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm tracking-[0.12em] uppercase font-normal text-muted-foreground">
            Live Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Waiting for new orders…</p>
            ) : (
              activity.map((line, idx) => (
                <p key={`${line}-${idx}`} className="text-sm text-foreground/90">
                  {line}
                </p>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesAnalyticsPage;