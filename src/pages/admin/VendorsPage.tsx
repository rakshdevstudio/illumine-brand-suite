import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const PAGE_SIZE = 12;

type VendorRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  payment_terms_days: number;
  is_active: boolean;
  created_at: string;
};

const toCsv = (rows: VendorRow[]) => {
  const headers = ["Name", "Phone", "Email", "GSTIN", "Payment Terms", "Status", "Created At"];
  const lines = rows.map((row) => [
    row.name,
    row.phone ?? "",
    row.email ?? "",
    row.gstin ?? "",
    String(row.payment_terms_days),
    row.is_active ? "Active" : "Inactive",
    new Date(row.created_at).toLocaleString("en-IN"),
  ]);
  return [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
};

const VendorsPage = () => {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");

  const { data, isLoading, error } = useQuery({
    queryKey: ["erp-vendors"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendors")
        .select("id, name, phone, email, gstin, payment_terms_days, is_active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VendorRow[];
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = data ?? [];
    if (!query) return source;
    return source.filter((row) =>
      [row.name, row.phone ?? "", row.email ?? "", row.gstin ?? ""].join(" ").toLowerCase().includes(query),
    );
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage]);

  const createVendor = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Vendor name is required");

      const { error } = await (supabase as any).from("vendors").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        state_code: stateCode.trim().toUpperCase() || null,
        payment_terms_days: Number(paymentTermsDays || 30),
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Vendor created.");
      setName("");
      setPhone("");
      setEmail("");
      setGstin("");
      setStateCode("");
      setPaymentTermsDays("30");
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["erp-vendors"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to create vendor."),
  });

  const onExport = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-light tracking-[0.1em] uppercase">Vendors</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{rows.length} records</p>
        </div>
        <Button variant="outline" onClick={onExport} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>Add Vendor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Vendor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vendor-name">Name</Label>
                <Input id="vendor-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vendor-phone">Phone</Label>
                  <Input id="vendor-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-email">Email</Label>
                  <Input id="vendor-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vendor-gstin">GSTIN</Label>
                  <Input id="vendor-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="GSTIN" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vendor-state">State Code</Label>
                  <Input id="vendor-state" value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="KA / MH / DL" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-terms">Payment Terms (days)</Label>
                <Input
                  id="vendor-terms"
                  type="number"
                  min={0}
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value)}
                  placeholder="30"
                />
              </div>
              <Button onClick={() => createVendor.mutate()} disabled={createVendor.isPending}>
                {createVendor.isPending ? "Creating..." : "Create Vendor"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load vendors: {(error as Error).message}
        </div>
      )}

      <div className="max-w-md relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor name, phone, email, GSTIN" />
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && !paged.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  No vendors found.
                </TableCell>
              </TableRow>
            )}
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                  Loading vendors...
                </TableCell>
              </TableRow>
            )}
            {paged.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <div className="text-sm">{row.phone || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.email || "-"}</div>
                </TableCell>
                <TableCell>{row.gstin || "-"}</TableCell>
                <TableCell>{row.payment_terms_days} days</TableCell>
                <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                <TableCell>{new Date(row.created_at).toLocaleDateString("en-IN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Page {currentPage} / {totalPages}
        </p>
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

export default VendorsPage;
