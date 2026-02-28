import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "master_admin"]);
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { action, target_user_id } = await req.json();
    if (!action || !target_user_id) {
      return new Response(JSON.stringify({ error: "action and target_user_id required" }), { status: 400, headers: corsHeaders });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(target_user_id)) {
      return new Response(JSON.stringify({ error: "Invalid user ID" }), { status: 400, headers: corsHeaders });
    }

    console.log(`[AUDIT] admin-user-actions: admin=${user.id} action=${action} target=${target_user_id}`);

    // Get target user info
    const { data: targetUser, error: getUserError } = await adminClient.auth.admin.getUserById(target_user_id);
    if (getUserError || !targetUser?.user) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: corsHeaders });
    }

    switch (action) {
      case "send_password_reset": {
        const email = targetUser.user.email;
        if (!email) {
          return new Response(JSON.stringify({ error: "User has no email" }), { status: 400, headers: corsHeaders });
        }
        // Generate a password reset link via admin API
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
        });
        if (linkError) {
          return new Response(JSON.stringify({ error: linkError.message }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, message: `Password reset link generated for ${email}`, link: linkData?.properties?.action_link }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "resend_verification": {
        const email = targetUser.user.email;
        if (!email) {
          return new Response(JSON.stringify({ error: "User has no email" }), { status: 400, headers: corsHeaders });
        }
        if (targetUser.user.email_confirmed_at) {
          return new Response(JSON.stringify({ error: "Email already confirmed" }), { status: 400, headers: corsHeaders });
        }
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "signup",
          email,
          password: crypto.randomUUID(), // Required but won't change existing password
        });
        if (linkError) {
          return new Response(JSON.stringify({ error: linkError.message }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, message: `Verification link generated for ${email}`, link: linkData?.properties?.action_link }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "confirm_email": {
        // Admin manually confirms user's email
        const { data: updateData, error: updateError } = await adminClient.auth.admin.updateUserById(target_user_id, {
          email_confirm: true,
        });
        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, message: "Email confirmed manually" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "ban_user": {
        const { data: banData, error: banError } = await adminClient.auth.admin.updateUserById(target_user_id, {
          ban_duration: "876000h", // ~100 years
        });
        if (banError) {
          return new Response(JSON.stringify({ error: banError.message }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, message: "User banned" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "unban_user": {
        const { data: unbanData, error: unbanError } = await adminClient.auth.admin.updateUserById(target_user_id, {
          ban_duration: "none",
        });
        if (unbanError) {
          return new Response(JSON.stringify({ error: unbanError.message }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, message: "User unbanned" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_auth_info": {
        const u = targetUser.user;
        return new Response(JSON.stringify({
          success: true,
          auth_info: {
            email: u.email || null,
            email_confirmed: !!u.email_confirmed_at,
            email_confirmed_at: u.email_confirmed_at || null,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at || null,
            is_anonymous: u.is_anonymous || false,
            banned_until: u.banned_until || null,
            provider: u.app_metadata?.provider || "email",
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
    }
  } catch (e) {
    console.error("admin-user-actions error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
