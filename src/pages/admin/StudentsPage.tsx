import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const HIGH_VALUE_THRESHOLD = 20000;

const StudentsPage = () => {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [highValueOnly, setHighValueOnly] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: students, isLoading, error: studentsError } = useQuery({
    queryKey: ["crm-students"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("students")
        .select("id, name, gender, created_at, customer_id, school_id, class_id, customers(name, phone), schools(name), classes(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["crm-orders-by-student"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, student_id, created_at, total_amount")
        .not("student_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schoolsData } = useQuery({
    queryKey: ["crm-schools-students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: classesData } = useQuery({
    queryKey: ["crm-classes-students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name").order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderStatsByStudent = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    (orders ?? []).forEach((order: any) => {
      const studentId = order.student_id as string;
      if (!studentId) return;
      const prev = map.get(studentId) ?? { count: 0, total: 0 };
      map.set(studentId, {
        count: prev.count + 1,
        total: prev.total + Number(order.total_amount || 0),
      });
    });
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    return (students ?? []).filter((student: any) => {
      if (deferredSearch) {
        const studentName = String(student.name || "").toLowerCase();
        const parentName = String(student.customers?.name || "").toLowerCase();
        if (!studentName.includes(deferredSearch) && !parentName.includes(deferredSearch)) {
          return false;
        }
      }

      if (schoolFilter !== "all" && student.school_id !== schoolFilter) return false;
      if (classFilter !== "all" && student.class_id !== classFilter) return false;
      if (genderFilter !== "all" && student.gender !== genderFilter) return false;

      const stat = orderStatsByStudent.get(student.id) ?? { count: 0, total: 0 };
      if (highValueOnly === "high" && stat.total < HIGH_VALUE_THRESHOLD) return false;

      if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00`);
        if (new Date(student.created_at) < from) return false;
      }
      if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59`);
        if (new Date(student.created_at) > to) return false;
      }

      return true;
    });
  }, [students, deferredSearch, schoolFilter, classFilter, genderFilter, highValueOnly, dateFrom, dateTo, orderStatsByStudent]);

  const queryError = studentsError as Error | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Students</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{filtered.length} records</p>
      </div>

      {queryError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load students: {queryError.message}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student or parent" />

        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger>
            <SelectValue placeholder="School" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {(schoolsData ?? []).map((school: any) => (
              <SelectItem key={school.id} value={school.id}>{school.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {(classesData ?? []).map((klass: any) => (
              <SelectItem key={klass.id} value={klass.id}>{klass.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
            <SelectItem value="Unisex">Unisex</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Select value={highValueOnly} onValueChange={setHighValueOnly}>
          <SelectTrigger>
            <SelectValue placeholder="Value segment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Students</SelectItem>
            <SelectItem value="high">High Value (₹20k+)</SelectItem>
          </SelectContent>
        </Select>
        <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground flex items-center">
          Threshold: ₹20,000 total student spend
        </div>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student Name</TableHead>
              <TableHead>Parent Name</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead className="text-right">Orders Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading students...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No students found.</TableCell>
              </TableRow>
            ) : (
              filtered.map((student: any) => {
                const stat = orderStatsByStudent.get(student.id) ?? { count: 0, total: 0 };
                return (
                  <TableRow key={student.id}>
                    <TableCell>{student.name}</TableCell>
                    <TableCell>{student.customers?.name || "-"}</TableCell>
                    <TableCell>{student.schools?.name || "-"}</TableCell>
                    <TableCell>{student.classes?.name || "-"}</TableCell>
                    <TableCell>{student.gender}</TableCell>
                    <TableCell className="text-right">{stat.count}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default StudentsPage;
