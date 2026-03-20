import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity-log";

type OrderStatus = "pending" | "assigned" | "packed" | "dispatched" | "delivered" | "cancelled";

const ORDER_STATUSES: OrderStatus[] = ["pending", "assigned", "packed", "dispatched", "delivered", "cancelled"];

const STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  pending: "bg-gray-200 text-gray-900 border-transparent",
  assigned: "bg-blue-200 text-blue-900 border-transparent",
  packed: "bg-yellow-200 text-yellow-900 border-transparent",
  dispatched: "bg-purple-200 text-purple-900 border-transparent",
  delivered: "bg-green-200 text-green-900 border-transparent",
  cancelled: "bg-red-200 text-red-900 border-transparent",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  packed: "Packed",
  dispatched: "Dispatched",
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

const isOrderStatus = (value: string): value is OrderStatus => ORDER_STATUSES.includes(value as OrderStatus);

const getUnifiedOrderStatus = (order: any): OrderStatus => {
  const status = String(order?.status ?? "").toLowerCase();
  const dispatchStatus = String(order?.dispatch_status ?? "").toLowerCase();

  if (status === "cancelled") return "cancelled";
  if (status === "delivered" || dispatchStatus === "delivered") return "delivered";
  if (status === "shipped" || dispatchStatus === "dispatched") return "dispatched";
  if (status === "packed" || dispatchStatus === "packed") return "packed";
  if (status === "confirmed" || dispatchStatus === "assigned") return "assigned";
  return "pending";
};

const toDbOrderUpdate = (status: OrderStatus): { status: string; dispatch_status: string } => {
  switch (status) {
    case "assigned":
      return { status: "confirmed", dispatch_status: "assigned" };
    case "packed":
      return { status: "packed", dispatch_status: "packed" };
    case "dispatched":
      return { status: "shipped", dispatch_status: "dispatched" };
    case "delivered":
      return { status: "delivered", dispatch_status: "delivered" };
    case "cancelled":
      return { status: "cancelled", dispatch_status: "pending" };
    case "pending":
    default:
      return { status: "pending", dispatch_status: "pending" };
  }
};

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

const parseStudentFieldsFromNotes = (notes: Array<{ note?: string | null } | null | undefined> | undefined) => {
  const result = {
    studentName: "",
    grade: "",
    alternatePhone: "",
  };

  if (!notes?.length) return result;

  for (const entry of notes) {
    const note = entry?.note || "";
    if (!note) continue;

    const studentNameMatch = note.match(/Student Name:\s*(.+)/i);
    const gradeMatch = note.match(/Grade:\s*(.+)/i);
    const alternateMatch = note.match(/Alternate Phone:\s*(.+)/i);

    if (studentNameMatch?.[1] && !result.studentName) result.studentName = studentNameMatch[1].trim();
    if (gradeMatch?.[1] && !result.grade) result.grade = gradeMatch[1].trim();
    if (alternateMatch?.[1] && !result.alternatePhone) result.alternatePhone = alternateMatch[1].trim();

    if (result.studentName && result.grade && result.alternatePhone) break;
  }

  return result;
};

const OrdersPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gstFilter, setGstFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [noteInput, setNoteInput] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  const { data: branches } = useQuery({
    queryKey: ["admin-branches-filter"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("branches")
        .select("id, name, location, is_active")
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string; location: string | null; is_active: boolean }>;
    },
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-all-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, branches(name, location), order_items(*, products(name, school_id, schools(name)), product_variants(size))")
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

    if (branchFilter !== "all") {
      filtered = filtered.filter((order) => order.branch_id === branchFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => getUnifiedOrderStatus(order) === statusFilter);
    }

    if (gstFilter === "gst_only") {
      filtered = filtered.filter((order) => Boolean(order.is_gst_order));
    }

    if (normalizedSearch) {
      filtered = filtered.filter((order) => {
        const customerName = (order.customer_name || "").toLowerCase();
        const phone = order.phone || "";
        return customerName.includes(normalizedSearch) || phone.includes(searchQuery.trim());
      });
    }

    filtered = filtered.filter((order) => matchesDateFilter(order.created_at, dateFilter));

    return filtered;
  }, [orders, branchFilter, statusFilter, gstFilter, searchQuery, dateFilter]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const updateOrderStatus = async (orderId: string, status: string) => {
    if (!isOrderStatus(status)) {
      toast.error("Invalid order status");
      return;
    }

    const payload = toDbOrderUpdate(status);

    let { error } = await supabase
      .from("orders")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error?.message?.toLowerCase().includes("updated_at")) {
      const retry = await supabase.from("orders").update(payload).eq("id", orderId);
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

  const assignOrderBranch = async (orderId: string, branchId: string | null) => {
    let { error } = await (supabase as any)
      .from("orders")
      .update({ branch_id: branchId, dispatch_status: branchId ? "assigned" : "pending", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error?.message?.toLowerCase().includes("updated_at")) {
      const retry = await (supabase as any)
        .from("orders")
        .update({ branch_id: branchId, dispatch_status: branchId ? "assigned" : "pending" })
        .eq("id", orderId);
      error = retry.error;
    }

    if (error) {
      toast.error("Failed to assign branch");
      return;
    }

    toast.success(branchId ? "Branch assigned" : "Branch cleared");
    queryClient.invalidateQueries({ queryKey: ["admin-all-orders"] });
    queryClient.invalidateQueries({ queryKey: ["order-meta", orderId] });
  };

  const exportSelectedOrders = () => {
    const selectedOrders = processedOrders;
    if (selectedOrders.length === 0) return;

    const header = ["Order ID", "Customer", "Phone", "School", "Branch", "Items", "Total", "Status", "GST Order", "GST Number", "Date"];
    const lines = selectedOrders.map((order) => {
      const row = [
        order.id,
        order.customer_name,
        order.phone,
        getOrderSchools(order).join(" | "),
        order.branches?.name ?? "",
        getItemSummary(order),
        order.total_amount,
        getUnifiedOrderStatus(order),
        order.is_gst_order ? "Yes" : "No",
        order.gst_number ?? "",
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

  const selected = (orders as any[])?.find((o) => o.id === selectedOrder);
  const noteDerivedStudent = useMemo(
    () => parseStudentFieldsFromNotes((orderMeta as any)?.order_notes),
    [orderMeta]
  );

  const selectedStudentName = (selected as any)?.student_name || noteDerivedStudent.studentName || "-";
  const selectedGrade = (selected as any)?.grade || noteDerivedStudent.grade || "-";
  const selectedAlternatePhoneRaw = (selected as any)?.alternate_phone || noteDerivedStudent.alternatePhone || "";
  const selectedAlternatePhone = selectedAlternatePhoneRaw && selectedAlternatePhoneRaw !== "—" ? selectedAlternatePhoneRaw : "-";

  const renderOrderRow = (order: any) => {
    const schoolNames = getOrderSchools(order);
    const itemSummary = getItemSummary(order);
    const unifiedStatus = getUnifiedOrderStatus(order);
    const hasAssignedBranch = Boolean(order.branch_id);
    const branchValue = order.branch_id ?? "__unassigned__";

    return (
      <TableRow key={order.id}>
        <TableCell className="text-xs font-mono">{order.id.slice(0, 8).toUpperCase()}</TableCell>
        <TableCell className="text-sm">
          <div className="flex items-center gap-2">
            <span>{order.customer_name}</span>
            {order.is_gst_order && (
              <Badge className="bg-emerald-100 text-emerald-900 border-transparent">GST</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-sm">{schoolNames.join(", ") || "—"}</TableCell>
        <TableCell>
          <Select
            value={branchValue}
            onValueChange={(value) => assignOrderBranch(order.id, value === "__unassigned__" ? null : value)}
          >
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="Assign Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">Assign Branch</SelectItem>
              {(branches ?? []).map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="text-sm max-w-[200px] truncate" title={itemSummary}>
          {itemSummary || "—"}
        </TableCell>
        <TableCell className="text-sm">{formatPrice(order.total_amount)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={unifiedStatus} />
            <Select
              value={unifiedStatus}
              onValueChange={(value) => updateOrderStatus(order.id, value)}
              disabled={!hasAssignedBranch}
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

  return (
    <div>
      <h1 className="text-xl font-light tracking-[0.1em] uppercase mb-6">Orders</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Orders</p>
          <p className="text-2xl font-light">{orders?.length || 0}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
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
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Branch</span>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-52 h-9 text-xs">
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
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">GST</span>
            <Select value={gstFilter} onValueChange={setGstFilter}>
              <SelectTrigger className="w-44 h-9 text-xs">
                <SelectValue placeholder="All Orders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="gst_only">GST Orders Only</SelectItem>
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
          <Button variant="outline" size="sm" className="h-9 text-xs" onClick={exportSelectedOrders}>
            Export
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
              <TableHead className="text-xs tracking-wider uppercase">School</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Branch</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Items</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Amount</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Order Date</TableHead>
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
            ) : (
              processedOrders.map(renderOrderRow)
            )}
          </TableBody>
        </Table>
      </div>

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
                <OrderStatusBadge status={getUnifiedOrderStatus(selected)} />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Customer</p>
                  <p>{selected.customer_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Branch</p>
                  <p>{selected.branches?.name || "Unassigned"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Student Name</p>
                  <p>{selectedStudentName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Grade / Class</p>
                  <p>{selectedGrade}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Phone</p>
                  <p>{selected.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">GST</p>
                  <p>{selected.is_gst_order ? `GST Order${selected.gst_number ? ` · ${selected.gst_number}` : ""}` : "Non-GST Order"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Alternate Phone</p>
                  <p>{selectedAlternatePhone}</p>
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
