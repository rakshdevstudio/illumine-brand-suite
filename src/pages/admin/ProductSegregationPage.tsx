import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-log";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const ProductSegregationPage = () => {
  const queryClient = useQueryClient();
  const { session } = useRequireAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product_id: "",
    school_id: "",
    class_id: "",
    gender: "Unisex",
    is_required: false,
  });

  const [schoolFilter, setSchoolFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");

  const { data: schools } = useQuery({
    queryKey: ["all-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["all-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["all-products-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, status")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments, isLoading, refetch } = useQuery({
    queryKey: ["product-assignments-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_assignments")
        .select("*, products(name, status), schools(name), classes(name)")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filteredClassesForForm = useMemo(() => {
    if (!classes || !form.school_id) return [];
    return classes.filter((cls) => cls.school_id === form.school_id);
  }, [classes, form.school_id]);

  const filteredClassesForFilter = useMemo(() => {
    if (!classes) return [];
    if (schoolFilter === "all") return classes;
    return classes.filter((cls) => cls.school_id === schoolFilter);
  }, [classes, schoolFilter]);

  const filteredAssignments = useMemo(() => {
    if (!assignments) return [];
    return assignments
      .filter((a) => {
        if (schoolFilter !== "all" && a.school_id !== schoolFilter) return false;
        if (classFilter !== "all" && a.class_id !== classFilter) return false;
        if (genderFilter !== "all" && a.gender !== genderFilter) return false;
        return true;
      })
      .sort((a, b) => a.display_order - b.display_order);
  }, [assignments, schoolFilter, classFilter, genderFilter]);

  const createAssignment = async () => {
    if (!form.product_id || !form.school_id || !form.class_id || !form.gender) {
      toast.error("Please select product, school, class, and gender");
      return;
    }
    setSaving(true);
    const sameScope = (assignments ?? []).filter(
      (a) => a.school_id === form.school_id && a.class_id === form.class_id && a.gender === form.gender
    );
    const nextOrder = sameScope.length > 0 ? Math.max(...sameScope.map((a) => a.display_order)) + 1 : 1;

    const { error } = await supabase.from("product_assignments").insert({
      product_id: form.product_id,
      school_id: form.school_id,
      class_id: form.class_id,
      gender: form.gender,
      is_required: form.is_required,
      display_order: nextOrder,
    });

    setSaving(false);
    if (error) {
      toast.error(error.message.includes("product_assignments_unique_scope") ? "Assignment already exists" : "Failed to create assignment");
      return;
    }

    toast.success("Assignment created");
    setForm({ product_id: "", school_id: form.school_id, class_id: form.class_id, gender: form.gender, is_required: false });
    refetch();
  };

  const toggleRequired = async (assignmentId: string, value: boolean) => {
    const { error } = await supabase.from("product_assignments").update({ is_required: value }).eq("id", assignmentId);
    if (error) {
      toast.error("Failed to update required flag");
      return;
    }
    refetch();
  };

  const moveAssignment = async (assignment: any, direction: "up" | "down") => {
    const scopeAssignments = (assignments ?? [])
      .filter((a) => a.school_id === assignment.school_id && a.class_id === assignment.class_id && a.gender === assignment.gender)
      .sort((a, b) => a.display_order - b.display_order);

    const currentIndex = scopeAssignments.findIndex((a) => a.id === assignment.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= scopeAssignments.length) return;

    const target = scopeAssignments[targetIndex];

    const { error: errA } = await supabase
      .from("product_assignments")
      .update({ display_order: target.display_order })
      .eq("id", assignment.id);
    if (errA) {
      toast.error("Failed to reorder assignments");
      return;
    }

    const { error: errB } = await supabase
      .from("product_assignments")
      .update({ display_order: assignment.display_order })
      .eq("id", target.id);
    if (errB) {
      toast.error("Failed to reorder assignments");
      return;
    }

    refetch();
  };

  const removeAssignment = async (assignmentId: string) => {
    const assignment = (assignments ?? []).find((item: any) => item.id === assignmentId);
    const { error } = await supabase.from("product_assignments").delete().eq("id", assignmentId);
    if (error) {
      toast.error("Failed to remove assignment");
      return;
    }

    try {
      const genderLabel = assignment?.gender === "Male" ? "Boys" : assignment?.gender === "Female" ? "Girls" : "Unisex";
      await logActivity({
        actionType: "ASSIGNMENT_REMOVED",
        entityType: "product_assignment",
        entityId: assignmentId,
        description: `Assignment removed: ${assignment?.products?.name ?? "Product"} / ${assignment?.schools?.name ?? "School"} / ${assignment?.classes?.name ?? "Class"} / ${genderLabel}`,
        performedBy: session?.user?.id,
      });
    } catch (logError) {
      console.error("Assignment removed but failed to log activity", logError);
      toast.error("Assignment removed, but activity log update failed");
    }

    toast.success("Assignment removed");
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
    ]);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-light tracking-[0.1em] uppercase mb-1">Product Assignments</h1>
        <p className="text-xs text-muted-foreground tracking-wide">Assign universal products to school/class/gender, reorder display, and mark required items</p>
      </div>

      <div className="border border-border p-4 md:p-6 space-y-4">
        <h3 className="text-xs tracking-[0.15em] uppercase text-muted-foreground">Create Assignment</h3>
        <div className="grid md:grid-cols-5 gap-3">
          <Select value={form.school_id} onValueChange={(v) => setForm((f) => ({ ...f, school_id: v, class_id: "" }))}>
            <SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger>
            <SelectContent>
              {schools?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={form.class_id} onValueChange={(v) => setForm((f) => ({ ...f, class_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {filteredClassesForForm.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
            <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Boys</SelectItem>
              <SelectItem value="Female">Girls</SelectItem>
              <SelectItem value="Unisex">Unisex</SelectItem>
            </SelectContent>
          </Select>

          <Select value={form.product_id} onValueChange={(v) => setForm((f) => ({ ...f, product_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
            <SelectContent>
              {products?.filter((p) => p.status === "active").map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={createAssignment} disabled={saving} className="text-xs tracking-[0.2em] uppercase">
            {saving ? "Saving..." : "Assign Product"}
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.is_required}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, is_required: !!checked }))}
            id="is-required"
          />
          <label htmlFor="is-required" className="text-xs tracking-[0.12em] uppercase text-muted-foreground cursor-pointer">
            Mark as required
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="w-48">
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger><SelectValue placeholder="All Schools" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Schools</SelectItem>
              {schools?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger><SelectValue placeholder="All Classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {filteredClassesForFilter.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger><SelectValue placeholder="All Genders" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genders</SelectItem>
              <SelectItem value="Male">Boys</SelectItem>
              <SelectItem value="Female">Girls</SelectItem>
              <SelectItem value="Unisex">Unisex</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Product table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Loading assignments…</p>
      ) : filteredAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No assignments found</p>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Display Order</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssignments.map((assignment: any) => {
                const genderLabel = assignment.gender === "Male" ? "Boys" : assignment.gender === "Female" ? "Girls" : "Unisex";

                return (
                  <TableRow key={assignment.id}>
                    <TableCell className="text-sm">
                      {assignment.products?.name}
                      {assignment.products?.status !== "active" && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">inactive product</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{assignment.schools?.name}</TableCell>
                    <TableCell className="text-sm">{assignment.classes?.name}</TableCell>
                    <TableCell className="text-sm">{genderLabel}</TableCell>
                    <TableCell>
                      <Checkbox
                        checked={assignment.is_required}
                        onCheckedChange={(checked) => toggleRequired(assignment.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={String(assignment.display_order)}
                        readOnly
                        className="h-8 w-16 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveAssignment(assignment, "up")}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveAssignment(assignment, "down")}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => removeAssignment(assignment.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default ProductSegregationPage;
