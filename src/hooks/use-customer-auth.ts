import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import { useStudentProfile } from "@/lib/student-profile";
import type { User, Session } from "@supabase/supabase-js";

export type Customer = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  child_school_id: string | null;
  child_class_id: string | null;
  child_gender: string | null;
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
  updateProfile: (data: {
    name?: string;
    phone?: string;
    child_school_id?: string | null;
    child_class_id?: string | null;
    child_gender?: string | null;
  }) => Promise<{ error: Error | null }>;

  /** True when the customer just signed up (no name or school set yet) */
  isNewUser: () => boolean;
};

let _subscription: { unsubscribe: () => void } | null = null;

export const useCustomerAuth = create<CustomerAuthState>((set, get) => ({
  user: null,
  session: null,
  customer: null,
  loading: true,
  initialized: false,

  isNewUser: () => {
    const c = get().customer;
    if (!c) return false;
    return !c.name && !c.child_school_id;
  },

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
      const customer = data as Customer;
      set({ customer });

      // Auto-sync StudentProfile for returning users who already set a school
      if (customer.child_school_id && customer.child_class_id && customer.child_gender) {
        try {
          const [schoolRes, classRes] = await Promise.all([
            supabase.from("schools").select("id, name, slug").eq("id", customer.child_school_id).single(),
            supabase.from("classes").select("id, name, slug").eq("id", customer.child_class_id).single(),
          ]);
          if (!schoolRes.error && !classRes.error && schoolRes.data && classRes.data) {
            const genderLabel =
              customer.child_gender === "boys" ? "Boys"
              : customer.child_gender === "girls" ? "Girls"
              : "All";
            useStudentProfile.getState().setProfile({
              schoolId: schoolRes.data.id,
              schoolName: schoolRes.data.name,
              schoolSlug: schoolRes.data.slug,
              classId: classRes.data.id,
              className: classRes.data.name,
              classSlug: classRes.data.slug,
              gender: customer.child_gender as "boys" | "girls" | "unisex",
              genderLabel,
            });
          }
        } catch { /* non-fatal */ }
      }
    }
  },

  updateProfile: async ({ name, phone, child_school_id, child_class_id, child_gender }) => {
    const { user } = get();
    if (!user) return { error: new Error("Not logged in") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {};
    if (name            !== undefined) payload.name            = name;
    if (phone           !== undefined) payload.phone           = phone;
    if (child_school_id !== undefined) payload.child_school_id = child_school_id;
    if (child_class_id  !== undefined) payload.child_class_id  = child_class_id;
    if (child_gender    !== undefined) payload.child_gender    = child_gender;

    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", user.id);

    if (!error) await get().refreshCustomer();
    return { error: error as Error | null };
  },
}));
