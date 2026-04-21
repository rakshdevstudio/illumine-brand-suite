import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 12;
const HIGH_VALUE_THRESHOLD = 20000;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value);

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string;
  created_at: string;
};

type StudentRow = {
  id: string;
  customer_id: string;
  school_id: string;
  class_id: string;
  gender: string;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  total_amount: number;
  created_at: string;
};

const CustomersPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [sortBy, setSortBy] = useState("recent");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [highValueOnly, setHighValueOnly] = useState("all");
  const [page, setPage] = useState(1);

  const { data: customers, isLoading: loadingCustomers, error: customersError } = useQuery({
    queryKey: ["crm-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CustomerRow[];
    },
  });

  const { data: students, error: studentsError } = useQuery({
    queryKey: ["crm-students-for-customers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("students")
        .select("id, customer_id, school_id, class_id, gender");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const { data: orders, error: ordersError } = useQuery({
    queryKey: ["crm-orders-for-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_id, total_amount, created_at");
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const { data: schoolsData } = useQuery({
    queryKey: ["crm-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: classesData } = useQuery({
    queryKey: ["crm-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name").order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const schools = useMemo(() => (schoolsData ?? []).map((s: any) => ({ id: s.id, name: s.name })), [schoolsData]);
  const classes = useMemo(() => (classesData ?? []).map((c: any) => ({ id: c.id, name: c.name })), [classesData]);

  const studentsByCustomer = useMemo(() => {
    const map = new Map<string, StudentRow[]>();
    (students ?? []).forEach((student) => {
      const existing = map.get(student.customer_id) ?? [];
      existing.push(student);
      map.set(student.customer_id, existing);
    });
    return map;
  }, [students]);

  const ordersByCustomer = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    (orders ?? []).forEach((order) => {
      if (!order.customer_id) return;
      const existing = map.get(order.customer_id) ?? [];
      existing.push(order);
      map.set(order.customer_id, existing);
    });
    return map;
  }, [orders]);

  const rows = useMemo(() => {
    const source = customers ?? [];

    return source.map((customer) => {
      const relatedStudents = studentsByCustomer.get(customer.id) ?? [];
      const relatedOrders = ordersByCustomer.get(customer.id) ?? [];
      const totalSpend = relatedOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      const latestOrderAt = relatedOrders
        .map((order) => order.created_at)
        .sort((a, b) => +new Date(b) - +new Date(a))[0] ?? customer.created_at;

      return {
        ...customer,
        students: relatedStudents,
        orders: relatedOrders,
        studentsCount: relatedStudents.length,
        ordersCount: relatedOrders.length,
        totalSpend,
        latestOrderAt,
      };
    });
  }, [customers, studentsByCustomer, ordersByCustomer]);

  const filteredRows = useMemo(() => {
    const result = rows.filter((row) => {
      if (deferredSearch) {
        const name = String(row.name ?? "").toLowerCase();
        const phone = String(row.phone ?? "");
        if (!name.includes(deferredSearch) && !phone.includes(deferredSearch.replace(/\s+/g, ""))) {
          return false;
        }
      }

      if (schoolFilter !== "all") {
        if (!row.students.some((student) => student.school_id === schoolFilter)) return false;
      }

      if (classFilter !== "all") {
        if (!row.students.some((student) => student.class_id === classFilter)) return false;
      }

      if (genderFilter !== "all") {
        if (!row.students.some((student) => student.gender === genderFilter)) return false;
      }

      if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00`);
        if (!row.orders.some((order) => new Date(order.created_at) >= from)) return false;
      }

      if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59`);
        if (!row.orders.some((order) => new Date(order.created_at) <= to)) return false;
      }

      if (highValueOnly === "high" && row.totalSpend < HIGH_VALUE_THRESHOLD) {
        return false;
      }

      return true;
    });

    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return String(a.name ?? "").localeCompare(String(b.name ?? ""));
        case "orders":
          return b.ordersCount - a.ordersCount;
        case "spend":
          return b.totalSpend - a.totalSpend;
        case "recent":
        default:
          return +new Date(b.latestOrderAt) - +new Date(a.latestOrderAt);
      }
    });

    return sorted;
  }, [rows, deferredSearch, schoolFilter, classFilter, genderFilter, dateFrom, dateTo, highValueOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin-customers-scroll");
    if (saved) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: Number(saved), behavior: "auto" });
      });
      sessionStorage.removeItem("admin-customers-scroll");
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, schoolFilter, classFilter, genderFilter, dateFrom, dateTo, highValueOnly, sortBy]);

  const queryError = (customersError || studentsError || ordersError) as Error | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-light tracking-[0.1em] uppercase">Customers</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{filteredRows.length} records</p>
      </div>

      {queryError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load CRM data: {queryError.message}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" />

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger>
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="orders">Total Orders</SelectItem>
            <SelectItem value="spend">Total Spend</SelectItem>
          </SelectContent>
        </Select>

        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger>
            <SelectValue placeholder="School" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map((school) => (
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
            {classes.map((klass) => (
              <SelectItem key={klass.id} value={klass.id}>{klass.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
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

        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />

        <Select value={highValueOnly} onValueChange={setHighValueOnly}>
          <SelectTrigger>
            <SelectValue placeholder="Value segment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="high">High Value (₹20k+)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Students</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Total Spend</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingCustomers ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Loading customers...</TableCell>
              </TableRow>
            ) : pagedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No customers found.</TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => {
                    sessionStorage.setItem("admin-customers-scroll", String(window.scrollY));
                    navigate(`/admin/customers/${row.id}`);
                  }}
                >
                  <TableCell>{row.name || "-"}</TableCell>
                  <TableCell>{row.phone || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{row.email || "-"}</TableCell>
                  <TableCell className="text-right">{row.studentsCount}</TableCell>
                  <TableCell className="text-right">{row.ordersCount}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.totalSpend)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        sessionStorage.setItem("admin-customers-scroll", String(window.scrollY));
                        navigate(`/admin/customers/${row.id}`);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CustomersPage;
