import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GraduationCap, Monitor, Plus, Shield, ShieldCheck, Store, Trash2, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity-log";

const NO_SCHOOL_VALUE = "__none__";
const SCHOOL_AVATAR_FALLBACK_PREFIX = "school-assignment:";

const roleLabels: Record<string, { label: string; icon: typeof Shield }> = {
  super_admin: { label: "Super Admin", icon: ShieldCheck },
  admin: { label: "Admin", icon: Shield },
  staff: { label: "Staff", icon: User },
  branch_staff: { label: "Branch Staff", icon: Monitor },
  vendor: { label: "Vendor", icon: Store },
  school_user: { label: "School User", icon: GraduationCap },
};

const DEFAULT_FORM = {
  full_name: "",
  email: "",
  password: "",
  role: "staff",
  school_id: NO_SCHOOL_VALUE,
};

const DEFAULT_EDIT_FORM = {
  role: "staff",
  school_id: NO_SCHOOL_VALUE,
};

const isMissingProfileSchoolColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || message.includes("school_id");
};

const isMissingUserSchoolMapError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.code === "PGRST205" || error.code === "42P01" || message.includes("user_school_map");
};

const readSchoolId = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readSchoolIdFromAvatarFallback = (avatarUrl: string | null | undefined) => {
  const value = readSchoolId(avatarUrl);
  if (!value || !value.startsWith(SCHOOL_AVATAR_FALLBACK_PREFIX)) return null;
  return readSchoolId(value.slice(SCHOOL_AVATAR_FALLBACK_PREFIX.length));
};

const encodeSchoolAvatarFallback = (schoolId: string) => `${SCHOOL_AVATAR_FALLBACK_PREFIX}${schoolId}`;

const AdminUsersPage = () => {
  const queryClient = useQueryClient();
  const { role: currentUserRole, user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editForm, setEditForm] = useState(DEFAULT_EDIT_FORM);
  const [saving, setSaving] = useState(false);

  const availableRoles = currentUserRole === "super_admin"
    ? ["super_admin", "admin", "staff", "branch_staff", "vendor", "school_user"]
    : ["admin", "staff", "branch_staff", "vendor", "school_user"];

  const { data: schools } = useQuery({
    queryKey: ["admin-user-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
  });

  const schoolMap = useMemo(
    () => new Map((schools ?? []).map((school) => [school.id, school.name])),
    [schools],
  );

  const { data: schoolAssignmentSupport } = useQuery({
    queryKey: ["school-assignment-support", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();

      if (profileError) throw profileError;

      let supportsUserSchoolMap = true;
      try {
        const { error } = await (supabase as any)
          .from("user_school_map")
          .select("user_id")
          .limit(1);

        if (error) {
          supportsUserSchoolMap = !isMissingUserSchoolMapError(error);
        }
      } catch {
        supportsUserSchoolMap = false;
      }

      return {
        supportsProfileSchoolId: !!profile && Object.prototype.hasOwnProperty.call(profile, "school_id"),
        supportsUserSchoolMap,
      };
    },
  });

  const getSchoolName = (schoolId?: string | null) => {
    if (!schoolId) return null;
    return schoolMap.get(schoolId) ?? "Unknown school";
  };

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: roles } = await supabase.from("user_roles").select("*");
      const roleMap: Record<string, string> = {};
      roles?.forEach((entry: any) => {
        roleMap[entry.user_id] = entry.role;
      });

      let userSchoolMapByUserId = new Map<string, string>();
      try {
        const { data: userSchoolMappings, error: userSchoolMapError } = await (supabase as any)
          .from("user_school_map")
          .select("user_id, school_id");

        if (userSchoolMapError) {
          if (!isMissingUserSchoolMapError(userSchoolMapError)) {
            console.warn("Failed to load user_school_map:", userSchoolMapError.message);
          }
        } else {
          userSchoolMapByUserId = new Map(
            (userSchoolMappings ?? []).map((entry: { user_id: string; school_id: string }) => [
              entry.user_id,
              entry.school_id,
            ]),
          );
        }
      } catch (userSchoolMapError) {
        console.warn("Failed to load user_school_map:", userSchoolMapError);
      }

      return profiles.map((profile: any) => ({
        ...profile,
        school_id:
          profile.school_id ??
          userSchoolMapByUserId.get(profile.id) ??
          readSchoolIdFromAvatarFallback(profile.avatar_url) ??
          null,
        role: roleMap[profile.id] || "unknown",
      }));
    },
  });

  const callManageFunction = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("manage-admin-users", { body });
    if (error) {
      const response = (error as { context?: Response }).context;
      let errorMessage = error.message;

      if (response instanceof Response) {
        const payload = await response
          .clone()
          .json()
          .catch(() => null);

        if (payload?.error) {
          errorMessage = payload.error;
        }
      }

      throw new Error(errorMessage);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const normalizeSchoolId = (value: string) => (value === NO_SCHOOL_VALUE ? null : value);

  const syncSchoolAssignment = async (userId: string, schoolId: string | null) => {
    let profileSynced = false;
    let mappingSynced = false;
    let avatarFallbackSynced = false;

    if (schoolAssignmentSupport?.supportsProfileSchoolId !== false) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ school_id: schoolId })
        .eq("id", userId);

      if (profileError) {
        if (isMissingProfileSchoolColumnError(profileError)) {
          console.warn("profiles.school_id is unavailable, falling back to user_school_map.");
        } else {
          throw profileError;
        }
      } else {
        profileSynced = true;
      }
    } else {
      console.warn("profiles.school_id is unavailable, falling back to user_school_map.");
    }

    if (schoolAssignmentSupport?.supportsUserSchoolMap !== false) {
      try {
        const userSchoolMap = (supabase as any).from("user_school_map");
        if (schoolId) {
          const { error } = await userSchoolMap.upsert(
            {
              user_id: userId,
              school_id: schoolId,
            },
            { onConflict: "user_id" },
          );

          if (error) {
            if (isMissingUserSchoolMapError(error)) {
              console.warn("user_school_map is unavailable while syncing school assignment.");
            } else {
              console.warn("Failed to sync user_school_map:", error.message);
            }
          } else {
            mappingSynced = true;
          }
        } else {
          const { error } = await userSchoolMap.delete().eq("user_id", userId);
          if (error) {
            if (isMissingUserSchoolMapError(error)) {
              console.warn("user_school_map is unavailable while clearing school assignment.");
            } else {
              console.warn("Failed to clear user_school_map:", error.message);
            }
          } else {
            mappingSynced = true;
          }
        }
      } catch (error) {
        console.warn("Failed to sync user_school_map:", error);
      }
    } else {
      console.warn("user_school_map is unavailable while syncing school assignment.");
    }

    if (!profileSynced && !mappingSynced) {
      const { data: profile, error: avatarReadError } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (avatarReadError) {
        throw avatarReadError;
      }

      const existingAvatarUrl = profile?.avatar_url ?? null;
      const existingFallbackSchoolId = readSchoolIdFromAvatarFallback(existingAvatarUrl);
      const avatarFallbackAvailable = !existingAvatarUrl || !!existingFallbackSchoolId;

      if (schoolId === null) {
        if (!existingFallbackSchoolId) {
          avatarFallbackSynced = true;
        } else {
          const { error: avatarFallbackError } = await supabase
            .from("profiles")
            .update({ avatar_url: null })
            .eq("id", userId);

          if (avatarFallbackError) {
            throw avatarFallbackError;
          }

          avatarFallbackSynced = true;
        }
      } else if (avatarFallbackAvailable) {
        const { error: avatarFallbackError } = await supabase
          .from("profiles")
          .update({ avatar_url: encodeSchoolAvatarFallback(schoolId) })
          .eq("id", userId);

        if (avatarFallbackError) {
          throw avatarFallbackError;
        }

        avatarFallbackSynced = true;
      }
    }

    if (!profileSynced && !mappingSynced && !avatarFallbackSynced) {
      throw new Error("School assignment storage is unavailable for this user. Apply the latest school mapping migration.");
    }
  };

  const saveUserRoleDirectly = async (userId: string, nextRole: string) => {
    const { error: insertError } = await (supabase as any)
      .from("user_roles")
      .upsert(
        {
          user_id: userId,
          role: nextRole,
        },
        { onConflict: "user_id,role" },
      );

    if (insertError) {
      throw insertError;
    }

    const { error: cleanupError } = await (supabase as any)
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .neq("role", nextRole);

    if (cleanupError) {
      throw cleanupError;
    }
  };

  const handleCreate = async () => {
    const schoolId = normalizeSchoolId(form.school_id);

    if (!form.full_name || !form.email || !form.password) {
      toast.error("Please fill all required fields");
      return;
    }

    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (form.role === "school_user" && !schoolId) {
      toast.error("School users must have an assigned school");
      return;
    }

    setSaving(true);
    try {
      const result = await callManageFunction({
        action: "create",
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        school_id: schoolId,
      });

      await syncSchoolAssignment(result.user_id, schoolId);

      const schoolName = getSchoolName(schoolId);
      await logActivity({
        actionType: "USER_CREATED",
        entityType: "user",
        entityId: result?.user_id ?? form.email,
        description: `Admin created user "${form.email}" with role ${form.role}${schoolName ? ` assigned to ${schoolName}` : ""}`,
        performedBy: user?.id,
      });

      toast.success("User created");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setCreateOpen(false);
      setForm(DEFAULT_FORM);
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (selectedUser: any) => {
    setEditingUser(selectedUser);
    setEditForm({
      role: selectedUser.role,
      school_id: selectedUser.school_id ?? NO_SCHOOL_VALUE,
    });
  };

  const closeEditDialog = () => {
    setEditingUser(null);
    setEditForm(DEFAULT_EDIT_FORM);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    const schoolId = normalizeSchoolId(editForm.school_id);
    if (editForm.role === "school_user" && !schoolId) {
      toast.error("School users must have an assigned school");
      return;
    }

    setSaving(true);
    try {
      const roleChanged = editForm.role !== editingUser.role;
      const schoolChanged = schoolId !== (editingUser.school_id ?? null);

      if (!roleChanged && !schoolChanged) {
        toast.success("No changes to save");
        closeEditDialog();
        return;
      }

      if (schoolChanged && editForm.role === "school_user") {
        await syncSchoolAssignment(editingUser.id, schoolId);
      }

      if (roleChanged) {
        if (editingUser.id === user?.id) {
          throw new Error("Cannot change your own role");
        }

        if (currentUserRole === "super_admin") {
          await saveUserRoleDirectly(editingUser.id, editForm.role);
        } else {
          await callManageFunction({
            action: "update_role",
            user_id: editingUser.id,
            role: editForm.role,
          });
        }
      }

      if (schoolChanged && editForm.role !== "school_user") {
        await syncSchoolAssignment(editingUser.id, schoolId);
      }

      const previousSchoolName = getSchoolName(editingUser.school_id);
      const nextSchoolName = getSchoolName(schoolId);

      await logActivity({
        actionType: "USER_UPDATED",
        entityType: "user",
        entityId: editingUser.id,
        description: `Admin updated ${editingUser.email}: role ${editingUser.role} -> ${editForm.role}${previousSchoolName !== nextSchoolName ? `, school ${previousSchoolName ?? "None"} -> ${nextSchoolName ?? "None"}` : ""}`,
        performedBy: user?.id,
      });

      toast.success("User updated");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      closeEditDialog();
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    } finally {
      setSaving(false);
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
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Users</h1>
        {(currentUserRole === "super_admin" || currentUserRole === "admin") && (
          <Button onClick={() => setCreateOpen(true)} className="h-10 px-6 text-xs tracking-[0.2em] uppercase">
            <Plus className="mr-2 h-3 w-3" /> Add User
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
              <TableHead className="text-xs tracking-wider uppercase">Assigned School</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Created</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No users
                </TableCell>
              </TableRow>
            ) : (
              users?.map((entry: any) => {
                const roleInfo = roleLabels[entry.role] || { label: entry.role, icon: User };
                const RoleIcon = roleInfo.icon;
                const schoolName = getSchoolName(entry.school_id);

                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">{entry.full_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="space-y-1">
                        <p>{entry.email}</p>
                        {schoolName ? (
                          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                            Assigned to: {schoolName}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <RoleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        <span className="text-xs tracking-wider uppercase">{roleInfo.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{schoolName || "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`border px-2 py-1 text-xs tracking-wider uppercase ${
                          entry.status === "disabled"
                            ? "border-destructive text-destructive"
                            : "border-border text-foreground"
                        }`}
                      >
                        {entry.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {canManageUser(entry.role) ? (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => openEditDialog(entry)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => handleToggleStatus(entry.id, entry.status)}
                          >
                            {entry.status === "disabled" ? "Enable" : "Disable"}
                          </Button>
                          {currentUserRole === "super_admin" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-destructive hover:text-destructive"
                              onClick={() => handleDelete(entry.id, entry.email)}
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

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setForm(DEFAULT_FORM);
        }}
      >
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">Add User</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleCreate();
            }}
          >
            <div className="space-y-4 py-4">
              <div>
                <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Full Name</label>
                <Input
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                  className="h-10"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Email</label>
                <Input
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  className="h-10"
                  placeholder="admin@illume.com"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Password</label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  className="h-10"
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Role</label>
                <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabels[role]?.label || role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Assigned School</label>
                <Select value={form.school_id} onValueChange={(value) => setForm({ ...form, school_id: value })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={form.role === "school_user" ? "Select school" : "Optional"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SCHOOL_VALUE}>No school assigned</SelectItem>
                    {schools?.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {getSchoolName(normalizeSchoolId(form.school_id)) ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Assigned to: {getSchoolName(normalizeSchoolId(form.school_id))}
                  </p>
                ) : form.role === "school_user" ? (
                  <p className="mt-2 text-xs text-destructive">School users must have a school assignment.</p>
                ) : null}
              </div>
            </div>
            <Button type="submit" disabled={saving} className="h-10 w-full text-xs tracking-[0.2em] uppercase">
              {saving ? "Creating..." : "Create User"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{editingUser?.full_name || "Unnamed user"}</p>
              <p className="text-sm text-muted-foreground">{editingUser?.email}</p>
            </div>

            <div>
              <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Role</label>
              <Select value={editForm.role} onValueChange={(value) => setEditForm({ ...editForm, role: value })}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]?.label || role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-xs tracking-[0.2em] text-muted-foreground uppercase">Assigned School</label>
              <Select value={editForm.school_id} onValueChange={(value) => setEditForm({ ...editForm, school_id: value })}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={editForm.role === "school_user" ? "Select school" : "Optional"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SCHOOL_VALUE}>No school assigned</SelectItem>
                  {schools?.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getSchoolName(normalizeSchoolId(editForm.school_id)) ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Assigned to: {getSchoolName(normalizeSchoolId(editForm.school_id))}
                </p>
              ) : editForm.role === "school_user" ? (
                <p className="mt-2 text-xs text-destructive">School users must have a school assignment.</p>
              ) : null}
            </div>
          </div>

          <Button onClick={handleUpdateUser} disabled={saving} className="h-10 w-full text-xs tracking-[0.2em] uppercase">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersPage;
