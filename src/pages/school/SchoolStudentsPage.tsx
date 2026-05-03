import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Download, Plus, Upload } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useResolvedSchoolScope } from "@/lib/portal-dashboard";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const SchoolStudentsPage = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    classId: "",
    section: "",
    parentName: "",
    phone: "",
    email: "",
    sizeProfile: "",
    status: "active",
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["school-portal-students", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("students")
        .select("id, name, status, classes(name), customers(name, phone, email)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["school-portal-classes-ref", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name, section").eq("school_id", schoolId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createStudent = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("School context missing");
      if (!form.name.trim()) throw new Error("Student name is required");
      const { error } = await (supabase as any).from("students").insert({
        school_id: schoolId,
        class_id: form.classId || null,
        name: form.name.trim(),
        status: form.status,
        metadata: {
          section: form.section,
          parent_name: form.parentName,
          uniform_size_profile: form.sizeProfile,
          parent_phone: form.phone,
          parent_email: form.email,
        },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Student added.");
      setOpen(false);
      setForm({ name: "", classId: "", section: "", parentName: "", phone: "", email: "", sizeProfile: "", status: "active" });
      await queryClient.invalidateQueries({ queryKey: ["school-portal-students", schoolId] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to add student."),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s: any) => [s.name, s.classes?.name, s.customers?.name, s.customers?.phone].join(" ").toLowerCase().includes(q));
  }, [students, search]);

  const onCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      toast.error("CSV is empty.");
      return;
    }
    const rows = lines.slice(1).map((line) => line.split(","));
    const classMap = new Map(classes.map((c: any) => [String(c.name).toLowerCase(), c.id]));
    const payload = rows
      .filter((r) => r[0]?.trim())
      .map((r) => ({
        school_id: schoolId,
        name: r[0]?.trim(),
        class_id: classMap.get((r[1] || "").trim().toLowerCase()) || null,
        status: (r[2] || "active").trim().toLowerCase() === "inactive" ? "inactive" : "active",
        metadata: {
          section: r[3]?.trim() || null,
          parent_name: r[4]?.trim() || null,
          parent_phone: r[5]?.trim() || null,
          parent_email: r[6]?.trim() || null,
          uniform_size_profile: r[7]?.trim() || null,
        },
      }));

    if (!payload.length) {
      toast.error("No valid rows found in CSV.");
      return;
    }
    const { error } = await (supabase as any).from("students").insert(payload);
    if (error) {
      toast.error(error.message || "CSV import failed.");
      return;
    }
    toast.success(`Imported ${payload.length} students.`);
    await queryClient.invalidateQueries({ queryKey: ["school-portal-students", schoolId] });
  };

  const downloadTemplate = () => {
    const csv = "name,class,status,section,parent_name,parent_phone,parent_email,uniform_size_profile\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading...</p></div>;
  if (!user || !hasAccess || !isSchoolUser) return <Navigate to="/school/login" replace />;

  return (
    <PortalShell title="Students" subtitle={user.email ?? "School students"} onSignOut={signOut} scopeLabel={scope?.school?.name ?? (scopeLoading ? "Resolving school" : "School not assigned")}>
      <Card className={portalPanelClassName}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Students Directory</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />CSV Template</Button>
            <label className="inline-flex items-center">
              <input className="hidden" type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])} />
              <span className="inline-flex h-10 items-center rounded-full border px-4 text-xs uppercase tracking-[0.2em] cursor-pointer"><Upload className="mr-2 h-4 w-4" />Import CSV</span>
            </label>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button className="rounded-full"><Plus className="mr-2 h-4 w-4" />Add Student</Button></DialogTrigger>
              <DialogContent className="rounded-[24px]">
                <DialogHeader><DialogTitle>Add Student</DialogTitle></DialogHeader>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Class</Label><Select value={form.classId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, classId: v === "none" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label>Section</Label><Input value={form.section} onChange={(e) => setForm((p) => ({ ...p, section: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Parent Name</Label><Input value={form.parentName} onChange={(e) => setForm((p) => ({ ...p, parentName: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Uniform Size Profile</Label><Input value={form.sizeProfile} onChange={(e) => setForm((p) => ({ ...p, sizeProfile: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
                </div>
                <Button onClick={() => createStudent.mutate()} disabled={createStudent.isPending}>Save Student</Button>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Input className="mb-4 max-w-md" placeholder="Search student, class, parent, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Table>
            <TableHeader><TableRow><TableHead>Student ID</TableHead><TableHead>Name</TableHead><TableHead>Class</TableHead><TableHead>Section</TableHead><TableHead>Parent</TableHead><TableHead>Phone</TableHead><TableHead>Uniform Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {studentsLoading ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Loading students...</TableCell></TableRow> : null}
              {filtered.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>{row.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.classes?.name ?? "-"}</TableCell>
                  <TableCell>{row.metadata?.section ?? "-"}</TableCell>
                  <TableCell>{row.metadata?.parent_name ?? row.customers?.name ?? "-"}</TableCell>
                  <TableCell>{row.metadata?.parent_phone ?? row.customers?.phone ?? "-"}</TableCell>
                  <TableCell>{row.status ?? "active"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default SchoolStudentsPage;
