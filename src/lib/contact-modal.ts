import { create } from "zustand";

type ContactModalStore = {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

export const useContactModal = create<ContactModalStore>((set) => ({
  isOpen: false,
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
}));
