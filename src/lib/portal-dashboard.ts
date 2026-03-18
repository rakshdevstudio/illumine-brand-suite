import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface ScopedSchool {
  id: string;
  name: string;
  slug: string;
  code: string | null;
}

export interface ResolvedSchoolScope {
  schoolId: string | null;
  school: ScopedSchool | null;
  resolution: "user" | "user_metadata" | "user_school_map" | "profile_avatar_fallback" | "none";
}

const SCHOOL_AVATAR_FALLBACK_PREFIX = "school-assignment:";

const readSchoolId = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readSchoolIdFromAvatarFallback = (avatarUrl: string | null | undefined) => {
  const value = readSchoolId(avatarUrl);
  if (!value || !value.startsWith(SCHOOL_AVATAR_FALLBACK_PREFIX)) return null;
  return readSchoolId(value.slice(SCHOOL_AVATAR_FALLBACK_PREFIX.length));
};

const isMissingProfileSchoolColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || message.includes("school_id");
};

const resolveSchoolIdFromAuthUser = (user: User) => {
  const directSchoolId =
    readSchoolId((user as unknown as { school_id?: string | null }).school_id) ??
    readSchoolId((user as unknown as { schoolId?: string | null }).schoolId);

  if (directSchoolId) {
    return { schoolId: directSchoolId, resolution: "user" as const };
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataSchoolId = readSchoolId(metadata.school_id) ?? readSchoolId(metadata.schoolId);

  if (metadataSchoolId) {
    return { schoolId: metadataSchoolId, resolution: "user_metadata" as const };
  }

  return { schoolId: null, resolution: "none" as const };
};

const resolveSchoolIdFromMappingTable = async (userId: string) => {
  try {
    const { data, error } = await (supabase as any)
      .from("user_school_map")
      .select("school_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode && !["PGRST205", "42P01"].includes(errorCode)) {
        console.warn("user_school_map lookup failed:", error.message);
      }
      return null;
    }

    return readSchoolId(data?.school_id);
  } catch (error) {
    console.warn("user_school_map lookup failed:", error);
    return null;
  }
};

export const useResolvedSchoolScope = (user: User | null) =>
  useQuery({
    queryKey: ["resolved-school-scope", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();

      if (profileError && !isMissingProfileSchoolColumnError(profileError)) {
        throw profileError;
      }

      if (profileError && isMissingProfileSchoolColumnError(profileError)) {
        console.warn("profiles.school_id is unavailable, resolving school scope from auth metadata or user_school_map.");
      }

      let schoolId = readSchoolId((profile as { school_id?: string | null } | null)?.school_id);
      let resolution: ResolvedSchoolScope["resolution"] = schoolId ? "user" : "none";

      if (!schoolId) {
        const avatarFallbackSchoolId = readSchoolIdFromAvatarFallback(
          (profile as { avatar_url?: string | null } | null)?.avatar_url,
        );

        if (avatarFallbackSchoolId) {
          schoolId = avatarFallbackSchoolId;
          resolution = "profile_avatar_fallback";
        }
      }

      if (!schoolId) {
        const directResolution = resolveSchoolIdFromAuthUser(user!);
        schoolId = directResolution.schoolId;
        resolution = directResolution.resolution;
      }

      if (!schoolId) {
        const mappedSchoolId = await resolveSchoolIdFromMappingTable(user!.id);
        if (mappedSchoolId) {
          schoolId = mappedSchoolId;
          resolution = "user_school_map";
        }
      }

      console.log("Resolved school_id:", schoolId);

      if (!schoolId) {
        return {
          schoolId: null,
          school: null,
          resolution,
        };
      }

      const { data: school, error: schoolError } = await supabase
        .from("schools")
        .select("id, name, slug, code")
        .eq("id", schoolId)
        .maybeSingle();

      if (schoolError) throw schoolError;

      return {
        schoolId,
        school: (school as ScopedSchool | null) ?? null,
        resolution,
      };
    },
    staleTime: 60_000,
  });

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

export const formatShortDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

export const ORDER_STATUS_STYLES: Record<string, string> = {
  pending: "bg-stone-100 text-stone-700 border-stone-200",
  confirmed: "bg-sky-100 text-sky-700 border-sky-200",
  packed: "bg-amber-100 text-amber-700 border-amber-200",
  shipped: "bg-violet-100 text-violet-700 border-violet-200",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

export const extractOrderStudentMeta = (
  notes: Array<{ note?: string | null } | null | undefined> | undefined,
) => {
  const meta = {
    studentName: "",
    grade: "",
    alternatePhone: "",
  };

  if (!notes?.length) return meta;

  for (const entry of notes) {
    const note = entry?.note ?? "";
    if (!note) continue;

    const studentNameMatch = note.match(/Student Name:\s*(.+)/i);
    const gradeMatch = note.match(/Grade:\s*(.+)/i);
    const alternatePhoneMatch = note.match(/Alternate Phone:\s*(.+)/i);

    if (studentNameMatch?.[1] && !meta.studentName) meta.studentName = studentNameMatch[1].trim();
    if (gradeMatch?.[1] && !meta.grade) meta.grade = gradeMatch[1].trim();
    if (alternatePhoneMatch?.[1] && !meta.alternatePhone) meta.alternatePhone = alternatePhoneMatch[1].trim();

    if (meta.studentName && meta.grade && meta.alternatePhone) break;
  }

  return meta;
};

export const resolveOrderClassLabel = (order: any) => {
  const meta = extractOrderStudentMeta(order?.order_notes);
  if (meta.grade) return meta.grade;
  if (order?.grade) return order.grade;

  const className = (order?.order_items ?? []).find((item: any) => item?.products?.classes?.name)?.products?.classes?.name;
  return className || "Unassigned";
};
