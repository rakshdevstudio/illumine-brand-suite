import { useDeferredValue, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Minus, Plus, QrCode, Search, ShoppingBag, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalEmptyState, PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/portal-dashboard";

type PaymentMethod = "cash" | "upi";

type SellableProduct = {
  productId: string;
  variantId: string;
  schoolId: string | null;
  name: string;
  size: string;
  category: string;
  price: number;
  stock: number;
};

type PosCartItem = SellableProduct & {
  quantity: number;
};

const PAYMENT_OPTIONS: Array<{ id: PaymentMethod; label: string; icon: typeof Wallet }> = [
  { id: "cash", label: "Cash", icon: Wallet },
  { id: "upi", label: "UPI", icon: QrCode },
];

const selectPreferredVariant = (variants: any[] | null | undefined) => {
  const activeVariants = (variants ?? []).filter((variant) => !variant?.status || variant.status === "active");

  if (activeVariants.length === 0) return null;

  return [...activeVariants].sort((a, b) => {
    const aIsDefault = String(a.size ?? "").toLowerCase() === "default";
    const bIsDefault = String(b.size ?? "").toLowerCase() === "default";
    const aInStock = Number(a.stock ?? 0) > 0;
    const bInStock = Number(b.stock ?? 0) > 0;

    if (aIsDefault !== bIsDefault) return aIsDefault ? -1 : 1;
    if (aInStock !== bInStock) return aInStock ? -1 : 1;
    return Number(b.stock ?? 0) - Number(a.stock ?? 0);
  })[0];
};

const PosDashboard = () => {
  const { user, role, hasAccess, loading, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [cart, setCart] = useState<PosCartItem[]>([]);

  const posRoles = ["branch_staff", "admin", "super_admin"];
  const hasPosCcess = role !== null && posRoles.includes(role);
  const isAuthorized = Boolean(user && hasAccess && hasPosCcess);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["pos-products"],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, category, school_id, status, product_variants(id, size, stock, status, price_override)")
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const sellableProducts = useMemo<SellableProduct[]>(() => {
    return (products ?? [])
      .map((product: any) => {
        const variant = selectPreferredVariant(product.product_variants);
        if (!variant) return null;

        return {
          productId: product.id,
          variantId: variant.id,
          schoolId: product.school_id ?? null,
          name: product.name,
          size: variant.size ?? "Default",
          category: product.category,
          price: Number(variant.price_override ?? product.price ?? 0),
          stock: Number(variant.stock ?? 0),
        };
      })
      .filter((product): product is SellableProduct => Boolean(product));
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!deferredSearch) return sellableProducts;

    return sellableProducts.filter((product) =>
      [product.name, product.category, product.size]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch),
    );
  }, [deferredSearch, sellableProducts]);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const totalAmount = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );

  const updateQuantity = (variantId: string, quantity: number) => {
    setCart((currentCart) => {
      if (quantity <= 0) {
        return currentCart.filter((item) => item.variantId !== variantId);
      }

      return currentCart.map((item) => {
        if (item.variantId !== variantId) return item;
        return {
          ...item,
          quantity: Math.min(quantity, item.stock > 0 ? item.stock : quantity),
        };
      });
    });
  };

  const addToCart = (product: SellableProduct) => {
    if (product.stock <= 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }

    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.variantId === product.variantId);

      if (existingItem) {
        return currentCart.map((item) =>
          item.variantId === product.variantId
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
            : item,
        );
      }

      return [...currentCart, { ...product, quantity: 1 }];
    });
  };

  const placeOrder = async () => {
    if (cart.length === 0) {
      toast.error("Add products before placing an order");
      return;
    }

    setPlacingOrder(true);

    try {
      const variantIds = cart.map((item) => item.variantId);
      const { data: variants, error: variantError } = await supabase
        .from("product_variants")
        .select("id, stock")
        .in("id", variantIds);

      if (variantError) throw variantError;

      const stockMap = new Map((variants ?? []).map((variant) => [variant.id, Number(variant.stock ?? 0)]));
      const insufficientItem = cart.find((item) => (stockMap.get(item.variantId) ?? 0) < item.quantity);

      if (insufficientItem) {
        toast.error(`${insufficientItem.name} no longer has enough stock`);
        return;
      }

      const schoolIds = [...new Set(cart.map((item) => item.schoolId).filter(Boolean))];
      const orderSchoolId = schoolIds.length === 1 ? schoolIds[0] : null;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_name: "Walk-in Customer",
          phone: "0000000000",
          address: "POS Counter",
          school_id: orderSchoolId,
          total_amount: totalAmount,
          status: "confirmed",
        })
        .select("id, total_amount")
        .single();

      if (orderError) throw orderError;
      if (!order) throw new Error("Order was not created");

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
        price: item.price,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        const previousStock = stockMap.get(item.variantId) ?? 0;
        const { data: updatedVariant, error: updateError } = await supabase
          .from("product_variants")
          .update({ stock: previousStock - item.quantity })
          .eq("id", item.variantId)
          .gte("stock", item.quantity)
          .select("stock")
          .single();

        if (updateError) throw updateError;

        const { error: logError } = await supabase.from("inventory_logs").insert({
          product_id: item.productId,
          variant_id: item.variantId,
          change_type: "order",
          quantity_change: -item.quantity,
          previous_stock: previousStock,
          new_stock: Number(updatedVariant?.stock ?? previousStock - item.quantity),
          order_id: order.id,
        });

        if (logError) throw logError;
      }

      await supabase.from("order_notes").insert({
        order_id: order.id,
        note: `Order Source: POS\nPayment Method: ${paymentMethod.toUpperCase()}\nHandled By: ${user.email ?? "POS Team"}`,
      });

      setCart([]);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pos-products"] }),
        queryClient.invalidateQueries({ queryKey: ["vendor-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["school-dashboard"] }),
      ]);

      toast.success(`Order ${order.id.slice(0, 8).toUpperCase()} placed successfully`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to place POS order");
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/pos/login" replace />;
  }

  return (
    <PortalShell
      title="POS Billing"
      subtitle={user.email ?? "Counter billing terminal"}
      onSignOut={signOut}
      scopeLabel={`${cartCount} item${cartCount === 1 ? "" : "s"} in cart`}
    >
      <Card className={portalPanelClassName}>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-lg">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="h-12 rounded-full border-black/10 bg-white pl-11 pr-4"
            />
          </div>

          <div className="flex items-center justify-between rounded-full border border-black/10 bg-stone-50 px-4 py-3 md:min-w-[190px]">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Current Cart</span>
            <span className="text-lg font-medium text-foreground">{cartCount}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className={portalPanelClassName}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Product List
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {productsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-40 rounded-[24px] border border-border/70 bg-stone-50/80 animate-pulse" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <PortalEmptyState
                title="No Products Found"
                description="Try a different search or check that active products have sellable variants."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const isOutOfStock = product.stock <= 0;

                  return (
                    <div
                      key={product.variantId}
                      className="flex h-full flex-col justify-between rounded-[24px] border border-black/5 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,244,239,0.95))] p-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.55)]"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-medium text-foreground">{product.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              {product.category}
                            </p>
                          </div>
                          <div className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            {product.size}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-2xl font-extralight tracking-tight text-foreground">
                            {formatCurrency(product.price)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {isOutOfStock ? "Out of stock" : `${product.stock} available`}
                          </p>
                        </div>
                      </div>

                      <Button
                        onClick={() => addToCart(product)}
                        disabled={isOutOfStock}
                        className="mt-5 h-11 rounded-full text-[11px] uppercase tracking-[0.22em]"
                      >
                        Add
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cn(portalPanelClassName, "xl:sticky xl:top-6 xl:self-start")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Cart
              </CardTitle>
              <div className="flex items-center gap-2 rounded-full border border-black/10 bg-stone-50 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <ShoppingBag className="h-3.5 w-3.5" />
                {cartCount} selected
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {cart.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-black/10 bg-stone-50/80 px-5 py-10 text-center">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-foreground">Cart is empty</p>
                <p className="mt-2 text-sm text-muted-foreground">Add a product from the grid to begin billing.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.variantId}
                    className="rounded-[22px] border border-black/5 bg-stone-50/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.size}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.variantId, 0)}
                        className="rounded-full border border-black/10 p-2 text-muted-foreground transition hover:bg-white hover:text-foreground"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          className="rounded-full p-1 text-muted-foreground transition hover:bg-stone-100 hover:text-foreground"
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-8 text-center text-sm font-medium text-foreground">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                          className="rounded-full p-1 text-muted-foreground transition hover:bg-stone-100 hover:text-foreground"
                          aria-label={`Increase ${item.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>

                      <p className="text-sm font-medium text-foreground">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-[22px] border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="uppercase tracking-[0.2em] text-muted-foreground">Total Amount</span>
                <span className="text-xl font-medium text-foreground">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={portalPanelClassName}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            {PAYMENT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = paymentMethod === option.id;

              return (
                <Button
                  key={option.id}
                  type="button"
                  variant="outline"
                  onClick={() => setPaymentMethod(option.id)}
                  className={cn(
                    "h-11 rounded-full border-black/10 px-5 text-[11px] uppercase tracking-[0.22em]",
                    selected && "border-black bg-black text-white hover:bg-black/90 hover:text-white",
                  )}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {option.label}
                </Button>
              );
            })}
          </div>

          <Button
            onClick={placeOrder}
            disabled={cart.length === 0 || placingOrder}
            className="h-11 rounded-full px-6 text-[11px] uppercase tracking-[0.24em] lg:min-w-[220px]"
          >
            {placingOrder ? "Placing Order..." : "Place Order"}
          </Button>
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default PosDashboard;
