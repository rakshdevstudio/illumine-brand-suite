import { useCallback, useMemo, useState } from "react";

export type HeaderCheckboxState = boolean | "indeterminate";

export const useBulkSelection = (initialIds: string[] = []) => {
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => new Set(initialIds));

  const selectedIds = useMemo(() => Array.from(selectedSet), [selectedSet]);
  const selectedCount = selectedSet.size;

  const isSelected = useCallback((id: string) => selectedSet.has(id), [selectedSet]);

  const clearSelection = useCallback(() => {
    setSelectedSet(new Set());
  }, []);

  const setSelected = useCallback((ids: string[]) => {
    setSelectedSet(new Set(ids));
  }, []);

  const toggleOne = useCallback((id: string, checked?: boolean) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      const shouldSelect = checked ?? !next.has(id);
      if (shouldSelect) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleMany = useCallback((ids: string[], checked?: boolean) => {
    if (ids.length === 0) return;
    setSelectedSet((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      const shouldSelect = checked ?? !allSelected;

      ids.forEach((id) => {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      });

      return next;
    });
  }, []);

  const pruneMissing = useCallback((validIds: string[]) => {
    const validSet = new Set(validIds);
    setSelectedSet((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();

      prev.forEach((id) => {
        if (validSet.has(id)) next.add(id);
        else changed = true;
      });

      return changed ? next : prev;
    });
  }, []);

  const getHeaderState = useCallback(
    (visibleIds: string[]): HeaderCheckboxState => {
      if (visibleIds.length === 0) return false;
      let visibleSelected = 0;
      visibleIds.forEach((id) => {
        if (selectedSet.has(id)) visibleSelected += 1;
      });
      if (visibleSelected === 0) return false;
      if (visibleSelected === visibleIds.length) return true;
      return "indeterminate";
    },
    [selectedSet]
  );

  return {
    selectedIds,
    selectedCount,
    isSelected,
    clearSelection,
    setSelected,
    toggleOne,
    toggleMany,
    pruneMissing,
    getHeaderState,
  };
};
