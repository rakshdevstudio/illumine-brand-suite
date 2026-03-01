import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import illumeLogo from "@/assets/illume-logo.jpeg";

const StoreHeader = () => {
  const items = useCart((s) => s.items);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <header className="border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/store" className="flex items-center gap-2">
          <img src={illumeLogo} alt="Illume" className="h-8 w-auto" />
        </Link>
        <Link to="/store/cart" className="relative group">
          <ShoppingBag className="h-5 w-5 transition-opacity group-hover:opacity-60" strokeWidth={1.5} />
          {count > 0 && (
            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] w-4 h-4 flex items-center justify-center">
              {count}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
};

export default StoreHeader;
