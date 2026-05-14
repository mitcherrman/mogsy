import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authorization: allow either (a) admin/master_admin user JWT, or
    // (b) a scheduled invocation carrying the service role key (cron).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

    let authorized = false;

    if (token && token === serviceRoleKey) {
      authorized = true;
    } else if (token) {
      const userClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data: claimsData } = await userClient.auth.getClaims(token);
      const userId = claimsData?.claims?.sub as string | undefined;
      if (userId) {
        const adminCheck = createClient(supabaseUrl, serviceRoleKey);
        const { data: roles } = await adminCheck
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .in("role", ["admin", "master_admin"]);
        if (roles && roles.length > 0) authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Snapshot preset items
    const { data: presetItems } = await supabase
      .from("preset_items")
      .select("id, league_id, elo");

    if (presetItems && presetItems.length > 0) {
      const snapshots = presetItems.map((item) => ({
        league_id: item.league_id,
        item_id: item.id,
        elo: item.elo,
      }));

      // Insert in batches of 500
      for (let i = 0; i < snapshots.length; i += 500) {
        await supabase
          .from("global_elo_snapshots")
          .insert(snapshots.slice(i, i + 500));
      }
    }

    // Snapshot user league memberships
    const { data: memberships } = await supabase
      .from("league_memberships")
      .select("league_id, profile_id, elo");

    if (memberships && memberships.length > 0) {
      const memberSnapshots = memberships.map((m) => ({
        league_id: m.league_id,
        profile_id: m.profile_id,
        elo: m.elo,
      }));

      for (let i = 0; i < memberSnapshots.length; i += 500) {
        await supabase
          .from("global_elo_snapshots")
          .insert(memberSnapshots.slice(i, i + 500));
      }
    }

    // Clean up snapshots older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("global_elo_snapshots")
      .delete()
      .lt("snapshot_at", cutoff);

    return new Response(
      JSON.stringify({ success: true, presetCount: presetItems?.length ?? 0, memberCount: memberships?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Snapshot error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
