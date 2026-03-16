import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import illumeLogo from "@/assets/illume-logo.jpeg";

type Step = "email" | "sent";

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const next = searchParams.get("next") ?? "/store";

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [loading, setLoading] = useState(false);

  const { signInWithEmail } = useCustomerAuth();

  // If user arrives back after clicking magic link, Supabase auto-exchanges
  // the token and fires onAuthStateChange → SIGNED_IN. Detect it here.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          useCustomerAuth.getState().refreshCustomer().then(() => {
            const state = useCustomerAuth.getState();
            // First-time user (no name + no school) → go to onboarding
            if (state.isNewUser()) {
              navigate(`/onboarding${next !== "/store" ? `?next=${encodeURIComponent(next)}` : ""}`, { replace: true });
            } else {
              navigate(next, { replace: true });
            }
          });
        }
      }
    );
    // Also handle if already signed in on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate(next, { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate, next]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await signInWithEmail(email.trim());
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Failed to send link. Try again.");
    } else {
      setStep("sent");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <Link to="/store" className="mb-12">
        <img src={illumeLogo} alt="Illume" className="h-10 w-auto opacity-80" />
      </Link>

      <div className="w-full max-w-sm">
        {step === "email" ? (
          <>
            <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-2 text-center">
              Sign In
            </h1>
            <p className="text-xs text-muted-foreground tracking-wide text-center mb-10">
              Enter your email and we'll send a magic link.
            </p>

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 border-border"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-xs tracking-[0.2em] uppercase"
              >
                {loading ? "Sending…" : "Send Magic Link"}
              </Button>
            </form>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              Continue as a guest?{" "}
              <Link to="/store" className="underline underline-offset-2 hover:text-foreground">
                Browse store
              </Link>
            </p>
          </>
        ) : (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-extralight tracking-[0.08em] uppercase">
              Check Your Email
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We sent a magic link to{" "}
              <span className="font-medium text-foreground">{email}</span>.
              <br />
              Click it to sign in — no password needed.
            </p>
            <button
              onClick={() => setStep("email")}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground mt-4 inline-block"
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
