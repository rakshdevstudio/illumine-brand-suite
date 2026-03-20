import { create } from "zustand";
import { persist } from "zustand/middleware";

type StoreBranchState = {
  activeBranchId: string | null;
  setActiveBranchId: (branchId: string | null) => void;
};

export const useStoreBranch = create<StoreBranchState>()(
  persist(
    (set) => ({
      activeBranchId: null,
      setActiveBranchId: (branchId) => set({ activeBranchId: branchId }),
    }),
    { name: "illume-store-branch" }
  )
);
