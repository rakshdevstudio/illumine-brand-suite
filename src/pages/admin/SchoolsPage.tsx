import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ImageUploader } from "@/components/shared/ImageUploader";

const SchoolsPage = () => {
  const { user, role } = useAuth();
  const canCreateSchoolLogin = role === "super_admin" || role === "admin";
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [createSchoolUserOpen, setCreateSchoolUserOpen] = useState(false);
  const [creatingSchoolUser, setCreatingSchoolUser] = useState(false);
  const [schoolUserForm, setSchoolUserForm] = useState({
    full_name: "",
    email: "",
    password: "",
    school_id: "",
  });
  const [form, setForm] = useState({ name: "", code: "", slug: "", status: "active", logo_url: "" });

  const SCHOOL_AVATAR_FALLBACK_PREFIX = "school-assignment:";
  const readSchoolId = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  const readSchoolIdFromAvatarFallback = (avatarUrl: string | null | undefined) => {
    const value = readSchoolId(avatarUrl);
    if (!value || !value.startsWith(SCHOOL_AVATAR_FALLBACK_PREFIX)) return null;
    return readSchoolId(value.slice(SCHOOL_AVATAR_FALLBACK_PREFIX.length));
  };

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["admin-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schoolUsers = [] } = useQuery({
    queryKey: ["admin-school-users"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      const roleMap = new Map<string, string>();
      (roles ?? []).forEach((entry: Record<string, unknown>) => roleMap.set(String(entry.user_id), String(entry.role)));

      let userSchoolMapByUserId = new Map<string, string>();
      const { data: userSchoolMappings } = await (supabase as any)
        .from("user_school_map")
        .select("user_id, school_id");
      userSchoolMapByUserId = new Map(
        (userSchoolMappings ?? []).map((entry: { user_id: string; school_id: string }) => [entry.user_id, entry.school_id]),
      );

      return (profiles ?? [])
        .map((profile: Record<string, unknown>) => ({
          id: String(profile.id),
          full_name: String(profile.full_name || ""),
          email: String(profile.email || ""),
          status: String(profile.status || "active"),
          role: roleMap.get(String(profile.id)) ?? "unknown",
          school_id:
            (profile.school_id as string | undefined) ??
            userSchoolMapByUserId.get(String(profile.id)) ??
            readSchoolIdFromAvatarFallback(profile.avatar_url as string | null | undefined) ??
            null,
        }))
        .filter((entry: { role: string }) => entry.role === "school_user");
    },
  });

  const { data: linkedProducts = [] } = useQuery({
    queryKey: ["admin-school-linked-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, school_id, status, price, schools(name)")
        .not("school_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schoolOrders = [] } = useQuery({
    queryKey: ["admin-school-performance-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, school_id, total_amount, status, created_at")
        .not("school_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const metricsBySchool = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number; pending: number; outstanding: number }>();
    schoolOrders.forEach((row: Record<string, unknown>) => {
      const schoolId = row.school_id as string | undefined;
      if (!schoolId) return;
      const m = map.get(schoolId) ?? { orders: 0, revenue: 0, pending: 0, outstanding: 0 };
      m.orders += 1;
      if (row.status !== "CANCELLED") m.revenue += Number(row.total_amount ?? 0);
      if (["PLACED", "PACKED", "DISPATCHED", "pending", "confirmed", "packed", "shipped"].includes(String(row.status))) {
        m.pending += 1;
        m.outstanding += Number(row.total_amount ?? 0);
      }
      map.set(schoolId, m);
    });
    return map;
  }, [schoolOrders]);

  const generateSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleSave = async () => {
    if (!form.name || !form.code) {
      toast.error("Name and code are required");
      return;
    }
    try {
      if (editing) {
        const { error } = await supabase
          .from("schools")
          .update({
            name: form.name.trim(),
            code: form.code.trim().toUpperCase(),
            slug: (form.slug || generateSlug(form.name)).trim(),
            status: form.status,
            logo_url: form.logo_url || null,
          })
          .eq("id", String(editing.id));
        if (error) throw error;
        toast.success("School updated");
      } else {
        const { error } = await supabase.from("schools").insert({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          slug: (form.slug || generateSlug(form.name)).trim(),
          status: form.status,
          logo_url: form.logo_url || null,
        });
        if (error) throw error;
        toast.success("School created");
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({ name: "", code: "", slug: "", status: "active", logo_url: "" });
      queryClient.invalidateQueries({ queryKey: ["admin-schools"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save school");
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const { error } = await supabase.from("schools").update({ status: newStatus }).eq("id", id);
    if (error) return toast.error(error.message || "Failed to update status");
    toast.success(`School ${newStatus === "active" ? "activated" : "deactivated"}`);
    queryClient.invalidateQueries({ queryKey: ["admin-schools"] });
  };

  const callManageFunction = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-admin-users", { body });
    if (error) {
      const response = (error as { context?: Response }).context;
      let errorMessage = error.message;
      if (response instanceof Response) {
        if (response.status === 403) {
          throw new Error("Only Admin or Super Admin can create school login credentials.");
        }
        const payload = await response.clone().json().catch(() => null);
        if (payload?.error) errorMessage = payload.error;
      }
      throw new Error(errorMessage);
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) throw new Error(String(data.error));
    return data;
  };

  const handleCreateSchoolUser = async () => {
    if (!schoolUserForm.full_name || !schoolUserForm.email || !schoolUserForm.password || !schoolUserForm.school_id) {
      toast.error("Please fill all school login fields.");
      return;
    }
    if (schoolUserForm.password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setCreatingSchoolUser(true);
    try {
      await callManageFunction({
        action: "create",
        full_name: schoolUserForm.full_name,
        email: schoolUserForm.email,
        password: schoolUserForm.password,
        role: "school_user",
        school_id: schoolUserForm.school_id,
      });

      toast.success("School login created.");
      setCreateSchoolUserOpen(false);
      setSchoolUserForm({ full_name: "", email: "", password: "", school_id: "" });
      await queryClient.invalidateQueries({ queryKey: ["admin-school-users"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create school login.");
    } finally {
      setCreatingSchoolUser(false);
    }
  };

  const openEdit = (school: Record<string, unknown>) => {
    setEditing(school);
    setForm({ 
      name: String(school.name || ""), 
      code: String(school.code || ""), 
      slug: String(school.slug || ""), 
      status: String(school.status || "active"), 
      logo_url: String(school.logo_url || "") 
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Schools</h1>
        <Button onClick={() => { setEditing(null); setForm({ name: "", code: "", slug: "", status: "active", logo_url: "" }); setDialogOpen(true); }} className="text-xs tracking-[0.2em] uppercase h-10 px-6">
          <Plus className="h-3 w-3 mr-2" /> Add School
        </Button>
      </div>

      <Tabs defaultValue="directory" className="space-y-5">
        <TabsList className="rounded-full bg-white p-1">
          <TabsTrigger value="directory" className="rounded-full">School Directory</TabsTrigger>
          <TabsTrigger value="users" className="rounded-full">School Users</TabsTrigger>
          <TabsTrigger value="products" className="rounded-full">Linked Products</TabsTrigger>
          <TabsTrigger value="performance" className="rounded-full">Performance Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="directory">
          <div className="border border-border rounded-2xl overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>School Name</TableHead><TableHead>Code</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Loading...</TableCell></TableRow> : null}
                {schools.map((school: Record<string, unknown>) => (
                  <TableRow key={String(school.id)}>
                    <TableCell>{String(school.name || "")}</TableCell>
                    <TableCell>{String(school.code || "-")}</TableCell>
                    <TableCell>{String(school.status || "active")}</TableCell>
                    <TableCell>{new Date(String(school.created_at)).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(school)}>Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => handleStatusToggle(String(school.id), String(school.status || "active"))}>{school.status === "inactive" ? "Activate" : "Deactivate"}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="mb-4 flex justify-end">
            <div className="flex flex-col items-end gap-1">
              <Button
                onClick={() => setCreateSchoolUserOpen(true)}
                disabled={!canCreateSchoolLogin}
                className="text-xs tracking-[0.2em] uppercase h-10 px-6"
                title={canCreateSchoolLogin ? "Create school login" : "Only Admin or Super Admin can create school login"}
              >
                <Plus className="h-3 w-3 mr-2" /> Create School Login
              </Button>
              {!canCreateSchoolLogin ? (
                <p className="text-[11px] text-muted-foreground">
                  Current role: <span className="font-medium">{role ?? "unknown"}</span>. Requires <span className="font-medium">admin</span> or <span className="font-medium">super_admin</span>.
                </p>
              ) : null}
            </div>
          </div>
          <div className="border border-border rounded-2xl overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Email</TableHead><TableHead>School</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {schoolUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No school users found yet.
                    </TableCell>
                  </TableRow>
                ) : null}
                {schoolUsers.map((row: Record<string, unknown>) => (
                  <TableRow key={String(row.id)}>
                    <TableCell>{String(row.full_name || "-")}</TableCell>
                    <TableCell>{String(row.email || "-")}</TableCell>
                    <TableCell>{schools.find((s: Record<string, unknown>) => s.id === row.school_id)?.name ?? "-"}</TableCell>
                    <TableCell>{String(row.status || "active")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="products">
          <div className="border border-border rounded-2xl overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>School</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {linkedProducts.map((row: Record<string, unknown>) => (
                  <TableRow key={String(row.id)}>
                    <TableCell>{String(row.name || "")}</TableCell>
                    <TableCell>{(row.schools as { name?: string })?.name ?? schools.find((s: Record<string, unknown>) => s.id === row.school_id)?.name ?? "-"}</TableCell>
                    <TableCell>₹{Number(row.price ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell>{String(row.status || "active")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <div className="border border-border rounded-2xl overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>School</TableHead><TableHead>Orders</TableHead><TableHead>Revenue</TableHead><TableHead>Pending Orders</TableHead><TableHead>Payment Health</TableHead></TableRow></TableHeader>
              <TableBody>
                {schools.map((school: Record<string, unknown>) => {
                  const metric = metricsBySchool.get(String(school.id)) ?? { orders: 0, revenue: 0, pending: 0, outstanding: 0 };
                  return (
                    <TableRow key={String(school.id)}>
                      <TableCell>{String(school.name || "")}</TableCell>
                      <TableCell>{metric.orders}</TableCell>
                      <TableCell>₹{metric.revenue.toLocaleString("en-IN")}</TableCell>
                      <TableCell>{metric.pending}</TableCell>
                      <TableCell>{metric.outstanding > 0 ? `Outstanding ₹${metric.outstanding.toLocaleString("en-IN")}` : "Healthy"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={createSchoolUserOpen} onOpenChange={setCreateSchoolUserOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="text-sm font-light tracking-wide uppercase">Create School Login</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Full Name</label>
              <Input
                name="school_user_full_name"
                value={schoolUserForm.full_name}
                onChange={(e) => setSchoolUserForm((p) => ({ ...p, full_name: e.target.value }))}
                className="h-10"
                placeholder="School Coordinator"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Email</label>
              <Input
                name="school_user_email"
                type="email"
                value={schoolUserForm.email}
                onChange={(e) => setSchoolUserForm((p) => ({ ...p, email: e.target.value }))}
                className="h-10"
                placeholder="schooladmin@school.com"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Password</label>
              <Input
                name="school_user_password"
                type="password"
                value={schoolUserForm.password}
                onChange={(e) => setSchoolUserForm((p) => ({ ...p, password: e.target.value }))}
                className="h-10"
                placeholder="Minimum 6 characters"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">School</label>
              <Select value={schoolUserForm.school_id} onValueChange={(value) => setSchoolUserForm((p) => ({ ...p, school_id: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school: Record<string, unknown>) => (
                    <SelectItem key={String(school.id)} value={String(school.id)}>{String(school.name || "")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreateSchoolUser} disabled={creatingSchoolUser} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            {creatingSchoolUser ? "Creating..." : "Create Login"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="text-sm font-light tracking-wide uppercase">{editing ? "Edit School" : "Add School"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">School Name</label>
              <Input name="school_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">School Code</label>
              <Input name="school_code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="h-10" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Slug</label>
              <Input name="school_slug" value={form.slug || generateSlug(form.name)} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="h-10" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">School Logo</label>
              {form.logo_url ? (
                <div className="relative group w-24 h-24 border border-border overflow-hidden bg-secondary rounded-lg">
                  <img
                    src={form.logo_url}
                    alt="School Logo"
                    className="w-full h-full object-contain p-2"
                  />
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, logo_url: "" })}
                      className="p-1 text-background hover:text-destructive bg-foreground/20 rounded-full backdrop-blur-sm"
                      title="Remove logo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <ImageUploader
                  category="schools"
                  folder={form.slug || generateSlug(form.name) || "new"}
                  maxFiles={1}
                  onUploadComplete={(url) => setForm({ ...form, logo_url: url })}
                  label="Upload school logo"
                />
              )}
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Status</label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSave} className="w-full h-10 text-xs tracking-[0.2em] uppercase">{editing ? "Update School" : "Create School"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SchoolsPage;
