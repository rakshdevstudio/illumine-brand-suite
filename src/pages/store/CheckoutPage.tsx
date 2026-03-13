import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type CheckoutForm = {
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
};

const EMPTY_FORM: CheckoutForm = {
  customer_name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  pincode: "",
};

const CheckoutPage = () => {
  const { items, total, clearCart } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const hasItemsRef = useRef(items.length > 0);

  const set = (field: keyof CheckoutForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.email || !form.phone || !form.address || !form.city || !form.pincode) {
      toast.error("Please fill all required fields");
      return;
    }
    if (items.length === 0) return;

    setLoading(true);
    try {
      const orderPayload = {
        customer_name: form.customer_name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        city: form.city,
        pincode: form.pincode,
        total_amount: total(),
        status: "pending",
      };

      const withEmailResult = await supabase
        .from("orders")
        .insert(orderPayload)
        .select()
        .single();

      let order = withEmailResult.data;

      if (withEmailResult.error) {
        const missingEmailColumn =
          withEmailResult.error.code === "PGRST204" &&
          typeof withEmailResult.error.message === "string" &&
          withEmailResult.error.message.toLowerCase().includes("email");

        if (!missingEmailColumn) throw withEmailResult.error;

        console.warn("orders.email not found in DB yet; retrying order insert without email column");

        const fallbackResult = await supabase
          .from("orders")
          .insert(orderPayload)
          .select()
          .single();

        if (fallbackResult.error) throw fallbackResult.error;
        order = fallbackResult.data;
      }

      if (!order) throw new Error("Order was not created");

      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
        price: item.price,
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
      if (itemsErr) throw itemsErr;

      for (const item of items) {
        const { data: variant } = await supabase
          .from("product_variants")
          .select("stock")
          .eq("id", item.variantId)
          .single();

        if (variant) {
          const newStock = Math.max(0, variant.stock - item.quantity);
          await supabase
            .from("product_variants")
            .update({ stock: newStock })
            .eq("id", item.variantId);

          await supabase.from("inventory_logs").insert({
            product_id: item.productId,
            variant_id: item.variantId,
            change_type: "order",
            quantity_change: -item.quantity,
            previous_stock: variant.stock,
            new_stock: newStock,
            order_id: order.id,
          });
        }
      }

      clearCart();

      // Fire-and-forget order confirmation email
      supabase.functions
        .invoke("send-order-confirmation", {
          body: {
            email: form.email,
            name: form.customer_name,
            orderId: order.id,
            items: items.map((item) => ({
              name: item.name,
              size: item.size,
              quantity: item.quantity,
              price: item.price,
            })),
            total: order.total_amount,
          },
        })
        .catch((err: unknown) => console.error("Order confirmation email failed:", err));

      navigate(`/store/confirmation?order=${order.id}`, { replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Failed to place order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!hasItemsRef.current) {
    navigate("/store/cart", { replace: true });
    return null;
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-12">
        Checkout
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Full Name */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Full Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={form.customer_name}
            onChange={set("customer_name")}
            className="h-12 border-border"
            placeholder="Enter your full name"
            autoComplete="name"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Email <span className="text-destructive">*</span>
          </label>
          <Input
            type="email"
            value={form.email}
            onChange={set("email")}
            className="h-12 border-border"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Phone Number <span className="text-destructive">*</span>
          </label>
          <Input
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            className="h-12 border-border"
            placeholder="+91 98765 43210"
            autoComplete="tel"
          />
        </div>

        {/* Address */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Delivery Address <span className="text-destructive">*</span>
          </label>
          <textarea
            value={form.address}
            onChange={set("address")}
            className="w-full min-h-[80px] border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="House / flat / street"
            autoComplete="street-address"
          />
        </div>

        {/* City + Pincode side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
              City <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.city}
              onChange={set("city")}
              className="h-12 border-border"
              placeholder="City"
              autoComplete="address-level2"
            />
          </div>
          <div>
            <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
              Pincode <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.pincode}
              onChange={set("pincode")}
              className="h-12 border-border"
              placeholder="6-digit pincode"
              inputMode="numeric"
              maxLength={6}
              autoComplete="postal-code"
            />
          </div>
        </div>

        <div className="pt-6 border-t border-border">
          <div className="flex justify-between items-center mb-6">
            <span className="text-xs tracking-[0.2em] uppercase">Total</span>
            <span className="text-lg font-light">{formatPrice(total())}</span>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-xs tracking-[0.2em] uppercase"
          >
            {loading ? "Placing Order..." : "Place Order"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CheckoutPage;
