import { useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type OrderStatus = "PLACED" | "ASSIGNED" | "PACKED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";

const ORDER_STATUSES: OrderStatus[] = ["PLACED", "ASSIGNED", "PACKED", "DISPATCHED", "DELIVERED", "CANCELLED"];

const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "Placed",
  ASSIGNED: "Assigned",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const normalizeOrderStatus = (value: string | null | undefined): OrderStatus => {
  const status = String(value ?? "").toUpperCase();
  switch (status) {
    case "PLACED":
    case "ASSIGNED":
    case "PACKED":
    case "DISPATCHED":
    case "DELIVERED":
    case "CANCELLED":
      return status;
    case "PENDING":
      return "PLACED";
    case "CONFIRMED":
      return "ASSIGNED";
    case "SHIPPED":
      return "DISPATCHED";
    default:
      return "PLACED";
  }
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

const BranchDashboardPage = () => {
  const { user, role, loading } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["branch-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, branch_id")
        .eq("id", user!.id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const branchId = profile?.branch_id ?? null;

  const { data: branch } = useQuery({
    queryKey: ["branch-meta", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, location, is_active")
        .eq("id", branchId!)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["branch-orders", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, total_amount, created_at, status")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: inventory } = useQuery({
    queryKey: ["branch-inventory", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_inventory")
        .select("id, stock, updated_at, product_id, variant_id, product_variants(size, low_stock_threshold, products(name))")
        .eq("branch_id", branchId!)
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const allOrders = orders ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = allOrders.filter((order: any) => new Date(order.created_at) >= today).length;
    const pendingDispatch = allOrders.filter((order: any) => {
      const status = normalizeOrderStatus(order.status);
      return status !== "DELIVERED" && status !== "CANCELLED";
    }).length;
    const revenue = allOrders
      .filter((order: any) => normalizeOrderStatus(order.status) !== "CANCELLED")
      .reduce((sum: number, order: any) => sum + Number(order.total_amount || 0), 0);

    const lowStock = (inventory ?? []).filter((row: any) => {
      const threshold = Number(row.product_variants?.low_stock_threshold ?? 5);
      return Number(row.stock ?? 0) < threshold;
    }).length;

    return { todayOrders, pendingDispatch, revenue, lowStock };
  }, [orders, inventory]);

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    if (!branchId) return;

    const patch: Record<string, any> = { status };
    const now = new Date().toISOString();
    if (status === "ASSIGNED") patch.assigned_at = now;
    if (status === "PACKED") patch.packed_at = now;
    if (status === "DISPATCHED") patch.dispatched_at = now;
    if (status === "DELIVERED") patch.delivered_at = now;

    const { error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .eq("branch_id", branchId);

    if (error) {
      toast.error("Failed to update order status");
      return;
    }

    toast.success("Order status updated");
    queryClient.invalidateQueries({ queryKey: ["branch-orders", branchId] });
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!user) return <Navigate to="/admin/login" replace />;
  if (role !== "branch_staff" && role !== "admin" && role !== "super_admin") return <Navigate to="/" replace />;

  if (!branchId) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-4">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Branch Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your profile is not mapped to any branch yet. Please contact admin.</p>
        <Link to="/pos">
          <Button variant="outline" className="text-xs tracking-[0.18em] uppercase">Open POS</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-light tracking-[0.1em] uppercase">Branch Dashboard</h1>
          <p className="text-xs text-muted-foreground tracking-wide uppercase mt-1">
            {branch?.name} · {branch?.location}
          </p>
        </div>
        <Link to="/pos">
          <Button className="text-xs tracking-[0.18em] uppercase">Open POS</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Today&apos;s Orders</CardTitle></CardHeader><CardContent><p className="text-3xl font-light">{stats.todayOrders}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Pending Dispatch</CardTitle></CardHeader><CardContent><p className="text-3xl font-light">{stats.pendingDispatch}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Revenue</CardTitle></CardHeader><CardContent><p className="text-3xl font-light">{formatCurrency(stats.revenue)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Low Stock Alerts</CardTitle></CardHeader><CardContent><p className="text-3xl font-light">{stats.lowStock}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-light tracking-[0.12em] uppercase">Assigned Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Order</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Customer</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Amount</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No assigned orders</TableCell>
                </TableRow>
              ) : (
                (orders ?? []).map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell className="text-sm">{order.customer_name}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(order.total_amount)}</TableCell>
                    <TableCell>
                      <Select
                        value={normalizeOrderStatus(order.status)}
                        onValueChange={(value) => updateOrderStatus(order.id, value as OrderStatus)}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDER_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-light tracking-[0.12em] uppercase">Branch Inventory</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Product</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Size</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Stock</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(inventory ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No inventory found for this branch</TableCell>
                </TableRow>
              ) : (
                (inventory ?? []).map((row: any) => {
                  const threshold = Number(row.product_variants?.low_stock_threshold ?? 5);
                  const stock = Number(row.stock ?? 0);
                  const low = stock < threshold;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm">{row.product_variants?.products?.name || "Product"}</TableCell>
                      <TableCell className="text-sm">{row.product_variants?.size || "default"}</TableCell>
                      <TableCell className="text-sm font-medium">{stock}</TableCell>
                      <TableCell className={`text-xs uppercase tracking-wider ${low ? "text-destructive" : "text-muted-foreground"}`}>
                        {stock === 0 ? "out of stock" : low ? "low stock" : "in stock"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(row.updated_at).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default BranchDashboardPage;
