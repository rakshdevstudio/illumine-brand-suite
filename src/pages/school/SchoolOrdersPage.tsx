import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { BadgeCheck, CalendarDays, Clock3, Download, Filter, IndianRupee, Search, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PortalEmptyState, PortalMetricCard, PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { ORDER_STATUS_STYLES, formatCurrency, useResolvedSchoolScope } from "@/lib/portal-dashboard";
import { fetchSchoolPortalData } from "@/lib/school-portal";
import { toast } from "sonner";

const ORDER_STATUS_OPTIONS = ["all", "pending", "confirmed", "packed", "shipped", "delivered", "cancelled"] as const;

const SectionEmpty = ({ title, description }: { title: string; description: string }) => (
  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[22px] border border-dashed border-black/10 bg-stone-50/70 px-6 py-10 text-center">
    <p className="text-sm font-medium uppercase tracking-[0.22em] text-foreground">{title}</p>
    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
  </div>
);

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatOrderCode = (value: string) => value.slice(0, 8).toUpperCase();

const formatStudentNameDisplay = (value: string | null | undefined) => value?.trim() || "-";

const formatStudentClassDisplay = (value: string | null | undefined) =>
  value && value !== "Unassigned" ? value : "-";

const formatAddressDisplay = (parts: Array<string | null | undefined>) => {
  const value = parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(", ");
  return value || "-";
};

const summarizeOrderItems = (order: {
  order_items: Array<{
    product?: { name?: string | null } | null;
    variant?: { size?: string | null } | null;
    quantity: number;
  }>;
}) =>
  order.order_items.length
    ? order.order_items
        .map((item) => `${item.product?.name ?? "Product"} (${item.variant?.size ?? "—"}) x${item.quantity}`)
        .join(" | ")
    : "-";

const toCsvValue = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

const orderMatchesDateRange = (orderDate: string, fromDate: string, toDate: string) => {
  const target = new Date(orderDate);

  if (fromDate) {
    const start = new Date(`${fromDate}T00:00:00`);
    if (target < start) return false;
  }

  if (toDate) {
    const end = new Date(`${toDate}T23:59:59.999`);
    if (target > end) return false;
  }

  return true;
};

const SchoolOrdersPage = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const {
    data: portalData,
    isLoading: ordersLoading,
    error: ordersError,
  } = useQuery({
    queryKey: ["school-portal", schoolId],
    enabled: !!schoolId && !!user && hasAccess && isSchoolUser && !scopeLoading,
    queryFn: () => fetchSchoolPortalData(schoolId!),
    staleTime: 30_000,
  });

  const allOrders = portalData?.orders ?? [];

  const classOptions = useMemo(() => {
    const derivedClasses = new Set(
      allOrders
        .map((order) => order.resolvedClass)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );

    (portalData?.classes ?? []).forEach((entry) => derivedClasses.add(entry.name));

    return [...derivedClasses].sort((a, b) => a.localeCompare(b));
  }, [allOrders, portalData?.classes]);

  const filteredOrders = useMemo(() => {
    const normalizedPhoneSearch = deferredSearch.replace(/\D/g, "");

    return allOrders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (classFilter !== "all" && order.resolvedClass !== classFilter) return false;
      if (!orderMatchesDateRange(order.created_at, fromDate, toDate)) return false;

      if (!deferredSearch) return true;

      const customerName = (order.customer_name ?? "").toLowerCase();
      const studentName = (order.resolvedStudentName ?? "").toLowerCase();
      const phone = (order.phone ?? "").replace(/\D/g, "");
      const alternatePhone = (order.resolvedAlternatePhone ?? "").replace(/\D/g, "");

      return (
        customerName.includes(deferredSearch) ||
        studentName.includes(deferredSearch) ||
        (normalizedPhoneSearch.length > 0 &&
          (phone.includes(normalizedPhoneSearch) || alternatePhone.includes(normalizedPhoneSearch)))
      );
    });
  }, [allOrders, classFilter, deferredSearch, fromDate, statusFilter, toDate]);

  const selectedOrder = useMemo(
    () => allOrders.find((order) => order.id === selectedOrderId) ?? null,
    [allOrders, selectedOrderId],
  );

  const summary = useMemo(() => ({
    totalOrders: filteredOrders.length,
    totalRevenue: filteredOrders
      .filter((order) => order.status !== "cancelled")
      .reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0),
    pendingCount: filteredOrders.filter((order) => order.status === "pending").length,
    deliveredCount: filteredOrders.filter((order) => order.status === "delivered").length,
  }), [filteredOrders]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setClassFilter("all");
    setFromDate("");
    setToDate("");
  };

  const downloadOrders = () => {
    if (!filteredOrders.length) {
      toast.error("There are no filtered orders to export.");
      return;
    }

    const headers = [
      "Order ID",
      "Customer Name",
      "Student Name",
      "Student Class",
      "Phone",
      "Alternate Phone",
      "Total Amount",
      "Status",
      "Created At",
      "Address",
      "Items",
    ];

    const csvRows = filteredOrders.map((order) => [
      formatOrderCode(order.id),
      order.customer_name,
      formatStudentNameDisplay(order.resolvedStudentName),
      formatStudentClassDisplay(order.resolvedClass),
      order.phone || "-",
      order.resolvedAlternatePhone || "-",
      Number(order.total_amount ?? 0),
      order.status,
      formatDateTime(order.created_at),
      formatAddressDisplay([order.address, order.city, order.pincode]),
      summarizeOrderItems(order),
    ]);

    const csv = [headers, ...csvRows]
      .map((row) => row.map(toCsvValue).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `school-orders-${scope?.school?.slug ?? "export"}-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Orders export downloaded.");
  };

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
      title="School Orders"
      subtitle={user.email ?? "School order management"}
      onSignOut={signOut}
      scopeLabel={scope?.school?.name ?? (schoolId ? "Assigned school" : scopeLoading ? "Resolving school" : "School not assigned")}
    >
      {!scopeLoading && !schoolId ? (
        <PortalEmptyState
          title="Please assign a school to this account"
          description="This school user does not have a resolved `school_id`. Add `school_id` on the user or metadata, or create a `user_school_map` entry."
        />
      ) : ordersError ? (
        <PortalEmptyState
          title="Unable to Load Orders"
          description={(ordersError as Error)?.message || "The school orders page could not load right now. Please try again."}
        />
      ) : (
        <>
          <Card className={portalPanelClassName}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                    Filters
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Search by customer, student, or phone. Narrow results by status, class, or order date.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm text-foreground">
                    {filteredOrders.length} of {allOrders.length} orders
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadOrders}
                    disabled={!filteredOrders.length}
                    className="h-11 rounded-full border-black/10 bg-white text-[11px] uppercase tracking-[0.22em]"
                  >
                    <Download className="h-4 w-4" strokeWidth={1.5} />
                    Download Orders
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="relative xl:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search customer, student, or phone"
                    className="h-11 rounded-full border-black/10 bg-white pl-10"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-11 rounded-full border-black/10 bg-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status === "all" ? "All statuses" : status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="h-11 rounded-full border-black/10 bg-white">
                    <SelectValue placeholder="Class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {classOptions.map((className) => (
                      <SelectItem key={className} value={className}>
                        {className}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="outline"
                  onClick={clearFilters}
                  className="h-11 rounded-full border-black/10 bg-white text-[11px] uppercase tracking-[0.22em]"
                >
                  Clear Filters
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">From Date</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="h-11 rounded-full border-black/10 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">To Date</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="h-11 rounded-full border-black/10 bg-white"
                  />
                </div>
                <div className="rounded-[22px] border border-black/5 bg-stone-50/80 px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Status Focus</p>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {statusFilter === "all" ? "All statuses" : statusFilter}
                  </p>
                </div>
                <div className="rounded-[22px] border border-black/5 bg-stone-50/80 px-4 py-4">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Class Focus</p>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {classFilter === "all" ? "All classes" : classFilter}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PortalMetricCard
              label="Total Orders"
              value={ordersLoading ? "..." : summary.totalOrders}
              icon={<ShoppingBag className="h-4 w-4" strokeWidth={1.5} />}
            />
            <PortalMetricCard
              label="Total Revenue"
              value={ordersLoading ? "..." : formatCurrency(summary.totalRevenue)}
              icon={<IndianRupee className="h-4 w-4" strokeWidth={1.5} />}
            />
            <PortalMetricCard
              label="Pending"
              value={ordersLoading ? "..." : summary.pendingCount}
              icon={<Clock3 className="h-4 w-4" strokeWidth={1.5} />}
            />
            <PortalMetricCard
              label="Delivered"
              value={ordersLoading ? "..." : summary.deliveredCount}
              icon={<BadgeCheck className="h-4 w-4" strokeWidth={1.5} />}
            />
          </div>

          <Card className={portalPanelClassName}>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  All Orders for This School
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  Click any row to inspect student, contact, item, and delivery details.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="h-14 rounded-[20px] border border-border/60 bg-stone-50/80 animate-pulse" />
                  ))}
                </div>
              ) : filteredOrders.length ? (
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow
                        key={order.id}
                        role="button"
                        aria-label={`Open order ${formatOrderCode(order.id)}`}
                        className="cursor-pointer transition-[background-color,box-shadow] duration-200 hover:bg-stone-50/90"
                        onClick={() => setSelectedOrderId(order.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedOrderId(order.id);
                          }
                        }}
                        tabIndex={0}
                      >
                        <TableCell className="font-medium text-foreground">#{formatOrderCode(order.id)}</TableCell>
                        <TableCell>{order.customer_name}</TableCell>
                        <TableCell>{formatStudentNameDisplay(order.resolvedStudentName)}</TableCell>
                        <TableCell>{formatStudentClassDisplay(order.resolvedClass)}</TableCell>
                        <TableCell>{order.phone}</TableCell>
                        <TableCell>{formatCurrency(Number(order.total_amount ?? 0))}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={ORDER_STATUS_STYLES[order.status] ?? "border-stone-200 bg-stone-100 text-stone-700"}
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(order.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <SectionEmpty
                  title="No Orders Match These Filters"
                  description="Try broadening your search or clearing one of the active filters."
                />
              )}
            </CardContent>
          </Card>

          <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
            <DialogContent className="w-[min(92vw,1100px)] max-w-4xl max-h-[88vh] overflow-hidden p-0" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle className="px-6 pt-6 text-sm font-light uppercase tracking-[0.24em]">
                  Order #{selectedOrder ? formatOrderCode(selectedOrder.id) : ""}
                </DialogTitle>
                <DialogDescription className="px-6 pb-2 text-xs text-muted-foreground">
                  Full school order details including student information, contact details, delivery address, and items.
                </DialogDescription>
              </DialogHeader>

              {selectedOrder ? (
                <div className="max-h-[calc(88vh-88px)] space-y-6 overflow-y-auto px-6 pb-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Badge
                      variant="outline"
                      className={ORDER_STATUS_STYLES[selectedOrder.status] ?? "border-stone-200 bg-stone-100 text-stone-700"}
                    >
                      {selectedOrder.status}
                    </Badge>
                    <p className="text-sm text-muted-foreground">{formatDateTime(selectedOrder.created_at)}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[22px] border border-black/5 bg-stone-50/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Customer Name</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{selectedOrder.customer_name}</p>
                    </div>
                    <div className="rounded-[22px] border border-black/5 bg-stone-50/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Student Name</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{formatStudentNameDisplay(selectedOrder.resolvedStudentName)}</p>
                    </div>
                    <div className="rounded-[22px] border border-black/5 bg-stone-50/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Class</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{formatStudentClassDisplay(selectedOrder.resolvedClass)}</p>
                    </div>
                    <div className="rounded-[22px] border border-black/5 bg-stone-50/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Phone</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{selectedOrder.phone}</p>
                    </div>
                    <div className="rounded-[22px] border border-black/5 bg-stone-50/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Alternate Phone</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{selectedOrder.resolvedAlternatePhone || "—"}</p>
                    </div>
                    <div className="rounded-[22px] border border-black/5 bg-stone-50/70 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Total Amount</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{formatCurrency(Number(selectedOrder.total_amount ?? 0))}</p>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-black/5 bg-white p-5">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Delivery Address</p>
                    <p className="mt-3 text-sm leading-6 text-foreground">
                      {formatAddressDisplay([selectedOrder.address, selectedOrder.city, selectedOrder.pincode])}
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-black/5 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Items</p>
                      <p className="text-sm text-muted-foreground">{selectedOrder.order_items.length} items</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedOrder.order_items.length ? (
                        selectedOrder.order_items.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col gap-3 rounded-[20px] border border-black/5 bg-stone-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{item.product?.name ?? "Product"}</p>
                              <p className="text-sm text-muted-foreground">
                                Variant {item.variant?.size ?? "—"} · Qty {item.quantity}
                              </p>
                            </div>
                            <p className="text-sm font-medium text-foreground">
                              {formatCurrency(Number(item.price ?? 0) * Number(item.quantity ?? 0))}
                            </p>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty
                          title="No Item Details"
                          description="Item details are unavailable for this order."
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      )}
    </PortalShell>
  );
};

export default SchoolOrdersPage;
