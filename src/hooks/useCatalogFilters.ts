import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ALL_FILTER_VALUE } from "@/lib/storefront";

type FilterValue = string;

export type CatalogFilterState = {
  school: FilterValue;
  class: FilterValue;
  gender: FilterValue;
  product: FilterValue;
};

const FILTER_KEYS = ["school", "class", "gender", "product"] as const;

export const useCatalogFilters = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<CatalogFilterState>(
    () => ({
      school: searchParams.get("school") ?? ALL_FILTER_VALUE,
      class: searchParams.get("class") ?? ALL_FILTER_VALUE,
      gender: searchParams.get("gender") ?? ALL_FILTER_VALUE,
      product: searchParams.get("product") ?? ALL_FILTER_VALUE,
    }),
    [searchParams],
  );

  const updateFilter = (key: keyof CatalogFilterState, value: string) => {
    setSearchParams((currentParams) => {
      const next = new URLSearchParams(currentParams);
      const normalizedValue = value || ALL_FILTER_VALUE;

      if (normalizedValue === ALL_FILTER_VALUE) {
        next.delete(key);
      } else {
        next.set(key, normalizedValue);
      }

      return next;
    });
  };

  const replaceFilters = (nextFilters: Partial<CatalogFilterState>) => {
    setSearchParams((currentParams) => {
      const next = new URLSearchParams(currentParams);

      FILTER_KEYS.forEach((key) => {
        const value = nextFilters[key];
        if (typeof value !== "string") return;

        if (value === ALL_FILTER_VALUE) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });

      return next;
    });
  };

  return { filters, updateFilter, replaceFilters };
};
