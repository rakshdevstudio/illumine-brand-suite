import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

type OrderItem = {
  id: string;
  quantity: number;
  price: number;
  products: {
    id: string;
    name: string;
    image_url: string | null;
    category: string;
  } | null;
  product_variants: {
    id: string;
    size: string;
  } | null;
};

type Order = {
  id: string;
  customer_name: string;
  phone: string;
  alternate_phone: string | null;
  student_name: string | null;
  grade: string | null;
  address: string;
  city: string | null;
  pincode: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  order_items: OrderItem[];
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const OrderDetailsPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("No order ID provided.");
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      setLoading(true);
      setError(null);

      const withStudentFields = `
          id,
          customer_name,
          phone,
          alternate_phone,
          student_name,
          grade,
          address,
          city,
          pincode,
          status,
          total_amount,
          created_at,
          order_items (
            id,
            quantity,
            price,
            products ( id, name, image_url, category ),
            product_variants ( id, size )
          )
        `;

      const legacyFields = `
          id,
          customer_name,
          phone,
          address,
          city,
          pincode,
          status,
          total_amount,
          created_at,
          order_items (
            id,
            quantity,
            price,
            products ( id, name, image_url, category ),
            product_variants ( id, size )
          )
        `;

      let { data, error: fetchErr } = await supabase
        .from("orders")
        .select(withStudentFields)
        .eq("id", orderId)
        .single();

      if (fetchErr?.code === "PGRST204") {
        const msg = (fetchErr.message || "").toLowerCase();
        const missingStudentCols =
          msg.includes("alternate_phone") || msg.includes("student_name") || msg.includes("grade");

        if (missingStudentCols) {
          const fallback = await supabase
            .from("orders")
            .select(legacyFields)
            .eq("id", orderId)
            .single();

          data = fallback.data
            ? {
                ...fallback.data,
                alternate_phone: null,
                student_name: null,
                grade: null,
              }
            : null;
          fetchErr = fallback.error;
        }
      }

      if (fetchErr || !data) {
        setError("Order not found.");
      } else {
        setOrder(data as Order);
      }
      setLoading(false);
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <p className="text-sm text-muted-foreground tracking-[0.1em]">Loading order…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <p className="text-sm text-muted-foreground mb-8">{error ?? "Order not found."}</p>
        <Link to="/store">
          <Button variant="outline" className="text-xs tracking-[0.2em] uppercase h-12 px-8">
            Back to Store
          </Button>
        </Link>
      </div>
    );
  }

  const deliveryAddress = [order.address, order.city, order.pincode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-3">
          Order Details
        </h1>
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {formatDate(order.created_at)}
        </p>
      </div>

      {/* Order ID + Status */}
      <div className="flex items-start justify-between py-6 border-t border-border">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
            Order ID
          </p>
          <p className="text-sm font-light font-mono">{order.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-[10px] text-muted-foreground mt-1 font-mono">
            {order.id}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
            Status
          </p>
          <span className="inline-block text-[10px] tracking-[0.15em] uppercase border border-border px-3 py-1">
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
      </div>

      {/* Customer Info */}
      <div className="py-6 border-t border-border">
        <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-4">
          Customer
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
          <div>
            <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-1">
              Name
            </p>
            <p className="text-sm font-light">{order.customer_name}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-1">
              Phone
            </p>
            <p className="text-sm font-light">{order.phone}</p>
          </div>
          {order.alternate_phone && (
            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-1">
                Alternate Phone
              </p>
              <p className="text-sm font-light">{order.alternate_phone}</p>
            </div>
          )}
          {order.student_name && (
            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-1">
                Student Name
              </p>
              <p className="text-sm font-light">{order.student_name}</p>
            </div>
          )}
          {order.grade && (
            <div>
              <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-1">
                Grade
              </p>
              <p className="text-sm font-light">{order.grade}</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-1">
              Delivery Address
            </p>
            <p className="text-sm font-light">{deliveryAddress}</p>
          </div>
        </div>
      </div>

      {/* Order Items */}
      <div className="py-6 border-t border-border">
        <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-6">
          Items Ordered
        </p>

        <div className="space-y-0">
          {order.order_items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-5 py-5 border-b border-border last:border-b-0"
            >
              {/* Thumbnail */}
              <div className="w-16 h-16 border border-border bg-secondary flex-shrink-0 overflow-hidden">
                {item.products?.image_url ? (
                  <img
                    src={item.products.image_url}
                    alt={item.products.name ?? "Product"}
                    className="w-full h-full object-contain"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" strokeWidth={1} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-light">
                  {item.products?.name ?? "Unknown Product"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.products?.category && (
                    <span className="capitalize">{item.products.category}</span>
                  )}
                  {item.product_variants?.size && (
                    <>
                      {item.products?.category ? " · " : ""}
                      Size {item.product_variants.size}
                    </>
                  )}
                </p>
              </div>

              {/* Qty + Price */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-light">{formatPrice(item.price)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Qty {item.quantity}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Total */}
      <div className="py-6 border-t border-border">
        <div className="flex justify-between items-center">
          <span className="text-xs tracking-[0.2em] uppercase">Total</span>
          <span className="text-lg font-light">{formatPrice(order.total_amount)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-4">
        <Link to="/store">
          <Button
            variant="outline"
            className="text-xs tracking-[0.2em] uppercase h-12 px-8"
          >
            Continue Shopping
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default OrderDetailsPage;
