import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requireSchoolId, useSchoolContext } from "@/lib/school-context";

const ClassGenderPage = () => {
  const { slug, classSlug } = useParams<{ slug: string; classSlug: string }>();
  const ctxSchool = useSchoolContext((s) => s.school);
  const schoolId = ctxSchool?.id ?? null;

  const { data: school } = useQuery({
    queryKey: ["school", schoolId],
    queryFn: async () => {
      const id = requireSchoolId();
      const { data, error } = await supabase.from("schools").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: cls } = useQuery({
    queryKey: ["class", schoolId, classSlug],
    enabled: !!schoolId,
    queryFn: async () => {
      const id = requireSchoolId();
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", id)
        .eq("slug", classSlug!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const genders = [
    { label: "Boys", value: "boys" },
    { label: "Girls", value: "girls" },
    { label: "Unisex", value: "unisex" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-muted-foreground mb-12 flex-wrap">
        <Link to="/store" className="hover:text-foreground transition-colors">All Schools</Link>
        <span>/</span>
        <Link to={`/store/school/${slug}`} className="hover:text-foreground transition-colors">{school?.name ?? "…"}</Link>
        <span>/</span>
        <span className="text-foreground">{cls?.name ?? "…"}</span>
      </nav>

      <h1 className="text-2xl md:text-3xl font-extralight tracking-[0.1em] uppercase mb-2">
        {cls?.name ?? "…"}
      </h1>
      <p className="text-sm text-muted-foreground mb-12">Select gender</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl">
        {genders.map((g) => (
          <Link
            key={g.value}
            to={`/store/school/${slug}/class/${classSlug}/gender/${g.value}`}
            className="group border border-border hover:border-foreground transition-all duration-300 flex items-center justify-center aspect-[3/2]"
          >
            <span className="text-lg tracking-[0.2em] uppercase font-extralight group-hover:opacity-60 transition-opacity">
              {g.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ClassGenderPage;
