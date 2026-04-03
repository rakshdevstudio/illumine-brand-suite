import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type MouseEvent, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AnimatePresence,
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  Variants,
} from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Ruler,
  Shield,
  Sparkles,
  Star,
  Shirt,
  Footprints,
  ShieldCheck,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import illumeLogo from "@/assets/logo.png";
import { useStudentProfile } from "@/lib/student-profile";
import ThreadsBackground from "@/components/store/ThreadsBackground";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Easing } from "framer-motion";

const REVEAL = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const STORY_LINES = [
  "Every Illume uniform is designed with premium fabrics, clean construction, and lasting comfort for everyday school life.",
  "We focus on quality that looks refined, feels soft, and performs through every term.",
];

const FEATURE_CARD_STAGGER = 0.1;

const FEATURE_CARDS = [
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
];

const OFFER_CARDS = [
  {
    num: "01",
    title: "Uniforms",
    body: "High-quality garments for schools, institutions, and corporates.",
    icon: Shirt,
  },
  {
    num: "02",
    title: "Shoes",
    body: "Ergonomic school shoes designed for comfort and active lifestyles.",
    icon: Footprints,
  },
  {
    num: "03",
    title: "Accessories",
    body: "A complete range of products that complement your uniform needs.",
    icon: Sparkles,
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.96 },
  visible: (index = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    boxShadow: "0 18px 40px rgba(0, 0, 0, 0.06)",
    transition: { duration: 0.8, delay: index * FEATURE_CARD_STAGGER, ease: "easeOut" as Easing },
  }),
  hover: {
    y: -6,
    scale: 1.02,
    boxShadow: "0 28px 60px rgba(0, 0, 0, 0.24)",
    transition: { duration: 0.25, ease: "easeOut" as Easing },
  },
};

const iconVariants = {
  hidden: { rotate: 0 },
  visible: { rotate: 0 },
  hover: { rotate: 10, transition: { duration: 0.25, ease: "easeOut" as Easing } },
};

const offerHeadingVariants: Variants = {
  hidden: { opacity: 0, y: 30, letterSpacing: "10px" },
  visible: {
    opacity: 1,
    y: 0,
    letterSpacing: "4px",
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const offerCardVariants: Variants = {
  hidden: { opacity: 0, y: 60, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.7,
      delay: i * 0.15,
      ease: "easeOut",
    },
  }),
  hover: {
    y: -8,
    scale: 1.02,
    boxShadow: "0px 18px 40px rgba(0,0,0,0.08)",
    transition: { duration: 0.25, ease: "easeOut" },
  },
};

const offerIconVariants: Variants = {
  hover: {
    rotate: 8,
    scale: 1.08,
    transition: { duration: 0.25, ease: "easeOut" },
  },
};

const offerDividerVariants: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: "100%",
    opacity: 1,
    transition: { duration: 0.7, ease: "easeOut", delay: 0.5 },
  },
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
const UNIFORM_SHOWCASE_IMAGE = "/uniforms_image.png";

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

const getQuotePreview = (text: string, max = 170) => {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
};

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
  const [testimonialPauseUntil, setTestimonialPauseUntil] = useState(0);
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const offerSectionRef = useRef<HTMLElement | null>(null);
  const showcaseSectionRef = useRef<HTMLElement | null>(null);
  const testimonialSectionRef = useRef<HTMLElement | null>(null);
  const missionStatementRef = useRef<HTMLParagraphElement | null>(null);

  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroSectionRef,
    offset: ["start start", "end start"],
  });
  const heroLogoOpacity = useTransform(heroScrollProgress, [0, 1], [1, 0.9]);
  const heroLogoScale = useTransform(heroScrollProgress, [0, 1], [1, 0.92]);

  const { scrollYProgress: scrollYProgress } = useScroll({
    target: offerSectionRef,
    offset: ["start end", "end start"],
  });

  const { scrollYProgress: testimonialScrollProgress } = useScroll({
    target: testimonialSectionRef,
    offset: ["start end", "end start"],
  });
  const quoteParallaxY = useTransform(testimonialScrollProgress, [0, 1], [-28, 28]);
  const { scrollYProgress: showcaseScrollProgress } = useScroll({
    target: showcaseSectionRef,
    offset: ["start end", "end start"],
  });
  const showcaseParallaxY = useTransform(showcaseScrollProgress, [0, 1], [-80, 80]);

  const { scrollYProgress: missionScrollProgress } = useScroll({
    target: missionStatementRef,
    offset: ["start end", "end start"],
  });
  const missionParallaxY = useTransform(missionScrollProgress, [0, 1], [0, -18]);

  const rotateXRaw = useMotionValue(0);
  const rotateYRaw = useMotionValue(0);
  const scaleRaw = useMotionValue(1);
  const rotateX = useSpring(rotateXRaw, { stiffness: 90, damping: 20, mass: 0.85 });
  const rotateY = useSpring(rotateYRaw, { stiffness: 90, damping: 20, mass: 0.85 });
  const cardScale = useSpring(scaleRaw, { stiffness: 110, damping: 22, mass: 0.9 });

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
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
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
    const waitMs = testimonialPauseUntil - Date.now();
    if (waitMs > 0) {
      const resumeTimer = setTimeout(() => setTestimonialPauseUntil(0), waitMs);
      return () => clearTimeout(resumeTimer);
    }

    const timer = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [isTestimonialHovered, testimonialPauseUntil]);

  const pauseTestimonialRotation = () => {
    setTestimonialPauseUntil(Date.now() + 7000);
  };

  const showPreviousTestimonial = () => {
    pauseTestimonialRotation();
    setActiveTestimonial((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  const showNextTestimonial = () => {
    pauseTestimonialRotation();
    setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
  };

  const handleTestimonialCardMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    rotateYRaw.set((relativeX - 0.5) * 12);
    rotateXRaw.set((0.5 - relativeY) * 8);
    scaleRaw.set(1.02);
  };

  const handleTestimonialCardLeave = () => {
    rotateXRaw.set(0);
    rotateYRaw.set(0);
    scaleRaw.set(1);
  };

  const previousTestimonialIndex = (activeTestimonial - 1 + TESTIMONIALS.length) % TESTIMONIALS.length;
  const nextTestimonialIndex = (activeTestimonial + 1) % TESTIMONIALS.length;

  return (
    <div className="bg-background text-foreground">
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

      <section ref={heroSectionRef} className="relative overflow-hidden bg-surface-dark text-center px-6 py-10 md:py-16 lg:py-28">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute inset-0"
        >
          <ThreadsBackground amplitude={1} distance={0} enableMouseInteraction />
        </motion.div>
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/22 via-black/10 to-black/34 pointer-events-none" />

        <motion.div className="relative z-[2] max-w-3xl mx-auto flex flex-col items-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
            className="relative mb-8 pointer-events-auto"
          >
            <motion.div
              style={{ opacity: heroLogoOpacity, scale: heroLogoScale }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            >
              <img
                src={illumeLogo}
                alt="Illume"
                className="w-[100px] md:w-[130px] lg:w-[170px] h-auto mx-auto"
              />
            </motion.div>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.7, ease: "easeOut" }}
            className="text-[11px] md:text-xs tracking-[0.5em] text-surface-dark-muted uppercase mb-4 font-light pointer-events-auto"
          >
            Illume
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1, ease: "easeOut" }}
            className="text-4xl md:text-6xl font-extralight tracking-[0.28em] text-surface-dark-foreground uppercase leading-[1.1] mb-5 pointer-events-auto"
          >
            Be The Change
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.12, ease: "easeOut" }}
            className="text-[11px] md:text-xs tracking-[0.38em] text-surface-dark-muted uppercase max-w-xl mx-auto font-light leading-relaxed pointer-events-auto"
          >
            Premium School Uniforms Crafted With Care
          </motion.p>
        </motion.div>

      </section>

      {/* ── STATS BAR ─────────────────────────────────────────────── */}
      <section className="bg-surface-dark border-b border-white/10 px-6 py-8 md:py-10">
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

      <section className="max-w-6xl mx-auto px-6 py-10 md:py-16 lg:py-20">
        <div className="text-center mb-8 md:mb-10">
          <p className="text-[10px] tracking-[0.45em] text-muted-foreground uppercase mb-3">Collections</p>
          <h2 className="text-2xl md:text-3xl font-extralight tracking-[0.18em] uppercase">
            Select Your School
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-10">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border h-72 animate-pulse bg-secondary/60" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-10">
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
      <section ref={offerSectionRef} className="border-t border-border px-6 py-10 md:py-16 lg:py-20 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <motion.h3
            variants={offerHeadingVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            className="text-center text-xs md:text-sm tracking-[0.46em] uppercase text-muted-foreground mb-12"
          >
            What We Offer
          </motion.h3>
          <div className="grid grid-cols-1 md:grid-cols-3">
            {OFFER_CARDS.map((item, i) => {
              const isNotLast = i < OFFER_CARDS.length - 1;
              const parallaxY = useTransform(
                scrollYProgress,
                [0, 1],
                [0, (i === 1 ? 0.03 : 0.05) * -200]
              );

              return (
                <motion.div
                  key={item.num}
                  variants={offerCardVariants}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  whileHover="hover"
                  viewport={{ once: true, amount: 0.4 }}
                  className="relative group"
                >
                  <motion.div
                    style={{ y: parallaxY }}
                    className="bg-background px-8 py-10 h-full flex flex-col items-center gap-3 text-center"
                  >
                    <motion.div
                      variants={{
                        hover: {
                          background:
                            "linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.0), rgba(0,0,0,0.02), rgba(0,0,0,0.05))",
                        },
                      }}
                      className="absolute inset-0"
                    />
                    <motion.div variants={offerIconVariants}>
                      <item.icon
                        className="h-6 w-6 mb-2 text-muted-foreground/60 group-hover:text-foreground transition-colors"
                        strokeWidth={1.5}
                      />
                    </motion.div>
                    <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40">
                      {item.num}
                    </span>
                    <h4 className="text-sm tracking-[0.22em] uppercase font-normal">
                      {item.title}
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      {item.body}
                    </p>
                  </motion.div>

                  {isNotLast && (
                    <motion.div
                      variants={offerDividerVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, amount: 0.5 }}
                      className="absolute top-0 right-0 w-px bg-border hidden md:block"
                      style={{ originY: 0 }}
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── UNIFORM SHOWCASE ─────────────────────────────────────── */}
      <section ref={showcaseSectionRef} className="relative w-full overflow-hidden">
        <div className="relative h-[520px]">
          <motion.div
            style={{ y: showcaseParallaxY }}
            className="absolute inset-0"
          >
            <div
              className="absolute inset-0 bg-cover bg-[center_24%] md:bg-[center_18%]"
              style={{ backgroundImage: `url(${UNIFORM_SHOWCASE_IMAGE})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 to-black/55" />
          </motion.div>

          <div className="relative z-[2] h-full max-w-6xl mx-auto px-6 flex flex-col items-center justify-center text-center">
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="text-3xl md:text-5xl font-extralight tracking-[0.16em] uppercase text-white mb-6"
            >
              Premium School Uniforms
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-sm md:text-base text-white/90 tracking-wide max-w-2xl mb-8"
            >
              Crafted for confidence, comfort and everyday school life.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                to="/store"
                className="inline-flex items-center justify-center rounded-md bg-black px-7 py-3 text-[11px] tracking-[0.18em] uppercase text-white"
              >
                Explore Uniforms
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── SECTION 1 · BRAND STORY ─────────────────────────────── */}
      <section className="relative overflow-hidden px-6 py-14 md:py-20 lg:py-24">
        <div className="crafted-story-background absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-3xl space-y-6 text-center">
          <motion.p
            variants={REVEAL}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-xs md:text-sm tracking-[0.42em] uppercase text-foreground/60"
          >
            Brand Story
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, letterSpacing: 12, y: 40 }}
            whileInView={{ opacity: 1, letterSpacing: 4, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="text-4xl md:text-5xl font-extralight tracking-[0.22em] uppercase mb-4 leading-snug text-foreground"
          >
            Crafted With Care
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mx-auto h-[1px] w-[80px] bg-foreground/40"
            style={{ transformOrigin: "center" }}
          />

          <div className="space-y-5 text-base md:text-lg text-foreground leading-[1.9]">
            {STORY_LINES.map((line, index) => (
              <motion.p
                key={line}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.75, delay: index * 0.12, ease: "easeOut" }}
              >
                {line}
              </motion.p>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
            className="mx-auto mt-10 h-[2px] w-[80px] bg-foreground/40"
            style={{ transformOrigin: "center" }}
          />

          <motion.p
            ref={missionStatementRef}
            initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            style={{ y: missionParallaxY }}
            className="text-sm md:text-base tracking-[0.18em] uppercase text-foreground/70 leading-[2]"
          >
            Our mission — to blend functionality, performance, and contemporary design,
            providing unmatched quality and value to every institution we serve.
          </motion.p>
        </div>
      </section>

      {/* ── SECTION 2 · QUALITY FEATURES ────────────────────────── */}
      <section className="bg-secondary/20 border-y border-border px-6 py-10 md:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto">
          <motion.p
            variants={REVEAL}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="text-center text-sm md:text-base tracking-[0.5em] uppercase text-foreground/70 mb-6 md:mb-8"
          >
            Our Promise
          </motion.p>

          <div className="grid md:grid-cols-3 gap-px bg-border">
            {FEATURE_CARDS.map((feat, index) => (
              <motion.div
                key={feat.num}
                variants={cardVariants}
                custom={index}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                whileHover="hover"
                className="group bg-background px-10 py-12 md:py-14 flex flex-col gap-5"
              >
                <motion.div variants={iconVariants} className="flex items-center justify-between text-muted-foreground/40">
                  {feat.icon}
                  <span className="text-[10px] tracking-[0.3em] uppercase">{feat.num}</span>
                </motion.div>
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
      <section className="bg-surface-dark px-6 py-12 md:py-16 lg:py-24 text-center overflow-hidden">
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
      <section className="border-b border-border px-6 py-6 md:py-8">
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
        ref={testimonialSectionRef}
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative overflow-hidden px-6 py-12 md:py-16 lg:py-[90px]"
        style={{ backgroundColor: "#F7F7F7" }}
        onMouseEnter={() => setIsTestimonialHovered(true)}
        onMouseLeave={() => setIsTestimonialHovered(false)}
      >
        <motion.span
          style={{ y: quoteParallaxY }}
          className="pointer-events-none absolute z-0 left-1/2 top-10 -translate-x-1/2 text-[108px] sm:text-[120px] md:text-[180px] lg:text-[210px] leading-none opacity-[0.06] text-black/40 select-none"
        >
          “ ”
        </motion.span>

        <div className="relative z-[2] max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-extralight tracking-[0.16em] uppercase mb-8 md:mb-10">
            Our Customers Say
          </h2>

          <div
            className="relative min-h-[360px] md:min-h-[390px] flex items-center justify-center px-12 md:px-24"
            style={{ perspective: 1200 }}
          >
            <div className="pointer-events-none hidden md:block absolute inset-0 [transform-style:preserve-3d]" style={{ transform: "translateZ(-80px)" }}>
              <motion.div
                key={`prev-${activeTestimonial}`}
                initial={{ x: -180, scale: 0.84, opacity: 0 }}
                animate={{ x: -220, scale: 0.88, opacity: 0.45 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="absolute left-1/2 top-1/2 w-full max-w-[760px] -translate-y-1/2 -translate-x-1/2 rounded-2xl bg-white/95 px-10 py-9 text-left shadow-[0_24px_52px_rgba(0,0,0,0.06)]"
              >
                <p className="text-sm text-foreground/70 leading-relaxed">{getQuotePreview(TESTIMONIALS[previousTestimonialIndex].quote)}</p>
              </motion.div>

              <motion.div
                key={`next-${activeTestimonial}`}
                initial={{ x: 180, scale: 0.84, opacity: 0 }}
                animate={{ x: 220, scale: 0.88, opacity: 0.45 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="absolute left-1/2 top-1/2 w-full max-w-[760px] -translate-y-1/2 -translate-x-1/2 rounded-2xl bg-white/95 px-10 py-9 text-left shadow-[0_24px_52px_rgba(0,0,0,0.06)]"
              >
                <p className="text-sm text-foreground/70 leading-relaxed">{getQuotePreview(TESTIMONIALS[nextTestimonialIndex].quote)}</p>
              </motion.div>
            </div>

            <motion.button
              type="button"
              aria-label="Previous testimonial"
              onClick={showPreviousTestimonial}
              whileHover={{ scale: 1.1, backgroundColor: "#000000", boxShadow: "0 16px 30px rgba(0,0,0,0.26)" }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 md:-left-6 top-1/2 z-20 -translate-y-1/2 h-11 w-11 rounded-md bg-zinc-900 text-white flex items-center justify-center shadow-[0_8px_22px_rgba(0,0,0,0.18)]"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
            </motion.button>

            <AnimatePresence mode="wait" initial={false}>
              <motion.article
                key={activeTestimonial}
                initial={{ opacity: 0.6, x: 200, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0.5, x: -200, scale: 0.9 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                onMouseMove={handleTestimonialCardMove}
                onMouseLeave={handleTestimonialCardLeave}
                style={{ rotateX, rotateY, scale: cardScale, willChange: "transform, opacity" }}
                className="relative z-10 w-full max-w-[760px] mx-auto rounded-2xl bg-white p-8 md:p-[60px] shadow-[0_40px_80px_rgba(0,0,0,0.08)]"
              >
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  className="text-base md:text-lg leading-relaxed text-foreground/90 max-w-[700px] mx-auto mb-10"
                >
                  {TESTIMONIALS[activeTestimonial].quote}
                </motion.p>

                <div className="flex items-center justify-center gap-1.5 mb-7">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <motion.span
                      key={index}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.28, delay: 0.15 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
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
              whileHover={{ scale: 1.1, backgroundColor: "#000000", boxShadow: "0 16px 30px rgba(0,0,0,0.26)" }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 md:-right-6 top-1/2 z-20 -translate-y-1/2 h-11 w-11 rounded-md bg-zinc-900 text-white flex items-center justify-center shadow-[0_8px_22px_rgba(0,0,0,0.18)]"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
            </motion.button>
          </div>
        </div>

      </motion.section>

      {/* ── SECTION 3 · BRAND SIGNATURE ─────────────────────────── */}
      <section className="px-6 py-10 md:py-16 lg:py-20">
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

export default memo(StorePage);
