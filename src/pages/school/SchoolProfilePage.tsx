import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useResolvedSchoolScope } from "@/lib/portal-dashboard";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SchoolProfilePage = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();
  const { data: scope, isLoading: scopeLoading } = useResolvedSchoolScope(user);
  const schoolId = scope?.schoolId ?? null;
  const [form, setForm] = useState({ name: "", logoUrl: "", address: "", coordinatorName: "", phone: "", email: "", gstin: "", deliveryTerms: "" });

  const { data: school } = useQuery({
    queryKey: ["school-profile", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("schools").select("*").eq("id", schoolId).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!school) return;
    setForm({
      name: school.name ?? "",
      logoUrl: school.logo_url ?? "",
      address: school.address ?? "",
      coordinatorName: school.coordinator_name ?? "",
      phone: school.phone ?? "",
      email: school.email ?? "",
      gstin: school.gstin ?? "",
      deliveryTerms: school.delivery_terms ?? "",
    });
  }, [school]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("schools").update({
        name: form.name.trim(),
        logo_url: form.logoUrl.trim() || null,
        address: form.address.trim() || null,
        coordinator_name: form.coordinatorName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        gstin: form.gstin.trim() || null,
        delivery_terms: form.deliveryTerms.trim() || null,
      }).eq("id", schoolId);
      if (error) throw error;
    },
    onSuccess: () => toast.success("School profile updated."),
    onError: (e: any) => toast.error(e.message || "Failed to update profile."),
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading...</p></div>;
  if (!user || !hasAccess || !isSchoolUser) return <Navigate to="/school/login" replace />;

  return (
    <PortalShell title="School Profile" subtitle={user.email ?? "School settings"} onSignOut={signOut} scopeLabel={scope?.school?.name ?? (scopeLoading ? "Resolving school" : "School not assigned")}>
      <Card className={portalPanelClassName}>
        <CardHeader><CardTitle className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Profile / Settings</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1"><Label>School Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Logo URL</Label><Input value={form.logoUrl} onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))} /></div>
          <div className="space-y-1 md:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Coordinator Name</Label><Input value={form.coordinatorName} onChange={(e) => setForm((p) => ({ ...p, coordinatorName: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
          <div className="space-y-1"><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value }))} /></div>
          <div className="space-y-1 md:col-span-2"><Label>Preferred Delivery Terms</Label><Input value={form.deliveryTerms} onChange={(e) => setForm((p) => ({ ...p, deliveryTerms: e.target.value }))} /></div>
          <div className="md:col-span-2"><Button onClick={() => save.mutate()} disabled={save.isPending}>Save Settings</Button></div>
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default SchoolProfilePage;
