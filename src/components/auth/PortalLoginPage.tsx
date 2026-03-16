import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import illumeLogo from "@/assets/illume-logo.jpeg";
import { getRoleRedirectPath, type AppRole } from "@/hooks/use-auth";

interface PortalLoginPageProps {
  /** Human-readable portal name shown on the page, e.g. "Vendor Portal" */
  portalLabel: string;
  /** Roles that are allowed to log in via this portal */
  allowedRoles: AppRole[];
  /** Fallback redirect if role is not matched (optional — getRoleRedirectPath is used by default) */
  fallbackPath?: string;
}

const PortalLoginPage = ({ portalLabel, allowedRoles, fallbackPath }: PortalLoginPageProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: data.user.id });

    if (!userRole || !allowedRoles.includes(userRole as AppRole)) {
      await supabase.auth.signOut();
      toast.error("Access denied. You do not have permission to use this portal.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", data.user.id)
      .single();

    if (profile?.status === "disabled") {
      await supabase.auth.signOut();
      toast.error("Your account has been disabled.");
      setLoading(false);
      return;
    }

    toast.success("Welcome back");
    navigate(fallbackPath ?? getRoleRedirectPath(userRole as AppRole));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-12">
          <img
            src={illumeLogo}
            alt="Illume"
            className="h-10 w-auto"
          />
        </div>

        <h1 className="text-sm font-light tracking-[0.2em] uppercase text-center mb-1">
          {portalLabel}
        </h1>
        <p className="text-[10px] text-muted-foreground text-center tracking-wider mb-8">
          Sign in to continue
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
              Email
            </label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
              placeholder="you@illume.com"
              required
            />
          </div>
          <div>
            <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
              Password
            </label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
              placeholder="••••••••"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 text-xs tracking-[0.2em] uppercase mt-2"
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <p className="text-[10px] text-muted-foreground text-center mt-8 tracking-wider">
          Access restricted to authorised users
        </p>
      </div>
    </div>
  );
};

export default PortalLoginPage;
