import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 250;
const DELETE_CONCURRENCY = 5;

// USERS1 production survivors. The auth-side `is_anonymous` check below is the
// authoritative safety gate; this denylist is a second, named guard against a
// future metadata regression involving any account the launch plan preserves.
const PRESERVED_REGISTERED_EMAILS = new Set([
  "mlmitchaman@gmail.com",
  "alastairigpark@gmail.com",
  "bobbungo2@gmail.com",
  "contact.mogzy.lol@gmail.com",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Check admin role
    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roles = (roleData || []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("master_admin")) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for admin operations
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch one explicit batch. Supabase's data API has a server-side row cap;
    // relying on that implicit cap made the old function appear to process
    // "all" rows while silently stopping at the first page.
    const { data: anonProfiles, error: fetchError, count: total } = await serviceClient
      .from("profiles")
      .select("id, user_id, display_name", { count: "exact" })
      .eq("is_anonymous", true)
      .order("created_at", { ascending: true })
      .range(0, BATCH_SIZE - 1);

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!anonProfiles || anonProfiles.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No anonymous users to purge",
          count: 0,
          total: total ?? 0,
          attempted: 0,
          remaining: 0,
          errors: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let deletedCount = 0;
    const errors: string[] = [];
    let cursor = 0;

    // Bound concurrency to avoid an Auth Admin rate-limit burst while still
    // keeping a 250-row invocation comfortably within the function timeout.
    const worker = async () => {
      while (cursor < anonProfiles.length) {
        const profile = anonProfiles[cursor++];
        try {
          // Never trust the profile flag alone. C0 should already guarantee
          // agreement, but the function independently proves the auth record is
          // anonymous immediately before issuing the irreversible delete.
          const { data: authData, error: authError } =
            await serviceClient.auth.admin.getUserById(profile.user_id);
          if (authError || !authData?.user) {
            errors.push(
              `${profile.display_name} (${profile.user_id}): auth verification failed: ${authError?.message ?? "user not found"}`
            );
            continue;
          }

          const email = authData.user.email?.toLowerCase();
          if (!authData.user.is_anonymous || (email && PRESERVED_REGISTERED_EMAILS.has(email))) {
            errors.push(
              `${profile.display_name} (${profile.user_id}): blocked because the auth user is registered or preserved`
            );
            continue;
          }

          // Auth Admin owns all auth side-table cleanup; never delete auth.users
          // directly from SQL.
          const { error: deleteError } = await serviceClient.auth.admin.deleteUser(
            profile.user_id
          );
          if (deleteError) {
            errors.push(`${profile.display_name} (${profile.user_id}): ${deleteError.message}`);
          } else {
            deletedCount++;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          errors.push(`${profile.display_name} (${profile.user_id}): ${message}`);
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(DELETE_CONCURRENCY, anonProfiles.length) },
        () => worker()
      )
    );

    const totalBefore = total ?? anonProfiles.length;
    const remaining = Math.max(totalBefore - deletedCount, 0);

    return new Response(
      JSON.stringify({
        message: `Purged ${deletedCount} of ${totalBefore} anonymous users; ${remaining} remain`,
        count: deletedCount,
        total: totalBefore,
        attempted: anonProfiles.length,
        remaining,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
