import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type Customer = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  created_at: string;
};

type CustomerAuthState = {
  user: User | null;
  session: Session | null;
  customer: Customer | null;
  loading: boolean;
  initialized: boolean;

  init: () => void;
  signInWithEmail: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string }) => Promise<{ error: Error | null }>;
};

let _subscription: { unsubscribe: () => void } | null = null;

export const useCustomerAuth = create<CustomerAuthState>((set, get) => ({
  user: null,
  session: null,
  customer: null,
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    // Restore existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        set({ session, user: session.user });
        await get().refreshCustomer();
      }
      set({ loading: false });
    });

    // Subscribe to future auth changes
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session, user: session?.user ?? null });
      if (session) {
        await get().refreshCustomer();
      } else {
        set({ customer: null, loading: false });
      }
    });
    _subscription?.unsubscribe();
    _subscription = data.subscription;
  },

  signInWithEmail: async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        shouldCreateUser: true,
      },
    });
    return { error: error as Error | null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, customer: null });
  },

  refreshCustomer: async () => {
    const { user } = get();
    if (!user) return;

    // Upsert ensures customer row exists for this auth user
    const { data, error } = await supabase
      .from("customers")
      .upsert({ id: user.id, email: user.email ?? "" }, { onConflict: "id" })
      .select()
      .single();

    if (!error && data) {
      set({ customer: data as Customer });
    }
  },

  updateProfile: async ({ name, phone }) => {
    const { user } = get();
    if (!user) return { error: new Error("Not logged in") };

    const { error } = await supabase
      .from("customers")
      .update({ name, phone })
      .eq("id", user.id);

    if (!error) await get().refreshCustomer();
    return { error: error as Error | null };
  },
}));
