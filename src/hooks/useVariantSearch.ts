import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALL_FILTER_VALUE } from "@/lib/storefront";
import { useDebounce } from "@/hooks/useDebounce";

export type VariantSearchFilters = {
  school: string;
  class: string;
  gender: string;
  product: string;
};

export type VariantSearchRow = {
  id: string;
  product_id: string;
  size: string;
  stock: number;
  price_override: number | null;
  status: string;
  created_at?: string;
  products: {
    name: string | null;
    gender: string | null;
    school_id: string | null;
    class_id: string | null;
    schools: { name: string | null } | null;
    classes: { name: string | null } | null;
  } | null;
};

const RECENT_SEARCHES_KEY = "admin-variant-search-history";
const SEARCH_PARAM_KEY = "search";
const SEARCH_LIMIT = 100;

const sanitizeSearchTerm = (value: string) => value.replace(/[%*,()]/g, " ").trim();

const readRecentSearches = (): string[] => {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const writeRecentSearches = (items: string[]) => {
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, 8)));
};

export const useVariantSearch = ({ filters }: { filters: VariantSearchFilters }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const initialSearch = useMemo(() => searchParams.get(SEARCH_PARAM_KEY) ?? "", [searchParams]);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecentSearches()));
  const debouncedSearch = useDebounce(searchInput, 300);
  const lastErrorMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const urlSearch = searchParams.get(SEARCH_PARAM_KEY) ?? "";
    if (urlSearch !== searchInput) {
      setSearchInput(urlSearch);
    }
  }, [searchParams, searchInput]);

  useEffect(() => {
    setSearchParams(
      (currentParams) => {
        const next = new URLSearchParams(currentParams);
        const normalizedSearch = debouncedSearch.trim();

        if (normalizedSearch) {
          next.set(SEARCH_PARAM_KEY, normalizedSearch);
        } else {
          next.delete(SEARCH_PARAM_KEY);
        }

        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, setSearchParams]);

  useEffect(() => {
    queryClient.cancelQueries({ queryKey: ["variants"] });
  }, [debouncedSearch, filters.class, filters.gender, filters.product, filters.school, queryClient]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRecentSearches(readRecentSearches());
  }, []);

  const query = useQuery({
    queryKey: ["variants", debouncedSearch.trim().toLowerCase(), filters.school, filters.class, filters.gender, filters.product],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const normalizedSearch = sanitizeSearchTerm(debouncedSearch);

      let request = (supabase as any)
        .from("product_variants")
        .select("id, product_id, size, stock, price_override, status, created_at, products(name, gender, school_id, class_id, schools(name), classes(name))")
        .order("created_at", { ascending: false });

      if (filters.school !== ALL_FILTER_VALUE) request = request.eq("products.school_id", filters.school);
      if (filters.class !== ALL_FILTER_VALUE) request = request.eq("products.class_id", filters.class);
      if (filters.gender !== ALL_FILTER_VALUE) request = request.eq("products.gender", filters.gender);
      if (filters.product !== ALL_FILTER_VALUE) request = request.eq("product_id", filters.product);

      if (normalizedSearch) {
        request = request
          .or(
            `products.name.ilike.*${normalizedSearch}*,size.ilike.*${normalizedSearch}*,products.schools.name.ilike.*${normalizedSearch}*,products.classes.name.ilike.*${normalizedSearch}*,products.gender.ilike.*${normalizedSearch}*`,
          )
          .limit(SEARCH_LIMIT);
      }

      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as VariantSearchRow[];
    },
  });

  useEffect(() => {
    const message = query.error instanceof Error ? query.error.message : null;
    if (!message || message === lastErrorMessageRef.current) return;
    lastErrorMessageRef.current = message;
    toast.error(message);
  }, [query.error]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const term = debouncedSearch.trim();
    if (!term) return;

    const current = readRecentSearches();
    const next = [term, ...current.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 8);
    setRecentSearches(next);
    writeRecentSearches(next);
  }, [debouncedSearch]);

  const setSearch = (value: string) => {
    setSearchInput(value);
  };

  const clearSearch = () => setSearchInput("");

  return {
    variants: (query.data ?? []) as VariantSearchRow[],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    search: searchInput,
    debouncedSearch,
    setSearch,
    clearSearch,
    recentSearches,
  };
};