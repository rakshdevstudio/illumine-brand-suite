import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, IndianRupee } from "lucide-react";

type OutstandingInvoiceRow = {
  invoice_id: string;
  invoice_number: string;
  order_id: string;
  customer_id: string | null;
  customer_name: string;
  phone: string | null;
  invoice_date: string;
  due_date: string;
  total: number;
  paid_amount: number;
  outstanding: number;
  payment_status: "paid" | "partial" | "unpaid";
  is_overdue: boolean;
  days_overdue: number;
  last_payment_date: string | null;
};

type OutstandingSummary = {
  total_sales: number;
  total_collected: number;
  total_outstanding: number;
  overdue_amount: number;
  today_collection: number;
  month_collection: number;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(
    Number(value || 0),
  );

const toDateDisplay = (dateValue: string | null | undefined) => {
  if (!dateValue) return "-";
  return new Date(dateValue).toLocaleDateString("en-IN");
};

const paymentStatusClass = (status: string, isOverdue: boolean) => {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "partial") return "bg-amber-50 text-amber-700 border-amber-200";
  if (isOverdue) return "bg-red-50 text-red-700 border-red-200";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
};

const exportRowsToCsv = (rows: OutstandingInvoiceRow[], filename: string) => {
  const csv = [
    [
      "Invoice No",
      "Customer Name",
      "Phone",
      "Invoice Date",
      "Due Date",
      "Total",
      "Paid",
      "Outstanding",
      "Status",
      "Overdue",
      "Days Overdue",
      "Last Payment Date",
    ],
    ...rows.map((row) => [
      row.invoice_number,
      row.customer_name,
      row.phone ?? "-",
      row.invoice_date,
      row.due_date,
      row.total,
      row.paid_amount,
      row.outstanding,
      row.payment_status,
      row.is_overdue ? "Yes" : "No",
      row.days_overdue,
      row.last_payment_date ?? "-",
    ]),
  ]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const InvoicesPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [minOutstanding, setMinOutstanding] = useState("");
  const [maxOutstanding, setMaxOutstanding] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<OutstandingInvoiceRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("bank");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const { data: invoices = [], isLoading, error: invoicesError } = useQuery({
    queryKey: ["admin-outstanding-invoices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_invoice_outstanding")
        .select("invoice_id, invoice_number, order_id, customer_id, customer_name, phone, invoice_date, due_date, total, paid_amount, outstanding, payment_status, is_overdue, days_overdue, last_payment_date")
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      return (data ?? []) as OutstandingInvoiceRow[];
    },
  });

  const { data: summary, error: summaryError } = useQuery({
    queryKey: ["admin-outstanding-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_outstanding_dashboard_summary")
        .select("total_sales, total_collected, total_outstanding, overdue_amount, today_collection, month_collection")
        .single();
      if (error) throw error;
      return data as OutstandingSummary;
    },
  });

  const queryError = (invoicesError || summaryError) as any;

  const recordPayment = useMutation({
    mutationFn: async () => {
      const amount = Number(paymentAmount || 0);
      if (!selectedInvoice?.invoice_id) throw new Error("Invoice id missing");
      if (!amount || amount <= 0) throw new Error("Enter a valid amount");
      if (amount > Number(selectedInvoice.outstanding || 0)) {
        throw new Error("Amount cannot exceed outstanding balance");
      }

      const idempotencyKey = paymentRef.trim() || crypto.randomUUID();
      const notes = paymentNotes.trim() || null;
      const { error } = await (supabase as any).rpc("record_payment", {
        p_reference_type: "invoice",
        p_reference_id: selectedInvoice.invoice_id,
        p_amount: amount,
        p_mode: paymentMode,
        p_idempotency_key: idempotencyKey,
        p_notes: notes,
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Payment recorded");
      setPaymentOpen(false);
      setSelectedInvoice(null);
      setPaymentAmount("");
      setPaymentMode("bank");
      setPaymentRef("");
      setPaymentNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["erp-customer-outstanding"] }),
        queryClient.invalidateQueries({ queryKey: ["report-outstanding-invoice-wise"] }),
        queryClient.invalidateQueries({ queryKey: ["report-outstanding-aging"] }),
      ]);
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to record payment");
    },
  });

  const filtered = useMemo(() => {
    const customerQuery = customerFilter.trim().toLowerCase();
    const minValue = minOutstanding ? Number(minOutstanding) : null;
    const maxValue = maxOutstanding ? Number(maxOutstanding) : null;

    return invoices.filter((invoice) => {
      if (statusFilter === "paid" && invoice.payment_status !== "paid") return false;
      if (statusFilter === "unpaid" && invoice.payment_status !== "unpaid") return false;
      if (statusFilter === "partial" && invoice.payment_status !== "partial") return false;
      if (statusFilter === "overdue" && !invoice.is_overdue) return false;

      const invoiceDate = new Date(`${invoice.invoice_date}T00:00:00`);
      if (startDate) {
        const start = new Date(`${startDate}T00:00:00`);
        if (invoiceDate < start) return false;
      }

      if (endDate) {
        const end = new Date(`${endDate}T23:59:59`);
        if (invoiceDate > end) return false;
      }

      if (customerQuery) {
        const searchable = `${invoice.customer_name} ${invoice.phone ?? ""} ${invoice.invoice_number}`.toLowerCase();
        if (!searchable.includes(customerQuery)) return false;
      }

      if (minValue !== null && !Number.isNaN(minValue) && Number(invoice.outstanding) < minValue) return false;
      if (maxValue !== null && !Number.isNaN(maxValue) && Number(invoice.outstanding) > maxValue) return false;

      return true;
    });
  }, [customerFilter, endDate, invoices, maxOutstanding, minOutstanding, startDate, statusFilter]);

  const handleExportFiltered = async () => {
    try {
      if (filtered.length === 0) {
        toast.error("No rows to export");
        return;
      }

      setIsExporting(true);
      const dateSlug = new Date().toISOString().slice(0, 10);
      exportRowsToCsv(filtered, `outstanding_invoice_report_${dateSlug}.csv`);
      toast.success(`Exported ${filtered.length} rows`);
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  const openQuickPayment = (invoice: OutstandingInvoiceRow) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(String(invoice.outstanding || ""));
    setPaymentMode("bank");
    setPaymentRef("");
    setPaymentNotes("");
    setPaymentOpen(true);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-light tracking-[0.1em] uppercase">Outstanding Dashboard</h1>

      {queryError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load outstanding data: {String(queryError.message || queryError)}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.15em]">Total Sales</CardTitle></CardHeader>
          <CardContent className="text-base font-medium">{formatCurrency(summary?.total_sales || 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.15em]">Total Collected</CardTitle></CardHeader>
          <CardContent className="text-base font-medium text-emerald-700">{formatCurrency(summary?.total_collected || 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.15em]">Total Outstanding</CardTitle></CardHeader>
          <CardContent className="text-base font-semibold text-red-700">{formatCurrency(summary?.total_outstanding || 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.15em]">Overdue Amount</CardTitle></CardHeader>
          <CardContent className="text-base font-semibold text-red-700">{formatCurrency(summary?.overdue_amount || 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.15em]">Today Collection</CardTitle></CardHeader>
          <CardContent className="text-base font-medium">{formatCurrency(summary?.today_collection || 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.15em]">Month Collection</CardTitle></CardHeader>
          <CardContent className="text-base font-medium">{formatCurrency(summary?.month_collection || 0)}</CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">From</p>
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">To</p>
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Customer</p>
          <Input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder="Name / phone / invoice no" />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partially Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Min Outstanding</p>
          <Input type="number" min={0} value={minOutstanding} onChange={(e) => setMinOutstanding(e.target.value)} placeholder="0" />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Max Outstanding</p>
          <Input type="number" min={0} value={maxOutstanding} onChange={(e) => setMaxOutstanding(e.target.value)} placeholder="Any" />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportFiltered}
          disabled={filtered.length === 0 || isExporting}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export Outstanding CSV ({filtered.length})
        </Button>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice No</TableHead>
              <TableHead>Customer Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  Loading outstanding invoices...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No invoices found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((invoice) => (
                <TableRow key={invoice.invoice_id}>
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell>{invoice.customer_name}</TableCell>
                  <TableCell>{toDateDisplay(invoice.invoice_date)}</TableCell>
                  <TableCell>{formatCurrency(invoice.total)}</TableCell>
                  <TableCell className="text-emerald-700">{formatCurrency(invoice.paid_amount)}</TableCell>
                  <TableCell className={invoice.outstanding > 0 ? "font-semibold text-red-700" : "text-emerald-700"}>
                    {formatCurrency(invoice.outstanding)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs capitalize ${paymentStatusClass(invoice.payment_status, invoice.is_overdue)}`}>
                      {invoice.payment_status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>{toDateDisplay(invoice.due_date)}</div>
                    {invoice.is_overdue && invoice.outstanding > 0 ? (
                      <div className="text-xs text-red-600">{invoice.days_overdue} day(s) overdue</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {invoice.outstanding > 0 ? (
                        <Button variant="outline" size="sm" onClick={() => openQuickPayment(invoice)}>
                          <IndianRupee className="mr-1 h-3.5 w-3.5" />
                          Record Payment
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/invoices/${invoice.invoice_id}`)}>
                        View
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) {
            setSelectedInvoice(null);
            setPaymentAmount("");
            setPaymentMode("bank");
            setPaymentRef("");
            setPaymentNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {selectedInvoice
                ? `Invoice ${selectedInvoice.invoice_number} | Outstanding ${formatCurrency(selectedInvoice.outstanding)}`
                : "Record a payment against this invoice."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quick-payment-amount">Amount</Label>
              <Input
                id="quick-payment-amount"
                type="number"
                min={0}
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-payment-mode">Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger id="quick-payment-mode">
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
              <Label htmlFor="quick-payment-reference">Reference (optional)</Label>
              <Input
                id="quick-payment-reference"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="UTR / Transaction id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-payment-notes">Notes</Label>
              <Textarea
                id="quick-payment-notes"
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
    </div>
  );
};

export default InvoicesPage;
