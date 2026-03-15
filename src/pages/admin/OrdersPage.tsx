import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUpDown, ArrowUp, ArrowDown, LayoutList, Group } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity-log";

type SortDir = "asc" | "desc" | null;
type OrderStatus = "pending" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled";

const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"];

const STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  pending: "bg-gray-200 text-gray-900 border-transparent",
  confirmed: "bg-blue-200 text-blue-900 border-transparent",
  packed: "bg-yellow-200 text-yellow-900 border-transparent",
  shipped: "bg-purple-200 text-purple-900 border-transparent",
  delivered: "bg-green-200 text-green-900 border-transparent",
  cancelled: "bg-red-200 text-red-900 border-transparent",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const TIMELINE_EVENT_LABELS: Record<string, string> = {
  ORDER_PLACED: "Order Placed",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  NOTE_ADDED: "Note Added",
};

const isOrderStatus = (value: string): value is OrderStatus =>
  ORDER_STATUSES.includes(value as OrderStatus);

const OrderStatusBadge = ({ status }: { status: string }) => {
  const normalizedStatus: OrderStatus = isOrderStatus(status) ? status : "pending";
  return <Badge className={STATUS_BADGE_CLASSES[normalizedStatus]}>{STATUS_LABELS[normalizedStatus]}</Badge>;
};

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

const matchesDateFilter = (createdAt: string, dateFilter: string) => {
  if (dateFilter === "all") return true;

  const createdDate = new Date(createdAt);
  const now = new Date();

  if (dateFilter === "today") {
    return createdDate.toDateString() === now.toDateString();
  }

  const days = dateFilter === "7days" ? 7 : dateFilter === "30days" ? 30 : null;
  if (!days) return true;

  const threshold = new Date(now);
  threshold.setDate(now.getDate() - days);
  return createdDate >= threshold;
};

const OrdersPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [schoolSort, setSchoolSort] = useState<SortDir>(null);
  const [groupBySchool, setGroupBySchool] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState<OrderStatus | null>(null);
  const [bulkActionLabel, setBulkActionLabel] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

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

  useEffect(() => {
    const search = searchParams.get("search");
    if (search) setSearchQuery(search);
  }, [searchParams]);

  useEffect(() => {
    if (orderId) setSelectedOrder(orderId);
  }, [orderId]);

  const { data: orderMeta } = useQuery({
    queryKey: ["order-meta", selectedOrder],
    enabled: !!selectedOrder,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_timeline(id, event_type, description, created_at, created_by), order_notes(id, note, created_at, created_by)")
        .eq("id", selectedOrder!)
        .order("created_at", { foreignTable: "order_timeline", ascending: false })
        .order("created_at", { foreignTable: "order_notes", ascending: false })
        .limit(50, { foreignTable: "order_timeline" })
        .limit(50, { foreignTable: "order_notes" })
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Filter & sort
  const processedOrders = useMemo(() => {
    if (!orders) return [];
    let filtered = orders as any[];
    const normalizedSearch = searchQuery.trim().toLowerCase();

    if (schoolFilter !== "all") {
      filtered = filtered.filter((order) => {
        const items = order.order_items || [];
        return order.school_id === schoolFilter || items.some((i: any) => i.products?.school_id === schoolFilter);
      });
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    if (normalizedSearch) {
      filtered = filtered.filter((order) => {
        const customerName = (order.customer_name || "").toLowerCase();
        const phone = order.phone || "";
        return customerName.includes(normalizedSearch) || phone.includes(searchQuery.trim());
      });
    }

    filtered = filtered.filter((order) => matchesDateFilter(order.created_at, dateFilter));

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
  }, [orders, schoolFilter, statusFilter, searchQuery, dateFilter, schoolSort]);

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

  const updateOrderStatus = async (orderId: string, status: string) => {
    if (!isOrderStatus(status)) {
      toast.error("Invalid order status");
      return;
    }

    let { error } = await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error?.message?.toLowerCase().includes("updated_at")) {
      const retry = await supabase.from("orders").update({ status }).eq("id", orderId);
      error = retry.error;
    }

    if (error) {
      toast.error("Failed to update status");
    } else {
      await logActivity({
        actionType: status === "cancelled" ? "ORDER_CANCELLED" : "ORDER_STATUS_UPDATED",
        entityType: "order",
        entityId: orderId,
        description: `Order #${orderId.slice(0, 8).toUpperCase()} marked as ${status.toUpperCase()}`,
        performedBy: user?.id,
      });
      toast.success("Order status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-all-orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-meta", orderId] });
    }
  };

  const allVisibleIds = processedOrders.map((o) => o.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(Array.from(new Set([...selectedIds, ...allVisibleIds])));
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => !allVisibleIds.includes(id)));
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
  };

  const askBulkStatusChange = (status: OrderStatus, label: string) => {
    setBulkStatusTarget(status);
    setBulkActionLabel(label);
    setBulkConfirmOpen(true);
  };

  const runBulkStatusChange = async () => {
    if (!bulkStatusTarget || selectedIds.length === 0) return;

    let { error } = await supabase
      .from("orders")
      .update({ status: bulkStatusTarget, updated_at: new Date().toISOString() })
      .in("id", selectedIds);

    if (error?.message?.toLowerCase().includes("updated_at")) {
      const retry = await supabase.from("orders").update({ status: bulkStatusTarget }).in("id", selectedIds);
      error = retry.error;
    }

    if (error) {
      toast.error("Bulk update failed");
      return;
    }

    toast.success(`Updated ${selectedIds.length} orders`);
    setSelectedIds([]);
    setBulkConfirmOpen(false);
    setBulkStatusTarget(null);
    queryClient.invalidateQueries({ queryKey: ["admin-all-orders"] });
  };

  const exportSelectedOrders = () => {
    const selectedOrders = (orders as any[] | undefined)?.filter((o) => selectedIds.includes(o.id)) ?? [];
    if (selectedOrders.length === 0) return;

    const header = ["Order ID", "Customer", "Phone", "School", "Items", "Total", "Status", "Date"];
    const lines = selectedOrders.map((order) => {
      const row = [
        order.id,
        order.customer_name,
        order.phone,
        getOrderSchools(order).join(" | "),
        getItemSummary(order),
        order.total_amount,
        order.status,
        order.created_at,
      ];
      return row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    });

    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addNote = async () => {
    if (!selectedOrder || !noteInput.trim()) return;

    const { error } = await supabase.from("order_notes").insert({
      order_id: selectedOrder,
      note: noteInput.trim(),
    });

    if (error) {
      toast.error("Failed to add note");
      return;
    }

    setNoteInput("");
    toast.success("Note added");
    queryClient.invalidateQueries({ queryKey: ["order-meta", selectedOrder] });
  };

  const saveEditedNote = async () => {
    if (!editingNoteId || !editingNoteText.trim()) return;

    const { error } = await supabase
      .from("order_notes")
      .update({ note: editingNoteText.trim() })
      .eq("id", editingNoteId);

    if (error) {
      toast.error("Failed to update note");
      return;
    }

    toast.success("Note updated");
    setEditingNoteId(null);
    setEditingNoteText("");
    if (selectedOrder) queryClient.invalidateQueries({ queryKey: ["order-meta", selectedOrder] });
  };

  const deleteNote = async (noteId: string) => {
    const { error } = await supabase.from("order_notes").delete().eq("id", noteId);

    if (error) {
      toast.error("Failed to delete note");
      return;
    }

    toast.success("Note deleted");
    if (selectedOrder) queryClient.invalidateQueries({ queryKey: ["order-meta", selectedOrder] });
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
        <TableCell>
          <Checkbox
            checked={selectedIds.includes(order.id)}
            onCheckedChange={(value) => toggleSelectOne(order.id, Boolean(value))}
            aria-label={`Select order ${order.id}`}
          />
        </TableCell>
        <TableCell className="text-xs font-mono">{order.id.slice(0, 8).toUpperCase()}</TableCell>
        <TableCell className="text-sm">{order.customer_name}</TableCell>
        <TableCell className="text-sm">{schoolNames.join(", ") || "—"}</TableCell>
        <TableCell className="text-sm max-w-[200px] truncate" title={itemSummary}>
          {itemSummary || "—"}
        </TableCell>
        <TableCell className="text-sm">{formatPrice(order.total_amount)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <Select
              value={isOrderStatus(order.status) ? order.status : "pending"}
              onValueChange={(value) => updateOrderStatus(order.id, value)}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {new Date(order.created_at).toLocaleDateString()}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setSelectedOrder(order.id)}>
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => navigate(`/admin/orders/${order.id}/invoice`)}
            >
              Download Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => navigate(`/admin/orders/${order.id}/invoice?autoprint=1`)}
            >
              Print Invoice
            </Button>
          </div>
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
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
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

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-9 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {ORDER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Date</span>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-40 h-9 text-xs">
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name or phone"
            className="h-9 lg:max-w-xs text-sm"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">School</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={toggleSchoolSort}
            >
              <span className="flex items-center gap-1">
                Sort <SortIcon className="h-3 w-3" />
              </span>
            </Button>
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
      </div>

      {/* Orders Table */}
      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) => toggleSelectAll(Boolean(value))}
                  aria-label="Select all orders"
                />
              </TableHead>
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
                <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : processedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">No orders found</TableCell>
              </TableRow>
            ) : groupBySchool && groupedOrders ? (
              groupedOrders.map(([schoolName, schoolOrders]) => (
                <>
                  <TableRow key={`group-${schoolName}`}>
                    <TableCell
                      colSpan={9}
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

      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-black text-white rounded-lg px-4 py-3 shadow-lg flex flex-wrap items-center gap-2">
          <span className="text-xs tracking-wide mr-2">{selectedIds.length} items selected</span>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => askBulkStatusChange("confirmed", "Mark as Confirmed")}>Mark Confirmed</Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => askBulkStatusChange("packed", "Mark as Packed")}>Mark Packed</Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => askBulkStatusChange("shipped", "Mark as Shipped")}>Mark Shipped</Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => askBulkStatusChange("delivered", "Mark as Delivered")}>Mark Delivered</Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => askBulkStatusChange("cancelled", "Cancel Orders")}>Cancel Orders</Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={exportSelectedOrders}>Export Selected</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-white hover:text-white" onClick={() => setSelectedIds([])}>Clear</Button>
        </div>
      )}

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkActionLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to apply this action to {selectedIds.length} selected orders?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBulkStatusChange}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="w-[min(92vw,1100px)] max-w-4xl max-h-[88vh] overflow-hidden p-0" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase px-6 pt-6">
              Order {selected?.id.slice(0, 8).toUpperCase()}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground px-6 pb-2">
              Order information, lifecycle timeline, and internal admin notes.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-6 px-6 pb-6 overflow-y-auto max-h-[calc(88vh-88px)]">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Status</p>
                <OrderStatusBadge status={selected.status} />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Customer</p>
                  <p>{selected.customer_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Phone</p>
                  <p>{selected.phone}</p>
                </div>
                {(selected as any).email && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Email</p>
                    <p>{(selected as any).email}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Delivery Address</p>
                  <p>
                    {[selected.address, selected.city, selected.pincode]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
                  <h3 className="text-lg font-semibold">Order Timeline</h3>
                  <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                    {(orderMeta as any)?.order_timeline
                      ?.slice()
                      .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))
                      .slice(0, 50)
                      .map((event: any, index: number, arr: any[]) => (
                        <div key={event.id} className="relative pl-6">
                          {index < arr.length - 1 && (
                            <span className="absolute left-[8px] top-4 h-[calc(100%+8px)] w-px bg-border" />
                          )}
                          <span className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 ${
                            ["ORDER_PLACED", "PAYMENT_CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "NOTE_ADDED"].includes(event.event_type)
                              ? "bg-green-500 border-green-500"
                              : "bg-gray-300 border-gray-300"
                          }`} />
                          <p className="text-sm font-medium">
                            {TIMELINE_EVENT_LABELS[event.event_type] ?? event.event_type.replaceAll("_", " ")}
                          </p>
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(event.created_at).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ))}
                    {!((orderMeta as any)?.order_timeline?.length > 0) && (
                      <p className="text-sm text-muted-foreground">No timeline events yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
                  <h3 className="text-lg font-semibold">Order Notes</h3>

                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add internal note..."
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      className="min-h-[88px]"
                    />
                    <Button size="sm" onClick={addNote}>Add Note</Button>
                  </div>

                  <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                    {(orderMeta as any)?.order_notes
                      ?.slice()
                      .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))
                      .slice(0, 50)
                      .map((note: any) => (
                        <div key={note.id} className="rounded-lg border p-3 space-y-2">
                          {editingNoteId === note.id ? (
                            <>
                              <Textarea
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                className="min-h-[80px]"
                              />
                              <div className="flex items-center gap-2">
                                <Button size="sm" onClick={saveEditedNote}>Save</Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditingNoteText("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-sm">{note.note}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(note.created_at).toLocaleString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingNoteId(note.id);
                                    setEditingNoteText(note.note);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => deleteNote(note.id)}>
                                  Delete
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    {!((orderMeta as any)?.order_notes?.length > 0) && (
                      <p className="text-sm text-muted-foreground">No notes yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
