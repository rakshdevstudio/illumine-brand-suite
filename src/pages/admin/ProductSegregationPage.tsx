import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-log";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCatalogFilters } from "@/hooks/useCatalogFilters";
import { ALL_FILTER_VALUE } from "@/lib/storefront";
import { cn } from "@/lib/utils";

const ASSIGNMENT_GENDERS = [
  { value: "Male", label: "Boys" },
  { value: "Female", label: "Girls" },
  { value: "Unisex", label: "Unisex" },
];

const toGenderLabel = (value: string | null | undefined) => {
  if (value === "Male") return "Boys";
  if (value === "Female") return "Girls";
  return "Unisex";
};

type ProductChoice = {
  id: string;
  name: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  gender: string;
  genderLabel: string;
  contextLabel: string;
  searchText: string;
};

const ProductSegregationPage = () => {
  const queryClient = useQueryClient();
  const { session } = useRequireAuth();
  const [assigning, setAssigning] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedMatrixKeys, setSelectedMatrixKeys] = useState<string[]>([]);
  const [markRequiredOnAssign, setMarkRequiredOnAssign] = useState(false);

  const { filters, replaceFilters, updateFilter } = useCatalogFilters();
  const schoolFilter = filters.school;
  const classFilter = filters.class;
  const genderFilter = filters.gender;

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
        .select("id, name, status, school_id, class_id, gender, schools(name), classes(name)")
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

  const productChoices = useMemo<ProductChoice[]>(() => {
    const dedupe = new Map<string, ProductChoice>();

    (products ?? [])
      .filter((product) => product.status === "active" && product.school_id && product.class_id)
      .forEach((product: any) => {
        const schoolName = product?.schools?.name ?? "Unknown School";
        const className = product?.classes?.name ?? "Unknown Class";
        const gender = String(product?.gender ?? "Unisex");
        const genderLabel = toGenderLabel(gender);
        const dedupeKey = [
          String(product?.name ?? "").toLowerCase(),
          String(product?.school_id ?? ""),
          String(product?.class_id ?? ""),
          gender.toLowerCase(),
        ].join("|");

        if (!dedupe.has(dedupeKey)) {
          dedupe.set(dedupeKey, {
            id: String(product.id),
            name: String(product.name ?? "Unnamed product"),
            schoolId: String(product.school_id),
            schoolName,
            classId: String(product.class_id),
            className,
            gender,
            genderLabel,
            contextLabel: `${className} • ${genderLabel} • ${schoolName}`,
            searchText: `${product.name} ${schoolName} ${className} ${genderLabel}`.toLowerCase(),
          });
        }
      });

    return Array.from(dedupe.values()).sort((left, right) => {
      const nameCompare = left.name.localeCompare(right.name);
      if (nameCompare !== 0) return nameCompare;
      const schoolCompare = left.schoolName.localeCompare(right.schoolName);
      if (schoolCompare !== 0) return schoolCompare;
      return left.className.localeCompare(right.className);
    });
  }, [products]);

  const groupedProductChoices = useMemo(() => {
    const groups = new Map<string, ProductChoice[]>();
    productChoices.forEach((choice) => {
      const list = groups.get(choice.name) ?? [];
      list.push(choice);
      groups.set(choice.name, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [productChoices]);

  const selectedProduct = useMemo(
    () => productChoices.find((choice) => choice.id === selectedProductId) ?? null,
    [productChoices, selectedProductId]
  );

  const classOptionsForSelectedProduct = useMemo(() => {
    if (!selectedProduct?.schoolId || !classes) return [];
    return classes
      .filter((schoolClass: any) => schoolClass.school_id === selectedProduct.schoolId)
      .sort((left: any, right: any) => {
        const leftSort = Number(left.sort_order ?? 0);
        const rightSort = Number(right.sort_order ?? 0);
        if (leftSort !== rightSort) return leftSort - rightSort;
        return String(left.name ?? "").localeCompare(String(right.name ?? ""));
      });
  }, [classes, selectedProduct]);

  const assignmentScopeForSelectedProduct = useMemo(() => {
    if (!selectedProduct) return [];
    return (assignments ?? []).filter(
      (assignment: any) =>
        assignment.product_id === selectedProduct.id && assignment.school_id === selectedProduct.schoolId
    );
  }, [assignments, selectedProduct]);

  const assignmentByScope = useMemo(() => {
    const map = new Map<string, any>();
    assignmentScopeForSelectedProduct.forEach((assignment: any) => {
      map.set(`${assignment.class_id}|${assignment.gender}`, assignment);
    });
    return map;
  }, [assignmentScopeForSelectedProduct]);

  const assignmentMatrixRows = useMemo(() => {
    if (!selectedProduct) return [];
    return classOptionsForSelectedProduct.flatMap((schoolClass: any) =>
      ASSIGNMENT_GENDERS.map((genderOption) => {
        const key = `${schoolClass.id}|${genderOption.value}`;
        const existing = assignmentByScope.get(key) ?? null;
        return {
          key,
          classId: String(schoolClass.id),
          className: String(schoolClass.name ?? "Class"),
          gender: genderOption.value,
          genderLabel: genderOption.label,
          assigned: Boolean(existing),
          assignment: existing,
        };
      })
    );
  }, [assignmentByScope, classOptionsForSelectedProduct, selectedProduct]);

  const selectableMatrixRows = useMemo(
    () => assignmentMatrixRows.filter((row) => !row.assigned),
    [assignmentMatrixRows]
  );

  const allSelectableChosen =
    selectableMatrixRows.length > 0 && selectableMatrixRows.every((row) => selectedMatrixKeys.includes(row.key));

  useEffect(() => {
    setSelectedMatrixKeys([]);
  }, [selectedProductId]);

  const filteredClassesForFilter = useMemo(() => {
    if (!classes) return [];
    if (schoolFilter === ALL_FILTER_VALUE) return classes;
    return classes.filter((cls) => cls.school_id === schoolFilter);
  }, [classes, schoolFilter]);

  useEffect(() => {
    if (classFilter !== ALL_FILTER_VALUE && !filteredClassesForFilter.some((schoolClass) => schoolClass.id === classFilter)) {
      replaceFilters({ class: ALL_FILTER_VALUE });
    }
  }, [classFilter, filteredClassesForFilter, replaceFilters]);

  const filteredAssignments = useMemo(() => {
    if (!assignments) return [];
    return assignments
      .filter((a) => {
        if (schoolFilter !== ALL_FILTER_VALUE && a.school_id !== schoolFilter) return false;
        if (classFilter !== ALL_FILTER_VALUE && a.class_id !== classFilter) return false;
        if (genderFilter !== ALL_FILTER_VALUE && a.gender !== genderFilter) return false;
        return true;
      })
      .sort((a, b) => a.display_order - b.display_order);
  }, [assignments, schoolFilter, classFilter, genderFilter]);

  const assignSelected = async () => {
    if (!selectedProduct) {
      toast.error("Select a product first");
      return;
    }

    const selectedRows = assignmentMatrixRows.filter((row) => selectedMatrixKeys.includes(row.key));
    if (selectedRows.length === 0) {
      toast.error("Select at least one class/gender location");
      return;
    }

    const rowsToInsert = selectedRows.filter((row) => !row.assigned);
    if (rowsToInsert.length === 0) {
      toast.error("Selected locations are already assigned");
      return;
    }

    const maxOrderByScope = new Map<string, number>();
    (assignments ?? []).forEach((assignment: any) => {
      const scopeKey = `${assignment.school_id}|${assignment.class_id}|${assignment.gender}`;
      const current = maxOrderByScope.get(scopeKey) ?? 0;
      maxOrderByScope.set(scopeKey, Math.max(current, Number(assignment.display_order ?? 0)));
    });

    const payload = rowsToInsert.map((row) => {
      const scopeKey = `${selectedProduct.schoolId}|${row.classId}|${row.gender}`;
      const nextOrder = (maxOrderByScope.get(scopeKey) ?? 0) + 1;
      maxOrderByScope.set(scopeKey, nextOrder);
      return {
        product_id: selectedProduct.id,
        school_id: selectedProduct.schoolId,
        class_id: row.classId,
        gender: row.gender,
        is_required: markRequiredOnAssign,
        display_order: nextOrder,
      };
    });

    setAssigning(true);
    const { error } = await supabase
      .from("product_assignments")
      .upsert(payload, { onConflict: "product_id,school_id,class_id,gender", ignoreDuplicates: true });
    setAssigning(false);

    if (error) {
      toast.error("Failed to assign selected locations");
      return;
    }

    try {
      await logActivity({
        actionType: "ASSIGNMENT_CREATED",
        entityType: "product_assignment",
        entityId: selectedProduct.id,
        description: `Assigned ${selectedProduct.name} to ${rowsToInsert.length} location${rowsToInsert.length === 1 ? "" : "s"}`,
        performedBy: session?.user?.id,
      });
    } catch (logError) {
      logger.error("Assignments created but failed to log activity", logError);
    }

    toast.success(`Assigned ${rowsToInsert.length} location${rowsToInsert.length === 1 ? "" : "s"}`);
    setSelectedMatrixKeys([]);
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] }),
    ]);
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
      logger.error("Assignment removed but failed to log activity", logError);
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
        <p className="text-xs text-muted-foreground tracking-wide">Select a product first, then assign missing class/gender locations in one pass.</p>
      </div>

      <div className="border border-border p-4 md:p-6 space-y-4">
        <h3 className="text-xs tracking-[0.15em] uppercase text-muted-foreground">Step 1 · Select Product</h3>
        <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={productPickerOpen}
              className="w-full justify-between h-11"
            >
              {selectedProduct ? (
                <div className="min-w-0 text-left">
                  <p className="truncate font-medium">{selectedProduct.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{selectedProduct.contextLabel}</p>
                </div>
              ) : (
                <span className="text-muted-foreground">Search and select product</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[460px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search products, class, gender, school" />
              <CommandList>
                <CommandEmpty>No product found.</CommandEmpty>
                {groupedProductChoices.map(([name, choices]) => (
                  <CommandGroup key={name} heading={name}>
                    {choices.map((choice) => (
                      <CommandItem
                        key={choice.id}
                        value={`${choice.name} ${choice.searchText}`}
                        onSelect={() => {
                          setSelectedProductId(choice.id);
                          setProductPickerOpen(false);
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{choice.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{choice.contextLabel}</p>
                        </div>
                        <Check className={cn("ml-2 h-4 w-4", selectedProductId === choice.id ? "opacity-100" : "opacity-0")} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selectedProduct && (
          <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{selectedProduct.name}</span>
            <span className="mx-2">·</span>
            {selectedProduct.contextLabel}
            <span className="mx-2">·</span>
            {assignmentScopeForSelectedProduct.length} existing assignment{assignmentScopeForSelectedProduct.length === 1 ? "" : "s"}
          </div>
        )}

        <h3 className="text-xs tracking-[0.15em] uppercase text-muted-foreground">Step 2 · Assignment Matrix (Class × Gender)</h3>

        {!selectedProduct ? (
          <p className="text-sm text-muted-foreground">Select a product to view assignable locations.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (allSelectableChosen) {
                    setSelectedMatrixKeys([]);
                  } else {
                    setSelectedMatrixKeys(selectableMatrixRows.map((row) => row.key));
                  }
                }}
              >
                {allSelectableChosen ? "Clear Selection" : "Select All Missing"}
              </Button>

              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={markRequiredOnAssign}
                  onCheckedChange={(checked) => setMarkRequiredOnAssign(Boolean(checked))}
                  id="bulk-is-required"
                />
                <label htmlFor="bulk-is-required" className="text-xs tracking-[0.12em] uppercase text-muted-foreground cursor-pointer">
                  Mark selected as required
                </label>
              </div>

              <Button onClick={assignSelected} disabled={assigning || selectedMatrixKeys.length === 0} className="text-xs tracking-[0.2em] uppercase">
                {assigning ? "Assigning..." : `Assign Selected (${selectedMatrixKeys.length})`}
              </Button>
            </div>

            <div className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Class</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentMatrixRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>
                        <Checkbox
                          checked={selectedMatrixKeys.includes(row.key)}
                          disabled={row.assigned}
                          onCheckedChange={(checked) => {
                            setSelectedMatrixKeys((current) => {
                              if (checked) return Array.from(new Set([...current, row.key]));
                              return current.filter((value) => value !== row.key);
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>{row.className}</TableCell>
                      <TableCell>{row.genderLabel}</TableCell>
                      <TableCell>
                        {row.assigned ? (
                          <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700">Assigned</Badge>
                        ) : (
                          <Badge variant="outline">Not Assigned</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.assigned ? (
                          <Checkbox
                            checked={Boolean(row.assignment?.is_required)}
                            onCheckedChange={(checked) => toggleRequired(row.assignment.id, Boolean(checked))}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="w-48">
          <Select value={schoolFilter} onValueChange={(value) => updateFilter("school", value)}>
            <SelectTrigger><SelectValue placeholder="All Schools" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All Schools</SelectItem>
              {schools?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={classFilter} onValueChange={(value) => updateFilter("class", value)}>
            <SelectTrigger><SelectValue placeholder="All Classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All Classes</SelectItem>
              {filteredClassesForFilter.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={genderFilter} onValueChange={(value) => updateFilter("gender", value)}>
            <SelectTrigger><SelectValue placeholder="All Genders" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All Genders</SelectItem>
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
