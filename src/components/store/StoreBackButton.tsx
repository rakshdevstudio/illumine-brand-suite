import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

type BackLevel = "product" | "products" | "gender" | "class";

type StoreBackButtonProps = {
  level: BackLevel;
  schoolSlug?: string | null;
  classSlug?: string | null;
  gender?: string | null;
  label?: string;
};

const normalizeGender = (value: string | null | undefined) => {
  if (value === "boys" || value === "girls" || value === "unisex") return value;
  return null;
};

const resolveParam = (
  explicitValue: string | null | undefined,
  searchParams: URLSearchParams,
  ...searchKeys: string[]
) => {
  if (explicitValue && explicitValue.length > 0) return explicitValue;
  for (const key of searchKeys) {
    const value = searchParams.get(key);
    if (value && value.length > 0) return value;
  }
  return null;
};

const buildContextQuery = (schoolSlug: string | null, classSlug: string | null, gender: string | null) => {
  const params = new URLSearchParams();

  if (schoolSlug) {
    params.set("school", schoolSlug);
    params.set("schoolSlug", schoolSlug);
  }

  if (classSlug) {
    params.set("class", classSlug);
    params.set("classSlug", classSlug);
  }

  if (gender) {
    params.set("gender", gender);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
};

const StoreBackButton = ({
  level,
  schoolSlug: providedSchoolSlug,
  classSlug: providedClassSlug,
  gender: providedGender,
  label = "Back",
}: StoreBackButtonProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ slug?: string; classSlug?: string; gender?: string }>();
  const [searchParams] = useSearchParams();

  const context = useMemo(() => {
    const resolvedSchool = resolveParam(providedSchoolSlug ?? params.slug ?? null, searchParams, "school", "schoolSlug");
    const resolvedClass = resolveParam(providedClassSlug ?? params.classSlug ?? null, searchParams, "class", "classSlug");
    const resolvedGender = normalizeGender(resolveParam(providedGender ?? params.gender ?? null, searchParams, "gender"));

    return {
      schoolSlug: resolvedSchool,
      classSlug: resolvedClass,
      gender: resolvedGender,
    };
  }, [params.classSlug, params.gender, params.slug, providedClassSlug, providedGender, providedSchoolSlug, searchParams]);

  const targetHref = useMemo(() => {
    const contextQuery = buildContextQuery(context.schoolSlug, context.classSlug, context.gender);

    switch (level) {
      case "product":
        if (context.schoolSlug && context.classSlug && context.gender) {
          return `/store/school/${context.schoolSlug}/class/${context.classSlug}/gender/${context.gender}${contextQuery}`;
        }
        return null;
      case "products":
        if (context.schoolSlug && context.classSlug) {
          return `/store/school/${context.schoolSlug}/class/${context.classSlug}${contextQuery}`;
        }
        return null;
      case "gender":
        if (context.schoolSlug) {
          return `/store/school/${context.schoolSlug}${contextQuery}`;
        }
        return null;
      case "class":
        return "/store";
      default:
        return null;
    }
  }, [context.classSlug, context.gender, context.schoolSlug, level]);

  const handleBack = () => {
    if (targetHref) {
      if (targetHref === `${location.pathname}${location.search}`) {
        navigate(-1);
        return;
      }
      navigate(targetHref);
      return;
    }

    navigate(-1);
  };

  return (
    <div className="sticky top-14 z-20 -mx-6 mb-6 border-b border-border/70 bg-background/95 px-6 py-2 backdrop-blur md:static md:mx-0 md:mb-8 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex min-h-10 items-center gap-2 px-1 text-xs tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        {label}
      </button>
    </div>
  );
};

export default StoreBackButton;
