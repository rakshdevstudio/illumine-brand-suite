import { SupabaseClient, createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This is a private service-role client for use in trusted environments.
export const serviceRoleClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// This is a public client for use when you want to act on behalf of a user.
export const createSupabaseClient = (authToken: string) => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: authToken },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
};
