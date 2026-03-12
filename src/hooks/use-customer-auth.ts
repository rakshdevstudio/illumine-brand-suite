import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

export type Customer = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
};

type CustomerAuthState = {
  customer: Customer | null;
  loading: boolean;
  /** Call once from StoreLayout to seed state from the current Supabase session. */
  init: () => Promise<void>;
  /** Update local state directly (used by PhoneLoginPage after successful OTP). */
  setCustomer: (customer: Customer) => void;
  /** Sign the phone-OTP user out and clear state. */
  logout: () => Promise<void>;
};

export const useCustomerAuth = create<CustomerAuthState>((set) => ({
  customer: null,
  loading: true,

  init: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      const { data } = await supabase
        .from("customers")
        .select("id, phone, name, email")
        .eq("id", session.user.id)
        .maybeSingle();
      set({ customer: data ?? null, loading: false });
    } else {
      set({ customer: null, loading: false });
    }
  },

  setCustomer: (customer) => set({ customer, loading: false }),

  logout: async () => {
    await supabase.auth.signOut();
    set({ customer: null });
  },
}));
