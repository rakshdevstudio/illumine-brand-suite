import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "admin" | "staff" | "branch_staff" | "vendor" | "school_user" | null;

/** Returns the default destination path for a given role after successful login. */
export function getRoleRedirectPath(role: AppRole): string {
  switch (role) {
    case "super_admin":
    case "admin":
    case "staff":       return "/admin/dashboard";
    case "branch_staff": return "/branch/dashboard";
    case "vendor":       return "/vendor/dashboard";
    case "school_user":  return "/school/dashboard";
    default:             return "/admin/dashboard";
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  const checkRole = async (userId: string) => {
    const { data } = await supabase.rpc("get_user_role", { _user_id: userId });
    return (data as AppRole) || null;
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          try {
            const r = await checkRole(currentUser.id);
            if (mounted) setRole(r);
          } catch {
            if (mounted) setRole(null);
          }
        } else {
          setRole(null);
        }
        if (mounted) setLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        try {
          const r = await checkRole(currentUser.id);
          if (mounted) setRole(r);
        } catch {
          if (mounted) setRole(null);
        }
      }
      if (mounted) setLoading(false);
    });

    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = role === "super_admin" || role === "admin";
  const isSuperAdmin = role === "super_admin";
  const isStaff = role === "staff" || role === "branch_staff";
  const isVendor = role === "vendor";
  const isSchoolUser = role === "school_user";
  const hasAccess = role !== null;

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  return { user, role, isAdmin, isSuperAdmin, isStaff, isVendor, isSchoolUser, hasAccess, loading, signOut };
}
