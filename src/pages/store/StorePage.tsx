import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";
import illumeLogo from "@/assets/illume-logo.png";
import { useStudentProfile } from "@/lib/student-profile";
import ThreadsBackground from "@/components/store/ThreadsBackground";

const StorePage = () => {
  const profile = useStudentProfile((s) => s.profile);
  const openModal = useStudentProfile((s) => s.openModal);
  const cardRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [visibleCards, setVisibleCards] = useState<Record<string, boolean>>({});

  const [checkedFirst, setCheckedFirst] = useState(false);
  useEffect(() => {
    if (!checkedFirst) {
      setCheckedFirst(true);
      if (!profile) openModal();
    }
  }, [checkedFirst, profile, openModal]);

  const { data: schools, isLoading } = useQuery({
    queryKey: ["schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("name");
      if (error) throw error;
      return data;
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
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    schools.forEach((school) => {
      const node = cardRefs.current[school.id];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [schools]);

  return (
    <div className="bg-background">
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
        <h2 className="text-xs tracking-[0.35em] text-muted-foreground uppercase mb-14 text-center">
          Select Your School
        </h2>
        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-8 md:gap-10">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border h-56 animate-pulse bg-secondary" />
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 md:gap-10">
            {schools?.map((school) => (
              <Link
                key={school.id}
                ref={(node) => {
                  cardRefs.current[school.id] = node;
                }}
                data-school-id={school.id}
                to={`/store/school/${school.slug}`}
                className={`group border border-border p-12 md:p-14 flex flex-col items-center justify-center h-56 transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_16px_40px_rgba(0,0,0,0.08)] ${
                  visibleCards[school.id] ? "illume-reveal visible" : "illume-reveal"
                }`}
              >
                <p className="text-[10px] tracking-[0.28em] text-muted-foreground uppercase mb-3">Collection</p>
                <h3 className="text-sm tracking-[0.22em] font-light uppercase text-center mb-4">
                  {school.name}
                </h3>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300" strokeWidth={1} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-28 md:pb-36">
        <div className="border border-border p-10 md:p-14 mb-12">
          <p className="text-[10px] tracking-[0.32em] text-muted-foreground uppercase mb-5">Brand Story</p>
          <h3 className="text-2xl md:text-3xl font-extralight tracking-[0.14em] uppercase mb-6">Crafted With Care</h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
            Every Illume uniform is designed with premium fabrics, clean construction, and lasting comfort for everyday school life.
            We focus on quality that looks refined, feels soft, and performs through every term.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          <div className="border border-border p-8 md:p-10">
            <p className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-3">01</p>
            <h4 className="text-sm tracking-[0.2em] uppercase mb-2">Premium Fabric</h4>
            <p className="text-sm text-muted-foreground">Soft touch, breathable materials selected for day-long comfort.</p>
          </div>
          <div className="border border-border p-8 md:p-10">
            <p className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-3">02</p>
            <h4 className="text-sm tracking-[0.2em] uppercase mb-2">Durable Stitching</h4>
            <p className="text-sm text-muted-foreground">Reinforced seams and dependable construction made to last.</p>
          </div>
          <div className="border border-border p-8 md:p-10">
            <p className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-3">03</p>
            <h4 className="text-sm tracking-[0.2em] uppercase mb-2">Perfect Fit</h4>
            <p className="text-sm text-muted-foreground">Carefully graded sizing for a clean, confident school-ready fit.</p>
          </div>
        </div>
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
