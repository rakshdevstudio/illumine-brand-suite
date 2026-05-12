import { Link } from "react-router-dom";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ArrowRightLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  Layers3,
  MapPinned,
  Package2,
  Palette,
  Ruler,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const stats = [
  { value: "100+", label: "schools served", icon: Building2 },
  { value: "7 years", label: "refining the system", icon: Clock3 },
  { value: "4-step", label: "ordering clarity", icon: Layers3 },
  { value: "100%", label: "inventory visibility", icon: BadgeCheck },
];

const problems = [
  {
    title: "Fragmented ordering",
    body: "Families, schools, and vendors often work from different lists, different versions, and different expectations.",
  },
  {
    title: "Late surprises",
    body: "Missing sizes, unclear stock, and end-of-term rushes turn a simple uniform purchase into a stressful process.",
  },
  {
    title: "Inconsistent quality",
    body: "When the system is weak, the product experience becomes inconsistent too. That weakens trust instantly.",
  },
];

const solutionPoints = [
  {
    title: "A single operating system",
    body: "Illume connects school, class, gender, product, inventory, order, and invoice into one premium workflow.",
    icon: Layers3,
  },
  {
    title: "Precision at every step",
    body: "Every product is tied to the right context, reducing mistakes and improving fulfillment speed.",
    icon: ShieldCheck,
  },
  {
    title: "A better customer experience",
    body: "Parents get confidence. Schools get structure. Teams get visibility. The entire journey feels calmer.",
    icon: UsersRound,
  },
];

const architecture = [
  {
    title: "School",
    body: "Each purchase begins with the institution identity and its rules.",
    icon: Building2,
  },
  {
    title: "Class",
    body: "Product availability is aligned to the correct grade or class band.",
    icon: GraduationCap,
  },
  {
    title: "Gender",
    body: "The right cut, fit, and catalog path are shown without clutter.",
    icon: Sparkles,
  },
  {
    title: "Product",
    body: "Only the relevant items surface, reducing friction and noise.",
    icon: Package2,
  },
  {
    title: "Inventory",
    body: "Live stock keeps operations honest and helps the team respond fast.",
    icon: BadgeCheck,
  },
  {
    title: "Orders",
    body: "The fulfillment layer stays organized from capture to dispatch.",
    icon: ArrowRightLeft,
  },
  {
    title: "Invoice",
    body: "Accounting-ready invoices close the loop with GST clarity and traceability.",
    icon: FileText,
  },
];

const craftsmanship = [
  {
    title: "Fabric confidence",
    body: "Premium hand-feel, breathable construction, and a finish that looks refined in real life.",
    icon: Sparkles,
  },
  {
    title: "Stitch discipline",
    body: "Seams, reinforcement, and silhouette integrity are treated as non-negotiable.",
    icon: ShieldCheck,
  },
  {
    title: "Built for school life",
    body: "Durability matters because uniforms are worn constantly, washed often, and judged daily.",
    icon: Ruler,
  },
];

const journey = [
  {
    step: "01",
    title: "School discovery",
    body: "Parents or administrators enter through the right school context, so the catalog starts relevant from the first screen.",
  },
  {
    step: "02",
    title: "Guided selection",
    body: "Class and gender logic removes guesswork and shows only the products that actually belong.",
  },
  {
    step: "03",
    title: "Assured fulfillment",
    body: "Inventory visibility and clear order handling give families confidence that the order will land properly.",
  },
  {
    step: "04",
    title: "Clean closure",
    body: "GST-aware invoices complete the journey with professional documentation for parents and finance teams.",
  },
];

const SectionTitle = ({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) => (
  <div className="max-w-3xl space-y-4">
    <p className="text-[10px] uppercase tracking-[0.35em] text-amber-700/80">{eyebrow}</p>
    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light tracking-[-0.04em] text-neutral-950 leading-[1.02]">
      {title}
    </h2>
    <p className="text-base sm:text-lg text-neutral-600 leading-8 max-w-2xl">{body}</p>
  </div>
);

const AboutPage = () => {
  const prefersReducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement | null>(null);
  const architectureRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : 120]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, prefersReducedMotion ? 1 : 1.08]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.78]);

  return (
    <main className="bg-[#f4f1ea] text-neutral-950 overflow-hidden">
      <section ref={heroRef} className="relative min-h-screen flex items-stretch bg-neutral-950 text-white">
        <div className="absolute inset-0 overflow-hidden">
          <motion.img
            src="/image.webp"
            alt="Illume school uniforms"
            className="absolute right-0 top-0 h-full w-full object-cover object-center opacity-55"
            style={{ y: heroY, scale: heroScale, opacity: heroOpacity }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,237,222,0.16),_transparent_28%),linear-gradient(90deg,rgba(8,8,8,0.96)_0%,rgba(8,8,8,0.82)_38%,rgba(8,8,8,0.42)_68%,rgba(8,8,8,0.68)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,transparent_18%,transparent_82%,rgba(255,255,255,0.02)_100%)]" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-end px-6 py-20 sm:px-8 lg:px-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="max-w-3xl space-y-6 pb-14 lg:pb-24"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.34em] text-white/70 backdrop-blur">
              Luxury school uniform systems
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-8xl font-light tracking-[-0.08em] leading-[0.92] max-w-4xl">
              The school uniform experience, reimagined as a premium system.
            </h1>
            <p className="max-w-2xl text-base sm:text-lg leading-8 text-white/74">
              Illume brings modern precision to a category that has long been fragmented. We build a calm, elegant,
              scalable uniform journey for schools, parents, and operations teams.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild className="rounded-full bg-white px-6 text-[11px] uppercase tracking-[0.24em] text-black hover:bg-white/90">
                <Link to="/contact">
                  Partner with Illume
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-white/20 bg-transparent px-6 text-[11px] uppercase tracking-[0.24em] text-white hover:bg-white/10 hover:text-white">
                <Link to="/contact?type=Vendor Registration">Vendor Registration</Link>
              </Button>
            </div>
          </motion.div>

          <div className="grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 0.55, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md"
                >
                  <div className="flex items-center gap-3 text-white/72">
                    <span className="rounded-full border border-white/10 bg-white/5 p-2">
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <p className="text-[10px] uppercase tracking-[0.28em]">{stat.label}</p>
                  </div>
                  <p className="mt-5 text-3xl font-light tracking-[-0.05em]">{stat.value}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── WHO WE ARE SECTION ──────────────────────────────────────── */}
      <section className="bg-[#0a0a0a] py-24 lg:py-32 text-white overflow-hidden relative">
        {/* subtle background glow/noise */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(236,184,104,0.06),transparent_40%)]" />
        
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-10 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-8 items-center">
            {/* LEFT SIDE: Typography + Story */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
              }}
              className="max-w-2xl"
            >
              <motion.p variants={fadeUp} className="text-[10px] uppercase tracking-[0.4em] text-amber-500/80 mb-6">
                WELCOME TO LOTUS ILLUME
              </motion.p>
              
              <motion.h2 variants={fadeUp} className="text-4xl sm:text-5xl lg:text-[56px] font-light tracking-[-0.04em] leading-[1.05] mb-8">
                Who We Are
              </motion.h2>

              <div className="space-y-6 text-white/70 text-base sm:text-lg leading-relaxed font-light">
                <motion.p variants={fadeUp}>
                  Lotus Illume is a premium platform dedicated to delivering high-quality uniforms, shoes, and accessories. As a trusted partner to schools, institutions, and corporate organizations for over a decade, we provide value-driven solutions tailored to each client’s needs. Backed by expertise spanning 25 years, we have established ourselves as leaders in the uniform industry, proudly serving more than 100 institutions with a client retention rate exceeding 96%.
                </motion.p>
                <motion.p variants={fadeUp}>
                  At Lotus Illume, our journey has always been about more than creating uniforms — it is about shaping identity, pride, and confidence. For over 25 years, we have worked relentlessly to ensure every product we design reflects the values and standards of the institutions we serve.
                </motion.p>
                <motion.p variants={fadeUp}>
                  Our commitment to quality, reliability, and customer satisfaction remains the foundation of our success. Together with a passionate team and loyal clients, we continue to build a legacy of trust, excellence, and innovation.
                </motion.p>
              </div>

              <motion.div variants={fadeUp} className="pt-10 border-t border-white/10 mt-10">
                <p className="text-lg font-medium text-white tracking-tight">Prabhuraj</p>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-500/80 mt-1">CEO & Founder</p>
              </motion.div>
            </motion.div>

            {/* RIGHT SIDE: Visual Collage */}
            <div className="relative h-[600px] w-full hidden lg:block">
              {/* Main image - Showroom */}
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-0 w-[85%] h-[75%] rounded-[32px] overflow-hidden border border-white/10 shadow-2xl"
              >
                <img src="/luxury_showroom.png" alt="Luxury Showroom" className="w-full h-full object-cover object-center" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </motion.div>

              {/* Floating image 1 - Tailoring details */}
              <motion.div
                initial={{ opacity: 0, x: -30, y: 20 }}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="absolute left-0 bottom-10 w-[45%] h-[40%] rounded-[24px] overflow-hidden border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.4)]"
              >
                <img src="/premium_tailoring.png" alt="Tailoring Details" className="w-full h-full object-cover object-center" />
              </motion.div>

              {/* Floating glass card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="absolute -right-6 bottom-32 rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,0,0,0.3)]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
                    <Star className="h-5 w-5 fill-current" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/50">Premium Grade</p>
                    <p className="text-sm font-medium text-white mt-0.5">Apparel Craftsmanship</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* MOBILE Visual Collage */}
            <div className="lg:hidden space-y-6 mt-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="rounded-[28px] overflow-hidden border border-white/10 h-[300px]"
              >
                <img src="/luxury_showroom.png" alt="Luxury Showroom" className="w-full h-full object-cover object-center" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="rounded-[28px] overflow-hidden border border-white/10 h-[200px]"
              >
                <img src="/premium_tailoring.png" alt="Tailoring Details" className="w-full h-full object-cover object-center" />
              </motion.div>
            </div>
          </div>

          {/* VALUES CARDS */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-24 lg:mt-32">
            {[
              { title: "Premium Quality", body: "Fabrics and fits engineered for excellence and durability.", icon: Sparkles },
              { title: "Operational Precision", body: "Technology-driven workflows that eliminate human error.", icon: Layers3 },
              { title: "Trusted by Institutions", body: "Partner to the most distinguished schools globally.", icon: Building2 },
              { title: "Innovation Led", body: "Continuously refining the standard for the modern campus.", icon: Star },
            ].map((card, idx) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.6, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-[#161616] p-8 transition-all hover:-translate-y-1 hover:bg-[#1a1a1a] hover:border-white/20"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                     <Icon className="w-24 h-24" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white group-hover:bg-amber-500/20 group-hover:text-amber-400 group-hover:border-amber-500/30 transition-colors">
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-6 text-lg font-medium text-white tracking-[-0.02em]">{card.title}</h3>
                    <p className="mt-3 text-sm text-white/50 leading-relaxed">{card.body}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
        <SectionTitle
          eyebrow="The challenge"
          title="Uniform buying has too often felt operational, not human."
          body="Families should not have to navigate unclear stock, mismatched forms, or uncertainty around what belongs to whom. The experience should feel effortless, not assembled from fragments."
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {problems.map((item, index) => (
            <motion.div
              key={item.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.35 }}
              custom={index * 0.08}
              className="group rounded-[28px] border border-neutral-200 bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.03)] transition-transform duration-300 hover:-translate-y-1"
            >
              <p className="text-[10px] uppercase tracking-[0.32em] text-neutral-400">0{index + 1}</p>
              <h3 className="mt-4 text-2xl font-light tracking-[-0.04em] text-neutral-950">{item.title}</h3>
              <p className="mt-4 text-sm leading-7 text-neutral-600">{item.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="bg-white py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            <SectionTitle
              eyebrow="Illume’s answer"
              title="A refined system that turns complexity into clarity."
              body="Illume is built to make the full journey feel premium and controlled. From catalog presentation to invoice generation, each step is designed to reduce friction and increase confidence."
            />
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              {solutionPoints.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-5">
                    <Icon className="h-5 w-5 text-amber-700" strokeWidth={1.75} />
                    <h3 className="mt-4 text-lg font-medium tracking-[-0.03em] text-neutral-950">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 28, scale: 0.98 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-[36px] border border-neutral-200 bg-neutral-950 p-3 shadow-[0_30px_90px_rgba(0,0,0,0.12)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(236,184,104,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.05),transparent_32%)]" />
            <div className="relative rounded-[30px] border border-white/10 bg-[#111111] p-7 text-white">
              <p className="text-[10px] uppercase tracking-[0.34em] text-white/55">Operational philosophy</p>
              <div className="mt-8 space-y-5">
                {[
                  ["System-led structure", "A uniform only feels premium when the workflow behind it is precise."],
                  ["Inventory intelligence", "Stock clarity helps teams act early rather than react late."],
                  ["Documentation that closes the loop", "Invoices, totals, and GST data stay organized for accounting teams."],
                ].map(([title, body]) => (
                  <div key={title} className="flex gap-4 border-b border-white/8 pb-5 last:border-0">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-amber-300" strokeWidth={1.75} />
                    <div>
                      <h3 className="text-lg font-medium tracking-[-0.03em]">{title}</h3>
                      <p className="mt-1 text-sm leading-7 text-white/68">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-white/72">
                Illume’s goal is not just to sell uniforms. It is to deliver a system that feels calm, disciplined, and
                trusted at scale.
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section ref={architectureRef} className="bg-neutral-950 py-24 text-white">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-10">
          <SectionTitle
            eyebrow="The architecture"
            title="School → Class → Gender → Product → Inventory → Orders → Invoice"
            body="This is the core advantage. Illume does not treat the catalog as a flat list. It behaves like a thoughtful system, so the right item appears in the right context every time.
          "
          />

          <div className="mt-14 grid gap-4 lg:grid-cols-7">
            {architecture.map((item, index) => {
              const Icon = item.icon;
              const last = index === architecture.length - 1;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.45 }}
                  transition={{ duration: 0.55, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="relative rounded-[26px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-white/45">0{index + 1}</span>
                    <Icon className="h-4 w-4 text-amber-300" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-4 text-lg font-medium tracking-[-0.03em]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-white/66">{item.body}</p>
                  {!last && (
                    <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/35 lg:justify-end">
                      <span>Next</span>
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:grid lg:grid-cols-[0.92fr_1.08fr] lg:gap-12 lg:px-10">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[36px] border border-neutral-200 bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,0.04)]"
        >
          <img src="/uniforms_image.png" alt="Premium Illume uniform detail" className="h-[520px] w-full rounded-[28px] object-cover object-center" />
          <div className="absolute inset-x-8 bottom-8 rounded-[24px] border border-white/15 bg-black/45 p-5 backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-[0.32em] text-white/60">Craftsmanship detail</p>
            <p className="mt-3 text-2xl font-light tracking-[-0.04em] text-white">
              Built to look sharp, feel comfortable, and last through repeated wear.
            </p>
          </div>
        </motion.div>

        <div className="mt-10 lg:mt-0 space-y-6">
          <SectionTitle
            eyebrow="Craftsmanship & quality"
            title="Luxury is not a visual style. It is a standard."
            body="Illume’s quality story starts with fabric selection and continues through stitching discipline, fit consistency, and durability under real school conditions."
          />
          <div className="grid gap-4 pt-4">
            {craftsmanship.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-full border border-amber-200 bg-amber-50 p-3 text-amber-700">
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium tracking-[-0.03em]">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-neutral-600">{item.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <SectionTitle
              eyebrow="Customer journey"
              title="Every step is designed to feel guided, not guessed."
              body="Illume gives parents and schools a clear sequence of actions. That clarity lowers stress and makes the brand feel composed from start to finish."
            />
          </div>
          <div className="space-y-4">
            {journey.map((item) => (
              <div key={item.step} className="group rounded-[26px] border border-neutral-200 bg-white p-5 transition-transform duration-300 hover:-translate-y-1">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.32em] text-neutral-400">{item.step}</p>
                    <h3 className="mt-2 text-xl font-light tracking-[-0.04em] text-neutral-950">{item.title}</h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.24em] text-amber-700">
                    Step guided
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="mt-4 max-w-xl text-sm leading-7 text-neutral-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 py-24 text-white">
        <div className="mx-auto max-w-6xl px-6 text-center sm:px-8 lg:px-10">
          <p className="text-[10px] uppercase tracking-[0.38em] text-white/40">Brand philosophy</p>
          <h2 className="mt-8 text-4xl sm:text-6xl lg:text-7xl font-light tracking-[-0.08em] leading-[0.96]">
            Premium service is when the system disappears and confidence remains.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-base sm:text-lg leading-8 text-white/65">
            Illume exists to make school uniform procurement feel trustworthy, elegant, and scalable. The visible brand
            matters, but the invisible discipline behind it matters more.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
        <div className="grid gap-8 rounded-[36px] border border-neutral-200 bg-white p-8 shadow-[0_24px_70px_rgba(0,0,0,0.04)] lg:grid-cols-[1fr_0.85fr] lg:p-12">
          <div className="space-y-5">
            <p className="text-[10px] uppercase tracking-[0.35em] text-amber-700/80">Behind the brand</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light tracking-[-0.05em] leading-[1.02]">
              Built by people who understand that trust is earned in the details.
            </h2>
            <p className="max-w-2xl text-base sm:text-lg leading-8 text-neutral-600">
              Illume is shaped around a simple belief: when uniform buying feels orderly, parents feel supported, schools
              feel respected, and operations become easier to scale. That is the mission.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Mission", "Make premium uniforms easy to order, easy to manage, and easy to trust."],
              ["Standard", "Treat quality, documentation, and service as one connected experience."],
              ["Promise", "Keep every interaction calm, accurate, and ready for scale."],
              ["Future", "Build a system that grows with schools, campuses, and new markets."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">{title}</p>
                <p className="mt-3 text-sm leading-7 text-neutral-700">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0e0e0d] py-24 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-8 px-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="max-w-3xl space-y-4">
            <p className="text-[10px] uppercase tracking-[0.34em] text-white/45">Final call to action</p>
            <h2 className="text-4xl sm:text-6xl font-light tracking-[-0.08em] leading-[0.95]">
              Partner with Illume.
            </h2>
            <p className="max-w-2xl text-base sm:text-lg leading-8 text-white/66">
              If you want a uniform partner that combines taste, discipline, and system thinking, Illume is ready to
              build with you.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-white px-6 text-[11px] uppercase tracking-[0.24em] text-black hover:bg-white/90">
              <Link to="/contact">Contact Illume</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-white/15 bg-transparent px-6 text-[11px] uppercase tracking-[0.24em] text-white hover:bg-white/10 hover:text-white">
              <Link to="/contact?type=Vendor Registration">Vendor Registration</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default AboutPage;
