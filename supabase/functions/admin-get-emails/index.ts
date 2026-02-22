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
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user is admin using their JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Get user_ids from request body
    const { user_ids } = await req.json();
    if (!user_ids || !Array.isArray(user_ids)) {
      return new Response(JSON.stringify({ error: "user_ids required" }), { status: 400, headers: corsHeaders });
    }

    // Enforce maximum batch size
    const MAX_BATCH = 50;
    if (user_ids.length > MAX_BATCH) {
      return new Response(JSON.stringify({ error: `Maximum ${MAX_BATCH} user IDs per request` }), { status: 400, headers: corsHeaders });
    }

    // Validate all IDs are strings (UUIDs)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!user_ids.every((id: unknown) => typeof id === 'string' && uuidRegex.test(id))) {
      return new Response(JSON.stringify({ error: "Invalid user_id format" }), { status: 400, headers: corsHeaders });
    }

    // Fetch emails from auth.users using service role
    const emailMap: Record<string, string> = {};
    for (const uid of user_ids) {
      const { data } = await adminClient.auth.admin.getUserById(uid);
      if (data?.user?.email) {
        emailMap[uid] = data.user.email;
      }
    }

    return new Response(JSON.stringify({ emails: emailMap }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error('admin-get-emails error:', e);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
