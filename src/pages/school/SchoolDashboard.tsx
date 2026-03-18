import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Clock3,
  GraduationCap,
  IndianRupee,
  Package,
  ShoppingBag,
  Sparkles,
  Truck,
  XCircle,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalEmptyState, PortalMetricCard, PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { ORDER_STATUS_STYLES, formatCurrency, formatShortDate, useResolvedSchoolScope } from "@/lib/portal-dashboard";
import { fetchSchoolPortalData, isWithinSchoolTimeFilter, type SchoolPortalOrder, type SchoolTimeFilter } from "@/lib/school-portal";

const TIME_FILTER_OPTIONS: Array<{ value: SchoolTimeFilter; label: string; description: string }> = [
  { value: "all", label: "All Time", description: "All available school orders" },
  { value: "today", label: "Today", description: "Orders placed today" },
  { value: "week", label: "This Week", description: "Orders placed over the last 7 days" },
];

const STATUS_SECTIONS = [
  { key: "pending", label: "Pending", icon: Clock3 },
  { key: "confirmed", label: "Confirmed", icon: BadgeCheck },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "cancelled", label: "Cancelled", icon: XCircle },
] as const;

const SectionEmpty = ({ title, description }: { title: string; description: string }) => (
  <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[22px] border border-dashed border-black/10 bg-stone-50/70 px-6 py-8 text-center">
    <p className="text-sm font-medium uppercase tracking-[0.22em] text-foreground">{title}</p>
    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
  </div>
);

const formatWindowLabel = (filter: SchoolTimeFilter) => {
  const selected = TIME_FILTER_OPTIONS.find((option) => option.value === filter);
  return selected?.label ?? "All Time";
};

const buildSmartInsights = ({
  timeFilter,
  classPerformance,
  topSellingProducts,
  lowStockCount,
  statusBreakdown,
  studentInsights,
}: {
  timeFilter: SchoolTimeFilter;
  classPerformance: Array<{ className: string; orderCount: number; revenue: number }>;
  topSellingProducts: Array<{ name: string; unitsSold: number }>;
  lowStockCount: number;
  statusBreakdown: Record<string, number>;
  studentInsights: Array<{ studentName: string; className: string; orderCount: number }>;
}) => {
  const windowLabel = formatWindowLabel(timeFilter).toLowerCase();
  const insights: string[] = [];

  if (classPerformance[0]) {
    insights.push(
      `${classPerformance[0].className} is leading ${windowLabel} with ${classPerformance[0].orderCount} orders and ${formatCurrency(classPerformance[0].revenue)} in revenue.`,
    );
  }

  if (topSellingProducts[0]) {
    insights.push(
      `${topSellingProducts[0].name} is the current top seller with ${topSellingProducts[0].unitsSold} units sold.`,
    );
  }

  if (lowStockCount > 0) {
    insights.push(`${lowStockCount} product variants are below the low-stock threshold and need replenishment.`);
  }

  if ((statusBreakdown.pending ?? 0) > 0) {
    insights.push(`${statusBreakdown.pending} pending orders still need action from the school operations team.`);
  }

  if (studentInsights[0]) {
    insights.push(
      `${studentInsights[0].studentName} from ${studentInsights[0].className} is the most active repeat student in the current view.`,
    );
  }

  return insights.length
    ? insights
    : ["Orders, product movement, and student trends will surface here as soon as school transactions start flowing in."];
};

const SchoolDashboard = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;
  const [timeFilter, setTimeFilter] = useState<SchoolTimeFilter>("all");

  const {
    data: portalData,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = useQuery({
    queryKey: ["school-portal", schoolId],
    enabled: !!schoolId && !!user && hasAccess && isSchoolUser && !scopeLoading,
    queryFn: () => fetchSchoolPortalData(schoolId!),
    staleTime: 30_000,
  });

  const allOrders = portalData?.orders ?? [];
  const viewOrders = useMemo(
    () => allOrders.filter((order) => isWithinSchoolTimeFilter(order.created_at, timeFilter)),
    [allOrders, timeFilter],
  );

  const totalOrders = allOrders.length;
  const totalStudentOrders = allOrders.filter((order) => Boolean(order.resolvedStudentName || order.resolvedClass !== "Unassigned")).length;
  const totalRevenue = allOrders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);

  const ordersToday = useMemo(
    () => allOrders.filter((order) => isWithinSchoolTimeFilter(order.created_at, "today")).length,
    [allOrders],
  );
  const ordersThisWeek = useMemo(
    () => allOrders.filter((order) => isWithinSchoolTimeFilter(order.created_at, "week")).length,
    [allOrders],
  );

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      shipped: 0,
      cancelled: 0,
    };

    viewOrders.forEach((order) => {
      if (order.status in counts) {
        counts[order.status] += 1;
      }
    });

    return counts;
  }, [viewOrders]);

  const classPerformance = useMemo(() => {
    const classMap = new Map<string, { className: string; orderCount: number; revenue: number }>();

    viewOrders.forEach((order) => {
      const className = order.resolvedClass || "Unassigned";
      const current = classMap.get(className) ?? { className, orderCount: 0, revenue: 0 };
      current.orderCount += 1;
      if (order.status !== "cancelled") {
        current.revenue += Number(order.total_amount ?? 0);
      }
      classMap.set(className, current);
    });

    return [...classMap.values()].sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      return b.revenue - a.revenue;
    });
  }, [viewOrders]);

  const topSellingProducts = useMemo(() => {
    const productMap = new Map<string, { name: string; unitsSold: number }>();

    viewOrders
      .filter((order) => order.status !== "cancelled")
      .forEach((order) => {
        order.order_items.forEach((item) => {
          const key = item.product?.id ?? item.productId;
          const name = item.product?.name ?? "Product";
          const current = productMap.get(key) ?? { name, unitsSold: 0 };
          current.unitsSold += Number(item.quantity ?? 0);
          productMap.set(key, current);
        });
      });

    return [...productMap.values()].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 6);
  }, [viewOrders]);

  const studentInsights = useMemo(() => {
    const studentMap = new Map<string, { studentName: string; className: string; orderCount: number }>();

    viewOrders.forEach((order) => {
      if (!order.resolvedStudentName) return;
      const studentName = order.resolvedStudentName;
      const className = order.resolvedClass || "Unassigned";
      const key = `${studentName.toLowerCase()}::${className.toLowerCase()}`;
      const current = studentMap.get(key) ?? { studentName, className, orderCount: 0 };
      current.orderCount += 1;
      studentMap.set(key, current);
    });

    return [...studentMap.values()].sort((a, b) => b.orderCount - a.orderCount).slice(0, 6);
  }, [viewOrders]);

  const smartInsights = useMemo(
    () =>
      buildSmartInsights({
        timeFilter,
        classPerformance,
        topSellingProducts,
        lowStockCount: portalData?.lowStockItems.length ?? 0,
        statusBreakdown,
        studentInsights,
      }),
    [classPerformance, portalData?.lowStockItems.length, statusBreakdown, studentInsights, timeFilter, topSellingProducts],
  );

  const recentOrders = allOrders.slice(0, 5);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!user || !hasAccess || !isSchoolUser) {
    return <Navigate to="/school/login" replace />;
  }

  return (
    <PortalShell
      title="School Dashboard"
      subtitle={user.email ?? "School insights"}
      onSignOut={signOut}
      scopeLabel={scope?.school?.name ?? (schoolId ? "Assigned school" : scopeLoading ? "Resolving school" : "School not assigned")}
    >
      {!scopeLoading && !schoolId ? (
        <PortalEmptyState
          title="Please assign a school to this account"
          description="This school user does not have a resolved `school_id`. Add `school_id` on the user or metadata, or create a `user_school_map` entry."
        />
      ) : dashboardError ? (
        <PortalEmptyState
          title="Unable to Load School Insights"
          description={(dashboardError as Error)?.message || "The school dashboard could not load right now. Please try again."}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <PortalMetricCard
              label="Total Orders"
              value={dashboardLoading ? "..." : totalOrders}
              icon={<ShoppingBag className="h-4 w-4" strokeWidth={1.5} />}
              hint={dashboardLoading ? undefined : `${portalData?.productCount ?? 0} active products`}
            />
            <PortalMetricCard
              label="Total Student Orders"
              value={dashboardLoading ? "..." : totalStudentOrders}
              icon={<GraduationCap className="h-4 w-4" strokeWidth={1.5} />}
            />
            <PortalMetricCard
              label="Total Revenue"
              value={dashboardLoading ? "..." : formatCurrency(totalRevenue)}
              icon={<IndianRupee className="h-4 w-4" strokeWidth={1.5} />}
            />
            <PortalMetricCard
              label="Orders Today"
              value={dashboardLoading ? "..." : ordersToday}
              icon={<CalendarDays className="h-4 w-4" strokeWidth={1.5} />}
            />
            <PortalMetricCard
              label="Orders This Week"
              value={dashboardLoading ? "..." : ordersThisWeek}
              icon={<Clock3 className="h-4 w-4" strokeWidth={1.5} />}
            />
          </div>

          <Card className={`${portalPanelClassName} overflow-hidden`}>
            <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,320px),minmax(0,1fr)]">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                    Time View
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Apply this window to status, class, product, and student insights.
                  </p>
                </div>
                <div className="grid gap-3">
                  {TIME_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTimeFilter(option.value)}
                      className={`rounded-[22px] border px-4 py-4 text-left transition ${
                        timeFilter === option.value
                          ? "border-black/10 bg-white shadow-sm"
                          : "border-black/5 bg-stone-50/70 hover:bg-white"
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[26px] border border-black/5 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,245,238,0.92))] p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-black/10 bg-white p-2">
                    <Sparkles className="h-4 w-4 text-foreground" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                      Smart Insights
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Decision-focused highlights for the {formatWindowLabel(timeFilter).toLowerCase()} view.
                    </p>
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  {smartInsights.map((insight) => (
                    <div
                      key={insight}
                      className="rounded-[20px] border border-black/5 bg-white/85 px-4 py-4 text-sm leading-6 text-foreground"
                    >
                      {insight}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className={portalPanelClassName}>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  Order Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {STATUS_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  return (
                    <div
                      key={section.key}
                      className="rounded-[22px] border border-black/5 bg-stone-50/80 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{section.label}</p>
                        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      </div>
                      <p className="mt-3 text-3xl font-extralight tracking-tight text-foreground">
                        {dashboardLoading ? "..." : statusBreakdown[section.key] ?? 0}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

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
                ) : topSellingProducts.length ? (
                  topSellingProducts.map((product, index) => (
                    <div
                      key={`${product.name}-${index}`}
                      className="flex items-center justify-between gap-4 rounded-[22px] border border-black/5 bg-stone-50/80 px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.unitsSold} units sold</p>
                      </div>
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                  ))
                ) : (
                  <SectionEmpty
                    title="No Product Trends Yet"
                    description="Top-selling products will appear here once orders are available for this school view."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className={portalPanelClassName}>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  Class Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboardLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-20 rounded-[20px] border border-border/60 bg-stone-50/80 animate-pulse" />
                  ))
                ) : classPerformance.length ? (
                  classPerformance.map((entry) => (
                    <div
                      key={entry.className}
                      className="flex items-center justify-between gap-4 rounded-[22px] border border-black/5 bg-white px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{entry.className}</p>
                        <p className="text-sm text-muted-foreground">{entry.orderCount} orders</p>
                      </div>
                      <p className="text-sm font-medium text-foreground">{formatCurrency(entry.revenue)}</p>
                    </div>
                  ))
                ) : (
                  <SectionEmpty
                    title="No Class Insights Yet"
                    description="Class-level performance will appear here once school orders are available."
                  />
                )}
              </CardContent>
            </Card>

            <Card className={portalPanelClassName}>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  Low Stock Alert
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboardLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-16 rounded-[20px] border border-border/60 bg-stone-50/80 animate-pulse" />
                  ))
                ) : portalData?.lowStockItems.length ? (
                  portalData.lowStockItems.slice(0, 6).map((item) => (
                    <div
                      key={item.variantId}
                      className="flex items-center justify-between gap-4 rounded-[22px] border border-amber-100 bg-amber-50/70 px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                        <p className="text-sm text-muted-foreground">Variant {item.variantLabel}</p>
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-sm text-amber-700">
                        <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
                        {item.remainingStock} left
                      </div>
                    </div>
                  ))
                ) : (
                  <SectionEmpty
                    title="Stock Looks Healthy"
                    description="Low-stock product variants will appear here when inventory drops below threshold."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className={portalPanelClassName}>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  Student Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboardLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-16 rounded-[20px] border border-border/60 bg-stone-50/80 animate-pulse" />
                  ))
                ) : studentInsights.length ? (
                  studentInsights.map((entry) => (
                    <div
                      key={`${entry.studentName}-${entry.className}`}
                      className="flex items-center justify-between gap-4 rounded-[22px] border border-black/5 bg-stone-50/80 px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{entry.studentName}</p>
                        <p className="text-sm text-muted-foreground">{entry.className}</p>
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-foreground">
                        <Users className="h-4 w-4" strokeWidth={1.5} />
                        {entry.orderCount} orders
                      </div>
                    </div>
                  ))
                ) : (
                  <SectionEmpty
                    title="No Student Trends Yet"
                    description="Student ordering patterns will appear here once named orders are available."
                  />
                )}
              </CardContent>
            </Card>

            <Card className={portalPanelClassName}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                    Recent Orders
                  </CardTitle>
                  <p className="mt-2 text-sm text-muted-foreground">Latest five orders for this school.</p>
                </div>
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto rounded-full px-0 text-[11px] uppercase tracking-[0.22em] text-foreground hover:bg-transparent hover:text-foreground"
                >
                  <Link to="/school/orders">
                    View All Orders
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboardLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-20 rounded-[20px] border border-border/60 bg-stone-50/80 animate-pulse" />
                  ))
                ) : recentOrders.length ? (
                  recentOrders.map((order: SchoolPortalOrder) => (
                    <div
                      key={order.id}
                      className="flex flex-col gap-3 rounded-[22px] border border-black/5 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{order.customer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.resolvedStudentName || "Student details unavailable"}
                          {order.resolvedClass && order.resolvedClass !== "Unassigned" ? ` · ${order.resolvedClass}` : ""}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {formatShortDate(order.created_at)}
                        </p>
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
                  <SectionEmpty
                    title="No Recent Orders"
                    description="Recent school orders will appear here as soon as new transactions are placed."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PortalShell>
  );
};

export default SchoolDashboard;
