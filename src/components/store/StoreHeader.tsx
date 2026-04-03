import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { Link } from "react-router-dom";
import { ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useStudentProfile } from "@/lib/student-profile";
import illumeLogo from "@/assets/logo.png";
import { STORE_ADD_TO_CART_EVENT, StoreAddToCartDetail } from "@/lib/store-interactions";

const INTERACTION_EASE = [0.22, 1, 0.36, 1] as const;

type FlyingCartItem = {
  id: number;
  imageUrl: string | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

const StoreHeader = () => {
  const items = useCart((s) => s.items);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const profile = useStudentProfile((s) => s.profile);
  const openModal = useStudentProfile((s) => s.openModal);
  const cartLinkRef = useRef<HTMLAnchorElement | null>(null);
  const cartControls = useAnimationControls();
  const [flyingItem, setFlyingItem] = useState<FlyingCartItem | null>(null);

  useEffect(() => {
    const handleAddToCart = (event: Event) => {
      const detail = (event as CustomEvent<StoreAddToCartDetail>).detail;

      void cartControls.start({
        scale: [1, 1.14, 0.96, 1],
        y: [0, -4, 0],
        transition: {
          duration: 0.34,
          ease: INTERACTION_EASE,
          times: [0, 0.45, 1],
        },
      });

      const cartRect = cartLinkRef.current?.getBoundingClientRect();
      const sourceRect = detail?.sourceRect;

      if (!cartRect || !sourceRect) return;

      setFlyingItem({
        id: Date.now(),
        imageUrl: detail?.imageUrl ?? null,
        fromX: sourceRect.left + sourceRect.width / 2 - 10,
        fromY: sourceRect.top + sourceRect.height / 2 - 10,
        toX: cartRect.left + cartRect.width / 2 - 10,
        toY: cartRect.top + cartRect.height / 2 - 10,
      });
    };

    window.addEventListener(STORE_ADD_TO_CART_EVENT, handleAddToCart as EventListener);
    return () => {
      window.removeEventListener(STORE_ADD_TO_CART_EVENT, handleAddToCart as EventListener);
    };
  }, [cartControls]);

  return (
    <>
      <header className="bg-surface-dark border-b border-surface-dark">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/store" className="flex items-center gap-2">
                    <img
            src={illumeLogo}
            alt="Illume"
            className="h-9 w-auto"
          />
        </Link>

        <div className="flex items-center gap-6">
          <Link
            to="/shop-by-school"
            className="text-xs tracking-[0.14em] uppercase text-surface-dark-muted hover:text-surface-dark-foreground transition-colors"
          >
            Shop by School
          </Link>
          <Link
            to="/track-order"
            className="text-xs tracking-[0.14em] uppercase text-surface-dark-muted hover:text-surface-dark-foreground transition-colors"
          >
            Track Order
          </Link>
          {profile && (
            <button
              onClick={openModal}
              className="flex items-center gap-2 text-xs tracking-wide text-surface-dark-muted hover:text-surface-dark-foreground transition-colors group"
            >
              <User className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">
                {profile.className} · {profile.genderLabel}
              </span>
              <span className="text-[10px] tracking-[0.15em] uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                Change
              </span>
            </button>
          )}
          <Link ref={cartLinkRef} to="/store/cart" className="relative group">
            <motion.div animate={cartControls} style={{ willChange: "transform" }}>
              <ShoppingBag className="h-5 w-5 text-surface-dark-foreground transition-opacity group-hover:opacity-60" strokeWidth={1.5} />
            </motion.div>
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2, ease: INTERACTION_EASE }}
                className="absolute -top-2 -right-2 bg-surface-dark-foreground text-surface-dark text-[10px] w-4 h-4 flex items-center justify-center"
              >
                {count}
              </motion.span>
            )}
          </Link>
        </div>
      </div>
      </header>

      <AnimatePresence>
        {flyingItem && (
          <motion.div
            key={flyingItem.id}
            initial={{
              x: flyingItem.fromX,
              y: flyingItem.fromY,
              scale: 1,
              opacity: 0.95,
            }}
            animate={{
              x: flyingItem.toX,
              y: flyingItem.toY,
              scale: 0.32,
              opacity: [0.95, 1, 0.55, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.38, ease: INTERACTION_EASE }}
            onAnimationComplete={() => setFlyingItem((current) => current?.id === flyingItem.id ? null : current)}
            className="pointer-events-none fixed left-0 top-0 z-[80] h-5 w-5 overflow-hidden rounded-full border border-white/50 bg-white shadow-xl"
            style={{ willChange: "transform, opacity" }}
          >
            {flyingItem.imageUrl ? (
              <img
                src={flyingItem.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="h-full w-full bg-surface-dark" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default StoreHeader;
