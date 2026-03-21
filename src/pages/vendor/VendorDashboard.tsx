import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { AlertTriangle, IndianRupee, Package, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalEmptyState, PortalMetricCard, PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import {
  ORDER_STATUS_STYLES,
  formatCurrency,
  formatShortDate,
  useResolvedSchoolScope,
} from "@/lib/portal-dashboard";
import { isLowStock } from "@/lib/inventory";

const VendorDashboard = () => {
  const { user, isVendor, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;
  const scopeKey = schoolId ?? "all";

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ["vendor-dashboard", user?.id, scopeKey],
    enabled: !!user && hasAccess && isVendor && !scopeLoading,
    queryFn: async () => {
      let ordersQuery = supabase
        .from("orders")
        .select("id, customer_name, total_amount, status, created_at, school_id, order_items(quantity, price, products(id, name, school_id))")
        .order("created_at", { ascending: false });

      let productsQuery = supabase
        .from("products")
        .select("id, name, school_id, product_variants(id, stock, low_stock_threshold)")
        .eq("status", "active")
        .order("name");

      if (schoolId) {
        ordersQuery = ordersQuery.eq("school_id", schoolId);
        productsQuery = productsQuery.eq("school_id", schoolId);
      }

      const [{ data: orders, error: ordersError }, { data: products, error: productsError }] = await Promise.all([
        ordersQuery,
        productsQuery,
      ]);

      if (ordersError) throw ordersError;
      if (productsError) throw productsError;

      const completedOrders = (orders ?? []).filter((order: any) => order.status !== "CANCELLED");

      const totalRevenue = completedOrders.reduce(
        (sum: number, order: any) => sum + Number(order.total_amount ?? 0),
        0,
      );
      const totalOrders = orders?.length ?? 0;
      const productsSold = completedOrders.reduce(
        (sum: number, order: any) =>
          sum +
          (order.order_items ?? []).reduce(
            (itemSum: number, item: any) => itemSum + Number(item.quantity ?? 0),
            0,
          ),
        0,
      );
      const lowStockCount = (products ?? []).reduce((count: number, product: any) => {
        const lowStockVariants = (product.product_variants ?? []).filter((variant: any) =>
          isLowStock(Number(variant.stock ?? 0), variant.low_stock_threshold),
        );

        return count + lowStockVariants.length;
      }, 0);

      const topSellingMap = new Map<string, { name: string; quantity: number; revenue: number }>();
      completedOrders.forEach((order: any) => {
        (order.order_items ?? []).forEach((item: any) => {
          const productId = item.products?.id ?? item.product_id ?? item.products?.name;
          const productName = item.products?.name ?? "Product";
          if (!productId) return;

          const current = topSellingMap.get(productId) ?? { name: productName, quantity: 0, revenue: 0 };
          current.quantity += Number(item.quantity ?? 0);
          current.revenue += Number(item.price ?? 0) * Number(item.quantity ?? 0);
          topSellingMap.set(productId, current);
        });
      });

      return {
        totalRevenue,
        totalOrders,
        productsSold,
        lowStockCount,
        topSellingProducts: [...topSellingMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
        recentOrders: (orders ?? []).slice(0, 5),
      };
    },
    staleTime: 30_000,
  });

  const scopeLabel = useMemo(() => {
    if (!scope) return "Loading scope";
    if (!scope.schoolId) return "All available schools";
    return scope.school?.name ?? "Assigned school";
  }, [scope]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!user || !hasAccess || !isVendor) {
    return <Navigate to="/vendor/login" replace />;
  }

  return (
    <PortalShell
      title="Vendor Dashboard"
      subtitle={user.email ?? "Vendor analytics"}
      onSignOut={signOut}
      scopeLabel={scopeLabel}
    >
      {scope && !scope.schoolId ? (
        <Card className={portalPanelClassName}>
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              No vendor-specific school mapping was assigned to this account, so the dashboard is showing all schools
              until a `school_id` is configured.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PortalMetricCard
          label="Total Revenue"
          value={dashboardLoading ? "..." : formatCurrency(dashboard?.totalRevenue ?? 0)}
          icon={<IndianRupee className="h-4 w-4" strokeWidth={1.5} />}
        />
        <PortalMetricCard
          label="Total Orders"
          value={dashboardLoading ? "..." : dashboard?.totalOrders ?? 0}
          icon={<ShoppingBag className="h-4 w-4" strokeWidth={1.5} />}
        />
        <PortalMetricCard
          label="Products Sold"
          value={dashboardLoading ? "..." : dashboard?.productsSold ?? 0}
          icon={<Package className="h-4 w-4" strokeWidth={1.5} />}
        />
        <PortalMetricCard
          label="Low Stock Count"
          value={dashboardLoading ? "..." : dashboard?.lowStockCount ?? 0}
          icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.5} />}
        />
      </div>

      <Card className={portalPanelClassName}>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Top Selling Products
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dashboardLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-16 rounded-[20px] border border-border/60 bg-stone-50/80 animate-pulse" />
            ))
          ) : dashboard?.topSellingProducts.length ? (
            dashboard.topSellingProducts.map((product, index) => (
              <div
                key={`${product.name}-${index}`}
                className="flex items-center justify-between gap-4 rounded-[22px] border border-black/5 bg-stone-50/80 p-4"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{product.name}</p>
                  <p className="text-sm text-muted-foreground">{product.quantity} units sold</p>
                </div>
                <p className="text-sm font-medium text-foreground">{formatCurrency(product.revenue)}</p>
              </div>
            ))
          ) : (
            <PortalEmptyState
              title="No Sales Yet"
              description="Top products will appear here once orders start flowing in."
            />
          )}
        </CardContent>
      </Card>

      <Card className={portalPanelClassName}>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Recent Orders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dashboardLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-20 rounded-[20px] border border-border/60 bg-stone-50/80 animate-pulse" />
            ))
          ) : dashboard?.recentOrders.length ? (
            dashboard.recentOrders.map((order: any) => (
              <div
                key={order.id}
                className="flex flex-col gap-3 rounded-[22px] border border-black/5 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{order.customer_name}</p>
                  <p className="text-sm text-muted-foreground">{formatShortDate(order.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-foreground">{formatCurrency(Number(order.total_amount ?? 0))}</p>
                  <Badge
                    variant="outline"
                    className={ORDER_STATUS_STYLES[order.status] ?? "border-stone-200 bg-stone-100 text-stone-700"}
                  >
                    {order.status}
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <PortalEmptyState
              title="No Recent Orders"
              description="Recent orders for this vendor scope will appear here."
            />
          )}
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default VendorDashboard;
