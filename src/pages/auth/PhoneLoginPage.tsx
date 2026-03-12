import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import illumeLogo from "@/assets/illume-logo.png";

type Step = "phone" | "otp";

const PhoneLoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/store";
  const setCustomer = useCustomerAuth((s) => s.setCustomer);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  /** Normalize phone to E.164. Accepts 10-digit or +91XXXXXXXXXX */
  const toE164 = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return `+${digits}`;
  };

  const formattedPhone = toE164(phone);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("OTP sent");
    setStep("otp");
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) {
      toast.error("Enter the OTP");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: otp,
      type: "sms",
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    // Upsert customer record
    const user = data.session?.user;
    if (user) {
      await supabase.from("customers").upsert(
        { id: user.id, phone: formattedPhone },
        { onConflict: "id", ignoreDuplicates: false }
      );

      const { data: customer } = await supabase
        .from("customers")
        .select("id, phone, name, email")
        .eq("id", user.id)
        .single();

      setCustomer(customer ?? { id: user.id, phone: formattedPhone, name: null, email: null });
    }

    setLoading(false);
    toast.success("Logged in");
    navigate(redirectTo, { replace: true });
  };

  const handleResend = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("OTP resent");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Minimal header */}
      <header className="bg-surface-dark border-b border-surface-dark">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center">
          <Link to="/store">
            <img
              src={illumeLogo}
              alt="Illume"
              className="h-8 w-auto"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {step === "phone" ? (
            <>
              <h1 className="text-2xl font-extralight tracking-[0.08em] uppercase mb-2">
                Sign In
              </h1>
              <p className="text-sm text-muted-foreground mb-10">
                Enter your phone number to receive an OTP
              </p>

              <form onSubmit={handleSendOtp} className="space-y-6">
                <div>
                  <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
                    Phone Number
                  </label>
                  <div className="flex">
                    <span className="flex items-center px-3 border border-r-0 border-border bg-secondary text-sm text-muted-foreground select-none">
                      +91
                    </span>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="h-12 rounded-none flex-1"
                      placeholder="98765 43210"
                      autoComplete="tel-national"
                      autoFocus
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-xs tracking-[0.2em] uppercase"
                >
                  {loading ? "Sending OTP…" : "Send OTP"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extralight tracking-[0.08em] uppercase mb-2">
                Verify OTP
              </h1>
              <p className="text-sm text-muted-foreground mb-2">
                Enter the 6-digit code sent to
              </p>
              <p className="text-sm font-medium mb-10">{formattedPhone}</p>

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                  <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
                    One-Time Password
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-12 text-center text-xl tracking-[0.4em]"
                    placeholder="— — — — — —"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-xs tracking-[0.2em] uppercase"
                >
                  {loading ? "Verifying…" : "Verify & Continue"}
                </Button>
              </form>

              <div className="mt-6 flex items-center gap-4">
                <button
                  onClick={() => { setStep("phone"); setOtp(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Change number
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={handleResend}
                  disabled={loading}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                >
                  Resend OTP
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default PhoneLoginPage;
