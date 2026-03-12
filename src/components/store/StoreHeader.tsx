import { Link } from "react-router-dom";
import { ShoppingBag, User, LogIn } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useStudentProfile } from "@/lib/student-profile";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import illumeLogo from "@/assets/illume-logo.png";

const StoreHeader = () => {
  const items = useCart((s) => s.items);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const profile = useStudentProfile((s) => s.profile);
  const openModal = useStudentProfile((s) => s.openModal);
  const { user } = useCustomerAuth();

  return (
    <header className="bg-surface-dark border-b border-surface-dark">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/store" className="flex items-center gap-2">
          <img
            src={illumeLogo}
            alt="Illume"
            className="h-8 w-auto" style={{ filter: "brightness(0) invert(1)" }}
          />
        </Link>

        <div className="flex items-center gap-6">
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



          {/* Account / Login */}
          {user ? (
            <Link
              to="/account"
              className="flex items-center gap-1.5 text-xs tracking-wide text-surface-dark-muted hover:text-surface-dark-foreground transition-colors"
              title="My Account"
            >
              <User className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline text-[11px] tracking-[0.15em] uppercase">Account</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 text-xs tracking-wide text-surface-dark-muted hover:text-surface-dark-foreground transition-colors"
              title="Sign In"
            >
              <LogIn className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline text-[11px] tracking-[0.15em] uppercase">Sign In</span>
            </Link>
          )}

          <Link to="/store/cart" className="relative group">
            <ShoppingBag className="h-5 w-5 text-surface-dark-foreground transition-opacity group-hover:opacity-60" strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute -top-2 -right-2 bg-surface-dark-foreground text-surface-dark text-[10px] w-4 h-4 flex items-center justify-center">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
};

export default StoreHeader;
