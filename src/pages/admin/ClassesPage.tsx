import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const ClassesPage = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", school_id: "", code: "", sort_order: "0" });

  const { data: classes, isLoading } = useQuery({
    queryKey: ["admin-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*, schools(name)")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: schools } = useQuery({
    queryKey: ["admin-schools-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleSave = async () => {
    if (!form.name || !form.school_id || !form.code) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const payload = {
        name: form.name,
        school_id: form.school_id,
        code: form.code,
        sort_order: parseInt(form.sort_order) || 0,
        slug,
      };
      if (editing) {
        await supabase.from("classes").update(payload).eq("id", editing.id);
        toast.success("Class updated");
      } else {
        await supabase.from("classes").insert(payload);
        toast.success("Class created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ name: "", school_id: "", code: "", sort_order: "0" });
    } catch {
      toast.error("Failed to save class");
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await supabase.from("classes").update({ status: newStatus }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
    toast.success(`Class ${newStatus === "active" ? "enabled" : "disabled"}`);
  };

  const openEdit = (cls: any) => {
    setEditing(cls);
    setForm({ name: cls.name, school_id: cls.school_id, code: cls.code, sort_order: String(cls.sort_order) });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", school_id: "", code: "", sort_order: "0" });
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Classes</h1>
        <Button onClick={openCreate} className="text-xs tracking-[0.2em] uppercase h-10 px-6">
          <Plus className="h-3 w-3 mr-2" /> Add Class
        </Button>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs tracking-wider uppercase">School</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Class Name</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Code</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Sort Order</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
              <TableHead className="text-xs tracking-wider uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : classes?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No classes</TableCell>
              </TableRow>
            ) : (
              classes?.map((cls: any) => (
                <TableRow key={cls.id}>
                  <TableCell className="text-sm text-muted-foreground">{cls.schools?.name}</TableCell>
                  <TableCell className="text-sm">{cls.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{cls.code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{cls.sort_order}</TableCell>
                  <TableCell>
                    <span className={`text-xs tracking-wider uppercase px-2 py-1 border ${
                      cls.status === "inactive"
                        ? "border-destructive text-destructive"
                        : "border-border text-foreground"
                    }`}>
                      {cls.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(cls)}>Edit</Button>
                      <Button variant="outline" size="sm" className="text-xs"
                        onClick={() => handleStatusToggle(cls.id, cls.status)}>
                        {cls.status === "inactive" ? "Enable" : "Disable"}
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
              {editing ? "Edit Class" : "Add Class"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">School</label>
              <Select value={form.school_id} onValueChange={(v) => setForm({ ...form, school_id: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select school" />
                </SelectTrigger>
                <SelectContent>
                  {schools?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Class Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" placeholder="Class 1" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Class Code</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="h-10" placeholder="C1" />
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">Sort Order</label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="h-10" placeholder="0" />
            </div>
          </div>
          <Button onClick={handleSave} className="w-full h-10 text-xs tracking-[0.2em] uppercase">
            {editing ? "Update Class" : "Create Class"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassesPage;
