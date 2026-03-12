import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Shield, ShieldCheck, User, Trash2, Monitor, Store, GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const roleLabels: Record<string, { label: string; icon: typeof Shield }> = {
  super_admin:  { label: "Super Admin",  icon: ShieldCheck },
  admin:        { label: "Admin",        icon: Shield },
  staff:        { label: "Staff",        icon: User },
  branch_staff: { label: "Branch Staff", icon: Monitor },
  vendor:       { label: "Vendor",       icon: Store },
  school_user:  { label: "School User",  icon: GraduationCap },
};

const AdminUsersPage = () => {
  const queryClient = useQueryClient();
  const { role: currentUserRole } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<{ userId: string; currentRole: string } | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "staff" });
  const [saving, setSaving] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Get roles for each user
      const { data: roles } = await supabase.from("user_roles").select("*");
      const roleMap: Record<string, string> = {};
      roles?.forEach((r: any) => { roleMap[r.user_id] = r.role; });

      return profiles.map((p: any) => ({ ...p, role: roleMap[p.id] || "unknown" }));
    },
  });

  const callManageFunction = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("manage-admin-users", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleCreate = async () => {
    if (!form.full_name || !form.email || !form.password) {
      toast.error("Please fill all required fields");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSaving(true);
    try {
      await callManageFunction({
        action: "create",
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
      });
      toast.success("Admin user created");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setCreateOpen(false);
      setForm({ full_name: "", email: "", password: "", role: "staff" });
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    }
    setSaving(false);
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      await callManageFunction({ action: "update_role", user_id: userId, role: newRole });
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditingRole(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      await callManageFunction({ action: "toggle_status", user_id: userId, status: newStatus });
      toast.success(`User ${newStatus === "active" ? "enabled" : "disabled"}`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await callManageFunction({ action: "delete", user_id: userId });
      toast.success("User deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  const canManageUser = (userRole: string) => {
    if (currentUserRole === "super_admin") return true;
    if (currentUserRole === "admin" && userRole !== "super_admin") return true;
    return false;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Admin Users</h1>
        {(currentUserRole === "super_admin" || currentUserRole === "admin") && (
          <Button onClick={() => setCreateOpen(true)} className="text-xs tracking-[0.2em] uppercase h-10 px-6">
            <Plus className="h-3 w-3 mr-2" /> Add Admin User
          </Button>
        )}
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">Name</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Email</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Role</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Created</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No users</TableCell>
              </TableRow>
            ) : (
              users?.map((user: any) => {
                const roleInfo = roleLabels[user.role] || { label: user.role, icon: User };
                const RoleIcon = roleInfo.icon;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="text-sm">{user.full_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <RoleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        <span className="text-xs tracking-wider uppercase">{roleInfo.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                        user.status === "disabled"
                          ? "border-destructive text-destructive"
                          : "border-border text-foreground"
                      }`}>
                        {user.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {canManageUser(user.role) ? (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setEditingRole({ userId: user.id, currentRole: user.role })}
                          >
                            Role
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => handleToggleStatus(user.id, user.status)}
                          >
                            {user.status === "disabled" ? "Enable" : "Disable"}
                          </Button>
                          {currentUserRole === "super_admin" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-destructive hover:text-destructive"
                              onClick={() => handleDelete(user.id, user.email)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">Add Admin User</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Full Name</label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="h-10" placeholder="John Doe" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Email</label>
              <Input type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10" placeholder="admin@illume.com" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Password</label>
              <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-10" placeholder="Minimum 6 characters" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Role</label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentUserRole === "super_admin" && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="branch_staff">Branch Staff</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="school_user">School User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={saving} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            {saving ? "Creating..." : "Create User"}
          </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">Change Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {(currentUserRole === "super_admin"
              ? ["super_admin", "admin", "staff", "branch_staff", "vendor", "school_user"]
              : ["admin", "staff", "branch_staff", "vendor", "school_user"]
            ).map((role) => (
              <button
                key={role}
                onClick={() => editingRole && handleUpdateRole(editingRole.userId, role)}
                className={`w-full flex items-center gap-3 px-4 py-3 border transition-all text-left ${
                  editingRole?.currentRole === role
                    ? "border-foreground bg-primary text-primary-foreground"
                    : "border-border hover:border-foreground"
                }`}
              >
                {(() => { const Icon = roleLabels[role]?.icon || User; return <Icon className="h-4 w-4" strokeWidth={1.5} />; })()}
                <span className="text-xs tracking-[0.15em] uppercase">{roleLabels[role]?.label || role}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersPage;
