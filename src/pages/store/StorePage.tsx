import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Ruler, Shield, Sparkles, Star } from "lucide-react";
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

const TESTIMONIALS = [
  {
    quote:
      "So my child studies in GAFL school RR Nagar and I had purchased the uniforms when the uniform vendor had come to the school. However I wanted one more t-shirt and got in touch with the vendor again. He helped me to get the t-shirt within an hour of order, in a simple and easy way. Firstly I checked with the vendor for size availability and once he confirmed, he insisted me to book a porter so that I can get the product right away without waiting for it. It was very kind from the vendor side to share the porter idea to get the product quickly. Thank you sir.",
    name: "Mangasa Jayaram",
    label: "Parent",
  },
  {
    quote:
      "Excellent service. GAFL school uniform quality is really good. Staff and the owner is too cooperative and patient in listening to customers. Overall good experience.",
    name: "Ramya Karimanne",
    label: "Parent",
  },
  {
    quote:
      "I had ordered school uniform for my son from Lotus. Unfortunately the size was not fitting for him and I was trying hard to get it exchanged. At last spoke to Mr Prabhurraj over the phone and he got the uniform home delivered within less than 3 hours of time. I really appreciate the quality of service and timeliness. Uniform quality is also very good. Thank you Mr Prabhu for valuing customer's time.",
    name: "Sara Baptist",
    label: "Parent",
  },
  {
    quote:
      "Very cooperative and friendly staff. Though I couldn't go there, they kindly sent the uniforms by Porter to my address location. This saved lot of time for me. Also they update the availability of uniforms immediately when enquired. Excellent customer service. Thank you.",
    name: "Lakshmi Rao",
    label: "Parent",
  },
  {
    quote:
      "Many thanks to Illume staff for helping to receive my kids uniforms door delivered. All shopping was done over phone and they did a wonderful job in sending the uniforms delivered to my house address on time.",
    name: "Swarna Latha",
    label: "Parent",
  },
  {
    quote:
      "Very good fabric and equally good finishing. Cordial staff and one stop store for uniforms and accessories. I would highly recommend Lotus for your kids uniforms.",
    name: "Shubha Guruprasad",
    label: "Parent",
  },
  {
    quote:
      "Appearance, obedience, personality is all judged by the outfit of uniforms worn by kids. And this is absolutely proved by Lotus Uniforms Rajajinagar. Glad by the purchase of uniforms since 3 years. Excellent quality. Friendly service. Much more best services expected ahead. Thank you.",
    name: "Mrs Devika Purushotham",
    label: "Parent",
  },
] as const;

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
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [isTestimonialHovered, setIsTestimonialHovered] = useState(false);

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

  useEffect(() => {
    if (isTestimonialHovered) return;
    const timer = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isTestimonialHovered]);

  const showPreviousTestimonial = () => {
    setActiveTestimonial((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  const showNextTestimonial = () => {
    setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
  };

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

      {/* ── STATS BAR ─────────────────────────────────────────────── */}
      <section className="bg-surface-dark border-b border-white/10 px-6 py-10">
        <div className="max-w-4xl mx-auto grid grid-cols-3 divide-x divide-white/10">
          {[
            { value: "25+", label: "Years of Expertise" },
            { value: "100+", label: "Institutions Served" },
            { value: "96%", label: "Client Retention Rate" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              variants={REVEAL}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.5 }}
              className="flex flex-col items-center gap-1.5 py-2"
            >
              <span className="text-3xl md:text-4xl font-extralight tracking-tight text-surface-dark-foreground">{stat.value}</span>
              <span className="text-[9px] tracking-[0.36em] uppercase text-surface-dark-muted">{stat.label}</span>
            </motion.div>
          ))}
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

      {/* ── WHAT WE OFFER ────────────────────────────────────────── */}
      <section className="border-t border-border px-6 py-16 md:py-20">
        <div className="max-w-5xl mx-auto">
          <motion.p
            variants={REVEAL}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-center text-[9px] tracking-[0.46em] uppercase text-muted-foreground mb-12"
          >
            What We Offer
          </motion.p>
          <div className="grid grid-cols-3 gap-px bg-border">
            {[
              { num: "01", title: "Uniforms", body: "High-quality garments for schools, institutions, and corporates." },
              { num: "02", title: "Shoes", body: "Ergonomic school shoes designed for comfort and active lifestyles." },
              { num: "03", title: "Accessories", body: "A complete range of products that complement your uniform needs." },
            ].map((item, i) => (
              <motion.div
                key={item.num}
                variants={REVEAL}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                className="bg-background px-8 py-10 flex flex-col items-center gap-3 text-center"
              >
                <span className="text-[10px] tracking-[0.36em] uppercase text-muted-foreground/40">{item.num}</span>
                <h4 className="text-sm tracking-[0.22em] uppercase font-normal">{item.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
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

          <motion.div
            variants={REVEAL}
            custom={5}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="w-8 h-px bg-foreground/20 mx-auto mt-10 mb-8"
          />

          <motion.p
            variants={REVEAL}
            custom={6}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-xs tracking-[0.18em] uppercase text-muted-foreground/70 leading-[2]"
          >
            Our mission — to blend functionality, performance, and contemporary design,
            providing unmatched quality and value to every institution we serve.
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

      {/* ── INSPIRE THE BEST ─────────────────────────────────────── */}
      <section className="bg-surface-dark px-6 py-24 md:py-36 text-center overflow-hidden">
        <motion.p
          variants={REVEAL}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="text-[9px] tracking-[0.46em] uppercase text-surface-dark-muted mb-8"
        >
          Lotus Illume
        </motion.p>
        <motion.h2
          variants={REVEAL}
          custom={1}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="text-5xl md:text-7xl font-extralight tracking-[0.3em] uppercase text-surface-dark-foreground leading-none mb-10"
        >
          Inspire<br className="md:hidden" />{" "}The Best
        </motion.h2>
        <motion.div
          variants={REVEAL}
          custom={2}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="w-8 h-px bg-surface-dark-muted/40 mx-auto mb-8"
        />
        <motion.p
          variants={REVEAL}
          custom={3}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="text-xs tracking-[0.22em] uppercase text-surface-dark-muted max-w-sm mx-auto leading-[2]"
        >
          25 years · 100+ institutions · one unwavering commitment
        </motion.p>
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

      {/* ── TESTIMONIALS · OUR CUSTOMERS SAY ────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative overflow-hidden px-6 py-28 md:py-36"
        style={{ backgroundColor: "#F7F7F7" }}
        onMouseEnter={() => setIsTestimonialHovered(true)}
        onMouseLeave={() => setIsTestimonialHovered(false)}
      >
        <span className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 text-[180px] md:text-[260px] leading-none opacity-[0.08] text-foreground select-none">
          “ ”
        </span>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-extralight tracking-[0.16em] uppercase mb-20">
            Our Customers Say
          </h2>

          <div className="relative min-h-[380px] md:min-h-[300px] flex items-center justify-center px-12 md:px-20">
            <motion.button
              type="button"
              aria-label="Previous testimonial"
              onClick={showPreviousTestimonial}
              whileHover={{ scale: 1.08, backgroundColor: "#000000" }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 md:-left-6 top-1/2 -translate-y-1/2 h-11 w-11 bg-zinc-900 text-white flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
            </motion.button>

            <AnimatePresence mode="wait" initial={false}>
              <motion.article
                key={activeTestimonial}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-3xl mx-auto"
              >
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  className="text-base md:text-lg leading-relaxed text-foreground/90 max-w-[700px] mx-auto mb-10"
                >
                  {TESTIMONIALS[activeTestimonial].quote}
                </motion.p>

                <div className="flex items-center justify-center gap-1.5 mb-7">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <motion.span
                      key={index}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.28, delay: 0.12 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                      className="inline-flex"
                    >
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" strokeWidth={1.6} />
                    </motion.span>
                  ))}
                </div>

                <p className="text-base font-medium tracking-wide mb-1">{TESTIMONIALS[activeTestimonial].name}</p>
                <p className="text-sm text-muted-foreground tracking-[0.14em] uppercase">{TESTIMONIALS[activeTestimonial].label}</p>
              </motion.article>
            </AnimatePresence>

            <motion.button
              type="button"
              aria-label="Next testimonial"
              onClick={showNextTestimonial}
              whileHover={{ scale: 1.08, backgroundColor: "#000000" }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 md:-right-6 top-1/2 -translate-y-1/2 h-11 w-11 bg-zinc-900 text-white flex items-center justify-center"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
            </motion.button>
          </div>
        </div>

      </motion.section>

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
