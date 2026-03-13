import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const ConfirmationPage = () => {
  const [params] = useSearchParams();
  const orderId = params.get("order");

  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <div className="w-16 h-16 border border-border mx-auto mb-8 flex items-center justify-center">
        <Check className="h-6 w-6" strokeWidth={1} />
      </div>

      <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-4">
        Order Confirmed
      </h1>
      <p className="text-sm text-muted-foreground mb-2">
        Thank you for your order.
      </p>
      {orderId && (
        <p className="text-xs tracking-[0.15em] text-muted-foreground mb-12">
          Order ID: {orderId.slice(0, 8).toUpperCase()}
        </p>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {orderId && (
          <Link to={`/store/order/${orderId}`}>
            <Button className="text-xs tracking-[0.2em] uppercase h-12 px-8">
              View Order Details
            </Button>
          </Link>
        )}
        <Link to="/store">
          <Button variant="outline" className="text-xs tracking-[0.2em] uppercase h-12 px-8">
            Continue Shopping
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default ConfirmationPage;
