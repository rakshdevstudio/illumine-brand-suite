import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AgingRow = {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  phone: string | null;
  due_date: string;
  outstanding: number;
  days_overdue: number;
  aging_bucket: "0-30" | "31-60" | "61-90" | "90+";
};

const BUCKET_ORDER: Array<AgingRow["aging_bucket"]> = ["0-30", "31-60", "61-90", "90+"];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value || 0);

const AgingReportPage = () => {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["report-outstanding-aging"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_outstanding_aging")
        .select("invoice_id, invoice_number, customer_name, phone, due_date, outstanding, days_overdue, aging_bucket")
        .order("days_overdue", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgingRow[];
    },
  });

  const bucketTotals = useMemo(() => {
    const totals: Record<AgingRow["aging_bucket"], number> = {
      "0-30": 0,
      "31-60": 0,
      "61-90": 0,
      "90+": 0,
    };

    data.forEach((row) => {
      totals[row.aging_bucket] += Number(row.outstanding || 0);
    });

    return totals;
  }, [data]);

  const grandTotal = useMemo(() => data.reduce((sum, row) => sum + Number(row.outstanding || 0), 0), [data]);

  const exportCsv = () => {
    const csv = [
      ["Bucket", "Invoice No", "Customer", "Phone", "Due Date", "Days Overdue", "Outstanding"],
      ...BUCKET_ORDER.flatMap((bucket) =>
        data
          .filter((row) => row.aging_bucket === bucket)
          .map((row) => [
            row.aging_bucket,
            row.invoice_number,
            row.customer_name,
            row.phone ?? "-",
            row.due_date,
            row.days_overdue,
            row.outstanding,
          ]),
      ),
    ]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aging_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Aging Report</h1>
        <Button variant="outline" onClick={exportCsv} disabled={!data.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load aging report: {(error as Error).message}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        {BUCKET_ORDER.map((bucket) => (
          <Card key={bucket}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{bucket} Days</CardTitle></CardHeader>
            <CardContent className="text-base font-semibold text-red-700">{formatCurrency(bucketTotals[bucket])}</CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Grand Total</CardTitle></CardHeader>
          <CardContent className="text-base font-semibold text-red-700">{formatCurrency(grandTotal)}</CardContent>
        </Card>
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead>Invoice No</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Days Overdue</TableHead>
              <TableHead>Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading aging report...</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No aging rows found.</TableCell></TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.invoice_id}>
                  <TableCell>{row.aging_bucket}</TableCell>
                  <TableCell className="font-medium">{row.invoice_number}</TableCell>
                  <TableCell>
                    <div>{row.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{row.phone || "-"}</div>
                  </TableCell>
                  <TableCell>{new Date(row.due_date).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>{row.days_overdue}</TableCell>
                  <TableCell className="font-semibold text-red-700">{formatCurrency(row.outstanding)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AgingReportPage;
