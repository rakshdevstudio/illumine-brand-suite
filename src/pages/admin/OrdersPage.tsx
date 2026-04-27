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

type OrderStatus = "PLACED" | "PACKED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
type OrderSource = "online" | "offline";

// ---------------------------------------------------------------------------
// Source detection
// ---------------------------------------------------------------------------

/**
 * Determines whether an order was placed online (ecommerce website) or
 * offline (POS / in-store). Uses real database metadata — NOT customer name —
 * as the primary signal so that POS orders with typed customer names are
 * correctly classified as Offline.
 *
 * Priority chain:
 *  1. Explicit source/channel fields if they ever get populated
 *  2. payment_mode column (most reliable existing signal):
 *       ONLINE  → website ecommerce checkout  → Online
 *       CASH / UPI / CARD / BANK_TRANSFER     → POS / in-store → Offline
 *  3. order_notes array — POS app writes "Order Source: POS" into notes
 *  4. Last resort only: customer_name heuristic for truly ambiguous legacy rows
 *
 * Analytics note: returns "online" | "offline" for easy grouping in dashboards.
 */
const getOrderSource = (order: any): OrderSource => {
  // ── 1. Explicit channel/source fields (future-proof) ──────────────────────
  const channelFields = [
    order.source,
    order.order_channel,
    order.channel,
    order.created_from,
    order.created_via,
    order.platform,
    order.customer_type,
  ];

  const OFFLINE_CHANNEL_KW = ["pos", "offline", "walk_in", "walkin", "store", "counter"];
  const ONLINE_CHANNEL_KW  = ["web", "ecommerce", "online", "website", "storefront"];

  for (const field of channelFields) {
    if (!field) continue;
    const norm = String(field).toLowerCase().replace(/[^a-z_]/g, "");
    if (OFFLINE_CHANNEL_KW.some((k) => norm.includes(k))) {
      console.debug("[OrderSource]", order.id, "| field:", field, "→ offline");
      return "offline";
    }
    if (ONLINE_CHANNEL_KW.some((k) => norm.includes(k))) {
      console.debug("[OrderSource]", order.id, "| field:", field, "→ online");
      return "online";
    }
  }

  // ── 2. payment_mode (most reliable column that actually exists) ────────────
  //   Website ecommerce checkout always sets payment_mode = 'ONLINE'.
  //   POS always uses a physical mode: CASH, UPI, CARD, BANK_TRANSFER.
  const pm = (order.payment_mode || "").toUpperCase();
  if (pm === "ONLINE") {
    console.debug("[OrderSource]", order.id, "| payment_mode:", pm, "→ online");
    return "online";
  }
  if (["CASH", "UPI", "CARD", "BANK_TRANSFER"].includes(pm)) {
    console.debug("[OrderSource]", order.id, "| payment_mode:", pm, "→ offline");
    return "offline";
  }

  // ── 3. order_notes — POS writes "Order Source: POS" into notes ────────────
  //   Available when the notes array is hydrated (e.g. from order-meta query
  //   or when the main orders query joins order_notes).
  const notes: Array<{ note?: string | null }> = order.order_notes || [];
  for (const n of notes) {
    const text = (n.note || "").toLowerCase();
    if (text.includes("order source: pos") || text.includes("source: pos")) {
      console.debug("[OrderSource]", order.id, "| note hint → offline");
      return "offline";
    }
    if (text.includes("order source: online") || text.includes("order source: web")) {
      console.debug("[OrderSource]", order.id, "| note hint → online");
      return "online";
    }
  }

  // ── 4. Last resort: customer name (only for truly ambiguous legacy rows) ───
  const customerName = (order.customer_name || "").toLowerCase();
  if (
    customerName === "walk-in customer" ||
    customerName === "walk in customer" ||
    customerName === "walkin" ||
    customerName === "walkin customer"
  ) {
    console.debug("[OrderSource]", order.id, "| customer name fallback → offline");
    return "offline";
  }

  // Default: assume Online for old ecommerce records with no metadata
  console.debug("[OrderSource]", order.id, "| pm:", pm || "null", "→ online (default)");
  return "online";
};

const SourceBadge = ({ source }: { source: OrderSource }) => {
  if (source === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Online
    </span>
  );
};

const ORDER_STATUSES: OrderStatus[] = ["PLACED", "PACKED", "DISPATCHED", "DELIVERED", "CANCELLED"];

const STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  PLACED: "bg-gray-200 text-gray-900 border-transparent",
  PACKED: "bg-yellow-200 text-yellow-900 border-transparent",
  DISPATCHED: "bg-purple-200 text-purple-900 border-transparent",
  DELIVERED: "bg-green-200 text-green-900 border-transparent",
  CANCELLED: "bg-red-200 text-red-900 border-transparent",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "Placed",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const TIMELINE_EVENT_LABELS: Record<string, string> = {
  ORDER_PLACED: "Order Placed",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  NOTE_ADDED: "Note Added",
};

const isOrderStatus = (value: string): value is OrderStatus => ORDER_STATUSES.includes(value as OrderStatus);

const normalizeOrderStatus = (value: string | null | undefined): OrderStatus => {
  const status = String(value ?? "").toUpperCase();
  switch (status) {
    case "PLACED":
    case "PACKED":
    case "DISPATCHED":
    case "DELIVERED":
    case "CANCELLED":
      return status;
    case "PENDING":
      return "PLACED";
    case "CONFIRMED":
      return "PACKED";
    case "SHIPPED":
      return "DISPATCHED";
    default:
      return "PLACED";
  }
};

const toDbOrderUpdate = (status: OrderStatus): Record<string, any> => {
  const now = new Date().toISOString();
  switch (status) {
    case "PACKED":
      return { status, packed_at: now };
    case "DISPATCHED":
      return { status, dispatched_at: now };
    case "DELIVERED":
      return { status, delivered_at: now };
    case "CANCELLED":
    case "PLACED":
    default:
      return { status };
  }
};

const toLegacyOrderUpdate = (status: OrderStatus): { status: string; dispatch_status: string } => {
  switch (status) {
    case "PACKED":
      return { status: "packed", dispatch_status: "packed" };
    case "DISPATCHED":
      return { status: "shipped", dispatch_status: "dispatched" };
    case "DELIVERED":
      return { status: "delivered", dispatch_status: "delivered" };
    case "CANCELLED":
      return { status: "cancelled", dispatch_status: "pending" };
    case "PLACED":
    default:
      return { status: "pending", dispatch_status: "pending" };
  }
};

const shouldTryLegacyFallback = (error: { message?: string; code?: string; status?: number } | null | undefined) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "PGRST204" ||
    message.includes("packed_at") ||
    message.includes("dispatched_at") ||
    message.includes("delivered_at") ||
    message.includes("order_lifecycle_status")
  );
};

const summarizeSupabaseError = (error: { message?: string; code?: string; details?: string } | null | undefined) => {
  if (!error) return "Unknown error";
  const parts = [error.message, error.details, error.code].filter(Boolean);
  return parts.join(" · ");
};

const isDispatchStatusMissingError = (error: { message?: string; code?: string } | null | undefined) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.code === "PGRST204" && message.includes("dispatch_status");
};

const OrderStatusBadge = ({ status }: { status: string }) => {
  const normalizedStatus = normalizeOrderStatus(status);
  return <Badge className={STATUS_BADGE_CLASSES[normalizedStatus]}>{STATUS_LABELS[normalizedStatus]}</Badge>;
};

const getLifecycleAction = (status: OrderStatus) => {
  switch (status) {
    case "PLACED":
      return { next: "PACKED" as OrderStatus, label: "Mark Packed" };
    case "PACKED":
      return { next: "DISPATCHED" as OrderStatus, label: "Dispatch" };
    case "DISPATCHED":
      return { next: "DELIVERED" as OrderStatus, label: "Mark Delivered" };
    default:
      return null;
  }
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [noteInput, setNoteInput] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  const { data: orders, isLoading, error: ordersError } = useQuery({
    queryKey: ["admin-all-orders"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("*, order_items(*, products(name, school_id, schools(name)), product_variants(size))")
          // Single deterministic sort: newest created_at first.
          // Do NOT add a secondary UUID sort — UUID v4 ids have no time
          // relationship and would silently reorder same-second orders.
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Orders query failed:", error);
          throw error;
        }

        console.log("Orders loaded:", data?.length, "found");
        return data || [];
      } catch (err) {
        console.error("Unexpected error in orders query:", err);
        throw err;
      }
    },
    // Always consider data stale so new orders (from POS or website) surface
    // immediately on next window focus or component mount — no manual refresh needed.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
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

  // Filter & sort — always newest first regardless of which filter is active.
  const processedOrders = useMemo(() => {
    if (!orders) return [];
    let filtered = orders as any[];
    const normalizedSearch = searchQuery.trim().toLowerCase();

    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => normalizeOrderStatus(order.status) === statusFilter);
    }

    if (sourceFilter !== "all") {
      filtered = filtered.filter((order) => getOrderSource(order) === sourceFilter);
    }

    if (normalizedSearch) {
      filtered = filtered.filter((order) => {
        const customerName = (order.customer_name || "").toLowerCase();
        const phone = order.phone || "";
        return customerName.includes(normalizedSearch) || phone.includes(searchQuery.trim());
      });
    }

    filtered = filtered.filter((order) => matchesDateFilter(order.created_at, dateFilter));

    // Guarantee newest-first after filtering.
    // Rules:
    //   1. created_at DESC  — the real timestamp, same for POS and website
    //   2. updated_at DESC  — meaningful tie-breaker (later update = more recent)
    //   3. return 0         — for identical timestamps, let JS stable sort
    //                         preserve the DB-returned order unchanged.
    //                         Never use UUID string compare: UUID v4 is random
    //                         and would pin one source type above another.
    filtered = [...filtered].sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tB !== tA) return tB - tA;
      const uA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const uB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return uB - uA; // 0 when both are also equal → stable sort keeps DB order
    });

    return filtered;
  }, [orders, statusFilter, sourceFilter, searchQuery, dateFilter]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const updateOrderStatus = async (orderId: string, status: string) => {
    if (!isOrderStatus(status)) {
      toast.error("Invalid order status");
      return;
    }

    const payload = toDbOrderUpdate(status);
    const legacyPayload = toLegacyOrderUpdate(status);
    const now = new Date().toISOString();

    const lifecycleWithUpdatedAt = { ...payload, updated_at: now };
    const { updated_at: _ignoreUpdatedAt, ...lifecycleWithoutUpdatedAt } = lifecycleWithUpdatedAt;
    const statusOnlyWithUpdatedAt = { status, updated_at: now };
    const statusOnly = { status };

    const attemptPayloads: Array<Record<string, any>> = [
      lifecycleWithUpdatedAt,
      lifecycleWithoutUpdatedAt,
      statusOnlyWithUpdatedAt,
      statusOnly,
    ];

    let error: any = null;

    for (const attemptPayload of attemptPayloads) {
      const attempt = await (supabase as any)
        .from("orders")
        .update(attemptPayload)
        .eq("id", orderId);

      error = attempt.error;
      if (!error) break;
    }

    const originalError = error;

    if (error && shouldTryLegacyFallback(error as any)) {
      const legacyWithUpdatedAt = { ...legacyPayload, updated_at: now };
      const { updated_at: _legacyUpdatedAt, ...legacyWithoutUpdatedAt } = legacyWithUpdatedAt;

      const legacyAttempts = [legacyWithUpdatedAt, legacyWithoutUpdatedAt];

      for (const attemptPayload of legacyAttempts) {
        const legacyAttempt = await (supabase as any)
          .from("orders")
          .update(attemptPayload)
          .eq("id", orderId);

        error = legacyAttempt.error;
        if (!error) break;
        if (isDispatchStatusMissingError(error)) {
          error = originalError;
          break;
        }
      }
    }

    if (error) {
      toast.error(`Failed to update status: ${summarizeSupabaseError(error)}`);
    } else {
      await logActivity({
        actionType: status === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_STATUS_UPDATED",
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

  const exportSelectedOrders = () => {
    const selectedOrders = processedOrders;
    if (selectedOrders.length === 0) return;

    const header = ["Order ID", "Customer", "Phone", "School", "Items", "Total", "Status", "Source", "Date"];
    const lines = selectedOrders.map((order) => {
      const row = [
        order.id,
        order.customer_name,
        order.phone,
        getOrderSchools(order).join(" | "),
        getItemSummary(order),
        order.total_amount,
        normalizeOrderStatus(order.status),
        getOrderSource(order),
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
    const unifiedStatus = normalizeOrderStatus(order.status);
    const lifecycleAction = getLifecycleAction(unifiedStatus);
    const source = getOrderSource(order);

    return (
      <TableRow key={order.id}>
        <TableCell className="text-xs font-mono">{order.id.slice(0, 8).toUpperCase()}</TableCell>
        <TableCell className="text-sm">
          <div className="flex items-center gap-2">
            <span>{order.customer_name}</span>
          </div>
        </TableCell>
        <TableCell className="text-sm">{schoolNames.join(", ") || "—"}</TableCell>
        <TableCell>
          <SourceBadge source={source} />
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
            {lifecycleAction && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => updateOrderStatus(order.id, lifecycleAction.next)}
              >
                {lifecycleAction.label}
              </Button>
            )}
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
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Source</span>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="online">🟢 Online</SelectItem>
                <SelectItem value="offline">🟡 Offline</SelectItem>
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
              <TableHead className="text-xs tracking-wider uppercase">Source</TableHead>
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
                <TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : ordersError ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-sm text-red-600">
                  Error loading orders: {(ordersError as Error)?.message || "Unknown error"}
                </TableCell>
              </TableRow>
            ) : processedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">No orders found</TableCell>
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
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Status</p>
                  <OrderStatusBadge status={normalizeOrderStatus(selected.status)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Source</p>
                  <SourceBadge source={getOrderSource(selected)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Customer</p>
                  <p>{selected.customer_name}</p>
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
                            ["ORDER_PLACED", "PACKED", "DISPATCHED", "DELIVERED", "NOTE_ADDED"].includes(event.event_type)
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
