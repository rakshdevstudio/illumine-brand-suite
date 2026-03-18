import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SCHOOL_AVATAR_FALLBACK_PREFIX = "school-assignment:";

const readSchoolId = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readSchoolIdFromAvatarFallback = (avatarUrl: string | null | undefined) => {
  const value = readSchoolId(avatarUrl);
  if (!value || !value.startsWith(SCHOOL_AVATAR_FALLBACK_PREFIX)) return null;
  return readSchoolId(value.slice(SCHOOL_AVATAR_FALLBACK_PREFIX.length));
};

const encodeSchoolAvatarFallback = (schoolId: string) => `${SCHOOL_AVATAR_FALLBACK_PREFIX}${schoolId}`;

const isMissingProfileSchoolColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || message.includes("school_id");
};

const isMissingUserSchoolMapError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.code === "PGRST205" || error.code === "42P01" || message.includes("user_school_map");
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const syncSchoolAssignment = async (userId: string, schoolId: string | null) => {
      let profileSynced = false;
      let mappingSynced = false;

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ school_id: schoolId })
        .eq("id", userId);

      if (profileError) {
        if (!isMissingProfileSchoolColumnError(profileError)) {
          throw profileError;
        }
      } else {
        profileSynced = true;
      }

      if (schoolId) {
        const { error } = await supabaseAdmin
          .from("user_school_map")
          .upsert(
            {
              user_id: userId,
              school_id: schoolId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

        if (error) {
          if (!isMissingUserSchoolMapError(error)) {
            throw error;
          }
        } else {
          mappingSynced = true;
        }
      } else {
        const { error } = await supabaseAdmin
          .from("user_school_map")
          .delete()
          .eq("user_id", userId);

        if (error) {
          if (!isMissingUserSchoolMapError(error)) {
            throw error;
          }
        } else {
          mappingSynced = true;
        }
      }

      if (!profileSynced && !mappingSynced) {
        const { data: profile, error: avatarReadError } = await supabaseAdmin
          .from("profiles")
          .select("avatar_url")
          .eq("id", userId)
          .maybeSingle();

        if (avatarReadError) {
          throw avatarReadError;
        }

        const existingAvatarUrl = profile?.avatar_url ?? null;
        const existingFallbackSchoolId = readSchoolIdFromAvatarFallback(existingAvatarUrl);
        const avatarFallbackAvailable = !existingAvatarUrl || !!existingFallbackSchoolId;

        if (schoolId === null) {
          if (existingFallbackSchoolId) {
            const { error: avatarFallbackError } = await supabaseAdmin
              .from("profiles")
              .update({ avatar_url: null })
              .eq("id", userId);

            if (avatarFallbackError) {
              throw avatarFallbackError;
            }
          }
        } else if (avatarFallbackAvailable) {
          const { error: avatarFallbackError } = await supabaseAdmin
            .from("profiles")
            .update({ avatar_url: encodeSchoolAvatarFallback(schoolId) })
            .eq("id", userId);

          if (avatarFallbackError) {
            throw avatarFallbackError;
          }
        } else {
          throw new Error("School assignment storage is unavailable for this user.");
        }
      }

      const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(userId);
      const nextUserMetadata = { ...(authUserData.user?.user_metadata ?? {}) };

      if (schoolId) {
        nextUserMetadata.school_id = schoolId;
      } else {
        delete nextUserMetadata.school_id;
      }

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: nextUserMetadata,
      });
    };

    // Verify the caller is an admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Check caller has admin role
    const { data: callerRole } = await supabaseAdmin.rpc("get_user_role", { _user_id: caller.id });
    if (!callerRole || !["super_admin", "admin"].includes(callerRole)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { action, ...payload } = await req.json();

    if (action === "create") {
      const { email, password, full_name, role, school_id } = payload;

      // Only super_admin can create super_admin
      if (role === "super_admin" && callerRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "Only super admins can create super admins" }), { status: 403, headers: corsHeaders });
      }

      if (role === "school_user" && !school_id) {
        return new Response(JSON.stringify({ error: "School users must have an assigned school" }), { status: 400, headers: corsHeaders });
      }

      // Create auth user
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          ...(school_id ? { school_id } : {}),
        },
      });

      if (userError) {
        return new Response(JSON.stringify({ error: userError.message }), { status: 400, headers: corsHeaders });
      }

      // Update profile
      await supabaseAdmin
        .from("profiles")
        .update({ full_name, status: "active" })
        .eq("id", userData.user.id);

      // Assign role
      await supabaseAdmin.from("user_roles").insert({ user_id: userData.user.id, role });

      await syncSchoolAssignment(userData.user.id, school_id ?? null);

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

      if (role === "school_user") {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .eq("id", user_id)
          .maybeSingle();

        const { data: mappedSchool } = await supabaseAdmin
          .from("user_school_map")
          .select("school_id")
          .eq("user_id", user_id)
          .limit(1)
          .maybeSingle();

        const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(user_id);
        const metadataSchoolId = readSchoolId(authUserData.user?.user_metadata?.school_id);
        const resolvedSchoolId =
          readSchoolId((profile as { school_id?: string | null } | null)?.school_id) ??
          readSchoolIdFromAvatarFallback((profile as { avatar_url?: string | null } | null)?.avatar_url) ??
          readSchoolId(mappedSchool?.school_id) ??
          metadataSchoolId;

        if (!resolvedSchoolId) {
          return new Response(JSON.stringify({ error: "School users must have an assigned school" }), { status: 400, headers: corsHeaders });
        }
      }

      await supabaseAdmin.from("user_roles").update({ role }).eq("user_id", user_id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (action === "update_user") {
      const { user_id, role, school_id } = payload;

      if (role === "super_admin" && callerRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "Only super admins can assign super admin role" }), { status: 403, headers: corsHeaders });
      }

      const { data: targetRole } = await supabaseAdmin.rpc("get_user_role", { _user_id: user_id });
      if (targetRole === "super_admin" && callerRole !== "super_admin") {
        return new Response(JSON.stringify({ error: "Cannot modify super admin" }), { status: 403, headers: corsHeaders });
      }

      if (role === "school_user" && !school_id) {
        return new Response(JSON.stringify({ error: "School users must have an assigned school" }), { status: 400, headers: corsHeaders });
      }

      await supabaseAdmin.from("user_roles").update({ role }).eq("user_id", user_id);
      await syncSchoolAssignment(user_id, school_id ?? null);

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
