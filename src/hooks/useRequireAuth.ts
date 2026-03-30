import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useRequireAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    const hydrationTimeout = setTimeout(() => {
      if (mounted) {
        setIsChecking(false);
      }
    }, 8000);

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        const currentSession = error ? null : data?.session ?? null;
        console.log("SESSION:", currentSession);
        setSession(currentSession);
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    };

    void checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      setIsChecking(false);
    });

    return () => {
      mounted = false;
      clearTimeout(hydrationTimeout);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return { session, isChecking };
}
