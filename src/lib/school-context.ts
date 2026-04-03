import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SchoolContext = {
  id: string;
  code: string;
  name: string;
  slug: string;
};

type SchoolContextStore = {
  school: SchoolContext | null;
  setSchool: (school: SchoolContext) => void;
  clearSchool: () => void;
};

export const useSchoolContext = create<SchoolContextStore>()(
  persist(
    (set) => ({
      school: null,
      setSchool: (school) => set({ school }),
      clearSchool: () => set({ school: null }),
    }),
    {
      name: "illume-school-context",
    }
  )
);

export const getSchoolContext = (): SchoolContext | null => useSchoolContext.getState().school;

export const getSchoolId = (): string | null => useSchoolContext.getState().school?.id ?? null;

export const getSchoolSlug = (): string | null => useSchoolContext.getState().school?.slug ?? null;

export const requireSchoolId = (): string => {
  const id = getSchoolId();
  if (!id) {
    throw new Error("NO SCHOOL CONTEXT");
  }
  return id;
};

export const clearSchoolContext = () => useSchoolContext.getState().clearSchool();
