import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Building2, CheckCircle2, Ruler, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import illumeLogo from "@/assets/illume-logo.png";
import { useStudentProfile } from "@/lib/student-profile";
import ThreadsBackground from "@/components/store/ThreadsBackground";

const REVEAL = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

type SchoolWithClasses = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: string;
  classes: { id: string; name: string; sort_order: number; status: string }[];
};

const DISABLE_AUTO_SCHOOL_REDIRECT = true;

const getClassRange = (classes: SchoolWithClasses["classes"]) => {
  const active = classes
    .filter((c) => c.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0].name;
  return `${active[0].name} – ${active[active.length - 1].name}`;
};

const StorePage = () => {
  const profile = useStudentProfile((s) => s.profile);
  const clearProfile = useStudentProfile((s) => s.clearProfile);
  const openModal = useStudentProfile((s) => s.openModal);
  const navigate = useNavigate();
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [visibleCards, setVisibleCards] = useState<Record<string, boolean>>({});
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const profileRoute = profile
    ? `/store/school/${profile.schoolSlug}/class/${profile.classSlug}/gender/${profile.gender}`
    : null;

  // Auto-redirect returning users after a short delay so they see the banner
  useEffect(() => {
    if (DISABLE_AUTO_SCHOOL_REDIRECT || !profileRoute || bannerDismissed) return;
    const timer = setTimeout(() => navigate(profileRoute), 2500);
    return () => clearTimeout(timer);
  }, [profileRoute, bannerDismissed, navigate]);

  const [checkedFirst, setCheckedFirst] = useState(false);
  useEffect(() => {
    if (!checkedFirst) {
      setCheckedFirst(true);
      // When auto redirect is disabled for development, always keep users on school selection.
      // Saved profile data remains intact for easy re-enable later.
      if (!profile) openModal();
    }
  }, [checkedFirst, profile, openModal]);

  const { data: schools, isLoading } = useQuery({
    queryKey: ["schools-with-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, slug, logo_url, status, classes(id, name, sort_order, status)")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data as unknown as SchoolWithClasses[];
    },
  });

  useEffect(() => {
    if (!schools?.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const cardId = (entry.target as HTMLElement).dataset.schoolId;
          if (!cardId) return;
          setVisibleCards((prev) => ({ ...prev, [cardId]: true }));
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -5% 0px" }
    );

    schools.forEach((school) => {
      const node = cardRefs.current[school.id];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [schools]);

  return (
    <div className="bg-background">
      {/* Smart School Detection banner */}
      {profile && profileRoute && !bannerDismissed && (
        <div className="border-b border-border bg-background/95 backdrop-blur-sm px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground shrink-0">Last visited</span>
            <span className="text-sm font-medium text-foreground truncate">{profile.schoolName}</span>
            <span className="hidden sm:inline text-muted-foreground/50">·</span>
            <span className="hidden sm:inline text-xs text-muted-foreground truncate">
              {profile.className} &nbsp;·&nbsp; {profile.genderLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate(profileRoute)}
              className="text-[11px] tracking-[0.15em] uppercase px-4 py-1.5 bg-foreground text-background rounded hover:opacity-80 transition-opacity"
            >
              Continue
            </button>
            <button
              onClick={() => { clearProfile(); setBannerDismissed(true); }}
              className="text-[11px] tracking-[0.15em] uppercase px-4 py-1.5 border border-border rounded hover:border-foreground transition-colors text-muted-foreground hover:text-foreground"
            >
              Change School
            </button>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden bg-surface-dark text-center px-6 py-32 md:py-44">
        <ThreadsBackground amplitude={1} distance={0} enableMouseInteraction />
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/22 via-black/10 to-black/34 pointer-events-none" />

        <div className="relative z-[2] max-w-3xl mx-auto flex flex-col items-center pointer-events-none">
          <img
            src={illumeLogo}
            alt="Illume"
            className="h-24 md:h-28 w-auto mx-auto mb-8 pointer-events-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />
          <p className="text-[11px] md:text-xs tracking-[0.5em] text-surface-dark-muted uppercase mb-4 font-light pointer-events-auto">
            Illume
          </p>
          <h1 className="text-4xl md:text-6xl font-extralight tracking-[0.28em] text-surface-dark-foreground uppercase leading-[1.1] mb-5 pointer-events-auto">
            Be The Change
          </h1>
          <p className="text-[11px] md:text-xs tracking-[0.38em] text-surface-dark-muted uppercase max-w-xl mx-auto font-light leading-relaxed pointer-events-auto">
            Premium School Uniforms Crafted With Care
          </p>
        </div>

        <div className="absolute z-[2] bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-surface-dark-muted pointer-events-none">
          <span className="text-[9px] tracking-[0.35em] uppercase">Scroll</span>
          <span className="illume-scroll-indicator" />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-28 md:py-36">
        <div className="text-center mb-14">
          <p className="text-[10px] tracking-[0.45em] text-muted-foreground uppercase mb-3">Collections</p>
          <h2 className="text-2xl md:text-3xl font-extralight tracking-[0.18em] uppercase">
            Select Your School
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border h-72 animate-pulse bg-secondary/60" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {schools?.map((school) => {
              const classRange = getClassRange(school.classes ?? []);
              return (
                <div
                  key={school.id}
                  ref={(node) => { cardRefs.current[school.id] = node; }}
                  data-school-id={school.id}
                  className={`group rounded-xl border border-border bg-white shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 flex flex-col overflow-hidden ${
                    visibleCards[school.id] ? "illume-reveal visible" : "illume-reveal"
                  }`}
                >
                  {/* Logo area */}
                  <div className="flex items-center justify-center h-44 bg-secondary/30 border-b border-border px-8">
                    {school.logo_url ? (
                      <img
                        src={school.logo_url}
                        alt={school.name}
                        className="max-h-24 max-w-[160px] w-auto object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                        <Building2 className="h-10 w-10" strokeWidth={1} />
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="flex flex-col flex-1 p-6 gap-4">
                    <div className="flex-1 space-y-1.5">
                      <h3 className="text-sm font-medium tracking-[0.06em] text-foreground leading-snug">
                        {school.name}
                      </h3>
                      {classRange && (
                        <p className="text-xs text-muted-foreground tracking-wide">
                          {classRange}
                        </p>
                      )}
                    </div>

                    <Link to={`/store/school/${school.slug}`} className="block">
                      <Button
                        size="sm"
                        className="w-full text-[11px] tracking-[0.18em] uppercase font-normal group-hover:bg-foreground group-hover:text-background transition-colors duration-300"
                        variant="outline"
                      >
                        Shop Uniforms
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── SECTION 1 · BRAND STORY ─────────────────────────────── */}
      <section className="px-6 py-28 md:py-40">
        <div className="max-w-2xl mx-auto text-center">
          <motion.p
            variants={REVEAL}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-[9px] tracking-[0.46em] uppercase text-muted-foreground mb-6"
          >
            Brand Story
          </motion.p>

          <motion.h2
            variants={REVEAL}
            custom={1}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-3xl md:text-4xl font-extralight tracking-[0.22em] uppercase mb-10 leading-snug"
          >
            Crafted With Care
          </motion.h2>

          <motion.div
            variants={REVEAL}
            custom={2}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="w-8 h-px bg-foreground/20 mx-auto mb-10"
          />

          <motion.p
            variants={REVEAL}
            custom={3}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-sm text-muted-foreground leading-[1.9] mb-6"
          >
            Every Illume uniform is designed with premium fabrics, clean construction, and lasting comfort for everyday school life.
          </motion.p>

          <motion.p
            variants={REVEAL}
            custom={4}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-sm text-muted-foreground leading-[1.9]"
          >
            We focus on quality that looks refined, feels soft, and performs through every term.
          </motion.p>
        </div>
      </section>

      {/* ── SECTION 2 · QUALITY FEATURES ────────────────────────── */}
      <section className="bg-secondary/20 border-y border-border px-6 py-20 md:py-28">
        <div className="max-w-5xl mx-auto">
          <motion.p
            variants={REVEAL}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-center text-[9px] tracking-[0.46em] uppercase text-muted-foreground mb-16"
          >
            Our Promise
          </motion.p>

          <div className="grid md:grid-cols-3 gap-px bg-border">
            {[
              {
                num: "01",
                icon: <Sparkles className="h-5 w-5" strokeWidth={1.5} />,
                title: "Premium Fabric",
                body: "Soft touch, breathable materials selected for day-long comfort.",
              },
              {
                num: "02",
                icon: <Shield className="h-5 w-5" strokeWidth={1.5} />,
                title: "Durable Stitching",
                body: "Reinforced seams and dependable construction made to last.",
              },
              {
                num: "03",
                icon: <Ruler className="h-5 w-5" strokeWidth={1.5} />,
                title: "Perfect Fit",
                body: "Carefully graded sizing for a clean, confident school-ready fit.",
              },
            ].map((feat, i) => (
              <motion.div
                key={feat.num}
                variants={REVEAL}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                className="bg-background px-10 py-12 md:py-14 flex flex-col gap-5"
              >
                <div className="flex items-center justify-between text-muted-foreground/40">
                  {feat.icon}
                  <span className="text-[10px] tracking-[0.3em] uppercase">{feat.num}</span>
                </div>
                <div>
                  <h4 className="text-xs tracking-[0.24em] uppercase mb-3 font-normal">{feat.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feat.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4 · TRUST STRIP ─────────────────────────────── */}
      <section className="border-b border-border px-6 py-9">
        <motion.ul
          variants={REVEAL}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-10 gap-y-4"
        >
          {[
            "Premium Fabric",
            "Durable Stitching",
            "Perfect Fit Guarantee",
            "Trusted by Schools",
          ].map((label) => (
            <li key={label} className="flex items-center gap-2.5 text-xs tracking-[0.18em] uppercase text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-foreground/50 shrink-0" strokeWidth={1.5} />
              {label}
            </li>
          ))}
        </motion.ul>
      </section>

      {/* ── SECTION 3 · BRAND SIGNATURE ─────────────────────────── */}
      <section className="px-6 py-24 md:py-32">
        <motion.div
          variants={REVEAL}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          className="max-w-xl mx-auto text-center"
        >
          <p className="text-2xl md:text-3xl font-extralight tracking-[0.32em] uppercase mb-5">Illume</p>
          <p className="text-sm text-muted-foreground leading-relaxed tracking-wide">
            Premium School Uniforms crafted for comfort,<br className="hidden md:block" /> confidence and everyday excellence.
          </p>
        </motion.div>
      </section>

      <footer className="border-t border-border px-6 py-12 md:py-14">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="text-sm tracking-[0.28em] uppercase font-light mb-1">Illume</p>
            <p className="text-xs text-muted-foreground tracking-[0.16em] uppercase">School Uniforms</p>
          </div>
          <a href="mailto:hello@illume.co.in" className="text-xs tracking-[0.16em] uppercase text-muted-foreground hover:text-foreground transition-colors">
            hello@illume.co.in
          </a>
          <p className="text-xs text-muted-foreground tracking-[0.12em] uppercase">
            © {new Date().getFullYear()} Illume. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default StorePage;
