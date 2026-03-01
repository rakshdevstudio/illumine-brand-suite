import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";

const StoreHeader = () => {
  const items = useCart((s) => s.items);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <header className="border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/store" className="text-lg tracking-[0.3em] font-light uppercase">
          Illume
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
