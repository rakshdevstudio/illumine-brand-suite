import { Link } from "react-router-dom";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Minus, Plus, X } from "lucide-react";
import { getProductImageUrl } from "@/lib/product-images";

const CartPage = () => {
  const { items, updateQuantity, removeItem, total } = useCart();

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-6">
          Your Bag
        </h1>
        <p className="text-sm text-muted-foreground mb-8">Your bag is empty</p>
        <Link to="/store">
          <Button variant="outline" className="text-xs tracking-[0.2em] uppercase h-12 px-8">
            Continue Shopping
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-12">
        Your Bag
      </h1>

      <div className="space-y-0">
        {items.map((item) => (
          <div
            key={item.variantId}
            className="flex items-center gap-6 py-6 border-b border-border"
          >
            <div className="w-20 h-20 bg-secondary border border-border flex-shrink-0 overflow-hidden">
              <img
                src={item.imageUrl || getProductImageUrl("shirt", item.name)}
                alt={item.name}
                className="w-full h-full object-contain"
                onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-light">{item.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.schoolName} · Size {item.size}
              </p>
              <p className="text-sm mt-1">{formatPrice(item.price)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                className="w-8 h-8 border border-border flex items-center justify-center hover:border-foreground transition-colors"
              >
                <Minus className="h-3 w-3" strokeWidth={1.5} />
              </button>
              <span className="text-sm w-6 text-center">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                className="w-8 h-8 border border-border flex items-center justify-center hover:border-foreground transition-colors"
              >
                <Plus className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </div>
            <button
              onClick={() => removeItem(item.variantId)}
              className="p-1 hover:opacity-60 transition-opacity"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-8 border-t border-border">
        <div className="flex justify-between items-center mb-8">
          <span className="text-xs tracking-[0.2em] uppercase">Total</span>
          <span className="text-lg font-light">{formatPrice(total())}</span>
        </div>
        <Link to="/store/checkout">
          <Button className="w-full h-12 text-xs tracking-[0.2em] uppercase">
            Proceed to Checkout
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default CartPage;
