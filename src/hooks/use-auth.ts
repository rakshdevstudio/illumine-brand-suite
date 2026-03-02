import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type AppRole = "super_admin" | "admin" | "staff" | null;

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

    // Safety timeout — never stay loading forever
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
  const isStaff = role === "staff";
  const hasAccess = role !== null;

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  return { user, role, isAdmin, isSuperAdmin, isStaff, hasAccess, loading, signOut };
}
