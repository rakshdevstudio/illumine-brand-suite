import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PurchaseRow = {
  id: string;
  status: string;
  updated_at?: string;
};

type PurchaseDetails = {
  id: string;
  status: string;
  updated_at: string;
};

type VoidPurchaseResult = {
  purchase_id: string;
  purchase_number: string;
  status: string;
  reversal_ledger_entry_id: string | null;
  no_op: boolean;
};

export const useVoidPurchase = ({
  purchaseId,
  onSuccess,
}: {
  purchaseId: string | null;
  onSuccess?: (result: VoidPurchaseResult) => void;
}) => {
  const queryClient = useQueryClient();

  const voidMutation = useMutation({
    mutationFn: async (targetPurchaseId: string) => {
      const { data, error } = await (supabase as any).rpc("void_purchase", {
        p_purchase_id: targetPurchaseId,
      });

      if (error) throw error;
      return data as VoidPurchaseResult;
    },
    onMutate: async (targetPurchaseId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["erp-purchases"] }),
        queryClient.cancelQueries({ queryKey: ["purchaseDetails", targetPurchaseId] }),
      ]);

      const previousPurchases = queryClient.getQueryData<PurchaseRow[]>(["erp-purchases"]);
      const previousPurchaseDetails = queryClient.getQueryData<PurchaseDetails>(["purchaseDetails", targetPurchaseId]);
      const optimisticUpdatedAt = new Date().toISOString();

      queryClient.setQueryData<PurchaseRow[] | undefined>(["erp-purchases"], (current) =>
        (current ?? []).map((purchase) =>
          purchase.id === targetPurchaseId
            ? { ...purchase, status: "voided", updated_at: optimisticUpdatedAt }
            : purchase,
        ),
      );

      queryClient.setQueryData<PurchaseDetails | undefined>(["purchaseDetails", targetPurchaseId], (current) =>
        current
          ? {
              ...current,
              status: "voided",
              updated_at: optimisticUpdatedAt,
            }
          : current,
      );

      return {
        previousPurchases,
        previousPurchaseDetails,
        targetPurchaseId,
      };
    },
    onError: (error: Error, _targetPurchaseId, context) => {
      if (context && context.previousPurchases !== undefined) {
        queryClient.setQueryData(["erp-purchases"], context.previousPurchases);
      }

      if (context && context.previousPurchaseDetails !== undefined) {
        queryClient.setQueryData(
          ["purchaseDetails", context.targetPurchaseId],
          context.previousPurchaseDetails,
        );
      }

      toast.error(error.message || "Failed to void purchase.");
    },
    onSuccess: async (result, targetPurchaseId) => {
      toast.success(result.no_op ? "Purchase already voided" : "Purchase voided successfully");
      onSuccess?.(result);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["erp-purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["purchaseDetails", targetPurchaseId] }),
        queryClient.invalidateQueries({ queryKey: ["erp-ledger-entries"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-branch-inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-inventory-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-inventory-alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["report-inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["report-inventory-audit"] }),
      ]);
    },
  });

  return {
    voidPurchase: () => {
      if (!purchaseId) return;
      voidMutation.mutate(purchaseId);
    },
    isVoiding: voidMutation.isPending,
    voidingPurchaseId: voidMutation.variables ?? null,
  };
};
