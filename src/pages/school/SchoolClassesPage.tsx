import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useResolvedSchoolScope } from "@/lib/portal-dashboard";
import { fetchSchoolPortalData } from "@/lib/school-portal";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SchoolClassesPage = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", section: "", strength: "", classTeacher: "" });

  const { data: classes = [], isLoading: classLoading } = useQuery({
    queryKey: ["school-classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("classes").select("*").eq("school_id", schoolId).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: portalData } = useQuery({
    queryKey: ["school-portal", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchSchoolPortalData(schoolId!),
  });

  const { data: students = [] } = useQuery({
    queryKey: ["school-students-count", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("students").select("id, class_id").eq("school_id", schoolId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const classStats = useMemo(() => {
    const byClass = new Map<string, { studentCount: number; pendingOrders: number; compliance: number }>();
    classes.forEach((c: any) => byClass.set(c.id, { studentCount: 0, pendingOrders: 0, compliance: 0 }));
    students.forEach((s: any) => {
      if (s.class_id && byClass.has(s.class_id)) byClass.get(s.class_id)!.studentCount += 1;
    });

    const byClassName = new Map(classes.map((c: any) => [String(c.name).toLowerCase(), c.id]));
    (portalData?.orders ?? []).forEach((o: any) => {
      const classId = byClassName.get(String(o.resolvedClass || "").toLowerCase());
      if (!classId || !byClass.has(classId)) return;
      if (["PLACED", "PACKED", "DISPATCHED"].includes(o.status)) byClass.get(classId)!.pendingOrders += 1;
    });

    byClass.forEach((value) => {
      value.compliance = value.studentCount === 0 ? 0 : Math.round(((value.studentCount - value.pendingOrders) / value.studentCount) * 100);
    });

    return byClass;
  }, [classes, students, portalData?.orders]);

  const createClass = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("School scope missing");
      if (!form.name.trim()) throw new Error("Class name required");
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const { error } = await (supabase as any).from("classes").insert({
        school_id: schoolId,
        name: form.name.trim(),
        code: form.code.trim() || form.name.trim().toUpperCase().slice(0, 6),
        slug,
        section: form.section.trim() || null,
        strength: form.strength ? Number(form.strength) : null,
        class_teacher: form.classTeacher.trim() || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Class created.");
      setOpen(false);
      setForm({ name: "", code: "", section: "", strength: "", classTeacher: "" });
      await queryClient.invalidateQueries({ queryKey: ["school-classes", schoolId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to create class."),
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading...</p></div>;
  if (!user || !hasAccess || !isSchoolUser) return <Navigate to="/school/login" replace />;

  return (
    <PortalShell title="Classes" subtitle={user.email ?? "School class management"} onSignOut={signOut} scopeLabel={scope?.school?.name ?? (scopeLoading ? "Resolving school" : "School not assigned")}>
      <Card className={portalPanelClassName}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Class Management</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="rounded-full"><Plus className="mr-2 h-4 w-4" />Add Class</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Class</DialogTitle></DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>Class Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Section</Label><Input value={form.section} onChange={(e) => setForm((p) => ({ ...p, section: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Strength</Label><Input type="number" value={form.strength} onChange={(e) => setForm((p) => ({ ...p, strength: e.target.value }))} /></div>
                <div className="space-y-1 md:col-span-2"><Label>Class Teacher</Label><Input value={form.classTeacher} onChange={(e) => setForm((p) => ({ ...p, classTeacher: e.target.value }))} /></div>
              </div>
              <Button onClick={() => createClass.mutate()} disabled={createClass.isPending}>Save Class</Button>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Class</TableHead><TableHead>Section</TableHead><TableHead>Teacher</TableHead><TableHead>Strength</TableHead><TableHead>Student Count</TableHead><TableHead>Pending Orders</TableHead><TableHead>Compliance %</TableHead></TableRow></TableHeader>
            <TableBody>
              {classLoading ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Loading classes...</TableCell></TableRow> : null}
              {classes.map((row: any) => {
                const stats = classStats.get(row.id) ?? { studentCount: 0, pendingOrders: 0, compliance: 0 };
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.section ?? "-"}</TableCell>
                    <TableCell>{row.class_teacher ?? "-"}</TableCell>
                    <TableCell>{row.strength ?? "-"}</TableCell>
                    <TableCell>{stats.studentCount}</TableCell>
                    <TableCell>{stats.pendingOrders}</TableCell>
                    <TableCell>{stats.compliance}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default SchoolClassesPage;
