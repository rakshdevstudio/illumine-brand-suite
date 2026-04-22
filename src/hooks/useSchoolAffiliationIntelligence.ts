import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSchoolAffiliationRecord,
  fetchSchoolAffiliationSummary,
  upsertSchoolAffiliationRecord,
} from "@/lib/reports/data";
import type { DateRange } from "@/lib/reports/types";

type SaveState = "idle" | "saving" | "saved" | "error";

const formatPercentageInput = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
};

const sanitizeCommissionInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
};

export const useSchoolAffiliationIntelligence = ({
  schoolId,
  dateRange,
}: {
  schoolId: string | null;
  dateRange: DateRange;
}) => {
  const queryClient = useQueryClient();
  const [draftCommissionPercentage, setDraftCommissionPercentage] = useState("0");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["school-affiliation-summary", schoolId, dateRange.from, dateRange.to],
    enabled: !!schoolId,
    staleTime: 60_000,
    queryFn: () => fetchSchoolAffiliationSummary({ schoolId: schoolId!, dateRange }),
  });

  const affiliationQuery = useQuery({
    queryKey: ["school-affiliation-record", schoolId],
    enabled: !!schoolId,
    staleTime: 5 * 60_000,
    queryFn: () => fetchSchoolAffiliationRecord(schoolId!),
  });

  const syncedPercentage = affiliationQuery.data?.commission_percentage ?? 0;

  useEffect(() => {
    if (!schoolId) {
      setDraftCommissionPercentage("0");
      setSaveState("idle");
      setValidationMessage(null);
      return;
    }

    if (affiliationQuery.isPending) return;

    setDraftCommissionPercentage(formatPercentageInput(syncedPercentage));
    setSaveState("idle");
    setValidationMessage(null);
  }, [affiliationQuery.isPending, schoolId, syncedPercentage]);

  const parsedCommissionPercentage = useMemo(() => {
    const value = Number(draftCommissionPercentage);
    return Number.isFinite(value) ? value : NaN;
  }, [draftCommissionPercentage]);

  const isCommissionValid =
    draftCommissionPercentage.trim().length > 0 &&
    Number.isFinite(parsedCommissionPercentage) &&
    parsedCommissionPercentage >= 0 &&
    parsedCommissionPercentage <= 100;

  const mutation = useMutation({
    mutationFn: ({ commissionPercentage }: { commissionPercentage: number }) =>
      upsertSchoolAffiliationRecord(schoolId!, commissionPercentage),
    onSuccess: (data) => {
      queryClient.setQueryData(["school-affiliation-record", schoolId], data);
      setSaveState("saved");
      setValidationMessage(null);
    },
    onError: () => {
      setSaveState("error");
      setValidationMessage("We couldn't save the commission rate. Please retry.");
    },
  });

  useEffect(() => {
    if (saveState !== "saved") return undefined;

    const timeoutId = window.setTimeout(() => {
      setSaveState("idle");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [saveState]);

  useEffect(() => {
    if (!schoolId || affiliationQuery.isPending) return undefined;

    if (!draftCommissionPercentage.trim().length) {
      setSaveState("error");
      setValidationMessage("Enter a commission rate between 0 and 100.");
      return undefined;
    }

    if (!isCommissionValid) {
      setSaveState("error");
      setValidationMessage("Commission rate must stay between 0% and 100%.");
      return undefined;
    }

    if (Math.abs(parsedCommissionPercentage - syncedPercentage) <= 0.001) {
      if (saveState !== "saved") {
        setSaveState("idle");
      }
      setValidationMessage(null);
      return undefined;
    }

    setSaveState("saving");
    setValidationMessage(null);

    const timeoutId = window.setTimeout(() => {
      mutation.mutate({ commissionPercentage: parsedCommissionPercentage });
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [
    affiliationQuery.isPending,
    draftCommissionPercentage,
    isCommissionValid,
    mutation,
    parsedCommissionPercentage,
    saveState,
    schoolId,
    syncedPercentage,
  ]);

  const revenueExcludingGst = summaryQuery.data?.revenue_excl ?? 0;
  const commissionPayable = useMemo(
    () => (Number.isFinite(parsedCommissionPercentage) ? (revenueExcludingGst * parsedCommissionPercentage) / 100 : 0),
    [parsedCommissionPercentage, revenueExcludingGst],
  );

  return {
    summary: summaryQuery.data ?? null,
    affiliation: affiliationQuery.data ?? null,
    isLoading: summaryQuery.isPending || affiliationQuery.isPending,
    isRefreshing: summaryQuery.isFetching || affiliationQuery.isFetching,
    draftCommissionPercentage,
    parsedCommissionPercentage: Number.isFinite(parsedCommissionPercentage) ? parsedCommissionPercentage : 0,
    isCommissionValid,
    saveState,
    validationMessage,
    commissionPayable,
    updateDraftCommissionPercentage: (value: string) => {
      setDraftCommissionPercentage(sanitizeCommissionInput(value));
    },
  };
};
