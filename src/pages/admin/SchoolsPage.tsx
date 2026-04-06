import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity-log";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const SchoolsPage = () => {
  const queryClient = useQueryClient();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { session } = useRequireAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState({ name: "", code: "", slug: "", status: "active" });

  const { data: schools, isLoading, error: fetchError } = useQuery({
    queryKey: ["admin-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("name");
      if (error) throw error;
      return data;
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const [saving, setSaving] = useState(false);

  const retryFetch = async <T,>(fn: () => Promise<T>, retries = 3): Promise<T> => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw new Error("Max retries reached");
  };

  const handleSave = async () => {
    if (!form.name || !form.code) {
      toast.error("Name and code are required");
      return;
    }
    const slug = form.slug || generateSlug(form.name);
    setSaving(true);

    try {
      await retryFetch(async () => {
        if (editing) {
          const { error } = await supabase.from("schools").update({ name: form.name, code: form.code, slug, status: form.status }).eq("id", editing.id);
          if (error) throw error;
          await logActivity({
            actionType: "SCHOOL_EDITED",
            entityType: "school",
            entityId: editing.id,
            description: `Admin updated school \"${form.name}\"`,
            performedBy: user?.id,
          });
        } else {
          const { data, error } = await supabase.from("schools").insert({ name: form.name, code: form.code, slug, status: form.status }).select("id").single();
          if (error) throw error;
          await logActivity({
            actionType: "SCHOOL_CREATED",
            entityType: "school",
            entityId: data.id,
            description: `Admin created school \"${form.name}\"`,
            performedBy: user?.id,
          });
        }
      });
      toast.success(editing ? "School updated" : "School created");
      queryClient.invalidateQueries({ queryKey: ["admin-schools"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ name: "", code: "", slug: "", status: "active" });
    } catch (err: any) {
      console.error("School save error:", err);
      toast.error("Failed to save school", { description: err?.message || "Network error — please check your internet connection and try again" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await supabase.from("schools").update({ status: newStatus }).eq("id", id);
    const school = (schools ?? []).find((s) => s.id === id);
    await logActivity({
      actionType: "SCHOOL_EDITED",
      entityType: "school",
      entityId: id,
      description: `Admin ${newStatus === "active" ? "enabled" : "disabled"} school \"${school?.name ?? id}\"`,
      performedBy: user?.id,
    });
    queryClient.invalidateQueries({ queryKey: ["admin-schools"] });
    toast.success(`School ${newStatus === "active" ? "enabled" : "disabled"}`);
  };

  const canDelete = isAdmin || isSuperAdmin;

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !session?.user?.id) {
      toast.error("Authenticated admin user is required");
      return;
    }

    try {
      const { count: classCount, error: classError } = await supabase
        .from("classes")
        .select("id", { head: true, count: "exact" })
        .eq("school_id", deleteTarget.id);
      if (classError) throw classError;

      const { count: productCount, error: productError } = await supabase
        .from("products")
        .select("id", { head: true, count: "exact" })
        .eq("school_id", deleteTarget.id);
      if (productError) throw productError;

      if ((classCount ?? 0) > 0 || (productCount ?? 0) > 0) {
        toast.error("Cannot delete school with active classes or products");
        return;
      }

      const { data: deletedRow, error } = await supabase
        .from("schools")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!deletedRow?.id) {
        throw new Error("Delete was blocked by database policy. Apply latest migrations.");
      }

      await logActivity({
        actionType: "SCHOOL_DELETED",
        entityType: "schools",
        entityId: deleteTarget.id,
        description: `School ${deleteTarget.name} deleted`,
        performedBy: session.user.id,
      });

      setDeleteTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-schools"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
      ]);
      toast.success("School deleted");
    } catch (error: any) {
      console.error("Failed to delete school", error);
      toast.error(error?.message || "Failed to delete school");
    }
  };

  const openEdit = (school: any) => {
    setEditing(school);
    setForm({ name: school.name, code: school.code || "", slug: school.slug, status: school.status || "active" });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "", slug: "", status: "active" });
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Schools</h1>
        <Button onClick={openCreate} className="text-xs tracking-[0.2em] uppercase h-10 px-6">
          <Plus className="h-3 w-3 mr-2" /> Add School
        </Button>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">School Name</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Code</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Created</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : fetchError ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-destructive">
                  Failed to load schools. Please check your internet connection and refresh.
                  <Button variant="outline" size="sm" className="ml-2 text-xs" onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-schools"] })}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : schools?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No schools</TableCell>
              </TableRow>
            ) : (
              schools?.map((school) => (
                <TableRow key={school.id}>
                  <TableCell className="text-sm">{school.name}</TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">{(school as any).code || "—"}</TableCell>
                  <TableCell>
                    <span className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                      (school as any).status === "inactive"
                        ? "border-destructive text-destructive"
                        : "border-border text-foreground"
                    }`}>
                      {(school as any).status || "active"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(school.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(school)}>
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleStatusToggle(school.id, (school as any).status || "active")}
                      >
                        {(school as any).status === "inactive" ? "Enable" : "Disable"}
                      </Button>
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-destructive border-destructive/30 hover:text-destructive"
                          onClick={() => setDeleteTarget(school)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">
              {editing ? "Edit School" : "Add School"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">School Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" placeholder="Delhi Public School" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">School Code</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="h-10" placeholder="DPS" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Slug (auto-generated)</label>
              <Input value={form.slug || generateSlug(form.name)} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="h-10" placeholder="delhi-public-school" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Status</label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            {saving ? "Saving..." : editing ? "Update School" : "Create School"}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete School</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SchoolsPage;
