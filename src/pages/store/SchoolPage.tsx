import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requireSchoolId, useSchoolContext } from "@/lib/school-context";

const SchoolPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
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
    <div className="store-shell">
      <div
        onClick={() => navigate(-1)}
        className="mb-6 cursor-pointer text-sm tracking-wide text-gray-500 hover:text-black transition"
      >
        ← Back
      </div>

      {/* Breadcrumb */}
      <nav className="store-breadcrumb">
        <Link to="/store" className="hover:text-foreground transition-colors">All Schools</Link>
        <span>/</span>
        <span className="text-foreground">{school?.name ?? "…"}</span>
      </nav>

      {school && (
        <h1 className="store-title mb-2">
          {school.name}
        </h1>
      )}
      <p className="store-subtitle mb-12">Select a class</p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse border border-border aspect-[4/3]" />
          ))}
        </div>
      ) : !classes || classes.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-muted-foreground">No classes available</p>
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
