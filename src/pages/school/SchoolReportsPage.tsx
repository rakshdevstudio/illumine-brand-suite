import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useResolvedSchoolScope, formatCurrency } from "@/lib/portal-dashboard";
import { fetchSchoolPortalData } from "@/lib/school-portal";
import { PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const asCsv = (rows: Array<Array<string | number>>) => rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

const download = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const SchoolReportsPage = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;

  const { data: portalData, isLoading: dataLoading } = useQuery({
    queryKey: ["school-portal", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchSchoolPortalData(schoolId!),
  });

  const reports = useMemo(() => {
    const orders = portalData?.orders ?? [];
    const classWise = new Map<string, { className: string; orders: number; revenue: number }>();
    const sizeDemand = new Map<string, number>();
    const delivery = new Map<string, number>();
    const studentRepeat = new Map<string, number>();

    orders.forEach((o) => {
      const className = o.resolvedClass || "Unassigned";
      const cw = classWise.get(className) ?? { className, orders: 0, revenue: 0 };
      cw.orders += 1;
      if (o.status !== "CANCELLED") cw.revenue += Number(o.total_amount ?? 0);
      classWise.set(className, cw);

      delivery.set(o.status, (delivery.get(o.status) ?? 0) + 1);
      if (o.resolvedStudentName) {
        studentRepeat.set(o.resolvedStudentName, (studentRepeat.get(o.resolvedStudentName) ?? 0) + 1);
      }

      o.order_items.forEach((item) => {
        const size = item.variant?.size ?? "Unknown";
        sizeDemand.set(size, (sizeDemand.get(size) ?? 0) + Number(item.quantity ?? 0));
      });
    });

    return {
      classWise: [...classWise.values()].sort((a, b) => b.orders - a.orders),
      pendingStudents: [...studentRepeat.entries()].filter(([, count]) => count === 0),
      revenueTotal: orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + Number(o.total_amount ?? 0), 0),
      sizeDemand: [...sizeDemand.entries()].map(([size, qty]) => ({ size, qty })).sort((a, b) => b.qty - a.qty),
      repeatPurchases: [...studentRepeat.entries()].map(([student, orders]) => ({ student, orders })).sort((a, b) => b.orders - a.orders),
      deliveryStatus: [...delivery.entries()].map(([status, count]) => ({ status, count })),
    };
  }, [portalData?.orders]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading...</p></div>;
  if (!user || !hasAccess || !isSchoolUser) return <Navigate to="/school/login" replace />;

  return (
    <PortalShell title="Reports" subtitle={user.email ?? "School reporting"} onSignOut={signOut} scopeLabel={scope?.school?.name ?? (scopeLoading ? "Resolving school" : "School not assigned")}>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className={portalPanelClassName}>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Class-wise Orders</CardTitle><Button variant="outline" size="sm" onClick={() => download("class_wise_orders.csv", asCsv([["Class", "Orders", "Revenue"], ...reports.classWise.map((r) => [r.className, r.orders, r.revenue])]))}><Download className="mr-2 h-4 w-4" />CSV</Button></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Class</TableHead><TableHead>Orders</TableHead><TableHead>Revenue</TableHead></TableRow></TableHeader><TableBody>{reports.classWise.map((r) => <TableRow key={r.className}><TableCell>{r.className}</TableCell><TableCell>{r.orders}</TableCell><TableCell>{formatCurrency(r.revenue)}</TableCell></TableRow>)}</TableBody></Table>
          </CardContent>
        </Card>

        <Card className={portalPanelClassName}>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Size Demand Report</CardTitle><Button variant="outline" size="sm" onClick={() => download("size_demand.csv", asCsv([["Size", "Quantity"], ...reports.sizeDemand.map((r) => [r.size, r.qty])]))}><Download className="mr-2 h-4 w-4" />CSV</Button></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Size</TableHead><TableHead>Quantity</TableHead></TableRow></TableHeader><TableBody>{reports.sizeDemand.map((r) => <TableRow key={r.size}><TableCell>{r.size}</TableCell><TableCell>{r.qty}</TableCell></TableRow>)}</TableBody></Table>
          </CardContent>
        </Card>

        <Card className={portalPanelClassName}>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Repeat Purchase Report</CardTitle><Button variant="outline" size="sm" onClick={() => download("repeat_purchase.csv", asCsv([["Student", "Orders"], ...reports.repeatPurchases.map((r) => [r.student, r.orders])]))}><Download className="mr-2 h-4 w-4" />CSV</Button></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Orders</TableHead></TableRow></TableHeader><TableBody>{reports.repeatPurchases.map((r) => <TableRow key={r.student}><TableCell>{r.student}</TableCell><TableCell>{r.orders}</TableCell></TableRow>)}</TableBody></Table>
          </CardContent>
        </Card>

        <Card className={portalPanelClassName}>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Delivery Status Report</CardTitle><Button variant="outline" size="sm" onClick={() => download("delivery_status.csv", asCsv([["Status", "Count"], ...reports.deliveryStatus.map((r) => [r.status, r.count])]))}><Download className="mr-2 h-4 w-4" />CSV</Button></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Count</TableHead></TableRow></TableHeader><TableBody>{reports.deliveryStatus.map((r) => <TableRow key={r.status}><TableCell>{r.status}</TableCell><TableCell>{r.count}</TableCell></TableRow>)}</TableBody></Table>
          </CardContent>
        </Card>
      </div>

      <Card className={`${portalPanelClassName} mt-4`}>
        <CardHeader><CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Revenue Report</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-extralight">{dataLoading ? "..." : formatCurrency(reports.revenueTotal)}</p>
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default SchoolReportsPage;
