import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSchoolContext } from "@/lib/school-context";
import { motion } from "framer-motion";

const ShopBySchoolPage = () => {
  const navigate = useNavigate();
  const setSchool = useSchoolContext((s) => s.setSchool);
  const clearSchool = useSchoolContext((s) => s.clearSchool);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearSchool();
  }, [clearSchool]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("Invalid code. Please check with your school.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, slug, code, status")
        .eq("code", normalized)
        .eq("status", "active")
        .single();

      if (error || !data) {
        setError("Invalid code. Please check with your school.");
        return;
      }

      setSchool({
        id: data.id,
        name: data.name,
        slug: data.slug,
        code: data.code ?? normalized,
      });

      navigate("/store", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16 bg-gradient-to-b from-white to-slate-50">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-[420px] rounded-2xl bg-white shadow-[0_20px_70px_rgba(0,0,0,0.08)] p-8"
      >
        <div className="mb-8">
          <p className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground mb-3">Secure Entry</p>
          <h1 className="text-3xl font-light tracking-[0.08em] text-foreground">Shop by School</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Enter your school code to access your uniform store.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter school code"
              className="h-12 text-lg tracking-[0.24em] uppercase focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-0"
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-sm font-medium tracking-[0.14em] uppercase bg-black text-white hover:opacity-90 active:scale-[0.99] transition"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border border-white/40 border-t-white" />
                Continuing
              </span>
            ) : (
              "Continue"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Back to Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default ShopBySchoolPage;
