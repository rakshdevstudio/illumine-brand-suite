import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";
import illumeLogo from "@/assets/illume-logo.png";
import { useStudentProfile } from "@/lib/student-profile";

const StorePage = () => {
  const profile = useStudentProfile((s) => s.profile);
  const openModal = useStudentProfile((s) => s.openModal);

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

  return (
    <div>
      {/* Hero — black editorial */}
      <section className="bg-surface-dark py-28 md:py-44 text-center px-6">
        <img
          src={illumeLogo}
          alt="Illume"
          className="h-24 md:h-36 w-auto mx-auto mb-8" style={{ filter: "brightness(0) invert(1)" }}
        />
        <p className="text-sm tracking-[0.3em] text-surface-dark-muted uppercase max-w-lg mx-auto font-light">
          Premium school uniforms crafted with care
        </p>
      </section>

      {/* School Selection — white */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <h2 className="text-xs tracking-[0.3em] text-muted-foreground uppercase mb-12 text-center">
          Select Your School
        </h2>
        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border h-48 animate-pulse bg-secondary" />
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {schools?.map((school) => (
              <Link
                key={school.id}
                to={`/store/school/${school.slug}`}
                className="group border border-border p-8 flex flex-col items-center justify-center h-48 transition-all duration-500 hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                <h3 className="text-sm tracking-[0.15em] font-light uppercase text-center mb-4">
                  {school.name}
                </h3>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300" strokeWidth={1} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default StorePage;
