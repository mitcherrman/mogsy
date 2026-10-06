// OWN1 — owner-only account actions. Sensitive actions need FRESH aal2.
// Recovery / verification are DELIVERED TO THE USER by email; no raw action
// URL is ever returned to the admin UI. Every action writes admin_audit_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireOwner, auditOwnerAction } from "../_shared/owner.ts";
import { ADMIN_USER_ACTION_LEVEL, sanitizeAdminActionBody } from "../_shared/owner-decision.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(sanitizeAdminActionBody(body)), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => null) as { action?: unknown; target_user_id?: unknown } | null;
    const action = typeof body?.action === "string" ? body.action : "";
    const target = typeof body?.target_user_id === "string" ? body.target_user_id : "";
    const level = ADMIN_USER_ACTION_LEVEL[action];
    if (!level) return json({ error: "Unknown action" }, 400);
    if (!UUID.test(target)) return json({ error: "Invalid user ID" }, 400);

    const { decision, ctx } = await requireOwner(req, level);
    if (!decision.ok || !ctx) return json({ error: decision.ok ? "unauthorized" : decision.code }, decision.ok ? 401 : decision.status);

    const { data: t, error: getErr } = await ctx.service.auth.admin.getUserById(target);
    if (getErr || !t?.user) {
      await auditOwnerAction(ctx, `account_${action}`, "not_found", { target_user_id: target });
      return json({ error: "User not found" }, 404);
    }
    const u = t.user;
    const delivery = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const done = async (result: string, extra: Record<string, unknown> = {}, status = 200) => {
      await auditOwnerAction(ctx, `account_${action}`, result, { target_user_id: target, ...extra });
      return json({ success: status < 400, result, ...extra }, status);
    };

    switch (action) {
      case "get_auth_info":
        await auditOwnerAction(ctx, "account_get_auth_info", "ok", { target_user_id: target });
        return json({
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
        });
      case "send_password_reset": {
        if (!u.email) return done("no_email", {}, 400);
        const { error } = await delivery.auth.resetPasswordForEmail(u.email);
        return error ? done("delivery_failed", {}, 502) : done("email_sent", { sent: true });
      }
      case "resend_verification": {
        if (!u.email) return done("no_email", {}, 400);
        if (u.email_confirmed_at) return done("already_confirmed", {}, 400);
        const { error } = await delivery.auth.resend({ type: "signup", email: u.email });
        return error ? done("delivery_failed", {}, 502) : done("email_sent", { sent: true });
      }
      case "confirm_email": {
        const { error } = await ctx.service.auth.admin.updateUserById(target, { email_confirm: true });
        return error ? done("failed", {}, 500) : done("confirmed");
      }
      case "ban_user": {
        if (target === ctx.userId) return done("refused_self", {}, 400);
        const { error } = await ctx.service.auth.admin.updateUserById(target, { ban_duration: "876000h" });
        return error ? done("failed", {}, 500) : done("banned");
      }
      case "unban_user": {
        const { error } = await ctx.service.auth.admin.updateUserById(target, { ban_duration: "none" });
        return error ? done("failed", {}, 500) : done("unbanned");
      }
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("admin-user-actions error", e instanceof Error ? e.message : "unknown");
    return json({ error: "Internal error" }, 500);
  }
});
