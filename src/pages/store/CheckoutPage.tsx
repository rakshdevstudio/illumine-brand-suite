import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/use-customer-auth";

const CheckoutPage = () => {
  const { items, total, clearCart } = useCart();
  const navigate = useNavigate();
  const customer = useCustomerAuth((s) => s.customer);
  const customerLoading = useCustomerAuth((s) => s.loading);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const hasItemsRef = useRef(items.length > 0);

  // Pre-fill name from customer profile
  useEffect(() => {
    if (customer?.name) setForm((f) => ({ ...f, name: customer.name! }));
  }, [customer]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.address) {
      toast.error("Please fill all fields");
      return;
    }
    if (items.length === 0) return;

    setLoading(true);
    try {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          customer_name: form.name,
          phone: customer!.phone,
          address: form.address,
          total_amount: total(),
          status: "pending",
          customer_id: customer!.id,
        })
        .select()
        .single();

      if (orderErr) throw orderErr;

      // Update customer name if changed
      if (form.name !== customer?.name) {
        await supabase
          .from("customers")
          .update({ name: form.name })
          .eq("id", customer!.id);
      }

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
      navigate(`/store/confirmation?order=${order.id}`, { replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Failed to place order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Only redirect if user arrived with empty cart (not after successful order)
  if (!hasItemsRef.current) {
    navigate("/store/cart", { replace: true });
    return null;
  }

  // Wait for customer auth to resolve before gating
  if (customerLoading) {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Must be logged in to checkout
  if (!customer) {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-4">
          Sign In to Checkout
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Please sign in with your phone number to place an order.
        </p>
        <Link to="/auth/login?redirect=/store/checkout">
          <Button className="h-12 px-8 text-xs tracking-[0.2em] uppercase">
            Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-12">
        Checkout
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Full Name
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-12 border-border"
            placeholder="Enter your full name"
          />
        </div>
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Phone Number
          </label>
          <div className="h-12 border border-border bg-secondary flex items-center px-3 text-sm text-muted-foreground select-none">
            {customer.phone}
            <span className="ml-auto text-[10px] tracking-[0.15em] uppercase">Verified</span>
          </div>
        </div>
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Delivery Address
          </label>
          <textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full min-h-[100px] border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="Full delivery address"
          />
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