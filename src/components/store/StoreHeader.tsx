import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ShoppingBag, User, Menu, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useStudentProfile } from "@/lib/student-profile";
import { useContactModal } from "@/lib/contact-modal";
import illumeLogo from "@/assets/logo.png";
import { STORE_ADD_TO_CART_EVENT, StoreAddToCartDetail } from "@/lib/store-interactions";
import { useSchoolContext } from "@/lib/school-context";

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
  const navigate = useNavigate();
  const location = useLocation();
  const items = useCart((s) => s.items);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const profile = useStudentProfile((s) => s.profile);
  const openProfileModal = useStudentProfile((s) => s.openModal);
  const cartLinkRef = useRef<HTMLAnchorElement | null>(null);
  const cartControls = useAnimationControls();
  const [flyingItem, setFlyingItem] = useState<FlyingCartItem | null>(null);
  const school = useSchoolContext((s) => s.school);
  const clearSchool = useSchoolContext((s) => s.clearSchool);
  const openContactModal = useContactModal((s) => s.openModal);
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Handle scroll detection for background transition
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Prevent background scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Cart fly animation handler
  useEffect(() => {
    const handleAddToCart = (event: Event) => {
      const detail = (event as CustomEvent<StoreAddToCartDetail>).detail;

      void cartControls.start({
        scale: [1, 1.15, 0.95, 1],
        y: [0, -4, 0],
        transition: {
          duration: 0.35,
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
      <header
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${
          isScrolled || mobileMenuOpen
            ? "bg-black/95 backdrop-blur-xl border-b border-white/10 shadow-2xl"
            : "bg-black/60 backdrop-blur-sm border-b border-transparent"
        }`}
      >
        <div 
          className={`max-w-[1400px] mx-auto px-3 sm:px-6 md:px-8 flex items-center justify-between transition-all duration-500 ${
            isScrolled ? "h-14 sm:h-16" : "h-16 sm:h-20"
          }`}
        >
          {/* Left Block: Logo + Main Nav */}
          <div className="flex items-center gap-2 sm:gap-8">
            <Link to="/" className="flex items-center shrink-0 group">
              <img
                src={illumeLogo}
                alt="Illume"
                className="h-7 sm:h-9 w-auto object-contain transition-transform duration-500 group-hover:scale-105 group-hover:opacity-80"
              />
            </Link>
            
            <nav className="flex items-center gap-2.5 sm:gap-8">
              <Link
                to="/"
                className="text-[10px] sm:text-[11px] font-light tracking-[0.15em] sm:tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-300"
              >
                Home
              </Link>
              <Link
                to="/about"
                className="text-[10px] sm:text-[11px] font-light tracking-[0.15em] sm:tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-300"
              >
                About
              </Link>
            </nav>
          </div>

          {/* Right Block: Extra Nav + CTA + Cart */}
          <div className="flex items-center gap-2 sm:gap-6">
            
            {/* Desktop Only Extra Nav */}
            <div className="hidden lg:flex items-center gap-8 mr-2">
              {school ? (
                <button
                  onClick={() => {
                    clearSchool();
                    navigate("/shop-by-school");
                  }}
                  className="text-[11px] font-light tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-300 flex items-center gap-2 group"
                >
                  <span className="truncate max-w-[140px]">{school.name}</span>
                  <span className="text-[9px] opacity-50 group-hover:opacity-100 transition-opacity">Change</span>
                </button>
              ) : (
                <Link
                  to="/shop-by-school"
                  className="text-[11px] font-light tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-300"
                >
                  Global School
                </Link>
              )}
              <Link
                to="/track-order"
                className="text-[11px] font-light tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-300"
              >
                Track Order
              </Link>
              {profile && (
                <button
                  onClick={openProfileModal}
                  className="flex items-center gap-2 text-[11px] font-light tracking-[0.2em] uppercase text-white/70 hover:text-white transition-colors duration-300 group"
                >
                  <User className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100 transition-opacity" strokeWidth={1} />
                  <span>
                    {profile.className} · {profile.genderLabel}
                  </span>
                </button>
              )}
            </div>

            {/* Contact Button (Always visible) */}
            <button
              onClick={openContactModal}
              className="inline-flex h-7 sm:h-9 items-center justify-center rounded-full bg-white px-3 sm:px-6 text-[9px] sm:text-[11px] font-medium uppercase tracking-[0.15em] sm:tracking-[0.2em] text-black transition-transform duration-500 hover:scale-[1.03] shrink-0 shadow-lg"
            >
              Contact
            </button>

            {/* Mobile Menu Toggle (Visible below lg) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 text-white/70 hover:text-white transition-colors duration-300 shrink-0"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1} /> : <Menu className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1} />}
            </button>

            {/* Cart (Far Right) */}
            <Link ref={cartLinkRef} to="/store/cart" className="relative group flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 shrink-0">
              <motion.div animate={cartControls} style={{ willChange: "transform" }}>
                <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 text-white opacity-80 group-hover:opacity-100 transition-opacity duration-300" strokeWidth={1} />
              </motion.div>
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2, ease: INTERACTION_EASE }}
                  className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 bg-white text-black text-[8px] sm:text-[9px] font-medium w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center rounded-full"
                >
                  {count}
                </motion.span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile Overlay Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: INTERACTION_EASE }}
              className="lg:hidden border-t border-white/10 bg-black/95 backdrop-blur-xl overflow-hidden shadow-2xl"
            >
              <div className="flex flex-col px-6 py-8 gap-8 max-h-[85vh] overflow-y-auto">
                {school ? (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      clearSchool();
                      navigate("/shop-by-school");
                    }}
                    className="text-left flex flex-col gap-2 group"
                  >
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Current School</span>
                    <div className="flex items-center gap-4">
                      <span className="text-[13px] font-light tracking-[0.1em] text-white group-hover:text-white/70 transition-colors">{school.name}</span>
                      <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 border border-white/20 px-2.5 py-1 rounded-full group-hover:bg-white/10 transition-colors">Change</span>
                    </div>
                  </button>
                ) : (
                  <Link
                    to="/shop-by-school"
                    className="text-[13px] font-light tracking-[0.2em] uppercase text-white/80 hover:text-white transition-colors"
                  >
                    Global School
                  </Link>
                )}
                
                <Link
                  to="/track-order"
                  className="text-[13px] font-light tracking-[0.2em] uppercase text-white/80 hover:text-white transition-colors"
                >
                  Track Order
                </Link>
                
                {profile && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openProfileModal();
                    }}
                    className="text-left flex flex-col gap-2 group"
                  >
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Student Profile</span>
                    <div className="flex items-center gap-4">
                      <span className="text-[13px] font-light tracking-[0.1em] text-white group-hover:text-white/70 transition-colors">
                        {profile.className} · {profile.genderLabel}
                      </span>
                      <User className="h-4 w-4 text-white/40 group-hover:text-white/70 transition-colors" strokeWidth={1} />
                    </div>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Spacer to prevent content jumping due to fixed header */}
      <div className="h-16 sm:h-20 w-full shrink-0 bg-black/60" />

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
            className="pointer-events-none fixed left-0 top-0 z-[100] h-5 w-5 overflow-hidden rounded-full border border-white/50 bg-white shadow-xl"
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
              <div className="h-full w-full bg-black" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default StoreHeader;
