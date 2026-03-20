import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreBranch } from "@/lib/store-branch";

export const useStoreActiveBranch = () => {
  const activeBranchId = useStoreBranch((s) => s.activeBranchId);
  const setActiveBranchId = useStoreBranch((s) => s.setActiveBranchId);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["store-active-branches"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("branches")
        .select("id, name, location, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; location: string | null; is_active: boolean }>;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!branches || branches.length === 0) {
      if (activeBranchId) setActiveBranchId(null);
      return;
    }

    const exists = activeBranchId && branches.some((branch) => branch.id === activeBranchId);
    if (!exists) {
      setActiveBranchId(branches[0].id);
    }
  }, [branches, activeBranchId, setActiveBranchId]);

  const activeBranch = useMemo(
    () => (branches ?? []).find((branch) => branch.id === activeBranchId) ?? null,
    [branches, activeBranchId]
  );

  return {
    branches: branches ?? [],
    activeBranchId,
    activeBranch,
    setActiveBranchId,
    isLoading,
  };
};
