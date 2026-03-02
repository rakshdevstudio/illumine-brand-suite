import { Link } from "react-router-dom";
import { ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useStudentProfile } from "@/lib/student-profile";
import illumeLogo from "@/assets/illume-logo.png";

const StoreHeader = () => {
  const items = useCart((s) => s.items);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const profile = useStudentProfile((s) => s.profile);
  const openModal = useStudentProfile((s) => s.openModal);

  return (
    <header className="border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/store" className="flex items-center gap-2">
          <img src={illumeLogo} alt="Illume" className="h-10 w-auto" style={{ filter: "brightness(0)" }} />
        </Link>

        <div className="flex items-center gap-5">
          {profile && (
            <button
              onClick={openModal}
              className="flex items-center gap-2 text-xs tracking-wide text-muted-foreground hover:text-foreground transition-colors group"
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

          <Link to="/store/cart" className="relative group">
            <ShoppingBag className="h-5 w-5 transition-opacity group-hover:opacity-60" strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] w-4 h-4 flex items-center justify-center">
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
