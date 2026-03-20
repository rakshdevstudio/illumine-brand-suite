import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type BranchFormState = {
  name: string;
  location: string;
  is_active: boolean;
};

const EMPTY_FORM: BranchFormState = {
  name: "",
  location: "",
  is_active: true,
};

const isMissingBranchInfraError = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("relation") ||
    message.includes("branches") ||
    message.includes("not found")
  );
};

const BranchesPage = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [branchInfraMissing, setBranchInfraMissing] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchFormState>(EMPTY_FORM);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["admin-branches"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        if (isMissingBranchInfraError(error)) {
          setBranchInfraMissing(true);
          return [];
        }
        throw error;
      }

      setBranchInfraMissing(false);
      return data ?? [];
    },
  });

  const openCreate = () => {
    setEditingBranchId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (branch: any) => {
    setEditingBranchId(branch.id);
    setForm({
      name: branch.name ?? "",
      location: branch.location ?? "",
      is_active: Boolean(branch.is_active),
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingBranchId(null);
    setForm(EMPTY_FORM);
  };

  const saveBranch = async () => {
    if (branchInfraMissing) {
      toast.error("Branch tables are not available in this environment yet");
      return;
    }

    const name = form.name.trim();
    const location = form.location.trim();

    if (!name || !location) {
      toast.error("Branch name and location are required");
      return;
    }

    const duplicateExists = (branches ?? []).some((branch: any) => {
      if (editingBranchId && branch.id === editingBranchId) return false;
      return (
        String(branch.name ?? "").trim().toLowerCase() === name.toLowerCase() &&
        String(branch.location ?? "").trim().toLowerCase() === location.toLowerCase()
      );
    });

    if (duplicateExists) {
      toast.error("A branch with the same name and location already exists");
      return;
    }

    setSaving(true);

    const payload = {
      name,
      location,
      is_active: form.is_active,
    };

    const request = editingBranchId
      ? supabase.from("branches").update(payload).eq("id", editingBranchId)
      : supabase.from("branches").insert(payload);

    const { error } = await request;
    setSaving(false);

    if (error) {
      if ((error as any).code === "23505") {
        toast.error("A branch with this name and location already exists");
        return;
      }
      toast.error(error.message || "Failed to save branch");
      return;
    }

    toast.success(editingBranchId ? "Branch updated" : "Branch created");
    queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
    closeDialog();
  };

  const toggleBranchStatus = async (branch: any) => {
    if (branchInfraMissing) {
      toast.error("Branch tables are not available in this environment yet");
      return;
    }

    const { error } = await supabase
      .from("branches")
      .update({ is_active: !branch.is_active })
      .eq("id", branch.id);

    if (error) {
      if ((error as any).message?.toLowerCase().includes("at least one active branch")) {
        toast.error("At least one active branch is required");
        return;
      }
      toast.error("Failed to update branch status");
      return;
    }

    toast.success(branch.is_active ? "Branch disabled" : "Branch enabled");
    queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Branches</h1>
        <Button onClick={openCreate} disabled={branchInfraMissing} className="text-xs tracking-[0.2em] uppercase h-10 px-6">
          <Plus className="h-3 w-3 mr-2" /> Add Branch
        </Button>
      </div>

      {branchInfraMissing && (
        <div className="mb-4 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Branch infrastructure is not available in this Supabase project. Run latest migrations and refresh.
        </div>
      )}

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">Branch</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Location</TableHead>
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
            ) : (branches ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No branches found</TableCell>
              </TableRow>
            ) : (
              (branches ?? []).map((branch: any) => (
                <TableRow key={branch.id}>
                  <TableCell className="text-sm">{branch.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{branch.location}</TableCell>
                  <TableCell>
                    <span className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                      branch.is_active ? "border-border text-foreground" : "border-destructive text-destructive"
                    }`}>
                      {branch.is_active ? "active" : "inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(branch.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(branch)}>
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => toggleBranchStatus(branch)}
                      >
                        {branch.is_active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open ? closeDialog() : setDialogOpen(true)}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm font-light tracking-wide uppercase">
              {editingBranchId ? "Edit Branch" : "Add Branch"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Branch Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="h-10"
                placeholder="Main Branch"
              />
            </div>

            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Location</label>
              <Input
                value={form.location}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                className="h-10"
                placeholder="Bangalore"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                id="branch-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                className="h-4 w-4"
              />
              <label htmlFor="branch-active" className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
                Active
              </label>
            </div>
          </div>

          <Button onClick={saveBranch} disabled={saving} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            {saving ? "Saving..." : editingBranchId ? "Update Branch" : "Create Branch"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BranchesPage;
