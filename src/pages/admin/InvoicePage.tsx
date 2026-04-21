import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceDocument, type InvoiceView } from "@/components/invoice/InvoiceDocument";
import { exportToExcel, formatInvoiceForExport, generateExportFilename } from "@/lib/invoice-export";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type InvoiceFinanceMeta = {
  id: string;
  status: string;
  paid_amount: number;
  balance_amount: number;
  total: number;
};

type InvoicePaymentRow = {
  id: string;
  amount: number;
  payment_mode: string;
  payment_date: string;
  notes: string | null;
  idempotency_key: string;
  created_at: string;
};

const InvoicePage = () => {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("bank");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelConfirmText, setCancelConfirmText] = useState("");

  const { data: invoice, isLoading, error } = useQuery<InvoiceView | null>({
    queryKey: ["admin-invoice-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("getinvoicewithitems", {
        p_invoice_id: id!,
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
        .eq("id", id!)
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

  const { data: financeMeta } = useQuery<InvoiceFinanceMeta | null>({
    queryKey: ["admin-invoice-finance", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, status, paid_amount, balance_amount, total")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return (data ?? null) as InvoiceFinanceMeta | null;
    },
  });

  const { data: paymentHistory = [] } = useQuery<InvoicePaymentRow[]>({
    queryKey: ["admin-invoice-payments", id],
    enabled: isAdmin && !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payments")
        .select("id, amount, payment_mode, payment_date, notes, idempotency_key, created_at")
        .eq("reference_type", "invoice")
        .eq("reference_id", id!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as InvoicePaymentRow[];
    },
  });

  const refreshInvoice = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-invoice-detail", id] }),
      queryClient.invalidateQueries({ queryKey: ["admin-invoice-finance", id] }),
      queryClient.invalidateQueries({ queryKey: ["admin-invoice-payments", id] }),
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["erp-ledger-entries"] }),
    ]);
  };

  const recordPayment = useMutation({
    mutationFn: async () => {
      const amount = Number(paymentAmount || 0);
      if (!id) throw new Error("Invoice id missing");
      if (!amount || amount <= 0) throw new Error("Enter a valid payment amount");
      const idempotencyKey = paymentIdempotencyKey || crypto.randomUUID();
      const combinedNotes = [paymentRef.trim(), paymentNotes.trim()].filter(Boolean).join(" | ") || null;

      const { error } = await (supabase as any).rpc("record_payment", {
        p_reference_type: "invoice",
        p_reference_id: id,
        p_amount: amount,
        p_mode: paymentMode,
        p_idempotency_key: idempotencyKey,
        p_notes: combinedNotes,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Payment recorded.");
      setPaymentAmount("");
      setPaymentMode("bank");
      setPaymentRef("");
      setPaymentIdempotencyKey("");
      setPaymentNotes("");
      setPaymentOpen(false);
      await refreshInvoice();
    },
    onError: (err: any) => toast.error(err.message || "Failed to record payment."),
  });

  const recordRefund = useMutation({
    mutationFn: async () => {
      const amount = Number(refundAmount || 0);
      if (!id) throw new Error("Invoice id missing");
      if (!amount || amount <= 0) throw new Error("Enter a valid refund amount");

      const { error } = await (supabase as any).rpc("record_refund", {
        p_invoice_id: id,
        p_amount: amount,
        p_mode: "bank",
        p_reference_no: null,
        p_notes: refundNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Refund recorded.");
      setRefundAmount("");
      setRefundNotes("");
      setRefundOpen(false);
      await refreshInvoice();
    },
    onError: (err: any) => toast.error(err.message || "Failed to record refund."),
  });

  const cancelInvoice = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Invoice id missing");
      if (!cancelReason.trim()) throw new Error("Cancellation reason is required");
      if (cancelConfirmText.trim() !== "CANCEL") throw new Error('Type "CANCEL" to confirm');

      const { error } = await (supabase as any).rpc("cancel_invoice_with_reversal", {
        p_invoice_id: id,
        p_reason: cancelReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Invoice cancelled with reversal entry.");
      setCancelReason("");
      setCancelConfirmText("");
      setCancelOpen(false);
      await refreshInvoice();
    },
    onError: (err: any) => toast.error(err.message || "Failed to cancel invoice."),
  });

  const displayFinance = useMemo(() => {
    const total = Number(financeMeta?.total ?? invoice?.total ?? 0);
    const paid = Number(financeMeta?.paid_amount ?? 0);
    const outstanding = Number(financeMeta?.balance_amount ?? Math.max(total - paid, 0));
    return { total, paid, outstanding, status: financeMeta?.status || "draft" };
  }, [financeMeta, invoice]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invoice...</p>;
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invoice not found.</p>
        <Link to="/admin/invoices">
          <Button variant="outline">Back to Invoices</Button>
        </Link>
      </div>
    );
  }

  const handleExportInvoice = async () => {
    try {
      const formattedInvoice = formatInvoiceForExport(invoice);
      const filename = generateExportFilename(`invoice-${invoice.invoice_number}`);
      exportToExcel([formattedInvoice], filename);
      toast.success("Invoice exported successfully");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export invoice");
    }
  };

  return (
    <div className="space-y-4">
      <style>
        {`@page { size: A4; margin: 10mm; }
          @media print {
            html, body { background: #fff !important; overflow: visible !important; }
            body * { visibility: hidden !important; }
            #invoice-print-root, #invoice-print-root * { visibility: visible !important; }
            #invoice-print-root {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 190mm !important;
              max-width: 190mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
            }
          }`}
      </style>
      <div className="print:hidden flex items-center gap-2">
        <Link to="/admin/invoices">
          <Button variant="outline">Back to Invoices</Button>
        </Link>
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleExportInvoice}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export Invoice
        </Button>

        {isAdmin ? (
        <Dialog
          open={paymentOpen}
          onOpenChange={(open) => {
            setPaymentOpen(open);
            if (open) {
              setPaymentIdempotencyKey(crypto.randomUUID());
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline">Record Payment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>
                Canonical receipt posting with idempotency protection and ledger sync.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Amount</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-mode">Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger id="payment-mode">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-ref">Reference</Label>
                <Input
                  id="payment-ref"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="UTR / Transaction ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-notes">Notes</Label>
                <Textarea
                  id="payment-notes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
              <Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>
                {recordPayment.isPending ? "Saving..." : "Save Payment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        ) : (
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Financial actions: admin only</p>
        )}

        {isAdmin && (
        <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">Record Refund</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Refund</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="refund-amount">Amount</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refund-notes">Reason / Notes</Label>
                <Textarea
                  id="refund-notes"
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  placeholder="Refund reason"
                />
              </div>
              <Button onClick={() => recordRefund.mutate()} disabled={recordRefund.isPending}>
                {recordRefund.isPending ? "Saving..." : "Save Refund"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        )}

        {isAdmin && (
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">Cancel Invoice</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Invoice</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Cancellation Reason</Label>
                <Textarea
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Mandatory for audit trail"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-confirm">Type CANCEL to confirm</Label>
                <Input
                  id="cancel-confirm"
                  value={cancelConfirmText}
                  onChange={(e) => setCancelConfirmText(e.target.value)}
                  placeholder="CANCEL"
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => cancelInvoice.mutate()}
                disabled={cancelInvoice.isPending || cancelConfirmText.trim() !== "CANCEL"}
              >
                {cancelInvoice.isPending ? "Cancelling..." : "Cancel and Reverse"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="print:hidden grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</p>
          <p className="text-sm font-medium mt-1">{displayFinance.status}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total</p>
          <p className="text-sm font-medium mt-1">₹{displayFinance.total.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Paid</p>
          <p className="text-sm font-medium mt-1 text-green-600">₹{displayFinance.paid.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Outstanding</p>
          <p className="text-sm font-medium mt-1 text-amber-600">₹{displayFinance.outstanding.toFixed(2)}</p>
        </div>
      </div>

      {isAdmin && paymentHistory.length > 0 && (
        <div className="print:hidden rounded-md border border-border">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Payment history</p>
            <p className="text-xs text-muted-foreground">Latest canonical receipts against this invoice.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Idempotency Key</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentHistory.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{new Date(payment.payment_date || payment.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="capitalize">{payment.payment_mode}</TableCell>
                  <TableCell className="text-right">₹{Number(payment.amount || 0).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs">{payment.idempotency_key}</TableCell>
                  <TableCell>{payment.notes || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <InvoiceDocument invoice={invoice} />
    </div>
  );
};

export default InvoicePage;
