/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, Plus, Search, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const PAGE_SIZE = 12;

type SellerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  payment_terms_days: number;
  is_active: boolean;
  status?: string | null;
  commission_rate?: number | null;
  created_at: string;
};

type ApprovalRow = {
  id: string;
  seller_id: string | null;
  seller_product_id: string | null;
  approval_type: string;
  status: string;
  title: string;
  details: Record<string, any> | null;
  admin_note: string | null;
  created_at: string;
  sellers?: { name?: string | null; email?: string | null } | null;
  seller_products?: { name?: string | null; category?: string | null; base_price?: number | null } | null;
};

type PayoutRow = {
  id: string;
  seller_id: string;
  payout_number: string;
  status: string;
  gross_sales: number;
  commission_amount: number;
  net_payable: number;
  paid_amount: number;
  created_at: string;
  sellers?: { name?: string | null } | null;
};

const toCsv = (rows: SellerRow[]) => {
  const headers = ["Name", "Phone", "Email", "GSTIN", "Payment Terms", "Commission", "Status", "Created At"];
  const lines = rows.map((row) => [
    row.name,
    row.phone ?? "",
    row.email ?? "",
    row.gstin ?? "",
    String(row.payment_terms_days),
    `${row.commission_rate ?? 0}%`,
    row.status ?? (row.is_active ? "Active" : "Inactive"),
    new Date(row.created_at).toLocaleString("en-IN"),
  ]);
  return [headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
};

const SellersPage = () => {
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
  const [commissionRate, setCommissionRate] = useState("15");
  const [approvalNote, setApprovalNote] = useState("");
  const [payoutReference, setPayoutReference] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-sellers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sellers")
        .select("id, name, phone, email, gstin, payment_terms_days, is_active, status, commission_rate, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SellerRow[];
    },
  });

  const { data: approvals, isLoading: approvalsLoading } = useQuery({
    queryKey: ["seller-approvals"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seller_approvals")
        .select("*, sellers(name, email), seller_products(name, category, base_price)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApprovalRow[];
    },
  });

  const { data: payouts, isLoading: payoutsLoading } = useQuery({
    queryKey: ["admin-seller-payouts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seller_payouts")
        .select("*, sellers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayoutRow[];
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

  const createSeller = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Seller name is required");

      const { data: seller, error } = await (supabase as any).from("sellers").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        state_code: stateCode.trim().toUpperCase() || null,
        payment_terms_days: Number(paymentTermsDays || 30),
        commission_rate: Number(commissionRate || 15),
        status: "pending_approval",
        is_active: false,
      }).select("id, name, email").single();
      if (error) throw error;

      const { error: approvalError } = await (supabase as any).from("seller_approvals").insert({
        seller_id: seller.id,
        approval_type: "vendor_registration",
        title: `Seller approval: ${seller.name}`,
        details: { email: seller.email, commission_rate: Number(commissionRate || 15) },
      });
      if (approvalError) throw approvalError;
    },
    onSuccess: async () => {
      toast.success("Seller created.");
      setName("");
      setPhone("");
      setEmail("");
      setGstin("");
      setStateCode("");
      setPaymentTermsDays("30");
      setCommissionRate("15");
      setCreateOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketplace-sellers"] }),
        queryClient.invalidateQueries({ queryKey: ["seller-approvals"] }),
      ]);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create seller."),
  });

  const reviewApproval = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "changes_requested" }) => {
      const { error } = await (supabase as any).rpc("review_seller_approval", {
        p_approval_id: id,
        p_status: status,
        p_admin_note: approvalNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Seller approval updated.");
      setApprovalNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["seller-approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-sellers"] }),
      ]);
    },
    onError: (err: any) => toast.error(err.message || "Failed to review approval."),
  });

  const markPayoutPaid = useMutation({
    mutationFn: async (payout: PayoutRow) => {
      const { error } = await (supabase as any).rpc("mark_seller_payout_paid", {
        p_payout_id: payout.id,
        p_paid_amount: Number(payout.net_payable ?? 0),
        p_payment_reference: payoutReference.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Payout marked paid.");
      setPayoutReference("");
      await queryClient.invalidateQueries({ queryKey: ["admin-seller-payouts"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to mark payout paid."),
  });

  const deleteSeller = useMutation({
    mutationFn: async (sellerId: string) => {
      const { error } = await (supabase as any).from("sellers").delete().eq("id", sellerId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Seller deleted.");
      await queryClient.invalidateQueries({ queryKey: ["marketplace-sellers"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete seller."),
  });

  const onExport = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sellers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-light tracking-[0.1em] uppercase">Sellers</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">{rows.length} records</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="rounded-full bg-white/80" onClick={onExport} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Seller
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[28px] border-white/60 bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_32px_120px_-44px_rgba(15,23,42,0.55)]">
              <DialogHeader>
                <DialogTitle className="text-lg font-light tracking-[0.06em]">Create Seller</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="seller-name">Name</Label>
                  <Input id="seller-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seller name" className="rounded-2xl" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="seller-phone">Phone</Label>
                    <Input id="seller-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-2xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seller-email">Email</Label>
                    <Input id="seller-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-2xl" />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="seller-gstin">GSTIN</Label>
                    <Input id="seller-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="GSTIN" className="rounded-2xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seller-state">State Code</Label>
                    <Input id="seller-state" value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="KA / MH / DL" className="rounded-2xl" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seller-terms">Payment Terms (days)</Label>
                  <Input
                    id="seller-terms"
                    type="number"
                    min={0}
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value)}
                    placeholder="30"
                    className="rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seller-commission">Commission (%)</Label>
                  <Input
                    id="seller-commission"
                    type="number"
                    min={0}
                    max={100}
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder="15"
                    className="rounded-2xl"
                  />
                </div>
                <Button onClick={() => createSeller.mutate()} disabled={createSeller.isPending} className="rounded-full">
                  {createSeller.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Seller"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load sellers: {(error as Error).message}
        </div>
      )}

      <Tabs defaultValue="sellers" className="space-y-5">
        <TabsList className="rounded-full bg-white p-1">
          <TabsTrigger value="sellers" className="rounded-full">Seller Directory</TabsTrigger>
          <TabsTrigger value="approvals" className="rounded-full">Approval Queue</TabsTrigger>
          <TabsTrigger value="payouts" className="rounded-full">Payout Control</TabsTrigger>
        </TabsList>

        <TabsContent value="sellers" className="space-y-5">
          <div className="max-w-md relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="rounded-full border-border/70 bg-white pl-9 shadow-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search seller name, phone, email, GSTIN" />
          </div>

          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-[0_20px_70px_-52px_rgba(15,23,42,0.55)]">
            <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seller</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && !paged.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No sellers found.
                </TableCell>
              </TableRow>
            )}
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  Loading sellers...
                </TableCell>
              </TableRow>
            )}
            {paged.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <div className="text-sm">{row.phone || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.email || "-"}</div>
                </TableCell>
                <TableCell>{row.gstin || "-"}</TableCell>
                <TableCell>{row.payment_terms_days} days</TableCell>
                <TableCell>{row.commission_rate ?? 0}%</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full">
                    {String(row.status ?? (row.is_active ? "active" : "inactive")).replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(row.created_at).toLocaleDateString("en-IN")}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="rounded-full"
                    onClick={() => deleteSeller.mutate(row.id)}
                    disabled={deleteSeller.isPending && deleteSeller.variables === row.id}
                    aria-label={`Delete seller ${row.name}`}
                  >
                    {deleteSeller.isPending && deleteSeller.variables === row.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </>
                    )}
                  </Button>
                </TableCell>
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
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          <Textarea
            className="max-w-xl rounded-2xl bg-white"
            value={approvalNote}
            onChange={(event) => setApprovalNote(event.target.value)}
            placeholder="Optional admin note or requested changes"
          />
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-[0_20px_70px_-52px_rgba(15,23,42,0.55)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvalsLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Loading approvals...</TableCell></TableRow>
                ) : null}
                {(approvals ?? []).map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell>
                      <div className="font-medium">{approval.title}</div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {approval.approval_type.replace(/^vendor/, "seller").replace(/_/g, " ")}
                      </div>
                    </TableCell>
                    <TableCell>{approval.sellers?.name ?? "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {approval.seller_products?.name ?? approval.details?.name ?? "-"}
                      {approval.seller_products?.base_price ? ` · ₹${approval.seller_products.base_price}` : ""}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="rounded-full">{approval.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>{new Date(approval.created_at).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="text-right">
                      {approval.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => reviewApproval.mutate({ id: approval.id, status: "changes_requested" })}>
                            Request Changes
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => reviewApproval.mutate({ id: approval.id, status: "rejected" })}>
                            <XCircle className="h-4 w-4" />
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => reviewApproval.mutate({ id: approval.id, status: "approved" })}>
                            <CheckCircle2 className="h-4 w-4" />
                            Approve
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Reviewed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!approvalsLoading && !(approvals ?? []).length ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No approval requests.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payouts" className="space-y-4">
          <Input
            className="max-w-md rounded-full bg-white"
            value={payoutReference}
            onChange={(event) => setPayoutReference(event.target.value)}
            placeholder="Payment reference for paid payouts"
          />
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-[0_20px_70px_-52px_rgba(15,23,42,0.55)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payout</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payoutsLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Loading payouts...</TableCell></TableRow>
                ) : null}
                {(payouts ?? []).map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="font-medium">{payout.payout_number}</TableCell>
                    <TableCell>{payout.sellers?.name ?? "-"}</TableCell>
                    <TableCell>₹{Number(payout.gross_sales ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell>₹{Number(payout.commission_amount ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell>₹{Number(payout.net_payable ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell><Badge variant="outline" className="rounded-full">{payout.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {payout.status !== "paid" ? (
                        <Button size="sm" onClick={() => markPayoutPaid.mutate(payout)} disabled={markPayoutPaid.isPending}>
                          Mark Paid
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Paid</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!payoutsLoading && !(payouts ?? []).length ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No payout records.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SellersPage;
