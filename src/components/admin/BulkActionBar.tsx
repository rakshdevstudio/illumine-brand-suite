import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  children: ReactNode;
  isBusy?: boolean;
}

const BulkActionBar = ({ selectedCount, onClear, children, isBusy = false }: BulkActionBarProps) => {
  if (selectedCount <= 0) return null;

  return (
    <div className="sticky bottom-4 z-40 mt-4 rounded-xl border border-black/10 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-black px-2 py-1 text-[11px] tracking-[0.16em] text-white uppercase">
            {selectedCount} selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs tracking-[0.14em] uppercase"
            onClick={onClear}
            disabled={isBusy}
          >
            Clear Selection
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
};

export default BulkActionBar;
