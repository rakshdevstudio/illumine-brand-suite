import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InvoiceDocument, type InvoiceView } from "@/components/invoice/InvoiceDocument";

const StoreInvoicePage = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();

  const { data: invoice, isLoading, error } = useQuery<InvoiceView | null>({
    queryKey: ["store-invoice", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("getinvoicewithitems", {
        p_invoice_id: invoiceId!,
      });

      if (error) {
        if (error.code === "404" || String(error.message || "").includes("404")) {
          return null;
        }
        throw error;
      }
      return (data ?? null) as InvoiceView | null;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Loading invoice...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-12">
        <p className="text-sm text-destructive">Invoice not available yet.</p>
        <Link to="/store">
          <Button variant="outline">Back to Store</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
      <div className="print:hidden flex items-center gap-2">
        <Link to={`/store/order/${invoice.order_id}`}>
          <Button variant="outline">Back to Order</Button>
        </Link>
      </div>
      <InvoiceDocument invoice={invoice} />
    </div>
  );
};

export default StoreInvoicePage;
