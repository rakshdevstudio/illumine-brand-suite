import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useStudentProfile } from "@/lib/student-profile";

const INTERACTION_EASE = [0.22, 1, 0.36, 1] as const;

const CartPage = () => {
  const { items, updateQuantity, removeItem, total } = useCart();
  const navigate = useNavigate();
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const profile = useStudentProfile((state) => state.profile);

  const continueShoppingPath = profile
    ? `/store/school/${profile.schoolSlug}/class/${profile.classSlug}/gender/${profile.gender}`
    : "/store";

  const subtotal = useMemo(() => total(), [total, items]);
  const taxes = 0;
  const totalAmount = subtotal + taxes;
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);

  const handleRemoveWithAnimation = (variantId: string) => {
    if (removingIds.includes(variantId)) return;

    setRemovingIds((prev) => [...prev, variantId]);
    window.setTimeout(() => {
      removeItem(variantId);
      setRemovingIds((prev) => prev.filter((id) => id !== variantId));
    }, 180);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 md:py-12">
      <motion.button
        type="button"
        onClick={() => navigate(continueShoppingPath)}
        className="mb-8 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground"
        whileHover={{ opacity: 0.78 }}
        transition={{ duration: 0.2, ease: INTERACTION_EASE }}
      >
        <motion.span
          whileHover={{ x: -2 }}
          transition={{ duration: 0.2, ease: INTERACTION_EASE }}
          className="inline-flex"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        </motion.span>
        Continue Shopping
      </motion.button>

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: INTERACTION_EASE }}
          className="min-h-[52vh] flex flex-col items-center justify-center text-center"
        >
          <div className="mb-6 rounded-full border border-border bg-secondary/40 p-4">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-3">Your bag is empty</h1>
          <p className="text-sm text-muted-foreground mb-8">Add premium essentials to continue checkout.</p>
          <motion.div
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2, ease: INTERACTION_EASE }}
          >
            <Button
              variant="outline"
              onClick={() => navigate(continueShoppingPath)}
              className="h-12 px-8 text-xs uppercase tracking-[0.2em] transition-opacity hover:opacity-85"
            >
              Continue Shopping
            </Button>
          </motion.div>
        </motion.div>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[7fr_3fr] lg:items-start">
          <section>
            <div className="mb-7">
              <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase">Your Bag</h1>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </p>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.article
                    key={item.variantId}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: INTERACTION_EASE }}
                    className="rounded-2xl border border-border/70 bg-background px-4 py-4 sm:px-5"
                  >
                    <div className="flex items-center gap-4 sm:gap-5">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary/60">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder.svg";
                            }}
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Uniform</span>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-light tracking-wide">{item.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[item.schoolName, item.className, item.gender].filter(Boolean).join(" • ") || "Uniform"}
                        </p>
                        {item.size && <p className="mt-1 text-xs text-muted-foreground">Size {item.size}</p>}

                        <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-border px-2 py-1">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            transition={{ duration: 0.16 }}
                            onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-secondary transition-colors"
                          >
                            <Minus className="h-3 w-3" strokeWidth={1.5} />
                          </motion.button>

                          <motion.span
                            key={`${item.variantId}-${item.quantity}`}
                            initial={{ opacity: 0.5, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="w-5 text-center text-sm"
                          >
                            {item.quantity}
                          </motion.span>

                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            transition={{ duration: 0.16 }}
                            onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-secondary transition-colors"
                          >
                            <Plus className="h-3 w-3" strokeWidth={1.5} />
                          </motion.button>
                        </div>
                      </div>

                      <div className="ml-auto flex min-w-[112px] shrink-0 flex-col items-end justify-between self-stretch">
                        <p className="text-sm font-light">{formatPrice(item.price * item.quantity)}</p>

                        <motion.button
                          type="button"
                          onClick={() => handleRemoveWithAnimation(item.variantId)}
                          whileHover={{ opacity: 0.6 }}
                          whileTap={{ scale: 0.92 }}
                          transition={{ duration: 0.16 }}
                          disabled={removingIds.includes(item.variantId)}
                          className="rounded-full p-1 transition-opacity disabled:pointer-events-none"
                          aria-label={`Remove ${item.name}`}
                        >
                          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors">
                            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Remove
                          </span>
                        </motion.button>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          </section>

          <motion.aside
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2, ease: INTERACTION_EASE }}
            className="lg:sticky lg:top-24"
          >
            <div className="rounded-2xl border border-border/80 bg-secondary/25 p-6 shadow-sm transition-shadow hover:shadow-md">
              <h2 className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-6">Order Summary</h2>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Items total</span>
                  <span>{itemCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Taxes</span>
                  <span>{taxes > 0 ? formatPrice(taxes) : "—"}</span>
                </div>
              </div>

              <div className="my-6 border-t border-border" />

              <div className="flex items-center justify-between mb-6">
                <span className="text-xs uppercase tracking-[0.2em]">Total Amount</span>
                <span className="text-lg font-light">{formatPrice(totalAmount)}</span>
              </div>

              <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.16 }}>
                <Button
                  onClick={() => navigate("/store/checkout")}
                  className="w-full h-12 bg-foreground text-background hover:opacity-90 text-xs uppercase tracking-[0.2em]"
                >
                  Proceed to Checkout
                </Button>
              </motion.div>
            </div>
          </motion.aside>
        </div>
      )}
    </div>
  );
};

export default CartPage;
