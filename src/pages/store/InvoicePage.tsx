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

      if (!error) {
        return (data ?? null) as InvoiceView | null;
      }

      if (error.code !== "404" && !String(error.message || "").includes("404")) {
        throw error;
      }

      const fallback = await supabase
        .from("invoices")
        .select(
          "id, order_id, invoice_number, customer_name, phone, address, subtotal, cgst, sgst, total, created_at, invoice_items(id, quantity, unit_price, gst_percentage, cgst_amount, sgst_amount, total, products(name), product_variants(size))",
        )
        .eq("id", invoiceId!)
        .single();

      if (fallback.error) throw fallback.error;
      const row: any = fallback.data;
      if (!row) return null;

      return {
        ...row,
        invoice_items: (row.invoice_items ?? []).map((item: any) => ({
          id: item.id,
          product_name: item.products?.name || "Product",
          variant_size: item.product_variants?.size || "-",
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          gst_percentage: Number(item.gst_percentage || 0),
          cgst_amount: Number(item.cgst_amount || 0),
          sgst_amount: Number(item.sgst_amount || 0),
          total: Number(item.total || 0),
        })),
      } as InvoiceView;
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
