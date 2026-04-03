import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolContext } from "@/lib/school-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const SchoolCodePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const school = useSchoolContext((s) => s.school);
  const setSchool = useSchoolContext((s) => s.setSchool);
  const clearSchool = useSchoolContext((s) => s.clearSchool);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      toast.error("Enter a valid school code");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, slug, code, status")
        .eq("code", normalized)
        .eq("status", "active")
        .single();

      if (error || !data) {
        toast.error("Invalid or inactive school code");
        return;
      }

      setSchool({
        id: data.id,
        name: data.name,
        slug: data.slug,
        code: data.code ?? normalized,
      });

      const next = (location.state as any)?.from as string | undefined;
      navigate(next ?? `/store/school/${data.slug}`, { replace: true });
    } catch (err) {
      console.error("Failed to validate school code", err);
      toast.error("Unable to validate school code right now");
    } finally {
      setLoading(false);
    }
  };

  const resetAndStay = () => {
    clearSchool();
    setCode("");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md border border-border bg-card p-8 shadow-sm">
        <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-4">
          Secure Access
        </p>
        <h1 className="text-2xl font-light tracking-[0.1em] uppercase mb-6">
          Enter School Code
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          This platform is strictly tenant-isolated. Provide your school code to load the right catalog. If the code is missing or incorrect, access is denied.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs tracking-[0.2em] uppercase text-muted-foreground block mb-2">
              School Code
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. GAFL2026"
              autoFocus
              className="h-11"
            />
          </div>
          <Button type="submit" className="w-full h-11 text-xs tracking-[0.2em] uppercase" disabled={loading}>
            {loading ? "Validating..." : "Continue"}
          </Button>
        </form>

        {school && (
          <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground space-y-2">
            <div className="flex items-center justify-between">
              <span>Active school</span>
              <span className="text-foreground font-medium">{school.name}</span>
            </div>
            <Button variant="ghost" size="sm" className="text-[11px] tracking-[0.15em] uppercase" onClick={resetAndStay}>
              Switch School
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchoolCodePage;
