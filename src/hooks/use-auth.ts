import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { safeQuery } from "@/lib/safeQuery";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export type AppRole = "super_admin" | "admin" | "illume_team" | "staff" | "branch_staff" | "vendor" | "school_user" | null;

/** Returns the default destination path for a given role after successful login. */
export function getRoleRedirectPath(role: AppRole): string {
  switch (role) {
    case "super_admin":
    case "admin":
    case "illume_team":
    case "staff":       return "/admin/dashboard";
    case "branch_staff": return "/admin/dashboard";
    case "vendor":       return "/seller/dashboard";
    case "school_user":  return "/school/dashboard";
    default:             return "/admin/dashboard";
  }
}

export function useAuth() {
  const { session, isChecking } = useRequireAuth();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const checkRole = async (userId: string) => {
    const { data } = await safeQuery(() => supabase.rpc("get_user_role", { _user_id: userId }), "useAuth/checkRole");
    return (data as AppRole) || null;
  };

  useEffect(() => {
    let mounted = true;

    const resolveRole = async () => {
      if (isChecking) return;

      const currentUser = session?.user ?? null;
      if (mounted) setUser(currentUser);

      if (!currentUser) {
        if (mounted) {
          setRole(null);
          setRoleLoading(false);
        }
        return;
      }

      try {
        const resolvedRole = await checkRole(currentUser.id);
        if (mounted) {
          setRole(resolvedRole);
        }
      } catch {
        if (mounted) {
          setRole(null);
        }
      } finally {
        if (mounted) {
          setRoleLoading(false);
        }
      }
    };

    if (mounted) {
      setRoleLoading(true);
    }

    void resolveRole();

    return () => {
      mounted = false;
    };
  }, [isChecking, session]);

  const isAdmin = role === "super_admin" || role === "admin" || role === "illume_team";
  const isSuperAdmin = role === "super_admin";
  const isStaff = role === "staff" || role === "branch_staff";
  const isVendor = role === "vendor";
  const isSeller = isVendor;
  const isSchoolUser = role === "school_user";
  const hasAccess = role !== null;

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  const loading = isChecking || roleLoading;

  return { user, role, isAdmin, isSuperAdmin, isStaff, isVendor, isSeller, isSchoolUser, hasAccess, loading, signOut };
}
