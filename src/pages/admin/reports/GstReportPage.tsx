import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type GstRow = {
  report_date: string;
  taxable_value: number;
  cgst_collected: number;
  sgst_collected: number;
  invoice_total: number;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value || 0);

const GstReportPage = () => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["erp-gst-sales-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_sales_gst_summary")
        .select("report_date, taxable_value, cgst_collected, sgst_collected, invoice_total")
        .order("report_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GstRow[];
    },
  });

  const rows = useMemo(() => {
    const fromDate = from ? new Date(`${from}T00:00:00`) : null;
    const toDate = to ? new Date(`${to}T23:59:59`) : null;
    return data.filter((row) => {
      const value = new Date(`${row.report_date}T12:00:00`);
      if (fromDate && value < fromDate) return false;
      if (toDate && value > toDate) return false;
      return true;
    });
  }, [data, from, to]);

  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.taxable += Number(row.taxable_value || 0);
          acc.cgst += Number(row.cgst_collected || 0);
          acc.sgst += Number(row.sgst_collected || 0);
          acc.total += Number(row.invoice_total || 0);
          return acc;
        },
        { taxable: 0, cgst: 0, sgst: 0, total: 0 },
      ),
    [rows],
  );

  const onExport = () => {
    const csv = [
      ["Date", "Taxable Value", "CGST", "SGST", "Invoice Total"],
      ...rows.map((row) => [row.report_date, row.taxable_value, row.cgst_collected, row.sgst_collected, row.invoice_total]),
    ]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gst_sales_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">GST Sales Report</h1>
        <Button variant="outline" onClick={onExport} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load GST report: {(error as Error).message}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Taxable Value</CardTitle></CardHeader>
          <CardContent className="text-lg font-medium">{formatCurrency(summary.taxable)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">CGST</CardTitle></CardHeader>
          <CardContent className="text-lg font-medium">{formatCurrency(summary.cgst)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">SGST</CardTitle></CardHeader>
          <CardContent className="text-lg font-medium">{formatCurrency(summary.sgst)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Invoice Total</CardTitle></CardHeader>
          <CardContent className="text-lg font-medium">{formatCurrency(summary.total)}</CardContent>
        </Card>
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Taxable Value</TableHead>
              <TableHead>CGST</TableHead>
              <TableHead>SGST</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && !rows.length && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No report rows found.</TableCell></TableRow>
            )}
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading report...</TableCell></TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.report_date}>
                <TableCell>{new Date(row.report_date).toLocaleDateString("en-IN")}</TableCell>
                <TableCell>{formatCurrency(row.taxable_value)}</TableCell>
                <TableCell>{formatCurrency(row.cgst_collected)}</TableCell>
                <TableCell>{formatCurrency(row.sgst_collected)}</TableCell>
                <TableCell>{formatCurrency(row.invoice_total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default GstReportPage;
