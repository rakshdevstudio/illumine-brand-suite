import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OutstandingInvoiceRow = {
  invoice_id: string;
  invoice_number: string;
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
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value || 0);

const OutstandingReportPage = () => {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["report-outstanding-invoice-wise"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_invoice_outstanding")
        .select("invoice_id, invoice_number, customer_name, phone, invoice_date, due_date, total, paid_amount, outstanding, payment_status, is_overdue, days_overdue")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OutstandingInvoiceRow[];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromDate = from ? new Date(`${from}T00:00:00`) : null;
    const toDate = to ? new Date(`${to}T23:59:59`) : null;

    return data.filter((row) => {
      if (statusFilter === "overdue" && !row.is_overdue) return false;
      if (statusFilter === "paid" && row.payment_status !== "paid") return false;
      if (statusFilter === "partial" && row.payment_status !== "partial") return false;
      if (statusFilter === "unpaid" && row.payment_status !== "unpaid") return false;

      if (q) {
        const searchable = `${row.invoice_number} ${row.customer_name} ${row.phone ?? ""}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      const invoiceDate = new Date(`${row.invoice_date}T00:00:00`);
      if (fromDate && invoiceDate < fromDate) return false;
      if (toDate && invoiceDate > toDate) return false;
      return true;
    });
  }, [data, from, search, statusFilter, to]);

  const metrics = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.sales += Number(row.total || 0);
          acc.collected += Number(row.paid_amount || 0);
          acc.outstanding += Number(row.outstanding || 0);
          if (row.is_overdue) acc.overdue += Number(row.outstanding || 0);
          return acc;
        },
        { sales: 0, collected: 0, outstanding: 0, overdue: 0 },
      ),
    [rows],
  );

  const exportCsv = () => {
    const csv = [
      ["Invoice No", "Customer", "Phone", "Invoice Date", "Due Date", "Total", "Paid", "Outstanding", "Status", "Overdue", "Days Overdue"],
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
      ]),
    ]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outstanding_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Outstanding Report</h1>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load outstanding report: {(error as Error).message}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Sales</CardTitle></CardHeader>
          <CardContent className="text-base font-medium">{formatCurrency(metrics.sales)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Collected</CardTitle></CardHeader>
          <CardContent className="text-base font-medium text-emerald-700">{formatCurrency(metrics.collected)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding</CardTitle></CardHeader>
          <CardContent className="text-base font-semibold text-red-700">{formatCurrency(metrics.outstanding)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Overdue</CardTitle></CardHeader>
          <CardContent className="text-base font-semibold text-red-700">{formatCurrency(metrics.overdue)}</CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Input placeholder="Search customer / invoice" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partially Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice No</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No rows found.</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.invoice_id}>
                  <TableCell className="font-medium">{row.invoice_number}</TableCell>
                  <TableCell>
                    <div>{row.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{row.phone || "-"}</div>
                  </TableCell>
                  <TableCell>{new Date(row.invoice_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>{new Date(row.due_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>{formatCurrency(row.total)}</TableCell>
                  <TableCell className="text-emerald-700">{formatCurrency(row.paid_amount)}</TableCell>
                  <TableCell className={row.outstanding > 0 ? "font-semibold text-red-700" : "text-emerald-700"}>{formatCurrency(row.outstanding)}</TableCell>
                  <TableCell>
                    <span className="text-xs capitalize">{row.payment_status}</span>
                    {row.is_overdue ? <span className="ml-2 text-xs text-red-600">Overdue</span> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OutstandingReportPage;
