import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSchoolContext } from "@/lib/school-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RequireSchoolContextProps {
  children: ReactNode;
}

const RequireSchoolContext = ({ children }: RequireSchoolContextProps) => {
  const school = useSchoolContext((s) => s.school);
  const location = useLocation();
  const navigate = useNavigate();
  const setSchool = useSchoolContext((s) => s.setSchool);
  const [checkingCode, setCheckingCode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const codeParam = params.get("code")?.trim().toUpperCase() || null;

    const validateCode = async (code: string) => {
      setCheckingCode(true);
      try {
        const { data, error } = await supabase
          .from("schools")
          .select("id, name, slug, code, status")
          .eq("code", code)
          .eq("status", "active")
          .single();

        if (error || !data) {
          toast.error("Invalid or inactive school code");
          navigate("/shop-by-school", { replace: true, state: { from: `${location.pathname}${location.search}` } });
          return;
        }

        setSchool({
          id: data.id,
          name: data.name,
          slug: data.slug,
          code: data.code ?? code,
        });
      } finally {
        setCheckingCode(false);
      }
    };

    if (!school) {
      if (codeParam) {
        void validateCode(codeParam);
        return;
      }
      navigate("/shop-by-school", {
        replace: true,
        state: { from: `${location.pathname}${location.search}` },
      });
      return;
    }

    const slugMatch = location.pathname.match(/\/store\/school\/([^/]+)/);
    if (slugMatch && slugMatch[1] && school.slug && slugMatch[1] !== school.slug) {
      navigate(`/store/school/${school.slug}`, { replace: true });
    }

    if (location.pathname === "/store" && school.slug) {
      navigate(`/store/school/${school.slug}`, { replace: true });
    }
  }, [school, location.pathname, location.search, navigate, setSchool]);

  if (!school || checkingCode) return null;
  return <>{children}</>;
};

export default RequireSchoolContext;
