import { FormEvent, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

const STATUS_STEPS = ["pending", "confirmed", "packed", "shipped", "delivered"] as const;

const STATUS_LABELS: Record<(typeof STATUS_STEPS)[number], string> = {
  pending: "Order Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
};

const STATUS_INDEX: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  packed: 2,
  shipped: 3,
  delivered: 4,
};

const TrackOrderPage = () => {
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);

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

  const currentStatusIndex = order ? STATUS_INDEX[order.status] ?? 0 : 0;

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

    const { data, error: fetchError } = await supabase
      .from("orders")
      .select(
        "id, customer_name, phone, address, city, pincode, total_amount, status, created_at, order_items(quantity, price, product_variants(size, products(name)), products(name))"
      )
      .eq("id", trimmedOrderId)
      .eq("phone", trimmedPhone)
      .single();

    if (fetchError || !data) {
      setError("Order not found");
      setLoading(false);
      return;
    }

    setOrder(data as unknown as TrackedOrder);
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
                placeholder="Enter full order ID"
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
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-4">Order Status</p>
              <div className="space-y-2">
                {STATUS_STEPS.map((step, index) => {
                  const active = index <= currentStatusIndex;
                  return (
                    <div key={step} className="flex items-center gap-3 text-sm">
                      <span className={active ? "text-black" : "text-gray-300"}>{active ? "●" : "○"}</span>
                      <span className={active ? "text-foreground" : "text-muted-foreground"}>{STATUS_LABELS[step]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {order.status === "delivered" && (
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
