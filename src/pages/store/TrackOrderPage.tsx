import { FormEvent, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireSchoolId, useSchoolContext } from "@/lib/school-context";

type OrderItem = {
  quantity: number;
  price: number;
  product_variants: {
    size: string | null;
    products?: {
      name: string | null;
    } | null;
  } | null;
  products?: {
    name: string | null;
  } | null;
};

type TrackedOrder = {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  city: string | null;
  pincode: string | null;
  total_amount: number;
  status: string;
  created_at: string;
  order_items: OrderItem[];
  order_timeline?: {
    event_type: string;
    description: string;
    created_at: string;
  }[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const PUBLIC_TIMELINE_STEPS = [
  { key: "ORDER_PLACED", label: "Order Placed" },
  { key: "PACKED", label: "Packed" },
  { key: "DISPATCHED", label: "Dispatched" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

const STATUS_STEPS = ["PLACED", "PACKED", "DISPATCHED", "DELIVERED"] as const;

const STATUS_LABELS: Record<(typeof STATUS_STEPS)[number], string> = {
  PLACED: "Order Placed",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
};

const STATUS_INDEX: Record<string, number> = {
  PLACED: 0,
  PACKED: 1,
  DISPATCHED: 2,
  DELIVERED: 3,
};

const normalizeOrderStatus = (value: string | null | undefined) => {
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

const TrackOrderPage = () => {
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const school = useSchoolContext((s) => s.school);

  const subtotal = useMemo(
    () => (order?.order_items ?? []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
    [order]
  );

  const shipping = 0;
  const total = Number(order?.total_amount ?? subtotal + shipping);

  const deliveryAddress = useMemo(() => {
    if (!order) return "";
    return [order.address, order.city, order.pincode].filter(Boolean).join(", ");
  }, [order]);

  const currentStatusIndex = order ? STATUS_INDEX[normalizeOrderStatus(order.status)] ?? 0 : 0;

  const timelineByEvent = useMemo(() => {
    const map = new Map<string, { event_type: string; description: string; created_at: string }>();
    (order?.order_timeline ?? [])
      .filter((e) => e.event_type !== "NOTE_ADDED")
      .forEach((event) => {
        const normalizedEventType =
          event.event_type === "PAYMENT_CONFIRMED"
            ? "PACKED"
            : event.event_type === "SHIPPED"
              ? "DISPATCHED"
              : event.event_type;
        if (!map.has(normalizedEventType)) map.set(normalizedEventType, event);
      });
    return map;
  }, [order]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const trimmedOrderId = orderId.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedOrderId || !trimmedPhone) {
      setError("Please enter both Order ID and Phone Number.");
      setOrder(null);
      return;
    }

    setLoading(true);
    setError(null);
    setOrder(null);

    const schoolId = requireSchoolId();
    const SELECT_FIELDS = "id, customer_name, phone, address, city, pincode, total_amount, status, created_at, order_items(quantity, price, product_variants(size, products(name)), products(name)), order_timeline(event_type, description, created_at)";
    const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedOrderId);

    let matched: TrackedOrder | null = null;

    if (isFullUuid) {
      // Exact full UUID match
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(SELECT_FIELDS)
        .eq("id", trimmedOrderId)
        .eq("phone", trimmedPhone)
        .eq("school_id", schoolId)
        .single();
      if (!fetchError && data) matched = data as unknown as TrackedOrder;
    } else {
      // Short ID (e.g. ACA2FC89) — fetch by phone then match by UUID prefix client-side
      // UUID columns can't use ilike in PostgREST, so we filter in JS
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(SELECT_FIELDS)
        .eq("phone", trimmedPhone)
        .eq("school_id", schoolId);
      if (!fetchError && data) {
        const shortLower = trimmedOrderId.toLowerCase();
        matched = (data as unknown as TrackedOrder[]).find(
          (o) => o.id.replace(/-/g, "").startsWith(shortLower) ||
                 o.id.startsWith(shortLower) ||
                 o.id.slice(0, 8).toLowerCase() === shortLower
        ) ?? null;
      }
    }

    if (!matched) {
      setError("Order not found. Please check your Order ID and phone number.");
      setLoading(false);
      return;
    }

    setOrder(matched);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 md:py-16 space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-light tracking-wide">Track Your Order</h1>
        <p className="text-sm text-muted-foreground">Enter your order details to view real-time status.</p>
      </div>

      <section className="rounded-lg border bg-white shadow-sm p-6 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="track-order-id" className="text-sm text-muted-foreground">Order ID</label>
              <Input
                id="track-order-id"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                placeholder="e.g. ACA2FC89"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="track-order-phone" className="text-sm text-muted-foreground">Phone Number</label>
              <Input
                id="track-order-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Enter phone number"
                className="h-11"
              />
            </div>
          </div>

          <Button type="submit" className="h-11 px-8" disabled={loading}>
            {loading ? "Tracking..." : "Track Order"}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </section>

      {order && (
        <>
          <section className="rounded-lg border bg-white shadow-sm p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Order ID</p>
                <p className="text-sm mt-1 font-mono">{order.id}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Order Date</p>
                <p className="text-sm mt-1">{formatDate(order.created_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Customer Name</p>
                <p className="text-sm mt-1">{order.customer_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Delivery Address</p>
                <p className="text-sm mt-1">{deliveryAddress}</p>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-4">Timeline</p>
              <div className="space-y-4">
                {PUBLIC_TIMELINE_STEPS.map((step, index) => {
                  const event = timelineByEvent.get(step.key);
                  const active = Boolean(event) || index <= currentStatusIndex;
                  return (
                    <div key={step.key} className="relative pl-6">
                      {index < PUBLIC_TIMELINE_STEPS.length - 1 && (
                        <span className="absolute left-[7px] top-5 h-[calc(100%+8px)] w-px bg-border" />
                      )}
                      <span className={`absolute left-0 top-1 h-4 w-4 rounded-full border-2 ${
                        active ? "bg-green-500 border-green-500" : "bg-gray-300 border-gray-300"
                      }`} />
                      <p className={active ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>{step.label}</p>
                      {event && (
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(event.created_at)}</p>
                      )}
                      {event?.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                      )}
                    </div>
                  );
                })}

                {(timelineByEvent.get("CANCELLED") || timelineByEvent.get("REFUNDED")) && (
                  <div className="pt-2 border-t">
                    {["CANCELLED", "REFUNDED"].map((eventType) => {
                      const event = timelineByEvent.get(eventType);
                      if (!event) return null;
                      return (
                        <div key={eventType} className="flex items-start gap-3 text-sm mt-2">
                          <span className="text-red-500">●</span>
                          <div>
                            <p className="text-red-600">{eventType === "CANCELLED" ? "Cancelled" : "Refunded"}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {normalizeOrderStatus(order.status) === "DELIVERED" && (
              <p className="text-sm text-muted-foreground border-t pt-4">Thank you for shopping with Illume.</p>
            )}
          </section>

          <section className="rounded-lg border bg-white shadow-sm p-6 md:p-8 space-y-6">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Order Items</p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Product</th>
                    <th className="text-left py-2 font-medium">Size</th>
                    <th className="text-right py-2 font-medium">Quantity</th>
                    <th className="text-right py-2 font-medium">Price</th>
                    <th className="text-right py-2 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.order_items.map((item, index) => {
                    const qty = Number(item.quantity || 0);
                    const price = Number(item.price || 0);
                    const rowSubtotal = qty * price;
                    const productName = item.product_variants?.products?.name || item.products?.name || "Product";

                    return (
                      <tr key={`${productName}-${index}`} className="border-b last:border-0">
                        <td className="py-3">{productName}</td>
                        <td className="py-3">{item.product_variants?.size || "default"}</td>
                        <td className="py-3 text-right">{qty}</td>
                        <td className="py-3 text-right">{formatCurrency(price)}</td>
                        <td className="py-3 text-right">{formatCurrency(rowSubtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t pt-4 ml-auto w-full max-w-sm space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Shipping</span>
                <span>{formatCurrency(shipping)}</span>
              </div>
              <div className="flex items-center justify-between font-medium text-base pt-1">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-white shadow-sm p-6 md:p-8 space-y-2 text-sm">
            <p className="font-medium">Need help with your order?</p>
            <p>
              <a href="mailto:hello@illume.co.in" className="text-gray-500 hover:text-black transition-colors">
                hello@illume.co.in
              </a>
            </p>
            <p>
              <a
                href="https://www.illumeonline.in"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-black transition-colors"
              >
                www.illumeonline.in
              </a>
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default TrackOrderPage;
