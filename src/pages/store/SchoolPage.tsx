import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { requireSchoolId, useSchoolContext } from "@/lib/school-context";

const SchoolPage = () => {
  const { slug } = useParams<{ slug: string }>();
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

  const { data: classes, isLoading } = useQuery({
    queryKey: ["school-classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const id = requireSchoolId();
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", id)
        .eq("status", "active")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-muted-foreground mb-12">
        <Link to="/store" className="hover:text-foreground transition-colors">All Schools</Link>
        <span>/</span>
        <span className="text-foreground">{school?.name ?? "…"}</span>
      </nav>

      {school && (
        <h1 className="text-2xl md:text-3xl font-extralight tracking-[0.1em] uppercase mb-2">
          {school.name}
        </h1>
      )}
      <p className="text-sm text-muted-foreground mb-12">Select a class</p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse border border-border aspect-[4/3]" />
          ))}
        </div>
      ) : !classes || classes.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-muted-foreground">No classes available</p>
          <Link
            to="/store"
            className="inline-flex items-center gap-2 mt-6 text-xs tracking-[0.2em] uppercase border border-border px-6 py-3 hover:border-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
            Back to schools
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {classes.map((cls) => (
            <Link
              key={cls.id}
              to={`/store/school/${slug}/class/${cls.slug}`}
              className="group border border-border hover:border-foreground transition-all duration-300 flex items-center justify-center aspect-[4/3]"
            >
              <span className="text-sm tracking-[0.15em] uppercase font-light group-hover:opacity-60 transition-opacity">
                {cls.name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchoolPage;
