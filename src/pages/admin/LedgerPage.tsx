/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const [taxExpanded, setTaxExpanded] = useState(false);

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

  const entryTypeCounts = useMemo(() => {
    const counts = {
      invoice: entries.filter((e) => (e.reference_type || "").toLowerCase() === "invoice").length,
      payment: entries.filter((e) => (e.reference_type || "").toLowerCase() === "payment").length,
      purchase: entries.filter((e) => (e.reference_type || "").toLowerCase() === "purchase").length,
      other: entries.filter((e) => !["invoice", "payment", "purchase"].includes((e.reference_type || "").toLowerCase())).length,
    };
    return counts;
  }, [entries]);

  const lineSummary = useMemo(() => {
    const inventoryAdded = lines
      .filter((line) => {
        const accountName = (line.accounts?.name || "").toLowerCase();
        return Number(line.debit || 0) > 0 && accountName.includes("inventory");
      })
      .reduce((sum, line) => sum + Number(line.debit || 0), 0);

    const taxCreditReceived = lines
      .filter((line) => {
        const accountName = (line.accounts?.name || "").toLowerCase();
        return Number(line.debit || 0) > 0 && (accountName.includes("cgst") || accountName.includes("sgst") || accountName.includes("igst") || accountName.includes("tax"));
      })
      .reduce((sum, line) => sum + Number(line.debit || 0), 0);

    const incoming = lines.filter((line) => Number(line.debit || 0) > 0);
    const taxIncoming = incoming.filter((line) => {
      const accountName = (line.accounts?.name || "").toLowerCase();
      return accountName.includes("cgst") || accountName.includes("sgst") || accountName.includes("igst") || accountName.includes("tax");
    });
    const incomingNonTax = incoming.filter((line) => !taxIncoming.some((taxLine) => taxLine.id === line.id));
    const outgoing = lines.filter((line) => Number(line.credit || 0) > 0);

    return {
      inventoryAdded,
      taxCreditReceived,
      purchased: lineTotals.credit,
      landedCost: inventoryAdded,
      totalPurchaseValue: lineTotals.credit,
      amountPayable: lineTotals.credit,
      incoming,
      incomingNonTax,
      taxIncoming,
      outgoing,
      isBalanced: Math.abs(lineTotals.debit - lineTotals.credit) < 0.01,
    };
  }, [lines, lineTotals.credit, lineTotals.debit]);

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

      {/* Entry Type Summary Widget */}
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-4 md:gap-3 md:p-4">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Invoices</p>
          <p className="mt-1.5 text-xl font-semibold sm:text-2xl">{entryTypeCounts.invoice}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Payments</p>
          <p className="mt-1.5 text-xl font-semibold sm:text-2xl">{entryTypeCounts.payment}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Purchases</p>
          <p className="mt-1.5 text-xl font-semibold sm:text-2xl">{entryTypeCounts.purchase}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Adjustments</p>
          <p className="mt-1.5 text-xl font-semibold sm:text-2xl">{entryTypeCounts.other}</p>
        </div>
      </div>

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

              {/* Flow Explanation Badges */}
              {selectedEntry.reference_type === "invoice" && (
                <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 sm:p-3">
                  <span className="text-base">📤</span>
                  <div className="text-xs sm:text-sm text-blue-900">
                    <p className="font-medium">Sales Transaction</p>
                    <p className="mt-0.5 text-blue-800">You sold goods → customer owes you money. Accounts Receivable goes up, Revenue is recorded.</p>
                  </div>
                </div>
              )}

              {selectedEntry.reference_type === "purchase" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 sm:p-3">
                  <span className="text-base">📥</span>
                  <div className="text-xs sm:text-sm text-amber-900">
                    <p className="font-medium">Purchase Transaction</p>
                    <p className="mt-0.5 text-amber-800">You bought goods → you owe supplier money. Inventory & Tax receivables go up, Accounts Payable increases.</p>
                  </div>
                </div>
              )}

              {selectedEntry.reference_type === "payment" && (
                <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-2.5 sm:p-3">
                  <span className="text-base">💳</span>
                  <div className="text-xs sm:text-sm text-green-900">
                    <p className="font-medium">Payment Transaction</p>
                    <p className="mt-0.5 text-green-800">You paid cash → Receivable/Payable balance decreases. Cash out, debt down.</p>
                  </div>
                </div>
              )}

              {selectedEntry.reference_type === "cancel" && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 sm:p-3">
                  <span className="text-base">🔄</span>
                  <div className="text-xs sm:text-sm text-red-900">
                    <p className="font-medium">Cancellation / Reversal</p>
                    <p className="mt-0.5 text-red-800">Transaction was cancelled. All original entries are reversed with opposite amounts.</p>
                  </div>
                </div>
              )}

              <div className="rounded-md border border-border bg-muted/20 p-2 sm:p-3">
                {selectedEntry.reference_type === "purchase" && (
                <div className="grid grid-cols-5 gap-1 sm:gap-2 items-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 sm:px-3 sm:py-2">
                          <p className="text-xs text-emerald-700 hidden sm:block">📦 Inventory</p>
                          <p className="text-[10px] text-emerald-700 sm:hidden">📦</p>
                          <p className="font-mono text-sm sm:text-base font-semibold text-emerald-900 text-right">{formatCurrency(lineSummary.inventoryAdded)}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Value of goods added to stock</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <p className="text-center text-muted-foreground text-xs sm:text-sm">+</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 sm:px-3 sm:py-2">
                          <p className="text-xs text-emerald-700 hidden sm:block">🧾 Tax</p>
                          <p className="text-[10px] text-emerald-700 sm:hidden">🧾</p>
                          <p className="font-mono text-sm sm:text-base font-semibold text-emerald-900 text-right">{formatCurrency(lineSummary.taxCreditReceived)}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">GST you can claim back</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <p className="text-center text-muted-foreground text-xs sm:text-sm">→</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1.5 sm:px-3 sm:py-2">
                          <p className="text-xs text-amber-800 hidden sm:block">💰 Payable</p>
                          <p className="text-[10px] text-amber-800 sm:hidden">💰</p>
                          <p className="font-mono text-sm sm:text-lg font-bold text-amber-950 text-right">{formatCurrency(lineSummary.amountPayable)}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Total amount to pay supplier</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                )}
                {selectedEntry.reference_type === "invoice" && (
                <div className="grid grid-cols-5 gap-1 sm:gap-2 items-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 sm:px-3 sm:py-2">
                          <p className="text-xs text-blue-700 hidden sm:block">💰 Receivable</p>
                          <p className="text-[10px] text-blue-700 sm:hidden">💰</p>
                          <p className="font-mono text-sm sm:text-base font-semibold text-blue-900 text-right">{formatCurrency(lineSummary.amountPayable)}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Customer owes you</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <p className="text-center text-muted-foreground text-xs sm:text-sm">=</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 sm:px-3 sm:py-2">
                          <p className="text-xs text-emerald-700 hidden sm:block">📊 Revenue</p>
                          <p className="text-[10px] text-emerald-700 sm:hidden">📊</p>
                          <p className="font-mono text-sm sm:text-base font-semibold text-emerald-900 text-right">{formatCurrency(lineSummary.purchased)}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Revenue earned from sale</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <p className="text-center text-muted-foreground text-xs sm:text-sm">+</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1.5 sm:px-3 sm:py-2">
                          <p className="text-xs text-orange-700 hidden sm:block">🧾 Tax</p>
                          <p className="text-[10px] text-orange-700 sm:hidden">🧾</p>
                          <p className="font-mono text-sm sm:text-base font-semibold text-orange-900 text-right">{formatCurrency(lineSummary.taxCreditReceived)}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">GST you owe tax authority</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                )}
              </div>

              <div className="rounded-md border border-border p-4">
                <p className="text-sm font-medium">
                  {selectedEntry.reference_type === "purchase" && "Purchase Summary"}
                  {selectedEntry.reference_type === "invoice" && "Sales Summary"}
                  {selectedEntry.reference_type === "payment" && "Payment Summary"}
                  {!["purchase", "invoice", "payment"].includes(selectedEntry.reference_type || "") && "Entry Summary"}
                </p>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  {selectedEntry.reference_type === "purchase" && (
                    <>
                      <p>You Purchased: <span className="font-medium">{formatCurrency(lineSummary.purchased)}</span></p>
                      <p>Landed Cost (Inventory only): <span className="font-medium">{formatCurrency(lineSummary.landedCost)}</span></p>
                      <p>🧾 Tax Credit Received: <span className="font-medium">{formatCurrency(lineSummary.taxCreditReceived)}</span></p>
                      <p>Total Purchase Value: <span className="font-medium">{formatCurrency(lineSummary.totalPurchaseValue)}</span></p>
                    </>
                  )}
                  {selectedEntry.reference_type === "invoice" && (
                    <>
                      <p>You Sold: <span className="font-medium">{formatCurrency(lineSummary.purchased)}</span></p>
                      <p>Total Receivable: <span className="font-medium">{formatCurrency(lineSummary.amountPayable)}</span></p>
                      <p>🧾 Tax Output Liability: <span className="font-medium">{formatCurrency(lineSummary.taxCreditReceived)}</span></p>
                    </>
                  )}
                  {selectedEntry.reference_type === "payment" && (
                    <>
                      <p>Amount Paid: <span className="font-medium">{formatCurrency(lineSummary.amountPayable)}</span></p>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <div className="flex items-center gap-2">
                          Account
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="inline-flex text-muted-foreground" aria-label="Ledger explanation">
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                <p>Debit = Value coming into your business</p>
                                <p>Credit = Value going out or payable</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!loadingLines && !lines.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8">
                          <p className="text-sm text-muted-foreground">No ledger lines found for this entry</p>
                        </TableCell>
                      </TableRow>
                    )}
                    {loadingLines && (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Loading lines...</TableCell></TableRow>
                    )}
                    {!loadingLines && !!lineSummary.incoming.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="bg-emerald-50 text-xs font-medium uppercase tracking-[0.14em] text-emerald-800">Incoming (Debit)</TableCell>
                      </TableRow>
                    )}
                    {lineSummary.incomingNonTax.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.accounts?.code || "-"} · {line.accounts?.name || "-"}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(line.debit || 0))}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(line.credit || 0))}</TableCell>
                      </TableRow>
                    ))}
                    {!!lineSummary.taxIncoming.length && (
                      <>
                        <TableRow>
                          <TableCell>
                            <button type="button" className="text-left text-sm font-medium" onClick={() => setTaxExpanded((prev) => !prev)}>
                              🧾 Tax Credit {taxExpanded ? "(hide details)" : "(expandable)"}
                            </button>
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(lineSummary.taxCreditReceived)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(0)}</TableCell>
                        </TableRow>
                        {taxExpanded && lineSummary.taxIncoming.map((line) => (
                          <TableRow key={line.id} className="bg-emerald-50/40">
                            <TableCell className="pl-8 text-muted-foreground">- {line.accounts?.name || "Tax"}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(Number(line.debit || 0))}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(Number(line.credit || 0))}</TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                    {!loadingLines && !!lineSummary.outgoing.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="bg-amber-50 text-xs font-medium uppercase tracking-[0.14em] text-amber-800">Outgoing (Credit)</TableCell>
                      </TableRow>
                    )}
                    {lineSummary.outgoing.map((line) => {
                      const accountName = (line.accounts?.name || "").toLowerCase();
                      const isPayable = accountName.includes("payable");
                      return (
                        <TableRow key={line.id} className={isPayable ? "bg-amber-100/80" : undefined}>
                          <TableCell className={isPayable ? "font-semibold" : undefined}>
                            {line.accounts?.code || "-"} · {line.accounts?.name || "-"}
                            {isPayable && <p className="mt-0.5 text-xs font-normal text-muted-foreground">Amount you owe supplier</p>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(Number(line.debit || 0))}</TableCell>
                          <TableCell className={isPayable ? "text-right font-mono text-lg font-bold" : "text-right font-mono"}>{formatCurrency(Number(line.credit || 0))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Total Value Received (Debit)</p>
                  <p className="mt-1 font-mono text-sm font-medium">{formatCurrency(lineTotals.debit)}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Total Amount Payable (Credit)</p>
                  <p className="mt-1 font-mono text-sm font-medium">{formatCurrency(lineTotals.credit)}</p>
                </div>
              </div>

              <p className="text-sm text-emerald-700">
                {lineSummary.isBalanced ? "✔ Balanced Entry: What you received = what you owe" : "Entry not balanced: please review debit/credit lines"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LedgerPage;
