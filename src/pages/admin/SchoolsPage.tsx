import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const SchoolsPage = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", code: "", slug: "" });

  const { data: schools, isLoading } = useQuery({
    queryKey: ["admin-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleSave = async () => {
    if (!form.name || !form.code) {
      toast.error("Name and code are required");
      return;
    }
    const slug = form.slug || generateSlug(form.name);

    try {
      if (editing) {
        await supabase.from("schools").update({ name: form.name, code: form.code, slug }).eq("id", editing.id);
        toast.success("School updated");
      } else {
        await supabase.from("schools").insert({ name: form.name, code: form.code, slug });
        toast.success("School created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-schools"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ name: "", code: "", slug: "" });
    } catch {
      toast.error("Failed to save school");
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await supabase.from("schools").update({ status: newStatus }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-schools"] });
    toast.success(`School ${newStatus === "active" ? "enabled" : "disabled"}`);
  };

  const openEdit = (school: any) => {
    setEditing(school);
    setForm({ name: school.name, code: school.code || "", slug: school.slug });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "", slug: "" });
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
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
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
          </div>
          <Button onClick={handleSave} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            {editing ? "Update School" : "Create School"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SchoolsPage;
