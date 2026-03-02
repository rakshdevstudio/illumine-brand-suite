import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { getDisplayImage } from "@/lib/product-images";

const ProductSegregationPage = () => {
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

  const { data: products, isLoading } = useQuery({
    queryKey: ["all-products-segregation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_images(*)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const schoolMap = useMemo(() => {
    const m: Record<string, (typeof schools extends (infer T)[] | undefined ? T : never)> = {};
    schools?.forEach((s) => (m[s.id] = s));
    return m;
  }, [schools]);

  const classMap = useMemo(() => {
    const m: Record<string, (typeof classes extends (infer T)[] | undefined ? T : never)> = {};
    classes?.forEach((c) => (m[c.id] = c));
    return m;
  }, [classes]);

  const filtered = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      if (schoolFilter !== "all" && p.school_id !== schoolFilter) return false;
      if (classFilter !== "all" && p.class_id !== classFilter) return false;
      if (genderFilter !== "all" && p.gender !== genderFilter) return false;
      return true;
    });
  }, [products, schoolFilter, classFilter, genderFilter]);

  const isVisible = (p: (typeof products extends (infer T)[] | undefined ? T : never)) => {
    const school = schoolMap[p.school_id];
    const cls = p.class_id ? classMap[p.class_id] : null;
    return school?.status === "active" && (!p.class_id || cls?.status === "active") && p.status === "active";
  };

  const hasInvalidConfig = (p: (typeof products extends (infer T)[] | undefined ? T : never)) => {
    return !p.school_id || !p.class_id || !p.gender;
  };

  const buildTestLink = (p: (typeof products extends (infer T)[] | undefined ? T : never)) => {
    const school = schoolMap[p.school_id];
    const cls = p.class_id ? classMap[p.class_id] : null;
    if (!school || !cls) return null;
    const genderSlug = p.gender === "Male" ? "boys" : p.gender === "Female" ? "girls" : "unisex";
    return `/store/school/${school.slug}/class/${cls.slug}/gender/${genderSlug}`;
  };

  // Summary counts
  const genderCounts = useMemo(() => {
    const c = { Male: 0, Female: 0, Unisex: 0 };
    products?.forEach((p) => {
      if (p.gender in c) c[p.gender as keyof typeof c]++;
    });
    return c;
  }, [products]);

  const schoolCounts = useMemo(() => {
    const c: Record<string, number> = {};
    products?.forEach((p) => {
      const name = schoolMap[p.school_id]?.name || "Unknown";
      c[name] = (c[name] || 0) + 1;
    });
    return c;
  }, [products, schoolMap]);

  const classCounts = useMemo(() => {
    const c: Record<string, number> = {};
    products?.forEach((p) => {
      const name = p.class_id ? classMap[p.class_id]?.name || "Unknown" : "Unassigned";
      c[name] = (c[name] || 0) + 1;
    });
    return c;
  }, [products, classMap]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-light tracking-[0.1em] uppercase mb-1">Product Segregation Testing</h1>
        <p className="text-xs text-muted-foreground tracking-wide">Verify products are correctly segregated by school, class, and gender</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Schools" value={schools?.length ?? 0} />
        <SummaryCard label="Total Classes" value={classes?.length ?? 0} />
        <SummaryCard label="Total Products" value={products?.length ?? 0} />
        <SummaryCard label="Visible in Store" value={products?.filter(isVisible).length ?? 0} />
      </div>

      {/* Gender breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Boys" value={genderCounts.Male} />
        <SummaryCard label="Girls" value={genderCounts.Female} />
        <SummaryCard label="Unisex" value={genderCounts.Unisex} />
      </div>

      {/* Per-school and per-class breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border border-border p-4 space-y-2">
          <h3 className="text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">Products by School</h3>
          {Object.entries(schoolCounts).map(([name, count]) => (
            <div key={name} className="flex justify-between text-sm">
              <span>{name}</span>
              <span className="text-muted-foreground">{count}</span>
            </div>
          ))}
          {Object.keys(schoolCounts).length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
        </div>
        <div className="border border-border p-4 space-y-2">
          <h3 className="text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">Products by Class</h3>
          {Object.entries(classCounts).map(([name, count]) => (
            <div key={name} className="flex justify-between text-sm">
              <span>{name}</span>
              <span className="text-muted-foreground">{count}</span>
            </div>
          ))}
          {Object.keys(classCounts).length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
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
              {classes?.map((c) => (
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
        <p className="text-sm text-muted-foreground animate-pulse">Loading products…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No products match filters</p>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Image</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visible</TableHead>
                <TableHead className="w-24">Test</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const school = schoolMap[p.school_id];
                const cls = p.class_id ? classMap[p.class_id] : null;
                const visible = isVisible(p);
                const invalid = hasInvalidConfig(p);
                const testLink = buildTestLink(p);

                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <img
                        src={getDisplayImage(p as any)}
                        alt={p.name}
                        className="w-10 h-10 object-contain border border-border"
                        onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{p.name}</span>
                      {invalid && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Invalid Config
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{school?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{cls?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {p.gender === "Male" ? "Boys" : p.gender === "Female" ? "Girls" : "Unisex"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${visible ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                      <span className="ml-2 text-xs">{visible ? "Yes" : "No"}</span>
                    </TableCell>
                    <TableCell>
                      {testLink ? (
                        <a
                          href={testLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Test <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border p-4">
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-extralight">{value}</p>
    </div>
  );
}

export default ProductSegregationPage;
