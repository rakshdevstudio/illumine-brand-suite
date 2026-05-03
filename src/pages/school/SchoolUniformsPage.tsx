import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useResolvedSchoolScope } from "@/lib/portal-dashboard";
import { fetchSchoolPortalData } from "@/lib/school-portal";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const RULE_TYPES = ["mandatory", "optional", "seasonal", "sports", "house"] as const;

const SchoolUniformsPage = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;
  const queryClient = useQueryClient();

  const { data: portalData } = useQuery({
    queryKey: ["school-portal", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchSchoolPortalData(schoolId!),
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["school-products", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, category, status, price").eq("school_id", schoolId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["school-uniform-rules", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("school_uniform_rules").select("*").eq("school_id", schoolId).eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertRule = useMutation({
    mutationFn: async ({ productId, ruleType }: { productId: string; ruleType: string }) => {
      const { data: existing } = await (supabase as any)
        .from("school_uniform_rules")
        .select("id")
        .eq("school_id", schoolId)
        .eq("product_id", productId)
        .eq("rule_type", ruleType)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await (supabase as any).from("school_uniform_rules").update({ is_active: true }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("school_uniform_rules").insert({
          school_id: schoolId,
          product_id: productId,
          rule_type: ruleType,
          is_active: true,
          created_by: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Uniform rule updated.");
      await queryClient.invalidateQueries({ queryKey: ["school-uniform-rules", schoolId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update uniform rule."),
  });

  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    (portalData?.lowStockItems ?? []).forEach((item) => map.set(item.productId, item.remainingStock));
    return map;
  }, [portalData?.lowStockItems]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading...</p></div>;
  if (!user || !hasAccess || !isSchoolUser) return <Navigate to="/school/login" replace />;

  return (
    <PortalShell title="Uniforms" subtitle={user.email ?? "School uniform management"} onSignOut={signOut} scopeLabel={scope?.school?.name ?? (scopeLoading ? "Resolving school" : "School not assigned")}>
      <Card className={portalPanelClassName}>
        <CardHeader><CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Approved Uniform Catalog</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Status</TableHead><TableHead>Rule</TableHead></TableRow></TableHeader>
            <TableBody>
              {productsLoading ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading uniforms...</TableCell></TableRow> : null}
              {products.map((row: any) => {
                const rule = rules.find((r: any) => r.product_id === row.id)?.rule_type ?? "optional";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.category ?? "-"}</TableCell>
                    <TableCell>₹{Number(row.price ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell>{stockByProduct.get(row.id) ?? "In stock"}</TableCell>
                    <TableCell><Badge variant="outline" className="rounded-full">{row.status}</Badge></TableCell>
                    <TableCell>
                      <Select value={rule} onValueChange={(value) => upsertRule.mutate({ productId: row.id, ruleType: value })}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>{RULE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default SchoolUniformsPage;
