import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LedgerEntryRow = {
  id: string;
  entry_number: string;
  entry_date: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

type LedgerLineRow = {
  id: string;
  ledger_entry_id: string;
  debit: number;
  credit: number;
  accounts: { code: string; name: string } | null;
};

const PAGE_SIZE = 15;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value || 0);

const LedgerPage = () => {
  const [search, setSearch] = useState("");
  const [referenceType, setReferenceType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntryRow | null>(null);

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ["erp-ledger-entries"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ledger_entries")
        .select("id, entry_number, entry_date, reference_type, reference_id, description, created_at")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LedgerEntryRow[];
    },
  });

  const { data: lines = [], isLoading: loadingLines } = useQuery({
    queryKey: ["erp-ledger-lines", selectedEntry?.id],
    enabled: Boolean(selectedEntry),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ledger_entry_lines")
        .select("id, ledger_entry_id, debit, credit, accounts(code, name)")
        .eq("ledger_entry_id", selectedEntry!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LedgerLineRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromDate = from ? new Date(`${from}T00:00:00`) : null;
    const toDate = to ? new Date(`${to}T23:59:59`) : null;

    return entries.filter((row) => {
      if (referenceType !== "all" && (row.reference_type || "") !== referenceType) return false;
      if (q) {
        const hay = [row.entry_number, row.reference_type || "", row.reference_id || "", row.description || ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const value = new Date(`${row.entry_date}T12:00:00`);
      if (fromDate && value < fromDate) return false;
      if (toDate && value > toDate) return false;
      return true;
    });
  }, [entries, search, referenceType, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const onExport = () => {
    const csv = [
      ["Entry #", "Date", "Reference Type", "Reference ID", "Description"],
      ...filtered.map((row) => [
        row.entry_number,
        row.entry_date,
        row.reference_type || "",
        row.reference_id || "",
        row.description || "",
      ]),
    ]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lineTotals = useMemo(
    () =>
      lines.reduce(
        (acc, line) => {
          acc.debit += Number(line.debit || 0);
          acc.credit += Number(line.credit || 0);
          return acc;
        },
        { debit: 0, credit: 0 },
      ),
    [lines],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Ledger</h1>
        <Button variant="outline" onClick={onExport} disabled={!filtered.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load ledger: {(error as Error).message}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entry #, reference or description" />
        <Select value={referenceType} onValueChange={setReferenceType}>
          <SelectTrigger>
            <SelectValue placeholder="Reference type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="purchase">Purchase</SelectItem>
            <SelectItem value="invoice_cancel">Invoice Cancel</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && !paged.length && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No ledger entries found.</TableCell></TableRow>
            )}
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading ledger entries...</TableCell></TableRow>
            )}
            {paged.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.entry_number}</TableCell>
                <TableCell>{new Date(row.entry_date).toLocaleDateString("en-IN")}</TableCell>
                <TableCell>
                  <div className="text-sm">{row.reference_type || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.reference_id?.slice(0, 8) || "-"}</div>
                </TableCell>
                <TableCell>{row.description || "-"}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => setSelectedEntry(row)}>View Lines</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Page {currentPage} / {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ledger Entry Lines</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {selectedEntry.entry_number} · {selectedEntry.reference_type || "-"} · {selectedEntry.reference_id || "-"}
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!loadingLines && !lines.length && (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No lines found.</TableCell></TableRow>
                    )}
                    {loadingLines && (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Loading lines...</TableCell></TableRow>
                    )}
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.accounts?.code || "-"} · {line.accounts?.name || "-"}</TableCell>
                        <TableCell>{formatCurrency(Number(line.debit || 0))}</TableCell>
                        <TableCell>{formatCurrency(Number(line.credit || 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Total Debit</p>
                  <p className="text-base font-medium mt-1">{formatCurrency(lineTotals.debit)}</p>
                </div>
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Total Credit</p>
                  <p className="text-base font-medium mt-1">{formatCurrency(lineTotals.credit)}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LedgerPage;
