import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * redeem-gift: signed-in recipient claims a gift.
 * - Diamonds gifts: handled by SQL function redeem_gift_code (adds to balance).
 * - Pro gifts (monthly/annual): we additionally extend the recipient's is_pro flag
 *   and bump active_boost_until / Pro expiry via the profiles table (server-side).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }
    const { code } = await req.json();
    if (!code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }

    // Use SQL function to atomically claim. Diamonds handled inside.
    const { data: result, error: rpcErr } = await userClient.rpc("redeem_gift_code", { _code: code });
    if (rpcErr) {
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }
    if (!result?.success) {
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // For Pro gifts, grant Pro server-side (bypass premium-field trigger via service role)
    if (result.gift_type === "pro_monthly" || result.gift_type === "pro_annual") {
      const days = result.gift_type === "pro_annual" ? 365 : 30;
      const { data: prof } = await admin.from("profiles").select("id").eq("user_id", user.id).single();
      if (prof) {
        // Set is_pro true; the user becomes Pro. Pro renewal is manual/honor-based for gifted period.
        await admin.from("profiles").update({ is_pro: true }).eq("id", prof.id);
        // Record a purchases row so admins can see the gifted Pro period
        await admin.from("purchases").insert({
          profile_id: prof.id,
          item_type: `gift_${result.gift_type}_${days}d`,
          amount_cents: 0,
        } as any);
      }
    }

    return new Response(JSON.stringify({ success: true, gift_type: result.gift_type, diamond_amount: result.diamond_amount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e) {
    console.error("redeem-gift", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});