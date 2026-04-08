import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type InventoryFilterState = {
  school: string;
  class: string;
  gender: string;
  category: string;
  status: "all" | "in-stock" | "low-stock" | "out-of-stock";
  search: string;
};

const DEFAULT_FILTERS: InventoryFilterState = {
  school: "",
  class: "",
  gender: "",
  category: "",
  status: "all",
  search: "",
};

const normalizeStatus = (value: string | null): InventoryFilterState["status"] => {
  if (value === "in-stock" || value === "low-stock" || value === "out-of-stock") return value;
  return "all";
};

export const useInventoryFilters = (): [
  InventoryFilterState,
  (next: Partial<InventoryFilterState>) => void,
] => {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<InventoryFilterState>(
    () => ({
      school: searchParams.get("school") ?? DEFAULT_FILTERS.school,
      class: searchParams.get("class") ?? DEFAULT_FILTERS.class,
      gender: searchParams.get("gender") ?? DEFAULT_FILTERS.gender,
      category: searchParams.get("category") ?? DEFAULT_FILTERS.category,
      status: normalizeStatus(searchParams.get("status")),
      search: searchParams.get("search") ?? DEFAULT_FILTERS.search,
    }),
    [searchParams],
  );

  const setFilters = (next: Partial<InventoryFilterState>) => {
    setSearchParams((currentParams) => {
      const params = new URLSearchParams(currentParams);
      const merged: InventoryFilterState = { ...filters, ...next };

      if (!merged.school) params.delete("school");
      else params.set("school", merged.school);

      if (!merged.class) params.delete("class");
      else params.set("class", merged.class);

      if (!merged.gender) params.delete("gender");
      else params.set("gender", merged.gender);

      if (!merged.category) params.delete("category");
      else params.set("category", merged.category);

      if (merged.status === "all") params.delete("status");
      else params.set("status", merged.status);

      const normalizedSearch = merged.search.trim();
      if (!normalizedSearch) params.delete("search");
      else params.set("search", normalizedSearch);

      return params;
    });
  };

  return [filters, setFilters];
};
