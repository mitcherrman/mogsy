import { requireOwner, auditOwnerAction } from "../_shared/owner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory rate limiting: max 10 requests per minute per admin
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // OWN1: owner-only (trusted session). No role lookup.
    const { decision, ctx } = await requireOwner(req, "trusted");
    if (!decision.ok || !ctx) {
      return new Response(JSON.stringify({ error: decision.ok ? "unauthorized" : decision.code }), { status: decision.ok ? 401 : decision.status, headers: corsHeaders });
    }
    const user = { id: ctx.userId };
    const adminClient = ctx.service;

    // Rate limit per admin user
    if (!checkRateLimit(user.id)) {
      console.warn(`Rate limit exceeded for admin ${user.id}`);
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // Durable audit: this is privileged access to account email addresses.
    await auditOwnerAction(ctx, "admin_get_emails", "ok", { user_count: user_ids.length });

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
