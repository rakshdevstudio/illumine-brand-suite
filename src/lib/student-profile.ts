import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface StudentProfile {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  classId: string;
  className: string;
  classSlug: string;
  gender: "boys" | "girls" | "unisex";
  genderLabel: string;
}

interface StudentProfileStore {
  profile: StudentProfile | null;
  showModal: boolean;
  setProfile: (profile: StudentProfile) => void;
  clearProfile: () => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useStudentProfile = create<StudentProfileStore>()(
  persist(
    (set) => ({
      profile: null,
      showModal: false,
      setProfile: (profile) => set({ profile, showModal: false }),
      clearProfile: () => set({ profile: null }),
      openModal: () => set({ showModal: true }),
      closeModal: () => set({ showModal: false }),
    }),
    {
      name: "illume-student-profile",
      partialize: (state) => ({ profile: state.profile }),
    }
  )
);
