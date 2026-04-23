import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type VendorCacheRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  payment_terms_days: number;
  is_active: boolean;
  created_at: string;
};

export const useDeleteVendor = ({
  vendorId,
  open,
  onDeleted,
}: {
  vendorId: string | null;
  open: boolean;
  onDeleted?: () => void;
}) => {
  const queryClient = useQueryClient();

  const purchaseCountQuery = useQuery({
    queryKey: ["vendor-purchase-count", vendorId],
    enabled: open && !!vendorId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendorId);

      if (error) throw error;
      return Number(count ?? 0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetVendorId: string) => {
      const { error } = await (supabase as any)
        .from("vendors")
        .delete()
        .eq("id", targetVendorId);

      if (error) throw error;
      return targetVendorId;
    },
    onMutate: async (targetVendorId) => {
      await queryClient.cancelQueries({ queryKey: ["erp-vendors"] });
      const previousRows = queryClient.getQueryData<VendorCacheRow[]>(["erp-vendors"]);

      queryClient.setQueryData<VendorCacheRow[] | undefined>(["erp-vendors"], (current) =>
        (current ?? []).filter((row) => row.id !== targetVendorId),
      );

      return { previousRows };
    },
    onError: (error: Error, _targetVendorId, context) => {
      if (context?.previousRows) {
        queryClient.setQueryData(["erp-vendors"], context.previousRows);
      }
      toast.error(error.message || "Failed to delete vendor.");
    },
    onSuccess: async () => {
      toast.success("Vendor deleted successfully");
      onDeleted?.();
      await queryClient.invalidateQueries({ queryKey: ["erp-vendors"] });
    },
  });

  return {
    purchaseCount: purchaseCountQuery.data ?? 0,
    isPurchaseCountLoading: purchaseCountQuery.isPending,
    deleteVendor: () => {
      if (!vendorId) return;
      deleteMutation.mutate(vendorId);
    },
    isDeleting: deleteMutation.isPending,
    deletingVendorId: deleteMutation.variables ?? null,
  };
};
