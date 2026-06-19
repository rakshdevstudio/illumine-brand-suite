import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    company_name: "",
    company_gstin: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    invoice_prefix: "INV-",
    default_gst_rate: "5.00",
    barcode_width_mm: "60.00",
    barcode_height_mm: "40.00",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["business-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("business_settings")
        .select("*")
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        company_name: settings.company_name || "",
        company_gstin: settings.company_gstin || "",
        company_address: settings.company_address || "",
        company_phone: settings.company_phone || "",
        company_email: settings.company_email || "",
        invoice_prefix: settings.invoice_prefix || "INV-",
        default_gst_rate: String(settings.default_gst_rate || "5.00"),
        barcode_width_mm: String(settings.barcode_width_mm || "60.00"),
        barcode_height_mm: String(settings.barcode_height_mm || "40.00"),
      });
    }
  }, [settings]);

  const updateSettings = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("business_settings")
        .update({
          company_name: form.company_name,
          company_gstin: form.company_gstin,
          company_address: form.company_address,
          company_phone: form.company_phone || null,
          company_email: form.company_email || null,
          invoice_prefix: form.invoice_prefix,
          default_gst_rate: Number(form.default_gst_rate),
          barcode_width_mm: Number(form.barcode_width_mm),
          barcode_height_mm: Number(form.barcode_height_mm),
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["business-settings"] });
    },
    onError: (err: any) => {
      toast.error(`Failed to update settings: ${err.message}`);
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Business Settings</h2>
        <p className="text-muted-foreground">Manage your company details, invoice formats, and defaults.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
            <CardDescription>This information will appear on your invoices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>GSTIN *</Label>
              <Input
                value={form.company_gstin}
                onChange={(e) => setForm({ ...form, company_gstin: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Address *</Label>
              <Textarea
                value={form.company_address}
                onChange={(e) => setForm({ ...form, company_address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.company_phone}
                  onChange={(e) => setForm({ ...form, company_phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.company_email}
                  onChange={(e) => setForm({ ...form, company_email: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoicing & Defaults</CardTitle>
            <CardDescription>Configure numbering and default rates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Invoice Prefix *</Label>
              <Input
                value={form.invoice_prefix}
                onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })}
                placeholder="e.g., INV-"
              />
              <p className="text-xs text-muted-foreground">Example: {form.invoice_prefix}20261010-ABCD</p>
            </div>
            <div className="space-y-2">
              <Label>Default GST Rate (%) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.default_gst_rate}
                onChange={(e) => setForm({ ...form, default_gst_rate: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Barcode Printing</CardTitle>
            <CardDescription>Set default dimensions for TSPL thermal printing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Width (mm) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.barcode_width_mm}
                  onChange={(e) => setForm({ ...form, barcode_width_mm: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Height (mm) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.barcode_height_mm}
                  onChange={(e) => setForm({ ...form, barcode_height_mm: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => updateSettings.mutate()}
          disabled={updateSettings.isPending || !form.company_name || !form.company_gstin || !form.company_address}
          className="rounded-full shadow-[0_0_40px_-10px_rgba(15,23,42,0.6)]"
        >
          {updateSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
