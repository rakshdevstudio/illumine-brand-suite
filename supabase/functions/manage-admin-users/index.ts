import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is an admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Check caller has admin role
    const { data: callerRole } = await supabaseAdmin.rpc("get_user_role", { _user_id: caller.id });
    if (!callerRole || !["super_admin", "admin"].includes(callerRole)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { action, ...payload } = await req.json();

    if (action === "create") {
      const { email, password, full_name, role } = payload;

      // Only super_admin can create super_admin
      if (role === "super_admin" && callerRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "Only super admins can create super admins" }), { status: 403, headers: corsHeaders });
      }

      // Create auth user
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (userError) {
        return new Response(JSON.stringify({ error: userError.message }), { status: 400, headers: corsHeaders });
      }

      // Update profile
      await supabaseAdmin.from("profiles").update({ full_name, status: "active" }).eq("id", userData.user.id);

      // Assign role
      await supabaseAdmin.from("user_roles").insert({ user_id: userData.user.id, role });

      return new Response(JSON.stringify({ success: true, user_id: userData.user.id }), { headers: corsHeaders });
    }

    if (action === "update_role") {
      const { user_id, role } = payload;

      // Only super_admin can set super_admin role
      if (role === "super_admin" && callerRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "Only super admins can assign super admin role" }), { status: 403, headers: corsHeaders });
      }

      // Can't change own role
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot change your own role" }), { status: 400, headers: corsHeaders });
      }

      // Check target's current role - prevent non-super_admin from modifying super_admin
      const { data: targetRole } = await supabaseAdmin.rpc("get_user_role", { _user_id: user_id });
      if (targetRole === "super_admin" && callerRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "Cannot modify super admin" }), { status: 403, headers: corsHeaders });
      }

      await supabaseAdmin.from("user_roles").update({ role }).eq("user_id", user_id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (action === "toggle_status") {
      const { user_id, status } = payload;

      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot disable yourself" }), { status: 400, headers: corsHeaders });
      }

      const { data: targetRole } = await supabaseAdmin.rpc("get_user_role", { _user_id: user_id });
      if (targetRole === "super_admin" && callerRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "Cannot modify super admin" }), { status: 403, headers: corsHeaders });
      }

      await supabaseAdmin.from("profiles").update({ status }).eq("id", user_id);

      // Ban/unban in auth
      if (status === "disabled") {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
      } else {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (action === "delete") {
      const { user_id } = payload;

      if (callerRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "Only super admins can delete users" }), { status: 403, headers: corsHeaders });
      }

      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), { status: 400, headers: corsHeaders });
      }

      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await supabaseAdmin.from("profiles").delete().eq("id", user_id);
      await supabaseAdmin.auth.admin.deleteUser(user_id);

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
