import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUpDown, ArrowUp, ArrowDown, LayoutList, Group } from "lucide-react";

type SortDir = "asc" | "desc" | null;

const getOrderSchools = (order: any): string[] => {
  const items = order.order_items || [];
  return [...new Set(items.map((i: any) => i.products?.schools?.name).filter(Boolean))] as string[];
};

const getItemSummary = (order: any): string => {
  const items = order.order_items || [];
  return items
    .map((i: any) => `${i.products?.name || "Item"} (${i.product_variants?.size || "—"}) ×${i.quantity}`)
    .join(", ");
};

const OrdersPage = () => {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [schoolSort, setSchoolSort] = useState<SortDir>(null);
  const [groupBySchool, setGroupBySchool] = useState(false);

  const { data: schools } = useQuery({
    queryKey: ["admin-schools-filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-all-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*, products(name, school_id, schools(name)), product_variants(size))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orderItems } = useQuery({
    queryKey: ["order-items", selectedOrder],
    enabled: !!selectedOrder,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*, products(name, schools(name)), product_variants(size)")
        .eq("order_id", selectedOrder!);
      if (error) throw error;
      return data;
    },
  });

  // Filter & sort
  const processedOrders = useMemo(() => {
    if (!orders) return [];
    let filtered = orders as any[];

    if (schoolFilter !== "all") {
      filtered = filtered.filter((order) => {
        const items = order.order_items || [];
        return items.some((i: any) => i.products?.school_id === schoolFilter);
      });
    }

    if (schoolSort) {
      filtered = [...filtered].sort((a, b) => {
        const aSchool = getOrderSchools(a)[0] || "";
        const bSchool = getOrderSchools(b)[0] || "";
        return schoolSort === "asc"
          ? aSchool.localeCompare(bSchool)
          : bSchool.localeCompare(aSchool);
      });
    }

    return filtered;
  }, [orders, schoolFilter, schoolSort]);

  // Summary counts
  const summaryCards = useMemo(() => {
    if (!orders) return [];
    const counts: Record<string, number> = {};
    (orders as any[]).forEach((order) => {
      getOrderSchools(order).forEach((s) => {
        counts[s] = (counts[s] || 0) + 1;
      });
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  }, [orders]);

  // Grouped orders
  const groupedOrders = useMemo(() => {
    if (!groupBySchool) return null;
    const groups: Record<string, any[]> = {};
    processedOrders.forEach((order) => {
      const schoolNames = getOrderSchools(order);
      const key = schoolNames.length > 0 ? schoolNames[0] : "Unknown School";
      if (!groups[key]) groups[key] = [];
      groups[key].push(order);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [processedOrders, groupBySchool]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const handleStatusChange = async (orderId: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-all-orders"] });
    }
  };

  const toggleSchoolSort = () => {
    setSchoolSort((prev) => (prev === null ? "asc" : prev === "asc" ? "desc" : null));
  };

  const selected = (orders as any[])?.find((o) => o.id === selectedOrder);

  const renderOrderRow = (order: any) => {
    const schoolNames = getOrderSchools(order);
    const itemSummary = getItemSummary(order);

    return (
      <TableRow key={order.id}>
        <TableCell className="text-xs font-mono">{order.id.slice(0, 8).toUpperCase()}</TableCell>
        <TableCell className="text-sm">{order.customer_name}</TableCell>
        <TableCell className="text-sm">{schoolNames.join(", ") || "—"}</TableCell>
        <TableCell className="text-sm max-w-[200px] truncate" title={itemSummary}>
          {itemSummary || "—"}
        </TableCell>
        <TableCell className="text-sm">{formatPrice(order.total_amount)}</TableCell>
        <TableCell>
          <Select value={order.status} onValueChange={(v) => handleStatusChange(order.id, v)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {new Date(order.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setSelectedOrder(order.id)}>
            View
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const SortIcon = schoolSort === "asc" ? ArrowUp : schoolSort === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <div>
      <h1 className="text-xl font-light tracking-[0.1em] uppercase mb-6">Orders</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Orders</p>
          <p className="text-2xl font-light">{orders?.length || 0}</p>
        </div>
        {summaryCards.map(([school, count]) => (
          <div key={school} className="border border-border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{school}</p>
            <p className="text-2xl font-light">{count}</p>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">School</span>
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-48 h-9 text-xs">
              <SelectValue placeholder="All Schools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Schools</SelectItem>
              {schools?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-1 border border-border">
          <Button
            variant={!groupBySchool ? "default" : "ghost"}
            size="sm"
            className="text-xs h-9 rounded-none gap-1"
            onClick={() => setGroupBySchool(false)}
          >
            <LayoutList className="h-3 w-3" /> Flat
          </Button>
          <Button
            variant={groupBySchool ? "default" : "ghost"}
            size="sm"
            className="text-xs h-9 rounded-none gap-1"
            onClick={() => setGroupBySchool(true)}
          >
            <Group className="h-3 w-3" /> Group by School
          </Button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">Order ID</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Customer</TableHead>
              <TableHead
                className="text-xs tracking-wider uppercase cursor-pointer select-none hover:text-foreground"
                onClick={toggleSchoolSort}
              >
                <span className="flex items-center gap-1">
                  School <SortIcon className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Items</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Amount</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Date</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : processedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">No orders found</TableCell>
              </TableRow>
            ) : groupBySchool && groupedOrders ? (
              groupedOrders.map(([schoolName, schoolOrders]) => (
                <>
                  <TableRow key={`group-${schoolName}`}>
                    <TableCell
                      colSpan={8}
                      className="bg-muted/30 text-xs font-medium tracking-[0.15em] uppercase py-3 border-b border-border"
                    >
                      {schoolName} — {schoolOrders.length} order{schoolOrders.length !== 1 ? "s" : ""}
                    </TableCell>
                  </TableRow>
                  {schoolOrders.map(renderOrderRow)}
                </>
              ))
            ) : (
              processedOrders.map(renderOrderRow)
            )}
          </TableBody>
        </Table>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">
              Order {selected?.id.slice(0, 8).toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Customer</p>
                  <p>{selected.customer_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Phone</p>
                  <p>{selected.phone}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Address</p>
                  <p>{selected.address}</p>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Items</p>
                {orderItems?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm py-2 border-b border-border last:border-0">
                    <div>
                      <span>{item.products?.name} (Size {item.product_variants?.size}) × {item.quantity}</span>
                      {item.products?.schools?.name && (
                        <p className="text-xs text-muted-foreground">{item.products.schools.name}</p>
                      )}
                    </div>
                    <span>{formatPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-xs tracking-wider uppercase">Total</span>
                <span className="text-lg font-light">{formatPrice(selected.total_amount)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
