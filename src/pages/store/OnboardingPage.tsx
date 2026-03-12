import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useStudentProfile } from "@/lib/student-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import illumeLogo from "@/assets/illume-logo.png";

type Step = 1 | 2;

const GENDERS = [
  { value: "boys",   label: "Boys"  },
  { value: "girls",  label: "Girls" },
] as const;

const OnboardingPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const next = searchParams.get("next") ?? "/store";

  const { user, customer, loading, updateProfile } = useCustomerAuth();

  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  // Step 1 fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2 fields
  const [schoolId, setSchoolId] = useState("");
  const [classId, setClassId] = useState("");
  const [gender, setGender] = useState<"boys" | "girls" | "">("");

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, navigate]);

  // Pre-fill from existing customer data; skip to step 2 if name already set
  useEffect(() => {
    if (customer) {
      if (customer.name)  setName(customer.name);
      if (customer.phone) setPhone(customer.phone);
      if (customer.child_school_id) setSchoolId(customer.child_school_id);
      if (customer.child_class_id)  setClassId(customer.child_class_id);
      if (customer.child_gender)    setGender(customer.child_gender as "boys" | "girls");
      // Already has a name → jump straight to school selection
      if (customer.name) setStep(2);
    queryKey: ["classes-onboarding", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, slug")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Reset class when school changes
  const handleSchoolChange = (id: string) => {
    setSchoolId(id);
    setClassId("");
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    setStep(2);
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !classId || !gender) {
      toast.error("Please select school, class, and gender.");
      return;
    }

    setSaving(true);
    const { error } = await updateProfile({
      name: name.trim(),
      phone: phone.trim() || undefined,
      child_school_id: schoolId,
      child_class_id: classId,
      child_gender: gender,
    });
    setSaving(false);

    if (error) {
      toast.error("Failed to save profile. Please try again.");
      return;
    }

    // Set StudentProfile store so the user lands directly on their class page
    const school = schools.find((s) => s.id === schoolId);
    const cls    = classes.find((c) => c.id === classId);
    if (school && cls) {
      useStudentProfile.getState().setProfile({
        schoolId:    school.id,
        schoolName:  school.name,
        schoolSlug:  school.slug,
        classId:     cls.id,
        className:   cls.name,
        classSlug:   cls.slug,
        gender:      gender as "boys" | "girls",
        genderLabel: gender === "boys" ? "Boys" : "Girls",
      });

      // Redirect to child's class page (or original next if it's checkout)
      const isCheckout = next.includes("/checkout") || next.includes("/cart");
      if (isCheckout) {
        navigate(next, { replace: true });
      } else {
        navigate(
          `/store/school/${school.slug}/class/${cls.slug}/gender/${gender}`,
          { replace: true }
        );
      }
    } else {
      navigate(next, { replace: true });
    }
  };

  if (loading) return null;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <Link to="/store" className="mb-12">
        <img src={illumeLogo} alt="Illume" className="h-10 w-auto opacity-80" />
      </Link>

      <div className="w-full max-w-sm">
        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {([1, 2] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors ${
                  s === step
                    ? "bg-foreground text-background"
                    : s < step
                    ? "bg-foreground/30 text-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 2 && (
                <div className={`h-px w-8 transition-colors ${step > s ? "bg-foreground/30" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 1: About you ───────────────────────────── */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-5">
            <div>
              <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-1">
                About You
              </h1>
              <p className="text-xs text-muted-foreground tracking-wide">
                Let's start with your details as the parent.
              </p>
            </div>

            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
                Your Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 border-border"
                placeholder="e.g. Priya Sharma"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
                Phone Number{" "}
                <span className="text-muted-foreground normal-case tracking-normal">(optional)</span>
              </label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 border-border"
                placeholder="+91 98765 43210"
                autoComplete="tel"
              />
            </div>

            <Button type="submit" className="w-full h-12 text-xs tracking-[0.2em] uppercase flex items-center gap-2">
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </form>
        )}

        {/* ── Step 2: Child's school ──────────────────────── */}
        {step === 2 && (
          <form onSubmit={handleFinish} className="space-y-5">
            <div>
              <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-1">
                Your Child's School
              </h1>
              <p className="text-xs text-muted-foreground tracking-wide">
                This lets us show only the right uniforms.
              </p>
            </div>

            {/* School */}
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
                School <span className="text-destructive">*</span>
              </label>
              <select
                value={schoolId}
                onChange={(e) => handleSchoolChange(e.target.value)}
                required
                className="w-full h-12 border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select school…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Class */}
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
                Class <span className="text-destructive">*</span>
              </label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                required
                disabled={!schoolId}
                className="w-full h-12 border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {schoolId ? "Select class…" : "Select school first"}
                </option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Gender */}
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-3">
                Section <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {GENDERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGender(value)}
                    className={`h-12 border text-xs tracking-[0.2em] uppercase transition-colors ${
                      gender === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-foreground hover:border-foreground/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-12 text-xs tracking-[0.2em] uppercase"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={saving || !schoolId || !classId || !gender}
                className="flex-1 h-12 text-xs tracking-[0.2em] uppercase"
              >
                {saving ? "Saving…" : "Get Started"}
              </Button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          You can update this anytime from{" "}
          <Link to="/store/account" className="underline underline-offset-2 hover:text-foreground">
            your account
          </Link>
          .
        </p>
      </div>
    </div>
  );
};

export default OnboardingPage;
