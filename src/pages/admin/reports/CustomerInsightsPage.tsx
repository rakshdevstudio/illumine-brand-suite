import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CustomerOutstandingRow = {
  customer_id: string | null;
  customer_name: string;
  phone: string | null;
  total_invoices: number;
  total_sales: number;
  total_collected: number;
  total_outstanding: number;
  overdue_outstanding: number;
  last_payment_date: string | null;
  last_invoice_date: string | null;
};

type CustomerInvoiceOutstandingRow = {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total: number;
  paid_amount: number;
  outstanding: number;
  payment_status: string;
  is_overdue: boolean;
};

const PAGE_SIZE = 20;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value || 0);

const CustomerInsightsPage = () => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOutstandingRow | null>(null);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["erp-customer-outstanding"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_customer_outstanding")
        .select("customer_id, customer_name, phone, total_invoices, total_sales, total_collected, total_outstanding, overdue_outstanding, last_payment_date, last_invoice_date")
        .order("total_outstanding", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CustomerOutstandingRow[];
    },
  });

  const { data: customerInvoices = [], isFetching: invoicesLoading } = useQuery({
    queryKey: [
      "erp-customer-invoices-outstanding",
      selectedCustomer?.customer_id ?? null,
      selectedCustomer?.phone ?? null,
      selectedCustomer?.customer_name ?? null,
    ],
    enabled: !!selectedCustomer,
    queryFn: async () => {
      let request = (supabase as any)
        .from("v_invoice_outstanding")
        .select("invoice_id, invoice_number, invoice_date, due_date, total, paid_amount, outstanding, payment_status, is_overdue")
        .order("invoice_date", { ascending: false });

      if (selectedCustomer?.customer_id) {
        request = request.eq("customer_id", selectedCustomer.customer_id);
      } else if (selectedCustomer?.phone) {
        request = request.eq("phone", selectedCustomer.phone);
      } else if (selectedCustomer?.customer_name) {
        request = request.ilike("customer_name", selectedCustomer.customer_name);
      }

      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as CustomerInvoiceOutstandingRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => [row.customer_name ?? "", row.phone ?? ""].join(" ").toLowerCase().includes(q));
  }, [data, search]);

  const summary = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => {
          acc.invoices += Number(row.total_invoices || 0);
          acc.sales += Number(row.total_sales || 0);
          acc.collected += Number(row.total_collected || 0);
          acc.outstanding += Number(row.total_outstanding || 0);
          acc.overdue += Number(row.overdue_outstanding || 0);
          return acc;
        },
        { invoices: 0, sales: 0, collected: 0, outstanding: 0, overdue: 0 },
      ),
    [filtered],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const onExport = () => {
    const csv = [
      ["Customer", "Phone", "Invoices", "Total Sales", "Collected", "Outstanding", "Overdue", "Last Payment", "Last Invoice"],
      ...filtered.map((row) => [
        row.customer_name ?? "-",
        row.phone ?? "-",
        row.total_invoices,
        row.total_sales,
        row.total_collected,
        row.total_outstanding,
        row.overdue_outstanding,
        row.last_payment_date ? new Date(row.last_payment_date).toLocaleDateString("en-IN") : "-",
        row.last_invoice_date ? new Date(row.last_invoice_date).toLocaleDateString("en-IN") : "-",
      ]),
    ]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer_outstanding_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Customer Outstanding Summary</h1>
        <Button variant="outline" onClick={onExport} disabled={!filtered.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Invoices</CardTitle></CardHeader>
          <CardContent className="text-base font-medium">{summary.invoices}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Sales</CardTitle></CardHeader>
          <CardContent className="text-base font-medium">{formatCurrency(summary.sales)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Collected</CardTitle></CardHeader>
          <CardContent className="text-base font-medium text-emerald-700">{formatCurrency(summary.collected)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding</CardTitle></CardHeader>
          <CardContent className="text-base font-semibold text-red-700">{formatCurrency(summary.outstanding)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Overdue</CardTitle></CardHeader>
          <CardContent className="text-base font-semibold text-red-700">{formatCurrency(summary.overdue)}</CardContent>
        </Card>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load customer insights: {(error as Error).message}
        </div>
      )}

      <div className="max-w-md">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer by name or phone" />
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Invoices</TableHead>
              <TableHead>Total Sales</TableHead>
              <TableHead>Collected</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Last Payment</TableHead>
              <TableHead>Last Invoice</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && !rows.length && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No customer insights found.</TableCell></TableRow>
            )}
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading customer insights...</TableCell></TableRow>
            )}
            {rows.map((row, index) => {
              const rowKey = row.customer_id
                ? `customer-${row.customer_id}`
                : `customer-unknown-${row.customer_name}-${row.phone ?? "no-phone"}-${row.last_invoice_date ?? "no-invoice-date"}-${index}`;

              return (
              <TableRow key={rowKey}>
                <TableCell>
                  <div className="text-sm">{row.customer_name || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.phone || "-"}</div>
                </TableCell>
                <TableCell>{row.total_invoices}</TableCell>
                <TableCell>{formatCurrency(row.total_sales)}</TableCell>
                <TableCell className="text-emerald-700">{formatCurrency(row.total_collected)}</TableCell>
                <TableCell className="font-semibold text-red-700">{formatCurrency(row.total_outstanding)}</TableCell>
                <TableCell>{row.last_payment_date ? new Date(row.last_payment_date).toLocaleDateString("en-IN") : "-"}</TableCell>
                <TableCell>{row.last_invoice_date ? new Date(row.last_invoice_date).toLocaleDateString("en-IN") : "-"}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setSelectedCustomer(row)}>
                    View Details
                  </Button>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-base tracking-[0.08em] uppercase">Customer Invoice Insights</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Customer</CardTitle></CardHeader>
              <CardContent className="text-sm font-medium">{selectedCustomer?.customer_name ?? "-"}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Phone</CardTitle></CardHeader>
              <CardContent className="text-sm font-medium">{selectedCustomer?.phone ?? "-"}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Outstanding</CardTitle></CardHeader>
              <CardContent className="text-sm font-semibold text-red-700">{formatCurrency(selectedCustomer?.total_outstanding ?? 0)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Overdue</CardTitle></CardHeader>
              <CardContent className="text-sm font-semibold text-red-700">{formatCurrency(selectedCustomer?.overdue_outstanding ?? 0)}</CardContent>
            </Card>
          </div>

          <div className="rounded-md border border-border/70 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Loading invoices...</TableCell>
                  </TableRow>
                ) : customerInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No invoices found for this customer.</TableCell>
                  </TableRow>
                ) : (
                  customerInvoices.map((invoice) => (
                    <TableRow key={invoice.invoice_id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>{new Date(invoice.invoice_date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell>{new Date(invoice.due_date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell>{formatCurrency(invoice.total)}</TableCell>
                      <TableCell className="text-emerald-700">{formatCurrency(invoice.paid_amount)}</TableCell>
                      <TableCell className={invoice.outstanding > 0 ? "font-semibold text-red-700" : "text-emerald-700"}>
                        {formatCurrency(invoice.outstanding)}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs capitalize">{invoice.payment_status}</span>
                        {invoice.is_overdue ? <span className="ml-2 text-xs text-red-600">Overdue</span> : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Page {currentPage} / {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CustomerInsightsPage;
