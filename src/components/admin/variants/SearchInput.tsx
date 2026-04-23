import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onClearRecentSearches?: () => void;
  placeholder?: string;
  isFetching?: boolean;
  recentSearches?: string[];
  onSelectRecentSearch?: (value: string) => void;
  className?: string;
};

export const SearchInput = ({
  value,
  onChange,
  onClear,
  onClearRecentSearches,
  placeholder = "Search variants (product, size, class...)",
  isFetching = false,
  recentSearches = [],
  onSelectRecentSearch,
  className,
}: SearchInputProps) => {
  const hasValue = value.trim().length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 rounded-full border-border/70 bg-white pl-11 pr-24 shadow-sm transition-shadow placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-primary/20"
          aria-label="Search variants"
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isFetching && (
            <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground md:flex">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching
            </div>
          )}
          {hasValue && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClear}
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {recentSearches.length > 0 && !hasValue && onSelectRecentSearch && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Recent</span>
          {recentSearches.slice(0, 5).map((term) => (
            <Button
              key={term}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full border-border/70 bg-white px-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onSelectRecentSearch(term)}
            >
              {term}
            </Button>
          ))}
          {onClearRecentSearches && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={onClearRecentSearches}
            >
              Clear recent
            </Button>
          )}
        </div>
      )}
    </div>
  );
};