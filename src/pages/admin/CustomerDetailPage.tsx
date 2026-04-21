import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value);

const CustomerDetailPage = () => {
  const { id } = useParams<{ id: string }>();

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["crm-customer", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, created_at")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: students } = useQuery({
    queryKey: ["crm-customer-students", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("students")
        .select("id, name, gender, created_at, school_id, class_id, schools(name), classes(name)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["crm-customer-orders", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, total_amount, status, created_at, address, school_id, schools(name)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const analytics = useMemo(() => {
    const orderCount = (orders ?? []).length;
    const totalSpend = (orders ?? []).reduce((sum: number, order: any) => sum + Number(order.total_amount || 0), 0);
    return { orderCount, totalSpend };
  }, [orders]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading customer details...</p>;
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Customer not found.</p>
        <Link to="/admin/customers">
          <Button variant="outline">Back to Customers</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-light tracking-[0.1em] uppercase">Customer Detail</h1>
          <p className="text-sm text-muted-foreground mt-2">CRM intelligence profile</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => toast.message("Repeat order workflow will be enabled in next release")}>Repeat Order</Button>
          <Link to="/admin/customers">
            <Button variant="outline">Back</Button>
          </Link>
        </div>
      </div>

      <section className="border border-border p-5 space-y-3">
        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground">Basic Info</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.15em]">Name</p>
            <p className="text-sm mt-1">{customer.name || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.15em]">Phone</p>
            <p className="text-sm mt-1">{customer.phone || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.15em]">Email</p>
            <p className="text-sm mt-1">{customer.email || "-"}</p>
          </div>
        </div>
      </section>

      <section className="border border-border p-5 space-y-4">
        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground">Students</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(students ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No students linked yet.</TableCell>
              </TableRow>
            ) : (
              (students ?? []).map((student: any) => (
                <TableRow key={student.id}>
                  <TableCell>{student.name}</TableCell>
                  <TableCell>{student.schools?.name || "-"}</TableCell>
                  <TableCell>{student.classes?.name || "-"}</TableCell>
                  <TableCell>{student.gender}</TableCell>
                  <TableCell>{new Date(student.created_at).toLocaleDateString("en-IN")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="border border-border p-5 space-y-4">
        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground">Order History</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(orders ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No orders found.</TableCell>
              </TableRow>
            ) : (
              (orders ?? []).map((order: any) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">{order.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell>{order.schools?.name || "-"}</TableCell>
                  <TableCell>{order.status}</TableCell>
                  <TableCell>{formatCurrency(Number(order.total_amount || 0))}</TableCell>
                  <TableCell>{new Date(order.created_at).toLocaleDateString("en-IN")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="border border-border p-5">
        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-4">Analytics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-border p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total Spend</p>
            <p className="mt-2 text-2xl font-light">{formatCurrency(analytics.totalSpend)}</p>
          </div>
          <div className="border border-border p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Order Count</p>
            <p className="mt-2 text-2xl font-light">{analytics.orderCount}</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CustomerDetailPage;
