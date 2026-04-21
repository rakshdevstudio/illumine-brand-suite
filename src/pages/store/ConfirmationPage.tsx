import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ConfirmationPage = () => {
  const [params] = useSearchParams();
  const orderId = params.get("order");

  const { data: invoiceId } = useQuery({
    queryKey: ["store-order-invoice", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id")
        .eq("order_id", orderId!)
        .maybeSingle();

      return data?.id ?? null;
    },
    refetchInterval: (query) => {
      if (query.state.data) return false;
      return 2500;
    },
  });

  const onDownloadPlaceholder = () => {
    toast.info("PDF download will be available soon.");
  };

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
      <p className="text-sm text-muted-foreground mb-2">Order placed successfully.</p>
      <p className="text-sm text-muted-foreground mb-2">
        {invoiceId ? "Invoice generated." : "Generating invoice..."}
      </p>
      <p className="text-sm text-muted-foreground mb-2">
        Need help with your order?
      </p>
      <p className="text-sm mb-4">
        <span className="text-muted-foreground">Visit: </span>
        <a
          href="https://www.illumeonline.in"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-black transition-colors"
        >
          www.illumeonline.in
        </a>
      </p>
      {orderId && (
        <p className="text-xs tracking-[0.15em] text-muted-foreground mb-12">
          Order ID: {orderId.slice(0, 8).toUpperCase()}
        </p>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {invoiceId && (
          <Link to={`/store/invoice/${invoiceId}`}>
            <Button className="text-xs tracking-[0.2em] uppercase h-12 px-8">View Invoice</Button>
          </Link>
        )}
        <Button
          type="button"
          variant="outline"
          className="text-xs tracking-[0.2em] uppercase h-12 px-8"
          onClick={onDownloadPlaceholder}
        >
          Download Invoice
        </Button>
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
        <Link to="/track-order">
          <Button variant="ghost" className="text-xs tracking-[0.2em] uppercase h-12 px-4 text-muted-foreground hover:text-foreground">
            Track Another Order
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default ConfirmationPage;
